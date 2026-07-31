// THE GAIT TABLE — the walk/run cycle as DATA, not as code buried in the animator.
//
// Every mech's locomotion used to be one hard-coded block of sines in
// animator.js: one set of amplitudes for a 6.5-speed colossus and a 13.5-speed
// viper alike, differing only by `ratio = speed / maxSpeed`. That is why the
// fast mechs read as stiff — at full throttle they ran the SAME stride a heavy
// runs at full throttle, just faster.
//
// A GAIT is a named bundle of those numbers. A roster def names one
// (`gait: 'sprint'`), several mechs SHARE one (that is the point: tune
// 'sprint' once and viper, tempest, wraith and nova all move), and a mech that
// names none gets `standard`. `applyGait()` below is the whole cycle, and it is
// what the animator runs — the gait workbench (`/workbench/?edit=gait`) drives
// this exact function, so what you tune there is what ships.
//
// SHAPE OF A GAIT
//   legs   the stride itself: thigh swing, forward reach, knee lift, track width
//   ankle  the foot roll and the toe-off push
//   arms   the counter-swing: shoulder pitch, elbow bend/pump, how tucked in
//   body   what the torso does with all of it: bob, pitch, lean, twist, head
//   quad   OPTIONAL — the four-legged gallop layer (fenrir), which rides on top
//
// EVERY NUMBER IS IN RADIANS unless the schema below says otherwise, and every
// `*Run` twin is the amount ADDED AT FULL SPEED (`base + run * ratio`), which is
// how a gait can walk politely and sprint hard without a second table.
//
// CONVENTIONS (the animator's virtual rig, see rigadapter JOINT_ORDER):
//   thigh/shoulder pitch  NEGATIVE = forward, positive = back — the SAME sense
//                          for an arm as for a leg, which is the trap that had
//                          the arms swinging with the legs (see applyGait)
//   knee pitch            POSITIVE = folded
//   thigh roll (z)        POSITIVE pulls the LEFT leg toward the midline
//                          (the right leg mirrors), so `adduct` narrows the track
//   head pitch            NEGATIVE = eyes up
import { lerp, clamp01, TAU as TAU_ } from '../core/utils.js';

export const DEFAULT_GAIT = 'standard';

// HOW MUCH HIGHER THAN THE OTHER FOOT this one has to be before it counts as
// fully AIRBORNE, as a fraction of the leg's length. This is the switch between
// the foot's two jobs — flat on the pavement below it, hanging off the shin above
// it — and it is deliberately a soft one: a foot crosses it as it lands, so the
// sole rolls level into the plant instead of snapping flat.
const LIFT_BAND = 0.045;

// …and how far the leg has to swing BEHIND its rest direction (radians of thigh +
// knee) before a foot still on the ground counts as fully PUSHING OFF rather than
// standing. ~29 degrees, so the push builds through the back half of stance.
const TRAIL_BAND = 0.5;

/**
 * How much this foot is IN THE AIR: 0 standing on it, 1 clear of the ground.
 *
 * FIRST CHOICE is the measurement: a calibrated body knows the real distance from
 * each boot to the pavement (Animator.soleClearanceBySide, handed over as
 * `env.footClr`), and nothing beats that — a deep-booted heavy can have its ankle
 * a quarter of a body height up with the sole still planted.
 *
 * WITHOUT ONE (procedural bodies, and the quadruped, whose hock calibrateFeet
 * skips) it falls back to how much HIGHER this foot hangs than the other one,
 * from the leg's own geometry: thigh and shin projected on vertical, both from the same hips.
 * The comparison is what makes it work without knowing where the ground is — a
 * walking body always has a foot down, so the LOWER foot is the one standing and
 * the other is up by the difference. (Absolute leg length cannot answer it: a leg
 * that shortens in stance is the body squatting over a planted foot, not the foot
 * rising, and reading it that way had every foot "airborne" all cycle.)
 *
 * Two reasons it is done from the pose rather than from the gait phase or a world
 * measurement:
 *
 *  · it is a fact about the FINISHED stride, so it does not care WHICH layer bent
 *    the leg. Fenrir's hinds are moved by the biped layer AND by a gallop running
 *    at its own rate (`quad.stride`); no single phase window describes where his
 *    paws are, and any gait added later would need its own.
 *  · it stays a pure function of the pose, so the gait workbench measures exactly
 *    what the game runs.
 */
function airWeight(tgt, rest, side, env = {}) {
  const thighL = env.thighLen || 1, shinL = env.shinLen || 1;
  // MEASURED, where the body has been calibrated: the real gap between this
  // boot and the pavement, from last frame's draw (Animator.soleClearanceBySide).
  const clr = env.footClr?.[side];
  if (typeof clr === 'number' && Number.isFinite(clr)) {
    return clamp01(clr / (LIFT_BAND * (thighL + shinL)));
  }
  const r = (j) => (rest?.[j]?.[0] || 0);
  const reach = (sd) => {
    const t = tgt['thigh' + sd][0], k = tgt['knee' + sd][0];
    return thighL * Math.cos(t) + shinL * Math.cos(t + k);
  };
  const other = side === 'L' ? 'R' : 'L';
  if (!tgt['thigh' + other] || !tgt['knee' + other]) return 0;
  const lift = (reach(other) - reach(side)) / (thighL + shinL);
  return clamp01(lift / LIFT_BAND);
}

/**
 * A FOOT IS ALWAYS IN ONE OF THREE STATES, and each one wants something different:
 *
 *   stance   flat on the ground, whatever the leg above it is doing
 *   push     planted but BEHIND the body: the toe stays down while the leg
 *            straightens and the heel lifts, so the foot pivots over the toe and
 *            ends up angled hard down relative to the shin — the most plantar-flexed
 *            moment of the whole cycle
 *   air      off the ground: nothing holds it at any angle to the WORLD, so it hangs
 *            at its resting angle to the shin
 *
 * The weights come from the pose, never from a phase window: `air` is measured
 * (Animator.soleClearanceBySide) or inferred, and `back` is how far the leg has
 * swung behind its rest direction. They sum to 1, so a foot is always fully
 * described and the transitions are crossfades rather than switches.
 */
function footStates(tgt, rest, side, env) {
  const r = (j) => (rest?.[j]?.[0] || 0);
  const air = env.air ? env.air[side] : airWeight(tgt, rest, side, env);
  const back = clamp01(((tgt['thigh' + side][0] - r('thigh' + side))
    + (tgt['knee' + side][0] - r('knee' + side))) / TRAIL_BAND);
  const push = (1 - air) * back;
  return { air, back, push, stance: (1 - air) * (1 - back) };
}

