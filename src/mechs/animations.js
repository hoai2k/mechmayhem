// Keyframe clips for combat & personality. Angles in DEGREES for authoring;
// compiled to radians. hipsPos is in meters at scale=1 (multiplied by mech scale).
//
// Joint conventions (mech faces +Z, limbs hang -Y):
//   shoulder.x negative  -> arm swings forward/up
//   elbow.x negative     -> elbow flexes forward
//   thigh.x negative     -> leg swings forward
//   knee.x positive      -> knee bends (shin back)
//   torso.y negative     -> right shoulder comes forward
//   shoulderL.z negative -> left arm flares outward (mirror for R)
import { REST_FULL } from './clips/rest.js';
import {
  COLOSSUS_CLAP, COLOSSUS_CLAP_HOLD, COLOSSUS_TAUNT, CRANKY_TAUNT,
  FENRIR_TAUNT, FROGGER_SHOOT_GLB, FROGGER_TAUNT, GLACIER_TAUNT,
  INFERNO_FLAME_GLB, INFERNO_TAUNT, JERRY_SHOOT_GLB, JERRY_TAUNT,
  KONGA_TAUNT, NULLBOT_TAUNT, RHINO_TAUNT, SAURION_CLAW_R_GLB,
  SAURION_KICK1_GLB, SAURION_KICK2_GLB, SAURION_TAUNT, SAURION_VICTORY,
  TEMPEST_TAUNT, TITANUS_TAUNT, TRITONE_CHARGE, TRITONE_LAND,
  TRITONE_LAND_REACH, TRITONE_SLAM, TRITONE_TAUNT, VIPER_TAUNT,
  VULCAN_TAUNT, WRAITH_TAUNT,
} from './clips/index.js';
// the per-mech tables other modules read, still importable from here
export {
  NULLBOT_JITTER, RHINO_STOMP, VIPER_JIG, INFERNO_VENT, infernoVentPlan, GLACIER_FREEZE, COLOSSUS_SLOWCLAP,
} from './clips/index.js';

export const UPPER_JOINTS = [
  'torso', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR',
];

// key: { t, ease?, pose: { joint: [x,y,z] | hipsPos: [x,y,z] | hipsRot: [x,y,z] } }
// Shared return-to-rest end keys. A pose key only drives the joints it
// lists, so these are distinct variants, not one constant: FULL squares
// everything ankles-down, ARMSTANCE keeps handR keyed (the lance-carry
// family), UPPER leaves ankles to the locomotion blend. Use one ONLY when
// the clip's final key matches it exactly — near-misses stay inline.
const REST_ARMSTANCE = { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0] };
const REST_UPPER = { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] };

// The tight-ball tuck the air somersault curls into, and the stretched-long
// pre-landing reach — named because each is shared across two places: the
// tuck is both the `ball` clip's held key and the base a roster `ballPose`
// override is merged over (defClipVariants), and the stretch is both
// landReach's held pose and land's t=0 (the touchdown handover).
const BALL_TUCK = { hipsPos: [0, -0.12, 0], hipsRot: [14, 0, 0], torso: [52, 0, 0], head: [26, 0, 0], thighL: [-96, 0, -4], thighR: [-100, 0, 4], kneeL: [126, 0, 0], kneeR: [122, 0, 0], ankleL: [-30, 0, 0], ankleR: [-30, 0, 0], shoulderL: [-62, 18, 4], shoulderR: [-62, -18, -4], elbowL: [-112, 0, 0], elbowR: [-112, 0, 0], handL: [24, 0, 0], handR: [24, 0, 0] };
const LAND_STRETCH = { hipsPos: [0, 0.12, 0], hipsRot: [0, 0, 0], torso: [6, 0, 0], head: [-6, 0, 0], thighL: [-6, 0, -3], thighR: [-6, 0, 3], kneeL: [6, 0, 0], kneeR: [6, 0, 0], ankleL: [-32, 0, 0], ankleR: [-32, 0, 0], shoulderL: [-38, 0, -58], shoulderR: [-38, 0, 58], elbowL: [-18, 0, 0], elbowR: [-18, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] };

// ---------- SAURION's PERCH (biteLatch) ----------
// The pose vocabulary for riding a kill: he does not just bite it, he HOLDS IT
// DOWN and opens it up. A raptor's hands are hooked sickles carried in front —
// on top of prey they chamber high and drag down through it, alternating, while
// the jaws hammer the collar between rakes. Arm values are ABSOLUTE (only
// legs/torso/head take the restPose bias) and every one of them sits inside his
// `foreCarry` band, so the compile-time clamp leaves them exactly as authored.
const perchCarry = (s) => ({            // claws hooked into what he is standing on
  ['shoulder' + s]: [-74, 0, s === 'L' ? -20 : 20], ['elbow' + s]: [-58, 0, 0],
  ['hand' + s]: [30, 0, s === 'L' ? 12 : -12],
});
// The rake is his own forehand SWIPE (saurionClawR) reshaped for a body he is
// standing ON: the drive is shoulder YAW carrying the claw ACROSS the thing
// under him while the elbow EXTENDS, not a shoulder pitched out to the side —
// which is what the first version did, and it read as presenting the claw
// rather than opening anything with it.
const perchChamber = (s) => ({          // …cocked high and outboard
  ['shoulder' + s]: [-116, s === 'L' ? -22 : 22, s === 'L' ? -28 : 28],
  ['elbow' + s]: [-92, 0, 0], ['hand' + s]: [40, 0, s === 'L' ? 16 : -16],
});
const perchRake = (s) => ({             // …and DRAGGED down and across them
  ['shoulder' + s]: [-44, s === 'L' ? 24 : -24, s === 'L' ? 6 : -6],
  ['elbow' + s]: [-34, 0, 0], ['hand' + s]: [-12, 0, s === 'L' ? 6 : -6],
});
const PERCH_UP = { torso: [22, 0, 0], head: [-14, 0, 0], hipsRot: [20, 0, 0], hipsPos: [0, -0.55, 0] };
const PERCH_BITE = { torso: [38, 0, 0], head: [55, 0, 0], hipsRot: [26, 0, 0], hipsPos: [0, -0.68, 0] };
const PERCH_LEGS = { thighL: [-24, 0, -10], thighR: [-24, 0, 10], kneeL: [40, 0, 0], kneeR: [40, 0, 0],
  ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] };
// THE FOUR BEATS, in clip seconds — bite, right rake, bite, left rake. The
// hits are scheduled against these numbers (combat/specials.js sickleRush), so
// the blow lands on the frame the limb arrives rather than near it.
export const PERCH_BEATS = { bite1: 0.07, rakeR: 0.24, bite2: 0.37, rakeL: 0.54, loop: 0.6 };


