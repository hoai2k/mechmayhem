// ROBOTWORLD → workbench adapter.
//
// The ONLY file under workbench/ that imports from src/. It answers the
// contract in workbench/config/contract.js by reading the game's own live
// data, which is the point: add a mech to ROSTER, a clip to CLIPS, a rig to
// rigs/index.js or an entry to models/manifest.json and it appears in every
// workbench with no edit here. Nothing is copied; everything is derived.
//
// Read this file as the answer to "what does this game mean by …":
//   subject   = a MECH (roster entry + optional GLB + optional custom rig)
//   variants  = the GLB build, the hand-sculpted PROCEDURAL body, the staged
//               ALTERNATE GLB — a robotworld-specific set, hence config data
//   joints    = the 15 canonical rig joints the animation system drives
//   clips     = animations.js, filtered per mech by the real play sites
//   anchors   = muzzles/core/overhead, the origins combat fires from
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { defineWorkbenchConfig } from '../../config/contract.js';
import { ROSTER, ROSTER_BY_ID, playableRoster } from '../../../src/mechs/roster.js';
import { JOINT_ORDER } from '../../../src/mechs/rigadapter.js';
import { CLIPS, compileClip, defClipVariants } from '../../../src/mechs/animations.js';
import { Animator } from '../../../src/mechs/animator.js';
import {
  GAITS, GAIT_SCHEMA, gaitIds, gaitIdFor, cloneGait, gaitDiff, formatGait,
  applyGait, applyQuadGait, applyGaitKeys, applyToeHang, gaitPhaseRate,
  gaitBaseOf, gaitHeirsOf, effectiveGait, applyTailGait, applyHexGait,
} from '../../../src/mechs/gaits.js';
import { TUNING } from '../../../src/core/tuning.js';
import { CONFIG as GAME_CONFIG } from '../../../src/core/config.js';
import { buildMech, computeDims } from '../../../src/mechs/factory.js';
import {
  buildMannequin, buildReferenceMannequin, canonicalDims, mannequinLabels, mannequinRig,
  BONE_TINTS, MANNEQUIN_ID, MANNEQUIN_DEF,
} from '../../../src/mechs/mannequin.js';
import { profileFor, ARM_JOINTS, mirrorJointName } from '../../../src/mechs/glbanim.js';
import { SIGNATURES } from '../../../src/mechs/signatures.js';
import {
  buildGlbForTool, fetchRawManifest, loadRawGlbScene, applyEntryDrops, skinnedBox, measureHeadTop, setAssetBase,
  clearGlbCache,
} from '../../../src/mechs/gltf.js';
import { rigFor, rigIds } from '../../../src/mechs/rigs/index.js';
import { applyCustomRig, setWeights, rebindRest, buildRigPosts } from '../../../src/mechs/reskin.js';
import {
  analyzeSkin, applySkinOps, compactSkinOps, pinSkinOps, skinOpsToJson,
  blendPatch, weldedAdjacency, enclaveScan,
} from '../../../src/mechs/skinops.js';
import { buildHurtbox, pickStrikeLimb, MELEE, PART_TABLE } from '../../../src/combat/hurtbox.js';
import { PROPS, PROP_MATS, mergePropMeshes } from '../../../src/arena/props.js';
import {
  propManifest, loadPropModel, setPropAssetBase, preloadPropModels, propGlbSwap,
} from '../../../src/arena/propglb.js';
import { THEMES, THEMES_BY_ID, themePropNames } from '../../../src/arena/themes.js';
import { Arena } from '../../../src/arena/arena.js';
import { emptyLevel, LEVEL_VERSION, PLAYTEST_KEY } from '../../../src/arena/level.js';
import { levelFromArena } from '../../../src/arena/bake.js';
import { AUTHORED_ARENAS } from '../../../src/arena/authored.js';
import { ARENA_PALETTE, ARENA_PALETTE_BY_ID, ARENA_SWATCHES } from './arenapalette.js';
import {
  STRUCTURE_KINDS, structureMaterial, structureChunkShape, structureMassing,
  structSeed,
} from '../../../src/arena/structures.js';
import { CHUNK_SHAPES, chunkTransform } from '../../../src/arena/chunkgeo.js';
import { Engine } from '../../../src/core/engine.js';
import { World } from '../../../src/game/world.js';
import { Input } from '../../../src/game/input.js';
import { Fighter, moveSpeedFor } from '../../../src/combat/fighter.js';
import { ease, makeRng } from '../../../src/core/utils.js';
import { mechClipList } from '../mechclips.js';
import { anchorUses } from '../anchoruses.js';

// the manifests are read once and shared; every catalogue answer needs them
let manifest = null;
let propManifestData = null;
export async function loadRobotworldConfig() {
  // the workbench page lives one directory down (/workbench/), so point both
  // asset resolvers back at the game root before anything asks for a model
  setAssetBase('../');
  setPropAssetBase('../');
  manifest = await fetchRawManifest();
  propManifestData = await propManifest();
  return CONFIG;
}

