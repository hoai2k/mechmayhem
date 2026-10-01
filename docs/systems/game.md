# Menus, match flow and HUD

The picture menus, brawl rules, split-screen layouts up to eight fighters, and the visitor count.

These notes were the body of CLAUDE.md, which is now an index into this
folder. Each entry names the mechanism, why it is built that way, what was
measured, and the tool that checks it — most of it was learned by breaking it.

- THE MENUS ARE PICTURES (`src/ui/menus.js`, `src/game/snapshot.js`,
  `src/ui/cards.js`). Title, fighter select and arena select are DOM screens
  over a canvas that DOES NOT DRAW (`engine.covered`, set by boot's main loop
  for those three modes — never for the loading card, whose job is drawing the
  arena underneath it to warm it). The 3D MenuStage is gone from the game
  (menustage.js survives for the poster camera and the dev tools).
  TITLE = FIGHT NIGHT: the sign, the roster rolling left as a FILM STRIP of
  slanted panels (two copies of the roster translated and wrapped by exactly
  one copy's measured width, so the loop is seamless), and a broadcast lower
  third carrying PRESS START. Grab it and it stops dead; drag scrubs it (with
  a fling), the wheel scrubs, a pad's ←→ steps a panel, and it rolls again
  `STRIP_RESUME` (1s) after the last touch, easing up to speed. It OPENS ON A
  RANDOM PANEL and loads its art in the order it will be SEEN — the panels on
  screen first, then the ones about to roll on, four at a time — each picture
  decoded off-screen and FADED IN over its panel's glow wash, never popped.
  Only once that queue drains (`onArtReady`, or 6s) does the prefetcher start
  on the select screen's posters and badges. A panel wears the mech's painted
  HERO CARD (`public/cards/<id>.jpg`, listed in `public/cards/index.json`;
  both written by `node tools/cards.mjs` from the 2048x2560 originals in
  `docs/cards/`, ~170 KB each shipped) and falls back to its poster.
  FIGHTER SELECT = THE VERSUS SPLIT: every fighter owns a SIDE — a half with
  one or two in the match, a quadrant with three or four, a STRIP of a half
  with five to eight (three or four rows a side, alternating left/right in
  slot order, each cut along the band's slanted edge — `placeRow` in
  menus.js works the clip out per row) ("N-PLAYER BRAWL") —
  and the roster grid sits in a slanted band down the middle under VS. One
  element per SLOT whose position class changes with the line-up, so clicks,
  LB/RB visits and pickers address it the same way in every layout; an empty
  side reads PRESS A TO JOIN and a ＋ chip under the grid adds a third.
  A CPU IS NEVER ASSUMED: the solo default is one human and an empty side. A
  CPU is in the match only if someone ADDED one, or as the STAND-IN
  (`slot.auto`) that fills the empty side when a LONE player locks in, so A
  can start a fight straight away — and it goes again when that player
  unlocks, or when a second human joins (who takes its seat, `joinSlot`). A
  CPU's pick defaults to RANDOM (`slot.pick`, dealt at the bell like a
  human's RANDOM); once every human is locked, the arrows or a click on a
  robot steer the first CPU's cursor (the side says so), and a CPU seat
  visited with LB/RB steps its pick with ←/→ — so a locked player's paint is
  on X/R and the swatches while there is a CPU to steer.
  TRAINING IS A CPU TEMPER, NOT AN ARENA: the ◀ ▶ on a CPU's tag walks
  `DIFF_ORDER` (ai.js) — TRAINING PARTNER, ROOKIE, VETERAN, ACE, wrapping. A
  partner does NOTHING (no intent is ever set) and comes back WHERE IT WENT
  DOWN (`partnerRespawnSpot`; the arena's own respawn rule if it died off
  the stage). A line-up whose CPUs are ALL partners is a TRAINING SESSION on
  the picked arena (game/training.js: no clock, the checklist, infinite
  ults, respawns); a partner beside a real CPU is a target in an ordinary
  match and never a contestant (`Match.contestants` — no win, no KO, no
  clean sheet, no bell). There is no TRAINING card on arena select any more.
  `node tools/scratch/partner.mjs` drives it through the real menus.
  The robot on a side is
  its stock POSTER, or — once repainted — a PHOTOGRAPH of the real model in
  that paint (`snapshot.js requestShot`, 260ms debounce, one job per side, the
  old picture kept up until the new one CROSSFADES in — nothing moves; only a
  different ROBOT slides in, and that slide is a one-shot class removed on
  `animationend`, because left on it replayed whenever another animation on
  the picture ended and made a repaint look like a new arrival — and it runs
  with the opacity TRANSITION off, since one started beside it was still
  unfinished underneath when the class came off, and every new pick blinked
  out for a frame at the end of its slide). A ROBOT IS DRAWN AT ITS GAME SIZE:
  every poster comes through the same camera at the same distance, so its box
  height (posters.json) sets the picture's height (`picScale`, `--k`) and
  colossus stands over saurion as he does in a fight, tritone as tall as his
  box rather than shrunk to fit his length; every robot is CENTRED on the
  middle of its side, so the height difference reads at a glance and a small
  one sits in the open rather than under the name — overflow is allowed, the
  side clips. It is the GAME's scale, deliberately: measured in a live fight,
  colossus stands 7.24 to titanus' 7.50 (head joint 6.76 / 6.96), so they
  read as the same size here because they ARE — make him bigger in the roster
  (`body.scale`), never in the menu. THE SIDE'S GLOW
  (`--g`) belongs to the robot ON SCREEN: it changes when the picture does, not
  when the cursor moves (the old robot used to stand in the new one's colours
  until a first-visit poster arrived), and it EASES, being a registered
  `@property` colour — a gradient built on a plain custom property snaps.
  `node tools/scratch/selsize.mjs` sheets the sizes. While the
  photo is being taken, and on through the fade, the side is SPRAY-PAINTED in
  the new colour (`PaintSpray`: cone bursts of droplets from nozzles round the
  body plus glints on it, one 2D canvas per side). Taken through the
  SAME pipeline the posters come out of (`renderPoster` is shared with
  `dev/postershot.js`), so it drops into the same frame — EXACTLY: the idle
  is photographed at ONE moment (animator phase/t pinned, Math.random seeded
  for the synchronous settle) and a repaint is cropped to its poster's own
  box, so poster and repaint are the same size with the same silhouette
  (measured IoU 1.0000, 0.00px shift). Before, each photo caught a random
  moment of the sway, the crop followed the silhouette and a repainted robot
  visibly shifted. Change the settle and the posters must be re-rendered.
  THE MOUSE: with no controller connected it drives the keyboard seat as
  before (hover moves the cursor, click locks). With ANY controller in, it is
  nobody's cursor — hover lights nothing — but a click on a robot COMMITS it
  for the KEYBOARD/MOUSE seat, joining it (into the stand-in CPU's seat
  first) if it was not in, and a second click on the same robot takes that
  seat out again (`padClick`). A TRIGGER on a pad (`ev.ping`, LT or RT)
  flashes that player's colour round their own cell with their tag over it
  (`ping`) — "which cursor am I?" with four on one grid. The side's glow is
  the mech's OWN stock glow whatever the paint — a backdrop recoloured to
  match the robot turns the whole side one colour. A pick that SETTLES (0.7s) or locks is built in the
  background (`predictor.warmPick` -> `warmMech`), which is most of what the
  loading card would otherwise wait for: the GLB, its fit and its recoloured
  textures are all cached by the time the match builds it.
  ARENA SELECT paints the arena under the cursor, blurred, full-bleed behind
  its grid. THE LOADING CARD puts that painting full-bleed too, with every
  fighter's HERO CARD on an angled panel over it (canonical art where a card
  is missing) — the character, not the paint; the paint is on the robot. A
  full-size painting may be dropped in at `public/arenas/full/<id>.jpg` and
  listed in `ARENA_FULL` (`src/ui/arenaart.js`); only the 512x288 cards exist
  today, scaled up.
  `releaseSnapshots()` (startBattle) frees the photographer's own WebGL
  context, drops queued jobs and stops one already building from taking a
  picture. Judge the screens with a real run through the menus at 1600x900 —
  the strip, a repaint, a 4-player line-up and the loading card.
