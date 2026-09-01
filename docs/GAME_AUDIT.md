# MECH MAYHEM — game audit (September 2026)

A pass over the whole game as a player would meet it: the combat and battle
system, the AI, the animation and rigging pipeline, the twelve arenas, the
menus / HUD / controls, and (secondarily) how the code is factored. Five
areas were audited in parallel, every claim was verified against the code or
measured with the repo's own tools, and the bugs that could be fixed safely
in one pass were fixed on this branch (section 1). Everything else is here
as a ranked list for you to pick from.

Pictures: `docs/audit/arena-overheads.jpg` (all twelve arenas from above,
`?overhead=1`) and `docs/audit/ui-screens.jpg` (the menu screens the flow
findings refer to).

How to read the tables: **Impact** is what the player feels, **Effort** is a
rough size for the change. `file:line` references are against this branch.

---

## 0. The short version

The game is far more complete than most projects of its size, and the tooling
is unusual: nearly every claim below could be *measured*. The problems cluster
in five places:

1. **The guard did not work the way the game says it does.** A crouched
   attack bypassed every guard, a blocking mech could not crouch to answer it,
   a frozen mech kept its guard up, and an empty stamina bar strobed the guard
   on and off instead of dropping it. All four fixed.
2. **The CPU played eleven of the seventeen mechs as the same kiting zoner**
   and never charged a hold attack, so titanus and colossus — the two hardest
   hitters — were the softest opponents. Fixed: brawlers are classified by
   mech, and the CPU winds up its haymakers.
3. **Every shipped body dropped the horizontal half of its hip animation.**
   The GLB retarget copied only the vertical hips delta, so kicks did not
   lunge, crouches did not sit back, and the knockdown slide was missing on
   all 17 mechs. Fixed and measured (bone travel now equals joint travel).
4. **Arena placement put things where the player stands.** Ammo crates inside
   buildings, spawn pads under gate legs and beside fuel tanks that cooked off
   during the intro. Fixed.
5. **The first thirty seconds on a keyboard were rough.** One Enter on the
   title locked TITANUS and armed GAME READY; a blank canvas sat there while
   the arena loaded; ROBOT SPEED and INFINITE ULTIMATES had no settings row.
   Fixed. The bigger keyboard gap — no camera, no target lock — is the top
   open recommendation.

What is left is design work, in rough order of value: **kinetic-impact
knockdowns** (a walking jab floors most of the roster), **keyboard camera and
lock**, **the weapon outliers** (gatling, hose, flame, quill fan, slime
barrage, the permanent ice sheet), **hit-reaction and combo polish** (a
crossfade between clips, directional flinches), **the three empty arenas and
the two identical ones**, and **an onboarding layer** built on the warm-up
sandbox that already exists.

---

## 1. What was fixed on this branch

All of these are on `claude/game-audit-improvements-wjm6lv`, each with a
commit that explains the measurement. `npx vite build` is green after each.

### Combat and the state machine (`src/combat/fighter.js`, `src/core/tuning.js`)

| Fix | What was wrong |
|---|---|
| A crouch is allowed under a raised guard | `wantDuck` refused to crouch while blocking, so the "crouch to block low" counter `takeHit` promises could never happen — every crouched strike was a free guard-break, and the AI ducked on purpose whenever you blocked. |
| The crouch rule is melee-only | `takeHit` read `attacker.ducking` for projectiles too: a crouching gunner's gatling, flame or hose slipped under every block. A crouched blow now has to be thrown from the attacker's own body (`srcPos` is his position or absent). |
| Freezing drops the guard | The frozen branch of `update()` returned before the block intent was re-read, so a mech iced while holding LT kept `blocking` (and its bubble) for the whole freeze. |
| An empty tank locks the guard down | The tank ran dry, the guard dropped for one frame, the next frame's regen put a sliver back and it came straight up again: up two frames in three, still absorbing two thirds of hits. `TUNING.stamina.guardRelock` (0.15) is the refill the guard now waits for. |
| `silent: true` is honoured | The cryo beam and the grabs passed it; `takeHit` ignored it and played the hit sfx plus sparks eight times a second. |
| No status on a corpse | A killing blow that also froze set `frozen` (overlay and all) and then `dead` on the same frame; burn and poison kept draining a wreck below zero for the whole brawl fade (the soak showed a corpse at hp −12). |
| One `aimGun` call per frame | The servo ran twice a frame (merge residue), halving its post-shot hold and doubling its ramp. |
| The light-chain buffer honours the clip list | `comboIdx < 3` was hard-coded; saurion's 4-hit GLB string ate the buffered press for its launcher. |
| A round reset clears taunt/aim state | Wraith's loom, glacier's block and the lock target survived into the next round's intro. |

### AI (`src/game/ai.js`)

| Fix | What was wrong |
|---|---|
| Brawlers are classified by mech | `preferredRange` said where a *gun* wants to stand and was also who the CPU thought it was: a rocket fist reads 13, a shoulder cannon 16, so CPU TITANUS held thirteen units, backed off inside eight and never punched. Eleven of seventeen played the same zoner. A roster def may also say `aiRole: 'brawler' | 'zoner'` outright. A brawler now closes to arm's reach and shoots on the way in. |
| A dry magazine with no crate makes the CPU close in | It used to keep its spacing and attack with nothing for up to the crate's 10 s respawn. |
| Charge attacks are held | `lightHeld`/`heavyHeld` were only ever written by `input.js`; CPU titanus/colossus released every haymaker at the 0.8× floor. The harder tiers wind up further. |
| Retired ult id dropped | `supernova` (nova, archived) was still in `SELF_AOE_ULTS`. |

### Match rules (`src/game/match.js`)

