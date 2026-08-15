# IMAGE REQUESTS — arena scenery art (12 images)

One image per arena, doing two jobs at once:

1. **The stage background for the 2D battle variant** — the scenery two mechs
   fight in front of, seen side-on. This is why it is high resolution: it is
   drawn at full screen and may be panned or pushed in on.
2. **The arena-select thumbnail** — the same image resampled down onto the
   arena cards, which today draw a procedural canvas
   (`ArenaSelect.drawArt`, `src/ui/menus.js`). The card art is **16:9**, at
   most 320 px wide on screen, and it is how a player tells thirteen arenas
   apart at a glance.

So one file has to be legible as a 4K stage AND as a 256×144 chip. That is
the whole brief, and every rule below comes from one or the other end of it.

> **Not the same as the 3D backdrops.** The 3D game's sky panoramas and
> horizon rings (`src/textures/sky/`) are a separate request, specced in
> `docs/ARENA_ASSET_PROMPTS.md`. These images are flat scenery art and are
> never sampled by the sky dome.

**Style for the whole set: realistic anime.** Anime background-painting
tradition — Shinkai / Ghibli / Kanno-school scenery — carrying real
photographic structure: correct perspective, real atmospheric depth,
physically plausible light and shadow, believable materials. Heightened,
slightly saturated colour and clean confident edges rather than photographic
grain and noise. No character line art, no cel-shaded flatness, no visible
brush texture, no illustration-of-a-photo. It is a place painted well, not a
photo with a filter.

---

## Delivery

```
public/arenas/<themeId>.png          16:9 · 7680×4320 preferred, 3840×2160 minimum
public/arenas/thumbs/<themeId>.jpg   16:9 · 512×288, a plain downsample of the above
```

`public/` because these are fetched by name at runtime, which is the rule in
`ASSETS.md` — `src/textures/` is for images the build must enumerate, and
nothing here is a PBR map. The thumbnail is shipped as its own file rather
than scaled in the browser: twelve 4K PNGs behind a card grid is tens of
megabytes to show a menu.

Theme ids: `neon foundry uptown harbor skyterrace scrapyard quarry volcano
frozen ruins jungle orbital`.

Nothing is wired yet — the arena cards keep drawing their canvas art until
the images land, and swapping the canvas for an `<img>` (canvas as the
fallback, same ladder the mech badges use in `src/ui/icons.js`) is a small
follow-up once the art exists.

---

## THE PROMPT IS THE THEME

Nothing below is invented. **Each prompt is that arena's own record in
`src/arena/themes.js`, written out as a sentence** — so the image is of the
place the game builds, not of something adjacent to it, and adding a
thirteenth theme tells you what to ask for with no art direction needed.

| Field in `themes.js` | What it becomes in the prompt |
| --- | --- |
| `name` + `desc` | the subject and the mood — the blurb is the art direction the owner already wrote |
| `sky.top` / `sky.bottom` | the zenith and horizon colours, quoted as hex |
| `fog.color` | the haze the far layer dissolves into |
| `sun.color` + `sun.pos` | the key light's colour and which side it comes from |
| `ground.color`, `layout.lanes` | what the flat ground plane across the bottom is made of (asphalt, canal, molten channel…) |
| `props[].name` | the scenery vocabulary — the nouns in the middle of the prompt |
| `buildings.tints` / `styles` | what stands at the left and right edges |
| `ambient` | what is in the air (motes, embers, snow, ash) |

The prop lists, verbatim, are the scenery each prompt draws from:

| Arena | `props` in `themes.js` |
| --- | --- |
| `neon` | toriiGate, holoGlobe, noodleKiosk, vendCluster, holoPillar, substation, billboard, streetlight, antennaTower |
| `foundry` | blastFurnace, moltenChannel, conveyor, pistonRig, chainHoist, coolantVat, smokestack, gear, pipes, fuelTank |
| `uptown` | bandshell, fountain, foodTruck, planterBench, busStop, tree, artSculpture, streetlight |
| `harbor` | gantryCrane, containerStack, trawler, buoy, boatHull, lighthouse, crane, netPile, streetlight, fuelTank |
| `skyterrace` | helipad, gondolaRig, solarArray, waterTank, hvacUnit, glassRail, antennaTower, billboard, pipes |
| `scrapyard` | buriedMechHand, carCrusher, mechWreck, crushedStack, junkPile, tireMound, magnetCrane, container, rock, pipes |
| `quarry` | headframe, crystalMonolith, crystal, drillRig, mineCart, chargeCrate, floodlightRig, conveyor, rock |
| `volcano` | basaltColumns, rockArch, lavaPool, obsidianSpikes, geyserVent, monitorStation, rock |
| `frozen` | icebreakerShip, quonsetHut, radarDome, pipelineRun, snowcat, rockArch, crystal, rock, antennaTower, fuelTank, campfire, aurora |
| `ruins` | greatGate, sphinxStatue, colonnade, palmTree, brokenStatue, obelisk, sarcophagus, ruinColumn, digCamp, campfire, rock |
| `jungle` | templeGate, stoneIdol, hangingVines, canopyTree, tree, giantFern, vineColumn, campfire, rock |
| `orbital` | shuttle, landingPad, solarWing, roboticArm, cryoTank, cargoPods, conduit, dishArray, antennaTower, billboard |