const entryOf = (id, alt) => (alt ? manifest?.[id]?.alt : manifest?.[id]) || null;

// A theme is shared config and an Arena is handed one to keep — the editor
// builds arenas over and over, so every build gets its own copy.
const detachTheme = (id) => JSON.parse(JSON.stringify(THEMES_BY_ID[id] || THEMES[0]));

// SUBJECTS THAT ARE NOT GAME CONTENT. The reference body is pickable in every
// workbench (bottom of the list, under the rule, like the work-in-progress
// mechs) but it is not in ROSTER and never will be: it has no balance, no
// finisher and no place in mech select. One list, so every answer below —
// def lookup, variants, rigs, saving — agrees about which ids those are, and
// tools/wbconfig.mjs subtracts them before it compares the catalogue to ROSTER.
const REFERENCE_DEFS = { [MANNEQUIN_ID]: MANNEQUIN_DEF };
const isReference = (id) => !!REFERENCE_DEFS[id];
// every subject's def, roster or reference — the one lookup the rest uses
const defOf = (id) => ROSTER_BY_ID[id] || REFERENCE_DEFS[id] || null;
// The reference body, built fresh. Two heights, for the two ways a tool takes
// it: ~7 units for the ones that put a MODEL on a stage (the roster clusters
// around 7, so the mannequin stands eye to eye with a mech), and ~1 unit for the
// ones that take a RAW ASSET — an imported GLB arrives about that big and those
// tools scale it themselves (skin normalises to 7, the rig editor multiplies by
// its own VIEW), so handing them a 7-unit body would put the camera inside its
// shin.
const referenceBody = (height = 7) => buildMannequin({ dims: canonicalDims(height), def: MANNEQUIN_DEF });

// ---------------------------------------------------------------------------
// THE PASSES THAT RUN AFTER THE GAIT ON ONE PARTICULAR BODY — the per-mech
// SIGNATURE (signatures.js) and the GLB profile's `post` hook, which are the
// last two things Animator.update does to the pose target. The gait workbench
// asks "can this dial move THIS mech" by sweeping it through the pipeline, and
// the answer is wrong unless these run: a signature is free to ASSIGN a joint
// rather than add to it, and one that does owns that joint outright. Saurion is
// the worked example — his raptor carry lerps shoulder pitch/roll, elbow pitch
// and wrist pitch to fixed angles with the speed ratio as the weight, so at a
// run seven of the nine `arms.*` dials cannot move him at all.
//
// THE ANIMATOR IT IS HANDED IS A DECOY, and every part of that is deliberate.
// A signature writes two ways — into `tgt` (what the pose smoother owns) and
// straight onto `anim.J` bones (tails, halos, gatlings) — and the second kind
// must not happen here: this runs dozens of times per scan, on a model the
// owner is looking at, and a scan that visibly twitches the tail is a scan that
// changed the thing it was measuring. Every one of those writes is already
// guarded (`if (!tj) continue`, `if (J.halo)`, `anim.part(…)`), so an EMPTY
// joint table turns the whole class of them into no-ops while the `tgt` writes
// — the only ones a dial sweep can see anyway — land normally.
//   · `dt: 0` freezes every damp and countdown, so the sweep's trials differ by
//     the dial and nothing else. Two signatures re-roll random scratch when
//     their timer expires (jerry's twitches, nullbot's failing display); the
//     scratch object PERSISTS across the scan, so they roll once and then hold.
//   · `materials`/`rigBones` null: same rule as the bones, one level up.
//   · a signature that throws under the decoy is DISABLED for that body rather
//     than allowed to break the tool — the measurement degrades to the gait
//     alone, which is exactly what it was before this existed.
const _postScratch = new Map();      // mech id -> the decoy animator, reused
const _postBroken = new Set();       // …and the ones that threw, never retried
function postGaitLayers(tgt, env, body) {
  const { id, animator } = body;
  if (!id || _postBroken.has(id)) return;
  const sig = SIGNATURES[id];
  const post = profileFor(id)?.post;
  if (!sig && !post) return;
  let decoy = _postScratch.get(id);
  if (!decoy) {
    const def = defOf(id);
    decoy = {
      J: {},                                    // no bone is reachable
      part: () => null,                         // …nor any face part
      addImpulse: () => {},
      mech: { def, isGLB: !!animator?.mech?.isGLB, materials: null, rigBones: null },
      D: animator?.D || {}, s: animator?.s ?? 1, sizeMul: 1,
      rest: animator?.rest || {}, cur: animator?.cur || {},
      action: null, gait: null, t: 0, phase: 0, spinVel: 0,
    };
    _postScratch.set(id, decoy);
  }
  decoy.t = env.tailT ?? 0;
  decoy.phase = env.ph ?? 0;
  if (animator) { decoy.D = animator.D; decoy.s = animator.s; decoy.rest = animator.rest; }
  // the fighter frame the signature reads: `run` is the speed ratio, which is
  // what a carry crossfades on, and everything else is a body at rest so no
  // combat branch is measured
  const ctx = { speed: env.ratio ?? 0, maxSpeed: 1, grounded: true, firing: false, dashT: 0 };
  try {
    sig?.(decoy, 0, ctx, tgt);
    post?.(decoy, 0, ctx, tgt);
  } catch (e) {
    _postBroken.add(id);
    console.warn(`[gait] post-gait layer for '${id}' failed under measurement; `
      + 'dial relevance falls back to the gait alone', e);
  }
}

