# Tripo GLB generation status

Session 2026-07-18. Goal: rigged GLBs for all 17 mechs from `docs/canonical/`
images via Tripo API → `public/models/` + `manifest.json` → main.

> **The `?debug=3d` flag described in the session logs below is superseded**
> (2026-07-25). The GLB models are now the DEFAULT everywhere; `?debug=fallback`
> is what forces the procedural roster. `?debug=3d` still resolves to GLBs, so
> the older URLs in this file keep working.

## How to resume (any fresh session)

1. `TRIPO_API_KEY=<key> NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
    node tools/tripogen.mjs --all` — regenerates ONLY mechs not marked done
   in `tools/tripo-state.json` (never delete that file: it is the
   spent-credits ledger; `--status` prints it, `--redo <id>` forces one).
   Node needs the two env vars in sandboxed sessions (proxy + CA).
2. Per new model: `node tools/rigmap.mjs public/models/mech_<id>.glb --table`
   prints per-bone skin-centroid rows (lat/height/fwd/weight%/parent) —
   classify by position (legs reach h≈0, head topmost, arms lateral),
   write `boneOverrides` into `public/models/manifest.json`. Names: three
   strips `::` → `tripo0_Left_Limb_0` etc. Rig v2.5 IGNORES spec:mixamo.
3. `bindPose:"native"` works for all Tripo rigs (they bind in the authored
   stance); `yawOffset` is 90 or 270 for every model so far — check with
   one `?showcase=<id>&anim=walk` shot (see MECH_ART_GUIDE §4 waits).
4. Verify walk + battle, run soak + `npx vite build`, commit.

## Engine changes this session (already committed)

- FLAG: GLBs are opt-in — `?debug=3d` enables service models; default (and
  any other value) runs procedural. Flip lives in gltf.js loadManifest.
- rigadapter interQ: unmapped intermediate bones folded into retarget.
- gltf.js: ground on *rendered skinned* bbox (measure AFTER container
  assembly + updateMatrixWorld); SkeletonUtils.clone.
- tools/tripogen.mjs (API driver), tools/rigmap.mjs (mapping aid).
- WARNING: do not run several tripogen processes in parallel — they
  clobber each other's tripo-state.json saves (models still download).

## Per-mech status

| Mech | GLB | Integration |
|---|---|---|
| titanus | ✅ 7.4MB | ✅ verified |
| vulcan | ✅ 7.2MB | ❌ rig has no arm bones — procedural (regen w/ new seed may fix) |
| aegis | ✅ 7.2MB | ✅ verified (fresh-seed regen) |
| viper | ✅ 7.1MB | ✅ verified |
| nova | ✅ 7.5MB | ✅ verified |
| rhino | ✅ 7.0MB | ✅ verified |
| tempest | ✅ 7.0MB | ❌ rig has no leg bones — procedural (regen w/ new seed may fix) |
| fenrir | ✅ 7.7MB | ✅ verified |
| colossus | ✅ 7.1MB | ✅ verified |
| wraith | ✅ 6.9MB | ✅ verified |
| inferno | ✅ 7.2MB | ✅ verified (2-segment legs; ankles unmapped) |
| glacier | ✅ 7.5MB | ✅ verified |
| cranky | ✅ 7.4MB | ✅ verified |
| saurion | ✅ 11MB (simplified from 59MB) | ✅ verified |
| frogger | ✅ 7.1MB | ✅ verified (2 of 4 arms driven) |
| jerry | ✅ 7.6MB | ✅ verified (claws driven; skirt legs static) |
| nullbot | ✅ 6.8MB | ✅ verified (new Tripo model replaced old GLB) |


- aegis: model not riggable per prerigcheck → fresh-seed regen queued.
- jerry: model OK, rig task failed server-side → rig retry queued.
- vulcan + tempest: GLB present but rig lacks arm/leg bones (auto-rigger
  merged limbs) → keep procedural; a re-rig would likely repeat (rig
  follows geometry); regenerating the model with a new seed MAY help.
- saurion: 59 MB (generated before face_limit was added) — shrink with
  `gltf-transform simplify` locally (same skeleton, no credits) or --redo.
- nullbot: new Tripo model REPLACED the old GLB; old manifest entry
  (custom bindPose+stretch) belongs to the old file — remap needed.

Credits: 2000 start → ~1005 left (15×55 + aegis 30+55retry + jerry 25 rig retry).

## Verification record (2026-07-18)

