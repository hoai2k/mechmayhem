# Prompt for Codex — generate the ROBOTWORLD texture pack

> **Status: this pack has been generated and is in play.** Kept as the
> reference for the pack's conventions and for regenerating an entry. What is
> still outstanding is listed in `docs/ASSET_REQUESTS_STRUCTURES.md`, and
> `node tools/assetcheck.mjs` is the live answer either way.

Copy everything below the line into Codex. When the images come back, commit
them to **`src/textures/<set>/<name>/`** using the exact file names given —
the game picks them up from there and nowhere else (`src/core/texload.js`
globs that folder at build time, which is what makes `hasTex()` a synchronous
answer). `src/textures/` is NOT read: images put there are silently
ignored. See ASSETS.md for the rule, and `node tools/assetcheck.mjs` will
tell you if anything has landed in the wrong place.

---

Use image generation to produce a complete pack of **seamlessly tileable PBR
textures** for a stylized-realistic 3D mech arena game (Three.js,
MeshStandardMaterial). Follow these global rules for EVERY texture:

**Global rules**
1. **Strictly tileable in both X and Y** — edges must wrap with no visible
   seam. Verify by mentally offsetting the image 50%/50%: no discontinuities.
2. **1024×1024 PNG** (use 2048×2048 only for the 12 ground materials).
3. **No baked lighting**: flat, even, shadowless illumination. No vignettes,
   no sun direction, no ambient occlusion corners, no specular highlights
   painted into the albedo.
4. **No text, logos, numbers or signage** in any texture (the game stamps its
   own decals).
5. For each material produce up to four maps, same tiling, exact suffixes:
   - `<name>_albedo.png` — sRGB color.
   - `<name>_normal.png` — OpenGL-style tangent normal map (+Y green up),
     medium strength; surface relief only (seams, rivets, grain), not shapes.
   - `<name>_rough.png` — grayscale roughness (white = rough/matte,
     black = mirror).
   - `<name>_metal.png` — grayscale metalness, ONLY where the list says
     `+metal` (white = raw metal, black = dielectric/paint).
   - `<name>_emissive.png` — ONLY where the list says `+emissive` (black
     background, glowing elements in color).
6. **Texel density**: environment textures read correctly at ~4 m per tile;
   robot textures at ~2 m per tile. Detail scaled accordingly — chunky,
   readable forms, not microscopic noise.
7. Style: realistic materials with a slightly stylized, clean-graded look
   (AAA game texture, not a photo scan with baked shadows). Battle-worn where
   noted: chipped paint edges, scuffs, grime settled in crevices.

## SET A — arena grounds (2048², one per arena) → `src/textures/ground/`

1. `ground_neon_asphalt` — dark wet-look city asphalt, faint cracks, patched
   tar lines, subtle oily iridescence. +metal(dark ~10%).
2. `ground_foundry_ironplate` — riveted cast-iron factory floor plates,
   soot-stained, heat-discolored blue/brown patches. +metal.
3. `ground_uptown_paving` — large light concrete plaza pavers with thin
   expansion joints, clean, light wear.
4. `ground_harbor_concrete` — weathered dock concrete, salt stains, faded
   yellowish wear patches, hairline cracks.
5. `ground_skyterrace_roofpanel` — rooftop composite deck panels, light gray,
   anti-slip texture strips, drainage perforation rows.
6. `ground_scrapyard_dirt` — packed brown dirt mixed with embedded small
   metal scraps, bolts and shavings, oil spots. +metal(sparse flecks).
7. `ground_quarry_rock` — cool gray-violet fractured mine rock with sparse
   embedded pale crystal flecks that catch light (low roughness flecks).
8. `ground_volcano_basalt` — dark basalt with a fine network of cooled
   cracks; a few cracks glowing ember orange. +emissive(crack glow).
9. `ground_frozen_snowice` — wind-packed snow over blue-gray ice, drift
   ripples, scattered refrozen patches (glassy low-roughness areas).
10. `ground_ruins_sandstone` — ancient worn sandstone slabs, sand pooled in
    the joints, chipped edges, faint relief carving traces.
11. `ground_jungle_mossstone` — old fitted stone blocks, heavy moss in the
    seams, dark damp patches, tiny roots.
12. `ground_orbital_deck` — spacecraft landing-deck alloy panels, hexagonal
    sub-pattern, brushed metal, subtle warning-free markings (plain geometric
    lines only). +metal.

## SET B — building facades (1024², used on destructible towers) → `src/textures/building/`

Each must tile so one tile ≈ one building floor (a band of windows +
spandrel). Windows should be geometric and regular.

13. `bldg_glass_office` — blue-glass curtain wall, aluminum mullions.
    +emissive(a scatter of ~30% lit windows, warm white).
