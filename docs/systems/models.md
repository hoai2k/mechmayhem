# Mech models (GLB pipeline)

From an imported GLB to what the game builds: skinning and weld fixes, rigs, baking, the model diet, export, feet and floors, paint, icons and posters.

These notes were the body of CLAUDE.md, which is now an index into this
folder. Each entry names the mechanism, why it is built that way, what was
measured, and the tool that checks it — most of it was learned by breaking it.

- SKINNING A BONE CHAIN (`node tools/tailskin.mjs <mech> [--prefix tail]
  [--band 0.35] [--root hips]`): a chain like fenrir's blade-tail is easy to
  skin badly, and the bad way is the obvious one — each segment's geometry
  handed rigidly to its own bone. That is five hard bands with a seam at every
  joint: the tail bends in five visible kinks and the BASE cannot articulate at
  all, because the geometry where it meets the body is welded half to `hips` and
  half to `tail0` with nothing between. The tool projects every vertex the chain
  ALREADY owns onto the chain's own polyline, which gives it a position measured
  in segments, and weights it from where it sits: rigid mid-segment, a smooth
  blend reaching 50/50 exactly at each joint, and — before the first bone — a
  blend into the body bone the chain hangs off, which is what lets the very base
  bend rather than tear. Only the vertices the current skinOps already give the
  chain are looked at, so it cannot touch the rest of the body; it emits the
  WHOLE skinOps list with the chain's ops replaced in place and every other op
  passed through, and prints it as a patch (nothing writes). Measured on fenrir:
  10 tail findings / 74.2 severity -> 10 / 19.8, worst single 14.2 -> 4.2, every
  non-tail finding byte-identical.
