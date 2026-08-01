// WALL CLIMBING — the gecko route up a building.
//
// A mech whose roster def carries a `climb` block (JERRY, who paid for it with
// his hover jets) can walk UP a facade. The whole feature is here: the grab
// gate, the surface-following movement, the body's damp between the ground
// frame and the wall frame, the haul over the lip, the rooftop-edge crouch,
// and the pass that plants the hands and feet on whatever surface they are
// crossing. fighter.js owns four call sites and no logic.
//
// ---------------------------------------------------------------------------
// THE FRAME. A wall is a FLOOR THAT POINTS SIDEWAYS, and that one sentence is
// the whole geometry:
//
//     body up   (+Y local, feet -> head) = the surface's outward NORMAL
//     body fwd  (+Z local, where he faces) = the direction he travels ALONG it
//
// On the ground that reads up = world +Y and fwd = the yaw heading — i.e. the
// ordinary standing frame, unchanged — so ONE formula covers both ends and the
// transition is a slerp between them. On a vertical face it puts his soles and
// claws against the wall with his body standing off it, travelling up, FACING
// UPWARD: exactly the crab-up-a-wall read, and exactly what the mech's own walk
// cycle does once you hand it that frame. Nothing in the animator needs to know
// a wall from a floor (one thing did — soleClearanceBySide measured height in
// WORLD y and now measures it along the body's own up).
//
// The group's origin is at the FEET, so `pos` is the contact point on the
// surface and rotating the group about it pivots exactly where a climber's
// feet are. Physics is replaced outright while attached (climbPhysics): no
// gravity, no arena pushout — the surface IS the constraint, re-probed every
// frame so he follows a curved prop around and a stepped facade up.
//
// ---------------------------------------------------------------------------
// THE RULES A PLAYER FEELS
//
//   START      Walking into a wall stays walking into a wall. The stick has to
//              keep pushing squarely into the face for TUNING.climb.grabSeconds
//              before he latches, so a scrape along a facade, a knockback shove
//              and a mistimed run-up all bounce off it as before.
//   SMALL      A face shorter than `minFace` body-heights is not a wall at all:
//              he STEPS OVER it (def.climb.stepUp -> Fighter.stepUp, honoured
//              by destructible.js and arena.js) without breaking stride.
//   UP/DOWN    On the wall the stick's INTO-the-face component is the climb —
//              push on to go up, pull back to come down — and its sideways
//              component scuttles him across the face.
//   OFF        A is the way off: he springs away from the wall. Running out of
//              stamina peels him off too; a hanging mech is spending grip.
//   TOP        Reaching the lip he hauls himself over it and the body damps
//              back upright as he arrives on the roof.
//   EDGE       Walking off a roof stops at the lip in a CROUCH instead of
//              stepping into space. Hold the same direction through that window
//              and he turns over the edge and climbs down the face; tap A, or
//              steer anywhere else, and he drops off it.
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

// ---------------------------------------------------------------------------
// the per-frame entry point. Returns TRUE when the climb owns this frame's
// movement (fighter.js then skips applyPhysics for climbPhysics). `mv` is the
// stick, in world XZ, and may be rewritten — the edge crouch holds him back by
// taking the outward half of it away.
export function climbStep(f, dt, mv) {
  if (!f.def.climb) return false;
  if (f.climb) {
    updateAttached(f, dt, mv);
    return !!f.climb;
  }
  updateRoofEdge(f, dt, mv);
  if (f.climb) return true;
  tryAttach(f, dt, mv);
  return !!f.climb;
}

