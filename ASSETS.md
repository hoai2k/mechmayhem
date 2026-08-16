# WHERE ASSETS LIVE

Two directories hold shipped content, and which one an asset belongs in is
not a matter of taste — it follows from **how the code finds it**:

> **`src/` when the code must ENUMERATE it at build time.
> `public/` when the code FETCHES it by name at runtime.**

That is the whole rule. Everything below is it applied.

## `src/` — enumerated at build time

| path | what | how it is found |
|------|------|-----------------|
| `src/textures/<set>/<name>/` | the PBR texture pack — `<name>_albedo.png`, `_normal`, `_rough`, optional `_metal` / `_emissive` | `import.meta.glob` in `src/core/texload.js` |
| `src/textures/sprite/` | hand-made VFX sprite overrides + `manifest.json` | globbed + the manifest imported (`src/combat/effects.js`) |
| `src/music/`, `src/music/arenas/` | the battle soundtrack | the `rw-music` Vite plugin lists them and copies to `dist/music/` (streamed, not bundled) |

**Why the texture pack is here and not in `public/`.** `hasTex(set, name)`
has to answer **synchronously**: `arena.js` decides a building's material
inline while it builds, and `pbrtex` does the same for every mech skin. A
build-time glob gives that for free and needs no index file to maintain —
drop the folder in and it is picked up. Serving the pack from `public/`
would mean either an async preload before anything builds or a hand-kept
manifest, for no benefit.

**Sets in use:** `sky` (`sky_<theme>`, `horizon_<theme>`) · `ground`
(`ground_<theme>_<material>`) · `building` (`bldg_*`) · `struct` (`struct_*`,
the large-structure materials) · `prop` (`prop_*`) · `mech` (`mech_*`) ·
`sprite` (flat files, not the `<name>/<name>_albedo` shape).

## `public/` — fetched by name at runtime

| path | what | how it is found |
|------|------|-----------------|
| `public/models/` | mech, prop and building GLBs | `fetch` + `manifest.json` per family |
| `public/models/source/` | pre-bake archives of edited GLBs + `<id>.edits.json` | never loaded; the record of what a bake folded in |
| `public/levels/` | authored arena levels | `fetch('levels/<name>.json')` |
| `public/badges/` | hand-made mech emblems | `<img src="badges/<id>.png">` |
| `public/thumbs/` | auto-captured mech icons (`tools/thumbs.mjs`) | `<img>` fallback under badges |
| `public/posters/` | mech-select posters + `posters.json` (`tools/posters.mjs`) | `<img>` / fetch |
| `public/arenas/` | painted arena-select card art (`<id>.jpg`) | `<img src="arenas/<id>.jpg">` |
| `public/sfx/` | the recorded sound effects + arena ambience beds + `manifest.json` (`tools/sfxgen.mjs`) | manifest fetched in the background, each file decoded on first use |
| `public/sound/` | the menu theme and the neon buzz | `<audio>` by URL |

These share a shape: a TOOL or the owner drops a file in, it is addressed by
identity (`<id>.png`, `<name>.json`), and several carry their own manifest.
None of them needs the code to know the full set up front.

## If you are adding art

- **A texture goes in `src/textures/`.** `public/textures/` is not read —
  images there are silently ignored and the game renders its procedural
  fallback. `node tools/assetcheck.mjs` fails on anything stranded there.
- **Names the game declares are checked out loud.** `src/core/assetcheck.js`
  runs at boot and `console.error`s any texture a theme or structure kind
  names that has no images behind it. Art that has been *requested but not
  delivered* is listed in `PENDING_ASSETS` there — remove an entry when the
  images land, and the check starts guarding it. If a pending entry turns up
  anyway, that is reported too, so the list cannot rot.
- **Generation prompts** live in `docs/TEXTURE_GEN_PROMPT.md` (the original
  pack) and `docs/ASSET_REQUESTS_*.md` (later requests). They all name
  `src/textures/...` paths.

## If you are adding a sound

A recording in `public/sfx/<name>.mp3` **shadows** the synthesized sound of the
same name — `play('<name>')` is the only call site either way, and a name with
no file keeps its synth version forever. That is what lets the set grow one
sound at a time. The prompts are `docs/SOUND_PROMPTS.md`, and that document is
the *input*: `node tools/sfxgen.mjs` parses each entry's prompt, take count and
duration out of its own prose, so there is no second copy to drift.

## Check it

```
node tools/assetcheck.mjs      # strays, missing declared textures, stale pending list
node tools/iconcheck.mjs       # badges vs thumbs vs the BADGES declaration
```
