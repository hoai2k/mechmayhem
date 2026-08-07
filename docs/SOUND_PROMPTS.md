# SOUND FX — generation prompts

Every sound in the game is synthesized at runtime today (`src/core/audio.js`:
a WebAudio note/noise scheduler, 50 entries in the `SFX` bank plus four
procedural music patterns). This document is the shopping list for replacing
that with RECORDED FILES, one prompt per sound, in the order they should be
made.

Each prompt is self-sufficient — copy one into a generator as-is, nothing
needs to be prepended. The technical requirements are repeated inside every
prompt on purpose.

---

## How the files will be used

**The setting.** `SETTINGS → SOUND FX: [ON | OFF | FALLBACK]`

| Mode | Behaviour |
| --- | --- |
| **ON** (default once files exist) | Play the recorded file. Anything with no file falls through to the synthesized version, so a half-finished set is playable. |
| **FALLBACK** | Ignore the files entirely and use the procedural synth — what ships today. Kept forever: it is the offline/zero-download path and the A/B reference. |
| **OFF** | No sound effects at all (music unaffected). |

**Naming.** A file named after an existing `SFX` key overrides it with no code
change: `public/sfx/<key>.<ext>` — e.g. `public/sfx/hitHeavy.mp3` replaces the
synthesized `hitHeavy`. The keys are listed with each prompt below as
`file: <name>`. Prompts marked **NEW** have no synthesized counterpart and
need a call site adding as well; they are called out in their section.

**Variations come as ONE file.** The engine already slices a single take into
separate events by silence (`GameAudio.loadSliced` / `playSlice`, used today
for the title screen's neon buzz): it measures an RMS envelope, treats a run of
quiet longer than ~60 ms as a boundary, and plays a DIFFERENT slice each
trigger. So for anything that fires repeatedly — footsteps, impacts, gatling
ticks — ask for 6–10 takes in one file with ~0.5 s of silence between them
rather than for separate files. Every prompt that wants this says so.

**Delivery spec** (repeated inside each prompt, listed once here for the
person doing the batch):

- 48 kHz, 24-bit WAV preferred (MP3 fine for ambience); mono for anything
  positional, stereo only for the ambient beds.
- **Dry.** No reverb tail, no delay, no music, no room. The game adds its own
  distance filtering, pitch wobble (±10 % per trigger) and shake. A baked
  reverb tail makes the same sound wrong in a cave and on a rooftop.
- Trimmed hard at the head — a one-shot must start on the transient, since
  the game triggers it at the frame the hit lands.
- Peak around −3 dBFS, no limiting to a wall; the mix balances levels itself.
- Ambient beds must be **seamless loops** with no discernible landmark event
  (a bird that lands on the same second every 20 s is worse than no bird).

---

## Priority

| Tier | What | Files | Why this order |
| --- | --- | --- | --- |
| **P0** | Core combat loop | 14 | Heard hundreds of times a match; the single biggest upgrade per file. |
| **P1** | Weapons & destruction | 24 | Every ranged mech and every collapsing building. |
| **P2** | Match flow & UI | 13 | On screen before the fight starts — first impression. |
| **P3** | Arena ambient beds | 12 | One per arena; the actual "soundscape" win. |
| **P4** | Surfaces & hazards | 12 | Makes the arenas feel like places rather than skins. |
| **P5** | Mech signatures | 14 | Character flourishes; the roster survives without them. |

---

# P0 — Core combat loop

The sounds a player hears in the first ten seconds of every fight. Do these
first even if nothing else gets made.

### 1. Light hit — `file: hit`

```
Game sound effect for a 3D robot-mech arena fighter: a light punch landing on
a metal robot chassis. A hard, dry impact — a padded steel fist hitting a
thick armour plate — with a short metallic ring under it and a tight thud of
mass behind it. Punchy and close, no ringing tail, no reverb, no music.
Deliver 8 variations in ONE file, each 120-200 ms, separated by about 0.5
seconds of silence, with a small natural spread in weight and pitch. Mono,
48 kHz WAV, dry and close-mic'd, trimmed so each hit starts exactly on the
transient, peaks near -3 dBFS.
```

### 2. Heavy hit — `file: hitHeavy`

```
Game sound effect for a 3D robot-mech arena fighter: a heavy blow landing on a
40-ton war machine. A deep chest-hitting impact — a low sub thump, a broad
crunch of buckling armour plate, and a metallic clank of the frame taking the
load. Big and blunt, weightier and slower than a punch but still tight; no
reverb tail, no music. Deliver 8 variations in ONE file, each 250-400 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to
start on the transient, peaks near -3 dBFS.
```

### 3. Guard — `file: block`

```
Game sound effect for a 3D robot-mech arena fighter: a strike caught on a raised
metal guard. A bright, ringing clang of steel on steel — a hard plate-on-plate
crack with a short pitched shimmer and a scrape of servos absorbing the shove —
then gone. Defensive and clean, not an impact on flesh; no reverb tail, no
music. Deliver 6 variations in ONE file, each 180-300 ms, separated by about
0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks
near -3 dBFS.
```

### 4. Light swing — `file: whoosh`

```
Game sound effect for a 3D robot-mech arena fighter: a fast mechanical arm
swinging through the air and missing. A short filtered air rush with a faint
whine of servo under it — heavy metal moving quickly, not a sword and not a
cloth swish. No impact at the end, no reverb, no music. Deliver 6 variations in
ONE file, each 200-280 ms, separated by about 0.5 seconds of silence. Mono,
48 kHz WAV, dry, trimmed at the head, peaks near -3 dBFS.
```

### 5. Heavy swing — `file: whooshBig`

```
Game sound effect for a 3D robot-mech arena fighter: a massive robot arm
winding up and hauling a heavy blow through the air. A long, low air rush that
builds and falls away, with the groan of hydraulics and the mass of something
that weighs a ton behind it. Slower and deeper than a light swing, no impact at
the end, no reverb, no music. Deliver 5 variations in ONE file, each 400-550 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, peaks near
-3 dBFS.
```

### 6. Blade slash — `file: slash`

```
Game sound effect for a 3D robot-mech arena fighter: a monomolecular blade or
claw slicing through the air. A sharp, bright, fast-moving scythe of air —
metallic and keen, with a thin high edge to it that falls in pitch as it
passes. No impact, no ringing tail, no reverb, no music. Deliver 6 variations in
ONE file, each 120-200 ms, separated by about 0.5 seconds of silence. Mono,
48 kHz WAV, dry, trimmed to the transient, peaks near -3 dBFS.
```

### 7. Ground slam — `file: slam`

```
Game sound effect for a 3D robot-mech arena fighter: a giant robot driving both
fists into the pavement. A colossal ground impact — deep sub-bass thud, a
concrete crack, a spray of grit, and the metallic clang of the machine's own
frame — heavy enough that you feel the floor take it. Ends quickly, no long
reverb tail, no music. Deliver 5 variations in ONE file, each 350-550 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to
the transient, peaks near -3 dBFS.
```

### 8. Landing — `file: land`

```
Game sound effect for a 3D robot-mech arena fighter: a heavy bipedal robot
landing on its feet after a jump. Two enormous steel boots hitting pavement
together — a firm low thud, a compression hiss of shock absorbers, a small
scatter of grit. Confident and controlled, not a crash. No reverb tail, no
music. Deliver 8 variations in ONE file, each 200-350 ms, separated by about 0.5
seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near
-3 dBFS.
```

### 9. Jump / jet lift — `file: jump`

```
Game sound effect for a 3D robot-mech arena fighter: a heavy mech launching
upward on jump-jets. A sharp hydraulic thrust from the legs, a burst of
pressurized steam venting, and a short rising thruster whoosh that lifts in
pitch as the machine leaves the ground. Ends cleanly in under half a second, no
reverb, no music. Deliver 6 variations in ONE file, each 250-400 ms, separated
by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -3 dBFS.
```

### 10. Dash — `file: dash`

```
Game sound effect for a 3D robot-mech arena fighter: a mech boosting sideways
in a short ground dash. A sharp jet of compressed air and thruster burn with a
metallic scrape of feet skating over pavement, snapping forward and cutting off
fast. Aggressive, dry and short; no reverb tail, no music. Deliver 6 variations
in ONE file, each 200-320 ms, separated by about 0.5 seconds of silence. Mono,
48 kHz WAV, dry, trimmed to the transient, peaks near -3 dBFS.
```

### 11. Body fall / knockdown — `file: bodyfall`

```
Game sound effect for a 3D robot-mech arena fighter: a defeated war machine
crashing to the ground. A big double impact — the shoulder and hip hitting the
pavement a fraction apart — with buckling metal, loose panels rattling and a
low settling groan of the frame. Heavy and final, no long reverb tail, no
music. Deliver 5 variations in ONE file, each 500-800 ms, separated by about
0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks
near -3 dBFS.
```

### 12. Servo movement — `file: servo`

```
Game sound effect for a 3D robot-mech arena fighter: a single short servo motor
move on a heavy machine — a limb repositioning. A quick electric whir that
rises and settles, with a faint mechanical clack at the end as the joint locks.
Small, clean and unobtrusive; this plays constantly, so it must never be
attention-grabbing. No reverb, no music. Deliver 8 variations in ONE file, each
120-220 ms, separated by about 0.5 seconds of silence, with a little spread in
pitch and speed. Mono, 48 kHz WAV, dry, peaks near -6 dBFS.
```

### 13. Footsteps — `file: footstep` — **NEW**

The game has no footstep sound at all today; the walk cycle is silent. This is
the single biggest missing piece of the combat soundscape. Needs a call site
in the animator's foot-plant (a per-foot event already exists — the gait knows
exactly when a sole is planted).

