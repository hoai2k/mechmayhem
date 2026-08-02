// TRAVERSING CANNONS — a hull-mounted gun that aims itself.
//
// TRITONE's flank cannons are not held in a hand: they are two turrets bolted
// to the ribs, each on its own bone (rigs/tritone.rig.js cannonL/cannonR, with
// the muzzle anchors riding the barrels beyond them). So the shot is not aimed
// by turning the mech — a six-tonne quadruped cannot pivot — it is aimed by
// turning the GUNS, and the body only sets the rough line.
//
// Four rules, in order of how much they matter:
//
//  1. THE GUN LEADS THE TARGET. It traverses onto where the enemy WILL BE when
//     the blast arrives, not where they are — the flight time is solved against
//     the projectile speed and re-solved as the range closes (two iterations is
//     plenty; the third moves the point by less than the muzzle is wide).
//
//  2. IT TAKES TIME, AND IT ALWAYS FIRES. The trigger opens a WINDOW
//     (`aimWindup` seconds): the cannons swing at their own rate, and the
//     volley leaves the moment BOTH are on the line — or when the window runs
//     out, aimed as well as they managed. A gun that waits for a perfect
//     solution is a gun that never shoots.
//
//  3. IT CANNOT FIRE THROUGH ITS OWN BODY. Every direction is available to a
//     cannon EXCEPT the cone pointing inboard across the hull (`MIN_INWARD`
//     off the inward axis). An enemy out to the left is a direct shot for the
//     LEFT gun and an impossible one for the right — so the right gun does what
//     a real mount would: it goes UP AND OVER, riding the edge of its own
//     limit with the leftover angle traded for elevation. Two guns, two
//     genuinely different firing solutions, both of them legal.
//
//  4. NOTHING SNAPS. The traverse is a damped turn with a hard angular cap, so
//     a target crossing the nose sweeps the barrels across rather than
//     teleporting them, and a target that jumps behind him takes the long way
//     round the legal side.
//
// EVERYTHING IS MEASURED, NOTHING IS AUTHORED. Which way a barrel points at
// rest, which way is "outboard" for that gun, and where its muzzle sits are all
// read off the built body the first time it fires — so this works on the GLB
// (whose cannons point down the raw model's +X) and on the procedural build
// (whose cannon joints point down +Z) with no per-route numbers, and survives a
// rig edit that moves the pivots.
import * as THREE from 'three';

// The inboard cone a barrel may never enter, measured from the gun's own
// INWARD axis (the direction across the hull toward its twin). 80° leaves a
// gun aimed 10° past straight-ahead-and-inboard, which is the toe-in a pair of
// cannons wants when the target is dead in front, and refuses anything more.
const MIN_INWARD = 80 * Math.PI / 180;
// How hard a blocked solution is pushed UP rather than down or across. The
// nearest legal direction to "straight through the body" is ambiguous — every
// point on the cone rim is equally close — so bias it over the top: a gun
// firing over its own back reads as a gun working around an obstruction, one
// firing under the belly reads as a bug.
const UP_BIAS = 2.2;
const MAX_ELEV = 55 * Math.PI / 180;   // how far a barrel may look up...
const MIN_ELEV = -22 * Math.PI / 180;  // ...and down (it sits low already)
const TRAVERSE = 6.5;    // rad/s hard cap while aiming — fast, but a sweep
const TRAVERSE_K = 14;   // exponential damping toward the solution
const SETTLE = 2.2;      // rad/s cap on the drift back to rest between volleys
const ON_TARGET = 0.05;  // rad of error that counts as "aimed" — fire now

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();

// Measure the gun mount off the BUILT body, once. Returns null for any mech
// that has no cannon bones (every mech but tritone today) so callers can bail
// for free.
function measure(f) {
  if (f._cannonRig !== undefined) return f._cannonRig;
  const m = f.mech;
  const bone = (n) => m.rigBones?.[n] || m.joints?.[n] || null;
  const sides = [];
  for (const side of ['L', 'R']) {
    const b = bone('cannon' + side);
    const anchor = m.anchors?.['muzzle' + side];
    if (!b || !anchor) continue;
    b.updateWorldMatrix(true, false);
    anchor.updateWorldMatrix(true, false);
    // WHICH WAY THE BARREL POINTS AT REST, in the cannon bone's own local
    // frame: the muzzle's position seen from the bone. Read before we have
    // ever written a rotation, so it is the bind direction.
    const local = b.worldToLocal(anchor.getWorldPosition(new THREE.Vector3()));
    if (local.lengthSq() < 1e-9) continue;
    const restQuat = b.quaternion.clone();
    // ...expressed in the PARENT's frame, which is where the aim is solved
    // (the parent is the torso, so "up" and "outboard" mean something there).
    const rest = local.normalize().applyQuaternion(restQuat).normalize();
    // OUTBOARD for this gun: the flat part of its offset from the torso that
    // is not simply "forward". Derived, so it lands on +Z for the GLB rig and
    // -X for the procedural build without either being named here.
    const flat = new THREE.Vector3(rest.x, 0, rest.z);
    if (flat.lengthSq() < 1e-9) flat.set(0, 0, 1);
    flat.normalize();
    const out = new THREE.Vector3(b.position.x, 0, b.position.z);
    out.addScaledVector(flat, -out.dot(flat));
    if (out.lengthSq() < 1e-9) out.copy(flat).cross(_up);  // dead on the centreline
    out.normalize();
    sides.push({ side, bone: b, anchor, rest, restQuat, inward: out.clone().negate(), err: 0 });
  }
  f._cannonRig = sides.length === 2 ? sides : null;
  return f._cannonRig;
}

