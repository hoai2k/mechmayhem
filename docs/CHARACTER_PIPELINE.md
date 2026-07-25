> Part of the mech art pipeline — start at [MECH_ART_GUIDE.md](MECH_ART_GUIDE.md)
> (this file is the deep dive for the rigged-GLB route (A)).

# Character Pipeline — AI-generated rigged mechs

The game can replace any of its 12 procedural mechs with a high-detail rigged
GLB model, while keeping the **entire existing animation and combat system**
(walk/run, 3-hit combos, heavies, blocks, knockdowns, specials, ults, victory
poses — everything). Models are retargeted at runtime via world-space rotation
offsets, so any standard humanoid rig works without hand-tuning.

## What an incoming model needs to be

- **A single humanoid character in T-pose or A-pose** (arms out / arms ~45°).
- **Rigged** (skinned to a skeleton). Mixamo-style bone names are matched
  automatically; other conventions usually work too (see aliases in
  `src/mechs/rigadapter.js`), with `boneOverrides` as an escape hatch.
- **GLB format**, facing +Z (use `yawOffset` if not).
- It does **not** need animations — the game animates it.

## Recommended workflow

1. **Canonical images** — generate with the prompt sheets in
   [`canonical-prompts.md`](canonical-prompts.md) (Midjourney / DALL-E /
   SDXL / etc.). Best results for the 3D step: full body, T-pose or neutral
   stance, front view (plus side/back views if the service accepts
   multi-view), plain background, whole character in frame.
2. **Image → 3D** — use one of:
   - **Meshy.ai** (image-to-3D + auto-rig + texture; API available)
   - **Tripo3D** (same feature set; API available)
   - Any mesh source + **Mixamo auto-rigger** (free; upload mesh, place
     markers, download rigged FBX → convert to GLB, e.g. in Blender)
   Ask the service for **T-pose rig** output when offered.
3. **Drop into the game**:
   - Put the file at `public/models/<mechId>.glb`
   - Add an entry to `public/models/manifest.json`:
     ```json
     {
       "titanus": { "url": "models/titanus.glb", "bindPose": "tpose" }
     }
     ```
   - Run the game. That mech now uses the model; everything else is untouched.
     Any mech not in the manifest keeps its procedural model, and a model that
     fails to load falls back automatically.

If you provide a **Meshy or Tripo API key**, steps 2–3 can be fully automated
from the canonical images (generation, rigging, download, manifest update).

## Manifest options

| Field | Default | Meaning |
|---|---|---|
| `url` | — | path under `public/` |
| `bindPose` | `"tpose"` | `"tpose"`, `"apose"`, `"native"` (already arms-down), or a custom `{joint:[x,y,z]}` degree map |
| `boneOverrides` | `{}` | force joint→bone mapping, e.g. `{"torso": "Spine2"}` |
| `modelScale` | — | **the model's size of record.** Absolute scale on the GLB's native units. Set it (see below) and it is the ONLY input to the model's size |
| `rig` | — | use a hand-authored skeleton from `src/mechs/rigs/<name>.rig.js` instead of the file's own (see MECH_ART_GUIDE §7) |
| `heightScale` | `1.0` | deliberate artist tweak multiplied on TOP of `modelScale` — "make viper 10% bigger" |
| `yawOffset` | `0` | degrees, if the model doesn't face +Z |
| `emissiveBoost` | — | multiply emissive intensity (make cores/visors pop with bloom) |
| `stretch` | `{}` | lengthen limb segments, e.g. `{"elbowL": 1.2, "handL": 1.2}`: multiplies that joint's bone offset from its parent (skin follows) — for models whose proportions undershoot the mech (measure bone-chain vs `computeDims` before guessing) |

### Model scale is FROZEN, never derived from the rig

**Rule: a GLB's rendered size must be a function of the FILE plus its
`modelScale` number — never of where its rig's bones sit, or of which bone owns
which vertices.** Re-rigging or re-skinning a character must not resize it.

There is history here. `gltf.js` originally auto-sized every GLB by matching its
rendered *head-region* top to the procedural mech's canonical head top. That
reads bone positions **and** skin weights, so the model's size was a live
function of its rig. It bit us on TITANUS: his old auto-rig's `head` bone owned
the tall back exhaust towers, so the "head top" being matched was really the
tower tips (which happened to land on the canonical height). Giving him a
correct skeleton moved that region onto his actual head — a low block sunk
between the pauldrons — the match clamped at its `1.12` ceiling and he rendered
**5.7% bigger**. A measured rig-perturbation test showed the unpinned path
resizing him by up to **14%** from bone moves alone.

So the head match is only a **bootstrap** for sizing a brand-new GLB. Capture
what it produced and pin it:

```bash
node tools/pin-modelscale.mjs            # pin every unpinned entry (idempotent)
node tools/pin-modelscale.mjs --check    # CI: exit 1 if anything is unpinned
```

Once `modelScale` is present, gltf.js **skips both head-match passes entirely**,
so rig edits can never change height. An unpinned entry logs a one-time console
warning with the exact number to paste. `--repin` re-derives and overwrites, and
is almost always the wrong tool: the pinned number is the size of record, so
re-deriving it after a rig change *is* the silent resize this mechanism exists to
prevent. Change size deliberately by editing `modelScale` (or `heightScale`).

`?debug=models` and `tools/pin-modelscale.mjs` both cover `alt` sub-entries, so a
model variant carries its own pin.

## Verifying a model

- `?glbview=<mechId>[&yaw=<deg>]` — the raw file with NO rig and neutral
  lighting: judge which way it's authored facing (the red pillar marks +Z)
  and its true bind stance before trusting in-game shots, where core/glow
  lights can make the back read as a face. Screenshot yaw 0/90/180/270.
- `?rigtest` — sanity-check the retarget math on a synthetic Mixamo-style
  skeleton (15/15 bones should map; puppet should stand arms-down and animate).
- `?battle=uptown&p1=<mechId>&p2=viper&auto=1` — watch the actual model fight.
- Checklist: arms hang naturally at rest (if not → wrong `bindPose`),
  feet on the ground (→ `heightScale`), facing its opponent (→ `yawOffset`),
  fists lead punches (if elbows bend backwards, a bone got mismapped — check
  the console warning and add `boneOverrides`).

## How the retargeting works (for maintainers)

`src/mechs/gltf.js` builds the invisible *virtual skeleton* (the same joint
rig the procedural mechs use) and parents the scaled GLB under the mech root.
`src/mechs/rigadapter.js` poses the virtual rig into the model's bind stance
(e.g. T-pose), records per-joint offsets `O = jointWorld⁻¹ · boneWorld`, then
every frame after the Animator runs sets each mapped bone (parents first) to
`local = parentWorld⁻¹ · jointWorld · O`, plus a hips-translation channel for
bobs/crouches. Convention-free: no per-axis fix-ups per rig.
