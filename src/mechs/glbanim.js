// GLB animation profiles — per-model reinterpretation of the shared engine.
//
// WHY: the keyframe CLIPS in animations.js are authored for the PROCEDURAL
// rig — its rest pose, its proportions, its handedness (which hand holds a
// weapon, where a blade points). A Tripo GLB often differs: a weapon in the
// opposite hand, a sword fused to the forearm at an angle, a stance the auto
// rig bound in. Retargeting those clips verbatim warps the result.
//
// HOW: the Animator still drives the SAME virtual joints and the SAME timing
// (so combat hit-windows, muzzle anchors and state durations are unchanged —
// gameplay is identical). A profile only changes HOW a pose is expressed for
// one GLB, at four well-defined seams:
//
//   restPose    {joint:[x,y,z]deg}   overrides the default/idle stance
//   combatPose  {joint:[x,y,z]deg}   overrides the ready-guard stance. NOTE:
//                                     GLB mechs do NOT inherit the procedural
//                                     def.combatPose — the service models are
//                                     authored in their own battle-ready stance
//                                     (that IS their bind pose, which the
//                                     retarget offsets capture), so their native
//                                     carriage already reads as "guard up".
//                                     Retargeting the procedural combatPose on
//                                     top of that fights the bind and wrenches
//                                     fused geometry off-axis. Set this only to
//                                     opt a GLB back into an explicit stance.
//   mirrorArms  bool                 swap L<->R arm clip tracks (weapon in the
//                                     opposite hand) — pitch kept, yaw/roll flip
//   clipOverrides {name: clip}       a bespoke clip for an action that can't be
//                                     remapped (redo, don't remap)
//   build(mech, def)                 one-time hook at the end of buildGlbMech —
//                                     attach extra PROCEDURAL geometry/joints to
//                                     the GLB's virtual rig (wraith's cape)
//   post(anim,dt,ctx,tgt)            per-frame reinterpretation hook, run after
//                                     the built-in signature(); write radians
//                                     into tgt / drive extra joints
//
// FACTORING CONTRACT:
//   • A change that should affect BOTH procedural and GLB  -> edit animations.js
//     (shared CLIPS) or the mech's def (roster.js).
//   • A change to a procedural mech's personality           -> animator.signature()
//   • A change to how ONE GLB interprets the shared motion   -> its profile here
//   • Static rest-pose alignment of a GLB (arms-down bind)   -> manifest
//     boneCorrections (via ?debug=models), NOT restPose here — keep the two
//     concerns separate so the pose tool stays the source of truth for bind.
//
// Procedural mechs have NO profile (mech.animProfile is undefined) and run the
// engine unchanged. Only GLB mechs (buildGlbMech) attach one.
import * as THREE from 'three';
import { lerp, clamp01 } from '../core/utils.js';
import { Assembler } from './parts.js';
import { makeMaterials } from './factory.js';
import { wraithCloak } from './designs/wraith.js';
import { GLB_CLIP_VARIANTS } from './animations.js';

export const ARM_JOINTS = ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR'];

// CRANKY (GLB) claw carriage while scuttling: pincers held HIGH and out to the
// sides, cocked forward — never hanging muzzle-down at the floor. Radians in the
// virtual-joint space the retarget reads; negative shoulder pitch lifts the arm.
const CRANKY_CARRY = {
  shoulderL: [-0.72, -0.26, -0.22], shoulderR: [-0.72, 0.26, 0.22],
  elbowL: [-0.34, 0, 0], elbowR: [-0.34, 0, 0],
  handL: [0, 0.14, 0], handR: [0, -0.14, 0],
};
// Extra shoulder yaw cocked back/out on the wind-up of every Cranky attack.
const CRANKY_WINDBACK = 0.5;

// RHINO (GLB): combined shoulder+elbow PITCH (radians, virtual-joint space)
// that puts his hand-cannon barrels dead level. Measured on this rig: the
// muzzle's authored +Z sits ~82.7° below that joint sum, so a sum of −82.7°
// aims it at the horizon. Negative pitch raises the arm.
const RHINO_LEVEL = -82.7 * Math.PI / 180;
// Lead angle that cancels the animator's pose-chase lag at the fire frame.
const RHINO_LEAD = 14 * Math.PI / 180;

