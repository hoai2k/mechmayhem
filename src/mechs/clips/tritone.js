// TRITONE's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// GORE CHARGE loop (replaces chargeLean): head low and LEVEL, horns out front,
// shoulders driving. The sway is in the shoulders and the neck, not the hips —
// a body this long does not roll, it swings its head.
export const TRITONE_CHARGE = {
  dur: 0.5, loop: true,
  keys: [
    { t: 0, pose: { hipsPos: [0, -0.08, 0], hipsRot: [3, 0, 0], torso: [8, 3, -3], head: [-10, -4, 0], shoulderL: [16, 0, -12], shoulderR: [16, 0, 12], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0], thighL: [-6, 0, -4], thighR: [-6, 0, 4], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
    { t: 0.25, ease: 'inOutQuad', pose: { hipsPos: [0, -0.11, 0], torso: [10, -3, 3], head: [-12, 4, 0], shoulderL: [12, 0, -14], shoulderR: [20, 0, 10] } },
    { t: 0.5, ease: 'inOutQuad', pose: { hipsPos: [0, -0.08, 0], torso: [8, 3, -3], head: [-10, -4, 0], shoulderL: [16, 0, -12], shoulderR: [16, 0, 12] } },
  ],
};

// THE SLAM (replaces the shared overhead smash AND the plunge landing): he
// rears, then drives the whole skull down. The wind-up is a rear — front end
// up, chin up, weight back over the hips — and the strike is a neck-driven
// drop that stops with the horns at the deck rather than through it.
export const TRITONE_SLAM = {
  dur: 0.98,
  keys: [
    { t: 0, pose: {} },
    // REAR: front end climbs, head goes up and back, hind legs take the load
    // A REAR LIFTS THE FRONT END, not the whole animal. Raising the hips while
    // BENDING the hind knees takes his back feet off the floor with him —
    // measured as the body hovering a unit clear for the whole plunge. The
    // hind legs straighten instead and stay planted; what climbs is the chest,
    // on the front legs coming up.
    { t: 0.34, ease: 'inOutCubic', pose: { hipsPos: [0, 0.04, -0.06], hipsRot: [-10, 0, 0], torso: [-16, 0, 0], head: [26, 0, 0], shoulderL: [-54, 0, -16], shoulderR: [-54, 0, 16], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], thighL: [-4, 0, -4], thighR: [-4, 0, 4], kneeL: [4, 0, 0], kneeR: [4, 0, 0], ankleL: [-4, 0, 0], ankleR: [-4, 0, 0] } },
    // DRIVE: the whole front end comes down on the horns
    { t: 0.52, ease: 'inCubic', pose: { hipsPos: [0, -0.04, 0.12], hipsRot: [9, 0, 0], torso: [12, 0, 0], head: [-14, 0, 0], shoulderL: [18, 0, -8], shoulderR: [18, 0, 8], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], thighL: [-8, 0, -4], thighR: [-8, 0, 4], kneeL: [12, 0, 0], kneeR: [12, 0, 0], ankleL: [-6, 0, 0], ankleR: [-6, 0, 0] } },
    { t: 0.7, ease: 'outQuad', pose: { hipsPos: [0, -0.03, 0.08], hipsRot: [6, 0, 0], torso: [9, 0, 0], head: [-8, 0, 0] } },
    { t: 0.98, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.46, type: 'sfx', arg: 'whooshBig' }, { t: 0.52, type: 'hit', arg: 0 }, { t: 0.54, type: 'shake', arg: 0.5 }],
};

// LANDING, on four columns. A quadruped spreads a landing across all four
// legs and keeps its head UP through it — nothing about the impact should
// send the skull toward the ground it just hit.
export const TRITONE_LAND_STRETCH = { hipsPos: [0, 0.08, 0], hipsRot: [-4, 0, 0], torso: [-4, 0, 0], head: [8, 0, 0], thighL: [-8, 0, -3], thighR: [-8, 0, 3], kneeL: [10, 0, 0], kneeR: [10, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0], shoulderL: [-16, 0, -14], shoulderR: [-16, 0, 14], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0] };

export const TRITONE_LAND = {
  dur: 0.62,
  keys: [
    { t: 0, pose: TRITONE_LAND_STRETCH },
    { t: 0.1, ease: 'outCubic', pose: { hipsPos: [0, -0.12, 0.02], hipsRot: [2, 0, 0], torso: [7, 0, 0], head: [4, 0, 0], thighL: [-16, 0, -4], thighR: [-16, 0, 4], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-16, 0, 0], ankleR: [-16, 0, 0], shoulderL: [14, 0, -12], shoulderR: [14, 0, 12], elbowL: [-16, 0, 0], elbowR: [-16, 0, 0] } },
    { t: 0.22, ease: 'outQuad', pose: { hipsPos: [0, -0.07, 0.02], torso: [4, 0, 0], head: [2, 0, 0], thighL: [-10, 0, -4], thighR: [-10, 0, 4], kneeL: [20, 0, 0], kneeR: [20, 0, 0], ankleL: [-10, 0, 0], ankleR: [-10, 0, 0] } },
    { t: 0.62, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.02, type: 'sfx', arg: 'land' }],
};

