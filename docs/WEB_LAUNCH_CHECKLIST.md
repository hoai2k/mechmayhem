# ROBOTWORLD — web launch checklist (itch.io / any static host)

Everything below was measured or read out of this repo, not assumed. Items are
grouped by *what stops a launch* rather than by subsystem.

**Status: the section 1 blockers are done.** What remains is section 2 polish,
the section 3 QA gate, and the store page. One decision is still the owner's:
the project's own license.

*(The AEGIS/NOVA question below is settled — both were RETIRED to
`archive/mechs/` rather than finished. The roster is 17, no mech carries
`hidden: true`, and SHOW ALL ROBOTS therefore un-hides nothing today. The
toggle is harmless as shipped, and the notes are left in place because they
still describe what to do the next time a WIP mech exists.)*

## Building the thing you upload

```bash
npm run dist:web        # → dist-web/, ~97 MB
```

`npm run build` still produces the ordinary two-page dev build (game +
`/workbench/`) and is unchanged. `npm run dist:web` (`tools/dist.mjs`) branches
a *distribution* off the tree without modifying a byte of it:

- builds with `RW_DIST=1`, which drops the `/workbench/` page from the build
  inputs and compiles out the `?debug=` / `?showcase` / level-editor routes —
  48 JS chunks become 2, and the authoring surface is absent rather than merely
  unlisted
- drops models the shipped game cannot reach: the `hidden: true` mechs and the
  workbench-only `alt` sub-entries, rewriting `manifest.json` in the output only
- quantizes (16-bit) and meshopt-compresses every surviving GLB, verifying each
  rig is untouched
- transcodes the PNG texture pack to WebP and rewrites the hashed references in
  the emitted JS

| | before | after |
|---|---|---|
| total | 302 MB | **97 MB** |
| models | 104 MB (19 files) | 53 MB (15 files) |
| textures | 163 MB (114 PNGs) | 28 MB (WebP) |
| JS chunks | 48 | 2 (1.5 MB) |

Source masters in `public/models/` and `src/textures/` are never touched, so
every workbench, `anchorkeep`, `hurtboxfit` and `cliptear` keep working against
uncompressed geometry.

### On quantization, and what is still left off

Models are quantized to 16 bits and meshopt-compressed. That is only safe
because of `src/mechs/dequantize.js`, which folds the quantization back into
the vertices at load — read that file's header before changing anything here.
The short version: quantization does not just shrink the stored numbers, it
rescales them and compensates by folding a matrix into the skin's **inverse
bind matrices**. Rendering goes through exactly that product and looks perfect;
everything that reads geometry directly — hurtbox measurement, the custom-rig
rebind, skinOps, anchors — does not, and is silently wrong. Before the fold
existed, a quantized roster built at exactly 2× size with colossus' containment
at 57% and both thigh capsules gone.

**meshopt's `reorder` pass is still deliberately off**, and it is the last
~23 MB on the table. `src/combat/hurtbox.js` samples every Nth vertex *in file
order*, so shuffling the order re-rolls which vertices the capsule fits see.
Vertex counts are unchanged — it is purely sampling — but the fits move
(colossus bloat 1.26× → 2.13×). Enabling it means making the sampling
order-independent, which re-measures hitboxes across the whole roster: a
balance change, and its own task.

Bit depth is 16 rather than the gltf-transform defaults. At default depths
cranky, frogger, inferno and tempest drift by about a point of containment and
~0.03 bloat; at 16 bits every shipped mech is byte-identical through
`hurtboxfit` except tempest (+1% containment, +0.01 bloat). The extra ~6 MB
buys a much stronger claim.

One caveat worth stating plainly: because the fold converts attributes back to
float32 at load, quantization saves **download**, not **VRAM**. Runtime memory
is what it always was. KTX2 for the textures remains the change that would
actually reduce GPU memory.

---

## 1. BLOCKERS — DONE

All five are resolved. Kept here with what was actually done, because the
reasoning matters more than the checkmarks.

