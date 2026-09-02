// ============================================================================
// THE CONSOLE HANDLE — `rw` in the browser console.
//
// WHY THIS EXISTS. A tuning number is only as good as your ability to hear or
// see it change. Before this, turning a dial in config.js / tuning.js meant
// edit → rebuild → redeploy → find the screen again → try to remember what the
// old one sounded like. Small changes are simply not judgeable that way, and a
// dial you cannot judge reads as a dial that does nothing.
//
// So every knob is reachable LIVE:
//
//   rw                          what is available
//   rw.config                   the live CONFIG object (core/config.js)
//   rw.tuning                   the live TUNING object (core/tuning.js)
//   rw.get('neonBuzzVolume')    read one, by dotted path
//   rw.set('neonBuzzVolume', 0.02)          write a CONFIG knob, live
//   rw.tune('melee.hitstunLight', 0.4)      override a TUNING value + reload
//   rw.tunes() / rw.untune()    list / drop this session's overrides
//   rw.buzz()                   fire the title sign's flicker on demand, x3
//
// TWO WRITERS BECAUSE THERE ARE TWO KINDS OF KNOB. CONFIG is read live at the
// point of use, so set() lands immediately. TUNING is read ONCE into module
// consts (fighter.js snapshots nearly all of it at load, on purpose — hot
// path), so writing it live would silently do nothing; tune() stores the value
// and reloads so it is in place before anything reads it.
//
// Neither survives the tab — this is for FINDING a number, and config.js /
// tuning.js are for KEEPING it.
// ============================================================================
import { CONFIG } from './config.js';
import { TUNING, TUNE_OVERRIDES } from './tuning.js';

// TUNING values are snapshotted into module consts by fighter.js at load, so
// writing one live is usually a no-op — those go through rw.tune(), which
// stores the override and reloads so it lands before anything reads it.
// CONFIG, by contrast, is read live everywhere, so rw.set() is enough for it.
function inTuning(path) {
  const parts = String(path).split('.');
  let o = TUNING;
  for (let i = 0; i < parts.length - 1 && o && typeof o === 'object'; i++) o = o[parts[i]];
  return !!o && typeof o === 'object' && parts[parts.length - 1] in o;
}

// Resolve a dotted path against CONFIG first, then TUNING — so `neonBuzzVolume`
// and `stamina.sprintSeconds` both just work without naming the file.
function resolve(path) {
  const parts = String(path).split('.');
  for (const root of [CONFIG, TUNING]) {
    let o = root;
    let i = 0;
    for (; i < parts.length - 1; i++) {
      if (o == null || typeof o !== 'object' || !(parts[i] in o)) break;
      o = o[parts[i]];
    }
    if (i === parts.length - 1 && o != null && typeof o === 'object' && parts[i] in o) {
      return { obj: o, key: parts[i] };
    }
  }
  return null;
}

export function installKnobs(hooks = {}) {
  if (typeof window === 'undefined') return null;
  const rw = {
    config: CONFIG,
    tuning: TUNING,
    get(path) {
      const r = resolve(path);
      if (!r) { console.warn(`[rw] no such knob: ${path}`); return undefined; }
      return r.obj[r.key];
    },
    set(path, value) {
      const r = resolve(path);
      if (!r) { console.warn(`[rw] no such knob: ${path}`); return undefined; }
      const was = r.obj[r.key];
      r.obj[r.key] = value;
      console.log(`[rw] ${path}: ${JSON.stringify(was)} -> ${JSON.stringify(value)}`);
      if (inTuning(path) && !(path in CONFIG)) {
        console.warn(`[rw] NOTE: ${path} is a TUNING value, and fighter.js read it into a`
          + ` const when it loaded — this write probably changes nothing now.`
          + ` Use rw.tune('${path}', ${JSON.stringify(value)}) instead (stores it and reloads).`);
      }
      return value;
    },
    /** Override a TUNING value for this session and reload so it takes hold. */
    tune(path, value) {
      if (!inTuning(path)) { console.warn(`[rw] no such tuning value: ${path}`); return undefined; }
      const held = readTunes().filter(([k]) => k !== path);
      if (Number.isFinite(+value)) held.push([path, +value]);
      try { sessionStorage.setItem('rw.tune', JSON.stringify(held)); } catch (e) { /* ok */ }
      location.reload();
      return value;
    },
    /** Drop every session override (all of them, or one path) and reload. */
    untune(path) {
      const held = path ? readTunes().filter(([k]) => k !== path) : [];
      try { sessionStorage.setItem('rw.tune', JSON.stringify(held)); } catch (e) { /* ok */ }
      location.reload();
    },
    /** What is currently overridden, and what it was before. */
    tunes() { return TUNE_OVERRIDES; },
    help() {
      console.log([
        'rw.config / rw.tuning          the live objects',
        "rw.get('neonBuzzVolume')       read a knob (dotted paths work)",
        "rw.set('neonBuzzVolume', 0.02) write a CONFIG knob, live",
        "rw.tune('dash.cooldown', 0.2)  override a TUNING value + reload",
        'rw.tunes() / rw.untune()       list / drop session overrides',
        ...Object.keys(hooks).map((k) => `rw.${k}()`),
      ].join('\n'));
    },
    ...hooks,
  };
  window.rw = rw;
  return rw;
}