export function mirrorJointName(j) {
  if (j.endsWith('L')) return j.slice(0, -1) + 'R';
  if (j.endsWith('R')) return j.slice(0, -1) + 'L';
  return j;
}
// mirror a joint value across the sagittal plane: pitch (x) preserved, yaw (y)
// and roll (z) negated. Used with the L<->R name swap for mirrorArms.
export function mirrorValue(v) { return [v[0], -v[1], -v[2]]; }

// wraith cape materials — pbrtex synthesis is expensive, cache per-def so
// every fighter build after the first reuses the same THREE materials
let _wraithMats = null;
function wraithMats(def) {
  return (_wraithMats ??= makeMaterials(def));
}

// ---- WRAITH helpers (shared by the custom-rig build and its `alt`) --------
// Attach the PROCEDURAL cloak (cloak/cloakL/cloakR + blade strips + wing0..5
// emitters, from designs/wraith.js) to the GLB's virtual torso. Hidden until
// the wing-laser heavy grows it in (wraithCapeGrow).
function wraithBuild(mech, def) {
  const A = new Assembler();
  wraithCloak(A, mech.dims, mech.joints, mech.anchors);
  A.build(mech.joints, wraithMats(def));
  // wrapper between torso and cloak: the grow-in scale lives here so it
  // never fights heavyFlare, which SETS the cloak joint's own scale
  const capeRoot = new THREE.Group();
  mech.joints.torso.add(capeRoot);
  capeRoot.add(mech.joints.cloak);
  capeRoot.visible = false;
  mech.capeRoot = capeRoot;
}
function wraithCapeGrow(anim, dt) {
  const cr = anim.mech.capeRoot;
  if (!cr) return;
  const act = anim.action;
  const playing = !!act && !act.fadingOut && act.clip.name === 'wraithLasers';
  const k = lerp(anim._capeK || 0, playing ? 1 : 0, 1 - Math.exp(-10 * dt));
  anim._capeK = k;
  cr.visible = k > 0.03;
  if (cr.visible) cr.scale.setScalar(Math.max(0.001, k));
}

// The rifle hangs MUZZLE-DOWN in the gun hand, so its barrel sits ~90° below
// the horizon at rest — and combat throws every shot along the muzzle anchor's
// +Z (world.js barrelDeflect), which now IS the rifle's tip bone. Left alone,
// the sniper shot would fly into the floor. Same shape as the RHINO fix: a
// combined shoulder+elbow PITCH that puts the barrel dead level, with a lead
// angle that cancels the animator's pose-chase lag at the fire frame (the
// shot leaves 20% into `shoot`, while the arm is still climbing).
// Measured on this rig with tools/aimprobe.mjs: the rifle's tip anchor sits
// 99.5° below the shoulder+elbow pitch sum, so that sum puts it on the horizon.
const WRAITH_LEVEL = -99.5 * Math.PI / 180;
const WRAITH_LEAD = 26 * Math.PI / 180;
const WRAITH_SHOTS = new Set(['shoot', 'aim']);
function levelBarrel(anim, tgt) {
  const act = anim.action;
  if (!act || act.fadingOut || !WRAITH_SHOTS.has(act.clip.name)) return;
  // gun arm = LEFT (the model carries the rifle there; mirrorArms has already
  // routed the clip's right-arm tracks onto it)
  const sh = tgt.shoulderL, el = tgt.elbowL;
  if (!sh || !el) return;
  const ph = Math.min(1, act.t / act.clip.dur);
  const k = ph < 0.1 ? ph / 0.1 : ph > 0.45 ? Math.max(0, 1 - (ph - 0.45) / 0.35) : 1;
  const level = WRAITH_LEVEL - el[0] - (ph < 0.3 ? WRAITH_LEAD * (1 - ph / 0.3) : 0);
  // pull onto the line fast, then hold; max() is the ceiling at the horizon so
  // the clip's overshoot can't swing the muzzle up past it (see rhino)
  sh[0] = Math.max(lerp(sh[0], level, k), level);
  sh[1] *= 1 - 0.8 * k;                            // square the gun onto the target line
  sh[2] *= 1 - 0.8 * k;
}

