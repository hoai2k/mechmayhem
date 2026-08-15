# IMAGE REQUESTS — realistic backgrounds for the 12 arenas

What a player sees BEHIND an arena is two images per theme, and nothing else:

1. **The sky panorama** — `sky_<themeId>`, a 360° equirectangular sky mapped
   onto the sky dome and sampled analytically from the view direction
   (`makeSkyDome` in `src/arena/arena.js`). It is the whole upper hemisphere.
2. **The horizon strip** — `horizon_<themeId>`, the distant scenery
   silhouette (skyline, mountains, ice shelf…) wrapped on a huge camera-locked
   ring just inside the sky. It is what stands between the sky and the fog
   wall at the end of the streets.

Both already ship at 4096×2048 / 4096×512 (see `src/textures/sky/`). **This
document requests a REPLACEMENT set at photographic quality** — the current
pack reads as illustration, and the mechs, props and building facades are
photoreal. Deliver whichever ones you want; each file swaps in on its own,
and anything not delivered keeps the image that is there today.

> Anything missing falls back further still: no `sky_<id>` and the dome
> renders the theme's two-colour gradient (plus a star sprite for the night
> themes); no `horizon_<id>` and the arena builds 40 fog-coloured boxes as a
> stand-in skyline. Nothing breaks, it just gets cheaper-looking.

---

## Where the files go

```
src/textures/sky/sky_<themeId>/sky_<themeId>_albedo.png          4096×2048  (8192×4096 accepted)
src/textures/sky/horizon_<themeId>/horizon_<themeId>_albedo.png  4096×512   (8192×1024 accepted)
```

`src/textures/` — **not** `public/textures/`, which is never read (ASSETS.md).
The loader globs the folder; nothing needs registering. `_albedo` is the only
map either layer uses — a sky needs no normal, rough or metal, and any extra
maps delivered alongside are ignored.

Theme ids: `neon foundry uptown harbor skyterrace scrapyard quarry volcano
frozen ruins jungle orbital`.

---

## GLOBAL RULES

These come from the two shaders that sample the images, so they are hard
constraints, not taste.

### Both layers

- **Photoreal.** Real photographic sky: physically plausible cloud
  structure, real atmospheric scattering, real haze gradient into the
  horizon. No painterly brushwork, no illustration, no cel shading, no
  posterized bands.
- **Horizontally seamless.** The left and right edges meet. A visible vertical
  seam is a bright line hanging in the sky over the arena.
- **No sun disc, no lens flare, no bloom, no vignette, no watermark, no
  text or signage.** The engine has its own sun, its own bloom pass and its
  own exposure; a baked flare double-exposes and a baked vignette darkens one
  side of the arena for no reason.
- **Mid-exposure, nothing clipped.** Highlights under ~0.9 and shadows above
  ~0.03 in the delivered file. The tone map runs afterwards at the theme's own
  exposure (1.06–1.2), so a pre-crushed image has nothing left to grade.
- **Match the theme's palette** (hex values are listed per theme below, read
  from `src/arena/themes.js`). `sky.top` is the zenith, `sky.bottom` is the
  colour at the horizon, `fog.color` is the haze the arena's far end dissolves
  into. Landing near those three keeps the backdrop and the lit stage in the
  same photograph.

### Sky panorama specifically

- **2:1 equirectangular**, the standard projection: u wraps 360° of heading,
  v maps −90°→+90° of elevation. Straight lines through the poles, no
  fisheye, no cubemap cross, no "panorama of a scene" with ground in it.
- **The bottom half of the image is never rendered.** The dome blends the
  panorama in from elevation ≈ −1° and it fully owns the sky from ≈ +8°
  upward — i.e. from row **933** of 2048 (measured from the top) upward. Rows
  933–1024 cross-fade into the theme's fog colour, and everything below row
  1024 is discarded. So: **no ground, no terrain, no cityscape in the
  panorama** — that is the horizon strip's job — and the last visible band
  should be plain atmospheric haze in `fog.color`, so the fade is invisible.
- **The zenith must survive the projection.** Equirect stretches the top row
  across the whole sky; a cloud placed at the very top smears into a pinwheel.
  Keep the top ~5% (rows 0–100) close to a flat `sky.top` gradient.
