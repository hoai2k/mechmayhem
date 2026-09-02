# MECH MAYHEM — game audit

A pass over the whole game as a player meets it: combat and the battle system,
the AI, animation and rigging, the twelve arenas, menus / HUD / controls, and
(secondarily) how the code is factored. Every claim here was verified against
the code or measured with the repo's own tools.

**This half of the document is what is still OPEN.** Everything already done
is logged at the end, in section 8, with its measurements — so the front of
the file is only ever the work that is left.

Pictures: `docs/audit/arena-overheads.jpg` (all twelve arenas from above) and
`docs/audit/ui-screens.jpg` (the menu screens). Both were shot BEFORE the
arena pass, so section 5.1 says where the picture is now out of date.

How to read the tables: **Impact** is what the player feels, **Effort** is a
rough size for the change.

---

## 0. Where it stands

Three passes have landed (section 8). The guard, the AI's reads, the hip
animation every shipped body was dropping, arena placement, the menu flow,
kinetic impact, the dash economy, the input buffer, ice/void/low-gravity, and
a training mode are all done and measured.

What is left divides into three kinds:

- **Decisions.** The weapon outliers were deliberately left alone (2.1); that
  decision is worth revisiting once the kinetic-impact and dash changes have
  been played, since both moved the same fight.
- **Polish with a measured number attached.** Clips through the floor, foot
  planting, hurtbox bloat, skin severity — every one has a tool that prints
  the number, so each is a short job with a pass/fail (section 3).
- **Structural work.** Splitting `specials.js` and `fighter.js`, and trimming
  `CLAUDE.md` (section 7). None of it is player-facing.

The shortlist, if you want an order:

1. **Play a match first.** Kinetic impact, the dash economy and the input
   buffer all changed how neutral feels, and three of the twelve arenas now
   have a rule they did not have. Nothing below is worth deciding before that.
2. **A "MASH A" prompt over a downed human** the first two times (2.4) — the
   escape jump exists, is now genuinely needed, and nothing in the game says so.
3. **Clips through the floor** (3.1): jerry's claws and wraith's rifle, the
   two worst that survived the intro fix.
4. **The three animation polish items** (3.3): slope foot planting,
   turn-in-place, landing that scales with the fall.
5. **The remaining arena bugs** (5.2): thin props with no collider, and the
   prop planners still placing solids inside the spawn clearing.
6. **`specials.js` → one file per mech** (7) — the biggest single readability
   win left, and it follows a precedent the repo already set twice.

---

## 1. Open — decisions that need your call

### 1.1 The weapon outliers (considered and declined, September 2026)

Reviewed and deliberately left as they are, except the four marked below.
Recorded because "looked at and kept" is worth knowing later. The per-mech
numbers are in 2.1.

- VULCAN gatling 106 sustained dps, 1440 per magazine (more than any mech's
  effective HP); CRANKY hose 93; INFERNO flame 72 + burn. Blocking leaks only
  4–20% but drains the bar in 7 s. Suggested then: gatling 9 → 6, hose 7 → 5,
  and a per-tick chip floor on block.
- SAURION quill fan: 67 dps, infinite ammo, fires while running, no plant —
  the only ranged weapon with none of the three costs. Suggested: ammo ≈24, or
  cooldown 0.9 → 1.4.
- FROGGER slimeBarrage: 11 globs × 24 with splash on a 6.5 s cooldown, up to
  264. Suggested: count 11 → 7.
- GLACIER absoluteZero leaves a radius-14 freeze-on-entry sheet **for the
  whole round**. Nothing else in the game claims map control for 180 s.
  Suggested: a 12–15 s life.
- Charged holds are free and mobile: titanus and colossus can walk
  indefinitely with a banked full haymaker (97 damage × 2.1, launch 10, 1.3×
  reach). Suggested: decay after `cap + 1 s`, or stamina drain while held.
- **Done instead:** serpent storm pins each victim once per cast; raptor-pack
  minions throw no specials; wraith's ghost walk cooldown 9 → 7; viper's and
  wraith's guard leak 0.20 → 0.15 (the two weakest kits).

### 1.2 Feel, small and cheap

- A **blocked hit** gives a spark and a sound but zero hitstop and no pushback
  the attacker feels. 0.02 s of hitstop on block would sell it.
- **Light knocks on heavies are sub-visible** after `weightKnockResist`: a
  viper knock of 3 on titanus is 1.65 u/s. A post-resist floor around 4 u/s
  would make a jab read as contact.
- **The charge tell only shows past 70%**, so the *player* has no read on
  their own charge below that. A small HUD arc would fix it.
- **Target lock has no cycling** in 3–4 player except sniper shoves. Tap LB
  while locked → next nearest.

### 1.3 A brawl rule edge

"Last clean sheet" ends a 2-human + CPU round the moment both humans have died
once — even 20 s in, with the CPU untouched. Consider requiring `timeLeft < 30`
or a minimum round length before the rule can fire.

---

## 2. Open — combat and balance

