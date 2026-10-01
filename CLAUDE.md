# MECH MAYHEM — agent onboarding

Browser 3D mech arena fighter (Three.js + Vite, plain ES modules, no TS).
17 mechs (all playable — no `hidden` ones today), 12 destructible arenas,
local matches of up to 8 fighters (KB + Xbox pads + CPUs, split-screen per
human), AI opponents. Models are rigged
GLBs over a procedural parts-kit fallback; ANIMATION, textures and the SFX
fallback bank are all generated. Progress history: `TASKS.md`.

## Commands

- `npm run dev` → http://localhost:5173 · `npm run build` (must stay green)
- Headless screenshot: `node tools/shot.mjs "<url>" out.png <waitMs>` —
  SwiftShader runs the game ~20× slow; use waits from MECH_ART_GUIDE §4 and
  VIEW the images, don't assume.
- Combat crash soak: `node tools/soak.mjs "http://localhost:5173/?battle=neon&p1=titanus&p2=viper&auto=1&diff=ace"`
- NO-BROWSER CHECKS: `npm run check` (what CI runs before the build in
  `deploy.yml`) = `node tools/params.mjs` + `node tools/rigmirror.mjs` +
  `node tools/manifestfmt.mjs --check` (manifest.json is in its house style —
  write it through `formatManifest`, never an ad-hoc stringify) + `npm test`
  (`node --test test/*.test.mjs`, Node's own runner, no dependency — THE GLOB IS
  UNQUOTED ON PURPOSE, so the SHELL expands it into real paths: quoting it asks
  NODE to glob, which only works from Node 22, and CI ran Node 20 until
  `deploy.yml` was moved to 22, where the quoted form is read as one literal
  filename. That is what silently broke every deploy between Sept 1 and Sept 20
  — keep it unquoted so it works on either): roster ↔
  SPECIALS/ULTS/WEAPONS ↔ clips ↔ contract cross-references, the per-mech clip
  table (`workbench/adapters/mechclips.js`) against every clip a handler or
  finisher actually plays, badges/thumbnails on disk, every gait key in
  `GAIT_SCHEMA`, every roster/theme id and every literal `t('…')` has text,
  tuning's derived rates, the shipped levels through `themeFromLevel`. Pure
  data modules only — specials.js is read as SOURCE there because it imports
  the world. EVERY BROWSER TOOL launches through `tools/lib/browser.mjs`
  (`launch()` — SwiftShader args, `{gl:false}` for tools that never draw,
  `seedRandom(page)` before `goto` for a probe whose verdict must not vary
  run to run; wait for READINESS with `waitForFunction(fn, null, {timeout})` —
  the `null` is the `arg` slot, and `waitForFunction(fn, {timeout})` silently
  drops the timeout back to 30s —
  extra `args` appended); set `PW_CHROMIUM=<path to a Chromium/Chrome binary>`
  on a machine where it is not at `/opt/pw-browsers/chromium`.
- Debug URLs: `?showcase` (12-mech lineup) · `?showcase=<id>&anim=<clip|walk|none>`
  (single mech, judging camera) · `?battle=<arena>&p1=<id>&p2=<id>[&p3..p8][&auto=1][&diff=ace][&forcesplit=1[&humans=<n>]]`
  · `?rigtest` (GLB retarget math check) · `?showall=1` (force SETTINGS → SHOW
  ALL ROBOTS on for the session)
- Model set: the GLBs in `public/models/manifest.json` are the DEFAULT for
  every mech; `?debug=fallback` forces the procedural roster (also the
  automatic fallback for a mech with no manifest entry or a broken GLB).
  `?debug=3d` is the old opt-in flag and still means GLBs.
- Work-in-progress mechs: a roster def flagged `hidden: true` (NONE today —
  aegis and nova were the last two and are retired to `archive/mechs/`, so the
  roster is 17 and every one is playable) is kept out of the GAME's roster —
  mech select, RANDOM
  picks, CPU picks, title line-up — until SETTINGS → SHOW ALL ROBOTS is
  turned on (persisted in `rw.showAllRobots`). Every workbench (`?showcase`,
  `?rigedit`, pose/skin tools, `?battle=...`, the level editor) always sees
  the full `ROSTER`, so iteration is unaffected. Game code that offers mechs
  must go through `playableRoster()` / `isPlayable()` from `roster.js`.
