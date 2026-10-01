# THE ARENA FLOOR — why it looked tiled and flat, and what changed

Every arena stood on one perfectly flat plane at y = 0 with one 2048² texture
repeated across it every ~15 units. This document is the audit of that floor,
the research behind the fix, the per-arena plan, what shipped, how it was
measured, and the replacement art delivered on 2026-10-01.

**Art delivery:** all twelve mirrored grounds have been replaced and all
twelve `_b` companions added (77 maps). The strict audit passes all 24
materials; `groundfolds.json` now has no correction profiles. The audit
below describes the original pack. Generation prompts and the native-to-2048
export are recorded in `docs/ground-material-generation.json`.

Code: `src/arena/relief.js` (the shape), `src/arena/groundshader.js` (the
surface), `src/arena/terrain.js` `buildGroundTiles` (the mesh), and the
physics floor in `src/combat/fighter.js applyPhysics`. Off switch for an A/B:
`?relief=0` on any URL (the old flat floor, old shader, everything).

---

## 1 · The audit

**The floor was a table top.** `Terrain` drew a single `PlaneGeometry` at
y = 0; the only height anywhere was the hills, bridges and the viaduct — each
a discrete feature dropped onto that plane. Every road, river and lava lane
was PAINT on the same flat surface (an overlay texture), so a street had no
kerb, a river had no bank and a lava channel had no levee.

**The texture was a kaleidoscope.** `node tools/groundaudit.mjs` measures
every ground material:

| finding | measured |
|---|---|
| all 12 ground albedos are **four-way mirrors** (a quarter flipped into each corner) | mirror score 0.00 / 0.00 on every one — left/right and top/bottom halves identical to the pixel |
| the mirroring left a **dark groove** along each fold — tile edges AND midlines, in the albedo, the normal map and the roughness | 51–83% darker than the ground beside it (linear light), ~14 texels wide |
| the tile repeats every ~15 units against a mech ~7 tall | ~10 repeats across a cell, ~30 visible at once from a chase camera |
| some tiles carry large light/dark shapes that repeat with them | blotch SD 13.5 (neon), 14.2 (frozen) |

The groove is the single strongest "this is tiled" cue: a dark grid every
~7 units, ruler-straight to the horizon. The mirror is the second — a medallion
motif the eye locks onto and then finds again one tile over. (The round-2
addendum in `docs/TEXTURE_GEN_PROMPT.md` asked for non-mirrored grounds once
already; the regenerated set never arrived.)

## 2 · Research — what ground is

### In games

- **Break the repeat in the shader, not the art.** Inigo Quilez's *texture
  repetition* techniques (per-tile random offset/rotation; noise-chosen
  offsets with a blend band — "technique 3"), Heitz & Neyret's *histogram-
  preserving stochastic tiling* (Unity/UE "stochastic" samplers), Mikkelsen's
  *hex-tile* blending (2022). All of them read the real texture at full
  resolution; they only change WHERE in the tile each patch of ground reads
  from, so the repeat stops lining up. Cheap, and they work on any art.
- **Macro variation.** A second, much larger-scale signal (a world-space
  noise or a low-res "macro" map) modulating brightness and hue over tens of
  metres — what Frostbite/UE call macro or "distance" variation. Real ground
  has wet patches, dust, sun-bleach and repairs at a scale no tile can hold.
- **Material splatting.** Two or more materials blended through a mask
  (height-blended so the crack fills first): asphalt with patched asphalt,
  rock with scree, snow with ice. Terrain systems from Far Cry to Horizon are
  built on it.
- **Height and slope shading.** Tint by the shape: exposed rock on steep
  faces, damp/dirt in hollows, bleached/wind-scoured on crests. This is what
  makes a few tenths of a unit of relief READ from a chase camera — shading,
  not silhouette.
- **Decals** for the one-off features (manholes, cracks, oil, scorch, snow
  ripples) — the thing that finally makes a place specific. Follow-up below.

