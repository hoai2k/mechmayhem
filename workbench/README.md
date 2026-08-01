# The workbenches

Model- and level-authoring tools, on their own page, for a game they only know
through a config object. Nothing here ships with the game: a `RW_DIST=1` build
(tools/dist.mjs) drops this whole page from the build inputs.

```
/workbench/?edit=animation&mech=colossus   GLB vs procedural, trigger moves, anchors
/workbench/?edit=pose&mech=colossus        pose joints, edit clip keyframes,
                                           scrub the generated walk/run
/workbench/?edit=gait&mech=viper           TUNE that walk/run: the gait's dials
/workbench/?edit=skin&mech=colossus        bone-island skin repair
/workbench/?edit=skindebug&mech=jerry      audit every clip for torn/stretched skin
/workbench/?edit=rig&mech=colossus         hand-place a skeleton
/workbench/?edit=collider&mech=colossus    what combat actually hits
/workbench/?edit=props&prop=toriiGate      arena props: original vs optimized
/workbench/?edit=level&arena=neon         THE ARENA EDITOR: bake one of the 12
                                          shipped arenas and move what's in it

The chevron beside the panel title switches between them, carrying the current
mech across. `?edit=hurtbox` is the collider tool's old name and still resolves.
A bare /workbench/ (or an unknown ?edit=) lands on the front page — a card per
tool with a live screenshot (landing.js; re-shoot: node tools/wbthumbs.mjs,
optionally naming just the tools to re-shoot).
```

`&variant=alt` (or the legacy `&alt=1`) opens a mech's alternate build;
`&model=proc` opens the procedural body where a tool offers one, and
`&model=mannequin` (gait, pose) or `&ref=mannequin` (skin) opens the REFERENCE
HUMANOID instead — same 15 joints, one colour per bone, a foot you can read.
The rig editor ghosts the same body over the model it is rigging, with every
joint labelled, from its `Mannequin reference` box. `&mech=mannequin` opens the
reference body as the SUBJECT — it is listed at the bottom of every picker,
under the rule with the work-in-progress mechs. The old URLs
(`?debug=skin`, `?rigedit=<id>`, …) redirect here with their params carried
over, so existing links, bookmarks and the `tools/*.mjs` scripts keep working.

## Layout

```
workbench/
  index.html          the page (its own Vite entry)
  main.js             router: ?edit=<tool>
  config/contract.js  WHAT A GAME MUST PROVIDE — the whole surface, documented
  adapters/
    robotworld/       the only place under workbench/ that imports from src/
    actionchars.js    robotworld's move descriptions
    robotworld/arenapalette.js  what this game lets you place in an arena
    anchoruses.js     robotworld's "what does this anchor drive"
    mechclips.js      robotworld's per-mech clip list
  tools/              the nine workbenches — no game imports at all
    level.js          the ARENA editor: everything about places arrives as
                      config.arena, so the tool itself knows no theme, no prop
                      and no level format
    stretchscan.js    the skin-deformation maths ?edit=skindebug measures with
  ui/                 shared chrome: panel, subject picker, variant picker, save
    mobile.js         the small-touch-screen layout (see below)
```

## On a phone

`ui/mobile.js` inverts the layout when — and only when — the pointer is coarse
AND the viewport is narrow (`?mobile=1` forces it on from a desktop browser for
testing, `?mobile=0` / `?desktop` off). A desktop window dragged narrow, or a
touchscreen laptop, keeps the normal panel: both halves of the test must pass.

When it is on, the model gets the screen: a slim bar across the top carries the
SUBJECT picker (the tool's own `<select>`, moved — not a copy, so there is one
piece of state) plus the one control that tool is about, and a ⚙ button raises
the ENTIRE panel as a bottom sheet — every dial the desktop has, nothing
removed, dismissed with Done, the scrim or Esc. Camera gestures are
OrbitControls' own: one finger rotates, two pan and pinch-zoom.

Wired into `?edit=animation` (bar control: the action to trigger, as a dropdown
in place of the nine-button grid) and `?edit=gait` (bar control: the throttle).
Adding it to another tool is one call plus whatever element belongs in the bar.

## The deal

**A subject need not be game content.** `catalogue.list()` includes the
mannequin, flagged `hidden` (bottom of the picker) and `reference` (not a mech).
`catalogue.reference()` declares which ids those are, so `tools/wbconfig.mjs`
can still prove the catalogue matches the game's roster, the action workbench can
leave it out (it drives the real fighter state machine) and the writing tools can
refuse to save over it. Nothing in `src/game/` knows it exists.

**A reference is a capability too.** `config.reference.mannequin(height)` hands
back a canonically proportioned humanoid on the same rig, and
`config.reference.labels(model)` names its joints on screen. That is what lets
the rig editor answer "where does the ankle bone go" without the tool knowing
anything about anatomy — and `variants.build/raw(id, {variant:'mannequin'})`
lets the other three swap the subject for it outright. A game with no reference
body leaves the section out and the boxes aren't offered.

