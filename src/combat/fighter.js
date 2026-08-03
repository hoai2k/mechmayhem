// Fighter: movement physics, combat state machine, resources, hit reactions.
// Driven each frame by an intent (from human input or AI).
import * as THREE from 'three';
import { clamp, clamp01, lerp, damp, angleDamp, angleDiff, TAU, rand } from '../core/utils.js';
import { buildMech } from '../mechs/factory.js';
import { Animator, LEG_BACK_OFF } from '../mechs/animator.js';
import { CLIPS, LIGHT_ARM, SMASH_MIRRORS } from '../mechs/animations.js';
import { buildBoneShell } from '../mechs/glbshell.js';
import { stackState, burnStacks, stackBlast, stackToot, stackHandSmoke } from '../mechs/stackfx.js';
import { SPECIALS, ULTS } from './specials.js';
import { buildHurtbox, pickStrikeLimb, bodyHitSegment, MELEE } from './hurtbox.js';
import {
  climbStep, climbPhysics, climbReleaseTick, applyClimbOrientation, applyClimbPose,
  conformClimbLimbs,
} from './climb.js';
import { aimCannons, cannonRecoil, hasCannons, ON_TARGET } from './cannonaim.js';
import { floorGuard, clearFloorGuard } from './floorguard.js';
import { CONFIG } from '../core/config.js';
import { TUNING, STAMINA_TANK, SPRINT_DRAIN, BLOCK_DRAIN, STAMINA_REGEN } from '../core/tuning.js';
import { PLAYER_COLORS } from '../core/colors.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _boostDir = new THREE.Vector3();  // booster exhaust: the body's own down
const _boostQ = new THREE.Quaternion();
const _rollQ = new THREE.Quaternion();  // air-roll pivot: body-space transform
const _rollBase = new THREE.Vector3();
const _rollTmp = new THREE.Vector3();
const _palmTmp = new THREE.Vector3();
const _palmTmp2 = new THREE.Vector3();
const _carryTmp = new THREE.Vector3();
const _carryOff = new THREE.Vector3();
const _strikeA = new THREE.Vector3();
const _strikeB = new THREE.Vector3();
const _strikeS0 = new THREE.Vector3();
const _strikeS1 = new THREE.Vector3();
const _swept0 = new THREE.Vector3();
const _swept1 = new THREE.Vector3();
const _white = new THREE.Color(0xf4faff);
const _charBlack = new THREE.Color(0x14100d); // burnt-out carbon shell
const _woundRed = new THREE.Color(0xd8202e); // poison wound flush
// Ranged clips that DON'T plant the mech: the shot plays over the top half
// while movement keeps its legs. Everything else (braced artillery, the
// sniper's aim, a ground pound) locks him down for the duration.
const RUN_AND_GUN_CLIPS = new Set(['shoot', 'shootL', 'saurionQuillFan']);
// ---- VERTICAL STRIKE AIM (elevateStrikeAt) ----
// The extremities a blow can be thrown with, for AIMING purposes. The head is
// in the list and is NOT in combat's own strike-limb table: a bite is thrown
// with the jaws, and aiming saurion's pounce off whichever claw happened to
// lead sent the head over the target's shoulder.
const AIM_TIPS = ['handL', 'handR', 'ankleL', 'ankleR', 'head'];
// clip strike-limb name -> the joint that limb actually hangs off
const AIM_TIP_JOINT = { footL: 'ankleL', footR: 'ankleR' };
// striking joint -> the joint that RAISES it. Pitching the shoulder lifts a
// punch without tipping the whole frame over; a kick rides its thigh; a bite
// (or any head-led lunge) is aimed by the torso, since a head can't lift
// itself — rotating a joint never moves its own pivot.
const AIM_DRIVER = {
  handL: 'shoulderL', handR: 'shoulderR',
  ankleL: 'thighL', ankleR: 'thighR',
  head: 'torso',
};
const GRAVITY = 34;
// (ultimates are fountain-fed now — see combat/fountains.js. The old
// damage-drip meter constants ULT_RATE / BLOCK_ULT_DIV are gone with it.)
// ---- GAMEPLAY DIALS: all of these live in core/tuning.js, which is the file
// to edit. They are aliased here so the rest of this module reads unchanged.
const WALK_MULT = TUNING.movement.walkMult;
const JUMP_MULT = TUNING.movement.jumpMult;
const CHARGE_DASH_MAX = TUNING.dash.chargeMax;
// A thrown weapon (viper's daggers, aegis' lance) re-forges on its empty mount:
// the mount stays EMPTY for a delay, then grows back over REGROW_TIME. The
// delay is PER THROW (regrowWeapon's second argument) because how long a gap
// reads well depends on the weapon — viper's daggers want a long, obvious one
// so you can see which forearm is bare, while aegis' lance is back before his
// next javelin. Shared by the regrow animation and by `weaponReady`, which
// picks whichever dagger viper still has.
const REGROW_DELAY = 0.18;
const REGROW_TIME = 0.5;
// Where an unaimed ranged weapon assumes its target stands (world units). This
// is the gap a duel actually settles at — matches the artillery lob's own
// default so a blind mortar shell still lands where it always did.
const DEFAULT_ENGAGE_DIST = 25;
const SPRINT_MULT = TUNING.movement.sprintMult;
// ---- THE STAMINA BAR. One normalised tank (1.0 = full) pays for sprinting,
// blocking and dashing; tuning.js states each cost as a DURATION and derives
// these per-second rates, so "12 seconds of sprint" is the thing you edit.
const SPRINT_MAX = STAMINA_TANK;
const SPRINT_REGEN = STAMINA_REGEN;
const BLOCK_DASH_MULT = TUNING.stamina.dashCostBlockMult;
const DASH_COST = TUNING.stamina.dashCost;
const BLOCK_MOVE_MULT = TUNING.movement.blockMoveMult;
const BACK_MOVE_MULT = TUNING.movement.backMult;
// The half-arc a raised guard covers, as a COSINE. takeHit tests the same
// arc in radians; the bubble shader fades out past it, so what you see
// covered is exactly what is covered.
const BLOCK_ARC_COS = Math.cos(TUNING.guard.arc);
const GUARD_ARC = TUNING.guard.arc;
// What ROBOT SPEED's 100% means, over WALK_MULT and the roster's own speeds.
const SPEED_BASE = TUNING.movement.speedBase;
// The same number off a roster def alone, with no fighter to ask. The pose
// workbench drives the gait at a mech's real top speed, and the animator's run
// blend is normalised by it — deriving it there instead of importing this would
// be a second copy free to drift.
export function moveSpeedFor(def) {
  return def.stats.speed * WALK_MULT * SPEED_BASE * CONFIG.robotSpeed;
}
const PUNCH_HOLD_CAP = TUNING.melee.punchHoldCap;
const HEAVY_HOLD_CAP = TUNING.melee.heavyHoldCap;
// Minimum wind-up on a charge attack. Every other melee clip in the game opens
// with a chamber/pull-back beat (0.10-0.34s) before its hit frame, but a
// charge attack's RELEASE clip starts already cocked — correct after a real
// hold (the hold clip IS the chamber), yet a bare TAP released it the same
// frame it began, so the mech snapped from rest straight into the impact pose
// with no punch visible. Holding the chamber on screen for this long first
// gives every tap the same telegraph the hand-authored clips have. The forced
// time is discounted from the banked charge, so a tap still throws the
// weakest version and the charge curve above it is unchanged.
const CHARGE_MIN_WINDUP = TUNING.melee.chargeMinWindup;

// ---- hit-reaction tuning (see takeHit) ----
const BLOCK_LEAK_DEFAULT = TUNING.guard.leakDefault;
const WEIGHT_KNOCK_RESIST = TUNING.melee.weightKnockResist;
const HITSTUN_HEAVY = TUNING.melee.hitstunHeavy;
const HITSTUN_LIGHT = TUNING.melee.hitstunLight;
const SOFT_FLINCH_CHANCE = TUNING.melee.softFlinchChance;
const DASH_SPEED_MULT = TUNING.dash.speedMult;
const DASH_CHARGE_BOOST = TUNING.dash.chargeBoost;
const DASH_COOLDOWN = TUNING.dash.cooldown;
const ESCAPE_JUMP_MULT = 2.6;    // knockdown escape spring: ground speed x this
const ESCAPE_JUMP_VY = 13;
// ---- ROLLOVER (roster `rollover` — CRANKY) ----
// A launching blow normally sits a mech DOWN. On a top-heavy shell a big
// enough one turns it CLEAN OVER instead: past flat, onto its back, legs at
// the sky, stranded until it rolls itself upright (see the flipOver /
// proneBack / rollUp* clips). Odds scale with the damage the blow actually
// DEALT, as a fraction of the victim's max HP — so armour, guard chip and any
// damage buff are all already in the number, and the curve doesn't need
// re-tuning per attacker. Calibrated against CRANKY (1300 hp, 0.26 armour):
//
//   attacker blow                  raw   dealt   frac    odds
//   VIPER light3                    40    30    2.3%      0%   never
//   VIPER heavy                     70    52    4.0%      0%   never
//   COLOSSUS light3 (uncharged)     62    46    3.5%      0%   never
//   COLOSSUS light3 (full charge)  130    96    7.4%     50%
//   COLOSSUS heavy  (full charge)  160   118    9.1%     79%
const ROLLOVER_MIN_FRAC = 0.046; // damage fraction below which nothing flips him
const ROLLOVER_RATE = 17.6;      // odds gained per unit of fraction past it
const ROLLOVER_MAX = 0.9;        // never a certainty, however big the blow
const ROLLOVER_DOWN_TIME = 1.3;  // stranded on the shell before he rights himself
const ROLLOVER_ROLL_DRIVE = 0.6; // righting roll travel, as a fraction of walk speed
// KINETIC IMPACT — momentum physics behind a melee blow. Two quantities drive
// it, both read from the CLOSING SPEED between the bodies along the attack line
// (a punch reads forward run speed; a smash also reads the downward dive; both
// fighters' motion counts, so two mechs charging in — or one barreling into a
// still one — land far harder than a hit thrown standing still):
//   • DAMAGE / KNOCKBACK grow with the wallop = closing speed, leaning modestly
//     on the attacker's weight (a heavier frame stings a little more).
//   • KNOCKDOWN is decided by MOMENTUM vs the victim's MASS — see below.
//
// MASS is the weight stat times physical size CUBED (volume) at the LIVE scale,
// so a bruiser reads ~7-8x a nimble scout and a COLOSSAL-FORM giant (scale ~5)
// is effectively immovable. This is what "weight" means for collisions here.
const MASS_SIZE_POW = 3;
const WEIGHT_DMG_BASE = 0.7;     // attacker mass lean at weightless (w=0)...
const WEIGHT_DMG_GAIN = 0.6;     // ...rising to BASE+GAIN for a max-weight bruiser
const IMPACT_FLOOR = 6;          // no damage bonus below this wallop
const IMPACT_DMG_RATE = 0.05;    // +5% damage per unit of wallop past the floor
const IMPACT_DMG_CAP = 1.1;      // capped at +110% on a full-speed collision
const IMPACT_KNOCK_RATE = 0.07;  // knockback grows a little faster than damage
const IMPACT_KNOCK_CAP = 1.6;
// KNOCKDOWN: the shove velocity the target eats = closing speed × (attacker mass
// / victim mass). A featherweight can floor a same-size rival by sprinting in
// (or even at a fast walk) but NEVER a heavy, however fast it runs; a heavy
// floors a light almost by leaning on it. Below CLOSING_MIN nothing floors, so
// standing jab-trades and gentle jostling never knock anyone down.
const CLOSING_MIN = 5;           // real forward motion required before any floor
const KNOCKDOWN_KICK = 9.5;      // shove velocity (u/s) that puts a target down
const IMPACT_LAUNCH_MIN = 11;    // launch velocity injected right at the threshold
const IMPACT_LAUNCH_RATE = 0.4;  // extra launch per u/s of shove beyond it...
const IMPACT_LAUNCH_MAX = 20;    // ...clamped so a lopsided mass ratio can't orbit
// a smash/dive folds downward closing speed into the impact too (a punch does
// not — it's a horizontal blow); plunge dives count it in full
const SMASH_DOWN_WEIGHT = 0.7;
const PLUNGE_DOWN_WEIGHT = 1.0;

// ---- NULLBOT corruption ----
// Every glitched hit converts another PART of the victim into flickering
// data. Stacks last the whole round. The 10th stack OVERLOADS the frame:
// fully engulfed for 3s — stunned and helpless — then every trace
// of corruption clears and the count starts from zero.
const GLITCH_OVERLOAD = 10;
const GLITCH_STUN_TIME = 3;
const _glitchTint = new THREE.Color();
const _arcA = new THREE.Vector3(), _arcB = new THREE.Vector3();
const _iceBox = new THREE.Box3(), _iceB2 = new THREE.Box3();
const _iceSize = new THREE.Vector3(), _iceMid = new THREE.Vector3();
// where a corruption spot may pin itself: joint + local Y band (in scale
// units) roughly covering that part's visible geometry
const GLITCH_SPOT_JOINTS = [
  ['torso', 0.2, 1.5], ['torso', 0.2, 1.5], ['head', -0.1, 0.4],
  ['shoulderL', -1.0, 0.1], ['shoulderR', -1.0, 0.1],
  ['elbowL', -0.9, 0], ['elbowR', -0.9, 0],
  ['thighL', -1.2, 0], ['thighR', -1.2, 0],
  ['kneeL', -1.1, 0], ['kneeR', -1.1, 0],
];

// which joint subtrees the charge-flicker sheath covers, per charge kind
const CHARGE_GLOW_SETS = {
  armL: ['shoulderL'],
  armR: ['shoulderR'],
  arms: ['shoulderL', 'shoulderR'],
  legs: ['thighL', 'thighR'],
  lance: ['lance'],
};

export { PLAYER_COLORS } from '../core/colors.js'; // compat re-export, remove after finisher.js migrates

export class Fighter {
  constructor(world, def, { pos = new THREE.Vector3(), yaw = 0, playerIndex = 0, isAI = false, mech = null } = {}) {
    this.world = world;
    this.def = def;
    this.playerIndex = playerIndex;
    this.isAI = isAI;

    // mech may be prebuilt (async GLB pipeline); otherwise procedural
    this.mech = mech || buildMech(def);
    this.group = this.mech.group;
    this.group.position.copy(pos);
    this.animator = this.mech.premadeAnimator || new Animator(this.mech);
    world.scene.add(this.group);

    // physique
    const s = def.body.scale;
    this.scale = s;
    this.radius = 1.15 * s;
    this.height = (this.mech.dims.hipHeight + this.mech.dims.torsoH + this.mech.dims.headSize * 2) * 1.02;
    // BROAD-PHASE ball: blast falloff, crowd sweeps, camera framing. Kept
    // exactly as it always was — every AoE in the game is tuned against it.
    this.hitRadius = 1.7 * s;
    // PRECISE shape: bone-bound capsules measured off this model's own
    // geometry, following the animation (hurtbox.js). Used by melee and by
    // bullets/beams. Null when the model can't be measured, and every
    // caller falls back to the ball above.
    this.hurtbox = buildHurtbox(this.mech);

    // ducking: hold to crouch — smaller/lower hitbox, slower movement.
    // duckDepth 1 = a full frog squat (FROGGER), default is a half-crouch.
    this.baseHeight = this.height;
    this.baseHitRadius = this.hitRadius;
    this.duckDepth = def.stats.duck ?? 0.55;
    this.duckT = 0;
    this.ducking = false;

    // kinematics
    this.pos = this.group.position;
    this.vel = new THREE.Vector3();
    this.yaw = yaw;         // where the LEGS point (the whole group's rotation)
    this.torsoYaw = yaw;    // upper body leads the legs into a turn
    this.targetYaw = yaw;
    this.grounded = true;

    // ---- SURFACE WALKING (combat/climb.js) — only for a def that carries a
    // `climb` block. He walks on the world rather than the floor: up facades,
    // over lips, across roofs, over the crates on the way.
    this.climb = false;       // the walker owns movement this frame
    this.climbUp = null;      // his own up — the field's average normal, damped
    this.climbFwd = null;     // ...and the direction he is travelling along it
    this._climbTilt = 0;      // 0 = standing on the flat, 1 = fully on a wall
    this._climbCd = 0;        // short re-grab cooldown after leaving a surface
    this._climbRelease = false; // let go on purpose: fall past faces, don't grab

    // resources
    this.maxHp = def.stats.hp;
    this.hp = this.maxHp;
    // ULT CHARGES: collected from the golden fountains (combat/fountains.js),
    // up to CONFIG.fountains.maxCharges held at once. `ult` (0|1) mirrors
    // "has at least one" so every existing ready-check (AI, HUD full-glow,
    // the soak harness forcing the meter) keeps meaning what it meant.
    this.ultCharges = 0;
    this.ultFlashT = 0;        // HUD badge glow window while the ult fires
    this.ult = 0;              // 0..1
    this.specialCd = 0;
    this.rangedCd = 0;
    this.dashCd = 0;
    this.iframes = 0;

    // sprint tank (hold B on the move): drains while sprinting, refills
    // the moment the sprint hold ends
    this.sprintEnergyMax = SPRINT_MAX;
    this.sprintEnergy = this.sprintEnergyMax;
    this.sprinting = false;
    this._sprintHold = false; // the current B hold is a sprint (not a coil wind-up)

    // every ranged weapon runs on ammo, refilled at crates
    if (def.moves.ranged.ammo) {
      this.ammoMax = def.moves.ranged.ammo;
      this.ammo = this.ammoMax;
    }

    // hover jets: double-tap jump and HOLD to fly. Lighter mechs get more
    // fuel and stronger jets — the little ones really take to the air.
    // …EXCEPT a mech whose def says `noHover`, which empties the tank so every
    // jet check downstream already answers no. Nobody on the roster sets it
    // today (JERRY did, and flies now); the lever stays because "this frame
    // has no jets" is a real design choice and it costs one boolean.
    const lightness = 1 - def.stats.weight;
    this.hoverFuelMax = def.stats.noHover ? 0 : 1.5 + lightness * 1.9;   // seconds of thrust
    this.hoverFuel = this.hoverFuelMax;
    this.hoverRise = 7 + lightness * 8;          // max climb speed
    this.hovering = false;
    this.jetT = 0;

    // state machine
    this.state = 'normal';     // normal|attack|channel|special|ult|dash|hitstun|launched|knockdown|getup|dead|intro|victory|frozen
    this.stateT = 0;
    this.comboIdx = 0;
    this.comboWindow = 0;
    this.queuedLight = false;
    this.blocking = false;
    this.firing = false;
    this.dashT = 0;

    // status effects: {burn:{dps,t}, slow:{f,t}, buff:{spd,dmg,t}, guard:{f,t}, cloak:{t}}
    this.status = {};
    // NULLBOT corruption: hit count + the body parts already turned to data
    this.glitchStacks = 0;
    this._glitchSpots = [];

    this.intent = {
      moveX: 0, moveZ: 0, jump: false, jumpHeld: false, light: false, heavy: false,
      ranged: false, rangedHeld: false, special: false, specialHeld: false, ult: false, block: false, dash: false,
      taunt: false, strafe: false, duck: false, aimYaw: undefined,
    };
    this.plunging = false;   // aerial ground-smash riding down to impact
    // which way the next smash twists (see smashClip) — started at random so
    // two mechs trading heavies don't wind up in lockstep
    this._smashMirror = Math.random() < 0.5;
    this._plungeVy = 0;
    this._moveAttack = false; // basic light/heavy melee lets you keep moving
    // A WALKING ULT. Ults root you, which is right for everything that stands
    // and channels — but KONGA's APEX POUND is a move you are meant to WALK
    // FORWARD with (drum the road, knock them down, march over the top of them
    // and drum on THEM). The ult itself opts in; every other one is unaffected.
    this._ultMove = false;
    this._onBack = false;     // ROLLOVER: turned right over, stranded on his back
    this._flipT = 0;          // ...time left in the one-shot flip before the prone loop
    this._rollUp = null;      // ...the flank he committed the righting roll to
    this._airRoll = null;     // AIR SOMERSAULT (see updateAirRoll): {t, spin, ending, endAt}
    this.alive = true;
    this.wins = 0;
    this.lastAttacker = null;
    this.controlsLocked = false; // during intro/outro

    // summoned help (SAURION's raptor pack): minions fight FOR their owner —
    // no friendly fire either way, and they can never fire an ult of their own
    this.allyOf = null;   // the fighter this one is summoned by (or null)
    this.isMinion = false;
  }

  // same side? (owner<->minion, or two minions of the same owner)
  isAllyOf(o) {
    return !!o && (o.allyOf === this || this.allyOf === o ||
      (!!this.allyOf && this.allyOf === o.allyOf));
  }