### In reality — per environment

- **City streets** are not flat: a carriageway is **crowned** (~2% cross-fall)
  so rain runs to the gutters, the gutter sits a **kerb's height** (~100–150 mm)
  below the pavement, and paved plazas are laid with shallow falls to drains.
  At a mech's scale (~7 units ≈ a 10 m robot, so ~0.7 units/m) a kerb is a
  ~0.1–0.25 unit step — exactly the "slightly up or down" asked for.
- **Docks** fall toward the water in long shallow grades and end at a hard
  **quay edge**.
- **Rooftops** fall to their drains in planes of ~1–2% — almost flat, but
  never one plane.
- **Engineered decks** (a spaceport) are panels, and panels are never one
  casting: each sits a hair proud or shy of its neighbours.
- **Dirt lots / scrapyards** are graded unevenly and churned by heavy plant,
  with **wheel ruts** in the tracks.
- **Quarries** are **benched**: flat treads with steep risers, cut by the
  machines that work them.
- **Lava fields**: pāhoehoe cools into ropy ridges, lobes and tumuli; aʻā
  into rubbly ridges; a channel **builds its own levees** from the crust it
  sheds, so the flow runs between banks higher than the ground beside it.
- **Snowfields** are combed by the wind into **sastrugi** and drifts —
  asymmetric ridges across the prevailing wind with a gentle windward face and
  a steeper lee; frozen water lies flat and low.
- **Deserts** are **dunes** (again asymmetric, the slip face steeper) over
  older stone, with paved ways swept nearly level.
- **Forest floors** are heaved by **roots** — soft rolls and lumps
  everywhere, the streams and pools sitting low.

## 3 · The plan — per arena

The same toolbox everywhere, applied by need. "Relief" is the shape (± units),
"surface" the shader.

| arena | character | relief | surface |
|---|---|---|---|
| **neon** (city) | crowned asphalt between kerbs | gentle grading ±0.16; streets **0.24 below** the kerb, **crowned 0.07**; plaza mostly flat | anti-tile, macro, wet-dark hollows |
| **uptown** (city) | plaza paving, lawns, ponds | grading ±0.18; streets recessed + crowned; **lawns domed 0.55** proud of the paths; ponds a basin | anti-tile, macro, warm lows/bleached rises |
| **harbor** | dock concrete falling to the water | long shallow grades (2 cells); streets recessed; the **basin has a quay edge** (0.55 down over 1 unit) | macro salt/rust tint |
| **foundry** | factory floor | grading + small irregularity; **lava runs between 0.2 levees**, 0.4 down | soot lows, heat-tinted macro |
| **skyterrace** | a roof | barely any: ±0.08 drainage planes | anti-tile, mild macro |
| **orbital** | engineered deck | **panels** each ±0.09, bevelled seams, 14 across the cell; no terrain | anti-tile, macro |
| **scrapyard** | dirt lot | rolling ±0.55, bumps, **rutted** dirt tracks, mud/oil hollows | dark wet lows, dusty rises, slope tint |
| **quarry** | worked rock | rolling ±1.3 **quantized into benches** (0.42 treads, steep risers), ridges; crystal veins stand **proud** | dark lows, pale rises, rock-face slopes |
| **volcano** | lava field | rolls + **ridged flow crests** + bumps; lava lanes 0.45 down between **0.32 levees**; lava/ash basins | ash-grey lows, fresh-black crests, slope tint |
| **frozen** | wind-packed snow | rolls + **sastrugi** (asymmetric crests, 6×2 cycles/cell, breathing amplitude); ice river/lakes flat and low | blue-grey hollows, white crests |
| **ruins** | sand over stone | **dunes** (asymmetric, 4×3 cycles); the paved way stands slightly proud, sand lanes low | warm lows, bleached crests |
| **jungle** | forest floor | rolls + **root lumps** everywhere; river/swamp sitting low | dark damp lows, slope tint |

