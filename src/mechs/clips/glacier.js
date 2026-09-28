// GLACIER's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// HOW LONG HE STANDS THERE AFTER THE ICE GOES. Read by BOTH the clip below and
// Fighter.iceTaunt, which is the point: the block vanishing and the pose that
// is on screen when it does are one event, and two hand-kept schedules for it
// is one of them silently wrong the moment either moves.
export const GLACIER_FREEZE = {
  still: 1.0,    // frozen solid, in the fog, before anything moves
  relax: 0.45,   // …and unwinding out of it
};

export const GLACIER_ICE_OUT = 2.30;          // when the block goes

export const GLACIER_FROZEN = {
  torso: [6, 0, 0], head: [3, 0, 0], hipsPos: [0, -0.2, 0],
  shoulderL: [0, 6, 2], shoulderR: [0, -6, -2], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0],
  handL: [0, 0, -6], handR: [0, 0, 6],
  thighL: [-5, 0, 7], thighR: [-5, 0, -7], kneeL: [13, 0, 0], kneeR: [13, 0, 0],
  ankleL: [-8, 0, 0], ankleR: [-8, 0, 0],
};

export const GLACIER_TAUNT = {
  // GLACIER — he freezes himself SOLID. For most of this clip he is not on
  // screen at all: he cross-fades into a single block of ice (Fighter.iceTaunt,
  // roster `tauntIce`), and at the end the block is simply GONE, in one frame,
  // in a burst of frost.
  //
  // SO THE POSE IS THE PART YOU CAN SEE, AND IT IS A BODY COMING TO A STOP.
  // Arms DOWN at his sides — the elbows barely bent, nothing raised, nothing
  // held out — knees drawn together, head level: a column, because that is what
  // the ice has to be able to be. The keys are spaced so the motion decelerates
  // (0.3s to most of the way, another 0.5s to the rest of it) and then he is
  // dead still for the two seconds the block stands, which is the difference
  // between a frozen mech and a mech holding a pose.
  //
  // He holds it while frozen — the fade is on the RENDER, the animator keeps
  // running underneath — so he comes back out in the pose he went in.
  dur: GLACIER_ICE_OUT + GLACIER_FREEZE.still + GLACIER_FREEZE.relax, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // most of the way there, fast
    { t: 0.30, ease: 'outQuad', pose: { torso: [4, 0, 0], head: [2, 0, 0], hipsPos: [0, -0.14, 0],
      shoulderL: [-2, 4, 4], shoulderR: [-2, -4, -4], elbowL: [-16, 0, 0], elbowR: [-16, 0, 0],
      thighL: [-4, 0, 5], thighR: [-4, 0, -5], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
    // …and the last of it slowly, so he SETTLES rather than arriving
    { t: 0.80, ease: 'outCubic', pose: { torso: [6, 0, 0], head: [3, 0, 0], hipsPos: [0, -0.2, 0],
      shoulderL: [0, 6, 2], shoulderR: [0, -6, -2], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0],
      handL: [0, 0, -6], handR: [0, 0, 6],
      thighL: [-5, 0, 7], thighR: [-5, 0, -7], kneeL: [13, 0, 0], kneeR: [13, 0, 0], ankleL: [-8, 0, 0], ankleR: [-8, 0, 0] } },
    // frozen: not one joint moves. TWO of these — the block goes at the first
    // (GLACIER_FREEZE.still + .relax before the end, which Fighter.iceTaunt
    // reads off the same table) and he is still standing in it, in the fog, for
    // a whole second before the second one lets him unwind. He used to come
    // back and move on the same instant, which read as the ice turning into a
    // mech mid-stride instead of something thawing out.
    { t: GLACIER_ICE_OUT, ease: 'linear', pose: { ...GLACIER_FROZEN } },
    { t: GLACIER_ICE_OUT + GLACIER_FREEZE.still, ease: 'linear', pose: { ...GLACIER_FROZEN } },
    { t: GLACIER_ICE_OUT + GLACIER_FREEZE.still + GLACIER_FREEZE.relax, ease: 'outBack', pose: REST_FULL },
  ],
  events: [{ t: 0.30, type: 'sfx', arg: 'freeze' }],
};
