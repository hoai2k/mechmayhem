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
import { defineWorkbenchConfig } from '../../config/contract.js';
import { ROSTER, ROSTER_BY_ID, playableRoster } from '../../../src/mechs/roster.js';
import { JOINT_ORDER } from '../../../src/mechs/rigadapter.js';
import { CLIPS, compileClip, defClipVariants } from '../../../src/mechs/animations.js';
import { Animator } from '../../../src/mechs/animator.js';
import {
  GAITS, GAIT_SCHEMA, gaitIds, gaitIdFor, cloneGait, gaitDiff, formatGait,
  applyGait, applyQuadGait, applyToeHang, gaitPhaseRate,
} from '../../../src/mechs/gaits.js';
import { TUNING } from '../../../src/core/tuning.js';
import { CONFIG as GAME_CONFIG } from '../../../src/core/config.js';
import { buildMech, computeDims } from '../../../src/mechs/factory.js';
import {
  buildMannequin, buildReferenceMannequin, canonicalDims, mannequinLabels, mannequinRig,
  BONE_TINTS, MANNEQUIN_ID, MANNEQUIN_DEF,
} from '../../../src/mechs/mannequin.js';
import { profileFor } from '../../../src/mechs/glbanim.js';
import {
  buildGlbForTool, fetchRawManifest, loadRawGlbScene, skinnedBox, measureHeadTop, setAssetBase,
  clearGlbCache,
} from '../../../src/mechs/gltf.js';
import { rigFor, rigIds } from '../../../src/mechs/rigs/index.js';
import { applyCustomRig, setWeights, rebindRest, buildRigPosts } from '../../../src/mechs/reskin.js';
import {
  analyzeSkin, applySkinOps, compactSkinOps, pinSkinOps, skinOpsToJson,
  blendPatch, weldedAdjacency, enclaveScan,
} from '../../../src/mechs/skinops.js';
import { applySeamCuts } from '../../../src/mechs/seamcut.js';
import { buildHurtbox, pickStrikeLimb, MELEE, PART_TABLE } from '../../../src/combat/hurtbox.js';
import { PROPS } from '../../../src/arena/props.js';
import { propManifest, loadPropModel, setPropAssetBase } from '../../../src/arena/propglb.js';
import { THEMES, themePropNames } from '../../../src/arena/themes.js';
import { Engine } from '../../../src/core/engine.js';
import { World } from '../../../src/game/world.js';
import { Input } from '../../../src/game/input.js';
import { Fighter, moveSpeedFor } from '../../../src/combat/fighter.js';
import { ease } from '../../../src/core/utils.js';
import { mechClipList } from '../mechclips.js';
import { anchorUses } from '../anchoruses.js';
import { saveManifestPatch, saveRigBones } from '../../ui/save.js';

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
    raw: (id, { variant = 'glb' } = {}) => {
      if (variant === 'mannequin' || isReference(id)) {
        const m = referenceBody(1);      // raw-asset scale; the tools re-fit it
        return { scene: m.group, entry: null, mannequin: m };
      }
      return loadRawGlbScene(id, { alt: variant === 'alt' });
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
    save: (id, bones) => (isReference(id)
      ? Promise.resolve({ ok: false, error: 'the mannequin is a reference body — there is no rig file to save' })
      : saveRigBones(id, bones)),
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
    clone: cloneGait,
    diff: gaitDiff,
    format: formatGait,
    phaseRate: gaitPhaseRate,
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
      applyGait(tgt, gait, shared);
      if (gait.quad) applyQuadGait(tgt, gait, shared);
      applyToeHang(tgt, gait, shared);
      return tgt;
    },
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
    // muzzles ride joints or bones; this is where the game keeps them
    save: (id, muzzles, { variant = 'glb' } = {}) => saveManifestPatch(
      variant === 'alt' ? { [id]: { alt: { muzzles } } } : { [id]: { muzzles } }),
  },

  skin: {
    analyze: analyzeSkin,
    apply: applySkinOps,
    compact: compactSkinOps,
    // PIN — turn every `{comp:N}` island ordinal into the vertex list it means,
    // so a later rig edit can't renumber the partition under a saved op.
    // Everything leaving the tool (save + export) goes through this.
    pin: pinSkinOps,
    toJson: skinOpsToJson,
    blendPatch,
    weldedAdjacency,
    enclaveScan,
    ops: (id, { variant = 'glb' } = {}) => (entryOf(id, variant === 'alt')?.skinOps || []).map((o) => ({ ...o })),
    // SEAM CUTS — separating geometry the mesher wrongly welded (seamcut.js).
    // Handed over so a tool can PREVIEW the cut: the skin workbench edits the
    // raw file, where the cut has not happened yet, and without this there is
    // nowhere to see what the game will actually render.
    seamCuts: (id, { variant = 'glb' } = {}) => (entryOf(id, variant === 'alt')?.seamCuts || []),
    applySeamCuts,
    save: (id, ops, { variant = 'glb' } = {}) => saveManifestPatch(
      variant === 'alt' ? { [id]: { alt: { skinOps: ops } } } : { [id]: { skinOps: ops } }),
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

  persist: {
    manifest: saveManifestPatch,
    rig: saveRigBones,
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
