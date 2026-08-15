# IMAGE REQUESTS — hero cards for the VS splash (19 images)

**One painted card per mech**: the fighter in a battle pose, in a realistic-
anime scene from the world it came from. They are for a **VS SPLASH** — each
entrant's card, huge, in an angled panel, before the round starts — the same
job jjkbrawler's `assets/cards/<key>_card.jpg` does, and the same art can
carry the mech-select picker and the in-match portrait later.

> **The arena request is closed.** The twelve arena scenery images were
> delivered, live in `public/arenas/`, and are what the arena-select cards
> show (`ArenaSelect.loadArt`, `src/ui/menus.js`) with the procedural canvas
> kept as the backup. Nothing is outstanding there, and those prompts are gone
> from this file — the delivered images are the record.

**19 images outstanding**, one per roster mech. Any subset is useful: nothing
in the game waits on them, they land per mech, and a mech with no card simply
has no card yet.

---

## Delivery

```
public/cards/<mechId>.jpg      portrait 4:5 · 2048×2560 preferred, 1280×1600 minimum · quality ~88
```

`public/` because these are fetched by name at runtime (the rule in
`ASSETS.md`). JPG, not PNG — a card is full-bleed painted art with no
transparency, and 17 lossless portraits is a menu nobody can load.

The seventeen ids:

`titanus vulcan viper rhino tempest fenrir colossus wraith inferno
glacier cranky saurion frogger jerry nullbot konga tritone`

(AEGIS and NOVA were retired — see `archive/mechs/README.md`. They are out of
the roster entirely, so they need no card; their old art is archived with them.)

---

## THE CANONICAL IMAGE IS THE SUBJECT

Generation is local, so every reference below is an **absolute URL** into this
repository on `main` — paste them straight into the generator as image
references.

Each mech has up to three, in order of authority:

| Reference | URL | What it settles |
| --- | --- | --- |
| **Canonical concept art** | `https://raw.githubusercontent.com/hoai2k/robotworld/main/docs/canonical/mech_<id>.png` | the design: silhouette, proportions, decals, palette. **This is the subject.** |
| **In-game render** | `https://raw.githubusercontent.com/hoai2k/robotworld/main/public/posters/<id>.png` | what the mech actually looks like in the shipped build, from its real model |
| **Written spec** | `https://raw.githubusercontent.com/hoai2k/robotworld/main/docs/canonical/SPECS.md` | the per-mech paragraph, for anything the images leave ambiguous |

The card is **that mech**, not an interpretation of it: same silhouette, same
armour breakup, same decals, same accent colour glowing in the same places. A
handsome robot that is not the one on the card is a reject.

Two caveats on the references. `nullbot`'s canonical file is
`mech_null.png`, not `mech_nullbot.png`. And where the concept art and the
in-game render disagree, **the concept art wins on design and the render wins
on proportion** — several mechs were rebuilt against their model since.

## THE STYLE IS ALREADY IN THE REPO

The twelve delivered arena images are the style benchmark for this set — same
world, same paint. Pass the closest one as a **style reference** alongside the
mech's own canonical image; each entry below names which:

```
https://raw.githubusercontent.com/hoai2k/robotworld/main/public/arenas/<themeId>.jpg
```

**Realistic anime**, as those images define it: anime background-painting
craft carrying real photographic structure — correct perspective, real
atmospheric depth, physically plausible light — with heightened colour and
clean confident edges. Not a photo, not a cel-shaded cartoon, no visible
brush texture.

---

## COMPOSITION — it is a panel in a VS splash

- **Portrait 4:5, one mech, centred.** No opponent, no second figure, no
  crowd.
- **Battle pose, mid-action, readable.** Weight committed, the signature
  weapon or move doing something. Not a turnaround, not a T-pose, not a
  static hero stand — and not motion-blurred either: the panel is on screen
  for about a second and a half and has to read in that time.
