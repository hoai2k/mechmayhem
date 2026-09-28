// KONGA's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// KONGA — the silverback. Chest OUT (torso back, not forward, which is the
// whole read), then the fists come up and beat it, alternating, finishing on a
// two-handed double beat. The arms stay wide of the chest plate at the strike
// — a gorilla's forearms cross in front of the sternum, and driving these ones
// to the centreline pushes them through it.
export const KONGA_TAUNT = {
  dur: 1.9, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // THE FIST HAS TO ARRIVE AT THE CHEST, and on this ape that is a matter of
    // shoulder YAW, not pitch. His arms are the longest on the roster (roster
    // armLen 1.64), so the pitch-and-roll a biped beats its chest with swings
    // these hands clean over his own head — the first pass had him drumming the
    // sky. Measured on the model (chest bone at y=4.62 of an 8.68 body): the
    // BEAT pose lands the fist at 4.66, a third of a body width inboard, and
    // the COCK pose drops it to 3.69 and twice as far out, so each strike is a
    // real travel of about a metre in and up.
    { t: 0.24, ease: 'outBack', pose: { torso: [-17, 0, 0], head: [-8, 0, 0], hipsPos: [0, 0.07, 0],
      shoulderL: [-30, -30, -22], shoulderR: [-30, 30, 22], elbowL: [-95, 0, 0], elbowR: [-95, 0, 0] } },
    // …AND THE FOREARM ROLLS ACROSS, which is the half a fold cannot say. A
    // beat authored as elbow PITCH alone drives the fist up the centre line and
    // the knuckles arrive edge-on; the owner's pass (pose workbench, 2026-08-02)
    // puts real yaw/roll into each elbow so the fist turns over and lands FLAT
    // on the pec, and gives the off arm its own cocked angle instead of the
    // mirrored pitch it used to hold.
    { t: 0.42, ease: 'inQuad', pose: { shoulderL: [-7.1, 28.96, -18.96], elbowL: [-17.07, -49.94, 78.25], elbowR: [-129.49, 37.89, 56.17] } },  // L beat
    { t: 0.58, ease: 'outQuad', pose: { shoulderL: [-30, -30, -22], elbowL: [-95, 0, 0], shoulderR: [-14, -40, 4], elbowR: [32.82, 30.12, -121.64] } },
    { t: 0.74, ease: 'inQuad', pose: { shoulderL: [16, 29.78, -10.5], elbowL: [-47.58, -43.19, 53.1], shoulderR: [-30, 30, 22], elbowR: [-95, 0, 0] } },
    { t: 0.90, ease: 'outQuad', pose: { shoulderL: [-30, -30, -22], elbowL: [-95, 0, 0], shoulderR: [-14, -40, 4], elbowR: [42.11, 15.89, -121.64] } },
    // both fists together, the punctuation
    { t: 1.08, ease: 'inQuad', pose: { torso: [-21, 0, 0], head: [-12, 0, 0], hipsPos: [0, 0.10, 0],
      shoulderL: [-16, 42, -4], shoulderR: [-16, -42, 4],
      elbowL: [-1.79, -37.32, 88.94], elbowR: [-103.32, 41.94, 46.32] } },
    // the release OPENS rather than flings: the wide cock pose held here read
    // as a wing on the way back to rest. The owner's second pass (pose
    // workbench, 2026-08-03) turned the punctuation over too — the double beat
    // lands the LEFT forearm rolled across the chest instead of folded under
    // it, and the right arm comes out of the release unfolded and open rather
    // than still cocked at -104.
    { t: 1.34, ease: 'outQuad', pose: { torso: [-14, 0, 0], shoulderL: [-20, -20, -12], shoulderR: [-20, 20, 12], elbowL: [-104, 0, 0], elbowR: [-11.97, -2.94, -41.07] } },
    { t: 1.9, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.42, type: 'sfx', arg: 'taunt' }, { t: 0.74, type: 'sfx', arg: 'hit' },
    { t: 1.08, type: 'sfx', arg: 'hitHeavy' }, { t: 1.10, type: 'shake', arg: 0.2 }],
};