A prompt names **three or four** of them, not all of them — the ones with the
biggest silhouette, since those are what survives the shrink to card size.
The rest of the list is the reserve to swap in if a generation comes back
empty or generic.

---

## GLOBAL RULES

### It is a stage, not a landscape

- **Side-on, eye level, no tilt.** A flat-on view into the scene, camera at
  roughly a mech's chest height (~4 m). No aerial view, no worm's eye, no
  dutch angle, no fisheye. Perspective vanishing near the centre of the frame.
- **A flat ground plane runs edge to edge across the bottom.** The fighters
  stand on it, so it must be continuous, level and unobstructed from the left
  edge to the right edge. No pit, no staircase, no river cutting through the
  foreground, nothing the eye reads as something a mech would fall into.
- **The bottom ~15% is floor.** Ground surface only — asphalt, sand, deck
  plate, ice. It may carry texture and reflections; it must not carry props.
- **The middle band is where the fight happens** (roughly the vertical 15–60%
  of the frame). Keep it calm: no high-contrast clutter, no busy detail, no
  bright element that competes with two robots. Detail belongs at the sides
  and above.
- **Depth in three clear layers** — a near frame (whatever stands at the far
  left and right edges), a readable midground silhouette, and a far
  atmospheric background. Real aerial perspective between them: the far layer
  desaturated and low contrast, the near layer darkest.
- **No characters, no mechs, no robots, no people, no vehicles in motion.**
  The fighters are drawn on top; anything humanoid in the art reads as a third
  combatant.
- **No text, signage lettering, logos, watermarks, UI, frames or borders.**
  Distant neon and billboards may glow as abstract shapes and colour — no
  readable words in any language.

### It has to survive being 256 px wide

This is the badge lesson from `public/badges/README.md`, applied to scenery:
fine detail averages into mud at thumbnail size, and what survives is **big
shapes, one dominant hue, and one accent**.

- Every arena needs **one silhouette you could recognise in a squint** — the
  blast furnace, the gantry crane, the crystal spires, the planet's limb.
  Place it large, off centre, against the sky.
- **One dominant hue plus one accent**, taken from the theme's palette below.
  Twelve cards side by side must be told apart by colour alone.
- **Strong value separation between the layers.** Two similar mid-greys
  merge into one grey chip at card size.
- **Keep the hero element out of the bottom quarter.** The arena's name is
  printed over the bottom of the card under a dark scrim
  (`.arena-card .arena-name`), so anything down there is half covered.
- **Nothing critical in the last 3% at any edge** — the card clips and the
  2D stage may pan.

### The twelve must read as one set

- Same virtual camera every time: same height, same lens (~35 mm feel), same
  horizon placement (**horizon line at 45–55% of the frame height**).
- Same rendering discipline: same level of finish, same edge quality, same
  degree of colour heightening. A photoreal harbour next to a stylised jungle
  makes both look wrong.
- **Match the theme's palette.** The hexes under each arena are read from
  `src/arena/themes.js` — `sky`, `fog` and `sun` are what the 3D arena is
  actually lit with, so using them keeps the 2D variant and the 3D game
  recognisably the same place.
- **Key light from the stated direction**, with shadows on the ground
  agreeing with it.

### Standard negative prompt

> `characters, people, robots, mechs, vehicles, animals, text, letters,
> signage, logo, watermark, UI, HUD, frame, border, vignette, lens flare,
> tilted horizon, fisheye, aerial view, top-down, close-up, foreground
> clutter, obstacles in the centre, low resolution, blurry, jpeg artifacts,
> visible brush strokes, sketch, line art, cel shading, flat colours`

