// SURFACE WALKING — the body that walks on everything.
//
// A mech whose roster def carries a `climb` block (JERRY, who paid for it with
// his hover jets) does not walk on the FLOOR, he walks on the WORLD: up a
// facade, over its lip, across the roof, down the far side, over the crates on
// the way, without a single mode change or a single scripted move. fighter.js
// owns four call sites and no logic.
//
// ---------------------------------------------------------------------------
// WHY THE PREVIOUS VERSION FELT WRONG, because the shape of the fix follows
// from it. That one ATTACHED TO ONE PLANE: a probe picked the nearest building
// face, the body snapped to its normal, and everything else — the haul over a
// lip, the wrap over a roof edge — was a scripted special case bolted on. A
// single plane cannot express a CORNER, so every corner was a discontinuity:
// he stepped up onto the first block (the arena's step-over, now gone), the
// plane flipped, his facing flipped with it, and the camera fought the
// building it could no longer see him through.
//
// This version never names a surface. Every frame it asks the world one
// question — WHAT IS NEAR MY FEET? — and answers it with a field:
//
//     n  = the average outward normal of everything in reach, distance-weighted
//     cp = the nearest point on any of it
//
// and that is the whole model. On open floor the only thing in reach is the
// floor, so n is straight up and he is an ordinary mech (the walker hands him
// back to applyPhysics — dash, knockdown, landing, the jump arc, all untouched).
// Walk him at a wall and the wall enters the field: n tilts smoothly from floor
// toward facade as its weight grows, and because INPUT IS MAPPED THROUGH n (see
// below), the same forward push that was carrying him along the ground starts
// carrying him up it. Reach the top and the roof enters the field and takes
// over; step past the far lip and the only thing in reach is the edge itself,
// whose normal rotates continuously from up to outward as he crosses it, so he
// tips over and walks down. Nothing is scripted. Every corner in the arena,
// convex or concave, is the field doing arithmetic.
//
// ---------------------------------------------------------------------------
// THE THREE RULES
//
// 1. ORIENTATION IS THE FIELD. `up` damps toward n — literally "whatever
//    average orientation his feet indicate" — and `fwd` damps toward the
//    direction he is travelling. The body frame is built from those two, so it
//    is continuous by construction: no case analysis to disagree with itself,
//    and no snap anywhere, because both vectors only ever move by a damp. The
//    walker never writes f.yaw; the ordinary yaw servo keeps the horizontal
//    heading live underneath it.
//
// 2. INPUT IS MAPPED THROUGH THE SAME ROTATION. The stick arrives as a world XZ
//    direction (input.js has already turned it by the camera). Rotate it by
//    Q = (world up -> body up) and it becomes a direction along the surface:
//    identity on the floor, so ground movement is untouched to the bit; a
//    quarter turn on a wall, where "push away from the camera" becomes "climb".
//    One rotation drives movement, facing and the chase camera, which is why
//    they cannot drift apart.
//
// 3. THE FEET ARE PULLED TO THE SURFACE, never teleported onto it. The field
//    is sampled a STANDOFF off the body's own up — above the soles on a floor,
//    out from the face on a wall — and position is corrected until the sample
//    sits exactly that far off, which makes floors and walls the same
//    arithmetic. That correction is EXACT while he walks a surface (a rate can
//    be outrun by his own stride, and losing the race means sailing off a roof)
//    and capped only while he is still ARRIVING at one, which is the glide.
//    De-penetration keeps him out of geometry instead of clipping into it. Hands and feet are then planted individually on whatever is
//    nearest THEM (conformClimbLimbs) — which is how a mech crossing a corner
//    gets one claw on the wall and one on the roof.
//
// The way off is the JUMP: with a direction held it is a leap that way, with
// nothing held he lets go and drops. Everything else — including running out of
// surface — just falls, because a walker with nothing in reach is a body in the
// air.
import * as THREE from 'three';
import { TUNING } from '../core/tuning.js';
import { clamp, clamp01, DEG, angleDiff } from '../core/utils.js';

const C = TUNING.climb;
const UP = new THREE.Vector3(0, 1, 0);

// scratch — this module allocates nothing per frame
const _dir = new THREE.Vector3();
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
const _qUp = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _root = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _end = new THREE.Vector3();
const _axis = new THREE.Vector3();

// ===========================================================================
// THE SOLIDS NEAR THE BODY
//
// Collected ONCE a frame and then queried five times (the body plus four
// limbs), because the gather is the expensive half — walking every live chunk
// of every nearby building — and each query is a handful of clamps.
// ===========================================================================
const _boxes = [];   // pooled {x0,y0,z0,x1,y1,z1}
let _nBoxes = 0;
const _cyls = [];    // pooled {x,z,r,h}
let _nCyls = 0;
const MAX_BOXES = 96, MAX_CYLS = 24;

function pushBox(x0, y0, z0, x1, y1, z1) {
  const b = _boxes[_nBoxes] || (_boxes[_nBoxes] = {});
  b.x0 = x0; b.y0 = y0; b.z0 = z0; b.x1 = x1; b.y1 = y1; b.z1 = z1;
  _nBoxes++;
}

function collectSolids(f, reach) {
  _nBoxes = 0;
  _nCyls = 0;
  const arena = f.world.arena;
  if (!arena || f.world.sandbox) return;
  const px = f.pos.x, py = f.pos.y, pz = f.pos.z;
  const d = arena.destructo;
  if (d) {
    for (const b of d.buildings) {
      if (b.alive <= 0) continue;
      const a = b.aabb;
      if (px < a.minX - reach || px > a.maxX + reach ||
          pz < a.minZ - reach || pz > a.maxZ + reach ||
          py < -reach || py > a.maxY + reach) continue;
      for (const c of b.grid.values()) {
        if (!c.alive) continue;
        if (Math.abs(px - c.x) > c.w / 2 + reach || Math.abs(py - c.y) > c.h / 2 + reach ||
            Math.abs(pz - c.z) > c.d / 2 + reach) continue;
        pushBox(c.x - c.w / 2, c.y - c.h / 2, c.z - c.d / 2,
          c.x + c.w / 2, c.y + c.h / 2, c.z + c.d / 2);
        if (_nBoxes >= MAX_BOXES) return;
      }
    }
    // settled rubble is standable to the ordinary collider, so it is walkable
    // here too — a mech crossing a collapsed facade walks over the debris
    for (const it of d.rubble.items) {
      if (!it.settled || it.life <= 0) continue;
      if (Math.abs(px - it.px) > it.w / 2 + reach || Math.abs(py - it.py) > it.h / 2 + reach ||
          Math.abs(pz - it.pz) > it.d / 2 + reach) continue;
      pushBox(it.px - it.w / 2, it.py - it.h / 2, it.pz - it.d / 2,
        it.px + it.w / 2, it.py + it.h / 2, it.pz + it.d / 2);
      if (_nBoxes >= MAX_BOXES) return;
    }
  }
  const w = f.world;
  for (const p of arena.propBodies || []) {
    if (!p.alive) continue;
    const dx = w ? w.wrapDelta(px - p.x) : px - p.x;
    const dz = w ? w.wrapDelta(pz - p.z) : pz - p.z;
    if (Math.hypot(dx, dz) > p.r + reach || py > p.h + reach || py < -reach) continue;
    const c = _cyls[_nCyls] || (_cyls[_nCyls] = {});
    c.x = px - dx; c.z = pz - dz; c.r = p.r; c.h = p.h;   // the image next to us
    _nCyls++;
    if (_nCyls >= MAX_CYLS) break;
  }
}

