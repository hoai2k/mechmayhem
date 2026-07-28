// Central feature flags. URL params override at load time:
//   ?textures=0  — disable the image texture pack (procedural skins only)
const params = typeof location !== 'undefined'
  ? new URLSearchParams(location.search)
  : { get: () => null };

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
};

function readPref(key) {
  try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
}

function readNum(key, dflt) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : dflt;
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

export function setShowAllRobots(on) {
  CONFIG.showAllRobots = on;
  try { localStorage.setItem('rw.showAllRobots', on ? '1' : '0'); } catch (e) { /* ok */ }
}