---

## THE TWELVE

Each entry gives the palette, the light, the one shape the thumbnail is
carrying, and the prompt. Append your generator's own quality tokens; the
style sentence at the top of each prompt is deliberately identical across all
twelve, and should stay that way.

---

### 1 · `neon` — NEON DISTRICT
*Downtown at midnight. The signs stay lit even while the towers come down.*

Sky `#04060f` → `#261344` · fog `#161030` · accents magenta `#ff4dd8` and
cyan `#53e8ff` · cool moonlight from high front-left
**Thumbnail reads as:** a black canyon of towers, magenta and cyan.

> Realistic anime background painting, cinematic side-on eye-level view, a
> rain-wet neon city street canyon at midnight, flat empty asphalt road
> running edge to edge across the bottom of the frame, dense dark
> skyscrapers rising on the left and right in near-black indigo, tangled
> magenta and cyan sign boards and holographic panels glowing along their
> faces, a monorail viaduct crossing high overhead, a torii gate silhouette
> at the mid distance, deep violet night sky #261344 above with light-
> polluted haze, wet reflections of the neon on the road, volumetric glow,
> painted with photographic depth and perspective, no characters, no text,
> 16:9, ultra high resolution

---

### 2 · `foundry` — IRONWORKS FOUNDRY
*Steam, brass and molten light. The old machine-heart of Robotworld still beats.*

Sky `#1c1008` → `#6a3210` · fog `#331d0e` · accents molten orange `#ffab60`
· warm furnace light from the left, low
**Thumbnail reads as:** a black machine hall, one orange furnace mouth.

> Realistic anime background painting, cinematic side-on eye-level view, the
> interior floor of a colossal iron foundry, flat scorched steel plate floor
> running edge to edge across the bottom of the frame, an enormous blast
> furnace on the left glowing orange from its tap hole, catwalks, chain
> hoists, ladles and riveted brass pipework filling both sides, drifting
> steam and floating sparks in the air, a molten channel of glowing metal in
> the mid distance, smoke-choked brown roof space #1c1008 opening to a dull
> orange sky #6a3210 through a broken clerestory, heavy warm rim light,
> painted with photographic depth and perspective, no characters, no text,
> 16:9, ultra high resolution

---

### 3 · `uptown` — UPTOWN PLAZA
*Glass towers, blue skies, and a city block with excellent demolition insurance.*

Sky `#2e6ec8` → `#cfe4f4` · fog `#aacadf` · accents warm sunlight `#fff3dc`
and green foliage · high midday sun from front-right
**Thumbnail reads as:** bright blue sky, clean white-glass towers.

> Realistic anime background painting, cinematic side-on eye-level view, a
> sunlit downtown plaza at midday, flat pale stone paving running edge to
> edge across the bottom of the frame, tall glass and white concrete towers
> on both sides reflecting a vivid blue sky, a curved bandshell and a
> fountain catching the light in the mid distance, street trees and planters
> along the edges, deep blue zenith #2e6ec8 fading to pale haze #cfe4f4 at
> the horizon with crisp white cumulus clouds, clean warm sunlight and long
> soft shadows across the paving, painted with photographic depth and
> perspective, no characters, no text, 16:9, ultra high resolution

---

### 4 · `harbor` — HARBOR DOCKS
*Cranes, containers, salt air — and nowhere for a 40-ton mech to hide.*

Sky `#2a1e54` → `#e66c28` · fog `#5c3a4a` · accents burnt orange, container
reds and blues · low sunset sun from the right, near the horizon
**Thumbnail reads as:** orange sunset behind black gantry cranes.

> Realistic anime background painting, cinematic side-on eye-level view, a
> container port quay at sunset, flat wet concrete dock running edge to edge
> across the bottom of the frame, stacked shipping containers in faded reds
> and blues walling the left and right, two enormous gantry cranes standing
> in near-black silhouette against the sky, a moored cargo ship and a
> lighthouse far off across flat calm water, burning orange horizon #e66c28
> under a deep violet zenith #2a1e54, long ragged sunset clouds, salt haze
> and empty air, warm rim light along every edge, painted with photographic
> depth and perspective, no characters, no text, 16:9, ultra high resolution

---

### 5 · `skyterrace` — SKY TERRACE
*A rooftop arena above the cloud deck. Mind the drop. Actually — use the drop.*