### 2.1 Per-mech balance table (computed from `roster.js`)

walk = speed × 1.2 × 2.4 u/s · mass = weight × scale³ · EHP = hp/(1−armor) ·
L3 = sum of the light string · rDPS = sustained ranged dps on a held trigger

| id | hp | armor | EHP | walk | mass | blockMult | L3 | heavy | ranged | rDPS | mag (dmg) | special / cd | ult |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| titanus | 1250 | .22 | 1603 | 20.7 | 2.10 | .09 | 164 | 105 (168 charged) | fist | 23 | ∞ | grabThrow 88 / 8 | meteorBreaker 62×14 |
| vulcan | 950 | .10 | 1056 | 27.4 | 0.97 | .12 | 106 | 78 | gatling | **106** | 160 (1440) | missileVolley 132 / 6.5 | bulletHurricane ~276 |
| viper | 780 | 0 | 780 | 38.9 | 0.30 | .15 | 106 | 70 | blade | 40 | ∞ | bladeCyclone ≤120 / 6 | serpentStorm + poison + pin |
| rhino | 1150 | .18 | 1402 | 23.6 | 1.63 | .05 | 144 | 95 | shell | 43 | 14 (784) | bullRush 75 / 6.5 | stampede ~210–280 |
| tempest | 880 | .04 | 917 | 33.1 | 0.50 | .14 | 102 | 42×2 | lightning | 44 | 20 (800) | staticField 70 + stun / 7 | thunderfall ≈221 |
| fenrir | 900 | .05 | 947 | 36.0 | 0.52 | .13 | 108 | 76 | wave | 36 | 18 (648) | pounce 65 / 5.5 | wildHunt 20 wolves |
| colossus | 1300 | .24 | 1711 | 18.7 | 2.20 | .09 | 150 | 100 (160) | mortar | 40 | 10 (680) | grabThrow 85 / 8 | colossalForm 9 s |
| wraith | 800 | 0 | 800 | 31.7 | 0.37 | .15 | 106 | 68 | bats | 52 | 12 (936) | ghostWalk 60 / 7 | deathSwarm ≈280 |
| inferno | 1050 | .14 | 1221 | 25.3 | 1.23 | .11 | 128 (+burn) | 86 | flame | **72 + burn** | 130 (845) | napalm / 7.5 | fireTornado 130 |
| glacier | 1200 | .20 | 1500 | 21.6 | 1.75 | .10 | 138 | 92 | shard×6 | 68 | 22 (1716) | freezeBeam 180 + slow / 8 | absoluteZero (permanent) |
| cranky | 1300 | .26 | **1757** | **15.6** | 2.09 | .04 | 144 | 100 | hose | **93** | 150 (1050) | geyser ≈190 / 7 | tsunami 135 unblockable |
| saurion | 1080 | .06 | 1149 | 36.9 | 0.30 | .16 | 114 | 80 | spikes×3 | **67, ∞, run-and-gun** | ∞ | sickleRush ≈125 / 6 | raptorPack (3 ace AIs) |
| frogger | 1000 | .12 | 1136 | 30.2 | 0.67 | .14 | 106 | 78 | slime | 55 | 20 (942) | slimeBarrage **264** / 6.5 | sonicCroak 140 + 2.2 s |
| jerry | 980 | .08 | 1065 | 28.2 | 0.82 | .15 | 102 | 11×8 | goo | 41 | 16 (720) | fleaSwarm 156 / 7.5 | fleaCircus ≈64 dps |
| nullbot | 1020 | .08 | 1109 | 29.4 | 1.10 | .12 | 108 | 84 | glitch | 40 | 18 (540) | segfault 55 / 6.5 | systemCrash 50 |
| konga | 1200 | .15 | 1412 | 26.5 | 1.68 | .08 | 146 | 98 | salvo×10 | 62 | 12 (1560) | headSlam 96 / 8 | apexPound ≤876 |
| tritone | 1320 | .22 | 1692 | 24.2 | 1.50 | .06 | 124 | 90 | siege×2 | 52 | 14 (1176) | goreCharge ≤163 / 7 | siegeProtocol 96×20 |

`tuning.js` reads coherent: light hitstun 0.24 leaves a 4-frame gap in the
light string (a true blockstring, not infinite), and heavy hitstun 0.42 is
under the heavy's 0.52 startup so a heavy never combos off a light. The guard
arc (172°, no startup) is the one dial left worth revisiting — though the
crouch hole and the empty-tank strobe, both fixed, mattered far more than the
number.

### 2.2 AI — still open

- The CPU reads `t.state === 'attack'` from frame 1 of startup (instant, and
  probabilistic) and `t.blocking` (perfect information). A 0.1–0.2 s delay
  before a threat registers at rookie and veteran would let a jab land on a
  CPU that has not seen it yet. **Medium / small.**
- "Threat" includes taunts and ranged clips (both use the `attack` state), so
  the AI blocks a taunt. Small.