// Nearest point on a box and the outward normal there. Returns the SIGNED
// distance: positive outside, negative inside (the depth to push back out by).
function boxNearest(b, px, py, pz, outCp, outN) {
  const cx = clamp(px, b.x0, b.x1), cy = clamp(py, b.y0, b.y1), cz = clamp(pz, b.z0, b.z1);
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    outCp.set(cx, cy, cz);
    outN.set(dx / d, dy / d, dz / d);
    return d;
  }
  // INSIDE: leave by the shallowest face. A body should never be in here —
  // de-penetration is what keeps it out — but geometry can arrive around one
  // when a chunk falls, and "nearest face" is the only answer that gets it out
  // sanely rather than through the building.
  const ex0 = px - b.x0, ex1 = b.x1 - px;
  const ey0 = py - b.y0, ey1 = b.y1 - py;
  const ez0 = pz - b.z0, ez1 = b.z1 - pz;
  let best = ex0; outN.set(-1, 0, 0);
  if (ex1 < best) { best = ex1; outN.set(1, 0, 0); }
  if (ey0 < best) { best = ey0; outN.set(0, -1, 0); }
  if (ey1 < best) { best = ey1; outN.set(0, 1, 0); }
  if (ez0 < best) { best = ez0; outN.set(0, 0, -1); }
  if (ez1 < best) { best = ez1; outN.set(0, 0, 1); }
  outCp.set(px, py, pz).addScaledVector(outN, best);
  return -best;
}

// ...and on a capped cylinder standing on the ground (the prop colliders).
function cylNearest(c, px, py, pz, outCp, outN) {
  const dx = px - c.x, dz = pz - c.z;
  const rad = Math.hypot(dx, dz);
  const ux = rad > 1e-6 ? dx / rad : 1, uz = rad > 1e-6 ? dz / rad : 0;
  if (py > c.h) {                       // above it: the top cap, rim included
    const r = Math.min(rad, c.r);
    outCp.set(c.x + ux * r, c.h, c.z + uz * r);
    _a.set(px - outCp.x, py - outCp.y, pz - outCp.z);
    const d = _a.length();
    if (d > 1e-6) { outN.copy(_a).multiplyScalar(1 / d); return d; }
    outN.set(0, 1, 0);
    return 0;
  }
  outCp.set(c.x + ux * c.r, py, c.z + uz * c.r);
  outN.set(ux, 0, uz);
  return rad - c.r;
}

// THE FIELD: everything within `range` of a point, averaged.
//   n    distance-weighted average outward normal — the orientation
//   cp   nearest point on any surface — what the feet are pulled to
//   d    the distance to it (negative = inside something)
//   push accumulated de-penetration, so a body can never end up in geometry
const _field = {
  n: new THREE.Vector3(), cp: new THREE.Vector3(), push: new THREE.Vector3(),
  d: Infinity, hits: 0,
  // is the nearest thing underfoot a SOLID (a building, its rubble, a prop)
  // rather than the arena floor? That one bit decides who owns the body: on
  // the open ground he is an ordinary mech, and the moment he is on a
  // structure — flat roof included — he is a surface walker, which is what
  // lets him tip over the far lip instead of striding off it.
  onSolid: false,
};
const _fcp = new THREE.Vector3();
const _fn = new THREE.Vector3();

function fieldAt(f, px, py, pz, range) {
  const out = _field;
  out.n.set(0, 0, 0);
  out.push.set(0, 0, 0);
  out.d = Infinity;
  out.hits = 0;
  out.onSolid = false;
  const add = (dist) => {
    // the weight falls off with distance and is FULL on contact, so what he is
    // standing on always outvotes what he is merely walking past
    const t = clamp01(1 - Math.max(dist, 0) / range);
    const w = t * t;
    out.n.addScaledVector(_fn, w);
    out.hits++;
    if (dist < out.d) { out.d = dist; out.cp.copy(_fcp); out.onSolid = solid; }
    if (dist < 0) out.push.addScaledVector(_fn, -dist);
  };
  let solid = true;
  for (let i = 0; i < _nBoxes; i++) {
    const d = boxNearest(_boxes[i], px, py, pz, _fcp, _fn);
    if (d < range) add(d);
  }
  for (let i = 0; i < _nCyls; i++) {
    const d = cylNearest(_cyls[i], px, py, pz, _fcp, _fn);
    if (d < range) add(d);
  }
  // the ground itself — terrain where there is any, the arena floor otherwise
  const gy = f.world.arena?.terrainHeightAt?.(px, pz) ?? 0;
  const gd = py - gy;
  if (gd < range) {
    _fcp.set(px, gy, pz);
    _fn.set(0, 1, 0);
    solid = false;
    add(gd);
  }
  if (out.hits) {
    if (out.n.lengthSq() > 1e-8) out.n.normalize();
    else out.n.set(0, 1, 0);
  }
  return out;
}