| Fix | What was wrong |
|---|---|
| Minion KOs stay out of the brawl respawn queue | A raptor dying in a 3+ brawl was queued as a respawn: a ring and a "powerup" sting on an empty pad for a body the world had already removed. |
| Everyone is locked at round end | After a TIME UP the losers kept control through the slow-mo and could hit, even kill, the winner mid victory pose. |
| A solo player's death ends a gauntlet round | One human against two or three CPUs used to spectate the machines finishing each other for the rest of the clock. |
| A draw-locked match ends | Two timed-out draws awarded nobody a win and started another round forever; after five rounds the match is decided on wins, then hp%. |
| Respawn pads measure across the seam | `respawnSpot` used unwrapped distance, so "furthest pad" could be the pad beside an enemy standing across the wrap. |

### Animation and rigging (`src/mechs/*`, `src/combat/hurtbox.js`, `public/models/manifest.json`)

| Fix | What was wrong |
|---|---|
| **The whole hips translation reaches the GLB bone** (`rigadapter.js`) | Only the y delta was copied. 63 clips key `hipsPos` x/z — the strike's drive, the dash coil, the crouch's seat, the knockdown slide — and the animator's own dash/duck/drive shifts, all dropped on the route every mech ships on. Measured before/after: saurion kick bone travel 0.09 → 0.51 (= the joint), titanus taunt sway 0.00 → 0.28. It also fixes the vertical on saurion, whose armature does not keep world-up on its local y (his hip bob was sliding him back and forth). |
| A dead body goes limp | `Fighter.update` passed `dead: true` with no `state`, and the animator's limp-tail rule keys on `state`. Fenrir's blade tail and wraith's cloak kept their live pose on a corpse. |
| The head is a striking limb | `tritoneGore` was `strikeArm: 'R'`, which on a ceratopsian is the right *foreleg*: his horn jab resolved and auto-aimed on a foot under his chest (measured 0.10 body-heights of lead at the hit). `head` is now in the part table; tritone's gore/toss and saurion's bite declare it. |
| A fading clip fires no events | A stopped loop kept dispatching `sfx`/`hit` events through its fade. |
| Fenrir's right booster | The manifest declared `boostL` only; a hovering fenrir fired one jet. The new anchor was measured in the showcase (his hind ankle bones are not mirrored, so a mirrored world point would have landed a unit off the bone). |
| Prone clamp finds a baked mech's tail | The skip-list resolved limp roots through the custom rig only; fenrir's rig was baked away, so his tail was measured again and propped the body up: knockdown float 42% against the documented 0.8%. Back to 0.8%. |
| Wraith's cloak goes limp again | His `limpChains: ['cape0']` lived on the rig file the bake deleted: knockdown float 24.7% → 7.2% (the documented number). `tools/bake-glb.mjs` now carries `limpChains`/`tailFloor` from any rig it removes, so baking tritone will not lose his `tailFloor`. |

### Arenas (`src/arena/*`, `src/game/world.js`)

| Fix | What was wrong |
|---|---|
| Crates never spawn inside things | `badPickupSpot` only knew lava and bridges; measured 1–3 of the 6 crates a round inside a live tower or a prop body (a beacon you can see through the wall). The scatter also retries wider. |
| Spawn pads are validated | Pads sat on a fixed ring with no check while gates, arches and towers were allowed from r=16 and gates were nudged *along* their lane onto the ring: pads measured 2.9–4.7 units from torii/temple-gate legs, rock arches and antenna towers. A ring pad slides along its ring until clear; an authored pad is nudged; a level with fewer pads than fighters fills from the ring instead of stacking two robots. |
| No detonation under a locked robot | Fuel-tank rings start at 33.3 with pads at 34; a tank 3.5 units from a pad cooked off (95 dmg + burn + launch) during the intro. |
| Organic lava keeps its whole outline out of the plaza | The plaza rule measured the centre; an organic patch's lobes reach 1.44r. |
| Wrap-aware damage | Fire patches and tank chain-reactions used raw distance across the seam. |
| Per-round swap disposes the ground overlay | Two 2048² canvas textures (~30–40 MB) leaked per arena change. |
| `metalnessMap: undefined` warning gone | One THREE warning per material build. |

### Menus, HUD, flow (`src/game/boot.js`, `src/ui/menus.js`, text)

| Fix | What was wrong |
|---|---|
| ROBOT SPEED and INFINITE ULTIMATES rows | Setters, labels and persistence existed; no row reached them (`?speed=` and the console only). |
| A screen change flushes the key edge | The Enter that left the title arrived on mech select as a confirm: TITANUS locked, GAME READY armed — and with a pad plugged in, a ghost KEYBOARD 1 seat joined that nobody pressed for (which also flipped the match into brawl rules). |
| Enter inside a modal stays in the modal | The title's raw keydown started the game under an open SETTINGS / HOW TO PLAY. |
| No blank screen while loading | The select screen and stage were torn down *before* the level fetch and prop warm-up (up to 8 s cold). The menu now stays up with a LOADING chip and stops listening until the battle exists. |
| Camera reframes every round | `azInit` was only reset on the arena swap, so round 2 could open with the camera in your own face. |
| Round clock blanks outside the fight | It read 0 through the slow-mo, victory pose and next intro after a TIME UP. |
| REMATCH restores touch controls | Only warm-up and pause-resume showed them again. |
| A lone keyboard seat backing out returns to the title | ESC used to free the only seat and leave a picker-less roster. |
| Results ignore the KO mash for its first beat | Item 0 is REMATCH and confirm is the button the player was mashing 2 s earlier. |
| Stale text | "while LB target lock is *held*" (it is a tap), "Q strafe-lock" (it is a strafe that faces the camera), the splash tagline vs the title's, README's claim of keyboard players 3 and 4. |

Also: `package.json` said "12 mechs".

Verification after the pass: `npx vite build` green; `tools/proneprobe.mjs` (titanus 8.9%, fenrir 0.8%, wraith 7.2%, tritone 0%); a hips probe on saurion / titanus / viper (GLB bone travel now equals the virtual joint's, to four decimals); the fenrir anchor probe (boostR under the right paw at the left one's paw-relative offset); `tools/brawl.mjs` (every rule it prints still holds: 4-robot KO → respawn, clean sheet ends the round, timeout on deaths, solo-vs-CPUs is not a brawl, a duel gets its finisher).

