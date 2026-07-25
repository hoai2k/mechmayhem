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
};

function readPref(key) {
  try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
}

export function setInfiniteUltimates(on) {
  CONFIG.debugUltimates = on;
  try { localStorage.setItem('rw.infiniteUlts', on ? '1' : '0'); } catch (e) { /* ok */ }
}

export function setShowAllRobots(on) {
  CONFIG.showAllRobots = on;
  try { localStorage.setItem('rw.showAllRobots', on ? '1' : '0'); } catch (e) { /* ok */ }
}