// The single nearest surface to a point, no averaging — what a HAND or a FOOT
// is placed on. Asking per limb is what lets one claw take the wall while the
// other takes the roof.
const _limbCp = new THREE.Vector3();
const _limbN = new THREE.Vector3();
function nearestSurface(f, px, py, pz, range) {
  let best = Infinity;
  for (let i = 0; i < _nBoxes; i++) {
    const d = boxNearest(_boxes[i], px, py, pz, _fcp, _fn);
    if (d < best) { best = d; _limbCp.copy(_fcp); _limbN.copy(_fn); }
  }
  for (let i = 0; i < _nCyls; i++) {
    const d = cylNearest(_cyls[i], px, py, pz, _fcp, _fn);
    if (d < best) { best = d; _limbCp.copy(_fcp); _limbN.copy(_fn); }
  }
  const gy = f.world.arena?.terrainHeightAt?.(px, pz) ?? 0;
  if (py - gy < best) { best = py - gy; _limbCp.set(px, gy, pz); _limbN.set(0, 1, 0); }
  return best < range ? best : Infinity;
}

// ===========================================================================
// THE WALKER
// ===========================================================================

// nothing else owns this body right now
function bodyFree(f) {
  return f.alive && !f.controlsLocked && f.state === 'normal' &&
    !f._carry && !f.hanging && !f.plunging && !f._airRoll && !f.cinePuppet;
}

// The rotation carrying the world's up onto this body's up: the one mapping
// that turns stick into travel, travel into facing, and the chase camera's
// offset into a view from outside the wall.
export function upRotation(up, out) {
  if (up.y > 0.9999) return out.identity();
  if (up.y < -0.9999) return out.setFromAxisAngle(_a.set(1, 0, 0), Math.PI);
  return out.setFromUnitVectors(UP, up);
}

// keep fwd perpendicular to up and unit-length, whatever the damps did
function orthonormalize(up, fwd) {
  fwd.addScaledVector(up, -fwd.dot(up));
  if (fwd.lengthSq() < 1e-6) {
    fwd.set(0, 0, 1).addScaledVector(up, -up.z);
    if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0).addScaledVector(up, -up.x);
  }
  fwd.normalize();
}

export function climbStep(f, dt, mv) {
  if (!f.def.climb) return false;
  if (f._climbCd > 0) f._climbCd = Math.max(0, f._climbCd - dt);
  if (!f.climbUp) {
    f.climbUp = new THREE.Vector3(0, 1, 0);
    f.climbFwd = new THREE.Vector3(0, 0, 1);
  }
  const up = f.climbUp, fwd = f.climbFwd;
  const D = f.def.climb;
  const range = D.reach * f.height;
  // THE STANDOFF. The field is sampled a little way OFF the surface, along the
  // body's own up — above his soles on a floor, out from the face on a wall —
  // and the same number is the distance the walker holds him at. Asking at the
  // contact point itself would make "am I on it" a coin-toss between 0 and a
  // rounding error, and pulling the SAMPLE onto the surface (rather than to
  // the standoff) buries the body by exactly this much: measured, that put his
  // feet 0.5 under the pavement on flat ground.
  const stand = f.height * 0.06;
  // THE GATHER HAS TO COVER THE HANDS, not just the body. The solids are
  // collected once and then queried five times — the body at `range`, and the
  // four limbs out at their own full extension (conformClimbLimbs). For a
  // spider those are similar numbers; for an APE the arms are longer than the
  // whole field radius, so a gather sized for the body alone hands the hands
  // an empty list and every grab fails. Measured on konga: both arms read
  // airborne for an entire 49-unit ascent — he went up the facade without
  // once touching it.
  collectSolids(f, range + f.radius + (D.style === 'ape' ? f.height * 0.8 : 0));

  // THE CPU DOES NOT SURFACE-WALK. Nothing in ai.js knows a wall is a route: it
  // steers at an enemy on the ground, so a CPU that went up would climb
  // whatever it walked into and then sit forty units up pressing forward at a
  // rooftop. (Drop this the day the AI can want height.)
  const may = !f.isAI && bodyFree(f) && !f._climbRelease && f._climbCd <= 0;
  _p.copy(f.pos).addScaledVector(up, stand);
  const fld = may ? fieldAt(f, _p.x, _p.y, _p.z, range) : null;

  // FLAT GROUND IS NOT CLIMBING, and this is the line that keeps the whole
  // feature cheap: with only the floor in reach the field's answer is straight
  // up, and the walker hands the body back to applyPhysics — dash, knockdown,
  // the landing, the jump arc all belong to the code that has always owned
  // them, and a mech walking about the arena is not running any of this.
  //   TAKING OVER  needs a STRUCTURE underfoot, or something not flat within
  //                reach — so stepping onto a roof, or up to a wall, engages.
  //   GIVING BACK  waits for the open floor with the body already upright, so
  //                a flat ROOF stays the walker's (which is what lets him tip
  //                over its far lip rather than striding off into the air).
  const inReach = !!fld && fld.hits > 0 && fld.d < range;
  const flat = !fld || fld.n.y >= C.flatCos;
  const surfaced = inReach && (f.climb
    ? !(flat && !fld.onSolid && up.y > C.flatCos)
    : (fld.onSolid || !flat) && fld.d < f.radius * 1.4);

  if (!surfaced) {
    if (f.climb) release(f, false);
    // ease the frame back to standing, and keep the heading live underneath so
    // the next surface picks the body up exactly where it already is
    const k = 1 - Math.exp(-C.tiltRate * dt);
    f._climbN?.lerp(UP, k).normalize();
    up.lerp(UP, k).normalize();
    _want.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    fwd.lerp(_want, k);
    orthonormalize(up, fwd);
    f._climbTilt = clamp01((1 - up.y) / C.tiltFull);
    return false;
  }

  f.climb = true;
  if (f.intent.jump) { wallJump(f); return false; }

  // ---- 1. ORIENTATION IS THE FIELD, TWICE DAMPED. The raw field normal can
  // hop between answers at a block seam (a chunk enters reach, the average
  // jumps); a pre-filter (`normRate`) takes the hop out of the SIGNAL and the
  // body then follows the filtered normal at `tiltRate`. Two stages of
  // smoothing is what turns a seam crossing from a flicker into a lean.
  const nS = f._climbN || (f._climbN = new THREE.Vector3(0, 1, 0));
  nS.lerp(fld.n, 1 - Math.exp(-C.normRate * dt)).normalize();
  up.lerp(nS, 1 - Math.exp(-C.tiltRate * dt)).normalize();
  upRotation(up, _qUp);
  const tilt = clamp01((1 - up.y) / C.tiltFull);

  // ---- 2. INPUT THROUGH THE SAME ROTATION ----
  _dir.set(mv.x, 0, mv.z);
  const drive = Math.min(_dir.length(), 1);
  _dir.applyQuaternion(_qUp);
  // STABILITY OVER SPEED, in two rules. A surfaced body never moves faster
  // than the climbing pace — a fast WALK, whatever the terrain (`D.speed` of
  // his walk; running belongs to open ground). And while the body frame is
  // still TURNING — the pending angle between his up and the filtered field
  // normal — translation is throttled toward a floor, so complex territory is
  // taken slowly and settled before speed comes back. That is what replaces
  // "flickering between orientations": the body stops racing its own frame.
  const pending = up.angleTo(nS);
  const steady = clamp(1 - pending / C.turnSlow, C.turnFloor, 1);
  const speed = f.moveSpeed() * f.speedMult() * D.speed * steady *
    (f.blocking ? TUNING.movement.blockMoveMult : 1);
  if (_dir.lengthSq() > 1e-8) _dir.setLength(drive * speed);
  f._climbSpeed = drive * speed;
  f.pos.addScaledVector(_dir, dt);
  f.vel.copy(_dir);

  // ---- 3. PULLED TO THE SURFACE, NEVER TELEPORTED ----
  // The sample rides `stand` off the body along its own up, so the body is at
  // the right height exactly when the sample's distance IS `stand` — pull the
  // error out along the line to the surface, and floors and walls are the same
  // arithmetic.
  _p.copy(f.pos).addScaledVector(up, stand);
  const post = fieldAt(f, _p.x, _p.y, _p.z, range);
  if (post.hits) {
    f.pos.add(post.push);                       // never inside anything
    const err = post.d - stand;
    if (Math.abs(err) > 0.02 && post.d > 1e-4) {
      // the vector that puts the sample exactly `stand` off the surface
      _want.copy(post.cp).sub(_p).multiplyScalar(err / post.d);
      // EXACT while he is walking a surface (a rate here is outrun by his own
      // stride), CAPPED while he is still arriving at one (that is the glide)
      if (Math.abs(err) > C.stickGlide) _want.setLength(C.stickMax * dt);
      f.pos.add(_want);
    }
  }

  // facing: the way he is going, damped exactly like a turn on the ground
  if (f._climbSpeed > 0.4) {
    _want.copy(_dir).normalize();
    fwd.lerp(_want, 1 - Math.exp(-C.faceRate * dt));
  }
  orthonormalize(up, fwd);
  f._climbTilt = tilt;

  f.grounded = false;
  f.hovering = false;
  f.plunging = false;
  return true;
}