// ---------------------------------------------------------------------------
// THE PARAMETER SCHEMA. One entry per dial: what it is called, what it does,
// what range is sane, and WHICH JOINTS it moves — the workbench builds its
// sliders from this list and uses `joints` to work out which dial a dragged
// limb belongs to. Adding a parameter here + reading it in applyGait() is the
// whole cost of a new gait dial.
// ---------------------------------------------------------------------------
export const GAIT_SCHEMA = [
  {
    id: 'legs', label: 'Legs — the stride',
    params: [
      { key: 'swing', label: 'thigh swing', min: 0, max: 1.6, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'stride amplitude at a standstill-to-walk pace' },
      { key: 'swingRun', label: 'thigh swing @run', min: 0, max: 1.6, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'extra stride amplitude added at full speed' },
      { key: 'reach', label: 'forward reach', min: 0, max: 1.2, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'asymmetric extra swing on the FORWARD half — the leg reaching out ahead' },
      { key: 'extend', label: 'rear extension', min: -2, max: 1.2, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'asymmetric extra swing BEHIND — the trailing leg finishing its push. NEGATIVE is legitimate: '
          + 'on a body whose hips are carried horizontally (the quadruped) the same joint reads the other '
          + 'way round, so his rear extension is a negative number' },
      { key: 'adduct', label: 'track narrow', min: -0.5, max: 0.6, step: 0.005, joints: ['thighL', 'thighR'],
        help: 'hip roll toward the midline: positive brings the feet under the body' },
      { key: 'adductRun', label: 'track narrow @run', min: -0.5, max: 0.6, step: 0.005, joints: ['thighL', 'thighR'],
        help: 'extra midline pull at full speed (a runner tracks nearly single-file)' },
      { key: 'adductTrail', label: 'trailing flick inward', min: -0.5, max: 0.6, step: 0.005, joints: ['kneeL', 'kneeR'],
        help: 'midline pull on the leg that is BEHIND AND OFF THE GROUND — the flick after '
          + 'toe-off. Fades as the leg swings forward, so the foot lands at its normal width '
          + 'and a PLANTED foot is never pulled sideways (that would be a skate)' },
      { key: 'stanceBend', label: 'knee stance bend', min: 0, max: 1.0, step: 0.01, joints: ['kneeL', 'kneeR'],
        help: 'springy knees that never lock' },
      { key: 'stanceBendRun', label: 'knee bend @run', min: 0, max: 1.0, step: 0.01, joints: ['kneeL', 'kneeR'] },
      { key: 'kneeLift', label: 'knee lift', min: 0, max: 2.4, step: 0.01, joints: ['kneeL', 'kneeR'],
        help: 'how far the swing leg folds up under the body' },
      { key: 'kneeLiftRun', label: 'knee lift @run', min: 0, max: 2.4, step: 0.01, joints: ['kneeL', 'kneeR'] },
      { key: 'kneePhase', label: 'knee phase', min: -3.14, max: 3.14, step: 0.01, joints: ['kneeL', 'kneeR'],
        help: 'where in the cycle the fold peaks (radians of lead over the thigh)' },
      { key: 'cadence', label: 'cadence reach', min: 0.4, max: 1.6, step: 0.01, joints: [],
        help: 'fraction of leg length a stride is assumed to cover — SMALLER = faster steps for the same ground speed' },
      { key: 'cadenceCap', label: 'cadence cap', min: 4, max: 30, step: 0.5, joints: [],
        help: 'ceiling on steps per second (rad/s of gait phase)' },
    ],
  },
  {
    id: 'ankle', label: 'Ankle — foot roll & push',
    params: [
      { key: 'roll', label: 'roll', min: 0, max: 1.2, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'heel-to-toe roll, as a fraction of the thigh swing' },
      { key: 'tilt', label: 'toe-down bias @run', min: -0.8, max: 0.4, step: 0.01, joints: ['ankleL', 'ankleR'] },
      { key: 'push', label: 'foot angle at full back extension', min: 0, max: 2.0, step: 0.01,
        joints: ['ankleL', 'ankleR'],
        help: 'THE ANGLE THE FOOT ENDS UP AT, relative to the shin, when the leg is planted and fully behind '
          + 'the body — the toe down, the heel up, pushing off. It is an absolute target, not an offset, so '
          + 'this dial (plus its @run twin) is the whole answer: 1.57 = 90°, 0.79 = 45°. The WINDOW is not a '
          + 'dial — planted AND behind is worked out from the pose' },
      { key: 'pushRun', label: 'toe-off @run', min: 0, max: 2.0, step: 0.01, joints: ['ankleL', 'ankleR'] },
      { key: 'level', label: 'sole levelling on the ground', min: 0, max: 1, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'how hard to keep the sole FLAT ON THE GROUND while the foot is planted, over and above what '
          + "the model's own foot-depth calibration already asks for. Bodies the calibration skips (the "
          + 'quadruped) need it here or their feet land at whatever angle the leg left them' },
      { key: 'hang', label: 'toe past rest @airborne', min: -0.4, max: 1.0, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'extra plantar flex PAST the resting foot line, radians, while the foot is OFF THE GROUND. '
          + '0 means the foot simply hangs at its natural angle to the shin (perpendicular, for a body built '
          + 'that way) — which is the rule; a runner points the toe a little past it (~0.26 = 15°). The '
          + 'alignment itself is not optional and needs no dial' },
    ],
  },
  {
    id: 'arms', label: 'Arms — the counter-swing',
    params: [
      { key: 'swing', label: 'shoulder swing', min: 0, max: 2.2, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'arm swing as a fraction of the thigh swing — 1.0 means the arms match the legs' },
      { key: 'swingRun', label: 'shoulder swing @run', min: 0, max: 2.2, step: 0.01, joints: ['shoulderL', 'shoulderR'] },
      { key: 'lift', label: 'shoulder lift @run', min: -0.8, max: 0.8, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'constant pitch added at speed: negative carries the hands high, boxer-style' },
      { key: 'elbow', label: 'elbow bend', min: 0, max: 2.0, step: 0.01, joints: ['elbowL', 'elbowR'] },
      { key: 'elbowRun', label: 'elbow bend @run', min: 0, max: 2.0, step: 0.01, joints: ['elbowL', 'elbowR'],
        help: 'a sprinter holds ~90°; a walker lets them hang' },
      { key: 'elbowPump', label: 'elbow pump', min: 0, max: 1.6, step: 0.01, joints: ['elbowL', 'elbowR'],
        help: 'extra fold on the forward half of each arm swing' },
      { key: 'tuck', label: 'arm tuck @run', min: -0.6, max: 0.8, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'roll the arms in toward the ribs instead of leaving them winged out' },
      { key: 'cross', label: 'arm cross @run', min: -0.8, max: 0.8, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'yaw the forward-swinging arm across the chest' },
    ],
  },
  {
    id: 'body', label: 'Body — what the torso does with it',
    params: [
      { key: 'bob', label: 'hip bob', min: 0, max: 0.8, step: 0.01, joints: ['hipsPos'],
        help: 'vertical drop on each push-off beat (scaled by body size)' },
      { key: 'pitch', label: 'hip pitch', min: -0.4, max: 0.9, step: 0.01, joints: ['hipsRot'],
        help: 'the whole frame tipping into the run' },
      { key: 'yaw', label: 'hip yaw', min: 0, max: 0.5, step: 0.005, joints: ['hipsRot'] },
      { key: 'roll', label: 'hip roll', min: 0, max: 0.4, step: 0.005, joints: ['hipsRot'] },
      { key: 'lean', label: 'torso lean', min: -0.3, max: 1.0, step: 0.01, joints: ['torso'],
        help: 'upper body angled forward at full speed' },
      { key: 'twist', label: 'torso counter-twist', min: 0, max: 0.6, step: 0.01, joints: ['torso'] },
      { key: 'head', label: 'head level', min: -1.0, max: 0.4, step: 0.01, joints: ['head'],
        help: 'negative pitches the head UP so the eyes stay on the horizon under a lean' },
    ],
  },
  {
    id: 'quad', label: 'Quadruped gallop', optional: true,
    params: [
      { key: 'onset', label: 'drops to four legs at', min: 0, max: 1, step: 0.01, joints: [],
        help: 'the speed ratio where the gallop STARTS coming in. Below it the body runs its biped '
          + 'gait untouched — for fenrir that is the sprint gait, so he jogs like a runner and only '
          + 'goes quadruped when he opens up' },
      { key: 'blend', label: 'blend-in speed', min: 0.05, max: 1, step: 0.01, joints: [],
        help: 'ratio span over which the gallop takes over from the biped stride, starting at the '
          + 'onset above: onset + this = fully on four legs' },
      { key: 'stride', label: 'stride length', min: 0.4, max: 1.6, step: 0.01, joints: [] },
      { key: 'lag', label: 'rotary lag', min: 0, max: 1.2, step: 0.01, joints: [],
        help: 'phase offset inside each pair, so the two hinds do not land as one' },
      { key: 'bodyPitch', label: 'body pitch', min: 0, max: 1.4, step: 0.01, joints: ['hipsRot'] },
      { key: 'bodyArch', label: 'body arch', min: 0, max: 0.6, step: 0.01, joints: ['hipsRot'] },
      { key: 'drop', label: 'chest drop', min: 0, max: 0.7, step: 0.01, joints: ['hipsPos'] },
      { key: 'heave', label: 'suspension heave', min: 0, max: 0.6, step: 0.01, joints: ['hipsPos'] },
      { key: 'frontReach', label: 'front reach', min: 0.4, max: 2.2, step: 0.01, joints: ['shoulderL', 'shoulderR'] },
      { key: 'frontSwing', label: 'front swing', min: 0, max: 1.6, step: 0.01, joints: ['shoulderL', 'shoulderR'] },
      { key: 'frontRake', label: 'front rake', min: 0, max: 1.6, step: 0.01, joints: ['shoulderL', 'shoulderR'] },
      { key: 'frontFold', label: 'front fold', min: 0, max: 2.4, step: 0.01, joints: ['elbowL', 'elbowR'] },
      // The gallop's OWN stride shaping, so the biped layer underneath can stay a
      // clean sprint. `legs.reach`/`legs.extend` are shared with every mech on the
      // base gait and apply at every speed; these two only exist once the gallop
      // is in, which is what lets one body jog like a runner and gallop like a wolf.
      { key: 'hindReach', label: 'hind reach', min: -1, max: 2, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'extra forward reach on the hinds, ON TOP of the base gait, faded in with the gallop' },
      { key: 'hindExtend', label: 'hind extension', min: -2.5, max: 1.5, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'extra rear extension on the hinds, on top of the base gait. NEGATIVE is right for a '
          + 'body whose hips are carried horizontally — the same joint reads the other way round' },
      { key: 'hindSwing', label: 'hind swing', min: 0, max: 2.0, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'the hind thigh\u2019s own sweep: peak-to-peak range is twice this, so 1.57 is a 180\u00b0 stride' },
      { key: 'hindCarry', label: 'hind thigh carry', min: -1.5, max: 1.5, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'where the hind thigh SITS, before the swing — the middle of the stride' },
      { key: 'hindFold', label: 'hind fold', min: -2.4, max: 2.4, step: 0.01, joints: ['kneeL', 'kneeR'] },
      { key: 'hindKneeCarry', label: 'hind knee carry', min: -2.0, max: 2.0, step: 0.01, joints: ['kneeL', 'kneeR'],
        help: 'where the hind knee SITS: this is what lifts the stifle up under the belly instead '
          + 'of letting it drag along the floor' },
      { key: 'hockSnap', label: 'hock snap', min: 0, max: 1.6, step: 0.01, joints: ['ankleL', 'ankleR'] },
      { key: 'hockCarry', label: 'hock carry', min: -2.0, max: 2.0, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'where the hock SITS — the paw\u2019s angle under the leg through the whole gallop' },
    ],
  },
];