Sky `#1e58b8` → `#e8f2fc` · fog `#d4e4f4` · accents white cloud and cyan
glass · bright morning sun from front-right, high
**Thumbnail reads as:** a rooftop floating on a white cloud sea.

> Realistic anime background painting, cinematic side-on eye-level view, the
> roof deck of a supertall skyscraper above the clouds, flat grey roof
> panelling with a painted helipad circle running edge to edge across the
> bottom of the frame, glass safety railings, HVAC blocks, solar arrays and
> a slim antenna mast at the left and right edges, an endless brilliant white
> stratocumulus cloud sea stretching to the horizon beyond the rail, the tops
> of two distant towers piercing it, intense deep blue high-altitude sky
> #1e58b8 fading to #e8f2fc, thin cirrus, clean cold morning light, painted
> with photographic depth and perspective, no characters, no text, 16:9,
> ultra high resolution

---

### 6 · `scrapyard` — SCRAPYARD 7
*Where old mechs go to rest. Tonight, the scrap pile grows either way.*

Sky `#52381e` → `#c08048` · fog `#74532f` · accents rust orange and amber
dust · hazy low sun from front-left
**Thumbnail reads as:** ochre dust, a rusted junk mountain, a magnet crane.

> Realistic anime background painting, cinematic side-on eye-level view, a
> desert salvage yard in hot dusty late afternoon, flat compacted dirt ground
> running edge to edge across the bottom of the frame, mountains of crushed
> cars and rusted plate rising on the left and right, a magnet crane and a
> car crusher standing against the sky, stacked tyres and cut pipe along the
> edges, the buried rusted hand of an enormous old machine breaking the
> ground in the mid distance, thick ochre dust haze #c08048 flattening the
> distance under a brown sky #52381e, hot low sun, floating dust motes,
> painted with photographic depth and perspective, no characters, no text,
> 16:9, ultra high resolution

---

### 7 · `quarry` — CRYSTAL QUARRY
*A mining pit lined with resonant crystal. Every impact rings like a bell.*

Sky `#120e2e` → `#5a4488` · fog `#302254` · accents amethyst and cold work-
light white · violet ambient plus a hard white worklight from the left
**Thumbnail reads as:** glowing violet crystals in a black pit.

> Realistic anime background painting, cinematic side-on eye-level view, the
> floor of a terraced mining pit at night, flat pale gravel ground running
> edge to edge across the bottom of the frame, stepped rock cliff walls on
> the left and right, enormous translucent amethyst crystal shards growing
> out of the terraces and glowing softly from within, a steel headframe
> tower silhouetted against the sky, floodlight rigs throwing hard cold white
> pools across the gravel, deep indigo starry sky #120e2e with a violet glow
> #5a4488 along the rim, faint drifting mineral dust catching the light,
> painted with photographic depth and perspective, no characters, no text,
> 16:9, ultra high resolution

---

### 8 · `volcano` — VOLCANIC FORGE
*Built on a live caldera. The floor is not lava — but it is adjacent.*

Sky `#1c0d09` → `#8c2610` · fog `#3d1408` · accents lava orange `#ff8850` ·
lava glow from below plus a hot key from front-right
**Thumbnail reads as:** black basalt, red sky, lava veins.

> Realistic anime background painting, cinematic side-on eye-level view, a
> basalt shelf inside an active volcanic caldera, flat cracked black rock
> ground running edge to edge across the bottom of the frame with thin
> glowing orange lava veins threading through it, hexagonal basalt columns
> and obsidian spikes rising at the left and right, a lava pool and a steam
> vent in the mid distance, the caldera rim silhouetted beyond, churning
> black ash cloud ceiling #1c0d09 lit dull crimson #8c2610 from below,
> embers and ash drifting upward through the air, strong orange under-
> lighting on every surface, painted with photographic depth and perspective,
> no characters, no text, 16:9, ultra high resolution

---

### 9 · `frozen` — FROZEN OUTPOST
*Research station K-9. Ambient temperature: hostile. Combat temperature: worse.*

Sky `#0c1c34` → `#6690b4` · fog `#5a7c94` · accents aurora green-teal and
warm station-window amber · pale moonlight from front-right, low
**Thumbnail reads as:** green aurora over blue ice.