// ---------------------------------------------------------------------------
// THE GRAB GATE
function tryAttach(f, dt, mv) {
  const D = f.def.climb;
  // THE CPU DOES NOT CLIMB. Nothing about ai.js knows a wall is a route: it
  // steers at an enemy on the ground, so a CPU that latched would climb
  // whatever it happened to be walking into and then sit forty units up
  // pressing forward at a rooftop. Everything BELOW the climb is shared —
  // stepping over small obstacles, the edge crouch — so a CPU jerry still
  // reads as the same body. (Drop this clause the day the AI can want height.)
  if (f.isAI) { f._climbPress = 0; return; }
  if (!f.alive || f.controlsLocked || f.state !== 'normal' || f.blocking ||
      f._carry || f.hanging || f.plunging || f._airRoll) {
    f._climbPress = 0;
    return;
  }
  const len = Math.hypot(mv.x, mv.z);
  if (len < 0.45) { f._climbPress = 0; return; }
  const ix = mv.x / len, iz = mv.z / len;
  const pad = f.radius + D.reach * f.height;
  const s = probeFor(f, f.pos.y + f.height * 0.42, pad);
  if (!s) { f._climbPress = 0; return; }
  // pushing SQUARELY into the face (a glancing scrape never latches)…
  if (-(ix * s.nx + iz * s.nz) < C.grabDot) { f._climbPress = 0; return; }
  // …at something tall enough to be a wall. Anything less he steps over.
  if (s.top - f.pos.y < C.minFace * f.height) { f._climbPress = 0; return; }
  f._climbPress = (f._climbPress || 0) + dt;
  if (f._climbPress < C.grabSeconds) return;
  attach(f, s);
}

function attach(f, s, fwd = null) {
  f._climbPress = 0;
  f.climb = { surf: s, phase: 'wall', t: 0, lostT: 0, fwd: new THREE.Vector3(0, 1, 0) };
  if (fwd) f.climb.fwd.copy(fwd);
  f.vel.set(0, 0, 0);
  f.grounded = false;
  f.hovering = false;
  f.plunging = false;
  f._climbSpeed = 0;
  f._climbEdgeSkip = null;   // a new surface always gets its own lip decision
  f.duckT = 0;
  projectTo(s, f.pos, _p, 0.02);
  f.pos.x = _p.x; f.pos.z = _p.z;
  f.world.audio?.play('servo');
  f.world.effects?.dustPuff(_p.set(s.x, f.pos.y + f.height * 0.25, s.z), 4, 0xa8a8a8);
}