- WELDED PARTS — when no reskinning can fix it: an auto-mesher returns ONE
  shell, so two parts that sit close at bind pose (jerry's claw-arm wrists
  against his shell) get triangles running between them. Rebinding cannot help,
  the geometry itself says they are one surface, and the loser is dragged across
  the arena. `seamCuts` in a manifest entry cuts them apart
  (`src/mechs/seamcut.js`, applied straight after skinOps so it reads the FINAL
  weights): `"seamCuts": [{"a":["handL","handR"],"b":["torso"],"cap":true}]`.
  Each bridging triangle goes to the side carrying more of its weight, corners
  belonging to the other side become DUPLICATE vertices bound to the side that
  took them, cross-side weights are stripped, and both rims are CAPPED with a
  lid (own vertices, own flat normal, wound from the rim's own directed edges).
  Nothing moves at bind pose — the duplicates sit on top of the originals — so a
  poster/showcase render is untouched; the cut only appears when the joint does.
  Distinct from reskin.js' `cutWelds`, which DELETES the triangles: that is right
  for a hidden membrane spanning an air gap (rhino), wrong for visible shell.
  The skin audit knows a deliberate split from a crack (`seamId`/`seamSide` on
  the geometry) and skips it, reporting the count instead.
  Find them with `node tools/weldmap.mjs <mech> --list` (every bone pair that
  shares a triangle despite being far apart in the skeleton — a real armour
  joint is 1 link, an elbow welded to a thigh is 4) and `node tools/weldmap.mjs
  <mech> --pairs a~b` to render one: the welded triangles highlighted at bind
  pose beside the frame that abuses them most. Pairs already separated by a
  seamCut drop off the list, so it doubles as the check that a cut worked.
- DROPPED GEOMETRY — when the model is standing in for something the ENGINE
  does better: `"dropBones": ["stackL","stackR"]` in a manifest entry DELETES
  every triangle owned by those bones and CAPS the rim it opens
  (`src/mechs/dropgeo.js`, run right after skinOps + seamCuts, so it reads the
  final weights). Ownership is the dominant weight, the same rule seamcut and
  the skin audit use; the rim is walked in POSITION-WELDED space (an auto-mesh
  splits vertices at every uv seam, so an unwelded rim is a handful of open arcs
  and capping those leaves daylight through the model) and each connected rim
  fans to its own centre vertex, bound to the bone most of the rim already
  answers to. The BONES STAY — they carry no skin but still ride the animation,
  which is what the effect that replaces the geometry hangs off.
  …AND WHEN THE LUMP HAS NO BONE OF ITS OWN: `"dropGeo": [{"verts":[…]}]` is the
  same cut selected by VERTEX, for geometry that shares its bone with armour you
  keep (tempest's spark squiggles are weighted to the same two bones as the whole
  shoulder pauldron). Everything past the selection is one shared implementation.
  A vertex index is a property of the geometry, which no re-rig can renumber —
  the same reason skinOps are pinned to vertex lists on export — but it IS tied
  to the export, so `dropGeo` runs BEFORE seamCuts (a cut appends duplicate
  vertices a list authored against the raw file cannot name) while `dropBones`,
  immune because it names bones, stays last. Find the lump and write the list
  with `node tools/geodrop.mjs <mech> [--above y] [--bone b] [--pick i,j]`, which
  ranks the mesh's connected islands (welded) with bbox and owning bones.
  INFERNO is the worked example: his chimneys used to end in two sculpted
  tongues of flame, frozen at whatever angle the sculptor left them. The drop
  takes them off and seals the mouths; the manifest hangs `stackL`/`stackR`
  ANCHORS on the same bones (any key in `muzzles` becomes an anchor of that
  name), and the roster's `stackFx` block feeds `src/mechs/stackfx.js` —
  flickering tongues, embers, and a smoke column emitted with no horizontal
  speed of its own, so he walks out from under it and it reads as a TRAIL.
  FOUR BURNERS, NOT TWO: the same `dropBones` treatment takes the sculpted
  flame tongues off his HAND TORCHES (`nozzleL`/`nozzleR` — the bones stay, so
  the muzzle anchors riding them are untouched) and the stackFx block burns
  `muzzleR`/`muzzleL` alongside the chimneys. `torches` names which anchors are
  the small ones, `flameH`/`torchH` scale the flame's launch speed AND its
  buoyancy together — which is what actually sets a column's height (measured:
  median rise per particle 1.29 units at 1.0, 0.64 at 0.5, exactly half) — and
  A TORCH BURNS DOWN ITS OWN BARREL, not upward: a chimney vents UP in world
  space and must keep doing that whatever the spine does, while a hand torch
  emits along the anchor's +Z (the same axis the flamethrower fires down) and
  swings with the arm, keeping only a third of the buoyancy so it does not curl
  vertical the moment it leaves the muzzle. Direction is a property of the KIND
  of burner. HIS TAUNT'S RHYTHM IS ONE TABLE (`INFERNO_VENT` in src/mechs/clips/inferno.js,
  resolved by `infernoVentPlan`): lead / puff / gap / hold / relax / cross /
  cycles / out, in seconds. The clip's KEYFRAMES ARE GENERATED from it and
  Fighter.tauntVenting reads the same plan for its emission windows, so the arms
  are folded exactly while the smoke is leaving and relaxed exactly while it is
  not — they were two hand-written schedules once, which is two places to edit
  and one of them silently wrong the moment they disagree. Change a number there
  and the pose and the smoke move together; the clip's DURATION falls out of it
  too. A torch is also held DARK while that hand is throwing a jet (`Fighter.darkNozzles`
  off the channel clip's side), because a pilot light sitting inside its own
  flamethrower stream reads as a bug. His LIGHT COMBO finisher also sets you
  alight: roster `light.comboStatus` is applied by the LAST blow of the string
  only (fighter.js doLight), so it rewards landing the whole combo rather than
  a single poke.
  THE BURNER IS NOT A COMBAT THING, which is why the emission lives in
  stackfx.js and not in fighter.js: it takes a plain `mech` plus the pools to
  emit into — a body with no Fighter around it can burn (`BurnerFx` in
  effects.js, a flame/ember/glow pool set with NO SMOKE POOL, driven by
  `MenuStage.syncBurners`). The GAME's menus no longer build bodies at all
  (they are pictures — see THE MENUS ARE PICTURES), so today that path serves
  the dev stage (`?menupose`, `tools/postercheck.mjs`). Smoke is off wherever
  there is nowhere to trail to, and during the loading card by `world.sandbox`.
  TEMPEST IS THE SECOND KIND (`stackFx.kind: 'spark'`): his chimneys carried two
  sculpted zigzag "spark" squiggles, which is the one thing electricity is never
  still enough to be. `dropGeo` takes them off and the same block emits a live
  crackle instead — BURSTS of little sparks (a spark is discrete, so it pops off
  in twos and threes with a real ballistic arc, never as a stream), a lip glow
  pulsed by the same flicker oscillator the flames use, and the odd short arc off
  the rim (`fx.lightning`, so the menus simply do without it, exactly as they do
  without smoke). THE SPARK SPRITE IS ORANGE and `color` cannot fix it — like the
  flame atlas, `sparkTexture()` bakes its ramp into its own pixels, so cyan x
  orange is mud. Same answer as the fire tint: rotate the SAMPLED texture round
  the hue wheel (`hue` on emit), which moves the corona to the target colour and
  leaves the white-hot core white, a rotation about the grey axis being the
  identity on grey. `sparkPalette` derives the rotation from the colour it is
  asked for, so authoring stays "give me this colour".
  AND THE CRACKLE ANSWERS TO THE PAINT, on inferno's rule and inferno's
  function: `sparkPalette` asks `fireTintOf` for the scheme's colour and uses
  the top two ramp stops (white-hot core, bright body) for the sparks, the lip
  glow and the arc — so an AMETHYST tempest sparks purple — while a scheme with
  no colour of its own (STOCK, MIDNIGHT, UMBER, IVORY, SILVER — `schemeFire`
  returns null) falls back to his authored electric blue, exactly as inferno
  falls back to ordinary fire. The rotation is measured against the SPARK
  atlas' orange, which is a shade off the flame atlas': `tint.rot` is the
  flame's number, not this one.
  IT IS TRIM, NOT A FIRE: sparks, lip glow and arcs are all sized at HALF what
  the first build used (sizes halved, arc throw and `jag` halved), which is the
  difference between a chimney that crackles and one that looks like it is
  venting. The dynamics — throw, gravity, gap — are untouched.
- ALTERNATE GLBs ARE GONE. A manifest entry used to carry a staged `alt`
  build (a second model, or the same one on a new rig) with an "Edit Alternate
  GLB" box in every workbench; nothing used it once every mech was baked. What
  it was for survives: judge a re-rig as a PATCH FILE before it ships —
  `node tools/anchorkeep.mjs <id> --with patch.json` (MECH_ART_GUIDE step 4).
  `alt`/`profileKey` are no longer known manifest keys and are warned about.
- A MIRRORED MAPPING IS THE ONE RIG ERROR THAT LOOKS ALMOST RIGHT
  (`node tools/rigmirror.mjs [<mech> …]`). A manifest's `boneOverrides` names
  which GLB bone each of the 15 game joints drives, and nothing downstream
  checks that `shoulderL` is the LEFT shoulder — an auto-rig's names are opaque
  (`bone_28`), the mapping is proposed spatially by `tools/rigmap.mjs` and then
  hand-fixed. SAURION shipped with every one of his twelve limb joints on the
  wrong side, and it hid because almost nothing complains: the walk cycle is
  symmetric, his claw/kick clips come in mirrored pairs (`saurionClawL` IS
  `mirrorRaw(SAURION_CLAW_R_GLB)`), and the ANCHORS had been compensated by
  hand — muzzle "R" hung off `handL`, `boostL` off `shoulderR` — so the guns
  fired from the right barrels for the wrong reason. The tell is the pose
  workbench: drag `shoulderL`, watch the right arm move.
  THE CHECK NEEDS NO RENDERER, which is why it is cheap enough to run on the
  whole roster: a bone's bind world position comes off the glTF node hierarchy,
  the manifest's `yawOffset` is the container rotation into the GAME FRAME
  (faces +z, LEFT at -x), so rotate and read the sign of x. Every `*L` must
  land at -x. It reports the facing too (rear-most vs front-most bone), since a
  `yawOffset` a half-turn out flips every side and looks like the same bug —
  saurion's tail tip at z -0.47 against his snout at +0.40 is what says his 300
  is right and the mapping was wrong.
  THE FIX IS TO SWAP THE NAMES, NOT THE GEOMETRY: exchange the L/R bone names
  in `boneOverrides` AND the joint names in `muzzles` with them, so every
  anchor stays on the same PHYSICAL bone (`tools/anchorkeep.mjs`' rule — the
  rest-pose anchor transforms came back bit-identical). What it buys is
  measured as RETARGET FIT, the distance between each virtual joint and the
  bone it drives (`node tools/retargetfit.mjs <mech>`): saurion 3.64
  body-heights summed over the 12 limb joints -> 1.80, every joint better, his
  knees 0.28 -> 0.09 — read against a correctly-mapped mech rather than against
  zero, since the residue is the model's own proportions (tempest: 1.34).
  Hurtbox contain/bloat unmoved (78% / 1.16x). The SKIN AUDIT moved the other way — 830 -> ~960 severity,
  reproducible over three runs — but read the findings, not the total: rows 2-8
  are the same places at the same severities with their labels corrected
  (`bone_43` was reported as `elbowR`, it is the left elbow), and the whole
  delta is one 11k-vertex neck/shoulder island of the auto-rig's welded shell
  flipping from a 137 stretch to a 196 pinch. Left as found.
  NOTHING IS MIRRORED TODAY and `rigmirror` exits 0 on a clean tree. AEGIS (all
  12) and NOVA (4 of 12) were the last two, and rather than re-rig two hidden
  work-in-progress bodies they were RETIRED — see `archive/mechs/README.md`,
  which keeps their models, manifest entries, designs, finishers and icons.
  A BAKED MECH IS STILL CHECKED: the bake renames the bones after the joints
  and drops `boneOverrides`, so the check uses the identity mapping there —
  it once skipped every entry without overrides, which after the bake meant it
  checked nothing. Side is read against the TWIN joint's x, not x = 0 (fenrir's
  midline sits ~0.07 off his origin).
- BONE ROTATION: a rig file carries POSITIONS ONLY, and adding a rest rotation to
  one would change nothing — `applyCustomRig` rebinds the skin at rest
  (`rebindRest`) and `RigAdapter` captures a rest offset per bone
  (`offset = jointWorld⁻¹ · boneWorld`), so both halves cancel it out exactly.
  The rotation lever that DOES work is `boneCorrections` in the manifest: degrees
  `[x,y,z]` per joint, post-multiplied in bone-LOCAL space after the retarget.
  It applies to custom-rig mechs too (the one place RigAdapter is constructed
  reads it). On a custom rig every bone rests unrotated, so bone-local x is the
  mesh's forward axis and a rotation about it is exactly adduction — which is how
  viper's running splay was fixed: `thighL [10,0,0]` / `thighR [-10,0,0]` took his
  standing knee lean from 12.5° outboard to 2.5° and the knee-lift peak from 44°
  to 21°/37°. Measure it with `node tools/legsplay.mjs <mech>` — and measure the
  BONES, which is what that tool does: the retarget drives bone ORIENTATION from
  the game's clean humanoid, but bone POSITIONS are the rig's own, so the virtual
  joints can read 10° inboard while the rendered legs are 15° out.