```
Game sound effect for a 3D robot-mech arena fighter: the footstep of a huge
bipedal war machine walking on concrete. A weighty steel sole planting — a low
thud with real mass behind it, a metallic edge as the plate meets the ground,
a faint servo whine of the leg taking the weight, and a small scatter of grit.
Heavy but not a crash: this is a walking pace, it will play twice a second.
No reverb, no music. Deliver 10 variations in ONE file, each 180-300 ms,
separated by about 0.5 seconds of silence, with a natural spread of weight and
pitch so repeated steps never sound identical. Mono, 48 kHz WAV, dry, trimmed
to the transient, peaks near -6 dBFS.
```

### 14. Run footsteps — `file: footstepRun` — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: the footfall of a huge
bipedal war machine at a full sprint on concrete. Harder and faster than a
walking step — a sharp slam of the sole, cracking grit, a hydraulic hiss of the
leg pushing off, and a metallic ring through the frame. Aggressive and driving.
No reverb, no music. Deliver 10 variations in ONE file, each 200-320 ms,
separated by about 0.5 seconds of silence, with a natural spread of weight and
pitch. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near -4 dBFS.
```

---

# P1 — Weapons & destruction

### 15. Gatling tick — `file: gatling`

```
Game sound effect for a 3D robot-mech arena fighter: ONE round leaving a
rotary gatling cannon. A single dry mechanical chunk-crack — punchy, tight,
with a metallic case-ejection tick at the end. It will be retriggered about 12
times a second to build the burst, so it must be very short and must not ring.
No reverb, no music. Deliver 10 variations in ONE file, each 40-70 ms,
separated by about 0.4 seconds of silence, with tiny spread in pitch. Mono,
48 kHz WAV, dry, trimmed to the transient, peaks near -6 dBFS.
```

### 16. Missile launch — `file: missile`

```
Game sound effect for a 3D robot-mech arena fighter: a missile leaving a
shoulder pod. A hard launch thump, then a solid-fuel motor igniting and
screaming away — a rising, receding rocket hiss with a hard edge to it. Ends
within half a second as the missile leaves the frame, no reverb tail, no music.
Deliver 5 variations in ONE file, each 400-550 ms, separated by about 0.5
seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near
-3 dBFS.
```

### 17. Mortar fire — `file: mortar`

```
Game sound effect for a 3D robot-mech arena fighter: a mech-mounted mortar
firing a shell in a high arc. A deep hollow THUMP of propellant with a woody
low-end pop and a short breath of smoke leaving the tube — heavy artillery, not
a rifle. No reverb tail, no music. Deliver 5 variations in ONE file, each
250-400 ms, separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry,
trimmed to the transient, peaks near -3 dBFS.
```

### 18. Siege mortar — `file: mortarBig`

```
Game sound effect for a 3D robot-mech arena fighter: a siege-calibre mortar
firing from a heavy war machine. An enormous deep detonation of propellant with
a chest-punching sub, a metallic recoil clang of the mount taking the load, and
a low smoky exhale as the tube clears. Massive and slow. No reverb tail, no
music. Deliver 4 variations in ONE file, each 450-650 ms, separated by about
0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks
near -3 dBFS.
```

### 19. Railgun — `file: railgun`

```
Game sound effect for a 3D robot-mech arena fighter: an electromagnetic railgun
firing a hypersonic slug. A brief capacitor whine collapsing into a violent
electrical CRACK, a downward-swooping metallic zing as the slug leaves the
rails, and a low thump of recoil. Futuristic and electrical rather than
gunpowder. No reverb tail, no music. Deliver 5 variations in ONE file, each
300-450 ms, separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry,
trimmed to the transient, peaks near -3 dBFS.
```

### 20. Plasma bolt — `file: plasma`

```
Game sound effect for a 3D robot-mech arena fighter: a plasma cannon firing a
bolt of superheated gas. A thick synthetic PEW with body to it — a downward
pitch sweep, a scorched hiss of ionized air, and a faint electric buzz — sci-fi
energy weapon, not a bullet. No reverb tail, no music. Deliver 6 variations in
ONE file, each 200-320 ms, separated by about 0.5 seconds of silence. Mono,
48 kHz WAV, dry, trimmed to the transient, peaks near -3 dBFS.
```

### 21. Dart / needle — `file: dart`

```
Game sound effect for a 3D robot-mech arena fighter: a compressed-air dart
launcher firing a light needle round. A quick pneumatic spit — sharp, thin and
high, with a tiny mechanical click of the mechanism cycling behind it. Small
and fast; this fires in rapid strings. No reverb, no music. Deliver 8
variations in ONE file, each 60-110 ms, separated by about 0.4 seconds of
silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near -6 dBFS.
```

### 22. Energy wave — `file: wave`

```
Game sound effect for a 3D robot-mech arena fighter: a rolling wave of energy
released along the ground. A low synthetic swell that opens up as it travels —
detuned electric hum sweeping upward in pitch and brightness, with a rushing
edge of displaced air. Powerful and rolling rather than percussive. No reverb
tail, no music. Deliver 4 variations in ONE file, each 350-500 ms, separated by
about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, peaks near -3 dBFS.
```

### 23. Electric zap — `file: zap`

```
Game sound effect for a 3D robot-mech arena fighter: a short arc of high-voltage
electricity discharging. A sharp electrical SNAP with a crackling ionized tail
that collapses instantly — like a Tesla coil firing one arc. Bright, dry, and
very short. No reverb, no music. Deliver 8 variations in ONE file, each
90-160 ms, separated by about 0.4 seconds of silence. Mono, 48 kHz WAV, dry,
trimmed to the transient, peaks near -4 dBFS.
```

### 24. Thunder strike — `file: thunder`

```
Game sound effect for a 3D robot-mech arena fighter: a lightning bolt striking
the ground beside you. A blinding-close electrical CRACK followed immediately by
a heavy rolling boom that decays over about a second — no distance, no long
canyon echo, just the raw strike and its collapse. No music. Deliver 4
variations in ONE file, each 900-1200 ms, separated by about 0.7 seconds of
silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near -3 dBFS.
```

### 25. Flamethrower tick — `file: flame`

```
Game sound effect for a 3D robot-mech arena fighter: ONE short burst from a
flamethrower — a fragment of a continuous jet. A throaty whoosh of ignited fuel
with a low roaring body and a rough crackle, no ignition click and no tail. It
will be retriggered several times a second to build a continuous stream, so
the level must be even from start to end and it must loop-blend with itself.
No reverb, no music. Deliver 10 variations in ONE file, each 100-160 ms,
separated by about 0.4 seconds of silence. Mono, 48 kHz WAV, dry, peaks near
-6 dBFS.
```

### 26. Energy beam — `file: beam`

```
Game sound effect for a 3D robot-mech arena fighter: a sustained energy beam
firing and cutting out. A thick electric hum that swells open, holds with a
resonant filtered sweep in it, and closes down — the whole gesture in under half
a second. Focused and continuous, not a pulse. No reverb tail, no music.
Deliver 4 variations in ONE file, each 450-600 ms, separated by about 0.5
seconds of silence. Mono, 48 kHz WAV, dry, peaks near -4 dBFS.
```

### 27. Freeze — `file: freeze`

```
Game sound effect for a 3D robot-mech arena fighter: a cryo weapon flash-freezing
a surface. A sharp icy hiss of escaping coolant with a high crystalline ring
falling in pitch as the frost takes hold, and a faint tick of contracting metal.
Cold, glassy and dry. No reverb tail, no music. Deliver 6 variations in ONE
file, each 250-400 ms, separated by about 0.5 seconds of silence. Mono, 48 kHz
WAV, dry, trimmed to the transient, peaks near -4 dBFS.
```

### 28. Deep freeze — `file: freezeBig`

```
Game sound effect for a 3D robot-mech arena fighter: an ultimate-scale cryo
blast encasing a war machine in solid ice. A huge rush of coolant, a long
descending crystalline shimmer, thick ice groaning and cracking as it forms, and
a low sub-thump as the block sets. Big, cold and final, about half a second of
formation. No reverb tail, no music. Deliver 3 variations in ONE file, each
600-900 ms, separated by about 0.7 seconds of silence. Mono, 48 kHz WAV, dry,
peaks near -3 dBFS.
```

### 29. Ice shatter — `file: shatter`

```
Game sound effect for a 3D robot-mech arena fighter: a block of ice shattering
and the shards falling. A hard glassy crack followed by a bright cascade of
tumbling crystalline fragments that thins out over a quarter second. Sharp,
brittle, dry. No reverb tail, no music. Deliver 6 variations in ONE file, each
300-500 ms, separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry,
trimmed to the transient, peaks near -3 dBFS.
```

### 30. Crystal shard — `file: shard`

```
Game sound effect for a 3D robot-mech arena fighter: a crystal shard projectile
being launched. A bright glassy chime with a hard edge on the front, ringing
briefly and falling in pitch — resonant mineral, not metal. Small and clean.
No reverb tail, no music. Deliver 8 variations in ONE file, each 100-180 ms,
separated by about 0.4 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to
the transient, peaks near -6 dBFS.
```

### 31. Ability cast — `file: cast`

```
Game sound effect for a 3D robot-mech arena fighter: a mech's special ability
spinning up and releasing. A quick rising three-step synthetic sparkle — bright
electronic energy gathering — with an airy shimmer trailing it. Reads as
"something is about to happen", clean and sci-fi, not magical or orchestral.
No reverb tail, no music. Deliver 4 variations in ONE file, each 300-450 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, peaks near
-4 dBFS.
```

### 32. Weapon charge — `file: charge`

```
Game sound effect for a 3D robot-mech arena fighter: a heavy weapon charging
up. A capacitor bank winding from a low hum to a strained high whine over about
half a second, with a filtered noise rush swelling underneath it as the charge
peaks. Ends at its loudest — the release is a separate sound. No reverb tail,
no music. Deliver 4 variations in ONE file, each 500-700 ms, separated by about
0.6 seconds of silence. Mono, 48 kHz WAV, dry, peaks near -4 dBFS.
```

### 33. Explosion — `file: explosion`

```
Game sound effect for a 3D robot-mech arena fighter: a mid-sized ordnance
explosion. A hard cracking front edge, a deep low-end boom, and a debris-laden
decay that falls away within half a second. Punchy and immediate rather than
cinematic and distant; no long reverb tail, no music. Deliver 6 variations in
ONE file, each 450-700 ms, separated by about 0.6 seconds of silence. Mono,
48 kHz WAV, dry, trimmed to the transient, peaks near -3 dBFS.
```

### 34. Huge explosion — `file: explosionBig`

```
Game sound effect for a 3D robot-mech arena fighter: an ultimate-scale
explosion levelling a city block. An enormous cracking detonation, a massive
sub-bass drop you feel in the chest, and a long rolling debris decay of about a
second. Devastating but still dry and close — no cinematic reverb tail, no
music. Deliver 4 variations in ONE file, each 900-1400 ms, separated by about
0.8 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks
near -3 dBFS.
```

### 35. Rubble / crumble — `file: crumble`

```
Game sound effect for a 3D robot-mech arena fighter: a chunk of a concrete
building breaking away and falling. Cracking masonry, tumbling blocks of
concrete and a gritty rain of dust and debris, settling within about half a
second. Dry, close and granular. No reverb tail, no music. Deliver 6 variations
in ONE file, each 500-800 ms, separated by about 0.6 seconds of silence. Mono,
48 kHz WAV, dry, peaks near -4 dBFS.
```

### 36. Building collapse — `file: crumbleBig`

```
Game sound effect for a 3D robot-mech arena fighter: an entire tower block
collapsing. A deep structural groan, reinforced concrete tearing and cracking,
then a sustained avalanche of falling masonry and steel that rolls for about a
second before thinning into dust. Enormous, close, dry — no cinematic reverb,
no music. Deliver 3 variations in ONE file, each 1200-1800 ms, separated by
about 1 second of silence. Mono, 48 kHz WAV, dry, peaks near -3 dBFS.
```

### 37. Glass break — `file: glassBreak` — **NEW**

Skyscraper windows, holo-panels, billboards, the greenhouse arena props.

```
Game sound effect for a 3D robot-mech arena fighter: a large plate-glass window
shattering and falling. A hard bright crack, an explosive spray of glass, and a
cascade of shards hitting concrete over about half a second. Sharp and brittle,
dry and close, no reverb tail, no music. Deliver 6 variations in ONE file, each
500-800 ms, separated by about 0.6 seconds of silence. Mono, 48 kHz WAV, dry,
trimmed to the transient, peaks near -3 dBFS.
```

### 38. Metal prop wreck — `file: metalWreck` — **NEW**

Shipping containers, fuel tanks, scrap piles, vending clusters — the props a
mech ploughs through.

```
Game sound effect for a 3D robot-mech arena fighter: a shipping container or
steel drum being smashed and knocked flying. A big hollow metallic BANG, sheet
metal buckling and booming, then a clattering tumble as it rolls away. Loud,
resonant, industrial; dry and close, no reverb tail, no music. Deliver 6
variations in ONE file, each 600-1000 ms, separated by about 0.6 seconds of
silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near -3 dBFS.
```

---

# P2 — Match flow & UI

These are the first sounds a player ever hears, and the UI ones fire on every
menu keypress.

### 39. Menu move — `file: uiMove`

```
User-interface sound for a sci-fi mech fighting game: moving the cursor between
menu items. A single crisp electronic blip — short, clean, slightly synthetic,
with a soft edge so it never fatigues at high repetition rates. No reverb, no
music, no melody. One shot, 50-90 ms. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -8 dBFS.
```

### 40. Menu confirm — `file: uiConfirm`

```
User-interface sound for a sci-fi mech fighting game: confirming a menu choice.
A two-note upward electronic chirp — bright, positive, decisive — with a light
digital sheen. No reverb, no music, no melody beyond the two notes. One shot,
150-250 ms. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near
-6 dBFS.
```

### 41. Menu back — `file: uiBack`

```
User-interface sound for a sci-fi mech fighting game: backing out of a menu. A
two-note downward electronic blip — neutral, not a failure buzzer — short and
clean. No reverb, no music. One shot, 150-250 ms. Mono, 48 kHz WAV, dry,
trimmed to the transient, peaks near -8 dBFS.
```

### 42. Heavy select — `file: uiSelect`

```
User-interface sound for a sci-fi mech fighting game: locking in a robot on the
character-select screen. A chunky mechanical-digital confirm — a bright blip
over a solid low thump with a metallic click on the front, like a heavy switch
being thrown. Satisfying and weighty, still short. No reverb, no music. One
shot, 200-300 ms. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near
-4 dBFS.
```

### 43. Pause — `file: pause`

```
User-interface sound for a sci-fi mech fighting game: the pause menu opening. A
short descending two-tone electronic chime — calm, slightly hollow, a system
suspending rather than an error. No reverb, no music. One shot, 200-320 ms.
Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near -6 dBFS.
```

### 44. Countdown beep — `file: countBeep`

```
Sound effect for a fighting game's pre-round countdown: one countdown tick. A
single clean high electronic beep, flat in pitch, arcade-style and precise, with
no vibrato and no tail. It plays three times in a row a second apart, so it must
be identical and neutral. One shot, 100-150 ms. Mono, 48 kHz WAV, dry, trimmed
to the transient, peaks near -6 dBFS.
```

### 45. Fight bell — `file: fightBell`

```
Sound effect for a fighting game: the ringside bell starting the round. A
bright brass boxing bell struck twice in quick succession, metallic and
inharmonic, ringing out and decaying over about a second and a half. Clean and
close, no room reverb, no music. One shot, 1.3-1.8 s total. Mono, 48 kHz WAV,
dry, trimmed to the transient, peaks near -3 dBFS.
```

### 46. Round sting — `file: stingRound`

```
Sound effect for a mech fighting game: the stinger under the "ROUND ONE"
caption. A deep impact hit with a metallic industrial clang and a low bass drop,
plus a short bright tone over the top — one dramatic punctuation mark, not a
melody. Dry and close, no cinematic reverb, no music bed. One shot, 500-700 ms.
Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near -3 dBFS.
```

### 47. KO sting — `file: stingKO`

```
Sound effect for a mech fighting game: the moment of a knockout. A colossal
low-end impact with a metallic crunch and a long dark decay — the sound of a
machine being finished. Heavy, dramatic and dry; about a second, no cinematic
reverb tail, no music. One shot, 900-1200 ms. Mono, 48 kHz WAV, dry, trimmed to
the transient, peaks near -3 dBFS.
```

### 48. Victory fanfare — `file: stingWin`

```
Short victory fanfare for a mech fighting game's results screen. About two
seconds of triumphant synth brass and bright square-wave leads over a deep bass
root, in a minor key, rising to a held final chord with a metallic industrial
hit on the downbeat. Retro-arcade energy, modern production, no vocals, no
percussion loop, ends cleanly. 2.0-2.5 s. Stereo, 48 kHz WAV, peaks near
-3 dBFS.
```

### 49. Ultimate ready — `file: ultReady`

```
Sound effect for a mech fighting game: a robot's ultimate ability becoming
available. A dramatic riser — a detuned synth swell climbing over about
three-quarters of a second — resolving into a heavy metallic impact with a deep
bass drop. Announces power; ends decisively. Dry and close, no cinematic reverb
tail, no music. One shot, 1.1-1.4 s. Mono, 48 kHz WAV, dry, peaks near
-3 dBFS.
```

### 50. Power-up / buff — `file: powerup`

```
Sound effect for a mech fighting game: a robot gaining a buff or picking up
power. A quick rising arpeggio of bright electronic tones with an airy shimmer
behind it — energetic, positive, synthetic, about a third of a second. No
reverb tail, no music. One shot, 300-450 ms. Mono, 48 kHz WAV, dry, trimmed to
the transient, peaks near -6 dBFS.
```

### 51. Robot taunt — `file: taunt`

```
Sound effect for a 3D robot-mech arena fighter: a war machine taunting its
opponent. A short burst of robotic vocalization — four synthetic, formant-like
blips in a mocking cadence, like a machine speaking a language you don't know.
Cocky and mechanical, no real words, no reverb, no music. Deliver 4 variations
in ONE file, each 450-650 ms, separated by about 0.6 seconds of silence. Mono,
48 kHz WAV, dry, peaks near -4 dBFS.
```

---

# P3 — Arena ambient beds

**NEW** — the game currently plays nothing under an arena. One seamless stereo
loop per arena, started when the fight begins and cross-faded on arena change.
These are the biggest single upgrade to "soundscape" per file. Keep them
QUIET and eventless: no sound in these may pull focus from combat, and any
recognisable one-off (a gull cry, a door slam) will become maddening on its
tenth loop.

### 52. Neon District — `file: amb_neon`

```
Seamless looping ambient background for a video-game arena: a rain-slick
neon-lit downtown street at midnight, heard from ground level. Steady light
rain on concrete, the electrical hum and faint crackle of neon signage, distant
traffic and the occasional far-off hover-vehicle passing high overhead, a low
city rumble underneath. Wet, moody, continuous — no speech, no music, no
foreground events, nothing that stands out as a recognisable one-off. Must loop
perfectly with no audible seam. 60-90 seconds, stereo, 48 kHz, mixed quietly
with peaks near -12 dBFS.
```

### 53. Ironworks Foundry — `file: amb_foundry`

```
Seamless looping ambient background for a video-game arena: the floor of a
gigantic working iron foundry. A constant deep furnace roar, the churn and
groan of heavy machinery, slow rhythmic pistons and distant gear trains, steam
hissing from pipes, molten metal bubbling far off, and a low industrial rumble
under everything. Hot, heavy and continuous — no speech, no music, no
foreground events, nothing that stands out as a recognisable one-off. Must loop
perfectly with no audible seam. 60-90 seconds, stereo, 48 kHz, mixed quietly
with peaks near -12 dBFS.
```

### 54. Uptown Plaza — `file: amb_uptown`

```
Seamless looping ambient background for a video-game arena: a bright modern city
plaza on a clear day, surrounded by glass towers. Gentle open-air room tone,
distant traffic and city hum, a fountain running somewhere nearby, occasional
faint birds, a soft breeze moving between buildings. Airy, calm and continuous —
no speech, no music, no foreground events, nothing that stands out as a
recognisable one-off. Must loop perfectly with no audible seam. 60-90 seconds,
stereo, 48 kHz, mixed quietly with peaks near -12 dBFS.
```

### 55. Harbor Docks — `file: amb_harbor`

```
Seamless looping ambient background for a video-game arena: a working container
port at dusk. Water lapping against concrete quays and hulls, mooring ropes and
metal creaking under load, a distant ship's horn far away, gantry cranes working
in the distance, gulls somewhere off, and a steady sea breeze. Salty, wide and
continuous — no speech, no music, no foreground events, nothing that stands out
as a recognisable one-off. Must loop perfectly with no audible seam. 60-90
seconds, stereo, 48 kHz, mixed quietly with peaks near -12 dBFS.
```

### 56. Sky Terrace — `file: amb_skyterrace`

```
Seamless looping ambient background for a video-game arena: a rooftop terrace
hundreds of metres above a city, above the cloud deck. Strong steady high-
altitude wind with a hollow edge as it moves over parapets and railings,
distant muffled city noise far below, occasional cable or flag flutter, and a
sense of enormous open air. Exposed, thin and continuous — no speech, no music,
no foreground events, nothing that stands out as a recognisable one-off. Must
loop perfectly with no audible seam. 60-90 seconds, stereo, 48 kHz, mixed
quietly with peaks near -12 dBFS.
```

### 57. Scrapyard 7 — `file: amb_scrapyard`

```
Seamless looping ambient background for a video-game arena: a vast open-air
mech scrapyard at dusty golden hour. Dry wind moving through corrugated metal
and wrecked hulls, sheet metal ticking and groaning as it cools, loose panels
flexing, a distant crusher or press working somewhere far away, occasional
settling scrap. Desolate, metallic and continuous — no speech, no music, no
foreground events, nothing that stands out as a recognisable one-off. Must loop
perfectly with no audible seam. 60-90 seconds, stereo, 48 kHz, mixed quietly
with peaks near -12 dBFS.
```

### 58. Crystal Quarry — `file: amb_quarry`

```
Seamless looping ambient background for a video-game arena: a deep open-pit mine
lined with resonant crystal, at night. A hollow enclosed pit tone, faint
sustained crystalline resonance like glass harmonics on the edge of hearing,
slow water dripping onto stone, distant small rockfalls, and a cold still air.
Eerie, mineral and continuous — no speech, no music, no foreground events,
nothing that stands out as a recognisable one-off. Must loop perfectly with no
audible seam. 60-90 seconds, stereo, 48 kHz, mixed quietly with peaks near
-12 dBFS.
```

### 59. Volcanic Forge — `file: amb_volcano`

```
Seamless looping ambient background for a video-game arena: the floor of an
active volcanic caldera. A constant low magma rumble, thick lava churning and
plopping nearby, pressurized gas venting from fissures, dry ash-laden wind, and
the occasional deep subterranean groan far below. Hot, oppressive and
continuous — no speech, no music, no foreground events, nothing that stands out
as a recognisable one-off. Must loop perfectly with no audible seam. 60-90
seconds, stereo, 48 kHz, mixed quietly with peaks near -12 dBFS.
```

### 60. Frozen Outpost — `file: amb_frozen`

```
Seamless looping ambient background for a video-game arena: an arctic research
station in a sustained blizzard. Steady howling polar wind with fine snow hissing
against metal, ice sheets creaking and settling, loose station panels rattling,
and the muffled drone of a generator somewhere inside the base. Bitter, white
and continuous — no speech, no music, no foreground events, nothing that stands
out as a recognisable one-off. Must loop perfectly with no audible seam. 60-90
seconds, stereo, 48 kHz, mixed quietly with peaks near -12 dBFS.
```

### 61. Desert Ruins — `file: amb_ruins`

```
Seamless looping ambient background for a video-game arena: an ancient stone
excavation site in an open desert at midday. Dry gusting wind over sand and
carved stone, fine grit skittering across flagstones, canvas or rope creaking
somewhere, a distant bird of prey far above, and a vast empty stillness under
it all. Arid, ancient and continuous — no speech, no music, no foreground
events, nothing that stands out as a recognisable one-off. Must loop perfectly
with no audible seam. 60-90 seconds, stereo, 48 kHz, mixed quietly with peaks
near -12 dBFS.
```

### 62. Jungle Temple — `file: amb_jungle`

```
Seamless looping ambient background for a video-game arena: a ruined stone
temple deep under a dense tropical canopy. A thick continuous layer of insects
and cicadas, distant tropical birds, leaves and vines moving in a humid breeze,
water dripping from foliage onto stone, and far-off animal calls low in the mix.
Lush, humid and continuous — no speech, no music, no foreground events, nothing
that stands out as a recognisable one-off. Must loop perfectly with no audible
seam. 60-90 seconds, stereo, 48 kHz, mixed quietly with peaks near -12 dBFS.
```

### 63. Orbital Platform — `file: amb_orbital`

```
Seamless looping ambient background for a video-game arena: the landing deck of
a space station in orbit. A deep continuous hull thrum, air recyclers and
ventilation moving air, faint electrical and computer hum, the occasional
distant structural tick of metal under thermal load, and the pressing silence of
vacuum beyond the hull. Clean, cold and continuous — no speech, no music, no
foreground events, nothing that stands out as a recognisable one-off. Must loop
perfectly with no audible seam. 60-90 seconds, stereo, 48 kHz, mixed quietly
with peaks near -12 dBFS.
```

---

# P4 — Surfaces & hazards

**NEW** — the terrain already knows which surface a foot is on (`water`,
`lava`, `ice`, `mud`, `oil`, `sand`, `grass`, `ash`, `crystal`, plus road and
plaza paving), and hazards already deal damage. None of it makes a sound.
Each of these is triggered on foot-plant or on contact, so they must sit
UNDER the metal footstep rather than replace it.

### 64. Footstep in water — `file: step_water`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot stamping
into shallow water. A heavy splash with real mass behind it, water displacing
outward and slapping back down, and a wet suction as the foot lifts. Layered
under a separate metal footstep, so no metallic content — water only. Dry and
close, no reverb, no music. Deliver 8 variations in ONE file, each 250-450 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -6 dBFS.
```