- PARTICLE POOLS DO NOT RENDER UNDER SWIFTSHADER. The headless renderer clamps
  `gl_PointSize`, so every pooled effect — smoke, sparks, glows, flames, bats —
  is invisible in `tools/shot.mjs` and every screenshot tool, while meshes,
  instanced meshes and shader shells all draw normally. A screenshot showing
  "no effect" is therefore not evidence: measure a particle effect
  (`pool.liveCount()`, the emitted colours and positions) and save the pictures
  for the geometry.

## Where each system is explained

CLAUDE.md is the index. The per-system notes — what a mechanism is, why it is
that way, what measured it, which tool checks it — live in `docs/systems/`.
READ THE RELEVANT FILE BEFORE CHANGING A SYSTEM: most of what is written there
was learned by breaking it, and the measurements say what "working" means.

- **Workbenches** — `docs/systems/workbenches.md`
  - WORKBENCHES LIVE ON THEIR OWN PAGE
  - The workbench code is a separate tree
  - SKIN DEBUG (`/workbench/?edit=skindebug&mech=<id>`) is the AUDIT workbench
  - WORKBENCHES ON A PHONE
  - HOLD SHIFT AND THE TRANSFORM HANDLES GET OUT OF THE WAY
  - Every workbench side panel is RESIZABLE
  - The ANIMATION, POSE and COLLIDER workbenches (actions, clip keyframing, hurtboxes)
  - THE GAIT WORKBENCH
  - THE MANNEQUIN
  - Every mech dropdown goes through `subjectSelect`
  - THE WORKBENCHES ARE LISTED ONCE
  - THE POSE WORKBENCH'S KEY CLIPBOARD
  - THE RIG EDITOR'S **T POSE** box
  - WHICH WAY THE REFERENCE FACES
  - RIG EDITOR EDITS ARE DRAFTS
  - **JOINT OFFSET** mode in the rig editor authors `boneCorrections`
  - THE RIG EDITOR'S VIEW IS A PURE FUNCTION OF ITS DATA
  - THE JOINT YOU DRAG IS NOT ALWAYS THE TRACK YOU WRITE
  - NO WORKBENCH WRITES TO THE REPO
  - SKIN WORKBENCH **Debug output ▶** (a self-contained hand-off file)
  - Skin workbench selections