### 1.1 The payload ✅ 302 MB → 97 MB

Solved by `npm run dist:web` — see *Building the thing you upload* above for
the breakdown, the quantization fold that made models safe to shrink, and the
~23 MB still left on the table behind vertex reorder.

Still open if you want to go further: **KTX2/Basis instead of WebP.** WebP
shrinks the download but decodes to full-size RGBA in VRAM; KTX2 stays
compressed on the GPU, which is the constraint that actually bites on
integrated graphics and phones. Worth doing if mobile support is a goal, and it
would also reduce context-loss risk. And several 2048² ground maps probably do
not read as 2048 at game camera distance — halving those is free.

### 1.2 WebGL failure ✅

`src/core/fatal.js` renders a readable panel for three cases that all used to
be a black rectangle: no WebGL 2 at all (Engine throws a tagged
`WebGLUnavailableError`), a lost GPU context, and anything escaping to
`window.onerror` / `unhandledrejection`.

One subtlety worth remembering: when the GPU drops the context, three's next
draw throws *synchronously* and reaches `window.onerror` **before**
`webglcontextlost` is dispatched. Classification therefore asks the canvas
(`contextIsLost()`) rather than trusting which handler fired first — otherwise
a routine, explainable context loss reads as a generic crash.

Verified by denying every `webgl` context, and by firing `WEBGL_lose_context`
at a running game.

### 1.3 First-paint loading state ✅

A logo + progress bar block, inline in `index.html`. Inline on purpose: the
stylesheet and the bundle are both module-loaded, so anything depending on them
paints only *after* the download the player is waiting on. `boot.js` hands off
after two frames — rendered, not merely constructed — and fades it out.

### 1.4 Visibility pause ✅

`document.hidden` now pauses the fight and suspends the AudioContext. Returning
does **not** auto-resume: the pause screen stays up and the player unpauses when
they are actually looking, which is the only fair option in local multiplayer.
The warm-up is exempt — it is time-gated and owns its cameras.

### 1.5 Licensing ✅ / one decision left

`public/THIRD_PARTY_NOTICES.txt` ships with the build and reproduces the
three.js MIT license in full, as that license requires. The Tripo models are
covered by the owner's paid plan — commercial use is settled, and the notices
file says so.

**Still yours to decide: the license for your own code.** There is no `LICENSE`
file in the repo. It does not block an itch upload, but it decides what anyone
else may do with the source.

---

## 2. SHOULD FIX — these cost you ratings, not the launch

### 2.1 The dev surface ✅ (resolved by the distribution build)

The workbenches now live on their own page (`/workbench/`), and `RW_DIST=1`
drops that page from the build inputs while `__RW_DIST__` compiles the
remaining dev routes out of the game entry. In `dist-web/` there is no
`workbench/` directory and no `showcase` / `battletest` / `leveleditor` string
anywhere in the bundle — 48 chunks become 2. The authoring surface is absent,
not merely unlisted.

The dev *save* endpoints were already safe: `vite.config.js`'s `devWriter()` is
`apply: 'serve'`, so `/__rw/manifest`, `/__rw/rig` and `/__rw/changes` never
exist in a static build.

### 2.2 Clean up the shipped SETTINGS menu

The menu (`settingsItems()` in `src/game/boot.js`) has since grown and been
cleaned up. It now offers: MUSIC VOLUME (only when a player is available),
ROUND TIME, SFX VOLUME, SOUND FX (RECORDED/SYNTH), REVERSE CAMERA Y,
SPLIT-SCREEN FX, SHOW ALL ROBOTS and ARENA DESIGN.

- **INFINITE ULTIMATES is no longer a menu item** — the cheat survives only
  behind `?debug=ultimates` / the `rw.infiniteUlts` pref, so a player cannot
  stumble into it. (Its `settings.infiniteUlts.*` strings in `core/text.js`
  are now orphaned, along with `settings.sound.*`, `settings.music.*` and
  `settings.reload` — harmless, but they are dead ids.)
- SOUND: ON/OFF is deliberately *not* here: the speaker button beside the gear
  is the one control for it.