// leaving the surface. `release` is the mechanism; the JUMP is how a player
// asks for it.
function release(f, cooldown) {
  f.climb = false;
  f._climbSpeed = 0;
  if (cooldown) f._climbCd = 0.25;
  f.grounded = false;
}

// THE JUMP OFF A SURFACE, two moves by whether the stick is pushed:
//   DIRECTION HELD — a real leap THAT WAY, with enough of the surface normal
//     folded in that a stick aimed back into the face still clears it.
//   NOTHING HELD  — he simply LETS GO: no push, no arc, straight down like any
//     other mech falling off anything. `_climbRelease` keeps the surface he is
//     sliding past from catching him again on the way down.
function wallJump(f) {
  const up = f.climbUp;
  const mv = f.intent;                        // the RAW stick: a rooted state
  const len = Math.hypot(mv.moveX, mv.moveZ); // zeroes the movement input
  release(f, true);
  if (len < 0.3) {
    f._climbRelease = true;
    f.vel.set(0, 0, 0);
    return;
  }
  const dx = mv.moveX / len, dz = mv.moveZ / len;
  const speed = f.moveSpeed() * C.leapMult;
  const away = Math.max(0, C.leapOut - (dx * up.x + dz * up.z) * speed);
  f.vel.set(dx * speed + up.x * away,
    f.def.stats.jump * TUNING.movement.jumpMult * C.leapRise + Math.max(0, up.y) * away,
    dz * speed + up.z * away);
  f.targetYaw = Math.atan2(dx, dz);
  f.world.audio?.play('jump');
  f.world.effects?.dustPuff(f.pos, 5);
}

// PHYSICS while surfaced: the field is the constraint, so all that is left of
// applyPhysics is the toroidal wrap.
export function climbPhysics(f) {
  const w = f.world;
  if (!w.wrapHalf) return;
  const wx = w.wrapCoord(f.pos.x), wz = w.wrapCoord(f.pos.z);
  if (wx !== f.pos.x || wz !== f.pos.z) {
    f._wrap = { dx: wx - f.pos.x, dz: wz - f.pos.z };
    f.pos.x = wx; f.pos.z = wz;
  }
}

// A let-go stays let go while he is still brushing what he let go of — it
// expires on landing, or the moment he is clear of everything. (Never on the
// jump button: that fires in the same frame that sets it.)
export function climbReleaseTick(f) {
  if (!f._climbRelease) return;
  if (f.grounded) { f._climbRelease = false; return; }
  const range = f.def.climb.reach * f.height;
  if (nearestSurface(f, f.pos.x, f.pos.y + f.height * 0.06, f.pos.z, range) === Infinity) {
    f._climbRelease = false;
  }
}

// ===========================================================================
// THE BODY FRAME, built from (up, fwd) — the two vectors the walker damps — so
// it is continuous by construction. On the flat those are world up and the yaw
// heading, which IS `rotation.y = yaw`, so this only takes the wheel once the
// body has actually tilted, and hands it back squared off.
// ===========================================================================
export function applyClimbOrientation(f) {
  const up = f.climbUp;
  if (!up) return;
  if (!(f._climbTilt > 0.004)) {
    if (f._climbTiltOn) { f._climbTiltOn = false; f.group.rotation.set(0, f.yaw, 0); }
    return;
  }
  f._climbTiltOn = true;
  _by.copy(up);
  _bz.copy(f.climbFwd);
  _bx.crossVectors(_by, _bz).normalize();      // x = right, y = up, z = forward
  _bz.crossVectors(_bx, _by).normalize();
  _mtx.makeBasis(_bx, _by, _bz);
  f.group.quaternion.setFromRotationMatrix(_mtx);
}

