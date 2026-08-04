// Central feature flags. URL params override at load time:
//   ?textures=0  — disable the image texture pack (procedural skins only)
const params = typeof location !== 'undefined'
  ? new URLSearchParams(location.search)
  : { get: () => null };

// Robot-speed slider bounds. The step is what one ←→ press moves.
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;
export const SPEED_STEP = 0.05;
export const SPEED_DEFAULT = 1.0;

// Round length slider bounds, in SECONDS.
export const ROUND_MIN = 30;
export const ROUND_MAX = 300;
export const ROUND_STEP = 10;
export const ROUND_DEFAULT = 120;

const clampRound = (v) => (Number.isFinite(v)
  ? Math.round(Math.min(ROUND_MAX, Math.max(ROUND_MIN, v))) : ROUND_DEFAULT);

// Snapped to whole percent as well as clamped: stepping by 0.05 in binary
// floating point otherwise banks visible crumbs (1.45 stored as
// 1.4500000000000002), which then round-trips through localStorage forever.
const clampSpeed = (v) => (Number.isFinite(v)
  ? Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) * 100) / 100
  : SPEED_DEFAULT);

export const CONFIG = {
  // use the generated PBR texture pack (src/textures/) for robots, grounds
  // and buildings; anything missing falls back to procedural automatically
  useTextures: params.get('textures') !== '0',
  // ~7s cinematic KO finisher when a round is won by a kill (never on a
  // timeout). ?finishers=0 disables at load time.
  enable_finishers: params.get('finishers') !== '0',
  // Infinite Ultimates: fire ults without a charged meter. Persisted from
  // the settings menu; ?debug=ultimates still forces it on for a session.
  debugUltimates: params.get('debug') === 'ultimates' || readPref('rw.infiniteUlts'),
  // Show all robots: include work-in-progress mechs (roster entries flagged
  // `hidden`) in the game's roster. OFF by default — the workbenches
  // (?showcase, ?rigedit, pose/skin tools, ?battle=...) always show every
  // mech regardless. Persisted from the settings menu; ?showall=1 forces on.
  showAllRobots: params.get('showall') === '1' || readPref('rw.showAllRobots'),
  // PROCEDURAL ARENAS: generate EVERY arena from its theme recipe + a fresh
  // seed, ignoring the hand-built levels in src/arena/authored.js. OFF by
  // default, so an arena that HAS an authored version plays it and every other
  // arena is generated exactly as before. Turn it on for a new city each match
  // everywhere. Persisted from the settings menu; ?procedural=1 forces it on
  // for a session.
  proceduralArenas: params.get('procedural') === '1' || readPref('rw.proceduralArenas'),
  // REVERSE CAMERA Y: which way the right stick (and a touch look-drag) pitches
  // the camera. OFF is the standard third-person feel — push DOWN and the
  // camera rises so you look down on your mech; ON gives the flight-sim
  // inversion. Persisted from the settings menu.
  reverseCameraY: readPref('rw.reverseCamY'),
  // MENU FLOOR: dress the menu stage's floor with the Ironworks Foundry iron
  // plate instead of the flat dark disc. A LOOK CHOICE, deliberately one flag
  // wide — flip it to false here (or add ?menufloor=0) to get the plain floor
  // back. `menuFloorTex` names which texture-pack ground it borrows, so trying
  // another arena's floor is a one-word edit.
  menuFloorTextured: params.get('menufloor') !== '0',
  menuFloorTex: 'ground_foundry_ironplate',
  // NEON BUZZ: how loud the title sign's flicker is, 0..1 (0 = silent). The
  // dial to turn if the sign is too chatty under the music — edit the number
  // here, or pass ?neonbuzz=<0..1> for a quick try. Each individual flicker is
  // scaled a little around this by how deep that drop-out goes.
  //
  // TO ACTUALLY JUDGE IT, use the console rather than this file: `rw.set(
  // 'neonBuzzVolume', 0.05)` then `rw.buzz()` fires three flickers on demand.
  // A drop-out is a 66ms click that comes round every couple of seconds at a
  // random depth, so comparing two builds from memory is hopeless — which is
  // exactly how this dial got a reputation for doing nothing. (Mind the
  // spelling too: an unknown URL param is ignored, though boot now warns
  // about one. See core/knobs.js.)
  neonBuzzVolume: readParam01('neonbuzz', 0.15),

  // SPLIT-SCREEN POST FX: local multiplayer runs the same post chain as the
  // single view (distance haze blur, bloom, FXAA) — one composer per
  // viewport, each sized to its own rect. Total pixel work is about the same
  // as one full-screen chain (each view is a fraction of the screen), but the
  // per-pass overhead multiplies (four bloom chains at 4P), so this is a
  // TRI-STATE, defaulting to 'auto':
  //   'auto' — run them, and drop them for the session if the frame rate
  //            actually suffers (engine.js watches real frame time)
  //   'on'   — always, whatever it costs
  //   'off'  — never; plain scissored renders, as before
  // ?postfx=auto|on|off|single ('single' is the old spelling of 'off').
  splitPostFx: readSplitPost(),

  // ---- ULT FOUNTAINS (combat/fountains.js) ----
  // Ultimates are no longer charged by dealing/taking damage: golden powerup
  // fountains spawn around the arena and standing in one grants a charge.
  fountains: {
    interval: 10,     // seconds between spawn attempts
    perRobot: 2,      // board cap = live robots × this
    maxCharges: 2,    // charges a robot can hold
  },

  // ---- battle soundtrack (src/music/, streamed — see core/music.js) ----
  // MASTER SWITCH. Off means the songs are never fetched at all and battles
  // fall back to the procedural themes in core/audio.js — the flag to flip for
  // a build that must not stream media (offline/desktop packaging, a kiosk, a
  // metered connection). ?music=0 turns it off for one session; a build made
  // with RW_NO_MUSIC=1 ships no songs, which turns it off on its own.
  music: params.get('music') !== '0',
  // Music bus level, independent of the SFX bus. Settings slider, persisted.
  musicVolume: readNum('rw.musicVol', 0.22),
  // IDLE PREFETCH (game/predict.js): while the player is reading the title
  // screen or picking a robot, quietly pull down what the fight is about to
  // need — the song, the arena's textures, the models for RANDOM picks.
  // ?prefetch=0 disables. Implies `music` for the song part.
  prefetch: params.get('prefetch') !== '0',
  // Bake each arena prop's sub-meshes together by material once it is placed
  // and measured (src/arena/props.js mergePropMeshes) — same pixels, a
  // fraction of the draw calls. ?props=raw keeps the props as authored, which
  // is how the two are compared (/workbench/?edit=props).
  mergeProps: params.get('props') !== 'raw',

  // ROBOT SPEED: a global multiplier on how fast every fighter WALKS, RUNS
  // and FLIES, over the per-mech speeds tuned in the roster. 100% is now the
  // DEFAULT pace and that pace is TWICE what it used to be — the doubling
  // lives in fighter.js SPEED_BASE, so the slider reads a clean 100% at the
  // shipped feel and the old pace is 50%. The relative pace of the roster (a
  // nimble tempest against a lumbering colossus) is untouched at any
  // setting. Attacks, dashes and the speeds written into special moves are
  // deliberately NOT scaled: this is a locomotion dial, not a game-speed
  // dial. Settings slider, persisted; ?speed=<n> overrides for a session.
  robotSpeed: clampSpeed(params.get('speed') !== null
    ? parseFloat(params.get('speed'))
    : readNum('rw.robotSpeed', SPEED_DEFAULT, SPEED_MIN, SPEED_MAX)),
  // ROUND TIME in seconds — the countdown a round times out on (match.js).
  // Settings slider, persisted; ?round=<secs> overrides for a session.
  roundTime: clampRound(params.get('round') !== null
    ? parseFloat(params.get('round'))
    : readNum('rw.roundTime', ROUND_DEFAULT, ROUND_MIN, ROUND_MAX)),
};

