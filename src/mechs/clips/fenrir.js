// FENRIR's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// FENRIR — muzzle to the sky and HOWL. Head and torso are additive over the
// digitigrade rest, so these are degrees off his own carriage. The TAIL is not
// keyed here: it is gait data (applyTailGait) and a clip track would replace
// its droop and its measured straightening along with the wag. The whip is a
// post-pass on the fenrir profile instead, ADDED to whatever the gait left.
export const FENRIR_TAUNT = {
  dur: 2.0, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    { t: 0.32, ease: 'outCubic', pose: { torso: [-26, 0, 0], head: [-72, 0, 0], hipsPos: [0, 0.08, 0] } },
    { t: 0.6, ease: 'inOutQuad', pose: { head: [-84, 0, 0], torso: [-30, 0, 0] } },
    { t: 1.35, ease: 'inOutQuad', pose: { head: [-80, 0, 0], torso: [-30, 0, 0] } },
    { t: 1.65, ease: 'inOutQuad', pose: { head: [-34, 0, 0], torso: [-12, 0, 0] } },
    { t: 2.0, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.42, type: 'sfx', arg: 'taunt' }],
};
