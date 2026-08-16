# 🤖 MECH MAYHEM —  3D Robot Battle Arena

A fully featured browser-based 3D mech arena fighter. **17 unique mechs**, **12 destructible city
arenas**, local multiplayer for up to **4 players** (keyboard + Xbox
controllers), and AI opponents across three difficulty tiers.

![Title](docs/title.png)
![Mech select](docs/mech-select.png)

| | |
|---|---|
| ![Neon District](docs/arena-neon.png) | ![Volcanic Forge](docs/arena-volcano.png) |
| ![Frozen Outpost](docs/arena-frozen.png) | ![4-player split screen](docs/split-screen.png) |

## Running the game

```bash
npm install
npm run dev        # → http://localhost:5173
```

Production build: `npm run build`, then `npm run preview` (or serve `dist/`).

Best experienced in Chrome/Edge fullscreen (F10 or the title-menu option).

### Play online

Pushing to `main` (or the game branch) publishes a build to **GitHub Pages**
via `.github/workflows/deploy.yml` — the live URL appears in the Actions run
summary and under *Settings → Pages* once the first deploy finishes. No
install needed; just open the link.

### Mobile & tablet (touch)

On phones and tablets the game auto-detects touch and switches to a
**single-player** layout with on-screen controls: a floating analog stick on
the left and an action cluster on the right (light, heavy, jump, dash, block,
ranged, special, ultimate), plus taunt and pause. Menus are fully tappable.
Add `?touch=1` to force touch mode on desktop for testing (or `?desktop=1` to
force it off). Desktop keyboard + controller local multiplayer is unchanged.

## The Roster

| Mech | Title | Ranged | Special | Ultimate |
|------|-------|--------|---------|----------|
| 👊 **TITANUS** | The Iron Avalanche | Rocket Fist | Skyline Slam | METEOR BREAKER |
| 🔫 **VULCAN** | The Lead Storm | Gatling Burst | Micro-Missile Volley | BULLET HURRICANE |
| 🗡️ **VIPER** | The Whispering Fang | Fang Throw | Blade Cyclone | SERPENT STORM |
| 🐂 **RHINO** | The Unstoppable Object | Shoulder Cannon | Bull Rush | STAMPEDE |
| ⚡ **TEMPEST** | The Voltage Virtuoso | Arc Bolt | Static Overload | THUNDERFALL |
| 🐺 **FENRIR** | The Last Wild Thing | Rend Wave | Lunar Pounce | WILD HUNT |
| 💣 **COLOSSUS** | The Patient Thunder | Mortar Lob | Skyline Toss | COLOSSAL FORM |
| 🎯 **WRAITH** | The Hollow Echo | Night Swarm | Ghost Protocol | DEATH SWARM |
| 🔥 **INFERNO** | The Joyful Furnace | Dragon's Breath | Napalm Carpet | FIRE TORNADO |
| ❄️ **GLACIER** | The Cold Shoulder | Icicle Barrage | Cryo Beam | ABSOLUTE ZERO |
| 🦀 **CRANKY** | The Abyssal Bulwark | Hydro Hose | Geyser | TSUNAMI |
| 🦖 **SAURION** | The Apex Prototype | Quill Fan | Sickle Pounce | RAPTOR PACK |
| 🐸 **FROGGER** | The Gunk Gladiator | Slime Slinger | Quad Gunk Barrage | SONIC CROAK |
| 🦐 **JERRY** | The Tide-Bringer | Bilge Spit | Brine Swarm | FLEA CIRCUS |
| 👾 **NULLBOT** | The Fatal Exception | Null Pointer | SEGFAULT | SYSTEM CRASH |
| 🦍 **KONGA** | The Silverback Siege | Shoulder Salvo | Skull Driver | APEX POUND |
| 🦕 **TRITONE** | The Walking Siege | Flank Cannons | Gore Charge | SIEGE PROTOCOL |

Every mech has a full move set: 3-hit light combo, heavy launcher, ranged
weapon, dodge-dash with i-frames, block, taunt, a cooldown special and an
ultimate charged by dealing/taking damage. Every one of the 17 is playable —
there are no work-in-progress mechs behind the SHOW ALL ROBOTS setting today.

Not everyone is a humanoid brawler: CRANKY walks on six crab legs, FENRIR
gallops on four, TRITONE is a walking siege platform and JERRY can walk up
the side of a building. KONGA climbs too, hand over hand.

## The Arenas

Neon District · Ironworks Foundry · Uptown Plaza · Harbor Docks · Sky Terrace
· Scrapyard 7 · Crystal Quarry · Volcanic Forge · Frozen Outpost · Desert
Ruins · Jungle Temple · Orbital Platform

A best-of-three is fought in **three different cities** — the next arena is
resolved and preloaded while the current round is still being fought.

## Controls

| Action | Keyboard P1 | Keyboard P2 | Xbox Controller |
|--------|-------------|-------------|-----------------|
| Move | WASD | Arrows | Left stick |
| Camera | — | — | Right stick |
| Jump / hover | Space | Numpad 0 | A |
| Light attack | F | Numpad 1 | X |
| Heavy attack | G | Numpad 2 | Y |
| Block | H | Numpad 3 | LT |
| Ranged | R | Numpad 4 | RB |
| Special | T | Numpad 5 | RT |
| Ultimate | Y | Numpad 6 | D-pad ↑ |
| Dash | Shift | Numpad Enter | B (crouch-charged, see below) |
| Target lock | Q (strafe-lock, hold) | Numpad 7 | LB **tap** (toggle) |
| Sniper scope | — | — | LB **hold** |
| Duck (hold) | C | Numpad 8 | — (pad crouches on the B coil) |
| Camera zoom (hold) | — | — | L-stick click + right stick |
| Taunt | B | Numpad . | D-pad ↓ |
| Pause | Esc / P | — | Start |