### 65. Footstep in lava / slag — `file: step_lava`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot stepping
into molten slag. A thick viscous glop of magma displacing, a fierce hiss of
searing heat, and crusted cooling rock cracking as the foot pulls free. Layered
under a separate metal footstep, so no metallic content. Dry and close, no
reverb, no music. Deliver 6 variations in ONE file, each 350-600 ms, separated
by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -6 dBFS.
```

### 66. Footstep on ice — `file: step_ice`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot planting
on thick lake ice. A brittle crunch of frost compressing, a sharp crack running
away through the sheet, and a faint glassy ring under it. Layered under a
separate metal footstep, so no metallic content. Dry and close, no reverb, no
music. Deliver 8 variations in ONE file, each 200-400 ms, separated by about
0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks
near -6 dBFS.
```

### 67. Footstep in mud — `file: step_mud`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot sinking
into deep mud. A thick wet squelch on the way down and a long sucking pull as it
comes out, with spattering wet debris. Layered under a separate metal footstep,
so no metallic content. Dry and close, no reverb, no music. Deliver 8 variations
in ONE file, each 300-550 ms, separated by about 0.5 seconds of silence. Mono,
48 kHz WAV, dry, trimmed to the transient, peaks near -6 dBFS.
```

### 68. Footstep in oil — `file: step_oil`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot stepping
in a pool of heavy oil. A thick viscous slap, syrupy liquid peeling away from
the sole, and a slick low-frequency slide. Heavier and darker than water,
layered under a separate metal footstep, so no metallic content. Dry and close,
no reverb, no music. Deliver 6 variations in ONE file, each 250-450 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to
the transient, peaks near -6 dBFS.
```

