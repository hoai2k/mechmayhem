# FX sprite intake (optional)

All elemental particle textures are generated procedurally (fractal noise
flame flipbook, billowy smoke cells, glinting droplet, glossy goop blobs,
ice sparkles) — the game needs NO image files to look right.

> **Overrides HAVE been delivered and are in use today**: `src/textures/sprite/`
> ships `fire_atlas.png`, `smoke_atlas.png`, `slime_atlas.png`, `droplet.png`
> and `ice_sparkle.png` with a `manifest.json`. The procedural generators are
> still there behind them — delete a file (and its manifest entry) and that
> effect falls back to its generated texture. The rest of this page is how to
> add or replace one.

To swap in hand-made / AI-generated sprites, drop PNGs into
`src/textures/sprite/` plus a `src/textures/sprite/manifest.json`:

```json
{
  "fire":    { "file": "fire_atlas.png",  "cols": 4, "rows": 4, "key": "luma" },
  "smoke":   { "file": "smoke_atlas.png", "cols": 2, "rows": 2, "key": "#00ff00" },
  "droplet": { "file": "droplet.png",                           "key": "#00ff00" },
  "goop":    { "file": "slime_atlas.png", "cols": 2, "rows": 2, "key": "#ff00ff" },
  "ice":     { "file": "ice_sparkle.png",                       "key": "luma" }
}
```

Slots: `fire` (additive flipbook, cells animate over each particle's life,
read left-to-right then top-to-bottom), `smoke`, `droplet`, `goop`, `ice`,
`spark`, `glow`. Missing/broken entries silently keep the procedural look.

## Chromakey intake

Generators often can't output alpha. The loader builds it:

- `"key": "luma"` — alpha from brightness. Use for ADDITIVE sprites
  (fire, ice, spark, glow) generated on a **pure black background**.
- `"key": "#00ff00"` (any hex) — chromakeys that color to transparency
  with soft tolerance + despill. Use for normally-blended sprites (smoke,
  droplet, goop) on a **solid neon green/magenta background**. Optional
  `"tolerance"` (default 0.24) and `"softness"` (default 0.22).
- omit `key` — the PNG already has real alpha.

Keep each cell's artwork inside the middle ~75% of the cell (particles
rotate; corners get clipped).

## Image-generator prompts

- **fire_atlas.png** (1024×1024): "4x4 sprite sheet flipbook of one fire
  flame puff loop animation, 16 evenly spaced frames in a grid reading
  left to right top to bottom, turbulent licking flame with bright
  yellow-white core and orange edges, each frame centered in its cell
  with generous margin, pure black background, video game VFX texture,
  no text, no watermark"
- **smoke_atlas.png** (512×512): "2x2 sprite sheet of four different
  billowing smoke puffs, soft wispy volumetric gray smoke with ragged
  edges, each puff centered in its cell with margin, solid bright green
  background #00FF00, video game VFX texture, no text"
- **droplet.png** (256×256): "single glossy water droplet sprite, round
  bead of clear blue water with a bright specular highlight and subtle
  rim light, centered, solid bright green background #00FF00, video game
  VFX texture, no text"
- **slime_atlas.png** (512×512): "2x2 sprite sheet of four gooey slime
  blobs, thick glossy dripping goo with irregular lumpy outlines, wet
  highlights, small satellite drips, pale yellow-green tint, each blob
  centered with margin, solid magenta background #FF00FF, video game VFX
  texture, no text"
- **ice_sparkle.png** (256×256): "single crystalline six-pointed ice
  sparkle sprite, sharp frost star with icy blue-white glow, centered,
  pure black background, video game VFX additive texture, no text"