15/17 mechs run their Tripo GLB in-game; vulcan + tempest keep procedural
(auto-rig merged their limbs — silhouettes hug the body). Verified: walk
showcase shots per mech, 12-mech lineup, ace soaks (saurion/viper,
titanus/nullbot, fenrir/glacier, cranky/frogger, jerry/aegis — zero
crashes), `vite build` green. `?debug=backup` bypasses all GLBs.

Contract notes (silent degradations vs §5, procedural-only features):
vulcan gatling spin & podL, colossus mortars, nova halo spin, fenrir tail
wag, viper blade flare, wraith rifle/scope anchors, tempest coils,
nullbot glow2 shard dress (GLB_DRESS was written for the OLD nullbot
model; visual check of the new model looked fine without it). Muzzle/core
anchors fall back to virtual-joint defaults everywhere — combat works.


## Facing pass (2026-07-18, second session)

User saw titanus+saurion backwards in battle. Root cause: showcase judging
camera sits at +Z looking -Z (showcase.js:53), and battle points a mech's
+Z at its opponent — so "faces the showcase camera" == battle-forward. My
first-pass yaws were eyeballed and several picked the BACK (glow lights read
as a face — MECH_ART_GUIDE §6 warns of this). Re-verified all 15 against the
true front (chest labels, eyes, toes) and against a battle engage shot
(opponent-facing == back to showcase camera). Final yawOffsets: most bipeds
270; cranky/glacier... see manifest. Creatures need non-biped angles:
saurion 300 (diagonal body — nose-vector solved via tools/rigmap-style
head-vs-hips XZ probe), fenrir 270. Verified: per-mech front shots, 12-mech
lineup, saurion-v-fenrir engage (correct mutual facing), vite build green.
## Session 3 (2026-07-18): sizing, spinner, pose tool

- `?debug=3d` is the switch (default = procedural). In 3d mode, menus show a
  glow-tinted loading spinner instead of the procedural stand-in while a GLB
  downloads, then swap the GLB in. Title lineup + chooser + battle all use
  GLBs. Mechs with no GLB (vulcan/tempest) still show procedural.
- Head-height sizing (gltf.js buildGlbMech): each GLB is scaled so its head
  bone sits at the procedural head-joint height, so GLB + procedural bodies
  read at the same size (raised tails/weapons/crystals no longer shrink the
  body). entry.heightScale still tunes per-mech.
- `?debug=models` pose-matching tool (src/dev/posetool.js): procedural (left)
  vs GLB (right), orbit camera + per-bone rotate/translate gizmo. "Output
  config" emits a manifest patch — `boneCorrections` (local rotation applied
  after retargeting) and `bonePos` (rest-position nudge) — copied to clipboard
  + downloaded. Runtime consumes both (rigadapter.js / buildGlbMech). Use it
  to hand-correct any GLB whose retargeted rest pose drifts from the intended
  silhouette, then paste the patch into public/models/manifest.json.

## Regenerating vulcan / tempest (the two unusable rigs)