### 69. Footstep on sand — `file: step_sand`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot planting
in dry desert sand. A soft granular compression with grit spraying outward and a
fine hiss as loose sand runs back into the print. Layered under a separate metal
footstep, so no metallic content. Dry and close, no reverb, no music. Deliver 8
variations in ONE file, each 200-380 ms, separated by about 0.5 seconds of
silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near -8 dBFS.
```

### 70. Footstep on vegetation — `file: step_grass`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot crushing
down through thick jungle undergrowth. Wet leaves and vines compressing and
tearing, small branches snapping, foliage rustling back into place. Layered
under a separate metal footstep, so no metallic content. Dry and close, no
reverb, no music. Deliver 8 variations in ONE file, each 250-450 ms, separated
by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -8 dBFS.
```

### 71. Footstep in ash — `file: step_ash`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot planting
in deep volcanic ash. A soft dusty thump with a fine powdery puff pushing
outward and drifting away, drier and finer than sand, almost muffled. Layered
under a separate metal footstep, so no metallic content. Dry and close, no
reverb, no music. Deliver 6 variations in ONE file, each 250-450 ms, separated
by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -8 dBFS.
```

### 72. Footstep on crystal — `file: step_crystal`

```
Game sound effect for a 3D robot-mech arena fighter: a huge steel foot planting
on a floor of resonant mineral crystal. A hard mineral crunch with a bright
glassy ring that blooms and fades quickly, small shards skittering away.
Layered under a separate metal footstep, so no metallic content. Dry and close,
no reverb, no music. Deliver 8 variations in ONE file, each 250-450 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to
the transient, peaks near -6 dBFS.
```

### 73. Burning damage loop — `file: burn_loop`

```
Seamless looping game sound effect for a 3D robot-mech arena fighter: a war
machine on fire, heard up close. A continuous roaring flame with a rough
crackle, superheated metal ticking and pinging as it expands, and a low
gas-fed roar underneath. Steady with no build and no one-off events, so it can
start and stop at any moment. Must loop perfectly with no audible seam. 4-6
seconds, mono, 48 kHz WAV, dry, no reverb, no music, peaks near -8 dBFS.
```

### 74. Electrocution loop — `file: shock_loop`

```
Seamless looping game sound effect for a 3D robot-mech arena fighter: a robot
being electrocuted, heard up close. Continuous high-voltage arcing and
crackling with an unstable electrical buzz and the strained whine of overloaded
systems. Steady with no build and no one-off events, so it can start and stop at
any moment. Must loop perfectly with no audible seam. 4-6 seconds, mono, 48 kHz
WAV, dry, no reverb, no music, peaks near -8 dBFS.
```

### 75. Booster jets loop — `file: booster_loop`

```
Seamless looping game sound effect for a 3D robot-mech arena fighter: the
hover-jets under a mech's feet firing while it holds itself in the air. A
continuous focused thruster burn — a tight roaring jet with a high pressurized
edge and a low rumble beneath, plus a faint turbine whine. Steady with no build
and no one-off events, so it can start and stop at any moment. Must loop
perfectly with no audible seam. 4-6 seconds, mono, 48 kHz WAV, dry, no reverb,
no music, peaks near -8 dBFS.
```

---

# P5 — Mech signatures

Character flourishes for the roster's set-piece moves. Each replaces or layers
over a shared sound today, so the game is complete without them — but these are
what makes a mech feel like itself.

### 76. Wolf howl — `file: howl` (FENRIR)

```
Game sound effect for a 3D robot-mech arena fighter: a robotic wolf howling. A
long mournful howl that rises, holds with a metallic synthetic vibrato, then
falls away — recognisably a wolf but built out of machine tone rather than an
animal's throat. Haunting, not comic. About a second and a half, no reverb tail,
no music. Deliver 3 variations in ONE file, each 1.3-1.8 s, separated by about
0.8 seconds of silence. Mono, 48 kHz WAV, dry, peaks near -4 dBFS.
```

### 77. Cloak engage — `file: cloak` (WRAITH)

```
Game sound effect for a 3D robot-mech arena fighter: a stealth field engaging
and a machine fading out of visibility. A shimmering downward sweep — bright
electronic energy folding inward and thinning to nothing over about half a
second, with an airy phase-shifted wash. Ghostly and cold, resolving into
silence. No reverb tail, no music. One shot, 500-700 ms. Mono, 48 kHz WAV, dry,
peaks near -6 dBFS.
```

### 78. Chest beat — `file: chestBeat` (KONGA)

```
Game sound effect for a 3D robot-mech arena fighter: a cyborg gorilla beating
its armoured chest. Two or three enormous open-handed thuds on a metal plate —
deep, resonant and booming, with a hollow ring inside the chest cavity and a
servo strain between the blows. Primal and heavy. No reverb tail, no music.
Deliver 4 variations in ONE file, each 600-900 ms, separated by about 0.6
seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near
-3 dBFS.
```

### 79. Stack vent — `file: stackVent` (INFERNO) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: twin chimney stacks on a
robot's back blasting a column of flame and smoke straight up. A deep gas-fed
WHOOMPH of ignition, a roaring updraft climbing away, and a pressurized
industrial exhaust hiss under it. Hot, heavy and industrial; about a second, no
reverb tail, no music. Deliver 4 variations in ONE file, each 800-1200 ms,
separated by about 0.7 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -4 dBFS.
```

