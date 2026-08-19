# Getting a HIGH-FIDELITY anime sculpt out of a drawing — the protocol

This is the working method for `src/mechs/animedesigns/<id>.js` (the dedicated
anime-route sculpts — see the RENDERING entry in CLAUDE.md). It exists because
the first titanus attempt missed three things a human saw instantly — head not
tucked, legs too short, knees with no dark structure — and each miss traces to
a **specific, repeatable mistake**. Follow the protocol and those mistakes
can't happen; skip a step and expect the same feedback again.

## The three failure modes (why misses happen)

1. **Trusting the drawing's vertical ratios.** A concept drawing has
   perspective. Titanus' drawing compresses the lower body: legs measured off
   its pixels came out ~15% short, and the ankle height (his boots are TALL —
   the ankle rides at 0.153 of body height) is nearly invisible in it. A
   drawing is the styling truth, never the proportion truth.
2. **Judging the whole figure at a mismatched camera.** One full-body
   screenshot from the showcase's high camera, eyeballed against a chest-height
   drawing, hides regional errors: foreshortened legs read "fine", a pauldron
   floating half a head too high reads "fine". Regions must be judged one at a
   time, at matched framing.
3. **Reading shapes but not VALUES.** The drawings say as much with their dark
   fields as their silhouettes — a knee is a yellow hex plate *over visible
   dark machinery*, a waist is a *dark* band, a joint is a *dark* drum with a
   keyed dimple. A rebuild that matches every outline but paints the gaps
   yellow still reads wrong. Dark areas are structure; model them as parts.

## The protocol

**0. THE PRIORITY RULE — what each source is FOR.** The 3D model's
proportions are PRIMARY; the drawing's proportions are secondary (it has
perspective and a pose). The drawing's authority is the other half: it shows
how to SIMPLIFY the model — the part blocking, which shapes merge into one
slab, where the dark structure and the paint fields are — and how to COLOUR
it. When the two disagree on a length or a height, the model wins outright
(glacier's high knees stood against the drawing's foreshortened legs); when
they disagree on paint, shape family, or piece count, the drawing wins.

**1. Skeleton from the GLB, never the drawing.**
`node tools/scratch/bonemeasure.mjs <id>` prints the canonical 3D model's bone
world positions at rest. Express every landmark as a fraction of **B = ground →
helmet top** and derive the `dims` override from them: hip/knee/ankle heights,
shoulder pivot height AND x, hip/ankle x (stance width and splay), hand height
(where the fists hang). Titanus' numbers, for calibration: hips 0.524 B, knee
0.329 B, ankle 0.153 B, shoulder pivots 0.848 B at ±0.277 B, head joint
0.877 B, hip joints ±0.165 B, ankles ±0.200 B (splayed wider than the hips).
The rig honours what the standard layout can't express through the dims
overrides `headY`/`headZ` (a head sunken into the chest) and `shoulderY`
(pivots below the chest top) — add a new override to `factory.buildRig` when a
body needs one, don't fake it with geometry offsets.

**2. Grid + region crops from the drawing.**
Overlay a 100px grid on `docs/canonical/anime/mech_<id>.png`, then cut and
actually VIEW crops per region: head+towers, chest/core, pauldron,
forearm+fist, waist, leg, foot. For each region write down, before any code:
- the **silhouette** (what shape family, which way it tapers/flares),
- the **sub-piece count** — err on MORE pieces; a forearm is a cuff + drum +
  front panel-in-panel + side inset + piston + wrist collar, never one box,
- the **value pattern** — which areas are paint, which are dark structure,
  where the seams and shadow gaps sit,
- the **glow placement** and whether each glow is a bright slit (emissive
  'glow') or a wide lit field (the barely-emissive 'lens' pattern — a wide
  field at glow intensity blooms into a blob).
Where the anime drawing is ambiguous (backs, occluded joints), read the
photoreal canonical (`docs/canonical/mech_<id>.png`) — the drawing wins only
where they disagree.

**3. State the landmark table in the design file header** as fractions of B,
with the source of each number. The file is the record; the next session
shouldn't have to re-derive it.

**3b. RUNS-PROFILE the drawing — measure, don't eyeball, the shapes.**
Per-row opaque SPANS of the keyed PNG (scratch: alpha runs, ~2px rows)
separate the two legs from the fists and give every part's centre + width row
by row. This is what catches the things a glance misses: titanus' legs leave
a NARROW hip (thigh centres ±0.135 B) and splay OUT to the knees (±0.164 B)
with boots wider still (~0.28 B per foot) — and his pauldron top is a narrow
crest that swells to full width only a quarter of the way down (a ROUNDED,
TAPERING top, centred at ±0.21 B, inboard of the arm pivot), with the bottom
tapering back in. Use the cleaner-perspective side of the drawing for
single-part numbers. And for every COLUMNAR part (towers, horns, stacks,
barrels), read its width per row within the part's own x-band and state the
GRADIENT — tapers / straight / flares, and where. Titanus' radiator towers
measure 109 → 82 px rising, a monotone TAPER with no cap: the first build
gave them a wider cap block at the top, a bulge nothing in the drawing has,
and the full-figure comparisons never surfaced it. A shape's direction of
change is a measurement, not an impression.