- FEATHERED SEAMS — THE ORGANIC BIND (`src/mechs/feather.js`, the FEATHER SEAMS
  panel in `/workbench/?edit=skin`, hotkey **F**). Everything else in the skin
  pipeline answers WHICH BONE owns a piece of geometry; this answers HOW HARD
  THE LINE BETWEEN TWO BONES IS. reskin.js hands each vertex to exactly one bone
  and a paint stroke rebinds a vertex list rigidly, so the finest border either
  can draw is still ONE VERTEX WIDE — a step, not a gradient. Right for a plate
  on a hinge, wrong for a body made of muscle: KONGA is a cyborg gorilla whose
  shoulder should swell into his chest.
  So the border is DERIVED rather than painted. The pass reads the partition the
  ops leave behind and grows each bone's influence OUT of its own region across
  the mesh's own surface, dying away over `radius`: `w_b(v) = falloff(geodesic
  distance from v to bone b's region)`, the vertex's own bone at 1. Two vertices
  either side of a border swap (1, ~1) for (~1, 1), so the weights CROSS OVER
  continuously and an arm raise takes a little chest with it, letting go
  gradually. Authored as the LAST entry of a manifest's `skinOps`:
  `{"feather":{"radius":{"*":0.045,"pod*":0.012},"maxLinks":2}}`.
  FOUR THINGS IT KEEPS. **Dominance never flips** — a foreign bone's weight is
  capped just under the vertex's own (`cap`), so `analyzeSkin`'s partition, every
  `{comp:N}`, the skin audit and the hurtbox buckets see exactly what they saw
  before; feathering softens a border, it never moves one (which is also why it
  must be LAST — an op after it would slam a rigid weight back over the
  gradient). **Distance is geodesic**, over the mesh's edges with UV/normal
  duplicates welded — a knuckle resting against a shin is a straight-line
  neighbour and a surface path all the way up the arm and down the leg, and only
  the second one is right. **`maxLinks`** refuses to blend bones further apart
  than that in the skeleton (2 by default: a shoulder may reach past the torso,
  a brow may not reach a shoulder it merely touches). **The robot parts stay
  robot** — `radius` may be a per-bone table (`"pod*": 0.012`) and `rigid` is the
  hard case (band 0, neither a source nor a destination, and the flood does not
  travel THROUGH that geometry), so konga's missile pods keep the crisp seam a
  bolted-on launcher should have while the ape around them is soft.
  A FACE IS A ROBOT PART TOO, for this purpose. The same table names konga's
  `crest`/`jaw`/`snout`/`brow*` at 0.012 and `head` at 0.028, because a band
  wide enough to swell his shoulder into his chest also reaches his MUZZLE —
  and a muzzle that takes a minority weight off the torso goes waxy every time
  he leans. A FACE THAT MOVES AS ONE SOLID PIECE IS RIGHT; a face that smears
  is never right. The head is the one that wants a little width (~285 total
  against ~340 at 0.012, and it reads no softer), since its border is the NECK
  and a hairline there is a seam. Full `rigid` on those bones was
  tried and is worse: crisp, but it opens a visible gap under the chin.
  AND THE OTHER HALF OF THAT FIX IS NOT SKINNING AT ALL: konga's `jawFixed`
  (face.js) stops the jaw ROTATING. His jaw island owns the throat and the
  whole lower muzzle, so a 35° roar swung that mass down his chest whatever
  the weights blended like — no band can fix a bone that is moving geometry it
  does not own. Judge the two together; a band swept while the jaw still opens
  measures the jaw.
  BAND WIDTH IS MEASURED, NOT GUESSED. Too narrow leaves the tear, too wide
  PINCHES (the LBS candy wrapper), so it has an optimum: konga's skin-audit
  severity total ran 1851 rigid → 483 at 0.03 → 288 at 0.04 → **280 at 0.045**
  → 329 at 0.05 → 355 at 0.06 → 498 at 0.08. Judge a value with `node
  tools/skindebug.mjs <mech>` (the severity total), `node
  tools/featherprobe.mjs <mech> [--off] [--radius r] [--band 'pod*=0.012']`
  (share of the mesh sharing bones, and the MEAN DOMINANT-WEIGHT JUMP across
  every border edge — 1.00 is a step, konga ships at 0.12) and `node
  tools/feathershot.mjs <mech> out.png <clip> <t>` (the same frame, same camera,
  rigid vs feathered as two files). In the workbench, **blend colours** mixes
  each vertex's bone colours BY WEIGHT instead of showing its dominant bone
  flat — the only view a gradient shows up in at all — and comes on with the
  panel.
- A BROW HAS ONE HINGE, AND IT IS MEASURED (`face.js`, `node
  tools/browprobe.mjs <mech>`). The facial performance used to write
  `brow.rotation.x`, which is the lateral hinge on the GAME's own joints (built
  facing +z with left at -x) and the FORWARD axis on a custom rig authored in
  the raw GLB's bind space (+x forward) — so the same line pitched the ridge on
  the procedural body and ROLLED it on the GLB. Measured on konga, the ridge was
  travelling 7.1% of body height SIDEWAYS against 7.5% of lift: the brows
  visibly swinging left and right in victory, intro and every strike. The axis
  now comes from the two brows themselves — the vector from the right brow to
  the left one is the head's lateral axis on ANY rig, in whatever frame that rig
  was authored in — and the turn is applied in the parent's frame over each
  brow's own rest rotation. Lateral travel is 0.00 on every clip, both mechs,
  and the procedural route is unchanged by construction (there the two brows
  differ only in x, so the derived axis IS x). `browprobe` is the check: it
  plays every clip the mech can play and reports where the RIDGE goes — the
  corners of the geometry that bone dominates, in the head's own frame — split
  into lift / side / fwd. `side` must stay a rounding error.
  AND A BROW RIDGE IS BONE: it furrows, it does not shrug. konga's range was cut
  to about a third (`browSnarl` -0.30 → -0.11, `browFlinch` -0.42 → -0.15,
  `browRoar` -0.16 → -0.06), which takes the worst lift from 7.5% of body height
  to 2.1% — a scowl you believe rather than a face pulling itself about.