---

## 2. Combat and balance — open findings

### 2.1 Design decisions to make (not changed; they need your call)

**A. Kinetic impact makes a walking jab a launch + knockdown across a 2:1 mass gap** — `fighter.js` strike volume, constants `CLOSING_MIN 5`, `KNOCKDOWN_KICK 9.5`, `IMPACT_DMG_CAP 1.1`. Walk speeds are 15–39 u/s, so titanus walking at 20.7 into a jab floors anything under mass 4.6 (the whole roster) with `launch` pinned at the 20 cap; viper walking at 38.9 floors half the roster, sprinting all but three. A target that walks into a standing heavy's jab eats 2.1× damage. Combined with **no OTG protection** (a launcher landed during the 0.75 s knockdown relaunches; the only escape is the mash-jump that no text in the game mentions), neutral collapses into "first moving jab wins". The AI always approaches at full stick, so it eats this constantly. Suggested dials to try, measured with `tools/hitprobe.mjs` before/after: `KNOCKDOWN_KICK` 9.5 → ~25, `CLOSING_MIN` 5 → 12, `IMPACT_DMG_CAP` 1.1 → 0.5; plus 0.3 s of iframes at the start of `knockdown` (or refuse `launch` while downed) and a "MASH A" prompt the first two times a human is floored. **Impact: high. Effort: small (dials) + small (prompt).**

**B. Dash spam is stamina-neutral with 43% i-frame uptime.** `doDash` has no stamina gate (an empty bar still dashes), cost 0.09 vs 0.6 s cooldown × 0.189/s regen = 0.113 back, and 0.26 s of full invulnerability per dash. Suggest refusing a dash below `dashCost` (a full coil excepted) and/or `iframes 0.14 + 0.28k` so only a charged dash is a real dodge. **High / small.**

**C. Input buffer for heavy / special / dash / jump.** Only `light` is buffered (`queuedLight`, fires at `stateT < 0.14`); anything else pressed in the last 0.2 s of an attack is dropped. Fighting-game players feel every eaten input. Store the last pressed action with a timestamp and replay it on the first `canAct()` frame if under 0.2 s old. **High / medium.**

**D. Weapon outliers** (per-mech table in 2.2):
- VULCAN gatling 106 sustained dps, 1440 per magazine (more than any EHP), hits are `soft` so no stun but blocking drains the bar in 7 s; CRANKY hose 93, INFERNO flame 72 + burn. Suggest gatling 9 → 6, hose 7 → 5, and a per-tick chip floor on block.
- SAURION quill fan: 67 dps, infinite ammo, fires while running, no plant — the only ranged weapon with none of the three costs. Suggest ammo ≈24 or cooldown 0.9 → 1.4.
- FROGGER slimeBarrage: 11 globs × 24 with splash on 6.5 s — up to 264. Suggest count 11 → 7.
- GLACIER absoluteZero leaves a radius-14 freeze-on-entry sheet **for the whole round**. Nothing else claims map control for 180 s; suggest a 12–15 s life.
- SERPENT STORM re-pins on every later latch (the pin is deleted on expiry), so 60 snakes over 60 s can hold a 1v1 victim far past the stated 2.4 s. One pin per victim per cast.
- SONIC CROAK: 140 unblockable + 2.2 s paralysis in radius 30, re-pinned every frame so iframes cannot be earned. Let the pin respect iframes / allow a dash out.
- RAPTOR PACK spawns three `ace` AIs with full saurion kits (specials included) at 35% hp for 18 s. Suggest `dmgMult` 0.5 on minions and no specials. (With the AI role fix they now actually close and bite, which makes this more visible, not less.)
- Charged holds are free and mobile: titanus/colossus walk indefinitely with a banked full haymaker (97 dmg × 2.1, launch 10, 1.3× reach). Suggest a decay after `cap + 1s` or stamina drain while held.
- Weakest kits: viper/wraith (780/800 EHP, blockMult 0.2, L3 106), fenrir (pounce 65 on 5.5 s), wraith's 9 s cooldown on a 60-dmg utility special.

**E. Feel** — a blocked hit gives spark + sfx but zero hitstop and no pushback the attacker feels (0.02 s hitstop on block would sell it); light knocks on heavies are sub-visible after `weightKnockResist` (a viper knock 3 on titanus is 1.65 u/s — a post-resist floor of ~4 u/s would read); the charge tell only shows past 70% so the *player* has no read on their own charge (a small HUD arc); target lock in 3–4 player has no cycling except sniper shoves (tap LB while locked → next nearest).

**F. Brawl rule edge:** "last clean sheet" ends a 2-human + CPU round the moment both humans have died once, even 20 s in, with the CPU untouched. Consider requiring `timeLeft < 30` or a minimum round length.

### 2.2 Per-mech balance table (computed from `roster.js`)

walk = speed × 1.2 × 2.4 u/s · mass = weight × scale³ · EHP = hp/(1−armor) · L3 = sum of the light string · rDPS = sustained ranged dps on a held trigger

