# Character badge-icon generation prompts

Prompts for generating EMBLEM badges with an image generator (Midjourney /
DALL-E / Ideogram / Stable Diffusion etc.). These are NOT pictures of the
mechs — each badge is a SYMBOL of that mech's power and personality, like a
faction crest the mech would wear painted on its shoulder plate.

> **State of the set: DONE — all 17 roster mechs have a badge**, declared in
> `BADGES` (`src/ui/icons.js`) with a file in `public/badges/`. This sheet is
> kept as the recipe for the next one.
>
> **The numbered key below is the ORIGINAL 16-tile grid run and does not match
> the roster.** The numbers are load-bearing for the grid prompt, so they are
> left as they were: `3 aegis` and `5 nova` are RETIRED mechs (see
> `archive/mechs/`), and **nullbot, konga and tritone** were badged later and
> never appeared in this grid. For a new badge, use the single-badge prompt
> with its own symbol concept rather than this key.

## How to use

1. Generate the full set with the **all-at-once grid prompt** below (or the
   two 8-badge half sheets if your generator muddles a 16-tile grid).
2. Slice the sheet into individual squares, downscale each to 256×256, and
   save as `public/thumbs/<id>.png` — same filenames as the rendered
   portraits, so they flow into the roster grid, player cards, results
   banner and battle HUD automatically. (Keep row-major order: the slice at
   row r, column c is badge number r*4 + c + 1.)
3. If a single badge needs a re-roll, use the **single-badge prompt** at the
   bottom with that mech's line.

## All-at-once grid prompt (one image, all 16 badges)

> A sprite sheet of 16 military-style faction badges for video game robot
> pilots, arranged in a perfect 4×4 grid of identical rounded-square tiles
> on a dark navy background (#0a121c), with even spacing and a thin glowing
> rim on every tile. Flat vector emblem style: each badge is a bold,
> centered SYMBOL — never a robot, face, or figure — in 2–3 saturated
> colors on the dark tile, clean geometric shapes, subtle inner glow,
> strong silhouette that stays readable at 64×64 pixels. No text, letters,
> numbers, or watermarks anywhere.
> The 16 badges, in reading order:
> 1. a mustard-yellow armored fist slamming down with cracked-earth impact lines and orange shockwave arcs (#bd9226, #ffa832)
> 2. a spinning six-barrel gatling muzzle seen head-on, bone-white and oxide red, orange muzzle-flash star bursting from the center (#cfc9bd, #9c2f28, #ff8c30)
> 3. a white-and-gold tower shield with a spear rising behind it, sunrise rays of light-blue dawn breaking over the shield rim (#d0d4da, #c9a542, #3f8cff)
> 4. two crossed venom-green energy daggers over a coiled serpent silhouette, deep-purple backing shapes (#5aff2e, #4a3566)
> 5. a radiant magenta star cradled inside a broken glowing halo ring, small teal sparkles orbiting it (#ff3ce8, #3e7a78)
> 6. a single massive chrome horn in profile, charging speed-lines behind it and red impact spark at its tip (#5c6066, #ff2a20)
> 7. a cyan lightning bolt twisting into a tornado spiral funnel (#3fd8ff, #2a3560)
> 8. a silver wolf's claw slash — three ragged tear-marks — across a full ice-blue moon (#b4b9c0, #6cd8ff)
> 9. an artillery shell arcing over a chess rook, dotted trajectory line, sand-tan and amber (#a08a64, #ffc23c)
> 10. one baleful red eye inside a sniper's crosshair, ragged black cloak-tatters framing the corners (#ff2030, #232228)
> 11. a roaring flame shaped like a grinning mouth, rust-red and furnace orange (#8a3626, #ff8a1e)
> 12. a jagged snowflake fused with ice crystal shards, pale ice-blue and frost white (#7ce0ff, #9fb2c2)
> 13. a rust-orange crab pincer clamped around a blue water-jet geyser column (#a64a28, #4fc3ff)
> 14. a single curved raptor sickle-claw with one red predator eye reflected in the blade, gunmetal black (#33343a, #ff2418)
> 15. a lime-green slime droplet mid-splat with two round bug-eye bubbles floating in it (#7cb420, #aef23c)
> 16. a coral-pink shrimp curled into a spiral surrounded by a swarm of tiny hopping dots, red bead accents (#b9816b, #ff2818)

## Half-sheet variants (two images of 8, if 16 muddles)

Use the same opening paragraph but change "16 military-style faction
badges ... 4×4 grid" to "8 military-style faction badges ... 4×2 grid",
then append badges 1–8 for the first sheet and 9–16 for the second.

## Single-badge re-roll prompt

> A single military-style faction badge for a video game robot pilot: a
> rounded-square tile on a dark navy background (#0a121c) with a thin
> glowing rim. Flat vector emblem style: one bold centered SYMBOL — never a
> robot, face, or figure — in 2–3 saturated colors, clean geometric shapes,
> subtle inner glow, readable at 64×64 pixels. No text or watermark.
> The symbol: {paste one numbered line from the list above}

## Badge ↔ mech key

| # | id | symbol concept |
|---|----|----------------|
| 1 | titanus | seismic fist |
| 2 | vulcan | gatling flash |
| 3 | aegis | dawn shield & spear |
| 4 | viper | crossed fang-daggers |
| 5 | nova | star in broken halo |
| 6 | rhino | charging horn |
| 7 | tempest | lightning tornado |
| 8 | fenrir | claw-torn moon |
| 9 | colossus | artillery rook |
| 10 | wraith | eye in crosshair |
| 11 | inferno | grinning flame |
| 12 | glacier | shard snowflake |
| 13 | cranky | pincer & geyser |
| 14 | saurion | sickle claw |
| 15 | frogger | slime splat eyes |
| 16 | jerry | shrimp swarm spiral |

## Notes

- Palette hexes come from `src/mechs/roster.js` (`colors.primary/accent/
  glow`) — if a mech is repainted, update its line here.
- Negative prompt if supported: `robot, mech, face, figure, character,
  text, letters, numbers, watermark, photorealistic, 3d render`.
- The rendered-portrait route stays available as the default:
  `node tools/thumbs.mjs` (dev server running) regenerates all portraits
  from the live models into the same files.