- WHAT A GLB BUILD *MEASURES* IS A PROPERTY OF THE FILE, SO IT IS MEASURED ONCE
  (`fitCache` in gltf.js, keyed on the manifest ENTRY OBJECT). Three passes in
  `buildGlbMech` walk vertices: `skinnedBox` on every scale/reground step (20k
  samples each), the visible head match (`measureHeadTop`), and
  `Animator.calibrateFeet` (the whole skinIndex, per foot — 138k verts on
  saurion). All three answer the same thing for every body built from the same
  entry, because the geometry, the skinOps and the rig are the same. A match
  only rebuilds one mid-fight when SAURION CALLS HIS PACK — `cloneMech` on a GLB
  is `cloneGLB()`, i.e. a full `buildGlbMech` — so the raptor pack was paying it
  three times: measured at 44 / 46 / 52ms, landing as three separate hitches as
  the volley staggered the spawns 0.22s apart (the reported ult lag). Cached:
  1.3-4ms per clone, worst world step over the cast 51.7 -> 2.8ms, steady state
  with three minions unchanged (0.77 -> 0.85ms/step either way).
  THE CACHE IS REPLAY, NOT APPROXIMATION. The reground steps are replayed BY
  ORDINAL and only while the requested factor still matches what was recorded —
  a build that asks for a different `k` re-measures from that step on and
  re-records the tail — and the foot calibration is stored as the sole samples
  in the ANKLE BONE'S OWN frame (pose-independent by construction, and the
  model's scale is pinned per entry), re-bound to the new copy's bones.
  Everything measured comes back bit-identical for all 19 GLB mechs:
  `node tools/scratch/fitcache.mjs` builds each one and then `cloneGLB`s it,
  diffing scale, ground offset, ankleGain/footFlat/footDepth, the sole points
  and `lowestRenderedY`. The key is the ENTRY OBJECT, so a workbench's manifest
  reload — which parses fresh entries — drops the cache by construction and can
  never show stale numbers for an edited model; every `tools/*.mjs` builds
  through `buildGlbForTool`, which spreads a new entry per call, so the tools
  always measure.
  …AND THE PACK ARRIVES AS EGGS NOW (`src/combat/eggs.js`), which is what
  finally took the cast frame to nothing. Three dinosaur EGGS warp in behind
  him, 75% of his own height along the long axis, and hatch ONE AT A TIME with
  at least `GAP` (4s) between them — so a body is built during the seconds
  before its own hatch instead of three at once, and the ult has a moment to it
  rather than three robots appearing. The gap is long enough that each hatch is
  its OWN EVENT rather than a countdown: a whole pack takes twelve seconds to
  arrive, which is twelve seconds the enemy can spend breaking shells. An egg is a real rolling body (gravity,
  ground contact, restitution, rolling friction, and a roll rate off its own
  short radius, so it goes across the plaza like a barrel and settles on its
  side). WHO HIT IT IS THE WHOLE DAMAGE MODEL, AND WITH WHAT: SAURION's own
  blows SHOVE it — full impulse, no damage, no flash, so kicking one is how he
  says "go over there" — and anybody else's BREAK it. A SHELL IS NOT ARMOUR:
  getting a fist to one means closing on the clutch with SAURION standing over
  it, so a MELEE blow or a BLAST takes the whole shell in ONE (`EGG_DMG_MELEE`),
  while a BULLET — which anybody can send from across the plaza — takes TWO
  (`EGG_DMG_SHOT`). Either way it flashes red and takes a much smaller shunt
  than the kick. The hatchling comes out CURLED (the `ball` clip) at half size
  and unfolds into his stance as it grows. Three hooks feed it, one per damage
  path: `world.explode`, the projectile sweep and the melee sweep, each handing
  over the ATTACKER and what the blow is worth, which is all the rule cares
  about. Measured with `node tools/eggs.mjs`: cast 0.5ms, worst frame over the
  whole cast 1.8ms (from 51.7 before any of this work), eggs at 0.75 of his
  height, hatches at 2.95 / 6.95 / 10.95s — gaps of 4.00 and 4.00 — his own hit
  rolling one 9.8 units for no damage, an enemy's shot rolling it 1.7 and
  wounding it, and one enemy melee blow ending it outright.
  THE BUILD IS PACED BY THE HATCH SLOT, NOT BY THE EGG'S OWN CLOCK, and for a
  while it was not — which is the one place the staggering did not actually
  hold. `hatchIn` is 2 + 0.4i so the clutch does not crack in unison, and the
  body was built at `hatchAt - BUILD_LEAD`; with a COLD pool (a second cast in
  the round, or a mech swap that dropped the spares) that put all three
  `cloneMech` calls inside 0.8s while the hatches were a full `GAP` apart —
  measured at 1.22 / 1.53 / 1.92s, the exact bunching eggs exist to prevent.
  Only the egg at the FRONT OF THE QUEUE may build, and only within
  `BUILD_LEAD` of the slot it is really waiting on, so the builds inherit the
  hatches' spacing: 1.23 / 5.27 / 9.28s, warm pool or cold. An egg broken out
  of the queue hands the front to the next one at once, so nothing stalls
  behind a shell the enemy took away. `node tools/scratch/eggpace.mjs` is the
  check (build times, hatch times and every frame over threshold across four
  casts) and `tools/scratch/hatchcost.mjs` breaks one hatch into its parts —
  cast 0.0-0.5ms, hatch frames 4.1 / 0.9 / 1.0ms, and 0.9ms a step in the
  steady state with three minions in against 0.3ms with none.
  THE SHELL'S TEXTURE IS REQUESTED (`prop_dino_egg`, in
  docs/ASSET_REQUESTS_STRUCTURES.md and listed in `PENDING_ASSETS`): until it
  lands `eggMaterial()` paints one — cream, mottled, speckled — and the pack
  wins automatically the day the images arrive.
  …AND A BODY BUILT BEFORE THE FIGHT COSTS NOTHING DURING IT. With every
  measurement cached, what is left of a clone is the scene graph, the rig and
  the animator — 1.4-3.6ms a body, three of them 0.22s apart, which is still
  three hitches at the loudest moment of the match. So the pack is built during
  the ROUND INTRO (`prewarmSummons` in specials.js, called one body per frame
  from match.js while the announcement is up and nobody is being controlled) and
  the cast TAKES one: 0.0-0.1ms. The pool refills the same way after a cast —
  one body every 1.5s through the world's own scheduler — so a second cast in
  the same round is warm too, and `takeSpare` returning null falls back to
  cloning on the spot exactly as before. A spare is a MECH, not a Fighter: no
  world state, nothing in the scene, and it is dropped at every round start
  (`clearSpares`) because a round may have re-dealt that slot a different robot.
  `node tools/scratch/ultprobe.mjs <mech>` times a summon ult's two very
  different costs (the spawn frames vs the steady state with the minions in),
  `tools/scratch/spawncost.mjs` breaks one spawn into clone / Fighter / AI, and
  `tools/scratch/ultprof.mjs` is the CDP profile behind them.
- WHERE THE ANKLE BONE GOES: at the TOP OF THE SOLE PLATE — about `0.32 * scale`
  above the sole (~4.5% of body height), NOT at the lowest point of the
  geometry. It is the hinge the gait rolls the foot around, so it needs a foot
  underneath it: `Animator.calibrateFeet` measures `footDepth` (ankle above
  sole) and DAMPS the authored heel roll by `convention/depth` when the bone
  sits high (`ankleGain`, floor 0.25, plus a `footFlat` levelling ask), while at
  `depth <= 0.02` it gives up and keeps the default. `ankleGain 1.00` +
  `footFlat 0` is the target. `node tools/ankleprobe.mjs [mech …] [--chains]`
  measures sole/ankle/depth/gain for every mech on both sides and FAILS on any
  bone at or below its sole (nothing is, today); `--chains` prints the whole leg
  with each bone's share of the FOOT PLATE, which is what distinguishes an ankle
  MIS-MAPPED onto a hock (fix with `boneOverrides` — no weight moves, as
  saurion's `bone_8` -> `bone_9`) from one merely placed high (fix in the rig
  file — vulcan, wraith). Neither fix is free: moving an ankle re-draws the
  proximity partition around it, so measure `tools/skindebug.mjs` before and
  after and expect to reject some (titanus 3158 -> 11661, glacier +18%, cranky
  +32% — all left as found). `buildSkeletonBones` clamps a custom rig's bones to
  y >= 0 so a rig edit can't bury a foot under the arena floor.
