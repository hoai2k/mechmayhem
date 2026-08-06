# BUILDING FACADES — delivered, and the rules for the next one

**No outstanding asks.** All ten facade/roof materials requested for the
arena design pass have been delivered and are in play: every theme now
resolves the facade it names (`node tools/assetcheck.mjs` proves it, and
`src/core/assetcheck.js` reports at boot if one ever goes missing).

This file stays as the GUIDELINES for adding another building material.
Still outstanding elsewhere: the structure materials in
`docs/ASSET_REQUESTS_STRUCTURES.md`. The original pack-wide brief is
`docs/TEXTURE_GEN_PROMPT.md`.

## What is in play

| theme | facade | roof |
|-------|--------|------|
| Desert Ruins | `bldg_sandstone_ruin` | `bldg_roof_sandstone` |
| Jungle Temple | `bldg_temple_mossy` | `bldg_roof_mossy` |
| Frozen Outpost | `bldg_arctic_panel` | (shared gravel) |
| Volcanic Forge | `bldg_basalt_plate` | (shared gravel) |
| Crystal Quarry | `bldg_rockcut_crystal` | (shared gravel) |
| Orbital Platform | `bldg_station_hull` | (shared gravel) |
| Harbor Docks | `bldg_dock_corrugated` | (shared gravel) |
| Scrapyard 7 | `bldg_rust_patchwork` | (shared gravel) |
| Neon · Uptown · Sky Terrace | `bldg_glass_office` (shared) | (shared gravel) |
| Ironworks Foundry | `bldg_brick_industrial` (shared) | (shared gravel) |

## Adding another building material

**Where it goes:** `src/textures/building/<name>/<name>_<map>.png`.
`public/textures/` is never read — see `ASSETS.md`.

**How it gets used:** name it on the theme (`buildings.facadeTex` /
`buildings.roofTex` in `src/arena/themes.js`). The lookup is `hasTex`-gated,
so naming one before the images exist changes nothing; commit the images and
the theme picks it up with no code change. While it is being made, add it to
`PENDING_ASSETS` in `src/core/assetcheck.js` — the boot check then lists it
as outstanding instead of reporting it missing, and tells you to delete that
line once it lands.

**The rules** (full version in `docs/TEXTURE_GEN_PROMPT.md`):

- **Strictly tileable in X and Y**, 1024×1024 PNG.
- **No baked lighting** — no shadows, vignettes or highlights in the albedo.
- **No text, logos or signage.**
- Maps, same tiling: `_albedo` (sRGB) · `_normal` (OpenGL +Y) · `_rough`
  (white = matte) · `_metal` where the material is metal · `_emissive` where
  something glows (black background, glow in colour).
- **A facade reads as STOREYS: one tile ≈ one floor band.** Put a readable
  horizontal rhythm in it — a window band, a cornice line, a panel seam. The
  destructible chunks map one tile per chunk face.
- **A roof is seen from above at distance:** chunky, low-contrast detail.
- **Keep the albedo neutral-ish in value.** Chunks are tinted per instance
  (the theme's tints, and the colours a voxelized GLB donor sampled from its
  own texture), and that tint multiplies the albedo.
- Style: stylized-realistic, battle-worn where the theme suits it.