  center(out = _v2) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z).clone();
  }

  // physical mass for collision/momentum math: the weight stat times physical
  // size CUBED (volume) at the LIVE scale — so a heavy bruiser reads ~7-8x a
  // scout, and a colossal-form giant (scale ~5) is effectively immovable. Used
  // by the melee KNOCKDOWN test (attacker momentum vs victim inertia).
  massFactor() {
    return this.def.stats.weight * this.scale ** MASS_SIZE_POW;
  }

  // world-space midpoint of both palms — where hoisted cargo rests. Falls
  // back to an overhead point for rigs without hand joints.
  palmsMid(out) {
    const J = this.mech.joints;
    if (!J.handL || !J.handR) {
      return out.set(this.pos.x, this.pos.y + this.height + 0.4 * this.scale, this.pos.z);
    }
    J.handL.getWorldPosition(out);
    return out.add(J.handR.getWorldPosition(_palmTmp)).multiplyScalar(0.5);
  }

  // where a body-slammed victim's ORIGIN goes so the torso lies IN the
  // palms: subtract the victim's feet->torso offset through their CURRENT
  // rotation, so the center rides the hands exactly at any roll angle.
  // A COLOSSAL-FORM giant palms the whole victim in ONE hand instead.
  // WHERE THE CARGO SITS. `_oneArmLift` may name a SIDE ('L'/'R') — KONGA
  // grabs with whichever fist is nearer — and plain `true` still means the
  // right hand (colossus at giant size).
  carryPoint(prey, out) {
    const J = this.mech.joints;
    const arm = this._oneArmLift === 'L' ? J.handL
      : this._oneArmLift ? (J.handR || J.handL) : null;
    if (arm) arm.getWorldPosition(out);
    else this.palmsMid(out);
    // A HEAD GRIP IS NOT A CRADLE: the fist closes on the skull and the body
    // HANGS off it, inverted, so the carry point is the victim's head rather
    // than a palm under their back. Their crown ends up in the hand and
    // everything else dangles below it — which is the pose the slam needs,
    // because whatever is at the bottom of that arc hits the floor first.
    if (this._carryHead) {
      out.y += prey.height * 0.92;   // pos is at the feet, and the feet are now UP
      return out;
    }
    _carryOff.set(0, prey.height * 0.5, 0).applyEuler(prey.group.rotation);
    out.sub(_carryOff);
    out.y += 0.24 * this.scale; // palm(s) cradle UNDER the torso
    return out;
  }

  // IK-lite palm press: pull the hands in until they touch the carried
  // body instead of hovering at the rig's natural width. Runs AFTER the
  // animator pose each frame (direct joint writes would otherwise be
  // clobbered); the inward roll direction is re-probed every frame since
  // it flips as the arms sweep from reach to overhead.
  clampPalmsTo(prey) {
    const J = this.mech.joints;
    if (!(J.handL && J.handR && J.shoulderL && J.shoulderR)) return;
    const want = Math.max(0.8, prey.hitRadius * 0.95);
    const meas = () =>
      J.handL.getWorldPosition(_palmTmp).distanceTo(J.handR.getWorldPosition(_palmTmp2));
    const d0 = meas();
    const inward = (sh) => {
      sh.rotation.z += 0.06;
      const d = meas();
      sh.rotation.z -= 0.06;
      return d < d0 ? 1 : -1;
    };
    const dL = inward(J.shoulderL), dR = inward(J.shoulderR);
    let fix = this._palmFix || 0;
    J.shoulderL.rotation.z += dL * fix;
    J.shoulderR.rotation.z += dR * fix;
    const sep = meas();
    const arm = (this.mech.dims.upperArmLen || 1.5) + (this.mech.dims.foreArmLen || 1.5);
    const step = clamp((sep - want) / (2 * arm), -0.15, 0.15); // servo rate
    // wide-shoulder frames need more shoulder travel to close on a slim
    // target — the cap is generous, the servo rate keeps it smooth
    const nfix = clamp(fix + step, 0, 1.3);
    J.shoulderL.rotation.z += dL * (nfix - fix);
    J.shoulderR.rotation.z += dR * (nfix - fix);
    this._palmFix = nfix;
  }

  // Apply the ALREADY-banked palm roll without servoing it any further — the
  // unwind path after a strike window closes (see updatePose). clampPalmsTo both
  // applies and grows the fix, so it cannot be used to let go of one.
  applyPalmRoll() {
    const J = this.mech.joints;
    const fix = this._palmFix || 0;
    if (!fix || !(J.handL && J.handR && J.shoulderL && J.shoulderR)) return;
    const meas = () =>
      J.handL.getWorldPosition(_palmTmp).distanceTo(J.handR.getWorldPosition(_palmTmp2));
    const d0 = meas();
    const inward = (sh) => {
      sh.rotation.z += 0.06;
      const d = meas();
      sh.rotation.z -= 0.06;
      return d < d0 ? 1 : -1;
    };
    J.shoulderL.rotation.z += inward(J.shoulderL) * fix;
    J.shoulderR.rotation.z += inward(J.shoulderR) * fix;
  }

  // nearest living enemy (through the arena seam when wrapping)
  nearestEnemy() {
    let best = null, bestD = Infinity;
    const w = this.world;
    for (const f of w.fighters) {
      if (f === this || !f.alive || this.isAllyOf(f)) continue;
      // NOT the one in your hands. A carried victim is pinned directly over
      // the carrier, so their horizontal offset is ~0 and every heading
      // derived from it (AI steering, aim snaps) is atan2 of noise. That is
      // what spun colossus around the instant his throw ended: his AI had
      // spent the whole lift steering at a target on top of his own head,
      // and the garbage heading was applied the moment he could move again.
      if (f._carry && f._carry.by === this) continue;
      const dx = w.wrapDelta(f.pos.x - this.pos.x);
      const dz = w.wrapDelta(f.pos.z - this.pos.z);
      const d = dx * dx + dz * dz;
      if (d < bestD) { best = f; bestD = d; }
    }
    return best;
  }

  // yaw toward another fighter via the shortest (possibly wrapped) path
  yawTo(e) {
    return Math.atan2(
      this.world.wrapDelta(e.pos.x - this.pos.x),
      this.world.wrapDelta(e.pos.z - this.pos.z)
    );
  }

  faceNearestEnemy(snap = false) {
    const e = this.nearestEnemy();
    if (!e) return;
    const yaw = this.yawTo(e);
    this.targetYaw = yaw;
    if (snap) this.yaw = yaw;
  }

  // Top LOCOMOTION speed: what this mech's walk/run/flight is capped at right
  // now, before status effects and the sprint/duck/channel modifiers. Every
  // caller must go through this — the animator normalises its run blend by
  // the same number (`ratio = speed / maxSpeed`), so a cap that moved without
  // it would read as a permanent sprint at walking pace. Foot cadence needs
  // no help: animator.js drives the stride off ACTUAL ground speed, so faster
  // travel strides faster instead of skating.
  moveSpeed() {
    return moveSpeedFor(this.def);
  }

  speedMult() {
    let m = 1;
    if (this.status.slow) m *= this.status.slow.f;
    if (this.status.soaked) m *= 0.5; // waterlogged: servos sputter
    if (this.status.buff) m *= this.status.buff.spd;
    if (this.status.cloak) m *= this.status.cloak.spd || 1.25;
    return m;
  }
  dmgMult() {
    let m = 1;
    if (this.status.buff) m *= this.status.buff.dmg;
    // NOVA: every attack surges while her halo burns at apex alignment —
    // a full-apex strike hits TWICE as hard as a dark-halo one
    if (this.def.id === 'nova') m *= 1 + 1.0 * (this.animator?.novaGlow || 0);
    return m;
  }

  // ================= state helpers =================
  setState(s, t = 0) {
    this.state = s;
    this.stateT = t;
    // a mobile light/heavy grants locomotion only for its own 'attack' window;
    // any other transition (attack end, launch, special...) drops it
    if (s !== 'attack') this._moveAttack = false;
    // same rule for the walking ult: the grant belongs to the 'ult' window
    // that asked for it, so any transition out of it takes the legs back
    if (s !== 'ult') this._ultMove = false;
  }

  lockFor(t) { this.setState('attack', t); }

  canAct() {
    return this.alive && !this.controlsLocked &&
      (this.state === 'normal' || (this.state === 'attack' && this.stateT <= 0));
  }

  // ================= actions =================
  doLight() {
    const mv = this.def.moves.light;
    // hold-to-charge haymaker (TITANUS/COLOSSUS): the wind-up pose HOLDS
    // while X stays down; the punch itself fires on release (updatePunchHold)
    if (this.def.punchHold) {
      // The WIND-UP travels: a punchHold mech (titanus, colossus) can keep
      // walking and running while the fist is cocked, instead of the hold
      // rooting them for its whole duration. The RELEASE still plants —
      // updatePunchHold drops _moveAttack as it throws, and the release's
      // own charge-lunge owns the step-through.
      this._moveAttack = true;
      // Alternate arms every wind-up, so both fists get used. This rides its
      // OWN flip rather than comboIdx: updatePunchHold bumps comboIdx on release
      // but never opens a comboWindow, so the combo-expiry reset zeroed it again
      // on the very next frame and a hold-charge mech threw every single punch
      // with the same arm.
      this._punchIdx = this._punchAlt = (this._punchAlt === 0 ? 1 : 0);
      this._punchHold = 0.0001;
      this._punchFull = false;
      this.faceNearestEnemyIfClose(12);
      this.animator.play(this._punchIdx ? 'punchHold2' : 'punchHold1');
      this.setState('attack', 9);
      this.world.audio?.play('servo');
      return;
    }
    // per-mech combo clips (sword forms, spear forms, haymakers...) — the
    // shared punch trio is only the default. A GLB animation profile may
    // supply its OWN cycle (any length) when the model's anatomy wants a
    // different mix (saurion GLB: kicks alternating with claw rakes).
    const names = this.animator?.profile?.lightClips
      || this.def.lightClips || ['light1', 'light2', 'light3'];
    const idx = this.comboIdx % names.length;
    this.faceNearestEnemyIfClose(12);
    // WHICH ARM. Every blow in a combo alternates hands, and the lead flips
    // from combo to combo, so no arm throws twice in a row and neither hand
    // owns a particular step. The uppercut is just the step it lands on — it
    // comes out left or right depending on where the alternation is, instead
    // of always being the authored right (which also made the right arm throw
    // the cross AND the uppercut back to back).
    // Only clips with a known arm + mirrored twin take part (LIGHT_ARM); a
    // bespoke asymmetric cycle plays exactly as authored.
    if (idx === 0) this._leadArm = this._leadArm ? 0 : 1;
    const want = ((this._leadArm || 0) + idx) % 2 ? 'R' : 'L';
    const hand = LIGHT_ARM[names[idx]];
    const clip = hand && hand.arm !== want && CLIPS[hand.twin] ? hand.twin : names[idx];
    const dur = this.animator.play(clip, {
      onEvent: (type, arg) => this.onAttackEvent(type, arg, {
        dmg: mv.dmg[idx % mv.dmg.length] * this.dmgMult(),
        knock: mv.knock[idx % mv.knock.length],
        range: mv.range * this.scale,
        launch: idx === names.length - 1 ? 10 : 0,
        status: mv.status || null,
      }),
    });
    this.setState('attack', dur * 0.82);
    // STEER THE JAB ONTO THE VICTIM, exactly as every heavy and every
    // punchHold release already does. Without this a light attack landed
    // only where the raw clip's arc happened to pass through a target
    // standing dead ahead: the shared punch trio throws down the mech's
    // flank, so the wider the build the further outside the victim the fist
    // travelled — rhino's cross ended 2-3 units to his own right of a bot
    // squared up in front of him and missed by a body's width, with nothing
    // vertical about it. Measured across the roster at three ranges, the two
    // punchHold mechs (who alone armed this) connected 9 times out of 9
    // while glacier and frogger connected 0.
    this.trackStrikeVictim(mv.range, dur);
    this._moveAttack = true;  // keep walking/running through the jab (upper-body clip)
    this.comboIdx++;
    this.comboWindow = dur + 0.35;
    this.world.audio?.play('servo');
  }

  // Which way the smash twists. The overhead pound family winds onto one
  // side; alternating twins keeps back-to-back heavies from replaying the
  // identical wind-up. Clips with no mirror (the bespoke heavies — viper's
  // drill, wraith's lasers...) pass straight through and never flip the
  // side. Pass flip=false to REUSE the current side: a charged pound's
  // release has to land on the twist its wind-up was already holding.
  smashClip(name, flip = true) {
    const twin = SMASH_MIRRORS[name];
    if (!twin) return name;
    if (flip) this._smashMirror = !this._smashMirror;
    return this._smashMirror ? twin : name;
  }

  // Is the swing in flight one of the shared two-fist smashes? (The mirrored
  // twins compile under the base name, so this catches either side.)
  inTwoFistSmash() {
    const n = this.animator.action?.clip?.name;
    return n === 'heavy' || n === 'poundSlam';
  }

  doHeavy() {
    const mv = this.def.moves.heavy;
    // (a climber's heavy is a plain swing off the wall — the plunge is a
    // controlled FALL, and he isn't falling)
    if (!this.grounded && !this.climb && this.pos.y > 2.5) {
      // aerial ground smash: ride the swing all the way down and detonate
      // on landing — fall speed feeds the damage
      this._moveAttack = false;
      this.plunging = true;
      this.hovering = false;
      this.vel.y = Math.min(this.vel.y, -14);
      this.animator.play(this.smashClip('heavy'), { speed: 1.5 });
      this.setState('attack', 9); // held until impact (cleared on landing/hit)
      this.world.audio?.play('whooshBig');
      return;
    }
    this.faceNearestEnemyIfClose(14);
    // hold-to-charge heavy (AEGIS whirl, TITANUS/COLOSSUS raised pound):
    // the hold clip LOOPS while Y stays down, banking power; the strike and
    // the hit come on release (updateHeavyHold)
    if (this.def.heavyHold) {
      this._moveAttack = false; // rooted charge-up whirl/pound
      this._whirlHold = 0.0001;
      this._whirlFull = false;
      // Snap ONTO the hold clip (short fade) rather than easing in over the
      // default 0.07s. A tap only holds for CHARGE_MIN_WINDUP (0.15s), and
      // between that fade and the animator's own pose smoothing the raise was
      // still ~15% short when the release fired — so the release clip, whose
      // t=0 IS the fully-raised pose, finished lifting the arms before slamming
      // and the heavy read as TWO wind-ups. The pose smoothing still eases the
      // motion, so this reads as a sharper wind-up, not a snap.
      this.animator.play(this.smashClip(this.def.heavyClip), { fade: 0.02 });
      this.setState('attack', 9);
      this.comboIdx = 0;
      return;
    }
    const dur = this.animator.play(this.smashClip(this.def.heavyClip || 'heavy'), {
      onEvent: (type, arg) => this.onAttackEvent(type, arg, {
        dmg: mv.dmg * this.dmgMult(),
        knock: mv.knock,
        range: mv.range * this.scale,
        launch: mv.launch,
        heavy: true,
        smash: true, // overhead/driving blow: downward closing speed counts too
        fx: this.def.heavyFx,
        status: mv.status || null,
      }),
    });
    this.setState('attack', dur * 0.9);
    this._moveAttack = true;  // stride into the swing
    this.comboIdx = 0;
    // track the actual victim through the whole swing: torso twists and the
    // fists CONVERGE onto their body, so a landed pound visibly LANDS
    // instead of slamming down on both sides of a slim target.
    // A SPREAD heavy opts out (`heavyNoStrikeAim`): the convergence servo
    // pulls the palms together by up to 1.3 rad of shoulder roll, which on a
    // whirl whose whole shape is arms-out flattens it — measured on tempest,
    // a -92° T collapsed to -24° in battle while the showcase (no victim to
    // converge on) showed it perfectly.
    if (!this.def.heavyNoStrikeAim) this.trackStrikeVictim(mv.range, dur);
  }

  // post-pose strike tracking: torso yaw slides the palms along an arc
  // around our own root, so the lateral miss is corrected DIRECTLY — the
  // azimuth of the palms' midpoint vs the victim's azimuth is the exact
  // angle the torso must twist (rate-limited, capped at +-0.6 rad so the
  // pose never contorts). Fist separation then narrows via the palm clamp.
  // Some attacks must stay ARM-driven: a wide crab claps its claws together,
  // and twisting the shell to steer reads as the whole body slewing round.
  // `noTwistClips` in the roster names those clips — while one is playing the
  // torso/head yaw servos are held off (the strike still tracks laterally
  // through the palms, via clampPalmsTo's shoulder roll).
  twistLocked() {
    const clips = this.def.noTwistClips;
    if (!clips) return false;
    const a = this.animator?.action;
    return !!(a && !a.fadingOut && clips.includes(a.clip.name));
  }

  // twistLocked() is a step: the frame a no-twist clip starts, the shell
  // would SNAP square from whatever twist the servos had banked. Ramp it
  // instead, so a mech that entered the attack mid-turn visibly ROTATES BACK
  // to centre over the wind-up and lunges square. Returns 0..1 (1 = locked).
  updateTwistLock(dt) {
    const want = this.twistLocked() ? 1 : 0;
    const cur = this._twistLock || 0;
    this._twistLock = cur + (want - cur) * (1 - Math.exp(-(want ? 9 : 14) * dt));
    return this._twistLock;
  }

  aimStrikeAt(prey) {
    // The two-fist SMASH opts out: it is aimed by the BODY (doHeavy squares up
    // on the target before the swing) and then commits, exactly as the clip
    // was authored. Strike-aim does two things that fight that — it steers the
    // torso until the PALMS' midpoint sits on the target line, and it squeezes
    // the hands together onto the victim's width. Both are measured off where
    // the fists currently are rather than off the mech's centreline, so on a
    // smash they pulled the fists to the same place no matter which way the
    // wind-up had twisted: the mirrored swing landed on the same side as the
    // unmirrored one, with shoulderR rolled to -15deg against the clip's +6,
    // dragging that fist across the chest. Skipping it, the two wind-ups slam
    // to mirrored positions (measured: handR [2.41,3.12] against the mirror's
    // handL [-3.12,-2.40]). One-fist strikes and grabs are untouched.
    if (this.inTwoFistSmash()) {
      this._aimYaw = 0;
      this._palmFix = (this._palmFix || 0) * 0.8;
      this.unwindPitch(0.8);
      return;
    }
    const J = this.mech.joints;
    const w = this.world;
    // steer ONLY during the strike descent — palms dropped below shoulder
    // height. Steering through the overhead windup (where the fists are
    // nowhere near the target line) twists the pose the wrong way and the
    // rate-limited servo can't recover before impact.
    let striking = true;
    if (J.handL && J.handR && J.shoulderL) {
      const hy = Math.min(J.handL.getWorldPosition(_palmTmp).y,
        J.handR.getWorldPosition(_palmTmp).y);
      striking = hy < J.shoulderL.getWorldPosition(_palmTmp).y + 0.1 * this.scale;
    }
    // `lock` is the ramped noTwistClips gate: while it climbs, the servo
    // stops chasing AND what it already banked is scaled away, so the shell
    // eases back to square rather than dropping the twist in one frame.
    const lock = this._twistLock || 0;
    // A ONE-ARMED blow (clip `strikeArm`) is steered by the FIST THAT THROWS IT,
    // not by the midpoint of both palms. With the idle arm parked at the hip that
    // midpoint sits inside his own chest — its azimuth says nothing about where
    // the punch is going, and on a wide haymaker it reads as a huge lateral
    // error that the servo then dutifully "corrects".
    const strikeJ = this.strikeArmJoint();
    if (J.torso) {
      let fix = this._aimYaw || 0;
      if (lock < 0.999) {
        if (strikeJ) strikeJ.getWorldPosition(_palmTmp); else this.palmsMid(_palmTmp);
        const pmx = _palmTmp.x - this.pos.x, pmz = _palmTmp.z - this.pos.z;
        const vx = w.wrapDelta(prey.pos.x - this.pos.x);
        const vz = w.wrapDelta(prey.pos.z - this.pos.z);
        const dAz = (pmx * pmx + pmz * pmz > 0.09)
          ? angleDiff(Math.atan2(pmx, pmz), Math.atan2(vx, vz)) : 99;
        if (striking && Math.abs(dAz) < 1.1) { // fists driving through the front arc
          fix = clamp(fix + clamp(dAz - fix, -0.22, 0.22), -0.7, 0.7);
        } else {
          fix *= 0.75; // windup: don't chase, unwind
        }
      } else {
        fix *= 0.75;   // fully locked: arm-only aim, keep unwinding
      }
      fix *= 1 - lock;
      J.torso.rotation.y += fix;
      this._aimYaw = fix;
    }
    // The palm clamp SQUEEZES BOTH HANDS TOGETHER onto the target, which is what
    // a two-fisted pound or a body-slam carry wants. It is exactly wrong for a
    // one-armed blow: rolling both shoulders inward drags the punching arm across
    // his own chest (titanus' haymaker ended up behind his back, 141° off the
    // aim line), so a one-armed strike aims with the torso servo above and leaves
    // the arms where the clip put them.
    if (striking && !strikeJ) this.clampPalmsTo(prey);
    else this._palmFix = (this._palmFix || 0) * 0.8;
    // ...and the same aim in HEIGHT: onto the chest/head, never the shins.
    this.elevateStrikeAt(prey, striking ? 1 - lock : 0);
  }

  // The joint driving the CURRENT clip's blow, when that clip is one-armed
  // (animations.js `strikeArm`). null => a two-fisted clip, or no clip.
  strikeArmJoint() {
    const s = this.animator?.action?.clip?.strikeArm;
    return s ? (this.mech.joints['hand' + s] || null) : null;
  }

  // ---- VERTICAL STRIKE AIM -------------------------------------------------
  // The joint throwing the CURRENT blow, by NAME, for aiming purposes: the
  // clip's own marker first (`strikeLimb` / `strikeArm` — the same markers
  // combat resolves the hit on), else whichever extremity is reaching furthest
  // along our facing, the head included so a bite aims with the jaws.
  // Either way the limb must actually LEAD the body: during the wind-up the
  // fist is cocked back behind the shoulder, where its height says nothing
  // about where the punch is going, and this returns null so the servo sits
  // still instead of banking a correction it will have to throw away.
  strikeTipName() {
    const J = this.mech.joints;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const lead = (j) => {
      j.getWorldPosition(_palmTmp);
      return (_palmTmp.x - this.pos.x) * fx + (_palmTmp.z - this.pos.z) * fz;
    };
    const min = 0.2 * this.scale;
    const clip = this.animator?.action?.clip;
    const declared = clip?.strikeLimb || (clip?.strikeArm ? 'hand' + clip.strikeArm : null);
    if (declared) {
      const name = AIM_TIP_JOINT[declared] || declared;
      const j = J[name];
      if (j) return AIM_DRIVER[name] && lead(j) > min ? name : null;
    }
    let best = null, bestLead = min;
    for (const name of AIM_TIPS) {
      const j = J[name];
      if (!j) continue;
      const f = lead(j);
      // A HAND OR FOOT WINS TIES WITH THE HEAD. On a long-snouted frame the
      // jaws are out in front of the fists at all times, so a straight lead
      // scan aimed saurion's every claw rake with his neck; the head only
      // takes the blow when it is clearly the thing arriving first, which is
      // exactly what a bite looks like.
      const gain = name === 'head' ? 1.25 : 1;
      if (f > bestLead * gain) { bestLead = f; best = name; }
    }
    return best;
  }

  // Steer the blow onto the UPPER BODY. aimStrikeAt twists the torso until the
  // fist is on the target's LINE; nothing in the game aimed a swing in HEIGHT,
  // so a heavyweight's punch finished over a lightweight's crown and a scout's
  // finished at a giant's shins — connecting (the vertical hit assist in
  // strikeVolume quietly slides the sweep onto the body) but reading as a
  // whiff. This pulls the striking limb ITSELF into the chest-to-crown band,
  // MELEE.AIM_LO..AIM_HI, so the blow lands where the eye says it did. A blow
  // already arriving on the upper body is left alone: this rescues the ones
  // that finish off the body, it does not re-author swings.
  //
  // The joint that lifts the limb is PROBED rather than assumed — the same
  // trick clampPalmsTo uses for its inward roll. Nudge the shoulder (thigh,
  // torso) a known amount, measure how far the fist really moved in Y, and
  // that slope turns "I need 1.2 units of lift" into an angle on ANY rig,
  // procedural or retargeted GLB, whichever way its bone axes happen to point.
  // `gate` is 0..1 (0 = don't steer, unwind) — the same strike-window and
  // no-twist gating the lateral servo runs under.
  elevateStrikeAt(prey, gate) {
    const J = this.mech.joints;
    const tip = gate > 0 ? this.strikeTipName() : null;
    const tipJ = tip && J[tip];
    const drv = tip && J[AIM_DRIVER[tip]];
    if (!tipJ || !drv) { this.unwindPitch(); return; }
    // The limb throwing the blow can change mid-clip (a combo that finishes
    // with the other fist, a lunge that hands over from claw to jaws). What is
    // banked belongs to the joint it was measured on, so start the new one
    // from zero rather than transplanting an angle onto a different bone.
    if (this._pitchDrv && this._pitchDrv !== AIM_DRIVER[tip]) this._aimPitch = 0;
    let fix = this._aimPitch || 0;
    drv.rotation.x += fix;                 // re-apply what's already banked
    const y0 = tipJ.getWorldPosition(_palmTmp).y;
    const h = prey.height || this.height;
    const lo = prey.pos.y + h * MELEE.AIM_LO, hi = prey.pos.y + h * MELEE.AIM_HI;
    const dy = y0 > hi ? hi - y0 : (y0 < lo ? lo - y0 : 0);
    if (dy) {
      const PROBE = 0.08;
      drv.rotation.x += PROBE;
      const slope = (tipJ.getWorldPosition(_palmTmp).y - y0) / PROBE; // units / rad
      drv.rotation.x -= PROBE;
      // a driver that barely moves the tip (a locked shoulder, a limb folded
      // onto the axis) would need an absurd angle for a small lift — leave it
      if (Math.abs(slope) > 0.25 * this.scale) {
        const want = clamp(fix + clamp(dy / slope, -0.2, 0.2),
          -MELEE.AIM_PITCH, MELEE.AIM_PITCH) * gate;
        drv.rotation.x += want - fix;
        fix = want;
      }
    }
    this._aimPitch = fix;
    this._pitchDrv = AIM_DRIVER[tip];
  }

  // Ease the banked elevation back out instead of dropping it — the same
  // reason the twist and the palm clamp unwind (see updatePose): zeroing it on
  // the frame the strike window closes snaps the arm back onto the clip pose
  // and reads as a second, unmotivated pull-back. Re-applies what is left.
  unwindPitch(k = 0.72) {
    let fix = (this._aimPitch || 0) * k;
    if (Math.abs(fix) < 1e-4) { this._aimPitch = 0; this._pitchDrv = null; return; }
    this._aimPitch = fix;
    const j = this._pitchDrv && this.mech.joints[this._pitchDrv];
    if (j) j.rotation.x += fix;
  }

  // Firing NEVER turns a human's mech — the shot goes wherever the mech is
  // already facing (movement owns the facing). Only the AI squares up on
  // its target, as its stand-in for aiming skill.
  faceAim() {
    if (this.isAI) this.faceNearestEnemyIfClose(60, true);
  }

  doRanged() {
    const mv = this.def.moves.ranged;
    if (this.rangedCd > 0) return;
    this._moveAttack = false;
    // both fists in flight — nothing left to throw (one out is fine, the other
    // hand takes the shot)
    if (mv.type === 'fist' && this._fistOut?.size >= 2) return;
    if (this.ammoMax !== undefined && this.ammo <= 0) {
      this.world.audio?.play('uiBack'); // dry click — find an ammo crate
      this.rangedCd = 0.4;
      return;
    }
    this.uncloak();
    const isChannel = mv.type === 'gatling' || mv.type === 'flame' || mv.type === 'hose';
    this.faceAim();
    // LB lock-aim: shots fired during a target lock fly at the crosshair
    if (this._lockAim) this._aimPoint = this._lockAim.clone();

    // A TRAVERSING-TURRET SHOT is not fired on a keyframe: the trigger opens an
    // AIM WINDOW and the guns decide when they are ready (combat/cannonaim.js).
    // The clip is a brace to be held while they swing, not a firing animation —
    // so the volley is scheduled by updateCannons, not by a clip event.
    if (mv.aimWindup && hasCannons(this)) {
      this.rangedCd = mv.cooldown;
      if (this.ammoMax !== undefined) this.ammo--;
      this._volley = { mv, t: 0 };
      this.firing = true;
      this.animator.play(this.def.rangedClip || 'brace');
      // held through the aim, plus the recovery the recoil needs afterwards
      this.setState('attack', mv.aimWindup + 0.4);
      return;
    }

    if (isChannel) {
      this.setState('channel', 0.1);
      this.firing = true;
      this.rangedCd = mv.cooldown;
      if (this.ammoMax !== undefined) this.ammo--;
      this.channelTick(mv);
    } else {
      // Two-weapon mechs alternate sides shot to shot (mirrored animation) —
      // mortar (colossus), slime (frogger), lightning (tempest's arc bolts,
      // one emitter per arm), VIPER, who throws a forearm dagger (she has two,
      // so she should not keep flinging the right one while the left hangs
      // unused), and TITANUS, who throws alternate rocket fists. The weapon
      // handler reads _altSide to spawn from the matching muzzle, so the shot
      // leaves the hand that just moved.
      const twin = mv.type === 'mortar' || mv.type === 'slime'
        || mv.type === 'lightning' || mv.type === 'blade' || mv.type === 'fist'
        || mv.type === 'shell'    // RHINO: a hand cannon per fist
        || mv.type === 'goo'      // JERRY: a cannon pod per side
        || mv.type === 'glitch';  // NULLBOT: a null bolt off either claw
      if (twin && this.mech.anchors.muzzleL) this._altSide = !this._altSide;
      // A thrown DAGGER is a physical object, so the side has to be one she
      // actually HAS: alternate by default, but throw from the more re-forged
      // arm whenever the sides differ. Plain alternation is not enough on its
      // own — a clip replaced before its `fire` event toggles without ever
      // throwing, and under sustained fire the 0.8s cooldown outruns the
      // re-forge, so both daggers can be away at once. Either way the fix is
      // the same: never fling the emptier forearm.
      if (mv.type === 'blade') {
        const want = this._altSide ? 'bladeL' : 'bladeR';
        const other = this._altSide ? 'bladeR' : 'bladeL';
        if (this.weaponReady(other) > this.weaponReady(want) + 0.05) this._altSide = !this._altSide;
      }
      // Same story for a thrown FIST: it is gone until it flies home, so strict
      // alternation can land on a hand that is still out there. Take the other
      // one rather than skip the shot — doRanged already refused if BOTH are away.
      if (mv.type === 'fist') {
        if (this._fistOut?.has(this._altSide ? 'L' : 'R')) this._altSide = !this._altSide;
        this._fistSide = this._altSide ? 'L' : 'R';   // read by WEAPONS.fist
      }
      const mirrored = (mv.type === 'slime' || mv.type === 'lightning'
        || mv.type === 'blade' || mv.type === 'shell'
        || mv.type === 'goo' || mv.type === 'glitch') && this._altSide;
      // a named ranged clip can still mirror: prefer rangedClipL on the off hand
      const clip = (this._altSide && this.def.rangedClipL) || this.def.rangedClip
        || (mv.type === 'mortar' ? (this._altSide ? 'braceL' : 'brace')
        : mv.type === 'railgun' ? 'aim'
        : mv.type === 'groundpound' ? 'groundPound'
        : mirrored ? 'shootL' : 'shoot');
      this.rangedCd = mv.cooldown;
      // The side THIS clip was mirrored for. The shot leaves on the clip's
      // `fire` event, which lands a beat later — by then another press may have
      // toggled _altSide again, and a handler reading it live would spawn from
      // the arm the animation isn't using (and, for viper, empty the wrong
      // forearm). Handlers read this stamp instead.
      this._shotSide = this._altSide;
      // single-shot weapons spend ammo too (channel weapons decrement in
      // their own loop) — without this they never drain and never refill
      if (this.ammoMax !== undefined) this.ammo--;
      const shotSide = this._altSide;
      const dur = this.animator.play(clip, {
        onEvent: (type) => {
          if (type === 'fire') { this._shotSide = shotSide; this.world.fireRanged(this, mv); }
          else if (type === 'shake') this.world.effects.addShake(0.3);
        },
      });
      // light hip-fire clips let you keep moving; only brief lock for heavy
      // shots. (Not simply `clip.upper`: the sniper `aim` is upper-body too
      // and is MEANT to plant him for the shot.)
      if (!RUN_AND_GUN_CLIPS.has(clip)) this.setState('attack', dur * 0.6);
    }
  }

  // THE FLANK CANNONS, one frame at a time (TRITONE; a no-op and nearly free
  // for every other mech, which has no cannon bones to find).
  //
  // Between volleys the guns drift home. Inside a volley they chase a LEAD
  // POINT, and the shot leaves the instant both are on the line — or when the
  // window (`ranged.aimWindup`, one second) runs out, aimed as well as they
  // managed. Firing on a timer alone would waste a good solution reached in a
  // quarter of a second; firing only on a good solution would mean a target
  // parked inboard of one gun never gets shot at at all.
  updateCannons(dt) {
    // A MOVE MAY TAKE THE GUNS. While `_cannonDrive` is set (TRITONE's SIEGE
    // PROTOCOL sweeps both mounts through a half-turn by hand — cannonaim
    // driveCannons), the aim solver does not run at all: two things writing
    // the same two bones is a frame of the servo undoing the choreography.
    // The move clears it when it ends and the traverse takes over again.
    if (this._cannonDrive) { this._cannonDrive(dt); return; }
    const v = this._volley;
    if (v && (!this.alive || this.state === 'hitstun' || this.state === 'knockdown'
      || this.state === 'special' || this.state === 'ult')) {
      this._volley = null;                 // interrupted mid-aim: no shot
      this.firing = false;
    }
    if (!this._volley) { aimCannons(this, dt, false); return; }
    v.t += dt;
    const err = aimCannons(this, dt, true, v.mv);
    if (err > ON_TARGET && v.t < (v.mv.aimWindup || 1)) return;
    this.world.fireRanged(this, v.mv);
    cannonRecoil(this);
    this._volley = null;
    this.firing = false;
  }

  // ONE TICK of a held channel weapon (gatling / flame / hose). Called for the
  // opening shot by doRanged and for every shot after by the 'channel' state
  // branch, so both paths pick the same gun and keep the same loop playing.
  //
  // TWIN-GUN CHANNEL (vulcan): a mech with a mirrored channel clip trades hands
  // so both guns get in on it. It swaps on a CLOCK (`channelSwap` seconds), not
  // per round — a gatling spits a round every 0.085s, and swapping per shot
  // would ask the arms to trade places twelve times a second, which the pose
  // smoother just averages into one limp half-raised stance. A couple of
  // seconds a side gives each arm a real turn: brrrrrt-left, brrrrrt-right.
  //
  // Timed off animator.t (which advances on the same scaled dt as everything
  // else, so slow-mo slows the swap too) rather than counting rounds, so the
  // cadence holds whatever the fire rate is doing.
  channelTick(mv) {
    if (this.def.channelClipL && this.mech.anchors.muzzleL) {
      const now = this.animator.t;
      if (this._swapT === undefined || now - this._swapT >= (this.def.channelSwap || 1)) {
        if (this._swapT !== undefined) this._altSide = !this._altSide;
        this._swapT = now;
      }
    }
    const cclip = (this._altSide && this.def.channelClipL)
      || this.def.channelClip || 'shootLoop';
    if (!this.animator.isPlaying(cclip)) this.animator.play(cclip);
    // the barrel world.js should fire from — same stamp the single-shot weapons
    // use, so the round always leaves the gun the animation has led with
    this._shotSide = !!(this._altSide && this.def.channelClipL);
    this.world.fireRanged(this, mv);
  }

  doSpecial() {
    if (this.specialCd > 0) return;
    const sp = this.def.moves.special;
    const impl = SPECIALS[sp.id];
    if (!impl) return;
    this._moveAttack = false;
    this.uncloak();
    this.specialCd = sp.cooldown;
    this.faceNearestEnemyIfClose(40, true);
    impl(this, sp);
    this.world.events.emit('special', { fighter: this, name: sp.name });
  }

  // INFINITE ULTIMATES (settings / ?debug=ultimates) is a PLAYER cheat: it
  // fires the ult off an empty meter. Handing it to the CPU too turned every
  // AI into an ult loop (the "why is Rhino stampeding four times a round"
  // report), so it stops at human-controlled fighters.
  ultCheat() {
    return CONFIG.debugUltimates && !this.isAI;
  }

  doUlt() {
    if (this.isMinion) return; // summons never cascade their own ults
    if (this.ult < 1 && !this.ultCheat()) return;
    const u = this.def.moves.ult;
    const impl = ULTS[u.id];
    if (!impl) return;
    this._moveAttack = false;
    this.uncloak();
    // spend one collected charge (the cheat and the soak harness fire off an
    // empty pouch — nothing to go below zero)
    this.ultCharges = Math.max(0, this.ultCharges - 1);
    this.ult = this.ultCharges > 0 ? 1 : 0;
    this.ultFlashT = 1.4;
    this.faceNearestEnemyIfClose(80, true);
    this.world.events.emit('ult', { fighter: this, name: u.name });
    this.world.audio?.play('ultReady');
    impl(this, u);
  }

  // charge (seconds of crouch wind-up, 0..CHARGE_DASH_MAX) scales the dash:
  // an uncharged tap is the classic dodge, a full coil is a screaming lunge
  doDash(charge = 0) {
    if (this.dashCd > 0 && charge < 0.2) return;
    // stamina: a small flat bite, MULTIPLIED if the guard is up — burning
    // the tank two ways at once is meant to be expensive
    this.sprintEnergy = Math.max(0,
      this.sprintEnergy - DASH_COST * (this.blocking ? BLOCK_DASH_MULT : 1));
    const k = clamp(charge / CHARGE_DASH_MAX, 0, 1);
    const ix = this.intent.moveX, iz = this.intent.moveZ;
    let dir;
    if (Math.abs(ix) + Math.abs(iz) > 0.2) dir = _v.set(ix, 0, iz).normalize();
    else dir = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const sp = this.def.stats.speed * DASH_SPEED_MULT * (1 + DASH_CHARGE_BOOST * k) * this.speedMult();
    this.vel.x = dir.x * sp;
    this.vel.z = dir.z * sp;
    // strafe dash (AI only — players own their facing): keep facing a
    // nearby enemy so sideways dashes read as combat sidesteps
    if (this.isAI) {
      const e = this.nearestEnemy();
      if (e && this.pos.distanceTo(e.pos) < 34) {
        this.targetYaw = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      }
    }
    this.dashCd = DASH_COOLDOWN;
    this.dashT = 0.3 + 0.32 * k;
    this._dashDur = this.dashT;   // animator reads progress = 1 - dashT/dur
    this.iframes = Math.max(this.iframes, 0.26 + 0.28 * k);
    this.setState('dash', this.dashT);
    this.world.audio?.play('dash');
    this.world.effects.rings.spawn(this.pos, {
      from: 0.5, to: 3.5 + 3 * k, dur: 0.3, color: PLAYER_COLORS[this.playerIndex % 4], y: 0.4,
    });
    if (k > 0.35) { // a wound-up release detonates off the line
      this.world.audio?.play('whooshBig');
      this.world.effects.dustPuff(this.pos, 6 + 8 * k);
    }
  }

  faceNearestEnemyIfClose(maxDist, always = false) {
    // HUMANS NEVER TURN when using a weapon — every attack (melee, ranged,
    // special, ult) fires along the mech's CURRENT facing; movement owns
    // the orientation. Only the AI snaps toward its target, as its
    // stand-in for aiming skill.
    if (!this.isAI) return;
    const e = this.nearestEnemy();
    if (!e) return;
    const dx = this.world.wrapDelta(e.pos.x - this.pos.x);
    const dz = this.world.wrapDelta(e.pos.z - this.pos.z);
    if (always || Math.hypot(dx, dz) < maxDist) {
      // the AI's aim snap carries a per-difficulty yaw ERROR — humans aim
      // with the camera and miss; a pixel-perfect snap felt unbeatable
      const err = this._aimErr ? (Math.random() * 2 - 1) * this._aimErr : 0;
      this.targetYaw = Math.atan2(dx, dz) + err;
      this.yaw = this.torsoYaw = this.targetYaw;
    }
  }

  // WHERE THE BLOW LANDS. The strike volume is centred on the limb that
  // actually throws it — the striking hand's or foot's own capsule — rather
  // than on a fixed point off the sternum, which is what made a punch thrown
  // past someone's shoulder still connect. hurtbox.pickStrikeLimb reads the
  // clip's `strikeLimb` / `strikeArm` marker and otherwise takes whichever
  // extremity is reaching furthest forward on the impact frame, so the
  // bespoke clips (sword forms, claw rakes, crab claps) need no table.
  // The blow is a SWEPT LIMB: `a` at the joint it comes off (elbow / knee),
  // `b` just past the fist or foot. Writes both, returns { r, limb, b };
  // `limb` is null when we fell back to the old body-relative point.
  strikeVolume(atk, a, b) {
    const reach = atk.range || 3.5;
    const r = Math.max(MELEE.SWING_MIN * this.scale, MELEE.SWING_R * reach);
    const over = MELEE.OVERSHOOT * reach;
    const hb = this.hurtbox;
    const stamp = this.world.time;
    let limb = null;
    if (hb) {
      if (this.inTwoFistSmash()) {
        // both fists come down together — one capsule down the middle
        const okL = hb.strikeSegment('handL', over, _strikeA, _strikeB, stamp);
        const okR = hb.strikeSegment('handR', over, a, b, stamp);
        if (okL && okR) {
          a.add(_strikeA).multiplyScalar(0.5);
          b.add(_strikeB).multiplyScalar(0.5);
          limb = 'fists';
        } else if (okR) limb = 'handR';
        else if (okL) { a.copy(_strikeA); b.copy(_strikeB); limb = 'handL'; }
      }
      if (!limb) {
        const name = pickStrikeLimb(hb, this.animator?.action?.clip,
          Math.sin(this.yaw), Math.cos(this.yaw), this.pos.x, this.pos.z,
          0.35 * this.scale, stamp);
        if (name && hb.strikeSegment(name, over, a, b, stamp)) limb = name;
      }
    }
    if (!limb) {
      // unmeasurable model, or nothing leading the body: the legacy point
      b.set(this.pos.x + Math.sin(this.yaw) * reach * 0.75,
        this.pos.y + this.height * 0.5,
        this.pos.z + Math.cos(this.yaw) * reach * 0.75);
      a.set(this.pos.x, b.y, this.pos.z);
    }
    // VERTICAL STRIKE ASSIST. Resolving a blow at the fist exposes something
    // the old chest-height sphere hid: a big mech's punch genuinely finishes
    // ABOVE a small mech. Measured on titanus, whose haymaker ends 8.5 units
    // up — over viper's head — while the old test always resolved it at his
    // own mid-height and connected regardless. Nothing in the game aims a
    // swing vertically, so without help every heavyweight would simply stop
    // being able to punch a lightweight.
    //
    // The fix is the colossal-form clamp that already lived here, generalised
    // and made symmetric: if the blow lands outside the target's body band —
    // over the head or under the feet — slide the sweep just far enough to
    // graze that band. Nothing here touches the horizontal test, which is
    // where "he punched past me and still hit" was actually coming from.
    //
    // Judged at the TIP (`b`, the extremity past the fist) rather than over
    // the segment's whole extent. The other end is the elbow, which hangs at
    // the attacker's own chest height and therefore lands inside the band of
    // any target of remotely similar height by accident — so an "does the
    // swing overlap them" test passed on the elbow and the assist sat out
    // exactly when it was needed. Measured on rhino, whose cross finishes at
    // y 7.8 over viper's crown at 6.0 while his elbow rides at 5.4, just
    // inside viper's band: dy came out 0 and the punch sailed over. The tip
    // is what strikes — onAttackEvent already reads `b` as the impact point.
    //
    // The slide is CAPPED (MELEE.ASSIST_Y × the attacker's height). Closing a
    // head-height gap between two mechs standing on the same floor is worth a
    // unit or three; uncapped, the same line happily slid the swing 40 units
    // to meet someone at the top of a jump, which is the airborne-hit report.
    // Past the cap the swing moves as far as it may and simply misses.
    const tgt = this.nearestEnemy();
    if (tgt) {
      const lo = tgt.pos.y + tgt.height * 0.2, hi = tgt.pos.y + tgt.height * 0.95;
      let dy = b.y > hi ? hi - b.y : (b.y < lo ? lo - b.y : 0);
      const cap = MELEE.ASSIST_Y * this.height;
      dy = clamp(dy, -cap, cap);
      a.y += dy; b.y += dy;
    }
    return { r, limb };
  }

  // melee hit event from animation
  onAttackEvent(type, arg, atk) {
    if (type === 'sfx') { this.world.audio?.play(arg); return; }
    if (type === 'shake') { this.world.effects.addShake(arg || 0.4); return; }
    if (type === 'fx') { this.heavyChargeFx(atk); return; } // pre-impact charge beat
    if (type !== 'hit') return;
    this.uncloak();
    // KINETIC IMPACT is resolved per-victim below (closing speed is relative to
    // each target), so the attack line — attacker forward, plus a downward
    // component for smashes/dives — is captured here once for the whole swing.
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    const downW = this.plunging ? PLUNGE_DOWN_WEIGHT : (atk.smash ? SMASH_DOWN_WEIGHT : 0);
    const reach = atk.range || 3.5;
    const { r: swingR } = this.strikeVolume(atk, _strikeS0, _strikeS1);
    // the impact POINT (wall grab, building damage, signature FX) is the
    // business end of that sweep — the fist/foot, not the elbow
    const cx = _strikeS1.x, cy = _strikeS1.y, cz = _strikeS1.z;
    // an airborne punch HELD when the fist meets a building face becomes a
    // WALL GRAB instead of a strike — jump, punch-hold, hang, jump again:
    // that's how mechs climb
    if (!this.grounded && !this.isAI && this.intent.lightHeld && !atk.heavy &&
        this.world.arena?.grabProbe) {
      const g = this.world.arena.grabProbe(cx, cy, cz);
      if (g) { this.startHang(g); return; }
    }
    // signature heavy impact FX (visuals + any bonus area effect)
    if (atk.fx) this.heavyImpactFx(atk, cx, cy, cz, reach);
    let hitAny = false;
    const stamp = this.world.time;
    for (const f of this.world.fighters) {
      if (f === this || !f.alive) continue;
      // the swept limb, moved into the victim's image across the seam (both
      // ends by the same offset), so the capsule test never has to know
      // about arena wrapping
      const ox = this.world.wrapDelta(_strikeS0.x - f.pos.x) + f.pos.x - _strikeS0.x;
      const oz = this.world.wrapDelta(_strikeS0.z - f.pos.z) + f.pos.z - _strikeS0.z;
      _swept0.set(_strikeS0.x + ox, _strikeS0.y, _strikeS0.z + oz);
      _swept1.set(_strikeS1.x + ox, _strikeS1.y, _strikeS1.z + oz);
      if (bodyHitSegment(f, _swept0, _swept1, swingR, MELEE.PAD, stamp)) {
        // CLOSING SPEED along the attack line: relative velocity (both bodies'
        // motion) projected onto attacker-forward, plus — for a smash/dive —
        // the downward relative speed. Two mechs closing add their speeds; a
        // charge into a still target reads the full run; standing still and
        // hitting a mech that runs onto your fist reads ITS run just the same.
        const rvx = this.vel.x - f.vel.x, rvz = this.vel.z - f.vel.z;
        let closing = rvx * fwdX + rvz * fwdZ;
        // smash/dive: fold in how fast we're dropping onto the target
        if (downW) closing += downW * Math.max(0, f.vel.y - this.vel.y);
        closing = Math.max(0, closing);
        // DAMAGE / KNOCKBACK: the wallop is closing speed with a modest lean on
        // the attacker's weight (heavier frame stings a bit more)
        const wallop = closing * (WEIGHT_DMG_BASE + WEIGHT_DMG_GAIN * this.def.stats.weight);
        const over = Math.max(0, wallop - IMPACT_FLOOR);
        const dmgMult = 1 + Math.min(IMPACT_DMG_CAP, over * IMPACT_DMG_RATE);
        const knockMult = 1 + Math.min(IMPACT_KNOCK_CAP, over * IMPACT_KNOCK_RATE);
        // KNOCKDOWN: momentum vs the victim's MASS — the shove velocity they eat
        // is closing speed scaled by the attacker/victim mass ratio. A light mech
        // floors a same-size rival by charging in, but can't budge a heavy one no
        // matter how fast; a heavy bowls over a light almost by leaning on it.
        let launch = atk.launch || 0;
        const kick = closing >= CLOSING_MIN ? closing * this.massFactor() / f.massFactor() : 0;
        if (kick >= KNOCKDOWN_KICK) {
          launch = Math.max(launch,
            Math.min(IMPACT_LAUNCH_MAX, IMPACT_LAUNCH_MIN + (kick - KNOCKDOWN_KICK) * IMPACT_LAUNCH_RATE));
        } else if (launch > 0) {
          launch *= knockMult;
        }
        f.takeHit(atk.dmg * dmgMult, this, {
          knock: (atk.knock || 8) * knockMult, launch,
          srcPos: this.pos, heavy: atk.heavy, status: atk.status || null,
        });
        hitAny = true;
      }
    }
    // collateral: melee cracks buildings
    _v.set(cx, cy, cz);
    this.world.arena?.damageSphere(_v, reach * 0.9, atk.dmg * 1.4, _v2.set(Math.sin(this.yaw), 0.2, Math.cos(this.yaw)));
    if (hitAny) {
      this.world.engine.addHitStop(atk.heavy ? 0.09 : 0.045);
      this.world.effects.addShake(atk.heavy ? 0.5 : 0.2);
    }
  }

  // ---- signature heavy FX: the mid-clip charge beat ('fx' event) ----
  heavyChargeFx(atk) {
    const w = this.world;
    if (atk.fx === 'starSmash') {
      // NOVA: a shaft of starlight strikes the raised staff and sets it blazing
      const tip = this.mech.anchors.muzzleR?.getWorldPosition(_v) || this.center();
      w.effects.beams.spawn(new THREE.Vector3(tip.x, tip.y + 36, tip.z), tip.clone(),
        { radius: 0.5, dur: 0.45, color: 0xffd8f8 });
      const g = this.animator?.novaGlow || 0.5;
      for (let i = 0; i < 14; i++) {
        const a = rand(TAU), rr = rand(0, 1.2);
        w.effects.glows.emit(tip.x + Math.cos(a) * rr, tip.y + rand(-0.4, 0.8), tip.z + Math.sin(a) * rr,
          Math.cos(a) * 2, rand(1, 4), Math.sin(a) * 2,
          { life: rand(0.3, 0.6), size: rand(0.6, 1.4) * (1 + g), color: i % 3 ? 0xff3ce8 : 0xfff0ff, alpha: 0.95 });
      }
      w.effects.glows.emit(tip.x, tip.y, tip.z, 0, 0, 0,
        { life: 0.4, size: 3 + 2.5 * g, color: 0xffffff, alpha: 0.95 });
    }
  }

  // ---- signature heavy FX: on the impact frame ----
  heavyImpactFx(atk, cx, cy, cz, reach) {
    const w = this.world;
    if (atk.fx === 'starSmash') {
      // NOVA: the staff hits like a falling star — area burst around the point
      const g = this.animator?.novaGlow || 0;
      const p = new THREE.Vector3(cx, 0, cz);
      w.effects.rings.spawn(p, { from: 0.6, to: 7 + 4 * g, dur: 0.5, color: 0xff3ce8, y: 0.35 });
      w.effects.explosion(new THREE.Vector3(cx, 1, cz), 3.5 + 2 * g, { color: 0xff5ce8, smoke: false });
      w.groundShockwave(this, p, 5.5 + 2 * g, atk.dmg * 0.35, 10, 0xff3ce8);
      w.audio?.play('plasma');
    } else if (atk.fx === 'wingLasers') {
      // WRAITH: every spread wing-tip fires a red beam converging on the mark
      const target = new THREE.Vector3(cx, Math.max(1.5, cy * 0.7), cz);
      for (let k = 0; k < 6; k++) {
        const a = this.mech.anchors['wing' + k];
        if (!a) continue;
        w.effects.beams.spawn(a.getWorldPosition(new THREE.Vector3()), target.clone(),
          { radius: 0.11, dur: 0.32, color: 0xff2030 });
      }
      w.effects.glows.emit(target.x, target.y, target.z, 0, 0, 0,
        { life: 0.35, size: 3.4, color: 0xff2030, alpha: 0.95 });
      w.effects.impactSparks(target, 0xff2030, 16, 10);
      w.audio?.play('zap');
    } else if (atk.fx === 'apeQuake') {
      // KONGA: both fists land together — the floor answers. A tight crater
      // ring at the fists plus a wider ground shock that only staggers, so the
      // slam's real damage stays on the melee sweep and this is the punctuation.
      const p = new THREE.Vector3(cx, 0, cz);
      w.effects.rings.spawn(p, { from: 0.8, to: 8.5, dur: 0.42, color: 0xd8b070, y: 0.3 });
      w.effects.explosion(new THREE.Vector3(cx, 0.9, cz), 3.0, { color: 0xc8a060, smoke: true, sparks: false });
      w.effects.dustPuff(p, 16, 0x9a8878);
      w.groundShockwave(this, p, 7.5, atk.dmg * 0.3, 12, 0xd8b070);
      // slabs of dirt thrown up around the impact
      for (let i = 0; i < 14; i++) {
        const a = rand(TAU), rr = rand(0.8, 3.4);
        w.effects.smoke.emit(cx + Math.cos(a) * rr, 0.3, cz + Math.sin(a) * rr,
          Math.cos(a) * 5, rand(3, 8), Math.sin(a) * 5,
          { life: rand(0.5, 0.95), size: rand(1.0, 2.2), color: 0x9a8878, alpha: 0.6 });
      }
      w.audio?.play('hitHeavy');
    } else if (atk.fx === 'hornQuake') {
      // TRITONE: the horns rip UP through the target, so the punctuation is a
      // vertical burst at the horn tips rather than a floor ring.
      const target = new THREE.Vector3(cx, Math.max(1.2, cy), cz);
      w.effects.explosion(target, 2.6, { color: 0xffa040, smoke: true, sparks: false });
      w.effects.impactSparks(target, 0xffc070, 20, 14);
      w.effects.rings.spawn(new THREE.Vector3(cx, 0, cz), { from: 1.0, to: 6.0, dur: 0.38, color: 0xffa040, y: 0.25 });
      // dirt sprayed forward off the horn tips
      for (const key of ['hornL', 'hornR', 'hornNose']) {
        const a = this.mech.anchors[key];
        if (!a) continue;
        const hp = a.getWorldPosition(new THREE.Vector3());
        for (let i = 0; i < 5; i++) {
          w.effects.smoke.emit(hp.x, hp.y, hp.z, rand(-3, 3), rand(4, 9), rand(-3, 3),
            { life: rand(0.4, 0.8), size: rand(0.7, 1.5), color: 0x8c8266, alpha: 0.55 });
        }
      }
      w.audio?.play('hitHeavy');
    }
  }

  // ---- shared hold-phase scaffold for the two hold-to-charge attacks
  // (heavy whirl + TITANUS/COLOSSUS haymaker). While the hold clip loops
  // and the button stays down: bank charge (capped), pin the attack state
  // open, run the charge-tell FX on its tightening cadence, and beat the
  // one-shot full-charge flourish. Field names stay per-attack (o.slot...)
  // — startAttack seeds them and the animator/update loop read them.
  // Returns null while holding (or when the hold is over/aborted); returns
  // the banked k (0..1) exactly once at release — the caller owns the
  // release choreography, which is where the two attacks truly differ.
  _chargeHoldPhase(dt, o) {
    if (!this.alive || this.state !== 'attack' || !this.animator.isPlaying(o.holdClip)) {
      this[o.slot] = null;
      return null;
    }
    // the wind-up beat runs even after the button is let go (see
    // CHARGE_MIN_WINDUP), so the timer advances whether or not we're held
    const t = (this[o.slot] = Math.min(o.cap + CHARGE_MIN_WINDUP, this[o.slot] + dt));
    // charge banked so far, with the forced wind-up discounted: a tap lands on
    // exactly k=0 (the weakest strike) and a full hold still reaches k=1
    const k = clamp01((t - CHARGE_MIN_WINDUP) / o.cap);
    if (o.held || t < CHARGE_MIN_WINDUP) {
      this.stateT = Math.max(this.stateT, 0.3); // stay in the hold
      this[o.fxSlot] = (this[o.fxSlot] ?? 0) - dt;
      if (this[o.fxSlot] <= 0) {
        this[o.fxSlot] = o.fxInterval(k);
        o.tell(k);
      }
      if (k >= 1 && !this[o.fullSlot]) {
        this[o.fullSlot] = true;
        this.world.audio?.play('powerup');
        o.fullFx();
      }
      return null;
    }
    this[o.slot] = null;
    return k;
  }

  // hold-to-charge heavy: releasing fires the lunge with the banked
  // damage/knock/launch — the longer the whirl, the harder it lands
  updateHeavyHold(dt) {
    const k = this._chargeHoldPhase(dt, {
      slot: '_whirlHold', fullSlot: '_whirlFull', fxSlot: '_whirlFxT',
      cap: HEAVY_HOLD_CAP, holdClip: this.def.heavyClip, held: this.intent.heavyHeld,
      // charge tell: rings tighten and quicken as the whirl banks power
      fxInterval: (k) => 0.42 - 0.24 * k,
      tell: () => this.world.effects.rings.spawn(this.pos, {
        from: 2.6, to: 0.8, dur: 0.26, color: this.def.colors.glow, y: 0.4,
      }),
      fullFx: () => this.world.effects.rings.spawn(this.pos, { from: 0.5, to: 4.5, dur: 0.35, color: 0xffffff, y: 0.5 }),
    });
    if (k === null) return;
    // released: discharge the banked hold into the strike
    this._heavyLungeK = k;
    this.faceNearestEnemyIfClose(14); // re-square: they moved during the hold
    const mv = this.def.moves.heavy;
    // fade 0 — see updatePunchHold for why a hold->release handover must not
    // cross-fade. This is the pound's "stutter": the arms dipped back toward the
    // resting stance mid-handover and then climbed again before slamming.
    const dur = this.animator.play(this.smashClip(this.def.heavyReleaseClip, false), {
      fade: 0,
      onEvent: (type, arg) => this.onAttackEvent(type, arg, {
        dmg: mv.dmg * (0.8 + 0.8 * k) * this.dmgMult(),
        knock: mv.knock * (1 + 0.9 * k),
        range: mv.range * this.scale * (1 + 0.3 * k), // charged slams reach deeper
        launch: mv.launch * (1 + 0.5 * k),
        heavy: true,
        smash: true, // overhead slam — downward closing counts if airborne
      }),
    });
    this.setState('attack', dur * 0.9);
    if (k > 0.4) this.world.audio?.play('whooshBig');
    // banked charge also LUNGES the slam forward — a full wind steps deep
    // into (or through) where the target was standing. Mechs with their own
    // heavyDrive (aegis' lance lunge) already scale it via kBoost.
    if (!this.def.heavyDrive) {
      this._chargeLunge = { delay: dur * 0.1, t: dur * 0.5, speed: (3 + 12 * k) * this.scale };
    }
    // two-fist pounds (the punchHold mechs): converge the fists ONTO the
    // victim's body through the slam — wide shoulders otherwise drop the
    // hands to either side of a slim target
    if (this.def.punchHold) this.trackStrikeVictim(mv.range, dur);
  }

  // A stand-in for "an enemy in the ideal spot": dead ahead, squared up, at
  // `dist` world units, standing on the same floor. Aiming attacks steer toward
  // their victim, so with nobody actually there they used to either skip the
  // tracking entirely or chase whatever distant thing existed — which is what
  // slewed the body round in the test rigs. It carries the same surface the
  // aiming code reads off a real fighter (pos / center() / vel / hitRadius), so
  // melee tracking and ranged aim can both steer at it unchanged.
  aimPhantom(dist) {
    const pos = new THREE.Vector3(
      this.pos.x + Math.sin(this.yaw) * dist,
      this.pos.y,
      this.pos.z + Math.cos(this.yaw) * dist);
    // chest height on a body the same size as ours — the same fraction
    // Fighter.center() uses, so a shot ranged onto the phantom pitches exactly
    // as it would onto a real opponent of matching build
    const mid = pos.clone().setY(pos.y + this.height * 0.55);
    return {
      phantom: true,
      alive: true,
      hitRadius: this.baseHitRadius,
      // ...and our own build's height, so the vertical strike aim has a body
      // band to steer into out here too (a showcase swing then lands at the
      // chest of the imaginary opponent instead of drifting)
      height: this.height,
      pos,
      vel: new THREE.Vector3(),
      center: () => mid.clone(),
    };
  }

  // Where that phantom stands for a given move: melee wants one just inside
  // reach, a ranged weapon one out at its working distance — the move's own
  // `range` when it declares one (flamethrower, hose, rocket fist), else the
  // generic mid-arena engagement gap. A colossal form ranges out with its size.
  idealAimDist(mv, melee = false) {
    if (melee) return (mv?.range ?? 4) * this.scale * 0.75;
    const gf = Math.max(1, this.scale / (this.def.body.scale || 1));
    return (mv?.range || DEFAULT_ENGAGE_DIST) * gf;
  }

  // melee keeps its own entry point: the reach-relative phantom above
  phantomPrey(range) { return this.aimPhantom(this.idealAimDist({ range }, true)); }

  // aim the strike at whoever is in front: post-pose torso steer + palm
  // convergence (aimStrikeAt) rides the rest of the swing. With no enemy in
  // reach/arc it aims at the phantom above, so the swing still reads correctly.
  trackStrikeVictim(range, dur) {
    const prey = this.nearestEnemy();
    let target = null;
    if (prey) {
      const dx = this.world.wrapDelta(prey.pos.x - this.pos.x);
      const dz = this.world.wrapDelta(prey.pos.z - this.pos.z);
      if (Math.hypot(dx, dz) < range * this.scale * 2 &&
          Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) < 1.1) target = prey;
    }
    // Track only until the blow LANDS, not for the whole clip. The tracking
    // exists to converge the fists onto the victim through the descent; once the
    // hit event has fired there is nothing left to steer, and holding the twist
    // and the palm clamp through the follow-through hauls the arms back around
    // behind the body — titanus' pound read as a SECOND wind-up after the slam,
    // because its hit lands at 0.18s of a 0.7s clip. A short tail past the hit
    // keeps the impact frame settled, then updatePose unwinds it smoothly.
    const hits = (this.animator?.action?.clip?.events || [])
      .filter((ev) => ev.type === 'hit').map((ev) => ev.t);
    const window = hits.length ? Math.max(...hits) + 0.12 : dur * 0.95;
    this._strikeAim = { f: target || this.phantomPrey(range), t: Math.min(window, dur * 0.95) };
    this._aimYaw = 0;
    this._aimPitch = 0;
    this._pitchDrv = null;
  }

  // ---- hold-to-charge haymaker (TITANUS/COLOSSUS): same contract as the
  // heavy hold — the wind-up loop keeps the fist cocked while X stays down,
  // and releasing throws the punch with the banked damage/knock. A full
  // charge sends the victim across the street like nothing else ----
  updatePunchHold(dt) {
    const idx = this._punchIdx || 0;
    const k = this._chargeHoldPhase(dt, {
      slot: '_punchHold', fullSlot: '_punchFull', fxSlot: '_punchFxT',
      cap: PUNCH_HOLD_CAP, holdClip: idx ? 'punchHold2' : 'punchHold1',
      held: this.intent.lightHeld,
      // charge tell: energy crackles off the cocked fist as power banks
      fxInterval: (k) => 0.3 - 0.18 * k,
      tell: (k) => {
        const j = this.mech.joints[idx ? 'handR' : 'handL'];
        if (j) {
          j.getWorldPosition(_v);
          this.world.effects.glows.emit(_v.x, _v.y, _v.z,
            rand(-1, 1), rand(0, 2), rand(-1, 1),
            { life: 0.22, size: 0.5 + 0.9 * k, color: this.def.colors.glow, alpha: 0.9 });
        }
      },
      fullFx: () => this.world.effects.rings.spawn(this.pos, { from: 0.5, to: 3.5, dur: 0.3, color: this.def.colors.glow, y: 0.5 }),
    });
    if (k === null) return;
    // released: throw the banked punch. The wind-up was mobile; the throw
    // is not — plant for the swing itself.
    this._moveAttack = false;
    const mv = this.def.moves.light;
    this.faceNearestEnemyIfClose(12);
    // A hold->release handover must NOT cross-fade. The animator keeps a single
    // action, so `play` REPLACES the hold and the new clip's weight ramps up from
    // the BASE stance — not from the outgoing clip. At weight 0.24 the pose is
    // three-quarters resting stance, so the wound-up arm dipped back down toward
    // his side and then climbed again before firing: the "stutter". The release
    // clip's t=0 is authored to BE the hold pose, so taking it at full weight
    // immediately is a seamless continuation. (The animator's own pose smoothing
    // still eases the motion, so this is not a snap.)
    const dur = this.animator.play(idx ? 'punchRelease2' : 'punchRelease1', {
      fade: 0,
      onEvent: (type, arg) => this.onAttackEvent(type, arg, {
        dmg: mv.dmg[idx] * (1 + 1.1 * k) * this.dmgMult(),
        knock: mv.knock[idx] * (1 + 1.2 * k),
        range: mv.range * this.scale * (1 + 0.3 * k), // charged punches reach deeper
        launch: 10 * k,
        heavy: k > 0.55,
      }),
    });
    this.setState('attack', dur * 0.85);
    this.comboIdx++;
    if (k > 0.4) this.world.audio?.play('whooshBig');
    // banked charge lunges the haymaker forward — distance scales with the
    // wind-up just like the damage does
    this._chargeLunge = { delay: dur * 0.08, t: dur * 0.5, speed: (2.5 + 11 * k) * this.scale };
    // the released haymaker steers onto the victim too
    this.trackStrikeVictim(mv.range, dur);
  }

  // ---- charge tell: an additive sheath flickers over whichever limbs are
  // banking power — the wound-up punch arm, both pound arms, the dash legs,
  // aegis' whirling lance. It is a NEAR-MAX warning, not a charging light:
  // nothing shows until ~70% of the cap, then the flicker ramps from a
  // first blink to an urgent strobe as 100% closes in (white-hot at cap).
  // Attacks strobe red; the dash strobes blue. ----
  updateChargeGlow(dt) {
    let key = null, k = 0, dash = false;
    if (this.alive) {
      if (this._punchHold != null && this.intent.lightHeld) {
        k = this._punchHold / PUNCH_HOLD_CAP;
        key = this._punchIdx ? 'armR' : 'armL';
      } else if (this._whirlHold != null && this.intent.heavyHeld) {
        k = this._whirlHold / HEAVY_HOLD_CAP;
        key = this.def.chargeGlow || 'armR';
      } else if (this._dashCharging && this._dashCharge > 0.15) {
        k = this._dashCharge / CHARGE_DASH_MAX;
        key = 'legs';
        dash = true;
      }
    }
    const u = (Math.min(1, k) - 0.7) / 0.3; // 0 at 70% charge, 1 at the cap
    if (!key || u <= 0) {
      if (this._glowShells) this.clearChargeGlow();
      return;
    }
    if (this._glowKey !== key) this.ensureChargeShells(key);
    this._glowPhase = (this._glowPhase || 0) + dt * (5 + 20 * u);
    const on = Math.sin(this._glowPhase * TAU) > -0.35;
    const op = on ? 0.2 + 0.46 * u : 0.03;
    const col = dash ? (k >= 1 ? 0x9fd8ff : 0x2470ff) : (k >= 1 ? 0xff8850 : 0xff2818);
    this._glowMat.opacity = op;
    this._glowMat.color.setHex(col);
    if (this._glowSkinMat) {          // the GLB sheath rides its own clone
      this._glowSkinMat.opacity = op;
      this._glowSkinMat.color.setHex(col);
    }
  }

  ensureChargeShells(key) {
    this.clearChargeGlow();
    if (!this._glowMat) {
      this._glowMat = new THREE.MeshBasicMaterial({
        color: 0xff2818, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
    }
    const joints = CHARGE_GLOW_SETS[key] || [];
    const shells = [];
    for (const jn of joints) {
      const j = this.mech.joints[jn];
      if (!j) continue;
      const meshes = [];
      j.traverse((o) => { if (o.isMesh && !o.userData.chargeShell) meshes.push(o); });
      for (const o of meshes) {
        // a slightly inflated twin of each part, riding the same transform
        const shell = new THREE.Mesh(o.geometry, this._glowMat);
        shell.userData.chargeShell = true;
        shell.scale.setScalar(1.045);
        o.add(shell);
        shells.push(shell);
      }
    }
    // GLB bodies carry NO geometry on the virtual joints — the whole mech is one
    // skinned mesh riding bones — so the traverse above finds nothing and the
    // charge tell simply never appeared on them. Build the sheath out of the
    // skinned mesh instead: the triangles that ride this limb's bone subtree,
    // sharing the mesh's buffers and skeleton. Coincident with the surface rather
    // than inflated (inflating would need its own displaced vertex buffer), so it
    // is pulled toward the camera with polygonOffset and never z-fights.
    if (!shells.length && this.mech.isGLB) {
      const sk = this._glowSkin || (this._glowSkin = (() => {
        let m = null;
        this.mech.group.traverse((o) => {
          if (o.isSkinnedMesh && !m && !o.userData.chargeShell && !/^(fistSocket|boneShell)/.test(o.name || '')) m = o;
        });
        return m;
      })());
      const roots = joints.map((jn) => this.mech.boneMap?.[jn] || this.mech.rigBones?.[jn]).filter(Boolean);
      if (sk && roots.length) {
        if (!this._glowSkinMat) {
          this._glowSkinMat = this._glowMat.clone();
          this._glowSkinMat.polygonOffset = true;
          this._glowSkinMat.polygonOffsetFactor = -2;
          this._glowSkinMat.polygonOffsetUnits = -2;
        }
        // Cached per key and HIDDEN rather than rebuilt on every charge: the
        // shell's geometry shares the body's vertex attributes, so it must never
        // be disposed (that would free the real mesh's GPU buffers), and
        // re-deriving a 17k-triangle index buffer per wind-up is pure garbage.
        this._glbShells = this._glbShells || {};
        let shell = this._glbShells[key];
        if (!shell) {
          shell = buildBoneShell(sk, roots, this._glowSkinMat, 'chargeShellGLB');
          if (shell) {
            shell.userData.chargeShell = true;
            shell.userData.glbShell = true;
            this._glbShells[key] = shell;
          }
        }
        if (shell) { shell.visible = true; shells.push(shell); }
      }
    }
    this._glowShells = shells;
    this._glowKey = key;
    this._glowPhase = 0;
  }

  clearChargeGlow() {
    if (this._glowShells) {
      // the GLB sheath is kept and hidden (see ensureChargeShells); the
      // procedural twins are throwaway and come off the part they ride
      for (const s of this._glowShells) {
        if (s.userData.glbShell) s.visible = false;
        else s.parent?.remove(s);
      }
    }
    this._glowShells = null;
    this._glowKey = null;
  }

  // ---- signature heavy mechanics, driven every frame while the mech's own
  // heavy clip plays: heavySpin (post-pose joint whirl — rotor spear, drill
  // roll, tornado), heavyDrive (forward flight / leaps), heavyFlare
  // (porcupine mane / cloak wing-wall scaling), heavyAura (tornado debris) ----
  updateHeavySignature(dt) {
    const def = this.def;
    // charge-release lunge (held haymaker / pound): after a short beat the
    // release strides forward, farther the longer the power was banked.
    // Lives above the early-out — the hold mechs have no heavy* configs.
    if (this._chargeLunge) {
      const L = this._chargeLunge;
      L.delay -= dt;
      if (L.delay <= 0) {
        L.t -= dt;
        this.vel.x = Math.sin(this.yaw) * L.speed;
        this.vel.z = Math.cos(this.yaw) * L.speed;
      }
      if (L.t <= 0 || this.state !== 'attack') this._chargeLunge = null;
    }
    if (!def.heavySpin && !def.heavyDrive && !def.heavyFlare && !def.heavyAura &&
        !def.heavyRaise) return;
    const act = this.animator.action;
    const playing = !!act && !act.fadingOut && act.clip.name === def.heavyClip;
    const t = playing ? act.t : 0;

    const sp = def.heavySpin;
    if (sp) {
      if (playing && t >= sp.t0 && t <= sp.t1) {
        this._spinAcc = (this._spinAcc || 0) + dt * sp.rate;
      } else if (this._spinAcc) {
        // wind down onto a whole turn so the pose lands where the clip left it
        const snap = Math.round(this._spinAcc / TAU) * TAU;
        this._spinAcc += (snap - this._spinAcc) * Math.min(1, dt * 14);
        if (Math.abs(this._spinAcc - snap) < 0.02) this._spinAcc = playing ? snap : 0;
      }
      if (this._spinAcc) {
        const j = this.mech.joints[sp.joint];
        if (j) j.rotation[sp.axis] += this._spinAcc; // on top of the posed value
      }
    }

    const dr = def.heavyDrive;
    if (dr) {
      // the drive may live on a different clip (e.g. aegis' release lunge)
      const driveClip = dr.clip || def.heavyClip;
      const drivePlaying = !!act && !act.fadingOut && act.clip.name === driveClip;
      const dTime = drivePlaying ? act.t : 0;
      if (drivePlaying && this.state === 'attack' && dTime >= dr.t0 && dTime <= dr.t1) {
        // a banked hold-charge boosts the drive speed too
        const sp = dr.speed * (1 + (dr.kBoost || 0) * (this._heavyLungeK || 0));
        this.vel.x = Math.sin(this.yaw) * sp;
        this.vel.z = Math.cos(this.yaw) * sp;
        if (dr.up && !this._droveUp) {
          this._droveUp = true;
          this.vel.y = dr.up;
          this.grounded = false;
        }
        if (dr.hold) this.vel.y = Math.max(this.vel.y, -2); // skim, don't faceplant
      }
      if (!drivePlaying) this._droveUp = false;
    }

    const fl = def.heavyFlare;
    if (fl) {
      const j = this.mech.joints[fl.joint];
      if (j) {
        let want = 0;
        if (playing) {
          want = clamp((t - fl.t0) / 0.22, 0, 1) * clamp((fl.t1 - t) / 0.16, 0, 1);
          want = clamp(want, 0, 1);
        }
        this._flareK = lerp(this._flareK || 0, want, 1 - Math.exp(-12 * dt));
        j.scale.set(
          1 + (fl.scale[0] - 1) * this._flareK,
          1 + (fl.scale[1] - 1) * this._flareK,
          1 + (fl.scale[2] - 1) * this._flareK
        );
      }
    }

    // heavyRaise: rotate extra (non-humanoid) joints toward a target
    // orientation while the heavy plays — e.g. wraith's cloak wings rolling
    // outward and up. These joints aren't posed by the animator, so we SET
    // rotation from a stored base rather than adding every frame.
    if (def.heavyRaise) {
      for (const r of Array.isArray(def.heavyRaise) ? def.heavyRaise : [def.heavyRaise]) {
        const j = this.mech.joints[r.joint];
        if (!j) continue;
        this._raiseBase ??= {};
        this._raiseBase[r.joint] ??= [j.rotation.x, j.rotation.y, j.rotation.z];
        let want = 0;
        if (playing) {
          want = clamp((t - r.t0) / (r.ramp || 0.3), 0, 1) * clamp((r.t1 - t) / 0.2, 0, 1);
        }
        this._raiseK ??= {};
        const k = lerp(this._raiseK[r.joint] || 0, clamp(want, 0, 1), 1 - Math.exp(-11 * dt));
        this._raiseK[r.joint] = k;
        const b = this._raiseBase[r.joint];
        j.rotation.set(b[0] + r.rot[0] * k, b[1] + r.rot[1] * k, b[2] + r.rot[2] * k);
      }
    }

    // window tracks tempest's heavySpin (0.26-1.07) with a hair either side
    if (def.heavyAura === 'tornado' && playing && t > 0.24 && t < 1.1) {
      // storm debris spiraling up around the spinning frame
      this._auraT = (this._auraT ?? 0) - dt;
      if (this._auraT <= 0) {
        this._auraT = 0.03;
        const fx = this.world.effects;
        const a = rand(TAU), rr = rand(1.2, 3.2) * this.scale;
        const h = rand(0, this.height * 1.3);
        fx.glows.emit(this.pos.x + Math.cos(a) * rr, this.pos.y + h, this.pos.z + Math.sin(a) * rr,
          -Math.sin(a) * rand(8, 14), rand(3, 7), Math.cos(a) * rand(8, 14),
          { life: rand(0.3, 0.55), size: rand(0.5, 1.1), color: 0x3fd8ff, alpha: 0.75, drag: 0.6 });
        fx.smoke.emit(this.pos.x + Math.cos(a) * rr * 1.15, this.pos.y + h * 0.5, this.pos.z + Math.sin(a) * rr * 1.15,
          -Math.sin(a) * rand(6, 10), rand(2, 5), Math.cos(a) * rand(6, 10),
          { life: rand(0.4, 0.8), size: rand(1.2, 2.2), color: 0x9fb8c8, alpha: 0.22, grow: 1.5 });
      }
    }
  }

  // ---- ROCKET FIST (TITANUS): the punching fist detaches and flies as a
  // boomerang projectile; the hand stays hidden until it thunks back on ----
  // The fist LEAVES the body: on a GLB the fist is a cut-out geometry group in
  // the one skinned mesh (fistsplit.js), so hiding that group + showing the dark
  // wrist cap is what opens the socket. Procedural bodies carry the fist as real
  // children of the hand joint, so scaling the joint away still does it there.
  launchFist(side = 'R') {
    if (!this.mech.fistSplit?.detach(side)) this.mech.joints['hand' + side]?.scale.setScalar(0.001);
    (this._fistOut ||= new Set()).add(side);
  }

  // the returning fist is a beat out — square toward it and reach the right
  // arm out open-wristed so the re-dock reads as a deliberate catch
  reachForFist(fistPos, side = 'R') {
    if (!this.alive || !this.canAct()) return;
    const dx = this.world.wrapDelta(fistPos.x - this.pos.x);
    const dz = this.world.wrapDelta(fistPos.z - this.pos.z);
    this.targetYaw = Math.atan2(dx, dz);
    this.animator.play(side === 'L' ? 'fistCatchL' : 'fistCatch');
  }

  catchFist(side = 'R') {
    if (!this._fistOut?.has(side)) return;
    this._fistOut.delete(side);
    // onReturn fires on ANY death of the projectile, not just a clean catch, so
    // this is also the "it expired out there" restore — a fist can never be
    // left missing.
    const split = this.mech.fistSplit;
    if (split) split.attach(side);
    const j = this.mech.joints['hand' + side];
    if (j) {
      if (!split) j.scale.setScalar(1);
      j.getWorldPosition(_v);
      this.world.effects.impactSparks(_v, this.def.colors.glow, 8, 5);
    }
    this.world.audio?.play('servo');
  }

  // ---- thrown-weapon regrow: hide the weapon group, then rebuild it in the
  // grip over half a second (viper's swords, aegis' javelin) ----
  // The thrown weapon's mount. A procedural mech carries it as a virtual rig
  // JOINT (viper's bladeL/bladeR flares, aegis' lance); a GLB on a custom rig
  // carries it as a real skeleton BONE of the same name, hand-placed off the
  // limb it hangs from (rigs/viper.rig.js). Collapsing either takes its whole
  // subtree with it — which is why viper's blade bone owns the entire dagger
  // and its tip bone: scale the mount and the whole weapon goes.
  weaponMount(joint) {
    return this.mech.joints[joint] || this.mech.rigBones?.[joint] || null;
  }

  // How much of that weapon is back: 1 = whole (never thrown, or done
  // re-forging), 0 = just thrown, in between while it re-forges.
  weaponReady(joint) {
    const rg = this._regrow?.find((r) => r.joint === joint);
    return rg ? clamp((rg.t - rg.delay) / REGROW_TIME, 0, 1) : 1;
  }

  // Throw the weapon on `joint`: collapse the mount, then grow it back over
  // the next beat. Regrows are tracked PER JOINT — viper alternates daggers, so
  // she can have the left one in flight while the right is still re-forging,
  // and a single slot would drop the earlier one and strand that blade at
  // scale 0 for the rest of the round. Re-throwing a side just restarts it.
  regrowWeapon(joint, delay = REGROW_DELAY) {
    const j = this.weaponMount(joint);
    if (!j) return;
    j.scale.setScalar(0.001);
    this._regrow = this._regrow || [];
    const rg = this._regrow.find((r) => r.joint === joint);
    if (rg) { rg.t = 0; rg.delay = delay; }
    else this._regrow.push({ joint, t: 0, delay });
  }

  updateRegrow(dt) {
    const list = this._regrow;
    if (!list?.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const rg = list[i];
      rg.t += dt;
      const j = this.weaponMount(rg.joint);
      if (!j) { list.splice(i, 1); continue; }
      const k = clamp((rg.t - rg.delay) / REGROW_TIME, 0, 1);
      j.scale.setScalar(Math.max(0.001, k));
      if (k > 0.05 && Math.random() < 0.5) {
        // re-forging shimmer at the grip
        j.getWorldPosition(_v);
        this.world.effects.glows.emit(_v.x + rand(-0.4, 0.4), _v.y + rand(-0.3, 0.3), _v.z + rand(-0.4, 0.4),
          0, rand(0.5, 2), 0,
          { life: 0.25, size: rand(0.3, 0.7), color: this.def.colors.glow, alpha: 0.9 });
      }
      if (k >= 1) list.splice(i, 1);
    }
  }

  // ================= wall grab =================
  // latch onto a building face at the fist's contact point and hang there —
  // frozen EXACTLY where and how the punch connected (no snap, no turn; the
  // fist may intersect the wall, that's the grip)
  startHang(g) {
    this.hanging = {
      chunk: g.chunk, nx: g.nx, nz: g.nz,
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
    };
    this.vel.set(0, 0, 0);
    this.plunging = false;
    this.hovering = false;
    this.grounded = false;
    this.comboIdx = 0;
    this.setState('normal');
    this.animator.play('hangGrab');
    this.world.audio?.play('servo');
    this.world.effects.dustPuff(_v.set(g.x, g.y, g.z), 4, 0xa8a8a8);
  }

  endHang() {
    this.hanging = null;
    this._hangCoyote = 0.35; // short grace: a jump still fires just after letting go
    this.animator.stop(0.12);
  }

  // ================= damage =================
  // shared tail of every "the guard/shield ate it" path in takeHit: chip
  // damage that is never lethal (floor 1 hp), a reduced push instead of
  // real knockback and the block spark + clank. Callers pick chip/push —
  // (ultFrom is vestigial: the blocked-hit ult drip died with the meter) —
  // the raised guard and AEGIS's passive cover are deliberately not
  // identical (see the call sites).
  _blockAbsorb(chip, ultFrom, dirX, dirZ, dLen, push, sparkPos, sparkColor) {
    this.hp = Math.max(1, this.hp - chip);
    this.vel.x += (dirX / dLen) * push;
    this.vel.z += (dirZ / dLen) * push;
    this.world.effects.blockSpark(sparkPos, sparkColor);
    this.world.audio?.play('block');
  }

  // Odds a blow that just dealt `dmg` turns this mech clean over onto its back
  // rather than merely flooring it. Opt-in per mech (roster `rollover`); see
  // the ROLLOVER_* block for the calibration behind the curve.
  rolloverChance(dmg) {
    if (!this.def.rollover) return 0;
    return clamp((dmg / this.maxHp - ROLLOVER_MIN_FRAC) * ROLLOVER_RATE, 0, ROLLOVER_MAX);
  }

  // RIGHTING ROLL — how a mech gets off its back (see ROLLOVER above). Upside
  // down on the shell there is nothing to push against, so he throws himself
  // over one flank instead, and the PLAYER picks which: whatever direction
  // they're holding when the recovery comes up is the way he goes over. Only
  // the LATERAL half of that press can be honoured — a body rolling about its
  // own facing axis travels sideways and nowhere else — so a straight
  // forward/back press takes him over his right. The clip only turns him; the
  // travel that reads as a roll is driven from the movement block in update().
  startRollUp() {
    const I = this.intent;
    // his right, in world (rig convention: the mech's local +X is its right)
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const side = I.moveX * rx + I.moveZ * rz < 0 ? -1 : 1;
    this._rollUp = { x: rx * side * ROLLOVER_ROLL_DRIVE, z: rz * side * ROLLOVER_ROLL_DRIVE };
    this._onBack = false;
    this._flipT = 0;
    this.iframes = 0.5;
    // the prone loop lies at +180° of roll; rolling LEFT out of it unwinds from
    // -180 instead — same pose, other winding, so re-wind the smoother or it
    // spins him a full turn the wrong way on the handover (Animator.rewrap)
    this.animator.rewrap('hipsRot', 2, side > 0 ? Math.PI : -Math.PI);
    this.setState('getup', this.animator.play(side > 0 ? 'rollUpR' : 'rollUpL') * 0.92);
    this.world.audio?.play('bodyfall');
    this.world.effects.dustPuff(this.pos, 7);
  }

  takeHit(dmg, attacker, { knock = 8, launch = 0, srcPos = null, heavy = false, status = null, silent = false, soft = false, unblockable = false, guardBreak = 0 } = {}) {
    if (!this.alive || this.iframes > 0) return;
    if (attacker && this.isAllyOf(attacker)) return; // no friendly fire on a summon team
    this.uncloak();

    const src = srcPos || (attacker ? attacker.pos : this.pos);
    const dirX = this.pos.x - src.x, dirZ = this.pos.z - src.z;
    const dLen = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;

    // blocking: facing the source & holding block. Two ways an attack still
    // gets through a raised guard:
    //   • a CROUCHING attack slips under a STANDING block (crouch to block
    //     low yourself) — this is the core crouch dynamic
    //   • a guard-BREAKING hit (Saurion's pounce — the move passes its
    //     guardBreak chance) shatters the block outright; his normal
    //     attacks block like anyone else's
    //   • an unblockable hit (certain ults) ignores the guard entirely
    // AIR-ROLL BUBBLE: the somersault's sphere shield blocks from EVERY
    // direction (a tumbling ball has no facing), with the same leak-through
    // as a raised guard. Crouch-under and guard-break are facing tricks, so
    // neither applies; unblockable hits still pass, and the shield drops
    // the instant A is released (the roll's wind-down is unprotected).
    if (this._airRoll && !this._airRoll.ending && !unblockable && this.state !== 'hitstun') {
      const pass = this.def.stats.blockMult ?? BLOCK_LEAK_DEFAULT;
      this._blockAbsorb(dmg * pass, dmg * pass,
        dirX, dirZ, dLen, knock * (0.25 + pass) * 0.5, this.center(), 0x7fd8ff);
      return;
    }

    if (this.blocking && !unblockable && this.state !== 'hitstun') {
      const toSrc = Math.atan2(-dirX, -dirZ);
      if (Math.abs(angleDiff(this.yaw, toSrc)) < GUARD_ARC) {
        const low = !!(attacker && attacker.ducking);       // crouched attack
        const gb = guardBreak;
        const underGuard = low && !this.ducking;            // high block vs low hit
        const shattered = gb > 0 && Math.random() < gb;
        if (!underGuard && !shattered) {
          const pass = this.def.stats.blockMult ?? BLOCK_LEAK_DEFAULT; // fraction that leaks through
          this._blockAbsorb(dmg * pass, dmg * pass,
            dirX, dirZ, dLen, knock * (0.25 + pass) * 0.5, this.center(), 0x7fd8ff);
          return;
        }
        // GUARD BEATEN — the bubble bursts into shards so it is obvious the
        // hit went THROUGH a block rather than around one: full damage, a
        // jolt of extra hitstun, orange spark
        this.world.effects.blockSpark(this.center(), 0xff5a3c);
        this.burstGuardShield();
        this.world.audio?.play(shattered ? 'hitHeavy' : 'hit');
        if (shattered) { knock *= 1.15; heavy = true; }
      }
    }

    // AEGIS passive cover: an attack that arrives THROUGH the tower shield
    // is taken ON the shield — same numbers as a raised guard — even with
    // no block input. Geometric against the shield's LIVE position, so a
    // shield whirled overhead (bulwark bash) stops covering the front, and
    // an attack from the open flank still lands clean.
    if (!unblockable && !this.blocking && this.def.passiveShield &&
        this.state !== 'hitstun' && this.state !== 'launched' &&
        this.state !== 'knockdown' && this.state !== 'frozen' &&
        this.mech.anchors.shield) {
      const S = this.mech.anchors.shield.getWorldPosition(_palmTmp);
      const sx = S.x - this.pos.x, sz = S.z - this.pos.z;
      const sl = Math.hypot(sx, sz);
      // shield held out at body height (not swung skyward), threat within
      // ~60° of the direction the shield is offset toward
      if (sl > 0.35 && S.y > this.pos.y + 0.5 && S.y < this.pos.y + this.height) {
        const dot = (sx / sl) * (-dirX / dLen) + (sz / sl) * (-dirZ / dLen);
        if (dot > 0.5) {
          const pass = this.def.stats.blockMult ?? BLOCK_LEAK_DEFAULT;
          // asymmetries vs a raised guard, kept as tuned: chip is rounded
          // (floor 1), the ult drip counts the FULL incoming dmg, and the
          // push is gentler (no input was spent holding block)
          this._blockAbsorb(Math.max(1, Math.round(dmg * pass)), dmg,
            dirX, dirZ, dLen, knock * 0.3, S, 0x9fd8ff);
          return;
        }
      }
    }

    if (this.status.guard) dmg *= 1 - this.status.guard.f;
    dmg *= 1 - this.def.stats.armor;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.lastAttacker = attacker;

    if (status) this.applyStatus(status);

    this.world.events.emit('damage', { fighter: this, attacker, dmg, pos: this.center() });
    this.world.audio?.play(heavy ? 'hitHeavy' : 'hit');
    this.world.effects.impactSparks(this.center(), 0xffb060, heavy ? 18 : 10, heavy ? 13 : 9);

    if (this.hp <= 0) { this.die(attacker); return; }

    // frozen solid: no knockback and no flinch — the ice holds them in
    // place (whether this very hit froze them or they were already iced),
    // otherwise the next beam tick would knock them straight out of frozen
    if (this.state === 'frozen') return;

    // mid-crash: the corruption holds them rigid — hits rock the frame but
    // never knock them out of the 3s overload window
    if (this.state === 'glitched') {
      this.animator.addImpulse('torso', [rand(-0.3, 0.3), 0, rand(-0.3, 0.3)], 34, 10);
      return;
    }

    // knockback & reactions (weight resists)
    const resist = 1 - this.def.stats.weight * WEIGHT_KNOCK_RESIST;
    const kb = knock * resist;
    this.vel.x += (dirX / dLen) * kb;
    this.vel.z += (dirZ / dLen) * kb;

    if (launch > 0 && this.state !== 'launched') {
      this.vel.y = launch * resist + 4;
      this.grounded = false;
      // ROLLOVER: does this one turn him right over? Rolled at the LAUNCH, so
      // the whole flight is already committed to the landing that follows.
      // Sticky — a light poke while he's stranded bounces him around but can
      // never quietly set him back on his feet.
      this._onBack = this._onBack || Math.random() < this.rolloverChance(dmg);
      this.setState('launched', 3);
      this.animator.play('launched');
    } else if (soft) {
      // rapid-tick chip (flame, cryo beam, gatling, hose, ground fire):
      // the body rocks under the stream but NEVER stun-locks — the target
      // keeps full control so they can break away instead of standing
      // there eating the whole magazine
      if (Math.random() < SOFT_FLINCH_CHANCE) this.animator.addImpulse('torso', [-0.22, 0, 0], 30, 11);
    } else if (this.state !== 'launched' && this.state !== 'knockdown') {
      const stun = heavy ? HITSTUN_HEAVY : HITSTUN_LIGHT;
      this.setState('hitstun', stun);
      this.animator.play('hitFlinch', { speed: heavy ? 0.8 : 1.15 });
      this.animator.addImpulse('torso', [-0.25, 0, 0], 30, 11);
    }
    if (this.isAI === false && navigator.getGamepads) this.world.input?.rumble(this.playerIndex, heavy ? 0.7 : 0.35, heavy ? 220 : 120);
  }

  // waterlogged: dripping frame + half speed while it lasts. The water/ice
  // mechs (FROGGER, GLACIER, CRANKY) live in the stuff — they shrug it off.
  applySoak(t = 2.2) {
    const id = this.def.id;
    if (id === 'frogger' || id === 'glacier' || id === 'cranky') return;
    this.status.soaked = { t: Math.max(t, this.status.soaked?.t || 0) };
  }

  applyStatus(st) {
    if (st.burn) this.status.burn = { dps: st.burn, t: st.burnT || 3 };
    if (st.poison) this.status.poison = { dps: st.poison, t: st.poisonT || 3 };
    if (st.slow) this.status.slow = { f: st.slow, t: st.slowT || 2 };
    if (st.glitch) this.addGlitch(st.glitch);
    if (st.freeze) {
      this.status.frozen = { t: st.freeze };
      this.setState('frozen', st.freeze);
      this.animator.stop(0.05);
      this.world.freezeOverlay?.(this, st.freeze);
    }
  }

  // lerp every body material toward frost-white (w=1 fully iced over);
  // w=0 restores the exact original colors. Emissive does the heavy
  // lifting so even textured panels blank out.
  applyWhiteout(w) {
    if (!this._matBase) {
      this._matBase = [];
      for (const m of Object.values(this.mech.materials)) {
        if (!m || !m.color) continue;
        this._matBase.push({
          m, color: m.color.clone(),
          emissive: m.emissive ? m.emissive.clone() : null,
        });
      }
    }
    for (const b of this._matBase) {
      b.m.color.copy(b.color).lerp(_white, w);
      if (b.emissive) b.m.emissive.copy(b.emissive).lerp(_white, w * 0.85);
    }
  }

  // scorch tint for the flame finisher: lerp every body material toward
  // charred black (k=1 fully carbonized); k=0 restores the originals
  applyCharring(k) {
    if (!this._matBase) this.applyWhiteout(0); // builds the material cache
    this._charK = k;
    for (const b of this._matBase) {
      b.m.color.copy(b.color).lerp(_charBlack, k);
      if (b.emissive) b.m.emissive.copy(b.emissive).multiplyScalar(1 - k * 0.92);
    }
  }

  // POISON: a venom wound biting through the shell — the whole frame flushes
  // red for an instant. Same lerp off the same _matBase cache as the other
  // whole-body tints; w=0 restores the exact originals.
  applyWoundFlash(w) {
    if (w <= 0 && !this._woundTinted) return;
    if (!this._matBase) this.applyWhiteout(0); // builds the material cache
    this._woundTinted = w > 0;
    for (const b of this._matBase) {
      b.m.color.copy(b.color).lerp(_woundRed, w);
      if (b.emissive) b.m.emissive.copy(b.emissive).lerp(_woundRed, w * 0.5);
    }
  }

  // Drop the flush and hand the materials back to whoever else owns them —
  // clearing straight to the base colors would wipe a charred or frozen body
  // for a frame. Corruption repaints itself in updateGlitch.
  clearWoundFlash() {
    if (!this._woundTinted) return;
    this._woundTinted = false;
    if (this._charK > 0) this.applyCharring(this._charK);
    else this.applyWhiteout(this._whiteW || 0);
  }

  // Venom doesn't burn steadily, it BITES: every so often another wound opens.
  // Each one flushes the shell red for a beat and shudders the body, so a
  // poisoned fighter reads as taking repeated hits instead of just standing in
  // a green cloud while their bar drains.
  //
  // Runs POST-POSE (with the other joint FX, before the GLB re-sync) so the
  // flinch lands on top of whatever clip is playing. The tint YIELDS to any
  // stronger whole-body one — frost, charring, corruption all own the same
  // materials, and a fight over them would strobe.
  updatePoisonWounds(dt) {
    const blocked = this._whiteW > 0.001 || this._charK > 0 || this._glitchTinted;
    if (this.status.poison && this.alive && !blocked) {
      this._woundNext = (this._woundNext ?? rand(0.15, 0.5)) - dt;
      if (this._woundNext <= 0) {
        this._woundNext = rand(0.55, 1.05);
        this._wound = { t: 0, dur: 0.26, phase: rand(0, TAU), lean: rand(-1, 1) < 0 ? -1 : 1 };
        // the bite itself: a spurt of venom off the spot it opened
        const c = this.center();
        this.world.effects.glows.emit(
          c.x + rand(-0.5, 0.5) * this.scale, c.y + rand(-0.6, 0.6) * this.scale,
          c.z + rand(-0.5, 0.5) * this.scale, rand(-2, 2), rand(1, 4), rand(-2, 2),
          { life: 0.4, size: 1.5 * this.scale, color: 0x8cff3a, alpha: 0.95, drag: 0.4 });
      }
    } else {
      this._woundNext = null;
    }
    const w = this._wound;
    if (!w) { this.clearWoundFlash(); return; }
    w.t += dt;
    const k = 1 - clamp(w.t / w.dur, 0, 1);
    if (blocked || !this.alive || k <= 0) {
      this._wound = null;
      this.clearWoundFlash();
      return;
    }
    // hard in, fading out, stuttered so it reads as a FLICKER not a fade
    this.applyWoundFlash(0.5 * k * k * (0.72 + 0.28 * Math.sin(w.t * 95)));
    // and a damped shudder through the spine — small, fast, gone
    const s = Math.sin(w.t * 48 + w.phase) * 0.055 * k;
    const J = this.mech.joints;
    if (J.hips) { J.hips.rotation.z += s * w.lean; J.hips.rotation.x += s * 0.55; }
    if (J.torso) { J.torso.rotation.z -= s * 0.8; J.torso.rotation.x += s * 0.45; }
    if (J.head) J.head.rotation.z += s * 0.5;
  }

  // ================= NULLBOT corruption =================
  // lerp every body material toward one hard glitch color (w=0 restores
  // the exact originals) — the whole shell "renders wrong" for a beat
  applyGlitchTint(w, color = 0xff2df2) {
    if (w <= 0 && !this._glitchTinted) return;
    if (!this._matBase) this.applyWhiteout(0); // builds the material cache
    this._glitchTinted = w > 0;
    _glitchTint.setHex(color);
    for (const b of this._matBase) {
      b.m.color.copy(b.color).lerp(_glitchTint, w);
      if (b.emissive) b.m.emissive.copy(b.emissive).lerp(_glitchTint, w * 0.9);
    }
  }

  // a glitched hit landed: another part of this frame turns to broken data.
  // The look is LOCAL — a flickering 2D corruption patch (JPEG macroblocks,
  // RGB-split scanlines, TV static) pinned right where the hit landed, as
  // if the renderer is failing at that spot — plus a slow drip of square
  // data-flecks off the same part. Never a whole-body color flash.
  addGlitch(n = 1) {
    if (!this.alive || this.state === 'glitched') return;
    for (let i = 0; i < n && this.glitchStacks < GLITCH_OVERLOAD; i++) {
      this.glitchStacks++;
      const [jn, y0, y1] = GLITCH_SPOT_JOINTS[(Math.random() * GLITCH_SPOT_JOINTS.length) | 0];
      if (this.mech.joints[jn]) {
        const spot = {
          joint: jn,
          x: rand(-0.35, 0.35) * this.scale,
          y: rand(y0, y1) * this.scale,
          z: rand(-0.25, 0.4) * this.scale,
        };
        this._glitchSpots.push(spot);
        // the rendering-failure patches, pinned to the part for the round —
        // a big primary tear plus a smaller satellite so each hit reads DENSE
        this.world.effects.glitchOn(this, { ...spot, size: 1.5 });
        this.world.effects.glitchOn(this, {
          joint: spot.joint,
          x: spot.x + rand(-0.3, 0.3) * this.scale,
          y: spot.y + rand(-0.3, 0.3) * this.scale,
          z: spot.z,
          size: 1.0,
        });
      }
    }
    // the freshly-corrupted part visibly TEARS
    const s = this._glitchSpots[this._glitchSpots.length - 1];
    if (s && this.mech.joints[s.joint]) {
      _v.set(s.x, s.y, s.z);
      this.mech.joints[s.joint].localToWorld(_v);
      this.world.effects.glitchBurst(_v, 9, 5, 0.8 * this.scale);
    }
    this.world.audio?.play('zap');
    if (this.glitchStacks >= GLITCH_OVERLOAD) this.glitchOverload();
  }

  // 10 stacks: TOTAL CORRUPTION — engulfed head to toe, servos locked and
  // spasming until the crash clears (a free punish window; damage taken is
  // normal). "Engulfed" means corruption patches over EVERY body part,
  // not a color wash.
  glitchOverload() {
    this.setState('glitched', GLITCH_STUN_TIME);
    for (const sizes of [1.9, 1.2]) { // two layers: big tears + fill
      for (const [jn, y0, y1] of GLITCH_SPOT_JOINTS) {
        if (!this.mech.joints[jn]) continue;
        this.world.effects.glitchOn(this, {
          joint: jn,
          x: rand(-0.3, 0.3) * this.scale,
          y: rand(y0, y1) * this.scale,
          z: rand(-0.2, 0.4) * this.scale,
          size: sizes, life: GLITCH_STUN_TIME,
        });
      }
    }
    this.blocking = false;
    this.firing = false;
    this.hovering = false;
    this.plunging = false;
    this._whirlHold = null;
    this._punchHold = null;
    this._aimHold = false;
    this.clearChargeGlow();
    this.vel.x *= 0.15;
    this.vel.z *= 0.15;
    this.animator.stop(0.08);
    const c = this.center();
    this.world.effects.glitchBurst(c, 26, 11, 1.2 * this.scale);
    this.world.effects.rings.spawn(this.pos, { from: 0.6, to: 6.5, dur: 0.45, color: 0xff2df2, y: 0.5 });
    this.world.effects.addShake(0.5);
    this.world.engine.addHitStop(0.08);
    this.world.audio?.play('powerup');
    this.world.audio?.play('zap');
  }

  clearGlitch() {
    this.glitchStacks = 0;
    this._glitchSpots.length = 0;
    this._nullTear = 0;
    this.world.effects.clearGlitchOn(this);
    this.applyGlitchTint(0);
  }

  // per-frame corruption dressing: flecks strobing off every corrupted
  // part, whole-body color tears scaling with how far gone the frame is
  updateGlitch(dt) {
    const engulfed = this.state === 'glitched';
    if (!this.glitchStacks && !engulfed) return;
    const fx = this.world.effects;
    this._glitchFxT = (this._glitchFxT ?? 0) - dt;
    if (this._glitchFxT <= 0) {
      if (engulfed) {
        // whole body: dense corruption shroud
        this._glitchFxT = 0.02;
        for (let i = 0; i < 3; i++) {
          const a = rand(TAU), rr = rand(0.2, 1) * this.hitRadius * 0.85;
          fx.glitchFleck(this.pos.x + Math.cos(a) * rr,
            this.pos.y + rand(0.2, this.height),
            this.pos.z + Math.sin(a) * rr, 1.1 * this.scale);
        }
      } else {
        // each corrupted part keeps flickering where the hit landed
        this._glitchFxT = clamp(0.13 - this.glitchStacks * 0.006, 0.05, 0.13);
        for (let k = 0; k < Math.min(2, this._glitchSpots.length); k++) {
          const s = this._glitchSpots[(Math.random() * this._glitchSpots.length) | 0];
          const j = this.mech.joints[s.joint];
          if (!j) continue;
          _v.set(s.x + rand(-0.12, 0.12), s.y + rand(-0.12, 0.12), s.z);
          j.localToWorld(_v);
          fx.glitchFleck(_v.x, _v.y, _v.z, 0.75 * this.scale);
        }
      }
    }
    // NOTE: deliberately no whole-body material tinting here — corruption
    // must read as LOCAL rendering failure (the patches + flecks above),
    // never as the entire enemy flashing a color.
  }

  // NULLBOT's own ambient corruption: individual parts of his body keep
  // failing to render — wandering 2D static/RGB-noise patches that jump
  // to a new part every couple of seconds, plus stray data-flecks. Local
  // tears only; his shell never flashes as a whole.
  updateNullbotAura(dt) {
    const fx = this.world.effects;
    this._nullFxT = (this._nullFxT ?? 0) - dt;
    if (this._nullFxT <= 0) {
      this._nullFxT = rand(0.06, 0.16);
      const names = ['torso', 'torso', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'kneeL', 'kneeR'];
      const j = this.mech.joints[names[(Math.random() * names.length) | 0]];
      if (j) {
        j.getWorldPosition(_v);
        fx.glitchFleck(_v.x + rand(-0.55, 0.55) * this.scale,
          _v.y + rand(-0.5, 0.5) * this.scale,
          _v.z + rand(-0.45, 0.55) * this.scale, 0.85 * this.scale);
      }
    }
    // wandering rendering-failure patches: each lives a couple of seconds
    // on one body part, dies, and respawns somewhere else
    this._nullPatchT = (this._nullPatchT ?? 0) - dt;
    if (this._nullPatchT <= 0) {
      this._nullPatchT = rand(0.45, 1.1);
      const [jn, y0, y1] = GLITCH_SPOT_JOINTS[(Math.random() * GLITCH_SPOT_JOINTS.length) | 0];
      if (this.mech.joints[jn]) {
        fx.glitchOn(this, {
          joint: jn,
          x: rand(-0.3, 0.3) * this.scale,
          y: rand(y0, y1) * this.scale,
          z: rand(-0.2, 0.4) * this.scale,
          size: 1.15, life: rand(1.4, 2.6),
          // his shell is near-black — decode in his glow channels instead
          colors: [this.def.colors.glow, this.def.colors.glow2 || 0x27f6ff, 0xffffff],
        });
      }
    }
  }

  // Background model loading: replace this fighter's visual (e.g. a
  // procedural stand-in) with a freshly loaded manifest GLB, in place.
  // Gameplay state (hp, position, state machine) is untouched — only the
  // body, joints and animator swap; dims are identical for the same def.
  swapMech(newMech) {
    const old = this.mech;
    this.world.effects.clearGlitchOn?.(this); // patches hold old joint refs
    this.world.scene.remove(old.group);
    old.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
    this.mech = newMech;
    this.group = newMech.group;
    this.group.position.copy(old.group.position);
    this.group.rotation.copy(old.group.rotation);
    this.animator = newMech.premadeAnimator || new Animator(newMech);
    this.world.scene.add(this.group);
  }

  uncloak() {
    if (this.status.cloak) {
      delete this.status.cloak;
      this.setOpacity(1);
    }
  }

  setOpacity(op) {
    this.group.traverse((o) => {
      // …but never what is standing IN for the body. The ice block glacier
      // freezes into is a child of this same group (iceBlock), so fading the
      // mech out to 0 faded the thing replacing it out too and he simply
      // vanished — the same trap as hiding `mech.group`, which IS this group.
      if (o.isMesh && o !== this._ice) {
        o.material.transparent = op < 1;
        o.material.opacity = op;
      }
    });
  }

  die(attacker) {
    this.hp = 0;
    this.alive = false;
    this.clearChargeGlow();
    this.clearGlitch();
    this.endAirRoll();
    this.setState('dead', 999);
    this.blocking = false;
    this.firing = false;
    // a poison wound mid-flush would leave the wreck stuck red: update()
    // early-outs once alive is false, so nothing would clear it
    this._wound = null;
    this.clearWoundFlash();
    this.animator.play('dead');
    this.world.audio?.play('explosionBig');
    const c = this.center();
    this.world.effects.explosion(c, 6, { color: 0xff9040 });
    this.world.effects.addShake(0.9);
    this.world.engine.addHitStop(0.12);
    // secondary pops
    setTimeout(() => { if (this.world.effects) this.world.effects.explosion(this.center(), 3.5, { color: 0xffc060 }); }, 350);
    this.world.events.emit('ko', { fighter: this, attacker });
  }

  // ================= per-frame =================
  update(dt) {
    if (this.cinePuppet) return; // a cinematic finisher owns this body
    // The air roll spins the body about its MIDDLE by nudging the group
    // (see updateAirRoll). That nudge is a VISUAL offset only — peel it off
    // before anything reads or integrates pos, and updateAirRoll re-applies
    // a fresh one after the pose. Physics, collision and combat therefore
    // never see it, and it can never accumulate.
    this.unrollPivot();
    const st = this.def.stats;
    const I = this.intent;
    // CONTROL IMPLIES ANIMATION CONTROL. The round-start intro runs 2.3s but
    // controls come back at 1.6s (match.js unlocks at stateT<=0.9), and the
    // warm-up hands humans their controls the same frame it starts the clip —
    // so for that overlap you could run while the flourish still owned the
    // legs, sliding with no walk cycle. The first real input drops it. Only
    // clips marked `cancelOnMove` (intro, taunt) go; an attack is a
    // commitment and holds.
    if (!this.controlsLocked && this.alive && this.animator.action?.clip.cancelOnMove &&
        !this.animator.action.fadingOut &&
        (Math.abs(I.moveX) > 0.2 || Math.abs(I.moveZ) > 0.2 ||
         I.jump || I.dash || I.light || I.heavy || I.special || I.ult || I.ranged)) {
      this.animator.stop(0.1);
    }
    this.stateT -= dt;
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.rangedCd = Math.max(0, this.rangedCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.ultFlashT = Math.max(0, this.ultFlashT - dt);
    this.comboWindow -= dt;
    this.dashT = Math.max(0, this.dashT - dt);
    if (this.comboWindow <= 0) this.comboIdx = 0;

    // status ticks
    for (const key of Object.keys(this.status)) {
      const s = this.status[key];
      s.t -= dt;
      if (s.t <= 0) {
        if (key === 'cloak') this.setOpacity(1);
        delete this.status[key];
        continue;
      }
      if (key === 'burn') {
        this.hp -= s.dps * dt;
        if (Math.random() < dt * 20) {
          this.world.effects.glows.emit(this.pos.x, this.pos.y + Math.random() * this.height * 0.8, this.pos.z,
            0, 3, 0, { life: 0.4, size: 1.4, color: 0xff7a20, alpha: 0.8 });
        }
        if (this.hp <= 0 && this.alive) this.die(this.lastAttacker);
      } else if (key === 'poison') {
        // VIPER venom: same drain as burn, but the body WEEPS green — motes
        // bead off the frame and drip down instead of flames licking up
        this.hp -= s.dps * dt;
        if (Math.random() < dt * 16) {
          this.world.effects.glows.emit(
            this.pos.x + rand(-0.8, 0.8) * this.scale, this.pos.y + Math.random() * this.height * 0.9,
            this.pos.z + rand(-0.8, 0.8) * this.scale,
            0, rand(-2.5, -0.5), 0, { life: 0.55, size: 1.1, color: 0x6ade2a, alpha: 0.85, drag: 0.5 });
        }
        if (this.hp <= 0 && this.alive) this.die(this.lastAttacker);
      } else if (key === 'soaked') {
        // waterlogged: beads sheet off the whole frame and rain down,
        // pooling underfoot — the visible tell for the half-speed debuff
        if (Math.random() < dt * 26) {
          this.world.effects.drops.emit(
            this.pos.x + rand(-0.9, 0.9) * this.scale, this.pos.y + Math.random() * this.height,
            this.pos.z + rand(-0.9, 0.9) * this.scale,
            rand(-0.6, 0.6), rand(-2, -0.2), rand(-0.6, 0.6),
            { life: rand(0.4, 0.7), size: rand(0.5, 1.0), color: 0xd8ecf8, color2: 0x5580a8,
              alpha: 0.9, gravity: 24, fadeIn: 0.03 });
        }
        if (this.grounded && Math.random() < dt * 1.6) {
          this.world.effects.puddle(this.pos, { size: rand(1.4, 2.2), life: 1.5 });
        }
      }
    }

    // frost white-out: the whole body blanks to white while the cryo beam
    // is ON them (_beamWhiteT is re-armed by every beam tick) or while
    // frozen solid (ult), then the colors thaw straight back in
    if (this._beamWhiteT > 0) this._beamWhiteT -= dt;
    const wantWhite = this.state === 'frozen' || this._beamWhiteT > 0 ? 1 : 0;
    if (wantWhite || this._whiteW > 0.001) {
      this._whiteW = wantWhite
        ? Math.min(1, (this._whiteW || 0) + dt * 12)
        : Math.max(0, (this._whiteW || 0) - dt * 4);
      this.applyWhiteout(this._whiteW);
    }

    if (!this.alive) {
      this.applyPhysics(dt, 0, 0);
      this.animator.update(dt, { speed: 0, grounded: this.grounded, dead: true });
      // GLB: rest the collapsed body flat on the ground (see groundClamp)
      this.mech.groundClamp?.(this.grounded);
      return;
    }

    if (this.state === 'frozen') {
      if (this.stateT <= 0) this.setState('normal');
      this.applyPhysics(dt, 0, 0);
      return; // no animator update: frozen solid
    }

    // ---- TOTAL CORRUPTION: engulfed in glitch, servos locked, spasming.
    // The crash runs its full 3s, then every stack clears at once ----
    if (this.state === 'glitched') {
      if (this.stateT <= 0) {
        this.clearGlitch();
        this.world.effects.rings.spawn(this.pos, { from: 4.5, to: 0.5, dur: 0.35, color: 0x27f6ff, y: 0.6 });
        this.setState('normal');
      } else {
        this._spasmT = (this._spasmT ?? 0) - dt;
        if (this._spasmT <= 0) {
          this._spasmT = rand(0.05, 0.16);
          const SPASM = ['torso', 'head', 'shoulderL', 'shoulderR', 'thighL', 'thighR'];
          this.animator.addImpulse(SPASM[(Math.random() * SPASM.length) | 0],
            [rand(-0.3, 0.3), rand(-0.25, 0.25), rand(-0.3, 0.3)], 42, 10);
        }
        this.applyPhysics(dt, 0, 0);
        this.updateGlitch(dt);
        this.animator.update(dt, { speed: 0, grounded: this.grounded });
        this.group.rotation.y = this.yaw;
        return;
      }
    }

    // ---- state timers / transitions ----
    switch (this.state) {
      case 'attack':
      case 'special':
      case 'ult':
      case 'dash':
        if (this.stateT <= 0) {
          // A move whose clip LOOPS never ends itself, so the move's state
          // running out is the only thing that can end it. Without this the
          // action layer keeps playing forever: VIPER's Blade Cyclone
          // (viperWhirl — loop + upper-body) left her arms locked out level
          // like rotor blades for the rest of the round while the legs walked
          // normally underneath, and glacier's special did the same with
          // shootLoopL. A one-shot clip is unaffected: it has already ended
          // and faded on its own by the time its state expires.
          // ('channel' does the same thing below, for the same reason.)
          //
          // A HELD CLIP IS EXACTLY AS STUCK AS A LOOPING ONE. `hold: true`
          // pins the action at its last frame instead of fading it out, so it
          // outlives its move by the same forever — and if it keys the LEGS,
          // the locomotion layer has nothing left to drive and the mech slides
          // around in a frozen pose. Measured on tritone after a cannon volley
          // (tritoneBrace is a held brace that keys hips, thighs, knees and
          // ankles): 44 units of walking with 0.000 rad of knee swing, which
          // is the "he stopped animating and floats" report exactly.
          const stuck = this.animator.action?.clip;
          if (stuck?.loop || stuck?.hold) this.animator.stop(0.15);
          this.setState('normal');
        }
        break;
      case 'channel':
        if (this.stateT <= 0 && !I.ranged) {
          this.firing = false;
          this.animator.stop();
          this.setState('normal');
        }
        break;
      case 'hitstun':
        if (this.stateT <= 0) this.setState('normal');
        break;
      case 'launched':
        if (this.grounded) {
          if (this._onBack) {
            // ROLLOVER: he doesn't sit down, he goes over. Longer on the floor
            // than a normal knockdown — a stranded shell is a real penalty.
            this._flipT = this.animator.play('flipOver');
            this.setState('knockdown', ROLLOVER_DOWN_TIME);
            this.world.effects.addShake(0.5);
          } else {
            this.setState('knockdown', 0.75);
            this.animator.play('knockdown');
          }
          this.world.effects.dustPuff(this.pos, 10);
          this.world.audio?.play('bodyfall');
        }
        break;
      case 'knockdown':
        // ROLLOVER: hand the one-shot flip over to the prone loop the moment
        // it settles. fade 0 — the loop's t=0 IS the flip's last key, and a
        // cross-fade would dip the body back toward standing through the
        // handover (same rule as the charge holds, see updatePunchHold).
        if (this._flipT > 0) {
          this._flipT -= dt;
          if (this._flipT <= 0) this.animator.play('proneBack', { fade: 0 });
        }
        // on his back there is no spring to make and no getup to rush: the
        // stick and the jump button both go to the righting roll instead
        if (this._onBack) {
          if (I.jump || this.stateT <= 0) this.startRollUp();
          break;
        }
        // escape jump: mash jump while downed to spring clear instead of
        // eating the same knockdown loop again
        if (I.jump) {
          const ex = Math.abs(I.moveX) + Math.abs(I.moveZ) > 0.2
            ? _v.set(I.moveX, 0, I.moveZ).normalize()
            : _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); // default: backward
          this.vel.x = ex.x * this.def.stats.speed * ESCAPE_JUMP_MULT;
          this.vel.z = ex.z * this.def.stats.speed * ESCAPE_JUMP_MULT;
          this.vel.y = ESCAPE_JUMP_VY;
          this.grounded = false;
          this.iframes = 0.9;
          this.setState('getup', 0.3);
          this.animator.play('getup', { speed: 2.4 });
          this.world.audio?.play('jump');
          this.world.effects.dustPuff(this.pos, 8);
          this.world.effects.rings.spawn(this.pos, { from: 0.5, to: 4, dur: 0.35, color: PLAYER_COLORS[this.playerIndex % 4], y: 0.3 });
          break;
        }
        if (this.stateT <= 0) {
          this.setState('getup', this.animator.play('getup') * 0.9);
          this.iframes = 0.5;
        }
        break;
      case 'getup':
        if (this.stateT <= 0) { this._rollUp = null; this.setState('normal'); }
        break;
    }

    // ---- wall hang: pinned to a building face by a held airborne punch.
    // Release drops, jump springs off the wall (punch-hold again mid-air to
    // grab higher — that's the climb loop), losing the wall knocks you off.
    if (this.hanging) {
      const h = this.hanging;
      if ((h.chunk && !h.chunk.alive) || this.state !== 'normal') {
        this.endHang();
      } else if (I.jump) {
        this.endHang();
        this.vel.y = this.def.stats.jump * JUMP_MULT;
        this.vel.x = h.nx * 4;
        this.vel.z = h.nz * 4;
        this.grounded = false;
        this.world.audio?.play('jump');
        this.world.effects.dustPuff(this.pos, 5);
      } else if (!I.lightHeld) {
        this.endHang();
      } else {
        this.pos.set(h.x, h.y, h.z);
        this.vel.set(0, 0, 0);
        this.grounded = false;
        this.animator.update(dt, { speed: 0, grounded: true, vy: 0 });
        return;
      }
    }

    // ---- carried: hoisted overhead by a grab-and-throw. Pinned every
    // FRAME (schedule-tick pinning let gravity sag between ticks = jiggle)
    // and the rise itself is a smoothstep, not a teleport ----
    if (this._carry) {
      const c = this._carry;
      const carrier = c.by;
      c.t -= dt;
      if (!this.alive || !carrier.alive || carrier.state !== 'special' || c.t <= 0) {
        this._carry = null; // thrown (the special clears us) or lift broken
      } else {
        // snap INTO the hands fast (0.12s), then ride the palms' own sweep
        // up — the liftHold arm swing IS the lift trajectory, so body and
        // hands stay in constant contact the whole way
        c.riseT = Math.min(1, (c.riseT || 0) + dt / 0.12);
        const k = c.riseT * c.riseT * (3 - 2 * c.riseT); // smoothstep grip
        const tp = carrier.carryPoint(this, _carryTmp);
        carrier._palmPrey = this; // carrier's post-pose palm press hooks on
        this.pos.x = c.x0 + (tp.x - c.x0) * k;
        this.pos.y = c.y0 + (tp.y - c.y0) * k;
        this.pos.z = c.z0 + (tp.z - c.z0) * k;
        this.vel.set(0, 0, 0);
        this.grounded = false;
        // rolled flat ACROSS the press: a Z-roll under the carrier's yaw
        // lays the body along the carrier's left<->right line whatever way
        // they face — head off one hand, legs off the other
        this.yaw = this.targetYaw = carrier.yaw;
        this.group.rotation.y = carrier.yaw;
        this.group.rotation.x += (0 - this.group.rotation.x) * Math.min(1, dt * 10);
        // ...or, for a HEAD GRIP (konga), rolled all the way over: held by the
        // skull, feet at the sky. `roll` is the carry's own, so the flat
        // body-slam (1.45) and the inversion (pi) are the same mechanism.
        const roll = c.roll ?? 1.45;
        this.group.rotation.z += (roll * k - this.group.rotation.z) * Math.min(1, dt * 10);
        this.animator.update(dt, { speed: 0, grounded: false, vy: 0 });
        return;
      }
    }

    // ---- aerial plunge: heavy smash rides down to the ground ----
    if (this.plunging) {
      if (!this.alive || this.state !== 'attack') {
        this.plunging = false;
      } else if (this.grounded) {
        this.plunging = false;
        const mv = this.def.moves.heavy;
        const fall = Math.abs(this._plungeVy);
        const dmg = mv.dmg * (1 + Math.min(0.9, fall * 0.02)) * this.dmgMult();
        this.world.groundShockwave(this, this.pos, mv.range * this.scale * 1.6, dmg, mv.knock, 0xffc060);
        this.world.effects.addShake(0.7);
        this.world.engine.addHitStop(0.08);
        this.world.audio?.play('slam');
        this.animator.play('groundPound', { speed: 2.2 });
        this.setState('attack', 0.35);
      } else {
        this.vel.y -= 55 * dt;          // slam acceleration
        this._plungeVy = this.vel.y;    // captured before landing zeroes it
      }
    }

    // ---- intents ----
    const acting = this.canAct();
    // Blocking works airborne/hovering too — and now runs on the STAMINA
    // tank rather than being free and unlimited. An empty tank drops the
    // guard and holding LT can't raise it again until some has refilled, so
    // a turtle has to breathe.
    this.blocking = acting && I.block && (this.sprintEnergy > 0 || this.blocking);
    if (this.blocking) {
      this.sprintEnergy = Math.max(0, this.sprintEnergy - BLOCK_DRAIN * dt);
      if (this.sprintEnergy <= 0) this.blocking = false;
    }
    // AN AIR GUARD IS A TUCK: press LT while AIRBORNE and the mech curls into
    // the somersault ball (spinning if it's small enough — see startAirRoll)
    // behind the all-around bubble, paid for by the same stamina drain any
    // held guard costs; the tank running dry opens the tuck like a release.
    // The PRESS has to happen in the air — a guard held from the ground into
    // a jump keeps the plain standing block, so a turtle who jumps doesn't
    // eat the tuck's prone-landing risk without asking for it. This is the
    // ONLY way into the ball: A no longer tucks on the way down, so nobody
    // curls up by accident while mashing the jets.
    if (this.blocking && !this.grounded && !this.hovering && !this._airRoll && !this.climb &&
        this.state === 'normal' && I.block && !this._blockPrev) {
      this.startAirRoll();
    }
    this._blockPrev = !!I.block;

    // ---- B button, two personalities by whether you're moving ----
    // STANDING STILL + hold: crouch and wind up a dash coil (up to
    // CHARGE_DASH_MAX seconds' worth); the INSTANT a direction comes in the
    // coil fires a charged dash that way, and if B stays down the hold
    // flows straight into a sprint.
    // ALREADY MOVING + press: a short dash, then holding B is SPRINT —
    // faster run that drains the sprint tank. Tank empty ends the sprint;
    // release B to refill.
    const bHeld = !!I.chargeDash && this.alive && !this.blocking && this.grounded &&
      (this.state === 'normal' || this.state === 'attack');
    const bEdge = !!I.chargeDash && !this._chargePrev;
    const stickHeld = Math.hypot(I.moveX, I.moveZ) > 0.25;
    this._dashCharging = bHeld && !stickHeld && !this._sprintHold;
    this._chargeStill = this._dashCharging;
    if (this._dashCharging) {
      const was = this._dashCharge || 0;
      this._dashCharge = Math.min(CHARGE_DASH_MAX, was + dt);
      // wind-up tells: rings pulse quicker and wider as the coil tightens,
      // and a flash marks the moment the charge tops out
      this._chargeFxT = (this._chargeFxT ?? 0) - dt;
      const k = this._dashCharge / CHARGE_DASH_MAX;
      if (this._chargeFxT <= 0) {
        this._chargeFxT = 0.5 - 0.3 * k;
        this.world.effects.rings.spawn(this.pos, {
          from: 3.5, to: 1 + (1 - k) * 1.5, dur: 0.28,
          color: PLAYER_COLORS[this.playerIndex % 4], y: 0.3,
        });
      }
      if (was < CHARGE_DASH_MAX && this._dashCharge >= CHARGE_DASH_MAX) {
        this.world.audio?.play('powerup');
        this.world.effects.rings.spawn(this.pos, { from: 0.5, to: 4.5, dur: 0.35, color: 0xffffff, y: 0.4 });
      }
    }
    if (bHeld && stickHeld && (this._dashCharge || 0) > 0) {
      // the standing coil fires the moment a direction is pushed
      const charge = this._dashCharge;
      this._dashCharge = 0;
      this.doDash(charge);
      this._sprintHold = true;
    } else if (bEdge && bHeld && stickHeld) {
      // pressed B while on the move: small dash, hold carries into sprint
      this.doDash(0);
      this._sprintHold = true;
    }
    if (!I.chargeDash && this._chargePrev) {
      // release: a still-banked coil dashes along the held direction
      // (classic release-dash), otherwise it just cancels; any sprint ends
      const charge = this._dashCharge || 0;
      this._dashCharge = 0;
      this._sprintHold = false;
      if (charge > 0 && stickHeld && this.alive &&
          (this.state === 'normal' || this.state === 'attack' || this.state === 'channel')) {
        this.doDash(charge);
      }
    }
    this._chargePrev = !!I.chargeDash;

    // ---- sprint tank ----
    this.sprinting = this._sprintHold && bHeld && stickHeld && this.sprintEnergy > 0 &&
      (this.state === 'normal' || this.state === 'dash');
    if (this.sprinting) {
      this.sprintEnergy = Math.max(0, this.sprintEnergy - dt * SPRINT_DRAIN);
      if (this.sprintEnergy <= 0) this._sprintHold = false; // winded — re-press once it refills
    } else if (!this._sprintHold && !this.blocking) {
      // the tank only refills with the guard DOWN and the sprint released
      this.sprintEnergy = Math.min(this.sprintEnergyMax, this.sprintEnergy + dt * SPRINT_REGEN);
    }

    // ---- duck: hold to crouch. Ducking PERSISTS through an attack (so a
    // held-duck strike lands LOW and slips under a standing block); only
    // jumping/airborne or blocking pops you back up ----
    if (this._hangCoyote > 0) this._hangCoyote -= dt;
    const wantDuck = (I.duck || this._chargeStill) && this.grounded && !this.blocking &&
      (this.state === 'normal' || this.state === 'channel' || this.state === 'attack');
    this.duckT = clamp01(this.duckT + (wantDuck ? dt / 0.13 : -dt / 0.11));

    // ---- spring-loaded jump (JERRY): slam into a deep crouch first, then
    // launch — the wind-up is the tell, the leap is enormous ----
    if (this._jumpCharge) {
      this._jumpCharge -= dt;
      this.duckT = Math.min(1, this.duckT + dt / 0.06);
      if (this._jumpCharge <= 0) {
        this._jumpCharge = 0;
        if (this.grounded && this.alive) {
          this.vel.y = st.jump * JUMP_MULT * (this.status.buff ? 1.1 : 1);
          this.grounded = false;
          this.world.audio?.play('jump');
          this.world.effects.dustPuff(this.pos, 10);
          this.world.effects.rings.spawn(this.pos, { from: 0.6, to: 4.5, dur: 0.35, color: 0xff6a40, y: 0.3 });
        }
      }
    }

    this.ducking = this.duckT > 0.4;
    const dk = this.duckT * this.duckDepth;
    this.height = this.baseHeight * (1 - 0.42 * dk);
    this.hitRadius = this.baseHitRadius * (1 - 0.22 * dk);

    if (acting && !this.blocking) {
      if (I.ult && (this.ult >= 1 || this.ultCheat())) this.doUlt();
      else if (I.special) this.doSpecial();
      else if (I.light) {
        if (this.state === 'attack') this.queuedLight = true;
        else this.doLight();
      } else if (I.heavy) this.doHeavy();
      else if (I.dash) this.doDash();
      else if (I.ranged) this.doRanged();
      else if (I.taunt && this.state === 'normal') {
        this.setState('attack', this.animator.play('taunt') * 0.9);
      }
      if (I.jump && this.grounded && this.state === 'normal') {
        if (st.jumpWindup) {
          // spring-loader: crouch first, launch when the wind-up expires
          if (!this._jumpCharge) this._jumpCharge = st.jumpWindup;
        } else {
          this.vel.y = st.jump * JUMP_MULT * (this.status.buff ? 1.1 : 1);
          this.grounded = false;
          this.world.audio?.play('jump');
          this.world.effects.dustPuff(this.pos, 6);
        }
      } else if (I.jump && this.climb) {
        // ON A WALL, A is the way OFF it (climb.js springs him clear) — never
        // the jets, never the tuck
      } else if (I.jump && !this.grounded && this._hangCoyote > 0 && this.state === 'normal') {
        // just let go of a wall: for a beat, a jump still fires in mid-air —
        // that's the release-then-jump climbing rhythm
        this._hangCoyote = 0;
        this.vel.y = st.jump * JUMP_MULT * (this.status.buff ? 1.1 : 1);
        this.world.audio?.play('jump');
      } else if (I.jump && !this.grounded && !this.hovering && !this._airRoll &&
                 this.hoverFuel > 0.2) {
        // second jump press in the air ignites the hover jets (never out of
        // the tuck — release the ball first, then the jets answer)
        this.hovering = true;
        this.world.audio?.play('jump');
      }
      // (A used to have a FOURTH meaning down here — tank empty and falling,
      // press again to tuck into the descent ball. It is gone: one button
      // that jumped, double-jumped, ignited the jets AND balled up meant the
      // ball arrived by accident every time a flight ran dry. The tuck is
      // BLOCK's now, in the air, and only ever on purpose.)
    } else if (this.state === 'attack' && this.queuedLight && this.stateT < 0.14) {
      // combo chain
      this.queuedLight = false;
      if (this.comboIdx > 0 && this.comboIdx < 3) this.doLight();
    } else if (this.state === 'channel') {
      // keep channel while held (and while there's ammo for it)
      if (I.ranged && !(this.ammoMax !== undefined && this.ammo <= 0)) {
        this.stateT = 0.1;
        this.firing = true;
        if (this.rangedCd <= 0) {
          this.rangedCd = this.def.moves.ranged.cooldown;
          if (this.ammoMax !== undefined) this.ammo--;
          if (this._lockAim) this._aimPoint = this._lockAim.clone();
          this.channelTick(this.def.moves.ranged);
        }
        this.faceAim();
      }
    }
    if (this.state === 'normal') this.queuedLight = false;

    // ---- hover jets ----
    if (this.hovering) {
      // attacks don't cut the jets — punch, shoot and block mid-flight
      // (the aerial plunge is the exception: it's a controlled fall)
      const wantHover = I.jumpHeld && this.hoverFuel > 0 && !this.grounded && !this.plunging &&
        (this.state === 'normal' || this.state === 'channel' || this.state === 'attack');
      if (wantHover) {
        this.hoverFuel = Math.max(0, this.hoverFuel - dt);
        // thrust counters gravity and climbs toward the mech's rise cap
        this.vel.y = Math.min(this.vel.y + (GRAVITY + 26) * dt, this.hoverRise);
        this.jetT -= dt;
        if (this.jetT <= 0) {
          this.jetT = 0.04;
          this.boosterJets();
        }
      } else {
        this.hovering = false;
      }
    }
    if (this.grounded) {
      this.hovering = false;
      this.hoverFuel = Math.min(this.hoverFuelMax, this.hoverFuel + dt * 0.9);
    }

    // block anim — but never over the air roll's ball tuck: an LT-held
    // somersault keeps `blocking` true (that's what drains the tank and
    // full-sphere-guards the takeHit), and the tuck owns the body.
    if (this.blocking && !this._airRoll && !this.animator.isPlaying('block')) this.animator.play('block');
    else if (!this.blocking && !this._airRoll && this.animator.isPlaying('block')) this.animator.stop(0.1);

    // ---- landing (see the landReach/land clips): when a real fall is about
    // to end — under half a second from the pavement, nothing else claiming
    // the body — stretch the legs long to REACH for it; applyPhysics plays
    // 'land' at the touchdown itself, whose t=0 is this exact held pose, so
    // the stretch compresses into the crouch with no seam. The recovery
    // yields immediately to anything the player would rather do: steering,
    // jumping or leaving the ground fades it out mid-crouch.
    const reaching = !this.grounded && !this.hovering && !this._airRoll && !this.climb &&
      !this.plunging && this.state === 'normal' && this.vel.y < -3;
    if (reaching && this.pos.y < -this.vel.y * 0.4 && !this.animator.action) {
      this.animator.play('landReach');
    } else if (!reaching && this.animator.isPlaying('landReach')) {
      this.animator.stop(0.12);
    }
    if (this.animator.isPlaying('land') &&
        (!this.grounded || Math.hypot(I.moveX, I.moveZ) > 0.3)) {
      this.animator.stop(0.09);
    }

    // ---- movement ----
    let ax = 0, az = 0;
    // basic light/heavy keep locomotion (jab clips are upper-body, and running
    // momentum feeds the kinetic-impact model); holds, specials, ults, ranged
    // and blocking still root you, and charging a dash just winds slower
    // A raised guard no longer ROOTS you: you may walk while blocking, at
    // half pace (applyPhysics' BLOCK_MOVE_MULT), so a guard is a fighting
    // stance you can carry rather than a decision to stand still.
    const canMove = this.state === 'normal' || this.state === 'channel' ||
      (this.state === 'attack' && this._moveAttack) ||
      (this.state === 'ult' && this._ultMove);
    if (canMove) {
      ax = I.moveX; az = I.moveZ;
      const len = Math.hypot(ax, az);
      if (len > 1) { ax /= len; az /= len; }
      if (this.lockTarget) {
        // target lock owns the facing (set below) — movement strafes
      } else if (I.strafe && I.aimYaw !== undefined) {
        // strafe lock: face where the camera points, glide sideways
        this.targetYaw = I.aimYaw;
      } else if (len > 0.15 && this.state !== 'channel') {
        this.targetYaw = Math.atan2(ax, az);
      }
    } else if (this._rollUp && this.state === 'getup') {
      // RIGHTING ROLL: he isn't steering — the roll CARRIES him. Drive the
      // body over the flank he committed to for the length of the clip, so he
      // travels out from under whoever floored him (see startRollUp).
      ax = this._rollUp.x; az = this._rollUp.z;
    }

    // ---- target lock (pad LB, held): square up on the locked enemy and
    // stay squared — every sideways step becomes a natural strafe, and the
    // camera (camera.js) swings to keep the target in frame ----
    if (I.lockOn && this.alive) {
      if (!this.lockTarget || !this.lockTarget.alive) this.lockTarget = this.nearestEnemy();
      if (this.lockTarget) {
        this.targetYaw = this.yawTo(this.lockTarget);
        // lock reticle: a pulse in this player's color under the target
        this._lockFxT = (this._lockFxT ?? 0) - dt;
        if (this._lockFxT <= 0 && !this.isAI) {
          this._lockFxT = 0.55;
          this.world.effects.rings.spawn(this.lockTarget.pos, {
            from: 3.4, to: 2.2, dur: 0.5,
            color: PLAYER_COLORS[this.playerIndex % 4], y: 0.35,
          });
        }
      }
    } else {
      this.lockTarget = null;
    }
    // ---- SURFACE WALKING (combat/climb.js). A mech with a `climb` block walks
    // on the world, not the floor: the field of everything near his feet gives
    // him an up, his stick is rotated by the same amount, and walking at a wall
    // becomes walking up it. It owns movement only while he is genuinely on a
    // surface that is not flat ground — on the flat it hands him straight back
    // to applyPhysics, so every ordinary behaviour is untouched.
    let climbing = false;
    if (this.def.climb) {
      const mv = this._climbMv || (this._climbMv = { x: 0, z: 0 });
      mv.x = ax; mv.z = az;
      climbing = climbStep(this, dt, mv);
    }
    if (climbing) climbPhysics(this);
    else {
      this.applyPhysics(dt, ax, az);
      if (this.def.climb) climbReleaseTick(this);
    }

    // dash trail (sprint leaves a sparser one — moving fast, not blinking)
    if (this.dashT > 0) {
      this.world.effects.dashTrail(this.pos, PLAYER_COLORS[this.playerIndex % 4], this.scale);
    } else if (this.sprinting) {
      this._sprintFxT = (this._sprintFxT ?? 0) - dt;
      if (this._sprintFxT <= 0) {
        this._sprintFxT = 0.11;
        this.world.effects.dashTrail(this.pos, PLAYER_COLORS[this.playerIndex % 4], this.scale);
      }
    }

    // ---- animation ----
    const spd = Math.hypot(this.vel.x, this.vel.z);
    const maxSpd = this.moveSpeed() * (this.sprinting ? SPRINT_MULT : 1);
    // STRANDED ON HIS BACK (see ROLLOVER): the body is going nowhere, but the
    // LEGS still answer the stick — feed the input itself in as speed and the
    // locomotion layer runs its stride, so he scuttles uselessly at the sky.
    // The prone clip keys no leg joint precisely so the walk cycle owns them.
    const proneScuttle = this._onBack && this.state === 'knockdown'
      ? Math.min(1, Math.hypot(I.moveX, I.moveZ)) * maxSpd : 0;
    this.animator.update(dt, {
      // `canMove` is about INPUT, not motion: a rooted state means the player
      // isn't steering, and zeroing the speed there is what keeps a planted
      // attack from running on the spot. But a CHARGE (rhino's bull rush)
      // drives the body forward under its own power while rooted — reporting 0
      // there made him skate across the arena with dead legs. Feed the real
      // speed while charging so the locomotion layer runs its speed-matched
      // stride under him; the charge clip owns the upper body (it keys torso,
      // head, hips and both arms), so only the LEGS come from the run.
      // ON A WALL the locomotion layer is handed the climb's own pace and told
      // the mech is grounded, because it IS: the body frame has been damped
      // onto the surface (climb.js), so the ordinary walk cycle running in that
      // frame is the climb. Nothing else in the animator knows a wall from a
      // floor.
      speed: this.climb ? this._climbSpeed || 0
        : canMove || this._charging ? spd : proneScuttle,
      maxSpeed: maxSpd,
      // WHICH WAY HE IS ACTUALLY GOING, as an angle off his facing. In target
      // lock the two come apart — he strafes and back-pedals with his chest on
      // the enemy — and the animator turns the hips (and reverses the cycle) off
      // this. Zero while surface-walking: the walk cycle IS the climb there, in
      // a body frame that has nothing to do with the arena's.
      drift: !this.climb && spd > 0.4
        ? angleDiff(this.yaw, Math.atan2(this.vel.x, this.vel.z)) : 0,
      grounded: this.grounded || this.climb,
      vy: this.vel.y,
      dashT: this.dashT,
      // WHICH WAY THE BODY IS POINTED, in world radians. Almost nothing in the
      // animator wants this — a pose is authored in the body's own frame and
      // is the same pose whichever way he happens to be facing. A SIGNATURE
      // that drives a stabilized MOUNT does: "level, and pointed where he is
      // pointed" is a statement about the world, and cannot be said in joint
      // space (KONGA's shoulder racks — signatures.js).
      yaw: this.yaw,
      // the combat state verbatim ('attack' | 'hitstun' | 'special' | ...).
      // The face layer (mechs/face.js) reads it to flinch on a hit and to
      // bellow through a special — expression is a reaction to what the body
      // is DOING, and only the fighter knows that.
      state: this.state,
      firing: this.firing,
      hovering: this.hovering,
      duck: dk,
      charging: this._charging,
      // dash tells (animator draws the crouch + lunge from these):
      //   dashCoil — standing B-hold winding the coil, 0..1 by how wound
      //   dashP    — progress THROUGH a dash burst, 0 at launch → 1 at rest
      // dashT alone can't shape a gather-then-extend pose: it only counts
      // down, so the animator can't tell the launch from the recovery.
      dashCoil: this._dashCharging ? Math.max(0.14, (this._dashCharge || 0) / CHARGE_DASH_MAX) : 0,
      dashP: this.dashT > 0 && this._dashDur ? 1 - this.dashT / this._dashDur : 1,
    });
    // GLB: while downed/rising, floor-clamp the prone body so it neither
    // floats nor sinks (the shared clip's hips-drop is tuned to procedural
    // bodies); a no-op for upright states and procedural mechs.
    this.mech.groundClamp?.(
      this.grounded && (this.state === 'knockdown' || this.state === 'getup'));
    // hull-mounted turrets traverse AFTER the pose is applied — they are the
    // one part of the body the animation does not own (see cannonaim.js)
    this.updateCannons(dt);
    // ...and a front-heavy body keeps itself out of the floor here too, for
    // the same reason: it is a correction to the finished pose, not part of it.
    // NOT while the prone clamp owns the body, though — groundClamp and the
    // guard write the SAME render offset, so both running is the two of them
    // overwriting each other frame by frame (measured: knockdown went from
    // 0.3 units under to 7.6, i.e. the clamp's work thrown away every frame).
    const proneClamped = this.grounded &&
      (this.state === 'knockdown' || this.state === 'getup');
    if (this.def.floorGuard && this.grounded && !proneClamped) {
      floorGuard(this, dt, this.pos.y);
    } else if (this._floorLift) {
      clearFloorGuard(this);
    }
    // palm press / strike tracking must land after the pose is applied
    // (direct joint writes before applyPose get clobbered)
    if (this._palmPrey) {
      // one-hand giant lift: no two-hand squeeze — the palm IS the platform
      if (!this._oneArmLift) this.clampPalmsTo(this._palmPrey);
      this._palmPrey = null;
    } else if (this._strikeAim) {
      const sa = this._strikeAim;
      sa.t -= dt;
      if (sa.t <= 0 || !sa.f.alive || this.state !== 'attack') {
        this._strikeAim = null;
      } else {
        this.aimStrikeAt(sa.f);
      }
    } else if (this._palmFix || this._aimYaw || this._aimPitch) {
      // UNWIND, don't snap. Zeroing the banked clamp/twist the instant the strike
      // window closed teleported the arms back onto the clip pose in a single
      // frame, which read as a second, unmotivated pull-back at the end of every
      // heavy. Ease both out instead (and only APPLY the roll here — servoing it
      // would grow it again while we are trying to let it go).
      this._palmFix = (this._palmFix || 0) * 0.72;
      this._aimYaw = (this._aimYaw || 0) * 0.72;
      if (this._palmFix < 1e-3) this._palmFix = 0;
      if (Math.abs(this._aimYaw) < 1e-4) this._aimYaw = 0;
      if (this._aimYaw && this.mech.joints.torso) this.mech.joints.torso.rotation.y += this._aimYaw;
      this.unwindPitch();
      this.applyPalmRoll();
    }
    // ...a held CHANNEL keeps it up, and so does a turret volley still
    // traversing onto its solution (the brace/frill tell reads this).
    if (this.state !== 'channel' && !this._volley) this.firing = false;

    // ---- face target yaw: servo-damped, two-tier ----
    // Legs (the whole group) chase the stick with a lag that grows with
    // ground speed — a sprinting mech carves an arc instead of pivoting on
    // a dime — while the torso leads the turn at a quicker rate, so the
    // upper body looks INTO the new heading a beat before the legs carry
    // it there. Rates are kept high: this is flavor lag, not sluggishness.
    const runK = clamp01(spd / this.moveSpeed());
    this.yaw = angleDamp(this.yaw, this.targetYaw, lerp(13, 7, runK), dt);
    this.torsoYaw = angleDamp(this.torsoYaw, this.targetYaw, lerp(18, 12, runK), dt);
    this.group.rotation.y = this.yaw;
    // …and for a CLIMBER the whole frame is damped between the ground and the
    // wall instead (climb.js owns the quaternion outright, and keeps running
    // after he lets go until the body has rolled back upright).
    if (this.def.climb) applyClimbOrientation(this);
    // twist = how far the torso leads the legs, folded into the pose the
    // animator just applied (clamped so the waist never looks snapped), and
    // faded out by the same ramped lock the strike servo uses
    const twist = clamp(angleDiff(this.yaw, this.torsoYaw), -0.6, 0.6)
      * (1 - this.updateTwistLock(dt));
    const J = this.mech.joints;
    if (J.torso) J.torso.rotation.y += twist;
    // `rigidShell` (GLB): head/mouth/torso are one carapace, so the head must
    // not lead the turn — that extra 0.35 twist is the one thing that still
    // rotated it against the shell (the animator holds it at rest, this ran
    // after). The torso twist above carries the whole shell instead.
    if (J.head && !(this.def.rigidShell && this.mech.isGLB)) J.head.rotation.y += twist * 0.35;

    // ---- hold-to-charge heavy (whirl banking power until release) ----
    if (this._whirlHold != null) this.updateHeavyHold(dt);
    if (this._punchHold != null) this.updatePunchHold(dt);
    this.updateChargeGlow(dt);
    // ---- LB lock-aim: while target lock is held, a light crosshair drifts
    // onto the locked enemy (the HUD projects _lockAim into this player's
    // view — fast camera swings and target dashes pull it off the body for
    // a beat until it catches up) and any ranged attack fired during the
    // lock flies at the crosshair's world point, height included ----
    if (this.intent.lockOn && this.lockTarget?.alive && !this.isAI && this.alive) {
      const T = this.lockTarget;
      // aim at the HEAD, not the midsection — headshots feel like aiming
      const ty = T.pos.y + T.height * 0.88;
      const tx = this.pos.x + this.world.wrapDelta(T.pos.x - this.pos.x);
      const tz = this.pos.z + this.world.wrapDelta(T.pos.z - this.pos.z);
      if (!this._lockAim) this._lockAim = new THREE.Vector3(tx, ty, tz);
      else {
        const r = 1 - Math.exp(-9 * dt);
        this._lockAim.x += (tx - this._lockAim.x) * r;
        this._lockAim.y += (ty - this._lockAim.y) * r;
        this._lockAim.z += (tz - this._lockAim.z) * r;
      }
    } else {
      this._lockAim = null;
    }
    // ---- signature heavy mechanics (post-pose joint spins, drives, flares) ----
    this.updateHeavySignature(dt);
    // ---- generic special FX: scripted joint whirls / grows (bulwark bash) ----
    this.updateSpecialFx(dt);
    // ---- air somersault: post-pose hips tumble (see startAirRoll) ----
    this.updateAirRoll(dt);
    // ---- guard bubble: air-roll sphere or the block's forward arc ----
    this.updateGuardShield(dt);
    // ---- thrown weapons re-forging in the grip ----
    this.updateRegrow(dt);
    // ---- poison bites: red flush + a flinch each time a wound opens ----
    this.updatePoisonWounds(dt);
    // GLB rigs: everything above (heavy spins, palm clamps, scripted whirls)
    // wrote to the VIRTUAL joints — but the adapter already synced the bones
    // inside animator.update(), so those writes never reached the model
    // (procedural mechs show their joints directly; GLB heavies didn't spin).
    // Re-sync once so post-pose joint motion lands on the skin too.
    // ---- the climbing carriage, before that re-sync (it is a POSE, so it goes
    // on the virtual joints and rides the retarget like any other) ----
    if (this._climbTilt > 0.01) applyClimbPose(this);
    if (this.mech.isGLB) this.mech.postAnimate?.();
    // ---- …and the hands and feet onto the surface they are crossing, AFTER
    // it: that one is a CONTACT, solved on the bones a rigged model renders,
    // and re-syncing over it would throw it away ----
    if (this.def.climb) conformClimbLimbs(this, dt);
    // ---- weapon trails: glowing streaks ride the blade/spear tips while a
    // one-shot attack clip swings, so cuts and thrusts read as EDGES ----
    if (this.def.bladeTrail) this.updateBladeTrail(dt);
    // NOVA: the staff apex crackles while the halo burns — brighter and
    // bigger the closer the crescents are to apex alignment
    if (this.def.id === 'nova' && this.alive) this.updateNovaAura(dt);
    // NULLBOT: ambient corruption flickering over his own frame
    if (this.def.id === 'nullbot' && this.alive) this.updateNullbotAura(dt);
    // INFERNO: his shoulder chimneys BURN — flickering flames and a smoke
    // trail where the model used to carry two sculpted tongues of fire
    if (this.def.stackFx && this.alive) this.updateStackFlames(dt);
    // NULLBOT: his taunt breaks the RENDER up, not the pose
    if (this.def.holoTaunt) this.holoTaunt(dt);
    // …and three more taunts that are effects rather than poses. Each one is
    // driven off the clip NAME and releases the moment it stops playing, which
    // is what makes "a hit interrupts it" free: a hit swaps the taunt for the
    // flinch clip (see takeHit), so the next frame these simply undo.
    if (this.def.arcTaunt) this.arcTaunt(dt);
    if (this.def.tauntGrow) this.growTaunt(dt);
    if (this.def.tauntIce) this.iceTaunt(dt);
    // corruption stacks keep flickering on whoever carries them
    this.updateGlitch(dt);
  }

  // ---- HOLOGRAM BREAK-UP (roster `holoTaunt` — NULLBOT) -------------------
  //
  // What flickers is the MATERIAL, not the pose, which is why this is here and
  // not in the clip: a keyframe can jitter a limb (and his taunt clip does),
  // but nothing in a pose can make the body stop being drawn.
  //
  // IT IS A STUTTER, NOT A FADE. A smooth pulse reads as a power-down; a bad
  // connection is a signal that is either there or it isn't, for an
  // unpredictable length of time. So each dropout picks its own duration and
  // its own depth, and the visible half is snapped back to fully solid rather
  // than eased — the ugliness is the point. Every dropout coughs a little
  // visual noise off the frame and a buzz, throttled so a long taunt is not a
  // wall of sound.
  holoTaunt(dt) {
    const act = this.animator?.action;
    const on = this.alive && act && !act.fadingOut && act.clip.name === 'taunt';
    if (!on) {
      if (this._holoOn) { this._holoOn = false; this.setOpacity(1); }
      return;
    }
    this._holoOn = true;
    this._holoT = (this._holoT ?? 0) - dt;
    if (this._holoT > 0) return;
    // GONE MEANS GONE. It used to drop to 0.1-0.32, a ghost you could still
    // read, which is a signal DEGRADING; a lost packet is a signal ABSENT. The
    // body goes fully to 0 and comes fully back, and the only thing on screen
    // in between is the static that tore off him on the way out.
    const gone = Math.random() < 0.45;
    this._holoT = gone ? rand(0.04, 0.13) : rand(0.05, 0.19);
    this.setOpacity(gone ? 0 : 1);
    if (!gone) return;
    const fx = this.world.effects;
    if (fx?.glows) {
      // STATIC, not a sprinkle: a dozen flecks scattered through the volume he
      // just vacated, so the shape is still faintly legible as noise for the
      // frame or two he is missing
      for (let i = 0; i < 12; i++) {
        fx.glows.emit(
          this.pos.x + rand(-1.1, 1.1) * this.scale,
          this.pos.y + Math.random() * this.height,
          this.pos.z + rand(-1.1, 1.1) * this.scale,
          rand(-2.5, 2.5), rand(-1.5, 3), rand(-2.5, 2.5),
          { life: rand(0.05, 0.17), size: rand(0.35, 1.5) * this.scale,
            color: Math.random() < 0.5 ? 0x8a2be2 : 0x22e0d0, alpha: 0.9, grow: -1.4 });
      }
      // …and a flat scan-line band across him, the tear a dropped frame leaves
      const y = this.pos.y + Math.random() * this.height;
      for (let i = 0; i < 7; i++) {
        fx.glows.emit(this.pos.x + rand(-1.5, 1.5) * this.scale, y,
          this.pos.z + rand(-1.5, 1.5) * this.scale, 0, 0, 0,
          { life: rand(0.04, 0.1), size: rand(0.8, 1.9) * this.scale,
            color: 0xd8f4ff, alpha: 0.55, grow: -2 });
      }
    }
    this._holoBuzz = (this._holoBuzz ?? 0) - 1;
    if (this._holoBuzz <= 0) { this._holoBuzz = 2; this.world.audio?.play('neonZap'); }
  }

  // Is the taunt clip actually playing right now? Every taunt EFFECT below
  // hangs off this and nothing else, which is the whole interrupt story: a hit
  // plays hitFlinch over the top, this goes false, and each effect unwinds on
  // its own next frame. No hit hook, no cancel list to keep in step.
  taunting() {
    const act = this.animator?.action;
    return !!(this.alive && act && !act.fadingOut && act.clip.name === 'taunt');
  }

  // ---- STATIC CRAWL (roster `arcTaunt` — TEMPEST) -------------------------
  //
  // Arcs jumping between the hot points on his own body: the two shoulder
  // stacks, the crest on his head, the crystal in his abdomen and both wrist
  // bands. Each arc picks a random PAIR, so what you see is the charge finding
  // a different path every time rather than a fixed light show — about fifteen
  // of them across the clip.
  //
  // The endpoints are resolved every spawn, not cached: the arms are moving
  // through this, and an arc drawn to where a wrist was is an arc hanging in
  // the air beside him.
  arcTaunt(dt) {
    if (!this.taunting()) { this._arcT = 0; return; }
    const fx = this.world.effects;
    if (!fx?.lightning) return;
    const nodes = this.def.arcTaunt.nodes || [];
    if (nodes.length < 2) return;
    this._arcT = (this._arcT ?? 0) - dt;
    if (this._arcT > 0) return;
    this._arcT = rand(0.09, 0.18);
    this.group.updateWorldMatrix(true, true);
    let i = (Math.random() * nodes.length) | 0;
    let j = (Math.random() * (nodes.length - 1)) | 0;
    if (j >= i) j++;                          // a distinct second point
    const a = this.arcNode(nodes[i], _arcA), b = this.arcNode(nodes[j], _arcB);
    if (!a || !b) return;
    const col = this.def.arcTaunt.color ?? 0x8fd8ff;
    fx.lightning.spawn(a, b, { color: col, dur: rand(0.09, 0.2),
      jag: rand(0.25, 0.6) * this.scale, thick: rand(0.04, 0.08) * this.scale });
    fx.glows.emit(b.x, b.y, b.z, 0, 0, 0,
      { life: 0.14, size: rand(0.6, 1.2) * this.scale, color: col, alpha: 0.7, grow: -1 });
    if (Math.random() < 0.4) this.world.audio?.play('zap');
  }

  // One arc endpoint: `{a:'stackL'}` is an anchor, `{j:'handR'}` a joint or
  // bone, and `up` lifts it along the mech's own scale (the crest sits above
  // the head bone, the crystal below the torso one).
  arcNode(spec, out) {
    const node = spec.a ? this.mech.anchors?.[spec.a]
      : (this.mech.boneMap?.[spec.j] || this.mech.joints?.[spec.j]);
    if (!node) return null;
    node.getWorldPosition(out);
    if (spec.up) out.y += spec.up * this.scale;
    return out;
  }

  // ---- LOOMING (roster `tauntGrow` — WRAITH) ------------------------------
  //
  // He simply gets bigger while he taunts, and small again after. Same levers
  // colossus' COLOSSAL FORM pulls (specials.js): the render group, the combat
  // radius/height that go with it, and — the one that is easy to forget —
  // Animator.sizeMul, without which the walk keeps its small-body cadence and
  // the feet skate at the new size.
  //
  // The BASE values are captured on the first frame of the first taunt rather
  // than at construction: a mech may already be scaled by something else, and
  // capturing then means the ramp always returns to whatever it grew from.
  growTaunt(dt) {
    const want = this.taunting() ? 1 : 0;
    const k = this._growK ?? 0;
    if (k === 0 && want === 0) return;
    // in over ~0.45s, out over ~0.3s — a loom should arrive slower than it goes
    const rate = want > k ? 2.2 : 3.4;
    const nk = clamp01(k + (want - k) * Math.min(1, dt * rate * 2));
    this._growK = Math.abs(nk - want) < 0.002 ? want : nk;
    if (!this._growBase) {
      this._growBase = { s: this.scale, h: this.baseHeight, hr: this.baseHitRadius, r: this.radius,
        g: this.group.scale.x };
    }
    const B = this._growBase;
    const g = 1 + (this.def.tauntGrow - 1) * this._growK;
    this.group.scale.setScalar(B.g * g);
    this.scale = B.s * g;
    this.baseHeight = B.h * g;
    this.baseHitRadius = B.hr * g;
    this.radius = B.r * g;
    if (this.animator) this.animator.sizeMul = g;
    if (this._growK === 0) { this._growBase = null; if (this.animator) this.animator.sizeMul = 1; }
  }

  // ---- SOLID ICE (roster `tauntIce` — GLACIER) ----------------------------
  //
  // He freezes into a single block his own size, and CROSS-FADES both ways: the
  // body dissolves out as the ice comes up, with frost thickening around him
  // the whole time, and on the way back the swap is quick and the frost arrives
  // all at once. A hard swap read as a substitution — one frame a mech, the
  // next a box — and the mist is what sells it as the ice taking him.
  //
  // The two directions are deliberately NOT the same length. Freezing is
  // something he does (ICE_IN, slow enough to watch, and it starts a beat in so
  // the clip can pull his limbs against his body first); thawing is something
  // that happens to him, including when a fist arrives — so it is a snap.
  //
  // The block is a child of his group, so it rides his position; his POSE is
  // still running underneath it, unseen, which is why the clip holds him folded
  // rather than letting him unwind inside the ice.
  iceTaunt(dt) {
    const on = this.taunting();
    const act = this.animator?.action;
    let k = this._iceK ?? 0;
    if (on) {
      // starts as he settles, and is FULLY solid well before he has to hold it
      const ICE_IN = 0.55, ICE_DELAY = 0.38;
      k = clamp01(((act.t || 0) - ICE_DELAY) / ICE_IN);
      if (k > 0 && !this._iceOn) { this._iceOn = true; this.world.audio?.play('freeze'); }
    } else if (k > 0) {
      // IT DOES NOT MELT, IT GOES. One frame there, next frame a cloud of frost
      // where it was — a fade out would read as the ice becoming thin, and this
      // is ice being replaced by a mech, which is instantaneous or it is nothing.
      k = 0;
      if (this._iceOn) {
        this._iceOn = false;
        for (let i = 0; i < 46; i++) this.frostPuff(2.2);
        this.world.effects?.rings?.spawn(this.pos, { from: 0.5, to: 7 * this.scale, dur: 0.4, color: 0xbfe8ff, y: 0.4 });
        this.world.audio?.play('shatter');
      }
    }
    if (k === (this._iceK ?? 0) && k === 0) return;
    this._iceK = k;
    const ice = k > 0 ? this.iceBlock() : this._ice;
    if (ice) {
      ice.visible = k > 0.02;
      // SOLID once it has him: 0.96 at the top, not the 0.72 it fades through —
      // a block you can still read a mech through is a mech behind glass, and
      // what he turns into is a block of ice. The shimmer rides on top so a
      // settled block still lives.
      this._iceT = (this._iceT ?? 0) + dt;
      ice.material.opacity = Math.min(1, k * k * (0.96 + 0.04 * Math.sin(this._iceT * 5.3)));
    }
    // the BODY dissolves out under it. setOpacity(1) also clears `transparent`,
    // so the mech ends up exactly as it started rather than left in the
    // transparent queue for the rest of the round.
    // the BODY dissolves out AHEAD of the ice arriving (gone by k=0.8), so there
    // is no window where a solid-looking block still has a mech showing through
    this.setOpacity(k <= 0 ? 1 : Math.max(0, 1 - k / 0.8));
    // frost THICKENS as it takes him, rather than arriving in one puff
    if (k > 0 && k < 1) {
      this._frostAcc = (this._frostAcc ?? 0) + dt * (4 + 26 * k);
      while (this._frostAcc >= 1) { this._frostAcc -= 1; this.frostPuff(0.5 + k); }
    } else this._frostAcc = 0;
    if (k >= 1 && Math.random() < dt * 6) this.frostPuff(0.5);
  }

  // The prism itself, built once, at the moment he first freezes.
  //
  // MEASURED OFF THE GEOMETRY, not off his stats: `baseHeight` is the body's
  // gameplay height and it is not what you can SEE — glacier's mesh is 8.9 tall
  // and 7.2 wide against a baseHeight of 7.1, so a block cut to the stat left
  // his head and his shoulder lance poking out of the lid, which is exactly the
  // part of a frozen mech a viewer checks.
  //
  // TWO THINGS MAKE THE MEASUREMENT HONEST. Only MESHES are unioned — Box3's own
  // setFromObject would be near enough here, but a fighter's group also carries
  // anchors, markers and effect helpers, and it does not skip invisible ones.
  // And the yaw is dropped first: Box3 is world-axis-aligned, so a mech standing
  // at 45 degrees measures half again too wide and its centre lands off to one
  // side. Taken at FREEZE time, so it is the folded pose the clip has pulled him
  // into rather than a stance he is not in.
  iceBlock() {
    if (this._ice) return this._ice;
    const q = this.group.quaternion.clone();
    this.group.quaternion.identity();
    this.group.updateWorldMatrix(false, true);
    _iceBox.makeEmpty();
    this.group.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.visible || o === this._ice) return;
      if (!o.geometry?.boundingBox) o.geometry?.computeBoundingBox?.();
      if (!o.geometry?.boundingBox) return;
      _iceB2.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      _iceBox.union(_iceB2);
    });
    this.group.quaternion.copy(q);
    this.group.updateWorldMatrix(false, true);
    _iceBox.getSize(_iceSize);
    _iceBox.getCenter(_iceMid);
    const M = 1.06;                                  // a little ice around him
    const h = Math.max(_iceSize.y, this.baseHeight) * M;
    const w = Math.max(_iceSize.x, this.baseHitRadius * 1.6) * M;
    const d = Math.max(_iceSize.z, this.baseHitRadius * 1.4) * M;
    const geo = new THREE.BoxGeometry(w, h, d);
    // A PLAIN transparent standard material, deliberately: MeshPhysicalMaterial's
    // `transmission` is the physically-right way to write glass and it renders
    // through a separate pass this scene does not run — the first version was
    // correct and completely invisible, a mech that simply vanished.
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8ec6e2, roughness: 0.12, metalness: 0.1,
      transparent: true, opacity: 0.62, emissive: 0x1b4d6b, emissiveIntensity: 0.45,
    });
    const m = new THREE.Mesh(geo, mat);
    // the group's origin is at his feet; the block sits on the floor under
    // whatever part of him the measurement centred on
    m.position.set(_iceMid.x - this.pos.x, h / 2, _iceMid.z - this.pos.z);
    m.castShadow = true;
    // NOTE it hangs off the fighter's group, which IS `mech.group` (aliased in
    // the constructor) — so the body can never be hidden by switching that
    // group off, because that would take the block with it. The cross-fade
    // above works on OPACITY for exactly this reason.
    this.group.add(m);
    this._ice = m;
    return m;
  }

  frostPuff(power) {
    const fx = this.world.effects;
    if (!fx) return;
    const h = this.baseHeight;
    _arcA.set(this.pos.x + rand(-1, 1) * this.scale,
      this.pos.y + Math.random() * h * 0.9,
      this.pos.z + rand(-1, 1) * this.scale);
    fx.steamVent(_arcA, { x: rand(-0.5, 0.5), y: rand(0.2, 1) * power, z: rand(-0.5, 0.5) });
  }

  // ---- BOOSTER FLAME (the hover jets' exhaust) ----------------------------
  // The fire comes out of ANCHORS, not out of a point under the mech: every
  // build carries `boostL`/`boostR` at the soles (factory.js / gltf.js), and
  // ANY anchor whose name starts with `boost` is a nozzle — so a mech that
  // wants four of them, or wants them on its back, adds `boostBack` (etc.) to
  // its manifest `muzzles` block and the flame follows with no code here.
  // WHICH WAY IT BURNS is the same rule a muzzle's barrel follows: an anchor
  // with an AUTHORED rotation (`userData.aimRot`, set by the manifest's `rot`)
  // exhausts along its own +Z, so a nozzle can be aimed as well as placed in
  // the workbench. With no rot it thrusts straight DOWN THE BODY — the mech's
  // own -Y, not the world's, so a tilted flight still reads as thrust under
  // him. That default is what makes the anchors usable without authoring
  // angles: an ankle bone's local axes rotate with the step, so "+Z out of the
  // sole" standing still is pointing off sideways two frames later.
  boosterJets() {
    const anchors = this.mech?.anchors;
    if (!anchors) return;
    if (!this._boostAnchors) {
      this._boostAnchors = Object.keys(anchors)
        .filter((n) => n.startsWith('boost') && anchors[n]?.isObject3D)
        .map((n) => anchors[n]);
    }
    if (!this._boostAnchors.length) return;
    const fx = this.world.effects;
    const down = _boostDir.set(0, -1, 0).applyQuaternion(this.group.getWorldQuaternion(_boostQ));
    for (const a of this._boostAnchors) {
      a.getWorldPosition(_v);
      if (a.userData.aimRot) a.getWorldDirection(_v2); else _v2.copy(down);
      fx.booster(_v, _v2, this.scale);
    }
  }


  // ================= air somersault =================
  // The mech curls into the TIGHT BALL (the 'ball' clip — knees to chest,
  // spine curled, arms hugging the shins; per-body-type via def.ballPose)
  // and, if it's small enough, the whole body spins about the BALL'S OWN
  // CENTRE (rollPivot, post-pose, so it rides on both model routes — it used
  // to spin the hips joint, which pivoted half the roster around its ankles).
  // LARGE bots — weight over TUNING.airRoll.tuckOnlyWeight, or a roster
  // def flagged `tuckOnly` — only TUCK: same ball, same bubble, no
  // cartwheeling.
  // A subtle sphere shield bubbles around them and every hit is taken as a
  // block — from any direction, since a tumbling ball has no facing.
  // ONE way in: LT pressed airborne. Stamina drains like any held guard (see
  // the intents block) and an empty tank opens the tuck. (A used to buy a
  // free one on the way down with the jets spent; that made the ball an
  // accident of the flight button, so it went.)
  // Release BLOCK and the roll finishes its current turn at speed,
  // lands the pose back exactly where the clip left it, and the guard drops
  // for that wind-down (the risk half of the trade). Still tucked at
  // touchdown? He hits the dirt PRONE.
  startAirRoll() {
    this._airRoll = { t: 0, spin: 0, ending: false, endAt: 0 };
    this.animator.play('ball'); // the tuck: curled tight around the hips
    this.world.audio?.play('whoosh');
  }

  endAirRoll() {
    if (!this._airRoll) return;
    this._airRoll = null;
    this.unrollPivot();
    this.group.rotation.x = 0;
    this.group.rotation.order = 'XYZ';
    if (this.animator.isPlaying('ball')) this.animator.stop(0.15);
  }

  // TUMBLE ABOUT THE MIDDLE. The roll used to spin the HIPS joint, which
  // pivots the body about wherever that bone happens to sit — near the
  // waist on some rigs, down by the feet on others, so half the roster
  // cartwheeled around its own ankles instead of balling up and rolling.
  //
  // Rotating the whole GROUP is rig-independent, but the group's origin is
  // at the feet, so a bare group rotation pivots there too. The body is
  // therefore rotated AND slid by exactly the amount that holds its
  // mid-height point still: offset = C - R*C, with C the centre in body
  // space. Whatever the rig, the mech curls up and spins around the middle
  // of that ball.
  //
  // (Joint-space compensation is not an option: the GLB rig adapter carries
  // only VERTICAL hips translation onto the bones, and this needs a
  // horizontal component too.)
  rollPivot(spin) {
    const r = this._airRoll;
    // yaw first, then pitch about the body's own left-right axis — the
    // default XYZ order would pitch about the WORLD x and the tumble would
    // wobble with facing
    this.group.rotation.order = 'YXZ';
    this.group.rotation.x = spin;
    this.group.rotation.y = this.yaw;
    // Where the ball's middle actually IS, measured on this rig in this
    // pose. Half the STANDING height is the wrong answer once the tuck has
    // folded the legs up: the mass moves upward, and pivoting at the old
    // waist line left the head swinging on a long arm. Tracked live (and
    // eased) so the pivot follows the curl as it blends in.
    const m = this.tuckCentre();
    r.pivotY = r.pivotY === undefined ? m : r.pivotY + (m - r.pivotY) * 0.25;
    const c = r.pivotY;
    _v.set(0, c, 0).applyEuler(this.group.rotation);
    this._rollOffset = _v.set(-_v.x, c - _v.y, -_v.z).clone();
    this.pos.add(this._rollOffset);
  }

  // Mid-height of the curled body, in BODY space (the group's rotation is
  // divided back out, so it reads the same on any frame of the tumble).
  // Head and lead foot bracket the ball; their midpoint is what it spins
  // about. Falls back to half the standing height on a rig missing either.
  tuckCentre() {
    const bones = this.mech.boneMap || null;
    const node = (n) => (bones && bones[n]) || this.mech.joints?.[n] || null;
    const head = node('head');
    const foot = node('ankleL') || node('footL') || node('ankleR') || node('footR');
    if (!head || !foot) return this.height * 0.5;
    _rollQ.copy(this.group.quaternion).invert();
    _rollBase.copy(this.pos);
    if (this._rollOffset) _rollBase.sub(this._rollOffset);
    const localY = (j) => j.getWorldPosition(_rollTmp).sub(_rollBase).applyQuaternion(_rollQ).y;
    return clamp((localY(head) + localY(foot)) * 0.5, this.height * 0.25, this.height * 0.85);
  }

  unrollPivot() {
    if (!this._rollOffset) return;
    this.pos.sub(this._rollOffset);
    this._rollOffset = null;
  }

  // CAMERA-STABLE position. `pos` is the group's own position, so for the
  // rendered frame it necessarily carries the roll's centre-holding slide —
  // which means pos itself ORBITS the ball's centre at the spin rate
  // (~6 turns/s). A camera that frames pos inherits that orbit as jitter its
  // own damping can't fully swallow. This returns the un-slid base, which
  // physics integrates and which falls perfectly smoothly through the whole
  // tumble; outside a roll it is exactly pos. Written into `out` so the
  // camera's scratch vectors stay allocation-free.
  focusPos(out) {
    out.copy(this.pos);
    if (this._rollOffset) out.sub(this._rollOffset);
    return out;
  }

  // ================= guard bubble =================
  // One shared sphere shield, worn by BOTH guards:
  //   • the air somersault covers every angle (a tumbling ball has no front)
  //   • a standing block covers only the arc it actually defends, and fades
  //     to nothing behind — the exposed back is visibly exposed, which is
  //     the same ±1.5 rad takeHit tests, drawn
  // `cover` is the cosine of the half-arc: -1 shows the whole sphere, 0.07
  // is the block's own arc. Parented to the fighter's group, so local +Z is
  // wherever the body faces and the shader needs no per-frame uniform for it.
  guardShield() {
    // a mech rebuild (colossal form) discards the group the bubble hung on
    if (this._shield && this._shield.parent !== this.group) this._shield = null;
    if (!this._shield) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uCover: { value: -1 }, uAlpha: { value: 0.13 },
          uColor: { value: new THREE.Color(0x7fd8ff) },
        },
        vertexShader: `
          varying vec3 vLocal;
          varying vec3 vView;
          void main() {
            vLocal = normalize(position);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform float uCover; uniform float uAlpha; uniform vec3 uColor;
          varying vec3 vLocal;
          varying vec3 vView;
          void main() {
            // coverage: 1 dead ahead, feathered out to nothing past the arc
            float cov = smoothstep(uCover - 0.30, uCover + 0.28, vLocal.z);
            // rim light: the silhouette edge reads as a surface, the middle
            // stays glassy enough to see the mech through it
            float rim = pow(1.0 - abs(dot(normalize(vView), vLocal)), 2.0);
            float a = uAlpha * cov * (0.35 + 1.5 * rim);
            if (a < 0.002) discard;
            gl_FragColor = vec4(uColor, a);
          }`,
      });
      this._shield = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
      this._shield.visible = false;
      this.group.add(this._shield);
    }
    return this._shield;
  }

  // Size and show the bubble for this frame. cover: -1 for the full sphere,
  // or the cosine of the guard arc. Called from updateGuardShield only.
  showGuardShield(cover, pulse) {
    const s = this.guardShield();
    s.visible = true;
    const R = this.height * 0.62;
    s.scale.setScalar(R * (1 + 0.035 * Math.sin(pulse * 9)));
    s.position.set(0, this.height * 0.52, 0);
    s.material.uniforms.uCover.value = cover;
    s.material.uniforms.uAlpha.value = 0.13 + 0.035 * Math.sin(pulse * 7);
  }

  hideGuardShield() { if (this._shield) this._shield.visible = false; }

  // The bubble follows whichever guard is actually up, every frame — the air
  // roll's full sphere wins over a standing block if somehow both are on.
  updateGuardShield(dt) {
    this._guardT = (this._guardT || 0) + dt;
    if (this._airRoll && !this._airRoll.ending) this.showGuardShield(-1.05, this._guardT);
    else if (this.blocking && this.alive) this.showGuardShield(BLOCK_ARC_COS, this._guardT);
    else this.hideGuardShield();
  }

  // GUARD BROKEN: the bubble bursts. Called from takeHit whenever something
  // beat the guard that the guard was nominally covering (a crouching attack
  // slipping under, a guard-breaking pounce), so the player can see WHY the
  // damage went through instead of only that it did.
  burstGuardShield() {
    const fx = this.world.effects;
    const c = this.center();
    const R = this.height * 0.62;
    fx.rings.spawn(this.pos, { from: R * 0.6, to: R * 2.6, dur: 0.34, color: 0xff7a4c, y: this.height * 0.5 });
    // shards flung off the sphere's own surface, not a puff at the middle
    for (let i = 0; i < 22; i++) {
      const a = rand(TAU), z = rand(-1, 1), rr = Math.sqrt(Math.max(0, 1 - z * z));
      const nx = Math.cos(a) * rr, ny = z, nz = Math.sin(a) * rr;
      fx.glows.emit(c.x + nx * R, c.y + ny * R * 0.9, c.z + nz * R,
        nx * 11, ny * 11 + 2, nz * 11,
        { life: rand(0.25, 0.5), size: rand(0.35, 0.8) * this.scale, color: i % 2 ? 0xff9a5c : 0x7fd8ff, alpha: 0.95, grow: -1 });
    }
    fx.impactSparks(c, 0xff7a4c, 10, 9);
    this.world.audio?.play('hitHeavy');
    this.hideGuardShield();
  }

  // Post-pose (called beside updateSpecialFx): the spin is written onto the
  // hips AFTER the animator, so the clip pose rides inside the tumble and
  // the GLB re-sync below carries it onto skinned models too.
  updateAirRoll(dt) {
    const r = this._airRoll;
    if (!r) return;
    if (!this.alive || this.state !== 'normal' || this.grounded) {
      // staggered, frozen, launched, or a landing applyPhysics didn't turn
      // into the prone crash (shouldn't happen) — drop the roll outright
      this.endAirRoll();
      return;
    }
    // ~6 turns/s — for the SMALL bots. A large bot holds the tuck without
    // spinning: rate 0 means the release math below lands at endAt 0 and
    // the tuck simply opens. "Large" is stats.weight past
    // airRoll.tuckOnlyWeight, OR the roster flag `tuckOnly` for a frame
    // that is physically big without fighting heavy (JERRY: a whole shrimp
    // colony's worth of chassis on a middleweight stat line).
    // The faster the tumble, the SHORTER the tail between letting go and
    // arriving upright — a release still has to finish its current turn,
    // so a quick spin is also the one that lands cleanly.
    const SPIN = this.def.tuckOnly ||
      this.def.stats.weight > TUNING.airRoll.tuckOnlyWeight
      ? 0 : TUNING.airRoll.spinRate;
    r.t += dt;
    const rate = SPIN * Math.min(1, r.t / TUNING.airRoll.rampSeconds);
    // what keeps the ball closed (see startAirRoll): LT held AND the stamina
    // that funds it — `blocking` going false (tank dry, stagger) lets go.
    const held = this.intent.block && this.blocking;
    if (!r.ending && !held) {
      // released: finish the CURRENT turn at speed — the body arrives back
      // upright at exactly 2π, which IS the blend back to normal — and the
      // bubble drops now (updateGuardShield reads `ending`), not at the end
      // of the turn
      r.ending = true;
      r.endAt = Math.ceil(r.spin / TAU - 0.02) * TAU;
    }
    r.spin += rate * dt;
    if (r.ending && r.spin >= r.endAt) {
      this.endAirRoll();
      return;
    }
    // A tuck-only heavy (SPIN 0) still balls up and still wears the bubble;
    // it just never leaves upright, so it neither pivots nor streaks.
    if (SPIN > 0) {
      this.rollPivot(r.ending ? Math.min(r.spin, r.endAt) : r.spin);
      // spin trail: the tumble reads at speed even in a far camera
      this._rollFxT = (this._rollFxT ?? 0) - dt;
      if (this._rollFxT <= 0) {
        this._rollFxT = 0.14;
        this.world.effects.dashTrail(this.pos, 0x7fd8ff, this.scale * 0.8);
      }
    }
  }

  // ---- generic post-pose special FX, driven by specials.js: a scripted
  // joint WHIRL (_spinFx — e.g. the bulwark shield rotor) and a scripted
  // joint GROW (_scaleFx — the smash's bot-tall shield wall). Applied
  // after the animator pose so clips can't clobber them. ----
  updateSpecialFx(dt) {
    // COLOSSAL-FORM single-hand hoist: the off arm stays DOWN while the
    // right palm does all the lifting (post-pose so liftHold can't re-raise
    // it); clears itself the moment the grab special ends
    if (this._oneArmLift) {
      if (!this.alive || this.state !== 'special') {
        this._oneArmLift = false;
      } else {
        const J = this.mech.joints;
        J.shoulderL?.rotation.set(0.12, 0, -0.18);
        J.elbowL?.rotation.set(-0.25, 0, 0);
      }
    }
    const sp = this._spinFx;
    if (sp) {
      sp.t = (sp.t || 0) + dt;
      // A whirl can WIND UP instead of snapping to speed: `delay` holds it
      // still (the pose gets its gathering beat first) and `ramp` spins it up
      // over that many seconds. `vel` is the live angular velocity in rad/s —
      // specials read it back to launch things off the turning body at
      // whatever speed it has reached (vulcan's bullet hurricane).
      const spun = sp.t - (sp.delay || 0);
      sp.vel = spun <= 0 ? 0 : sp.rate * (sp.ramp ? Math.min(1, spun / sp.ramp) : 1);
      // ...and it can spin DOWN: over the last `brake` seconds the whirl sheds
      // its rate at a CONSTANT deceleration and stops on a WHOLE TURN, so the
      // joint is back exactly where it started when the fx is dropped instead of
      // snapping out of a half-revolution. The landing angle is fixed the moment
      // braking begins (where the coast-down ends, rounded to a turn), and the
      // angle is then driven analytically — deterministic, so it can't drift. It
      // always rounds the way the joint is ALREADY turning: a whirl coasts to a
      // halt, it never unwinds backwards into place.
      //
      // The curve is an ease-OUT, k*(2-k) — the integral of a rate falling
      // linearly to zero. It leaves the hand-off at exactly the speed it arrived
      // with, so `brake` and `ramp` of the same length mirror each other. (A
      // smoothstep was wrong here: its rate STARTS at zero, so the whirl stalled
      // for a beat at full tilt and then crept through its last turn.)
      const left = sp.dur - sp.t;
      if (sp.brake && left < sp.brake) {
        if (sp.b0 === undefined) {
          sp.b0 = sp.acc || 0;
          const coast = sp.b0 + sp.vel * sp.brake * 0.5;
          sp.b1 = Math.round(coast / TAU) * TAU;
          if (sp.vel > 0 && sp.b1 < sp.b0) sp.b1 += TAU;
          if (sp.vel < 0 && sp.b1 > sp.b0) sp.b1 -= TAU;
        }
        const k = clamp01(1 - left / sp.brake);
        sp.acc = lerp(sp.b0, sp.b1, k * (2 - k));
        sp.vel = 2 * (sp.b1 - sp.b0) * (1 - k) / sp.brake;
      } else {
        sp.acc = (sp.acc || 0) + sp.vel * dt;
      }
      const j = this.mech.joints[sp.joint];
      if (j) {
        if (sp.set) {
          // base orientation OVERRIDES the posed/signature value (blended in
          // over the first beats), with the spin layered on the given axis —
          // e.g. AEGIS tips his shield flat face-up, then tops it
          const b = Math.min(1, sp.t / (sp.blend || 0.18));
          j.rotation.set(sp.set[0] * b, sp.set[1] * b, sp.set[2] * b);
        }
        j.rotation[sp.axis] += sp.acc; // on top of the posed value
      }
      if (sp.t >= sp.dur || !this.alive) this._spinFx = null;
    }
    const sc = this._scaleFx;
    if (sc) {
      sc.t = (sc.t || 0) + dt;
      const j = this.mech.joints[sc.joint];
      if (!j) { this._scaleFx = null; return; }
      const holdEnd = sc.grow + sc.hold;
      let k;
      if (sc.t < sc.grow) k = sc.t / sc.grow;
      else if (sc.t < holdEnd) k = 1;
      else k = Math.max(0, 1 - (sc.t - holdEnd) / sc.back);
      j.scale.setScalar(1 + (sc.max - 1) * k);
      if (sc.t >= holdEnd + sc.back || !this.alive) {
        j.scale.setScalar(1);
        this._scaleFx = null;
      }
    }
  }

  updateBladeTrail(dt) {
    const bt = this.def.bladeTrail;
    const swinging = this.state === 'attack' && this.animator.action &&
      !this.animator.action.fadingOut && !this.animator.action.clip.loop;
    if (!swinging) { this._trailPrev = null; return; }
    this.group.updateWorldMatrix(true, true);
    this._trailPrev = this._trailPrev || {};
    for (const name of bt.anchors) {
      const anchor = this.mech.anchors[name];
      if (!anchor) continue;
      const p = anchor.getWorldPosition(_v);
      const prev = this._trailPrev[name];
      if (prev) {
        const d = prev.distanceTo(p);
        if (d > 0.35 * this.scale && d < 8 * this.scale) {
          const n = Math.min(4, Math.ceil(d / (0.6 * this.scale)));
          for (let i = 0; i <= n; i++) {
            _v2.lerpVectors(prev, p, i / n);
            this.world.effects.glows.emit(_v2.x, _v2.y, _v2.z, 0, 0, 0,
              { life: 0.14, size: 0.55 * this.scale, color: bt.color, alpha: 0.85, grow: -1.5 });
          }
        }
        prev.copy(p);
      } else {
        this._trailPrev[name] = p.clone();
      }
    }
  }

  updateNovaAura(dt) {
    const g = this.animator?.novaGlow || 0;
    this._novaFxT = (this._novaFxT ?? 0) - dt;
    if (g < 0.45 || this._novaFxT > 0) return;
    this._novaFxT = 0.055;
    const fx = this.world.effects;
    const tip = this.mech.anchors.muzzleR;
    if (tip) {
      // orbiting star-motes swirl around the staff apex; their size and
      // spread scale with how bright the ring is burning
      tip.getWorldPosition(_v);
      const a = rand(TAU), rr = (0.25 + 0.9 * g) * this.scale;
      fx.glows.emit(_v.x + Math.cos(a) * rr, _v.y + rand(-0.3, 0.5) * g, _v.z + Math.sin(a) * rr,
        Math.cos(a + 1.6) * 2.2, rand(0.5, 2.2), Math.sin(a + 1.6) * 2.2,
        { life: rand(0.25, 0.5), size: (0.5 + 1.5 * g) * this.scale,
          color: Math.random() < 0.3 ? 0xfff0ff : 0xff3ce8, alpha: 0.9, drag: 1.2 });
    }
    // at full burn the halo itself sheds sparks
    if (g > 0.78 && this.mech.joints.halo && Math.random() < 0.6) {
      this.mech.joints.halo.getWorldPosition(_v);
      const a = rand(TAU);
      fx.glows.emit(_v.x + Math.cos(a) * 0.9 * this.scale, _v.y + rand(-0.2, 0.4), _v.z + Math.sin(a) * 0.9 * this.scale,
        Math.cos(a) * 1.5, rand(1, 3), Math.sin(a) * 1.5,
        { life: rand(0.3, 0.6), size: 0.4 * this.scale, color: 0xff9df2, alpha: 0.9 });
    }
  }

  // ================= burner stacks =================
  // Inferno's shoulder chimneys BURN — see mechs/stackfx.js for what the three
  // layers are and why the emission lives outside this file (the menus burn the
  // same mech with no Fighter around it). This end owns the two things only a
  // fighter knows: how hard he is WORKING, and whether smoke belongs here.
  //
  // NO SMOKE IN THE WARM-UP SANDBOX. The loading screen parks the fighters on a
  // grey plinth inside their own leash radius (warmup.js) — a trail with
  // nowhere to trail to just fills the frame with fog while the arena streams
  // in. Flames only there, same as the menus.
  updateStackFlames(dt) {
    const sf = this.def.stackFx;
    const fx = this.world.effects;
    if (!fx) return;
    // THE TAUNT VENTS INSTEAD OF BURNING. Inferno's boast is the machine
    // blowing soot — chimneys, back tanks and both hand torches — so the
    // burners are held OFF for the length of the clip and a handful of puffs go
    // out on their own schedule (stackfx.js stackToot). His movement is
    // untouched: this mech keeps the shared taunt pose, only the fire changes.
    if (this.tauntVenting(dt, sf, fx)) return;
    this._stackFx = this._stackFx || stackState(sf);
    // how hard he is working: ground speed against his own top speed
    const run = clamp01(Math.hypot(this.vel.x, this.vel.z) / Math.max(1e-3, this.moveSpeed() * 1.15));
    const smoke = !this.world.sandbox;
    this.group.updateWorldMatrix(true, true);
    burnStacks(this.mech, sf, this._stackFx, dt, { fx, scale: this.scale, run, smoke });
    // a dash punches the burners: one gout per dash, not one per frame
    if (this.state === 'dash' && !this._stackDashed) {
      this._stackDashed = true;
      stackBlast(this.mech, sf, { fx, scale: this.scale, smoke });
    } else if (this.state !== 'dash') this._stackDashed = false;
  }

  // Is he TAUNTING, and if so blow the puffs. Returns true while the burners
  // should stay dark. The schedule is in clip time rather than on a timer, so
  // the puffs land on the same beats however the clip is being played back.
  tauntVenting(dt, sf, fx) {
    const act = this.animator?.action;
    if (!act || act.fadingOut || act.clip.name !== 'taunt') { this._tootN = 0; this._handAcc = 0; return false; }
    const smoke = !this.world.sandbox;
    // TOOT TOOT — pairs, not a metronome. Two close together and then a gap is
    // what a train whistle is, and it is what makes this read as a deliberate
    // noise he is making rather than an engine idling. The second of each pair
    // is the harder one. CHIMNEYS AND TANKS ONLY: these are chuffs, one shove
    // of soot each.
    const TOOTS = [0.22, 0.40, 1.00, 1.18, 1.78, 1.96, 2.50, 2.68];
    const want = TOOTS.filter((t) => act.t >= t).length;
    if (want > (this._tootN || 0)) {
      this._tootN = want;
      this.group.updateWorldMatrix(true, true);
      stackToot(this.mech, sf, { fx, scale: this.scale, smoke,
        power: want % 2 === 0 ? 1.15 : 0.85 });
      this.world.audio?.play('whoosh');
    }
    // THE HANDS STREAM instead — a valve held open rather than a beat. Two long
    // vents with a breath between them (1s on, 0.5s off, 1s on), which is what
    // a vent looks like and what eight little coughs did not. The rate is an
    // ACCUMULATOR rather than one-per-frame: the smoke pool is 450 deep and this
    // must not empty it on a fast machine while doing nothing on a slow one.
    const HAND = [[0.22, 1.22], [1.72, 2.72]];
    const venting = HAND.some(([a, b]) => act.t >= a && act.t < b);
    if (venting) {
      this._handAcc = (this._handAcc ?? 0) + dt;
      let ticks = 0;
      while (this._handAcc >= 0.06 && ticks < 4) { this._handAcc -= 0.06; ticks++; }
      if (ticks) {
        this.group.updateWorldMatrix(true, true);
        for (let i = 0; i < ticks; i++) stackHandSmoke(this.mech, sf, { fx, scale: this.scale, smoke });
      }
    } else this._handAcc = 0;
    return true;
  }

  // HOW FAR BEHIND HIM HE IS TRYING TO GO, 0..1 and damped.
  //
  // Only target lock can produce this at all — free camera turns the body to
  // face travel, so the offset is ~0 and the whole thing is inert. The ramp
  // starts where the legs stop being able to face the way they are going
  // (animator LEG_BACK_OFF) and reaches 1 at a dead-straight retreat, which is
  // what makes a strafe cost nothing and a back-pedal cost the run.
  backpedalT(dt, ax, az) {
    const m = Math.hypot(ax, az);
    let want = 0;
    if (m > 0.05) {
      const off = Math.abs(angleDiff(this.yaw, Math.atan2(ax, az)));
      want = clamp01((off - LEG_BACK_OFF) / (Math.PI - LEG_BACK_OFF));
    }
    this._backT = damp(this._backT ?? 0, want, 6, dt);
    return this._backT;
  }

  applyPhysics(dt, ax, az) {
    // a retreat is not a run: the cap falls off and the sprint bonus with it
    const bk = this.backpedalT(dt, ax, az);
    const speedCap = this.moveSpeed() * this.speedMult() *
      (this.sprinting ? lerp(SPRINT_MULT, 1, bk) : 1) * lerp(1, BACK_MOVE_MULT, bk) *
      (this.blocking ? BLOCK_MOVE_MULT : 1) *
      (this.state === 'channel' ? 0.45 : 1) * (1 - 0.55 * this.duckT);

    if (this.state !== 'dash') {
      // hover jets give strong air control; plain jumps keep loose drift.
      // GLACIER's ice field (status.slip) turns the ground to glass: barely
      // any traction, so momentum carries and steering barely bites
      let control = this.grounded ? 9 : this.hovering ? 6.5 : 3.2;
      if (this.status.slip && this.grounded) control = 1.1;
      this.vel.x = lerp(this.vel.x, ax * speedCap, 1 - Math.exp(-control * dt));
      this.vel.z = lerp(this.vel.z, az * speedCap, 1 - Math.exp(-control * dt));
    } else {
      const d = Math.max(0, 1 - 2.2 * dt);
      this.vel.x *= d; this.vel.z *= d;
    }

    this.vel.y -= GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // ground
    if (this.pos.y <= 0) {
      const fallSpeed = -this.vel.y;
      this.pos.y = 0;
      this.vel.y = 0;
      if (!this.grounded) {
        this.grounded = true;
        // still somersaulting at touchdown: no feet under him — he hits the
        // dirt PRONE and eats the knockdown. The risk half of the air roll.
        if (this._airRoll && this.alive) {
          this.endAirRoll();
          this.setState('knockdown', 0.9);
          this.animator.play('knockdown');
          this.world.effects.dustPuff(this.pos, 10);
          this.world.audio?.play('bodyfall');
          this.world.effects.addShake(0.25);
        }
        if (fallSpeed > 9) {
          this.world.effects.dustPuff(this.pos, Math.min(16, fallSpeed));
          this.world.audio?.play('land');
          // heavy mechs crack the ground
          if (this.def.stats.weight > 0.8 && fallSpeed > 16) {
            this.world.effects.rings.spawn(this.pos, { from: 1, to: 6, dur: 0.4, color: 0xcbb590 });
            this.world.effects.addShake(0.35);
          }
        }
        // LANDING ANIMATION: the stretch (landReach, playing since the fall's
        // last half-second) compresses into a deep crouch and stands back up.
        // Only when the mech is its own master at the moment of contact — a
        // plunge has its own slam, the tucked-ball crash just went prone
        // above, a raised guard keeps its guard, and an attack/hitstun body
        // is already spoken for.
        if (this.alive && this.state === 'normal' && !this.plunging && !this.blocking &&
            (fallSpeed > 8 || this.animator.isPlaying('landReach'))) {
          this.animator.play('land');
        }
      }
    } else if (this.pos.y > 0.05) {
      this.grounded = false;
    }

    // toroidal wrap: fold back into the periodic cell; stash the offset so
    // this player's chase camera shifts with them (invisible to their view)
    if (this.world.wrapHalf) {
      const wx = this.world.wrapCoord(this.pos.x);
      const wz = this.world.wrapCoord(this.pos.z);
      if (wx !== this.pos.x || wz !== this.pos.z) {
        this._wrap = { dx: wx - this.pos.x, dz: wz - this.pos.z };
        this.pos.x = wx;
        this.pos.z = wz;
      }
    }

    // arena bounds & buildings
    this.world.arena?.collideFighter(this);

    // fighter-fighter push out (nearest image across the seam)
    for (const f of this.world.fighters) {
      if (f === this || !f.alive) continue;
      // carried/cinematic bodies are stacked ON others by design — the 2D
      // separation would shove the carrier backward through the whole lift
      if (f._carry || this._carry || f.cinePuppet || this.cinePuppet) continue;
      const dx = this.world.wrapDelta(this.pos.x - f.pos.x);
      const dz = this.world.wrapDelta(this.pos.z - f.pos.z);
      const rr = this.radius + f.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
        f.pos.x -= (dx / d) * push;
        f.pos.z -= (dz / d) * push;
      }
    }

    // high-speed body slam into structures (launched mechs wreck facades
    // and props) — and the structure hits BACK: a thrown mech that smashes
    // through something takes real impact damage of its own
    this._crashCd = Math.max(0, (this._crashCd || 0) - 1 / 60);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if ((this.state === 'launched' || this.state === 'dash' || this.state === 'special') && hSpeed > 14) {
      // sphere projected AHEAD into whatever we're hitting — the wall
      // pushout otherwise keeps small mechs' reach just short of chunks
      const lead = (this.radius + 1.4) / hSpeed;
      _v.set(this.pos.x + this.vel.x * lead, this.pos.y + this.height * 0.5, this.pos.z + this.vel.z * lead);
      const smashed = this.world.arena?.damageSphere(
        _v, Math.max(3, this.radius * 2.2), hSpeed * 3, _v2.copy(this.vel).normalize(), true) || 0;
      if (smashed > 0 && this.state === 'launched' && this._crashCd <= 0) {
        this._crashCd = 0.6;
        this.takeHit(Math.min(85, hSpeed * 1.5), this.lastAttacker, {
          knock: 0, srcPos: _v, soft: true,
        });
        this.world.effects.impactSparks(this.center(), 0xffcf7a, 16, 12);
        this.world.effects.dustPuff(this.pos, 8);
        this.world.audio?.play('crumbleBig');
        this.world.effects.addShake(0.5);
        this.vel.x *= 0.55; // punching through wreckage bleeds momentum
        this.vel.z *= 0.55;
      }
    }
  }

  resetForRound(pos, yaw) {
    this.hp = this.maxHp;
    this.alive = true;
    this.hanging = null;
    this._carry = null;
    this.cinePuppet = false;
    this.group.visible = true; // a shattered finisher victim comes back whole
    this._rollOffset = null;            // never carry an air-roll pivot nudge over
    this.group.rotation.order = 'XYZ';
    this.group.rotation.set(0, yaw, 0); // clear any carry/slam roll
    this._spinFx = null;
    this._scaleFx = null;
    this.mech.joints.shield?.scale.setScalar(1);
    // a weapon thrown as the round ended is mid-regrow: hand it back whole
    // rather than starting the next round with a collapsed blade/lance
    for (const rg of this._regrow || []) this.weaponMount(rg.joint)?.scale.setScalar(1);
    this._regrow = null;
    this._wound = null;
    this._woundNext = null;
    this._woundTinted = false;
    // unconditional: clears a frost white-out AND any lingering poison flush
    this._whiteW = 0;
    this.applyWhiteout(0);
    if (this._charK) { this._charK = 0; this.applyCharring(0); }
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = this.torsoYaw = this.targetYaw = yaw;
    this.group.rotation.y = yaw;
    this.setState('normal');
    this.status = {};
    this.clearGlitch(); // corruption lasts exactly one round
    this.setOpacity(1);
    // charges are a PER-ROUND resource, like the hp/ammo/fuel/energy above
    // and beside it. Carried over, a round could open on a full pouch that
    // was collected in the last one — the other half of "the CPU has
    // infinite ults".
    this.ultCharges = 0;
    this.ultFlashT = 0;
    this.ult = 0;
    this.specialCd = 0;
    this.rangedCd = 0;
    this._volley = null;   // …nor mid-traverse with a shell still owed
    this.iframes = 0;
    this.comboIdx = 0;
    this._onBack = false;  // never start a round stranded on the shell
    this._flipT = 0;
    this._rollUp = null;
    this.endAirRoll();     // a round never opens mid-somersault
    this.climb = false;    // …nor halfway up a building
    this._climbTilt = 0;
    this._climbTiltOn = false;
    this._climbCd = 0;
    this._climbRelease = false;
    this._climbSpeed = 0;
    this.climbUp?.set(0, 1, 0);
    this.climbFwd?.set(Math.sin(yaw), 0, Math.cos(yaw));
    this._climbN?.set(0, 1, 0);
    this._steps = null;    // every limb re-plants where the new round puts him
    this._stepAct = 0;
    this.hovering = false;
    this.hoverFuel = this.hoverFuelMax;
    this.sprintEnergy = this.sprintEnergyMax;
    this.sprinting = false;
    this._sprintHold = false;
    this._dashCharge = 0;
    this.plunging = false;
    this._wrap = null; // stale seam-fold offsets must not jolt the camera
    this._jumpCharge = 0;
    this.duckT = 0;
    this.ducking = false;
    this.height = this.baseHeight;
    this.hitRadius = this.baseHitRadius;
    if (this.ammoMax !== undefined) this.ammo = this.ammoMax;
    this._whirlHold = null;
    this._punchHold = null;
    this._aimPoint = null;
    this._lockAim = null;
    this._aimYaw = 0;
    this._aimPitch = 0;
    this._pitchDrv = null;
    this._strikeAim = null;
    this._oneArmLift = false;
    this.clearChargeGlow();
    if (this._fistOut?.size) { // fist projectile(s) died with the round — re-attach
      for (const side of this._fistOut) {
        if (!this.mech.fistSplit?.attach(side)) this.mech.joints['hand' + side]?.scale.setScalar(1);
      }
      this._fistOut.clear();
    }
    this.animator.action = null;
  }
}