// Clamp a desired direction (PARENT frame, unit) into what this gun can
// physically reach: out of the inboard cone (up and over, rule 3) and inside
// the elevation limits. Mutates and returns `dir`.
function legalize(dir, inward) {
  // ELEVATION FIRST, because the cone comes second and must have the last
  // word. Doing it the other way round is a bug with a very specific
  // signature: the cone puts the barrel exactly on its 80° rim, the
  // elevation clamp then pulls the nose down and RE-NORMALISES the
  // horizontal part to compensate — which grows the inboard component and
  // walks the barrel back INTO the body. Measured at 77° on a rim that is
  // supposed to be 80°, i.e. a shot through his own flank.
  clampElev(dir);
  const di = dir.dot(inward);
  const c = Math.cos(MIN_INWARD);
  if (di <= c) return dir;
  const over = (di - c) / (1 - c);                // 0 at the rim, 1 dead inboard
  // The direction to swing toward, on the plane the rim is drawn in: what is
  // left of the desired aim once the inboard part is taken out, tilted UP in
  // proportion to how badly it was blocked (rule 3 — over the body, never
  // under it, and never an arbitrary way round).
  const perp = _v2.copy(dir).addScaledVector(inward, -di);
  if (perp.lengthSq() < 1e-8) perp.copy(_up);
  perp.normalize().addScaledVector(_up, UP_BIAS * over);
  perp.addScaledVector(inward, -perp.dot(inward));
  if (perp.lengthSq() < 1e-8) perp.copy(_up).addScaledVector(inward, -_up.dot(inward));
  perp.normalize();
  // `inward` is horizontal by construction, so the rim solution's height is
  // just sin(MIN_INWARD) x perp.y — which means the elevation limit can be
  // honoured by capping PERP, inside the cone solution, instead of clamping
  // the answer afterwards and undoing the cone.
  const s = Math.sin(MIN_INWARD);
  const yCap = Math.sin(MAX_ELEV) / s;
  if (perp.y > yCap) {
    const flat = Math.hypot(perp.x, perp.z) || 1;
    const want = Math.sqrt(Math.max(0, 1 - yCap * yCap));
    perp.set(perp.x / flat * want, yCap, perp.z / flat * want);
  }
  return dir.copy(inward).multiplyScalar(c).addScaledVector(perp, s).normalize();
}

// Hold a direction inside the mount's up/down travel, turning it in the
// vertical plane it is already in (so the bearing is never changed by a
// change of height).
function clampElev(dir) {
  const y = Math.max(Math.min(dir.y, Math.sin(MAX_ELEV)), Math.sin(MIN_ELEV));
  if (y === dir.y) return dir;
  const flat = Math.hypot(dir.x, dir.z) || 1;
  const want = Math.sqrt(Math.max(0, 1 - y * y));
  return dir.set(dir.x / flat * want, y, dir.z / flat * want).normalize();
}

// WHERE TO SHOOT: the point a blast leaving now would meet the enemy. Solved
// twice against the shell speed, so a target running across at speed is led
// rather than trailed. Falls back to a point down the mech's facing when there
// is nobody to shoot at, so the guns still look like guns.
export function cannonTarget(f, mv) {
  const e = f.nearestEnemy?.();
  const w = f.world;
  if (!e) {
    return new THREE.Vector3(
      f.pos.x + Math.sin(f.yaw) * 34, f.center().y, f.pos.z + Math.cos(f.yaw) * 34);
  }
  const p = e.center();
  const from = f.center();
  const speed = mv?.speed || 44;
  let t = 0;
  for (let i = 0; i < 2; i++) {
    const dx = w ? w.wrapDelta(p.x + e.vel.x * t - from.x) : p.x + e.vel.x * t - from.x;
    const dz = w ? w.wrapDelta(p.z + e.vel.z * t - from.z) : p.z + e.vel.z * t - from.z;
    const dy = p.y + e.vel.y * t - from.y;
    t = Math.sqrt(dx * dx + dy * dy + dz * dz) / speed;
  }
  // lead the horizontal run in full; only half the vertical, since a jumping
  // target is on a parabola and extrapolating it straight aims at the sky
  return new THREE.Vector3(
    p.x + e.vel.x * t, p.y + e.vel.y * t * 0.5, p.z + e.vel.z * t);
}