const GROUPS = GAIT_SCHEMA.map((g) => g.id);

/** Flat list of every dial: { group, key, label, min, max, step, joints, help }. */
export function gaitParamList() {
  return GAIT_SCHEMA.flatMap((g) => g.params.map((p) => ({ ...p, group: g.id, groupLabel: g.label })));
}

// ---------------------------------------------------------------------------
// THE GAITS
// ---------------------------------------------------------------------------
export const GAITS = {
  // The shipped walk: the numbers that lived in animator.js, unchanged. Every
  // mech that names no gait runs this, so editing it moves the whole roster.
  // (The one thing that DID change with the move is not a number — the arms
  // counter-swing the legs now instead of marching with them; see applyGait.)
  standard: {
    name: 'Standard',
    note: 'The all-purpose walk→run. Upright carriage, moderate stride, arms hanging.',
    legs: {
      swing: 0.42, swingRun: 0.40, reach: 0.51, extend: 0.47,
      adduct: 0.08, adductRun: 0, adductTrail: 0.25,
      stanceBend: 0.14, stanceBendRun: 0.14,
      kneeLift: 0.70, kneeLiftRun: 0.65, kneePhase: 1.05,
      cadence: 0.92, cadenceCap: 14,
    },
    ankle: { roll: 0.51, tilt: -0.10, push: 0.70, pushRun: 0.80, level: 0, hang: 0 },
    arms: { swing: 0.75, swingRun: 0, lift: 0, elbow: 0.25, elbowRun: 0, elbowPump: 0.30, tuck: 0, cross: 0 },
    body: { bob: 0.19, pitch: 0.10, yaw: 0.09, roll: 0.05, lean: 0.30, twist: 0.11, head: -0.22 },
  },

  // THE FAST TIER — viper, tempest, wraith, nova. A light mech at full throttle
  // is SPRINTING, and a sprint is not a walk played faster:
  //   · the lead leg reaches out ahead of the body and the trailing leg finishes
  //     its push behind it (reach + extend), instead of a symmetric pendulum;
  //   · the feet track close to the midline (adduct) rather than straddling a
  //     shoulder-width base — the "legs far apart" read;
  //   · the knees fold high and the toe-off is hard;
  //   · the arms drive from bent elbows, tucked in beside the ribs, swinging
  //     nearly as far as the legs — a runner's arms, not a stroller's;
  //   · the whole frame is pitched forward into it, head up, the way the jet
  //     flight pose leans (see the `hovering` block in animator.js).
  // All of it rides on `ratio`, so these mechs still WALK normally at low speed.
  sprint: {
    name: 'Sprint',
    note: 'Light, fast mechs at full tilt: long reaching stride, narrow track, driving bent arms, body pitched into it.',
    legs: {
      swing: 0.44, swingRun: 0.36, reach: 0.28, extend: 0.16,
      adduct: 0.105, adductRun: 0, adductTrail: 0.215,
      stanceBend: 0.14, stanceBendRun: 0.16,
      kneeLift: 0.72, kneeLiftRun: 0.86, kneePhase: 1.93,
      cadence: 0.95, cadenceCap: 16,
    },
    ankle: { roll: 0.55, tilt: -0.14, push: 0.75, pushRun: 0.85, level: 0, hang: 0.26 },
    arms: { swing: 0.78, swingRun: 0.89, lift: -0.10, elbow: 0.25, elbowRun: 0.55, elbowPump: 0.40, tuck: 0.18, cross: 0.12 },
    body: { bob: 0.21, pitch: 0.12, yaw: 0.10, roll: 0.05, lean: 0.46, twist: 0.15, head: -0.36 },
  },

  // FENRIR — A SPRINTER WHO DROPS TO FOUR LEGS.
  //
  // `base: 'sprint'` is the whole of his slow end: below `quad.onset` the gallop
  // contributes nothing, so what runs is the sprint gait verbatim — driving bent
  // arms, narrow track, frame pitched into it. He JOGS like a runner. From onset
  // to onset+blend the rotary gallop fades in over the top and takes the body
  // quadruped, which is the transition you see when he opens up.
  //
  // That is why the block below is SHORT: everything not named here is sprint's,
  // and tuning sprint moves fenrir's jog along with viper's run. Only the things
  // that are true of a wolf and not of a runner are overridden, and the stride
  // shaping the GALLOP needs lives in the `quad` block (hindReach/hindExtend) so
  // it cannot leak back into the jog.
  quad: {
    name: 'Quadruped',
    note: 'Wolf lope: hinds drive as a pair against the fronts, spine arching on the gather.',
    // THE OWNER'S TUNING, restored. This block was briefly rewritten to inherit
    // `base: 'sprint'` with the gallop's stride shaping moved into
    // `quad.hindReach`/`hindExtend`; the result put fenrir on his belly with his
    // paws through the floor (sole min -20.9% of body height), so the values he
    // had tuned are back, self-contained, where they can be read in one place.
    // `quad.onset` is kept from that work — it only governs the speed the gallop
    // FADES IN at, not the shape of it, and it is what lets him jog on two legs
    // before he opens up.
    legs: {
      swing: 0.42, swingRun: 0.40, reach: 1.2, extend: -1.5,
      adduct: 0.085, adductRun: 0, adductTrail: 0,
      stanceBend: 0.14, stanceBendRun: 0.14,
      kneeLift: 0.70, kneeLiftRun: 0.65, kneePhase: 1.05,
      cadence: 0.92, cadenceCap: 14,
    },
    ankle: { roll: 0.5, tilt: -0.10, push: 0.70, pushRun: 0.80, level: 0, hang: 0 },
    arms: { swing: 0.75, swingRun: 0, lift: 0, elbow: 0.25, elbowRun: 0, elbowPump: 0.30, tuck: 0, cross: 0 },
    body: { bob: 0.19, pitch: 0.10, yaw: 0.09, roll: 0.05, lean: 0.30, twist: 0.11, head: -0.22 },
    quad: {
      onset: 0.40, blend: 0.35, stride: 0.85, lag: 0.30,
      // drop 0.32 -> 0.30: the 180-degree hind stride below needs the room, and
      // at 0.32 the paws swung 0.44 units UNDER the floor at full gallop
      bodyPitch: 0.60, bodyArch: 0.09, drop: 0.30, heave: 0.15,
      frontReach: 1.25, frontSwing: 0.65, frontRake: 0.45, frontFold: 1.20,
      // the stride shaping lives in `legs.reach`/`legs.extend` above, as it did
      // when this gallop was tuned — these two stay 0 so it is not applied twice
      hindReach: 0, hindExtend: 0,
      // A 180-DEGREE HIND STRIDE, as asked: the sweep is twice hindSwing, so 1.80
      // measures 178 degrees peak-to-peak on the thigh (it was 93 at 0.62).
      // hindCarry sits the middle of that stride a little forward so the wider
      // arc does not drive the knee into the floor, and hindKneeCarry lifts the
      // stifle for the same reason — measured: knee low point -0.00 -> 0.10,
      // paw low point -0.41 -> 0.30, both now clear of the ground.
      hindSwing: 1.80, hindCarry: -0.35,
      hindFold: 1.00, hindKneeCarry: 0.90,
      hockSnap: 0.75, hockCarry: -0.28,
    },
  },
};