Players 3 and 4 also have keyboard bindings (`,` `.` `/` `M` `N` `'` `Enter`
`Shift` `J` `K` `;`), though pads are the sane choice past two players.

**Pad B — charged dash.** Hold B to wind up a dash charge (3-second cap).
Standing still crouches you and winds the coil at full rate; you can also
keep moving while holding B, but the charge builds much more slowly on the
move. Release with a direction held on the left stick to dash that way —
the longer the wind-up, the faster and farther the dash (i-frames scale
too). Release with no direction held and the charge simply cancels.

**Pad LB — target lock, or the scope.** LB does two things, told apart by how
long it is down. **Tap** it to toggle **target lock**: your mech squares up and
keeps facing the enemy (so sideways movement becomes a natural strafe) and the
camera swings to keep them in frame; tap again to release. **Hold** it for
**sniper mode**: the view zooms in and settles almost first-person, just behind
and above your own mech's head, looking straight down the aim. The scope needs
no lock and picks its own target — shove the right stick and it takes the
nearest thing that way, enemies and destructible props alike.

**Charged strikes (TITANUS & COLOSSUS).** Hold the light-attack button to
keep the haymaker wound up at the hip, or the heavy button to keep the
overhead pound raised — the strike banks power while held and fires on
release, up to roughly double damage with hugely increased knockback.
TITANUS' ranged attack is the classic **Rocket Fist**: the fist launches
straight ahead, boomerangs back to his arm, and hits enemies on both the
outward and the return path (you can't fire again until it's home).

**Lock-aim.** Under a target lock a crosshair sits on the enemy, and the
**right stick is what moves it** — it is tied to the target and you pull
against it, so the first degrees of lead are free and the last are heavy, and
letting go eases it back onto them. Any ranged attack fired while the aim is up
flies at the crosshair, height included, so airborne targets are fair game.
That is enough lead to track a strafing enemy and not enough to lose one. Up
and down stays the *camera's* — only the sniper scope takes the vertical stick,
because there the view is the aim. Without the aim up, shots fire straight along
your facing as usual.

**Finishers** can be skipped by holding **A** (Space/Enter on keyboard) for one second.

Controllers hot-plug: connect any time; assign them on the Battle Setup
screen. Rumble is supported where the browser allows it.

## Features

- **Destructible arenas** — chunk-based buildings shear apart under fire,
  cascade-collapse when their support is destroyed, and shower ballistic
  debris. Launch an enemy through a facade. 12 themed arenas from a neon
  downtown to a steampunk foundry to an orbital platform — and not every large
  mass is a building: crystal spires, ice walls and lava-country mounds break
  and are climbed exactly like a tower.
- **LEGO-style dynamic camera** — one cinematic combined view while fighters
  are close; splits into per-player chase viewports when they separate,
  and merges back with hysteresis.
- **Local multiplayer** — up to 4 fighters in free-for-all: any mix of
  keyboards, Xbox controllers and AI (Rookie / Veteran / Ace). Three or more
  fighters with **two or more humans** is a brawl: death is a respawn, and the
  round is won on fewest deaths rather than by the last mech standing.
- **Match flow** — best-of-3 rounds (a different arena each round), intros, KO
  slow-mo, cinematic finishers, victory poses, damage popups, ult callouts,
  round timer.
- **Surface walking** — JERRY and KONGA walk up a facade, over the lip and
  across the roof with no mode change and no scripted move anywhere in it.
- **Rigged models, procedural motion** — all 17 mechs ship as rigged GLBs
  (with the in-engine sculpted parts-kit models as an automatic fallback), and
  every frame of animation is generated: a pose-blend engine, a data-driven
  gait system, and per-mech signature motion. No model in the game carries a
  baked animation clip.
- **Audio** — recorded SFX (`public/sfx/`) over a synthesized fallback bank,
  a per-arena ambience bed, and a streamed soundtrack with songs that belong
  to individual arenas.

## Dev shortcuts

- `?showcase` — the whole roster in an idle line-up ·
  `?showcase=<id>&anim=<clip|walk|none>` — one mech, judging camera
- `?battle=<themeId>&p1=<mech>&p2=<mech>[&p3=..][&p4=..][&auto=1][&diff=ace]`
  — jump straight into a fight (auto=1: all-AI soak test)
- `?battle=<t>&overhead=1` — park the camera straight down to read an arena
  layout from above
- An unrecognised URL parameter warns in the console with a did-you-mean
  rather than being silently ignored (`src/core/knobs.js`).

The **workbenches** — the authoring tools for animation, gait, pose, rigs,
skinning, colliders, props and the arena editor — live on their own page at
`/workbench/`, which lands on a card-per-tool front page. They import no game
code directly and are absent entirely from a `RW_DIST=1` distribution build.
See [workbench/README.md](workbench/README.md).

## Mech art pipeline

Turn a concept image into a rigged, animated in-game mech — two routes
(external image→3D services, or the free in-engine sculpted pipeline) —
fully documented for future contributors (human or AI) in
[docs/MECH_ART_GUIDE.md](docs/MECH_ART_GUIDE.md).

## Task tracking

Build progress and the full phase plan live in [TASKS.md](TASKS.md).
