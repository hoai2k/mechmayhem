# Arena redesign — asset generation prompts

Companion to the 2026-07 arena redesign pass. Everything in here is
OPTIONAL: the game renders every arena fully procedurally today. Each asset
you generate and drop in the right folder upgrades one thing in place, with
automatic fallback if a file is missing or broken. Generate in any order —
the **Tier 1** items are the biggest visual wins.

There are three kinds of asset, each with its own destination:

| Kind | What you generate | Where it goes |
| --- | --- | --- |
| PBR textures | seamless square images | `src/textures/<set>/<name>/<name>_<map>.png` |
| Sky panoramas + horizons | wide sky/backdrop images | `src/textures/sky/<name>/<name>_albedo.png` |
| Arena feature models | ONE image per feature → Tripo → GLB | `public/models/props/<propName>.glb` + entry in `public/models/props/manifest.json` |

---

## 1. PBR textures (`src/textures/`)

Rules (same pipeline as the existing pack):

- **Seamless / tileable in both directions**, square, 1024×1024 (2048 fine).
- Only `_albedo.png` is REQUIRED — the loader treats `_normal`, `_rough`,
  `_metal`, `_emissive` as optional bonuses if your pipeline can produce them.
- No baked-in strong shadows or perspective: flat, evenly lit, straight-on
  surface. Mid-exposure (the engine tints and lights it).
- Drop as e.g. `src/textures/prop/prop_corrugated_steel/prop_corrugated_steel_albedo.png`.
- Optionally append the new entry to `src/textures/MANIFEST.txt` (docs only —
  the loader globs the folder, nothing needs registering).

### Tier 1 — used by many new props

**`prop/prop_corrugated_steel`** (harbor containers, warehouses, scrapyard)
> Seamless tileable texture, weathered corrugated steel container siding, vertical ribs, faded industrial paint with scuffs and rust streaks at the seams, photorealistic, flat even lighting, no shadows, top-down orthographic surface detail, 1024x1024

**`prop/prop_metal_painted`** (industrial machines: crushers, furnaces, cranes)
> Seamless tileable texture, industrial machine sheet metal painted safety yellow-grey, chipped paint on edges and rivet lines, oil smudges, worn decals, photorealistic, flat even lighting, no perspective, 1024x1024

**`prop/prop_stone_carved`** (desert ruins: gates, colonnades, statues)
> Seamless tileable texture, ancient weathered sandstone blocks with shallow carved hieroglyph bands, wind erosion, sand dust in crevices, warm tan color, photorealistic, flat even lighting, orthographic, 1024x1024

**`prop/prop_stone_mossy`** (jungle temple walls, idols, ziggurat)
> Seamless tileable texture, ancient dark basalt temple stonework overgrown with patchy bright green moss and thin creeping vines, damp tropical stone, photorealistic, flat even lighting, orthographic, 1024x1024

### Tier 2 — single-theme flavor

**`prop/prop_basalt`** (volcano columns/arches)
> Seamless tileable texture, cooled volcanic basalt rock, tight hexagonal columnar jointing pattern, charcoal grey with faint orange heat glow deep in the cracks, photorealistic, flat even lighting, 1024x1024

**`prop/prop_ice_glacial`** (frozen arches, icebreaker ice collar)
> Seamless tileable texture, dense glacial ice, pale blue with deep cracks and trapped air bubbles, slightly translucent look, frosted surface patches, photorealistic, flat even lighting, 1024x1024

**`prop/prop_solar_panel`** (orbital + sky terrace arrays)
> Seamless tileable texture, dark blue photovoltaic solar panel grid, silver cell busbars in a regular grid, thin aluminum frame lines, faint sky reflection sheen, photorealistic, flat even lighting, 1024x1024

**`prop/prop_wood_rough`** (jungle/harbor planks, ruins scaffolding)
> Seamless tileable texture, rough weathered tropical hardwood planks, grey-brown sun-bleached grain, iron nail heads, photorealistic, flat even lighting, 1024x1024

---

## 2. Skies + distant horizons (`src/textures/sky/`)

Two layers, both optional per arena, both with procedural fallback:

- **Sky panorama** — `sky_<themeId>` — full 360° equirectangular sky,
  **2:1 aspect, 2048×1024 or 4096×2048**. Only the part above the horizon is
  shown; keep the bottom third simple/dark. File:
  `src/textures/sky/sky_<themeId>/sky_<themeId>_albedo.png`
- **Horizon ring** — `horizon_<themeId>` — a distant-scenery silhouette strip
  (mountains, skyline…) wrapped in a huge circle around the arena.
  **Horizontally seamless/tileable, transparent PNG above the scenery line**,
  ~4096×512. Bottom edge must be opaque ground-haze so it can sink below the
  fog line. File:
  `src/textures/sky/horizon_<themeId>/horizon_<themeId>_albedo.png`

Theme IDs: `neon foundry uptown harbor skyterrace scrapyard quarry volcano
frozen ruins jungle orbital`.

### Sky panorama prompts

- **sky_neon** > Equirectangular 360 sky panorama, midnight city sky, deep indigo to violet gradient, thin high clouds catching magenta and cyan neon glow from below, few stars, no ground, no lens flare, seamless left-right, 4096x2048
- **sky_foundry** > Equirectangular 360 sky panorama, industrial dusk, smoky amber-brown sky, layered smog bands, dull orange furnace glow on low cloud bellies near horizon, oppressive haze, seamless left-right, 4096x2048
- **sky_uptown** > Equirectangular 360 sky panorama, bright clear midday sky, vivid blue zenith fading to pale warm haze at horizon, a few crisp white cumulus clouds, sunny, seamless left-right, 4096x2048
- **sky_harbor** > Equirectangular 360 sky panorama, dramatic ocean sunset, deep violet zenith, bands of burnt orange and salmon cloud streaks near horizon, sun low and diffused, seamless left-right, 4096x2048
- **sky_skyterrace** > Equirectangular 360 sky panorama, high-altitude morning sky above a cloud deck, intense clean blue above, bright white rolling cloud tops filling the lower quarter, thin cirrus, seamless left-right, 4096x2048
- **sky_scrapyard** > Equirectangular 360 sky panorama, hot dusty late afternoon, ochre-brown dust haze, washed-out amber sun glow, sparse ragged clouds, desert junkyard atmosphere, seamless left-right, 4096x2048
- **sky_quarry** > Equirectangular 360 sky panorama, alien twilight, deep indigo sky with faint violet nebula wisps and dense sharp stars, subtle purple glow at horizon, seamless left-right, 4096x2048
- **sky_volcano** > Equirectangular 360 sky panorama, volcanic night, black-red sky choked with ash clouds lit dull crimson from below, ember glow at horizon, occasional lightning-lit cloud, seamless left-right, 4096x2048
- **sky_frozen** > Equirectangular 360 sky panorama, polar night, steel-blue sky with bright green and teal aurora curtains, sharp stars, pale moonlight haze at horizon, seamless left-right, 4096x2048
- **sky_ruins** > Equirectangular 360 sky panorama, desert late afternoon, cloudless gradient from dusty blue zenith to warm gold horizon glow, faint heat haze, seamless left-right, 4096x2048
- **sky_jungle** > Equirectangular 360 sky panorama, humid tropical midday, bright hazy white-green tinted sky, towering soft cumulus on the horizon, glare of diffused sun, seamless left-right, 4096x2048
- **sky_orbital** > Equirectangular 360 space panorama, pitch black space with dense sharp starfield and thin milky way band, the blue limb of an Earth-like planet glowing along one side of the horizon line, no sun flare, seamless left-right, 4096x2048

### Horizon ring prompts

All: *transparent background above the scenery, horizontally seamless, wide
strip 4096×512, silhouette lit to match the sky, opaque haze at bottom edge.*