const CONFIG = defineWorkbenchConfig({
  game: 'robotworld',

  // This game's models are MECHS. A port would say character / vehicle / prop
  // here and every panel title, picker label and status line follows.
  vocab: {
    subject: 'mech', subjects: 'mechs', Subject: 'Mech', Subjects: 'Mechs',
    // the arena dressing is a second kind of model with its own workbench
    prop: 'prop', props: 'props', Prop: 'Prop', Props: 'Props',
  },

  // the raw asset manifest, for the few tools that reason about entries
  // directly (which builds exist, is the rig on the primary or the alt)
  manifest: () => manifest,

  // RE-READ THE AUTHORING SOURCES without a page reload — the "load from
  // manifest" button. A workbench that judges the shipped skinning has to be
  // able to pick up a save made in ANOTHER workbench (or by hand) while it is
  // open; two things stand in the way and both are cleared here. The manifest
  // json is re-fetched (it is never cached), and the parsed GLB cache is
  // dropped, because skinOps are baked into the shared cached geometry once.
  // Rig FILES are javascript modules — the dev server's HMR reloads the page
  // for those, so they need nothing here.
  reload: async () => {
    clearGlbCache();
    manifest = await fetchRawManifest();
    return manifest;
  },

  catalogue: {
    // ROSTER order is the game's own; `hidden` marks work-in-progress mechs
    // that the game hides until SETTINGS → SHOW ALL ROBOTS, but the
    // workbenches always show — iteration is the whole point of a workbench.
    list: () => [
      ...ROSTER.map((m) => ({
        id: m.id,
        name: m.name,
        hidden: !!m.hidden,
        hasModel: !!manifest?.[m.id]?.url,
        hasAlt: !!manifest?.[m.id]?.alt?.url,
        hasRig: !!(manifest?.[m.id]?.rig || manifest?.[m.id]?.alt?.rig || rigFor(m.id)),
      })),
      // the reference body, pickable like a mech: `hidden` puts it under the
      // rule at the end of every picker, `reference` tells the tools that need
      // a real fighter (the action workbench) to leave it out
      ...Object.values(REFERENCE_DEFS).map((d) => ({
        id: d.id, name: d.name, hidden: true, reference: true,
        hasModel: false, hasAlt: false, hasRig: true,
      })),
    ],
    get: (id) => defOf(id),
    reference: () => Object.keys(REFERENCE_DEFS),
    playable: () => playableRoster().map((m) => m.id),
    note: (id) => (isReference(id) ? '  — reference body'
      : rigIds().includes(id) ? '' : '  — no custom rig'),
  },

  variants: {
    // 'glb'  the shipped model · 'proc' the hand-sculpted body · 'alt' a
    // staged second build (a different GLB, or the same one on a new rig) ·
    // 'mannequin' the REFERENCE humanoid (mechs/mannequin.js) — not a build of
    // this mech at all, but the same 15 joints at this mech's measurements, so
    // a tool can show what the rig is being ASKED to do on a body you can read
    list: (id) => (isReference(id)
      // the reference body has exactly one build — itself
      ? [{ key: 'mannequin', label: 'Mannequin', available: true }]
      : [
        { key: 'glb', label: 'GLB', available: !!manifest?.[id]?.url },
        { key: 'proc', label: 'Procedural Robot', available: true },
        { key: 'alt', label: 'Alternate GLB', available: !!manifest?.[id]?.alt?.url },
        { key: 'mannequin', label: 'Mannequin', available: true },
      ]),
    async build(id, { variant = 'glb', overrides = null } = {}) {
      // asked for the reference body BY ID, every variant means the same thing
      if (isReference(id)) return referenceBody();
      const def = ROSTER_BY_ID[id];
      if (!def) return null;
      if (variant === 'mannequin') return buildMannequin({ dims: computeDims(def), def });
      if (variant === 'proc') return buildMech(def);
      const built = await buildGlbForTool(def, overrides, { alt: variant === 'alt' });
      return built?.mech || null;
    },
    // the untouched asset — skin + rig work happens on private geometry, not
    // on the cached scene the game clones from. The mannequin answers here too
    // (it IS private geometry, freshly built), which is what lets the skin and
    // rig tools open the reference body with the code they already have; there
    // is no manifest entry behind it, and both tools disable saving on that.
    // `drops: true` also takes off the manifest's surplus geometry (dropGeo /
    // dropBones), for a tool that only LOOKS at the raw model — otherwise a
    // lump the game deletes floats beside it here and reads as a bug in the
    // model. A tool that applies skinOps itself must NOT ask for it: the game
    // drops after the ops, and an island ordinal is drawn on the undropped
    // mesh — that tool calls `skin.applyDrops` at the right moment instead.
    raw: (id, { variant = 'glb', drops = false } = {}) => {
      if (variant === 'mannequin' || isReference(id)) {
        const m = referenceBody(1);      // raw-asset scale; the tools re-fit it
        return { scene: m.group, entry: null, mannequin: m };
      }
      return loadRawGlbScene(id, { alt: variant === 'alt', drops });
    },
    entry: (id, { variant = 'glb' } = {}) => entryOf(id, variant === 'alt'),
    height: (model) => {
      const box = skinnedBox(model.group);
      return box.max.y - box.min.y;
    },
    headTop: (model) => measureHeadTop(model),
  },

  rig: {
    joints: JOINT_ORDER,
    isJoint: (name) => JOINT_ORDER.includes(name),
    custom: {
      // the reference body's skeleton is generated from the body itself, so the
      // rig editor can open it as the answer key: every bone already where it
      // belongs, in mesh-local space, exactly like a rigs/<id>.rig.js file
      get: (id) => (isReference(id) ? mannequinRig(referenceBody(1)) : rigFor(id)),
      ids: () => [...rigIds(), ...Object.keys(REFERENCE_DEFS)],
      apply: applyCustomRig,
      setWeights,
      rebindRest,
      buildPosts: buildRigPosts,
    },
    // JOINT ROTATION OFFSETS — `boneCorrections`, the game's one rotation knob
    // for a rig. Degrees [x,y,z] per game joint, post-multiplied in bone-LOCAL
    // space after the retarget (rigadapter.js, `corr`), so it is the standing
    // bias of a limb: "this thigh rests splayed, take 10 degrees off it before
    // any clip plays". It lives in the MANIFEST, not the rig file, because a
    // rest rotation in the rig file cancels out — applyCustomRig rebinds the
    // skin at rest and RigAdapter captures a rest offset per bone, so the same
    // R lands on both sides. This is the pair a tool needs to author them.
    corrections: {
      get: (id, { variant = 'glb' } = {}) => ({ ...(entryOf(id, variant === 'alt')?.boneCorrections || {}) }),
    },
  },

  anim: {
    clips: () => Object.keys(CLIPS),
    // the clips THIS mech can actually play, read off the real play sites —
    // vulcan's list carries his ult's hurricaneSpin and nobody else's
    clipsFor: (id, model) => mechClipList(defOf(id), model?.animProfile || profileFor(id)),
    // same resolution order as Animator.play: profile override, then the
    // roster def's body-type variant (ballPose), then the shared clip
    clip: (name, model) => model?.animProfile?.clipOverrides?.[name] ||
      (model?.def && defClipVariants(model.def)?.[name]) || CLIPS[name],
    compile: compileClip,
    animator: (model, id) => model.premadeAnimator || new Animator(model, defOf(id)),
    profile: (id) => profileFor(id),
    // WHICH TRACK DRIVES THIS JOINT. Normally the one with the same name — but
    // a GLB profile may carry `mirrorArms` (WRAITH: the rifle is in the model's
    // LEFT hand, so the right-arm clip tracks play on the arm that holds it),
    // and then the arm tracks are SWAPPED at playback with yaw and roll negated
    // (animator.js). Any tool that edits clip data by dragging a JOINT has to
    // know, or it writes what you dragged into the track that moves the other
    // arm — which is exactly what the pose workbench did.
    trackFor: (joint, model, id) => {
      const prof = model?.animProfile || profileFor(id);
      if (!prof?.mirrorArms || !ARM_JOINTS.includes(joint)) return { name: joint, sign: [1, 1, 1] };
      return { name: mirrorJointName(joint), sign: [1, -1, -1] };
    },
    // a mech's authored rest stance (digitigrade legs etc.)
    restPose: (id) => defOf(id)?.restPose || null,

    // LOCOMOTION — the walk and the run. Not clips: animator.update() builds
    // them every frame off a gait PHASE whose cadence is matched to the actual
    // ground speed (that is what plants a foot on one spot instead of skating),
    // so there is nothing keyed to list under `clips`. Handed over as the cycle
    // it is, at the mech's REAL top speed (moveSpeedFor — the same number the
    // fighter caps itself at, so the workbench strides exactly like a match).
    locomotion: {
      // The run blend is normalised by speed/maxSpeed, so the fraction IS the
      // gait: 0.45 is the loose-limbed walk, 1 the full-amplitude run.
      list: (id) => {
        const top = moveSpeedFor(defOf(id));
        return [{ id: 'walk', label: 'Walk', speed: top * 0.45 },
          { id: 'run', label: 'Run', speed: top }];
      },
      ctx: (id, modeId) => {
        const top = moveSpeedFor(defOf(id));
        return { speed: modeId === 'walk' ? top * 0.45 : top, maxSpeed: top,
          grounded: true, vy: 0, alwaysReady: true };
      },
      period: () => Math.PI * 2,
      phase: (animator) => animator.phase,
      // Pose the body at EXACTLY phase `ph`. update() advances the phase itself
      // before it reads it, so a single pinned call lands the POSE one cadence
      // step past `ph`; measure that step and pre-subtract it. Called repeatedly
      // at a coarse dt, this also lets the pose smoother (and the pelvis/sole
      // follower, which has its own memory) settle onto the frame being judged.
      step: (animator, ctx, ph, dt) => {
        animator.phase = ph;
        animator.update(dt, ctx);
        const adv = animator.phase - ph;
        animator.phase = ph - adv;
        animator.update(dt, ctx);
      },
      // free-run one real frame — the gait at its own cadence, as in a match
      run: (animator, ctx, dt) => { animator.update(dt, ctx); return animator.phase; },
    },
  },

  // LOCOMOTION. A gait is a named bundle of walk/run numbers in
  // src/mechs/gaits.js; a roster def names one and several mechs share it. All
  // derived: add a gait to GAITS or point a mech at one and the gait workbench
  // sees it on the next reload.
  gait: {
    ids: () => gaitIds(),
    schema: () => GAIT_SCHEMA,
    shipped: (gaitId) => GAITS[gaitId] || null,
    idFor: (id) => gaitIdFor(defOf(id)),
    users: (gaitId) => [...ROSTER, ...Object.values(REFERENCE_DEFS)]
      .filter((m) => gaitIdFor(m) === gaitId).map((m) => m.id),
    // A gait may be a VARIANT of another (fenrir's quad is the sprint gait plus a
    // gallop layer), which the panel has to say out loud: a dial the base also
    // owns moves both, and one the variant added moves only it.
    baseOf: (gaitId) => gaitBaseOf(gaitId),
    heirsOf: (gaitId) => gaitHeirsOf(gaitId),
    clone: cloneGait,
    diff: gaitDiff,
    format: formatGait,
    // …at the speed asked for: a gait that crossfades into a second table
    // (fenrir) changes its own cadence on the way, so the preview has to resolve
    // it exactly as the animator does before reading anything off it.
    phaseRate: (gait, opts) => gaitPhaseRate(effectiveGait(gait, opts?.ratio ?? 1), opts),
    // hand an EDITED gait to a live animator — held by reference, so the very
    // next frame runs it (this is also how the game shares one gait between
    // mechs: everyone points at the same object)
    install: (animator, gait) => { if (animator) animator.gait = gait; },
    // What the gait ALONE does to a pose, on a zeroed rest target: the tool
    // calls it twice (once with a dial nudged) to turn "you dragged this limb
    // N radians" into "that dial moves by X".
    evaluate: (gait, env) => {
      const tgt = { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0] };
      const rest = {};
      for (const j of JOINT_ORDER) { if (j !== 'hips') { tgt[j] = [0, 0, 0]; rest[j] = [0, 0, 0]; } }
      // ONE env: the passes hand each other conclusions through it (which foot
      // is in the air), exactly as the animator runs them
      const shared = { ...env, rest };
      // the gait AT THIS SPEED — same resolution the animator does, so a
      // `run*` dial measures as the thing it actually moves
      const g = effectiveGait(gait, env.ratio ?? 1);
      applyGait(tgt, g, shared);
      if (g.quad) applyQuadGait(tgt, g, shared);
      applyGaitKeys(tgt, g, shared);
      applyToeHang(tgt, g, shared);
      // the tail, if this body has one — seeded here so the dial sweep can see
      // it. Its chain comes in through env.tail (Animator.tailChain), because
      // the straighten term is measured off the rig and not authored.
      if (g.tail && shared.tail) {
        for (let i = 0; i < shared.tail.n; i++) tgt['tail' + i] = [0, 0, 0];
        // `tail.idle` is a RATE, not a pose term — it winds the tail's own
        // clock. A pose sampled at one instant cannot see a rate, so the caller
        // hands over how far along that clock to sample (`tailT`, seconds) and
        // the dial moves something measurable.
        shared.tailPh = (shared.ph ?? 0) + (shared.tailT ?? 0) * (g.tail.idle || 0);
        applyTailGait(tgt, g, shared);
      }
      // …and the extra legs, if this body has them (Animator.hexLegs). Same
      // deal as the tail: the bones are the rig's, not the game's, so the tool
      // cannot know their names — they arrive measured, through env.hex.
      if (g.hex && shared.hex) {
        for (const l of shared.hex.legs) {
          if (!l.driven) continue;
          tgt[l.hip] = [0, 0, 0];
          if (l.knee) tgt[l.knee] = [0, 0, 0];
        }
        applyHexGait(tgt, g, shared);
      }
      // …AND THE PASSES THAT COME AFTER THE GAIT ON THIS PARTICULAR BODY.
      // A gait is one table, but a POSE is a pipeline, and the last thing the
      // animator runs is per-mech: SIGNATURES[<id>] and the GLB profile's
      // `post` hook. Those may ADD to what the gait wrote (a shell waggle) or
      // REPLACE it outright — saurion's raptor carry assigns his shoulders,
      // elbows and wrists at a run, which kills seven of the nine `arms.*`
      // dials stone dead on him however far they are dragged. Measuring the
      // gait alone reported all nine live and sent the owner dragging sliders
      // that could not move the model: the panel is only worth trusting if
      // what it measures is what the frame actually does.
      if (env.body) postGaitLayers(tgt, shared, env.body);
      return tgt;
    },
    // The handle `evaluate` needs to run those layers — the tool holds an
    // animator already (it reads ankleGain/tailChain off it) and passes it
    // straight back, so no game type crosses into workbench/tools.
    body: (id, animator) => (id ? { id, animator } : null),
    // The game's OWN top locomotion speed for this mech, so the preview's
    // throttle is in real units and the stride cadence matches a match.
    // moveSpeedFor is the fighter's own formula and bakes in the LIVE ROBOT
    // SPEED setting; the workbench previews ANY setting, so scale off it rather
    // than writing the formula out a second time and letting the two drift.
    topSpeed: (id, { game = GAME_CONFIG.robotSpeed, sprint = false } = {}) => {
      const def = defOf(id);
      if (!def) return 0;
      return moveSpeedFor(def) * (game / GAME_CONFIG.robotSpeed)
        * (sprint ? TUNING.movement.sprintMult : 1);
    },
    gameSpeed: () => GAME_CONFIG.robotSpeed,
  },

  // A REFERENCE BODY, for tools that want to show one BESIDE what they are
  // editing rather than instead of it. The rig editor ghosts it over a raw model
  // at the same height with every joint named, which is how "ankle" stops being
  // a guess. (Tools that want the mannequin AS the subject go through
  // variants.build / variants.raw with variant 'mannequin' instead.)
  reference: {
    mannequin: (height) => buildReferenceMannequin(height),
    labels: (m, opts) => mannequinLabels(m, opts),
    tints: () => BONE_TINTS,
  },

  anchors: {
    uses: (id, name, available) => anchorUses(defOf(id), name, available),
    units: (model) => model.muzzleUnits || { joint: model.dims?.scale, bone: model.dims?.scale },
  },

  skin: {
    analyze: analyzeSkin,
    apply: applySkinOps,
    compact: compactSkinOps,
    // PIN — turn every `{comp:N}` island ordinal into the vertex list it means,
    // so a later rig edit can't renumber the partition under a saved op.
    // Everything leaving the tool (the export) goes through this.
    pin: pinSkinOps,
    toJson: skinOpsToJson,
    blendPatch,
    weldedAdjacency,
    enclaveScan,
    ops: (id, { variant = 'glb' } = {}) => (entryOf(id, variant === 'alt')?.skinOps || []).map((o) => ({ ...o })),
    // SEAM CUTS — geometry the mesher wrongly welded and seamcut.js separates.
    // Handed over so a tool can SAY SO: the skin workbench edits the raw file,
    // where the cut has not happened yet, so a mech that has cuts needs a
    // warning that what it is showing is not what the game builds. There is no
    // preview of the cut here any more — judging one needs the deforming model
    // over every clip, which is Skin Debug's job.
    seamCuts: (id, { variant = 'glb' } = {}) => (entryOf(id, variant === 'alt')?.seamCuts || []),
    // GEOMETRY DROPS — the surplus lumps a manifest entry deletes (dropGeo /
    // dropBones). A tool applies them to its own mesh once its ops have been
    // applied and its island partition taken, which is the game's own order.
    applyDrops: (mesh, id, { variant = 'glb' } = {}) => applyEntryDrops(mesh, entryOf(id, variant === 'alt') || {}),
  },

  hurtbox: { build: buildHurtbox, pickStrikeLimb, MELEE, PART_TABLE },

  // ARENA PROPS — the OTHER family of models this game ships. Not characters:
  // no rig, no clips, no anchors, so they get their own small section rather
  // than a second catalogue. Everything here is derived from the live prop
  // table, the prop GLB manifest and the themes, so a prop added to
  // src/arena/props.js is in the props workbench on the next reload.
  // (mergePropMeshes — the procedural props' draw-call diet — has no entry
  // here on purpose: it changes the object count and not one pixel, so there
  // is nothing for a viewer to compare. `?props=raw` on a battle URL is how
  // that one is judged.)
  props: {
    list: () => Object.keys(PROPS).map((name) => ({
      id: name,
      name,
      hasModel: !!propManifestData?.[name],
      themes: THEMES.filter((t) => themePropNames(t).includes(name)).map((t) => t.id),
    })),
    // where the two GLBs live, relative to the workbench page: the shipped
    // (optimized) model, and the untouched original tools/propopt.mjs archived
    url: (name, which = 'optimized') => {
      const entry = propManifestData?.[name];
      if (!entry?.file) return null;
      return which === 'source'
        ? `../models/props/source/${entry.file}`
        : `../models/props/${entry.file}`;
    },
    entry: (name) => propManifestData?.[name] || null,
    // the loader + fitting rule the game itself uses, so what the workbench
    // stands in a viewport is scaled and seated exactly like the in-game prop
    load: (name, which) => loadPropModel(name, which === 'source' ? 'source' : 'optimized'),
  },

  // A THIRD FAMILY: the PLACES the subjects fight in. Characters and scenery
  // are models; an arena is a recipe — a theme plus a seed that generates one
  // particular city — so what ?edit=level needs is not "load this asset" but
  // "build one of these, and tell me what you built".
  arena: {
    version: LEVEL_VERSION,
    themes: () => THEMES.map((t) => ({ id: t.id, name: t.name })),
    // per-theme defaults the palette seeds a new object with
    tints: (id) => (THEMES_BY_ID[id] || THEMES[0]).buildings.tints,
    bridgeColor: (id) => (THEMES_BY_ID[id] || THEMES[0]).layout?.bridges?.color,
    blank: (id) => emptyLevel(id),

    // BUILD ONE FOR REAL. The editor opens a shipped arena by building it
    // exactly as a match does and reading `arena.recipe` back (see bake()) —
    // anything cheaper would be a second implementation of the scatter rules.
    // The caller disposes it; the far skyline is hidden because it is
    // camera-locked in a match and reads as unselectable black boxes in a
    // free-orbit editor.
    build: (engine, id, seed = 7) => {
      const theme = detachTheme(id);
      theme.recordRecipe = true;   // the one caller that wants the placement list
      const a = new Arena(engine, theme, seed);
      if (engine.backdrop) engine.backdrop.visible = false;
      return a;
    },
    bake: (a, opts) => levelFromArena(a, opts),

    // THE STAGE a level is edited ON: the same themed environment — sky,
    // lights, ground, spawn plaza, exposure — with nothing placed in it,
    // because everything placed is an editor proxy the tool owns.
    stage: (engine, level) => {
      const env = detachTheme(level.theme);
      env.bounds = level.bounds / 2;             // Arena doubles it back
      env.authored = [];
      env.layout = {
        clearing: level.clearing, plaza: level.plaza,
        clusters: { count: 0, size: [2, 3] },
        lanes: [], hills: null, bridges: null, viaduct: null, patches: [],
      };
      const a = new Arena(engine, env, 7);
      engine.renderer.toneMappingExposure = (THEMES_BY_ID[level.theme] || THEMES[0]).exposure ?? 1.0;
      if (engine.backdrop) engine.backdrop.visible = false;
      return a;
    },

    // LARGE STRUCTURES THAT ARE NOT BUILDINGS (src/arena/structures.js). The
    // editor has to draw a crystal spire as a crystal spire: a baked quarry
    // full of them rendered as windowed office towers is an editor showing
    // you a different arena from the one it just built.
    structures: () => Object.keys(STRUCTURE_KINDS).map((id) => ({
      id,
      // "crystalSpire" -> "Crystal spire"
      label: id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    })),

    /**
     * A stand-in for one placed structure, built from the GAME's own
     * silhouette, chunk shape and material — one merged mesh, because a
     * quarry is 15 of these at 140 chunks each and the editor tiles the cell
     * nine ways. `def` is the level object ({struct, x, z, cells?, cw…});
     * a hand-placed one carries no cells and grows the same seeded shape the
     * match will build for it.
     */
    structure: (def) => {
      const kind = STRUCTURE_KINDS[def.struct];
      if (!kind) return null;
      const seeded = makeRng(structSeed(def));
      const m = def.cells?.length ? null : structureMassing(def.struct, seeded);
      const cells = def.cells?.length ? def.cells : (m?.cells || []);
      if (!cells.length) return null;
      const cw = def.cw || m?.cw || 4.5, ch = def.ch || m?.ch || 5, cd = def.cd || m?.cd || 4.5;
      const shape = CHUNK_SHAPES[structureChunkShape(kind.mat)] || CHUNK_SHAPES.box;
      const base = shape.geo();
      let nx = 0, nz = 0;
      for (const c of cells) { nx = Math.max(nx, c.gx + 1); nz = Math.max(nz, c.gz + 1); }
      // the same rng the game's chunks come off, so the proxy's turns and
      // swells are the ones that will ship
      const rng = makeRng(structSeed(def) ^ 0x9e3779b9);
      const geos = [];
      const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      const mat4 = new THREE.Matrix4();
      for (const c of cells) {
        const t = chunkTransform(shape, rng);
        p.set((c.gx - (nx - 1) / 2) * cw, (c.gy + 0.5) * ch, (c.gz - (nz - 1) / 2) * cd);
        q.copy(t ? t.q : new THREE.Quaternion());
        s.set(cw * (t ? t.sx : 1), ch * (t ? t.sy : 1), cd * (t ? t.sz : 1));
        const g = base.clone();
        g.applyMatrix4(mat4.compose(p, q, s));
        geos.push(g);
      }
      base.dispose();
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      const mat = structureMaterial(kind.mat, kind.tex);
      // ONE TINT FOR THE WHOLE PROXY — a stand-in has no per-chunk instance
      // colour to vary by. Turning `vertexColors` off ALSO retires the
      // emissive-by-instance patch that material may carry: `vColor` is only
      // declared under USE_COLOR, so a shader still multiplying by it would
      // fail to compile and the editor would draw nothing at all.
      mat.vertexColors = false;
      mat.onBeforeCompile = () => {};
      mat.customProgramCacheKey = () => 'structProxyFlat';
      mat.color = new THREE.Color(def.tint ?? m?.tint ?? kind.tints[0]);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const g = new THREE.Group();
      g.add(mesh);
      return g;
    },

    // WHAT CAN BE PLACED, and how to build a stand-in for one
    palette: () => ARENA_PALETTE,
    paletteEntry: (id) => ARENA_PALETTE_BY_ID[id] || null,
    swatches: () => ARENA_SWATCHES,
    // a lone prop with no arena around it, baked per material the way the game
    // bakes them — a full arena is 150+ props and each is a pile of meshes.
    // The GLB SWAP IS PART OF WHAT A PROP IS: the game replaces the procedural
    // visuals with the imported model wherever one exists (placeProp ->
    // propGlbSwap), and the two differ in shape, in size and — until the
    // models were straightened — in which way they face. An editor drawing the
    // procedural stand-in is an editor showing you a different object from the
    // one you are placing. Best-effort: a model that has not been preloaded
    // (see preloadProps) simply leaves the procedural build in place, which is
    // exactly what the game does with one that fails to load.
    prop: (name, opts = {}) => {
      const build = PROPS[name];
      if (!build) return null;
      const o = { ...opts };
      if (o.mat === 'ice') o.mat = PROP_MATS.ice;
      const g = build(o);
      propGlbSwap(name, g);
      mergePropMeshes(g);
      return g;
    },
    // fetch the imported models for a set of prop names, so the swap above has
    // something to swap in. Resolves when they are in the cache (or failed).
    preloadProps: (names) => preloadPropModels(names),
    // materials shared by every prop of a kind: an editor that disposes its
    // proxies must not dispose these or it breaks the next prop built
    sharedMaterials: () => new Set(Object.values(PROP_MATS)),

    // WHICH ARENAS ARE HAND-BUILT RATHER THAN GENERATED (src/arena/authored.js
    // is the game's own registry — derived, never a second copy). The editor
    // opens these from their file instead of baking a seed, so it edits what
    // the game plays. Deliberately NOT gated on CONFIG.arenaDesign: that
    // setting says which arena a MATCH builds, and a level file stays the thing
    // this tool edits either way.
    authoredLevel: (id) => AUTHORED_ARENAS[id] || null,

    // authored level FILES, relative to the workbench page one directory down
    levels: {
      list: () => fetch('../levels/manifest.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      load: (name) => fetch(`../levels/${name}.json`).then((r) => (r.ok ? r.json() : null)),
    },

    // PLAY WHAT YOU ARE EDITING. The game reads the stash under PLAYTEST_KEY
    // when a battle names the level `__edit`, so handing it over is a
    // sessionStorage write plus the url that consumes it (`../` — the game
    // page is one up from here).
    fighters: () => playableRoster().map((m) => ({ id: m.id, name: m.name })),
    playtest: (level, { p1, p2 } = {}) => {
      sessionStorage.setItem(PLAYTEST_KEY, JSON.stringify(level));
      const q = new URLSearchParams({ battle: level.theme, level: '__edit', p1, p2 });
      return `../?${q.toString()}`;
    },
  },

  // measurement helpers the tools need but that are engine-shaped, not
  // game-shaped: a skinned model's real (posed) bounds, and where its head
  // region tops out — both used for grounding and camera framing
  geometry: { skinnedBox, headTop: measureHeadTop },

  // THE STAGE. A workbench needs a renderer and, for the action tools, the
  // game's real world loop — triggering "heavy" has to run the same state
  // machine the game runs or the workbench is judging something else. These
  // are factories rather than classes so a port can hand back its own.
  stage: {
    engine: (canvas) => new Engine(canvas || document.getElementById('game-canvas')),
    world: (engine) => new World(engine, null),
    input: () => new Input(),
    // one posed, controllable subject on the stage
    // a real fighter needs real game content — the reference body has no
    // balance, no moves and no business in a state machine
    actor: (world, id, opts) => new Fighter(world, ROSTER_BY_ID[id], opts),
  },

  // WHERE EDITS GO. Nowhere, on their own: every workbench EXPORTS its edit as
  // text (a manifest patch, a rig bones array) for a human to read and apply.
  // There was a save path once — the tools POSTed to the dev server, which wrote
  // manifest.json and rigs/<id>.rig.js — and it was removed because a write you
  // cannot see is a write you cannot trust.
  persist: {
    // what the manifest calls this mech — tools show it in their subtitle
    describe: (id, variant) => `${id}${variant === 'alt' ? ' · ALT' : ''}`,
  },

  // small shared math the tools use for scrubbing/blending
  ease,

  // three.js is the renderer both sides share; handing it over from one place
  // keeps a second copy of the library out of the workbench bundle
  three: THREE,
});

export { CONFIG };