function readTunes() {
  try { return JSON.parse(sessionStorage.getItem('rw.tune') || '[]'); } catch (e) { return []; }
}

// ---------------------------------------------------------------------------
// EVERY URL PARAM THE GAME READS. Kept here so a MISTYPED one can be caught
// and said out loud: `?neobuzz=0.001` used to be indistinguishable from a knob
// that does nothing, because an unrecognised param is silently ignored — the
// single most confusing thing a debug switch can do.
//
// `node tools/params.mjs` greps the source for param reads and FAILS if any is
// missing from this list, so adding a switch without listing it here cannot go
// unnoticed and this list cannot rot into crying wolf.
// ---------------------------------------------------------------------------
export const KNOWN_PARAMS = [
  // core/config.js — the settings and feature flags
  'textures', 'finishers', 'debug', 'showall', 'menufloor', 'neonbuzz',
  'postfx', 'music', 'sfx', 'prefetch', 'props', 'speed', 'round', 'tune', 'procedural',
  'design', 'overhead', 'render', 'stats',
  // screens and harnesses
  'battle', 'showcase', 'rigedit', 'rigtest', 'edit', 'level', 'load',
  'glbview', 'bake', 'export', 'menupose', 'poster', 'finisherdemo', 'ultfx', 'geyser',
  'fire', 'theme', 'forcesplit', 'diff', 'auto', 'arena', 'seed', 'training',
  // subject / model selection
  'mech', 'id', 'prop', 'variant', 'alt', 'model', 'clip', 'anim', 'key', 't',
  'at', 'compare', 'left', 'dummy', 'ball', 'spin', 'yaw', 'orbit', 'cam',
  'muzzle', 'mzbone', 'mzj', 'mzo', 'throttle', 'game',
  // skin / skindebug / gait workbenches
  'ref', 'vert', 'vs', 'prints', 'scan', 'i', 'alldials',
  // player / input harness switches
  'p', 'p1', 'p2', 'p3', 'p4', 'kb1', 'kb2', 'pad', 'input', 'touch',
  'notouch', 'desktop', 'layout', 'mobile', 'phone',
  // scripted-input harness (dev/actiontest.js)
  'light', 'heavy', 'special', 'ult', 'ranged', 'jump', 'dash', 'block',
  'duck', 'taunt', 'strafe', 'fin', 'c', 'c1',
];

/** Say something when a param will be ignored. Cheap, once, at boot. */
export function warnUnknownParams(search = typeof location !== 'undefined' ? location.search : '') {
  const known = new Set(KNOWN_PARAMS);
  const bad = [];
  for (const k of new URLSearchParams(search).keys()) {
    if (!known.has(k.toLowerCase())) bad.push(k);
  }
  for (const k of bad) {
    // nearest known name by edit distance, so a typo names its own fix
    let best = null, bestD = Infinity;
    for (const c of known) {
      const d = editDistance(k.toLowerCase(), c);
      if (d < bestD) { bestD = d; best = c; }
    }
    const hint = best && bestD <= Math.max(2, Math.ceil(k.length / 3)) ? ` — did you mean ?${best}=` : '';
    console.warn(`[rw] URL param "${k}" is not one the game reads, so it does NOTHING${hint}`);
  }
  return bad;
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}