// Cloak sway. The custom rig hangs the drape off the torso as four columns of
// three bones (rigs/wraith.rig.js); none of them is a game joint, so the
// retarget never writes them and this hook owns them outright. Bone-local axes
// are the model's bind axes: +x forward, +y up, +z the model's left — so a
// rotation about LOCAL Z pitches a column back (negative) or forward, and one
// about LOCAL X fans it sideways. Rows compound down the chain, so row 1 does
// most of the work and the fringe follows.
const CLOAK_COLS = ['R', 'MR', 'ML', 'L'];
const CLOAK_ROW_K = [1, 0.62, 0.38];
function swayCloak(anim, dt, ctx) {
  const rb = anim.mech.rigBones;
  if (!rb) return;
  const t = (anim._cloakT = (anim._cloakT || 0) + dt);
  const spd = Math.min(1, (ctx.speed || 0) / (ctx.maxSpeed || 10));
  // trail back with speed; in the air the drag lifts it further
  let trail = -0.30 * spd;
  if (!ctx.grounded) trail -= Math.min(0.35, 0.02 * Math.max(0, -(ctx.vy || 0)));
  const rate = 2.0 + 3.0 * spd;
  for (let c = 0; c < CLOAK_COLS.length; c++) {
    const wave = Math.sin(t * rate + c * 0.8);
    const swing = trail + (0.03 + 0.075 * spd) * wave;
    const fan = (0.02 + 0.05 * spd) * Math.sin(t * rate * 0.7 + c * 1.3);
    for (let r = 0; r < 3; r++) {
      const b = rb[`cape${CLOAK_COLS[c]}${r + 1}`];
      if (!b) continue;
      b.rotation.z = swing * CLOAK_ROW_K[r];
      b.rotation.x = fan * CLOAK_ROW_K[r];
    }
  }
}

// helper for post hooks: is an attack clip (non-looping action) playing?
function attacking(anim) {
  return !!(anim.action && !anim.action.fadingOut && !anim.action.clip.loop);
}
function blocking(anim, ctx) {
  const n = anim.action && !anim.action.fadingOut ? anim.action.clip.name : '';
  return !!ctx.blocking || n === 'block';
}