- **horizon_neon** > Distant night city skyline silhouette strip, dense skyscrapers with scattered lit windows and neon rooftop signs in magenta and cyan, haze at base, transparent sky, seamless tiling, 4096x512
- **horizon_foundry** > Distant industrial skyline silhouette strip, blast furnaces, chimneys with smoke plumes, gantries and gasometers backlit by orange furnace glow, transparent sky, seamless tiling, 4096x512
- **horizon_uptown** > Distant modern city skyline strip in daylight, glass towers in pale blue haze, construction cranes, transparent sky, seamless tiling, 4096x512
- **horizon_harbor** > Distant harbor horizon strip at sunset, container gantry cranes, moored cargo ships, a lighthouse, all in dark purple silhouette against orange glow, transparent sky, seamless tiling, 4096x512
- **horizon_skyterrace** > Distant cloud-deck horizon strip, tops of a few super-tall skyscrapers piercing a sea of white clouds, morning light, transparent sky, seamless tiling, 4096x512
- **horizon_scrapyard** > Distant junkyard horizon strip, mountains of crushed scrap metal, magnet cranes, rusting ship hulks in ochre dust haze, transparent sky, seamless tiling, 4096x512
- **horizon_quarry** > Distant horizon strip, jagged crystal-studded mesa ridges glowing faint violet at the tips under an indigo night sky, transparent sky, seamless tiling, 4096x512
- **horizon_volcano** > Distant volcanic horizon strip, black volcano cones with glowing lava veins and a bright eruption plume, red underlit ash clouds, transparent sky, seamless tiling, 4096x512
- **horizon_frozen** > Distant arctic horizon strip, jagged glacier ridges and snowy peaks in blue moonlight, faint green aurora reflections on the ice, transparent sky, seamless tiling, 4096x512
- **horizon_ruins** > Distant desert horizon strip, eroded sandstone mesas, half-buried colossal ancient statues and a stepped pyramid in golden haze, transparent sky, seamless tiling, 4096x512
- **horizon_jungle** > Distant jungle horizon strip, layered rainforest canopy ridges in blue-green haze, ancient stone temple towers poking above the trees, mist between ridges, transparent sky, seamless tiling, 4096x512
- **horizon_orbital** > Distant space-station horizon strip, huge orbital station modules, truss arms, docked ships and antenna arrays in dark silhouette rim-lit by planet glow, transparent space, seamless tiling, 4096x512

---

## 3. Arena feature models (image → Tripo → GLB)

Workflow: generate the image, run it through Tripo image-to-3D, then drop the
GLB at `public/models/props/<propName>.glb`. The file name IS the binding —
`public/models/props/manifest.json` already lists every prop below with a
`fit` height (the loader auto-scales the model so its bounding box matches,
and sits it on the ground), so a drop-in needs **no manual sizing**. Gameplay
(collision, explosions, spinning) keeps working: hooks live on the manifest
entry, not the model. If a GLB is missing/broken the procedural version keeps
rendering.

Image guidelines for Tripo: ONE object, centered, 3/4 view, plain flat
background, soft even studio light, no ground shadow, no scene, no text.

### Tier 1 — hero landmarks (one per arena, biggest wins)

