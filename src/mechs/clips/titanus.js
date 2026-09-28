// TITANUS's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// TITANUS — the capoeira GINGA, the rocking triangular base step: weight back
// onto one leg with the opposite arm up across the face, then across to the
// other side. It is a SWAY, not a march — every key moves the hips laterally
// and the shoulders counter it, and the guard arm is always the one opposite
// the back foot.
export const TITANUS_TAUNT = {
  dur: 3.3, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // settle into the base: knees soft, weight centred, hands up
    { t: 0.26, ease: 'outQuad', pose: { hipsPos: [0, -0.24, 0], torso: [6, 0, 0], head: [-6, 0, 0],
      thighL: [-16, 0, -6], thighR: [-16, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0],
      shoulderL: [-40, 0, -22], shoulderR: [-40, 0, 22], elbowL: [-96, 0, 0], elbowR: [-96, 0, 0] } },
    // LEFT back, right arm across the face
    { t: 0.62, ease: 'inOutQuad', pose: { hipsPos: [0.22, -0.3, -0.18], hipsRot: [0, 16, 0], torso: [8, -14, -6], head: [-6, 18, 0],
      thighL: [12, 0, -8], kneeL: [46, 0, 0], ankleL: [-20, 0, 0], thighR: [-30, 0, 8], kneeR: [24, 0, 0], ankleR: [-10, 0, 0],
      shoulderR: [-78, -18, 34], elbowR: [-112, 0, 0], shoulderL: [-14, 0, -16], elbowL: [-56, 0, 0] } },
    { t: 0.96, ease: 'inOutQuad', pose: { hipsPos: [0, -0.26, 0], hipsRot: [0, 0, 0], torso: [6, 0, 0], head: [-6, 0, 0],
      thighL: [-16, 0, -6], thighR: [-16, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0],
      shoulderL: [-40, 0, -22], shoulderR: [-40, 0, 22], elbowL: [-96, 0, 0], elbowR: [-96, 0, 0] } },
    // RIGHT back, left arm across
    { t: 1.32, ease: 'inOutQuad', pose: { hipsPos: [-0.22, -0.3, -0.18], hipsRot: [0, -16, 0], torso: [8, 14, 6], head: [-6, -18, 0],
      thighR: [12, 0, 8], kneeR: [46, 0, 0], ankleR: [-20, 0, 0], thighL: [-30, 0, -8], kneeL: [24, 0, 0], ankleL: [-10, 0, 0],
      shoulderL: [-78, 18, -34], elbowL: [-112, 0, 0], shoulderR: [-14, 0, 16], elbowR: [-56, 0, 0] } },
    { t: 1.66, ease: 'inOutQuad', pose: { hipsPos: [0, -0.26, 0], hipsRot: [0, 0, 0], torso: [6, 0, 0], head: [-6, 0, 0],
      thighL: [-16, 0, -6], thighR: [-16, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0],
      shoulderL: [-40, 0, -22], shoulderR: [-40, 0, 22], elbowL: [-96, 0, 0], elbowR: [-96, 0, 0] } },
    { t: 2.02, ease: 'inOutQuad', pose: { hipsPos: [0.22, -0.3, -0.18], hipsRot: [0, 16, 0], torso: [8, -14, -6], head: [-6, 18, 0],
      thighL: [12, 0, -8], kneeL: [46, 0, 0], ankleL: [-20, 0, 0], thighR: [-30, 0, 8], kneeR: [24, 0, 0], ankleR: [-10, 0, 0],
      shoulderR: [-78, -18, 34], elbowR: [-112, 0, 0], shoulderL: [-14, 0, -16], elbowL: [-56, 0, 0] } },
    // …AND THE FOURTH. The ginga is a two-count step, so three sways left him
    // stopped on the wrong foot with the dance visibly unfinished; the fourth
    // takes him back through centre and onto the right side, which is where the
    // step started, so he can stand up out of it.
    { t: 2.36, ease: 'inOutQuad', pose: { hipsPos: [0, -0.26, 0], hipsRot: [0, 0, 0], torso: [6, 0, 0], head: [-6, 0, 0],
      thighL: [-16, 0, -6], thighR: [-16, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0],
      shoulderL: [-40, 0, -22], shoulderR: [-40, 0, 22], elbowL: [-96, 0, 0], elbowR: [-96, 0, 0] } },
    { t: 2.72, ease: 'inOutQuad', pose: { hipsPos: [-0.22, -0.3, -0.18], hipsRot: [0, -16, 0], torso: [8, 14, 6], head: [-6, -18, 0],
      thighR: [12, 0, 8], kneeR: [46, 0, 0], ankleR: [-20, 0, 0], thighL: [-30, 0, -8], kneeL: [24, 0, 0], ankleL: [-10, 0, 0],
      shoulderL: [-78, 18, -34], elbowL: [-112, 0, 0], shoulderR: [-14, 0, 16], elbowR: [-56, 0, 0] } },
    { t: 3.3, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.26, type: 'sfx', arg: 'taunt' }, { t: 0.62, type: 'sfx', arg: 'servo' },
    { t: 1.32, type: 'sfx', arg: 'servo' }, { t: 2.02, type: 'sfx', arg: 'servo' },
    { t: 2.72, type: 'sfx', arg: 'servo' }],
};
