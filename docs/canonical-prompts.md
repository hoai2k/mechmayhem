# Canonical Character Prompt Sheets

> **State of the set: every one of the 17 roster mechs has canonical art
> committed under `docs/canonical/`.** This sheet is the recipe for the next
> one, not a list of outstanding work.
>
> **The numbered sheets below are the ORIGINAL 12-mech run.** Two of them —
> **§3 AEGIS** and **§5 NOVA** — are RETIRED mechs kept in `archive/mechs/`,
> and the seven added since (CRANKY, SAURION, FROGGER, JERRY, NULLBOT, KONGA,
> TRITONE) have no sheet here; their canonical images and specs live in
> `docs/canonical/` and `docs/canonical/SPECS.md`. The shared style block is
> the part that still applies to everything.

Style-locked prompts for generating the canonical images (Midjourney, DALL-E,
SDXL, Flux, etc.). The style block keeps the whole roster coherent: MechWarrior
realism in materials and wear, Override-style heroic proportions, one strong
anime accent color per mech (the glowing core/visor that carries into the game).

## Shared style block — append to every prompt

> ultra-detailed mecha concept art, realistic PBR materials, battle-worn armor
> with chipped paint, decals, unit markings and panel lines, hard-surface
> design, heroic humanoid proportions (roughly 6.5 heads tall), full body in
> frame head to foot, standing T-pose with arms straight out, facing camera,
> plain light-gray studio background, even neutral lighting, glowing emissive
> accents, style of MechWarrior 5 and Armored Core concept art with anime
> color sensibility, 4k, sharp focus

For each mech, generate: **front view (T-pose)** — required; **side view** and
**back view** — recommended if your image→3D service accepts multi-view input;
plus one **hero action shot** (any pose, for reference/marketing only).

Practical tips: "T-pose" is sometimes ignored — "A-pose, arms slightly away
from body" also works (set `bindPose: "apose"` later). Reject images with
cropped feet, overlapping props, or busy backgrounds; those hurt the 3D step.

---

### 1. TITANUS — The Iron Avalanche
Colossal super-heavy brawler mech, squat massive silhouette, industrial
crane-yellow and ochre armor with black-and-yellow hazard stripes, gunmetal
under-frame, enormous oversized fists with reinforced knuckle plating, twin
exhaust stacks on its back, small armored head with a single wide amber visor
slit, heavy slab pauldrons, amber glowing reactor core in chest.

### 2. VULCAN — The Lead Storm
Mid-weight fire-support mech, olive-drab and bronze military armor, six-barrel
rotary gatling cannon replacing the right forearm, ammunition backpack with
belt feed arching over the shoulder, missile pod on left shoulder, single red
mono-eye lens in a squat dome head, bandolier of shells across chest, red
glowing accents.

### 3. AEGIS — The Bastion of Dawn
Knight-paladin mech, silver-white armor with polished gold trim, massive
ornate tower shield on left arm, long energy lance with glowing blue tip in
right hand, crested knight-helm head with glowing blue visor, twin ceremonial
banner plates on its back like a cape, blue glowing core gem set in gold on
the chest.

### 4. VIPER — The Whispering Fang
Slim lightweight assassin mech, digitigrade raptor legs with claw feet, dark
purple and black angular stealth plating, twin toxic-green energy blades
extending from forearms, narrow serpent-like head with a green cyclops visor
slit and fang motif on the chin, swept-back head fins, toxic-green glow seams.

### 5. NOVA — The Starborn Oracle
Elegant caster mech, slender feminine silhouette, pearl-white and teal armor
with flowing skirt-like hip plates, ornate staff-cannon with glowing magenta
orb head, rotating broken-halo ring floating behind shoulders, serene mask
face with a single vertical glowing third-eye slit, large magenta star core in
chest, gold filigree details.

### 6. RHINO — The Unstoppable Object
Super-heavy charger mech, hunched forward-leaning bulk, steel-gray armor with
crimson accents, huge chrome horn on its bull-like head, flat ram-plate
shoulders with steel spikes, vented snout grill, small furious red eyes, spine
ridge plates, red glowing seams, cracked concrete underfoot.

### 7. TEMPEST — The Voltage Virtuoso
Athletic mid-light stormcaster mech, deep navy armor with cyan trim, tesla
coil towers on both shoulders arcing electricity, conduit forearms with
glowing rings, swept crest fin on head like a lightning bolt, twin angled cyan
eyes, calf thruster fins, crackling cyan energy core.

### 8. FENRIR — The Last Wild Thing
Feral wolf-frame mech, silver-gray armor with dark steel, digitigrade legs,
wolf-shaped head with articulated jaw, fangs and glowing ice-blue slanted
eyes, tall sensor ears, spiked mane plates around the neck, long articulated
segmented tail, clawed gauntlets with steel talons, ice-blue glow accents.

### 9. COLOSSUS — The Patient Thunder
Extreme-heavy artillery platform mech, desert-tan and brown slab armor like a
walking bunker, twin long-barrel mortar cannons mounted on its back angled
skyward, head embedded directly into the massive chest behind an armored
visor slit, sandbag-like stacked front plates, hazard stripes, warm yellow
glowing sensor band.

### 10. WRAITH — The Hollow Echo
Gaunt stealth-sniper mech, matte-black and charcoal plating, hooded cowl head
with a single deep-set red eye, tattered cloak-like fins hanging from its
back, extremely long anti-materiel railgun rifle held two-handed, red glowing
power seams across the chest, thin digitigrade legs, menacing silhouette.

### 11. INFERNO — The Joyful Furnace
Heavy pyro juggernaut mech, crimson and burnt-orange armor, furnace-grill
chest glowing from within like molten metal, twin fuel tanks on back, both
forearms ending in flamethrower nozzles with pilot flames, welding-mask face
with a glowing grinning mouth grill, chimney vents on shoulders leaking smoke,
hazard stripes, orange fire glow.

### 12. GLACIER — The Cold Shoulder
Heavy cryo-fortress mech, pale ice-blue and white armor, translucent blue ice
crystal formations growing from shoulders and back, right forearm is a large
cryo-cannon with frost prongs, heavy brow visor glowing pale blue, frost-
breath vents in the face grill, glacier-slab pauldrons, frozen mist rising
from its frame, pale-blue glow accents.

---

## After you pick the winners

Commit the chosen images to `docs/canonical/<mechId>-front.png` (+ `-side`,
`-back`, `-hero` as available). From there:
- **With a Meshy/Tripo API key**: the 3D generation, auto-rigging, download
  and manifest wiring can be run automatically.
- **Manually**: run the images through the service's web UI, download rigged
  T-pose GLBs, drop them in `public/models/`, add manifest entries —
  see [CHARACTER_PIPELINE.md](CHARACTER_PIPELINE.md).
