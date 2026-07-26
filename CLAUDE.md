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
  · `?rigtest` (GLB retarget math check) · `?rigedit=<id>` (edit a mech's
  hand-authored rig, `src/mechs/rigs/<id>.rig.js`) · `?showall=1` (force
  SETTINGS → SHOW ALL ROBOTS on for the session)
- Workbenches: `?debug=models[&mech=<id>]` — procedural-vs-GLB ACTION
  comparison (trigger any move on both at once, slow-mo, live anchor editor).
  `?debug=pose[&mech=<id>][&model=glb|proc][&clip=<name>]` — pose a single
  mech by joint: load one of THAT mech's own clip poses as a starting point,
  drag joints, "Copy pose" emits a clip-key pose block in degrees (paste
  straight into `animations.js`), "Bind patch" emits the GLB manifest
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
- ALWAYS finish a task by merging your feature branch into `main` and
  pushing `main` — the owner plays off `main`, so work left on a branch is
  work they can't see. Push the branch too, then
  `git fetch origin main && git checkout -B main origin/main &&
  git merge --no-ff <branch>`, re-run the build, and push. (There is a
  stale local `main` with an unrelated history in some clones — always
  re-point at `origin/main` rather than trusting whatever `main` is
  checked out.)
