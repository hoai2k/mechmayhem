# ROBOTWORLD — web launch checklist (itch.io / any static host)

Written against the tree at `f9c041f`. Everything below was measured or read
out of this repo, not assumed. Items are grouped by *what stops a launch*
rather than by subsystem; the ordering inside each group is roughly the order
to do them in.

Current state of a production build (`npx vite build`, green as of writing):

| | size |
|---|---|
| `dist/` total | **286 MB** |
| `dist/models` (19 GLBs) | 120 MB |
| `dist/assets` PNG textures (116 files) | ~156 MB |
| `dist/assets` JS, all chunks | ~1.5 MB (≈400 kB gzip) |
| entry chunk | 6.8 kB |

The JavaScript is not the problem. The art payload is.

---

## 1. BLOCKERS — the game is not shippable to the public web without these

### 1.1 Cut the 286 MB payload

This is the single biggest launch risk. itch.io accepts uploads up to 1 GB, so
286 MB *uploads* fine — but a player on a normal connection stares at a canvas
for a long time before anything happens, and mobile Safari will run out of
memory before it finishes.

Where it goes:

- **Textures — ~156 MB, 116 PNGs in `src/textures/`.** The ground sets are
  2048² and cost 4.0–4.6 MB *each* for albedo and normal (`ground_scrapyard_dirt_albedo`
  is 4.6 MB alone); building sets are 1024² at 1.1–1.4 MB. They are loaded
  lazily per arena (`src/core/texload.js` globs with `query:'?url'`, so only
  URLs are eager) — but an arena still pulls tens of MB on entry.
  - Convert to **KTX2/Basis** and load with three's `KTX2Loader`. Typically
    6–10× smaller on disk *and* it stays compressed in VRAM, which is the
    bigger win on integrated GPUs and phones.
  - Cheaper interim: WebP or JPEG for albedo / rough / emissive (emissive maps
    are already only ~0.1 MB, leave them), keep normals at higher fidelity.
    Expect ~5× on the albedos with no code change beyond the file extension in
    `texload.js`'s glob.
  - Also worth checking whether any 2048² ground map actually reads as 2048 at
    game camera distance. Several probably do not.
- **GLBs — 120 MB, 19 files, 3–11 MB each** (`mech_saurion.glb` is 11 MB).
  These are uncompressed Tripo output.
  - Run **`gltf-transform` with Draco or meshopt** over `public/models/`.
    Geometry usually drops 5–10×. Verify per mech afterwards: the skinning is
    load-bearing here, so re-run `node tools/cliptear.mjs`, `node tools/hurtboxfit.mjs`
    and `node tools/anchorkeep.mjs <id>` on every compressed model before
    accepting it — quantization can move vertices, and hurtboxes are measured
    off geometry.
  - Register the decoder in `src/mechs/gltf.js` (`GLTFLoader.setDRACOLoader` /
    `setMeshoptDecoder`) and ship the decoder wasm from `public/`.
- **Drop what the shipped game never loads.** `mech_aegis.glb` (7.2 MB) and
  `mech_nova.glb` (3.3 MB) back the two `hidden: true` WIP mechs
  (`src/mechs/roster.js:72,147`), and `mech_aegis_alt.glb` + `mech_jerry_alt.glb`
  (6.4 MB) are workbench-only alternates. That is ~17 MB of dead weight in a
  public build — worth a build-time exclusion if AEGIS and NOVA stay hidden.

Target: get the whole thing under ~60 MB, with a first-arena working set under
~15 MB.

### 1.2 Handle WebGL failing

`src/core/engine.js:15` constructs `new THREE.WebGLRenderer(...)` with no
`try`/`catch` and no `webglcontextlost` listener. Today, a machine without
WebGL 2, a blocklisted driver, or a GPU process crash gives the player a black
rectangle and nothing else — which on itch reads as "the game is broken."

- Wrap renderer creation; on failure replace the canvas with a readable
  "ROBOTWORLD needs WebGL 2 — try Chrome/Edge, or enable hardware acceleration"
  panel.
- Add `canvas.addEventListener('webglcontextlost', ...)` (preventDefault + a
  "graphics context lost, reload" overlay) and ideally `webglcontextrestored`.
  Context loss is routine on mobile and on tab-switching with a big VRAM
  footprint — which this game has.
- Add a top-level `window.onerror` / `unhandledrejection` handler that shows a
  message instead of silently freezing.