| id | hp | armor | EHP | walk | mass | blockMult | L3 | heavy | ranged | rDPS | mag (dmg) | special / cd | ult |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| titanus | 1250 | .22 | 1603 | 20.7 | 2.10 | .09 | 164 | 105 (168 charged) | fist | 23 | ∞ | grabThrow 88 / 8 | meteorBreaker 62×14 |
| vulcan | 950 | .10 | 1056 | 27.4 | 0.97 | .12 | 106 | 78 | gatling | **106** | 160 (1440) | missileVolley 132 / 6.5 | bulletHurricane ~276 |
| viper | 780 | 0 | 780 | 38.9 | 0.30 | .20 | 106 | 70 | blade | 40 | ∞ | bladeCyclone ≤120 / 6 | serpentStorm + poison + pin |
| rhino | 1150 | .18 | 1402 | 23.6 | 1.63 | .05 | 144 | 95 | shell | 43 | 14 (784) | bullRush 75 / 6.5 | stampede ~210–280 |
| tempest | 880 | .04 | 917 | 33.1 | 0.50 | .14 | 102 | 42×2 | lightning | 44 | 20 (800) | staticField 70 + stun / 7 | thunderfall ≈221 |
| fenrir | 900 | .05 | 947 | 36.0 | 0.52 | .13 | 108 | 76 | wave | 36 | 18 (648) | pounce 65 / 5.5 | wildHunt 20 wolves |
| colossus | 1300 | .24 | 1711 | 18.7 | 2.20 | .09 | 150 | 100 (160) | mortar | 40 | 10 (680) | grabThrow 85 / 8 | colossalForm 9 s |
| wraith | 800 | 0 | 800 | 31.7 | 0.37 | .20 | 106 | 68 | bats | 52 | 12 (936) | ghostWalk 60 / 9 | deathSwarm ≈280 |
| inferno | 1050 | .14 | 1221 | 25.3 | 1.23 | .11 | 128 (+burn) | 86 | flame | **72 + burn** | 130 (845) | napalm / 7.5 | fireTornado 130 |
| glacier | 1200 | .20 | 1500 | 21.6 | 1.75 | .10 | 138 | 92 | shard×6 | 68 | 22 (1716) | freezeBeam 180 + slow / 8 | absoluteZero (permanent) |
| cranky | 1300 | .26 | **1757** | **15.6** | 2.09 | .04 | 144 | 100 | hose | **93** | 150 (1050) | geyser ≈190 / 7 | tsunami 135 unblockable |
| saurion | 1080 | .06 | 1149 | 36.9 | 0.30 | .16 | 114 | 80 | spikes×3 | **67, ∞, run-and-gun** | ∞ | sickleRush ≈125 / 6 | raptorPack (3 ace AIs) |
| frogger | 1000 | .12 | 1136 | 30.2 | 0.67 | .14 | 106 | 78 | slime | 55 | 20 (942) | slimeBarrage **264** / 6.5 | sonicCroak 140 + 2.2 s |
| jerry | 980 | .08 | 1065 | 28.2 | 0.82 | .15 | 102 | 11×8 | goo | 41 | 16 (720) | fleaSwarm 156 / 7.5 | fleaCircus ≈64 dps |
| nullbot | 1020 | .08 | 1109 | 29.4 | 1.10 | .12 | 108 | 84 | glitch | 40 | 18 (540) | segfault 55 / 6.5 | systemCrash 50 |
| konga | 1200 | .15 | 1412 | 26.5 | 1.68 | .08 | 146 | 98 | salvo×10 | 62 | 12 (1560) | headSlam 96 / 8 | apexPound ≤876 |
| tritone | 1320 | .22 | 1692 | 24.2 | 1.50 | .06 | 124 | 90 | siege×2 | 52 | 14 (1176) | goreCharge ≤163 / 7 | siegeProtocol 96×20 |

`tuning.js` reads coherent: light hitstun 0.24 leaves a 4-frame gap in the light string (a true blockstring, not infinite), heavy hitstun 0.42 < heavy startup 0.52 so a heavy never combos off a light. The dash economy (B) and the guard arc (172°, no startup) are the two dials worth revisiting; the crouch hole and the strobe mattered more than the arc itself.

### 2.3 AI — still open

- The CPU reads `t.state === 'attack'` from frame 1 of startup (instant, probabilistic) and `t.blocking` (perfect info). A 0.1–0.2 s delay before a threat registers at rookie/veteran would let a jab land on a veteran who has not seen it yet. **Medium / small.**
- The CPU has **no hazard or prop awareness**: it walks down lava lanes after its target and bumps fuel tanks. On volcano and foundry fights against the CPU are decided by the floor. Sample `onLane/onPatch` a body-length ahead and steer around `lava/acid`; treat `propBodies` as obstacles. **High on two arenas / medium.**
- "Threat" includes taunts and ranged clips (both use `attack`), so the AI blocks a taunt; channel weapons stutter (the CPU re-triggers `doRanged` after each 0.1 s channel expiry: ~8.5 ticks/s vs 11–13 for a human). Small.

### 2.4 Smaller confirmed bugs, left for a later pass

