// VULCAN's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// VULCAN — arms straight out and the upper body SPUN, once each way. The turn
// is keyed as a plain torso yaw running past 360 rather than a post-pose
// accumulator (fighter.js heavySpin): a clip track is a linear ramp between
// keys, so a value of −380 really does sweep a full turn and a bit, and it
// unwinds honestly on the way back instead of snapping to a whole rotation.
export const VULCAN_TAUNT = {
  dur: 2.6, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    { t: 0.26, ease: 'outBack', pose: { torso: [0, 0, 0], head: [-6, 0, 0], hipsPos: [0, 0.04, 0],
      shoulderL: [-4, 0, -92], shoulderR: [-4, 0, 92], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0] } },
    { t: 1.12, ease: 'inOutCubic', pose: { torso: [0, -380, 0], head: [-6, 0, 0] } },   // one turn, right
    { t: 1.34, ease: 'outQuad', pose: { torso: [0, -360, 0] } },                        // settle onto the turn
    { t: 2.20, ease: 'inOutCubic', pose: { torso: [0, 20, 0] } },                       // and back the other way
    { t: 2.6, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.26, type: 'sfx', arg: 'servo' }, { t: 0.4, type: 'sfx', arg: 'whoosh' },
    { t: 1.5, type: 'sfx', arg: 'whoosh' }],
};
