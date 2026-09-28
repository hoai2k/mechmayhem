// VIPER's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// VIPER — arms locked BEHIND THE BACK with the two blade tips touching at the
// centre of his spine, and then seven full seconds of Irish jig danced with the
// legs alone. The upper body is the joke: a jig is danced with a DEAD still
// carriage, hands out of the way, everything happening below the hips.
//
// THE ARM POSE IS MEASURED, NOT AUTHORED. His blades are fused to the forearms,
// so where the TIP ends up is two joints away from any number you can type, and
// the two obvious levers fight: shoulder yaw that pulls the tips in toward the
// centre line also swings them FORWARD, while pitching the arm back puts them
// behind him but leaves them a body's width apart. `tools/scratch/armsweep.mjs`
// swept pitch x yaw x roll x elbow and scored on (tips together) + (on the
// centreline) + (behind the torso); these are the winner. THE TIP IS THE REAL
// ONE — the farthest skinned vertex the forearm/hand owns, taken into the hand
// bone's local frame once and carried by the bone through each candidate.
// Guessing it as "a hand-length or so past the hand" is what the first attempt
// did, and it was off by a factor of two, so the arms it chose crossed the
// blades in an X across his shoulder blades. Measured with the torso at
// [0, 4.83, 0]: tipL [-0.02, 3.17, -1.21], tipR [-0.02, 3.16, -1.22] — 0.03
// apart, on the centre line, at the small of his back. Do not "tidy" the
// yaw/roll pair; they are what closes the gap.
export const VIPER_ARMS = {
  shoulderL: [60, 20, 40], shoulderR: [60, -20, -40],
  elbowL: [-20, 0, 0], elbowR: [-20, 0, 0],
};

// THE JIG IS GENERATED, because it is a rhythm rather than a pose: fourteen
// beats hand-written is fourteen chances to typo one, and the thing you tune is
// the BAR, not the fiftieth key. Each beat lifts one knee to a pointed toe and
// snaps it back down under him with a hop in the hips; every fourth beat is a
// TREBLE instead — the low forward brush a jig punctuates with — so the step
// does not read as a metronome. The arms are repeated on EVERY key, verbatim: a
// clip track is sparse, so a pose named once and not again slides away over the
// next seven seconds.
// THE LEGS AND THE BODY RUN ON DIFFERENT CLOCKS, and that is the whole reason
// this is generated rather than typed. Speeding the step up is a legs-only ask:
// a hip bob keyed once per step goes up with it, and six bounces a second is a
// mech vibrating, not a dancer. So `beat` is the STEP and `bob` is how many
// steps one rise-and-fall of the hips spans — 3, which puts the body back on the
// half-second it bounced at before the legs got quick. The hips are then sampled
// off their own triangle at every key rather than keyed per step, so the two
// rhythms cross without either one snapping to the other.
//
// HIS FEET COME DOWN UNDER HIM. A jig is danced on a narrow base: `adduct` rolls
// both thighs toward the midline and the ankles take the same angle back out, so
// the sole stays flat on the floor instead of landing on its edge. (The owner's
// pose-workbench pass is where the idea and the rough size came from — theirs
// carried a per-key yaw wobble too, which is a hand-set pose rather than a rule,
// so what is kept here is the adduction.)
export const VIPER_JIG = {
  lead: 0.34,    // getting the hands behind his back
  beat: 0.167,   // one STEP — a third of the first pass' half-second
  beats: 42,     // 42 x 0.167 = the seven seconds asked for
  bob: 3,        // steps per body bounce: 3 x 0.167 = the original 0.5s
  out: 0.42,     // unwinding to rest
  lift: 0.12,    // how far the bounce takes the hips up
  drop: -0.05,   // …and down
  knee: 98,      // the raised knee, degrees forward of rest
  adduct: 9,     // degrees of thigh roll toward the midline (feet closer in)
  sfxEvery: 3,   // one footfall sound in three; forty-two is a machine gun
};

// The body's own bounce, sampled at time `t`: a triangle with the ORIGINAL
// period, peaking just after a step lands and bottoming a little past halfway.
export function viperBob(t, J) {
  const P = J.beat * J.bob;
  const up = 0.04, dn = 0.56;
  let ph = (((t - J.lead) % P + P) % P) / P;
  if (ph < up) ph += 1;
  return ph < dn
    ? J.lift + (J.drop - J.lift) * ((ph - up) / (dn - up))
    : J.drop + (J.lift - J.drop) * ((ph - dn) / (1 + up - dn));
}

export function viperJigKeys(J = VIPER_JIG) {
  const A = J.adduct;
  const keys = [{ t: 0, pose: {} },
    { t: J.lead, ease: 'outQuad', pose: { torso: [-3, 0, 0], head: [-2, 0, 0], ...VIPER_ARMS } }];
  for (let i = 0; i < J.beats; i++) {
    const t = J.lead + i * J.beat;
    const R = i % 2 === 0, s = R ? 'R' : 'L', o = R ? 'L' : 'R';
    // roll toward the midline: +z on the LEFT leg, -z on the right
    const roll = (side) => (side === 'L' ? 1 : -1);
    const treble = i % 4 === 3;
    const tUp = t + J.beat * 0.04, tDn = t + J.beat * 0.56;
    // up: the working leg's knee at its top (or thrown forward low, on a treble)
    keys.push({ t: tUp, ease: 'outQuad', pose: { ...VIPER_ARMS,
      hipsPos: [0, viperBob(tUp, J), 0],
      ['thigh' + s]: treble ? [-42, 0, A * roll(s)] : [-J.knee + 8, 0, A * roll(s)],
      ['knee' + s]: treble ? [-16, 0, 0] : [J.knee + 10, 0, 0],
      ['ankle' + s]: treble ? [34, 0, -A * roll(s)] : [28, 0, -A * roll(s)],
      ['thigh' + o]: [7, 0, A * roll(o)], ['knee' + o]: [-7, 0, 0],
      ['ankle' + o]: [0, 0, -A * roll(o)] } });
    // down: back under him, taking the weight
    keys.push({ t: tDn, ease: 'inQuad', pose: { ...VIPER_ARMS,
      hipsPos: [0, viperBob(tDn, J), 0],
      ['thigh' + s]: [11, 0, A * roll(s)], ['knee' + s]: [-9, 0, 0],
      ['ankle' + s]: [0, 0, -A * roll(s)] } });
  }
  keys.push({ t: J.lead + J.beats * J.beat + J.out, ease: 'inOutQuad', pose: REST_FULL });
  return keys;
}

export const VIPER_TAUNT = {
  dur: VIPER_JIG.lead + VIPER_JIG.beats * VIPER_JIG.beat + VIPER_JIG.out,
  cancelOnMove: true,
  keys: viperJigKeys(),
  events: Array.from({ length: VIPER_JIG.beats }, (_, i) => i)
    .filter((i) => i % (VIPER_JIG.sfxEvery || 1) === 0)
    .map((i) => ({ t: VIPER_JIG.lead + i * VIPER_JIG.beat + VIPER_JIG.beat * 0.56, type: 'sfx', arg: 'land' })),
};