### 80. Torch ignite — `file: torchIgnite` (INFERNO) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: a hand-mounted
flamethrower pilot light igniting. A sharp gas click, a soft fuel WHUMP as it
catches, and a small steady flame settling in — quick and mechanical, the
start of a burn rather than a burst. No reverb tail, no music. Deliver 6
variations in ONE file, each 250-450 ms, separated by about 0.5 seconds of
silence. Mono, 48 kHz WAV, dry, trimmed to the transient, peaks near -6 dBFS.
```

### 81. Static crawl — `file: arcTaunt` (TEMPEST) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: electricity crawling all
over a robot's body as it taunts. Continuous unstable arcing — dozens of small
high-voltage snaps skittering across metal, with a rising electrical buzz and a
faint capacitor whine underneath. Alive and unpredictable, about two seconds,
fading out at the end. No reverb tail, no music. Deliver 3 variations in ONE
file, each 1.8-2.5 s, separated by about 0.8 seconds of silence. Mono, 48 kHz
WAV, dry, peaks near -6 dBFS.
```

### 82. Hologram glitch — `file: holoGlitch` (NULLBOT) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: a holographic robot's
projection stuttering and corrupting. Harsh digital artifacting — bit-crushed
stutters, sample-rate tearing, a burst of datamosh noise and a warped sync
whine — snapping in and out over half a second. Purely digital, no analogue
static, no reverb, no music. Deliver 6 variations in ONE file, each 300-600 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, peaks near
-6 dBFS.
```

### 83. Ice encase — `file: iceTaunt` (GLACIER) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: a machine sealing itself
inside a block of solid ice over about half a second. A rush of freezing vapour,
ice crystallizing and thickening with a rising crackle, deep pressure groans as
the block sets, and a final settling thud. Cold, slow and heavy. No reverb tail,
no music. Deliver 3 variations in ONE file, each 900-1400 ms, separated by about
0.8 seconds of silence. Mono, 48 kHz WAV, dry, peaks near -4 dBFS.
```

