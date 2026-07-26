# Mech Art Guide — the master operator manual

**Audience: any AI (or human) continuing this work in a fresh session.**
This is the entry point for turning a concept image of a mech into a
well-rigged, animated, textured in-game character. It routes between the two
implemented pipelines, records the craft knowledge learned building the first
12 mechs, and lists the contracts that must survive any rebuild.

Read this first. Deep dives: [IMAGE_TO_MECH.md](IMAGE_TO_MECH.md) (hand-built
route), [CHARACTER_PIPELINE.md](CHARACTER_PIPELINE.md) (rigged-GLB route),
[canonical-prompts.md](canonical-prompts.md) (image generation prompts).

---

## 0. The decision tree

Given a concept image of a mech, three routes exist. All are implemented.

| Route | Fidelity | Cost | Time | When |
|---|---|---|---|---|
| **A. Service GLB** (Meshy/Tripo image→3D + auto-rig) | highest (microsurface detail from the image) | ~$1–3 credits/model + API key | minutes | hero-quality assets; credits available |
| **B. Hand-sculpted in-engine** (parts-kit geometry + synthesized PBR skins) | high silhouette/palette/wear fidelity, reduced greeble density | free | 1–3 h/mech | no credits; full control; all 12 mechs currently use this |
| **C. Hybrid** | — | — | — | Route A for hero mechs, B for the rest; both coexist per-mech via the manifest |

Route A models **override** route B automatically: any mech with an entry in
`public/models/manifest.json` uses the GLB; everything else falls back to the
in-engine model. A failed GLB load also falls back. The game never breaks.

> **Hard rule for any GLB work — model scale is frozen, not derived.** A GLB's
> rendered size must depend only on the FILE plus its manifest `modelScale`
> number. **Re-rigging or re-skinning a mech must never resize it.** After
> touching any rig, run `node tools/pin-modelscale.mjs --check` (see
> CHARACTER_PIPELINE.md → "Model scale is FROZEN"). The old head-height
> auto-match is a bootstrap for brand-new GLBs only; leaving it live let bone
> moves resize a character by up to 14%.

**Route A steps** (also see CHARACTER_PIPELINE.md):
1. Get a rigged humanoid GLB from the image: Meshy/Tripo web UI (upload →
   generate → auto-rig → download), their APIs (`tools/img2glb.mjs` is a
   best-effort client — VERIFY current API docs first, endpoints drift), or
   free: any mesh through Mixamo's auto-rigger (FBX→GLB via Blender).
   T-pose or A-pose preferred; "native" stance also works.
2. Drop at `public/models/<mechId>.glb`, add a manifest entry
   (`{"titanus": {"url": "models/titanus.glb", "bindPose": "tpose"}}`).
3. Verify (§4). The runtime retargets the game's ENTIRE animation set onto
   the model — incoming GLBs need **no animations of their own**.

**Route A+ — replace a scrambled auto-rig with a hand-placed one.** Tripo's
skeletons are opaque and often wrong (a crab with both claws welded to one leg
bone; a sniper whose cloak and rifle hang off junk bones). When remapping
(`boneOverrides` + `skinOps`) stops paying, author a CUSTOM RIG instead — a
clean skeleton whose bones ARE the game joints, plus static extras for the
parts a humanoid rig has no route for (a tail, a cloak, a gun):