**Not every subject is a model, either.** `?edit=gait` edits the LOCOMOTION —
a named bundle of numbers (`src/mechs/gaits.js`) that several mechs share, not
anything belonging to the mech on screen. That is why its edits follow the GAIT
when you switch mech, why the picker names each mech's gait, and why its output
is a table block rather than a per-mech patch. It reads a `gait` section of the
contract (ids / users / schema / evaluate / install / topSpeed); a game whose
characters have no parameterised locomotion leaves it out and the tool is not
offered.

That sharing is also why the panel has to work out WHICH DIALS APPLY HERE. One
table, several bodies, and layers that overwrite each other: the quadruped's
gallop replaces both arms outright at speed, so the arm rows cannot move that
mech at all while they are live on the next one. The tool never gets told —
`evaluate` is pure and cheap, so it SWEEPS each dial across its range at this
subject's own numbers and hides the ones that change no joint anywhere in the
cycle. A new dial, a new layer or a new subject is picked up by the same
measurement with nothing to update here.

**Not every subject is a character.** `?edit=props` edits nothing — it JUDGES:
the imported arena prop models were dieted (tools/propopt.mjs) and the tool
stands each original beside its optimized model in twin viewports that share
one camera, so a size change cannot hide behind per-side framing. It reads a
`props` section of the contract (list / load / url / entry), which the
robotworld adapter derives from the live prop table, the prop manifest and the
themes. A game without scenery leaves the section out and the tool is not
offered.

**Tools know a config, not a game.** Nothing in `tools/` imports from `src/`.
They read `config.catalogue.list()`, `config.variants.build(id, …)`,
`config.anim.clipsFor(id)`, `config.skin.analyze(mesh)` and so on. Porting the
workbenches to another game is writing a second adapter, not editing six
tools.

**The adapter derives, it never copies.** Every list is a function, and
robotworld's adapter answers each by reading the live roster, clip table, joint
order, rig registry and model manifest. Add a mech or a clip to the game and it
is in the workbenches on the next reload with no edit here. `node
tools/wbconfig.mjs` proves that — it compares what the config reports against
the game's own sources and fails on any drift.

**Vocabulary is data.** This game calls its models *mechs* and offers a
hand-sculpted *procedural* body beside the imported GLB. Both are choices, so
they live in `config.vocab` and `config.variants`, not in the tools' strings.

**The contract is capabilities, not data alone.** The tools do not just list
things — they build a model, play a clip, re-skin a mesh, measure hit volumes,
run the game's own action state machine. So the config hands over functions
(`stage.engine()`, `stage.actor()`, `rig.custom.apply()`, `hurtbox.build()`)
rather than pretending a pile of JSON is enough. An adapter that has no
equivalent for a section leaves it out and the matching tool degrades — no
anchors, no anchor editor.

## Adding a game

1. Write `adapters/<game>/index.js` that calls `defineWorkbenchConfig({…})`
   from `config/contract.js`. The validator fails loudly on a half-filled one.
2. Point `main.js` at it (today it loads robotworld directly; a second game
   would pick by `?game=` or by build).
3. Anything the contract cannot express yet is a gap in the contract — add it
   there, with a comment saying what it means, rather than reaching into a
   tool.

**A workbench can JUDGE as well as EDIT.** `?edit=skindebug` writes nothing: it
poses a mech through every clip it can play, measures each triangle edge whose
ends are weighted differently, and ranks the places where the skin stretches,
collapses or tears open. A finding is a PLACE ON THE MODEL, not a place in a
clip — the same stray weights fail in every animation that moves that bone, so
spots that touch on the mesh are merged and each finding carries the list of
clips it fails in. The fix belongs next door, so the panel links straight into
the skin workbench (with the failing island selected), the rig editor, or the
pose workbench (on that clip, at that frame). `config.reload()` — the "load from
manifest" button — is what lets it pick up a save made in the other tab.

## Getting an edit out

Nothing here writes to the repo. Each tool EXPORTS its edit as text — the skin
workbench a `skinOps` manifest patch, the rig editor its `bones` array and (in
JOINT OFFSET mode) a `boneCorrections` patch — and a human or an agent applies
it, with `tools/manifestfmt.mjs` / `tools/rigfmt.mjs` doing the splice so the
diff stays small and the file's own comments survive. Work in progress persists
as a localStorage draft, so a reload keeps it.

There was a save path once (`POST /__rw/manifest`, `/__rw/rig` in
`vite.config.js`, plus an "Export uncommitted saves" button that handed the batch
over as one git patch). It was removed: a write you cannot see is a write you
cannot trust.
