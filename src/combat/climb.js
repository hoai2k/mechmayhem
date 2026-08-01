// WALL CLIMBING — the gecko route up a building.
//
// A mech whose roster def carries a `climb` block (JERRY, who paid for it with
// his hover jets) can walk UP a facade. The whole feature is here: the mode
// machine, the surface-following movement, the body's damp between the ground
// frame and the wall frame, the haul over a lip, and the pass that plants the
// hands and feet on whatever surface they are crossing. fighter.js owns four
// call sites and no logic.
//
// ---------------------------------------------------------------------------
// CLIMBING IS A MODE, entered and left on purpose:
//
//   IN   · push into a building face for a beat (TUNING.climb.grabSeconds —
//          a LITTLE push, not a lean; a glancing scrape never latches), or
//        · jump at a building with a direction held: he latches on impact.
//          No direction held and he bounces off and falls like anyone else
//          (and the universal punch-hold wall grab still works for him too).
//   OUT  · rest the stick for TUNING.climb.restSeconds and he goes back to
//          whatever a body does where he is — standing on a top, falling off
//          a face — or
//        · run the stamina bar dry.
//
// WHILE THE MODE IS ON he climbs everything he touches: a wall ahead is taken
// without any gate, a lip is hauled over, a roof is crossed, and walking off
// the far edge WRAPS him over it onto the face below, head-first, the way he
// is going. Holding LIGHT while attached is the grip — he stays put on the
// face, and keeps the mode on release as long as the stick is held. A is the
// spring off the wall (the mode survives it, so jump-and-regrab works).
//
// ---------------------------------------------------------------------------
// THE FRAME. A wall is a FLOOR THAT POINTS SIDEWAYS, and that one sentence is
// the whole geometry:
//
//     body up   (+Y local, feet -> head) = the surface's outward NORMAL
//     body fwd  (+Z local, where he faces) = the direction he is TRAVELLING
//
// On the ground that reads up = world +Y and fwd = the yaw heading — the
// ordinary standing frame, unchanged — so ONE formula covers both ends and the
// transition is a slerp between them. On a vertical face it stands him on the
// wall like a floor, facing the way he is moving: up when climbing, sideways
// when scuttling across, head-first DOWN when descending, each reached by the
// same damp a ground turn uses. NOTHING SNAPS: the climb code never writes
// f.yaw — the ordinary stick-driven yaw servo keeps the horizontal heading
// honest underneath the blend, so attaching, detaching and topping out are all
// the same smooth turn a player already knows. The mech's own walk cycle run
// in that frame IS the climb; the one thing the animator had to learn is that
// soleClearanceBySide measures along the body's own up, not world y.
//
// The group's origin is at the FEET, so `pos` is the contact point on the
// surface and rotating the group about it pivots exactly where a climber's
// feet are. Physics is replaced outright while attached (climbPhysics): no
// gravity, no arena pushout — the surface IS the constraint, re-probed every
// frame so he follows a curved prop around and a stepped facade up.
import * as THREE from 'three';
import { TUNING, STAMINA_TANK } from '../core/tuning.js';
import { clamp, clamp01, damp, DEG } from '../core/utils.js';

const C = TUNING.climb;
const CLIMB_DRAIN = STAMINA_TANK * C.stamina;
const UP = new THREE.Vector3(0, 1, 0);

// scratch — this module allocates nothing per frame
const _n = new THREE.Vector3();
const _side = new THREE.Vector3();
const _want = new THREE.Vector3();
const _p = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _mtx = new THREE.Matrix4();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _qC = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _root = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _end = new THREE.Vector3();
const _axis = new THREE.Vector3();

// ---------------------------------------------------------------------------
// surfaces
// A probe (arena.climbProbe) is either a PLANE (a building facade: a point on
// the face plus its outward normal) or a CYLINDER (a solid prop: walking
// sideways carries you around it). Both answer the same two questions.

// outward unit normal of the surface at a world point
function normalAt(s, p, out) {
  if (s.kind === 'cylinder') {
    const dx = p.x - s.cx, dz = p.z - s.cz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return out.set(s.nx, 0, s.nz);
    return out.set(dx / d, 0, dz / d);
  }
  return out.set(s.nx, 0, s.nz);
}

