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

  // The rest read correctly with the retargeted procedural motion (verified
  // in ?debug=3d showcase/battle). Entries kept so each GLB has a documented
  // home for future per-model animation work.
  titanus: {},   // heavy biped brawler — direct map
  nova: {},      // slender caster — direct map (halo is procedural-only)
  rhino: {},     // charger — bull-rush carriage is tgt-driven, shape-shared
  fenrir: {},    // quadruped — gallop gait is def.gait:'quad', shape-shared
  colossus: {},  // artillery biped — direct map (mortars procedural-only)

  // WRAITH — the GLB's own cape geometry is a static drape (its punch-worthy
  // arm chain is remapped in the manifest), so the WING-LASER heavy wears the
  // PROCEDURAL cape instead: build() attaches the same cloak/cloakL/cloakR
  // rig + blade strips + wing0..5 emitters from designs/wraith.js onto the
  // virtual torso joint. It stays hidden in normal play and GROWS out while
  // the heavy runs (heavyFlare/heavyRaise then spread and fan it exactly as
  // on the procedural mech, and heavyImpactFx fires from the same wing tips).
  // The body itself swaps the lift-off hover clip for a grounded forward lean.
  wraith: {
    build(mech, def) {
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
    },
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
      const cr = anim.mech.capeRoot;
      if (!cr) return;
      const act = anim.action;
      const playing = !!act && !act.fadingOut && act.clip.name === 'wraithLasers';
      const k = lerp(anim._capeK || 0, playing ? 1 : 0, 1 - Math.exp(-10 * dt));
      anim._capeK = k;
      cr.visible = k > 0.03;
      if (cr.visible) cr.scale.setScalar(Math.max(0.001, k));
    },
  },
  inferno: {},   // flamer biped — direct map (levelHands is shape-shared)
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
      }
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
      // A crab carries its claws steady while scuttling — damp the shared walk's
      // humanoid arm counter-swing so the heavy pincers don't wag (and shear).
      if (!attacking && ratio > 0.03) {
        const keep = Math.max(0.08, 1 - 2.2 * ratio); // freeze the claws by mid-speed
        const r = anim.rest;
        for (const j of ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR']) {
          for (let i = 0; i < 3; i++) tgt[j][i] = r[j][i] + (tgt[j][i] - r[j][i]) * keep;
        }
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
      };
    },
  },

  // SAURION — the GLB has big readable arm-claws, so its light cycle
  // alternates sickle KICKS with claw RAKES (right kick, left rake, left
  // kick, right rake); the procedural stays all-kick (def.lightClips).
  saurion: {
    lightClips: ['saurionKick1', 'saurionClawL', 'saurionKick2', 'saurionClawR'],
  },
  frogger: {},   // four-arm — lower arms are procedural-only joints
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
