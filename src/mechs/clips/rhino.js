// RHINO's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// RHINO — the heavyweight warming up: knees driven high and stamped back down,
// with both fists cocked in a punch wind-up the whole way through. Alternating
// legs, so the body rocks between them; his profile only reinterprets `shoot`,
// so nothing here is fighting a hook.
// THE STAMPS ARE GENERATED, so `steps` is one number. Six of them now: three
// read as clearing his throat, six as a man settling in to work.
export const RHINO_STOMP = {
  lead: 0.22,    // fists up and cocked back
  rise: 0.24,    // knee driven up
  drop: 0.18,    // …and STAMPED down
  steps: 6,
  square: 0.28,  // squaring back up over the fists before letting go
  out: 0.4,
};

export function rhinoStompClip(S = RHINO_STOMP) {
  const keys = [{ t: 0, pose: {} }];
  // fists up and cocked back — held for the whole taunt
  const events = [{ t: S.lead, type: 'sfx', arg: 'taunt' }];
  keys.push({ t: S.lead, ease: 'outBack', pose: { torso: [-6, 0, 0], head: [-6, 0, 0],
    shoulderL: [-34, 22, -30], shoulderR: [-34, -22, 30], elbowL: [-116, 0, 0], elbowR: [-116, 0, 0] } });
  let t = S.lead;
  for (let i = 0; i < S.steps; i++) {
    const R = i % 2 === 0, s = R ? 'R' : 'L', o = R ? 'L' : 'R', sgn = R ? 1 : -1;
    t = +(t + S.rise).toFixed(3);
    keys.push({ t, ease: 'outQuad', pose: { hipsPos: [0, 0.10, 0], hipsRot: [0, 0, -5 * sgn], torso: [-8, 0, 3 * sgn],
      ['thigh' + s]: [-74, 0, 4 * sgn], ['knee' + s]: [86, 0, 0], ['ankle' + s]: [22, 0, 0],
      ['thigh' + o]: [4, 0, 0], ['knee' + o]: [-6, 0, 0] } });
    t = +(t + S.drop).toFixed(3);
    keys.push({ t, ease: 'inQuad', pose: { hipsPos: [0, -0.12, 0], hipsRot: [0, 0, 0], torso: [-4, 0, 0],
      ['thigh' + s]: [8, 0, 0], ['knee' + s]: [-4, 0, 0], ['ankle' + s]: [0, 0, 0],
      ['thigh' + o]: [0, 0, 0], ['knee' + o]: [0, 0, 0] } });
    events.push({ t, type: 'sfx', arg: 'slam' }, { t: +(t + 0.02).toFixed(3), type: 'shake', arg: 0.22 });
  }
  t = +(t + S.square).toFixed(3);
  keys.push({ t, ease: 'outQuad', pose: { torso: [-10, 0, 0], head: [-8, 0, 0], hipsPos: [0, 0.04, 0],
    shoulderL: [-40, 24, -34], shoulderR: [-40, -24, 34], elbowL: [-124, 0, 0], elbowR: [-124, 0, 0] } });
  t = +(t + S.out).toFixed(3);
  keys.push({ t, ease: 'inOutQuad', pose: REST_FULL });
  return { dur: t, cancelOnMove: true, keys, events };
}

export const RHINO_TAUNT = rhinoStompClip();