- **Put the brightest part of the sky where the sun actually is.** Each theme
  below gives the pixel column and row for its light, computed from the
  theme's own `sun.pos` through the dome's projection. There is no disc, but
  the bright haze, the cloud lighting and the shadow sides of the clouds
  should all agree with that point.

### Horizon strip specifically

- **Transparent above the scenery line** (real alpha, not black, not sky
  colour — the strip is drawn unlit over the panorama).
- **The strip is tiled 3× around the ring**, so one image spans 120° of the
  horizon and the player sees three copies of it. Make it a CONTINUOUS band of
  distant scenery with no hero landmark that will read as triplets. One
  lighthouse in the harbor strip is three lighthouses in the arena.
- **Keep everything inside the bottom 55%** — rows 282–512 of a 512-tall
  strip. Above that the geometry's own alpha ramp fades the strip out to
  nothing at its rim, so a tall tower drawn near the top row dissolves halfway
  up.
- **The bottom edge must be opaque haze** in the theme's `fog.color`, so the
  strip's base sinks into the fog wall rather than ending on a cut line.
- **It is distance, not detail.** Real aerial perspective: the scenery is
  kilometres away, desaturated toward `fog.color`, low contrast, softened.
  Legible windows and panel lines belong on the buildings the player can
  actually punch.

---

## THE TWELVE

Each theme gives its palette, its sun placement in the panorama, and two
prompts. Prompts are written for a photographic generator; append your
pipeline's own quality tokens as usual.

Standard negative prompt for every sky, and worth restating per generation:

> `illustration, painting, cartoon, anime, cel shading, sun disc, lens flare,
> bloom, vignette, watermark, text, logo, ground, terrain, buildings,
> horizon line, people, birds, tilted horizon, seam, banding`

Standard negative prompt for every horizon strip:

> `illustration, painting, cartoon, sky gradient background, opaque sky, sun
> disc, lens flare, watermark, text, foreground detail, close-up, people,
> perspective distortion, seam`

---

### 1 · `neon` — NEON DISTRICT
*Downtown at midnight. The signs stay lit even while the towers come down.*

Zenith `#04060f` · horizon `#261344` · fog `#161030` · sun `#9fb4ff` from
**x 1628 / y 331** (heading 39.8%, elevation 61°) · stars: yes

**sky_neon**
> Photorealistic 360 equirectangular night sky panorama over a dense city,
> near-black indigo zenith #04060f softening to deep violet #261344 at the
> horizon, thin high altostratus cloud sheets lit from beneath by magenta and
> cyan city glow, faint sparse stars visible in the clear gaps overhead, cool
> moonlight from upper left, heavy urban light pollution haze along the last
> band above the horizon, long-exposure night photography, no ground, no sun,
> seamless left-right, 4096x2048

**horizon_neon**
> Photorealistic distant night-city skyline band, kilometres away, dense
> irregular skyscrapers in dark blue-violet silhouette with thousands of tiny
> scattered lit windows and a few blurred magenta and cyan rooftop signs,
> strong aerial perspective, low contrast, smog glow rising from the base,
> transparent above the roofline, opaque violet haze along the bottom edge,
> horizontally seamless tiling strip, 4096x512

---

### 2 · `foundry` — IRONWORKS FOUNDRY
*Steam, brass and molten light. The old machine-heart of Robotworld still beats.*

Zenith `#1c1008` · horizon `#6a3210` · fog `#331d0e` · sun `#ffab60` from
**x 3656 / y 482** (heading 89.3%, elevation 48°)

**sky_foundry**
> Photorealistic 360 equirectangular sky panorama at industrial dusk, smoke-
> choked brown-black zenith #1c1008 grading to a dirty orange #6a3210 near the
> horizon, layered smog and particulate bands, low cloud bellies lit dull
> orange from furnaces below, real airborne soot haze, heavily polluted air,
> documentary photography, no ground, no sun disc, seamless left-right,
> 4096x2048

**horizon_foundry**
> Photorealistic distant heavy-industry horizon band, blast furnaces, tall
> chimneys with drifting smoke plumes, gasometers and gantry frames in dark
> brown silhouette backlit by orange furnace glow, kilometres away, soot haze,
> low contrast, transparent above the skyline, opaque brown haze at the bottom
> edge, horizontally seamless tiling strip, 4096x512

---