// nearest point ON the surface to p, pushed `gap` back out along the normal
function projectTo(s, p, out, gap = 0) {
  if (s.kind === 'cylinder') {
    const dx = p.x - s.cx, dz = p.z - s.cz;
    const d = Math.hypot(dx, dz) || 1;
    return out.set(s.cx + (dx / d) * (s.r + gap), p.y, s.cz + (dz / d) * (s.r + gap));
  }
  const along = (p.x - s.x) * s.nx + (p.z - s.z) * s.nz;
  return out.set(p.x - s.nx * (along - gap), p.y, p.z - s.nz * (along - gap));
}

// how far OUTSIDE the surface a world point sits (negative = buried in it)
function distanceTo(s, p) {
  if (s.kind === 'cylinder') return Math.hypot(p.x - s.cx, p.z - s.cz) - s.r;
  return (p.x - s.x) * s.nx + (p.z - s.z) * s.nz;
}

function probeFor(f, y, pad) {
  return f.world.arena?.climbProbe?.(f.pos.x, y, f.pos.z, pad) || null;
}

// nothing else owns this body right now
function bodyFree(f) {
  return f.alive && !f.controlsLocked && f.state === 'normal' &&
    !f._carry && !f.hanging && !f.plunging && !f._airRoll && !f.cinePuppet;
}

// ---------------------------------------------------------------------------
// the per-frame entry point. Returns TRUE when the climb owns this frame's
// movement (fighter.js then runs climbPhysics instead of applyPhysics). `mv`
// is the movement input the fighter would feed applyPhysics — already zeroed
// by rooted states, which is what freezes climb motion during an attack.
export function climbStep(f, dt, mv) {
  if (!f.def.climb) return false;
  if (f._climbCd > 0) f._climbCd = Math.max(0, f._climbCd - dt);

  // ---- MODE EXIT: the stick at rest is the way out. Read the RAW stick, not
  // `mv` — a rooted state (an attack thrown from the wall) zeroes mv while the
  // player is still very much holding on, and dropping him mid-swing for it
  // would read as a bug. The LIGHT grip suspends the clock outright.
  const stick = Math.hypot(f.intent.moveX, f.intent.moveZ);
  if (f.climbMode) {
    const holding = !!(f.climb && f.intent.lightHeld);
    if (stick < 0.3 && !holding && f.climb?.phase !== 'top') {
      f._climbRest = (f._climbRest || 0) + dt;
      if (f._climbRest >= C.restSeconds) exitMode(f);
    } else f._climbRest = 0;
  } else f._climbRest = 0;

  if (f.climb) {
    updateAttached(f, dt, mv);
    return !!f.climb;
  }
  if (f.climbMode) modeTouch(f, dt, mv);
  else enterGate(f, dt, mv);
  return !!f.climb;
}

function exitMode(f) {
  f.climbMode = false;
  f._climbRest = 0;
  f._climbPress = 0;
  if (f.climb) detach(f, false);   // on a wall: he falls, like letting go
}

// ---------------------------------------------------------------------------
// ENTERING THE MODE (mode off)
function enterGate(f, dt, mv) {
  // THE CPU DOES NOT CLIMB. Nothing about ai.js knows a wall is a route: it
  // steers at an enemy on the ground, so a CPU that latched would climb
  // whatever it happened to be walking into and then sit forty units up
  // pressing forward at a rooftop. Everything BELOW the climb is shared —
  // stepping over small obstacles — so a CPU jerry still reads as the same
  // body. (Drop this clause the day the AI can want height.)
  if (f.isAI) { f._climbPress = 0; return; }
  if (!bodyFree(f) || f.blocking || f._climbCd > 0) { f._climbPress = 0; return; }
  const len = Math.hypot(mv.x, mv.z);
  if (len < 0.45) { f._climbPress = 0; return; }
  const ix = mv.x / len, iz = mv.z / len;
  const pad = f.radius + f.def.climb.reach * f.height;
  const s = probeFor(f, f.pos.y + f.height * 0.42, pad);
  if (!s) { f._climbPress = 0; return; }
  const into = -(ix * s.nx + iz * s.nz);
  if (f.grounded) {
    // a LITTLE push squarely into the face — enough to tell a climb from a
    // scrape along a facade or a knockback shove, and no more
    if (into < C.grabDot) { f._climbPress = 0; return; }
    if (s.top - f.pos.y < C.minFace * f.height) { f._climbPress = 0; return; }
    f._climbPress = (f._climbPress || 0) + dt;
    if (f._climbPress >= C.grabSeconds) attach(f, s, mv);
  } else {
    // JUMPED (or fell) INTO A BUILDING with a direction held: latch the moment
    // he actually hits it. No direction, or steering away, and he just bounces
    // off and falls, like every other mech.
    if (into < C.airDot) return;
    if (s.gap > f.radius * 1.1) return;              // near it isn't ON it
    if (s.top - f.pos.y < f.height * 0.3) return;    // about to clear the top anyway
    attach(f, s, mv);
  }
}

