// FROGGER's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// frogger for the GLB: the shared `shoot` throws the RIGHT arm out and up as
// if the gun were in the hand, but this model's gunk cannons are hull mounts
// (the manifest pins muzzleR/muzzleL to cannon BONES, nowhere near the hands),
// so raising an arm just waves an empty fist through the shot line. Same
// duration and the same `fire` event time — only the body sells it now: a
// twist onto the firing side, then a hard recoil kick back through torso and
// hips. Arms are left untouched so the combat carriage holds. shootL is the
// mirror, for the alternating other cannon (fighter.doRanged picks the side).
export const FROGGER_SHOOT_GLB = {
  // THE CANNONS DO THE AIMING, SO THE CLIP MUST NOT — jerry's rule, and frogger
  // needs it for the same reason: his gunk guns are HULL mounts (the manifest
  // pins muzzleR to a head-block bone and muzzleL to a hull bone), and
  // world.js fires each shot down its own barrel's live +Z (barrelDeflect). So
  // every degree the clip YAWS the torso or the head is a degree the shot flies
  // wide, faithfully.
  //
  // It used to yaw the torso -10 and the head +7, mirrored on the off side —
  // which alternated the whole hull left-right-left as he fired and threw the
  // globs 5-7 degrees either side of the target, shot about shot. Measured on
  // the barrels: 0.0 deg of yaw at rest, -4.4 to -7.0 through the clip. It is a
  // PITCH-ONLY recoil now: the body sinks and rocks back over the shot, the
  // barrels stay on the line, and the measured yaw is 0.0 all the way through.
  // AND THE RECOIL COMES AFTER THE SHOT, not under it. The rock-back used to
  // peak right where the `fire` event sits, so the glob left a barrel already
  // pitched 6.5 degrees up — a shot that sails over an enemy's head at a dozen
  // units. The body is held level through the fire frame (measured 0.9 deg, the
  // barrel's own rest angle) and rocks afterwards, which is also the way round
  // a recoil actually reads.
  dur: 0.5, upper: true,
  keys: [
    { t: 0, pose: { torso: [0, 0, 0], head: [0, 0, 0] } },
    { t: 0.08, ease: 'linear', pose: { torso: [0, 0, 0], head: [0, 0, 0] } },
    { t: 0.2, ease: 'outBack', pose: { torso: [-8, 0, 0], head: [-6, 0, 0], hipsPos: [0, -0.09, 0] } },
    { t: 0.36, ease: 'outQuad', pose: { torso: [6, 0, 0], head: [2, 0, 0], hipsPos: [0, -0.02, 0] } },
    { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0] } },
  ],
  events: [{ t: 0.06, type: 'fire' }],
};

// FROGGER — arms and cannons thrown out into an X, then a deep bounce: all the
// way down onto folded knees and all the way back up onto straight ones. The
// legs are additive over a restPose that already stands him in a 55° crouch,
// so the DOWN keys add fold and the UP keys subtract it.
export const FROGGER_TAUNT = {
  // FROGGER — arms and cannons thrown out into an X, then a deep bounce between
  // a full crouch and full height.
  //
  // THE CROUCH IS A REAL ONE. The first pass folded the knees about 40 percent
  // of the way and read as a bob rather than a squat, which on a FROG is the
  // whole gag. These are the duck layer's own numbers (animator.js: thigh 60
  // degrees forward of vertical, knee folded 115, ankle levelling the foot at
  // -54) — additive over a restPose that already stands him in a 55-degree
  // crouch, so the DOWN key is the deepest squat this body has. The hip drop is
  // the one the duck layer DERIVES from that fold rather than a guess: 1.60
  // world units on this rig, less the 0.21 the measurement says this pose does not
  // need (1.24 authored — clip hipsPos is scaled by the model, animator.js).
  // That is what keeps the soles ON the floor rather than through it:
  // `node tools/groundprobe.mjs frogger` reads 0.000 under for this clip.
  dur: 2.0, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    { t: 0.24, ease: 'outBack', pose: { shoulderL: [-8, 0, -84], shoulderR: [-8, 0, 84],
      elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], hipsPos: [0, 0.34, 0], thighL: [24, 0, 0], thighR: [24, 0, 0], kneeL: [-40, 0, 0], kneeR: [-40, 0, 0], ankleL: [16, 0, 0], ankleR: [16, 0, 0], torso: [-6, 0, 0], head: [-6, 0, 0] } },
    { t: 0.50, ease: 'inQuad', pose: { hipsPos: [0, -1.24, 0], thighL: [-60, 0, -8], thighR: [-60, 0, 8], kneeL: [115, 0, 0], kneeR: [115, 0, 0], ankleL: [-54, 0, 0], ankleR: [-54, 0, 0], torso: [30, 0, 0], head: [-22, 0, 0], shoulderL: [4, 0, -78], shoulderR: [4, 0, 78] } },
    { t: 0.78, ease: 'outQuad', pose: { hipsPos: [0, 0.34, 0], thighL: [24, 0, 0], thighR: [24, 0, 0], kneeL: [-40, 0, 0], kneeR: [-40, 0, 0], ankleL: [16, 0, 0], ankleR: [16, 0, 0], torso: [-6, 0, 0], head: [-6, 0, 0], shoulderL: [-14, 0, -88], shoulderR: [-14, 0, 88] } },
    { t: 1.06, ease: 'inQuad', pose: { hipsPos: [0, -1.24, 0], thighL: [-60, 0, -8], thighR: [-60, 0, 8], kneeL: [115, 0, 0], kneeR: [115, 0, 0], ankleL: [-54, 0, 0], ankleR: [-54, 0, 0], torso: [30, 0, 0], head: [-22, 0, 0], shoulderL: [4, 0, -78], shoulderR: [4, 0, 78] } },
    { t: 1.34, ease: 'outQuad', pose: { hipsPos: [0, 0.34, 0], thighL: [24, 0, 0], thighR: [24, 0, 0], kneeL: [-40, 0, 0], kneeR: [-40, 0, 0], ankleL: [16, 0, 0], ankleR: [16, 0, 0], torso: [-6, 0, 0], head: [-6, 0, 0], shoulderL: [-14, 0, -88], shoulderR: [-14, 0, 88] } },
    { t: 1.62, ease: 'inQuad', pose: { hipsPos: [0, -1.24, 0], thighL: [-60, 0, -8], thighR: [-60, 0, 8], kneeL: [115, 0, 0], kneeR: [115, 0, 0], ankleL: [-54, 0, 0], ankleR: [-54, 0, 0], torso: [30, 0, 0], head: [-22, 0, 0], shoulderL: [0, 0, -70], shoulderR: [0, 0, 70] } },
    { t: 2.0, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.24, type: 'sfx', arg: 'taunt' }, { t: 0.50, type: 'sfx', arg: 'land' },
    { t: 1.06, type: 'sfx', arg: 'land' }, { t: 1.62, type: 'sfx', arg: 'land' }],
};
