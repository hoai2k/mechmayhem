// Central feature flags. URL params override at load time:
//   ?textures=0  — disable the image texture pack (procedural skins only)
const params = typeof location !== 'undefined'
  ? new URLSearchParams(location.search)
  : { get: () => null };

// Robot-speed slider bounds. The step is what one ←→ press moves.
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;
export const SPEED_STEP = 0.05;
export const SPEED_DEFAULT = 1.2;

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
  // REVERSE CAMERA Y: which way the right stick (and a touch look-drag) pitches
  // the camera. OFF is the standard third-person feel — push DOWN and the
  // camera rises so you look down on your mech; ON gives the flight-sim
  // inversion. Persisted from the settings menu.
  reverseCameraY: readPref('rw.reverseCamY'),

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
  // and FLIES, over the per-mech speeds tuned in the roster. The DEFAULT is
  // 1.2 — the game moves 20% quicker than the stats alone say — so the
  // slider's 1.0 is the older, slower baseline and the relative pace of the
  // roster (a nimble tempest against a lumbering colossus) is untouched
  // either way. Attacks, dashes and the speeds written into special moves
  // are deliberately NOT scaled: this is a locomotion dial, not a game-speed
  // dial. Settings slider, persisted; ?speed=<n> overrides for a session.
  robotSpeed: clampSpeed(params.get('speed') !== null
    ? parseFloat(params.get('speed'))
    : readNum('rw.robotSpeed', SPEED_DEFAULT, SPEED_MIN, SPEED_MAX)),
};

function readPref(key) {
  try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
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

export function setRobotSpeed(v) {
  CONFIG.robotSpeed = clampSpeed(parseFloat(v));
  try { localStorage.setItem('rw.robotSpeed', String(CONFIG.robotSpeed)); } catch (e) { /* ok */ }
  return CONFIG.robotSpeed;
}

export function setShowAllRobots(on) {
  CONFIG.showAllRobots = on;
  try { localStorage.setItem('rw.showAllRobots', on ? '1' : '0'); } catch (e) { /* ok */ }
}
