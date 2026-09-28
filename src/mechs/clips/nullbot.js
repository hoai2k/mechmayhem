// NULLBOT's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// NULLBOT — the jitter of a body being drawn by something that has lost the
// file. Not a shiver: on each beat a DIFFERENT part snaps to an angle a body
// does not have — a head wrenched round past the shoulder, an elbow bent the
// wrong way, a torso wrung out sideways — and then to another one, with no
// smoothing between (`linear` on every key). The limbs never pass through the
// pose in between, which is exactly what a corrupt frame looks like.
//
// THE ARMS ARE THE PLACE TO BE EXTREME, because they are absolute: an elbow at
// +70 is a joint bending backwards, which no clip on the roster does anywhere
// else. Legs and torso are additive over rest and are kept smaller — a mech
// whose knees invert falls over rather than glitching.
// THE GLITCH POSES ARE A LIST, played through twice — the same corrupt frames
// in the same order, which is right for a thing repeating a broken loop rather
// than improvising, and doubles the length without inventing twelve more poses
// that would each need judging. `cycles` is the dial.
export const NULLBOT_GLITCH = [
  // the head goes round further than a neck goes
  { head: [-24, 118, 22], torso: [14, -26, 16],
    shoulderR: [-116, 54, 74], elbowR: [42, 0, 0], handR: [0, 0, 60] },
  { head: [30, -104, -26], torso: [2, 30, -20],
    shoulderL: [-128, -60, -86], elbowL: [56, 0, 0], shoulderR: [-20, 0, 16], elbowR: [-70, 0, 0] },
  { head: [-38, 20, 0], torso: [18, 0, 4],
    shoulderL: [26, 40, -8], elbowL: [-150, 0, 0], shoulderR: [24, -40, 8], elbowR: [-150, 0, 0],
    hipsPos: [0.12, -0.1, 0], hipsRot: [0, 14, 0] },
  { head: [12, -76, 30], torso: [6, -22, -18],
    shoulderL: [-96, 0, -120], elbowL: [-10, 0, 0], shoulderR: [-96, 0, 120], elbowR: [-10, 0, 0],
    hipsPos: [-0.1, 0.04, 0], hipsRot: [0, -12, 0] },
  { head: [-30, 132, -18], torso: [16, 24, 22],
    shoulderR: [58, -70, 40], elbowR: [64, 0, 0], shoulderL: [-40, 0, -22], elbowL: [-84, 0, 0] },
  { head: [24, 0, 40], torso: [0, -30, -8],
    shoulderL: [70, 62, -34], elbowL: [58, 0, 0], shoulderR: [-132, 0, 96], elbowR: [-26, 0, 0],
    hipsPos: [0.08, -0.14, 0] },
  { head: [-44, -60, 12], torso: [22, 12, 26],
    shoulderL: [-150, 0, -40], elbowL: [-4, 0, 0], shoulderR: [-150, 0, 40], elbowR: [-4, 0, 0],
    hipsPos: [0, 0.06, 0], hipsRot: [0, 8, 0] },
  { head: [8, 96, -34], torso: [-6, -18, 14],
    shoulderL: [10, -50, -70], elbowL: [-166, 0, 0], shoulderR: [-72, 34, 20], elbowR: [30, 0, 0] },
  { head: [-20, -30, 26], torso: [20, 26, -22],
    shoulderL: [-110, 0, -96], elbowL: [48, 0, 0], shoulderR: [-14, 0, 12], elbowR: [-120, 0, 0],
    hipsPos: [-0.14, -0.06, 0], hipsRot: [0, -16, 0] },
  { head: [34, 14, -40], torso: [4, -8, 18],
    shoulderL: [-30, 0, -26], elbowL: [-90, 0, 0], shoulderR: [66, 58, 30], elbowR: [52, 0, 0] },
  { head: [-26, -120, 8], torso: [18, -28, -14],
    shoulderL: [-140, 44, -60], elbowL: [-16, 0, 0], shoulderR: [-140, -44, 60], elbowR: [-16, 0, 0],
    hipsPos: [0.1, 0.02, 0] },
  { head: [16, 62, 34], torso: [8, 20, 24],
    shoulderL: [40, 0, -14], elbowL: [40, 0, 0], shoulderR: [-88, 0, 62], elbowR: [-60, 0, 0] },
];

export const NULLBOT_JITTER = {
  lead: 0.1,     // squaring up before the signal goes
  beat: 0.104,   // one corrupt frame
  cycles: 2,     // times through the list
  snap: 0.12,    // …and back to something almost normal, which is the punchline
  out: 0.32,
  zapEvery: 4,   // one buzz in four beats
};

export function nullbotJitterClip(J = NULLBOT_JITTER) {
  const keys = [{ t: 0, pose: {} }];
  const events = [];
  let t = J.lead;
  keys.push({ t, ease: 'linear', pose: { torso: [10, 0, 0], head: [-16, 0, 0], hipsPos: [0, -0.06, 0],
    shoulderL: [-34, 0, -30], shoulderR: [-34, 0, 30], elbowL: [-78, 0, 0], elbowR: [-78, 0, 0] } });
  const n = NULLBOT_GLITCH.length * J.cycles;
  for (let i = 0; i < n; i++) {
    t = +(t + J.beat).toFixed(3);
    keys.push({ t, ease: 'linear', pose: { ...NULLBOT_GLITCH[i % NULLBOT_GLITCH.length] } });
    if (i % J.zapEvery === 1) events.push({ t, type: 'sfx', arg: 'zap' });
  }
  t = +(t + J.snap).toFixed(3);
  keys.push({ t, ease: 'linear', pose: { head: [-14, 0, 0], torso: [10, 0, 0], hipsPos: [0, -0.04, 0], hipsRot: [0, 0, 0],
    shoulderL: [-32, 0, -28], shoulderR: [-32, 0, 28], elbowL: [-80, 0, 0], elbowR: [-80, 0, 0],
    handL: [0, 0, 0], handR: [0, 0, 0] } });
  t = +(t + J.out).toFixed(3);
  keys.push({ t, ease: 'inOutQuad', pose: REST_FULL });
  return { dur: t, cancelOnMove: true, keys, events };
}

export const NULLBOT_TAUNT = nullbotJitterClip();