// leave the wall. `spring` = push off it (the A-press), otherwise just fall.
function detach(f, spring) {
  const c = f.climb;
  if (!c) return;
  f.climb = null;
  f._climbSpeed = 0;
  f._climbPress = 0;
  f._climbEdgeSkip = null;
  f._hangCoyote = 0.2;  // the same short grace the wall grab leaves behind
  f.grounded = false;
  if (spring) {
    normalAt(c.surf, f.pos, _n);
    f.vel.set(_n.x * 6.5, f.def.stats.jump * TUNING.movement.jumpMult * 0.72, _n.z * 6.5);
    f.yaw = f.targetYaw = Math.atan2(_n.x, _n.z);
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
  if (f.sprintEnergy <= 0) return detach(f, false);

  // re-probe every frame: this is what follows a stepped facade up and carries
  // him around a cylinder. A couple of frames of nothing is a blown-out chunk
  // or a corner turned — he comes off.
  const pad = f.radius + D.reach * f.height;
  const s = probeFor(f, f.pos.y + f.height * 0.3, pad) || probeFor(f, f.pos.y + 0.4, pad);
  if (s) { c.surf = s; c.lostT = 0; } else if ((c.lostT += dt) > 0.12) return detach(f, false);

  const surf = c.surf;
  normalAt(surf, f.pos, _n);
  _side.crossVectors(UP, _n).normalize();          // along the face, horizontal
  // THE STICK, read against the face: pushing IN is up, pulling BACK is down,
  // and the sideways half scuttles across.
  const into = -(mv.x * _n.x + mv.z * _n.z);
  const lat = mv.x * _side.x + mv.z * _side.z;
  const speed = f.moveSpeed() * f.speedMult() * D.speed *
    (f.blocking ? TUNING.movement.blockMoveMult : 1);
  const vUp = into * speed, vLat = lat * speed;
  f.pos.y += vUp * dt;
  f.pos.x += _side.x * vLat * dt;
  f.pos.z += _side.z * vLat * dt;
  f.vel.set(_side.x * vLat, vUp, _side.z * vLat);
  f._climbSpeed = Math.hypot(vUp, vLat);

  // hug the surface (a cylinder curves away as he goes round it)
  projectTo(surf, f.pos, _p, 0.02);
  f.pos.x = _p.x; f.pos.z = _p.z;

  // which way he FACES on the wall: the way he is going, except that coming
  // DOWN he keeps facing up the face and backs down it, like a real climber
  if (f._climbSpeed > 0.4) {
    _want.set(_side.x * vLat, Math.max(vUp, 0), _side.z * vLat);
    if (_want.lengthSq() < 1e-4) _want.copy(UP);
    _want.normalize();
  } else _want.copy(UP);
  c.fwd.lerp(_want, 1 - Math.exp(-8 * dt));
  c.fwd.addScaledVector(_n, -c.fwd.dot(_n)).normalize();  // keep it on the face

  // the lip: his claws are over it, haul him up
  if (vUp > 0.05 && f.pos.y >= surf.top - f.height * 0.45) return startTopOut(f, surf);
  // the bottom: back on the dirt, stand up
  const floor = Math.max(surf.base || 0, f.world.arena?.terrainHeightAt?.(f.pos.x, f.pos.z) || 0);
  if (f.pos.y <= floor + 0.05) {
    f.pos.y = floor;
    detach(f, false);
    f.grounded = true;
    f.vel.set(0, 0, 0);
  }
}

// ---------------------------------------------------------------------------
// OVER THE LIP. A scripted haul: the feet travel from the face onto the roof
// while the body damps back upright (applyClimbOrientation wants the ground
// frame the moment the phase flips), so he rolls over the edge instead of
// teleporting onto it.
function startTopOut(f, surf) {
  const c = f.climb;
  c.phase = 'top';
  c.t = 0;
  normalAt(surf, f.pos, _n);
  c.from = f.pos.clone();
  c.to = new THREE.Vector3(
    f.pos.x - _n.x * (f.radius * 1.4), surf.top + 0.02, f.pos.z - _n.z * (f.radius * 1.4));
  // he arrives facing where he is going: in over the roof
  f.yaw = f.targetYaw = f.torsoYaw = Math.atan2(-_n.x, -_n.z);
  f.vel.set(0, 0, 0);
  f.world.audio?.play('servo');
}

function updateTopOut(f, dt) {
  const c = f.climb;
  const k = clamp01((c.t) / C.topSeconds);
  const e = k * k * (3 - 2 * k);
  f.pos.x = c.from.x + (c.to.x - c.from.x) * e;
  f.pos.z = c.from.z + (c.to.z - c.from.z) * e;
  // the feet clear the lip BEFORE the body swings in — rise first, then travel
  f.pos.y = c.from.y + (c.to.y - c.from.y) * clamp01(e * 1.7);
  f._climbSpeed = 0;
  f.vel.set(0, 0, 0);
  if (k < 1) return;
  f.climb = null;
  f.grounded = true;
  f._climbSpeed = 0;
}

// ---------------------------------------------------------------------------
// THE ROOFTOP EDGE. Walking off a roof stops at the lip in a crouch. Hold the
// same direction through the window and he turns over it and climbs down that
// face; tap A, or steer anywhere else, and he drops.
//
// (The check only runs for a mech that could climb down anyway, and only over
// a drop worth stopping for — `edgeDrop` body-heights. A kerb is not an edge.)
function updateRoofEdge(f, dt, mv) {
  const e = f._climbEdge;
  const D = f.def.climb;
  // A DECISION AT A LIP STICKS — but only AT THAT LIP. Without any suppression
  // the crouch re-arms the instant it resolves (one step, same edge, crouch
  // again) and a mech told to walk off a roof shuffles on the spot for ever.
  // Suppressing by TIME instead failed the other way round: this mech covers
  // 28 units a second, so a decision at one lip silently swallowed the next
  // roof's. The suppression is a PLACE, and he is clear of it once he has
  // walked a couple of body-widths away.
  const skip = f._climbEdgeSkip;
  if (skip) {
    const sx = f.pos.x - skip.x, sz = f.pos.z - skip.z;
    if (sx * sx + sz * sz > (f.radius * 2.5) ** 2) f._climbEdgeSkip = null;
  }
  if (!f.alive || !f.grounded || f.controlsLocked || f.state !== 'normal' ||
      f._carry || f.pos.y < f.height * 0.5) {
    f._climbEdge = null;
    return;
  }
  const len = Math.hypot(mv.x, mv.z);
  if (e) {
    e.t += dt;
    // A TAP of A (pressed and let go, no hold) is "just drop me off"
    if (f.intent.jump && !f.intent.jumpHeld) { f._climbEdge = null; edgeDecided(f); return; }
    const commit = len > 0.3 ? (mv.x * e.dx + mv.z * e.dz) / len : 0;
    if (commit < C.edgeCommit) {
      // steered away (or let go): stand back up on the roof, nothing happens
      if (e.t > 0.1) f._climbEdge = null;
      return;
    }
    // still going over: crouch at the lip, and hold him there for the window.
    // (Faster than the duck's own release rate on purpose — this runs after
    // fighter.js has already decayed duckT for the frame, so a gentler rate
    // just cancels against it and he never visibly crouches at all.)
    f.duckT = Math.min(1, f.duckT + dt / 0.06);
    mv.x -= e.dx * commit * len;
    mv.z -= e.dz * commit * len;
    if (e.t < C.edgeSeconds) return;
    // committed: turn over the edge and take the face below
    const s = f.world.arena?.climbProbe?.(
      e.x + e.dx * (f.radius * 0.6), f.pos.y - f.height * 0.35, e.z + e.dz * (f.radius * 0.6),
      f.radius + D.reach * f.height);
    f._climbEdge = null;
    edgeDecided(f);
    if (!s) return;                       // nothing to hold: he just walks off
    f.pos.y -= f.height * 0.22;           // drop his feet below the lip
    attach(f, s, UP);
    f.climb.fwd.copy(UP);
    f.duckT = 0;
    return;
  }
  // not at an edge yet: is he about to walk off one?
  if (len < 0.4 || f._climbEdgeSkip) return;
  const dx = mv.x / len, dz = mv.z / len;
  const ahead = f.radius + f.height * 0.18;
  const x = f.pos.x + dx * ahead, z = f.pos.z + dz * ahead;
  if (groundUnder(f, x, z, f.pos.y) > f.pos.y - f.height * C.edgeDrop) return;
  f._climbEdge = { t: 0, x, z, dx, dz };
}

// remember WHERE a lip was decided about, so the crouch cannot re-arm on it
function edgeDecided(f) {
  f._climbEdgeSkip = { x: f.pos.x, z: f.pos.z };
}

// The highest thing to stand on under (x, z), searching DOWN from `fromY`.
//
// A SOLID CHUNK AT HIS OWN HEIGHT IS NOT A DROP, it is the next tier's WALL,
// and that distinction is the whole reason this is a function and not a
// terrain lookup: on a stepped building the point a couple of paces ahead of a
// mech standing on a terrace is often INSIDE the tower above it, whose chunk
// tops are all far overhead. Read as "nothing underneath", that arms the
// rooftop crouch at the foot of a wall he is about to climb.
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
// applyPhysics would otherwise do: the wrap and the fighter-vs-fighter shove.)
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
// running after he lets go, until the body has rolled back upright.
export function applyClimbOrientation(f, dt) {
  const c = f.climb;
  const onWall = !!c && c.phase === 'wall';
  if (onWall) {
    normalAt(c.surf, f.pos, _n);
    const basis = f._climbBasis || (f._climbBasis = { up: new THREE.Vector3(), fwd: new THREE.Vector3() });
    basis.up.copy(_n);
    basis.fwd.copy(c.fwd);
    // the legs' yaw is kept honest underneath, so letting go anywhere in the
    // blend hands the ground frame a heading that already matches the body
    f.yaw = f.targetYaw = f.torsoYaw = Math.atan2(-_n.x, -_n.z);
  }
  const want = onWall ? 1 : 0;
  f._climbTilt = damp(f._climbTilt || 0, want, C.tiltRate, dt);
  if (f._climbTilt < 0.004) { f._climbTilt = 0; return; }
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
// shell, shell flattened toward the wall. It is what stops the climb reading
// as a walk cycle on a rotated floor, and it goes on the VIRTUAL joints —
// before fighter.js re-syncs the GLB — because it is a pose, not a contact.
// THE CROUCH IS THE POSE'S WHOLE JOB. A standing biped's hands are nowhere
// near the floor — measured on JERRY, 5.4 units off it — and rotating that
// body onto a wall changes nothing about that: he stands ON the facade instead
// of climbing it. `hipsPos` (same units as a def's combatPose: x dims.scale)
// drops the body toward the surface until all four limbs can reach it, which
// is what turns a walk cycle into a scuttle.
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