- Saurion's pounce arc (`sickleRush`'s `hunt`) re-imposes its horizontal velocity every tick through a hitstun — a guard was added (same as fenrir's), but the 0.4 s takeoff iframes plus 0.5 s latch iframes still make anti-air mostly cosmetic.
- absoluteZero / staticField / sonicCroak freeze or stun a victim mid-ult, ending the ult with no damage involved (probably intended — listed so it is a decision).
- `ghostWalk` `finish()` teleports without a collision check (one-frame clip through a building).
- Tritone's volley spends ammo/cooldown at the trigger; an interrupt loses the shell.
- `die()` uses `setTimeout` (wall clock) for the secondary explosion — fires during pause.
- `_blockAbsorb`'s `ultFrom` argument is vestigial; `BLADE_REGROW_DELAY` (world.js) and `REGROW_DELAY` (fighter.js) describe one knob in two files.

---

## 3. Animation and rigging — open findings

### 3.1 Measured outliers (the repo's own tools; SwiftShader, ±10% on timing-sensitive totals)

**Ground penetration** (`tools/groundprobe.mjs`, lowest vertex under y=0 / the per-part allowance):
- tritone: 9 clips through the floor; **tritoneToss puts his jaw 2.39 under** (his own heavy — `floorGuard` lifts the render but the slam is authored to go down), intro toe 1.33, gore toe 1.06.
- jerry: **claws 1.9–2.2 under on every rake** and the intro; heavy 1.28.
- wraith: **rifle tip through the road on every two-handed smash** (heavy 0.97, groundPound 1.03; the shared clips swing both fists to the floor and his rifle is a rigid bone on the hand).
- fenrir: intro tail 1.72 (the shared biped intro crouch drops his hips onto his own tail; `tailFloor: true` on his manifest entry would clamp it as tritone's does).
- **The shared `intro` (hipsPos −1.5, knees 95°) is the common offender across five non-bipeds.** A per-gait intro depth, or a `hipsPos y` scaled by the rest knee bend, fixes four mechs at once. **Medium / small.**

**Arm carry** (`tools/armaudit.mjs`): konga's shared landing/knockdown/getup throw his arms behind him by 0.08–0.09 body heights (his arms are the roster's longest and the shared clips counter-balance with them). A `foreCarry` band on konga (the saurion mechanism, compile-time) fixes the three prone clips. Small.

**Strike timing** (`tools/striketime.mjs`): `viperDrill` fires its hit 0.18 s *after* the drill's forward peak (already retracting), `viperSlash1/2` 0.08–0.09 s after. Ten minutes of data: move the events to the peaks the tool prints. Saurion's and jerry's forms are on time. Small.

**Foot planting** (`tools/footprobe.mjs`, stance-foot speed / body speed — titanus is the baseline at 43%): viper 61%, **fenrir 90%** — at the gallop the "stance" paw moves at nine tenths of the body (the walk screenshot shows all four paws in the air). The quad path also skips `calibrateFeet`'s damping and has no per-side sole clearance driving the pelvis follow. Tune `quad.hindSwing`/`stride` with the gait workbench. Medium.

**Ankle placement** (`tools/ankleprobe.mjs`): six mechs walk with the ankle gain at 0.25–0.47 and `footFlat` 1.0 (cranky 54% of height, titanus 13.5%, rhino/tritone/inferno 12%, frogger 11%) — toe-off at a quarter to a half of what the gait was tuned for, the "heavy mechs shuffle" read. The documented fix (move the ankle bone to the sole plate, rig or bake) has not been applied to any of them. Glacier (25%) and saurion (30%) have L/R ankle-height mismatches, so one foot rolls deeper each stride. Medium each, measurable.

**Leg splay** (`tools/legsplay.mjs`): wraith 8.0/4.0 standing (right ankle swings 28° inboard at a run), saurion 9.7/1.7, konga knees 13.8/2.8 — one knee bowed, one straight, visible from the front. `boneCorrections` per side, as viper's were done.

**Skin** (`tools/skindebug.mjs` severity): viper 944 (every big joint 57–77, uniformly hard auto-rig weights — the `feather` pass that took konga from 1851 to 280 is the proven tool), saurion 603 (the known neck island), konga 382, jerry 162.

**Hurtbox** (`tools/hurtboxfit.mjs`): frogger's capsules are **2.56×** his rendered volume and rhino's 1.83× (extra `x:<bone>` capsules far out on the limbs); titanus containment 66% (pauldrons and fists outside every capsule). The target is bloat near 1.0.

**Retarget** (`tools/retargetfit.mjs`): cranky 4.5 body-heights over the 12 limb joints — expected (his game legs are the back crab pair) but it means every leg clip retargets from 0.7 body-heights away; his kicks/land/getup/intro deserve hexapod overrides like his taunt and block already have.

### 3.2 Bugs still open

| # | Finding | Where | Fix | Impact / effort |
|---|---|---|---|---|
| A1 | Saurion's head stabilisation is dead code (direct `J.head.rotation` writes before `applyPose` overwrites them; the function's own comment says so eight lines later) | `signatures.js` ~200 | write into `tgt.head` — then *judge it*, it has never been seen | low / tiny |
| A2 | Vulcan's gatlings and colossus' mortars never animate on the shipped GLBs (signatures guard on procedural joints `J.gatlingR`/`J.mortars`; the baked bones exist under other names) | `signatures.js` | name the barrel/tube bones and use `anim.part()` | medium / small |
| A3 | `tritonePoundGlb` compiles under `groundPound` with the *slam's* events (`hit` instead of `fire`) — harmless today (only reached from the plunge landing), breaks any future `fire`-driven use | `animations.js` | give the variant the pound's event list | low / tiny |
| A4 | Saurion's shipped tail is rigid (nothing animates `tripoSpine_0`; the `tail` gait group exists only on `quad`) | gaits / manifest | a `tail` block on his gait + declare the chain | medium / small |
| A5 | `viperTaunt` is 7.8 s, held under `attack` unless a stick cancels it — the longest clip in the game | `animations.js` | half the loops | low / tiny |
| A6 | `rigs/rhino.rig.js` is registered but no manifest entry names it (rhino was baked) | `rigs/index.js` | delete | none / tiny |

### 3.3 Polish, ranked by value for effort

1. **Clip-to-clip crossfade.** `Animator.play` discards the previous action and ramps the new one from weight 0 over 0.07 s, so a light combo dips toward the *gait/rest* pose between punches and a flinch interrupting a swing snaps through neutral. Keep the outgoing action as `prev` and lerp `prev → next` over the fade. Medium effort; every combo reads tighter.
2. **Directional hit reactions.** `takeHit` plays one `hitFlinch` whatever the direction and already has `dirX/dirZ`; pick flinch / flinchL / flinchR / flinchBack off the dot with the facing (`mirrorRaw` gives the L/R twin free) and put the impulse on torso roll for side hits. Small effort, big legibility win in a four-player brawl.
3. **Per-gait intro** (see 3.1). Small.
4. **Foot planting on slopes / rooftops.** `applyToeHang` levels the sole against the body's up and the pelvis follow nulls the lower foot's clearance — on a slope one foot floats and the other sinks. Raycast under each ankle and hand `env.footClr` the local ground difference. Medium.
5. **Turn-in-place.** Standing still and turning yaws the whole body with the idle sway underneath; a two-key turn loop or a hip lead through the existing `legFrame` machinery. Medium.
6. **Idle variety.** One breathing sine per body; two or three 3–4 s flourishes per gait family after ~6 s still cost only data. Small.
7. **Landing scales with fall.** `land` is one 0.62 s crouch whether the drop was 3 units or 30; drive its speed off `fallSpeed`. Small.
8. **Worst-looking mechs by the numbers:** tritone (floor, horns — half fixed here, skull dive on his own heavy), jerry (claws under the road on every rake), viper (skin 944), wraith (rifle through the road, asymmetric legs), konga (arms back in prone clips, knee asymmetry).

