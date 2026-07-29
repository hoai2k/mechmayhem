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
import { lerp, clamp01 } from '../core/utils.js';

export const DEFAULT_GAIT = 'standard';

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
      { key: 'extend', label: 'rear extension', min: 0, max: 1.2, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'asymmetric extra swing BEHIND — the trailing leg finishing its push' },
      { key: 'adduct', label: 'track narrow', min: -0.5, max: 0.6, step: 0.005, joints: ['thighL', 'thighR'],
        help: 'hip roll toward the midline: positive brings the feet under the body' },
      { key: 'adductRun', label: 'track narrow @run', min: -0.5, max: 0.6, step: 0.005, joints: ['thighL', 'thighR'],
        help: 'extra midline pull at full speed (a runner tracks nearly single-file)' },
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
      { key: 'push', label: 'toe-off push', min: 0, max: 1.4, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'plantar flex as the trailing foot leaves the ground' },
      { key: 'pushRun', label: 'toe-off @run', min: 0, max: 1.4, step: 0.01, joints: ['ankleL', 'ankleR'] },
      { key: 'pushPhase', label: 'push phase', min: -3.14, max: 3.14, step: 0.01, joints: ['ankleL', 'ankleR'] },
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
      { key: 'blend', label: 'blend-in speed', min: 0.05, max: 1, step: 0.01, joints: [],
        help: 'ratio span over which the gallop takes over from the biped stride' },
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
      { key: 'hindSwing', label: 'hind swing', min: 0, max: 1.6, step: 0.01, joints: ['thighL', 'thighR'] },
      { key: 'hindFold', label: 'hind fold', min: 0, max: 2.4, step: 0.01, joints: ['kneeL', 'kneeR'] },
      { key: 'hockSnap', label: 'hock snap', min: 0, max: 1.6, step: 0.01, joints: ['ankleL', 'ankleR'] },
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
      swing: 0.42, swingRun: 0.40, reach: 0, extend: 0,
      adduct: 0, adductRun: 0,
      stanceBend: 0.14, stanceBendRun: 0.14,
      kneeLift: 0.70, kneeLiftRun: 0.65, kneePhase: 1.05,
      cadence: 0.92, cadenceCap: 14,
    },
    ankle: { roll: 0.5, tilt: -0.10, push: 0.40, pushRun: 0.40, pushPhase: -0.45 },
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
      adduct: 0.03, adductRun: 0.07,
      stanceBend: 0.14, stanceBendRun: 0.16,
      kneeLift: 0.72, kneeLiftRun: 0.86, kneePhase: 1.15,
      cadence: 0.95, cadenceCap: 16,
    },
    ankle: { roll: 0.55, tilt: -0.14, push: 0.42, pushRun: 0.45, pushPhase: -0.45 },
    arms: { swing: 0.78, swingRun: 0.12, lift: -0.10, elbow: 0.25, elbowRun: 0.55, elbowPump: 0.40, tuck: 0.18, cross: 0.12 },
    body: { bob: 0.21, pitch: 0.12, yaw: 0.10, roll: 0.05, lean: 0.46, twist: 0.15, head: -0.36 },
  },

  // FENRIR. The biped layer below still runs (it is what the gallop lerps out
  // of at low speed); the `quad` block is the rotary gallop that takes over.
  quad: {
    name: 'Quadruped',
    note: 'Wolf lope: hinds drive as a pair against the fronts, spine arching on the gather.',
    legs: {
      swing: 0.42, swingRun: 0.40, reach: 0, extend: 0,
      adduct: 0, adductRun: 0,
      stanceBend: 0.14, stanceBendRun: 0.14,
      kneeLift: 0.70, kneeLiftRun: 0.65, kneePhase: 1.05,
      cadence: 0.92, cadenceCap: 14,
    },
    ankle: { roll: 0.5, tilt: -0.10, push: 0.40, pushRun: 0.40, pushPhase: -0.45 },
    arms: { swing: 0.75, swingRun: 0, lift: 0, elbow: 0.25, elbowRun: 0, elbowPump: 0.30, tuck: 0, cross: 0 },
    body: { bob: 0.19, pitch: 0.10, yaw: 0.09, roll: 0.05, lean: 0.30, twist: 0.11, head: -0.22 },
    quad: {
      blend: 0.35, stride: 0.85, lag: 0.30,
      bodyPitch: 0.60, bodyArch: 0.09, drop: 0.32, heave: 0.15,
      frontReach: 1.25, frontSwing: 0.65, frontRake: 0.45, frontFold: 1.20,
      hindSwing: 0.62, hindFold: 1.00, hockSnap: 0.75,
    },
  },
};

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
  const adduct = L.adduct + L.adductRun * ratio;
  if (adduct) { tgt.thighL[2] += adduct; tgt.thighR[2] -= adduct; }

  // ===== ankles =====
  // authored roll + toe-off, scaled to the foot's real depth (ankleGain) and
  // laid over a FLAT-SOLE base for long-footed models (footFlat) — see
  // Animator.calibrateFeet. Without both, a deep, long boot pitches about a
  // joint far above and behind its sole and buries a corner in the floor for
  // most of the cycle: the walk reads as pushing off air rather than pavement.
  const pushL = Math.max(0, -Math.sin(ph + A.pushPhase));
  const pushR = Math.max(0, -Math.sin(ph + Math.PI + A.pushPhase));
  const push = A.push + A.pushRun * ratio;
  tgt.ankleL[0] += ankleGain * (swing * A.roll * sinL + A.tilt * ratio - push * pushL);
  tgt.ankleR[0] += ankleGain * (swing * A.roll * sinR + A.tilt * ratio - push * pushR);

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
  if (footFlat > 0.01 && rest) {
    for (const side of ['L', 'R']) {
      tgt['ankle' + side][0] -= footFlat * (tgt.hipsRot[0]
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
  const q = clamp01((ratio - 0.4) / Q.blend);
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
  tgt.thighL[0] += (-0.12 + hind * Q.hindSwing) * q;
  tgt.thighR[0] += (-0.12 + hind2 * Q.hindSwing) * q;
  tgt.kneeL[0] += (0.3 + Math.max(0, hind) * Q.hindFold) * q;
  tgt.kneeR[0] += (0.3 + Math.max(0, hind2) * Q.hindFold) * q;
  tgt.ankleL[0] += (-0.28 - Math.max(0, -hind) * Q.hockSnap) * q;
  tgt.ankleR[0] += (-0.28 - Math.max(0, -hind2) * Q.hockSnap) * q;
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
  lines.push(`    name: ${JSON.stringify(gait.name || id)},`);
  if (gait.note) lines.push(`    note: ${JSON.stringify(gait.note)},`);
  for (const grp of GROUPS) {
    const g = gait[grp];
    if (!g) continue;
    const body = Object.entries(g).map(([k, v]) => `${k}: ${num(v)}`);
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
  lines.push('  },');
  return lines.join('\n');
}
