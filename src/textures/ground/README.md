# Arena ground materials

Delivered 2026-10-01: twelve replacements and twelve `_b` companions,
77 RGB PNG maps at 2048×2048. Base materials include the requested metalness
or emissive maps; companions contain albedo, normal and roughness only.

Generated with the built-in image tool, without mirroring. Native 1254²
outputs were resized to 2048². Normal prompts use OpenGL +Y; roughness and
metalness are RGB grayscale (the shader reads green/blue respectively).
Prompts and export details: `docs/ground-material-generation.json`.

After changing art, run `node tools/groundaudit.mjs --strict`, then
`node tools/groundfolds.mjs --write`. Judge a 2×2 tiled contact sheet and
the material in-game with `node tools/groundshot.mjs <theme> out`.