Natural arenas (scrapyard, quarry, volcano, frozen, ruins, jungle) set
`follow: 0.7`: a channel's bed keeps 70% of the land it runs through, so a
river through rolling ground stays in its valley instead of being cut to one
level and leaving a cliff for a bank. A city street (`follow` 0) is graded
flat — which is what a street is.

## 4 · What shipped

### The shape — `relief.js`

One smooth height field per arena, a 256² grid over the cell, bilinear and
wrapped. Three rules, enforced by construction:

1. **It tiles.** The arena is a torus; every noise lattice wraps mod its cell
   count and the dune wave vectors are whole cycles per cell, so the field is
   periodic in P with no blending. (`test/ground.test.mjs` checks the seam
   step is no bigger than the worst step inside.)
2. **It steps aside for what was built.** Buildings stand on y = 0, so their
   footprints LIFT the field to ≥ 0 around them (a plinth). Props are levelled
   to the height they were placed at (a pad). Hills, bridges and viaduct
   ramps are measured from 0, so the field is 0 under them.
3. **It is baked in stages** — base + layout when the Terrain is built,
   footprints after the buildings, pads after the props — and EVERY consumer
   reads the same grid: physics, projectiles, rubble, crates, effects, steam
   vents, spawn points and the ground mesh itself. What a mech walks on is what
   is drawn.

The floor mesh is the field: one displaced cell geometry (≈1.25-unit
quads, analytic normals, a per-vertex relief attribute for the shader) drawn
as 3×3 tiles, the overlay paint sharing the same geometry 0.03 above it.
`Terrain.heightAt = max(relief, features)`; `featureHeightAt` is the old
answer for the code that asks "is there a hill/deck here".

### The surface — `groundshader.js`

Patched into the pack's MeshStandardMaterial (`onBeforeCompile`), every
noise periodic in the cell:

1. **Anti-tiling** (Quilez technique 3): a slow noise picks one of eight uv
   offsets per region of ground, blended across a narrow band; colour,
   normal, roughness, metal and emissive all use the same offsets, and
   `textureGrad` keeps the mip continuous across an offset change.
2. **Macro variation**: two octaves of world-scale brightness and a hue drift
   toward the theme's macro tint.
3. **Shape shading**: low / high / slope tints read off the relief.
4. **Fold-groove cancellation**: `tools/groundfolds.mjs` measures each
   texture's average groove profile across all four mirror lines (albedo in
   LINEAR light, as a gain; normal and roughness as deltas) into
   `groundfolds.json`; the shader holds the profile's running integral and
   applies it box-filtered over the pixel's own texel footprint (shaped into
   the sampler's tent), so the cancellation holds at every distance with no
   fade to tune. Only the AVERAGE across a fold is removed — the texture's
   own detail crossing it survives.
5. **A second material** (`<ground>_b`) splatted in through a world-space mask
   — all twelve companions were delivered on 2026-10-01.

Two traps found on the way, worth knowing for any `onBeforeCompile` patch:
the maps other than colour are sampled INSIDE chunks that `onBeforeCompile`
still sees as `#include` lines, so a string replace of `texture2D( normalMap…`
silently matches nothing until the chunk is expanded first (the normal map
went on tiling under an albedo that did not). And an albedo is read
sRGB-DECODED: a groove half as bright in the file is ~5× darker where the
shader works, so a correction measured in file values leaves two thirds of it
behind.

### Movement

`applyPhysics` lands a fighter on the relief instead of y = 0 and, while he is
grounded and moving, SNAPS him down a descent within `0.35 + speed·dt·0.6` —
so a running mech hugs a crest instead of leaving the ground on every one.
Nothing about the gait changes: the relief is a floor height, and the
animator's own per-foot placement already reads clearance against it.

## 5 · Measured

