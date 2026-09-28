# Arenas

Props and their colliders, the arena editor and authored levels, per-round arenas, fog, structures and the layout design systems.

These notes were the body of CLAUDE.md, which is now an index into this
folder. Each entry names the mechanism, why it is built that way, what was
measured, and the tool that checks it — most of it was learned by breaking it.

- A PROP'S COLLIDER IS ITS OWN SHELL (`src/arena/propshell.js`, `propBody.shell`).
  Every standing prop is measured as ONE VERTICAL CYLINDER off its ground band,
  which is right for a smokestack and a lie for anything that is not round. THE
  GEAR is the worked example: a thin brass disc standing on edge, six units
  across and one deep, whose cylinder is a solid pillar as wide as the disc and
  as tall as the top of it. A mech walking at it stopped three units short of a
  face he could see, and a SURFACE WALKER climbed the pillar — konga ended up
  hanging in the air beside a gear with all four limbs reaching and nothing to
  hold. So a prop also carries the world boxes of its OWN MESHES, merged
  greedily (cheapest union first) down to at most six: 13 meshes on a gear
  become 3 boxes that still say "disc", where their single union would say
  "block". That is what the fighter is pushed out of (`collideFighter`) and
  what the climber's field reads (`collectSolids`), so what you touch is what
  you see. THE CYLINDER STAYS and is still the broad phase: the damage radius,
  "am I inside a prop", the AI's avoidance and the ghost clones all want one
  cheap round number, and none of them are about contact. (Projectiles keep it
  too — `propAt` is a round test and close enough to be convincing.)
  IT IS EVERY ARENA — the shell is derived in `_regProp`, which every placement
  in every theme goes through — and WHICH COLLIDER A PROP GETS IS MEASURED
  rather than assumed: "boxes are more accurate" is only true of a prop that is
  not round, and boxing a smokestack makes its corners worse. Both candidates
  are scored at placement by their PHANTOM SKIN — points sampled over the
  collider's own surface, each measured to the nearest point ON THE MODEL, which
  is literally how far a body held against it sits off the thing it looks like
  it is touching — and the better one is kept. 62 of the 67 solid props take the
  shell; tireMound, lavaPool, vineColumn, junkPile and holoGlobe keep their
  cylinder because they are round.
  MEASURE AGAINST THE VERTICES, NOT THE MESH BOXES, or the metric grades the
  shell against the boxes it was built from and reads 0.00 by construction —
  which says a ROCK (an irregular blob with a corner of air in its box) is
  perfectly fitted, right up until a body stands on that box's flat top a metre
  above the stone. The cloud is decimated to ~320 points so both candidates cost
  the same bounded handful of clamps once per placed prop.
  `node tools/propshell.mjs` is the audit: every prop the twelve arenas place,
  ranked by how far its collider floats off its own model, with the choice the
  game makes beside it. Mean phantom skin over the whole set: 1.59 -> 0.69
  units. It is also how the AURORA was caught — five transparent curtains hung
  36-50 units up with no ground band at all, so the cylinder rule fell back to
  the whole 130-unit ring, capped the radius at 7 and gave the frozen arena an
  invisible pillar in the middle of it. It is `noCollide` now: it is light, not
  scenery.
  WHAT IS LEFT is the irregular ones — a rock, a crystal, a jungle canopy carry
  1-3 units of slack whichever collider they take, because neither a box nor a
  cylinder is that shape. That is the slack the climber's contact rule exists to
  catch (see NOTHING TO HOLD IS NOT A PLACE TO BE). The dozen props that name
  their own multi-part colliders (`userData.bodies` — gates, arches, cave
  mouths) are hand-placed and get no derived shell; the audit measures and lists
  them anyway, so a bad one is visible.
