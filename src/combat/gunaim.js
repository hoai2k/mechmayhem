// POINT THE GUN AT WHAT YOU ARE SHOOTING AT.
//
// A muzzle anchor riding a HAND (nullbot's bolt casters, viper, vulcan) inherits
// whatever the animation is doing with that arm, and the gait's counter-swing is
// not an aiming system: measured firing while strafing, the barrels were 75-86°
// off the mech's own facing. There are two honest answers to that and only one
// of them looks right.
//
//   IGNORE THE BARREL and fire along the aim. Correct, and free — but then the
//     round leaves a gun that is visibly pointing somewhere else.
//   AIM THE ARM, so the barrel IS on the target and the round can follow it out
//     of the muzzle. That is this file.
//
// THE SOLVE IS ONE RIGID ROTATION. Turning the SHOULDER carries the whole arm —
// forearm, hand, and the anchor hanging off it — so the rotation that maps the
// barrel's current world direction onto the wanted one, applied at the shoulder,
// lands the barrel exactly on the aim. No IK, no chain, nothing to converge: one
// quaternion, exact in a single frame (measured: a 0.35 rad turn at the shoulder
// moves the barrel 0.35 rad, on every rig).
//
// IT MUST RUN AFTER THE RETARGET, AND SYNC AGAIN AFTER ITSELF. A muzzle anchor
// hangs off whatever the manifest names: a VIRTUAL joint on some mechs
// (nullbot), a MODEL bone on others (viper's elbow, vulcan's hands). A model
// bone only follows the virtual rig through `mech.postAnimate()`, so a servo
// running before it measures the barrel as it was LAST frame while writing a
// correction into a pose that has since been reset by applyPose — the two
// disagree and it never converges (measured on viper: 55-79° off, oscillating,
// while nullbot's virtual-chain anchor sat at 0). So: sync, measure, solve,
// sync again. One extra retarget pass on the frames a gun is up.
//
// WHAT IT AIMS AT: the crosshair while targeting (aim.js `_lockAim`), and
// otherwise straight out along the mech's own facing — "forward from the
// shoulder", which is what an unaimed shot has always claimed to do.
//
// IT IS WEIGHTED AND CLAMPED. The weight ramps in over the shot and back out
// after (a gun that snaps onto the target the instant the trigger goes reads as
// a turret, not an arm), and the rotation is capped at `MAX_TURN` so a target
// behind him swings the arm as far as a shoulder plausibly goes and no further.
// Whatever is left over is the residual the shot inherits — world.js bounds that
// too, so a solve that cannot reach can never throw a round wildly wide.
//
// WHO IS EXCLUDED, and both exclusions are the same rule from the other side:
// a mount that does not animate (`aimFlat` hull guns — cranky, jerry, frogger,
// whose splay IS the design) and one that animates ITSELF (tritone's traversing
// cannons, combat/cannonaim.js). This is for guns held in a hand.
import * as THREE from 'three';

const _have = new THREE.Vector3();
const _want = new THREE.Vector3();
const _mp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qW = new THREE.Quaternion();
const _qP = new THREE.Quaternion();

const MAX_TURN = 1.4;      // rad the shoulder may be turned off the clip's pose
const RAMP_IN = 22;        // weight rise, 1/s — the arm is there before the round is
const RAMP_OUT = 6;        // ...and the release, which is slower on purpose
const HOLD = 0.45;         // seconds the aim is held after a shot leaves

// The muzzle this mech is about to fire from. Mirrors world.js fireRanged's own
// pick — the side stamps (`_shotSide`, `_fistSide`) are what a twin-armed mech
// sets per SHOT, so the arm that gets aimed is the arm that fires.
export function firingMuzzle(f) {
  const a = f.mech?.anchors;
  if (!a) return null;
  const left = (f._fistSide === 'L') || (!!f._shotSide && !!a.muzzleL) || (!!f.def.channelClipL && !!f._shotSide);
  if (left && a.muzzleL) return { anchor: a.muzzleL, side: 'L' };
  const name = f.def.primaryMuzzle || 'muzzleR';
  const anchor = a[name] || a.muzzleR;
  if (!anchor) return null;
  // which arm it hangs off: the anchor name is the only honest clue on a rig
  // whose bones are named `bone_28`, and every muzzle in the manifest is
  // authored as an R/L pair
  return { anchor, side: name.endsWith('L') ? 'L' : 'R' };
}

// Is this a gun an ARM is holding? A hull mount is bolted on and a traversing
// cannon aims itself; only a hand can be pointed by posing the body.
export function armMounted(f, anchor) {
  return !!anchor && !anchor.userData?.aimFlat && !f.def?.cannons;
}