---

## 4. Arenas — open findings

Shipped configuration: `authored` mode, only **neon** is hand-built; the other eleven are WARDS rolls with a fresh seed, and a best-of-three rotates through three arenas.

### 4.1 What the pictures say (`docs/audit/arena-overheads.jpg`)

| arena | read |
|---|---|
| **neon** (authored) | Best-composed city: three roads, canal, monorail loop, massed blocks, plaza ring painted. Both spawn pads sat under the torii gates (fixed by pad validation). Eye level: facade tile repeats on every tower, plaza is bare asphalt. |
| **volcano** | Best overhead and best at eye level: lava-lane grid, four organic lakes, basalt mounds, ember light. A black rectangle sits in the sky at top-centre at eye level (looks like an opaque block in the horizon strip — check at a few yaws). |
| **quarry** | Crystal fields, veins, black outcrop, tailings pond — reads as a place. The grey industrial sheds look pasted in; the terrace hills read as flat purple ellipses from the chase camera. |
| **ruins** | Legible dig site; gate on the processional way, sphinxes flanking (0° facing error). Good. |
| **jungle** | River, temples, groves; coherent but flat (pools are blue discs, trees are low cones). |
| **skyterrace / orbital** | Legible — and **compositionally the same arena** (deck + two stripes + platforms + ring, no hazard, no landform). Sky Terrace's blurb promises a drop that cannot exist on a torus. |
| **uptown** | Washed out from above (pale paving, sun 2.7); the "park" is a 10-unit pond disc and three lawn decals. |
| **foundry / harbor / scrapyard** | Read as empty lots: WARDS puts the mass in the outer wards and the ring the fight actually orbits (C+6 to C+30) is bare. Harbor is the emptiest arena in the game. Scrapyard's rust facades render near-white from above (`tintFor` lerps 68% to white when a pack facade is on). |
| **frozen** | Nearly value-less from above: drifts, lakes, hills and river are the same pale disc; the icebergs are the only readable mass. **And none of the ice does anything** (`KINDS.ice.hazard = null`). |

Seven arenas paint no plaza ring (`plaza: true` only on neon, uptown, skyterrace, ruins, orbital) and they are the seven hardest to orient in.

Mechanic inventory: lava on 2 arenas, bog (water/mud/oil) on 7, explosives on 5, spikes on 1, campfires on 3, viaduct on 3, landforms on 3, ice/sand/ash/grass/crystal/stripe **paint only**. So the arenas mostly look different rather than play different; only foundry and volcano carry real risk.

### 4.2 Bugs still open

| # | Finding | Where | Fix | Impact / effort |
|---|---|---|---|---|
| R1 | Thin props have **no collider**: a prop only gets a body when `r > 0.4 && h/max(rx,rz) > 0.35`, so trees, palms, billboard masts, streetlights and ferns are walk-through (a 12-unit billboard mast included) | `arena.js` `_regProp` | drop the `r > 0.4` floor for pole-band props and register `r = max(0.7, rl × 0.72)` with the shell | medium / small |
| R2 | `antennaTower` collider phantom skin = 10 units (three splayed legs + a beacon at 30 units; the cylinder is measured tall and thin against mostly air) | prop manifest | `userData.bodies` (three legs) or `noCollide` above the leg band | low / small |
| R3 | The prop planners still *place* solids inside the clearing (`propSpotOk`/`makeGateOk` accept r ≥ 16, gates at C+5 nudged along the lane) — pad validation now steps around them, but a gate on the ring is still a gate on the ring | `arena.js:512`, `designs/util.js` | reject `hypot < C − 4` for anything with a collider; gates at C + 8 | medium / small |
| R4 | Camera has no pushout against solids (relies entirely on the dither fade, which the spectator harness disables) — worth one manual check on frozen with an iceberg between you and the enemy; if the ice does not fade, `iceGlass` (transparent, `depthWrite: true`) is the suspect | `camera.js` | — | unknown / small to check |
| R5 | The sky/hill/bridge/structure materials are still not disposed on the per-round swap (the overlay textures, the big one, now are) | `arena.js dispose` | traverse and dispose owned materials, guarding the shared pack | low / small |

### 4.3 Design, ranked by value for effort

1. **Make ice a rule (frozen).** `KINDS.ice.hazard = 'ice'`, `PATCH_HAZ.ice = 'ice'`, and in `Terrain.updateHazards` cut steering/friction (lerp `vel` toward its previous value, dash carries further). Twenty lines; the arena with the most terrain paint plays like nothing else.
2. **Paint the plaza everywhere.** `plaza: true` on foundry, harbor, scrapyard, quarry, volcano, frozen, jungle — one line each, the one landmark every arena shares.
3. **Split the twins.** Sky Terrace: a `void` patch kind painted as sky between the deck platforms (fall in → respawn on the ring at a cost) so the skybridges become the only dry routes. Orbital: a `lowGrav` patch kind on the deck pads, and let the cryo tanks vent a freeze cloud. Both are one new patch kind with one rule; the design systems and the editor pick patch kinds up from the theme list unchanged.
4. **Fill the mid ring on foundry / harbor / scrapyard.** Port circuit's inner ring of low cover pods into wards as an option, or raise `buildings.count` 8 → 12 on those three (36 sites, still under the 3600-chunk purse — worst measured 2850). Harbor: one big organic basin instead of two stamped discs, containers as clumps, trawlers as cover.
5. **Frozen legibility.** Lower the snow-drift tint or exempt the snow family from bloom; give ice a darker rim so a lake reads against snow.
6. **Scrapyard / harbor palette.** A lower white-lerp (0.4) on those two so the theme tints survive the pack facade.
7. **Give the CPU a floor sense** (2.3).
8. **Landmarks that survive the wrap.** Hero props are placed 16–26 from a ward centre with no sightline rule; require `sightlineClear` from the origin as the flanks already do, on the side opposite the tower ward.
9. **Rotation variety.** `prepareNextArena` picks any other theme; exclude the previous round's twin (skyterrace↔orbital, uptown↔harbor).
10. **Per-arena notes:** neon — two or three kiosks inside the ring; foundry — tanks out to `ring: [26, 40]`, three bridges over the lava; uptown — one organic pond with the bandshell on its shore; quarry — `terrace/dome` massing only; ruins — sand pits `organic: 0.6`; jungle — mud pools organic, gates at C+8; volcano — already the best-playing arena.