- TWO OR MORE PEOPLE IN A FIGHT OF THREE OR MORE PLAY A DIFFERENT GAME
  (`Match.brawl` — it counts HUMANS, not fighters, and the reason it
  because ONE PLAYER AGAINST A CROWD IS NOT A BRAWL: a solo player against three
  CPUs is a gauntlet, and the thing that makes it one is that beating them ENDS
  it — respawning CPUs would only deny the win. Two people plus a CPU is a party
  game, and there a KO ends the round for players who were not even in that
  fight. So with 3+, DEATH IS A RESPAWN — you fade out
  where you fell over ~1.9s, lie gone for a beat, and come back at the spawn
  point FURTHEST from whoever is still up (`respawnSpot`; coming back into the
  fight you just lost is not a second chance). THE FADE IS THE POINT: dying and
  reappearing in the same instant reads as a teleport, and a couple of seconds
  watching your own wreck thin out is what makes it a cost. `resetForRound` is
  the same full reset a new round gives, plus iframes, so a respawned body
  carries nothing over and cannot be spawn-camped.
  WHAT WINS IT is not being the one who keeps dying: the last CLEAN SHEET takes
  the round outright the moment everybody else has a death against them, and at
  the bell it is fewest DEATHS with hp% as the tiebreak (a duel is still decided
  on hp% alone). The death count is on the HUD plate (`Hud.setDeaths`), hidden
  in a duel where it could only ever read 0 or 1. No cinematic FINISHER plays in
  a brawl — it assumes the round is over. `node tools/brawl.mjs` asserts all
  five rules, including that a two-player match is byte-for-byte the old one.
- THREE PLAYERS LEAVE A QUADRANT SPARE, AND THE STATS GO IN IT
  (`LAYOUTS['3']` + `STATS_PANEL_RECT` in camera.js, `positionPlates` in
  ui/hud.js, `#hud-stats` in style.css). Two, three and four humans all split
  the screen, but three is the awkward one: the old 3-way put two views across
  the TOP and one centred underneath, which spends the whole screen on views
  and leaves the HUD nowhere to live — so every plate sat ON somebody's
  viewport, and with a CPU in the fight the two top views carried two plates
  each. Standing the three views in an L instead — P1 top-LEFT, P2 and P3
  along the bottom — costs nothing (each view is the same quarter-screen it
  always was) and buys the whole TOP-RIGHT quadrant as a dedicated stats
  panel. Every plate is RE-PARENTED into it and stacked, the round clock goes
  in at the top of it (centred on screen it straddled the panel's own edge),
  and NOBODY'S VIEW CARRIES A PLATE. The plates are the same elements, so
  health, ult badges, pips, ammo and death counts all keep updating through
  the same handles, and switching layout puts them back in their corners —
  '3' and the grids are the only layouts with a panel. THE PANEL IS OPAQUE ON
  PURPOSE: that quadrant is outside every viewport's scissor rect, so there is
  nothing behind it to show through. EIGHT PLATES IS THE SIZE IT MUST FIT
  (three humans and five CPUs in a quarter of the screen), which is why everything
  inside the panel wears tighter measurements than the same plate does alone
  in a viewport corner — and with more than four fighters (three humans and up
  to five CPUs) it wraps into two columns of four. `node tools/scratch/split3.mjs [out.png]` is the check
  — it reads the quadrant from camera.js rather than restating it, and fails
  if the panel is not exactly that quadrant, if any plate lands outside it, or
  if the stack outgrows it by a single pixel.
- UP TO EIGHT FIGHTERS (`MAX_FIGHTERS`/`MAX_PADS` + `PLAYER_COLORS` in
  core/colors.js — the colour list IS the seat count). A match is up to eight
  slots, any mix of humans and CPUs; human seats are bounded by devices, and
  CHROMIUM (Chrome, Edge, the Electron build) exposes at most FOUR gamepads,
  so six humans is the practical ceiling there (kb1 + kb2 + four pads). Every
  loop over pads runs to `MAX_PADS` so a browser that exposes more gets them.
  FIVE TO EIGHT HUMANS — AND FOUR WITH A CPU — ARE A GRID WITH A PANEL
  (camera.js `gridLayout`, kinds `g4`..`g8`): views fill a 3x2 (≤5 cells) or
  3x3 grid in reading order and the cells left at the end of the bottom row
  are the stats panel, the same idea as the 3-player L. A 3x3 cell is 16:9,
  which is why it beats a 4x2 of portrait cells. Unlike '3', each HUMAN's
  plate rides the top-left of their OWN view (compact, `.in-view`) and the
  panel holds the clock and the CPUs — one cell of nine cannot hold eight
  plates. Four humans with no CPU keep the plain 2x2; the layout needs
  `cameraSys.aiCount` to choose, which boot sets before placing plates.
  Everywhere else plates live in CORNER STACKS (`.hud-corner`), so eight
  fighters on one view sit two to a corner instead of on top of each other,
  and the 3-player quadrant wraps into two columns of four. The loading card
  drops its VS and narrows the cutouts past four. Judge it with
  `node tools/scratch/select8.mjs <n> out.png` (the select screen with n
  seats filled, no pad scripting) and `node tools/scratch/playershot.mjs
  "<battle url>&forcesplit=1&humans=<n>&postfx=off" out.png` — post FX off,
  because SwiftShader cannot draw eight post chains before a screenshot
  times out.
- THE VISITOR COUNT (`src/core/analytics.js`, the `/stats/` page, setup and
  the full data list in `docs/ANALYTICS.md`). A STATIC SITE CANNOT COUNT ITS
  OWN VISITORS: GitHub Pages serves files, the game's JS never sees a request,
  an address or a country, and there is no server of ours in between — so
  "where is anyone playing from" can only be answered by something that
  RECEIVES the request. That is GoatCounter: cookieless, no identifier, no
  cross-site profile, and therefore no consent banner. What leaves the browser
  is the page URL, the referrer, and ONE event — `play`, from `startBattle`,
  which is the only thing a page view cannot say (did anybody get past the
  title screen). Country, browser and screen size are derived from the request
  at their end.
  EMPTY MEANS OFF: with `GOATCOUNTER_CODE` blank no script is loaded and no
  request is made anywhere. The shipped code is set (`'hoai'`), so a FORK that
  keeps it reports to the owner's dashboard — a fork should blank it or put its
  own in. Everything else that must not be counted is in one function
  (`reasonToSkip`) rather than scattered: DNT/GPC, the Electron desktop build,
  the `/workbench/` pages, and a player who said no (`?stats=0` / the button on
  `/stats/`, one `rw.noStats` key for both). `?battle=...` counts nothing
  either, being a dev route that never reaches `bootGame`.
  THE SITE CODE IS STATED ONCE and the stats page IMPORTS it — two copies is
  one rename away from a page showing somebody else's numbers, or none. That
  page is a third vite entry (`stats/index.html`, in the DIST build too: it is
  public, not an authoring surface) and it can EMBED GoatCounter's own
  dashboard, because the free hosted tier has no API to build a custom view on.
  THE EMBED IS OPT-IN AND STICKY (`rw.statsEmbed`), which is the only honest
  default: GoatCounter refuses to be framed until the dashboard is public AND
  the host is on its embed allowlist, a refused frame paints the browser's own
  unstyleable grey error page, and NOTHING ON THE PAGE CAN TELL THE TWO APART —
  both settle on `about:blank` to a cross-origin reader (measured,
  `tools/scratch/framedetect.mjs`). So it is one click by the person who owns
  those settings rather than a permanent maybe-slab. `tools/scratch/statsembed.mjs`
  holds the toggle's three behaviours.
  `node tools/scratch/statsbeacon.mjs` is the check and it STUBS `gc.zgo.at`,
  so it contacts nothing real: it asserts the no-request rules in the shipped
  state and the counting rules when a code is set, driving a real match through
  the menus with a virtual pad. `tools/scratch/statsshot.mjs` shoots both
  states of the page.