- **toriiGate** (neon) > A futuristic neon torii gate, dark lacquered steel frame in traditional torii proportions, edge-lit with magenta and cyan neon tubes, small holographic signage panels on the pillars, cyberpunk, single object centered, 3/4 view, plain grey background, soft even lighting, no shadows
- **blastFurnace** (foundry) > A massive Victorian industrial blast furnace tower, riveted iron plates, brass pipework spiraling up, glowing orange tap hole at the base, steam valves, steampunk industrial, single object centered, 3/4 view, plain grey background, soft even lighting
- **bandshell** (uptown) > A modern city park bandshell stage, white concrete half-dome shell, wooden stage floor, subtle chrome trim, clean contemporary architecture, single object centered, 3/4 view, plain grey background, soft even lighting
- **gantryCrane** (harbor) > A ship-to-shore container gantry crane, tall teal-painted steel frame on four legs with wheeled rail trucks, long boom arm, operator cabin, hanging spreader on cables, weathered paint with rust streaks, single object centered, 3/4 view, plain grey background, soft even lighting
- **gondolaRig** (skyterrace) > A rooftop window-washing gondola rig, steel davit arms overhanging from a wheeled counterweight base, suspended two-person platform cradle with railings on twin cables, industrial white and safety orange, single object centered, 3/4 view, plain grey background, soft even lighting
- **buriedMechHand** (scrapyard) > A colossal rusted robot hand and forearm rising from the ground as if buried, fingers half-open reaching upward, weathered orange rust and chipped grey armor plates, exposed cables at the wrist, single object centered, 3/4 view, plain grey background, soft even lighting
- **headframe** (quarry) > A mine shaft headframe tower, angular steel lattice hoist tower with two large cable wheels at the top, corrugated winch house at the base, violet warning lamps, weathered industrial steel, single object centered, 3/4 view, plain grey background, soft even lighting
- **basaltColumns** (volcano) > A cluster of hexagonal basalt columns of varying heights fused together like Giant's Causeway, charcoal grey stone with faint glowing orange cracks near the base, single rock formation centered, 3/4 view, plain grey background, soft even lighting
- **icebreakerShip** (frozen) > An icebreaker ship hull frozen in ice, red and black steel hull listing slightly, white superstructure with radar mast, ice collar around the waterline, rust streaks, single object centered, 3/4 view, plain grey background, soft even lighting
- **greatGate** (ruins) > A monumental ancient Egyptian-style temple pylon gate, two massive tapering sandstone towers flanking a central doorway, carved hieroglyph bands and faded turquoise inlay accents, wind-eroded edges, single object centered, 3/4 view, plain grey background, soft even lighting
- **templeGate** (jungle) > An ancient jungle temple gate arch, massive dark stone blocks carved with serpent reliefs, heavily overgrown with moss and hanging vines, a glowing green gem set above the arch keystone, single object centered, 3/4 view, plain grey background, soft even lighting
- **shuttle** (orbital) > A parked orbital cargo shuttle, white and dark grey heat-tiled fuselage, stubby delta wings, twin engine bells, landing gear down, subtle cyan navigation lights, used-future wear, single object centered, 3/4 view, plain grey background, soft even lighting

### Tier 2 — supporting set pieces

- **foodTruck** (uptown) > A modern street food truck with serving hatch open and awning out, mint green paint, menu board, small roof vents, clean and friendly, single object centered, 3/4 view, plain grey background, soft even lighting
- **carCrusher** (scrapyard) > An industrial scrapyard car crusher machine, heavy yellow-painted press frame over a flattened car, hydraulic rams, control cabin, oil stains and rust, single object centered, 3/4 view, plain grey background, soft even lighting
- **crystalMonolith** (quarry) > A single giant violet crystal monolith, sharp prismatic shard erupting from a rocky base at a slight angle, glowing softly from within, translucent amethyst faces, single object centered, 3/4 view, plain grey background, soft even lighting
- **quonsetHut** (frozen) > An arctic research quonset hut, half-cylinder corrugated steel shelter, small double-door airlock entrance, snow packed on the roof, orange trim and a small antenna, single object centered, 3/4 view, plain grey background, soft even lighting
- **sphinxStatue** (ruins) > A weathered sandstone guardian statue of a seated robot sphinx, mechanical lion body with a stylized robot head, ancient carved armor plates, sand piled at the base, single object centered, 3/4 view, plain grey background, soft even lighting
- **solarWing** (orbital) > A deployable space station solar array wing on a short pedestal mount, long rectangular panel of dark blue photovoltaic cells with silver frame and truss spine, slight fold lines, single object centered, 3/4 view, plain grey background, soft even lighting
- **trawler** (harbor) > A small weathered fishing trawler boat, blue hull with red keel stripe, white wheelhouse, net winch at the stern, rust streaks, single object centered, 3/4 view, plain grey background, soft even lighting
- **snowcat** (frozen) > A tracked snowcat utility vehicle, orange cab with roof lights, wide rubber-steel tracks, front dozer blade, frost on the windows, single object centered, 3/4 view, plain grey background, soft even lighting

After dropping GLBs in, check any arena with that prop — or the level editor
(`?edit=level`, palette places every prop) — and tweak the `fit` height in
`public/models/props/manifest.json` if a model reads too big/small.