### 1.3 First-paint loading state

The *per-battle* warm-up is genuinely good — `src/game/warmup.js` has a real
progress bar driven by the texture loader's live item count, plus a stall
watchdog. The gap is earlier: between page load and the title screen there is
nothing. `index.html` ships an empty `#ui-root`, `src/main.js` dynamically
imports `boot.js`, and `bootGame()` then `await`s the manifest before any
screen builds.

- Put a static logo + "LOADING" block directly in `index.html`'s `#ui-root`,
  removed by `bootGame()`. Zero JS, paints instantly, costs nothing.

### 1.4 Pause when the tab or embed is not visible

Only `src/game/input.js:59` reacts to `blur` (it clears held keys). There is no
`visibilitychange` handler, so a backgrounded tab keeps running the loop and
the audio. In an itch embed the player *will* scroll away mid-match.

- On `document.hidden`: pause the match (or at least stop rendering) and
  suspend the AudioContext; resume on return. `audio.resume()` already exists
  in `src/core/audio.js:124`.

### 1.5 Decide licensing, and check the model provenance

There is **no `LICENSE` file** in the repo.

- Pick a license for your own code.
- **three.js is MIT** — its copyright notice must accompany the distribution.
  Add a third-party notices file or a credits screen line.
- The GLBs were generated through Tripo (`tools/tripogen.mjs`,
  `tools/tripo-state.json`). **Read that service's terms before publishing,
  and especially before charging for the game or accepting donations** —
  generated-asset commercial rights vary by plan and change over time. This is
  the one item on this list that can force a takedown, so settle it first.
- Same check for anything non-procedural in `public/sprites/` (the fire, smoke,
  slime and ice atlases) and any font used in the UI.

---

## 2. SHOULD FIX — these cost you ratings, not the launch

### 2.1 Separate the dev surface from the shipped game

`src/main.js` statically imports `src/dev/index.js`, so every workbench route
ships in the public build as a lazy chunk: `?debug=skin`, `?debug=pose`,
`?debug=models`, `?debug=collider`, `?rigedit`, `?edit=level`, `?bake`,
`?showcase`, `?battle=...`. The entry itself is only 6.8 kB and the chunks are
never fetched unless someone types the URL, so this is a *choice*, not a bug.

- Gate the router on `import.meta.env.DEV` to keep authoring tools private and
  drop ~250 kB of chunks, **or** deliberately leave them in as an easter egg.
  Either is defensible; drifting into it by accident is not.
- The dev *save* endpoints are already safe: `vite.config.js`'s `devWriter()`
  is `apply: 'serve'`, so `/__rw/manifest`, `/__rw/rig` and `/__rw/changes`
  do not exist in a static build. Nothing to do, worth knowing.

### 2.2 Clean up the shipped SETTINGS menu

`src/game/boot.js:83-96` offers four items: SOUND, **INFINITE ULTIMATES**,
**SHOW ALL ROBOTS**, RELOAD.

- INFINITE ULTIMATES is a debug cheat. Keep it deliberately (labelled as a
  cheat/party option) or hide it.
- SHOW ALL ROBOTS un-hides AEGIS and NOVA, which are unfinished. If they ship
  hidden, a player who finds this toggle gets a WIP mech and blames the game.
  Hide the toggle in production builds, or finish both mechs.
- Missing and wanted: a **graphics quality option**. There is none today —
  `engine.js` hard-codes `pixelRatio` clamp 1–1.75, soft shadows, bloom, FXAA
  and a PMREM environment for everyone. A single LOW/MED/HIGH switch (pixel
  ratio, shadows off, bloom off) is the difference between "runs badly on my
  laptop, 2 stars" and "runs fine."

### 2.3 Teach the controls before the match, not during it

The controls sheet exists only in the pause menu (`pause.controls.html` in
`src/core/text.js:91`). The title menu is two items — BATTLE and FULLSCREEN
(`src/ui/menus.js:137`) — plus a one-line hint bar.

- Add HOW TO PLAY to the title menu, reusing the same HTML.
- Add a CREDITS entry while you are there (nothing exists today).
- Put the controls in the itch page description too; a lot of players never
  click into a menu.

### 2.4 Verify the solo experience

The game is built local-multiplayer-first, and itch traffic is overwhelmingly
one person alone at a keyboard. AI opponents across three tiers exist, but the
loop is: pick mech → pick arena → one fight → results.