- Channel weapons stutter: the CPU re-triggers `doRanged` after each 0.1 s
  channel expiry, ~8.5 ticks/s against 11–13 for a human. Small.

### 2.3 Smaller confirmed bugs

- **No "MASH A" prompt** over a downed human. The escape jump exists and the
  knockdown now grants 0.3 s of iframes, but nothing in the game's text says
  the escape is there. First two knockdowns per player would do it.
- Saurion's pounce arc (`sickleRush`'s `hunt`) re-imposes its horizontal
  velocity every tick through a hitstun. A cancel guard was added, but 0.4 s
  of takeoff iframes plus 0.5 s of latch iframes still make anti-air mostly
  cosmetic.
- absoluteZero / staticField / sonicCroak freeze or stun a victim mid-ult,
  ending the ult with no damage involved (probably intended — listed so it is
  a decision).
- `ghostWalk`'s `finish()` teleports without a collision check: one frame
  clipped through a building.
- Tritone's volley spends ammo and cooldown at the trigger; an interrupt loses
  the shell.
- `die()` uses `setTimeout` (wall clock) for the secondary explosion, so it
  fires during a pause.
- `_blockAbsorb`'s `ultFrom` argument is vestigial; `BLADE_REGROW_DELAY`
  (world.js) and `REGROW_DELAY` (fighter.js) describe one knob in two files.

---

## 3. Open — animation and rigging

### 3.1 Measured outliers (the repo's own tools; SwiftShader, ±10% on timing-sensitive totals)

**Ground penetration** (`tools/groundprobe.mjs` — lowest vertex under y=0
against the per-part allowance). The shared intro crouch was the common
offender and is fixed; what is left is per-mech:

- **jerry: claws 1.9–2.2 under on every rake**, heavy 1.28. The worst
  remaining, and it is his ordinary light attack.
- **wraith: the rifle tip goes through the road on every two-handed smash**
  (heavy 0.97, groundPound 1.03). The shared clips swing both fists to the
  floor and his rifle is a rigid bone on the hand.
- tritone: `tritoneToss` puts his jaw 2.39 under — his own heavy, and the slam
  is authored to go down, so this one may be correct as it stands.
- tritone's hand (0.50) and cranky's pincer (0.66) still graze their limits
  (0.40 / 0.45) in the intro after the per-gait crouch fix.

**Arm carry** (`tools/armaudit.mjs`): konga's shared landing, knockdown and
getup throw his arms behind him by 0.08–0.09 body heights — his arms are the
roster's longest and the shared clips counter-balance with them. A `foreCarry`
band on konga (the saurion mechanism, at compile time) fixes all three. Small.

**Strike timing** (`tools/striketime.mjs`): `viperDrill` fires its hit 0.18 s
*after* the drill's forward peak, when it is already retracting;
`viperSlash1/2` 0.08–0.09 s after. Ten minutes of work — move the events to
the peaks the tool prints. Saurion's and jerry's forms are on time.

**Foot planting** (`tools/footprobe.mjs`, stance-foot speed ÷ body speed;
titanus is the baseline at 43%): viper 61%, **fenrir 90%** — at the gallop the
"stance" paw moves at nine tenths of the body. The quad path also skips
`calibrateFeet`'s damping and has no per-side sole clearance driving the
pelvis follow. Tune `quad.hindSwing`/`stride` in the gait workbench. Medium.

**Ankle placement** (`tools/ankleprobe.mjs`): six mechs walk with the ankle
gain at 0.25–0.47 and `footFlat` 1.0 (cranky 54% of height, titanus 13.5%,
rhino/tritone/inferno 12%, frogger 11%) — toe-off at a quarter to a half of
what the gait was tuned for, which is the "heavy mechs shuffle" read. The
documented fix (move the ankle bone to the sole plate, in the rig or a bake)
has not been applied to any of them. Glacier (25%) and saurion (30%) have L/R
ankle-height mismatches, so one foot rolls deeper than the other every stride.

**Leg splay** (`tools/legsplay.mjs`): wraith 8.0/4.0 standing with the right
ankle swinging 28° inboard at a run; saurion 9.7/1.7; konga's knees 13.8/2.8 —
one bowed, one straight, visible from the front. `boneCorrections` per side,
as viper's were done.

**Skin** (`tools/skindebug.mjs` severity): viper 944 — every big joint 57–77,
uniformly hard auto-rig weights, and the `feather` pass that took konga from
1851 to 280 is the proven tool. Then saurion 603 (the known neck island),
konga 382, jerry 162.

**Hurtbox** (`tools/hurtboxfit.mjs`): frogger's capsules are **2.56×** his
rendered volume and rhino's 1.83× (extra `x:<bone>` capsules far out on the
limbs); titanus' containment is 66%, with the pauldrons and fists outside
every capsule. The target is bloat near 1.0.

**Retarget** (`tools/retargetfit.mjs`): cranky 4.5 body-heights over the 12
limb joints. Expected — his game legs are the back crab pair — but it means
every leg clip retargets from 0.7 body-heights away, so his kicks, land, getup
and intro deserve hexapod overrides the way his taunt and block already have.

