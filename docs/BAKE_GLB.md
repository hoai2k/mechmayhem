# Baking GLB edits into the asset (`tools/bake-glb.mjs`)

While a mech is being tuned, its look is driven by **manifest edits** applied at
load — a custom `rig`, `skinOps`, `seamCuts`, `reparent`, `stretch`, `bonePos`,
`dropGeo`/`dropBones`, `boneOverrides`. Once the mech
is **finished**, those edits are permanent intent that belongs *in the `.glb`*, so
the manifest entry shrinks to nothing and the on-disk asset is exactly what the
game renders. `tools/bake-glb.mjs` does that finalization as **one reversible
changelist**.

## What it does

Bakes the geometry/skeleton/skin edits into `public/models/mech_<id>.glb`:

- custom `rig` → the re-skinned skeleton (bones named as game joints) + weights
- `skinOps` → the rebound skin weights
- `reparent` → the fixed bone hierarchy
- `stretch` / `bonePos` → the nudged bind transforms
- `seamCuts` → the welded parts cut apart (the seam record rides along as
  `rwSeam` mesh extras, so the skin audit still knows a split from a crack)
- `dropGeo` / `dropBones` → the dropped geometry deleted and its rims capped
- the BONE NAMES → an auto-rig's `bone_28` becomes `shoulderR`, so
  `boneOverrides` goes too
- Jerry-style `post` rods → baked in as bone-parented geometry
- (custom rig) prunes the dead original auto-rig bones

…then strips those fields from the manifest entry and, for a custom-rig mech,
deletes `src/mechs/rigs/<id>.rig.js` and its line in `rigs/index.js`. Before it
writes, `--apply` archives the untouched asset to
`public/models/source/<file>.glb` (once — a re-bake never overwrites the true
original) and writes `public/models/source/<id>.edits.json`: every folded field
with its values, plus the rig file's text. `--restore [--apply]` is the inverse,
off that sidecar.

**All 17 shipped mechs are baked** — every manifest entry is url + scale + yaw +
muzzles (viper keeps `boneCorrections`), and `src/mechs/rigs/index.js` is an
empty `RIGS = {}`.

**Not baked (stays in the manifest/code, re-applied on load):** `bindPose`,
`yawOffset`, `modelScale`, `heightScale`, `boneCorrections`, `muzzles`,
`profileKey`, `limpChains`, `tailFloor`, `emissiveBoost`. (Orientation and size
describe the model, but the game derives live quantities from the runtime scale;
the portable export, `tools/export-mech.mjs`, does fold them.) The runtime motion systems — the `RigAdapter` retarget, the
`glbanim` per-mech gait, muzzle anchors — are unchanged; they drive the baked
bones **by name**, so a finalized mech animates exactly as before. Baking freezes
only the bind *pose + skin*.

A baked GLB auto-maps with no `boneOverrides` because its bones are named exactly
as the game joints and every joint name is a top-priority alias in
`rigadapter.js` `BONE_ALIASES`.

## Usage

```
npm run dev -- --port 5175               # dev server (required); the tool
                                         #   defaults to PORT=5175, a bare
                                         #   `npm run dev` serves :5173 — or
                                         #   run the tool with PORT=5173
node tools/bake-glb.mjs <id>             # DRY RUN — writes mech_<id>.baked.glb,
                                         #   prints fidelity + fields removed,
                                         #   touches no committed file
node tools/bake-glb.mjs <id> --apply     # writes the real changes
```

Both run a **fidelity check**: build the mech pre-bake and post-bake (baked glb
via the stock load path), play **every clip the mech can play**, CPU-skin the
mesh at 5 frames of each and compare the vertices themselves as a fraction of
body height — plus rendered extent, the shoulder/hip lines as a facing check, and
every anchor's rest transform. The captures install a seeded PRNG (reseeded per
clip), so the noise floor is 0.000% (`--noise` measures it); a good bake reads
~0.001-0.002%. `--apply` refuses to write a mech whose check failed, rolling
back just that mech and its archive. Afterwards, also run
`node tools/skindebug.mjs <id>` and `node tools/weldmap.mjs <id> --list` (same
findings? same welds?).

After `--apply`, review `git diff` / `git status` and commit:

```
git add -A && git commit -m "Bake <id> GLB: fold rig/skinning into the asset"
```

## Reverting

That commit is the whole changelist: the `.glb`, the manifest entry, and (custom
rig) the rig file + registry line. `git revert <commit>` (or `git checkout` of
those paths) restores the exact prior working state.

This stays safe **forever** because the shared engine — `applyCustomRig`,
`skinOps`, `rigFor`, the joint-name aliases, `RigAdapter` — is **never removed**,
only per-mech data. Even after every mech is baked, reverting any one bake lands
on machinery that still exists.
