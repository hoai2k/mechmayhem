// JERRY's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.

// JERRY's Bilge Spit fires from the CANNON PODS bolted to his shell (the
// manifest pins muzzleR/L to the strutMid pod bones, and the glbanim hook
// swings the firing pod onto his facing), so the shared `shoot` clip was wrong
// twice over: the raised arm hoisted a giant claw for no reason, and — the
// part that showed downrange — its torso YAW (-18° at t=0) carried the pods
// off the fire line, since they are parented to the torso the clip twists.
// Measured: with the pod swung fully onto the facing, the shared clip still
// left the left barrel 13° across his body and the right 14° wide; with the
// pods solved statically the residual is 0.02°. So the recoil here is
// PITCH-ONLY — the shell nods and the hips dip, nothing yaws — and the claws
// are left entirely to the combat carriage. One clip serves both sides: the
// asymmetry is the pod swing itself, not the body.
export const JERRY_SHOOT_GLB = {
  dur: 0.5, upper: true,
  keys: [
    { t: 0, pose: { torso: [2, 0, 0], head: [2, 0, 0] } },
    { t: 0.12, ease: 'outBack', pose: { torso: [-5, 0, 0], head: [-5, 0, 0], hipsPos: [0, -0.07, -0.03], hipsRot: [-2, 0, 0] } },
    { t: 0.3, ease: 'outQuad', pose: { torso: [3, 0, 0], head: [1, 0, 0], hipsPos: [0, -0.02, 0], hipsRot: [0, 0, 0] } },
    { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0] } },
  ],
  events: [{ t: 0.1, type: 'fire' }],
};

// JERRY — he goes TWITCHY. The point is that nothing moves together: every key
// jerks a different part by a small amount on its own beat, with `linear` and
// `outQuad` eases so each one arrives as a snap rather than a swing. Small is
// the whole design — a big amplitude on this splayed crustacean rig reads as
// broken skinning, not as a nervous system.
export const JERRY_TAUNT = {
  // JERRY — he goes TWITCHY. The point is that nothing moves together: every key
  // jerks a different part by a small amount on its own beat, with `linear` and
  // `outQuad` eases so each one arrives as a snap rather than a swing.
  //
  // THE CLAW WORK IS THE OWNER'S, posed by hand. The first pass kept every joint
  // small on the theory that a big amplitude on this splayed crustacean rig
  // reads as broken skinning; the claws in particular barely moved, which made
  // the whole thing a head twitch. They swing properly now — a shoulder reaching
  // -159 degrees at the peak — and it reads as a nervous system rather than a
  // loose bolt, because the rest of the body is still ticking underneath in
  // small increments and no two parts arrive on the same beat.
  dur: 1.7, cancelOnMove: true,
  keys: [
    { t: 0, pose: {  } },
    { t: 0.1, ease: 'linear', pose: { torso: [3.08, 12.51, 16.08], head: [-9.03, 12.92, 0.78], shoulderL: [-42.31, 10.14, -39.75], shoulderR: [-34.05, -11.61, 44.35] } },
    { t: 0.18, ease: 'linear', pose: { head: [2, -6, 4], elbowL: [34, 0, 0], shoulderR: [-34.74, 2.79, 6.63] } },
    { t: 0.26, ease: 'linear', pose: { hipsPos: [0.05, 0, 0], torso: [4, -7, 3], shoulderL: [-77.37, 17.05, -21.56] } },
    { t: 0.34, ease: 'linear', pose: { head: [-11, -14, -3], shoulderL: [-40.24, 0.38, -17.99], shoulderR: [-24, 0, 9], elbowR: [12, 0, 0] } },
    { t: 0.44, ease: 'outQuad', pose: { hipsPos: [-0.06, 0.03, 0], torso: [-3, 9, 2], elbowL: [14, 0, 0], shoulderR: [-112.28, 12.49, 16.94] } },
    { t: 0.52, ease: 'linear', pose: { head: [5, 10, -5], shoulderL: [-22, 0, -8], shoulderR: [-74.95, -11.36, 18.4] } },
    { t: 0.62, ease: 'linear', pose: { hipsPos: [0.04, 0, 0], torso: [2, -4, -4], shoulderL: [-120.85, 14.67, -15.02], shoulderR: [-42, 0, 22], elbowR: [30, 0, 0] } },
    { t: 0.72, ease: 'linear', pose: { head: [-8, 16, 2], shoulderL: [-140.24, 10.26, -21.44], elbowL: [30, 0, 0] } },
    { t: 0.84, ease: 'outQuad', pose: { hipsPos: [0, 0.04, 0], torso: [3, 6, 4], shoulderL: [-38, 0, -20], shoulderR: [-87.96, 33.8, 34.47] } },
    { t: 0.94, ease: 'linear', pose: { head: [-2, -12, -4], shoulderR: [-94.36, 18.62, 57.08], elbowR: [9.69, -2.7, -5.13] } },
    { t: 1.04, ease: 'linear', pose: { hipsPos: [-0.05, 0, 0], torso: [-2, -6, 3], elbowL: [26, 0, 0] } },
    { t: 1.16, ease: 'linear', pose: { head: [-10, 8, 5], shoulderL: [-34, 0, -16], shoulderR: [-38, 0, 20] } },
    { t: 1.28, ease: 'outQuad', pose: { hipsPos: [0.03, 0.02, 0], torso: [1, 3, -2], head: [-4, -5, -2], shoulderL: [-159.12, 0.44, -32.62], elbowR: [24, 0, 0] } },
    { t: 1.7, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0] } },
  ],
  events: [{ t: 0.05, type: 'sfx', arg: 'taunt' },
    { t: 0.10, type: 'sfx', arg: 'servo' }, { t: 0.44, type: 'sfx', arg: 'servo' },
    { t: 0.84, type: 'sfx', arg: 'servo' }, { t: 1.16, type: 'sfx', arg: 'servo' }],
};
