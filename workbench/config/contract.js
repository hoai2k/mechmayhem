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
 *   raw(id, opts)     -> { scene, entry } — the untouched asset, for skin/rig
 *                        work. `opts.drops` also takes off the surplus
 *                        geometry the manifest deletes, so a tool that only
 *                        LOOKS at the model isn't showing lumps the game does
 *                        not build; a tool that applies skin ops itself leaves
 *                        it off and calls `skin.applyDrops` after its ops
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
 *   corrections       OPTIONAL — per-joint ROTATION offsets, the one rotation a
 *     rig can carry: a rest rotation on the bones themselves cancels out (the
 *     skin is rebound at rest AND the retarget captures a rest offset per bone),
 *     so a standing bias — "this thigh rests splayed" — has to be expressed as a
 *     fixed rotation applied AFTER the retarget instead. Leave the block out and
 *     the rig editor simply doesn't offer the mode.
 *       get(id, opts)              -> { joint: [x,y,z] } in degrees
 *       save(id, corrections, opts)-> persist them
 *
 * @property {Object} anim
 *   clips()           -> every clip name
 *   clipsFor(id)      -> the clips THIS subject can play, [{ name, role }]
 *   clip(name)        -> the clip data
 *   trackFor(joint, model, id) OPTIONAL — which clip TRACK drives this joint on
 *     this model, as { name, sign:[x,y,z] }. A game may not map clip channels
 *     1:1 onto joints: ROBOTWORLD's `mirrorArms` profiles play the right-arm
 *     tracks on the left arm (a weapon in the other hand), with yaw and roll
 *     negated. Any tool that edits clip data by DRAGGING A JOINT has to go
 *     through this, or it measures a delta in joint space and writes it into a
 *     track that drives a different limb. Leave it out and the mapping is the
 *     identity, which is what every ordinary rig wants.
 *   compile(clip)     -> runtime form
 *   animator(model)   -> an animator for a built model
 *   poses(id)         -> named starting poses
 *   locomotion        OPTIONAL — the walk/run cycle, for games that GENERATE it
 *     rather than key it. It is not a clip and has no keyframes: the animator
 *     builds it every frame from a gait PHASE that advances at whatever cadence
 *     the current ground speed needs. So it is offered as a scrubbable CYCLE —
 *     a phase, a period, and the per-frame ctx that drives it — which the pose
 *     tool lists beside the clips and freezes frame by frame, read-only. Leave
 *     the block out and the tool simply lists clips.
 *       list(id)                  -> [{ id, label, speed }] the gaits to offer
 *       ctx(id, modeId)           -> the update ctx that drives that gait
 *       period()                  -> radians in one full cycle
 *       phase(animator)           -> where the cycle is now
 *       step(animator, ctx, ph, dt) -> pose the model at EXACTLY phase ph
 *       run(animator, ctx, dt)    -> advance one real frame, returns the phase
 *
 * @property {Object} gait            LOCOMOTION as tunable data — the walk/run
 *                                    cycle a subject runs, named and SHARED
 *                                    (several subjects run the same gait, so a
 *                                    tuned gait moves all of them). Omit the
 *                                    section and ?edit=gait isn't offered.
 *   ids()             -> every gait name
 *   idFor(id)         -> the gait THIS subject runs
 *   users(gaitId)     -> the subjects that run it
 *   shipped(gaitId)   -> the gait as it ships (the diff/revert baseline)
 *   schema()          -> [{ id, label, params: [{ key, label, min, max, step,
 *                        joints[], help }] }] — the dials, so the tool builds
 *                        its own UI and can tell which dial moves a dragged limb
 *   baseOf(gaitId)    -> OPTIONAL — the gait this one is a VARIANT of, or null.
 *                        A game may build one gait out of another (a body that
 *                        jogs like a runner and gallops like a wolf is the
 *                        runner's gait plus a layer), and the panel has to say
 *                        so: a dial the base also owns moves both gaits.
 *   heirsOf(gaitId)   -> …and the variants built on this one
 *   clone / diff / format(gaitId, gait) -> copy · differences · source text
 *   install(animator, gait) -> run this (edited) gait on a live subject
 *   evaluate(gait, env)     -> what the gait does to a pose, used to solve "this
 *                        limb moved N radians" back into a dial AND to answer
 *                        "can this dial move this subject at all". Pass
 *                        `env.body` (below) and it runs the whole pose
 *                        pipeline, not just the shared table.
 *   body(id, animator) -> OPTIONAL — an opaque handle for `env.body`, naming the
 *                        SUBJECT the pose is being evaluated on. A gait is one
 *                        table shared by many bodies, but a pose is a pipeline
 *                        whose last passes are per-subject and may REPLACE what
 *                        the gait wrote rather than add to it. Without this the
 *                        tool measures the table and offers dials that cannot
 *                        move the model in front of you. Omit it and evaluate
 *                        ignores env.body, which is the old behaviour.
 *   phaseRate(gait, {…}) -> gait phase advance per second, for a frozen preview
 *   topSpeed(id, {game, sprint}) -> the game's real top locomotion speed
 *
 * @property {Object} reference       a REFERENCE BODY a tool can stand beside
 *                                    (or instead of) the thing being edited —
 *                                    this game's is a mannequin on the same 15
 *                                    joints, which is what makes "where does
 *                                    the ankle bone go" answerable. Omit it and
 *                                    the tools that offer it just don't.
 *   mannequin(height) -> model, canonically proportioned at that total height
 *   labels(model, {size}) -> a group of named joint dots, parented to its bones
 *   tints()           -> the per-bone colour vocabulary (warm = left, cool = right)
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
 * @property {Object} props           a SECOND family of models: scenery, not
 *                                    characters — no rig, no clips, no anchors,
 *                                    so it gets its own section rather than a
 *                                    second catalogue. Omit it and ?edit=props
 *                                    simply isn't offered.
 *   list()            -> [{ id, name, hasModel, themes[] }] (the tool shows
 *                        only the hasModel entries — imported models are the
 *                        ones with an original to compare against)
 *   load(name, which) -> imported model, 'optimized' | 'source'
 *   url(name, which)  -> where that file lives, for size/probing
 *   entry(name)       -> its manifest entry
 *
 * @property {Function} [reload]      re-read the authoring sources (manifest,
 *   cached assets) and return the fresh manifest — what a "load from manifest"
 *   button calls so a save made in another tool shows up without a reload. An
 *   adapter whose data is never edited out from under it may leave it out.
 *
 * @property {Object} skin            skin-repair engine (islands, ops, patches)
 *   analyze(mesh)     -> the bone-island partition the tool works in
 *   apply(mesh, ops)  -> weights rewritten by a list of ops
 *   compact(ops)      -> the ops list with no-ops dropped
 *   pin(ops, analysis)-> the same ops with island ordinals resolved to vertex
 *                        lists; REQUIRED on everything the tool saves or
 *                        exports, since `{comp:N}` is only meaningful against
 *                        the rig it was authored on
 *   toJson(ops, ind)  -> the manifest text for a skinOps array
 *   blendPatch / weldedAdjacency / enclaveScan — selection helpers
 *   ops(id, opts) / seamCuts(id, opts) / save(id, ops, opts)
 *   applyDrops(mesh, id, opts) -> the manifest's dropGeo/dropBones applied to a
 *                        mesh the tool owns. Call it AFTER the ops and the
 *                        island partition, which is the order the game uses —
 *                        an island ordinal is drawn on the undropped mesh
 * @property {Object} arena          a THIRD family after characters and props:
 *                                  the PLACES a match happens in. An arena is
 *                                  not an asset but a RECIPE — a theme plus a
 *                                  seed that generates one particular city — so
 *                                  what an editor needs is "build one of these,
 *                                  and tell me what you built". Omit the
 *                                  section and ?edit=level isn't offered.
 *   version           -> the level format's version number
 *   themes()          -> [{ id, name }] the arenas this game ships
 *   tints(id) / bridgeColor(id) -> per-theme defaults a new object is seeded with
 *   blank(id)         -> an empty level on that theme
 *   build(engine, id, seed) -> a REAL arena, built the way a match builds it.
 *                        The caller disposes it. This is what makes editing a
 *                        shipped arena possible without a second copy of the
 *                        generation rules living in the tool.
 *   bake(arena, {name}) -> that arena as an editable level
 *   stage(engine, level) -> the same themed environment with NOTHING placed in
 *                        it — sky, lights, ground, exposure — because
 *                        everything placed is an editor proxy the tool owns
 *   palette() / paletteEntry(id) / swatches() -> WHAT can be placed
 *   prop(name, opts)  -> a stand-in for one placed thing
 *   sharedMaterials() -> materials the editor must never dispose
 *   levels.list() / levels.load(name) -> authored level files
 *   authoredLevel(id) -> the level file this arena SHIPS AS, or null when the
 *                        game generates it. An arena that has been authored is
 *                        opened from that file rather than baked from a seed:
 *                        the tool must edit what the game plays, or a save
 *                        silently reverts somebody's hand-built city to a
 *                        procedural roll of it.
 *   fighters()        -> who can be dropped into a playtest
 *   playtest(level, {p1,p2}) -> hand the level to the game; returns the url
 *
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