// ---------------------------------------------------------------------------
// INHERITANCE. A gait may name a `base`, and then it IS that gait plus the keys
// it overrides — group by group, key by key, so `legs: { adduct }` changes one
// dial and keeps the other eleven.
//
// It is not sugar: it is the only way to say "this body's slow gait is that
// body's gait". Copying sprint's numbers into quad would read the same on the
// day it was written and drift the first time sprint was tuned, which is exactly
// the bug the shared gait table exists to avoid.
//
// Resolved ONCE, in place, so everything downstream — the animator, the
// workbench, every probe — sees one flat table and needs to know nothing about
// bases. `baseOf` remembers who came from where, for the parts that want to say
// so (the workbench header, formatGait).
// ---------------------------------------------------------------------------
const BASE_OF = {};
export const gaitBaseOf = (id) => BASE_OF[id] || null;
export const gaitHeirsOf = (id) => Object.keys(BASE_OF).filter((k) => BASE_OF[k] === id);

(function resolveGaits() {
  for (const [id, gait] of Object.entries(GAITS)) {
    const baseId = gait.base;
    if (!baseId) continue;
    const base = GAITS[baseId];
    if (!base) throw new Error(`gait '${id}' names an unknown base '${baseId}'`);
    if (base.base) throw new Error(`gait bases do not chain: '${baseId}' has its own base`);
    BASE_OF[id] = baseId;
    delete gait.base;
    for (const grp of GROUPS) {
      if (!base[grp]) continue;
      gait[grp] = { ...base[grp], ...(gait[grp] || {}) };
    }
  }
})();