export const TRITONE_LAND_REACH = {
  dur: 0.2, hold: true,
  keys: [{ t: 0, pose: {} }, { t: 0.2, ease: 'outQuad', pose: TRITONE_LAND_STRETCH }],
};

// TAUNT: he has no arm to wave. TRITONE — he REARS. An elephant, not a horse: up onto the hind legs, held
// there at the top for a beat while the whole front of him hangs in the air,
// then dropped so the forefeet SMASH back into the pavement.
//
// HIS FACE DOES NOT MOVE. No head, no frill, no jaw in any key — the skull is a
// third of his silhouette and swinging it about turned the rear into a shake.
// He is additive over restPose, so leaving those joints unnamed leaves them
// exactly in his carriage and lets the body carry them up and down.
//
// HIS BACK LEGS STAY ON THE GROUND, AND STRAIGHT, and that is what the thigh
// keys are for. A thigh is a CHILD of the hips: pitch the hips back 48 degrees
// to rear him and the hind legs are carried back 48 degrees with them, so the
// feet leave the pavement and swing out behind him like a deckchair. Every key
// below gives the thighs back EXACTLY the hips' own pitch (`+48` against
// `hipsRot -48`), which leaves the hind legs standing where they stood while
// the body rotates about them, with the knees and ankles at rest because a
// straight leg is a leg with nothing added to it. The hips barely rise: a rear
// gets its height from the body PITCHING about the hip joint, not from the hip
// joint going up — his head climbs about 4 units on the pitch alone.
//
// AND THE TAIL GETS OUT OF THE WAY BY ITSELF. It is nine units long and hangs
// off the same hips, so the same rotation drove it several units under the
// pavement, where the floor guard (combat/floorguard.js) obediently servoed the
// whole animal up into the air — the "propped up on his own tail" read. It is
// not fixed here, because a keyed angle would be wrong the moment the timing
// changed: `tailFloor` in his rig turns on animator.js' tailFloorGuard, which
// re-aims any tail segment that would point below the FEET.
export const TRITONE_TAUNT = {
  dur: 2.4, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // gather — weight back onto the hinds before anything leaves the ground
    { t: 0.22, ease: 'outQuad', pose: { hipsPos: [0, -0.18, -0.2], hipsRot: [6, 0, 0],
      thighL: [16, 0, 0], thighR: [16, 0, 0], kneeL: [12, 0, 0], kneeR: [12, 0, 0],
      shoulderL: [16, 0, -4], shoulderR: [16, 0, 4], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0] } },
    // UP. The pitch is the whole rear; the thighs give it straight back so the
    // hind feet stay planted underneath him.
    { t: 0.62, ease: 'outCubic', pose: { hipsPos: [0, 0.02, 0.04], hipsRot: [-42, 0, 0],
      thighL: [42, 0, 0], thighR: [42, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      shoulderL: [-58, 0, -12], shoulderR: [-58, 0, 12], elbowL: [-64, 0, 0], elbowR: [-64, 0, 0] } },
    // …higher still, and HELD: the pause at the top is the whole gesture
    { t: 0.92, ease: 'outQuad', pose: { hipsPos: [0, 0.03, 0.05], hipsRot: [-56, 0, 0],
      thighL: [56, 0, 0], thighR: [56, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      shoulderL: [-70, 0, -16], shoulderR: [-70, 0, 16], elbowL: [-52, 0, 0], elbowR: [-52, 0, 0] } },
    { t: 1.42, ease: 'linear', pose: { hipsPos: [0, 0.03, 0.05], hipsRot: [-55, 0, 0],
      thighL: [55, 0, 0], thighR: [55, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      shoulderL: [-68, 0, -16], shoulderR: [-68, 0, 16], elbowL: [-54, 0, 0], elbowR: [-54, 0, 0] } },
    // and DOWN, hard
    { t: 1.62, ease: 'inQuad', pose: { hipsPos: [0, -0.3, -0.1], hipsRot: [10, 0, 0],
      thighL: [-10, 0, 0], thighR: [-10, 0, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0],
      ankleL: [-6, 0, 0], ankleR: [-6, 0, 0],
      shoulderL: [10, 0, -2], shoulderR: [10, 0, 2], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0] } },
    { t: 1.82, ease: 'outQuad', pose: { hipsPos: [0, 0.06, 0], hipsRot: [-3, 0, 0],
      thighL: [3, 0, 0], thighR: [3, 0, 0], kneeL: [4, 0, 0], kneeR: [4, 0, 0] } },
    { t: 2.4, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0],
      thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
  ],
  events: [{ t: 0.62, type: 'sfx', arg: 'taunt' },
    { t: 1.62, type: 'sfx', arg: 'slam' }, { t: 1.63, type: 'shake', arg: 0.55 }],
};