/** Ramp the aim weight and, while it is up, turn the firing arm onto the aim. */
export function aimGun(f, dt) {
  // HELD ON THE TARGET, NOT SNAPPED ONTO IT AT THE TRIGGER. While the crosshair
  // is up the gun is trained on it continuously — which is what a robot aiming
  // looks like, and it is also the only way the barrel is ON the aim by the time
  // the round leaves: a shot goes about 0.1s after the trigger, and a servo that
  // starts from the clip pose at the trigger is still swinging when it fires
  // (measured: 45° off at the shot, against ~1° held).
  // …and HOLDING THE TRIGGER counts as aiming, which is the game's own
  // convention for the bumper (hold RB to aim, release to fire). Without it the
  // first round of a cold burst leaves before the arm arrives — measured, 30°
  // off on vulcan's opening shot against 2.8° on the second.
  const firing = f._gunAimT > 0 || f.state === 'channel' || f.aiming
    || (!f.isAI && f.intent.rangedHeld);
  const want = firing && f.alive && !f.controlsLocked ? 1 : 0;
  const rate = want ? RAMP_IN : RAMP_OUT;
  f._gunAimW = (f._gunAimW || 0) + (want - (f._gunAimW || 0)) * (1 - Math.exp(-rate * dt));
  if (f._gunAimT > 0) f._gunAimT -= dt;
  // AN UNAIMED BARREL IS NEVER TRUSTED. Every early-out leaves the residual at
  // "no idea" rather than at zero, because world.js reads it as permission to
  // let the barrel steer the shot: with 0 here, the very first round of a cold
  // burst followed a gatling that had not been pointed at anything yet
  // (measured 31° off on vulcan's opening shot, 2.7° on the second).
  if ((f._gunAimW || 0) < 0.01) { f._gunAimW = 0; f._gunAimErr = Math.PI; return; }

  // BOTH ARMS, when both hold a gun. Which muzzle fires is decided per SHOT
  // (`_shotSide` alternates a twin-gunner's barrels, and it flips between this
  // servo running and the round leaving), so aiming "the firing arm" aimed the
  // LAST shot's arm and half of vulcan's burst left an un-pointed gatling —
  // measured 63° off. Two solves, and a robot holding two guns trains both of
  // them on the target, which is what it should have looked like anyway.
  const arms = [];
  for (const name of ['muzzleR', 'muzzleL']) {
    const anchor = f.mech.anchors?.[name];
    const J = f.mech.joints['shoulder' + name.slice(-1)];
    if (anchor && J && armMounted(f, anchor)) arms.push({ anchor, J });
  }
  if (!arms.length) { f._gunAimErr = Math.PI; return; }
  let worst = 0;
  for (const arm of arms) worst = Math.max(worst, aimOneArm(f, arm.anchor, arm.J));
  // push the correction onto the model's own bones (see the note above)
  if (f.mech.isGLB) f.mech.postAnimate?.();
  f._gunAimErr = worst;
}

// One arm onto the aim; returns what it could not cover (rad).
function aimOneArm(f, anchor, J) {
  const m = { anchor };
  // where the barrel points now, and where it should
  m.anchor.updateWorldMatrix(true, false);
  m.anchor.getWorldQuaternion(_qW);
  _have.set(0, 0, 1).applyQuaternion(_qW).normalize();
  m.anchor.getWorldPosition(_mp);
  if (f._lockAim) {
    _want.copy(f._lockAim).sub(_mp);
    // through the arena seam, like every other aim in the game
    _want.x = f.world.wrapDelta(_want.x);
    _want.z = f.world.wrapDelta(_want.z);
  } else {
    _want.set(Math.sin(f.yaw), 0.02, Math.cos(f.yaw));
  }
  if (_want.lengthSq() < 1e-6) return Math.PI;
  _want.normalize();

  // ---- the rotation that maps one onto the other, clamped and weighted ----
  _q.setFromUnitVectors(_have, _want);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
  if (ang < 0.002) return ang;
  const k = Math.min(1, MAX_TURN / Math.max(ang, 1e-6)) * f._gunAimW;
  if (k < 0.999) _q.slerp(_IDENT, 1 - k);
  J.getWorldQuaternion(_qW);
  J.parent?.getWorldQuaternion(_qP);
  _qW.premultiply(_q);
  J.quaternion.copy(_qP.invert()).multiply(_qW);
  J.updateWorldMatrix(false, true);
  // what the turn could not cover (the clamp, and the weight while it ramps) —
  // telemetry for the probes, and the reason world.js bounds an arm-held
  // barrel's say in where the shot goes
  return ang * (1 - k);
}

const _IDENT = new THREE.Quaternion();