> Realistic anime background painting, cinematic side-on eye-level view, an
> arctic research station on a polar night, flat wind-packed snow ground
> running edge to edge across the bottom of the frame, curved quonset huts
> with warm lit windows, a white radar dome and an insulated pipeline run at
> the left and right, an icebreaker ship frozen into the pack ice and
> blue-white pressure ridges in the mid distance, vivid green and teal aurora
> curtains hanging across a steel-blue starry sky #0c1c34, pale moonlight
> haze #6690b4 along the horizon, fine drifting snow and ice crystals
> catching the light, painted with photographic depth and perspective, no
> characters, no text, 16:9, ultra high resolution

---

### 10 · `ruins` — DESERT RUINS
*An excavation site older than the war. The columns held for 3,000 years. Held.*

Sky `#5b80c4` → `#f4cd92` · fog `#dcbc8c` · accents warm sandstone gold ·
low warm sun from front-left, long shadows
**Thumbnail reads as:** gold sand, broken colonnade, a great stone gate.

> Realistic anime background painting, cinematic side-on eye-level view, an
> excavated ancient temple court in the desert at late afternoon, flat sand-
> drifted stone paving running edge to edge across the bottom of the frame, a
> ruined sandstone colonnade with broken capitals along the left, a massive
> carved gate and a sphinx statue standing at the right, weathered relief
> bands and wind erosion on every surface, dune ridges and eroded mesas
> beyond, warm gold horizon haze #f4cd92 under a dusty blue sky #5b80c4,
> long raking shadows across the paving, fine sand drifting in the air,
> painted with photographic depth and perspective, no characters, no text,
> 16:9, ultra high resolution

---

### 11 · `jungle` — JUNGLE TEMPLE
*The canopy hides an arena the old kings built. The vines will grow back. Probably.*

Sky `#1a4a3a` → `#93d098` · fog `#416f52` · accents jade green and shafts of
warm sun · diffused sun from high front-left through the canopy
**Thumbnail reads as:** deep green, a mossy stepped ziggurat.

> Realistic anime background painting, cinematic side-on eye-level view, a
> stone plaza before a jungle temple at humid midday, flat mossy flagstone
> ground running edge to edge across the bottom of the frame, a stepped
> ziggurat of dark basalt overgrown with moss and hanging vines rising in the
> mid distance, huge buttress-rooted trees and giant ferns crowding the left
> and right edges, carved idol heads half-swallowed by growth, shafts of
> diffused sunlight cutting through the canopy into drifting mist, hazy
> green-white sky #93d098 glimpsed through the leaves, deep green-teal
> ambient #1a4a3a, wet stone and humid air, painted with photographic depth
> and perspective, no characters, no text, 16:9, ultra high resolution

---

### 12 · `orbital` — ORBITAL PLATFORM
*Station VALKYRIE's landing deck. Artificial gravity, genuine consequences.*

Sky `#000308` → `#0c1830` · fog `#070c18` · accents planet-blue and hazard
amber · hard unfiltered sunlight from the right, black shadows
**Thumbnail reads as:** a metal deck, black space, a blue planet limb.

> Realistic anime background painting, cinematic side-on eye-level view, the
> open landing deck of an orbital space station, flat ribbed metal deck
> plating with painted hazard markings running edge to edge across the bottom
> of the frame, a docked shuttle, a robotic arm, cryo tanks and a huge solar
> wing framing the left and right against pure black space, a dish array and
> the far modules of the station strung out beyond, a dense sharp starfield
> and the Milky Way band, the blue illuminated limb of a planet #0c1830
> curving across the lower background with visible cloud systems and a thin
> atmospheric halo, hard unfiltered sunlight with pitch black shadows, no
> atmospheric haze, painted with photographic depth and perspective, no
> characters, no text, 16:9, ultra high resolution

---

## Checking one before you generate the other eleven

1. **The shrink test, first, every time.** Scale the image to **256×144** and
   look at it beside the other cards. If you cannot say which arena it is, the
   composition is wrong — no amount of 4K detail fixes it. This is the one
   check that catches the most common failure: a beautifully rendered scene
   that averages to a brown-grey rectangle.
2. **The stage test.** Put two 4-metre-tall boxes on the ground plane, one at
   each third of the width. They must sit on continuous flat ground, and the
   art behind them must not be busier than they are.
3. **The set test.** Lay all twelve thumbnails out at card size on a dark
   background. Any two that read as the same colour need one of them pushed
   toward its accent hue.
4. **The name band.** Check the bottom quarter under a dark gradient scrim —
   that is where the arena's title prints on the card.

Style-locking helps more than prompt length: generate one arena first, agree
it, and use it as the style reference for the remaining eleven so the set
holds together.