---

## 5. Menus, HUD, controls — open findings

`docs/audit/ui-screens.jpg` shows the screens referred to here.

### 5.1 The keyboard gap (the biggest open UX item)

A keyboard player has **no camera at all** in the combined view: no orbit, no pitch, no zoom, no target lock (`intent.lockOn = false; intent.sniper = false`). The combined-view azimuth is aimed once at round start and after that "only the right stick turns it"; a CPU that circles behind you is off-screen for the rest of the round. The keyboard also loses the lock crosshair, lead aim, sniper scope, aimed ranged shots and prop targeting. It gets two things pads do not (an explicit duck on C and the Q camera-strafe). Net: the solo-vs-CPU mode a new player starts in is the one where the keyboard is second-class.

Cheapest first: (1) give keyboards the LB behaviour on a key (Tab, or a Q *tap*) — the lock already steers the camera; (2) mouse-look while the left button is held / under pointer lock, feeding `applyLook`; (3) map Q/E or ←/→ to `applyLook(±x)`. **High / small for (1).**

### 5.2 Bugs still open

| # | Finding | Where | Fix | Impact / effort |
|---|---|---|---|---|
| U1 | Combined-view plates collide with the bottom-right chrome: with 3–4 fighters and one human the BR plate sits exactly where `#toast-layer` and `#now-playing` live; at 540p the now-playing chip overlaps the plate and every pad toast paints over the CPU's health | `hud.js:139`, `style.css:549-565` | put the chip/toasts above the plates, or stack CPU plates under the human's | medium / small |
| U2 | Warm-up hint overlaps the right-most fighter's quote (`.wu-loading` bottom-right vs `.wu-cap` at bottom 4vh) | `style.css:627` | centre the hint under the progress bar or pad `.wu-cap` | low / tiny |
| U3 | SFX VOLUME "100%" is drawn as 2 of 10 blocks (the ceiling is 5× the default) — reads as 20%; the selected settings row scales 1.08 and its cursor arrows crash into the slider's own chevrons | `boot.js settingsItems`, `.menu-item.selected` | draw 0–100% with the ceiling as an "amplified" zone; stop scaling the selected row | low / small |
| U4 | Hint bars are pad-only vocabulary even for a keyboard seat ("A JOIN · D-PAD PICK · B CANCEL"; ready chip "PRESS A"); KB2's Numpad-1 join is discoverable only from the README | `menus.js`, `text.js` | device-aware hint line from the seats present; "KEYBOARD 2: NUMPAD 1 TO JOIN" on the empty card | medium / small |
| U5 | Arena blurbs live only in `title=` tooltips — a pad user never sees them | `menus.js:970,991` | caption under the grid for the selected card | low / tiny |
| U6 | The players row jumps ~14 px whenever the "EDITING" tag appears on a card | `menus.js` | reserve the line | low / tiny |
| U7 | KB2 has no pause key; Numpad9 (KB2 "RB") and pad BACK do nothing in battle | `input.js` | — | low |
| U8 | Docs still: `pause.controls.html` keeps `title.hint.html` "for anyone who wants it back" but nothing shows keyboard menu keys anywhere | `text.js` | — | low |

### 5.3 Recommendations, ranked by value for effort

1. **Keyboard camera + lock** (5.1).
2. **Say the keys on the screen the keys are used on** (U4) and print the pause key on the HUD once at FIGHT.
3. **Three accessibility rows** (persisted through `readPref`): SCREEN SHAKE on/off (one multiplier on `effects.addShake`), TEXT SIZE S/M/L (a root `font-size` scale — the 9.5–11 px card/hint text is the pain point), COLOUR-BLIND PLAYER COLOURS (P2 red vs P3 green is the only cue besides the number; HP bars go green→red at 30%). Honour `prefers-reduced-motion`.
4. **Results screen with information and a full loop**: rounds won, KOs/deaths, time; CHANGE ARENA that keeps the picks (CHANGE MECHS forgets them today); a "next arena" preview since the match already preloads one.
5. **Move list / mech sheet**: the select card lists move names; one line each of what they do (cooldown, ammo, damage class) — `roster.js` has the numbers and the export's `characters.md` already renders them.
6. **Onboarding**: the warm-up sandbox is a tutorial in disguise — contextual prompts (MOVE ✓ → JUMP ✓ → HOVER ✓ → LIGHT ✓ → BLOCK ✓ → DASH ✓, per device), a longer `minT` on the first-ever match, and a "MASH A" prompt over a downed human the first two times.
7. **Practice mode**: a TRAINING tile that runs `startBattle` with `roundTime = Infinity`, a passive CPU tier (`aggression: 0`), infinite charges and damage popups. Most of it is `CONFIG` already.
8. **Difficulty feedback**: the tier on the CPU plate ("CPU · ACE") and on results; after a 2-0 loss to ROOKIE, offer VETERAN; a persisted last line-up so a returning player's slots and colours come back.
9. **Quick play**: a title-screen QUICK MATCH = random mech, random arena, last difficulty — the predictor already pre-rolls both.
10. **Pad hot-plug during a fight**: "press START to join next round" and a `slots` edit at round start; today a late pad can only join after QUIT TO MENU.
11. **A one-second "ROUND 2 — <arena>" card** before the intro so the per-round arena swap reads as intentional.

