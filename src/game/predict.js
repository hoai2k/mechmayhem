// ============================================================================
// predict.js — branch prediction for the menus.
//
// A fight opens with a burst of loading: an arena's textures, the models for
// whoever is fighting, the first song. Meanwhile the player spends fifteen
// unhurried seconds reading the title screen and picking a robot, with the
// machine doing nothing.
//
// The trick is that the "random" parts of that fight are only random until
// someone rolls them — so ROLL THEM EARLY. This module pre-rolls the RANDOM
// arena, the RANDOM robot picks and the battle's first song, then spends the
// menus' idle time pulling those exact assets down. The menus then CONSUME the
// pre-rolled values (take*()), so the prediction isn't a guess that might miss:
// the roulette lands on the arena we already fetched.
//
// Two rules keep it honest:
//   · It only ever runs while a menu is up. `stop()` at battle start, because
//     from there on every spare cycle belongs to the fight.
//   · A miss must cost nothing but the bytes. Everything it warms is optional
//     (browser cache, GLB cache, audio buffer) and every consumer still works
//     if the prefetch never happened — so a re-roll, a settings change or a
//     flag flip can invalidate a prediction at any time.
//
// CONFIG.prefetch turns the whole thing off (?prefetch=0).
// ============================================================================
import { CONFIG } from '../core/config.js';
import { THEMES, THEMES_BY_ID } from '../arena/themes.js';
import { arenaTexEntries } from '../arena/arena.js';
import { prefetchTex } from '../core/texload.js';
import { playableRoster } from '../mechs/roster.js';
import { preloadMechModels } from '../mechs/gltf.js';

// browsers without requestIdleCallback (Safari < 16): a timeout is a fine
// stand-in — this work is all "sometime soon, never urgent"
const idle = typeof requestIdleCallback === 'function'
  ? (fn) => requestIdleCallback(fn, { timeout: 1500 })
  : (fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 220);
const unidle = typeof cancelIdleCallback === 'function' ? cancelIdleCallback : clearTimeout;

// How still the player has to be before background prefetching resumes.
export const RESUME_IDLE = 1500;

export class Predictor {
  constructor({ music } = {}) {
    this.music = music || null;
    this.arena = null;     // pre-rolled RANDOM arena id
    this.mechs = [];       // pre-rolled RANDOM robot ids (a small queue)
    this.running = false;
    this._handle = null;
    this._queue = [];      // pending work: [{ key, run }]
    this._busy = false;    // true while the player is working the menu
    this._idleT = null;
    this._done = new Set();
    this.reroll();
  }

  get enabled() { return CONFIG.prefetch; }

  /** Fresh predictions (called at boot and whenever one is consumed). */
  reroll() {
    if (!this.arena) this.arena = THEMES[(Math.random() * THEMES.length) | 0]?.id || null;
    const roster = playableRoster();
    while (this.mechs.length < 2 && roster.length) {
      const pick = roster[(Math.random() * roster.length) | 0].id;
      if (!this.mechs.includes(pick)) this.mechs.push(pick);
    }
  }

  // ---------------------------------------------------------------- consumers

  /**
   * The arena RANDOM tile's pick. Consuming it re-rolls the NEXT one, so a
   * second random pick in the same session is a different arena (and gets its
   * own head start while the results screen is up).
   */
  takeArena() {
    const id = (this.arena && THEMES_BY_ID[this.arena]) ? this.arena : null;
    this.arena = null;
    this.reroll();
    return id || THEMES[(Math.random() * THEMES.length) | 0].id;
  }

  /**
   * A RANDOM robot slot's pick, honouring the same "not one of these" rule the
   * caller would have applied itself. Falls back to a fresh roll when the
   * prediction is already on the field.
   */
  takeMech(exclude = new Set()) {
    const roster = playableRoster();
    const i = this.mechs.findIndex((id) => !exclude.has(id));
    let id = i >= 0 ? this.mechs.splice(i, 1)[0] : null;
    if (!id) {
      const pool = roster.filter((m) => !exclude.has(m.id));
      id = (pool.length ? pool : roster)[(Math.random() * (pool.length || roster.length)) | 0].id;
    }
    this.reroll();
    return id;
  }

  // ----------------------------------------------------------------- schedule

  /**
   * Begin (or top up) idle prefetching for the menu the player is on.
   * `picks` are the robot ids already chosen — those models are wanted no
   * matter what, so they go to the front of the queue.
   */
  start(picks = []) {
    if (!this.enabled) return;
    this.running = true;
    const want = [];
    for (const id of picks) if (id && id !== 'random') want.push(id);
    if (want.length) this._push('mechs:' + want.join(','), () => preloadMechModels(want));
    // the song the fight will open on — biggest single file, so it goes early
    if (this.music?.available) this._push('song', () => this.music.prime());
    // the arena we expect: its sky panorama, ground and facades
    if (this.arena) this._push('arena:' + this.arena, () => this._arena(this.arena));
    // and the models for the robots RANDOM is going to deal
    if (this.mechs.length) this._push('rmechs:' + this.mechs.join(','), () => preloadMechModels(this.mechs.slice()));
    this._pump();
  }

  /**
   * HANDS OFF WHILE THEY'RE MOVING. Every job here is optional, and none of
   * it is worth a hitch in the menu it is hiding behind — but a GLB parse or
   * a texture decode lands on the main thread whenever it lands, and
   * requestIdleCallback's idea of idle is not the player's. So any menu input
   * suspends the queue, and it only resumes once the player has been still
   * for RESUME_IDLE. Flipping through the roster therefore runs against a
   * quiet machine; pausing to read starts the work back up.
   *
   * Cheap enough to call on every input event: it's a timestamp and, at most,
   * one timer re-arm.
   */
  nudge() {
    if (!this.enabled) return;
    this._busy = true;
    if (this._idleT != null) clearTimeout(this._idleT);
    this._idleT = setTimeout(() => {
      this._idleT = null;
      this._busy = false;
      this._pump();          // back to work — they've settled
    }, RESUME_IDLE);
  }

  /** Battle time — the fight gets the machine to itself from here. */
  stop() {
    if (this._idleT != null) { clearTimeout(this._idleT); this._idleT = null; }
    this._busy = false;
    this._stop();
  }

  _stop() {
    this.running = false;
    if (this._handle != null) { unidle(this._handle); this._handle = null; }
    this._queue.length = 0;
  }

  _push(key, run) {
    if (this._done.has(key) || this._queue.some((j) => j.key === key)) return;
    this._queue.push({ key, run });
  }

  _pump() {
    // `_busy` is the player's finger on the controls (see nudge)
    if (!this.running || this._busy || this._handle != null || !this._queue.length) return;
    this._handle = idle(() => {
      this._handle = null;
      const job = this._queue.shift();
      if (!job || !this.running) return;
      this._done.add(job.key);
      // one job at a time, and the next only once this one has landed: a
      // prefetch that saturates the connection is a prefetch that makes the
      // menu it's hiding behind feel worse than doing nothing
      Promise.resolve().then(job.run).catch(() => {}).then(() => this._pump());
    });
  }

  async _arena(id) {
    const theme = THEMES_BY_ID[id];
    if (!theme || !CONFIG.useTextures) return;
    for (const [set, name] of arenaTexEntries(theme)) {
      if (!this.running) return;
      await prefetchTex(set, name);
    }
  }
}