### 3 · `uptown` — UPTOWN PLAZA
*Glass towers, blue skies, and a city block with excellent demolition insurance.*

Zenith `#2e6ec8` · horizon `#cfe4f4` · fog `#aacadf` · sun `#fff3dc` from
**x 2431 / y 407** (heading 59.4%, elevation 54°)

**sky_uptown**
> Photorealistic 360 equirectangular midday summer sky panorama, deep clean
> blue zenith #2e6ec8 fading to pale warm haze #cfe4f4 at the horizon, crisp
> white cumulus clouds with well-defined shaded undersides scattered across
> the middle band, thin cirrus higher up, brilliant clear-air visibility, high
> dynamic range daylight photography, no ground, no sun disc, seamless
> left-right, 4096x2048

**horizon_uptown**
> Photorealistic distant modern city skyline band in bright daylight, glass
> and concrete towers fading into pale blue atmospheric haze, a few tower
> cranes, kilometres away, very low contrast aerial perspective, transparent
> above the roofline, opaque pale blue haze at the bottom edge, horizontally
> seamless tiling strip, 4096x512

---

### 4 · `harbor` — HARBOR DOCKS
*Cranes, containers, salt air — and nowhere for a 40-ton mech to hide.*

Zenith `#2a1e54` · horizon `#e66c28` · fog `#5c3a4a` · sun `#ffa050` from
**x 3691 / y 772** (heading 90.1%, elevation 22°)

**sky_harbor**
> Photorealistic 360 equirectangular coastal sunset sky panorama, deep violet
> zenith #2a1e54 descending through magenta into a burning orange #e66c28
> band at the horizon, long ragged altocumulus streaks lit hot along their
> undersides in the west and cool violet on the opposite side, humid sea haze,
> golden hour landscape photography, no ground, no sun disc, no lens flare,
> seamless left-right, 4096x2048

**horizon_harbor**
> Photorealistic distant port horizon band at sunset, container gantry cranes,
> moored cargo ships, dockside warehouses and fuel tanks in near-black purple
> silhouette against orange sky glow, flat calm water line at the base,
> kilometres away, sea haze, transparent above the silhouette, opaque warm
> haze at the bottom edge, horizontally seamless tiling strip, 4096x512

---

### 5 · `skyterrace` — SKY TERRACE
*A rooftop arena above the cloud deck. Mind the drop. Actually — use the drop.*

Zenith `#1e58b8` · horizon `#e8f2fc` · fog `#d4e4f4` · sun `#fff8e4` from
**x 2688 / y 378** (heading 65.6%, elevation 57°)

**sky_skyterrace**
> Photorealistic 360 equirectangular sky panorama shot from high altitude
> above a cloud deck, intense deep blue zenith #1e58b8 typical of thin air,
> thin wispy cirrus high up, a brilliant white rolling stratocumulus sea
> filling the lowest visible band #e8f2fc, morning light raking across the
> cloud tops, aerial photography from 10000 metres, no ground, no aircraft, no
> sun disc, seamless left-right, 4096x2048

**horizon_skyterrace**
> Photorealistic distant horizon band of a white cloud sea, the upper storeys
> of three or four supertall skyscrapers piercing the cloud tops far away,
> soft morning light, heavy aerial haze, very low contrast, transparent above
> the cloud line, opaque white-blue haze at the bottom edge, horizontally
> seamless tiling strip, 4096x512

---

### 6 · `scrapyard` — SCRAPYARD 7
*Where old mechs go to rest. Tonight, the scrap pile grows either way.*

Zenith `#52381e` · horizon `#c08048` · fog `#74532f` · sun `#ffc584` from
**x 1784 / y 589** (heading 43.6%, elevation 38°)

**sky_scrapyard**
> Photorealistic 360 equirectangular sky panorama over a desert junkyard on a
> hot late afternoon, dust-loaded brown zenith #52381e washing down to an
> ochre-amber #c08048 near the horizon, suspended dust haze flattening all
> contrast, a few ragged thin clouds barely visible through it, harsh dry
> light, documentary photography in a dust storm's aftermath, no ground, no
> sun disc, seamless left-right, 4096x2048