- **Animation and locomotion** — `docs/systems/animation.md`
  - WHICH WAY THE LEGS POINT is not always which way the body faces
  - GAITS ARE DATA
  - SOME LIMBS ARE CARRIED, NOT SWUNG (saurion's arms)
  - THE TAIL IS GAIT DATA
  - FENRIR'S GALLOP is a `quad` block over the biped layer
  - A fighter grown at RUNTIME must set `animator.sizeMul`
  - A CLIP'S `hit` EVENT MUST FIRE WHERE THE WEAPON IS, NOT WHERE THE KEY IS
  - TAUNTS ARE PER-MECH
  - A HELD CLIP IS AS STUCK AS A LOOPING ONE
  - SOME ARMS ARE WEAPONS HELD IN FRONT (`foreCarry`)
- **Combat** — `docs/systems/combat.md`
  - A RETREAT IS NOT A RUN
  - THE CROSSHAIR IS THE RANGED TARGET, AND THE CAMERA STICK IS WHAT MOVES IT
  - A FIRE BURNS ON A THING, NOT AT A COORDINATE
  - FLIGHT: THE BOOSTER FLAME COMES OUT OF ANCHORS
  - Hitboxes: `src/combat/hurtbox.js`
  - MELEE AUTO-AIM steers a live swing on BOTH axes, in `fighter.js`
  - POINT THE GUN AT WHAT YOU ARE SHOOTING AT
  - A BARREL MAY ONLY STEER A SHOT IF IT IS A MOUNT, NOT A HAND
  - RB AUTO-AIM: A PLAYER'S UNLOCKED SHOT FINDS AN ENEMY
  - A HULL-MOUNTED BARREL AIMS IN YAW ONLY
  - AN ULT IS A COMMITMENT, so `cancelOnMove` does not apply in the `ult` state
  - WRAITH'S ULT IS HIS TAUNT, CASHED IN
  - A SUMMON MAY ARRIVE ANYWHERE, AND MAY OUTLIVE ITS TIMER
  - A DARK VORTEX IS NOT A PORTAL
- **Surface walking** — `docs/systems/climbing.md`
  - SURFACE WALKING (`src/combat/climb.js`) — the field model, limbs, climb camera
- **Mech models (GLB pipeline)** — `docs/systems/models.md`
  - SKINNING A BONE CHAIN
  - WELDED PARTS
  - DROPPED GEOMETRY
  - ALTERNATE GLBs ARE GONE
  - A MIRRORED MAPPING IS THE ONE RIG ERROR THAT LOOKS ALMOST RIGHT
  - BONE ROTATION
  - FEATHERED SEAMS
  - A BROW HAS ONE HINGE, AND IT IS MEASURED
  - WHAT A GLB BUILD *MEASURES* IS A PROPERTY OF THE FILE, SO IT IS MEASURED ONCE
  - WHERE THE ANKLE BONE GOES
  - Paint jobs (`src/mechs/colorscheme.js`)
  - FIRE IN THE TEAM COLOUR
  - MECH ICONS ARE TWO THINGS, in two folders, and the split is the point
  - POSTERS (`public/posters/`, `src/ui/posters.js`)
  - BAKING A MECH
  - THE MECH DIET
  - A SESSION CACHE IS NOT AN ASSET
  - THE PORTABLE EXPORT
  - EXPORTING A PROCEDURAL ANIMATION SYSTEM has four rules
  - RENDERING (`CONFIG.rendering`, `?render=<mode>`: models / anime / fallback)
  - …AND NOTHING SHOULD BE ABOVE IT EITHER WHEN IT IS PRONE
  - A TAIL IS NOT A KICKSTAND AWAKE EITHER
  - NOTHING SHOULD BE UNDER THE FLOOR (`tools/groundprobe.mjs`, the floor guard)
- **Arenas** — `docs/systems/arenas.md`
  - A PROP'S COLLIDER IS ITS OWN SHELL
  - ARENA PROP COST
  - A PROP'S MODEL MUST FACE THE WAY THE PROP DOES
  - THE ARENA EDITOR BUILDS THE PROP THE GAME BUILDS, GLB included
  - ONE POINTER, ONE OWNER
  - AN ARENA IS A RECIPE UNTIL SOMEBODY AUTHORS IT
  - A MATCH IS FOUGHT IN THREE DIFFERENT CITIES
  - A MATCH OPENS ON A STAGE THAT IS READY
  - THE FOG IS THE COLOUR OF WHAT IS BEHIND IT
  - THE GROUND IS NOT A TABLE TOP (relief field + ground shader, `docs/GROUND_RELIEF.md`)
  - WEATHER ONLY WHERE THE SKY CAN CARRY IT (rain/snow/ash/sandstorms, `docs/WEATHER.md`)
  - NOT EVERY LARGE STRUCTURE IS A BUILDING
  - PER-CHUNK COLOUR NEEDS BOTH HALVES, and it was silently doing NOTHING
  - ORGANIC GROUND PATCHES
  - AN ARENA'S LAYOUT IS A DESIGN SYSTEM
  - THE ARENA EDITOR
- **Menus, match flow and HUD** — `docs/systems/game.md`
  - THE MENUS ARE PICTURES
  - TWO OR MORE PEOPLE IN A FIGHT OF THREE OR MORE PLAY A DIFFERENT GAME
  - THREE PLAYERS LEAVE A QUADRANT SPARE, AND THE STATS GO IN IT
  - UP TO EIGHT FIGHTERS
  - THE VISITOR COUNT
- **Sound** — `docs/systems/audio.md`
  - SOUND FX ARE RECORDED NOW, and the synth is the fallback — mix, loops, footsteps, arena bed, tab/focus handling

## Mech art pipeline — READ `docs/MECH_ART_GUIDE.md` FIRST

That guide is the master manual for turning concept images into in-game
mechs (both routes: external rigged-GLB services and the free in-engine
sculpted route), including **§5 THE CONTRACT** — per-mech joints/anchors
that combat silently depends on. Never rebuild a design without it.

## Where assets live — READ `ASSETS.md`

ONE RULE: an asset lives in `src/` when the code must ENUMERATE it at build
time, and in `public/` when the code FETCHES it by name at runtime. So the
TEXTURE PACK is `src/textures/<set>/<name>/` (globbed by `core/texload.js`,
which is what makes `hasTex()` a synchronous answer — `arena.js` and `pbrtex`
choose materials inline) and so is `src/music/`; models, levels, badges,
thumbs, posters and sound are `public/`, addressed by identity and mostly
carrying their own manifest.
`public/textures/` IS NOT READ — images put there are silently ignored and the
game renders its procedural fallback, which is how ten delivered facades once
sat doing nothing. The VFX sprite overrides moved into the pack for the same
reason (`src/textures/sprite/`, manifest imported, no runtime fetch).
NAMES THE GAME DECLARES ARE CHECKED OUT LOUD: `core/assetcheck.js` runs at
boot and `console.error`s any texture a theme or a structure kind names with
nothing behind it. Art that is requested-but-not-delivered is listed in
`PENDING_ASSETS` there — remove an entry when it lands and the check starts
guarding it; a pending entry that turns up IS reported, so the list cannot rot
into crying wolf. `node tools/assetcheck.mjs` is the same check from the
command line, plus a stray scan of the directories nothing reads.
`PENDING_ASSETS` CARRIES EXACTLY ONE ENTRY TODAY — `prop/prop_dino_egg`,
saurion's egg shell, painted procedurally until the art lands. Every other
texture the game declares is present, so every one of those is guarded and a
rename or a deletion is reported rather than silently falling back to
procedural.

## Architecture map

- SOUND: recorded effects over a synth fallback, the mix, loops, the arena bed —
  `docs/systems/audio.md`.
- `src/core/` — engine (renderer/loop/post-FX), pbrtex (PBR skin synth),
  textures (canvas tex), audio (WebAudio synth), music (the battle
  soundtrack: every file in `src/music/` is a song, listed by the `rw-music`
  vite plugin, filename = title — drop one in and it joins the rotation.
  STREAMED, not bundled: copied to `dist/music/`, fetched on demand.
  `?music=0` or a `RW_NO_MUSIC=1` build turns it off. A song in
  `src/music/arenas/` belongs to ONE ARENA — the filename names it ("Jungle
  Temple 1") — and that arena plays its own songs, shuffled with no repeats,
  instead of the general pool; an arena with none keeps the pool.
  `music.setArena(theme)` in startBattle is the whole hook, and the match is
  DERIVED from the name (case/punctuation dropped, trailing track number
  dropped, theme name AND id tried — so `Scrapyard 7.mp3` and
  `Scrapyard 7 2.mp3` both find an arena whose name ends in a digit). The
  order is a SHUFFLE BAG, not a fresh random pick, or a two-song arena would
  flip a coin every time). THE MENU THEME is a
  separate, fixed track — `public/sound/Bohemian Cello Flame Hybrid Suite.mp3`,
  named by `MENU_TRACKS` in music.js and played on a LOOP by a second
  `MusicPlayer` (`menuMusic` in boot.js) behind the title/select screens. The
  procedural sequencer's `menu` pattern is now the FALLBACK: it plays when
  <audio> is unavailable, the file 404s/fails to decode, or music is off. One
  volume slider drives both players: it writes the music bus
  (`CONFIG.musicVolume`) and the menu theme plays at a SHARE of it —
  `CONFIG.menuMusicMix` (0.5), a screen you read and talk over wanting less
  than a fight does — so the menus follow the slider down at their own level
  (`menuMusicVolume()`; a menu player never writes the bus)), utils.
  THREE TUNING LAYERS, don't confuse them: `tuning.js` = the GAMEPLAY DIALS
  every mech shares (stamina durations, pace, dash, guard arc, hit reactions
  — the file to edit for feel; costs are stated as SECONDS/fractions of a
  full bar and the per-second rates are derived), `config.js` = PLAYER
  settings the settings menu writes (robot speed, round time, music volume,
  persisted to localStorage), `mechs/roster.js` = PER-MECH balance.
  PUPPET ANY OF IT LIVE from the console — `rw.help()`: `rw.set(<path>, v)`
  lands on the next frame for CONFIG and TUNING alike (both are read at the
  point of use; fighter.js holds references to TUNING's GROUPS, so never
  replace a group object, only write into it); `rw.tune(<TUNING path>, v)`
  keeps an override for the whole session (`?tune=a.b:1,c.d:2` is the same
  thing in a URL, `rw.tunes()`/`rw.untune()` list and drop them). An UNKNOWN
  url param now warns with a did-you-mean instead of being ignored —
  `core/knobs.js` owns the list and `node tools/params.mjs` fails if it drifts
  from what the source actually reads.
- `src/mechs/` — roster.js (ALL stats/palettes/skins/moves — balance lives
  here), designs/<id>.js (one file per mech; parallel-agent-safe), parts.js
  (sculpting vocabulary + Assembler), factory.js (rig + materials),
  animations.js + animator.js (pose-blend engine), gltf.js + rigadapter.js
  (GLB loading + humanoid retargeting), signatures.js (per-mech motion applied
  last, over the shared gait/clip pipeline), colorscheme.js (the 11 paint jobs
  + the fire tint rule), contract.js (MECH_ART_GUIDE §5 as executable data,
  checked on every mech build), roster `skin` blocks drive pbrtex
- PER-ROUTE animation: when a move only works on ONE of a mech's two models,
  author it as a `GLB_CLIP_VARIANTS` entry compiled under the SHARED clip's name
  and point the mech's glbanim profile `clipOverrides` at it. The roster keeps the
  shared name, so every check keyed on `def.heavyClip`/`isPlaying`/the mirror
  alternation matches either build and the procedural one keeps the default.
  Colossus is the worked example (clap on the GLB, pound procedurally) — and note
  a clip in `SMASH_MIRRORS` needs its `*Mirror` name overridden too, or half the
  swings fall through to the shared clip
- `src/combat/` — fighter.js (state machine), specials.js (24 specials/ults
  by id), movekit.js (the shared move-building vocabulary the specials draw
  on), projectiles.js, effects.js (pooled VFX), poseshell.js (a mech FROZEN
  AND DETACHED — a throwaway copy of the body exactly as drawn this frame, free
  to be moved, scaled and faded while the real one keeps fighting. Both callers
  are wraith's: Ghost Protocol's gliding spectre and the loom taunt's departing
  giant. Note a SkinnedMesh's `matrixWorld` is NOT where its skin is drawn — the
  bone matrices already carry the mesh node's transform — so the skin is baked
  vertex by vertex; copying the matrix floats the copy metres off the ground)
- `src/arena/` — themes.js (12 arena configs), arena.js, destructible.js
  (instanced chunk buildings), props.js (placement + the PROPS table) over
  props/<arena>.js (each arena's builders; common/furniture/kit beside them)
- `src/game/` — boot.js (screen flow), world.js, battle.js (the match's own
  setup/teardown, incl. the per-round arena swap), match.js, camera.js
  (combine/split), input.js, ai.js, finisher/<id>.js (one cinematic finisher
  per mech; parallel-agent-safe), predict.js (menu-idle prefetch: pre-ROLLS
  the RANDOM arena / robots / next song so the menus can consume the same
  values it downloaded — `?prefetch=0` off); `src/ui/` — menus/<screen>.js
  (re-exported by menus.js), hud.js
- `src/core/text.js` — EVERY user-facing string, under a dotted id, pulled out
  with `t(id, params)`. Never write a player-visible literal in game code; mech
  and arena text is applied onto ROSTER/THEMES at import time, so gameplay code
  keeps using `def.name`. Also the whole translation surface.
- `public/models/manifest.json` — drop rigged GLBs here to override any
  mech's procedural model (auto-fallback if missing/broken)

## House rules

- Before committing: `git config user.email noreply@anthropic.com && git config user.name Claude`.
- Parallel agents may only fan out over the ONE-FILE-PER-THING trees:
  `src/mechs/designs/<id>.js`, `src/mechs/clips/<id>.js`,
  `src/game/finisher/<id>.js`, `src/arena/props/<arena>.js` and
  `src/arena/themes.js` — everything else is shared, single-writer.
- Verify visually (screenshots) before claiming art changes work; verify
  `npx vite build` + a soak before claiming combat changes work.
- RE-RIGGING NEVER LOSES ANCHORS. Muzzles/anchors in `manifest.json` are
  hand-placed by the owner: a new or edited rig re-expresses them on the new
  bones with the SAME rest-pose world position + aim, it never drops them or
  leaves them on stale numbers. Only a brand-new GLB with no authored muzzles
  may fall back to auto-generated ones. Prove it with
  `node tools/anchorkeep.mjs <id> --with patch.json` (`--remap R=<bone>,L=<bone>`
  emits the preserved numbers) — see MECH_ART_GUIDE §5.
- ALWAYS finish a task by merging your feature branch into `main` and
  pushing `main` — the owner plays off `main`, so work left on a branch is
  work they can't see. Push the branch too, then
  `git fetch origin main && git checkout -B main origin/main &&
  git merge --no-ff <branch>`, re-run the build, and push. (There is a
  stale local `main` with an unrelated history in some clones — always
  re-point at `origin/main` rather than trusting whatever `main` is
  checked out.)