**3b2. SIDE ANALYSIS — a front-only match is a cardboard cutout.**
Depth is invisible in a front view and mostly occluded in the (3/4) drawing,
so profile it from the 3D model: `node tools/scratch/sideprofile.mjs <id>
models` buckets the GLB's skinned vertices by leg bone and prints per-y-band
DEPTH (z-extent) beside width; run it again with `anime` on your build and
compare band by band. Titanus' first depth audit read HALF the model
everywhere — thigh 1.0 vs ~1.85 (no hamstring mass), ankle throat 0.86 vs
~2.2, boot 1.9 vs ~2.8 — which is exactly what "the legs look flat" means.
Sculpt to the bands: rear masses (hamstring, calf, heel counter), front
bosses (thigh wedge, faceted knee prism standing proud of its backing
plate, instep, toe box), 45° chamfer strips so big faces read as facets.

**3c. CLOSE THE LOOP with a geometry probe.** After building, sample the
BUILT mech's mesh vertices per region (world-space, in y bands, ink shells
excluded) and print centre/width against the target table — see the
geomcheck pattern in this session's scratch. Numbers catch what squinting at
a screenshot does not, and they caught the biggest bug of all: the ANIMATOR
was sinking the whole body boot-deep, because the procedural stance pins the
ankles at 0.32*scale over the floor. A design whose ankle rides high in a
tall boot must state `soleDepth` in its dims (read by the Animator ctor,
which then also damps the heel roll and asks for a level sole exactly as a
measured GLB boot gets). MORAL: a proportion that looks wrong at runtime is
not always the geometry — verify the JOINTS' world positions match the
design before touching parts.

**3d. ASSEMBLY TURNAROUNDS — compound parts must read from EVERY angle.**
`node tools/scratch/partsheet.mjs <id> <joint> out.png [render]` shoots a
close-up 4-view sheet (front / 3-4 / side / back) centred on a joint. Run it
for every compound assembly — hands, feet, head, any weapon cluster — and
judge each tile as its own picture: a HAND has to read as a hand in all
four. Titanus' first fist read fine head-on and was a MITTEN from the side
(stub fingers pinned to the forearm, no curl in the silhouette, a floating
thumb) — invisible in every full-figure shot, obvious in one tile. The fix
is compositional, worth stating as the rule: in a clenched fist the FINGERS
are most of the volume, three large segments each, wrapping down and under
so the side shows the curl arc and the back shows fingertips.

**4. Judge region by region at matched framing.**
After each build round, side-by-side the render against the drawing at the
same figure height — and check regions off a list, not the gestalt:
- pauldron TOPS vs helmet TOP (level? which is higher, by how much),
- where the visible leg starts (a too-deep pelvis eats the thighs),
- knee: is there dark showing all round the plate,
- flare directions (calf bulges UP-high, lower shin and boot flare DOWN-wide),
- fist bottoms vs the knee line, tower tops vs the helmet.
`tools/shot.mjs` + a sharp composite is enough; crop the render to the figure.

**5. Iterate biggest-error-first, at least three rounds.** Proportions, then
value pattern, then trim. Expect the first round to be wrong somewhere a
human will see in one second — that is what the region checklist is for.

**6. Verify like any art change**: `npx vite build`, an anime-mode soak, a
`?debug=fallback` screenshot (the shared roster must not move), and a WALK
capture — rig-level changes (tuck, splay) must hold under animation, and only
a moving capture proves it.

## Prompt template (what to ask for, per mech)

> Rebuild <id>'s anime model at high fidelity. Skeleton from
> `bonemeasure.mjs` (never the drawing's verticals); styling from
> `docs/canonical/anime/mech_<id>.png` read as region crops, with the
> photoreal canonical as tiebreaker. Decompose every region into its real
> sub-pieces (err on more), model the dark areas as parts, and iterate with
> region-by-region matched-framing comparisons until each checklist row
> passes. Show me the side-by-side and a walk capture.

The checklist rows in step 4 are the acceptance criteria; add per-mech rows
for whatever that drawing's signature features are (fenrir's mane layers,
glacier's crystal crown, cranky's leg arches…).