**horizon_scrapyard**
> Photorealistic distant horizon band of a vast salvage yard, low mounds of
> crushed vehicles and scrap, a few gantry and magnet cranes, flat desert
> mesas beyond, all dissolving into thick ochre dust haze, kilometres away,
> very low contrast, transparent above the skyline, opaque dusty amber haze at
> the bottom edge, horizontally seamless tiling strip, 4096x512

---

### 7 · `quarry` — CRYSTAL QUARRY
*A mining pit lined with resonant crystal. Every impact rings like a bell.*

Zenith `#120e2e` · horizon `#5a4488` · fog `#302254` · sun `#baa2ff` from
**x 3511 / y 440** (heading 85.7%, elevation 51°) · stars: yes

**sky_quarry**
> Photorealistic 360 equirectangular night sky panorama with an otherworldly
> cast, near-black indigo zenith #120e2e, dense sharp starfield, faint violet
> nebular gas wisps threaded through the upper sky, a soft amethyst #5a4488
> glow along the horizon band as if lit from below, clear dry high-altitude
> air, long-exposure astrophotography, no ground, no moon, no sun, seamless
> left-right, 4096x2048

**horizon_quarry**
> Photorealistic distant horizon band of a mining escarpment at night, terraced
> rock cliffs and spoil heaps in deep violet silhouette, scattered small cold
> work-lights, a faint violet mineral shimmer along the ridge, kilometres away,
> low contrast night haze, transparent above the ridgeline, opaque violet haze
> at the bottom edge, horizontally seamless tiling strip, 4096x512

---

### 8 · `volcano` — VOLCANIC FORGE
*Built on a live caldera. The floor is not lava — but it is adjacent.*

Zenith `#1c0d09` · horizon `#8c2610` · fog `#3d1408` · sun `#ff8850` from
**x 2400 / y 502** (heading 58.6%, elevation 46°)

**sky_volcano**
> Photorealistic 360 equirectangular sky panorama over an erupting caldera at
> night, black-brown ash cloud ceiling #1c0d09 churning overhead, dense
> billowing ash columns lit dull crimson #8c2610 from beneath by lava, glowing
> ember-lit cloud bellies near the horizon, one distant fork of volcanic
> lightning inside the ash, thick particulate air, volcanic eruption
> photography, no ground, no sun, seamless left-right, 4096x2048

**horizon_volcano**
> Photorealistic distant horizon band of a volcanic caldera rim, jagged basalt
> ridges and cinder cones in near-black silhouette, glowing orange lava fissure
> lines threading along their base, steam and ash plumes rising, kilometres
> away, ember-lit haze, transparent above the ridgeline, opaque dark red haze
> at the bottom edge, horizontally seamless tiling strip, 4096x512

---

### 9 · `frozen` — FROZEN OUTPOST
*Research station K-9. Ambient temperature: hostile. Combat temperature: worse.*

Zenith `#0c1c34` · horizon `#6690b4` · fog `#5a7c94` · sun `#bcdcff` from
**x 2619 / y 683** (heading 63.9%, elevation 30°) · stars: yes

**sky_frozen**
> Photorealistic 360 equirectangular polar night sky panorama, steel-blue
> zenith #0c1c34 with a sharp cold starfield, vivid green and teal aurora
> curtains hanging in vertical folds across a third of the sky with real
> filamentary structure, pale blue moonlight haze #6690b4 along the horizon
> band, ice crystals in the air, long-exposure arctic photography, no ground,
> no sun, seamless left-right, 4096x2048

**horizon_frozen**
> Photorealistic distant horizon band of an antarctic ice shelf, low blue-white
> ice cliffs, drifting snow, distant jagged nunatak peaks, faint aurora light
> on the snow, kilometres away, ice fog flattening the contrast, transparent
> above the ice line, opaque pale blue haze at the bottom edge, horizontally
> seamless tiling strip, 4096x512

---

### 10 · `ruins` — DESERT RUINS
*An excavation site older than the war. The columns held for 3,000 years. Held.*

Zenith `#5b80c4` · horizon `#f4cd92` · fog `#dcbc8c` · sun `#fff0cc` from
**x 3793 / y 454** (heading 92.6%, elevation 50°)

**sky_ruins**
> Photorealistic 360 equirectangular desert sky panorama in late afternoon,
> dusty blue zenith #5b80c4 grading through cream into a warm gold #f4cd92 at
> the horizon, almost cloudless with only a few thin torn cirrus, visible heat
> shimmer and fine sand haze thickening toward the horizon band, dry brilliant
> light, large-format landscape photography, no ground, no sun disc, seamless
> left-right, 4096x2048

