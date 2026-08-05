# ASSET REQUESTS — arena design pass (2026-08)

Image assets that would complete the arena design work. Everything below is
OPTIONAL and pre-wired: each texture is already named by its theme in
`src/arena/themes.js` (`buildings.facadeTex` / `buildings.roofTex`), gated on
the file existing — commit the images and the theme picks them up with no
code change; until then the theme keeps its current shared facade.

Commit each material to `public/textures/building/<name>/` using the exact
file names given (`<name>_albedo.png` etc.), exactly like the rest of the
pack. All the GLOBAL RULES from `docs/TEXTURE_GEN_PROMPT.md` apply
unchanged — the short version:

- **Strictly tileable in X and Y**, 1024×1024 PNG.
- **No baked lighting** (no shadows, vignettes, or highlights in albedo).
- **No text, logos or signage**.
- Maps per material, same tiling: `_albedo` (sRGB) · `_normal` (OpenGL +Y)
  · `_rough` (white = matte) · `_metal` only where marked `+metal` ·
  `_emissive` only where marked `+emissive` (black background).
- FACADES read as building storeys: **one tile ≈ one floor band**, so put a
  readable horizontal floor rhythm in each (a window band, a cornice line, a
  panel seam). The destructible chunks map one tile per chunk face.
- ROOFS are seen from above at distance: chunky, low-contrast detail.
- Style: stylized-realistic AAA game texture, battle-worn where noted.

## Building facades (`public/textures/building/`)

1. `bldg_sandstone_ruin` — **Desert Ruins.** Monumental ancient sandstone
   block wall: large weathered ashlar courses, chipped edges, sand settled in
   the joints, faint traces of relief carving (weathered beyond reading — no
   glyph text), one band per tile suggesting a storey of a temple wall.
   Warm pale ochre. Battle-worn.
2. `bldg_roof_sandstone` — flat sandstone roof to pair with it: big worn
   paving slabs, drifted sand in the corners of the joints, a few cracked
   slabs. Matches `bldg_sandstone_ruin` in hue.
3. `bldg_temple_mossy` — **Jungle Temple.** Ancient stone block facade being
   taken by the jungle: darker grey-green stone, moss filling the joints and
   spreading in patches from one edge, thin roots/vine lines crossing a few
   blocks, one storey band per tile. Damp look (slightly lower roughness in
   mossy areas).
4. `bldg_roof_mossy` — its roof: flat stone slabs half-swallowed by moss and
   leaf litter, a sapling shadow-free tuft or two.
5. `bldg_arctic_panel` — **Frozen Outpost.** Insulated research-station
   cladding: pale grey-blue composite panels with bolted seams, frost creeping
   from panel edges and lower corners, a thin ice glaze patch (glassy low
   roughness), one panel band per storey tile. +metal (bolts, trim).
6. `bldg_basalt_plate` — **Volcanic Forge.** Heat-armoured facade: dark
   basalt-faced panels riveted over structure, scorch licks rising from panel
   bottoms, a few hairline cracks glowing ember orange from within.
   +metal (rivets, frame) +emissive (crack glow, sparse and dim).
7. `bldg_rockcut_crystal` — **Crystal Quarry.** A facade CUT INTO rock:
   drill-scored violet-grey stone courses with structural steel banding at
   each storey line, sparse embedded crystal flecks that catch light (small
   glassy low-roughness facets). +metal (banding) +emissive (a few faint
   violet crystal glints).
8. `bldg_station_hull` — **Orbital Platform.** Spacecraft hull plating: white
   and light-grey panels of mixed sizes, recessed seams, small service
   hatches, the odd micro-meteorite scuff, thin cyan light strip along each
   storey seam. +metal +emissive (the light strips).
9. `bldg_dock_corrugated` — **Harbor Docks.** Corrugated warehouse siding:
   sun-faded painted steel sheets (teal-grey), rust streaks bleeding from
   fastener rows and sheet overlaps, salt bloom near the bottom edge, one
   sheet course per storey band. +metal.
10. `bldg_rust_patchwork` — **Scrapyard 7.** A facade quilted out of salvaged
    plates: mismatched painted panels riveted and tack-welded over each
    other, different faded colors per patch, heavy rust at seams, one
    patchwork band per storey. +metal.

## Why these ten

The pack ships four shared facades (concrete panel, industrial brick, glass
office, steampunk metal) stretched across twelve themes — the Desert Ruins'
towers wear INDUSTRIAL BRICK. With the massing generator now drawing
theme-signature silhouettes (ruined shells, domes, silo batteries, courts —
src/arena/massing.js), the eight themes above are the ones whose walls still
say "generic city" while everything around them says otherwise. Neon,
Uptown, Sky Terrace and Foundry are genuinely well served by the existing
four and request nothing.

## Not requested (already covered)

- Prop models: the sphinx, gates, colonnades etc. all exist; the design pass
  fixed their PLACEMENT (designs/proptraits.js), not their art.
- Ground/sky/horizon sets: complete for all twelve themes.
- The `pave` plaza patch is painted procedurally and needs no texture.
