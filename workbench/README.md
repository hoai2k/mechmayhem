# The workbenches

Model-authoring tools, on their own page, for a game they only know through a
config object.

```
/workbench/?edit=animation&mech=colossus   GLB vs procedural, trigger moves, anchors
/workbench/?edit=pose&mech=colossus        pose joints, edit clip keyframes
/workbench/?edit=skin&mech=colossus        bone-island skin repair
/workbench/?edit=rig&mech=colossus         hand-place a skeleton
/workbench/?edit=collider&mech=colossus    what combat actually hits
/workbench/?edit=props&prop=toriiGate      arena props: original vs optimized

The chevron beside the panel title switches between them, carrying the current
mech across. `?edit=hurtbox` is the collider tool's old name and still resolves.
A bare /workbench/ (or an unknown ?edit=) lands on the front page — a card per
tool with a live screenshot (landing.js; re-shoot: node tools/wbthumbs.mjs).
```

`&variant=alt` (or the legacy `&alt=1`) opens a mech's alternate build;
`&model=proc` opens the procedural body where a tool offers one. The old URLs
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
    anchoruses.js     robotworld's "what does this anchor drive"
    mechclips.js      robotworld's per-mech clip list
  tools/              the six workbenches — no game imports at all
  ui/                 shared chrome: panel, subject picker, variant picker, save
```

## The deal

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

## Saving

`?edit=skin` and `?edit=rig` write to the repo through the dev server
(`/__rw/manifest`, `/__rw/rig` in `vite.config.js`) — see the house rules in
CLAUDE.md. Both splice rather than rewrite, and **Export uncommitted saves**
hands the whole batch over as one `git apply`-able patch.