**horizon_ruins**
> Photorealistic distant horizon band of a desert basin, low eroded sandstone
> mesas and dune ridges, a hint of ruined colonnades far off, kilometres away,
> bleached by heat haze into pale gold, very low contrast, transparent above
> the mesa line, opaque warm sand haze at the bottom edge, horizontally
> seamless tiling strip, 4096x512

---

### 11 · `jungle` — JUNGLE TEMPLE
*The canopy hides an arena the old kings built. The vines will grow back. Probably.*

Zenith `#1a4a3a` · horizon `#93d098` · fog `#416f52` · sun `#eaffd2` from
**x 1536 / y 365** (heading 37.5%, elevation 58°)

**sky_jungle**
> Photorealistic 360 equirectangular tropical sky panorama at humid midday,
> hazy green-tinted white sky, deep green-teal cast #1a4a3a overhead from light
> bouncing off the canopy, towering soft cumulus congestus building on the
> horizon in pale green-white #93d098, thick water vapour blowing out the
> contrast, diffused glare, rainforest photography, no ground, no canopy, no
> sun disc, seamless left-right, 4096x2048

**horizon_jungle**
> Photorealistic distant horizon band of an unbroken rainforest canopy over
> rolling hills, dark green treetops fading into pale green mist, thin mist
> layers caught between the ridges, one weathered stone temple roof just
> breaking the canopy far away, kilometres away, very low contrast, transparent
> above the treeline, opaque green-grey haze at the bottom edge, horizontally
> seamless tiling strip, 4096x512

---

### 12 · `orbital` — ORBITAL PLATFORM
*Station VALKYRIE's landing deck. Artificial gravity, genuine consequences.*

Zenith `#000308` · horizon `#0c1830` · fog `#070c18` · sun `#eaf2ff` from
**x 2467 / y 775** (heading 60.2%, elevation 22°) · stars: yes

**sky_orbital**
> Photorealistic 360 equirectangular space panorama from low orbit, pure black
> sky #000308, dense sharp starfield with realistic magnitude and colour
> variation, the Milky Way band crossing at an angle with dust lanes, the blue
> illuminated limb of an Earth-like planet filling one side of the lower band
> with visible cloud systems and a thin atmospheric halo, hard unfiltered
> sunlight from one direction, no ground, no station, no sun disc, no lens
> flare, seamless left-right, 4096x2048

**horizon_orbital**
> Photorealistic distant horizon band of an orbital shipyard, the far modules,
> trusses, radiator fins and solar wings of an enormous station strung along
> the black, hard-lit from one side with pure black shadows, small navigation
> lights, kilometres away, no atmospheric haze, transparent above the
> structures, opaque near-black at the bottom edge, horizontally seamless
> tiling strip, 4096x512

---

## Delivering and checking

Drop each file at its path above and that arena upgrades in place — nothing
to register, no code change. Optionally append the entry to
`src/textures/MANIFEST.txt` (documentation only).

Then check it:

```sh
node tools/assetcheck.mjs                       # every declared name still resolves
npm run dev
node tools/shot.mjs "http://localhost:5173/?battle=<theme>&p1=titanus&p2=viper" bg.png 12000
node tools/shot.mjs "http://localhost:5173/?battle=<theme>&overhead=1" bg-wide.png 12000
npx vite build                                  # must stay green
```

**Look at the pictures.** Four things go wrong and only one of them is
visible in a thumbnail:

1. **A seam** — a vertical line in the sky, or a hard join in the horizon ring
   every 120°. Orbit a full turn.
2. **A pinwheel at the zenith** — cloud detail placed in the top rows of the
   panorama, smeared through the pole.
3. **A cut line where the strip ends** — the strip's bottom edge not matching
   `fog.color`, or its top not fading out before the ring's rim.
4. **The backdrop and the stage lit differently** — the sun in the panorama on
   one side and the arena's shadows falling the other way. That is what the
   per-theme sun pixel above is for.

Particle effects do not render under the headless renderer (SwiftShader
clamps `gl_PointSize`), but skies, horizons and everything else in a backdrop
shot are meshes and shaders, so screenshots are valid evidence here.