- Paint jobs (`src/mechs/colorscheme.js` — 11 schemes, cycled in mech select):
  a scheme is a PAINT TARGET (hue + a saturation floor OR ceiling + the
  LIGHTNESS the paint wants), never a plain hue swap. The lightness is what
  makes the white/black/silver mechs work: each mech's armor is dragged 80% of
  the way to the scheme's value, so WRAITH's EMBER is really red instead of
  still black, while a mech already in the midtones barely moves. One source of
  truth for both routes — the procedural path rewrites `skin.primary.base/base2`
  and pbrtex re-synthesizes, `recolorglb.js` runs the SAME `schemeSat`/
  `schemeLum` over the baked GLB textures. Which pixels count as "the paint" is
  per-mech (`neutralMix`): a vivid mech's armor is its saturated stock-hue
  family; a near-grey mech's armor is the NEUTRAL pixels and its few saturated
  ones are accents to protect. Judge a change with
  `node tools/schemesheet.mjs <mech> out.png <schemeIdxCsv>`.
- FIRE IN THE TEAM COLOUR (`colorscheme.js` schemeFire / `fireTintOf`): a
  repainted mech's FLAMES answer to the paint — inferno in AMETHYST breathing
  purple, in VERDANT green — but only where it reads as a deliberate colour.
  White, silver, black and brown are what ordinary fire looks like against soot,
  and tinting those just looks broken, so the rule comes off the scheme's own
  numbers rather than a hand-kept list: a scheme tints when it has a chromatic
  FLOOR (`minS`) and is not desaturating on top of it (`satMul >= 0.8`, which is
  what excludes UMBER). MIDNIGHT/IVORY/SILVER cap saturation instead of flooring
  it and fall out on the first test. TIDE's blue gas flame used to be a
  hard-coded `fireCool(def)` boolean; it comes out of the same formula now.
  TWO MECHANISMS, because there are two kinds of flame. The SHADER fires
  (FlameFX cards, the fire tornado's shells, the jet tube) take the four ramp
  stops as uniforms — dark base, body, bright, white heart — generated at the
  scheme's hue from one profile, so every colour is the same fire. The SPRITE
  fires (the particle pools) cannot: `flameAtlasTexture` bakes the orange ramp
  into its own pixels with red pinned at 255, so multiplying a tint over it
  gives mud. Those rotate the sampled texture's HUE instead (`hue` on
  ParticlePool.emit, `aMisc.z`), which moves the whole baked ramp together and
  keeps the hot core hot. 0 = untouched, so every untinted particle in the game
  is bit-identical.
- MECH ICONS ARE TWO THINGS, in two folders, and the split is the point
  (`src/ui/icons.js`): a hand-made **BADGE** (`public/badges/<id>.png`) is what
  a mech is SUPPOSED to wear, and its auto-captured **THUMBNAIL**
  (`public/thumbs/<id>.png`, `node tools/thumbs.mjs`) is the BACKUP so nothing
  is ever iconless; the roster emoji is the last resort. A mech has a badge
  only if its id is listed in `BADGES` — the list is the declaration, and the
  ladder is enforced twice (`iconUrl()` picks the tier, and the `<img>` carries
  an onerror ladder, so a listed-but-missing badge degrades to the thumbnail
  instead of a broken image). THE FOLDERS ARE SEPARATE BECAUSE THE LIFETIMES
  ARE: a thumbnail churns with every model change, a badge is judged art that
  must never change because a tool ran — which is exactly what happened when
  `thumbs.mjs`, run to add two missing icons, re-shot all seventeen and
  replaced the roster's icons in the menus. That tool now fills in only the
  mechs with NO icon on a bare run (name ids to re-shoot those, `--all` to
  redo the roster) and cannot write outside `public/thumbs/`.
  A BACKUP MUST NEVER QUIETLY OUTRANK THE REAL THING, which needs the file and
  the `BADGES` entry to stay in step: `tools/badgekey.mjs` writes both when it
  lands the art (idempotently), and `node tools/iconcheck.mjs` FAILS in either
  direction — a declared id with no file, or a badge sitting in the folder that
  nothing declares, which is exactly the state that reads as "why is that mech
  still showing its snapshot". It also checks every mech has a thumbnail and
  that each rung of the fallback still lands.
  A BADGE IS A MARK, NOT A PICTURE OF THE MECH, and that is the one thing to
  get right before commissioning art: it is drawn at 17px in the HUD and 52px
  at its biggest, so a portrait-in-a-circle — the obvious thing to ask an image
  generator for, and what the first attempt produced — averages into a grey
  disc at icon size. What survives is shape, count and two or three flat
  colours: a road sign or a club crest, 3-6 big shapes, one thick outline, no
  gradients or fine detail. The test is to shrink it to 20px and see whether
  you can still tell which mech it is. `public/badges/README.md` carries the
  full spec AND a prompt template built to hold a generator away from a
  portrait; `node tools/badgekey.mjs <in.png> <id>` turns generated art on a
  flat magenta/green backdrop into the transparent, trimmed, square PNG the
  game wants (the key colour is measured, the edge is un-spilled by solving
  the real coverage against the recovered art colour, and the art is bled
  under the transparent rim so nothing haloes when the UI scales it down).
- POSTERS (`public/posters/`, `src/ui/posters.js`): a pre-rendered WEBP per
  mech with alpha — the stock-paint picture every menu shows. THEY ARE BIG ON
  PURPOSE (`POSTER_PX` 2400, crops 990-1625px tall, ~160 KB each): the select
  screen draws one at ~85% of the window height, and at the old 900 a ~500px
  crop was visibly soft on an ordinary monitor. Runtime snapshots use the same
  frame and encode WebP too. A poster stands in
  for THE GLB (the default body — so that is what it must be rendered from,
  with alpha), framed through the stage's preview camera
  (`menustage.aimPreviewCamera`) and recorded as a world-space box off the
  mech's feet. Regenerate with `node tools/posters.mjs` after any change to a
  mech's model, rig, rest pose or scale; it refuses to write a procedural or
  opaque poster. A NAMED run (`node tools/posters.mjs viper rhino`) MERGES into
  `posters.json` — it used to rewrite the map from empty, which deleted every
  other mech's box, and a mech with no box has no poster at all as far as
  `posterMeta` is concerned (the select screen quietly photographs a real body
  for it instead, with the unused .png still sitting on disk). Check the handover
  with
  `node tools/postercheck.mjs viper cranky,jerry <4 ids>` — it reports
  poster-vs-model drift in pixels per slot at each player count. NOTE any
  harness that builds preview mechs must `await loadManifest()` first, or
  `manifestHasGlb()` answers false and the stage quietly shows procedural.