// ---------------------------------------------------------------------------
// IN THE MODE, off a wall (walking a roof or the ground, or airborne between
// grabs): he climbs whatever he touches. A wall ahead is taken with NO gate,
// and walking off a roof's edge wraps him over onto the face below.
function modeTouch(f, dt, mv) {
  if (!bodyFree(f)) return;
  const len = Math.hypot(mv.x, mv.z);
  if (len < 0.3) return;
  const ix = mv.x / len, iz = mv.z / len;
  const D = f.def.climb;
  const pad = f.radius + D.reach * f.height;
  const s = probeFor(f, f.pos.y + f.height * 0.42, pad);
  if (s && f._climbCd <= 0) {
    const into = -(ix * s.nx + iz * s.nz);
    const rise = s.top - f.pos.y;
    // anything his step can't simply take, he climbs
    if (into > 0.15 && rise > D.stepUp * f.height + 0.1 && s.gap < f.radius * 1.2) {
      return attach(f, s, mv);
    }
  }
  // the far lip: walking off a real drop wraps him over it, no pause
  if (f.grounded && f.pos.y > f.height * 0.6) wrapDown(f, mv, ix, iz);
}

function wrapDown(f, mv, ix, iz) {
  const D = f.def.climb;
  const ahead = f.radius + f.height * 0.2;
  const x = f.pos.x + ix * ahead, z = f.pos.z + iz * ahead;
  if (groundUnder(f, x, z, f.pos.y) > f.pos.y - f.height * C.wrapDrop) return;
  const s = f.world.arena?.climbProbe?.(
    x, f.pos.y - f.height * 0.35, z, f.radius + D.reach * f.height);
  if (!s) return;                  // nothing to hold below: he just walks off
  f.pos.y -= f.height * 0.22;      // feet below the lip, onto the face
  attach(f, s, null);
  f.climb.fwd.set(0, -1, 0);       // over the edge head-first, the way he is going
}

// ---------------------------------------------------------------------------
function attach(f, s, mv) {
  f.climbMode = true;
  f._climbPress = 0;
  f._climbRest = 0;
  f.climb = { surf: s, phase: 'wall', t: 0, lostT: 0, fwd: new THREE.Vector3(0, 1, 0) };
  // face the way the stick is about to carry him along the face
  if (mv) {
    normalAt(s, f.pos, _n);
    _side.crossVectors(UP, _n).normalize();
    const into = -(mv.x * _n.x + mv.z * _n.z);
    const lat = mv.x * _side.x + mv.z * _side.z;
    _want.set(_side.x * lat, Math.max(into, 0.2), _side.z * lat);
    if (_want.lengthSq() > 1e-4) f.climb.fwd.copy(_want.normalize());
  }
  f.vel.set(0, 0, 0);
  f.grounded = false;
  f.hovering = false;
  f.plunging = false;
  f._climbSpeed = 0;
  f.duckT = 0;
  projectTo(s, f.pos, _p, 0.02);
  f.pos.x = _p.x; f.pos.z = _p.z;
  f.world.audio?.play('servo');
  f.world.effects?.dustPuff(_p.set(s.x, f.pos.y + f.height * 0.25, s.z), 4, 0xa8a8a8);
}

// off the wall — the MODE is untouched (exitMode is the only thing that ends
// it), so a spring off a face can regrab, and a descent that reaches the
// ground keeps climbing whatever he walks into next. `spring` = A pushed him
// off; otherwise he just falls. The cooldown stops the very same face from
// re-latching in the frame after a deliberate departure.
function detach(f, spring) {
  const c = f.climb;
  if (!c) return;
  f.climb = null;
  f._climbSpeed = 0;
  f._climbPress = 0;
  f._climbCd = spring ? 0.35 : 0.2;
  f._hangCoyote = 0.2;  // the same short grace the wall grab leaves behind
  f.grounded = false;
  if (spring) {
    normalAt(c.surf, f.pos, _n);
    f.vel.set(_n.x * 6.5, f.def.stats.jump * TUNING.movement.jumpMult * 0.72, _n.z * 6.5);
    f.world.audio?.play('jump');
    f.world.effects?.dustPuff(f.pos, 5);
  }
}

