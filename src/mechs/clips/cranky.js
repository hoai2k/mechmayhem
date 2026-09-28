// CRANKY's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.

// CRANKY — claws up, and a little side-to-side hop. The lateral travel is
// `hipsPos` rather than a leg pass: four of his six legs are the hex gait's and
// two are the game's, and a dance that keyed either would be arguing with the
// gait about where a foot goes. The shell leans INTO each hop (hipsRot roll —
// his profile damps torso yaw/roll during a non-looping clip to keep a crab
// from boxing, and roll on the HIPS is the one that survives it).
export const CRANKY_TAUNT = {
  // CRANKY — claws up, and a little side-to-side hop.
  //
  // THE HOP IS `hipsPos`, not a leg pass: four of his six legs belong to the hex
  // gait and two carry the game's leg joints, so a dance keyed on either would
  // be arguing with the gait about where a foot goes. The shell leans INTO each
  // hop on hipsRot ROLL — his profile damps torso yaw and roll through a
  // non-looping clip to stop a crab boxing, and roll on the HIPS is the one that
  // survives it.
  //
  // THE CLAW WORK IS THE OWNER'S, posed by hand in the pose workbench: the
  // elbows wind further out and further open on every beat (-69 at the top,
  // -95 by the third hop, -109 on the far claw) instead of being thrown up once
  // and held, and the thighs take a few degrees of their own so the two game
  // legs are not rigid under a moving shell. It ends with the claws still UP
  // rather than dropped to rest — the fade-out carries them down, which reads
  // as him finishing the dance rather than switching it off.
  dur: 2.1, cancelOnMove: true,
  keys: [
    { t: 0, pose: { elbowL: [-69.45, -13.45, -7.81], elbowR: [-72.76, 10.75, 13.58], thighL: [-1.15, 0.99, -9.39], thighR: [0.37, 1.28, -13.81] } },
    { t: 0.26, ease: 'outBack', pose: { hipsPos: [0, 0.14, 0], hipsRot: [-1, -0.58, -9.28], shoulderL: [-52, 0, -46], elbowL: [-54, 0, 0], shoulderR: [-52, 0, 46], elbowR: [-54, 0, 0], thighL: [2.46, -1.49, 16.68], thighR: [-0.2, -0.54, 5.14] } },
    { t: 0.46, ease: 'outQuad', pose: { hipsPos: [-0.26, 0.34, 0], hipsRot: [0, 0, 8], thighL: [-1.29, 1.27, -6.16], thighR: [-0.25, 1.73, -11.71] } },
    { t: 0.64, ease: 'inQuad', pose: { hipsPos: [-0.3, 0.02, 0], hipsRot: [0, 0, 5], thighR: [-0.26, 1.01, -4.49] } },
    { t: 0.84, ease: 'outQuad', pose: { hipsPos: [0.26, 0.34, 0], hipsRot: [0, 0, -8], thighL: [1.23, -1.36, 16.44], thighR: [-0.83, -0.61, 8.56] } },
    { t: 1.02, ease: 'inQuad', pose: { hipsPos: [0.3, 0.02, 0], hipsRot: [0, 0, -5], elbowL: [-71.08, -27.83, -15.59], elbowR: [-57.74, 31.59, 3.25], thighL: [0.28, -0.77, 8.05] } },
    { t: 1.22, ease: 'outQuad', pose: { hipsPos: [-0.26, 0.34, 0], hipsRot: [0, 0, 8], thighL: [-0.74, 1.49, -9.53], thighR: [0.65, 1.35, -7.8] } },
    { t: 1.4, ease: 'inQuad', pose: { hipsPos: [-0.3, 0.02, 0], hipsRot: [0, 0, 5], elbowL: [-95.66, -38.78, -25.95], elbowR: [-78.55, 49.12, 8.6] } },
    { t: 1.6, ease: 'outQuad', pose: { hipsPos: [0.26, 0.34, 0], hipsRot: [0, 0, -8], elbowR: [-109.29, 69.46, 11.98], thighL: [2.51, -3.28, 12.02], thighR: [0.47, -2.1, 7.21] } },
    { t: 1.78, ease: 'inQuad', pose: { hipsPos: [0.3, 0.02, 0], hipsRot: [0, 0, -5], elbowL: [-81.1, -46.86, -10.53], shoulderR: [-58.78, -14.31, 17.56], thighR: [0.41, -2.42, 9.39] } },
    { t: 2.1, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-82.63, 10.9, -44.15], elbowL: [-12, 0, 0], shoulderR: [-92.41, 38.12, -21.79], elbowR: [-12, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0] } },
  ],
  // the claws snap open on the way up, then a beat per landing
  events: [{ t: 0.26, type: 'sfx', arg: 'taunt' }, { t: 0.64, type: 'sfx', arg: 'block' },
    { t: 1.02, type: 'sfx', arg: 'block' }, { t: 1.40, type: 'sfx', arg: 'block' },
    { t: 1.78, type: 'sfx', arg: 'block' }],
};