1. `node tools/rigscout.mjs <id> /tmp/<id>` — contact sheets of the raw mesh in
   MESH-LOCAL space with each geometry island numbered and a 0.1 ruler grid, so
   bone positions are read off the picture. `--only=3,25` isolates parts,
   `--focus=x,y,z:size` zooms, `--skin` recolors by the bone that would own
   each vertex (the headless twin of `?rigedit`'s color view).
2. Write `src/mechs/rigs/<id>.rig.js` (`{ skinSpan: 'child', bones: [...] }`),
   register it in `rigs/index.js`, and point the manifest entry at it with
   `"rig": "<id>"` — that supersedes `boneOverrides`/`skinOps`.
3. Tune live in `?rigedit=<id>` (drag bones, Export pastes back).
4. Keep the OLD entry verbatim as `alt` (+ `profileKey` if it needs its own
   glbanim profile) so the two builds can be compared: `?rigedit=<id>&alt=1`,
   `?debug=models`'s *Compare Alternate GLB*, `node tools/variantcheck.mjs <id>`.

Precedents: `cranky`, `fenrir`, `glacier`, `jerry`, `rhino`, `titanus`, `viper`,
`vulcan`, `wraith`.

**Route B steps** (also see IMAGE_TO_MECH.md): §1–§4 below.

---

## 1. Read the image

**Palette** — commit the image to `docs/canonical/<mechId>-front.png`
(the detailed visual read of every canonical image also lives in
`docs/canonical/SPECS.md` — the fallback source of truth if a PNG is
missing), then:
```bash
node tools/palette.mjs docs/canonical/<mechId>-front.png
```
K-means prints dominant colors with roles and a ready-to-paste `skin` block.
Needs a plain background (corners are sampled as background reference).
Validated accuracy: within ~2%/channel of hand-picked values on VULCAN.

**Proportions** — measure fractions off the image before modeling. Record,
as fractions of total height: shoulder span, chest width vs waist width
(pinch ratio), arm length (where do the hands hang — hip? knee?), forearm
vs thigh thickness, leg length, head size, foot size. Example reads:
VULCAN chest ≈ 2.3× waist width; TITANUS fists hang to knee height and each
fist ≈ 1.5× head width. These ratios are what make a likeness — get them
right before any detail work.

**Wear** — eyeball `wear` (chip density 0.15 pristine → 0.7 wrecked) and
`grime` against the image. NOVA 0.16, AEGIS 0.22, VULCAN 0.4, TITANUS 0.7.

## 2. Materials (skin recipes)

Add/edit the mech's `skin` block in `src/mechs/roster.js`. The factory routes
it through `src/core/pbrtex.js::mechSkin`, which synthesizes albedo + normal
(Sobel over a height field) + roughness/metalness maps from layered noise:
BSP panel lines, fBm paint variation, Worley-clustered edge chips exposing
bare metal, rivets, scratches, grime pooling. Knobs:
`base, base2 (two-tone), metal, wear, grime, panelDepth (3–4), roughPaint,
roughMetal, metalPaint, normalStrength, res, seed`.

Chipped paint = shiny bare steel (metalness ~0.95, low roughness); paint =
semi-metallic military finish; grime dulls both. This split is what makes
the metal lighting read correctly — don't flatten it.

Material keys available inside designs: `primary, accent, frame, metal,
brass, dark, glow, glowSoft` (+ `glow2` if `colors.glow2` is set).

## 3. Geometry — sculpted forms, never plain boxes

Work in the mech's file: `src/mechs/designs/<id>.js`, signature
`export function <id>(A, D, J, anchors, def)`. Reference implementations,
best first: `vulcan.js` (canonical build), `titanus.js` (image-matched heavy),
`nova.js` (slender), `fenrir.js` (beast head + tail), `wraith.js` (weapon).

**Order of work: mass rhythm → per-region forms → signature elements →
decals → greebles.** Detail on top of wrong proportions is wasted.

Sculpting vocabulary (all on the Assembler `A`, from `src/mechs/parts.js`):

| Call | Form | Use |
|---|---|---|
| `A.lathe(joint, mat, [[y,r]...], {scaleX, scaleZ, seg})` | smooth revolved bulge, elliptical when scaled | chests, thighs, calves, domes, pauldron shells, waist pinches |
| `A.facet(joint, mat, rBot, rMid, rTop, h, {sides})` | chamfered N-sided bulge (8=machined rhomboid, 6=hex) | forearm housings, pods, hip blocks |
| `A.plate(joint, mat, outline, t, {round})` + `shieldOutline(w,h)`/`rhombOutline(w,h)` | beveled extruded plate, rounded corners | knee shields, chest plates, skirts, pod caps, fins |
| `A.capsule(joint, mat, r, len)` | rounded oblong | pec pontoons, fuel tanks, snouts |
| `A.taper/box/tube/ball/ring/spike/vents/piston/blade/barrelCluster/pauldron/fist` | classic kit | details, weapons, greebles |
| `A.custom(joint, material, geometry, opts)` | unmerged one-off with its own material | **decal plates** (see below) |

Decals: `decalTexture(recipe, {text, emblem, stripes, ...})` renders
names/numbers/emblems over a generated skin and re-weathers them. Every mech
should carry at least one (chest nameplate, shin unit number).

**Rig & conventions** (`src/mechs/factory.js`):
- Mech faces **+Z**; limbs hang along **−Y**; joint rotations: X=pitch
  (negative swings a hanging limb forward), Y=yaw, Z=roll.
- Joints: `root, hips, torso, head, shoulderL/R, elbowL/R, handL/R,
  thighL/R, kneeL/R, ankleL/R`. Dims in `D`: `scale, torsoW/H/D, headSize,
  shoulderW, upperArmLen, foreArmLen, hipW, thighLen, shinLen, bulk`.
  Proportions per mech come from the roster `body` block.
- Extra animated joints via `addJoint(J, name, parentName, x, y, z)` from
  `./common.js` — see the contract table (§5) for names the engine drives.
- Digitigrade legs = same joints + a `restPose` block in roster (degrees);
  the Animator measures the rest-pose ankle height and grounds the mech
  automatically. If a mech floats/sinks, its foot geometry bottom doesn't
  match (aim for sole ≈ −0.32·scale below the ankle joint).
- You may move joint positions in a design (e.g. VULCAN pushes
  `J.shoulderL/R` outward to clear its wide chest) — anchors follow.

## 4. Verify — every time, in this order

Dev server: `npx vite --port 5173 &`. Headless screenshots (SwiftShader
renders ~20× slower than real time — the waitMs values below account for it;
`tools/shot.mjs` is committed in-repo, playwright-core is a devDependency):
```bash
node tools/shot.mjs "http://localhost:5173/?showcase=<id>&anim=none" idle.png 9000
node tools/shot.mjs "http://localhost:5173/?showcase=<id>&anim=walk" walk.png 13000
node tools/shot.mjs "http://localhost:5173/?showcase=<id>&anim=heavy" atk.png 8500
node tools/shot.mjs "http://localhost:5173/?showcase" lineup.png 8000
node tools/shot.mjs "http://localhost:5173/?battle=uptown&p1=<id>&p2=viper&auto=1" battle.png 20000
```
(The scripts assume a Chromium at `/opt/pw-browsers/chromium` — edit the
`executablePath` for other environments. `?rigtest` sanity-checks the GLB
retargeting math itself.)

**Judging checklist** (VIEW the images — don't assume):
1. Silhouette matches the concept's mass rhythm at a squint.
2. Arms hang naturally at rest; fists/weapons don't intersect hips.
3. Feet planted on the ground (no float/sink), toes forward.
4. Walk: no plates intersecting mid-swing; arm counter-swing clears torso.
5. Attack windup/strike: weapons clear the head/towers/back gear.
6. Palette & wear read like the image; decals legible but weathered.
7. Glow accents visible but not blown out (see pitfalls).
8. Lineup: the mech sits coherently next to the other 11.
9. Battle: readable at gameplay camera distance, distinct from opponents.
Iterate 2–3 times; first passes always have texture-scale or proportion
surprises.

Aim check — where a muzzle anchor actually points at the fire frame (the
number a `levelBarrel`-style fix is tuned against; combat throws the shot along
the anchor's +Z):
```bash
node tools/aimprobe.mjs <id> shoot 0.09,0.1,0.15
```

Logic soak (fast-forwards 120 s of Ace-AI combat synchronously, catches
crashes in specials/ults — forces every fighter's special+ult repeatedly):
```bash
node tools/soak.mjs "http://localhost:5173/?battle=neon&p1=<id>&p2=viper&auto=1&diff=ace"
```
Zero-crash is the bar. Finish with `npx vite build`.

## 5. THE CONTRACT — what a rebuild must preserve

The engine `if`-guards all of these, so breaking them won't crash — the mech
just silently loses firepower or personality. Treat as required.

**Every mech** (factory auto-creates fallbacks at the hands if the design
doesn't place them): `anchors.muzzleR` (ALL ranged fire + most specials
originate here — put it at the weapon tip), `anchors.muzzleL` (dual-weapon
mechs), `anchors.core` (chest; carries the colored point light).

| Mech | Extra joints (engine-driven) | Extra anchors | Driven by |
|---|---|---|---|
| vulcan | `gatlingL`, `gatlingR` (+ alias `J.gatling = J.gatlingR`) | `podL` (missile special origin) | animator spins both while firing |
| colossus | `mortars` (child of torso) | `muzzleR`+`muzzleL` ON `J.mortars` at tube mouths | animator pitches when firing; barrage alternates tubes |
| nova | `halo` (child of torso; geometry centered on it) | — | animator spins `.z` constantly |
| fenrir | `tail0→tail1→tail2` chain (tail0 child of hips) | `clawL/clawR` | animator wags tails |
| viper | `bladeL`/`bladeR` (children of hands) | `bladeL/bladeR` | animator flares blades |
| wraith | `rifle` (child of handR; on the GLB a custom-rig BONE on handL — the gun is in the model's left hand) | `muzzleR`+`scope` on the rifle, `eye` in the hood | railgun fires from muzzleR; the GLB levels the muzzle-down barrel on the shot (glbanim `levelBarrel`) |
| tempest | — | `coilL`/`coilR` at coil tips | static-field lightning FX |
| nullbot | — | `muzzleR` at right palm; `core` behind the chest sigil | animator strobes the `glow2` corruption shards; fighter.updateNullbotAura pops glitch flecks off the joints |
| aegis | `shield` (child of elbowL) | `shield` | reserved for shield FX |
| rhino | — | `horn` (tip) | reserved |
| titanus/inferno/glacier | — | inferno needs `muzzleL` too | dual flamethrowers |

Also preserve: the function signature `(A, D, J, anchors, def)`, the mech's
`restPose` in roster (digitigrade mechs: viper, fenrir, wraith), and roster
`body` proportions unless deliberately re-measuring from a new image.

## 6. Pitfalls (each of these cost an iteration once)

- **Texture tiling scale**: merged parts have per-face 0–1 UVs at wildly
  different physical sizes. Busy texture detail reads as noise — keep skins
  panel-scaled and subtle; geometry carries the detail.
- **White/light mechs bloom out** (AEGIS, NOVA, GLACIER did): keep light
  primaries ≤ ~0xd2d8e2 and check against the bloom threshold in
  `src/core/engine.js`.
- **Wide chests bury shoulders**: if a lathe chest half-width ≥ `D.shoulderW`,
  push the shoulder joints outward in the design.
- **Geometry merging**: the Assembler converts indexed→non-indexed
  automatically; if you add raw geometry another way and merging fails,
  that's why.
- **ExtrudeGeometry UVs** are world-scaled; `beveledPlate` normalizes them —
  use it rather than raw ExtrudeGeometry.
- **Headless timing**: the game runs ~20× slow under SwiftShader. A 9 s
  screenshot wait ≈ 0.5 s of game time. Menus need ~4 s between key presses.
- **Committer identity**: before committing, `git config user.email
  noreply@anthropic.com && git config user.name Claude`.
- **Never edit `roster.js`, `parts.js`, `factory.js`, `animator.js` from
  parallel agents** — those are shared; fan out only over `designs/<id>.js`.
- **A re-rig silently resizing the mech**: model size used to be derived from
  the `head` bone's position + the verts it owns, so moving bones changed
  height (14% on a measured test). Fixed by freezing `modelScale` in the
  manifest — after any rig work run `node tools/pin-modelscale.mjs --check`.
- **Custom-rig mechs and audit tools**: `tools/stretchaudit.mjs` picks the
  bones to sweep from the entry's `boneOverrides`, which a `rig` entry has
  none of. Tools that select driven bones must fall back to `JOINT_ORDER` for
  custom rigs or they silently measure nothing and report a vacuous pass.
- **Leaf bones get zero weight under `skinSpan: 'child'`** — a leaf's span is a
  point its parent's span already ends at, so it can never win a vertex. End
  every driven chain in a static tip bone (see `rigs/titanus.rig.js`).

## 7. Current state (2026-07-06)

All 12 mechs: hand-sculpted route B, with PBR skin recipes, verified.
VULCAN and TITANUS are matched to user-provided canonical images; the other
10 await canonical images (prompts in canonical-prompts.md — regenerate →
commit to `docs/canonical/` → re-run §1–§4 per mech to tighten likeness).
Route A is fully built and tested (`?rigtest`), and NULLBOT now ships on it:
`public/models/mech_nullbot.glb` (rigged, no animations — the game's clips
are retargeted onto it) with a custom bind pose + `yawOffset: 180` in the
manifest. Its glow2 corruption shards + strobing glitch lamp are re-applied
over the model by `nullbotGlbDress` (`designs/nullbot.js`, wired through
`GLB_DRESS` in `designs.js`), so the animator strobe contract (§5) holds.
`?showcase` now builds through `createMech`, so GLB overrides appear in the
judging views too. The other mechs remain hand-sculpted route B.