### 84. Ice thaw — `file: iceThaw` (GLACIER) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: a block of ice
disintegrating all at once as the machine inside breaks free. A sharp fracturing
crack, a bright burst of shattering crystal, and a fast scatter of falling
shards and freezing mist clearing in under a quarter second. Sudden, brittle and
dry. No reverb tail, no music. Deliver 4 variations in ONE file, each 250-450 ms,
separated by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -4 dBFS.
```

### 85. Bat swarm — `file: batSwarm` (WRAITH) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: a cloud of bats bursting
outward and flying away. A dense flurry of leathery wingbeats swelling and then
receding, with thin high chittering scattered through it. Organic and unsettling
against a machine soundscape; about a second and a half, thinning to nothing.
No reverb tail, no music. Deliver 3 variations in ONE file, each 1.2-1.8 s,
separated by about 0.8 seconds of silence. Mono, 48 kHz WAV, dry, peaks near
-6 dBFS.
```

### 86. Colossal growth — `file: growLoop` (COLOSSUS) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: a war machine expanding to
four times its size over about a second. Deep servo motors straining under
enormous load, telescoping armour plates sliding and locking, hydraulics
groaning, and a rising sub-bass swell that lands on a heavy settling thud as the
new frame locks out. Massive and mechanical. No reverb tail, no music. One shot,
1.0-1.4 s. Mono, 48 kHz WAV, dry, peaks near -3 dBFS.
```

### 87. Sonic croak — `file: sonicCroak` (FROGGER) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: a giant mechanical
amphibian releasing a weaponized croak. A grotesque low bellowing croak with a
throat-sac resonance, distorted into a physical shockwave — bass-heavy, wet at
the front and blown out at the back. Absurd and powerful at once. No reverb
tail, no music. Deliver 4 variations in ONE file, each 600-900 ms, separated by
about 0.6 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the transient,
peaks near -3 dBFS.
```