export function gaitIds() { return Object.keys(GAITS); }

/** The gait id a roster def runs (an unknown or absent name falls back). */
export function gaitIdFor(def) {
  const id = def?.gait;
  return id && GAITS[id] ? id : DEFAULT_GAIT;
}

/** The gait a roster def runs. */
export function gaitFor(def) { return GAITS[gaitIdFor(def)]; }

/** A deep, independent copy — what the workbench edits. */
export function cloneGait(g) {
  const out = { name: g.name, note: g.note };
  for (const grp of GROUPS) if (g[grp]) out[grp] = { ...g[grp] };
  if (g.keys?.length) out.keys = g.keys.map((k) => ({ ph: k.ph, pose: JSON.parse(JSON.stringify(k.pose || {})) }));
  return out;
}

/** Every numeric difference between two gaits: [{ group, key, from, to }]. */
export function gaitDiff(a, b) {
  const out = [];
  for (const grp of GROUPS) {
    if (!a?.[grp] && !b?.[grp]) continue;
    for (const key of Object.keys(b?.[grp] || a[grp])) {
      const from = a?.[grp]?.[key], to = b?.[grp]?.[key];
      if (from === undefined || to === undefined) continue;
      if (Math.abs(from - to) > 1e-6) out.push({ group: grp, key, from, to });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CADENCE — how fast the gait phase turns.
//
// FOOT-PLANT CADENCE: the stance foot's backward sweep speed is
// legLen * swing * dφ/dt at mid-stance, so the phase must advance at whatever
// makes that equal the actual ground speed. Feet then plant and push off one
// spot per step instead of skating under a canned walk cycle.
//
// legLen is in the model's LOCAL units; a grown body's legs really are sizeMul
// times longer, so the same ground speed is that many times fewer steps. Miss
// that and a 4x colossus takes four strides per stride's worth of ground — the
// skating the giant form was full of. The ceiling scales with it for the same
// reason.
// ---------------------------------------------------------------------------
export function gaitPhaseRate(gait, { speed, ratio, legLen, sizeMul = 1 }) {
  const L = gait.legs;
  const swing = L.swing + L.swingRun * ratio;
  const reach = legLen * L.cadence * sizeMul;
  return Math.min(L.cadenceCap / sizeMul, speed / Math.max(0.2, reach * swing));
}

// ---------------------------------------------------------------------------
// THE CYCLE ITSELF. Pure: it adds this frame's locomotion onto a rest-pose
// target and touches nothing else, which is what lets the workbench measure
// d(joint)/d(parameter) by calling it twice.
//
// env: { ph, ratio, s, ankleGain, footFlat, rest, hipHeight, thighLen, shinLen }
//   ph         gait phase, radians
//   ratio      speed / maxSpeed, 0..1 — every `*Run` dial rides this
//   s          the model's scale (hip bob is a distance, not an angle)
//   ankleGain  foot-depth calibration (see Animator.calibrateFeet)
//   footFlat   how hard to keep a long sole parallel to the ground
//   rest       the rest pose, needed by the flat-sole correction
// ---------------------------------------------------------------------------
export function applyGait(tgt, gait, env) {
  const { ph, ratio, s = 1, ankleGain = 1, footFlat = 0, rest = null } = env;
  const L = gait.legs, A = gait.ankle, R = gait.arms, B = gait.body;

  const swing = L.swing + L.swingRun * ratio;
  const sinL = Math.sin(ph), sinR = Math.sin(ph + Math.PI);
  const fwdL = Math.max(0, sinL), fwdR = Math.max(0, sinR);
  const backL = Math.max(0, -sinL), backR = Math.max(0, -sinR);

  // ===== legs =====
  // A symmetric pendulum reads as a march; a run REACHES ahead and FINISHES
  // behind, so the forward and rear halves get their own extra amplitude.
  const reach = L.reach * ratio, extend = L.extend * ratio;
  tgt.thighL[0] += -swing * sinL - reach * fwdL + extend * backL;
  tgt.thighR[0] += -swing * sinR - reach * fwdR + extend * backR;
  // springy legs, not stilts: a soft stance bend that never locks the knee, a
  // bigger swing-phase lift, and (below) a plantar-flex TOE-OFF as the trailing
  // leg leaves the ground — the mech pushes itself forward
  const stanceBend = L.stanceBend + L.stanceBendRun * ratio;
  const lift = L.kneeLift + L.kneeLiftRun * ratio;
  tgt.kneeL[0] += stanceBend + lift * Math.max(0, Math.sin(ph + L.kneePhase));
  tgt.kneeR[0] += stanceBend + lift * Math.max(0, Math.sin(ph + Math.PI + L.kneePhase));
  // TRACK WIDTH: a runner's feet fall nearly single-file under the centre of
  // mass. Straddling a shoulder-width base at speed is the single loudest
  // "stiff" tell on the fast mechs.
  // ...and its TRAILING-FOOT twin, which is a different thing and needs a
  // different envelope. `adduct` is the same at every phase, so narrowing the
  // track with it moves the WHOLE stride inboard — including the foot the mech is
  // about to land on and stand on. `adductTrail` instead pulls a leg toward the
  // midline only through the FLICK: the moment after toe-off when the foot is off
  // the ground and still behind the body. It fades out as the leg swings forward,
  // so the foot comes back down at its normal width, takes the weight, and drives
  // the body over it — then flicks in again on the way back.
  //
  // GATED ON THE POSE, NOT ON THE PHASE: `air * back` from footStates(), the same
  // two weights the foot rule uses, and `air` is the MEASURED sole clearance
  // wherever the body has been calibrated. A PLANTED foot pulled sideways is a
  // skate — the one failure this dial could cause — and multiplying by `air` is
  // what makes that impossible rather than merely unlikely.
  const adduct = L.adduct + L.adductRun * ratio;
  const trail = L.adductTrail || 0;
  if (adduct || trail) {
    let tL = 0, tR = 0;
    if (trail && rest) {
      const fL = footStates(tgt, rest, 'L', env), fR = footStates(tgt, rest, 'R', env);
      tL = trail * fL.air * fL.back;
      tR = trail * fR.air * fR.back;
    }
    tgt.thighL[2] += adduct;
    tgt.thighR[2] -= adduct;
    // THE FLICK IS A KNEE ROLL, not a hip one: rolling the thigh swings the whole
    // leg in from the hip, which moves the knee as much as the foot; rolling the
    // KNEE tucks the shin and paw in under a hip that stays where it is, which is
    // the shape a runner's trailing leg actually makes.
    tgt.kneeL[2] += tL;
    tgt.kneeR[2] -= tR;
  }

  // ===== ankles =====
  // authored roll + toe-off, scaled to the foot's real depth (ankleGain) and
  // laid over a FLAT-SOLE base for long-footed models (footFlat) — see
  // Animator.calibrateFeet. Without both, a deep, long boot pitches about a
  // joint far above and behind its sole and buries a corner in the floor for
  // most of the cycle: the walk reads as pushing off air rather than pavement.
  // the heel-to-toe ROLL that shapes a planted foot. The TOE-OFF is not here any
  // more: it belongs to the push-off state, which applyFootRule works out from
  // the pose (planted AND behind) instead of from a phase window — the phase one
  // was firing ~100 degrees late, well after the foot had already left the ground.
  tgt.ankleL[0] += ankleGain * (swing * A.roll * sinL + A.tilt * ratio);
  tgt.ankleR[0] += ankleGain * (swing * A.roll * sinR + A.tilt * ratio);
  // (the TOE-BACK on a raised rear foot is applied last, by applyToeHang below —
  // it is a rule about the finished pose, so it has to run after the gallop layer
  // has had its say)

  // ===== arms: the COUNTER-swing =====
  // An arm swings OPPOSITE its own leg: left leg forward, left arm back. That
  // is not decoration — it is what cancels the leg's angular momentum about the
  // spine, and getting it backwards reads instantly as a wind-up toy.
  //
  // The sign trap: shoulder pitch runs the same way as thigh pitch (NEGATIVE is
  // forward), so an arm driven by `sinL` lands opposite the leg driven by
  // `-swing * sinL`, and one driven by `sinR` (= -sinL) marches WITH it. The
  // original engine used sinR here, which is why every mech's arms went along
  // for the ride instead of counterbalancing.
  const armSwing = swing * (R.swing + R.swingRun * ratio);
  tgt.shoulderL[0] += armSwing * sinL + R.lift * ratio;
  tgt.shoulderR[0] += armSwing * sinR + R.lift * ratio;
  // how far FORWARD each arm is right now, 0..1 — the pump and the cross both
  // want the arm at the front of its swing, and with the counter-swing above
  // that is the moment its OWN leg is at the back
  const armFwdL = backL, armFwdR = backR;
  const elbow = R.elbow + R.elbowRun * ratio;
  tgt.elbowL[0] += -elbow - R.elbowPump * ratio * armFwdL;
  tgt.elbowR[0] += -elbow - R.elbowPump * ratio * armFwdR;
  if (R.tuck) {
    const t = R.tuck * ratio;               // positive rolls both arms inward
    tgt.shoulderL[2] += t; tgt.shoulderR[2] -= t;
  }
  if (R.cross) {
    const c = R.cross * ratio;              // the forward arm swings across the chest
    tgt.shoulderL[1] += c * armFwdL; tgt.shoulderR[1] += -c * armFwdR;
  }

  // ===== body dynamics — bob rides the push-off beat =====
  tgt.hipsPos[1] += -Math.abs(Math.cos(ph)) * B.bob * ratio * s;
  tgt.hipsRot[0] += B.pitch * ratio;            // whole body pitches into the run
  tgt.hipsRot[1] += Math.sin(ph) * B.yaw * ratio;
  tgt.hipsRot[2] += Math.cos(ph) * B.roll * ratio;
  tgt.torso[0] += B.lean * ratio;               // upper body leans forward
  tgt.torso[1] += -Math.sin(ph) * B.twist * ratio;  // counter-rotate
  tgt.head[0] += B.head * ratio;                // eyes stay on the horizon

  // FLAT SOLE (long-footed models): level the foot against everything the chain
  // above it just pitched into it — run LAST, after hipsRot is set, so the
  // body's forward pitch is included. The authored roll above then rides on top
  // of a level plate instead of on top of the leg's own tilt.
  // …and only while the foot IS on the pavement (`1 - air weight`), so that above
  // the ground the foot can hang off the shin instead of being levelled straight
  // back out — see applyToeHang.
  //
  // How hard to level is the LARGER of two asks: what the model's own foot depth
  // measured (footFlat, from Animator.calibrateFeet — a long boot needs it or it
  // buries a corner) and what the GAIT asks for (`ankle.level`), for a body the
  // calibration never ran on.
  //
  // THE QUADRUPED LEAVES IT AT 0, MEASURED. calibrateFeet skips fenrir because a
  // hock is nothing like a boot, and asking the gait to level his paws is worse
  // than not: the levelling cancels hips + thigh + knee, which on a gallop
  // includes 34 degrees of body pitch, and a paw whose rest carriage is nothing
  // like flat came out dorsiflexed 130-170 degrees with its claws pointing at the
  // sky. His planted paws stay with the authored hock motion; what he does get
  // from this pass is the airborne half — a raised paw hangs at its resting line
  // like every other foot in the game.
  // WHICH FOOT IS UP, published for the passes that come after this one: the
  // gallop layer refines it (it knows its own flight phase, which no L-vs-R
  // comparison can see because a galloping quadruped lifts both hinds together)
  // and applyToeHang consumes it.
  env.air = { L: airWeight(tgt, rest, 'L', env), R: airWeight(tgt, rest, 'R', env) };
  // …and PUSHING OFF IS NOT STANDING: in late stance the toe stays on the ground
  // while the leg straightens and the heel comes up, so the foot is deliberately
  // NOT flat there. The levelling therefore only gets the weight that is neither
  // airborne nor pushing (see footStates).
  const levelAsk = Math.max(footFlat, A.level || 0);
  if (levelAsk > 0.01 && rest) {
    for (const side of ['L', 'R']) {
      const level = levelAsk * footStates(tgt, rest, side, env).stance;
      if (level < 0.01) continue;
      tgt['ankle' + side][0] -= level * (tgt.hipsRot[0]
        + (tgt['thigh' + side][0] - rest['thigh' + side][0])
        + (tgt['knee' + side][0] - rest['knee' + side][0]));
    }
  }
}

// ---------------------------------------------------------------------------
// QUADRUPED GALLOP (gaits with a `quad` block — FENRIR the wolf).
//
// A sprinting-wolf rotary gallop: the two HINDS drive as a pair EXACTLY half a
// cycle against the two FRONTS (a slight rotary lag inside each pair), the
// spine ARCHES as the hinds swing under the body and EXTENDS flat as they fire,
// and the whole frame rides low with a suspension rise on the flight phase.
// Runs OVER applyGait(), which is what it lerps out of at walking pace.
// ---------------------------------------------------------------------------
export function applyQuadGait(tgt, gait, env) {
  const Q = gait.quad;
  if (!Q) return;
  const { ph, ratio, s = 1, hipHeight = 1 } = env;
  // BELOW THE ONSET THIS PASS DOES NOTHING, which is the point: what is left is
  // the base gait, untouched. Fenrir's base is `sprint`, so his jog is a
  // runner's jog and the wolf only arrives as he opens up.
  const q = clamp01((ratio - (Q.onset ?? 0.4)) / Q.blend);
  if (q <= 0.01) return;
  const g = ph * Q.stride;                       // longer gallop stride
  const hind = Math.sin(g), hind2 = Math.sin(g + Q.lag);
  const front = Math.sin(g + Math.PI), front2 = Math.sin(g + Math.PI + Q.lag);
  const arch = Math.max(0, -hind);               // spine curls on the gather
  const ext = Math.max(0, hind);                 // and stretches on the drive
  // long, low, LEVEL frame: the back stays near-horizontal through the whole
  // cycle — only a subtle arch/heave rides the bound
  tgt.hipsRot[0] += (Q.bodyPitch + arch * Q.bodyArch) * q;
  tgt.hipsPos[1] += (-hipHeight * Q.drop + ext * Q.heave * s) * q;
  tgt.torso[0] += (0.1 + arch * 0.2) * q;        // curl under on the gather
  tgt.head[0] += (-0.7 - arch * 0.16) * q;       // muzzle level, eyes forward
  // FRONTS: stretch far out flat on the reach, fold and rake through
  const reachL = -Q.frontReach - Math.max(0, front) * Q.frontSwing + Math.min(0, front) * Q.frontRake;
  const reachR = -Q.frontReach - Math.max(0, front2) * Q.frontSwing + Math.min(0, front2) * Q.frontRake;
  tgt.shoulderL[0] = lerp(tgt.shoulderL[0], reachL, q);
  tgt.shoulderR[0] = lerp(tgt.shoulderR[0], reachR, q);
  tgt.shoulderL[2] = lerp(tgt.shoulderL[2], -0.1, q);
  tgt.shoulderR[2] = lerp(tgt.shoulderR[2], 0.1, q);
  // elbow ARROW-STRAIGHT on the reach, folded tight on the recovery
  tgt.elbowL[0] = lerp(tgt.elbowL[0], -0.1 - Math.max(0, -front) * Q.frontFold, q);
  tgt.elbowR[0] = lerp(tgt.elbowR[0], -0.1 - Math.max(0, -front2) * Q.frontFold, q);
  tgt.handL[0] = lerp(tgt.handL[0], 0.5, q);
  tgt.handR[0] = lerp(tgt.handR[0], 0.5, q);
  // HINDS: the engine — huge sweep, knees folding right up under the chest on
  // the gather, then a full-stretch fire with an ankle snap
  // …including the gallop's OWN reach and rear extension, which the base gait
  // must not carry: `legs.reach`/`legs.extend` apply at every speed and to every
  // mech sharing that gait, so a wolf's stride shaping written there would land
  // on his jog (and on viper). Same form as applyGait's pair — negative sin is
  // the forward half — scaled by ratio so it composes with them exactly.
  // the BIPED phase, not the gallop's own `g` — these reproduce terms that used
  // to live in applyGait, so they have to keep applyGait's beat
  const bs = Math.sin(ph);
  const hFwdL = Math.max(0, bs), hBackL = Math.max(0, -bs);
  const hFwdR = hBackL, hBackR = hFwdL;
  const qr = q * ratio;
  tgt.thighL[0] += (-(Q.hindReach || 0) * hFwdL + (Q.hindExtend || 0) * hBackL) * qr;
  tgt.thighR[0] += (-(Q.hindReach || 0) * hFwdR + (Q.hindExtend || 0) * hBackR) * qr;
  // THE THREE CARRIES — where each hind joint SITS through the gallop, before its
  // swing/fold/snap is added. They were hard-coded constants (-0.12, 0.3, -0.28)
  // tuned for one body; they are dials now because they are what decides whether
  // a hind knee rides UP under the belly or drags along the floor, and that is
  // the whole difference between a wolf and a lizard.
  const hCarry = Q.hindCarry ?? -0.12, kCarry = Q.hindKneeCarry ?? 0.3, aCarry = Q.hockCarry ?? -0.28;
  tgt.thighL[0] += (hCarry + hind * Q.hindSwing) * q;
  tgt.thighR[0] += (hCarry + hind2 * Q.hindSwing) * q;
  tgt.kneeL[0] += (kCarry + Math.max(0, hind) * Q.hindFold) * q;
  tgt.kneeR[0] += (kCarry + Math.max(0, hind2) * Q.hindFold) * q;
  tgt.ankleL[0] += (aCarry - Math.max(0, -hind) * Q.hockSnap) * q;
  tgt.ankleR[0] += (aCarry - Math.max(0, -hind2) * Q.hockSnap) * q;
  // WHICH PAW IS UP — the gallop's own answer, which replaces the biped layer's
  // guess as the gallop blends in. A galloping quadruped lifts both hinds
  // TOGETHER on the gather, so comparing left against right (all applyGait can
  // do) sees nothing; `hind` going negative IS the gather, and that is when the
  // paw is in the air and should hang off the hock instead of being driven.
  if (env.air) {
    env.air.L = lerp(env.air.L, clamp01(2.6 * Math.max(0, -hind)), q);
    env.air.R = lerp(env.air.R, clamp01(2.6 * Math.max(0, -hind2)), q);
  }
}

// ---------------------------------------------------------------------------
// HAND-KEYED CORRECTIONS — the escape hatch, for when the dials cannot say it.
//
// A gait is parametric: it has no frames, so there is nothing to key. What it
// DOES have is a phase, and that is enough to hang corrections off: `gait.keys`
// is a list of `{ ph, pose: { joint: [x, y, z] degrees } }`, each an ADDITIVE
// offset over whatever the cycle produced, interpolated around the loop (the last
// key wraps to the first, because a gait cycle is a circle and not a timeline).
//
// They are deliberately additive and deliberately EARLY — before the foot rule —
// so the rules that keep a foot honest still win. Rotating a planted ankle by
// hand is not a thing anyone should be able to do; rotating an elbow at the top
// of the swing is. The gait workbench enforces the same split in its UI.
//
// Nothing ships with keys. They exist so a shape the sliders cannot reach can be
// fixed by hand instead of by adding a dial for every possible complaint.
// ---------------------------------------------------------------------------
const D2R_ = Math.PI / 180;

/** The keys either side of `ph`, and how far between them it sits. */
function keySpan(keys, ph) {
  const n = keys.length;
  const at = ((ph % TAU_) + TAU_) % TAU_;
  let i = -1;
  for (let k = 0; k < n; k++) if (keys[k].ph <= at) i = k;
  const a = keys[(i + n) % n], b = keys[(i + 1) % n];
  let span = b.ph - a.ph;
  if (span <= 0) span += TAU_;                     // wrapped past the end
  let t = span > 1e-6 ? (at - a.ph) / span : 0;
  if (t < 0) t += TAU_ / span;
  return { a, b, t: clamp01(t) };
}

export function applyGaitKeys(tgt, gait, env = {}) {
  const keys = gait.keys;
  if (!keys?.length) return;
  const sorted = keys.slice().sort((x, y) => x.ph - y.ph);
  const { a, b, t } = keySpan(sorted, env.ph || 0);
  const joints = new Set([...Object.keys(a.pose || {}), ...Object.keys(b.pose || {})]);
  for (const j of joints) {
    const dst = tgt[j];
    if (!dst) continue;
    const va = a.pose?.[j] || [0, 0, 0], vb = b.pose?.[j] || [0, 0, 0];
    const k = j === 'hipsPos' ? (env.s || 1) : D2R_;   // hips translate, everything else rotates
    for (let i = 0; i < 3; i++) dst[i] += lerp(va[i], vb[i], t) * k;
  }
}

// ---------------------------------------------------------------------------
// THE FOOT RULE — the last word on a stride, and the one part of a gait that is
// not a curve.
//
// A foot is doing one of three things (see footStates), and only the first of
// them is about the world:
//
//   ON THE GROUND   the sole belongs FLAT ON IT, whatever the leg is doing. That
//                   is the levelling ask back in applyGait (`footFlat` from the
//                   model's own foot depth, or `ankle.level` from the gait), and
//                   it is world-space: it cancels hips + thigh + knee.
//   PUSHING OFF     planted but behind the body — the toe stays down while the leg
//                   straightens and the heel comes up. The foot pivots over the
//                   toe, so it is NOT flat and NOT hanging: it is driven hard down
//                   relative to the shin (`ankle.push` + `pushRun`, and ~90 degrees
//                   is what a real push-off reaches).
//   IN THE AIR      nothing holds a foot at an angle to the world. It hangs off the
//                   shin at its resting angle — perpendicular, for a body built
//                   that way; whatever its own bind says, for a digitigrade one.
//                   `ankle.hang` points the toe a little past that, which is what
//                   a runner does (~15 degrees) and a walker does not.
//
// Both non-stance states are JOINT-space rules — stated relative to the shin, not
// to the horizon — so one number lands the same on a boot, a talon and a paw.
//
// It runs LAST, after the gallop layer, so it covers fenrir's hinds too, and it
// BLENDS rather than adds: the stance shaping (roll, tilt) is handed back as the
// foot leaves the ground instead of accumulating into a pose no ankle holds.
// ---------------------------------------------------------------------------
export function applyToeHang(tgt, gait, env = {}) {
  const A = gait.ankle || {};
  const rest = env.rest || null;
  const r = (j) => (rest?.[j]?.[0] || 0);
  const ratio = env.ratio ?? 1;
  const pushAngle = (A.push || 0) + (A.pushRun || 0) * ratio;
  const hang = A.hang || 0;
  for (const side of ['L', 'R']) {
    const a = tgt['ankle' + side];
    if (!a || !tgt['thigh' + side]) continue;
    const st = footStates(tgt, rest, side, env);
    if (st.air + st.push < 0.01) continue;          // pure stance: leave it alone
    const home = r('ankle' + side);
    a[0] = a[0] * st.stance + (home + hang) * st.air + (home + pushAngle) * st.push;
  }
}

// ---------------------------------------------------------------------------
// EXPORT — the gait workbench's "Output gait" hands over exactly this text, so
// an edited gait can be pasted back into the GAITS table above verbatim.
// ---------------------------------------------------------------------------
const num = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export function formatGait(id, gait) {
  const lines = [`  ${id}: {`];
  // A GAIT WITH A BASE IS EMITTED AS ONE. Spelling every inherited number out
  // would paste back as a gait that no longer follows its base — the block would
  // look identical and silently stop tracking the gait it is supposed to be a
  // variant of. So name the base and print only what actually differs from it.
  const baseId = gaitBaseOf(id);
  const base = baseId ? GAITS[baseId] : null;
  if (baseId) lines.push(`    base: ${JSON.stringify(baseId)},`);
  lines.push(`    name: ${JSON.stringify(gait.name || id)},`);
  if (gait.note) lines.push(`    note: ${JSON.stringify(gait.note)},`);
  for (const grp of GROUPS) {
    const g = gait[grp];
    if (!g) continue;
    const inherited = base?.[grp];
    const body = Object.entries(g)
      .filter(([k, v]) => !inherited || !(k in inherited) || Math.abs(inherited[k] - v) > 1e-9)
      .map(([k, v]) => `${k}: ${num(v)}`);
    if (!body.length) continue;
    // legs and quad are long enough to want wrapping; the others fit one line
    if (body.join(', ').length <= 92) {
      lines.push(`    ${grp}: { ${body.join(', ')} },`);
    } else {
      lines.push(`    ${grp}: {`);
      let row = [];
      for (const b of body) {
        row.push(b);
        if (row.join(', ').length > 66) { lines.push(`      ${row.join(', ')},`); row = []; }
      }
      if (row.length) lines.push(`      ${row.join(', ')},`);
      lines.push('    },');
    }
  }
  // hand-keyed corrections, one key per line — see applyGaitKeys
  if (gait.keys?.length) {
    lines.push('    keys: [');
    for (const k of gait.keys.slice().sort((a, b) => a.ph - b.ph)) {
      const pose = Object.entries(k.pose || {})
        .map(([j, v]) => `${j}: [${v.map(num).join(', ')}]`).join(', ');
      lines.push(`      { ph: ${num(k.ph)}, pose: { ${pose} } },`);
    }
    lines.push('    ],');
  }
  lines.push('  },');
  return lines.join('\n');
}