- Play a full solo session and judge honestly whether there is a reason for a
  second fight. If not, the cheapest fix with the highest return is an arcade
  ladder (fixed sequence of AI opponents, escalating difficulty, a win screen)
  built on the existing match flow — plus a persisted best result in
  `localStorage`, which the codebase already uses for settings.

### 2.5 Test inside the itch iframe, not just at a URL

Several things behave differently embedded:

- **Gamepads** need the iframe focused before `navigator.getGamepads()` reports
  anything. Verify a pad works after a click into the frame; the title hint
  should say "click the game first."
- **Fullscreen** — `src/game/boot.js:198` calls `requestFullscreen()`, which
  needs the embedding iframe to permit it. Enable itch's *Fullscreen button*
  option and confirm both routes work.
- **Audio autoplay** — unlock is wired on the first `pointerdown`/`keydown`
  (`boot.js:50-52`), which is the correct pattern. Confirm it survives the
  embed, and leave itch's "automatically start on page load" **off** so the
  click-to-play is the unlock gesture.
- `base: './'` in `vite.config.js` is already right for itch's subpath serving.

### 2.6 Mobile: support it properly or say it is unsupported

There is real work here already — `src/game/touch.js`, `isTouchDevice()`
routing to a single-player layout, and a portrait rotate hint in `index.html`.
But a 286 MB payload plus this VRAM footprint is a genuine risk on iOS.

- Test on a real mid-range Android and a real iPhone. If it does not hold up,
  untick "Mobile friendly" on the itch page rather than shipping a bad first
  impression — and revisit after §1.1.

---

## 3. QA GATE — run all of this before you upload

- [ ] `npx vite build` green *(verified green at `f9c041f`)*.
- [ ] **Soak a matrix, not a pair.** `tools/soak.mjs` is currently run on one
      matchup. Before launch, sweep every mech against a couple of others
      across several arenas, at `diff=ace`, with ults enabled. A crash in a
      rare special is the most likely 1-star review this game will get.
- [ ] 4-player split screen on the heaviest arena, watching frame time — that
      is four viewports plus destructible chunk instancing, the true worst case.
- [ ] Browser pass: Chrome, Edge, **Firefox**, **Safari**. Safari is the usual
      outlier; the custom GLSL in `src/combat/fxglsl.js` and the effect passes
      are where it will break if it breaks.
- [ ] Low-end pass: integrated GPU at 1080p, and whatever the oldest machine
      you can find is.
- [ ] Fresh-profile pass with an empty `localStorage` (no `rw.muted`,
      `rw.showAllRobots`, camera layout key) — first-run is what every player
      sees and what you never test.
- [ ] Hard-refresh cold-cache load, timed, on a throttled connection. Write
      the number down; it is the number that decides whether people play.

---

## 4. STORE PAGE — the itch.io upload itself

- [ ] Zip **the contents of `dist/`** with `index.html` at the zip root; tick
      "This file will be played in the browser."
- [ ] Embed size 1280×720, Fullscreen button on, "automatically start" off.
- [ ] Description, controls section, tags (mech, fighting, local multiplayer,
      3D, controller).
- [ ] Screenshots — `docs/title.png`, `docs/mech-select.png`, the arena shots
      and `docs/split-screen.png` already exist and are the right ones.
- [ ] A short GIF or 30s video. On itch this matters more than the text.
- [ ] A visible **version string on the title screen** so bug reports are
      actionable.
- [ ] Decide free / donation / paid — and note that this decision depends on
      §1.5 being settled first.
- [ ] `.github/workflows/deploy.yml` still lists a stale feature branch
      (`claude/3d-mech-battle-game-uxps6q`) as a deploy trigger. Clean it up so
      the Pages build and the itch build come from the same place.

---

## Shortest path to a launchable build

If you want the minimum that is defensible rather than the whole list:

1. Compress textures (KTX2 or WebP) and Draco/meshopt the GLBs — §1.1.
2. WebGL failure + context-loss handling — §1.2.
3. Static loading block in `index.html` — §1.3.
4. Pause on `visibilitychange` — §1.4.
5. Settle the Tripo model license and add a LICENSE + three.js notice — §1.5.
6. HOW TO PLAY on the title menu — §2.3.
7. The soak matrix and the browser pass — §3.

Everything else is polish that can land in a post-launch update.