// ---------------------------------------------------------------------------
// ON THE WALL
function updateAttached(f, dt, mv) {
  const c = f.climb;
  const D = f.def.climb;
  c.t += dt;
  // anything that takes the body away takes the wall with it
  if (!f.alive || f.controlsLocked || f._carry || f.cinePuppet ||
      (f.state !== 'normal' && f.state !== 'attack' && f.state !== 'channel')) {
    return detach(f, false);
  }
  if (c.phase === 'top') return updateTopOut(f, dt);

  if (f.intent.jump) return detach(f, true);
  // grip costs stamina, so a wall is a route and not a perch
  f.sprintEnergy = Math.max(0, f.sprintEnergy - CLIMB_DRAIN * dt);
  if (f.sprintEnergy <= 0) return exitMode(f);

  // re-probe every frame: this is what follows a stepped facade up and carries
  // him around a cylinder. Two heights are asked — chest and ankle — and the
  // NEARER face wins: taking the first non-null answer instead once switched a
  // descent below a terrace onto the tower behind it, three units away through
  // solid roof. A couple of frames of nothing is a blown-out chunk or a corner
  // turned — he comes off.
  const pad = f.radius + D.reach * f.height;
  const s1 = probeFor(f, f.pos.y + f.height * 0.3, pad);
  const s2 = probeFor(f, f.pos.y + 0.4, pad);
  const s = !s1 ? s2 : !s2 ? s1 : (Math.abs(s2.gap) < Math.abs(s1.gap) ? s2 : s1);
  if (s) { c.surf = s; c.lostT = 0; } else if ((c.lostT += dt) > 0.12) return detach(f, false);

  const surf = c.surf;
  normalAt(surf, f.pos, _n);
  _side.crossVectors(UP, _n).normalize();          // along the face, horizontal
  // THE STICK, read against the face: pushing IN is up, pulling BACK is down,
  // the sideways half scuttles across — and the LIGHT grip overrides all of
  // it: held, he stays exactly where he is.
  const hold = f.intent.lightHeld;
  let vUp = 0, vLat = 0;
  if (!hold) {
    const into = -(mv.x * _n.x + mv.z * _n.z);
    const lat = mv.x * _side.x + mv.z * _side.z;
    const speed = f.moveSpeed() * f.speedMult() * D.speed *
      (f.blocking ? TUNING.movement.blockMoveMult : 1);
    vUp = into * speed; vLat = lat * speed;
  }
  f.pos.y += vUp * dt;
  f.pos.x += _side.x * vLat * dt;
  f.pos.z += _side.z * vLat * dt;
  f.vel.set(_side.x * vLat, vUp, _side.z * vLat);
  f._climbSpeed = Math.hypot(vUp, vLat);

  // hug the surface (a cylinder curves away as he goes round it)
  projectTo(surf, f.pos, _p, 0.02);
  f.pos.x = _p.x; f.pos.z = _p.z;

  // WHICH WAY HE FACES ON THE WALL: the way he is travelling — up, across, or
  // head-first down — reached by a damp, exactly like a ground turn. Standing
  // still he keeps the heading he arrived with.
  if (f._climbSpeed > 0.4) {
    _want.set(_side.x * vLat, vUp, _side.z * vLat).normalize();
    c.fwd.lerp(_want, 1 - Math.exp(-8 * dt));
  }
  c.fwd.addScaledVector(_n, -c.fwd.dot(_n));       // keep it on the face
  if (c.fwd.lengthSq() < 1e-4) c.fwd.copy(UP);     // a 180° turn passes through 0
  c.fwd.normalize();

  // the lip: his claws are over it, haul him up
  if (vUp > 0.05 && f.pos.y >= surf.top - f.height * 0.45) return startTopOut(f, surf);
  // the bottom: back on the dirt, stand up (the mode stays on). The floor is
  // only a floor if he has actually DESCENDED onto it — a column base sitting
  // well above his feet (he wrapped over a terrace lip and is on the face
  // below it) must not teleport him back up onto the ledge he just left.
  const floor = Math.max(surf.base || 0, f.world.arena?.terrainHeightAt?.(f.pos.x, f.pos.z) || 0);
  if (f.pos.y <= floor + 0.05 && floor - f.pos.y < 0.6 && vUp <= 0) {
    f.pos.y = floor;
    detach(f, false);
    f._climbCd = 0.1;   // stepping away, not leaving on purpose — short
    f.grounded = true;
    f.vel.set(0, 0, 0);
  }
}

