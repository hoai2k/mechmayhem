# Procedural 3D mechs from the anime canonical drawings — feasibility + plan

> **Status (2026-08): PARKED AS A DEV FEATURE, two mechs done.** The anime
> route is fully built (`src/mechs/anime.js` + `src/mechs/animedesigns/` —
> TITANUS and GLACIER have dedicated high-fidelity sculpts; the other 15
> render through the generic repaint pass) but it is deliberately NOT
> player-facing: there is no settings-menu entry. It is reachable two ways —
> the Animation Workbench's **COMPARE TO → Anime Robot** (the intended
> judging surface, offered only for mechs with a dedicated sculpt) and the
> dev URL knob `?render=anime` (works on ?showcase, ?battle, everything).
>
> **What we learned** is captured where the next session needs it:
> `docs/ANIME_FIDELITY_GUIDE.md` is the whole method — the priority rule
> (model proportions primary, drawing owns simplification + colour), bone
> measure, runs profiles, side profiles, part sheets, and step 2c: write
> `docs/animeanalysis/<id>.md` FIRST and grade every round against its
> checklist in writing (glacier's is the worked example, with its round
> log). Rig levers grown for this: dims overrides `headY`/`headZ`/
> `shoulderY` (buildRig) and `soleDepth` (Animator ctor); design-time joint
> splay; the sculpt vocabulary in animedesigns/* (the `asm` local-frame
> helper, facet cores + lathe bulges + panel staves — never bare boxes).
>
> **To resume:** pick the next mech (viper or inferno), follow the guide's
> prompt template, and expect ~5-8 rounds. **To ship to players:** re-add
> the settings row (one item in boot.js settingsItems cycling
> RENDERING_MODES via setRendering, plus three `settings.rendering.*`
> labels in core/text.js — the config plumbing, persistence and
> ?render migration are already wired and tested).

The reference set is `docs/canonical/anime/` (17 cel-shaded drawings of the
same roster, copied from the mechbrawler repo). This document answers two
questions: **is a procedural rebuild from these drawings feasible**, and
**how would it be done** with the machinery this repo already has.

## Verdict: feasible — and easier than the photoreal set was

This repo has already done this once. Every mech has a procedural build
(`src/mechs/designs/<id>.js` over the parts kit in `parts.js` / `factory.js`)
that was authored *from the photoreal canonical images*, and the whole
animation/combat stack runs on it (`?debug=fallback` plays the entire game
procedurally today). So the question is not "can we build procedural mechs"
— it is "can we hit *these drawings*", and the anime set is the friendlier
target of the two:

- **The geometry is honestly primitive.** Cel shading can't hide surface
  detail in texture, so the artist drew everything as discrete faceted
  panels: tapered slabs, hex/oct columns, cylinders with end rings, thin
  fins and horn cones. That is almost exactly the existing parts vocabulary
  (`taperBox`, `facetBulge`, `cyl`, `fin`, `cone`, `bulgeLathe`). A panel
  count of 30–80 parts per mech, which is what these drawings resolve to,
  is the size the Assembler was built for.
- **The palette is enumerable.** Each drawing is 3–6 flat colour fields
  plus one emissive accent — trivially extractable, and it maps 1:1 onto
  the roster `skin` recipe (`base`/`base2`/accent/emissive) that pbrtex
  already consumes.
- **The look is a shading problem, not a modelling problem.** What makes
  these read "anime" is the cel ramp and the ink line, both of which are
  material/post work that applies to *any* geometry — the same procedural
  body can wear the current PBR skin or a toon skin.

What is *not* free: the ~5 organic bodies (fur, feathers, membranes) and
the ink-line pass. Both have known answers below; neither blocks the
humanoid majority.

## Difficulty tiers (from reading all 17 drawings)

**Tier 1 — armour-panel humanoids, the parts kit as-is** (9):
titanus, colossus, vulcan, glacier, rhino, inferno, tempest, viper, wraith.
Every visible form is a box/taper/facet/cylinder composition on the standard
15-joint rig. Viper's energy daggers and tempest's glow rings are emissive
`fin`/`torus` parts. Wraith's cloak is the one soft element — the game
already has `swayCloak`, so it's a segmented drape the animator moves, or a
shader-skirt; the body under it is Tier 1.

**Tier 2 — non-humanoid but rigid** (4): cranky (crab: shell dome + 6
segmented legs + claws — all lathe/facet parts; the `hexapod` gait already
drives this body plan), jerry (isopod: plated dome shell as overlapping
tapered slabs, many thin cylinder limbs; `arthropod` gait exists), tritone
(triceratops: frill disc + horn cones + barrel torso; `trike` gait exists),
frogger (smooth blobby shells — `bulgeLathe` was built for exactly this,
plus transparent "gel" material for the glass-green parts).

**Tier 3 — reads as organic surface** (4): fenrir (wolf mane/fur), saurion
(feather quills), konga (a furry gorilla — the hardest by far), nullbot
(glitch-shard body). The trick that keeps these procedural: the anime
drawings themselves render fur and feathers as *discrete overlapping
spikes/shingles*, i.e. as geometry, not as texture. A `spikeShell` /
`shingleShell` generator (N instanced tapered fins scattered over a scalp
region with jittered length/curl) reproduces the drawn look directly.
Konga's fur-mass silhouette would be a lathe body under a dense fin shell —
acceptable at game distance, and his mechanical arm/harness are Tier 1
parts. Nullbot's shards are random fins with the glitch effect he already
owns (`holoTaunt`).

## How it would be done

### Phase 0 — palette + proportion extraction (tooling, ~a day)

`node tools/animepalette.mjs <mech>`: mask by alpha (≥0.95 — the keyed
backgrounds carry chroma smear), k-means the figure pixels into 4–7
clusters, split emissive by saturation×value, and emit a paste-ready roster
`skin` patch plus the cel ramp stops (lit / shade / ink) for Phase 3.
Second output: measured proportions — head height, shoulder span, arm reach,
leg length as fractions of figure height, read off the silhouette — which
seed `computeDims` overrides per mech so the rebuilt body stands in the
drawing's proportions rather than the default humanoid's.

### Phase 1 — vocabulary additions to `parts.js` (small, shared)

Read across all 17 drawings, the missing builders are few:

- `shingleShell` / `spikeShell` — scattered instanced fins over a region
  (fenrir mane, saurion quills, konga fur, glacier's ice crystals, rhino's
  spike crown — five mechs, one builder).
- `segTube` — a chain of short cylinders with joint rings (hoses, cranky's
  antennae, jerry's whiskers, inferno's cables).
- `panelInset` — a slab with a recessed darker inner panel (the single most
  common motif in the set; today it takes two hand-placed parts).
- A `gel` material preset (transmission-free fake glass: bright fresnel rim
  + darkened core — remember `transmission` renders invisibly in this
  scene) for frogger/tempest/viper glow parts.

Everything else in the drawings decomposes into builders that exist.

### Phase 2 — per-mech rebuilds (`src/mechs/designs/<id>.js`)

The same workflow the current designs were built with, one mech per file so
parallel agents can fan out (house rule: `designs/<id>.js` is
parallel-safe):

1. Write a part list from the drawing, top-down: silhouette masses first
   (torso, pelvis, limb segments), then the 5–10 signature parts that make
   the mech recognisable (titanus' radiator towers, vulcan's gatling
   forearms, glacier's crystal crown), then trim (insets, rivets, decals).
2. Build on the existing rig via the Assembler — parts attach to the 15
   game joints, so every gait, clip, hurtbox and anchor works unchanged.
   **MECH_ART_GUIDE §5 contract is binding**: muzzle/boost/anchor joints
   must land where combat expects them; `contract.js` checks every build.
3. Judge against the drawing, not from memory: `?showcase=<id>` screenshot
   beside the PNG, iterate. SwiftShader waits per MECH_ART_GUIDE §4; VIEW
   the images. `tools/thumbs.mjs`-style side-by-side sheet
   (`tools/animecompare.mjs`: render front pose at the drawing's camera,
   composite next to the reference) makes the loop one command.

Order of attack: one Tier-1 mech end-to-end first (titanus — the current
procedural build is closest to its drawing already) to calibrate effort and
prove the loop, then fan out Tier 1, then Tier 2, Tier 3 last.

### Phase 3 — the anime *look* (optional but where the payoff is)

The rebuilt geometry can ship under the existing PBR materials and simply
be a better-proportioned fallback roster. But the drawings' identity is the
cel shading, and matching it is a bounded, shared pass:

- **Cel ramp material**: a `MeshToonMaterial`-style ramp (3 stops from the
  Phase-0 palette: lit, shade, ink-shadow) as an alternative material set in
  `factory.js`, toggled per build (`?render=toon` url knob through
  `core/knobs.js`). The mechbrawler repo already derives per-mech
  `toon.cel.palette` + `shadeTint` from these very images — port that
  derivation, don't reinvent it.
- **Ink outline**: inverted-hull backface pass per merged mesh (the
  Assembler merges per joint+material, so it's a handful of draws, not
  per-part). Thickness in screen space ~1.5px to match the drawings' line
  weight.
- Emissives stay emissives — the bloom pass already sells the glow slits.

This pass applies equally to the GLB roster, which is a cheap win the day
it exists.

### Phase 4 — verification (all existing tools, no new ones)

- `npx vite build` green; combat soak on a procedural battle
  (`?battle=neon&p1=<id>&p2=<id>&auto=1&debug=fallback`).
- `tools/hurtboxfit.mjs` (contain must not fall), `tools/ankleprobe.mjs`
  (no bone at/below sole), `tools/anchorkeep.mjs` untouched — anchors are
  authored per mech and a rebuild must keep their rest transforms.
- `tools/footprobe.mjs` / `gaitprobe.mjs` on the Tier-2/3 bodies whose
  proportions moved.
- Visual: the Phase-2 comparison sheet for all 17, eyeballed against the
  drawings before claiming done.

## Effort estimate

Phase 0+1: ~2 sessions. Tier 1: ~half a session per mech once the loop is
proven (9 mechs). Tier 2: ~1 session each. Tier 3: 1–2 sessions each, konga
the long pole. Phase 3 (toon pass): ~2 sessions. Roughly 20 focused
sessions for the full roster with the anime shading; the first visible
result (titanus, cel-shaded, beside its drawing) inside 2–3.

## Risks / open questions

- **Konga** may never read "furry" enough procedurally; acceptable fallback
  is the shingle-shell look (the drawing itself is spiky, not soft).
- **Decals** (hazard chevrons, unit numbers) want a canvas-texture stamp
  pass in pbrtex rather than geometry; the photoreal designs already skip
  most of them, so treat as polish.
- **Where it ships**: as the improved fallback roster (`?debug=fallback`),
  as a selectable "anime" render mode over both rosters, or as the new
  primary look is a product call, not a technical one — the plan above is
  the same for all three.