### 88. Claw snap — `file: clawSnap` (JERRY / CRANKY) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: an armoured crustacean claw
snapping shut. A hard chitinous-metallic CLACK with a hollow ring inside the
claw and a quick servo snap driving it. Sharp, dry and mechanical. Deliver 8
variations in ONE file, each 120-250 ms, separated by about 0.5 seconds of
silence. Mono, 48 kHz WAV, dry, trimmed to the transient, no reverb, no music,
peaks near -4 dBFS.
```

### 89. Goo splat — `file: gooSplat` (JERRY) — **NEW**

```
Game sound effect for a 3D robot-mech arena fighter: a glob of thick corrosive
slime hitting a hard surface. A wet heavy splat with a stringy spread outward
and a faint acidic sizzle settling in behind it. Gross, wet and short. No
reverb, no music. Deliver 8 variations in ONE file, each 200-400 ms, separated
by about 0.5 seconds of silence. Mono, 48 kHz WAV, dry, trimmed to the
transient, peaks near -6 dBFS.
```

---

## After the files exist

Roughly in this order:

1. `public/sfx/` + a loader that fetches and decodes on demand, keyed by the
   `SFX` name so a file simply shadows the synth entry.
2. The `SOUND FX: ON | OFF | FALLBACK` setting (`CONFIG.sfxMode`, persisted,
   `?sfx=` for a session) — ON falls through to the synth per-sound, so the
   set can land one file at a time.
3. Wire the **NEW** entries: footsteps off the gait's foot-plant, surface
   variants off the terrain patch under each foot, the ambient beds off
   `startBattle`'s resolved theme (cross-faded like the music), and the loops
   (`burn_loop`, `shock_loop`, `booster_loop`) off the status/jet flags that
   already exist.
4. Positional playback: hits, footsteps and weapons should pan and attenuate
   from the emitter's world position. The synth path is mono-to-bus today; the
   sample path is the natural place to add it.
