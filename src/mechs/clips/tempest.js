// TEMPEST's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// TEMPEST — the chest OPENS and both arms go wide and back: hug-the-world, if
// the world were something you meant to electrocute. He holds it while the
// static crawls all over him (Fighter.arcTaunt — the arcs are FX between named
// points on the body, not anything a pose can express), then folds the arms
// slowly back in.
// THE THREE SHOULDER POSES ARE THE OWNER'S, set by hand in the pose workbench,
// and they are not a tidy pair of mirrored numbers — the two arms differ by a
// few degrees on every key (-74.97 against -77.45, -69.40 against -70.84) and
// that near-symmetry is deliberate, not an error to round out. The span moved
// from a shallow pitch carrying most of it in roll (-16 / -104) to a deep one
// (-75 / -121), which turns the arms so they open OUT AND FORWARD with the
// palms and wrist bands presented at you, instead of sweeping back where the
// camera cannot read them.
export const TEMPEST_TAUNT = {
  dur: 2.4, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    { t: 0.38, ease: 'outBack', pose: { torso: [-16, 0, 0], head: [-14, 0, 0], hipsPos: [0, 0.06, 0],
      shoulderL: [-74.97, -1.84, -121], shoulderR: [-77.45, -4.32, 121.08], elbowL: [-8, 0, 0], elbowR: [-8, 0, 0],
      handL: [0, 0, -22], handR: [0, 0, 22] } },
    // he keeps opening, a slow swell rather than a held statue
    { t: 1.30, ease: 'inOutQuad', pose: { torso: [-20, 0, 0], head: [-18, 0, 0],
      shoulderL: [-69.4, -5.9, -128.51], shoulderR: [-70.84, 2.75, 129.69] } },
    { t: 1.95, ease: 'inOutQuad', pose: { torso: [-12, 0, 0], head: [-10, 0, 0],
      shoulderL: [-74.76, -13.42, -103.5], shoulderR: [-84.5, 10.94, 105.56], elbowL: [-26, 0, 0], elbowR: [-26, 0, 0] } },
    { t: 2.4, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.38, type: 'sfx', arg: 'zap' }, { t: 1.30, type: 'sfx', arg: 'thunder' }],
};