const CLIPS_RAW = {
  // ---------- personality ----------
  intro: {
    dur: 2.3, cancelOnMove: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -1.5, 0], torso: [42, 0, 0], head: [-30, 0, 0], shoulderL: [20, 0, -14], shoulderR: [20, 0, 14], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], kneeL: [95, 0, 0], kneeR: [95, 0, 0], thighL: [-52, 0, 0], thighR: [-52, 0, 0], ankleL: [-40, 0, 0], ankleR: [-40, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { hipsPos: [0, -1.4, 0], torso: [40, 0, 0], head: [-28, 0, 0] } },
      { t: 1.25, ease: 'outCubic', pose: { hipsPos: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0] } },
      { t: 1.6, ease: 'outBack', pose: { shoulderL: [-15, 0, -30], shoulderR: [-15, 0, 30], elbowL: [-115, 0, 0], elbowR: [-115, 0, 0], torso: [-6, 0, 0], head: [6, 0, 0] } },
      { t: 2.3, ease: 'inOutQuad', pose: { shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], torso: [0, 0, 0], head: [0, 0, 0] } },
    ],
    events: [{ t: 1.55, type: 'sfx', arg: 'powerup' }],
  },
  victory: {
    dur: 2.6, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, ease: 'outBack', pose: { shoulderR: [-165, 0, 18], elbowR: [-20, 0, 0], torso: [-10, 0, -6], head: [-12, 0, 0], shoulderL: [10, 0, -18], elbowL: [-30, 0, 0] } },
      { t: 0.8, ease: 'inOutQuad', pose: { shoulderR: [-150, 0, 14] } },
      { t: 1.1, ease: 'outBack', pose: { shoulderR: [-168, 0, 18] } },
      { t: 2.0, ease: 'inOutQuad', pose: { shoulderR: [-150, 0, 25], elbowR: [-115, 0, 0], torso: [-6, 0, 0] } },
    ],
    events: [{ t: 0.35, type: 'sfx', arg: 'powerup' }],
  },
  taunt: {
    dur: 1.3, cancelOnMove: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'outQuad', pose: { torso: [14, 12, 0], head: [-10, -10, 0], shoulderR: [-72, 0, 16], elbowR: [-70, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { elbowR: [-30, 0, 0] } },
      { t: 0.75, ease: 'inOutQuad', pose: { elbowR: [-75, 0, 0] } },
      { t: 1.3, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.35, type: 'sfx', arg: 'taunt' }],
  },

  // ---------- melee ----------
  // exaggerated wind-ups, full-body twist (hipsRot), side leans and outBack
  // overshoot on the strikes — snappy anime energy instead of stiff robots.
  light1: { // left jab — a REAL pull-back first (fist chambers, hips coil
    // right), then the whip through the punch
    strikeArm: 'L', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.52,
    keys: [
      { t: 0, pose: {} },
      { t: 0.11, ease: 'outCubic', pose: { torso: [6, -22, -6], hipsRot: [0, -10, 0], shoulderL: [-26, 8, -20], elbowL: [-112, 0, 0], shoulderR: [10, 0, 18], head: [0, 10, 0] } },
      { t: 0.23, ease: 'outBack', pose: { torso: [10, 26, 8], hipsRot: [0, 14, 0], hipsPos: [0, -0.12, 0], shoulderL: [-98, -14, 24], elbowL: [-4, 0, 0], shoulderR: [18, 0, 26], head: [0, -12, 0] } },
      { t: 0.34, ease: 'inOutQuad', pose: { torso: [7, 18, 5], hipsRot: [0, 10, 0], shoulderL: [-84, -10, 18], elbowL: [-24, 0, 0] } },
      { t: 0.52, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], shoulderR: [0, 0, 10], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.2, type: 'sfx', arg: 'whoosh' }, { t: 0.23, type: 'hit', arg: 0 }],
  },
  light2: { // right cross — chambers deep behind the shoulder, then the
    // counter-twist throws it through
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.56,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [7, 24, 6], hipsRot: [0, 12, 0], shoulderR: [-30, -8, 22], elbowR: [-116, 0, 0], shoulderL: [12, 0, -20], head: [0, -10, 0] } },
      { t: 0.25, ease: 'outBack', pose: { torso: [10, -30, -8], hipsRot: [0, -16, 0], hipsPos: [0, -0.14, 0], shoulderR: [-100, 14, -24], elbowR: [-2, 0, 0], shoulderL: [20, 0, -28], head: [0, 12, 0] } },
      { t: 0.37, ease: 'inOutQuad', pose: { torso: [7, -20, -5], hipsRot: [0, -11, 0], shoulderR: [-86, 10, -18], elbowR: [-22, 0, 0] } },
      { t: 0.56, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.22, type: 'sfx', arg: 'whoosh' }, { t: 0.25, type: 'hit', arg: 1 }],
  },
  light3: { // rising uppercut — deep coil, launch onto tiptoes, fist driven up
    // THROUGH the target line. The strike used to swing the arm to −150° pitch,
    // which is past vertical: measured on the rig, the fist ended 0.16 units in
    // front of the hips and 5.1 up — directly over his own shoulder, so the blow
    // read as raising an arm rather than punching. It now lands where the jab and
    // cross land (fwd 2.8 vs their ~3.0) but higher (up 2.9 vs 2.1) and ON the
    // centreline (lat 0.04, was 0.89 across to the far side): a rising blow into
    // the same spot, with the torso unwinding to drive the shoulder through it
    // rather than arching away from it. Solved with a grid search over the
    // strike-frame shoulder/elbow/torso against those measured fist positions.
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.62,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'inOutCubic', pose: { hipsPos: [0, -0.7, 0], hipsRot: [0, 16, 0], torso: [30, 20, -10], head: [8, -8, 0], shoulderR: [22, 0, 14], elbowR: [-130, 0, 0], shoulderL: [-20, 0, -30], elbowL: [-40, 0, 0], kneeL: [55, 0, 0], kneeR: [55, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0] } },
      { t: 0.32, ease: 'outBack', pose: { hipsPos: [0, 0.35, 0], hipsRot: [0, -14, 0], torso: [-14, -22, 8], head: [-14, 6, 0], shoulderR: [-80, 24, 0], elbowR: [-25, 0, 0], shoulderL: [10, 0, -36], elbowL: [-60, 0, 0], kneeL: [4, 0, 0], kneeR: [12, 0, 0], thighL: [6, 0, 0], thighR: [-8, 0, 0], ankleL: [22, 0, 0], ankleR: [22, 0, 0] } },
      { t: 0.62, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.27, type: 'sfx', arg: 'whooshBig' }, { t: 0.3, type: 'hit', arg: 2 }],
  },
  // ---------- VIPER: ninja sword forms ----------
  // blade-led arcs and lunging thrusts: the elbow stays near-straight so the
  // forearm energy daggers LEAD every move — never a punch holding a sword.
  viperSlash1: { // right blade: draws BACK across the far shoulder first,
    // then the horizontal right-to-left cut across the throat line
    dur: 0.5,
    keys: [
      { t: 0, pose: {} },
      { t: 0.1, ease: 'outCubic', pose: { torso: [4, 30, 5], hipsRot: [0, 14, 0], head: [0, -14, 0], shoulderR: [-62, 42, 30], elbowR: [-26, 0, 0], handR: [0, 0, 35], shoulderL: [12, 0, -22], elbowL: [-40, 0, 0] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [8, -34, -7], hipsRot: [0, -17, 0], hipsPos: [0, -0.12, 0], head: [0, 14, 0], shoulderR: [-96, -30, -20], elbowR: [-3, 0, 0], handR: [0, 0, -30], shoulderL: [18, 0, -28] } },
      { t: 0.34, ease: 'inOutQuad', pose: { torso: [6, -24, -5], hipsRot: [0, -12, 0], shoulderR: [-88, -24, -14] } },
      { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0] } },
    ],
    events: [{ t: 0.19, type: 'sfx', arg: 'slash' }, { t: 0.22, type: 'hit', arg: 0 }],
  },
  viperSlash2: { // left blade: drops to the hip first, then the rising
    // reverse diagonal — low hip to high shoulder
    dur: 0.54,
    keys: [
      { t: 0, pose: {} },
      { t: 0.11, ease: 'outCubic', pose: { torso: [10, -30, -6], hipsRot: [0, -14, 0], hipsPos: [0, -0.16, 0], head: [0, 12, 0], shoulderL: [-30, -40, -38], elbowL: [-20, 0, 0], handL: [0, 0, -35], shoulderR: [14, 0, 24], elbowR: [-45, 0, 0] } },
      { t: 0.23, ease: 'outBack', pose: { torso: [-6, 32, 8], hipsRot: [0, 16, 0], hipsPos: [0, 0.05, 0], head: [-6, -12, 0], shoulderL: [-124, 26, 18], elbowL: [-4, 0, 0], handL: [0, 0, 30], shoulderR: [20, 0, 30] } },
      { t: 0.36, ease: 'inOutQuad', pose: { torso: [-4, 22, 6], hipsRot: [0, 11, 0], shoulderL: [-112, 20, 14] } },
      { t: 0.54, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], handL: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.2, type: 'sfx', arg: 'slash' }, { t: 0.23, type: 'hit', arg: 1 }],
  },
  viperStab: { // combo ender: coiled low, then a full-body lunging skewer
    dur: 0.6,
    keys: [
      { t: 0, pose: {} },
      { t: 0.14, ease: 'inOutCubic', pose: { torso: [6, 30, 0], hipsRot: [0, 16, 0], hipsPos: [0, -0.3, -0.1], head: [0, -14, 0], shoulderR: [-28, 20, 14], elbowR: [-98, 0, 0], handR: [0, 0, 20], shoulderL: [-14, 0, -30], elbowL: [-55, 0, 0], thighL: [-30, 0, 0], kneeL: [50, 0, 0], thighR: [12, 0, 0], kneeR: [30, 0, 0] } },
      { t: 0.28, ease: 'outBack', pose: { torso: [24, -26, -4], hipsRot: [4, -14, 0], hipsPos: [0, -0.34, 0.3], head: [-10, 12, 0], shoulderR: [-94, -8, 2], elbowR: [0, 0, 0], handR: [0, 0, 0], shoulderL: [18, 0, -34], elbowL: [-30, 0, 0], thighL: [-48, 0, 0], kneeL: [58, 0, 0], thighR: [26, 0, 0], kneeR: [60, 0, 0], ankleR: [24, 0, 0] } },
      { t: 0.42, ease: 'inOutQuad', pose: { torso: [20, -20, -3], hipsPos: [0, -0.3, 0.24] } },
      { t: 0.6, ease: 'inOutQuad', pose: REST_ARMSTANCE },
    ],
    events: [{ t: 0.24, type: 'sfx', arg: 'whoosh' }, { t: 0.28, type: 'hit', arg: 2 }],
  },
  viperWhirl: { // BLADE CYCLONE carriage (upper-body only, so the LEGS keep
    // walking underneath): both swords thrown out level like rotor blades,
    // arms see-sawing so the cuts carve different heights — the special
    // spins the torso joint post-pose, IG-11 style
    dur: 0.5, loop: true, upper: true,
    keys: [
      { t: 0, pose: { torso: [6, 0, 0], head: [-4, 0, 0], shoulderL: [-18, 0, -86], shoulderR: [-10, 0, 86], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], handL: [0, 0, -10], handR: [0, 0, 10] } },
      { t: 0.25, ease: 'inOutQuad', pose: { shoulderL: [-8, 0, -84], shoulderR: [-22, 0, 84], torso: [8, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { shoulderL: [-18, 0, -86], shoulderR: [-10, 0, 86], torso: [6, 0, 0] } },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'whoosh' }, { t: 0.35, type: 'sfx', arg: 'whoosh' }],
  },
  viperHeavy: { // kesa-giri: blade raised high behind the head, then one great
    // diagonal cut down through the target with full follow-through
    dur: 0.8,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { torso: [-18, 28, 8], hipsRot: [-4, 12, 0], hipsPos: [0, -0.22, 0], head: [8, -12, 0], shoulderR: [-168, 14, 28], elbowR: [-24, 0, 0], handR: [0, 0, 25], shoulderL: [-20, 0, -34], elbowL: [-60, 0, 0], kneeL: [40, 0, 0], kneeR: [40, 0, 0], thighL: [-20, 0, 0], thighR: [-20, 0, 0] } },
      { t: 0.42, ease: 'inCubic', pose: { torso: [34, -28, -10], hipsRot: [8, -14, 0], hipsPos: [0, -0.42, 0.16], head: [4, 12, 0], shoulderR: [-52, -24, -28], elbowR: [-4, 0, 0], handR: [0, 0, -35], shoulderL: [16, 0, -30], elbowL: [-24, 0, 0], kneeL: [55, 0, 0], kneeR: [55, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0], ankleL: [-22, 0, 0], ankleR: [-22, 0, 0] } },
      { t: 0.58, ease: 'outQuad', pose: { torso: [28, -22, -8], hipsPos: [0, -0.34, 0.12] } },
      { t: 0.8, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0] } },
    ],
    events: [{ t: 0.38, type: 'sfx', arg: 'whooshBig' }, { t: 0.42, type: 'hit', arg: 0 }, { t: 0.44, type: 'shake', arg: 0.4 }],
  },

  frozenSurrender: { // GLACIER's finisher victim: iced over mid-surrender —
    // both hands thrown in the air, slight cower, held solid
    dur: 0.55, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.55, ease: 'outCubic', pose: { shoulderL: [-160, 0, -18], shoulderR: [-160, 0, 18], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], torso: [-10, 0, 0], head: [-14, 0, 0], hipsPos: [0, -0.1, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
    ],
  },
  daintyTap: { // GLACIER's finisher: one delicate outstretched poke —
    // barely a touch, all it takes
    dur: 0.85,
    keys: [
      { t: 0, pose: {} },
      { t: 0.32, ease: 'inOutCubic', pose: { torso: [4, -10, 0], head: [2, 8, 0], hipsPos: [0, -0.04, 0.05], shoulderR: [-60, 0, 6], elbowR: [-48, 0, 0], handR: [-16, 0, 0], shoulderL: [4, 0, -14] } },
      { t: 0.46, ease: 'outCubic', pose: { shoulderR: [-74, 0, 2], elbowR: [-10, 0, 0], torso: [6, -12, 0], hipsPos: [0, -0.05, 0.09] } },
      { t: 0.85, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10] } },
    ],
    events: [{ t: 0.42, type: 'sfx', arg: 'servo' }],
  },
  viperDrill: { // heavy: ninja coil, then the whole body launches FLAT and
    // corkscrews forward — both blades speared ahead as the drill point
    // (fighter.js heavySpin barrel-rolls the hips; heavyDrive flies it)
    dur: 0.95,
    keys: [
      { t: 0, pose: {} },
      { t: 0.24, ease: 'inOutCubic', pose: { hipsPos: [0, -0.85, 0], hipsRot: [0, 8, 0], torso: [20, 10, 0], head: [-10, -8, 0], shoulderL: [-42, 30, -48], shoulderR: [-42, -30, 48], elbowL: [-72, 0, 0], elbowR: [-72, 0, 0], handL: [0, 0, -30], handR: [0, 0, 30], kneeL: [80, 0, 0], kneeR: [80, 0, 0], thighL: [-42, 0, 0], thighR: [-42, 0, 0], ankleL: [-34, 0, 0], ankleR: [-34, 0, 0] } },
      { t: 0.36, ease: 'outCubic', pose: { hipsPos: [0, 0.5, 0], hipsRot: [90, 0, 0], torso: [0, 0, 0], head: [12, 0, 0], shoulderL: [-172, 0, -6], shoulderR: [-172, 0, 6], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0], kneeL: [8, 0, 0], kneeR: [8, 0, 0], thighL: [4, 0, -3], thighR: [4, 0, 3], ankleL: [-30, 0, 0], ankleR: [-30, 0, 0] } },
      { t: 0.72, ease: 'inOutQuad', pose: { hipsPos: [0, 0.42, 0], hipsRot: [90, 0, 0] } },
      { t: 0.95, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.3, type: 'sfx', arg: 'dash' }, { t: 0.44, type: 'sfx', arg: 'whooshBig' }, { t: 0.55, type: 'hit', arg: 0 }, { t: 0.57, type: 'shake', arg: 0.35 }],
  },
  tempestTornado: { // heavy: arms fling wide and the whole frame spins up
    // into a tornado (heavySpin whirls the hips; the aura FX ride along) —
    // two hit beats as the vortex grinds through the target.
    // The arms go OUT, never up: they snap to a flat T the instant the spin
    // starts (t=0.26, the heavySpin t0) and PUMP there across the whole
    // whirl — dropping along the body between passes, launching back out
    // sideways on the next.
    //   T pose   shoulder roll -92 / +92 with ZERO pitch and a straight elbow
    //            is the flat T on this rig, measured on BOTH routes: hands
    //            land at y 1.8-2.0 against shoulders at y 1.64-1.77, at full
    //            3.6-3.9 horizontal reach. Pitch is what breaks it — a -24
    //            dragged the hands forward and below the shoulder line — and
    //            roll past ~100 lifts them into a Y, not a T.
    //   ease     the launches are outCUBIC, not outBack: outBack overshoots
    //            ~10% past the key, which on a 16 -> 92 roll peaks near 100
    //            and reads as the arms going UP over the shoulders. Cubic
    //            stops them dead flat.
    //   drop     roll ±16 with elbow -22: arms swing back down along the body
    //            between passes so the next launch reads (measured in battle,
    //            the hands swing from y 1.7 at the T down to y 0.3).
    //   dwell    each T is keyed TWICE (0.26+0.30, 0.46+0.50, 0.68+0.72) —
    //            without the second key the target starts falling the instant
    //            it arrives, and the animator's 26/s pose-chase only ever
    //            reaches ~-83 of the -92. The dwell lets it saturate: measured
    //            in battle, -88 and full hand spread by t≈0.30, well inside
    //            the first revolution (which ends at 0.26 + 2π/28.8 ≈ 0.48).
    // heavySpin runs t 0.26-1.07 at 28.8 rad/s ≈ 3.7 turns (0.22s a turn), so
    // the T's (0.26, 0.46, 0.68, 0.90) and the drops between them sit about
    // one pump per revolution, with a T carrying each hit beat.
    dur: 1.22,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'inOutCubic', pose: { hipsPos: [0, -0.4, 0], torso: [10, 20, 0], head: [0, -10, 0], shoulderL: [-20, 30, -20], shoulderR: [-20, -30, 20], elbowL: [-110, 0, 0], elbowR: [-110, 0, 0], kneeL: [40, 0, 0], kneeR: [40, 0, 0], thighL: [-22, 0, 0], thighR: [-22, 0, 0] } },
      { t: 0.26, ease: 'outCubic', pose: { hipsPos: [0, 0.18, 0], torso: [-6, 0, 0], head: [-8, 0, 0], shoulderL: [0, 0, -92], shoulderR: [0, 0, 92], elbowL: [0, 0, 0], elbowR: [0, 0, 0], kneeL: [8, 0, 0], kneeR: [8, 0, 0], thighL: [-4, 0, 0], thighR: [-4, 0, 0] } },
      { t: 0.30, ease: 'inOutQuad', pose: { shoulderL: [0, 0, -92], shoulderR: [0, 0, 92] } },
      { t: 0.39, ease: 'inQuad', pose: { hipsPos: [0, 0.1, 0], shoulderL: [6, 0, -16], shoulderR: [6, 0, 16], elbowL: [-22, 0, 0], elbowR: [-22, 0, 0] } },
      { t: 0.46, ease: 'outCubic', pose: { hipsPos: [0, 0.18, 0], shoulderL: [0, 0, -92], shoulderR: [0, 0, 92], elbowL: [0, 0, 0], elbowR: [0, 0, 0] } },
      { t: 0.50, ease: 'inOutQuad', pose: { shoulderL: [0, 0, -92], shoulderR: [0, 0, 92] } },
      { t: 0.59, ease: 'inQuad', pose: { hipsPos: [0, 0.1, 0], shoulderL: [6, 0, -16], shoulderR: [6, 0, 16], elbowL: [-22, 0, 0], elbowR: [-22, 0, 0] } },
      { t: 0.68, ease: 'outCubic', pose: { hipsPos: [0, 0.2, 0], shoulderL: [0, 0, -92], shoulderR: [0, 0, 92], elbowL: [0, 0, 0], elbowR: [0, 0, 0] } },
      { t: 0.72, ease: 'inOutQuad', pose: { shoulderL: [0, 0, -92], shoulderR: [0, 0, 92] } },
      { t: 0.81, ease: 'inQuad', pose: { hipsPos: [0, 0.12, 0], shoulderL: [6, 0, -16], shoulderR: [6, 0, 16], elbowL: [-22, 0, 0], elbowR: [-22, 0, 0] } },
      { t: 0.9, ease: 'outCubic', pose: { hipsPos: [0, 0.18, 0], shoulderL: [0, 0, -92], shoulderR: [0, 0, 92], elbowL: [0, 0, 0], elbowR: [0, 0, 0] } },
      { t: 1.07, ease: 'inOutQuad', pose: { hipsPos: [0, 0.1, 0], shoulderL: [0, 0, -88], shoulderR: [0, 0, 88], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0] } },
      { t: 1.22, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
    ],
    events: [{ t: 0.24, type: 'sfx', arg: 'whooshBig' }, { t: 0.46, type: 'hit', arg: 0 }, { t: 0.58, type: 'sfx', arg: 'whoosh' }, { t: 0.68, type: 'hit', arg: 0 }, { t: 0.7, type: 'shake', arg: 0.35 }, { t: 0.9, type: 'sfx', arg: 'whoosh' }],
  },
  fenrirSpike: { // heavy: the mane flares out huge (heavyFlare scales the
    // ruff, porcupine-style) as the wolf coils — then a spiking LEAP
    // (heavyDrive) that rams the whole bladed body through the target.
    // The arms open and CLOSE across it, like a bear hug thrown at a sprint:
    //   wind-up  both arms flung as wide and as far back as the joint allows
    //            (measured on the rig: claws 6.8 units apart vs 3.7 at rest,
    //            and behind the chest line) — shoulder pitch +32 is extension,
    //            roll -78/+78 is abduction, yaw sweeps them behind the plane
    //   lunge    they SCYTHE to the middle and forward — 1.0 apart, 2.8 ahead
    //            of the body, converging in front of the chest as he lands
    // (roll sign is not guessable: on this rig NEGATIVE roll on the left and
    // POSITIVE on the right is what opens the arms outward, and positive
    // shoulder pitch is what carries them back.)
    dur: 0.9,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, ease: 'inOutCubic', pose: { hipsPos: [0, -0.7, 0], hipsRot: [6, 0, 0], torso: [24, 0, 0], head: [-22, 0, 0], shoulderL: [32, -40, -78], shoulderR: [32, 40, 78], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0], handL: [10, 0, 0], handR: [10, 0, 0], kneeL: [70, 0, 0], kneeR: [70, 0, 0], thighL: [-40, 0, 0], thighR: [-40, 0, 0], ankleL: [-32, 0, 0], ankleR: [-32, 0, 0] } },
      { t: 0.42, ease: 'outCubic', pose: { hipsPos: [0, 0.2, 0], hipsRot: [22, 0, 0], torso: [14, 0, 0], head: [-16, 0, 0], shoulderL: [-100, 26, 16], shoulderR: [-100, -26, -16], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], handL: [-20, 0, 0], handR: [-20, 0, 0], thighL: [-30, 0, -4], thighR: [-30, 0, 4], kneeL: [26, 0, 0], kneeR: [26, 0, 0], ankleL: [-24, 0, 0], ankleR: [-24, 0, 0] } },
      { t: 0.68, ease: 'inOutQuad', pose: { hipsPos: [0, 0.1, 0], hipsRot: [16, 0, 0], shoulderL: [-86, 20, 10], shoulderR: [-86, -20, -10], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], handL: [-12, 0, 0], handR: [-12, 0, 0] } },
      { t: 0.9, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.08, type: 'sfx', arg: 'howl' }, { t: 0.38, type: 'sfx', arg: 'jump' }, { t: 0.55, type: 'hit', arg: 0 }, { t: 0.57, type: 'shake', arg: 0.35 }],
  },
  wraithLasers: { // heavy: he LIFTS OFF and leans INTO the mark — hovering
    // with legs trailing, torso pitched forward — while the cloak spreads
    // (heavyFlare) and the wing halves fan up above his head (heavyRaise);
    // only THEN do the wing-tips fire (heavyFx 'wingLasers')
    dur: 1.45,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'outCubic', pose: { hipsPos: [0, 0.42, 0], hipsRot: [4, 0, 0], torso: [14, 0, 0], head: [-6, 0, 0], shoulderL: [-42, 0, -72], shoulderR: [-42, 0, 72], elbowL: [-8, 0, 0], elbowR: [-8, 0, 0], thighL: [8, 0, 0], thighR: [8, 0, 0], kneeL: [-20, 0, 0], kneeR: [-20, 0, 0], ankleL: [40, 0, 0], ankleR: [40, 0, 0] } },
      { t: 0.68, ease: 'inOutCubic', pose: { hipsPos: [0, 0.66, 0], hipsRot: [7, 0, 0], torso: [22, 0, 0], head: [-8, 0, 0], shoulderL: [-58, 0, -78], shoulderR: [-58, 0, 78] } },
      { t: 0.95, ease: 'inOutQuad', pose: { hipsPos: [0, 0.6, 0], torso: [20, 0, 0], head: [-4, 0, 0] } },
      { t: 1.15, ease: 'inOutQuad', pose: { hipsPos: [0, 0.42, 0], torso: [13, 0, 0] } },
      { t: 1.45, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.14, type: 'sfx', arg: 'charge' }, { t: 0.6, type: 'sfx', arg: 'charge' }, { t: 0.88, type: 'hit', arg: 0 }, { t: 0.88, type: 'sfx', arg: 'railgun' }, { t: 0.92, type: 'shake', arg: 0.45 }],
  },
  // ---------- SAURION: raptor forms — he fights with his FEET ----------
  // legs/torso/head values are rest-relative (restBias) so the deep
  // digitigrade crouch carries through every kick.
  saurionKick1: { // right EAGLE KICK: knee chambers at the chest, then the
    // sickle toe-claw whips up-and-out at head height, torso swung back
    strikeLimb: 'footR',   // the blow is resolved on the CLAW, not the body
    dur: 0.5,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [4, -6, 0], head: [-2, 4, 0], hipsPos: [0, -0.12, 0], hipsRot: [0, -8, 0], thighR: [-62, 0, -4], kneeR: [38, 0, 0], ankleR: [-12, 0, 0], shoulderL: [-40, 0, -10], elbowL: [-66, 0, 0], handL: [30, 0, 10], shoulderR: [-26, 0, 10], elbowR: [-56, 0, 0], handR: [26, 0, -10] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [-18, 6, 0], head: [14, -4, 0], hipsPos: [0, 0, 0.08], hipsRot: [0, 6, 0], thighR: [-65, 0, -8], kneeR: [-64, 0, 0], ankleR: [58, 0, 0] } },
      { t: 0.32, ease: 'inOutQuad', pose: { thighR: [-45, 0, -6], kneeR: [-40, 0, 0], ankleR: [40, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10] } },
    ],
    events: [{ t: 0.18, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 0 }],
  },
  saurionKick2: { // left eagle kick, same head-high snap off the other leg
    strikeLimb: 'footL',
    dur: 0.52,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [4, 6, 0], head: [-2, -4, 0], hipsPos: [0, -0.12, 0], hipsRot: [0, 8, 0], thighL: [-52, 0, 4], kneeL: [34, 0, 0], ankleL: [-12, 0, 0], shoulderR: [-40, 0, 10], elbowR: [-66, 0, 0], handR: [30, 0, -10], shoulderL: [-26, 0, -10], elbowL: [-56, 0, 0], handL: [26, 0, 10] } },
      { t: 0.24, ease: 'outBack', pose: { torso: [-18, -6, 0], head: [14, 4, 0], hipsPos: [0, 0, 0.08], hipsRot: [0, -6, 0], thighL: [-55, 0, 8], kneeL: [-74, 0, 0], ankleL: [62, 0, 0] } },
      { t: 0.34, ease: 'inOutQuad', pose: { thighL: [-42, 0, 6], kneeL: [-52, 0, 0], ankleL: [44, 0, 0] } },
      { t: 0.52, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10] } },
    ],
    events: [{ t: 0.2, type: 'sfx', arg: 'whoosh' }, { t: 0.24, type: 'hit', arg: 1 }],
  },
  saurionKick3: { // combo ender: coil onto the haunches, then a leaping
    // downward claw slash with the whole body behind it
    strikeLimb: 'footR',   // leaps off the left, strikes with the right sickle
    dur: 0.62,
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'inOutCubic', pose: { hipsPos: [0, -0.42, 0], hipsRot: [4, 0, 0], torso: [12, 0, 0], head: [-8, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0], kneeL: [22, 0, 0], kneeR: [22, 0, 0], ankleL: [-8, 0, 0], ankleR: [-8, 0, 0], shoulderL: [-12, 0, -18], shoulderR: [-12, 0, 18], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], handL: [20, 0, 8], handR: [20, 0, -8] } },
      { t: 0.3, ease: 'outBack', pose: { hipsPos: [0, 0.32, 0.14], hipsRot: [12, 0, 0], torso: [-14, 0, 0], head: [16, 0, 0], thighR: [-62, 0, -6], kneeR: [-62, 0, 0], ankleR: [56, 0, 0], thighL: [16, 0, 4], kneeL: [-16, 0, 0], shoulderL: [-60, 0, -24], shoulderR: [-60, 0, 24], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0] } },
      { t: 0.42, ease: 'inOutQuad', pose: { hipsPos: [0, 0.1, 0.1], thighR: [-30, 0, -4], kneeR: [-30, 0, 0], ankleR: [36, 0, 0] } },
      { t: 0.62, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-34, 0, -7], shoulderR: [-34, 0, 7], elbowL: [-62, 0, 0], elbowR: [-62, 0, 0], handL: [28, 0, 10], handR: [28, 0, -10] } },
    ],
    events: [{ t: 0.26, type: 'sfx', arg: 'whoosh' }, { t: 0.3, type: 'hit', arg: 2 }, { t: 0.32, type: 'shake', arg: 0.3 }],
  },
  saurionBite: { // heavy: coil deep back onto the haunches, head craned away
    // — then the whole frame SPRINGS forward (heavyDrive) and the jaws snap
    // down through the target
    dur: 0.9, strikeLimb: 'head',
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { hipsPos: [0, -0.4, -0.12], hipsRot: [-4, 0, 0], torso: [14, 0, 0], head: [-30, 0, 0], thighL: [-10, 0, 0], thighR: [-10, 0, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0], ankleL: [-6, 0, 0], ankleR: [-6, 0, 0], shoulderL: [-16, 0, -14], shoulderR: [-16, 0, 14], elbowL: [-70, 0, 0], elbowR: [-70, 0, 0], handL: [34, 0, 12], handR: [34, 0, -12] } },
      // THE POUNCE. Both claws come UP and OVER as the jaws drive in — the
      // predator rearing over the kill, not reaching for it. Shoulders swing
      // well past horizontal so the arms clear the head, elbows stay folded
      // and the wrists cock forward so the sickle claws hang over the target
      // ready to come down. (They used to be thrown out level beside the head,
      // which read as a shove; before that they stayed tucked in the raptor
      // carry, which read as biting with his hands held behind him.)
      { t: 0.44, ease: 'outCubic', pose: { hipsPos: [0, 0.14, 0.28], hipsRot: [10, 0, 0], torso: [-12, 0, 0], head: [40, 0, 0], thighL: [18, 0, 0], thighR: [18, 0, 0], kneeL: [-30, 0, 0], kneeR: [-30, 0, 0], ankleL: [12, 0, 0], ankleR: [12, 0, 0], shoulderL: [-104, 0, -16], shoulderR: [-104, 0, 16], elbowL: [-56, 0, 0], elbowR: [-56, 0, 0], handL: [28, 0, 12], handR: [28, 0, -12] } },
      // claws start their descent as the bite lands — still high, coming over
      { t: 0.58, ease: 'inOutQuad', pose: { hipsPos: [0, 0.04, 0.2], head: [30, 0, 0], shoulderL: [-92, 0, -14], shoulderR: [-92, 0, 14], elbowL: [-44, 0, 0], elbowR: [-44, 0, 0], handL: [22, 0, 12], handR: [22, 0, -12] } },
      { t: 0.9, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-34, 0, -7], shoulderR: [-34, 0, 7], elbowL: [-62, 0, 0], elbowR: [-62, 0, 0], handL: [28, 0, 10], handR: [28, 0, -10] } },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'charge' }, { t: 0.4, type: 'sfx', arg: 'whooshBig' }, { t: 0.48, type: 'hit', arg: 0 }, { t: 0.5, type: 'shake', arg: 0.35 }],
  },

  saurionClawR: { // raptor forehand SWIPE, right claw: chamber high outside,
    // then rake across the body with the torso torquing into it. Used by the
    // GLB light cycle (kicks alternate with claw rakes); procedural saurion
    // keeps his all-kick doctrine unless a def opts in.
    dur: 0.46,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [6, -10, 0], head: [-4, 8, 0], hipsRot: [0, -8, 0], hipsPos: [0, -0.08, 0], shoulderR: [-72, 22, 26], elbowR: [-82, 0, 0], handR: [-18, 0, -14], shoulderL: [-30, 0, -8], elbowL: [-58, 0, 0] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [-4, 14, 0], head: [6, -10, 0], hipsRot: [0, 10, 0], hipsPos: [0, 0, 0.06], shoulderR: [-58, -26, -8], elbowR: [-12, 0, 0], handR: [12, 0, -4] } },
      { t: 0.33, ease: 'inOutQuad', pose: { shoulderR: [-42, -18, 0], elbowR: [-28, 0, 0] } },
      { t: 0.46, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0] } },
    ],
    events: [{ t: 0.16, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 1 }],
  },
  saurionClawL: { // mirrored left-claw rake
    dur: 0.46,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [6, 10, 0], head: [-4, -8, 0], hipsRot: [0, 8, 0], hipsPos: [0, -0.08, 0], shoulderL: [-72, -22, -26], elbowL: [-82, 0, 0], handL: [-18, 0, 14], shoulderR: [-30, 0, 8], elbowR: [-58, 0, 0] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [-4, -14, 0], head: [6, 10, 0], hipsRot: [0, -10, 0], hipsPos: [0, 0, 0.06], shoulderL: [-58, 26, 8], elbowL: [-12, 0, 0], handL: [12, 0, 4] } },
      { t: 0.33, ease: 'inOutQuad', pose: { shoulderL: [-42, 18, 0], elbowL: [-28, 0, 0] } },
      { t: 0.46, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0] } },
    ],
    events: [{ t: 0.16, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 1 }],
  },

  saurionQuillFan: { // ranged: he SLINGS the quills, both arms whipping
    // straight out down the aim line. The shared `shoot` raises one arm and
    // leaves the other in the raptor carry — fine for a mech with a gun in
    // its right hand, wrong here: the quills come off BOTH forearms, and on
    // the GLB the muzzle anchors ride the left hand / right forearm bones, so
    // a carried arm aimed the fan at his own feet. Both arms thrown forward,
    // elbows nearly straight, so the barrels sit on the aim line at the fire
    // frame; the torso uncoils behind the throw and recoils back to carry.
    dur: 0.44, upper: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.06, ease: 'outCubic', pose: { shoulderL: [-52, 10, -14], shoulderR: [-52, -10, 14], elbowL: [-74, 0, 0], elbowR: [-74, 0, 0], handL: [34, 0, 12], handR: [34, 0, -12], torso: [6, 0, 0], head: [-4, 0, 0] } },
      // FIRE FRAME. The two arms don't carry matching numbers because the two
      // anchors don't ride matching bones: muzzleR is pinned to the left HAND
      // and muzzleL out along the right FOREARM, each with its own authored
      // rot, so each barrel squares up at a different joint angle. Solved by
      // measurement (see the deg readouts below), not by eye.
      { t: 0.14, ease: 'outBack', pose: { shoulderL: [-96, 4, -6], shoulderR: [-108, -10, 6], elbowL: [-6, 0, 0], elbowR: [-30, 0, 0], handL: [-13, 0, 11], handR: [-13, 0, -11], torso: [-8, 0, 0], head: [8, 0, 0] } },
      { t: 0.26, ease: 'outQuad', pose: { shoulderL: [-88, 4, -6], shoulderR: [-98, -10, 6], elbowL: [-14, 0, 0], elbowR: [-36, 0, 0], handL: [-6, 0, 10], handR: [-6, 0, -10], torso: [-2, 0, 0] } },
      { t: 0.44, ease: 'inOutQuad', pose: { shoulderL: [-34, 0, -7], shoulderR: [-34, 0, 7], elbowL: [-62, 0, 0], elbowR: [-62, 0, 0], handL: [28, 0, 10], handR: [28, 0, -10], torso: [0, 0, 0], head: [0, 0, 0] } },
    ],
    // Fire once the arms have arrived, not at the peak of the whip (8 deg high
    // there). Sampled across the fire window muzzleR sits on the aim line to
    // within a few degrees of frame-sampling noise — 0.1 / -1.3 / 4.7 deg up at
    // t=0.16 / 0.17 / 0.18, all off a barrel that hangs 47 deg DOWN in his
    // resting claw carry. Yaw holds ~1 deg off-axis throughout.
    events: [{ t: 0.18, type: 'fire' }],
  },

  nullBackhand: { // NULLBOT heavy: a contemptuous one-arm BACKHAND — the
    // arm folds across the chest almost lazily, a beat of dead stillness,
    // then the knuckles whip through the front arc and send whatever they
    // meet across the street
    dur: 0.8,
    keys: [
      { t: 0, pose: {} },
      { t: 0.26, ease: 'inOutCubic', pose: { torso: [4, 38, 8], hipsRot: [0, 18, 0], hipsPos: [0, -0.16, 0], head: [-4, -18, 0], shoulderR: [-96, 38, 20], elbowR: [-64, 0, 0], handR: [0, 0, 40], shoulderL: [10, 0, -24], elbowL: [-40, 0, 0], kneeL: [16, 0, 0], kneeR: [16, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
      { t: 0.4, ease: 'outBack', pose: { torso: [8, -42, -10], hipsRot: [0, -20, 0], hipsPos: [0, -0.2, 0.1], head: [0, 18, 0], shoulderR: [-90, -44, -18], elbowR: [-4, 0, 0], handR: [0, 0, -35], shoulderL: [18, 0, -30], kneeL: [22, 0, 0], kneeR: [30, 0, 0], thighL: [-14, 0, 0], thighR: [2, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { torso: [6, -32, -7], hipsRot: [0, -15, 0], shoulderR: [-84, -36, -12], elbowR: [-10, 0, 0] } },
      { t: 0.8, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
    ],
    events: [{ t: 0.33, type: 'sfx', arg: 'whooshBig' }, { t: 0.4, type: 'hit', arg: 0 }, { t: 0.42, type: 'shake', arg: 0.4 }],
  },

  // ---------- TITANUS / COLOSSUS: telegraphed haymakers ----------
  // the fist gets PULLED all the way back and the frame coils before it
  // lets loose — slower than a jab, and it launches people across the block.
  bigPunch1: { // left haymaker with a full wind-up
    strikeArm: 'L', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.66,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'inOutCubic', pose: { torso: [8, -36, -9], hipsRot: [0, -18, 0], hipsPos: [0, -0.2, -0.06], head: [0, 16, 0], shoulderL: [30, 8, -26], elbowL: [-126, 0, 0], shoulderR: [-18, 0, 24], elbowR: [-60, 0, 0], kneeL: [30, 0, 0], kneeR: [30, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0] } },
      { t: 0.34, ease: 'outBack', pose: { torso: [12, 32, 9], hipsRot: [0, 18, 0], hipsPos: [0, -0.22, 0.16], head: [0, -14, 0], shoulderL: [-104, -16, 26], elbowL: [-2, 0, 0], shoulderR: [24, 0, 28], elbowR: [-30, 0, 0], kneeL: [26, 0, 0], kneeR: [40, 0, 0], thighL: [-22, 0, 0], thighR: [4, 0, 0] } },
      { t: 0.48, ease: 'inOutQuad', pose: { torso: [9, 24, 7], hipsRot: [0, 13, 0], shoulderL: [-92, -12, 20], elbowL: [-18, 0, 0] } },
      { t: 0.66, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.24, type: 'sfx', arg: 'whooshBig' }, { t: 0.34, type: 'hit', arg: 0 }, { t: 0.36, type: 'shake', arg: 0.3 }],
  },

  // ---------- TITANUS / COLOSSUS: hold-to-charge haymakers & pounds ----------
  // punchHold1 freezes bigPunch1's wind-up as a trembling loop while X stays
  // down; punchRelease1 fires the strike FROM that chamber (no rest detour).
  // Mirrored *2 variants alternate arms. poundHold/poundSlam do the same for
  // the two-hand overhead heavy.
  punchHold1: { // charged haymaker wind-up: coiled at full stretch, the
    // cocked fist quaking at the hip until the button lets it go
    strikeArm: 'L', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.7, loop: true,
    keys: [
      { t: 0, pose: { torso: [8, -36, -9], hipsRot: [0, -18, 0], hipsPos: [0, -0.2, -0.06], head: [0, 16, 0], shoulderL: [30, 8, -26], elbowL: [-126, 0, 0], shoulderR: [-18, 0, 24], elbowR: [-60, 0, 0], kneeL: [30, 0, 0], kneeR: [30, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0] } },
      { t: 0.35, ease: 'inOutQuad', pose: { torso: [9, -38, -10], hipsPos: [0, -0.23, -0.07], shoulderL: [33, 9, -28], elbowL: [-122, 0, 0] } },
      { t: 0.7, ease: 'inOutQuad', pose: { torso: [8, -36, -9], hipsPos: [0, -0.2, -0.06], shoulderL: [30, 8, -26], elbowL: [-126, 0, 0] } },
    ],
  },
  punchRelease1: { // the banked haymaker discharges: chamber -> strike ->
    // follow-through, exactly bigPunch1 from its wind-up onward
    strikeArm: 'L', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.5,
    keys: [
      { t: 0, pose: { torso: [8, -36, -9], hipsRot: [0, -18, 0], hipsPos: [0, -0.2, -0.06], head: [0, 16, 0], shoulderL: [30, 8, -26], elbowL: [-126, 0, 0], shoulderR: [-18, 0, 24], elbowR: [-60, 0, 0], kneeL: [30, 0, 0], kneeR: [30, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0] } },
      { t: 0.12, ease: 'outBack', pose: { torso: [12, 32, 9], hipsRot: [0, 18, 0], hipsPos: [0, -0.22, 0.16], head: [0, -14, 0], shoulderL: [-104, -16, 26], elbowL: [-2, 0, 0], shoulderR: [24, 0, 28], elbowR: [-30, 0, 0], kneeL: [26, 0, 0], kneeR: [40, 0, 0], thighL: [-22, 0, 0], thighR: [4, 0, 0] } },
      { t: 0.26, ease: 'inOutQuad', pose: { torso: [9, 24, 7], hipsRot: [0, 13, 0], shoulderL: [-92, -12, 20], elbowL: [-18, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.02, type: 'sfx', arg: 'whooshBig' }, { t: 0.12, type: 'hit', arg: 0 }, { t: 0.14, type: 'shake', arg: 0.35 }],
  },
  // COLOSSUS plays these too, but on his GLB they are OVERRIDDEN by his
  // thunderclap (COLOSSUS_CLAP_HOLD / COLOSSUS_CLAP at the bottom of this file,
  // wired up in glbanim's colossus profile). Same names, same timings — only the
  // shape differs, and only on that model.
  poundHold: { // charged overhead pound: both fists locked high, the whole
    // frame arched back and quaking until Y releases
    dur: 0.8, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -0.3, 0], hipsRot: [-8, 8, 0], torso: [-28, 6, -6], head: [-18, 0, 0], shoulderL: [-142, 0, -26], shoulderR: [-142, 0, 26], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], kneeL: [18, 0, 0], kneeR: [18, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
      { t: 0.4, ease: 'inOutQuad', pose: { hipsPos: [0, -0.34, 0], torso: [-30, 6, -6], shoulderL: [-146, 0, -28], shoulderR: [-146, 0, 28] } },
      { t: 0.8, ease: 'inOutQuad', pose: { hipsPos: [0, -0.3, 0], torso: [-28, 6, -6], shoulderL: [-142, 0, -26], shoulderR: [-142, 0, 26] } },
    ],
  },
  poundSlam: { // the banked pound discharges: raised -> slam, exactly the
    // shared heavy from its apex onward
    dur: 0.7,
    keys: [
      { t: 0, pose: { hipsPos: [0, -0.3, 0], hipsRot: [-8, 8, 0], torso: [-28, 6, -6], head: [-18, 0, 0], shoulderL: [-142, 0, -26], shoulderR: [-142, 0, 26], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], kneeL: [18, 0, 0], kneeR: [18, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
      { t: 0.18, ease: 'inCubic', pose: { hipsPos: [0, -0.72, 0], hipsRot: [12, -6, 0], torso: [52, -6, 4], head: [14, 0, 0], shoulderL: [-48, 0, 22], shoulderR: [-48, 0, -22], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], kneeL: [48, 0, 0], kneeR: [48, 0, 0], thighL: [-26, 0, 0], thighR: [-26, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.36, ease: 'outQuad', pose: { hipsPos: [0, -0.5, 0], torso: [44, -4, 3] } },
      { t: 0.7, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'whooshBig' }, { t: 0.18, type: 'hit', arg: 0 }, { t: 0.2, type: 'shake', arg: 0.5 }],
  },
  fistLaunch: { // ROCKET FIST: chamber the right fist past the hip, then punch
    // STRAIGHT DOWN THE LINE — the fist detaches at full extension (the fire
    // event) and the arm stays punched out a beat while it flies.
    //
    // The release frame squares the body up on purpose. The old version carried
    // the wind-up's twist (torso yaw -28, hips -16) straight through the
    // release, which threw the arm 46° across his chest and 12° UP — measured,
    // not eyeballed — so the punch, and the fist that becomes the projectile,
    // left along a diagonal aimed at the sky. Both routes had it.
    // Arm angles here are MEASURED (see the shoulder-pitch sweep in the log):
    // shoulderR pitch -90 with a level torso puts the arm dead level and dead
    // forward (armDir [0,0,1]); every +1° of torso lean pitches the arm 1°
    // down, so lean 6 pairs with -96. Do not "tidy" these numbers by eye.
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.7,
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'outCubic', pose: { torso: [6, 30, 8], hipsRot: [0, 15, 0], hipsPos: [0, -0.14, -0.04], head: [0, -14, 0], shoulderR: [26, -6, 22], elbowR: [-118, 0, 0], shoulderL: [-16, 0, -22], elbowL: [-55, 0, 0], kneeL: [26, 0, 0], kneeR: [26, 0, 0], thighL: [-14, 0, 0], thighR: [-14, 0, 0] } },
      { t: 0.26, ease: 'outBack', pose: { torso: [6, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, -0.18, 0.12], head: [0, 0, 0], shoulderR: [-96, 0, 0], elbowR: [0, 0, 0], shoulderL: [24, 0, -24], elbowL: [-34, 0, 0], kneeL: [36, 0, 0], kneeR: [24, 0, 0], thighL: [2, 0, 0], thighR: [-20, 0, 0] } },
      { t: 0.48, ease: 'inOutQuad', pose: { torso: [5, 0, 0], shoulderR: [-92, 0, 0], elbowR: [0, 0, 0] } },
      { t: 0.7, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.18, type: 'sfx', arg: 'whooshBig' }, { t: 0.26, type: 'fire' }, { t: 0.28, type: 'shake', arg: 0.25 }],
  },
  fistCatch: { // the rocket fist is inbound: reach the right arm straight
    // out and brace — the fist re-docks onto the extended wrist mid-clip.
    // Squared up like fistLaunch's release: the catch has to present the wrist
    // down the SAME line the fist is flying home along, so the re-dock reads.
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.85, upper: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.2, ease: 'outCubic', pose: { torso: [4, 0, 0], head: [0, 0, 0], shoulderR: [-94, 0, 0], elbowR: [0, 0, 0], shoulderL: [6, 0, -14], elbowL: [-24, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { shoulderR: [-92, 0, 0], torso: [3, 0, 0] } },
      { t: 0.85, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0] } },
    ],
  },

  vulcanSpray: { // finisher: weight rocked back, the right gatling flung up
    // PAST his shoulder hosing the sky — loose and casual, mid-laugh
    dur: 0.9, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -0.06, 0], hipsRot: [0, -10, 0], torso: [-14, 8, -4], head: [-16, -10, 4], shoulderR: [-148, 0, 34], elbowR: [-24, 0, 0], shoulderL: [-8, 0, -16], elbowL: [-30, 0, 0], thighL: [-8, 0, -6], thighR: [4, 0, 8], kneeL: [12, 0, 0], kneeR: [4, 0, 0] } },
      { t: 0.45, ease: 'inOutQuad', pose: { torso: [-17, 8, -4], head: [-19, -10, 4], hipsPos: [0, -0.09, 0], shoulderR: [-152, 0, 36] } },
      { t: 0.9, ease: 'inOutQuad', pose: { torso: [-14, 8, -4], head: [-16, -10, 4], hipsPos: [0, -0.06, 0], shoulderR: [-148, 0, 34] } },
    ],
  },
  colossusSlamR: { // one-arm ragdoll hammer, DOWN THE RIGHT SIDE: the
    // loaded fist swings from overhead to the dirt beside his right leg
    // (the finisher LOCKS the victim to handR, so they ride this swing)
    dur: 0.8,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, ease: 'inOutCubic', pose: { torso: [-14, 0, -10], hipsPos: [0, -0.08, 0], head: [-10, 0, 0], shoulderR: [-168, 0, 18], elbowR: [-14, 0, 0], shoulderL: [-24, 0, -30], elbowL: [-40, 0, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0] } },
      { t: 0.5, ease: 'inCubic', pose: { torso: [28, 0, 22], hipsPos: [0, -0.52, 0], head: [14, 0, 0], shoulderR: [-12, 0, 38], elbowR: [-4, 0, 0], shoulderL: [-10, 0, -24], kneeL: [52, 0, 0], kneeR: [52, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.64, ease: 'outQuad', pose: { torso: [24, 0, 18], hipsPos: [0, -0.44, 0] } },
      { t: 0.8, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
    ],
    events: [{ t: 0.12, type: 'sfx', arg: 'whooshBig' }, { t: 0.5, type: 'sfx', arg: 'slam' }, { t: 0.52, type: 'shake', arg: 0.4 }],
  },
  colossusSlamL: { // ...and swung ACROSS the body, down beside his left leg
    dur: 0.8,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, ease: 'inOutCubic', pose: { torso: [-14, 0, 10], hipsPos: [0, -0.08, 0], head: [-10, 0, 0], shoulderR: [-168, 0, 20], elbowR: [-14, 0, 0], shoulderL: [-24, 0, -30], elbowL: [-40, 0, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0] } },
      { t: 0.5, ease: 'inCubic', pose: { torso: [26, -20, -20], hipsPos: [0, -0.52, 0], head: [12, 10, 0], shoulderR: [-34, 0, -36], elbowR: [-12, 0, 0], shoulderL: [-8, 0, -34], kneeL: [52, 0, 0], kneeR: [52, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.64, ease: 'outQuad', pose: { torso: [22, -16, -16], hipsPos: [0, -0.44, 0] } },
      { t: 0.8, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
    ],
    events: [{ t: 0.12, type: 'sfx', arg: 'whooshBig' }, { t: 0.5, type: 'sfx', arg: 'slam' }, { t: 0.52, type: 'shake', arg: 0.4 }],
  },

  stomp: { // one heavy foot raised high and RAMMED straight down — the
    // finisher trample (stomp2 is the mirrored left foot)
    strikeLimb: 'footR',
    dur: 0.5,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'outCubic', pose: { hipsPos: [0, -0.04, 0], torso: [10, 0, 0], head: [8, 0, 0], thighR: [-72, 0, -4], kneeR: [78, 0, 0], ankleR: [-22, 0, 0], shoulderL: [-22, 0, -18], shoulderR: [-32, 0, 18], elbowL: [-30, 0, 0], elbowR: [-40, 0, 0] } },
      { t: 0.3, ease: 'inCubic', pose: { hipsPos: [0, -0.16, 0], torso: [18, 0, 0], head: [10, 0, 0], thighR: [-16, 0, -2], kneeR: [10, 0, 0], ankleR: [-2, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.28, type: 'sfx', arg: 'slam' }],
  },

  heavy: { // two-hand overhead smash — huge arch back, body hurled into the slam
    dur: 0.98,
    keys: [
      { t: 0, pose: {} },
      { t: 0.34, ease: 'inOutCubic', pose: { hipsPos: [0, -0.3, 0], hipsRot: [-8, 8, 0], torso: [-28, 6, -6], head: [-18, 0, 0], shoulderL: [-172, 0, -26], shoulderR: [-172, 0, 26], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], kneeL: [18, 0, 0], kneeR: [18, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
      { t: 0.52, ease: 'inCubic', pose: { hipsPos: [0, -0.72, 0], hipsRot: [12, -6, 0], torso: [52, -6, 4], head: [14, 0, 0], shoulderL: [-48, 0, 22], shoulderR: [-48, 0, -22], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], kneeL: [48, 0, 0], kneeR: [48, 0, 0], thighL: [-26, 0, 0], thighR: [-26, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.7, ease: 'outQuad', pose: { hipsPos: [0, -0.5, 0], torso: [44, -4, 3] } },
      { t: 0.98, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.46, type: 'sfx', arg: 'whooshBig' }, { t: 0.52, type: 'hit', arg: 0 }, { t: 0.54, type: 'shake', arg: 0.5 }],
  },

  // ---------- ranged / channel ----------
  shoot: { // single right-arm shot — sharper side profile, real recoil kick
    dur: 0.5, upper: true,
    keys: [
      { t: 0, pose: { shoulderR: [-90, 0, 4], elbowR: [-4, 0, 0], shoulderL: [8, 0, -18], torso: [4, -18, -5], head: [0, 10, 0] } },
      { t: 0.12, ease: 'outBack', pose: { shoulderR: [-104, 0, 6], elbowR: [-18, 0, 0], torso: [-3, -11, -2], head: [-4, 7, 0] } },
      { t: 0.3, ease: 'outQuad', pose: { shoulderR: [-88, 0, 4], elbowR: [-6, 0, 0], torso: [3, -15, -4] } },
      { t: 0.5, ease: 'inOutQuad', pose: { shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], torso: [0, 0, 0], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.1, type: 'fire' }],
  },
  shootLoop: { // held channel: gatling / flame / freeze
    dur: 0.36, upper: true, loop: true,
    keys: [
      { t: 0, pose: { shoulderR: [-86, 0, 4], elbowR: [-8, 0, 0], torso: [4, -14, 0], head: [0, 8, 0], shoulderL: [-30, 25, -6], elbowL: [-70, 0, 0] } },
      { t: 0.18, ease: 'inOutQuad', pose: { shoulderR: [-90, 0, 4], torso: [3, -12, 0] } },
      { t: 0.36, ease: 'inOutQuad', pose: { shoulderR: [-86, 0, 4], torso: [4, -14, 0] } },
    ],
  },
  gatlingLoop: { // VULCAN's held gatling burst — same beat as shootLoop, but
    // the gun arm is punched further FORWARD and the shooter's-blade torso
    // twist is eased off, so the barrel line runs down the aim instead of
    // across it (the generic shootLoop's -14 deg twist threw his rounds wide).
    dur: 0.36, upper: true, loop: true,
    keys: [
      { t: 0, pose: { shoulderR: [-90, 0, 4], elbowR: [-5, 0, 0], torso: [3, -5, 0], head: [0, 3, 0], shoulderL: [-30, 25, -6], elbowL: [-70, 0, 0] } },
      { t: 0.18, ease: 'inOutQuad', pose: { shoulderR: [-94, 0, 4], torso: [2, -4, 0] } },
      { t: 0.36, ease: 'inOutQuad', pose: { shoulderR: [-90, 0, 4], torso: [3, -5, 0] } },
    ],
  },
  shootLow: { // hip-level channel (CRANKY's hose cannons): arms level/DOWN,
    // shell braced low — never raised overhead
    dur: 0.4, upper: true, loop: true,
    keys: [
      { t: 0, pose: { shoulderL: [-38, 14, -14], shoulderR: [-38, -14, 14], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], torso: [10, 0, 0], head: [-6, 0, 0], hipsPos: [0, -0.12, 0] } },
      { t: 0.2, ease: 'inOutQuad', pose: { torso: [12, 0, 0], shoulderL: [-42, 14, -14], shoulderR: [-42, -14, 14] } },
      { t: 0.4, ease: 'inOutQuad', pose: { torso: [10, 0, 0], shoulderL: [-38, 14, -14], shoulderR: [-38, -14, 14] } },
    ],
  },
  castRaise: { // arms skyward — deep coil then a full-body arch on release
    dur: 0.95,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { hipsPos: [0, -0.45, 0], torso: [16, 0, -8], head: [10, 0, 0], shoulderL: [-50, 0, -26], shoulderR: [-50, 0, 26], elbowL: [-75, 0, 0], elbowR: [-75, 0, 0], kneeL: [35, 0, 0], kneeR: [35, 0, 0], thighL: [-18, 0, 0], thighR: [-18, 0, 0] } },
      { t: 0.52, ease: 'outBack', pose: { hipsPos: [0, 0.18, 0], hipsRot: [-8, 0, 0], torso: [-22, 0, 6], head: [-24, 0, 0], shoulderL: [-175, 0, -20], shoulderR: [-175, 0, 20], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], kneeL: [4, 0, 0], kneeR: [4, 0, 0], thighL: [2, 0, 0], thighR: [2, 0, 0] } },
      { t: 0.95, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.5, type: 'fire' }, { t: 0.5, type: 'sfx', arg: 'cast' }],
  },
  brace: { // artillery stance — wide stagger, torso rocked hard by the recoil
    dur: 0.95,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { hipsPos: [0, -0.5, 0], hipsRot: [0, -12, 0], torso: [-20, 10, -5], head: [-12, 0, 0], thighL: [-42, 0, 0], thighR: [18, 0, 0], kneeL: [55, 0, 0], kneeR: [38, 0, 0], shoulderL: [-40, 0, -18], shoulderR: [-40, 0, 18], elbowL: [-45, 0, 0], elbowR: [-45, 0, 0] } },
      { t: 0.55, ease: 'outBack', pose: { hipsPos: [0, -0.68, 0], torso: [-30, 12, -7], head: [-16, 0, 0] } },
      { t: 0.95, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.5, type: 'fire' }, { t: 0.52, type: 'shake', arg: 0.4 }],
  },
  aim: { // sniper careful shot
    dur: 0.85, upper: true,
    keys: [
      { t: 0, pose: { shoulderR: [-84, 0, 2], elbowR: [-8, 0, 0], shoulderL: [-62, 30, -4], elbowL: [-65, 0, 0], torso: [2, -18, 0], head: [-2, 10, 0] } },
      { t: 0.38, ease: 'inOutQuad', pose: { shoulderR: [-86, 0, 2] } },
      { t: 0.46, ease: 'outCubic', pose: { shoulderR: [-96, 0, 2], torso: [0, -14, 0] } },
      { t: 0.85, ease: 'inOutQuad', pose: { shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], torso: [0, 0, 0], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.42, type: 'fire' }],
  },

  // ---------- defense / reactions ----------
  block: {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { shoulderL: [-70, 30, -10], shoulderR: [-70, -30, 10], elbowL: [-105, 0, 0], elbowR: [-105, 0, 0], torso: [10, 0, 0], head: [8, 0, 0] } },
    ],
  },
  // TIGHT BALL: the air somersault's carriage (see Fighter.startAirRoll) —
  // knees hauled to the chest, shins folded flat against the thighs, spine
  // curled and chin tucked, arms hugged around the shins. Authored so the
  // whole silhouette pulls in toward the middle, which is what the roll
  // spins about post-pose (Fighter.tuckCentre measures the curled body's own
  // centre per rig): the tighter the mass sits to that pivot, the
  // cleaner the tumble reads (and a heavy mech that only TUCKS without
  // spinning still reads as bracing, not falling). Full-body and held —
  // the fighter drops it when the roll ends. Legs/torso/head ride the
  // restBias like every clip, so digitigrade bodies keep their bend;
  // beyond that, a roster def may reshape it per body type with a sparse
  // `ballPose` override (see defClipVariants below).
  ball: {
    dur: 0.16, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'outCubic', pose: BALL_TUCK },
    ],
  },
  // ---------- landing ----------
  // Two halves of one touchdown, split so the fighter can enter from any
  // fall: LANDREACH is the anticipation — held while the ground rushes up,
  // legs stretched long underneath with toes pointed, arms flung out for
  // balance. LAND takes over at the instant of contact: its t=0 IS
  // landReach's held pose (the same handover trick as flipOver→proneBack),
  // so the stretch compresses seamlessly into a deep foot-flat crouch and
  // the body stands back up out of it. The crouch follows the duck layer's
  // geometry (ankle = -(knee - thigh), hip drop ≈ the leg fold's lost
  // reach) so the feet land planted instead of punching through the floor.
  landReach: {
    dur: 0.22, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: LAND_STRETCH },
    ],
  },
  land: {
    dur: 0.62,
    keys: [
      { t: 0, pose: LAND_STRETCH },
      // impact: the stretch compresses into the crouch in one beat
      { t: 0.1, ease: 'outCubic', pose: { hipsPos: [0, -0.74, 0.02], hipsRot: [2, 0, 0], torso: [30, 0, 0], head: [-22, 0, 0], thighL: [-50, 0, -4], thighR: [-50, 0, 4], kneeL: [92, 0, 0], kneeR: [92, 0, 0], ankleL: [-42, 0, 0], ankleR: [-42, 0, 0], shoulderL: [-30, 0, -30], shoulderR: [-30, 0, 30], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0] } },
      // the springs take the weight — a small settle up out of the deepest point
      { t: 0.22, ease: 'outQuad', pose: { hipsPos: [0, -0.58, 0.02], torso: [24, 0, 0], head: [-16, 0, 0], thighL: [-42, 0, -4], thighR: [-42, 0, 4], kneeL: [78, 0, 0], kneeR: [78, 0, 0], ankleL: [-36, 0, 0], ankleR: [-36, 0, 0] } },
      // ...and stand back up
      { t: 0.62, ease: 'inOutQuad', pose: REST_FULL },
    ],
  },
  hitFlinch: {
    dur: 0.32,
    keys: [
      { t: 0, pose: {} },
      { t: 0.07, ease: 'outCubic', pose: { torso: [-22, 6, 0], head: [-18, 0, 0], shoulderL: [-30, 0, -26], shoulderR: [-30, 0, 26], elbowL: [-50, 0, 0], elbowR: [-50, 0, 0], hipsPos: [0, -0.15, 0] } },
      { t: 0.32, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], hipsPos: [0, 0, 0] } },
    ],
  },
  // A HIT HAS A DIRECTION. The shared hitFlinch is a blow to the FACE (torso
  // pitched back); a blow from the LEFT throws the body to the right and flings
  // the near arm, one from BEHIND folds it forward. takeHit picks by the angle
  // of the blow (the R twin is the mirror below). Same timing as hitFlinch so
  // hitstun and the recovery line up.
  hitFlinchL: { // hit from the LEFT: shoved right, near arm flung out
    dur: 0.32,
    keys: [
      { t: 0, pose: {} },
      { t: 0.07, ease: 'outCubic', pose: { torso: [-6, 0, -22], head: [-4, 0, -14], shoulderL: [-35, 0, -46], elbowL: [-55, 0, 0], shoulderR: [-8, 0, 12], elbowR: [-24, 0, 0], hipsPos: [0.12, -0.12, 0] } },
      { t: 0.32, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], hipsPos: [0, 0, 0] } },
    ],
  },
  hitFlinchBack: { // hit from BEHIND: folded forward, arms thrown up
    dur: 0.32,
    keys: [
      { t: 0, pose: {} },
      { t: 0.07, ease: 'outCubic', pose: { torso: [24, 0, 0], head: [10, 0, 0], shoulderL: [-45, 0, -22], shoulderR: [-45, 0, 22], elbowL: [-35, 0, 0], elbowR: [-35, 0, 0], hipsPos: [0, -0.12, 0.14] } },
      { t: 0.32, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], hipsPos: [0, 0, 0] } },
    ],
  },
  launched: {
    dur: 0.7, loop: true,
    keys: [
      { t: 0, pose: { torso: [-30, 0, 0], head: [-20, 0, 0], shoulderL: [-130, 0, -35], shoulderR: [-100, 0, 40], elbowL: [-40, 0, 0], elbowR: [-60, 0, 0], thighL: [-45, 0, 0], thighR: [15, 0, 0], kneeL: [60, 0, 0], kneeR: [85, 0, 0] } },
      { t: 0.35, ease: 'inOutQuad', pose: { shoulderL: [-100, 0, -40], shoulderR: [-130, 0, 35], thighL: [-20, 0, 0], thighR: [-35, 0, 0] } },
      { t: 0.7, ease: 'inOutQuad', pose: { shoulderL: [-130, 0, -35], shoulderR: [-100, 0, 40], thighL: [-45, 0, 0], thighR: [15, 0, 0] } },
    ],
  },
  knockdown: {
    dur: 0.4, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, ease: 'outQuad', pose: { hipsPos: [0, -2.55, 0.4], hipsRot: [-78, 0, 0], torso: [12, 0, 0], head: [25, 0, 0], shoulderL: [-40, 0, -55], shoulderR: [-40, 0, 55], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], thighL: [-25, 0, 0], thighR: [-40, 0, 0], kneeL: [45, 0, 0], kneeR: [70, 0, 0] } },
    ],
  },
  // ---------- ragdoll: limp finisher-victim poses (loop = never fade back
  // to the standing rest; the Finisher adds acceleration-driven flailing) --
  ragdollAir: { // carried / whipped around: everything dangles loose
    dur: 1.1, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -0.1, 0], torso: [24, 6, 4], head: [34, -14, 8], shoulderL: [-24, 0, -58], shoulderR: [-14, 0, 66], elbowL: [-24, 0, 0], elbowR: [-42, 0, 0], handL: [20, 0, 0], handR: [26, 0, 0], thighL: [-14, 0, -10], thighR: [4, 0, 14], kneeL: [34, 0, 0], kneeR: [58, 0, 0], ankleL: [30, 0, 0], ankleR: [38, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { head: [30, -10, 6], shoulderL: [-20, 0, -54], shoulderR: [-18, 0, 62], kneeR: [52, 0, 0] } },
      { t: 1.1, ease: 'inOutQuad', pose: { head: [34, -14, 8], shoulderL: [-24, 0, -58], shoulderR: [-14, 0, 66], kneeR: [58, 0, 0] } },
    ],
  },
  ragdoll: { // downed: flat on the back, limbs flung asymmetric — a wreck,
    // not a fighter waiting to stand up
    dur: 1, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -2.55, 0.4], hipsRot: [-78, 0, 0], torso: [10, 8, 0], head: [28, 18, 0], shoulderL: [-70, 0, -70], shoulderR: [-15, 0, 80], elbowL: [-45, 0, 0], elbowR: [-10, 0, 0], thighL: [-15, 0, -8], thighR: [-45, 0, 12], kneeL: [30, 0, 0], kneeR: [80, 0, 0] } },
      { t: 1, pose: { hipsPos: [0, -2.55, 0.4], hipsRot: [-78, 0, 0], torso: [10, 8, 0], head: [28, 18, 0], shoulderL: [-70, 0, -70], shoulderR: [-15, 0, 80], elbowL: [-45, 0, 0], elbowR: [-10, 0, 0], thighL: [-15, 0, -8], thighR: [-45, 0, 12], kneeL: [30, 0, 0], kneeR: [80, 0, 0] } },
    ],
  },

  getup: {
    dur: 0.75,
    keys: [
      { t: 0, pose: { hipsPos: [0, -2.55, 0.4], hipsRot: [-78, 0, 0], torso: [12, 0, 0], head: [25, 0, 0], shoulderL: [-40, 0, -55], shoulderR: [-40, 0, 55], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], thighL: [-25, 0, 0], thighR: [-40, 0, 0], kneeL: [45, 0, 0], kneeR: [70, 0, 0] } },
      { t: 0.35, ease: 'inOutCubic', pose: { hipsPos: [0, -1.5, 0.2], hipsRot: [-20, 0, 0], torso: [30, 0, 0], head: [0, 0, 0], kneeL: [95, 0, 0], kneeR: [95, 0, 0], thighL: [-55, 0, 0], thighR: [-55, 0, 0], ankleL: [-40, 0, 0], ankleR: [-40, 0, 0], shoulderL: [20, 0, -14], shoulderR: [20, 0, 14] } },
      { t: 0.75, ease: 'outQuad', pose: REST_FULL },
    ],
  },

  // ---------- ROLLOVER (roster `rollover` — CRANKY) ----------
  // The shared knockdown sits a mech DOWN — hips back, knees up, propped and
  // ready to push straight off the floor again. A big enough blow instead
  // turns a top-heavy shell CLEAN OVER: it BARREL-ROLLS about its own facing
  // axis until the carapace is on the pavement and every limb is waving at the
  // sky, and there it stays until it rolls itself back upright. Three clips,
  // played in sequence by the fighter (see ROLLOVER_* in fighter.js): the FLIP,
  // a prone loop while he's stranded, and the righting ROLL he gets up with.
  //
  // The roll axis is hipsRot.Z — the mech's own facing direction — so the body
  // ends up inverted while still POINTING where it pointed (unlike a pitch
  // about X, which would lay a wide flat crab out on his tail-end rather than
  // his back). Everything below is authored in the body's own frame as usual,
  // which upside down means: limbs hang toward the SKY, and increasing Z rolls
  // him toward his LEFT.
  //
  // Winding matters. +180 and -180 are the same pose but not the same number,
  // and the pose smoother lerps numbers — so the prone loop sits at +180, the
  // right-hand recovery unwinds it 180 -> 0, and the mirrored left-hand one
  // runs -180 -> 0 after the fighter re-winds the smoother (Animator.rewrap).
  // Both END at 0: a clip that finished anywhere else would leave the body
  // standing up facing somewhere other than its own yaw.
  //
  // proneBack deliberately keys NO leg joint. With the legs left to the
  // locomotion layer, a stranded mech's legs still answer the stick and
  // scuttle uselessly at the sky (fighter.js feeds the stick in as speed).
  flipOver: {
    dur: 0.62, hold: true,
    keys: [
      // contact: he lands already going over, weight past the outside legs
      { t: 0, pose: { hipsPos: [0, -0.35, 0.1], hipsRot: [8, 0, 42], torso: [10, 0, -14], head: [6, 0, 0], shoulderL: [-30, 0, -38], shoulderR: [-24, 0, 26], elbowL: [-40, 0, 0], elbowR: [-52, 0, 0], thighL: [-24, 0, -14], thighR: [-16, 0, 10], kneeL: [40, 0, 0], kneeR: [30, 0, 0] } },
      // past the point of no return — the shell comes round underneath him
      { t: 0.22, ease: 'inQuad', pose: { hipsPos: [0, -0.95, 0.2], hipsRot: [6, 0, 112], torso: [4, 0, -8], head: [2, 0, 0], shoulderL: [-46, 0, -52], shoulderR: [-36, 0, 34], elbowL: [-52, 0, 0], elbowR: [-60, 0, 0], thighL: [-34, 0, -18], thighR: [-22, 0, 14], kneeL: [52, 0, 0], kneeR: [40, 0, 0] } },
      // carapace hits and the whole frame rocks PAST level on its curve
      { t: 0.42, ease: 'outQuad', pose: { hipsPos: [0, -1.35, 0.28], hipsRot: [-4, 0, 198], torso: [-6, 0, 6], head: [-4, 0, 0], shoulderL: [-18, 0, -64], shoulderR: [-14, 0, 58], elbowL: [-70, 0, 0], elbowR: [-66, 0, 0], thighL: [-14, 0, -26], thighR: [-10, 0, 24], kneeL: [64, 0, 0], kneeR: [58, 0, 0] } },
      // ...and rocks back to rest ON the shell. This key IS proneBack's t=0, so
      // the fighter's hold->loop handover takes over with no seam. The legs
      // land near their rest bend, since the loop hands them straight back to
      // the locomotion layer and anything further out would visibly settle.
      { t: 0.62, ease: 'inOutQuad', pose: { hipsPos: [0, -1.2, 0.22], hipsRot: [0, 0, 180], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-24, 0, -56], shoulderR: [-24, 0, 56], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], thighL: [-6, 0, -10], thighR: [-6, 0, 10], kneeL: [18, 0, 0], kneeR: [18, 0, 0] } },
    ],
  },
  proneBack: { // stranded: the shell rocks on its curve, the claws paw at air
    dur: 1.5, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -1.2, 0.22], hipsRot: [0, 0, 180], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-24, 0, -56], shoulderR: [-24, 0, 56], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { hipsPos: [0, -1.22, 0.22], hipsRot: [3, 0, 187], torso: [3, 0, 4], head: [2, 0, 0], shoulderL: [-40, 0, -44], shoulderR: [-12, 0, 66], elbowL: [-34, 0, 0], elbowR: [-74, 0, 0] } },
      { t: 1.0, ease: 'inOutQuad', pose: { hipsPos: [0, -1.18, 0.22], hipsRot: [-3, 0, 173], torso: [-3, 0, -4], head: [-2, 0, 0], shoulderL: [-10, 0, -68], shoulderR: [-38, 0, 46], elbowL: [-76, 0, 0], elbowR: [-32, 0, 0] } },
      { t: 1.5, ease: 'inOutQuad', pose: { hipsPos: [0, -1.2, 0.22], hipsRot: [0, 0, 180], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-24, 0, -56], shoulderR: [-24, 0, 56], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0] } },
    ],
  },
  // Righting roll over his RIGHT side (rollUpL is the mirror, and rolls left).
  // He heaves the shell round off its back, catches himself on the claws as he
  // comes onto his flank, folds the legs in underneath and pushes up. The
  // travel that sells it as a ROLL rather than a spin is real world movement,
  // driven by the fighter for the length of the clip, not authored here.
  rollUpR: {
    dur: 0.85,
    keys: [
      { t: 0, pose: { hipsPos: [0, -1.2, 0.22], hipsRot: [0, 0, 180], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-24, 0, -56], shoulderR: [-24, 0, 56], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0] } },
      // throw the weight over the right flank — right claw reaches for ground
      { t: 0.17, ease: 'inOutQuad', pose: { hipsPos: [0, -1.25, 0.2], hipsRot: [4, 0, 146], torso: [6, 0, -10], head: [4, 0, 0], shoulderL: [-52, 0, -30], shoulderR: [-10, 0, 62], elbowL: [-30, 0, 0], elbowR: [-84, 0, 0], thighL: [-30, 0, -16], thighR: [-12, 0, 10], kneeL: [56, 0, 0], kneeR: [34, 0, 0] } },
      // onto the flank, claws taking the weight, legs gathering under him
      { t: 0.36, ease: 'inOutQuad', pose: { hipsPos: [0, -1.35, 0.14], hipsRot: [6, 0, 92], torso: [10, 0, -16], head: [-4, 0, 0], shoulderL: [-40, 0, -20], shoulderR: [-6, 0, 40], elbowL: [-56, 0, 0], elbowR: [-58, 0, 0], thighL: [-56, 0, -10], thighR: [-46, 0, 8], kneeL: [86, 0, 0], kneeR: [78, 0, 0], ankleL: [-24, 0, 0], ankleR: [-24, 0, 0] } },
      // shell comes up off the pavement, legs planting
      { t: 0.53, ease: 'outCubic', pose: { hipsPos: [0, -1.05, 0.08], hipsRot: [8, 0, 40], torso: [18, 0, -10], head: [-12, 0, 0], shoulderL: [-20, 0, -26], shoulderR: [-14, 0, 26], elbowL: [-46, 0, 0], elbowR: [-46, 0, 0], thighL: [-70, 0, -6], thighR: [-66, 0, 6], kneeL: [104, 0, 0], kneeR: [100, 0, 0], ankleL: [-32, 0, 0], ankleR: [-32, 0, 0] } },
      // up on the legs, still crouched over them
      { t: 0.68, ease: 'outQuad', pose: { hipsPos: [0, -0.5, 0.02], hipsRot: [4, 0, 10], torso: [14, 0, -2], head: [-6, 0, 0], shoulderL: [-8, 0, -22], shoulderR: [-8, 0, 22], elbowL: [-40, 0, 0], elbowR: [-40, 0, 0], thighL: [-38, 0, 0], thighR: [-36, 0, 0], kneeL: [68, 0, 0], kneeR: [66, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.85, ease: 'inOutQuad', pose: REST_FULL },
    ],
  },
  dead: {
    dur: 1.3, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.35, ease: 'inOutQuad', pose: { hipsPos: [0, -1.3, 0], torso: [25, 0, 8], head: [30, 0, 0], kneeL: [100, 0, 0], kneeR: [100, 0, 0], thighL: [-55, 0, 0], thighR: [-55, 0, 0], ankleL: [-45, 0, 0], ankleR: [-45, 0, 0], shoulderL: [10, 0, -20], shoulderR: [10, 0, 20] } },
      { t: 0.7, ease: 'inQuad', pose: { hipsPos: [0, -2.2, 0.3], hipsRot: [35, 0, 0], torso: [55, 0, 10], head: [40, 0, 0], shoulderL: [-30, 0, -40], shoulderR: [-30, 0, 40], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0] } },
      { t: 1.3, ease: 'outBounce', pose: { hipsPos: [0, -2.5, 0.35], hipsRot: [42, 0, 0], torso: [60, 0, 12] } },
    ],
    events: [{ t: 0.7, type: 'sfx', arg: 'bodyfall' }, { t: 0.75, type: 'shake', arg: 0.4 }],
  },

  // ---------- specials ----------
  groundPound: {
    dur: 0.9,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, ease: 'inOutCubic', pose: { hipsPos: [0, 0.22, 0], hipsRot: [-6, 0, 0], torso: [-26, 0, 0], head: [-18, 0, 0], shoulderL: [-168, 0, -28], shoulderR: [-168, 0, 28], elbowL: [-26, 0, 0], elbowR: [-26, 0, 0] } },
      { t: 0.46, ease: 'inCubic', pose: { hipsPos: [0, -1.0, 0], hipsRot: [14, 0, 0], torso: [52, 0, 0], head: [18, 0, 0], shoulderL: [-45, 0, -12], shoulderR: [-45, 0, 12], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0], kneeL: [70, 0, 0], kneeR: [70, 0, 0], thighL: [-36, 0, 0], thighR: [-36, 0, 0], ankleL: [-30, 0, 0], ankleR: [-30, 0, 0] } },
      { t: 0.62, ease: 'outQuad', pose: { hipsPos: [0, -0.8, 0] } },
      { t: 0.9, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.44, type: 'fire' }, { t: 0.46, type: 'shake', arg: 0.8 }],
  },
  lunge: { // dash-stab — body thrown flat, arms speared, trailing leg at full stretch
    dur: 0.6, hold: false,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [42, 0, -8], head: [-22, 0, 0], hipsRot: [12, 0, 0], shoulderL: [-108, 0, -10], shoulderR: [-108, 0, 10], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], thighL: [-52, 0, 0], thighR: [34, 0, 0], kneeL: [55, 0, 0], kneeR: [82, 0, 0], ankleR: [30, 0, 0], hipsPos: [0, -0.5, 0] } },
      { t: 0.42, ease: 'inOutQuad', pose: { torso: [32, 0, -5], hipsRot: [8, 0, 0] } },
      { t: 0.6, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsRot: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0], hipsPos: [0, 0, 0] } },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'dash' }],
  },
  chargeLean: { // bull rush / stampede loop — lower, hungrier, swaying with effort
    dur: 0.5, loop: true,
    keys: [
      { t: 0, pose: { torso: [50, 4, -4], head: [-26, 0, 0], hipsRot: [8, 0, 0], shoulderL: [36, 0, -34], shoulderR: [36, 0, 34], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0], hipsPos: [0, -0.42, 0] } },
      { t: 0.25, ease: 'inOutQuad', pose: { torso: [54, -4, 4], hipsPos: [0, -0.5, 0], head: [-28, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { torso: [50, 4, -4], hipsPos: [0, -0.42, 0], head: [-26, 0, 0] } },
    ],
  },
  burst: { // static field / backdraft / absolute zero — coil tight, detonate open
    dur: 0.78,
    keys: [
      { t: 0, pose: {} },
      { t: 0.26, ease: 'inOutCubic', pose: { hipsPos: [0, -0.7, 0], hipsRot: [6, 0, 0], torso: [30, 0, 0], head: [18, 0, 0], shoulderL: [-60, 45, -4], shoulderR: [-60, -45, 4], elbowL: [-130, 0, 0], elbowR: [-130, 0, 0], kneeL: [55, 0, 0], kneeR: [55, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0] } },
      { t: 0.44, ease: 'outBack', pose: { hipsPos: [0, 0.3, 0], hipsRot: [-10, 0, 0], torso: [-26, 0, 0], head: [-22, 0, 0], shoulderL: [-30, 0, -88], shoulderR: [-30, 0, 88], elbowL: [-2, 0, 0], elbowR: [-2, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
      { t: 0.78, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.42, type: 'fire' }, { t: 0.44, type: 'shake', arg: 0.7 }],
  },
  flurry: { // serpent storm / wild hunt claw loop — wide slashing arcs, hips whipping
    dur: 0.44, loop: true,
    keys: [
      { t: 0, pose: { torso: [12, 34, -10], hipsRot: [0, 12, 0], shoulderL: [-112, -26, 4], elbowL: [-8, 0, 0], shoulderR: [-24, 0, 26], elbowR: [-96, 0, 0], head: [0, -14, 0] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [12, -34, 10], hipsRot: [0, -12, 0], shoulderR: [-112, 26, -4], elbowR: [-8, 0, 0], shoulderL: [-24, 0, -26], elbowL: [-96, 0, 0], head: [0, 14, 0] } },
      { t: 0.44, ease: 'outBack', pose: { torso: [12, 34, -10], hipsRot: [0, 12, 0], shoulderL: [-112, -26, 4], elbowL: [-8, 0, 0], shoulderR: [-24, 0, 26], elbowR: [-96, 0, 0], head: [0, -14, 0] } },
    ],
    events: [{ t: 0.05, type: 'hit', arg: 0 }, { t: 0.27, type: 'hit', arg: 0 }],
  },
  // (spinFire, the old arms-FORWARD hurricane loop, is gone — hurricaneSpin
  // replaced it: the storm now needs the arms out to the sides to fly off.)
  hurricaneSpin: { // VULCAN's BULLET HURRICANE. The storm GATHERS first: both
    // gatling arms fling out wide and HIGH — abducted past the shoulder line so
    // the barrels ride diagonally up-and-out, not drooping — elbows locked
    // straight, and only then does combat spin the torso up from a standstill
    // under this pose (specials.js bulletHurricane — delay/ramp/brake on
    // _spinFx). `hold` parks the final key so the arms stay outstretched for the
    // whole whirl, which is what the rounds are seen to fly off.
    dur: 1.0, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.34, ease: 'outBack', pose: { shoulderL: [-20, -40, -142], shoulderR: [-20, 40, 142], elbowL: [0, 0, 0], elbowR: [0, 0, 0], torso: [-9, 0, 0], head: [-12, 0, 0], hipsPos: [0, -0.2, 0], kneeL: [24, 0, 0], kneeR: [24, 0, 0], thighL: [-13, 0, 0], thighR: [-13, 0, 0] } },
      { t: 1.0, ease: 'inOutQuad', pose: { shoulderL: [-20, -40, -138], shoulderR: [-20, 40, 138], elbowL: [-2, 0, 0], elbowR: [-2, 0, 0], torso: [7, 0, 0], head: [-4, 0, 0], hipsPos: [0, -0.36, 0], kneeL: [34, 0, 0], kneeR: [34, 0, 0], thighL: [-18, 0, 0], thighR: [-18, 0, 0] } },
    ],
  },
  spray: { // flame / napalm sweep channel
    dur: 0.9, upper: true, loop: true,
    keys: [
      { t: 0, pose: { shoulderR: [-84, -14, 4], elbowR: [-10, 0, 0], shoulderL: [-84, 14, -4], elbowL: [-10, 0, 0], torso: [6, 8, 0], head: [4, 0, 0] } },
      { t: 0.45, ease: 'inOutQuad', pose: { torso: [6, -8, 0], shoulderR: [-84, -10, 4], shoulderL: [-84, 18, -4] } },
      { t: 0.9, ease: 'inOutQuad', pose: { torso: [6, 8, 0], shoulderR: [-84, -14, 4], shoulderL: [-84, 14, -4] } },
    ],
  },
  clawSnap: { // CRANKY heavy — the arms reach OUTSTRETCHED wide to the sides
    // (elbows straight, pincers gaping), then SMASH together at the centerline
    // like one giant pincer. Deliberately symmetric with NO body yaw/twist: a
    // wide crab squares up and claps, it doesn't wind up like a boxer.
    //
    // The inward yaw at the smash is generous on purpose — how far the claws can
    // actually travel before they'd pass THROUGH each other depends on the
    // model's arm proportions, so each body caps it to its own geometry
    // (armClampYaw in the cranky signature / GLB profile). Lateral travel is
    // driven almost entirely by shoulder YAW; pitch barely moves the claws
    // sideways, so pitch stays free to sell the lunge.
    dur: 0.55,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'outCubic', pose: { torso: [5, 0, 0], head: [-7, 0, 0], shoulderL: [-34, -52, -10], shoulderR: [-34, 52, 10], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0], hipsPos: [0, -0.06, -0.04] } },
      { t: 0.32, ease: 'inCubic', pose: { torso: [12, 0, 0], head: [2, 0, 0], shoulderL: [-58, 44, 8], shoulderR: [-58, -44, -8], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], hipsPos: [0, -0.1, 0.15] } },
      { t: 0.44, ease: 'outQuad', pose: { torso: [10, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], hipsPos: [0, 0, 0] } },
    ],
    events: [{ t: 0.29, type: 'sfx', arg: 'whooshBig' }, { t: 0.32, type: 'hit', arg: 0 }, { t: 0.33, type: 'sfx', arg: 'block' }, { t: 0.34, type: 'shake', arg: 0.5 }],
  },
  // ---------- JERRY: the claw rakes (his light chain) ----------
  // The shared jab trio is a BOXER's kit — punches sold with torso twist, and
  // the third one an uppercut. On a shrimp none of that reads: the carapace
  // slewing around was the visible motion, and an uppercut swings a downward-
  // hanging claw the wrong way entirely. These are OVERHAND RAKES: the claw
  // chambers UP AND OVER the shell, past vertical, then slams down-and-forward
  // through the target — a claw is a pick, not a fist. The shell stays nearly
  // square throughout (torso yaw ≤5° against the shared trio's 22-30°): the
  // arm is the whole show. R first, L is the mirror, and the finisher below
  // brings both down together.
  jerryRakeR: {
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.55,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'outCubic', pose: { shoulderR: [-148, -8, 14], elbowR: [-64, 0, 0], handR: [-24, 0, 0], shoulderL: [4, 0, -14], torso: [-4, 5, 2], head: [-4, -4, 0], hipsPos: [0, -0.05, -0.05] } },
      { t: 0.3, ease: 'inCubic', pose: { shoulderR: [-34, 4, -6], elbowR: [-4, 0, 0], handR: [26, 0, 0], shoulderL: [8, 0, -16], torso: [9, -5, -2], head: [2, 3, 0], hipsPos: [0, -0.1, 0.08] } },
      { t: 0.4, ease: 'outQuad', pose: { shoulderR: [-42, 2, -2], handR: [12, 0, 0], torso: [6, -3, -1] } },
      { t: 0.55, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10] } },
    ],
    // HIT AFTER ARRIVAL, not on the strike key. The pose smoother lags the
    // clip, and this swing travels 114 degrees in 0.12s — measured
    // (tools/striketime.mjs), at t=0.30 the claw is still up over his own
    // back (0.25 body heights forward, 1.0 up) and only reaches down-and-
    // forward (0.57 fwd, 0.73 up) around t=0.32. Firing on the key resolved
    // the blow at the top of the chamber and whiffed over the target.
    events: [{ t: 0.2, type: 'sfx', arg: 'whoosh' }, { t: 0.35, type: 'hit', arg: 0 }],
  },
  jerryRake2: { // combo finisher: BOTH claws chamber over the shell and come
    // down as one — the two-arm blow at the end of the rake chain. Slightly
    // longer wind-up than the singles, a knee dip under the impact, and still
    // no body yaw: symmetric limbs, square shell.
    dur: 0.62,
    keys: [
      { t: 0, pose: {} },
      { t: 0.2, ease: 'outCubic', pose: { shoulderL: [-152, 6, -16], shoulderR: [-152, -6, 16], elbowL: [-60, 0, 0], elbowR: [-60, 0, 0], handL: [-24, 0, 0], handR: [-24, 0, 0], torso: [-6, 0, 0], head: [-6, 0, 0], hipsPos: [0, -0.06, -0.08] } },
      { t: 0.34, ease: 'inCubic', pose: { shoulderL: [-36, -4, -4], shoulderR: [-36, 4, 4], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0], handL: [28, 0, 0], handR: [28, 0, 0], torso: [10, 0, 0], head: [3, 0, 0], hipsPos: [0, -0.12, 0.1], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
      { t: 0.46, ease: 'outQuad', pose: { torso: [7, 0, 0], hipsPos: [0, -0.06, 0.04] } },
      { t: 0.62, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] } },
    ],
    events: [{ t: 0.24, type: 'sfx', arg: 'whooshBig' }, { t: 0.39, type: 'hit', arg: 2 }, { t: 0.4, type: 'shake', arg: 0.3 }],
  },
  // ---------- JERRY: the barrage (his heavy) ----------
  // REAR BACK, then eight quick forward-and-downward claw strikes, arms
  // alternating — a frenzy, not one blow. Every `hit` event resolves a full
  // strike, so the roster's heavy dmg/knock are PER HIT (8 × 11 ≈ one shared
  // heavy when most land) and knock stays small so the victim is pummelled in
  // place rather than launched off the second hit. The shell leans in and
  // stays leaned — all the travel is in the claws.
  jerryBarrage: {
    dur: 1.3,
    keys: [
      { t: 0, pose: {} },
      // the rear-back: shell tips back and low, both claws cocked over the top
      { t: 0.3, ease: 'outCubic', pose: { torso: [-14, 0, 0], head: [-10, 0, 0], hipsPos: [0, -0.08, -0.18], shoulderL: [-150, 6, -16], shoulderR: [-150, -6, 16], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], handL: [-24, 0, 0], handR: [-24, 0, 0], kneeL: [12, 0, 0], kneeR: [12, 0, 0] } },
      // the barrage: one claw down-and-forward while the other re-cocks, at a
      // strike every 0.09s — each key IS one alternation extreme
      { t: 0.38, ease: 'inCubic', pose: { torso: [8, -3, 0], head: [0, 0, 0], hipsPos: [0, -0.1, 0.06], shoulderR: [-34, 2, -4], elbowR: [-6, 0, 0], handR: [24, 0, 0], shoulderL: [-128, 4, -10], elbowL: [-56, 0, 0], handL: [-20, 0, 0] } },
      { t: 0.47, ease: 'inOutQuad', pose: { torso: [8, 3, 0], shoulderL: [-34, -2, 4], elbowL: [-6, 0, 0], handL: [24, 0, 0], shoulderR: [-128, -4, 10], elbowR: [-56, 0, 0], handR: [-20, 0, 0] } },
      { t: 0.56, ease: 'inOutQuad', pose: { torso: [8, -3, 0], shoulderR: [-34, 2, -4], elbowR: [-6, 0, 0], handR: [24, 0, 0], shoulderL: [-128, 4, -10], elbowL: [-56, 0, 0], handL: [-20, 0, 0] } },
      { t: 0.65, ease: 'inOutQuad', pose: { torso: [8, 3, 0], shoulderL: [-34, -2, 4], elbowL: [-6, 0, 0], handL: [24, 0, 0], shoulderR: [-128, -4, 10], elbowR: [-56, 0, 0], handR: [-20, 0, 0] } },
      { t: 0.74, ease: 'inOutQuad', pose: { torso: [8, -3, 0], shoulderR: [-34, 2, -4], elbowR: [-6, 0, 0], handR: [24, 0, 0], shoulderL: [-128, 4, -10], elbowL: [-56, 0, 0], handL: [-20, 0, 0] } },
      { t: 0.83, ease: 'inOutQuad', pose: { torso: [8, 3, 0], shoulderL: [-34, -2, 4], elbowL: [-6, 0, 0], handL: [24, 0, 0], shoulderR: [-128, -4, 10], elbowR: [-56, 0, 0], handR: [-20, 0, 0] } },
      { t: 0.92, ease: 'inOutQuad', pose: { torso: [8, -3, 0], shoulderR: [-34, 2, -4], elbowR: [-6, 0, 0], handR: [24, 0, 0], shoulderL: [-128, 4, -10], elbowL: [-56, 0, 0], handL: [-20, 0, 0] } },
      { t: 1.01, ease: 'inOutQuad', pose: { torso: [8, 3, 0], shoulderL: [-34, -2, 4], elbowL: [-6, 0, 0], handL: [24, 0, 0], shoulderR: [-128, -4, 10], elbowR: [-56, 0, 0], handR: [-20, 0, 0] } },
      { t: 1.3, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] } },
    ],
    events: [
      { t: 0.28, type: 'sfx', arg: 'whooshBig' },
      // each hit sits one arrival-lag (0.03s) PAST its own strike key — see
      // the note on jerryRakeR; measured, the claw is down-and-forward by then
      { t: 0.41, type: 'hit', arg: 0 }, { t: 0.5, type: 'hit', arg: 0 },
      { t: 0.59, type: 'hit', arg: 0 }, { t: 0.6, type: 'sfx', arg: 'whoosh' },
      { t: 0.68, type: 'hit', arg: 0 }, { t: 0.77, type: 'hit', arg: 0 },
      { t: 0.86, type: 'hit', arg: 0 }, { t: 0.87, type: 'sfx', arg: 'whoosh' },
      { t: 0.95, type: 'hit', arg: 0 }, { t: 1.04, type: 'hit', arg: 0 },
      { t: 1.06, type: 'shake', arg: 0.4 },
    ],
  },
  pounceLeap: { // SAURION pounce airtime — legs cocked under the body, head
    // locked on prey, and the sickle claws REACHING: both arms thrown forward
    // and slightly out, elbows part-folded so the hands lead the body into the
    // target. (They used to sweep BACK, which is a diver's pose, not a
    // predator's — the claws are the reason for the leap and they arrived
    // last. See the foreCarry note in defClipVariants.) Leg/torso/head values
    // are deltas over his raptor rest pose; arm values are absolute.
    dur: 0.6, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [-10, 0, 0], shoulderL: [-98, 0, -22], shoulderR: [-98, 0, 22], elbowL: [-52, 0, 0], elbowR: [-52, 0, 0], handL: [32, 0, 12], handR: [32, 0, -12], thighL: [-28, 0, -4], thighR: [-28, 0, 4], kneeL: [24, 0, 0], kneeR: [24, 0, 0], ankleL: [-22, 0, 0], ankleR: [-22, 0, 0], hipsRot: [16, 0, 0] } },
    ],
  },
  biteLatch: { // SAURION riding the kill — legs clenched in a deep gripping
    // crouch (talons in), body hunched low over them, and a four-beat loop of
    // JAWS AND CLAWS: head rears back and hammers the collar, the right sickle
    // chambers and is dragged down through them, hammer again, left sickle. He
    // used to only peck, with both hands hanging idle at his sides — a raptor
    // on top of something uses everything it has. See PERCH_BEATS.
    dur: PERCH_BEATS.loop, loop: true,
    keys: [
      { t: 0, pose: { ...PERCH_UP, ...PERCH_LEGS, ...perchCarry('L'), ...perchCarry('R') } },
      { t: PERCH_BEATS.bite1, ease: 'inCubic', pose: { ...PERCH_BITE, ...perchChamber('R') } },
      { t: 0.14, ease: 'outCubic', pose: { ...PERCH_UP } },
      // RIGHT RAKE — the shoulder rolls into it so the whole frame drives the claw
      { t: PERCH_BEATS.rakeR, ease: 'inCubic', pose: { torso: [30, 0, -7], head: [-6, 0, 0], ...perchRake('R') } },
      { t: 0.31, ease: 'outCubic', pose: { ...PERCH_UP, ...perchCarry('R') } },
      { t: PERCH_BEATS.bite2, ease: 'inCubic', pose: { ...PERCH_BITE, ...perchChamber('L') } },
      { t: 0.44, ease: 'outCubic', pose: { ...PERCH_UP } },
      { t: PERCH_BEATS.rakeL, ease: 'inCubic', pose: { torso: [30, 0, 7], head: [-6, 0, 0], ...perchRake('L') } },
      { t: PERCH_BEATS.loop, ease: 'outCubic', pose: { ...PERCH_UP, ...perchCarry('L') } },
    ],
  },
  grabReach: { // COLOSSUS: both hands lunge out low to seize the target
    dur: 0.3, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.14, ease: 'outCubic', pose: { torso: [22, 0, 0], head: [-10, 0, 0], shoulderL: [-78, 12, -6], shoulderR: [-78, -12, 6], elbowL: [-16, 0, 0], elbowR: [-16, 0, 0], hipsPos: [0, -0.22, 0], hipsRot: [8, 0, 0] } },
    ],
  },
  liftHold: { // hoisting the catch overhead — arms drive straight up, back sets
    dur: 0.45, hold: true,
    keys: [
      { t: 0, pose: { torso: [18, 0, 0], shoulderL: [-95, 0, -10], shoulderR: [-95, 0, 10], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0], hipsPos: [0, -0.2, 0] } },
      { t: 0.45, ease: 'outBack', pose: { torso: [-10, 0, 0], head: [-16, 0, 0], shoulderL: [-172, 0, -8], shoulderR: [-172, 0, 8], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], hipsPos: [0, 0.1, 0], hipsRot: [-4, 0, 0] } },
    ],
  },
  throwHeave: { // the launch: whole frame whips forward, arms hurl down the line
    dur: 0.5,
    keys: [
      { t: 0, pose: { torso: [-10, 0, 0], head: [-16, 0, 0], shoulderL: [-172, 0, -8], shoulderR: [-172, 0, 8], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], hipsPos: [0, 0.1, 0] } },
      { t: 0.16, ease: 'inCubic', pose: { torso: [34, 0, 0], head: [6, 0, 0], shoulderL: [-58, 0, -10], shoulderR: [-58, 0, 10], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0], hipsPos: [0, -0.3, 0.1], hipsRot: [10, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0] } },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'whooshBig' }, { t: 0.16, type: 'shake', arg: 0.5 }],
  },
  hangGrab: { // wall grab — punch hand locked onto the building, body hanging, legs braced
    dur: 0.25, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.25, ease: 'outQuad', pose: { shoulderL: [-160, 0, -12], elbowL: [-16, 0, 0], shoulderR: [-42, 0, 24], elbowR: [-68, 0, 0], torso: [10, 0, -6], head: [-16, 0, 0], thighL: [-26, 0, -6], thighR: [-40, 0, 8], kneeL: [42, 0, 0], kneeR: [60, 0, 0], ankleL: [-14, 0, 0], ankleR: [-22, 0, 0], hipsRot: [6, 0, 0] } },
    ],
  },

  // ---------- KONGA: a knuckle-walker fights by REARING UP off his arms ----
  // Every one of his blows starts from four-point stance, so the wind-up is
  // always the same beat: the trunk comes UP off the knuckles (hipsPos rises,
  // torso pitches back) before the arm is free to throw anything. That rear-up
  // IS his tell, and it is why his blows are slow and enormous.
  kongaSlam: { // heavy: rears to full height, both fists overhead, DRIVES down
    dur: 1.02,
    keys: [
      { t: 0, pose: {} },
      // rear up onto the back legs, fists gathering high and back
      { t: 0.30, ease: 'outCubic', pose: { hipsPos: [0, 0.62, -0.2], hipsRot: [-16, 0, 0], torso: [-30, 0, 0], head: [-24, 0, 0], shoulderL: [-158, 10, -26], shoulderR: [-158, -10, 26], elbowL: [-52, 0, 0], elbowR: [-52, 0, 0], thighL: [16, 0, -6], thighR: [16, 0, 6], kneeL: [-14, 0, 0], kneeR: [-14, 0, 0] } },
      // hang at the apex for a beat — the moment the shadow lands on you
      { t: 0.44, ease: 'inOutQuad', pose: { hipsPos: [0, 0.68, -0.22], torso: [-34, 0, 0], head: [-28, 0, 0], shoulderL: [-168, 12, -30], shoulderR: [-168, -12, 30] } },
      // DOWN — the whole mass behind two fists
      { t: 0.60, ease: 'outQuad', pose: { hipsPos: [0, -0.34, 0.26], hipsRot: [22, 0, 0], torso: [46, 0, 0], head: [22, 0, 0], shoulderL: [-16, 0, -14], shoulderR: [-16, 0, 14], elbowL: [-8, 0, 0], elbowR: [-8, 0, 0], thighL: [-24, 0, -8], thighR: [-24, 0, 8], kneeL: [40, 0, 0], kneeR: [40, 0, 0] } },
      // settle back onto the knuckles
      { t: 1.02, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] } },
    ],
    events: [
      { t: 0.12, type: 'sfx', arg: 'whooshBig' }, { t: 0.44, type: 'sfx', arg: 'charge' },
      { t: 0.60, type: 'hit', arg: 0 }, { t: 0.60, type: 'sfx', arg: 'hitHeavy' }, { t: 0.61, type: 'shake', arg: 0.75 },
    ],
  },
  chestBeat: { // special: rears up and DRUMS the chest — alternating fists
    dur: 1.30, strikeArm: 'R',
    keys: [
      { t: 0, pose: {} },
      { t: 0.26, ease: 'outCubic', pose: { hipsPos: [0, 0.66, -0.22], hipsRot: [-18, 0, 0], torso: [-26, 0, 0], head: [-30, 0, 0], shoulderL: [-96, 20, -34], shoulderR: [-96, -20, 34], elbowL: [-118, 0, 0], elbowR: [-118, 0, 0], thighL: [18, 0, -6], thighR: [18, 0, 6], kneeL: [-16, 0, 0], kneeR: [-16, 0, 0] } },
      // drum: right in, left in, right in — torso jolts on each strike
      { t: 0.42, ease: 'outQuad', pose: { torso: [-18, 10, 0], shoulderR: [-72, -6, 12], elbowR: [-142, 0, 0], shoulderL: [-104, 24, -40], elbowL: [-108, 0, 0] } },
      { t: 0.58, ease: 'outQuad', pose: { torso: [-18, -10, 0], shoulderL: [-72, 6, -12], elbowL: [-142, 0, 0], shoulderR: [-104, -24, 40], elbowR: [-108, 0, 0] } },
      { t: 0.74, ease: 'outQuad', pose: { torso: [-22, 8, 0], shoulderR: [-72, -6, 12], elbowR: [-142, 0, 0], shoulderL: [-104, 24, -40], elbowL: [-108, 0, 0] } },
      // arms FLUNG wide on the last beat — the shout
      { t: 0.92, ease: 'outBack', pose: { torso: [-34, 0, 0], head: [-34, 0, 0], shoulderL: [-58, 30, -76], shoulderR: [-58, -30, 76], elbowL: [-40, 0, 0], elbowR: [-40, 0, 0] } },
      { t: 1.30, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] } },
    ],
    events: [
      { t: 0.42, type: 'sfx', arg: 'hitHeavy' }, { t: 0.42, type: 'shake', arg: 0.3 },
      { t: 0.58, type: 'sfx', arg: 'hitHeavy' }, { t: 0.58, type: 'shake', arg: 0.3 },
      { t: 0.74, type: 'sfx', arg: 'hitHeavy' }, { t: 0.74, type: 'shake', arg: 0.35 },
      { t: 0.92, type: 'fire' },
    ],
  },
  kongaLob: { // ranged: HUNCHES FORWARD over the knuckles and holds while the
    // racks empty. He used to rear BACK for this, which tipped the pods'
    // mouths at the sky and turned a direct-fire salvo into a lob — the
    // rockets left along a barrel line that was no longer the one he was
    // looking down. Leaning INTO the shot keeps the shoulder mounts level and
    // pointed where the body is pointed (the pods themselves are held flat by
    // SIGNATURES.konga), so what the animation says and what the missiles do
    // are the same thing. The arms still drop and open outward, which is what
    // clears the racks over the top of them.
    dur: 0.86, upper: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [14, 0, 0], head: [-10, 0, 0], shoulderL: [-24, 16, -34], shoulderR: [-24, -16, 34], elbowL: [-64, 0, 0], elbowR: [-64, 0, 0] } },
      { t: 0.46, ease: 'inOutQuad', pose: { torso: [17, 0, 0], head: [-13, 0, 0] } },
      { t: 0.86, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.24, type: 'fire' }, { t: 0.24, type: 'sfx', arg: 'missile' }],
  },
  kongaPound: { // ULT beat: one fist gathered high and DRIVEN into the road.
    // Upper-body only, deliberately — the ult lets him keep walking while he
    // does it (Fighter._ultMove), so the legs stay on the locomotion layer and
    // he can march the shockwaves onto someone. Short, so the beats can
    // alternate fast enough to read as drumming rather than as repeated slams.
    dur: 0.52, upper: true, strikeArm: 'R',
    keys: [
      { t: 0, pose: {} },
      // gather: this fist up and back over the shoulder, the chest opening
      { t: 0.18, ease: 'outCubic', pose: { hipsRot: [-10, 0, 0], torso: [-18, -12, 0], head: [-14, 0, 0], shoulderR: [-150, -14, 26], elbowR: [-46, 0, 0], shoulderL: [-14, 0, -12], elbowL: [-24, 0, 0] } },
      // DOWN — the whole shoulder behind it, hips punched into the floor
      { t: 0.30, ease: 'outQuad', pose: { hipsPos: [0, -0.22, 0.14], hipsRot: [16, 0, 0], torso: [30, 8, 0], head: [18, 0, 0], shoulderR: [-8, 0, 12], elbowR: [-6, 0, 0], shoulderL: [-6, 0, -14], elbowL: [-20, 0, 0] } },
      // recover onto the knuckles, ready for the other hand
      { t: 0.52, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
    ],
    events: [
      { t: 0.10, type: 'sfx', arg: 'whooshBig' },
      { t: 0.30, type: 'fire' }, { t: 0.30, type: 'sfx', arg: 'slam' }, { t: 0.31, type: 'shake', arg: 0.45 },
    ],
  },

  // ---------- TRITONE: everything is thrown with the NECK ------------------
  // Six tonnes on four columns cannot pivot, so his blows are head sweeps and
  // horn tosses: the body sets the line, the neck delivers. hipsRot does the
  // aiming, head/torso do the swing.
  tritoneGore: { // light: a short brutal horn jab, head down and drive
    // the blow is the HORNS: resolved and aimed on the head (it was
    // `strikeArm: 'R'`, which on a ceratopsian is the right foreleg)
    dur: 0.62, strikeLimb: 'head',
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'outCubic', pose: { hipsRot: [-5, -12, 0], torso: [-8, -14, 0], head: [-12, -16, 0], shoulderR: [8, 0, 14], shoulderL: [-6, 0, -8] } },
      // the jab lands by throwing the NECK, not by dropping the chest onto the
      // front feet — his toes went 1.3 units under the road doing the latter
      { t: 0.28, ease: 'outBack', pose: { hipsPos: [0, -0.03, 0.16], hipsRot: [4, 8, 0], torso: [10, 14, 0], head: [24, 18, 0], shoulderR: [-10, 0, 8], shoulderL: [4, 0, -12] } },
      { t: 0.40, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0.06], hipsRot: [2, 4, 0], torso: [6, 8, 0], head: [12, 8, 0] } },
      { t: 0.62, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10] } },
    ],
    events: [{ t: 0.22, type: 'sfx', arg: 'whoosh' }, { t: 0.28, type: 'hit', arg: 0 }],
  },
  tritoneToss: { // heavy: horns dig LOW then rip up and over — the launcher
    dur: 0.98, strikeLimb: 'head',
    keys: [
      { t: 0, pose: {} },
      // set the feet and drop the head — the shovel going in
      { t: 0.30, ease: 'outCubic', pose: { hipsPos: [0, -0.24, -0.14], hipsRot: [-16, 0, 0], torso: [-26, 0, 0], head: [-46, 0, 0], thighL: [-18, 0, -6], thighR: [-18, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], shoulderL: [14, 0, -10], shoulderR: [14, 0, 10] } },
      { t: 0.42, ease: 'inOutQuad', pose: { head: [-52, 0, 0], torso: [-30, 0, 0] } },
      // RIP UP — the whole front end comes off the ground
      { t: 0.58, ease: 'outBack', pose: { hipsPos: [0, 0.30, 0.24], hipsRot: [26, 0, 0], torso: [40, 0, 0], head: [52, 0, 0], thighL: [8, 0, -6], thighR: [8, 0, 6], kneeL: [-10, 0, 0], kneeR: [-10, 0, 0], shoulderL: [-40, 0, -16], shoulderR: [-40, 0, 16] } },
      { t: 0.74, ease: 'inOutQuad', pose: { hipsPos: [0, 0.08, 0.1], hipsRot: [12, 0, 0], torso: [20, 0, 0], head: [26, 0, 0] } },
      { t: 0.98, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] } },
    ],
    events: [
      { t: 0.34, type: 'sfx', arg: 'charge' }, { t: 0.58, type: 'hit', arg: 0 },
      { t: 0.58, type: 'sfx', arg: 'hitHeavy' }, { t: 0.59, type: 'shake', arg: 0.7 },
    ],
  },
  tritoneBrace: { // ranged/ult: plants all four legs and squats into the recoil
    dur: 0.9, hold: true,
    keys: [
      { t: 0, pose: {} },
      // PLANTED, not sat down: the squat that reads as bracing on a biped just
      // drags his tail through the road, so the recoil is taken on stiff legs
      // and a braced neck instead.
      { t: 0.28, ease: 'outCubic', pose: { hipsPos: [0, -0.08, -0.06], hipsRot: [-2, 0, 0], torso: [-5, 0, 0], head: [-6, 0, 0], thighL: [-7, 0, -10], thighR: [-7, 0, 10], kneeL: [13, 0, 0], kneeR: [13, 0, 0], ankleL: [-6, 0, 0], ankleR: [-6, 0, 0], shoulderL: [8, 0, -14], shoulderR: [8, 0, 14], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
      { t: 0.9, ease: 'inOutQuad', pose: { hipsPos: [0, -0.07, -0.06], head: [-4, 0, 0] } },
    ],
    events: [{ t: 0.3, type: 'sfx', arg: 'charge' }],
  },
};

// mirror a raw clip left<->right: swap L/R joint names, negate the y/z
// rotation components, and flip hipsPos.x — used to author one-sided
// attacks once and fire them from either arm
function mirrorRaw(raw) {
  const swap = (j) => (j.endsWith('L') ? j.slice(0, -1) + 'R' : j.endsWith('R') ? j.slice(0, -1) + 'L' : j);
  return {
    ...raw,
    // a mirrored one-armed blow is thrown with the OTHER arm...
    strikeArm: raw.strikeArm === 'L' ? 'R' : raw.strikeArm === 'R' ? 'L' : raw.strikeArm,
    // ...and a mirrored kick lands on the other foot
    strikeLimb: raw.strikeLimb ? raw.strikeLimb.replace(/([LR])$/, (c) => (c === 'L' ? 'R' : 'L')) : raw.strikeLimb,
    keys: raw.keys.map((k) => {
      const pose = {};
      for (const [j, v] of Object.entries(k.pose)) {
        pose[swap(j)] = j === 'hipsPos' ? [-v[0], v[1], v[2]] : [v[0], -v[1], -v[2]];
      }
      return { ...k, pose };
    }),
  };
}
CLIPS_RAW.braceL = mirrorRaw(CLIPS_RAW.brace); // colossus fires the OTHER cannon
CLIPS_RAW.shootL = mirrorRaw(CLIPS_RAW.shoot); // frogger's other gunk cannon
CLIPS_RAW.shootLoopL = mirrorRaw(CLIPS_RAW.shootLoop); // channel held in the LEFT hand (glacier's cryo beam)
CLIPS_RAW.gatlingLoopL = mirrorRaw(CLIPS_RAW.gatlingLoop); // vulcan's OTHER gatling takes the lead
CLIPS_RAW.fistLaunchL = mirrorRaw(CLIPS_RAW.fistLaunch); // titanus' other rocket fist
CLIPS_RAW.fistCatchL = mirrorRaw(CLIPS_RAW.fistCatch);   // ...and catching it back
CLIPS_RAW.bigPunch2 = mirrorRaw(CLIPS_RAW.bigPunch1); // right haymaker, same wind-up
CLIPS_RAW.punchHold2 = mirrorRaw(CLIPS_RAW.punchHold1); // right-arm charge
CLIPS_RAW.punchRelease2 = mirrorRaw(CLIPS_RAW.punchRelease1);
CLIPS_RAW.jerryRakeL = mirrorRaw(CLIPS_RAW.jerryRakeR); // the other claw's rake
CLIPS_RAW.stomp2 = mirrorRaw(CLIPS_RAW.stomp); // left-foot trample
CLIPS_RAW.rollUpL = mirrorRaw(CLIPS_RAW.rollUpR); // righting roll the other way
// Opposite-arm twins of the shared punch trio, so a light combo can be thrown
// off either lead (see LIGHT_ARM below and Fighter.doLight).
CLIPS_RAW.light1R = mirrorRaw(CLIPS_RAW.light1); // right jab
CLIPS_RAW.light2L = mirrorRaw(CLIPS_RAW.light2); // left cross
CLIPS_RAW.light3L = mirrorRaw(CLIPS_RAW.light3); // left uppercut
// TRITONE gores off alternate horns, so his combo swings the neck both ways.
CLIPS_RAW.tritoneGoreL = mirrorRaw(CLIPS_RAW.tritoneGore);
CLIPS_RAW.hitFlinchR = mirrorRaw(CLIPS_RAW.hitFlinchL);   // hit from the RIGHT
// KONGA's ult drums the ground with alternating fists — same beat, other hand.
CLIPS_RAW.kongaPoundL = mirrorRaw(CLIPS_RAW.kongaPound);

// ---------- smash mirrors ----------
// The shared overhead smash winds the body onto ONE side (hips/torso yaw)
// and slams back through it. Repeating it beat after beat read as canned,
// so every clip in the smash family gets a mirrored twin and the fighter
// alternates (Fighter.smashClip). The twins are compiled below under the
// ORIGINAL clip's name, so downstream checks keyed on the clip name —
// animator.isPlaying, the def.heavyClip lookups behind heavySpin /
// heavyDrive / heavyFlare, the charge-hold loop — match either side.
export const SMASH_MIRRORS = {
  heavy: 'heavyMirror',         // the shared two-hand overhead smash
  poundHold: 'poundHoldMirror', // TITANUS / COLOSSUS charged pound: the loop...
  poundSlam: 'poundSlamMirror', // ...and the discharge it lands on
};
for (const [base, twin] of Object.entries(SMASH_MIRRORS)) CLIPS_RAW[twin] = mirrorRaw(CLIPS_RAW[base]);

// ---------- compile: degrees -> radians, sparse per-joint tracks ----------
const D2R = Math.PI / 180;

// Exported so the pose workbench can compile an EDITED key list into a clip the
// animator will play (`?debug=pose` previews edits by handing the animator its
// own recompiled copy). Everything else should use CLIPS.
export function compileClip(name, raw) { return compile(name, raw); }

function compile(name, raw) {
  const tracks = {};
  const keys = [...raw.keys].sort((a, b) => a.t - b.t);
  for (const key of keys) {
    for (const [joint, v] of Object.entries(key.pose)) {
      if (!tracks[joint]) tracks[joint] = [];
      const isPos = joint === 'hipsPos';
      tracks[joint].push({
        t: key.t,
        ease: key.ease || 'inOutQuad',
        v: isPos ? [v[0], v[1], v[2]] : [v[0] * D2R, v[1] * D2R, v[2] * D2R],
      });
    }
  }
  return {
    name,
    dur: raw.dur,
    loop: !!raw.loop,
    hold: !!raw.hold,
    upper: !!raw.upper,
    // A FLOURISH, not a commitment: the round-start intro and the taunt own
    // the legs, so a player who starts running the moment control returns
    // slides with no walk cycle under them. Control implies ANIMATION
    // control — fighter.update drops these the instant a real input arrives.
    // Attacks deliberately do NOT carry it; those you are committed to.
    cancelOnMove: !!raw.cancelOnMove,
    strikeArm: raw.strikeArm || null, // 'L'/'R' on a ONE-ARMED blow, else null
    // Which limb the blow is RESOLVED on (combat/hurtbox.js): a part name
    // like 'footR'. Only needed where the auto-detection — "whichever
    // extremity leads furthest forward at the hit frame" — could pick the
    // wrong one, i.e. a kick thrown while an arm is also out front.
    strikeLimb: raw.strikeLimb || null,
    tracks,
    events: raw.events || [],
  };
}

// The ROLLOVER family — anything that has the body over on its back. Code that
// assumes an UPRIGHT mech has to stand down while one of these plays: a
// floor-relative arm clamp, a walk carry, an attack wind-up all read the pose
// as broken otherwise (see the CRANKY profile in glbanim.js).
export const PRONE_CLIPS = new Set(['flipOver', 'proneBack', 'rollUpR', 'rollUpL']);

export const CLIPS = {};
for (const [name, raw] of Object.entries(CLIPS_RAW)) CLIPS[name] = compile(name, raw);
// recompile the smash twins under their base name (see SMASH_MIRRORS)
for (const [base, twin] of Object.entries(SMASH_MIRRORS)) CLIPS[twin] = compile(base, CLIPS_RAW[twin]);

// ---------- per-mech clip variants (roster-def driven) ----------
// One shared `ball` tuck can't fit every silhouette — a crab's claws, a
// wolf's spine and a spring-legged shrimp all curl differently. A roster def
// may carry `ballPose`: a sparse { joint: [x,y,z] degrees } that REPLACES
// those joints' values in the tuck key (the rest of the tuck stays shared),
// compiled once per mech under the same 'ball' name so everything keyed on
// the clip name — the fighter, isPlaying, the workbenches — matches. The
// Animator resolves these between profile clipOverrides and CLIPS (play()),
// and the workbench adapter derives from the same function, so an edited
// ballPose shows up everywhere with no hand-copying.
// ---------- THE FORELIMB CARRY CLAMP (roster `foreCarry`) ----------
//
// SOME ARMS ARE WEAPONS HELD IN FRONT, and the shared clip library does not
// know it. Every shared clip is authored for a humanoid brawler, where an arm
// swung back is a windup, a balance counter, or simply where a hand ends up on
// the way to the floor — and, crucially, where NEUTRAL is `shoulder: 0`, arms
// hanging at the sides. A raptor's neutral is nothing like that: SAURION rests
// at shoulder -52 with the elbow folded to -78, claws up under the chest. So
// every shared clip that returned an arm "to neutral" dropped his claws behind
// him, and every one that threw an arm back for balance pointed his weapons
// at the wrong half of the world.
//
// Measured on saurion (`node tools/scratch/armband.mjs`, hand offset from its
// own shoulder along his facing, fraction of body height):
//
//   shoulder   0  elbow -12  ->  hand -0.11   (the shared neutral: BEHIND him)
//   shoulder +20 elbow -40   ->  hand -0.16   (the intro/getup crouch)
//   shoulder -30 elbow -55   ->  hand +0.17
//   shoulder -52 elbow -78   ->  hand +0.26   (his own rest — the carry)
//   shoulder -165 elbow -30  ->  hand -0.02   (victory's raised arm, thrown
//                                              back over his own head)
//
// The elbow crosses in front of the shoulder at about -20 of pitch and the
// hand goes back again past about -155, which is the band: a def carrying
// `foreCarry: { pitch: [lo, hi], elbow: [lo, hi] }` has EVERY clip's shoulder
// and elbow pitch clamped into it at COMPILE time.
//
// CLAMPED IN THE DATA, not at playback, and that is the whole design. A
// runtime clamp fights the clip silently: the pose workbench shows one thing
// and the body does another, and every measurement taken off the clip is a
// measurement of something that never plays. Clamping the compiled keys means
// what is authored is what plays, the keys still interpolate smoothly between
// each other (a clamped key is a key), and the workbenches, the probes and the
// game all see one clip.
//
// It is a FLOOR, not a pose: a clip whose arms are already in front is
// returned untouched (`byte-identical` — the variant map only carries clips
// that actually moved), so a mech's own authored forms are unaffected and a
// claw CHAMBERED high and outside before a rake — the one time a forelimb
// legitimately travels back — is well inside the band and stays as authored.
const ARM_PITCH = ['shoulderL', 'shoulderR'];
const ARM_ELBOW = ['elbowL', 'elbowR'];
function clampCarry(clip, carry) {
  const pitch = carry.pitch ? carry.pitch.map((d) => d * D2R) : null;
  const elbow = carry.elbow ? carry.elbow.map((d) => d * D2R) : null;
  let hit = false;
  const tracks = {};
  for (const [joint, keys] of Object.entries(clip.tracks)) {
    const band = ARM_PITCH.includes(joint) ? pitch : ARM_ELBOW.includes(joint) ? elbow : null;
    if (!band) { tracks[joint] = keys; continue; }
    tracks[joint] = keys.map((k) => {
      const x = Math.min(Math.max(k.v[0], band[0]), band[1]);
      if (x === k.v[0]) return k;
      hit = true;
      return { ...k, v: [x, k.v[1], k.v[2]] };
    });
  }
  return hit ? { ...clip, tracks } : null;
}

const _defClips = new Map();
// THE SHARED INTRO IS A BIPED'S CROUCH (hipsPos -1.5, knees 95, thighs -52),
// authored for a humanoid with a metre of leg to spend. Played on a body that
// is not one it goes through the road: measured (tools/groundprobe.mjs)
// fenrir's tail 1.72 units under, jerry's claw 2.21, tritone's toe 1.33 at
// every round start. A gait that is not a biped's takes the crouch at this
// fraction — hips drop, torso/head pitch and the leg fold all scaled together,
// so the shape is the same bow, shallower.
const INTRO_CROUCH = { quad: 0.3, trike: 0.12, arthropod: 0.12, hexapod: 0.12 };
function scaleCrouch(raw, k) {
  const PITCH = new Set(['torso', 'head', 'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR']);
  // THE ARMS ARE LEFT ALONE. Arm clip values are ABSOLUTE (legs/torso/head are
  // additive over the rest pose), so the intro's "arms back, then flex" is a
  // humanoid gesture stated in humanoid angles: on jerry it hung the claw-arms
  // straight down, two units under the road, and scaling those angles toward
  // zero only hung them straighter. A crab, a wolf or a trike keeps its own
  // carriage through the bow.
  const ARMS = /^(shoulder|elbow|hand)[LR]$/;
  return {
    ...raw,
    keys: raw.keys.map((key) => {
      const pose = {};
      for (const [j, v] of Object.entries(key.pose)) {
        if (ARMS.test(j)) continue;
        if (j === 'hipsPos') pose[j] = [v[0], v[1] * k, v[2]];
        else if (PITCH.has(j)) pose[j] = [v[0] * k, v[1], v[2]];
        else pose[j] = v;
      }
      return { ...key, pose };
    }),
  };
}

export function defClipVariants(def) {
  if (_defClips.has(def.id)) return _defClips.get(def.id);
  let out = null;
  const crouch = INTRO_CROUCH[def.gait];
  if (crouch !== undefined) {
    out = { intro: compile('intro', scaleCrouch(CLIPS_RAW.intro, crouch)) };
  }
  if (def.ballPose) {
    const raw = CLIPS_RAW.ball;
    const tuck = { ...raw.keys[raw.keys.length - 1].pose, ...def.ballPose };
    // (merged: the intro crouch above may already be in `out`)
    out = {
      ...(out || {}),
      ball: compile('ball', {
        ...raw,
        keys: [...raw.keys.slice(0, -1), { ...raw.keys[raw.keys.length - 1], pose: tuck }],
      }),
    };
  }
  if (def.foreCarry) {
    // every clip, including a variant this def has already reshaped above
    for (const [name, clip] of Object.entries(CLIPS)) {
      const held = clampCarry(out?.[name] || clip, def.foreCarry);
      if (held) (out ||= {})[name] = held;
    }
  }
  _defClips.set(def.id, out);
  return out;
}

// ---------- which arm a light-combo clip throws with ----------
// The authored punch trio is jab-LEFT, cross-RIGHT, uppercut-RIGHT — so the
// right arm threw two blows in a row and the uppercut was always the same
// hand. Fighter.doLight alternates arms across the combo instead and mirrors
// a clip whose authored arm isn't the one the pattern wants; this table is
// what tells it which arm each clip already uses, and what its twin is called.
//
// A clip listed here can be thrown either way. A clip NOT listed is used
// exactly as authored — that's the escape hatch for the bespoke cycles
// (viper's sword forms, saurion's kick/rake mix) whose moves are not
// symmetrical and have no mirrored twin.
//
// Unlike SMASH_MIRRORS above, these twins keep their OWN names rather than
// being compiled under the base one: nothing downstream keys on a light clip's
// name (the smash twins have to answer to `heavy` for def.heavyClip and
// isPlaying), and distinct names make each punch inspectable on its own in
// ?showcase=<id>&anim=light3L.
export const LIGHT_ARM = {
  light1: { arm: 'L', twin: 'light1R' },
  light2: { arm: 'R', twin: 'light2L' },
  light3: { arm: 'R', twin: 'light3L' },
  light1R: { arm: 'R', twin: 'light1' },
  light2L: { arm: 'L', twin: 'light2' },
  light3L: { arm: 'L', twin: 'light3' },
  // The haymaker pair TITANUS / COLOSSUS list as their light cycle. Both are
  // `punchHold` mechs today, so their blows actually come out of the
  // charge-and-release path (punchHold1/2 → punchRelease1/2, which alternates
  // on its own) and never reach doLight — these entries are here so the cycle
  // is described correctly if either ever drops the hold.
  bigPunch1: { arm: 'L', twin: 'bigPunch2' },
  bigPunch2: { arm: 'R', twin: 'bigPunch1' },
  // jerry's claw rakes: the alternation machinery works the same, the finisher
  // (jerryRake2) is two-armed and symmetric so it has no twin and no entry
  jerryRakeR: { arm: 'R', twin: 'jerryRakeL' },
  jerryRakeL: { arm: 'L', twin: 'jerryRakeR' },
};

// ---------- GLB clip variants (glbanim clipOverrides) ----------
// Compiled with the ORIGINAL clip's name so fighter machinery keyed on
// def.heavyClip (heavyFlare / heavyRaise / hold logic) still matches.
//
// wraithLasers for the GLB: the procedural wraith LIFTS OFF and hovers while
// his own cloak fans; the GLB body instead just LEANS INTO the mark a little
// and lets the attached procedural cape (glbanim wraith.build) do the show.
// Same duration and hit/sfx timings — gameplay identical.

// ===========================================================================
// TRITONE — the shared clips, re-authored for a ceratopsian.
//
// Every one of these exists for the same reason, and it is worth stating once
// rather than six times. The shared clips were authored against a HUMANOID: a
// body with a metre of leg to spend on a crouch, and a head that is a small
// ball on top of it, so "drop the hips 0.7 and pitch the torso 50 degrees
// forward" moves the skull through empty air. TRITONE has neither. He is a
// long, low bridge on four columns — his whole chassis spans a fifth of its
// own length in height — with a metre of armoured skull, three horns and a
// jaw hanging off the front, already close to the ground when he is simply
// standing. Measured with tools/groundprobe.mjs, the shared numbers put his
// jaw 1.2 units under the road on the charge, his brow 1.2 under on the plunge
// landing, and his chin 1.7 under in the air tuck.
//
// So they are re-authored around what the animal actually does:
//
//   THE LEGS BARELY BEND. A columnar quadruped absorbs and loads through the
//     shoulder and the neck, not by squatting: hip travel here is a tenth of
//     the humanoid's, and every crouch that was worth 0.5-1.0 is worth 0.10.
//   THE POWER IS IN THE NECK. Where a biped winds up by arching back and
//     swinging its arms overhead, he REARS — the front end lifts, the skull
//     goes up and back — and then drives the horns down and forward. The
//     wind-up is the head going UP, which is also what keeps it out of the
//     floor.
//   NOSE-DOWN IS EXPENSIVE, so it is spent deliberately and briefly. The head
//     may pitch down hard at the moment of a strike and nowhere else; the
//     recovery takes it straight back above the shoulder line.
//   THE FRONT LIFTS INSTEAD OF THE BACK DROPPING. Anywhere the humanoid clip
//     said "hipsPos down", the ceratopsian says "hipsRot nose-up" — the same
//     read of effort, from a body that cannot squat.
// ===========================================================================

// ---------- PER-MECH TAUNTS ----------
// The shared `taunt` is a beckoning arm — right for a humanoid brawler and
// meaningless on a crab, a wolf or a hologram. Each of these is compiled under
// the name `taunt` (so every check keyed on the clip name still matches) and
// hung off that mech's glbanim profile `clipOverrides`; the procedural build of
// the same mech keeps the shared one.
//
// TWO THINGS TO REMEMBER WHEN EDITING THESE. Clip values on the LEGS, TORSO and
// HEAD are ADDITIVE over the mech's restPose (Animator.restBias) while the arms
// are ABSOLUTE — so `torso: [-30, 0, 0]` on saurion means "thirty degrees back
// from the hunch he stands in", not "thirty degrees back from vertical". And
// `hipsPos` is in the model's own scale units, so the same number is a bigger
// hop on a bigger body, which is what you want.
//
// All of them carry `cancelOnMove` (compile() reads it): a taunt is a flourish,
// and the instant a real input arrives the body is the player's again.

export const GLB_CLIP_VARIANTS = {
  tritoneChargeGlb: compile('chargeLean', TRITONE_CHARGE),
  tritoneSlamGlb: compile('heavy', TRITONE_SLAM),
  tritonePoundGlb: compile('groundPound', TRITONE_SLAM),
  tritoneLandGlb: compile('land', TRITONE_LAND),
  tritoneLandReachGlb: compile('landReach', TRITONE_LAND_REACH),
  tritoneTauntGlb: compile('taunt', TRITONE_TAUNT),
  colossusClapHoldGlb: compile('poundHold', COLOSSUS_CLAP_HOLD),
  colossusClapGlb: compile('poundSlam', COLOSSUS_CLAP),
  saurionClawRGlb: compile('saurionClawR', SAURION_CLAW_R_GLB),
  saurionClawLGlb: compile('saurionClawL', mirrorRaw(SAURION_CLAW_R_GLB)),
  saurionKick1Glb: compile('saurionKick1', SAURION_KICK1_GLB),
  saurionKick2Glb: compile('saurionKick2', SAURION_KICK2_GLB),
  infernoFlameGlb: compile('shootLoop', INFERNO_FLAME_GLB),
  // …and its mirror, for the LEFT torch's turn (roster `channelClipL`). Without
  // it the left-hand loop falls through to the shared `shootLoopL`, whose folded
  // elbow aims a forearm-mounted barrel over his own shoulder — the exact thing
  // INFERNO_FLAME_GLB exists to stop.
  infernoFlameLGlb: compile('shootLoopL', mirrorRaw(INFERNO_FLAME_GLB)),
  froggerShootGlb: compile('shoot', FROGGER_SHOOT_GLB),
  froggerShootLGlb: compile('shootL', mirrorRaw(FROGGER_SHOOT_GLB)),
  // jerry's is NOT mirrored for the L side: the body motion is symmetric on
  // purpose (any yaw moves the pods), so both compile from the same raw
  jerryShootGlb: compile('shoot', JERRY_SHOOT_GLB),
  jerryShootLGlb: compile('shootL', JERRY_SHOOT_GLB),
  kongaTaunt: compile('taunt', KONGA_TAUNT),
  tempestTaunt: compile('taunt', TEMPEST_TAUNT),
  viperTaunt: compile('taunt', VIPER_TAUNT),
  titanusTaunt: compile('taunt', TITANUS_TAUNT),
  vulcanTaunt: compile('taunt', VULCAN_TAUNT),
  wraithTaunt: compile('taunt', WRAITH_TAUNT),
  infernoTaunt: compile('taunt', INFERNO_TAUNT),
  glacierTaunt: compile('taunt', GLACIER_TAUNT),
  colossusTaunt: compile('taunt', COLOSSUS_TAUNT),
  crankyTaunt: compile('taunt', CRANKY_TAUNT),
  fenrirTaunt: compile('taunt', FENRIR_TAUNT),
  froggerTaunt: compile('taunt', FROGGER_TAUNT),
  jerryTaunt: compile('taunt', JERRY_TAUNT),
  nullbotTaunt: compile('taunt', NULLBOT_TAUNT),
  rhinoTaunt: compile('taunt', RHINO_TAUNT),
  saurionTaunt: compile('taunt', SAURION_TAUNT),
  saurionVictory: compile('victory', SAURION_VICTORY),
  // SAURION's guard, the owner's, set in the pose workbench. A PER-MECH variant
  // rather than an edit to CLIPS.block, because that clip is the whole roster's
  // guard and these angles are his: the shared one crosses two humanoid
  // forearms in front of the chest, and a raptor's arms are short, held high
  // and tucked, so it needs the shoulders further back and the elbows folded
  // harder to put anything between him and you. `upper`/`hold` come from the
  // shared clip's flags and must stay — a guard is held, and it owns the arms
  // only so he can still walk under it.
  // THE GUARD IS PER-MECH from here on, for the same reason saurion's is: the
  // shared CLIPS.block crosses two humanoid forearms in front of the chest, and
  // these four bodies are not that. All of them keep the shared clip's
  // `upper`/`hold` flags — a guard is HELD, and it owns the upper body only so
  // the mech can still walk under it.
  //
  // NOTE what `upper: true` means for authoring (animator.js): the clip's
  // tracks are filtered to UPPER_JOINTS — torso, head, shoulders, elbows, hands
  // — plus hipsPos/hipsRot. A leg key in a block clip is SILENTLY DROPPED, so
  // the legs stay with the locomotion layer and a guarding mech can still walk.
  // Jerry's export arrived with thighR/kneeR on it; they are left out here
  // because the animator would ignore them and a key that does nothing is worse
  // in the file than absent.
  tritoneBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [16.69, 30.1, -27.25], elbowL: [-15.77, -14.89, 44.16],
        shoulderR: [25.97, -28.1, 30.72], elbowR: [-16.45, 15.53, -31.8] } },
    ],
  }),
  froggerBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [-96.28, 35.49, 2.35], elbowL: [-27.47, 13.75, 12.52],
        shoulderR: [-70, -30, 10], elbowR: [-50.7, 1.85, -22.87] } },
    ],
  }),
  jerryBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [-96.25, 18.27, -9.01], elbowL: [-0.07, 5.55, 57.81],
        shoulderR: [-92.98, -35.11, 16.49], elbowR: [24.35, -4.17, -71.22] } },
    ],
  }),
  kongaBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [-16.36, 6.02, -17.54], elbowL: [-105, 0, 0],
        shoulderR: [-19.46, -27.98, 47.07], elbowR: [-105, 0, 0] } },
    ],
  }),
  saurionBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [15.29, 2.29, 5.41],
        shoulderL: [-91.84, 13.08, -29.43], elbowL: [-115.93, 4.95, 0.27],
        // BOTH wrists are posed. Only the right one was, which left the left
        // claw hanging at its rest angle behind a guard the rest of the body
        // had committed to — and a wrist nobody looked at is a wrist nobody
        // noticed was skinned badly (that is how the left-hand bind above got
        // found; see the manifest's handL rebind + feather).
        handL: [-31.64, 14.94, 1.4],
        shoulderR: [-98.46, -13.22, 42.27], elbowR: [-105, 0, 0],
        handR: [-72.72, -42.83, -38.81] } },
    ],
  }),
  // WRAITH's is per-mech for a different reason from the four above: his body IS
  // a humanoid, but his hands are not empty. The shared pose stood his RIFLE
  // straight up on end beside his head, which guards nothing and reads as a
  // salute; the owner's drops that shoulder ~12° and rolls the wrist 56°, so the
  // weapon comes DOWN ACROSS his chest and the receiver is what the blow lands
  // on. A rifle held as a bar, which is what you do with one.
  // THESE NUMBERS ARE TRACK SPACE, NOT JOINT SPACE, and on this mech the two
  // differ: his profile carries `mirrorArms`, so the right-arm tracks are what
  // actually drive the LEFT arm — the one holding the gun — with yaw and roll
  // negated on the way (animator.js, and `config.anim.trackFor` is the same
  // mapping for the pose workbench). That is why the gun arm is authored on
  // `shoulderR`/`handR`, and why reading these as "his right arm" is wrong.
  wraithBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [-57.64, 27.22, -11.26], elbowL: [-105, 0, 0],
        shoulderR: [-70, -30, 10], elbowR: [-105, 0, 0],
        handR: [-4.1, 5.92, -56.07] } },
    ],
  }),
  wraithLasersGlb: compile('wraithLasers', {
    dur: 1.45,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'outCubic', pose: { hipsPos: [0, -0.06, 0], hipsRot: [3, 0, 0], torso: [10, 0, 0], head: [-6, 0, 0], shoulderL: [-18, 0, -30], shoulderR: [-18, 0, 30], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
      { t: 0.68, ease: 'inOutCubic', pose: { hipsPos: [0, -0.1, 0], hipsRot: [5, 0, 0], torso: [16, 0, 0], head: [-8, 0, 0], shoulderL: [-26, 0, -38], shoulderR: [-26, 0, 38] } },
      { t: 0.95, ease: 'inOutQuad', pose: { hipsPos: [0, -0.08, 0], torso: [14, 0, 0], head: [-4, 0, 0] } },
      { t: 1.15, ease: 'inOutQuad', pose: { hipsPos: [0, -0.04, 0], torso: [8, 0, 0] } },
      { t: 1.45, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] } },
    ],
    events: [{ t: 0.14, type: 'sfx', arg: 'charge' }, { t: 0.6, type: 'sfx', arg: 'charge' }, { t: 0.88, type: 'hit', arg: 0 }, { t: 0.88, type: 'sfx', arg: 'railgun' }, { t: 0.92, type: 'shake', arg: 0.45 }],
  }),
};
