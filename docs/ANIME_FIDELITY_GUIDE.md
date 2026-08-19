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