// ---------------------------------------------------------------------------
// OVER THE LIP. A scripted haul: the feet travel from the face onto the roof
// while the body damps back upright, so he rolls over the edge instead of
// teleporting onto it. The heading is a targetYaw ASK, not a snap — the
// ordinary yaw servo turns him in over the roof at the rate every other turn
// uses, which is what keeps a sideways scuttle's top-out from popping.
function startTopOut(f, surf) {
  const c = f.climb;
  c.phase = 'top';
  c.t = 0;
  normalAt(surf, f.pos, _n);
  c.from = f.pos.clone();
  c.to = new THREE.Vector3(
    f.pos.x - _n.x * (f.radius * 1.4), surf.top + 0.02, f.pos.z - _n.z * (f.radius * 1.4));
  f.targetYaw = Math.atan2(-_n.x, -_n.z);
  f.vel.set(0, 0, 0);
  f.world.audio?.play('servo');
}

function updateTopOut(f, dt) {
  const c = f.climb;
  const k = clamp01(c.t / C.topSeconds);
  const e = k * k * (3 - 2 * k);
  f.pos.x = c.from.x + (c.to.x - c.from.x) * e;
  f.pos.z = c.from.z + (c.to.z - c.from.z) * e;
  // the feet clear the lip BEFORE the body swings in — rise first, then travel
  f.pos.y = c.from.y + (c.to.y - c.from.y) * clamp01(e * 1.7);
  f._climbSpeed = 0;
  f.vel.set(0, 0, 0);
  if (k < 1) return;
  f.climb = null;       // on the roof — still in the mode, walking
  f.grounded = true;
}