14. `bldg_brick_industrial` — dark red-brown industrial brick, steel-framed
    windows, grime streaks under sills. +emissive(sparse warm windows).
15. `bldg_concrete_panel` — prefab concrete panel facade with recessed
    window rows, water stains. +emissive(sparse cool-white windows).
16. `bldg_steampunk_metal` — riveted iron-and-brass facade, arched window
    strips, patina streaks. +metal. +emissive(amber round windows).
17. `bldg_roof_gravel` — flat-roof gray gravel ballast with tar seams.

## SET C — prop / detail materials (1024²) → `src/textures/prop/`

18. `prop_container_steel` — corrugated shipping-container wall, sun-faded
    paint, rust blooms at ribs. +metal(rust areas).
19. `prop_rust_heavy` — heavily rusted steel plate, flaking layers. +metal.
20. `prop_brass_worn` — worn brass/copper sheet, polish highs and dark
    patina lows. +metal.
21. `prop_wood_planks` — weathered gray-brown dock planks, nail heads.
22. `prop_concrete_barrier` — cast concrete, form lines, chips, rebar rust
    streak.
23. `prop_tarp_canvas` — waxed canvas/tarpaulin weave, faded olive, creases.
24. `prop_crystal` — translucent pale-cyan crystal facets, internal veining
    (low roughness, high clarity feel).

## SET D — robot armor materials (1024²) → `src/textures/mech/`

IMPORTANT: the game TINTS armor per-mech, so albedo for 25–28 must be
**neutral light gray (~#b0b0b0), fully desaturated** — variation through
value and wear only, not hue. 29–32 are used as-is.

25. `mech_armor_clean` — smooth painted armor plate (neutral gray), fine
    panel lines, faint brushed undertone, minimal wear. +metal(panel-line
    scratches only).
26. `mech_armor_worn` — same plating battle-worn: chipped edges exposing
    bare metal, scuffs, grime in recesses. +metal(chips = white).
27. `mech_armor_heavy` — thick riveted heavy-mech plating (neutral gray),
    weld seams, bolt heads, dents. +metal(edge wear).
28. `mech_panels_greeble` — dense sci-fi panel mosaic (neutral gray):
    hatches, vents, recessed lines — mainly for the NORMAL map; albedo
    nearly flat. +metal(subtle).
29. `mech_steel_bare` — bare brushed/forged steel, anisotropic grain, heat
    marks. +metal(full white).
30. `mech_gunmetal_dark` — dark blued gunmetal, fine machining marks,
    fingerprint-free. +metal(full white).
31. `mech_joint_rubber` — black articulated joint material: ribbed rubber
    boot / cable bundles / flexible mesh, matte.
32. `mech_hazard_stripes` — black/yellow diagonal hazard stripes on worn
    metal, paint scuffed through to steel. +metal(scuffs).

Deliver as one folder per material containing its maps, e.g.
`ground/ground_neon_asphalt/ground_neon_asphalt_albedo.png` (+ `_normal`,
`_rough`, and `_metal`/`_emissive` where specified). 32 materials total.

---

# ADDENDUM — round 2 (after in-game testing of the first pack)

The pack is wired in and working (`use_textures` flag, on by default;
`?textures=0` disables). These are the gaps and re-dos found in-game.

## Missing entirely (never delivered — same specs as above)
1. `ground_uptown_paving`
2. `ground_skyterrace_roofpanel`
3. `ground_scrapyard_dirt`
4. `ground_volcano_basalt` (+emissive crack glow)

## Please REGENERATE (quality issues in-game)

**All GROUND textures — kaleidoscope artifact.** The current grounds were
made tileable by mirroring, which creates large symmetric "medallion"
motifs that are extremely visible when the texture repeats ~40× across the
arena floor (worst: `ground_neon_asphalt`, `ground_frozen_snowice`,
`ground_quarry_rock`). Regenerate with:
- seamless tiling via offset/blend continuation, NOT mirror symmetry —
  no motif should appear twice symmetrically;
- small, uniform, non-directional detail (crack networks, grain, patches)
  with no large distinctive features that read as a repeating stamp;
- overall value variation kept LOW (±10%) so repetition is invisible.

**`bldg_glass_office` — reads beige/woven in-game.** Regenerate with:
clearly BLUE reflective glass panes (cool, saturated), near-black slim
mullions, higher contrast between glass and frame; emissive map windows
brighter and sparser (~25%).

## Nice-to-have additions (new)
- `ground_road_markings` — TRANSPARENT PNG overlay tile (lane lines /
  crosswalk fragments, worn) to composite over city grounds.
- `mech_core_glow` — emissive-only radial reactor glow disc (black bg).
- `prop_kelp_fouling` — barnacles/kelp fouling patches with alpha, for the
  crab mech and harbor props.