export const SPLIT_POST_MODES = ['auto', 'on', 'off'];

function readSplitPost() {
  const p = params.get('postfx');
  if (p === 'single' || p === 'off') return 'off';
  if (p === 'on' || p === 'auto') return p;
  try {
    const v = localStorage.getItem('rw.splitPostFx');
    if (SPLIT_POST_MODES.includes(v)) return v;
  } catch (e) { /* ok */ }
  return 'auto';
}

export function setSplitPostFx(mode) {
  CONFIG.splitPostFx = SPLIT_POST_MODES.includes(mode) ? mode : 'auto';
  try { localStorage.setItem('rw.splitPostFx', CONFIG.splitPostFx); } catch (e) { /* ok */ }
  return CONFIG.splitPostFx;
}

function readPref(key) {
  try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
}

// A 0..1 knob whose default lives in this file and which a URL param can
// override for a quick try (?neonbuzz=0.25). Unlike readNum() there is no
// stored preference behind it — it is a value you EDIT here.
function readParam01(key, dflt) {
  const v = parseFloat(params.get(key));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : dflt;
}

function readNum(key, dflt, lo = 0, hi = 1) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
  } catch (e) { return dflt; }
}

export function setInfiniteUltimates(on) {
  CONFIG.debugUltimates = on;
  try { localStorage.setItem('rw.infiniteUlts', on ? '1' : '0'); } catch (e) { /* ok */ }
}

export function setMusicVolume(v) {
  CONFIG.musicVolume = Math.min(1, Math.max(0, +v || 0));
  try { localStorage.setItem('rw.musicVol', String(CONFIG.musicVolume)); } catch (e) { /* ok */ }
}

export function setReverseCameraY(on) {
  CONFIG.reverseCameraY = on;
  try { localStorage.setItem('rw.reverseCamY', on ? '1' : '0'); } catch (e) { /* ok */ }
}

export function setRoundTime(v) {
  CONFIG.roundTime = clampRound(parseFloat(v));
  try { localStorage.setItem('rw.roundTime', String(CONFIG.roundTime)); } catch (e) { /* ok */ }
  return CONFIG.roundTime;
}

export function setRobotSpeed(v) {
  CONFIG.robotSpeed = clampSpeed(parseFloat(v));
  try { localStorage.setItem('rw.robotSpeed', String(CONFIG.robotSpeed)); } catch (e) { /* ok */ }
  return CONFIG.robotSpeed;
}

export function setShowAllRobots(on) {
  CONFIG.showAllRobots = on;
  try { localStorage.setItem('rw.showAllRobots', on ? '1' : '0'); } catch (e) { /* ok */ }
}

export function setProceduralArenas(on) {
  CONFIG.proceduralArenas = on;
  try { localStorage.setItem('rw.proceduralArenas', on ? '1' : '0'); } catch (e) { /* ok */ }
}