// The climbing CARRIAGE (def.climb.pose, degrees, faded in with the tilt):
// claws up in front of the shell, and — the important half — `hipsPos`
// dropping the belly toward the surface, because a mech STANDING on a wall is
// not climbing it. It goes on the VIRTUAL joints, before fighter.js re-syncs
// the GLB, because it is a pose and not a contact.
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

// ===========================================================================
// THE SPIDER: FOUR LIMBS THAT STEP INDEPENDENTLY, IN ANY DIRECTION.
//
// The old conform pass pulled a limb to the surface only when the animation
// happened to leave it near one, so feet FLOATED whenever the neutral pose
// assumed flat ground and the ground wasn't flat. This replaces it with an
// actual stepping system — the standard spider-IK loop:
//
//   HOME    each limb has a home point: the nearest surface to the spot under
//           its own root (led a little along the travel), at standing height.
//           "Plant on whatever surface is nearest to their normal spot."
//   STANCE  a planted limb's tip is PINNED to its plant point, however the
//           body moves — that is what makes contact read as contact.
//   SWING   when a plant falls a stride behind its home (or the limb nears
//           full stretch), the limb swings: a lifted arc to the new home,
//           `step.time` seconds. Diagonal pairs (ankleL+handR / ankleR+handL)
//           swing together and the two pairs alternate, which is a trot — and
//           because homes are computed from geometry and travel, the same
//           rule IS the sideways gait and the backward gait: moving right,
//           the right-side limbs lead because their homes do; backing up, the
//           roles reverse because the travel did. No direction is special.
//   AIR     a limb whose home is beyond FULL EXTENSION (l1+l2, measured live
//           off the bones) plants nowhere: it swings free toward its hang
//           point, gently — reaching, which is the honest read for a limb
//           with nothing in range. Weird poses are allowed; impossible ones
//           are not.
//
// WHO OWNS THE LIMBS: the stepper, whenever he is surfaced (`f.climb` — walls,
// roofs, crates, rubble: every structure, which is where feet used to float);
// and on OPEN GROUND when he is target-locked and strafing or back-pedalling
// (|drift| past `scuttleDrift`) — the crab side-scuttle, right limbs leading
// rightward, everything reversed backing up. Plain running on open ground
// stays the animator's, untouched. The hand-over is an eased activation, not
// a switch.
//
// Runs LAST, after the GLB retarget has synced (fighter.js calls postAnimate
// first), so it writes the bones a rigged model actually renders.
// ===========================================================================
// Each limb carries a SPLAY — its outboard direction in the body frame (x =
// right, z = forward), feet biased back and hands forward, spider-fashion.
// Homes are searched OUT along it first (see the ladder below).
const LIMBS = [
  { root: 'thighL', mid: 'kneeL', end: 'ankleL', foot: true, group: 0, splay: new THREE.Vector3(-1, 0, -0.4).normalize() },
  { root: 'thighR', mid: 'kneeR', end: 'ankleR', foot: true, group: 1, splay: new THREE.Vector3(1, 0, -0.4).normalize() },
  { root: 'shoulderL', mid: 'elbowL', end: 'handL', foot: false, group: 1, splay: new THREE.Vector3(-1, 0, 0.55).normalize() },
  { root: 'shoulderR', mid: 'elbowR', end: 'handR', foot: false, group: 0, splay: new THREE.Vector3(1, 0, 0.55).normalize() },
];
// the ladder: how far OUT along the splay each successive home search sits,
// x reach x step.spread. A wide surface (a building face) answers the first
// rung and the limb plants EXTENDED — stability through spread, and because
// the splay is symmetric the extensions even themselves out around the body.
// A narrow one (a pole) fails the outer rungs and the limb grips close, which
// is exactly the "inward is a last resort" order.
const SPLAY_LADDER = [1, 0.6, 0.28, 0];
const _splay = new THREE.Vector3();
const _tipT = new THREE.Vector3();
const _homeT = new THREE.Vector3();
const _fwdFallback = new THREE.Vector3();
const _travel = new THREE.Vector3();
// Below this much travel along the surface he is STANDING, and the limbs stop
// anticipating anything: homes sit under the body and a step is a comfort
// shift rather than a stride.
const MOVE_EPS = 1.2;
// How many limbs must stay on the surface at all times, for the spider. Two is
// enough — he is not a tripod, and holding out for three is what makes a limb
// whose plant has gone stale sit there vibrating instead of stepping. (The ape
// overrides it to one: see conformClimbLimbs.)
const MIN_SUPPORT = 2;
const _order = [0, 1, 2, 3];
// start priority: in-turn beats out-of-turn, urgent beats patient, and within
// that the limb furthest off its home goes first
function startRank(st, i, goGate, gateOf) {
  const s = st[i];
  if (!s.ok || !s.want || s.sw >= 0) return -1;
  const g = gateOf(LIMBS[i]);
  return (g < 0 || g === goGate ? 100 : 0) + (s.urgent ? 50 : 0) + Math.min(s.urge, 40);
}

// ===========================================================================
// THE APE (`climb.style: 'ape'` — KONGA). Same stepper, four rules changed,
// because a gorilla on a wall is not a spider on a wall:
//
//   HE HANGS FROM ONE ARM. The spider's diagonal trot needs a pair down at
//     all times; a brachiator needs ONE grip and the rest of him is cargo. So
//     the alternation gate is between the two ARMS only, and the legs gate
//     against nothing.
//   THE ARMS LEAD, AND THEY REACH UP. A hand's home is searched ahead along
//     the travel by a long lead and ABOVE the shoulder rather than below it
//     (`apeHang` is negative) — he grabs where he is going, high, and then
//     the body swings past the grip, which is the pull-through. It is the
//     same pinning the spider uses; what makes it read as a pull rather than
//     a step is that the hand goes up and forward and the body follows it.
//   THE FEET WANT A FLOOR. A foot only plants on a GROUND-ORIENTED surface
//     (`footCos` off world up — a ledge, a roof, the top of a crate); on a
//     sheer face there is nothing for a foot to stand on, so the legs simply
//     hang under him and the arms do the work. That one rule is most of the
//     difference between a gorilla and a gecko.
//   HE STANDS WHEN HE CAN. Falls out of the above for free: feet planted on
//     something flat with the body upright is exactly the condition
//     climbStep already hands back to ordinary walking.
// ===========================================================================
const APE = {
  lead: 0.34,        // seconds of travel a hand reaches ahead by (spider: 0.13)
  // HOW FAR THE HAND REACHES, and the two directions are NOT interchangeable.
  //   `hang` is toward the SURFACE (along the body's own down) and must stay
  //     positive: on a wall the body's up IS the outward normal, so a hand
  //     told to reach "up" reaches into open air and grabs nothing. Measured:
  //     at -0.35 both arms read airborne for the whole ascent — he went up a
  //     40-unit facade without ever touching it.
  //   `ahead` is along his TRAVEL, and that is where "reach high" actually
  //     lives: climbing, his forward IS up the face. Held even at a
  //     standstill, so a stopped ape still has his hands out in front rather
  //     than hanging at his sides.
  hang: 0.30,
  ahead: 0.34,       // x reach, along the body's forward
  spread: 0.34,      // arms come in narrower than a spider's starfish
  swing: 0.26,       // seconds per reach — a long deliberate arm swing
  lift: 0.42,        // and a high arc: the hand goes up and over to the grip
  len: 0.42,         // he lets a grip trail further behind before re-reaching
  footCos: 0.62,     // a foot needs a surface within ~52° of level to stand on
  legTuck: 0.55,     // otherwise the leg hangs this far under the hips, x reach
};