Their `image_to_model` succeeded but auto-rig merged the limbs (vulcan: arms
against body → no arm bones; tempest: coat over legs → no leg bones).
`image_to_model` takes NO text prompt, so a plain retry only varies
`model_seed` — semi-blind. Real levers to bias success:
  1. Regenerate the SOURCE image into a clear A/T-pose with limbs separated
     (Tripo's text-to-image / image-edit endpoints DO take a prompt), then
     image_to_model that. This directly addresses the merge cause.
  2. `enable_image_autofix: true` on image_to_model.
  3. Different `model_seed` (cheapest, least reliable).
Not yet attempted — ~55 credits each; ~1005 credits remain.

## Session 4 (2026-07-18): GLB animation profiles

- Cranky GLB facing fixed (yawOffset 90 -> 270).
- New GLB animation-profile system (`src/mechs/glbanim.js`) — per-model
  reinterpretation of the shared animation engine. The Animator still drives
  the same virtual joints + timing (combat hit-windows / muzzle anchors /
  state durations unchanged); a profile only changes HOW a pose reads for one
  GLB via four seams: `restPose`, `combatPose`, `mirrorArms` (swap L<->R arm
  clip tracks for opposite-hand weapons), `clipOverrides` (bespoke clip when
  an action must be redone not remapped), and `post(anim,dt,ctx,tgt)` (per
  frame hook run after signature()). Procedural mechs carry no profile
  (identity) — provably unchanged, verified by soak.
- Factoring contract (in the file header): shared motion -> animations.js /
  roster def; procedural personality -> animator.signature(); one GLB's
  interpretation -> its profile; a GLB's static bind alignment -> manifest
  boneCorrections via ?debug=models (kept separate from restPose).
- Authored reinterpretations: AEGIS (shield rides the left forearm with no
  J.shield joint on the GLB — post presents it square to the front while
  guarding, reproducing the procedural intent); VIPER (blades ride ALONG the
  forearms, so an in-hand-style hand roll twists them flat — post damps hand
  roll/yaw during attacks and lets the shoulder+elbow arc carry the slash).
  Other 13 GLBs: documented identity entries (retargeted procedural motion
  already reads correctly) — a home for future per-model work.
- Verified: aegis guard + battle, viper heavy swing, ace soaks
  (aegis/viper + titanus/saurion in 3d, aegis/viper procedural) zero crashes,
  vite build green.

## Session 5 (2026-07-19): vulcan + tempest regenerated & integrated (17/17!)

Canonical images verified clean (vulcan arms clearly separated, tempest legs
split). Fresh-seed regens both now PASS prerigcheck (biped) — the original
seeds' merged-limb geometry was the cause, not the source art.
- tempest: fresh seed → prerigcheck ok → rig failed once server-side → plain
  rig RETRY landed. Mapped (yaw -90) + verified idle/walk/soak.
- vulcan: fresh seed #1 rig failed twice (same model). A SECOND fresh model
  (--redo) rigged on the first try. Mapped (yaw 270) + verified. Both gatling
  arms + missile pods read correctly.
Lesson: when a rig fails right after a passing prerigcheck, retry the rig
ONCE; if it fails again, regenerate the MODEL (--redo, new seed) rather than
retrying the same model's rig. Credits: ~895 left.

ALL 17 mechs now have integrated, verified GLBs (no procedural fallbacks
except by ?debug default / missing-file safety).

## Promotions (2026-07-19)

- nova + tempest: P1 alternates PROMOTED to primary (user judgment) — old H3
  GLBs deleted, alt intake became the primary manifest entry, files renamed
  to mech_nova.glb / mech_tempest.glb (3.3/3.0 MB). No .alt remains for them.
- aegis_alt facing fixed: authored diagonally → yawOffset 315 (glbview sweep).
- Alternates still pending judgment: aegis (spear/banner), jerry (spider-crab).

## Session 6 (2026-07-20): skin workbench passes + rig-repair features

User authored ?debug=skin passes shipped for: rhino (18 ops), jerry (7),
titanus (32), aegis (63), frogger (93), inferno (100), viper (72). All are
FULL replacements of that mech's manifest skinOps (the workbench exports the
complete list).

New engine seams added this session (all manifest/data-driven):
- skinOps `{"purgePair": ["boneA","boneB"]}` (skinops.js): the two bones
  never share a vertex — kills Tripo's mirrored-limb weight bleed (inferno's
  thighs bulged each other; sibling limbs sit at hierarchy distance 2, under
  purgeFar's minDist=3 default).
- manifest `reparent` `{"child": "newParent"}` (gltf.js, per-clone, attach()
  world-preserving): fixes auto-rig hierarchy mistakes. fenrir: front paws
  (tripo0_Right_Limb_0, bone_40) re-hung from tripoRoot onto the hand bones;
  chest mass bone_20 off the right hand onto tripoSpine_1; hind legs remapped
  to the real chains.
- glbanim profile `build(mech, def)` seam (called at end of buildGlbMech):
  attach procedural geometry/joints to a GLB's virtual rig. wraith: wears the
  PROCEDURAL cape (wraithCloak() extracted from designs/wraith.js) — hidden
  normally, grown in during the wing-laser heavy; heavyFlare/heavyRaise/
  heavyImpactFx then work unchanged (cloak joints + wing0..5 anchors exist).
- `GLB_CLIP_VARIANTS` (animations.js): bespoke GLB clips compiled UNDER THE
  ORIGINAL NAME so fighter machinery keyed on def.heavyClip still matches.
  wraith's hover lift-off → grounded forward lean.
- manifest muzzles `bone` now also accepts RAW GLB bone names (not just
  boneMap keys). wraith muzzles.R = measured rifle barrel tip in handR frame.
- ghostWalk (specials.js) bakes SkinnedMeshes skin-aware (getVertexPosition)
  — the naive matrixWorld bake floated the GLB spectre meters up (the same
  Armature-offset trap as skinnedBox; see that comment in gltf.js).
- skintool grounding fixed the same way (skinnedBox export).
- wraith left arm remapped: intake had the cape chain (bone_18/19/20) as the
  left arm; real arm is bone_26/27/28.

Deploy note: GH Pages had a brief platform outage ("no server available",
Configure Pages step) — if a deploy fails there with a green build, just
re-run or push again.
