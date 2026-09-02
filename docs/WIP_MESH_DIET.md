# WIP — mech model diet (textures + decimation) · restart notes

Branch: `claude/mesh-optimized-models-eval-u2m0dd`. Session may be resumed from
here; every step below is either committed on the branch or listed as TODO.
Delete this file (fold the result into TASKS.md) when the work lands on main.

## Decided
- `public/models/opt/` (gltfpack over the PORTABLE EXPORT) is NOT usable: folded
  transform (double scale/yaw through the manifest), baked rigs/renamed bones,
  30 baked clips, unnormalized uint16 positions `dequantize.js` does not unfold
  (skin audit reads 144k severity), missing fallback .bin, anchors shift 1-13 u.
  Recommend deleting the folder.
- Diet is done IN-REPO on the shipped masters by `tools/mechopt.mjs`
  (simplify via meshopt `simplifyWithAttributes` with normals+skin weights in
  the metric, ratio 0.5, error ladder, bbox drift gate 0.5%; textures
  baseColor/normal -> 1024², metallicRoughness -> 512², JPEG q85). Files stay
  PLAIN glb (dist.mjs compresses at release). Sidecar `source/<id>.opt.json`
  records the commit; `--restore` reads the pre-diet bytes from git.
- Only BAKED mechs are simplified (vertex-keyed skinOps/rig/seamCuts break on
  renumbering). Unbaked get textures only.
- Props: already optimized (propopt). Buildings: voxel donors, not applicable.

## Done (committed)
- bake tool: a refused/crashed --apply rolls back its archive (merged to main).
- bake export drops `__*` geometry.userData (the feather cache); `tools/stripcache.mjs`
  stripped konga 29.6->7.9 MB and saurion 45.7->11.8 MB (BIN chunk byte-identical).
- gltf.js: rocket-fist split gated on skeleton bone names, not the rig file
  (titanus' bake failed only because the baked build lost the split: 3 skinned
  meshes vs 1).
- tools/mechopt.mjs written; dry run: glacier/konga/saurion 50% tris, drift <0.06%.

## Bake status of the four unbaked mechs
- tritone: dry run PASSES (main's "bake keeps a rig's game fields") -> bake with --apply.
- titanus: dry run PASSES with the fist gate fix (skin 0.001%, 3 skinned meshes both sides).
- nullbot: the 1.73% was the SEEDED PRNG sliding between the two load paths (his
  signature fires random head ticks); captures now return a CONSTANT 0.5 ->
  re-running dry run.
- jerry: first dry run hit a playwright navigation timeout -> re-running.
- Texture decision MEASURED: select-screen framing, control shot (ship vs ship)
  noise floor mean 2.88/255, PSNR 25.4; 1024 -> 2.26/27.0, 512 -> 3.52/24.2 on
  titanus; crops at 2x show no visible difference on decals. Dials: tex 1024,
  mr 512, q85 (mechopt defaults).

## In flight (scratch dir of this session; re-run if lost)
- `tools/scratch/_dietgate.tmp.sh konga saurion glacier` (gitignored harness):
  patches manifest urls to public/models/_diet/, runs hurtboxfit + skindebug +
  groundprobe + poster shots, restores. Baselines: hurtbox konga 88%/1.22,
  saurion 78%/1.16, glacier see hurt_ship; groundprobe under-floor clips
  konga 7/19, saurion 6/20, glacier 5/20; skindebug konga 20 findings/~280,
  saurion 28 findings.
- nullbot + jerry dry-run bakes re-running alone (a first attempt crashed the
  browser while three ground probes shared the renderer — never run two
  browser harnesses at once on SwiftShader).

## TODO
1. (done) Texture size decision -> 1024/512.
2. Read the gate results; if hurtbox containment holds and skin/ground match
   within noise, the 0.5 ratio stands.
3. Bake tritone (+ titanus/jerry/nullbot if they pass) with --apply.
4. `node tools/mechopt.mjs --apply` on the roster; run gates; `node tools/posters.mjs`.
5. Remove public/models/_texprobe, _diet, tools/scratch/_*.tmp.mjs; update
   CLAUDE.md + TASKS.md; commit; merge --no-ff into main; push.
6. Report + local-agent guidance (Blender only if a mech cannot be baked).