---

## 6. Code factoring (secondary)

The code is in better shape than its file sizes suggest — only four `def.id === '…'` branches in all of `src/`, hot paths use module scratch vectors, all 102 URL params and 76 roster keys are read, and the workbench reaches the game only through the adapter. The debt is concentrated in four container files, a tools tree that repeats one harness 163 times, and the absence of any check that runs without a browser or on CI.

| # | Item | Effort | Value |
|---|---|---|---|
| 1 | **`npm run check`** — pure-node tools (`params`, `rigmirror`) + `node --test` over the data modules that already import cleanly under plain node (tuning, config, utils, text, knobs, gaits, roster, animations, contract, colorscheme, skinops, themes, level, massing, proptraits, hurtbox) — run in `deploy.yml` before the build. First tests: every roster `special.id`/`ult.id` has a handler and vice versa (would have flagged the eight dead handlers below); every `lightClips`/`heavyClip`/`clipOverrides` name exists; `validateMech` for all 17; every gait key is in `GAIT_SCHEMA`; every roster/theme id has text; the level bake round-trips a fixture. Then make the printing tools that *are* checks (`brawl.mjs` prints JSON and exits 0 whatever the numbers say; `hurtboxfit`, `propshell`) exit non-zero. | ½ day | catches the whole class of "retired mech left behind" bugs on every push |
| 2 | **Delete the retired-mech leftovers**: eight special/ult handlers no mech names (`groundPound`, `shieldBash`, `starfall`, `barrage`, `cloak`, `chestBeat`, `judgment`, `supernova` — ~330 lines), `updateNovaAura` + four `nova` branches in fighter.js (one evaluated on every hit), eight aegis/nova clips, `WEAPONS.plasma/dart/rocket/spear/railgun/flea/groundpound` in world.js, `src/dev/mechpick.js` / `altpick.js` (zero importers; CLAUDE.md still names them as owners), dead utils exports (`Pool`, `invLerp`, `distXZ`, `randInt`, `removeFromArray`). | 1 hr | code that reads as live and is not |
| 3 | **One `tools/lib/browser.mjs`**: the same `chromium.launch({executablePath: '/opt/pw-browsers/chromium', …})` block is in 163 files, so a second contributor on a Mac cannot run a single check. `PW_CHROMIUM` env var. | ½ day | the whole test suite becomes portable |
| 4 | **`specials.js` → `src/combat/specials/<mech>.js` + `shared.js` + `summons.js`**: dispatch is already `SPECIALS[sp.id]`, ids are per-mech, `finisher/shared.js` is the precedent; `GORE_*` (tritone's balance) moves into his roster block. | 1 day | a 3.1k-line file becomes a parallel-agent-safe fan-out |
| 5 | **`fighter.js` split** along the seams `climb.js`/`aim.js`/`gunaim.js` already use: taunts (~600 lines, roster-flag gated), melee (~1,500), damage/status (~550) + nullbot glitch (~180), ranged, sfx (~80), air/guard, locomotion. `update()` is 880 lines / 139 ifs; the class has 118 methods and 181 `this.*` fields, 104 born outside the constructor. The post-pose ORDER (retarget sync → gun aim → climb limbs, floor guard never with the prone clamp) is the one part that must stay together and is enforced by comments only. | 2–3 days | halves the file; the state each group touches is listed in the branch notes |
| 6 | Per-mech clip tables out of `animations.js` (~1.4k of 3.1k lines are `*_TAUNT`/`*_GLB` raws) into `mechs/clips/<id>.js`; `PROPS` (105 builders, one 2.4k-line literal on the parallel-agent list) split by family. | ½ day + 2 hrs | merge-conflict magnets |
| 7 | Promote the fighter privates other modules read (`_charging`, `_chargeT`, `_lockAim`, `_carry`, `_shotSide`…: specials.js reads 22, climb.js 22, world/ai/camera 8 each) to declared fields. | 2 hrs | the API is real, just undeclared |
| 8 | Fold the 29 magic constants at the top of fighter.js and `GORE_*` into tuning.js/roster; three gravities exist (fighter 34, ragdoll 32, fleas 40, jets 28). fighter.js snapshots TUNING by value at import (why `rw.tune` reloads) while climb.js holds a live reference — pick the live one. | 1 hr | one number, one place |
| 9 | `CLAUDE.md` is 2,898 lines with the Architecture map at line ~2,600 behind 2,500 lines of per-feature essays (several naming dead files). Move the essays to `docs/<feature>.md`; keep commands, map, rules, and a one-line index. | ½ day | onboarding |

Also noted: `tools/gaitprobe.mjs` — the documented judge for gaits — died with "Execution context was destroyed" on every run during this audit. Every failure coincided with a source or `public/` edit landing while the page was up, i.e. Vite's full reload; it needs re-running on a quiet tree before calling it broken, but if it still fails the workbench's own `location.href` navigations on load (`panel.js`, `subjectpick.js`, `variantpick.js`) are the suspects.

---

## 7. Suggested order

1. **Decide the kinetic-impact dials and OTG rule** (2.1 A) — the single biggest change to how the neutral game feels, and it is three numbers plus a prompt.
2. **Keyboard lock + camera** (5.1) — one key, reuses the pad path.
3. **Weapon outliers** (2.1 D) — gatling/hose/flame/quill/slime/ice sheet, each a roster number.
4. **Ice as a rule + plaza paint + twins split** (4.3 1–3) — cheap, and it is what makes the arenas play differently.
5. **Crossfade + directional flinch** (3.3 1–2) — the two animation changes every fight shows.
6. **Onboarding prompts in the warm-up + move list** (5.3 5–6).
7. **`npm run check` and the dead-code sweep** (6.1–2) — so the next pass finds these things before a player does.