// The highest thing to stand on under (x, z), searching DOWN from `fromY`.
//
// A SOLID CHUNK AT HIS OWN HEIGHT IS NOT A DROP, it is the next tier's WALL,
// and that distinction is the whole reason this is a function and not a
// terrain lookup: on a stepped building the point a couple of paces ahead of a
// mech standing on a terrace is often INSIDE the tower above it, whose chunk
// tops are all far overhead. Read as "nothing underneath", that would wrap him
// down at the foot of a wall he is about to climb.
function groundUnder(f, x, z, fromY) {
  const arena = f.world.arena;
  let best = arena?.terrainHeightAt?.(x, z) ?? 0;
  const d = arena?.destructo;
  if (d) {
    for (const b of d.buildings) {
      if (b.alive <= 0) continue;
      const a = b.aabb;
      if (x < a.minX - 0.2 || x > a.maxX + 0.2 || z < a.minZ - 0.2 || z > a.maxZ + 0.2) continue;
      for (const c of b.grid.values()) {
        if (!c.alive) continue;
        if (Math.abs(x - c.x) > c.w / 2 || Math.abs(z - c.z) > c.d / 2) continue;
        const top = c.y + c.h / 2, bot = c.y - c.h / 2;
        if (bot <= fromY + f.height * 0.5 && top > fromY + 0.4) return fromY; // a wall
        if (top <= fromY + 0.4 && top > best) best = top;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// PHYSICS while attached. The surface is the constraint; nothing else applies.
// (Position is already integrated in updateAttached — this is the part
// applyPhysics would otherwise do: the wrap and nothing else.)
export function climbPhysics(f) {
  const w = f.world;
  if (w.wrapHalf) {
    const wx = w.wrapCoord(f.pos.x), wz = w.wrapCoord(f.pos.z);
    if (wx !== f.pos.x || wz !== f.pos.z) {
      f._wrap = { dx: wx - f.pos.x, dz: wz - f.pos.z };
      f.pos.x = wx; f.pos.z = wz;
    }
  }
}

// ---------------------------------------------------------------------------
// THE BODY'S ORIENTATION — the damp between the ground frame and the wall
// frame (see the header). Runs every frame for a climbing mech and keeps
// running after he lets go, until the body has rolled back upright. It NEVER
// writes f.yaw: the stick-driven yaw servo keeps the horizontal heading honest
// underneath, so both ends of the slerp are always live, damped frames — that
// is the whole no-snap guarantee. When the blend finishes it squares the
// group's rotation off exactly once, so no residual tilt can linger in the
// euler channels the per-frame `rotation.y = yaw` write leaves untouched.
export function applyClimbOrientation(f, dt) {
  const c = f.climb;
  const onWall = !!c && c.phase === 'wall';
  if (onWall) {
    normalAt(c.surf, f.pos, _n);
    const basis = f._climbBasis || (f._climbBasis = { up: new THREE.Vector3(), fwd: new THREE.Vector3() });
    basis.up.copy(_n);
    basis.fwd.copy(c.fwd);
  }
  const want = onWall ? 1 : 0;
  f._climbTilt = damp(f._climbTilt || 0, want, C.tiltRate, dt);
  if (f._climbTilt < 0.004) {
    f._climbTilt = 0;
    if (f._climbTiltOn) {
      f._climbTiltOn = false;
      f.group.rotation.set(0, f.yaw, 0);
    }
    return;
  }
  f._climbTiltOn = true;
  const basis = f._climbBasis;
  if (!basis) return;
  _qA.setFromAxisAngle(UP, f.yaw);                       // the ground frame
  _by.copy(basis.up).normalize();
  _bz.copy(basis.fwd);
  _bz.addScaledVector(_by, -_bz.dot(_by));
  if (_bz.lengthSq() < 1e-6) _bz.set(0, 1, 0).addScaledVector(_by, -_by.y);
  _bz.normalize();
  _bx.crossVectors(_by, _bz).normalize();                // x = right, y = up, z = fwd
  _mtx.makeBasis(_bx, _by, _bz);
  _qB.setFromRotationMatrix(_mtx);                       // the wall frame
  f.group.quaternion.slerpQuaternions(_qA, _qB, f._climbTilt);
}

// ---------------------------------------------------------------------------
// HANDS AND FEET ON THE SURFACE.
//
// The frame above puts the BODY where it belongs; this puts the four contact
// points where they belong, which is the difference between climbing a wall
// and walking on a rotated floor. For each limb: two-bone IK onto the nearest
// point of the surface the extremity is crossing, weighted by how near it
// already is — so the planted limb of a stride is pinned to the wall and the
// swinging one is only nudged. Then the extremity itself is levelled, its
// sole/palm turned to face the surface.
//
// It runs LAST, after the GLB retarget has synced (fighter.js calls
// postAnimate first), and writes the bones a rigged model actually renders —
// `boneMap` where there is one, the virtual joints otherwise, read and written
// as one set so the solve stays self-consistent on both routes.
const LIMBS = [
  { root: 'thighL', mid: 'kneeL', end: 'ankleL', foot: true },
  { root: 'thighR', mid: 'kneeR', end: 'ankleR', foot: true },
  { root: 'shoulderL', mid: 'elbowL', end: 'handL', foot: false },
  { root: 'shoulderR', mid: 'elbowR', end: 'handR', foot: false },
];

export function conformClimbLimbs(f, dt) {
  const c = f.climb;
  if (!c || c.phase !== 'wall' || !(f._climbTilt > 0.05)) return;
  const surf = c.surf;
  const mech = f.mech;
  const bones = mech.boneMap || null;
  const node = (n) => (bones && bones[n]) || mech.joints?.[n] || null;
  f.group.updateWorldMatrix(true, true);
  const range = C.conformRange * f.height;
  const pull = C.conform * f._climbTilt;
  const sole = f.animator?.footDepth || 0.32 * f.scale;   // ankle bone above the sole plate
  for (const L of LIMBS) {
    const root = node(L.root), mid = node(L.mid), end = node(L.end);
    if (!root || !mid || !end) continue;
    end.getWorldPosition(_end);
    // how far outside the surface this hand/foot is right now
    const gap = distanceTo(surf, _end) - (L.foot ? sole * 0.35 : 0.06);
    // FEET are pulled by proximity, so the planted one of a stride is pinned
    // and the swinging one is left to swing. HANDS keep a floor under that
    // (`handPlant`): a climber's claws are ON the wall, and where the arm is
    // too short to get there the solve leaves it REACHING for the surface,
    // which is the read you want anyway.
    const near = clamp01(1 - Math.abs(gap) / range);
    const w = pull * (L.foot ? near : Math.max(C.handPlant, near));
    if (w < 0.02) continue;
    projectTo(surf, _end, _tgt, L.foot ? sole * 0.35 : 0.06);
    _tgt.lerpVectors(_end, _tgt, w);
    reachTo(root, mid, end, _tgt);
    levelTip(f, end, surf, w);
  }
}

// The climbing CARRIAGE (def.climb.pose, degrees, additive over whatever the
// animator just posed and faded in with the tilt): claws up in front of the
// shell, shell flattened toward the wall — and, the important half, `hipsPos`
// dropping the belly toward the surface, because a mech STANDING on a wall is
// not climbing it. It goes on the VIRTUAL joints — before fighter.js re-syncs
// the GLB — because it is a pose, not a contact.
export function applyClimbPose(f) {
  const pose = f.def.climb?.pose;
  const k = f._climbTilt || 0;
  if (!pose || k < 0.01) return;
  const J = f.mech.joints;
  const s = f.mech.dims?.scale || 1;
  for (const [name, v] of Object.entries(pose)) {
    if (name === 'hipsPos') {
      if (J.hips) {
        J.hips.position.x += v[0] * s * k;
        J.hips.position.y += v[1] * s * k;
        J.hips.position.z += v[2] * s * k;
      }
      continue;
    }
    const j = J[name];
    if (!j) continue;
    j.rotation.x += v[0] * DEG * k;
    j.rotation.y += v[1] * DEG * k;
    j.rotation.z += v[2] * DEG * k;
  }
}

// Two-bone IK in world space: bend the mid joint to the right distance, then
// aim the whole limb at the target. Both writes are world-space rotations
// composed onto what the pose left behind, so no rig's local axes are assumed
// (a knee that bends about x on one model and y on another solves the same).
function reachTo(root, mid, end, target) {
  root.getWorldPosition(_root);
  mid.getWorldPosition(_mid);
  end.getWorldPosition(_end);
  const l1 = _root.distanceTo(_mid), l2 = _mid.distanceTo(_end);
  if (l1 < 1e-4 || l2 < 1e-4) return;
  const want = clamp(_root.distanceTo(target), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  // the interior angle at the mid joint, now and wanted
  _a.subVectors(_root, _mid);
  _b.subVectors(_end, _mid);
  const now = _a.angleTo(_b);
  const next = Math.acos(clamp((l1 * l1 + l2 * l2 - want * want) / (2 * l1 * l2), -1, 1));
  _axis.crossVectors(_a, _b);
  if (_axis.lengthSq() > 1e-8) {
    _axis.normalize();
    // rotating b about a x b OPENS the angle (right-hand rule), so the delta
    // goes on with its own sign
    _qC.setFromAxisAngle(_axis, next - now);
    worldRotate(mid, _qC);
    mid.updateWorldMatrix(false, true);
  }
  // …then swing the root so the tip lands on the target
  end.getWorldPosition(_end);
  _a.subVectors(_end, _root);
  _b.subVectors(target, _root);
  if (_a.lengthSq() < 1e-8 || _b.lengthSq() < 1e-8) return;
  _qC.setFromUnitVectors(_a.normalize(), _b.normalize());
  worldRotate(root, _qC);
  root.updateWorldMatrix(false, true);
}

// Turn the sole/palm to lie on the surface: the tip's own "down" (the body's
// -Y, which is where a foot presses) is rotated onto the surface's inward
// normal. At full tilt on a flat face that is already true and this does
// nothing — it is the transition, the curved prop and the stepped facade it
// exists for.
function levelTip(f, tip, surf, w) {
  tip.getWorldPosition(_p);
  normalAt(surf, _p, _n);
  f.group.getWorldQuaternion(_qA);
  _a.set(0, -1, 0).applyQuaternion(_qA);      // where this body presses
  _b.copy(_n).multiplyScalar(-1);             // where the surface is
  if (_a.dot(_b) > 0.999) return;
  _qC.setFromUnitVectors(_a, _b);
  _qB.identity().slerp(_qC, clamp01(w));
  worldRotate(tip, _qB);
  tip.updateWorldMatrix(false, true);
}

// compose a WORLD-space rotation onto a node, whatever its parent chain is
const _wrA = new THREE.Quaternion();
const _wrB = new THREE.Quaternion();
function worldRotate(node, q) {
  node.getWorldQuaternion(_wrA);
  _wrA.premultiply(q);
  if (node.parent) {
    node.parent.getWorldQuaternion(_wrB);
    _wrA.premultiply(_wrB.invert());
  }
  node.quaternion.copy(_wrA);
}
