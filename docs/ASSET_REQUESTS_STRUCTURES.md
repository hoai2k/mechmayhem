# ASSET REQUESTS — arena STRUCTURES pass (2026-08)

Textures for the large structures that are no longer buildings
(`src/arena/structures.js`): volcanic rock, crystal, ice. Everything here is
OPTIONAL and pre-wired — each name is already claimed by the structure kind
that wants it, gated on the file existing, so committing the images is the
whole integration. Until then the procedural colours ship, and they are
tuned to look right on their own.

**Where they go:** `public/textures/struct/<name>/<name>_<map>.png`
(a NEW texture set, `struct` — the loader picks up any set under
`src/textures/`; see `docs/TEXTURE_GEN_PROMPT.md` for how the pack is laid
out). This request is separate from `docs/ASSET_REQUESTS_ARENA_DESIGN.md`,
which covers building FACADES and is still wanted.

All GLOBAL RULES from `docs/TEXTURE_GEN_PROMPT.md` apply unchanged:

- **Strictly tileable in X and Y**, 1024×1024 PNG.
- **No baked lighting** — no shadows, vignettes or highlights in the albedo.
- **No text or signage.**
- Maps, same tiling: `_albedo` (sRGB) · `_normal` (OpenGL +Y) · `_rough`
  (white = matte) · `_metal` only where marked · `_emissive` only where
  marked (black background, glow in colour).

**Two things specific to this set.** (1) These wrap CHUNKS — a structure is
built from ~4–6 unit boxes, one tile per chunk face — so the detail should
read at roughly 4 m per tile and must look right on a cube from any side.
(2) **The albedo must be NEUTRAL in value and lightly saturated**: the game
tints every chunk individually (a crystal field is six different hues, a
basalt mound has ember-lit cracks), and that tint multiplies the albedo. A
texture that is already strongly coloured fights the tint; one that is
mid-grey with structure in it takes any colour cleanly.

## The set

1. `struct_basalt_rock` — **Volcanic Forge.** Cooled basalt: dense, matte,
   near-black-to-charcoal stone with a fine network of contraction cracks
   and a granular, glassy grain. A few cracks slightly open, catching a
   little dust. Neutral grey-brown so the ember tint can take. **+emissive**
   (a sparse, dim glow in the deepest cracks only — most of the tile should
   be black in the emissive map).
2. `struct_crystal_facet` — **Crystal Quarry.** A mass of interlocking
   crystal facets: flat angular planes at different orientations, sharp
   arrises between them, some faces glassy and some frosted, fine internal
   fracture lines. Nearly WHITE with only a hint of colour — the game
   supplies the hue per chunk (violet, cyan, rose…). Low roughness overall,
   with the frosted facets rougher. **+emissive** (a soft inner light along
   the fracture lines, white — it gets tinted with the chunk).
3. `struct_ice_glacier` — **Frozen Outpost**, the natural bergs. Dense
   glacial ice: compressed layers, trapped air bubbles in bands, hairline
   fractures, a chalky wind-scoured surface on some areas and clear blue-ish
   ice on others. Pale, cool, low-saturation.
4. `struct_ice_cut` — **Frozen Outpost**, the station's cut-ice works. QUARRIED
   ice blocks: saw marks in parallel scoring across the face, clean edges,
   internal cracks and frost bloom at the corners. Reads as worked material
   rather than geology. Pale and clean — it is rendered semi-transparent, so
   keep the albedo light and even, with the interest in the normal map.
5. `struct_rock_grey` — **Crystal Quarry** benches and general outcrop.
   Fractured grey-violet mine rock: blocky conchoidal fracture faces, drill
   scoring on a few flats, dust settled in the recesses. Matte. (Same family
   as `ground_quarry_rock` but at chunk scale and without the crystal
   flecks.)

## Nice-to-have, not required

6. `struct_basalt_column` — jointed columnar basalt (the hexagonal-column
   cliff face seen side-on). If provided, it will be given to `basaltCliff`
   and `struct_basalt_rock` kept for the mounds; without it both use the
   rock. Say the word and I will wire the second name.

## What is NOT requested

- Building facades — that is `docs/ASSET_REQUESTS_ARENA_DESIGN.md` (the
  desert-temple, mossy-temple, arctic, basalt, rock-cut, station-hull,
  dock and rust facades). Those still apply and the temple themes visibly
  want theirs: the ruins and jungle silhouettes are correct now but are
  still wearing industrial brick.
- Prop models — the sphinxes, gates, colonnades and crystals already exist.
- Ground, sky and horizon sets — complete for all twelve arenas.