### 3.2 Bugs

| # | Finding | Where | Fix | Impact / effort |
|---|---|---|---|---|
| A1 | Saurion's head stabilisation is dead code — direct `J.head.rotation` writes before `applyPose` overwrites them, and the function's own comment says so eight lines later | `signatures.js` ~200 | write into `tgt.head`, then *judge it*: it has never been seen | low / tiny |
| A2 | Vulcan's gatlings and colossus' mortars never animate on the shipped GLBs (the signatures guard on procedural joints `J.gatlingR` / `J.mortars`; the baked bones exist under other names) | `signatures.js` | name the barrel/tube bones and use `anim.part()` | medium / small |
| A3 | `tritonePoundGlb` compiles under `groundPound` carrying the *slam's* events (`hit` instead of `fire`) — harmless today, since it is only reached from the plunge landing, but it breaks any future `fire`-driven use | `animations.js` | give the variant the pound's event list | low / tiny |
| A4 | Saurion's shipped tail is rigid: nothing animates `tripoSpine_0`, and the `tail` gait group exists only on `quad` | gaits / manifest | a `tail` block on his gait plus the chain declared | medium / small |
| A5 | `viperTaunt` is 7.8 s, held under `attack` unless a stick cancels it — the longest clip in the game | `animations.js` | half the loops | low / tiny |

### 3.3 Polish, ranked by value for effort

1. **Foot planting on slopes and rooftops.** `applyToeHang` levels the sole
   against the body's up and the pelvis follow nulls the lower foot's
   clearance, so on a slope one foot floats and the other sinks. Raycast under
   each ankle and hand `env.footClr` the local ground difference. Medium.
2. **Turn-in-place.** Standing still and turning yaws the whole body with the
   idle sway underneath. A two-key turn loop, or a hip lead through the
   existing `legFrame` machinery. Medium.
3. **Landing scales with the fall.** `land` is one 0.62 s crouch whether the
   drop was 3 units or 30; drive its speed off `fallSpeed`. Small.
4. **Idle variety.** One breathing sine per body today; two or three 3–4 s
   flourishes per gait family, after ~6 s of stillness, cost only data. Small.
5. **Worst-looking mechs by the numbers:** jerry (claws under the road on
   every rake), viper (skin severity 944, hits 0.18 s late), wraith (rifle
   through the road, asymmetric legs), konga (arms back in the prone clips,
   knee asymmetry), tritone (his own heavy dives the skull).

---

## 4. Open — menus, HUD, controls

**The keyboard gap is closed as WON'T DO** (owner, September 2026): the
keyboard exists for testing and the game is built for controllers. It was the
top UX finding — a keyboard player has no camera, no target lock, no scope —
and it is deliberately not being fixed. Recorded so it is not re-raised.

### 4.1 Bugs

| # | Finding | Where | Fix | Impact / effort |
|---|---|---|---|---|
| U1 | Combined-view plates collide with the bottom-right chrome: with 3–4 fighters and one human the bottom-right plate sits exactly where `#toast-layer` and `#now-playing` live. At 540p the now-playing chip overlaps the plate and every pad toast paints over the CPU's health | `hud.js:139`, `style.css:549-565` | put the chip and toasts above the plates, or stack CPU plates under the human's | medium / small |
| U2 | The warm-up hint overlaps the right-most fighter's quote (`.wu-loading` bottom-right against `.wu-cap` at bottom 4vh) | `style.css:627` | centre the hint under the progress bar, or pad `.wu-cap` | low / tiny |
| U3 | SFX VOLUME "100%" draws as 2 of 10 blocks, because the ceiling is 5× the default — it reads as 20%. The selected settings row also scales 1.08 and its cursor arrows crash into the slider's own chevrons | `boot.js settingsItems`, `.menu-item.selected` | draw 0–100% with the ceiling as an "amplified" zone; stop scaling the selected row | low / small |
| U4 | Hint bars are pad-only vocabulary even for a keyboard seat ("A JOIN · D-PAD PICK · B CANCEL"; the ready chip says "PRESS A") | `menus.js`, `text.js` | a device-aware hint line built from the seats present | low / small |
| U5 | Arena blurbs live only in `title=` tooltips, so a pad user never sees them | `menus.js:970,991` | a caption under the grid for the selected card | low / tiny |
| U6 | The players row jumps ~14 px whenever the "EDITING" tag appears on a card | `menus.js` | reserve the line | low / tiny |
| U7 | Pad BACK does nothing in battle | `input.js` | — | low |

### 4.2 Recommendations, ranked by value for effort

1. **Three accessibility rows** (persisted through `readPref`): SCREEN SHAKE
   on/off (one multiplier on `effects.addShake`), TEXT SIZE S/M/L (a root
   `font-size` scale — the 9.5–11 px card and hint text is the pain point),
   and COLOUR-BLIND PLAYER COLOURS (P2 red against P3 green is the only cue
   besides the number; HP bars go green→red at 30%). Honour
   `prefers-reduced-motion` for the shake and the announce blur.