- ~~SHOW ALL ROBOTS un-hides AEGIS and NOVA, which are unfinished.~~ **Settled:
  both were retired to `archive/mechs/`.** No mech carries `hidden: true`, so
  the toggle reveals nothing and is safe to ship. The rule it protects still
  stands for the next WIP mech: hide the toggle in production builds, or
  finish the mech.
- Still missing and wanted: a **general graphics quality option**. SPLIT-SCREEN
  FX landed since and is a partial one — it drops bloom / distance haze / FXAA
  in split-screen, and its DEFAULT mode drops them automatically for the
  session when the frame rate actually suffers — but it only covers the split
  view. The rest is still hard-coded in `engine.js` for everyone: `pixelRatio`
  clamp 1–1.75, soft shadows, bloom, FXAA and a PMREM environment. A single
  LOW/MED/HIGH switch is the difference between "runs badly on my laptop, 2
  stars" and "runs fine."

### 2.3 Teach the controls ✅ (landed separately)

`src/ui/instructions.js` now provides a controller diagram, reachable from an
ⓘ corner button that is also a controller-selectable stop in `hotButtons`, so
it is available before the first match rather than only from the pause menu.

Still worth doing:

- A CREDITS entry (nothing exists today) — and it is the natural place to link
  `THIRD_PARTY_NOTICES.txt`.
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

- [ ] `npm run build` **and** `npm run dist:web` both green.
- [ ] **Re-run `hurtboxfit` against the compressed roster** whenever the
      compression settings change. The procedure: `cp dist-web/models/*.glb
      public/models/`, run `node tools/hurtboxfit.mjs`, diff against a baseline
      run, then `git checkout -- public/models`. This is the check that caught
      quantization silently moving the hitboxes, and it is not something the
      build can verify for you — `tools/glbdiff.mjs` only proves the rig is
      intact, which is necessary but not sufficient.
      (Note: this audit was itself silently broken by the workbench split — it
      opened `?debug=collider`, which now redirects to a page where the manifest
      resolves one directory too deep, so it reported the procedural route only
      and no GLB rows at all. Fixed; if it ever prints no `glb` rows again,
      suspect the asset base before believing the models are fine.)
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

- [ ] Zip **the contents of `dist-web/`** (from `npm run dist:web`, NOT `dist/`
      — that one still carries the workbenches) with `index.html` at the zip
      root; tick "This file will be played in the browser."
- [ ] Embed size 1280×720, Fullscreen button on, "automatically start" off.
- [ ] Description, controls section, tags (mech, fighting, local multiplayer,
      3D, controller).
- [ ] Screenshots — `docs/title.png`, `docs/mech-select.png`, the arena shots
      and `docs/split-screen.png` already exist and are the right ones.
- [ ] A short GIF or 30s video. On itch this matters more than the text.
- [ ] A visible **version string on the title screen** so bug reports are
      actionable.
- [ ] Decide free / donation / paid. Commercial use of the models is settled
      (paid Tripo plan); what is left is your own code license — §1.5.
- [ ] `.github/workflows/deploy.yml` still lists a stale feature branch
      (`claude/3d-mech-battle-game-uxps6q`) as a deploy trigger. Clean it up so
      the Pages build and the itch build come from the same place.

---

## Shortest path to a launchable build

If you want the minimum that is defensible rather than the whole list:

~~1–5~~ done — payload, failure screens, boot splash, visibility pause and the
three.js notice all shipped, and HOW TO PLAY landed separately. What is left:

1. The soak matrix and the browser pass — §3. Safari is the one that will
   surprise you.
2. A graphics quality option — §2.2. The difference between "runs badly on my
   laptop, 2 stars" and "runs fine".
3. ~~Decide AEGIS/NOVA~~ — done: both retired to `archive/mechs/`, so SHOW ALL
   ROBOTS reaches no unfinished mech — §2.2.
4. Pick a license for your own code — §1.5.

Everything else is polish that can land in a post-launch update.