export function conformClimbLimbs(f, dt) {
  const S = C.step;
  const ape = f.def.climb?.style === 'ape';
  // who owns the limbs this frame?
  const groundSpd = Math.hypot(f.vel.x, f.vel.z);
  const scuttle = !f.climb && f.grounded && f.alive && f.state === 'normal' &&
    !f.isAI && f.lockTarget?.alive && groundSpd > 2 &&
    Math.abs(angleDiff(f.yaw, Math.atan2(f.vel.x, f.vel.z))) > C.scuttleDrift;
  const want = (f.climb || scuttle) ? 1 : 0;
  f._stepAct = f._stepAct === undefined ? 0
    : f._stepAct + (want - f._stepAct) * (1 - Math.exp(-S.rate * dt));
  if (f._stepAct < 0.02) { f._steps = null; return; }
  const act = f._stepAct;

  const st = f._steps || (f._steps = LIMBS.map(() => ({
    plant: new THREE.Vector3(), has: false, n: new THREE.Vector3(0, 1, 0),
    sw: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), tn: new THREE.Vector3(0, 1, 0),
    air: true,
    // the SMOOTHED home (the pre-filter that keeps a seam in the geometry from
    // reading as a step), the hang point when there is no home at all, and the
    // root position — read in the SURVEY pass and used in the STEP pass, which
    // is why they live here rather than in module scratch
    home: new THREE.Vector3(), homeHas: false, hang: new THREE.Vector3(),
    rootP: new THREE.Vector3(),
    hold: 0, reach: 1, err: 0, ok: false, want: false, urgent: false, urge: 0, go: false,
  })));

  const mech = f.mech;
  const bones = mech.boneMap || null;
  const node = (n) => (bones && bones[n]) || mech.joints?.[n] || null;
  f.group.updateWorldMatrix(true, true);
  const up = f.climbUp || UP;
  // WHICH WAY HE IS GOING, in the body's own frame — up the face when he is
  // climbing one. The ape's hands are thrown out along it (see APE.ahead).
  const fwd = f.climbFwd || _fwdFallback.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
  const sole = f.animator?.footDepth || 0.32 * f.scale;

  // WHO WAITS FOR WHOM. The spider gates on diagonal PAIRS (a trot); the ape
  // gates one arm against the other and lets the legs do as they like, because
  // a hanging body only needs the one grip.
  const gateOf = (L) => (ape ? (L.foot ? -1 : (L.splay.x < 0 ? 0 : 1)) : L.group);
  // ...and HOW MANY LIMBS MUST STAY DOWN. Two for a spider — he is not a
  // tripod, and holding out for three leaves a limb whose plant has gone stale
  // sitting there vibrating. ONE for the ape, because a brachiator's whole
  // design is that the rest of him is cargo hanging off a single grip.
  const minSupport = ape ? 1 : MIN_SUPPORT;

  // WHERE HE IS GOING, along the surface. Front and back limbs are decided
  // against this and nothing else, so one rule covers walking forwards, up,
  // sideways and backwards — reverse and the front limbs become the back ones
  // because the travel flipped, not because a case says so.
  _travel.copy(f.vel).addScaledVector(up, -f.vel.dot(up));
  const travelLen = _travel.length();
  const moving = travelLen > MOVE_EPS;
  if (moving) _travel.multiplyScalar(1 / travelLen); else _travel.set(0, 0, 0);
  const spd = f.vel.length();

  // ---- pass 1: SURVEY. Where does each limb want to be, and how badly? ----
  for (let i = 0; i < 4; i++) {
    const L = LIMBS[i], s0 = st[i];
    const root = node(L.root), mid = node(L.mid), end = node(L.end);
    s0.ok = false;
    s0.want = false;
    s0.urgent = false;
    s0.hold = Math.max(0, s0.hold - dt);
    if (!root || !mid || !end) continue;
    root.getWorldPosition(_root);
    mid.getWorldPosition(_mid);
    end.getWorldPosition(_end);
    s0.rootP.copy(_root);
    // FULL EXTENSION, measured live off this rig's own bones
    const reach = (_root.distanceTo(_mid) + _mid.distanceTo(_end)) * 0.96;
    s0.reach = reach;
    const stand = L.foot ? sole * 0.35 : 0.08;
    const armReach = ape && !L.foot;

    // FRONT OR BACK: is this limb's root ahead of the body along the travel?
    // (An ape's arms are always the reaching pair, so they skip the question.)
    const front = !armReach && moving && _a.subVectors(_root, f.pos).dot(_travel) > 0;

    // the limb's NORMAL SPOT: OUT along its splay, down along the body's down,
    // led by the travel. The search is a LADDER, outermost rung first — a limb
    // PREFERS to extend and plant wide (stability through spread; the
    // symmetric splay is also what evens the extensions out around the body),
    // and only walks the ladder inward when the outer rungs have no reachable
    // surface, which is the pole-hug case.
    //
    // THE LEAD IS THE ANTICIPATION, and it is what makes a front limb a front
    // limb: it aims at where the body will be `S.lead` seconds from now and
    // STRETCHES wider the faster he goes, so it is already out there when the
    // body arrives. A back limb takes almost none of it (`S.leadBack`) — it
    // just plants where it has been carried. Both are CLAMPED to a fraction of
    // reach; unclamped, ground pace pushed every home past full extension and
    // the whole stepper read airborne.
    //
    // THE APE reaches with his ARMS instead: further ahead, and toward the
    // surface rather than under the body. His legs keep the ordinary search
    // but only accept a floor (below).
    const leadSec = armReach ? APE.lead : (moving ? (front ? S.lead : S.leadBack) : 0);
    const hang = armReach ? APE.hang : S.hang;
    const spread = armReach ? APE.spread
      : S.spread * (1 + (front ? S.stretch : 0) * clamp01(spd / S.stretchAt));
    _splay.copy(L.splay).applyQuaternion(f.group.quaternion);
    _want.copy(f.vel).multiplyScalar(leadSec);
    if (armReach) _want.addScaledVector(fwd, reach * APE.ahead);
    const ldCap = reach * (armReach ? 0.55 : (front ? 0.62 : 0.2));
    const ldLen = _want.length();
    if (ldLen > ldCap) _want.multiplyScalar(ldCap / ldLen);
    let homeOk = false;
    // A HAND SEARCHES FROM THE SURFACE, NOT FROM A POINT IN SPACE. The
    // spider's ladder guesses a spot out along the limb's splay and asks what
    // is near it; that works when the limb is short next to the body, and
    // fails on an ape, whose shoulder sits a body's DEPTH off the wall he is
    // climbing (he is on his back to it — the body's up IS the outward
    // normal). Every guessed point then landed 4.9-5.3 units out on a
    // 5.0-unit arm and the grab quietly failed: measured, both hands read
    // airborne for most of a 49-unit ascent.
    //
    // So invert it. Find what is nearest the SHOULDER — that is the surface
    // he is on, at the only distance that is certainly reachable — then SLIDE
    // the grab along that face, in the plane of the face, toward where he is
    // going, by however much arm is left over. Reach is spent going somewhere
    // rather than on getting to the wall at all.
    if (armReach) {
      const d0 = nearestSurface(f, _root.x, _root.y, _root.z, reach * 1.1);
      if (d0 !== Infinity) {
        _homeT.copy(_limbCp);
        // the along-face part: ahead + out along the splay + the travel lead,
        // each flattened INTO the surface plane so the hand slides along the
        // face instead of drifting off it
        _tgt.set(0, 0, 0)
          .addScaledVector(fwd, reach * APE.ahead)
          .addScaledVector(_splay, reach * APE.spread)
          .add(_want);
        _tgt.addScaledVector(_limbN, -_tgt.dot(_limbN));
        _homeT.add(_tgt);
        // ...and never further than the arm goes
        _tgt.copy(_homeT).sub(_root);
        const hl = _tgt.length();
        if (hl > reach * 0.9) _homeT.copy(_root).addScaledVector(_tgt, (reach * 0.9) / hl);
        const d = nearestSurface(f, _homeT.x, _homeT.y, _homeT.z, reach);
        if (d !== Infinity) {
          _tgt.copy(_limbCp).addScaledVector(_limbN, stand);
          if (_tgt.distanceTo(_root) <= reach) {
            homeOk = true;
            s0.tn.copy(_limbN);
          }
        }
      }
    } else for (const rung of SPLAY_LADDER) {
      _homeT.copy(_root)
        .addScaledVector(_splay, reach * spread * rung)
        .addScaledVector(up, -reach * hang)
        .add(_want);
      // THE PROBE POINT MUST BE REACHABLE. Splay, drop and lead are three
      // offsets that can all point the same way — a wide stance plus a big
      // anticipation on a fast body put the probe past full extension, every
      // rung failed, and the limb read AIRBORNE while standing over perfectly
      // good ground (measured: both legs `A` through a full-speed backpedal).
      // Shortening the composed offset keeps the direction and asks the
      // question where the limb can actually answer it.
      _b.subVectors(_homeT, _root);
      const off = _b.length();
      if (off > reach * 0.95) _homeT.copy(_root).addScaledVector(_b, (reach * 0.95) / off);
      const d = nearestSurface(f, _homeT.x, _homeT.y, _homeT.z, reach * 1.25);
      if (d === Infinity) continue;
      // A GORILLA'S FOOT NEEDS A FLOOR. On a sheer face there is nothing to
      // stand on, so a leg that finds only wall reports no home and hangs —
      // which is what puts all the work on the arms and all the weight under
      // the grip. (The spider is unaffected: it plants on anything.)
      if (ape && L.foot && _limbN.y < APE.footCos) continue;
      _tgt.copy(_limbCp).addScaledVector(_limbN, stand);
      if (_tgt.distanceTo(_root) <= reach) {
        homeOk = true;
        s0.tn.copy(_limbN);
        break;
      }
    }
    // where a limb with nothing in range reaches toward: the last probe tried,
    // except an ape's UNPLANTED LEG, which does not reach for a wall it cannot
    // stand on — it hangs straight down under the hips, out of the way of the
    // arms that are carrying him
    if (ape && L.foot && !homeOk) _homeT.copy(_root).addScaledVector(UP, -reach * APE.legTuck);
    s0.hang.copy(_homeT);
    if (!homeOk) { s0.homeHas = false; continue; }
    s0.ok = true;
    // the home is DAMPED, not taken raw: the field it comes from steps from
    // block to block, and a target that jumps is a step that fires for no
    // reason the eye can see.
    if (!s0.homeHas) { s0.home.copy(_tgt); s0.homeHas = true; }
    else s0.home.lerp(_tgt, 1 - Math.exp(-S.homeRate * dt));

    if (s0.sw >= 0) continue;             // already swinging: nothing to want
    if (!s0.has) {
      // no plant yet — it wants one badly, but it still WAITS ITS TURN. This
      // was an emergency once, and since a limb loses its plant whenever its
      // home goes briefly out of range, that let all four swing at once: the
      // vibrating legs.
      s0.want = true; s0.err = Infinity; s0.urge = 90;
      continue;
    }
    s0.err = s0.plant.distanceTo(s0.home);
    // THE ONLY EMERGENCY (for the spider) is a plant the limb can no longer
    // physically reach. An err threshold used to sit here too, and since err
    // grows at body speed it fired constantly on a moving mech — an
    // "emergency" every third of a second is not an emergency, it is the
    // cadence, and it bypassed the pair gate every time. The APE's arms keep
    // theirs: with only one grip required, a hand that has fallen most of an
    // arm behind is genuinely out of position.
    s0.urgent = s0.plant.distanceTo(_root) > reach ||
      (armReach && s0.err > reach * 0.85);
    const thr = armReach ? APE.len : (moving ? (front ? S.len : S.lenBack) : S.settle);
    s0.want = s0.urgent || (s0.err > reach * thr && s0.hold <= 0);
    // WHO GOES FIRST: the limb furthest off its home, with a thumb on the
    // scale for the FRONT ones — walking somewhere, the near limb reaches for
    // the new ground and the trailing pair follows it.
    s0.urge = s0.err / reach + (front ? 0.6 : 0);
  }

  // ---- WHO LIFTS THIS FRAME ------------------------------------------------
  // Two rules, and the second one is the hard floor.
  //
  // THE RHYTHM: gated limbs alternate — diagonal pairs for the spider, one arm
  // against the other for the ape — so one side may start while the other is
  // planted. An ape's legs are ungated (`gate < 0`) and simply step when they
  // need to.
  //
  // THE SUPPORT FLOOR: `minSupport` limbs stay down. A limb may only lift if
  // that many others remain planted, and a limb that has no plant to give up
  // may always lift because it is holding nothing. A limb whose plant has gone
  // past what it can physically reach may jump the queue, but not this floor:
  // it drags until there is support to spare.
  const swinging = [false, false];
  let planted = 0;
  for (let i = 0; i < 4; i++) {
    const g = gateOf(LIMBS[i]);
    if (st[i].sw >= 0) { if (g >= 0) swinging[g] = true; }
    else if (st[i].has) planted++;
  }
  // an ape with NOTHING on the surface lets whichever hand is ready go, or he
  // would hang in the air waiting for a grip no one is allowed to take
  const gripped = ape && (st[2].has || st[3].has);
  let goGate = -1, best = -1;
  for (let i = 0; i < 4; i++) {
    const s0 = st[i], g = gateOf(LIMBS[i]);
    if (!s0.want || g < 0) continue;
    if (swinging[1 - g] && !s0.urgent && gripped) continue;
    if (s0.urge > best) { best = s0.urge; goGate = g; }
  }
  // most deserving first, so the limb that needs the ground gets the support
  // budget rather than whichever one the loop reached first
  for (let i = 0; i < 4; i++) _order[i] = i;
  for (let i = 1; i < 4; i++) {          // insertion sort: 4 items, no garbage
    const v = _order[i], k = startRank(st, v, goGate, gateOf);
    let j = i - 1;
    while (j >= 0 && startRank(st, _order[j], goGate, gateOf) < k) { _order[j + 1] = _order[j]; j--; }
    _order[j + 1] = v;
  }
  for (let n = 0; n < 4; n++) {
    const i = _order[n], s0 = st[i], g = gateOf(LIMBS[i]);
    s0.go = false;
    if (!s0.ok || !s0.want || s0.sw >= 0) continue;
    // ungated limbs (an ape's legs) answer to nobody; gated ones wait for
    // their turn unless they are out of reach, or unless nothing is gripped
    if (g >= 0 && g !== goGate && !s0.urgent && gripped) continue;
    if (s0.has) {                        // giving up a plant costs support
      if (planted - 1 < minSupport) continue;
      planted--;
    }
    s0.go = true;
  }

  // ---- pass 2: STEP, and write the limbs ----
  for (let i = 0; i < 4; i++) {
    const L = LIMBS[i], s0 = st[i];
    const root = node(L.root), mid = node(L.mid), end = node(L.end);
    if (!root || !mid || !end) continue;
    end.getWorldPosition(_end);
    const reach = s0.reach;
    const armReach = ape && !L.foot;

    let target = null, w = 0;
    if (!s0.ok) {
      // nothing in range of full extension: the limb hangs/reaches, gently —
      // the animation keeps most of it
      s0.has = false;
      s0.sw = -1;
      s0.air = true;
      target = s0.hang;
      w = act * S.airHold;
    } else {
      s0.air = false;
      if (s0.go) {
        s0.sw = 0;
        s0.from.copy(_end);
        s0.to.copy(s0.home);
      }
      if (s0.sw >= 0) {
        s0.to.copy(s0.home);              // chase the live home while swinging
        // a fast body needs a slightly faster cadence, but only slightly —
        // shortening the swing hard is what read as flickering legs
        const swT = (armReach ? APE.swing : S.time) * clamp(14 / Math.max(spd, 14), 0.6, 1);
        s0.sw += dt / swT;
        if (s0.sw >= 1) {
          s0.sw = -1;
          s0.has = true;
          s0.hold = S.dwell;
          s0.plant.copy(s0.to);
          s0.n.copy(s0.tn);
          target = s0.plant;
          w = act;
        } else {
          const k = s0.sw * s0.sw * (3 - 2 * s0.sw);
          // THE ARC. The spider lifts its foot over the ground it is crossing;
          // the APE throws his hand up and over to the next grip, which is a
          // taller arc taken in WORLD up — a reach is aimed at the sky, not at
          // whatever the body happens to be lying against.
          _want.lerpVectors(s0.from, s0.to, k).addScaledVector(
            armReach ? UP : up,
            Math.sin(Math.PI * k) * reach * (armReach ? APE.lift : S.lift));
          target = _want;
          w = act;
        }
      } else if (s0.has) {
        target = s0.plant;                // STANCE: pinned
        w = act;
      }
    }

    if (target && w > 0.02) {
      _tipT.lerpVectors(_end, target, w);
      reachTo(root, mid, end, _tipT);
      levelTip(end, s0.air ? up : (s0.sw >= 0 ? s0.tn : s0.n), w * (s0.air ? 0.3 : 1));
    }
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
  end.getWorldPosition(_end);
  _a.subVectors(_end, _root);
  _b.subVectors(target, _root);
  if (_a.lengthSq() < 1e-8 || _b.lengthSq() < 1e-8) return;
  _qC.setFromUnitVectors(_a.normalize(), _b.normalize());
  worldRotate(root, _qC);
  root.updateWorldMatrix(false, true);
}

// Turn the sole/palm onto the surface it is touching: the tip's own "down"
// (where a foot presses) rotated onto that surface's inward normal.
function levelTip(tip, n, w) {
  tip.getWorldQuaternion(_qA);
  _a.set(0, -1, 0).applyQuaternion(_qA);
  _b.copy(n).multiplyScalar(-1);
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
