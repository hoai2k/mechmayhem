# ROBOTWORLD — agent onboarding

Browser 3D mech arena fighter (Three.js + Vite, plain ES modules, no TS).
12 mechs, 12 destructible arenas, 4-player local multiplayer (KB + Xbox
pads), AI opponents, procedural everything (models, textures, animation,
audio). Progress history: `TASKS.md`.

## Commands

- `npm run dev` → http://localhost:5173 · `npm run build` (must stay green)
- Headless screenshot: `node tools/shot.mjs "<url>" out.png <waitMs>` —
  SwiftShader runs the game ~20× slow; use waits from MECH_ART_GUIDE §4 and
  VIEW the images, don't assume.
- Combat crash soak: `node tools/soak.mjs "http://localhost:5173/?battle=neon&p1=titanus&p2=viper&auto=1&diff=ace"`
- Debug URLs: `?showcase` (12-mech lineup) · `?showcase=<id>&anim=<clip|walk|none>`
  (single mech, judging camera) · `?battle=<arena>&p1=<id>&p2=<id>[&p3..p4][&auto=1][&diff=ace][&forcesplit=1]`
  · `?rigtest` (GLB retarget math check) · `?showall=1` (force SETTINGS → SHOW
  ALL ROBOTS on for the session)
- WORKBENCHES LIVE ON THEIR OWN PAGE: `/workbench/?edit=<tool>&mech=<id>` —
  `animation` (procedural-vs-GLB action comparison + anchor editor),
  `pose` (joints + clip keyframes), `skin` (bone-island repair), `rig`
  (hand-placed skeletons), `hurtbox` (what combat hits). `&variant=alt`
  (legacy `&alt=1`) opens a mech's alternate build. The OLD urls
  (`?debug=models|pose|skin|collider`, `?rigedit=<id>`) still work — they
  redirect, carrying their params, so every tools/*.mjs script and bookmark is
  unaffected.
- The workbench code is a separate tree (`workbench/`) that knows the game
  ONLY through a config object: `workbench/config/contract.js` documents the
  whole surface, `workbench/adapters/robotworld/` fills it in by DERIVING from
  live game data (roster, clips, joint order, rig registry, manifest) — add a
  mech or a clip and the workbenches pick it up with no edit there.
  `node tools/wbconfig.mjs` proves nothing has been hand-copied. Tools under
  `workbench/tools/` import no game code at all. See `workbench/README.md`.
- Every workbench side panel (skin/models/pose/collider/rigedit + the level
  editor's two) is RESIZABLE: drag its outer edge, double-click the handle to
  reset, width remembered per tool (`src/dev/panelui.js`, which also styles
  their scrollbars). Widen it when a bone/op name ellipsizes.
- Workbenches: `?debug=models[&mech=<id>]` — procedural-vs-GLB ACTION
  comparison (trigger any move on both at once, slow-mo, live anchor editor).
  `?debug=pose[&mech=<id>][&model=glb|proc][&clip=<name>][&key=<n>|&t=<s>]` —
  pose a single mech by joint: load one of THAT mech's own clip poses as a
  starting point,
  CLICK A JOINT IN THE VIEWPORT (the dots, or just the body part — nearest
  joint wins; R/T rotate/translate, G local/world, Esc deselect) and drag the
  gizmo. It EDITS THE CLIP, not just a pose: the loaded clip becomes its authored
  key list again, a drag is written into whichever key you're parked on, and the
  scrubber plays YOUR version back. Drag the scrubber and clip time runs smoothly
  (the motion preview); let go and it SNAPS to the nearest key, since a key is the
  only place an edit can be stored — between keys the readout says `between keys`
  and nothing is editable. ◀ key / key ▶ step them, key times are listed under the
  slider, `&key=<n>`/`&t=<s>` deep-link one, and it opens on the LAST key (the
  held pose of a hold/loop clip, the RECOVERY of a one-shot strike). The KEY
  TRACK under the scrubber edits the key LIST itself: DRAG a diamond to move
  that key in time (clamped between its neighbours), RIGHT-CLICK bare track for
  "New keyframe" (born EMPTY, so it changes nothing until you drag a joint on
  it), RIGHT-CLICK a diamond or press DEL/BACKSPACE to delete it. Amber = the
  selected key, green = differs from the shipped clip; all of it is undoable
  and reported in the export (`movedFrom`, `addedKey`, `deletedKeys`). An edit is
  stored as the DELTA you dragged applied to what the key AUTHORS — never the
  on-screen numbers assigned outright, since signature motion and rest bias ride
  on top of those — and keys stay SPARSE, so only the joints you touched are
  added. "Revert clip edits" restores the shipped clip. "Copy pose" then exports
  the WHOLE key list: `keys[]` with a per-joint `changed: {from, to}` on each
  edited key, `editedKeys`, and `js` — the key list already formatted for
  `animations.js`. UNDO/REDO (Ctrl/⌘+Z · Ctrl/⌘+Shift+Z or Ctrl+Y, plus buttons)
  covers every edit, reset and clip swap; steps are deduped by content, so
  scrubbing and key-stepping never flood the stack, and a mech/GLB/alt rebuild
  clears it (different rig, so old transforms mean nothing).
  "Bind patch" emits the GLB manifest
  `boneCorrections`/`bonePos`. "Apply constraints" (default on) is the
  animation framework's rule — rotation only, hips may also translate — so
  limbs can't be stretched into a pose no clip could reproduce.
  `?debug=collider[&mech=<id>][&model=glb|proc][&clip=<name>][&at=hit]
  [&dummy=<dist|0>][&ball=0]` — what combat actually HITS: the measured
  hurtbox capsules (green), the legacy `hitRadius` ball they replaced (red),
  and the swept striking limb at a clip's hit frame (yellow), against a
  second mech at an adjustable distance. `contain`/`bloat` in the readout
  are the fit metrics; `node tools/hurtboxfit.mjs` prints them for the whole
  roster on both routes, and `node tools/hitprobe.mjs "<battle url>"` reports
  the new melee test against the old one on a real fight.
- Alternate GLBs: a manifest entry may carry a standalone `alt` sub-entry —
  a second model, or the same model on a staged custom rig. `?debug=skin`,
  `?debug=pose`, `?debug=collider` and `?rigedit` all show an **Edit
  Alternate GLB** checkbox for any mech that has one (off by default;
  `&alt=1` in the URL; `?debug=models` reaches the same build through its
  COMPARE TO dropdown, which stands alt beside the primary). When a mech's
  custom rig lives ONLY on its `alt` (inferno, rhino), `?rigedit=<id>` opens
  that build instead of refusing, with the box ticked and disabled. Shared
  logic: `src/dev/altpick.js`.
- Workbench chrome is shared: `src/dev/panelui.js` owns the resizable panel,
  its scrollbars AND the coloured title bar every workbench wears (pose
  green · skin orange · animation purple · rig blue · hurtbox cyan, with a
  live `mech · ALT · GLB` subtitle) — add a tool to `WORKBENCHES` and pass
  `workbench:'<id>'` to `setupDevPanel`. `src/dev/mechpick.js` owns the mech
  dropdown: `mechSelect()` for tools that rebuild in place, `gotoMech()` for
  `?rigedit`, which builds its world around one id and so switches by
  navigating.
- SAVING FROM A WORKBENCH (dev server only): `?debug=skin` has **Save to
  manifest** and `?rigedit` has **Save rig to file** — they write
  `public/models/manifest.json` / `src/mechs/rigs/<id>.rig.js` on this machine
  through `POST /__rw/manifest` / `/__rw/rig` (vite.config.js). Both SPLICE:
  `tools/manifestfmt.mjs` replaces one value in the JSON text, `tools/rigfmt.mjs`
  replaces only the `bones` array and keeps the header, `skinSpan`/`cutWelds`
  and the in-array comments. Saving is local — **Export uncommitted saves**
  (both tools, enabled only when the tree is dirty) downloads every uncommitted
  change as ONE `git apply`-able patch to hand over for committing.
- Skin workbench selections: click = the bone-island under the cursor ·
  SHIFT-click = the BLEND PATCH (the run of geometry sharing that vertex's own
  bone plus a minority weight on another — the bit of torso that wiggles with
  an arm) · `Absorb enclaves` (E) hands every limb-bound island that sits
  inside another bone's region to the bone around it (`skinops.enclaveScan`).
  PAINT GEOMETRY (P) has three brushes: S/M/L round brush · **Loop** (screen
  lasso, paints the region verts you can SEE inside it) · **Slice** (the same
  lasso cutting THROUGH the model — near side, far side and anything buried
  between, for geometry you'd otherwise have to orbit around; the outline
  draws amber instead of violet to say so).
- A fighter grown at RUNTIME (colossus' COLOSSAL FORM ult scales him 4×) must
  tell the animation layer: `animator.sizeMul = <factor>`. Everything in
  animator.js is authored in the model's own local units, so without it the
  legs keep their small-body TIMING over four times the distance — four
  strides per stride's worth of ground, feet skating and jump-cutting. It
  scales the walk cadence (full 1/sizeMul — a planted foot must sweep at
  ground speed), the leg smoothing + a hard angular cap (1/√sizeMul — dynamic
  similarity: big limbs swing slower), and the pelvis foot-follow, whose
  world-measured clearance has to be divided back into local units or the
  correction loop runs at gain × sizeMul and rings. Measure any of it with
  `node tools/footprobe.mjs <mech> <scale>`.
- Hitboxes: `src/combat/hurtbox.js`. Bone-bound capsules measured off each
  model's own geometry, so they follow the animation; melee resolves on the
  striking hand/foot (clip `strikeArm` / `strikeLimb`, else the extremity
  leading furthest forward), and bullets/beams test the swept segment.
  `Fighter.hitRadius` is unchanged and still owns AoE falloff + broad phase.
- Work-in-progress mechs: a roster def flagged `hidden: true` (currently
  AEGIS + NOVA) is kept out of the GAME's roster — mech select, RANDOM
  picks, CPU picks, title line-up — until SETTINGS → SHOW ALL ROBOTS is
  turned on (persisted in `rw.showAllRobots`). Every workbench (`?showcase`,
  `?rigedit`, pose/skin tools, `?battle=...`, the level editor) always sees
  the full `ROSTER`, so iteration is unaffected. Game code that offers mechs
  must go through `playableRoster()` / `isPlayable()` from `roster.js`.
- Model set: the GLBs in `public/models/manifest.json` are the DEFAULT for
  every mech; `?debug=fallback` forces the procedural roster (also the
  automatic fallback for a mech with no manifest entry or a broken GLB).
  `?debug=3d` is the old opt-in flag and still means GLBs.
- Level builder: `?edit=level` (place/move buildings, props, terrain + export)
  · `?edit=level&load=<name>` edits `public/levels/<name>.json` ·
  `?battle=<theme>&level=<name>` plays an authored level. Editor: `src/editor/`,
  loader + authored-placement format: `src/arena/level.js`.

## Mech art pipeline — READ `docs/MECH_ART_GUIDE.md` FIRST

That guide is the master manual for turning concept images into in-game
mechs (both routes: external rigged-GLB services and the free in-engine
sculpted route), including **§5 THE CONTRACT** — per-mech joints/anchors
that combat silently depends on. Never rebuild a design without it.

## Architecture map

- `src/core/` — engine (renderer/loop/post-FX), pbrtex (PBR skin synth),
  textures (canvas tex), audio (WebAudio synth), utils
- `src/mechs/` — roster.js (ALL stats/palettes/skins/moves — balance lives
  here), designs/<id>.js (one file per mech; parallel-agent-safe), parts.js
  (sculpting vocabulary + Assembler), factory.js (rig + materials),
  animations.js + animator.js (pose-blend engine), gltf.js + rigadapter.js
  (GLB loading + humanoid retargeting), roster `skin` blocks drive pbrtex
- PER-ROUTE animation: when a move only works on ONE of a mech's two models,
  author it as a `GLB_CLIP_VARIANTS` entry compiled under the SHARED clip's name
  and point the mech's glbanim profile `clipOverrides` at it. The roster keeps the
  shared name, so every check keyed on `def.heavyClip`/`isPlaying`/the mirror
  alternation matches either build and the procedural one keeps the default.
  Colossus is the worked example (clap on the GLB, pound procedurally) — and note
  a clip in `SMASH_MIRRORS` needs its `*Mirror` name overridden too, or half the
  swings fall through to the shared clip
- `src/combat/` — fighter.js (state machine), specials.js (24 specials/ults
  by id), projectiles.js, effects.js (pooled VFX)
- `src/arena/` — themes.js (12 arena configs), arena.js, destructible.js
  (instanced chunk buildings), props.js
- `src/game/` — boot.js (screen flow), world.js, match.js, camera.js
  (combine/split), input.js, ai.js; `src/ui/` — menus.js, hud.js
- `public/models/manifest.json` — drop rigged GLBs here to override any
  mech's procedural model (auto-fallback if missing/broken)

## House rules

- Before committing: `git config user.email noreply@anthropic.com && git config user.name Claude`.
- Parallel agents may only fan out over `src/mechs/designs/<id>.js` and
  `src/arena/{themes,props}.js` — everything else is shared, single-writer.
- Verify visually (screenshots) before claiming art changes work; verify
  `npx vite build` + a soak before claiming combat changes work.
- RE-RIGGING NEVER LOSES ANCHORS. Muzzles/anchors in `manifest.json` are
  hand-placed by the owner: a new or edited rig re-expresses them on the new
  bones with the SAME rest-pose world position + aim, it never drops them or
  leaves them on stale numbers. Only a brand-new GLB with no authored muzzles
  may fall back to auto-generated ones. Prove it with
  `node tools/anchorkeep.mjs <id>` (`--remap R=<bone>,L=<bone>` emits the
  preserved numbers) — see MECH_ART_GUIDE §5.
- ALWAYS finish a task by merging your feature branch into `main` and
  pushing `main` — the owner plays off `main`, so work left on a branch is
  work they can't see. Push the branch too, then
  `git fetch origin main && git checkout -B main origin/main &&
  git merge --no-ff <branch>`, re-run the build, and push. (There is a
  stale local `main` with an unrelated history in some clones — always
  re-point at `origin/main` rather than trusting whatever `main` is
  checked out.)