- BAKING A MECH (`node tools/bake-glb.mjs <id> [--apply]`, or
  `tools/bake-all.mjs` over the roster) folds EVERYTHING THAT DESCRIBES THE
  MODEL — custom rig, skinOps, `seamCuts`, reparent, stretch, bonePos, rig
  posts, `dropGeo`/`dropBones`, and the BONE NAMES (an auto-rig's `bone_28`
  becomes `shoulderR`, so `boneOverrides` goes too) — INTO the .glb, strips
  those manifest fields and deletes the rig file, leaving one revertible commit.
  ALL 17 ARE BAKED — titanus, tritone, jerry and nullbot were the last four,
  and none of them was failing for a reason in the model: titanus lost his
  ROCKET FIST post-bake (the split was gated on the rig FILE, not on the
  `fistL`/`fistR` bones the bake keeps — the check saw three skinned meshes
  against one), nullbot's random head ticks slid between the two load paths
  (see THE SEQUENCE IS RESEEDED PER CLIP in the tool's header), tritone
  needed a bake to keep a rig's game fields (`tailFloor`), and jerry's first
  run was a browser timeout. So `src/mechs/rigs/` carries only its
  (empty) `index.js` registry and every manifest entry is url + scale + yaw + muzzles
  (viper keeps `boneCorrections`, which is a runtime lever by design). A mech
  that comes back from the archive for re-rigging goes through the bake again
  before anything below can touch it. `--apply` REFUSES to write a mech whose
  check failed, rolling back just that
  mech (it used to `git checkout` the whole tree, which threw away every mech
  baked earlier in a batch). THE ROLLBACK TAKES THE ARCHIVE BACK TOO: the
  sidecar and source copy are written before the check can run, and a refused
  bake used to leave `source/<id>.edits.json` claiming the edits had been
  folded — the four unbaked mechs sat like that, byte-identical to their
  "source" with the whole correction layer still in the manifest. A sidecar on
  disk now always describes a bake that landed.
  ORIENTATION AND SIZE ARE NOT FOLDED (`yawOffset`, `modelScale`,
  `heightScale`): they describe the model and belong in a file, but the GAME
  derives live quantities from the runtime scale (`RigAdapter.hipsScale`,
  `calibrateFeet`, `sizeMul`), so folding them leaves those reading 1 where they
  read 5.77 — measured on saurion, joints correct to 0.0002 and his head
  collapsed into his shoulders. `bakeMechScene`'s `transform` option does fold
  them and is used by the EXPORT, which has no runtime to disturb. `--apply` first archives the untouched asset to
  `public/models/source/<file>.glb` (once — a re-bake never overwrites the true
  original) and writes `public/models/source/<id>.edits.json`: every folded field
  with its values, plus the rig file's text, so a baked model stays explainable
  without digging through git. That folder is DISK-ONLY: nothing fetches it, so
  `vite.config.js` (`sourceArchivePlugin`) deletes `models/source/` — and any
  mech GLB the manifest no longer names — from every build's OUTPUT (the Pages
  deploy and the desktop app ship `npm run build`: 713 -> 589 MB). Paths come from the entry's `url`, not from the
  mech id (jerry's primary model is `mech_jerry_alt.glb`). A dry run restores the
  tree even if a step throws.
  THE CHECK IS THE SKIN NOW, not 15 joints. It plays EVERY CLIP THE MECH CAN
  PLAY, CPU-skins the mesh at 5 frames of each and compares the vertices
  themselves, as a fraction of body height — plus rendered extent from real
  vertices, the shoulder/hip lines as a facing check, and every anchor's rest
  transform. The joint-only version read 0.0001 while jerry's cannon pods were
  dead and again while saurion's head was inside his chest. A good bake now
  measures 0.001-0.002%.
  IT ONLY MEANS THAT BECAUSE THE HARNESS IS SEEDED. `Animator` seeds phase and
  time from `Math.random()` on purpose and several signatures twitch off it, so
  the same build measured twice disagreed by 4-5% of body height. The captures
  install a seeded PRNG via `addInitScript` — BEFORE the page boots, or the
  battle has already diverged — which takes the noise floor to exactly 0.000%.
  `node tools/bake-glb.mjs <id> --noise` measures that floor on demand.
  Still worth running after a bake: `tools/skindebug.mjs <id>` (same findings?)
  and `tools/weldmap.mjs <id> --list` (same welds?).
  A baked model keeps its seam record as `rwSeam` mesh extras, so the skin audit
  still knows a deliberate split from a crack.
- THE MECH DIET (`node tools/mechopt.mjs [--apply] [id …]`, sidecar
  `public/models/source/<id>.opt.json`): every shipped mech GLB is HALF the
  triangles the service delivered and carries 1024² colour/normal + 512²
  metallic-roughness maps instead of three 2048² — roster 2.29M -> 1.16M
  triangles, texture VRAM ~1088 -> ~204 MB, 122 -> 55 MB on disk before
  dist.mjs' compression. THE SIZE WAS MEASURED AT THE LARGEST VIEW THE GAME
  HAS (mech select, one picker, 1600x900 through `?poster=<id>`): the shipped
  model shot twice disagrees with itself by mean 2.9/255 (the idle phase is
  unseeded), 2048 -> 1024 measured 2.3 and 512 3.5 on titanus, and crops at 2x
  of his shoulder lettering, konga's face and glacier's arm cannot be told
  apart — so 1024 is free and 512 on the low-frequency roughness map costs
  nothing either. Decimation is meshoptimizer's `simplifyWithAttributes` with
  NORMALS AND SKIN WEIGHTS in the metric, so a collapse across a bone border
  is charged for the weight it moves, and it only ever REMOVES vertices: every
  survivor keeps the joints/weights the file authored — and a baked seam
  record (`rwSeam`, vertex-index lists) is remapped through the same
  compaction plan, or the skin audit reads the wrong vertices and reports the
  cut as a tear (jerry, the first time). propopt's rule holds
  here too — the error budget tightens until the bounding box matches
  (`--audit` proves it against the pre-diet commit; worst drift on the roster
  0.095%), because a shrunken extremity moves the ground fit and the hurtbox.
  ONLY A BAKED MECH MAY BE SIMPLIFIED (the tool refuses otherwise): skinOps,
  dropGeo and seamCuts name VERTEX INDICES and simplification renumbers every
  one; a baked entry is bone-keyed throughout, so nothing in it can break.
  What CHANGES is what is MEASURED off the vertices at load — the hurtbox
  capsules (which sample in file order), the foot calibration, the ground fit
  — so the gates after `--apply` are `tools/hurtboxfit.mjs` (containment must
  not fall, bloat near 1), `tools/skindebug.mjs` (same findings in the same
  places), `tools/groundprobe.mjs` (the lowest vertex may change OWNER bone
  at the same depth, which flips a pass/fail on the per-part limit without
  the body moving — read the depth, not the count), `tools/posters.mjs` (the
  asset changed) and a soak. NOTHING IS ARCHIVED, GIT IS THE ARCHIVE: the
  sidecar records the commit the diet was applied on top of and `--restore
  --apply` reads those bytes back out of it. The shipped file stays a PLAIN
  glb — float attributes, no meshopt, no quantization — because it is still
  the authoring master every workbench and tools/*.mjs reads.
  `public/models/opt/` is NOT this: those files are gltfpack over the
  PORTABLE EXPORT (folded transform, baked rigs, renamed bones, 30 baked
  clips, unnormalized uint16 positions `dequantize.js` does not unfold, a
  missing fallback .bin) and load through the manifest at 50x size. Delete
  them.
- A SESSION CACHE IS NOT AN ASSET (`tools/stripcache.mjs`). GLTFExporter
  writes `geometry.userData` into a GLB as primitive extras, and feather.js
  keeps its geodesic graph there — so two bakes shipped with the cache inside
  them: konga at 29.6 MB with 21.7 MB of JSON, saurion 45.7 with 33.9, parsed
  on every load and read by nothing (the skinOp it served was folded into the
  weights by the same bake, and the release build carried it too). The bake
  drops every `__`-prefixed key before exporting now; `stripcache.mjs` is the
  same rule for a file already on disk, rewriting ONLY the JSON chunk so the
  BIN chunk — vertex order, accessors, skin — stays byte-identical. `rwSeam`
  is the one record meant to leave with the model.
- THE PORTABLE EXPORT (`node tools/export-mech.mjs --all`, then
  `tools/export-bundle.mjs` + `tools/export-chars.mjs` + `tools/export-art.mjs`)
  writes `public/models/export/` — gitignored, ~240MB, regenerate it. A bake
  finalizes a model FOR THIS GAME and leaves the runtime half in the manifest
  because the game is still there to apply it; an export has nothing behind it,
  so it carries the lot plus three things no shipped GLB has ever contained: the
  TRANSFORM (on the `Armature` NODE above the joints — world units are game
  units, +z forward, feet on y=0), the ANCHORS (as empty `anchor_<name>` nodes
  on the bone they ride), and the ANIMATION (every clip sampled at 30fps through
  the REAL animator, plus the gait as `walk`/`run` loops and the jump / hover /
  crouch / battleIdle animator LAYERS as held poses — every shipped GLB has
  `animations: 0`, the whole library being procedural). Alongside them:
  `characters.json`/`.md` (stats, every attack's real numbers, personality, and
  the engine CAPABILITIES each body needs), `GEOMETRY.md` (the behaviour a model
  cannot carry — titanus' rocket-fist cut is the worked example), `art/<id>/`
  (canonical concept art, badge, poster, thumb, a four-view turnaround and an
  action pose rendered FROM THE EXPORT), `mechkit.js` (a runtime that imports
  nothing — you hand it THREE and GLTFLoader) and `lib/` (the animation system
  as the transitive closure of six entry modules; the bundler FAILS if that
  closure ever reaches past `three`). `node tools/exportcheck.mjs --all` is the
  proof: each file loaded cold with a bare GLTFLoader, checked for size, facing,
  the 15 joints by name, every anchor on the right bone AND at the offset it was
  authored at, that every clip MOVES bones rather than merely existing, and that
  every clip STATES THE WHOLE SKELETON. All 17 pass.
- EXPORTING A PROCEDURAL ANIMATION SYSTEM has four rules, and three of them were
  learned by shipping a broken asset to another game
  (`src/dev/export.js`). They are worth restating because
  every one of them is invisible from inside this repo, where the animator is
  always there to paper over the gap.
  ONE FRAME FOR THE MODEL, THE SKELETON AND THE ANIMATION. The transform used to
  be FOLDED into the vertices and bone rests while the clips were sampled from
  the unfolded live build, which is two frames in one file: the skin deformed
  through a rotation its vertices never took (reported as "even his normal punch
  causes his geometry to do all sorts of weird things"), and every anchor came
  out with its offset divided by the model scale — measured on titanus, all four
  at 0.111x, i.e. exactly 1/9.044, muzzleR arriving 1.2% of a body height from
  the palm it was authored on instead of 10.9%. Folding the sample TOO is
  arithmetic that must be repeated in every sampler and whose "which bones are
  roots" test reads the BUILD's hierarchy while the fold read the BAKED one —
  two different trees. So nothing is folded: IF A TRANSFORM HAS TO BE APPLIED,
  APPLY IT ABOVE THE JOINTS (`installArmature`), where glTF has a place for it,
  every importer honours it (it is the layout Blender emits) and it applies
  rigidly AFTER the skin has deformed, so it cannot deform anything.
  AN EXPORTED CLIP IS A COMPLETE POSE, NOT A DELTA. Dropping the tracks that
  never move is free INSIDE this game — the animator is a pose function over the
  whole body and the base writes every joint every frame — and outside it there
  is no base. An `AnimationMixer` leaves the bones a clip does not name exactly
  where the last clip left them, so pruning did not compress the clip, it
  deleted the standing half of it and attacks imported as an upper body welded
  onto whatever was playing before. Every sampler passes `keep`, the BAKED bone
  set, which also drops tracks for build-only bones (titanus carries 66 bones
  against the baked 26) — GLTFExporter discards THE WHOLE CLIP on the first
  track that binds to nothing, which is how saurion once exported 25 clips and
  arrived with `animations: 0`.
  SAMPLE FROM A SETTLED ANIMATOR, NEVER A COLD ONE. It is a smoother over an
  integrator — `cur` eases toward the target, the pelvis follows measured sole
  clearance, the carriage damps in — so frame 0 of a cold sample is the PREVIOUS
  clip still sliding, and an importer cross-fading idle into an attack saw the
  legs snap on the first frame of every strike. `settle()` runs 90 frames at
  `NEUTRAL_CTX` first, and every sampler must use the SAME neutral or the clips
  disagree about what standing is.
  AND SAMPLE THE SKELETON, NOT THE CLIP DATA. The tables in `animations.js` name
  a handful of joints per key; the pose is all of them, plus `postAnimate()` —
  signature layers, chain settling, foot placement — which is in the body the
  player sees and so must be in the sample.
- RENDERING (`CONFIG.rendering`, `?render=<mode>` — a DEV KNOB, deliberately
  not in the settings menu while the anime roster is 2/17 done; see the
  status note in docs/ANIME_PROCEDURAL_PLAN.md) picks the
  roster's whole wardrobe: `models` (the GLBs, default) · `anime` (the
  CEL-SHADED procedural roster — `src/mechs/anime.js`, judged against
  `docs/canonical/anime/`, plan in `docs/ANIME_PROCEDURAL_PLAN.md`) ·
  `fallback` (the original procedural bodies). The old spellings map in
  (`?debug=fallback`/`?debug=3d`), `is3dMode()` now reads the setting, and
  `createMech` is the ONE routing point. ANIME IS THE FALLBACK SCULPT WEARING
  DIFFERENT PAINT: the exact parts-kit body — same 15 joints, anchors,
  animator, every gait and clip — with the named material set swapped for
  MeshToon cel ramps (a shared 4-step gradient map) and an INK OUTLINE grown
  as an inverted-hull CHILD of every mesh (inherits transforms, fades with
  setOpacity, survives cloneMech — and is deliberately NOT in
  `mech.materials`, or the whiteout would flash the lines and cloneMech's
  material cloning would drop its onBeforeCompile displacement). Glows stay
  REAL EMISSIVE materials, not MeshBasicMaterial — signatures write
  `mats.glow*.emissive` live (nullbot's flicker crashed on a basic one) —
  and intensity sits ~1.25, under where bloom whites an amber slit out. The
  core PointLight is cut to 12%: on a cel ramp it blazed the whole chest
  flat. `ANIME[id]` in anime.js is the per-mech hand: palette read off that
  mech's drawing plus an optional `dress(mech)` for geometry the drawing has
  and the shared sculpt lacks (titanus' big amber reactor lens is the worked
  example) — or a FULL DEDICATED SCULPT: `design` + `dims` on the entry
  (src/mechs/animedesigns/<id>.js) replace the shared design and its
  proportions outright through buildMech's opts, for a mech whose drawing is
  worth a part-by-part rebuild. TITANUS is that worked example: proportions
  measured off the drawing's pixels (hips at 0.475 of height, forearm 0.163 H
  wide, fist bottom below the knee line), ~180 parts, hazard canvas from
  animeshade.js. The dark hearts stay 'glow'; WIDE lit fields (core corona,
  tower grilles) use a barely-emissive matte 'lens' material instead, or the
  bloom pass blazes them into blobs. A mech without an entry derives its
  paint from `def.colors` through `animeTone`, so all 17 render in anime
  mode today. Judge with the
  usual shots (`?showcase=<id>&render=anime`) and
  `RW_QUERY="render=anime" node tools/clipsheet.mjs <mech> <clip>`; a
  posters note: posters are pictures OF THE GLB, so `posterFor` answers null
  outside `models` mode and the menus photograph the real body instead.
- …AND NOTHING SHOULD BE ABOVE IT EITHER WHEN IT IS PRONE
  (`node tools/proneprobe.mjs [mech …]`). A downed body is floor-clamped
  (`gltf.js groundClamp`, called by Fighter.update for knockdown/getup): the
  model is shifted until its lowest RENDERED point rests on y=0. That is right
  for a body lying flat and wrong the moment anything narrow hangs below it,
  because A POINT IS NOT A CONTACT PATCH — a pointed toe, a heel spur, a tail
  tip takes the clamp's weight and the whole mech levitates on it. Measured
  before: titanus 15.5% of his height off the ground on `heelL`, tempest 10.7%
  on an ankle, wraith 24.6% ON HIS OWN CLOAK HEM, fenrir 40.5% propped up on his
  blade-tail, tritone 93.6% — nearly a whole body height, standing on his tail.
  TWO RULES FIX IT AND THE BODY WINS WHERE IT CAN. (1) The clamp lands his CORE
  (the geometry owned by hips/torso/head, named through `boneMap` so an auto-rig
  noun like `tripo0_Right_Limb_1` still resolves) and only backs off when doing
  that would bury an extremity deeper than `PRONE_SINK` (8% of body height —
  about half a boot, and the floor is opaque). `PRONE_SINK 0` is exactly the old
  rule. (2) WHAT HANGS OFF HIM GOES LIMP: `Animator.limpTail` is a quasi-static
  solve over the chains named by `mech.limpChains` (a rig's `limpChains`, a
  manifest entry's, else `tail0`) — each segment keeps a WORLD direction damped
  toward straight down and toward a floor it cannot pass through, run root to
  tip with the matrices refreshed between segments, so the chain FLOPS out flat
  in whatever direction it was pointing over ~0.3s. The clamp then ignores those
  bones entirely, which is only honest because the solver has already laid them
  on the ground. THE BONE LINE IS NOT THE SURFACE — on a thin blade it is, on
  tritone's armoured slab it is the middle of it — so rather than author a
  thickness per rig, the clamp reports how far the chain's geometry actually
  ended up underground (`mech.tailUnder`) and the solver integrates it into its
  own floor. After: 20 failing clips across the roster down to 5, tritone 93.6%
  -> 0.0%, fenrir 40.5% -> 0.8%, wraith 24.6% -> 7.2%, titanus 15.5% -> 8.9%,
  tempest 10.7% -> 3.8%. STILL FAILING, left as found: jerry (35%, propped on a
  long rigid back leg — no chain to go limp, the knockdown clip's leg pose is
  authored for a humanoid) and saurion (43%, an auto-rigged tail on
  `tripoSpine_0`; declaring it fixes his knockdown and makes his ragdoll worse,
  so it is not declared).
- A TAIL IS NOT A KICKSTAND AWAKE EITHER (`Animator.tailFloorGuard`, rig or
  manifest `tailFloor: true` — TRITONE). limpTail solves it for a body that is
  DOWN; the same thing happens to one that is UP. Tritone's taunt rears him onto
  his hind legs, and his tail is nine units long and hangs off the same hips, so
  the rotation that lifts his head swept the tail metres under the pavement —
  where nothing complains, because the FLOOR GUARD then does exactly its job and
  servos the whole animal up into the air. Read as him being levitated by his
  own tail. The rule is the plain one: NO SEGMENT MAY POINT BELOW THE FEET. Run
  root to tip, and where a segment's far end would land under the floor the bone
  is re-aimed so the end sits ON it, keeping the heading it had — limpTail's
  floor clamp without the gravity it damps toward, since this tail is alive and
  everything above the floor is whatever the gait and the clip asked for. So it
  is free at rest and costs nothing on a tail already carried high. THE FLOOR IS
  THE FEET, measured off the lower ankle rather than y=0, which comes out right
  on a slope, on a rooftop and in mid-air. Judge it with `node
  tools/scratch/rearprobe.mjs <mech> <clip>` (every tail bone's height against
  the hind ankles, per frame): tritone's rear went from the tail three units
  under the floor to never below his own feet, hind ankles planted within 0.07,
  head still climbing 4.7 -> 10.8.
- NOTHING SHOULD BE UNDER THE FLOOR, and `node tools/groundprobe.mjs <mech>`
  is how you know: it plays every clip the mech can actually play, CPU-skins
  the model at each sample and reports the LOWEST VERTEX against the ground,
  naming the bone that owns it. A CONTACT LIMB MAY DIG IN — a hand pressed on
  the ground or a hoof taking weight belongs slightly under it — so the limit
  is per part: generous for hands/feet/claws/hooves/toes, tight for everything
  else. A horn through the pavement is a bug at a fraction of the depth a palm
  is fine at. It replicates what the game does (the prone clamp for
  knockdown/getup, the floor guard where a mech has one), so the numbers are
  what a player sees rather than what the harness does.
  THE FLOOR GUARD (`combat/floorguard.js`, roster `floorGuard: true` — TRITONE)
  is the fix for a body the shared clips do not fit. His skull, three horns and
  jaw hang off the front of an already-low chassis, and every shared clip's hip
  drop and forward pitch were authored for a humanoid with a metre of leg to
  spend: measured, his jaw went 3.4 units under on the gore charge and his brow
  4.0 on the plunge landing. The guard servos `mech.visualFloorLift` — the
  RENDER container, a child of the physics group, so position, collision,
  grounding and the animator's per-foot placement are all untouched — off
  `mech.lowestRenderedY()`, the same skin-aware measurement the prone clamp
  uses. It does nothing until he is deeper than a contact limb's worth (0.35 x
  scale), so ordinary contact is unaffected. NOTE it must never run while the
  prone clamp does: both write the same render offset, and the two together
  took knockdown from 0.3 units under to 7.6.
  (Pitching the NECK back to lift the skull was tried first and measured: 3.4
  -> 2.0 and no better, because rotating the head can only raise the jaw to
  where the NECK is, and on these clips the neck is under the floor too. You
  cannot fix a buried body from the buried body's own joints.)
  A SERVO WITH NO FEEDBACK IS AN INTEGRATOR, which is what "tritone floats while
  walking" was. The guard ADDED each frame's error to the lift it was already
  holding, on the assumption that `lowestRenderedY` reports the body as
  corrected. It does not, reliably: a SkinnedMesh in AttachedBindMode carries
  the container offset in its bone matrices AND in the `bindMatrixInverse` that
  cancels them, so whether the lift shows up depends on which was refreshed last
  — i.e. on whether a render has happened since. Inside the guard it had not, so
  it read "still 1.5 under" every frame while holding him 3.4 up, and pinned at
  MAX: measured on a WALKING tritone, held 3.43 with his lowest vertex 1.9 ABOVE
  the road. It now MEASURES AT ZERO LIFT and makes the target an absolute
  function of the pose (the same shape as the prone clamp next door), so the
  servo only smooths the way there.
  …AND THE FLOOR IS OPAQUE, which is the whole argument for `ALLOW` being big
  (0.30 -> 1.3 x scale). A limb under the road cannot be seen; a body hoisted
  off the road can be seen from anywhere in the arena. Tritone's ordinary walk
  cycle puts a paw 1.25 units under — his legs are driven by a stride calibrated
  for a humanoid — so a tight limb rule had the guard lifting him ~0.9 for the
  whole walk, correcting an invisible problem with a visible one. `node
  tools/scratch/floatdiag.mjs <mech>` traces the loop frame by frame (what it
  measures, what it asks for, where the body ends up); after both changes the
  lift is 0.00 for the entire walk. The cost is honest and left as found:
  `tools/groundprobe.mjs` reports 9 clips putting geometry under the floor
  instead of 8, all of them LIMBS a body is standing on, since the guard no
  longer over-lifts the body to rescue them.