`node tools/reliefprobe.mjs all` runs titanus in four straight lines across
each arena (AI off, stick held, 300 frames each) and measures every frame;
`--flat` is the same with `?relief=0`.

| arena | relief range | worst slope | airborne frames | worst frame step | open-ground speed (flat 20.7) |
|---|---|---|---|---|---|
| neon | -0.60 … 0.10 | 32.2° (mean 0.6°) | 0 / 1120 | 0.083 | 20.1 |
| foundry | -0.40 … 0.29 | 25.3° (mean 0.8°) | 0 / 1120 | 0.012 | 0.0 |
| uptown | -0.55 … 0.55 | 15.8° (mean 0.4°) | 0 / 1120 | 0.003 | 20.7 |
| harbor | -0.55 … 0.16 | 31.0° (mean 0.3°) | 0 / 1120 | 0.040 | 20.7 |
| skyterrace | -0.06 … 0.07 | 2.8° (mean 0.1°) | 0 / 1120 | 0.001 | 0.0 |
| scrapyard | -0.56 … 0.39 | 14.5° (mean 1.1°) | 0 / 1120 | 0.159 | 20.7 |
| quarry | -1.26 … 0.84 | 27.5° (mean 1.4°) | 0 / 1120 | 0.116 | 20.7 |
| volcano | -0.63 … 1.02 | 30.0° (mean 2.4°) | 0 / 1120 | 0.185 | 20.7 |
| frozen | -0.50 … 0.54 | 17.7° (mean 1.3°) | 0 / 1120 | 0.070 | 20.7 |
| ruins | -0.73 … 0.57 | 20.7° (mean 1.4°) | 0 / 1120 | 0.056 | 20.7 |
| jungle | -0.86 … 0.48 | 24.7° (mean 1.2°) | 0 / 1120 | 0.040 | 20.7 |
| orbital | -0.09 … 0.09 | 6.3° (mean 0.4°) | 0 / 1120 | 0.027 | 20.7 |

- **airborne** must be 0: the downhill snap keeps a running mech on the
  ground over every crest. It is 0 everywhere.
- **worst frame step** is the largest single-frame change in his height — a
  kerb or a bank crossed at a run. Everything is a fraction of a unit against
  a mech ~7 tall.
- **speed** is the MEDIAN over open-ground frames: the run is not slowed. On
  neon the same four runs were traced side by side with `?relief=0` and the
  positions and speeds agree frame for frame — only the height differs (by
  hundredths); its 20.1 is which frames the probe counts as open ground.
  (An arena reading 0.0 had no open ground under the probe's straight lines —
  foundry's and skyterrace's centres are decks and features, measured as not
  relief — not a stopped mech.)
- the **worst slopes** are kerbs, quay edges and lava banks — a few tenths of a
  unit tall, crossed in a frame — and the quarry's bench risers. Open ground
  (`mean`) is 0.1–2.4°.

Judging tools:

- `node tools/groundshot.mjs <theme> <out-prefix> [--relief0]` — the floor
  from a fixed low camera, fighters hidden, with the fold correction on and
  off (`-fix.jpg` / `-nofix.jpg`).
- `node tools/groundaudit.mjs [sheet.jpg] [--strict]` — the texture audit and
  the ACCEPTANCE CHECK for new ground art (mirror / fold / blotch / size).
- `node tools/groundfix.mjs [--check] [name …]` — measure and repair wrap
  seams, normal-map bias and roughness level on delivered ground art.
- `node tools/groundfolds.mjs [--write]` — re-measure the fold profiles;
  RE-RUN AFTER ANY GROUND TEXTURE CHANGES (a non-mirrored texture is left out
  and gets no correction; `npm test` fails until you do).
- `?relief=0` on any battle URL for the before picture.

## 6 · Art delivered