- **Three-quarter view, facing the camera and slightly inward.** The splash
  mirrors nothing — several of these mechs are deliberately asymmetric
  (VULCAN's gatlings, WRAITH's rifle hand, KONGA's grafted arm), so a flipped
  card is the wrong robot.
- **Safe areas, because the panel is angled and carries a name plate.**
  - Head and weapon inside the **central 70%** of the width.
  - Nothing that matters in the **outer 15%** either side — the angled cut
    takes those corners.
  - Nothing that matters in the **bottom 18%** — the name, seat and quote
    plate sits there.
  - The head is never cropped. Feet may be.
- **Scale it like a mech.** These are 6–12 metre machines: a low camera,
  something human-scaled in the background for reference, and no lens that
  makes a siege engine look like an action figure.
- **Key light in the mech's own glow colour**, from the side or below, plus
  one cool rim to separate it from the background. The accent hex under each
  entry is the colour the game already lights that mech with.
- **The background is their world, thrown back.** Real depth of field, the
  scene readable but clearly behind — it is a backdrop for a figure, not a
  landscape the figure is standing in front of.
- **No text, letters, logos, watermarks, UI, frames or borders.** Unit
  decals painted ON the armour are part of the design and stay; anything
  floating in the image does not.

### Standard negative prompt

> `text, letters, signage, logo, watermark, UI, HUD, frame, border, second
> character, human pilot, crowd, T-pose, turnaround, orthographic, toy, chibi,
> plastic, cel shading, flat colours, line art, sketch, motion blur, cropped
> head, extra limbs, duplicated weapons, mirrored asymmetry, blurry, low
> resolution, jpeg artifacts`

### Shared style block — append to every prompt

> realistic anime key art, ultra-detailed hard-surface mecha, battle-worn
> armour with chipped paint, panel lines and unit decals, physically
> plausible materials and lighting, cinematic low camera, shallow depth of
> field, dramatic rim light, painted background with real atmospheric depth,
> portrait 4:5 composition, full figure centred with headroom, 4k, sharp
> focus

---

## THE NINETEEN

Each entry gives the palette the game lights that mech with, its reference
URLs, the world its background comes from with the arena image to anchor the
style, and the prompt. The blurb line is the mech's own from `roster.js` — it
is the character direction, not decoration.

---

### 1 · `titanus` — TITANUS · *The Iron Avalanche*
> A decommissioned siege engine that refused to power down. Slow as a glacier,
> hits like the end of the world.

`#bd9226` crane yellow · `#3e4148` gunmetal · glow `#ffa832` amber
· canonical `…/docs/canonical/mech_titanus.png` · render `…/public/posters/titanus.png`
· world: the ironworks that built him — style `…/public/arenas/foundry.jpg`

> Colossal super-heavy brawler mech in a battle pose, both enormous fists
> raised and cocked back for a downward slam, weight low and forward, crane-
> yellow and ochre armour with black-and-yellow hazard chevrons over gunmetal,
> huge multi-knuckle fists, slab pauldrons, small sunken head with a wide amber
> visor slit, amber reactor lens burning in the chest, twin radiator towers
> behind the head, standing on the scorched floor of a colossal iron foundry
> with a blast furnace glowing orange behind him and steam rolling past,
> amber key light from his own core, cold blue rim from above

---

### 2 · `vulcan` — VULCAN · *The Lead Storm*
> Ex-military fire-support platform with a laugh setting stuck on maniacal.
> Believes every problem is just insufficient ammunition.

`#cfc9bd` bone white · `#9c2f28` oxide red · glow `#ff8c30` orange
· canonical `…/docs/canonical/mech_vulcan.png` · render `…/public/posters/vulcan.png`
· world: a desert ordnance dump — style `…/public/arenas/scrapyard.jpg`

> Mid-weight fire-support mech in a battle pose, both six-barrel gatling
> forearms levelled at the camera and spinning up, muzzle flash just starting,
> spent brass in the air, bone-white and oxide-red armour over gunmetal, quad
> missile towers flanking a small crested head, orange visor strip, red crest
> blade, red hip skirt and layered shin guards, standing among stacked
> ammunition crates in a dusty desert ordnance dump at hot late afternoon,
> ochre dust haze behind him, hard warm key light, orange muzzle glow on his
> chest plates

---

### 3 · `viper` — VIPER · *The Whispering Fang*
> A prototype infiltration unit that developed a taste for theatrics. Strikes
> from angles geometry teachers refuse to acknowledge.

`#4a3566` purple · `#1a1522` black · glow `#5aff2e` neon green
· canonical `…/docs/canonical/mech_viper.png` · render `…/public/posters/viper.png`
· world: the neon district he hunts in — style `…/public/arenas/neon.jpg`

> Slim lightweight assassin mech in a battle pose, coiled low mid-lunge with
> both long green energy daggers swept out behind him, purple and black
> angular armour with green glow slits between the layers, arrowhead helm with
> a green V-visor and two tall crown blades, digitigrade raptor legs with
> clawed three-toed feet, crouched on a wet rooftop edge above a rain-soaked
> neon city canyon at midnight, magenta and cyan signs blurred far below,
> green key light from his own blades, magenta rim from the city

---

### 4 · `rhino` — RHINO · *The Unstoppable Object*
> One horn. One direction. Zero brakes. RHINO once charged through four
> buildings to win an argument he was already winning.

`#5c6066` steel grey · `#8c3a32` rust red · glow `#ff2a20` red
· canonical `…/docs/canonical/mech_rhino.png` · render `…/public/posters/rhino.png`
· world: a city plaza he is demolishing — style `…/public/arenas/uptown.jpg`

> Heavy charger mech in a battle pose, head down mid-charge with the single
> enormous nose horn levelled at the camera, shoulders hunched, one foot
> tearing up paving, steel-grey armour with rust-red plating and a heavy
> armoured brow, red lenses burning under the horn, thick short legs, charging
> across a sunlit downtown plaza with a glass tower cracking and dust blowing
> out behind him, bright midday key light, red glow across the debris

---

### 5 · `tempest` — TEMPEST · *The Voltage Virtuoso*
> A weather-control unit that discovered showmanship. Every battle is a
> concert, every lightning bolt a chord.

`#2a3560` storm navy · `#1e2740` black · glow `#3fd8ff` electric cyan
· canonical `…/docs/canonical/mech_tempest.png` · render `…/public/posters/tempest.png`
· world: a storm over the cloud deck — style `…/public/arenas/skyterrace.jpg`

> Agile caster mech in a battle pose, arms flung wide with cyan lightning
> arcing between his shoulder stacks and out to the camera, cloak of static
> around him, storm-navy and black armour with cyan glowing conduits, tall
> shoulder coil towers, slim head with a cyan visor, standing on a rooftop
> deck high above a white cloud sea with a thunderhead building behind him
> and rain lit by the discharge, hard cyan key light from his own arcs, cold
> blue sky rim

---

### 6 · `fenrir` — FENRIR · *The Last Wild Thing*
> An autonomous hunter-frame that slipped its leash decades ago. Runs with no
> pack, answers to no handler, howls at every full moon — and every explosion.

`#b4b9c0` pale steel · `#3a3e44` graphite · glow `#6cd8ff` ice blue
· canonical `…/docs/canonical/mech_fenrir.png` · render `…/public/posters/fenrir.png`
· world: the frozen wild he ran to — style `…/public/arenas/frozen.jpg`

> Quadruped wolf-frame mech in a battle pose, mid-pounce with forelegs
> extended and jaws open, blade tail streaming behind, pale steel and graphite
> plating over exposed actuator cabling, ice-blue eyes and throat glow,
> leaping through deep snow in a moonlit boreal forest under green aurora
> curtains, snow spray kicked up beneath him, cold moonlight key with
> ice-blue bounce from his own core

---

### 7 · `colossus` — COLOSSUS · *The Patient Thunder*
> A firebase that learned to walk, then learned chess. Plays the long game:
> every shell placed three moves ahead of where you plan to be.

`#a08a64` desert tan · `#4a4640` charcoal · glow `#ffc23c` amber
· canonical `…/docs/canonical/mech_colossus.png` · render `…/public/posters/colossus.png`
· world: a shelled plain under his guns — style `…/public/arenas/scrapyard.jpg`

> Enormous artillery mech in a battle pose, braced wide with the back mortar
> battery elevated and firing, blast ring and dust rolling off the ground
> around his feet, desert-tan and charcoal armour with heavy bolted plating,
> broad shoulders carrying shell racks, small amber-visored head sunk between
> them, standing on a shelled plain at dusk with cratered ground and a burning
> horizon behind him, warm amber key from the muzzle flash, cold dusk rim

---

### 8 · `wraith` — WRAITH · *The Hollow Echo*
> Officially, this unit was scrapped years ago. Officially, nobody is picking
> off mechs from 800 meters. Officially, you are perfectly safe.

`#232228` near black · `#1a191e` void · glow `#ff2030` red
· canonical `…/docs/canonical/mech_wraith.png` · render `…/public/posters/wraith.png`
· world: a dead city district in fog — style `…/public/arenas/neon.jpg`

> Tall gaunt sniper mech in a battle pose, long anti-materiel rifle shouldered
> and aimed slightly off camera, one knee dropped, tattered cloak lifting
> behind him, near-black armour that eats the light, a single narrow red eye
> burning under the hood, standing on a fog-bound rooftop in a dead city
> district at dusk with the signs dark and towers dissolving into the murk,
> almost no key light, red glow from his own optic, cold grey fog rim

---

### 9 · `inferno` — INFERNO · *The Joyful Furnace*
> A demolition unit whose safety governor "fell off" — twice. Finds fire
> genuinely hilarious.

`#8a3626` scorched red · `#2a2624` soot · glow `#ff8a1e` flame orange
· canonical `…/docs/canonical/mech_inferno.png` · render `…/public/posters/inferno.png`
· world: a live caldera — style `…/public/arenas/volcano.jpg`

> Heavy demolition mech in a battle pose, both hand flamethrowers roaring
> forward in twin jets of fire, back chimneys venting flame and black smoke
> straight up, scorched red and soot-black armour with heat-blued plating,
> riveted fuel tanks on his back, wide grille face lit orange from inside,
> standing on cracked black basalt inside an active caldera with lava veins
> across the ground and an ash sky lit crimson behind him, hard orange key
> light from his own fire, embers everywhere

---

### 10 · `glacier` — GLACIER · *The Cold Shoulder*
> Guardian of a polar research station, promoted to war machine by boredom.

`#9fb2c2` frost grey · `#4c5560` slate · glow `#7ce0ff` pale cyan
· canonical `…/docs/canonical/mech_glacier.png` · render `…/public/posters/glacier.png`
· world: research station K-9 — style `…/public/arenas/frozen.jpg`

> Heavy cryo mech in a battle pose, cryo cannon arm levelled and firing a
> freezing beam toward the camera, frost blooming off the muzzle and creeping
> across the ground, frost-grey and slate armour with thick ice slabs grown
> over the shoulders, pale cyan glow in the chest and visor, standing on
> wind-packed snow outside a polar research station at night with quonset huts
> and a radar dome behind him under a green aurora, pale cyan key light from
> the beam, cold moonlight rim

---

### 11 · `cranky` — CRANKY · *The Abyssal Bulwark*
> A deep-sea salvage rig that got tired of being salvaged. Waddled ashore
> trailing kelp and grudges, shell first, questions never.

`#a64a28` rust orange · `#46759e` sea blue · glow `#4fc3ff` cyan
· canonical `…/docs/canonical/mech_cranky.png` · render `…/public/posters/cranky.png`
· world: the dock he came ashore on — style `…/public/arenas/harbor.jpg`

> Six-legged crab mech in a battle pose, both enormous claws spread wide and
> raised, body low over its legs, rust-orange barnacled shell plating with
> sea-blue trim, kelp and rusted chain trailing from the joints, cyan lights
> along the shell rim, standing on a wet concrete quay among shipping
> containers with gantry cranes and a burning orange sunset horizon behind
> him, warm sunset key light, cyan bounce from his own shell lights, sea spray
> in the air

---

### 12 · `saurion` — SAURION · *The Apex Prototype*
> Unit MX-7, grown in a black-site lab by a corporation that wanted to end
> wars by ending everything else. It ate the lab, filed itself as CEO, and
> went hunting.

`#33343a` gunmetal black · `#17181c` void · glow `#ff2418` red
· canonical `…/docs/canonical/mech_saurion.png` · render `…/public/posters/saurion.png`
· world: the black-site lab the jungle took back — style `…/public/arenas/jungle.jpg`

> Raptor-frame theropod mech in a battle pose, crouched mid-stride with the
> head low and forward, jaws parted, sickle claws raised on both feet and
> forelimbs carried tight, gunmetal-black armour over exposed red-lit muscle
> cabling, quill blades along the spine, red sensor eyes, prowling through the
> collapsed shell of a black-site laboratory swallowed by jungle, broken
> concrete and vines behind him, humid green ambient light, hard red key from
> his own optics

---

### 13 · `frogger` — FROGGER · *The Gunk Gladiator*
> Vat-grown smart-slime poured into a bounce-frame with four gunk guns and no
> indoor voice. Jumps like gravity is a suggestion, lands like a lawsuit.

`#7cb420` slime green · `#262b20` dark olive · glow `#aef23c` acid green
· canonical `…/docs/canonical/mech_frogger.png` · render `…/public/posters/frogger.png`
· world: the vat farm he was poured in — style `…/public/arenas/jungle.jpg`

> Squat amphibian mech in a battle pose, coiled on powerful folded hind legs
> mid-leap with all four gunk guns firing globs of acid-green slime, wide
> grinning mouth, slime-green translucent body panels over a dark olive
> bounce-frame, glowing acid-green fluid visible sloshing inside the torso,
> bulbous eyes, leaping over a flooded chemical vat farm with open tanks of
> luminous green fluid and jungle growth breaking through the walkways behind
> him, acid-green key light from the vats, wet reflections everywhere

---

### 14 · `jerry` — JERRY · *The Tide-Bringer*
> Dredged from a flooded aquaculture lab, JERRY is a colony pretending to be a
> mech. The cannons are full of something alive.

`#b9816b` shell pink · `#35291f` wet brown · glow `#ff2818` red
· canonical `…/docs/canonical/mech_jerry.png` · render `…/public/posters/jerry.png`
· world: the flooded aquaculture lab — style `…/public/arenas/harbor.jpg`

> Arthropod shrimp-frame mech in a battle pose, reared up on its rear limbs
> with both hull-mounted pods firing streams of living brine, long antennae
> swept back, shell-pink carapace plating over a wet brown chassis, clusters
> of small red eyes, barnacles and weed on the joints, standing in
> knee-deep water inside a flooded aquaculture laboratory with burst tanks,
> hanging cables and grey daylight through a collapsed roof behind him, cold
> overcast key light, red glow from his own eyes on the water

---

### 15 · `nullbot` — NULLBOT · *The Fatal Exception*
> Nobody built NULLBOT. It was found in the arena's memory one morning,
> already undefeated. Where it walks, textures tear and the scoreboard reads
> NaN.

`#17131e` void black · `#0a080d` deeper void · glow `#ff1f2a` error red
· canonical `…/docs/canonical/mech_null.png` **(note the filename)** · render `…/public/posters/nullbot.png`
· world: the arena, corrupted — style `…/public/arenas/neon.jpg`

> Humanoid glitch mech in a battle pose, one arm thrown forward mid-attack
> with the limb breaking into displaced polygon shards and scan-line tearing,
> void-black body with no visible material, hard error-red glow bleeding from
> the seams and a single red glyph for a face, parts of the silhouette
> flickering into flat untextured magenta and cyan artefacts, standing in a
> neon city street that is corrupting around him — buildings smearing into
> stretched texture, the road dissolving into black void — red key light from
> the glitch itself, magenta and cyan artefact glow

---

### 16 · `konga` — KONGA · *The Silverback Siege*
> Half the mountain gorilla they started with, half the ordnance they bolted
> on afterward. The engineers called the arm-graft a success. KONGA calls it
> the smaller fist.

`#33302e` dark iron · `#a8532c` copper · glow `#ffa432` amber
· canonical `…/docs/canonical/mech_konga.png` · render `…/public/posters/konga.png`
· world: the highland jungle they took him from — style `…/public/arenas/jungle.jpg`

> Cyborg gorilla mech in a battle pose, knuckles down and shoulders rolled
> forward mid-roar, the grafted ordnance arm larger than the organic one and
> braced to swing, dark iron armour panels bolted over heavy simian musculature,
> copper trim, missile pods on the shoulders, amber eyes and chest glow, on a
> mist-filled highland jungle ridge with buttress-rooted trees and hanging
> vines behind him, diffused green daylight through the canopy, warm amber
> bounce from his own core

---

### 17 · `tritone` — TRITONE · *The Walking Siege*
> Three horns, two cannons, one direction. Rebuilt as a mobile gun platform,
> but nobody told the animal underneath.

`#62684a` olive green · `#a8532c` rust · glow `#ff8a24` orange
· canonical `…/docs/canonical/mech_tritone.png` · render `…/public/posters/tritone.png`
· world: the desert excavation he stampedes across — style `…/public/arenas/ruins.jpg`

> Quadruped triceratops siege mech in a battle pose, mid-gallop with the head
> lowered and all three horns forward, the two flank cannons on his armoured
> frill firing, olive-green armour plating with rust-red trim over a heavy
> reptilian body, an armoured frill carrying the gun mounts, orange glow along
> the barrels and under the jaw, charging across a desert excavation site with
> broken sandstone colonnades and dust thrown up behind him, warm low
> afternoon key light, orange muzzle glow across his own plating

---

## Checking one before you generate the other eighteen

1. **Is it the right robot?** Card beside `docs/canonical/mech_<id>.png` and
   `public/posters/<id>.png`. Silhouette, decals, accent colour, and which arm
   carries which weapon.
2. **Does it survive the panel?** Mask the outer 15% either side and the
   bottom 18% and look again — that is what the splash actually shows.
3. **Does it read in a second and a half?** Glance at it, look away, say what
   the mech was doing. If the pose needs study, it is too busy.
4. **Does it sit with the arenas?** Open it next to `public/arenas/<theme>.jpg`
   at the same size. Same paint, same light, same world.

Generate one first, agree it, and use it as the style reference for the rest —
the set holding together matters more here than any single card, because two
of them are always on screen at once.
