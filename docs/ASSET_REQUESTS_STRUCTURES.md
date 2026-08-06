# ASSET REQUESTS — arena STRUCTURES (ALL DELIVERED)

**Status: nothing outstanding.** All six landform materials are in and
wired; `PENDING_ASSETS` in `src/core/assetcheck.js` is empty, so every one
of them is now GUARDED — remove or rename a file and the boot check and
`node tools/assetcheck.mjs` both report it. Building facades are delivered
too (`docs/ASSET_REQUESTS_ARENA_DESIGN.md`).

The one thing still open is the NICE-TO-HAVE at the bottom
(`struct_basalt_column`), which nothing depends on.

This file is kept as the SPEC: it is what these materials are supposed to
be, and the rules to follow for the next one. To add a structure material,
name it in a `STRUCTURE_KINDS` entry's `tex`, write the prompt here, and add
the key to `PENDING_ASSETS` until it lands.

Textures for the large structures that are no longer buildings
(`src/arena/structures.js`): volcanic rock, crystal, ice. Everything here is
OPTIONAL and pre-wired — each name is already claimed by the structure kind
that wants it, gated on the file existing, so committing the images WAS the
whole integration. The procedural colours are still there underneath and are
tuned to look right on their own, which is what `?textures=0` renders.

While a name is DECLARED but not yet delivered it belongs in
`PENDING_ASSETS` (`src/core/assetcheck.js`), so the boot check and `node
tools/assetcheck.mjs` report it quietly as outstanding rather than shouting
about a gap somebody already knows about. Delete the line when its images
land and the check starts guarding it — and if you forget, the check says so
("ARRIVED").

**Where they go:** `src/textures/struct/<name>/<name>_<map>.png` — a NEW
texture set, `struct`. The loader globs any set under `src/textures/`, and
that is the ONLY place it looks: images committed to `public/textures/` are
silently ignored (see ASSETS.md, and `node tools/assetcheck.mjs`). This
request is separate from `docs/ASSET_REQUESTS_ARENA_DESIGN.md`, which covers
building FACADES and is also complete.

All GLOBAL RULES from `docs/TEXTURE_GEN_PROMPT.md` apply unchanged:

- **Strictly tileable in X and Y**, 1024×1024 PNG.
- **No baked lighting** — no shadows, vignettes or highlights in the albedo.
- **No text or signage.**
- Maps, same tiling: `_albedo` (sRGB) · `_normal` (OpenGL +Y) · `_rough`
  (white = matte) · `_metal` only where marked · `_emissive` only where
  marked (black background, glow in colour).

**Three things specific to this set.**

1. These wrap CHUNKS — a structure is built from ~4–6 unit shapes, one tile
   per chunk — so the detail should read at roughly 4 m per tile.
2. **The albedo must be NEUTRAL in value and lightly saturated.** The game
   tints every chunk individually (a crystal field is six different hues, a
   basalt mound has ember-lit cracks) and that tint MULTIPLIES the albedo. A
   texture that is already strongly coloured fights the tint; one that is
   mid-grey with structure in it takes any colour cleanly.
3. **It must look right from any angle, not just on a cube.** A chunk is no
   longer a box — it is a shard, a boulder or a drift (`src/arena/chunkgeo.js`)
   with no natural unwrap, so the uv is a BOX PROJECTION: each triangle is
   projected down whichever axis it faces most. That is seamless on a faceted
   shape and it means a texture with a strong directional pattern (deliberate
   horizontal banding, say) will show that pattern in three directions at
   once. Isotropic detail is safest.

**On `_emissive`:** it is multiplied by the chunk's own colour, so a map
authored WHITE glows in whatever hue that chunk is — the ember chunks of a
basalt mound light their cracks orange while the cold rock beside them
barely glows, and one crystal spire glows in six colours off one map. Author
the glow as a mask, not as a colour.

## The set

1. `struct_basalt_rock` ✅ delivered — **Volcanic Forge.** Cooled basalt: dense, matte,
   near-black-to-charcoal stone with a fine network of contraction cracks
   and a granular, glassy grain. A few cracks slightly open, catching a
   little dust. Neutral grey-brown so the ember tint can take. **+emissive**
   (a sparse, dim glow in the deepest cracks only — most of the tile should
   be black in the emissive map).
2. `struct_crystal_facet` ✅ delivered — **Crystal Quarry.** A mass of interlocking
   crystal facets: flat angular planes at different orientations, sharp
   arrises between them, some faces glassy and some frosted, fine internal
   fracture lines. Nearly WHITE with only a hint of colour — the game
   supplies the hue per chunk (violet, cyan, rose…). Low roughness overall,
   with the frosted facets rougher. **+emissive** (a soft inner light along
   the fracture lines, white — it gets tinted with the chunk).
3. `struct_ice_glacier` ✅ delivered — **Frozen Outpost**, the natural bergs. Dense
   glacial ice: compressed layers, trapped air bubbles in bands, hairline
   fractures, a chalky wind-scoured surface on some areas and clear blue-ish
   ice on others. Pale, cool, low-saturation.
4. `struct_ice_cut` ✅ delivered — **Frozen Outpost**, the station's cut-ice works. QUARRIED
   ice blocks: saw marks in parallel scoring across the face, clean edges,
   internal cracks and frost bloom at the corners. Reads as worked material
   rather than geology. Pale and clean — it is rendered semi-transparent, so
   keep the albedo light and even, with the interest in the normal map.
5. `struct_rock_grey` ✅ delivered — **Crystal Quarry** benches and general outcrop.
   Fractured grey-violet mine rock: blocky conchoidal fracture faces, drill
   scoring on a few flats, dust settled in the recesses. Matte. (Same family
   as `ground_quarry_rock` but at chunk scale and without the crystal
   flecks.)

6. `struct_snow_pack` ✅ delivered — **Frozen Outpost**, the wind-packed snow drifts.
   Deep dry snow that has been blown and set: a smooth crust with faint wind
   ripples (sastrugi) running one way, a few shear steps where a slab has
   broken, powder gathered in the low spots. Almost white, very slightly blue
   in the shadows, effectively no specular — the least shiny surface in the
   game. Keep the albedo nearly flat and put all the shape in the normal map,
   because the chunks it dresses are smooth-shaded rounded lumps and the
   texture is the only thing that will say "snow" rather than "white plastic".

## Nice-to-have, not required — THE ONE THING STILL OPEN

7. `struct_basalt_column` — jointed columnar basalt (the hexagonal-column
   cliff face seen side-on). If provided, it will be given to `basaltCliff`
   and `struct_basalt_rock` kept for the mounds; without it both use the
   rock. Say the word and I will wire the second name.

## What is NOT requested

- Building facades — that is `docs/ASSET_REQUESTS_ARENA_DESIGN.md`, and all
  twelve of those have landed too, so the ruins and jungle silhouettes now
  wear sandstone and mossy temple stone rather than industrial brick.
- Prop models — the sphinxes, gates, colonnades and crystals already exist.
- Ground, sky and horizon sets — complete for all twelve arenas.