// ONE FRAME of the traverse. `aiming` false lets the guns drift home. Returns
// the worst aim error across the pair, in radians (Infinity with no cannons),
// which is what the fire decision reads.
export function aimCannons(f, dt, aiming, mv) {
  const rig = measure(f);
  if (!rig) return Infinity;
  const target = aiming ? cannonTarget(f, mv) : null;
  let worst = 0;
  for (const c of rig) {
    const b = c.bone;
    const parent = b.parent;
    if (aiming && parent) {
      parent.updateWorldMatrix(true, false);
      parent.getWorldQuaternion(_pq).invert();
      b.updateWorldMatrix(true, false);
      // the aim runs from the MUZZLE, not the pivot: at this range the two are
      // a barrel's length apart and the difference is a real miss up close
      const from = c.anchor.getWorldPosition(_v2);
      _v.copy(target).sub(from);
      if (f.world) { _v.x = f.world.wrapDelta(_v.x); _v.z = f.world.wrapDelta(_v.z); }
      if (_v.lengthSq() < 1e-8) _v.set(0, 0, 1);
      _v.normalize().applyQuaternion(_pq).normalize();     // -> parent frame
      legalize(_v, c.inward);
      _q.setFromUnitVectors(c.rest, _v).multiply(c.restQuat);
      c.err = b.quaternion.angleTo(_q);
      // damped, then capped: eases onto the line but can never snap onto it
      const step = Math.min(c.err * (1 - Math.exp(-TRAVERSE_K * dt)), TRAVERSE * dt);
      b.quaternion.rotateTowards(_q, step);
    } else {
      c.err = b.quaternion.angleTo(c.restQuat);
      b.quaternion.rotateTowards(c.restQuat, Math.min(c.err * (1 - Math.exp(-6 * dt)), SETTLE * dt));
    }
    worst = Math.max(worst, c.err);
  }
  return worst;
}

// The recoil buck, applied to both guns on the volley: a short kick UP off the
// aim line that the next frame's traverse immediately starts pulling back.
export function cannonRecoil(f, amount = 0.18) {
  const rig = measure(f);
  if (!rig) return;
  for (const c of rig) {
    c.bone.quaternion.multiply(_q2.setFromAxisAngle(pitchAxis(c), amount));
  }
}

// The axis a barrel pitches about, in its OWN local frame: perpendicular to
// both the rest barrel direction and up, so a kick is always "nose up"
// whichever way the model's bones happen to be laid out. (rest x up turns the
// barrel toward up; the same axis pulled back into bone space by the rest
// rotation is what a local post-multiply wants.)
const _ax = new THREE.Vector3();
function pitchAxis(c) {
  _ax.copy(c.rest).cross(_up);
  if (_ax.lengthSq() < 1e-8) _ax.set(1, 0, 0);
  return _ax.normalize().applyQuaternion(_q.copy(c.restQuat).invert()).normalize();
}

// DRIVE THE BARRELS BY HAND, ignoring the aim solver entirely: each gun is
// pitched `angle` radians nose-UP from its own rest line, in its own frame. No
// damping, no limits and no legality check — this is not aiming, it is
// CHOREOGRAPHY (TRITONE's SIEGE PROTOCOL sweeps the two mounts through a full
// half-turn in opposite phase to hose energy at the sky), and clamping a
// deliberate 180° sweep into the ±55° firing envelope would just flatten it.
// The caller owns the barrels for as long as it keeps calling this — the
// moment it stops, the ordinary traverse pulls them home.
//
// Returns the pair (side/bone/anchor) so a caller can spawn from the muzzle it
// just moved, or null on a mech with no cannons.
export function driveCannons(f, angleL, angleR) {
  const rig = measure(f);
  if (!rig) return null;
  for (const c of rig) {
    const a = c.side === 'L' ? angleL : angleR;
    c.bone.quaternion.copy(c.restQuat).multiply(_q2.setFromAxisAngle(pitchAxis(c), a));
    c.err = 0;
  }
  return rig;
}

// Is this mech a traversing-cannon mech at all? (Cheap, cached.)
export function hasCannons(f) {
  return !!measure(f);
}

export { ON_TARGET };
