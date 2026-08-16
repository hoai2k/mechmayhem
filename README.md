# 🤖 MECH MAYHEM —  3D Robot Battle Arena

A fully featured browser-based 3D mech arena fighter. **12 unique mechs**, **12 destructible city
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

| Mech | Role | Ranged | Special | Ultimate |
|------|------|--------|---------|----------|
| 👊 **TITANUS** | Colossal brawler | Rocket Fist | Skyline Slam | METEOR BREAKER |
| 🔫 **VULCAN** | Gatling gunner | Gatling Burst | Micro-Missile Volley | BULLET HURRICANE |
| 🛡️ **AEGIS** | Shield paladin | Dawn Javelin | Bulwark Bash | JUDGMENT RAY |
| 🗡️ **VIPER** | Blade assassin | Fang Throw | Phantom Strike | SERPENT STORM |
| ✨ **NOVA** | Plasma caster | Plasma Lance | Starfall Trio | SUPERNOVA |
| 🐂 **RHINO** | Charging bull | Shoulder Cannon | Bull Rush | STAMPEDE |
| ⚡ **TEMPEST** | Storm dancer | Arc Bolt | Static Overload | THUNDERFALL |
| 🐺 **FENRIR** | Feral hunter | Rend Wave | Lunar Pounce | WILD HUNT |
| 💣 **COLOSSUS** | Walking artillery | Mortar Lob | Fire Mission | BIG BERTHA |
| 🎯 **WRAITH** | Stealth sniper | Longshot | Ghost Protocol | DEADEYE |
| 🔥 **INFERNO** | Flame juggernaut | Dragon's Breath | Napalm Carpet | BACKDRAFT |
| ❄️ **GLACIER** | Cryo fortress | Shard Burst | Cryo Beam | ABSOLUTE ZERO |

Every mech has a full move set: 3-hit light combo, heavy launcher, ranged
weapon, dodge-dash with i-frames, block, taunt, a cooldown special and an
ultimate charged by dealing/taking damage.

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
| Target lock (hold) | Q (strafe-lock) | Numpad 7 | LB |
| Duck (hold) | C | Numpad 8 | L-stick click |
| Taunt | B | Numpad . | View/Back |
| Pause | Esc / P | — | Start |

**Pad B — charged dash.** Hold B to wind up a dash charge (3-second cap).
Standing still crouches you and winds the coil at full rate; you can also
keep moving while holding B, but the charge builds much more slowly on the
move. Release with a direction held on the left stick to dash that way —
the longer the wind-up, the faster and farther the dash (i-frames scale
too). Release with no direction held and the charge simply cancels.

**Pad LB — target lock.** Hold LB to lock onto the nearest enemy: your mech
squares up and keeps facing them (so sideways movement becomes a natural
strafe), and your camera swings to keep the target in frame. Shots fire
straight down the lock line. Releasing LB drops the lock.

**Charged strikes (TITANUS & COLOSSUS).** Hold the light-attack button to
keep the haymaker wound up at the hip, or the heavy button to keep the
overhead pound raised — the strike banks power while held and fires on
release, up to roughly double damage with hugely increased knockback.
TITANUS' ranged attack is the classic **Rocket Fist**: the fist launches
straight ahead, boomerangs back to his arm, and hits enemies on both the
outward and the return path (you can't fire again until it's home).

**Lock-aim.** While holding **LB** target lock, a light crosshair drifts
onto the locked enemy (quick camera swings or dashes pull it off for a
beat until it catches up). Any ranged attack fired during the lock flies
at the crosshair — height included, so airborne targets are fair game.
Without the lock, shots fire straight along your facing as usual.

**Finishers** can be skipped by holding **A** (Space/Enter on keyboard) for one second.

Controllers hot-plug: connect any time; assign them on the Battle Setup
screen. Rumble is supported where the browser allows it.

## Features

- **Destructible arenas** — chunk-based buildings shear apart under fire,
  cascade-collapse when their support is destroyed, and shower ballistic
  debris. Launch an enemy through a facade. 12 themed arenas from a neon
  downtown to a steampunk foundry to an orbital platform.
- **LEGO-style dynamic camera** — one cinematic combined view while fighters
  are close; splits into per-player chase viewports when they separate,
  and merges back with hysteresis.
- **Local multiplayer** — up to 4 fighters in free-for-all: any mix of
  keyboards, Xbox controllers and AI (Rookie / Veteran / Ace).
- **Match flow** — best-of-3 rounds, intros, KO slow-mo, victory poses,
  damage popups, ult callouts, round timer.
- **Procedural everything** — PBR-shaded mechs assembled from a parts kit,
  canvas-painted textures, pose-blend animation engine, synthesized SFX and
  a step-sequenced soundtrack (menu + 3 battle themes).

## Dev shortcuts

- `?showcase` — all 12 mechs idle line-up · `?showcase=<id>` — clip cycler
- `?showcase=all&anim=walk` — locomotion test
- `?battle=<themeId>&p1=<mech>&p2=<mech>[&p3=..][&p4=..][&auto=1][&diff=ace]`
  — jump straight into a fight (auto=1: all-AI soak test)

## Mech art pipeline

Turn a concept image into a rigged, animated in-game mech — two routes
(external image→3D services, or the free in-engine sculpted pipeline) —
fully documented for future contributors (human or AI) in
[docs/MECH_ART_GUIDE.md](docs/MECH_ART_GUIDE.md).

## Task tracking

Build progress and the full phase plan live in [TASKS.md](TASKS.md).
