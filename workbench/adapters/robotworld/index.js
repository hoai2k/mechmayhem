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
import { CLIPS, compileClip } from '../../../src/mechs/animations.js';
import { Animator } from '../../../src/mechs/animator.js';
import { buildMech } from '../../../src/mechs/factory.js';
import { profileFor } from '../../../src/mechs/glbanim.js';
import {
  buildGlbForTool, fetchRawManifest, loadRawGlbScene, skinnedBox, measureHeadTop, setAssetBase,
} from '../../../src/mechs/gltf.js';
import { rigFor, rigIds } from '../../../src/mechs/rigs/index.js';
import { applyCustomRig, setWeights, rebindRest, buildRigPosts } from '../../../src/mechs/reskin.js';
import {
  analyzeSkin, applySkinOps, compactSkinOps, skinOpsToJson,
  blendPatch, weldedAdjacency, enclaveScan,
} from '../../../src/mechs/skinops.js';
import { buildHurtbox, pickStrikeLimb, MELEE, PART_TABLE } from '../../../src/combat/hurtbox.js';
import { PROPS, mergePropMeshes } from '../../../src/arena/props.js';
import { propManifest, loadPropModel, setPropAssetBase } from '../../../src/arena/propglb.js';
import { THEMES, themePropNames } from '../../../src/arena/themes.js';
import { Engine } from '../../../src/core/engine.js';
import { World } from '../../../src/game/world.js';
import { Input } from '../../../src/game/input.js';
import { Fighter } from '../../../src/combat/fighter.js';
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

  catalogue: {
    // ROSTER order is the game's own; `hidden` marks work-in-progress mechs
    // that the game hides until SETTINGS → SHOW ALL ROBOTS, but the
    // workbenches always show — iteration is the whole point of a workbench.
    list: () => ROSTER.map((m) => ({
      id: m.id,
      name: m.name,
      hidden: !!m.hidden,
      hasModel: !!manifest?.[m.id]?.url,
      hasAlt: !!manifest?.[m.id]?.alt?.url,
      hasRig: !!(manifest?.[m.id]?.rig || manifest?.[m.id]?.alt?.rig || rigFor(m.id)),
    })),
    get: (id) => ROSTER_BY_ID[id] || null,
    playable: () => playableRoster().map((m) => m.id),
    note: (id) => (rigIds().includes(id) ? '' : '  — no custom rig'),
  },

  variants: {
    // 'glb'  the shipped model · 'proc' the hand-sculpted body · 'alt' a
    // staged second build (a different GLB, or the same one on a new rig)
    list: (id) => [
      { key: 'glb', label: 'GLB', available: !!manifest?.[id]?.url },
      { key: 'proc', label: 'Procedural Robot', available: true },
      { key: 'alt', label: 'Alternate GLB', available: !!manifest?.[id]?.alt?.url },
    ],
    async build(id, { variant = 'glb', overrides = null } = {}) {
      const def = ROSTER_BY_ID[id];
      if (!def) return null;
      if (variant === 'proc') return buildMech(def);
      const built = await buildGlbForTool(def, overrides, { alt: variant === 'alt' });
      return built?.mech || null;
    },
    // the untouched asset — skin + rig work happens on private geometry, not
    // on the cached scene the game clones from
    raw: (id, { variant = 'glb' } = {}) => loadRawGlbScene(id, { alt: variant === 'alt' }),
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
      get: (id) => rigFor(id),
      ids: () => rigIds(),
      apply: applyCustomRig,
      setWeights,
      rebindRest,
      buildPosts: buildRigPosts,
    },
    save: (id, bones) => saveRigBones(id, bones),
  },

  anim: {
    clips: () => Object.keys(CLIPS),
    // the clips THIS mech can actually play, read off the real play sites —
    // vulcan's list carries his ult's hurricaneSpin and nobody else's
    clipsFor: (id, model) => mechClipList(ROSTER_BY_ID[id], model?.animProfile || profileFor(id)),
    clip: (name, model) => model?.animProfile?.clipOverrides?.[name] || CLIPS[name],
    compile: compileClip,
    animator: (model, id) => model.premadeAnimator || new Animator(model, ROSTER_BY_ID[id]),
    profile: (id) => profileFor(id),
    // a mech's authored rest stance (digitigrade legs etc.)
    restPose: (id) => ROSTER_BY_ID[id]?.restPose || null,
  },

  anchors: {
    uses: (id, name, available) => anchorUses(ROSTER_BY_ID[id], name, available),
    units: (model) => model.muzzleUnits || { joint: model.dims?.scale, bone: model.dims?.scale },
    // muzzles ride joints or bones; this is where the game keeps them
    save: (id, muzzles, { variant = 'glb' } = {}) => saveManifestPatch(
      variant === 'alt' ? { [id]: { alt: { muzzles } } } : { [id]: { muzzles } }),
  },

  skin: {
    analyze: analyzeSkin,
    apply: applySkinOps,
    compact: compactSkinOps,
    toJson: skinOpsToJson,
    blendPatch,
    weldedAdjacency,
    enclaveScan,
    ops: (id, { variant = 'glb' } = {}) => (entryOf(id, variant === 'alt')?.skinOps || []).map((o) => ({ ...o })),
    save: (id, ops, { variant = 'glb' } = {}) => saveManifestPatch(
      variant === 'alt' ? { [id]: { alt: { skinOps: ops } } } : { [id]: { skinOps: ops } }),
  },

  hurtbox: { build: buildHurtbox, pickStrikeLimb, MELEE, PART_TABLE },

  // ARENA PROPS — the OTHER family of models this game ships. Not characters:
  // no rig, no clips, no anchors, so they get their own small section rather
  // than a second catalogue. Everything here is derived from the live prop
  // table, the prop GLB manifest and the themes, so a prop added to
  // src/arena/props.js is in the props workbench on the next reload.
  props: {
    list: () => Object.keys(PROPS).map((name) => ({
      id: name,
      name,
      hasModel: !!propManifestData?.[name],
      themes: THEMES.filter((t) => themePropNames(t).includes(name)).map((t) => t.id),
    })),
    // the prop as the game builds it: a group of small sculpted meshes
    build: (name, opts = {}) => (PROPS[name] ? PROPS[name]({ seed: 12345, ...opts }) : null),
    // …and the same group after the draw-call merge the arena applies
    merge: (group) => mergePropMeshes(group),
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
    // stands on the stage is scaled and seated exactly like the in-game prop
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
