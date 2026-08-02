// DON'T LET HIM SINK INTO THE FLOOR.
//
// TRITONE is a long, low, front-heavy body: a metre of armoured skull, three
// horns and a jaw hang off the front of a chassis that is already close to the
// ground. Every SHARED clip in the game drops the hips and pitches the torso
// forward by numbers authored against a HUMANOID, where the head is a small
// ball on top and the body has a metre of leg to spend. On him the same
// numbers put his face through the road. Measured with tools/groundprobe.mjs:
// the gore charge buried his jaw 3.4 units, the plunge landing his brow 4.0,
// the heavy toss 3.8 — and his own toes 2.2 on an ordinary gore.
//
// WHAT DOESN'T WORK, both tried and measured:
//   RE-AUTHOR EVERY CLIP — seventeen of his twenty offend, and the next shared
//     clip anyone adds will offend too. A treadmill, not a fix.
//   PITCH THE NECK BACK to lift the skull — the obvious targeted fix, and it
//     barely moves the number (3.4 -> 2.0 on the charge). Rotating the head
//     can only lift the jaw to as high as the NECK is, and on these clips the
//     whole body is down: the neck is under the floor too. You cannot fix a
//     buried body from the buried body's own joints.
//
// So lift the RENDERED model, and only when it is genuinely buried:
//
//   · THE MEASUREMENT IS THE REAL ONE. mech.lowestRenderedY() is the same
//     skin-aware sample the prone clamp uses (gltf.js) — the actual lowest
//     pixel of him, not a proxy joint. One number, one implementation, so the
//     two cannot drift.
//   · A CONTACT LIMB MAY DIG IN. A hand pressed on the ground or a hoof taking
//     weight belongs slightly under it; holding that to a hairline is what
//     makes a mech look like it is hovering. Nothing happens until he is
//     deeper than `allow`, so ordinary contact is untouched.
//   · IT IS VISUAL ONLY. mech.visualFloorLift moves the render container,
//     which is a CHILD of the physics group — so the fighter's position, his
//     collision, his grounding and the animator's per-foot placement are all
//     exactly as they were. Lifting the group itself would corrupt physics
//     (pos.y IS group.position.y) and make him accumulate height.
//   · IT IS A SERVO, NOT A JUMP. The correction is damped toward the error
//     each frame, and the error is re-measured through the lift, so it
//     converges and cannot overshoot; a clip that dips for three frames reads
//     as a body taking weight rather than a body teleporting.
//
// Opt in per mech with roster `floorGuard: true`. Off, this file does nothing.
import { clamp } from '../core/utils.js';

// How deep the mech may be before the guard reacts, as a fraction of his own
// scale — a contact limb's worth of give.
const ALLOW = 0.35;
const RATE = 20;       // how fast the lift servos (1/s) — fast enough to keep up with a
                       // slam, which is where the deepest dips happen
const MAX = 3.0;        // ...and the most it will ever lift, x scale

export function floorGuard(f, dt, floorY = 0) {
  const mech = f.mech;
  if (!mech?.lowestRenderedY || !mech.visualFloorLift) return 0;
  const scale = f.scale || mech.dims?.scale || 1;
  const lift = f._floorLift || 0;
  // measured THROUGH the lift already applied, which is what makes this a
  // feedback loop rather than an estimate
  const low = mech.lowestRenderedY();
  if (!Number.isFinite(low)) return lift;
  const want = lift + ((floorY - ALLOW * scale) - low);
  const target = clamp(Math.max(0, want), 0, MAX * scale);
  const next = lift + (target - lift) * (1 - Math.exp(-RATE * dt));
  f._floorLift = Math.abs(next) < 1e-4 ? 0 : next;
  mech.visualFloorLift(f._floorLift);
  return f._floorLift;
}

// Put the model back where the rig says it goes (leaving a state that lifted
// him — death, a finisher, the round ending — with no residue).
export function clearFloorGuard(f) {
  if (!f._floorLift) return;
  f._floorLift = 0;
  f.mech?.visualFloorLift?.(0);
}
