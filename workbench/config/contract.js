// THE WORKBENCH CONTRACT — everything the tools are allowed to know about a game.
//
// The workbenches (animation, pose, skin, rig, collider) are model-authoring
// tools. Nothing in workbench/tools/ imports from src/: they read this config
// object instead, and ONE adapter per game fills it in
// (workbench/adapters/robotworld/). Porting the tools to another game is
// therefore writing a second adapter — not editing five tools.
//
// Two rules the adapter must honour, because they are what make the tools
// stay correct as the game grows:
//
//  1. DERIVE, DON'T DUPLICATE. Every list here is a function, and the
//     robotworld adapter answers each one by reading live game data (the
//     roster, the clip table, the joint order, the model manifest). Add a mech
//     or a clip to the game and it shows up in the workbenches with no edit
//     here. A static copy of those lists would rot the first time someone adds
//     a robot.
//  2. CAPABILITIES, NOT INTERNALS. The tools never touch an engine class; they
//     call the functions below. That is what lets a different game supply a
//     different engine.
//
// VOCABULARY is data too. This game calls its models "mechs" and offers a
// hand-sculpted "procedural" build beside the imported GLB — both are choices,
// not facts, so they live in `vocab` and `variants` rather than in the tools'
// strings.

/**
 * @typedef {Object} WorkbenchConfig
 *
 * @property {string} game            id of the game this config describes
 * @property {Object} vocab           what this game calls things:
 *   { subject, subjects, Subject, Subjects }  e.g. mech / mechs / Mech / Mechs
 *
 * @property {Object} catalogue       WHAT can be edited
 *   list()            -> [{ id, name, hidden, hasModel, hasAlt, hasRig }]
 *   get(id)           -> one entry (or null)
 *   note(id)          -> short suffix for pickers ("— no custom rig")
 *
 * @property {Object} variants        WHICH BUILD of a subject stands on the stage
 *   list(id)          -> [{ key, label, available }]  ('glb' | 'proc' | 'alt' | …)
 *   build(id, opts)   -> model            (opts: { variant, overrides })
 *   raw(id, opts)     -> { scene, entry } — the untouched asset, for skin/rig work
 *   groundHeight(m)   -> number           — measured rendered height, for framing
 *
 * A MODEL is the one shape the tools do assume, because it is the shape a
 * skinned character has anywhere: { group, joints, boneMap, rigBones, anchors,
 * dims, animator? }. An adapter that has no equivalent for a field leaves it
 * undefined and the tools degrade (no anchors -> no anchor editor).
 *
 * @property {Object} rig
 *   joints            -> canonical joint names, in order
 *   custom.get(id)    -> hand-authored rig data | null
 *   custom.ids()      -> ids that have one
 *   custom.apply(mesh, rig) / setWeights / rebindRest / buildPosts
 *   save(id, bones)   -> persist a rig
 *
 * @property {Object} anim
 *   clips()           -> every clip name
 *   clipsFor(id)      -> the clips THIS subject can play, [{ name, role }]
 *   clip(name)        -> the clip data
 *   compile(clip)     -> runtime form
 *   animator(model)   -> an animator for a built model
 *   poses(id)         -> named starting poses
 *
 * @property {Object} actions         the "trigger this move" buttons
 *   list()            -> [{ id, label, hold }]
 *   fire(stage, id)   -> make it happen on the stage's subject
 *
 * @property {Object} anchors         attachment points combat reads
 *   uses(id, name, available) -> { role, uses[], notes } — what it drives
 *   units(model)      -> { joint, bone } scale factors for authored numbers
 *   patch(model, …)   -> the persistable form of the current anchors
 *
 * @property {Object} skin            skin-repair engine (islands, ops, patches)
 * @property {Object} hurtbox         hit-volume measurement
 * @property {Object} stage           a live 3D scene with the game's own loop
 * @property {Object} persist         where edits go: manifest / rig / changes
 */

const REQUIRED = ['game', 'vocab', 'catalogue', 'variants', 'rig', 'anim', 'persist'];

/**
 * Validate + freeze a config. Called by the adapter, so a half-written adapter
 * fails loudly at load instead of as `undefined is not a function` three
 * clicks into a tool.
 */
export function defineWorkbenchConfig(cfg) {
  const missing = REQUIRED.filter((k) => !cfg?.[k]);
  if (missing.length) throw new Error(`workbench config is missing: ${missing.join(', ')}`);
  for (const [k, fns] of Object.entries({
    catalogue: ['list', 'get'],
    variants: ['list', 'build'],
    anim: ['clips', 'clipsFor'],
  })) {
    for (const fn of fns) {
      if (typeof cfg[k][fn] !== 'function') throw new Error(`workbench config: ${k}.${fn}() must be a function`);
    }
  }
  return Object.freeze(cfg);
}

/** Convenience: "mech" / "mechs" with the right case, from vocab. */
export function say(cfg, key) { return cfg.vocab?.[key] ?? key; }