- ARENA PROP COST: props are an object-count problem, not a triangle one (they
  were ~45-80% of a frame's draw calls for 3% of its triangles, because each is
  a pile of small meshes and the toroidal wrap clones the lot into 8 neighbour
  cells). Three levers, each revertible on its own:
  `mergePropMeshes` (src/arena/props.js) bakes each placed prop's meshes
  together by material — after the colliders are measured, before the ghost
  clones — and `?props=raw` turns it off; `node tools/propopt.mjs [--apply]`
  shrinks the imported prop GLBs, keeping the untouched originals in
  `public/models/props/source/` (`--restore --apply` puts them back); and
  `preloadPropModels(themePropNames(theme))` fetches only the models the arena
  places instead of all twenty. The GLB diet is SIZE-PRESERVING: the decimation
  error budget tightens per model until the bounding box matches the original
  (`node tools/propopt.mjs --audit` proves it for all twenty, and FAILS on
  drift). Judge the models in `/workbench/?edit=props` — original and optimized
  in twin viewports with one shared camera, with triangle/texture/VRAM/file
  deltas and a size check; the mesh merge is judged by flipping `?props=raw`
  on a battle URL, since it changes draw calls and not pixels.
- A PROP'S MODEL MUST FACE THE WAY THE PROP DOES (`node tools/propyaw.mjs
  [--apply]`, `ry` in `public/models/props/manifest.json`). A placed prop is a
  PROCEDURAL build whose visuals are swapped for an imported GLB
  (`propGlbSwap`), and everything around that swap is authored in the
  procedural prop's frame: the yaw you set in the arena editor, the multi-body
  colliders in `userData.bodies` (remapped by the two footprints' extents, so a
  turned model stretches the wrong axis), and the recipe a bake records. TWELVE
  OF THE TWENTY MODELS sat a quarter turn from the prop they replace — the
  owner's torii gates were set facing down the street and the game stood them
  across it. It is MEASURED rather than eyeballed: each footprint is a point
  cloud in XZ, the principal axis of its covariance says which way the long
  axis points (mod 180, since an axis has no head or tail), and the THIRD
  MOMENT along it says which end is heavy — which is what tells a trawler's bow
  from its stern, where a bounding box is symmetric and cannot. Nothing is
  proposed for a prop with no long axis to align (`elong < 1.25` — a fuel tank
  has no orientation to get wrong), and a quarter turn that still leaves the
  axes disagreeing by more than 20°, or a half turn resting on the skew alone,
  is REPORTED for a human rather than written (gantryCrane, icebreakerShip
  today). Judge a change with `tools/propshell.mjs` — the collider fit is
  derived from the same footprint (mean phantom skin stayed 0.69).
- THE ARENA EDITOR BUILDS THE PROP THE GAME BUILDS, GLB included
  (`config.arena.prop` runs `propGlbSwap`, `config.arena.preloadProps` fetches
  the models, and `ensurePropModels` in the level tool rebuilds the proxies
  when they land). It used to draw the procedural stand-in, which differs from
  what ships in shape, in size (the shuttle's model is twice the procedural
  one) and — until the models were straightened above — in which way it faces.
  Fetching is best-effort and nothing waits on it: the procedural build is on
  screen immediately and is exactly what the game falls back to for a model
  that fails to load.
- ONE POINTER, ONE OWNER (`workbench/tools/level.js`, asserted by `node
  tools/editorpointer.mjs`). The editor and OrbitControls share one mouse.
  OrbitControls is constructed first, so on a plain listener it saw every press
  FIRST, took pointer capture and began a rotate; the editor then set
  `orbit.enabled = false` to drag the object instead — which does not END the
  gesture the controls had already begun, it only stops them updating it. A
  drag that then ended abnormally — a `pointercancel` (a trackpad deciding the
  press was a scroll), a release outside the window, a window losing focus —
  left the controls holding a press that was never handed back, and the camera
  stopped answering the mouse FOR THE REST OF THE SESSION while
  `orbit.enabled` still read true. Every interrupted drag made it worse, which
  is what "over time I lose the ability to move around" was.
  THE DECISION IS MADE BEFORE THE CONTROLS SEE THE PRESS: the editor's
  pointerdown listener runs in the CAPTURE phase and, when the drag is the
  editor's, stops the event there — so the controls never start a gesture at
  all and there is nothing to leak. The drag is also pointer-CAPTURED, and
  `pointercancel` / `lostpointercapture` / window blur all end it, with a
  cancelled drag PUT BACK rather than committed (the browser taking the pointer
  is not the user dropping the object, and it is not a click either).
- AN ARENA IS A RECIPE UNTIL SOMEBODY AUTHORS IT (`src/arena/authored.js`).
  themes.js says what a place is MADE OF and every match rolls a new city from
  it with a fresh seed — which is why an arena the owner laid out by hand was,
  for a while, a file on disk nothing in the game ever opened. `AUTHORED_ARENAS`
  is the registry that closes that gap: theme id -> level basename in
  `public/levels/`, and `resolveArenaTheme(theme)` is the ONE call both the menu
  path (boot.js `startBattle`) and the `?battle=` harness make to ask "what am I
  actually building". A theme with no entry has no authored version and stays
  procedural — most of them, today — so the two kinds sit side by side with no
  per-arena flag, and a level file that fails to load costs the player a
  GENERATED city rather than a broken one.
  It resolves BEFORE the prop warm-up, because it is the authored level that
  says which props this city places, and it KEEPS the base theme's name/desc:
  the player picked NEON DISTRICT off the card and that is what the loading
  screen should go on calling it, whatever the level is titled in the editor.
  SETTINGS -> ARENA DESIGN (`CONFIG.arenaDesign`, `?design=<mode>`) says which
  DESIGN SYSTEM lays a generated arena out — see the entry below. Only its
  `authored` mode (the default) consults this table; every other mode
  (`wards`/`avenues`/`circuit`/`fallback`) generates everything, which is how
  the procedural cities stay reachable once an arena has been authored. The old
  `?procedural=1` still means `fallback`, and the retired on/off pref migrates
  (ON -> fallback, OFF -> authored). The harness honours it too — a bare
  `?battle=neon` plays what the MENUS play, or a soak silently tests an arena
  nobody ships.
- A MATCH IS FOUGHT IN THREE DIFFERENT CITIES (`CONFIG.arenaPerRound`,
  `rebuildArena` in battle.js, wired in boot's `match.onRoundStart`). A
  best-of-three in one arena is three fights on one stage, and the arenas are
  half the game's content. The NEXT arena is resolved and preloaded WHILE the
  current round is being fought — an authored level is a fetch and so are the
  prop models it places — so the swap itself is synchronous and lands in the
  round-end pause; if it is not ready, the round simply opens where it already
  was. `rebuildArena` takes the whole old stage away with it: the crates it
  scattered and the fountains standing on its ROOFS are WORLD objects, not arena
  ones, so `world.clearPickups()` / `fountains.clear()` exist for exactly this
  (without them the second round has twelve crates and three fountains hanging
  in the air over nothing). Order matters: it runs from `onRoundStart`, which
  `Match.startRound` calls BEFORE it reads spawn points, so every fighter is
  reset onto the new arena's pads. Judge it with `node
  tools/scratch/arenaswap.mjs` (three swaps under a live world: scene-object
  count, crates, fountains, wrapHalf, and a fighter who still walks and stands
  on the new terrain) and `node tools/scratch/roundswap.mjs`, which does it in
  the REAL game through the menus.
- A MATCH OPENS ON A STAGE THAT IS READY (`src/game/loadscreen.js`, CSS under
  `.ls`, probe `node tools/scratch/loadscreen.mjs [out-prefix]`). The card
  that covers the wait is FULL-SCREEN AND OPAQUE — the arena's painting and
  name with the loading bar under them, every fighter's canonical concept art
  (`public/art/<id>.jpg`, written from `docs/canonical/` by `node
  tools/canonart.mjs`, ~55 KB each) on an angled panel with a VS between, and
  the pad diagram small (`compactPadSvg` in ui/instructions.js — the SAME
  control table and strings as the ⓘ page, so a rebinding is one edit for
  both). The REAL scene renders underneath it through the real cameras the
  whole time, which is what warms the shaders and textures; one explicit
  `compile()`/`initTexture` pass runs before the reveal. THE GATE is at least
  3s AND the texture loader idle for a beat AND no fighter still waiting on a
  model AND that prewarm frame, and only then does the card fade (0.9s) over a
  stage that was already drawing. The old warm-up (per-fighter cameras over a
  grey sandbox floor the humans could romp on) is gone with it; `world.sandbox`
  survives as the "the arena must not touch anyone under the card" flag.
  A ROUND FOUGHT SOMEWHERE NEW GETS THE SAME CARD: boot's `onRoundStart` swaps
  the arena, sets `match.holdRound` and starts the screen; `Match.startRound`
  resets the bodies onto the new pads and then parks in state `held` — the
  announcement, the sting and the intro clock are all in `openRound()`, which
  `match.release()` runs when the card is down. Round 1's reveal calls
  `match.begin()` instead. Nothing in the match can run under a card.
- THE FOG IS THE COLOUR OF WHAT IS BEHIND IT (`src/arena/horizon.js`). Fog
  lerps a fragment toward one flat colour, so a tower at the wall IS that
  colour — and the only colour that makes it dissolve is the backdrop behind
  the wall. The themes' authored fog colours predate the painted backdrops
  and disagreed with them (RUINS: a grey-beige wall in front of an orange
  sand strip — sandstone, then white haze, then sand again). So it is
  MEASURED: the horizon strip's opaque ground-haze band (rows 4-34% up the
  image), else the panorama's horizon rows, else the gradient dome's own
  horizon colour, averaged in sRGB and set on `scene.fog.color` (and the
  fallback skyline boxes) the moment the image is in — the loading screen
  holds the reveal past that, so the match opens matched. The authored
  `theme.fog.color` is only the value until then.
  AND FOG ONLY WHERE IT IS NEEDED: nothing is culled by fog (every chunk,
  prop and ghost inside the far plane is drawn hazed or crisp), so pushing
  the band out costs nothing and pulling it in buys nothing; the one limit
  is the wrap — past one period P the view is looking at this tile again, so
  full fog lands at `FOG_FAR` 0.97P (was 0.92P) and the band opens at
  0.66-0.80P (was 0.45-0.62P), the theme's own `fog.near` steering where in
  the window it lands. `CONFIG.fogReach` (`?fogreach=0..1`) scales back toward
  the old band for a side-by-side.
- NOT EVERY LARGE STRUCTURE IS A BUILDING (`src/arena/structures.js`, asset
  prompts in `docs/ASSET_REQUESTS_STRUCTURES.md`). A big destructible mass has
  a gameplay job — block sight, give cover, be climbed, come down — and every
  one of them used to be a chunk shell wearing a facade, which is right for a
  city and wrong for a caldera. A STRUCTURE KIND keeps the gameplay identical
  (same chunks, so it collapses, damages, carries fountains and climbs exactly
  like a tower) and changes what it is made of: a silhouette from the LANDFORM
  family in massing.js (`mound`/`columns`/`spires`/`iceWall`/`berg`), its own
  cell scale, its own palette, and ITS OWN MATERIAL. A material means a second
  InstancedMesh, so the arena builds ONE DestructibleSystem PER MATERIAL FAMILY
  the theme uses (`arena.structoFor`) and `arena.destructoAll` is what every
  combat query walks — `destructo` stays the buildings' one, which is what the
  tools, the recipe and specials.js reach for. climb.js and fountains.js walk
  all of them, so a crystal spire is climbable and can carry a fountain.
  WHICH SITES CONVERT IS BY GROUP, NEVER INTERLEAVED (`assignStructures`): a
  theme declares `structures: [{kind, share}]` (shares are of the whole site
  budget — volcano 0.62, quarry 0.62, frozen 0.60) and whole CLUSTERS convert,
  because a crystal spire between two office blocks reads as a mistake while a
  field of them reads as a place. Scattered sites are nested into spatial
  groups first. It runs in arena.js after the sites are chosen, so the three
  design systems AND the fallback scatter all get it from one place.
  A LANDFORM IS ALLOWED TO BE BIG: the building path clamps a wide silhouette
  to 19/nx so a tower cannot swallow a street, and applying that to a mound
  eleven cells across gives 2.2-unit chunks — a pile of gravel where a hill
  was meant to be. Structures clamp at 58/nx and stand 1.15x their cell size
  tall.
  A CHUNK DOES NOT HAVE TO BE A BOX (`src/arena/chunkgeo.js`), and until it
  stopped being one every landform read as exactly what it is built from — a
  stack of cubes on a lattice. Two things, and either alone still reads as a
  grid: the chunk's OWN GEOMETRY (a faceted SHARD with a pointed termination —
  the habit crystals actually grow in — or a noised icosahedron BOULDER), and
  a PER-CHUNK turn and swell drawn from the building's own rng, where the
  swell is over 1 ON PURPOSE so neighbours INTERPENETRATE and the lattice
  fuses into one continuous mass. `CHUNK_SHAPES` names six —
  `boulder`/`crystal`/`icefall`/`iceSlab`/`snow`/`box` — and `FAMILY_SHAPE`
  (structures.js) assigns one per MATERIAL FAMILY, which is the grouping the
  systems already use. `box` is every building and always will be, so the
  cities are untouched. It is PURELY VISUAL: a rotated, swollen shard occupies
  exactly the cell it always did, so nothing combat measures moves.
  A MATERIAL ARRAY NEEDS GEOMETRY GROUPS. A chunk mesh is built with six
  materials (a building wants a roof on two faces) and three renders an
  array-material mesh BY GROUP, so the first custom geometry — which had none
  — drew NOTHING: every structure in the quarry, the forge and the outpost was
  present in every collision, climb and damage query and invisible on screen.
  `withGroup` adds the one group; a box has its own six.
  A SHARD HAS NO UNWRAP, so the uv is a BOX PROJECTION (`boxProject`): each
  triangle is projected down whichever axis its normal points along most,
  which is seamless on a faceted shape and costs nothing. Without ANY uv the
  texture pack samples one texel and a rock renders as painted plastic — so
  the landform materials landed and changed nothing until this existed. The
  practical consequence for art: a strongly directional pattern shows up in
  three directions at once, so these textures want isotropic detail.
  THE EMISSIVE MAP IS TINTED PER CHUNK. `emissive` is a uniform, so a map
  left alone lights every chunk the same and washes a near-black basalt mound
  white (which is why the intensity was pinned at 0 for a while). `vColor` —
  the instance colour — is already in that shader because `vertexColors` is
  on, so `structureMaterial` patches `totalEmissiveRadiance *= vColor` in:
  an ember chunk's cracks burn orange, the cold rock beside it barely glows,
  and one crystal spire glows in six colours off one white map. A patched
  shader needs its own `customProgramCacheKey`, and anything that turns
  `vertexColors` OFF must retire the patch with it (the level editor's proxy
  does) or `vColor` is undeclared and the shader will not compile.
  A SILHOUETTE IS NOT A PROPORTION. `mound` derives its layer count from its
  radius, so a snow drift wide enough to read as one came out four to nine
  chunks tall — a bank, not a pile. That is what the `drift` style is for (a
  wide low dome, 2-3 layers, crest offset along the wind).
  ONE ANSWER FOR THE SHAPE, THREE CALLERS: `structureMassing(kind, rng)` is
  the silhouette+cell+tint as plain data, run by the arena to place one, by
  the AUTHORED path for a hand-placed one carrying no baked cells, and by the
  level editor to draw its stand-in — an editor that computed its own would be
  showing you a different rock from the one that ships. A hand-placed
  structure grows from `structSeed` (its position), so moving it gives you a
  different rock, which is honest: it is a new rock.
  IN THE ARENA EDITOR they are palette entries DERIVED from `STRUCTURE_KINDS`
  (`arenapalette.js`), drawn through `config.arena.structure(def)`, with an
  inspector that offers the two things a landform has — a reroll and a tint —
  instead of a tower's footprint fields.
- PER-CHUNK COLOUR NEEDS BOTH HALVES, and it was silently doing NOTHING.
  `setColorAt` fills `instanceColor` and three folds it into vColor in the
  VERTEX stage — but the FRAGMENT stage only declares vColor under USE_COLOR,
  i.e. `material.vertexColors`. Turn that on and the vertex stage also runs
  `vColor *= color`, reading a per-vertex `color` attribute a BoxGeometry does
  not have, so WebGL supplies (0,0,0) and every chunk goes BLACK. The fix is
  both: the chunk geometry carries a WHITE colour attribute (destructible.js)
  and the materials that want tint set `vertexColors: true`. Until this, every
  theme building tint AND every colour a voxelized GLB donor sampled from its
  own texture was computed and thrown away. Buildings are tinted now too; with
  the texture pack on, `tintFor` already lerps 68% toward white, so the shipped
  look is unchanged (neon/uptown are pixel-identical) and the tints finally
  mean something with `?textures=0` and on donors.
  AND THE GLOW IS DIFFUSE, NOT EMISSIVE: `emissive` is a UNIFORM, so one
  material cannot glow in six crystal hues, and a uniform emissive over a
  near-black basalt tint washes the rock to white — which is exactly how the
  first build looked. What sells "lit from within" is a saturated instance
  colour plus the bloom pass finding it, per chunk, in its own hue.
- ORGANIC GROUND PATCHES (`organic` 0..1 on a theme patch spec). A patch used
  to be three jittered circles; `organic` gives it 6-9 lobes crawling out to
  1.35r, so a lava lake reads as a flow that pooled rather than a stamped
  disc. THE PAINT AND THE HAZARD READ THE SAME LOBES (`patch.lobes`, used by
  both `buildOverlay` and `onPatch`) — paint one shape and burn another and
  you get fire you can stand in and ground that burns you from nowhere.
  Volcano runs 4 lava lakes at `organic: 1.0` plus a third lava lane.
- AN ARENA'S LAYOUT IS A DESIGN SYSTEM (`src/arena/designs/`, brief + research
  in `docs/ARENA_DESIGN.md`). themes.js stays the WHAT (palettes, props,
  hazards, mood); WHERE it all stands is a pluggable PLANNER: `plan(env)`
  returns an optional reworked `theme.layout` for the Terrain, building sites,
  and a per-spec prop placement map — and arena.js EXECUTES the plan through
  the exact code the fallback runs (massing, tints, `_regProp`, recipe), so a
  designed arena bakes and records identically to a scattered one. FALLBACK is
  the absence of a plan (`arenaDesignSystem()` returns null) — the original
  scatter generator survives byte-identical. Three systems ship: WARDS (Lynch
  districts: a jittered periodic ward grid with roles — dense block grids, a
  tower court, a market bazaar, yards, paved pocket plazas — over the whole
  cell so the seam ring carries city), AVENUES (axial: boulevards through the
  plaza AND along the wrap seam — the border becomes a street, continuous by
  construction — street walls, gateway towers, terminated vistas) and CIRCUIT
  (arena-shooter flow: rotationally-symmetric bastion ring with open gates,
  inner cover pods, ONE tall symmetry-break for orientation, corner clusters
  that wrap-assemble across the border). Props are arranged by SPEC SHAPE
  (count 1 = hero landmark · 2 = gateposts · 3-4 = district dressing · >=5 =
  rows/rings with authored yaw · `clump` = nests), so a new theme's palette
  lands in formations with no edit anywhere — REFINED by PLACEMENT TRAITS
  (`designs/proptraits.js`, a per-prop-NAME table of how a prop wants to
  STAND: sphinxes and idols face the focal point, gates sit ON a walkable
  lane where it crosses the plaza rim with their passage along it, street
  furniture turns square-on to the nearest road, industrial yards snap to the
  world grid, campfires and bus stops isolate, fountains take a pocket
  plaza's centre, ferns stay organic scatter). EVERY PROP'S FRONT IS +Z
  (measured off the builders — the sphinx's head, the billboard's face, the
  bandshell's mouth; gates pass through along Z; pipes are the `long:'x'`
  exception), which is what makes one yaw-rule table work for all 67 props.
  A prop absent from the table has no preferences, so the no-per-theme-edit
  property survives. Sacred pairs FLANK the gated approach symmetric about
  its axis (the ruins' sphinx pair sits either side of the great gate's
  road, both facing the fight); a gate whose spot is blocked slides ALONG
  its lane rather than stepping off it.
  A TRAIT HOLDS WHEREVER THE PROP LANDS. A spec the planner finds no room
  for falls through to arena.js' ring scatter (and every prop does under the
  `fallback` design), and the scatter used to roll a RANDOM yaw — measured on
  circuit/ruins, both sarcophagi (grid-trait) landed off-grid because
  circuit's mediums march ONE ray per placement and a road fouled it. Fixed
  twice: circuit sweeps the mid-field when its ray fails, and the scatter
  itself runs `traitYaw` per placement (sun rule first, then grid/centre/
  road; no-preference props keep the random yaw, positions untouched), so
  orientation preferences are a PLACEMENT-level guarantee in all four modes.
  `node tools/scratch/traitprobe.mjs` is the check.
  AND A FOOTPRINT KEEPS OFF THE SPAWN CLEARING (`Arena.clearOfPlaza`): every
  site validator keeps the CENTRE C+6 out, but the massing drawn on a site
  can be 46 units wide, and an iceberg's edge measured 22 units from the
  origin against frozen's 38-unit stage. Both generated paths (buildings and
  structures) now slide a site out along its own radial until the built BOX
  clears C+2 — same bearing, same cluster; authored placements are never
  touched. Worst-case edge across themes x systems after: 39.4.
  A PROP KEEPS OFF THE BUILDINGS' FOOTPRINTS, NOT THEIR CENTRES. A site
  coordinate is the MIDDLE of a massed silhouette up to 20 units across, so a
  planner holding a fixed radius from it put the ruins' sphinx pair INSIDE a
  20x20 tower (measured: gap 0.0 to the nearest building). Buildings are
  built before props are planned, so arena.js hands the planner their real
  boxes (`ctx.footprints`, read off `destructo.buildings[].aabb`) and
  `makePropOk`/`makeGateOk` reject by BOX, not by distance. A guardian also
  has to be SEEN: `sightlineClear` walks the line from the focal point and
  refuses a spot hidden behind a street wall (relaxed on a second pass rather
  than losing the pair).
  …AND THE MODEL HAS TO AGREE WITH THE YAW. A placed prop usually renders an
  imported GLB (propglb.js) turned by the prop manifest's `ry`, and
  `tools/propyaw.mjs` only aligns its LONG AXIS (mod 180) — a sphinx's long
  axis is head-to-tail, so a model can be perfectly axis-aligned and still be
  back to front. It was: the sphinx faced the fight with its haunches at a
  measured 0.0 deg of yaw error. `node tools/scratch/propfront.mjs "<url>"
  <prop>…` measures where each MODEL's mass sits high up, in the prop's own
  frame, and names the reversed ones (`sphinxStatue` 90 -> 270,
  `crystalMonolith` + 180 — fixed in the manifest, so the fallback scatter and
  the authored levels get it too). It judges only GLB-backed props: the
  PROCEDURAL builders define the convention, and the heuristic is fooled by a
  flat-topped one (the jungle idol's face is at +Z and its moss cap is the top
  third). `node tools/scratch/traitprobe.mjs
  "<battle url>"` MEASURES all of it on a built arena (facing deviation vs
  the arena centre OR the prop's own pocket plaza, gates on-lane, grid snap
  share, solo spacing) — worst facing deviation is 0.0° on ruins under all
  three systems. The `pave` patch
  kind (terrain.js) is the designed square the plaza roles paint — no hazard,
  crisp disc + rim, in the level editor palette too. BUILDING VARIETY IS
  AUDITED PER THEME (massing.js THEME_MASSING): every theme draws from >=4
  silhouette families, four grown for the audit — `court` (three wings round
  a courtyard), `ruin` (per-column ragged heights with one surviving facade
  line), `dome` (stepped circular shrink) and `silo` (a 2×2 tank battery off
  a shared base) — and a theme may name its OWN facade/roof material
  (`buildings.facadeTex`/`roofTex`, hasTex-gated so naming one before its
  images exist changes nothing; the wanted images are specced as generation
  prompts in `docs/ASSET_REQUESTS_ARENA_DESIGN.md`). JUDGE A LAYOUT FROM
  ABOVE: `?battle=<t>&design=<id>&overhead=1` parks the camera straight down
  with fog off, framing the whole cell (`overhead=2` adds the wrap neighbours
  — the continuity check).
- THE ARENA EDITOR (`/workbench/?edit=level`) EDITS THE SHIPPED ARENAS, not just blank
  canvases. Pick one of the 12 from the top-bar dropdown and it is BAKED: the
  arena is built for real, exactly as a match builds it, and every massed
  tower, every prop with its own yaw and seed, the lanes, hills, bridges,
  pools and the elevated loop come back as objects you can click. The `seed ⟳`
  button rerolls that arena's layout; `?edit=level&arena=<theme>` opens one
  directly, `&seed=<n>` picks the layout,
  …EXCEPT AN ARENA THAT HAS BEEN AUTHORED, which opens from ITS FILE
  (`config.arena.authoredLevel(id)`, derived from `AUTHORED_ARENAS`). Baking is
  how you edit a city the GENERATOR wrote; once one is hand-built, that file is
  what the game plays, and re-baking would hand the owner a procedural roll
  wearing its name — every edit made on top of the wrong city and a save
  quietly reverting the work. `fresh` is the deliberate way back to a generated
  layout: the seed ⟳ button and an explicit `&seed=` both pass it, and the seed
  box stays on screen for an authored arena precisely so ⟳ is reachable. It is
  NOT gated on `CONFIG.arenaDesign` — that setting says what a MATCH
  builds; a level file is what this tool edits either way. `&theme=<id>` still means a BLANK
  level on that theme and `&load=<name>` still edits
  `public/levels/<name>.json`. `?battle=<theme>&level=<name>` plays one.
  IT IS A WORKBENCH like the rest: it lives at `/workbench/?edit=level`, imports
  no game code, and reaches arenas / themes / props / the palette / the level
  format / the playtest hand-off through `config.arena` (contract.js documents
  it, `workbench/adapters/mechmayhem/` answers it, and the palette of placeable
  things is adapter data in `arenapalette.js`). The old game-page url
  `?edit=level` redirects here carrying `arena`/`seed`/`load`/`theme`. So the
  GAME PAGE now carries no authoring surface at all, and a `RW_DIST=1` build —
  which drops the /workbench/ page — contains none of the editor.
  `Arena` writes its `recipe` ONLY when the theme says `recordRecipe` (the
  adapter's `arena.build()` is the one caller that does): a match has no use for
  the placement list and should not be building it.
  THE BAKE READS A BUILT ARENA rather than re-running the generator: `Arena`
  writes every building and prop it places into `arena.recipe` as it places
  them (raw tint — the authored path re-applies `tintFor`), Terrain already
  keeps its lanes/hills/bridges/patches/viaduct as plain data, and
  `src/arena/bake.js` assembles the level from both. So there is no second
  copy of the generation rules to drift when the scatter is tuned. Prove the
  round trip with `node tools/arenabake.mjs` — it bakes all 12, rebuilds each
  through `themeFromLevel`, and diffs what combat can touch (chunks, props,
  hazards, every terrain feature). Note it deliberately does NOT count
  `propBodies`: a prop's collider is measured off its built bounding box and
  props swap in a generated GLB the moment one finishes streaming, so the same
  theme at the same seed already disagrees with itself by a body or two.
  Three things the format grew for this: a building may carry `cells` (an
  explicit massing silhouette) instead of nx/ny/nz, a level may carry a
  resolved `viaduct` block (`L.viaduct` is no longer forced to null, and
  `r0` pins the ramp positions), and viaduct PIERS are now placed for authored
  levels too — they are derived from the deck, so they are never recorded into
  the recipe or a bake would leave a second set behind.
  INTERACTION IS ON SCREEN, not in a panel: click to select, shift-click to
  add, shift-drag empty ground to marquee · DRAG a selected object to move it
  and the whole selection travels · ALT-drag leaves a copy behind · a small
  toolbar rides above the selection (turn / copy / delete / properties) · R
  turns the selection about its own centre. THE GIZMO IS ROTATE-ONLY — a
  translate gizmo sits exactly on top of the thing you want to grab and eats
  the drag, which is what it did. The palette is a drawer behind ＋ ADD and the
  properties panel only exists while something is selected.
  Editor: `workbench/tools/level.js`, loader + authored-placement format:
  `src/arena/level.js`.