// ---- per-GLB profiles ----------------------------------------------------
// Each entry documents that model's default-pose read and only overrides what
// the shared engine gets wrong for it. Empty {} = the retargeted procedural
// motion already reads correctly (verified) — a home for future tweaks.
export const GLB_ANIM = {
  // AEGIS — tower shield on the LEFT forearm, energy lance in the RIGHT hand:
  // same handedness as procedural, so clips map straight across (no mirror).
  // The procedural mech keeps the shield squared to the front via a J.shield
  // joint the GLB lacks, so reproduce that intent here: while guarding, raise
  // and square the left forearm so the shield faces the enemy.
  aegis: {
    post(anim, dt, ctx, tgt) {
      const guard = blocking(anim, ctx) ? 1 : (ctx.alwaysReady && !attacking(anim) ? 0.6 : 0);
      if (guard > 0.01) {
        tgt.shoulderL[0] = lerp(tgt.shoulderL[0], -0.55, guard);
        tgt.shoulderL[2] = lerp(tgt.shoulderL[2], 0.40, guard); // across the chest
        tgt.elbowL[0] = lerp(tgt.elbowL[0], -1.2, guard);       // forearm vertical
        tgt.handL[2] = lerp(tgt.handL[2], 0, guard);
      }
    },
  },

  // VIPER — twin energy blades are FUSED to the forearms as rigid extensions
  // of the arm (not held in the hands), so the blade axis IS the forearm axis:
  // any twist of the forearm/wrist rolls the flat blade off that axis and it
  // reads as bent. The "blade == forearm extension" invariant is held at two
  // seams:
  //   • rest / ready / menus / title & select carriage — the model's own bind
  //     pose (both blades authored as clean forearm extensions). This holds
  //     automatically because GLBs no longer inherit the procedural combatPose,
  //     which used to retarget a wrist roll onto one arm and twist that blade
  //     flat (the reported title/select bug). No combatPose override needed —
  //     an empty/absent one already means "native bind = battle pose".
  //   • attacks — the shared slash/stab/drill clips add a hand ROLL/yaw that
  //     would swing an in-hand sword but instead twists a forearm blade. Damp
  //     that roll/yaw and let the shoulder+elbow arc carry the slash, so the
  //     blade stays speared along the forearm through the whole swing.
  viper: {
    post(anim, dt, ctx, tgt) {
      if (attacking(anim)) {
        tgt.handL[1] *= 0.3; tgt.handR[1] *= 0.3;
        tgt.handL[2] *= 0.2; tgt.handR[2] *= 0.2;
      }
    },
  },

  // FENRIR — the wolf's TAIL WAG (contract §5: the animator wags a
  // tail0→tail1→tail2 chain) is a procedural-design joint chain the GLB has
  // no route for: signatures.fenrir writes to J.tail0..2, which only exist
  // when designs/fenrir.js ran. The custom rig (rigs/fenrir.rig.js) carries
  // the blade-tail as its OWN 6-bone chain, and the RigAdapter never touches
  // those (they aren't game joints), so drive them straight here off
  // mech.rigBones. Same wave as the procedural signature — sped up and
  // widened when he's moving — spread over 6 bones instead of 3, so the
  // per-bone amplitude and phase step are halved to keep the total sweep and
  // curve shape identical. rotation.y is the horizontal sweep on any bone (a
  // Y-rotation can't change height); rotation.z adds the slow vertical
  // undulation. Runs before postAnimate, and adapter.sync() only writes the
  // 15 mapped joints, so these locals survive to the draw.
  fenrir: {
    post(anim, dt, ctx, tgt) {
      const bones = anim.mech.rigBones;
      if (!bones) return;                       // stock auto-rig: nothing to wag
      const t = anim.t;
      const wag = 0.25 + (ctx.speed > 1 ? 0.5 : 0);
      for (let i = 0; i < 6; i++) {
        const b = bones['tail' + i];
        if (!b) continue;
        b.rotation.y = Math.sin(t * (2.2 + wag * 2) + i * 0.45) * (0.09 + wag * 0.07);
        b.rotation.z = Math.sin(t * 1.4 + i * 0.35) * 0.04;
      }
    },
  },

  // The rest read correctly with the retargeted procedural motion (verified
  // in showcase/battle). Entries kept so each GLB has a documented home for
  // future per-model animation work.
  titanus: {},   // heavy biped brawler — direct map
  nova: {},      // slender caster — direct map (halo is procedural-only)
  // RHINO — hand-mounted cannons (manifest muzzles ride the handR/handL BONES,
  // each with an authored `rot` = that barrel's own aim axis). This GLB's bind
  // hangs the arms straight down, so at rest those barrels point ~70° at the
  // FLOOR; the shared `shoot` clip then swings the gun arm up past vertical-ish
  // (shoulder −94°, and elbow adds more) and the barrel overshoots to ~+32°
  // ABOVE the horizon — which world.js barrelDeflect faithfully obeys, lobbing
  // the shell into the sky instead of at the enemy.
  // Fix: while a shot plays, LEVEL the arms — hold shoulder+elbow pitch at the
  // barrel-horizontal line (RHINO_LEVEL, measured on this rig) so the muzzle
  // +Z sits on the horizon at the fire frame. The gun arm is CLAMPED (it may
  // still swing up from rest and drop back, it just can't climb past level, so
  // the kick still reads), and the off arm is ramped up to the same line so he
  // braces both cannons forward instead of firing one-handed from the hip.
  rhino: {
    post(anim, dt, ctx, tgt) {
      const act = anim.action;
      const n = act && !act.fadingOut ? act.clip.name : '';
      if (n !== 'shoot' && n !== 'shootL') return;
      // ramp the off-arm raise in/out so it doesn't pop at the clip seams
      const ph = Math.min(1, act.t / act.clip.dur);
      const k = ph < 0.12 ? ph / 0.12 : ph > 0.62 ? Math.max(0, 1 - (ph - 0.62) / 0.3) : 1;
      for (const s of ['R', 'L']) {
        const sh = tgt['shoulder' + s], el = tgt['elbow' + s];
        if (!sh || !el) continue;
        // Shoulder pitch that levels this arm — LED slightly past level while
        // the arm is still climbing: the animator chases pose targets at ~26/s
        // and the shell leaves at 20% into the clip, so a plain level target is
        // still ~5° short of the horizon at the fire frame. The lead decays out
        // by mid-clip, leaving the hold exactly on the line.
        const level = RHINO_LEVEL - el[0] - (ph < 0.3 ? RHINO_LEAD * (1 - ph / 0.3) : 0);
        // pull onto the line fast, then hold: max() is a hard ceiling at the
        // horizon so the clip's overshoot can't lift the barrel above it again.
        sh[0] = Math.max(lerp(sh[0], level, k), level);
        sh[2] *= 1 - 0.7 * k;                     // unsplay: barrels parallel, forward
      }
    },
  },
  colossus: {},  // artillery biped — direct map (mortars procedural-only)

  // WRAITH — hand-placed CUSTOM RIG (src/mechs/rigs/wraith.rig.js), so this
  // profile reads very differently from the old Tripo build kept as `alt`
  // (wraith_alt below):
  //   • the rifle is in the model's LEFT hand and the rig is named
  //     anatomically, so `mirrorArms` plays the right-arm clip tracks on the
  //     arm that actually holds the gun — no crossed bones, no hand-written
  //     punch fixup (the alt still needs one; see wraith_alt).
  //   • the gun hangs MUZZLE-DOWN, so a ranged shot levels the barrel first
  //     (levelBarrel) — the muzzle anchor rides the rifle's own tip bone.
  //   • the model's cloak is a real four-column chain now, so it SWAYS.
  // The WING-LASER heavy still wears the PROCEDURAL cape: build() attaches the
  // cloak/cloakL/cloakR rig + blade strips + wing0..5 emitters from
  // designs/wraith.js onto the virtual torso joint. It stays hidden in normal
  // play and GROWS out while the heavy runs (heavyFlare/heavyRaise spread and
  // fan it exactly as on the procedural mech, and heavyImpactFx fires from the
  // same wing tips). The body swaps the lift-off hover clip for a grounded lean.
  wraith: {
    mirrorArms: true,
    build: wraithBuild,
    clipOverrides: { wraithLasers: GLB_CLIP_VARIANTS.wraithLasersGlb },
    post(anim, dt, ctx, tgt) {
      levelBarrel(anim, tgt);
      swayCloak(anim, dt, ctx);
      wraithCapeGrow(anim, dt);
    },
  },
  // WRAITH (alt) — the original Tripo auto-rig build, kept for comparison.
  // Its manifest CROSSES the arms (handR mapped onto the gun arm), so it must
  // NOT mirror, and its splayed bind needs the punch fixup below.
  wraith_alt: {
    build: wraithBuild,
    clipOverrides: { wraithLasers: GLB_CLIP_VARIANTS.wraithLasersGlb },
    post(anim, dt, ctx, tgt) {
      // LEFT (claw / non-gun) arm: this GLB's left-arm bones sit splayed
      // outward at bind, so the retarget turns the jab's shoulder yaw+roll
      // into a sideways swipe — the claw reaches OUT instead of punching in.
      // When the arm is thrown forward (a punch), flatten that yaw/roll so
      // the bone reads as driving straight ahead. Gated on forward pitch, so
      // rest/guard poses (and the whole GUN arm) are left exactly as-is.
      const sp = tgt.shoulderL;
      if (sp && sp[0] < -0.7) {                 // arm past ~40° forward = punching
        const k = Math.min(1, (-sp[0] - 0.7) / 0.7); // ramp in across -40°..-80°
        sp[0] -= 0.2 * k;                       // drive a touch deeper down the line
        sp[1] = sp[1] * (1 - k) - 0.8 * k;      // kill the outward yaw, then reach IN
        sp[2] *= 1 - 2.2 * k;                   // cancel + reverse the splaying roll
        const ep = tgt.elbowL;
        if (ep) { ep[1] *= 1 - 0.9 * k; ep[2] *= 1 - 0.9 * k; }
      }
      wraithCapeGrow(anim, dt);
    },
  },
  // INFERNO — flamer biped, direct map (levelHands is shape-shared). The only
  // reinterpretation is the flame channel: his torches are forearm barrels, so
  // the shared shootLoop's folded elbows pointed them at the sky.
  inferno: { clipOverrides: { shootLoop: GLB_CLIP_VARIANTS.infernoFlameGlb } },
  glacier: {},   // heavy biped — direct map
  // CRANKY — the Tripo auto-rig welded both giant claws onto one leg bone and
  // buried the arm chains in the thin walking-legs, so the shipped rig swung a
  // back leg on attacks while the claws sat dead (the reported bug). It's fixed
  // upstream now: a hand-placed CUSTOM RIG (src/mechs/rigs/cranky.rig.js,
  // authored in ?rigedit) re-skins the mesh so each giant claw is a real
  // independent arm — the shared attack clips drive the claws directly through
  // the retarget, no special-casing needed.
  //
  // The only reinterpretation left is aesthetic: the humanoid punch clips twist
  // the torso like a boxer, which a wide crab shouldn't do — square him up so he
  // THRUSTS the claws straight ahead instead of winding up.
  cranky: {
    // post: crab-squaring during attacks (no boxer torso-twist) + advance the
    // hexapod gait clock from walk speed. build: drive all SIX legs in a tripod
    // gait (custom rig gives each crab leg a real hip bone; two carry the game
    // leg joints, four are extra). postDress runs AFTER the retarget so it owns
    // the leg pose. Attacks still drive the real claw arms via the shared clips.
    post(anim, dt, ctx, tgt) {
      const act = anim.action;
      const attacking = act && !act.fadingOut && !act.clip.loop;
      const m = anim.mech;
      if (attacking) {
        tgt.hipsRot[1] *= 0.2; tgt.torso[1] *= 0.2; tgt.torso[2] *= 0.4;
        // clawSnap is a straight-ahead CLAP — the clip reaches the arms
        // outstretched wide then drives them together at the centerline. Square
        // the body up HARD through it so the giant pincers travel straight in
        // instead of sweeping across the torso (which reads as a body turn).
        // Overlapping pincers at the peak are fine; the lateral travel is the move.
        if (act.clip.name === 'clawSnap') {
          tgt.hipsRot[1] *= 0.1;
          tgt.torso[1] *= 0.1;
          tgt.torso[2] *= 0.25;
        }
        // WIND BACK: before the strike goes forward, cock BOTH shoulders far
        // back/out to the sides — a crab loads its pincers wide, it doesn't jab
        // from a neutral guard. Triangular envelope: swells to a peak just
        // before the strike frame, then unwinds as the claws drive in. Yaw only,
        // so it stacks on the clip's own swing without touching the pitch the
        // no-droop clamp below owns.
        const wph = Math.min(1, act.t / act.clip.dur);
        const wind = wph < 0.34 ? wph / 0.34 : Math.max(0, 1 - (wph - 0.34) / 0.24);
        tgt.shoulderL[1] -= CRANKY_WINDBACK * wind;
        tgt.shoulderR[1] += CRANKY_WINDBACK * wind;
      }
      // SHELL LOCK: head + torso are one rigid carapace on this crab, so the
      // head never rotates relative to the torso — pin it to its rest carriage
      // and let the torso carry it. (The mouth plate rides the shell too, but
      // it hangs off `hips` in the rig, so postDress re-seats it on the torso.)
      for (let i = 0; i < 3; i++) tgt.head[i] = anim.rest.head[i];
      // NO-DROOP: his neutral already rests the claws ON the floor, so ANY
      // downward arm travel drives them through it — which is what had the idle
      // arm propping the body up during a light. Positive shoulder pitch lowers
      // the arm here, so neutral is a hard floor: arms may only rise from rest.
      tgt.shoulderL[0] = Math.min(tgt.shoulderL[0], anim.rest.shoulderL[0]);
      tgt.shoulderR[0] = Math.min(tgt.shoulderR[0], anim.rest.shoulderR[0]);
      // Pincer clench — drives the clawL/clawR jaw bones (not game joints, so
      // the retarget never touches them) via postDress below. Jaws spread OPEN
      // on the wind-up, SNAP shut through the strike, then ease back open.
      let clench = 0;
      if (attacking) {
        const ph = Math.min(1, act.t / act.clip.dur);
        clench = ph < 0.30 ? -0.7 * (ph / 0.30)
          : ph < 0.50 ? (ph - 0.30) / 0.20
            : Math.max(0, 1 - (ph - 0.50) / 0.50);
      }
      m._clawClench = (m._clawClench ?? 0) + (clench - (m._clawClench ?? 0)) * Math.min(1, dt * 16);
      const ratio = Math.min(1, (ctx.speed || 0) / (ctx.maxSpeed || 10));
      const grounded = ctx.grounded !== false;
      const wantK = grounded ? ratio : 0;
      m._walkK = (m._walkK ?? 0) + (wantK - (m._walkK ?? 0)) * Math.min(1, dt * 8);
      m._gaitPhase = (m._gaitPhase || 0) + (2 + 6 * ratio) * dt;
      // ---- CRUSTACEAN WALK (GLB only — this body is far less bipedal than the
      // procedural one, which keeps the shared humanoid stride) ----
      // The shared walk swings the arms as pendulums and strides the legs like a
      // biped: on this crab that dumps both giant pincers muzzle-down at the
      // floor and lifts the shell off its feet. Instead: CARRY the claws high,
      // out and cocked forward, hold the shell level, and let the hexapod tripod
      // gait in postDress be the ONLY thing that moves — he walks on legs alone.
      if (!attacking && ratio > 0.03) {
        const k = Math.min(1, ratio * 2.4);          // fully carried by mid speed
        for (const [j, v] of Object.entries(CRANKY_CARRY)) {
          if (!tgt[j]) continue;
          for (let i = 0; i < 3; i++) tgt[j][i] += (v[i] - tgt[j][i]) * k;
        }
        // legs: unwind the biped stride back to rest so the tripod gait owns them
        const r = anim.rest;
        for (const j of ['thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR']) {
          if (!tgt[j] || !r[j]) continue;
          for (let i = 0; i < 3; i++) tgt[j][i] += (r[j][i] - tgt[j][i]) * k;
        }
        tgt.hipsPos[1] += (0 - tgt.hipsPos[1]) * k;   // no stride bob: stay level
        tgt.hipsRot[0] += (0 - tgt.hipsRot[0]) * k;   // no run-lean pitch
      }
    },
    build(mech) {
      const byName = {};
      mech.group.traverse((o) => { if (o.isBone) byName[o.name] = o; });
      // (hip bone, tripod group 0|1, side +1 left / -1 right). The FRONT pair
      // sits right against the pincer bases, so animating it tears claw verts —
      // hold it steady and drive the 4 mid/back legs in diagonal pairs (reads as
      // a crab scuttle; the front legs just plant).
      // (hip, tripod group, side, amp) — mid legs sit closer to the pincers so
      // they swing at half amplitude to stay clear of the claw skin.
      const legs = [
        ['thighL', 0, 1, 1.0], ['legMRhip', 0, -1, 0.5],
        ['legMLhip', 1, 1, 0.5], ['thighR', 1, -1, 1.0],
      ].map(([n, g, sx, amp]) => ({ b: byName[n], g, sx, amp })).filter((l) => l.b);
      for (const l of legs) { l.bx = l.b.rotation.x; l.by = l.b.rotation.y; l.bz = l.b.rotation.z; }
      // Movable pincer jaws (custom-rig claw bones, children of the hands).
      // Each claw's MOVABLE jaw is isolated onto claw*/ the fixed jaw + palm onto
      // hand* by the jaw-split skinOps in the manifest — without that split the
      // whole pincer head sits on one bone and rotating it just flicks the claw
      // as a rigid lump instead of opening it.
      // The two pincers are MIRRORED, so they clamp on OPPOSITE local-X
      // directions (measured on the skinned mesh: left jaw closes on +X, right
      // on -X). A single shared sign would open one claw while closing the other.
      const claws = [['clawL', 1], ['clawR', -1]]
        .map(([n, close]) => ({ b: byName[n], close, rx: byName[n]?.rotation.x || 0 }))
        .filter((c) => c.b);
      // SHELL LOCK (mouth): the mouth plate is part of the same carapace as the
      // torso, but the rig hangs it off `hips`, so a torso tilt tore it away
      // from the shell. Bank its bind transform IN TORSO SPACE now, then re-seat
      // it there every frame — a rigid parent constraint without re-parenting
      // the rig (which would change what the skinning binds to).
      const torsoB = byName.torso, mouthB = byName.mouth;
      let mouthOffset = null;
      if (torsoB && mouthB && mouthB.parent) {
        mech.group.updateMatrixWorld(true);
        mouthOffset = new THREE.Matrix4().copy(torsoB.matrixWorld).invert().multiply(mouthB.matrixWorld);
      }
      const _mm = new THREE.Matrix4(), _pinv = new THREE.Matrix4();
      mech.postDress = () => {
        const k = mech._walkK || 0;
        const ph = mech._gaitPhase || 0;
        if (k < 0.002) { for (const l of legs) l.b.rotation.set(l.bx, l.by, l.bz); }
        else {
          for (const l of legs) {
            const p = ph + (l.g ? Math.PI : 0);
            const sweep = 0.28 * k * l.amp * Math.cos(p);             // fore-aft swing (about local z)
            const lift = 0.2 * k * l.amp * Math.max(0, Math.sin(p));  // foot lifts on the swing half
            l.b.rotation.set(l.bx + lift * l.sx, l.by, l.bz + sweep);
          }
        }
        // pincer open/close: clench +1 clamps shut, negative gapes open. The two
        // jaws are ONE connected shell, so the split boundary shears as the jaw
        // swings — keep the angle modest: enough to read as a snap, small enough
        // that the knuckle doesn't visibly tear.
        const cc = mech._clawClench || 0;
        const A = 0.30;                                               // full-clench angle
        for (const c of claws) c.b.rotation.x = c.rx + cc * A * c.close;
        // re-seat the mouth plate rigidly on the torso (see build)
        if (mouthOffset) {
          torsoB.updateMatrixWorld(true);
          _mm.multiplyMatrices(torsoB.matrixWorld, mouthOffset);       // want, in world
          _pinv.copy(mouthB.parent.matrixWorld).invert();
          _mm.premultiply(_pinv);                                      // -> parent space
          _mm.decompose(mouthB.position, mouthB.quaternion, mouthB.scale);
        }
      };
    },
  },

  // SAURION — the GLB has big readable arm-claws, so its light cycle
  // alternates sickle KICKS with claw RAKES (right kick, left rake, left
  // kick, right rake); the procedural stays all-kick (def.lightClips).
  saurion: {
    lightClips: ['saurionKick1', 'saurionClawL', 'saurionKick2', 'saurionClawR'],
  },
  // FROGGER — four-arm; the lower arms are procedural-only joints. His gunk
  // guns are HULL mounts on this model (the manifest pins muzzleR/muzzleL to
  // cannon bones), so the ranged shot must not raise a hand: swap in the
  // body-recoil variants, one per cannon (doRanged alternates the side).
  frogger: {
    clipOverrides: {
      shoot: GLB_CLIP_VARIANTS.froggerShootGlb,
      shootL: GLB_CLIP_VARIANTS.froggerShootLGlb,
    },
  },
  jerry: {},     // crustacean — antennae/struts are procedural-only joints
  nullbot: {},   // humanoid — direct map (glitch strobe is material-only)

  // VULCAN — twin gatling pods FUSED along the forearms. The shared
  // shootLoop raises the virtual shoulder to horizontal (procedural arms
  // hang straight at bind), but this GLB's bind already carries the arms
  // forward-raised — the retarget stacks the two and the pods aim SKYWARD
  // while the bullet stream flies flat from the muzzle line. While firing,
  // cap the raise so the visible barrels sit ON the fire line (and keep the
  // brace arm level with it — both pods read as blazing forward).
  vulcan: {
    post(anim, dt, ctx, tgt) {
      const n = anim.action && !anim.action.fadingOut ? anim.action.clip.name : '';
      if (ctx.firing || n === 'shootLoop' || n === 'shoot') {
        tgt.shoulderR[0] = Math.max(tgt.shoulderR[0], -1.0);
        tgt.elbowR[0] = Math.max(tgt.elbowR[0], -0.15);
        tgt.shoulderL[0] = Math.max(tgt.shoulderL[0], -0.55);
        tgt.elbowL[0] = Math.max(tgt.elbowL[0], -0.4);
      }
    },
  },

  // ---- model VARIANTS (manifest entry.profileKey) ----
  // AEGIS ALT (P1) — carries a great SPEAR in the right hand and banner
  // panels instead of a forearm shield, so it must NOT inherit base aegis's
  // shield-forward guard hook (raising that arm would hoist a banner).
  // Identity for now; a javelin-style ranged reinterpretation belongs here
  // if this model is promoted.
  aegis_alt: {},
};

export function profileFor(id) { return GLB_ANIM[id] || null; }
