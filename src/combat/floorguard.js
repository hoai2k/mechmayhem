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

// How deep he may be before the guard reacts, as a fraction of his own scale,
// and it is TWO numbers because the parts are not equivalent. A hand pressed
// on the floor or a hoof taking weight belongs slightly under it — holding
// that to a hairline is what makes a body look like it is hovering. A CHIN
// does not: a skull through the pavement is a bug at a fraction of the depth
// a palm is fine at. gltf.js already classifies the mesh (core vs limb vs
// tail) for the prone clamp, so the guard reads the same split rather than
// inventing a second one.
// THE FLOOR IS OPAQUE, AND THAT IS THE WHOLE ARGUMENT FOR THIS NUMBER BEING
// BIG. A limb under the road cannot be seen; a body hoisted off the road can be
// seen from anywhere in the arena. Tritone's ordinary WALK CYCLE puts a paw
// 1.25 units (1.1 x scale) under — his legs are calibrated for a humanoid
// stride — so a tight limb rule had the guard lifting him ~0.9 for the whole
// walk, correcting an invisible problem with a visible one. That is the
// reported floating. It stays as a backstop for a limb that is genuinely
// through the floor rather than merely below it.
const ALLOW = 1.3;          // limbs, and anything else that grips the world
const ALLOW_CORE = 0.06;    // torso, head — the silhouette
// ...and the TAIL, which is the loosest of the three and has to be. It hangs
// LOW by construction — an armoured tail that trails near the deck is what
// the animal looks like — so asking it to clear the floor lifts the whole
// body by however far it droops: measured, tightening this to 0.26 left
// tritone hovering 2.3 units off the ground for an entire plunge landing,
// which is a worse artifact than the one it was fixing. A drag is fine. Only
// a tail genuinely buried past its own thickness is not.
const ALLOW_TAIL = 0.6;
const RATE = 20;       // how fast the lift servos (1/s) — fast enough to keep up with a
                       // slam, which is where the deepest dips happen
const MAX = 3.0;        // ...and the most it will ever lift, x scale

export function floorGuard(f, dt, floorY = 0) {
  const mech = f.mech;
  if (!mech?.lowestRenderedY || !mech.visualFloorLift) return 0;
  const scale = f.scale || mech.dims?.scale || 1;
  const lift = f._floorLift || 0;
  // MEASURE THE UNLIFTED BODY, and make the target an ABSOLUTE function of the
  // pose — the same shape as the prone clamp next door (gltf.js groundClamp),
  // and for the same reason.
  //
  // It used to add each frame's error to the lift it was already holding, on
  // the assumption that `lowestRenderedY` reports the body as CORRECTED. It
  // does not, reliably: a SkinnedMesh in AttachedBindMode carries the container
  // offset in its bone matrices AND in the `bindMatrixInverse` that cancels
  // them, so whether the lift shows up in the measurement depends on which of
  // the two was refreshed last — i.e. on whether a render has happened since.
  // Inside the guard it had not, so the guard read the body as though it were
  // holding nothing: "still 1.5 under", every frame, on top of a lift that was
  // already 3.4. A servo with no feedback is an integrator, and it pinned at
  // MAX — measured on a WALKING tritone, held 3.43 up with his lowest vertex
  // 1.9 ABOVE the road. That is the reported floating.
  //
  // Measuring at zero removes the question: the reading is of the pose alone,
  // the target is how deep that pose is, and the servo only smooths the way
  // there. The lift is re-applied below, before anything renders.
  mech.visualFloorLift(0);
  const m = mech.lowestRenderedY(true);
  const low = typeof m === 'number' ? m : m.minY;
  const core = typeof m === 'number' ? Infinity : m.minCore;
  const tail = typeof m === 'number' ? Infinity : m.minTail;
  if (!Number.isFinite(low)) { mech.visualFloorLift(lift); return lift; }
  // whichever rule is being broken worse
  const need = Math.max(
    (floorY - ALLOW * scale) - low,
    Number.isFinite(core) ? (floorY - ALLOW_CORE * scale) - core : -Infinity,
    Number.isFinite(tail) ? (floorY - ALLOW_TAIL * scale) - tail : -Infinity
  );
  const target = clamp(Math.max(0, need), 0, MAX * scale);
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