`docs/image-requests.md` → **GROUND MATERIALS** (closed): twelve replacement ground
textures that are seamless WITHOUT mirroring (the real fix; the shader's
fold cancellation is a stopgap), and twelve `_b` companion materials for the
splat — patched asphalt in the asphalt, scree in the rock, wind-glazed ice in
the snow. Delivered on 2026-10-01. Every one is a drop-in: same folder,
same names, no code edit. Native generated outputs were 1254², exported at
2048²; see `docs/ground-material-generation.json` for the prompt set.

### Verified in the game, and three defects repaired

Judged in all twelve arenas (`tools/groundshot.mjs`, plus a straight-down
close-up 2.2 units off the floor): no grid, no medallion, no visible repeat,
the `_b` splat live everywhere (`NT_B`), the fold correction correctly OFF
(nothing in `groundfolds.json` — none of the new art is a mirror), and
`groundaudit --strict` OK on all 24. What the audit could not see, a closer
measurement could — and `node tools/groundfix.mjs` (idempotent, `--check` to
measure only) repaired it in place on every map:

1. **A wrap seam on every map.** The 1254 → 2048 Lanczos resize CLAMPED the
   image edge instead of wrapping it: two texels in, the content matches
   across the border (the generated source was seamless), but the step across
   the border itself measured 1.7–4.6× a normal step — a faint ruled line on
   every tile edge, visible in the close-up. The excess step is now closed
   half from each side over an 8-texel ramp, leaving a border step the size of
   any other (0.79–1.09× after; closing it FULLY measured 0.45×, a line too
   smooth to match its neighbours, which is a seam the other way round).
2. **Normal maps biased off flat** by up to 14/255 in R or G (neon_b,
   skyterrace_b, jungle_b), which lights a whole floor as if tilted 3–6°. A
   tiling height field has zero mean slope, so the mean is recentred to 128.
3. **Roughness far smoother than the prompts asked** — volcano basalt
   "matte 210–240" came back at a median of 109, jungle stone/moss 144
   against 185–245, scrapyard dirt 161 against 220–245 — which put a wet
   glare on moss, ash and dirt. Each map whose median sat below its own
   dominant material's requested range is shifted onto the middle of it,
   contrast kept (table in the tool). frozen_b is the one moved DOWN: its
   prompt is glazed ice (65–100) and it came back at 159. neon, neon_b,
   foundry and orbital had no recorded target or were already in range.

**Not changed, and worth knowing:** neon's asphalt now reads lighter than the
old floor. Its albedo is the same (64 vs 66); the old METAL map was ~85%
metallic, which is physically wrong for asphalt but is what made it read dark
and wet, and the new one is the ~12% the brief asked for. If the darker look
is wanted back, that is a tint or roughness decision for neon, not a defect.

**Payload.** The pack is 553 MB in the repo (was 109), and `npm run build`
— what the Pages deploy ships — copies the PNGs as they are: ~53 MB of ground
maps per arena (base + `_b`), against ~11 MB before. Measured on neon, WebP at
`tools/dist.mjs`' qualities is 10.2 MB at 2048², 5.2 MB at the native 1254²
(the 2048 export adds no detail over the source it was resized from).

## 7 · Follow-ups (not done)

- **Decals**: manholes, drains, cracks, oil, scorch, tyre marks, snow ripples
  — instanced quads conforming to the relief. The biggest remaining "this is
  a specific place" lever; needs its own atlas request once there is a decal
  system to receive it.
- **Water/lava surfaces in the channels**: the rivers and lava lanes now sit
  in real beds, but their surface is still the overlay paint following the
  bed. A flat translucent sheet at the bank line would read as liquid.
- **Arena-editor relief**: the level editor builds the same Arena, so it
  shows the relief, but it has no controls for it. A theme may already carry
  its own `relief` block (`reliefProfile` reads `theme.relief` before
  `RELIEF[id]`); the level FORMAT does not carry one yet.
- **Foot IK on slopes**: feet already land on the relief through the
  animator's clearance-based placement; a per-foot slope tilt would plant a
  boot flat on a bank instead of level.