2. **A results screen with information and a full loop**: rounds won, KOs and
   deaths, time; a CHANGE ARENA that keeps the picks (CHANGE MECHS forgets
   them today); and a "next arena" preview, since the match already preloads
   one.
3. **Move list / mech sheet.** The select card lists move names; one line each
   of what they do (cooldown, ammo, damage class). `roster.js` has the numbers
   and the export's `characters.md` already renders them.
4. **Difficulty feedback.** The tier on the CPU plate ("CPU · ACE") and on the
   results; after a 2-0 loss to ROOKIE, offer VETERAN; a persisted last
   line-up so a returning player's slots and colours come back.
5. **Quick play.** A title-screen QUICK MATCH — random mech, random arena,
   last difficulty. The predictor already pre-rolls both.
6. **Pad hot-plug during a fight**: "press START to join next round" plus a
   `slots` edit at round start. Today a late pad can only join after QUIT TO
   MENU.
7. **A one-second "ROUND 2 — <arena>" card** before the intro, so the
   per-round arena swap reads as intentional.
8. **Print the pause key on the HUD once** at FIGHT.

---

## 5. Open — arenas

Shipped configuration: `authored` mode. Only **neon** is hand-built; the other
eleven are WARDS rolls with a fresh seed, and a best-of-three rotates through
three different arenas (never an arena's twin).

### 5.1 What the pictures say

`docs/audit/arena-overheads.jpg` was shot BEFORE the arena pass. The "now"
column says what changed.

| arena | read at the time | now |
|---|---|---|
| **neon** (authored) | Best-composed city: three roads, a canal, the monorail loop, massed blocks, plaza ring painted. Eye level: the facade tile repeats on every tower and the plaza is bare asphalt | unchanged; still wants two or three kiosks inside the ring |
| **volcano** | Best overhead and best at eye level: lava-lane grid, four organic lakes, basalt mounds, ember light | unchanged. **A black rectangle sits in the sky at top-centre at eye level** — still open, worth checking at a few yaws |
| **quarry** | Crystal fields, veins, black outcrop, tailings pond — reads as a place. The grey industrial sheds look pasted in; the terrace hills read as flat purple ellipses from the chase camera | plaza painted; the sheds and the flat hills are still open |
| **ruins** | Legible dig site; gate on the processional way, sphinxes flanking at 0° facing error | unchanged, good |
| **jungle** | River, temples, groves; coherent but flat (pools are blue discs, trees low cones) | plaza painted; still flat |
| **skyterrace / orbital** | Legible — and **compositionally the same arena** | **split**: skyterrace has three void drops between the decks, orbital three low-gravity pads and a freezing cryo tank |
| **uptown** | Washed out from above (pale paving, sun 2.7); the "park" is a 10-unit pond disc and three lawn decals | still open: one organic pond with the bandshell on its shore would fix it |
| **foundry / harbor / scrapyard** | Read as empty lots — WARDS puts the mass in the outer wards and the ring the fight orbits is bare. Harbor is the emptiest arena in the game. Scrapyard's rust facades render near-white | **filled**: 36 sites instead of 26–30, harbor has one lobed basin and container nests, harbor and scrapyard keep their facade colour |
| **frozen** | Nearly value-less from above, and **none of the ice does anything** | **ice is a rule** (low friction, measured); drifts no longer bloom white; ice has a slate shore |

Mechanic inventory now: lava on 2 arenas, ice on 1, void on 1, low gravity on
1, bog (water/mud/oil) on 7, explosives on 5, spikes on 1, campfires on 3, a
viaduct on 3, landforms on 3. Sand, ash, grass, crystal and stripe are still
paint only.

### 5.2 Bugs

| # | Finding | Where | Fix | Impact / effort |
|---|---|---|---|---|
| R1 | Thin props have **no collider at all**: a prop only gets a body when `r > 0.4 && h/max(rx,rz) > 0.35`, so trees, palms, billboard masts, streetlights and ferns are walk-through — a 12-unit billboard mast included | `arena.js` `_regProp` | drop the `r > 0.4` floor for pole-band props and register `r = max(0.7, rl × 0.72)` with the shell | medium / small |
| R2 | The prop planners still *place* solids inside the spawn clearing (`propSpotOk` / `makeGateOk` accept r ≥ 16, gates at C+5 nudged along the lane). Pad validation now steps around them, but a gate on the ring is still a gate on the ring | `arena.js:512`, `designs/util.js` | reject `hypot < C − 4` for anything with a collider; gates at C + 8 | medium / small |
| R3 | `antennaTower`'s collider floats 10 units off its own model — three splayed legs and a beacon at 30 units, measured tall and thin against mostly air | prop manifest | `userData.bodies` (three legs), or `noCollide` above the leg band | low / small |
| R4 | The camera has no pushout against solids: it relies entirely on the dither fade, which the spectator harness disables. Worth one manual check on frozen with an iceberg between you and the enemy — if the ice does not fade, `iceGlass` (transparent, `depthWrite: true`) is the suspect | `camera.js` | — | unknown / small to check |
| R5 | Sky, hill, bridge and structure materials are still not disposed on the per-round arena swap (the overlay textures, the big ones, now are) | `arena.js dispose` | traverse and dispose owned materials, guarding the shared pack | low / small |

### 5.3 Design still open

1. **Landmarks that survive the wrap.** Hero props are placed 16–26 units from
   a ward centre with no sightline rule; require `sightlineClear` from the
   origin as the flanks already do, on the side opposite the tower ward.
2. **Per-arena notes:** neon — two or three kiosks inside the ring; foundry —
   tanks out to `ring: [26, 40]` and three bridges over the lava; uptown — one
   organic pond with the bandshell on its shore; quarry — `terrace`/`dome`
   massing only; ruins — sand pits at `organic: 0.6`; jungle — organic mud
   pools and gates at C+8; volcano — already the best-playing arena.
3. **The site cap is global.** The mid-ring fill raised it 30 → 36 for *every*
   generated arena, not only the three that needed it (the per-theme count
   alone did nothing on foundry, which was already at the cap). One number in
   `arena.js` if you want the others back where they were.

---

## 6. Open — code factoring (secondary)

The code is in better shape than its file sizes suggest: only four
`def.id === '…'` branches in all of `src/`, hot paths use module scratch
vectors, all 102 URL params and 76 roster keys are read, and the workbench
reaches the game only through its adapter. The debt is concentrated in two
container files and one very long document.

| # | Item | Effort | Value |
|---|---|---|---|
| 1 | **`specials.js` → `src/combat/specials/<mech>.js` + `shared.js` + `summons.js`.** Dispatch is already `SPECIALS[sp.id]`, the ids are per-mech, and `finisher/shared.js` is the precedent. `GORE_*` (tritone's balance) moves into his roster block on the way | 1 day | a 3.1k-line file becomes a parallel-agent-safe fan-out |
| 2 | **`fighter.js` split** along the seams `climb.js` / `aim.js` / `gunaim.js` already use: taunts (~600 lines, roster-flag gated), melee (~1,500), damage and status (~550) plus the nullbot glitch (~180), ranged, sfx (~80), air and guard, locomotion. `update()` is 880 lines and 139 `if`s; the class has 118 methods and 181 `this.*` fields, 104 of them born outside the constructor. The post-pose ORDER (retarget sync → gun aim → climb limbs, and the floor guard never with the prone clamp) is the one part that must stay together, and today it is enforced by comments only | 2–3 days | halves the file |
| 3 | Per-mech clip tables out of `animations.js` (~1.4k of its 3.1k lines are `*_TAUNT` / `*_GLB` raws) into `mechs/clips/<id>.js`; `PROPS` (105 builders in one 2.4k-line literal, and it is on the parallel-agent fan-out list) split by family | ½ day + 2 hrs | merge-conflict magnets |
| 4 | Promote the fighter privates other modules read (`_charging`, `_chargeT`, `_lockAim`, `_carry`, `_shotSide`… — specials.js reads 22, climb.js 22, world/ai/camera 8 each) to declared fields | 2 hrs | the API is real, just undeclared |
| 5 | Fold the ~29 magic constants at the top of fighter.js into tuning.js and the roster. Three gravities exist (fighter 34, ragdoll 32, fleas 40, jets 28). fighter.js snapshots TUNING by value at import — which is why `rw.tune` has to reload — while climb.js holds a live reference; pick the live one | 1 hr | one number, one place |
| 6 | Make the printing tools that are really checks exit non-zero: `brawl.mjs` prints JSON and exits 0 whatever the numbers say, and `hurtboxfit` / `propshell` are the same shape | 1 hr | they can then join `npm run check` |
| 7 | `CLAUDE.md` is ~2,900 lines with the Architecture map behind 2,500 lines of per-feature essays. Move the essays to `docs/<feature>.md`; keep the commands, the map, the rules and a one-line index | ½ day | onboarding |

Also worth knowing: the browser tools are not robust to a Vite full reload
landing mid-run — a source or `public/` edit while a tool's page is up kills it
with "Execution context was destroyed". `tools/lib/browser.mjs` is now the one
place that could retry once on exactly that error.

---

## 7. What was fixed — the log

Three passes, each commit carrying its own measurement. `npx vite build` and
`npm run check` are green after every one.

### 7.1 First pass — the audit's own fixes

**Combat and the state machine** (`fighter.js`, `tuning.js`)

| Fix | What was wrong |
|---|---|
| A crouch is allowed under a raised guard | `wantDuck` refused to crouch while blocking, so the "crouch to block low" counter `takeHit` promises could never happen — every crouched strike was a free guard-break, and the AI ducked on purpose whenever you blocked |
| The crouch rule is melee-only | `takeHit` read `attacker.ducking` for projectiles too, so a crouching gunner's gatling, flame or hose slipped under every block. A crouched blow now has to be thrown from the attacker's own body |
| Freezing drops the guard | The frozen branch of `update()` returned before the block intent was re-read, so a mech iced while holding LT kept `blocking` — and its bubble — for the whole freeze |
| An empty tank locks the guard down | The tank ran dry, the guard dropped for one frame, the next frame's regen put a sliver back and it came straight up again: up two frames in three, still absorbing two thirds of hits. `TUNING.stamina.guardRelock` is the refill it now waits for |
| `silent: true` is honoured | The cryo beam and the grabs passed it; `takeHit` ignored it and played the hit sound plus sparks eight times a second |
| No status on a corpse | A killing blow that also froze set `frozen` and then `dead` on the same frame; burn and poison kept draining a wreck below zero for the whole brawl fade (a soak showed a corpse at hp −12) |
| One `aimGun` call per frame | The servo ran twice a frame (merge residue), halving its post-shot hold and doubling its ramp |
| The light-chain buffer honours the clip list | `comboIdx < 3` was hard-coded, so saurion's 4-hit GLB string ate the buffered press for its launcher |
| A round reset clears taunt and aim state | Wraith's loom, glacier's block and the lock target survived into the next round's intro |

**AI** (`ai.js`) — brawlers are classified by mech, not by weapon (a rocket
fist reads 13 units and a shoulder cannon 16, so CPU titanus held thirteen
units, backed off inside eight and never punched; eleven of seventeen played
the same kiting zoner). A dry magazine with no crate makes the CPU close in.
Charge attacks are held before release, so CPU titanus and colossus no longer
throw every haymaker at the 0.8× floor. A retired ult id was dropped.

**Match rules** (`match.js`) — minion KOs stay out of the brawl respawn queue;
everyone is locked at round end (the losers could hit, even kill, the winner
mid victory pose); a solo player's death ends a gauntlet round; a draw-locked
match ends after five rounds; respawn pads measure across the wrap seam.

**Animation and rigging**

| Fix | What was wrong |
|---|---|
| **The whole hips translation reaches the GLB bone** (`rigadapter.js`) | Only the y delta was copied, so 63 clips keying `hipsPos` x/z — the strike's drive, the dash coil, the crouch's seat, the knockdown slide — were dropped on the route every mech ships on. Measured: saurion's kick bone travel 0.09 → 0.51 (equal to the joint), titanus' taunt sway 0.00 → 0.28. It also fixed the vertical on saurion, whose armature does not keep world-up on its local y |
| A dead body goes limp | `Fighter.update` passed `dead: true` with no `state`, and the animator's limp rule keys on `state`. Fenrir's blade tail and wraith's cloak kept their live pose on a corpse |
| The head is a striking limb | `tritoneGore` was `strikeArm: 'R'` — on a ceratopsian, the right foreleg — so his horn jab resolved and auto-aimed on a foot under his chest. Tritone's gore and toss and saurion's bite now declare the head |
| A fading clip fires no events | A stopped loop kept dispatching `sfx` and `hit` events through its fade |
| Fenrir's right booster | The manifest declared `boostL` only, so a hovering fenrir fired one jet |
| The prone clamp finds a baked mech's tail | The skip-list resolved limp roots through the custom rig only, and fenrir's rig had been baked away: his tail was measured again and propped the body up, 42% of his height against the documented 0.8% |
| Wraith's cloak goes limp again | His `limpChains: ['cape0']` lived on the rig file the bake deleted (24.7% float against 7.2%). `bake-glb.mjs` now carries `limpChains` / `tailFloor` over from any rig it removes |

**Arenas** — crates never spawn inside buildings or props (measured 1–3 of the
six crates a round were unreachable); spawn pads are validated and slide along
their ring (pads had measured 2.9–4.7 units from gate legs, arches and antenna
towers); a locked robot cannot set off a fuel tank during the intro; organic
lava keeps its whole outline out of the plaza; fire patches and tank
chain-reactions read the wrap; the per-round swap disposes the ground overlay's
two 2048² textures.

**Menus, HUD, flow** — ROBOT SPEED and INFINITE ULTIMATES have settings rows
(the setters and labels existed with no row to reach them); a screen change
flushes the key edge (one Enter on the title locked TITANUS, armed GAME READY
and, beside a pad, joined a ghost keyboard seat); Enter inside a modal stays in
the modal; the arena select stays up with a LOADING chip instead of showing a
blank canvas for up to 8 s; the camera reframes every round; the round clock
blanks outside the fight; REMATCH restores the touch controls; a lone keyboard
seat backing out returns to the title; the results screen ignores the KO mash
for its first beat; and several stale strings were corrected.

### 7.2 Second pass

| Done | What |
|---|---|
| **Clip-to-clip crossfade** (`animator.js`) | `play` keeps the outgoing action as `prev`, frozen where it was, and the new clip fades in over it instead of over the rest pose. Measured on titanus light1 → light2: nearest approach to rest during the fade 0.85 → 1.33 rad, worst per-frame joint jump 0.60 → 0.43 |
| **Directional hit flinches** | `hitFlinchL`/`R` (shoved sideways, near arm flung) and `hitFlinchBack` (folded forward), picked by the blow's angle, with the torso impulse on the matching axis |
| **Per-gait intro crouch** | Non-biped gaits take the shared crouch at a fraction, arms left alone (arm clip values are absolute, and the humanoid "arms back" hung jerry's claws through the road). Intro depth under the floor: jerry 2.22 → 0.40, fenrir 1.72 → 0.49, tritone 1.34 → 0.50, cranky → 0.66 |
| **Retired-mech code deleted** | Eight special/ult handlers, seven WEAPONS entries, eight aegis/nova clips, the nova branches in fighter.js, dead utils exports |
| **`npm run check`** | 27 node tests (roster ids ↔ handlers, clip names, gait schema, text ids, tuning rates, level round-trip) plus the pure-node tools, run in `deploy.yml` before the build |
| **One tools harness** | `tools/lib/browser.mjs` (`PW_CHROMIUM` overrides the Chromium path); 162 tools migrated by codemod, four run end-to-end afterwards |
| **TRAINING mode** (`src/game/training.js`) | A TRAINING tile on arena select, never automatic. Every seated player trains at once on Uptown; CPU slots are passive dummies that face you and walk back to their pad; no clock, KOs respawn on the pad, ult charges infinite, ammo refills, hp regenerates after 4 s. Each seat gets its own checklist beside its plate — MOVE → JUMP → HOVER → LIGHT → HEAVY → BLOCK → DASH → RANGED → SPECIAL → ULTIMATE → TAUNT — naming that seat's buttons and ticking off the fighter's real state. `node tools/training.mjs` asserts 31 things |

### 7.3 Third pass

| Done | What |
|---|---|
| **Kinetic impact retuned** | `KNOCKDOWN_KICK` 9.5 → 60, `CLOSING_MIN` 5 → 12, the damage bonus capped at +50% instead of +110%, and `HEAVY_SHOVE`: mass past 1.5 adds 20 u/s of closing speed to every blow, so a heavy frame floors a scout with no run-up. Over the 272 ordered pairs, floored from a standstill 0 → 10 (titanus, colossus and cranky on viper, wraith and saurion), at a walk 241 → 68, at a sprint 263 → 105. A body that has just hit the floor now carries 0.3 s of iframes, so a launcher cannot relaunch it off the ground |
| **Balance nudges** | Serpent storm pins each victim once per cast; raptor-pack minions throw no specials; wraith's ghost walk cooldown 9 → 7; viper's and wraith's guard leak 0.20 → 0.15 |
| **The dash economy** | I-frames are the coil's, not the button's: a tap gives 0.14 s and a full three-second coil 0.42 s, where it used to be a flat 0.26 s on a 0.6 s cooldown. An empty tank refuses a tapped dash (a wound coil is exempt — it paid in advance), and the cost 0.09 → 0.18 now exceeds what regrows between two dashes. Measured with `tools/scratch/dashbuffer.mjs` on a real fight: i-frame uptime under mashing 43% → 21.6%, a sustained mash runs the bar to 0.169 and is refused, and a coil still fires on an empty tank at 0.387 s |
| **The input buffer** | A heavy, special or jump pressed during an attack's recovery is remembered for 0.2 s and replayed on the first frame control returns; only `light` was ever caught before. Measured: the same press 0.105 s before control returns is eaten without the buffer and comes out with it. A stale press is dropped rather than queued, and only the body's own action fills the buffer — mashing through a knockdown no longer produces a hop on the getup. Dash needs no buffer: its B-button path already runs during an attack, so a dash mid-swing is a cancel |
| **Arena pass** | Frozen's lakes and river are ICE (steering gain and dash bleed scale by a per-frame grip: stopping distance 2.1 → 8.8 units, a right-angle turn 0.22 → 0.85 s). Sky Terrace has three VOID drops between its decks (0.6 s fall, 15% hp, respawn on the far pad with iframes; the skybridges span them) and Orbital three LOWGRAV pads (jump apex 2.8 → 10.9) plus a freezing cryo-tank blast. Every arena paints its plaza ring. Foundry, harbor and scrapyard build 36 sites instead of 26–30; harbor has one lobed basin and container nests; harbor and scrapyard keep their facade colour. Snow drifts no longer bloom white; ice has a slate shore. The per-round rotation excludes an arena's twin |
| **CPU floor sense** | One body length ahead is probed for lava, acid, void, prop bodies and live fuel tanks; the CPU takes the clear perpendicular or holds, and walks out of lava it is standing in. Volcano, veteran, 60 s: titanus' time in lava 9.7% → 0.7%, viper's 6.4% → 0.9%, prop contact frames 56/160 → 0 |
