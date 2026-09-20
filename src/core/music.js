// ============================================================================
// music.js — the licensed BATTLE SOUNDTRACK (real audio files, not the synth).
//
// Every audio file dropped in `src/music/` is a song. Nothing here names them:
// the list comes from the `virtual:rw-music` module the vite plugin builds by
// reading that folder, so ADDING A FILE ADDS IT TO THE ROTATION with no code
// change, and the FILENAME (minus extension) is the song title shown in the
// "now playing" readout.
//
// STREAMED, never bundled. The songs are ~5MB each and live outside the JS
// graph (copied verbatim to `dist/music/`); an <audio> element pulls one down
// as it plays. Nothing is fetched until a song is either PRIMED — the idle
// prefetcher in game/predict.js downloading the fight's song while the player
// is still on the menus — or played.
//
// It sits BESIDE the procedural sequencer in core/audio.js rather than inside
// it: that one is a WebAudio note scheduler, this is a media element with a
// low gain so the synthesized combat SFX still cut through it. The menus keep
// the sequencer; battles play these — unless CONFIG.music is off, in which
// case this whole layer reports itself unavailable and the sequencer keeps the
// fight too.
//
// PER-ARENA SONGS: a file in `src/music/arenas/` named for an arena
// ("Jungle Temple 1.mp3") is that arena's own soundtrack and replaces the
// general pool there — see ARENA_TRACKS below. An arena with no songs of its
// own keeps the general rotation, which is most of them.
//
// Usage:
//   const music = new MusicPlayer();
//   music.setArena(theme);    // this fight's pool: the arena's songs or the pool
//   music.prime();            // start buffering the song start() will pick
//   music.start();            // plays the primed song
//   music.pause(); music.resume(); music.stop();
//   music.setEnabled(false);  // player toggle (persisted)
//   music.setMuted(true);     // global SOUND: OFF, not persisted here
// ============================================================================
import {
  MUSIC_BASE, MUSIC_FILES, MUSIC_ARENA_BASE, MUSIC_ARENA_FILES,
} from 'virtual:rw-music';
import { CONFIG, setMusicVolume, menuMusicVolume, OUTPUT_TRIM } from './config.js';

const titleOf = (file) => file.replace(/\.[^.]+$/, '');
const byTitle = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

/** Every song found in src/music/, alphabetical. `{ name, url }`. */
export const TRACKS = MUSIC_FILES
  .map((file) => ({ name: titleOf(file), url: MUSIC_BASE + encodeURIComponent(file) }))
  .sort(byTitle);

// ---------------------------------------------------------------- per-arena
//
// A song in `src/music/arenas/` belongs to the arena its FILENAME names —
// "Jungle Temple 1.mp3" and "Jungle Temple 2.mp3" are the JUNGLE TEMPLE
// soundtrack, and that arena plays those two (shuffled, no repeats) instead
// of the general pool. Nothing is registered anywhere: the arena is matched
// off the name, so naming a file after an arena is the whole of adding one.
//
// The KEY is the name with punctuation, spaces and case thrown away, so
// "jungle-temple", "JungleTemple" and the theme's own id all reduce to
// `jungletemple`. A song offers TWO keys — with and without a trailing track
// number — because a number is only a track number when the arena's name does
// not end in one: SCRAPYARD 7 is an arena, and "Scrapyard 7 2.mp3" and
// "Scrapyard 7.mp3" both have to find it. An arena with no songs of its own
// matches neither key and keeps the general rotation.

/** `"Jungle Temple"` -> `"jungletemple"`. */
export const arenaKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/** The same, with a trailing track number dropped: `"Jungle Temple 2"`. */
const trackKey = (s) => arenaKey(String(s || '').replace(/[\s_-]*\d+\s*$/, ''));

/** Every song found in src/music/arenas/. `{ name, url, arena, arenaFull }`. */
export const ARENA_TRACKS = MUSIC_ARENA_FILES
  .map((file) => ({
    name: titleOf(file),
    url: MUSIC_ARENA_BASE + encodeURIComponent(file),
    arena: trackKey(titleOf(file)),      // "Jungle Temple 2" -> jungletemple
    arenaFull: arenaKey(titleOf(file)),  // "Scrapyard 7"     -> scrapyard7
  }))
  .sort(byTitle);

/**
 * The songs written for this arena, or `[]` for one that has none yet.
 * `theme` is a THEMES entry (matched on its display name AND its id, so
 * either "Jungle Temple 1.mp3" or "jungle 1.mp3" finds it).
 */
export function arenaTracksFor(theme) {
  if (!theme || !CONFIG.music) return [];
  const keys = [arenaKey(theme.name), arenaKey(theme.id)].filter(Boolean);
  return ARENA_TRACKS.filter((t) => keys.includes(t.arena) || keys.includes(t.arenaFull));
}

/**
 * THE MENU THEME — one recorded track, in `public/sound/`, played on a loop
 * behind the title/select screens instead of the procedural sequencer's
 * `menu` pattern. It is a PUBLIC asset rather than a `src/music/` song on
 * purpose: those are the battle rotation (a file dropped there joins it), and
 * the menu theme is a fixed, named piece. The sequencer stays as the fallback
 * for when this file is missing or <audio> is unavailable.
 */
export const MENU_TRACKS = [{
  name: 'Bohemian Cello Flame Hybrid Suite',
  url: (typeof document !== 'undefined' ? new URL('sound/Bohemian Cello Flame Hybrid Suite.mp3', document.baseURI).href : ''),
}];

const STORE_KEY = 'rw.musicOn';

// ---- the now-playing chip's transport (ui/nowplaying.js) -------------------
// How many songs back the BACK button can walk. It is a listening history,
// not a playlist: a handful is every press anyone makes in a match.
const HISTORY_MAX = 16;
// THE BACK BUTTON IS TWO BUTTONS and this is the window that tells them
// apart — press it once to rewind, again within this many seconds to step to
// the previous song. Long enough to be a deliberate double-press, short
// enough that coming back to the chip much later rewinds (which is what the
// button says it does) rather than silently skipping backwards.
const BACK_AGAIN = 5;
// Auditioning from the PAUSE MENU plays at this share of the music bus. A
// menu you are picking a song on wants to be heard under a conversation, not
// to open at fight volume — and the moment the fight resumes it is full.
const PREVIEW_MIX = 0.35;

export class MusicPlayer {
  /**
   * @param {object} [opts]
   * @param {Array}  [opts.tracks] play THESE songs instead of the src/music/
   *   rotation (the menu theme; see MENU_TRACKS).
   * @param {boolean} [opts.loop] loop the one song forever rather than
   *   advancing to another when it ends.
   * @param {boolean} [opts.menu] this is the MENU theme: it plays at the
   *   music bus quieted by CONFIG.menuMusicMix, and has no arena rotation.
   */
  constructor(opts = {}) {
    this.loop = !!opts.loop;
    this._menu = !!opts.menu;
    this._fixed = opts.tracks || null;      // a caller-supplied list (menu theme)
    this._pool = CONFIG.music ? (this._fixed || TRACKS) : [];  // the general rotation
    this.tracks = this._pool;               // what is playing NOW (arena or general)
    this.arena = null;                      // the arena whose songs are loaded
    this._bag = [];                         // the shuffled order left to play
    this.track = null;      // the song currently loaded (playing or paused)
    this.next = null;       // the pre-rolled song the NEXT start() will use
    this.playing = false;   // wants to be audible (false while paused/stopped)
    this.muted = false;     // global SOUND: OFF
    this.enabled = true;    // the player's own music toggle
    this.onChange = null;   // UI hook: re-render the "now playing" readout
    this._history = [];     // songs already played, newest last (the BACK button)
    this._backAt = 0;       // when BACK last rewound — see BACK_AGAIN
    this._preview = false;  // auditioning from the pause menu, at PREVIEW_MIX
    try {
      const s = localStorage.getItem(STORE_KEY);
      if (s !== null) this.enabled = s !== '0';
    } catch (e) { /* private mode: default on */ }

    this.el = null;
    this._warm = null;      // { track, url } — `next`, already downloaded
    this._playingWarm = null;
    // the element is made once, so gate it on EVERY song this player could
    // ever reach — an arena pool counts even when the general one is empty
    const anySong = this._pool.length
      || (!this._fixed && CONFIG.music && ARENA_TRACKS.length);
    if (typeof Audio !== 'undefined' && anySong) {
      try {
        this.el = new Audio();
        this.el.preload = 'none';   // nothing streams until we ask for it
        this.el.loop = this.loop;   // the menu theme plays until we leave
        this.el.volume = this.volume;
        // one song ends → straight into another one, forever
        this.el.addEventListener('ended', () => { if (this.playing) this._advance(); });
        this.el.addEventListener('error', () => {
          // a bad/unsupported/404 file must not end the soundtrack
          if (this.playing && this.tracks.length > 1) this._advance();
        });
      } catch (e) { this.el = null; }
    }
    this._roll();
  }

  get available() { return !!this.el && this.tracks.length > 0; }
  /** Song name for the readout, or null when nothing is loaded. */
  get nowPlaying() { return this.track ? this.track.name : null; }
  /**
   * This player's level. The battle soundtrack plays at the music bus itself;
   * the MENU theme plays at the bus quieted by `CONFIG.menuMusicMix`, since a
   * screen you are reading and talking over wants less than a fight does.
   */
  get volume() { return this._menu ? menuMusicVolume() : CONFIG.musicVolume; }
  /** True when a song is actually meant to be audible right now. */
  get audible() { return this.playing && this.enabled && !this.muted; }

  // ------------------------------------------------------------------ control

  /**
   * Point the rotation at THIS arena's own songs (src/music/arenas/, matched
   * on the theme's name or id) — or back at the general pool when the arena
   * has none. Called as a fight is built, before `start()`.
   *
   * The song already pre-rolled is KEPT when it belongs to the new pool, so
   * an arena with no music of its own still opens on the song the menus spent
   * their idle time downloading; a swap simply loses that head start and
   * streams instead, which is what a miss has always cost.
   */
  setArena(theme) {
    if (this._fixed) return;                       // the menu theme is not a rotation
    // named off the DISPLAY name, which resolveArenaTheme preserves through an
    // authored level (the id can come back as the level's own)
    const key = theme ? (arenaKey(theme.name) || arenaKey(theme.id)) : null;
    if (key === this.arena) return;
    this.arena = key;
    const own = arenaTracksFor(theme);
    this.tracks = own.length ? own : this._pool;
    this._bag = [];
    // the songs behind us belong to the pool we just left; stepping BACK into
    // one would leave the arena playing music that is not its own
    this._history = [];
    this._backAt = 0;
    if (!this.tracks.includes(this.next)) { this.next = null; this._roll(); }
  }

  /**
   * Download the song `start()` is going to play, WITHOUT playing it. Called
   * from the menus by the idle prefetcher, so the fight opens on a song that
   * is already here instead of one that starts downloading at the exact
   * moment the arena is building. A miss costs nothing: an un-primed song
   * just streams. Resolves when the song is in hand (or has given up).
   */
  async prime() {
    if (!this.available || !this.next || !CONFIG.prefetch) return;
    const track = this.next;
    if (this._warm?.track === track) return;
    // fetched into a blob rather than warmed through a hidden <audio>: the
    // handoff is then GUARANTEED (the fight plays the exact bytes we hold)
    // instead of depending on what the browser chose to keep in its cache.
    // One song at a time — a few MB, released as soon as it's played.
    let url = null;
    try {
      const res = await fetch(track.url, { priority: 'low' });
      if (!res.ok) return;
      url = URL.createObjectURL(await res.blob());
    } catch (e) { return; } // offline/aborted: the fight streams it normally
    this._releaseWarm();
    this._warm = { track, url };
  }

  _releaseWarm() {
    if (!this._warm) return;
    try { URL.revokeObjectURL(this._warm.url); } catch (e) { /* ok */ }
    this._warm = null;
  }

  /** Begin the soundtrack: the pre-rolled song (random, never a repeat). */
  start() {
    if (!this.available) return;
    this.playing = true;
    this._advance();
  }

  /** Hold the current song where it is (pause menu, tab hidden). */
  pause() {
    if (!this.available || !this.playing) return;
    this.playing = false;
    try { this.el.pause(); } catch (e) { /* ok */ }
    this._changed();
  }

  /** Continue a paused song (or start one if nothing is loaded yet). */
  resume() {
    if (!this.available) return;
    // A PREVIEW IS ALREADY PLAYING, which is exactly why this cannot just
    // return on `playing`: auditioning from the pause menu leaves the player
    // running quietly, and the unpause that ends it is this call. Clearing
    // the flag and re-applying the volume IS the hand back to full.
    const wasPreview = this._preview;
    this._preview = false;
    if (this.playing) {
      if (wasPreview) { this._applyVolume(); this._changed(); }
      return;
    }
    this.playing = true;
    if (!this.track) { this._advance(); return; }
    this._play();
    this._changed();
  }

  /** End the soundtrack — back to the menu sequencer. */
  stop() {
    if (!this.available) return;
    this.playing = false;
    this.track = null;
    this._history = [];     // a new match is a new rotation to walk back through
    this._backAt = 0;
    this._preview = false;
    const prev = this._playingWarm;
    this._playingWarm = null;
    try { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); } catch (e) { /* ok */ }
    if (prev) { try { URL.revokeObjectURL(prev.url); } catch (e) { /* ok */ } }
    this._changed();
  }

  /**
   * Ask the element to play again if it is meant to be audible but isn't —
   * the answer to autoplay policy, which rejects `play()` until the page has
   * seen a gesture. A no-op when nothing is loaded or it is already running.
   */
  retry() {
    if (!this.available || !this.playing || !this.track) return;
    if (this.el.paused) this._play();
  }

  /**
   * Skip to the next pre-rolled song. PRESSING IT IS A REQUEST TO HEAR
   * SOMETHING, so unlike every other control here it starts a player that is
   * merely paused — which is what makes the chip's transport work from the
   * pause menu, where `playing` is false by construction.
   */
  skip() {
    if (!this.available) return false;
    this.playing = true;
    this._backAt = 0;
    this._advance();
    return true;
  }

  /** Is there a song behind this one to step back to? */
  get hasPrev() { return this._history.length > 0; }

  /**
   * THE BACK BUTTON IS TWO BUTTONS, and which one you get is decided by the
   * press before it: the first REWINDS to the top of the song, and a second
   * within `BACK_AGAIN` seconds steps to the PREVIOUS song. That order is
   * deliberate and is not the same rule as a media player's (those compare
   * the playhead, so a press ten seconds in skips back and a press two
   * minutes in rewinds) — here the first press always rewinds, whatever the
   * playhead says, so the button does the same thing every time you reach
   * for it and the second press is the one that needs intent.
   *
   * Returns 'restart' or 'prev' for what it did, so the UI can say so.
   */
  back() {
    if (!this.available) return null;
    this.playing = true;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const again = this._backAt && now - this._backAt < BACK_AGAIN && this._history.length;
    if (!again) {
      this._backAt = now;
      if (!this.track) { this._advance(); return 'restart'; }
      try { this.el.currentTime = 0; } catch (e) { /* ok */ }
      this._applyVolume();
      this._play();
      this._changed();
      return 'restart';
    }
    this._backAt = 0;
    // the song being left is where NEXT should go, so the two buttons are
    // each other's undo rather than both walking the shuffle bag forward
    if (this.track) this.next = this.track;
    this._switchTo(this._history.pop());
    this._changed();
    return 'prev';
  }

  /**
   * AUDITIONING, at `PREVIEW_MIX` of the bus: the pause menu's own volume for
   * the transport. Set when a nav button is pressed with the fight paused and
   * cleared by `resume()`, which is the unpause.
   */
  setPreview(on) {
    const v = !!on;
    if (v === this._preview) return;
    this._preview = v;
    this._applyVolume();
    this._changed();
  }

  // ------------------------------------------------------------------ volume

  /** The player's music on/off toggle. Persisted across sessions. */
  setEnabled(on) {
    this.enabled = !!on;
    try { localStorage.setItem(STORE_KEY, this.enabled ? '1' : '0'); } catch (e) { /* ok */ }
    this._applyVolume();   // an audible player starts playing again in there
    // turning it back on mid-battle should actually start something
    if (this.enabled && this.playing && !this.track) this._advance();
    this._changed();
  }

  /** Global SOUND: OFF from the corner button / settings. Not persisted here. */
  setMuted(m) {
    this.muted = !!m;
    this._applyVolume();   // …which starts the element again when it can hear
    this._changed();
  }

  /**
   * Settings slider: 0..1 on the music bus alone. Persisted through CONFIG.
   * A MENU player never writes the bus — its level is derived from it — so
   * this just re-reads what the slider left, which is what keeps the menu
   * theme following the slider down at its own quieter share.
   */
  setVolume(v) {
    if (!this._menu) setMusicVolume(v);
    this._applyVolume();
    this._changed();
  }

  // ----------------------------------------------------------------- internals

  _applyVolume() {
    if (!this.el) return;
    // The trim is the graph's makeup gain (config.js OUTPUT_TRIM) paid to a
    // player the graph cannot reach, so music and effects rise together. An
    // element's gain stops at 1, so a slider dragged to the very top gives
    // some of it back — the only place in the range where it can.
    const mix = this._preview ? PREVIEW_MIX : 1;
    const want = this.enabled && !this.muted ? Math.min(1, this.volume * OUTPUT_TRIM * mix) : 0;
    this.el.volume = want;
    // THIS IS THE ONE PLACE THAT DECIDES WHETHER THE ELEMENT RUNS, and it has
    // to answer both halves of the question or the answers drift apart. Silent
    // means silent: don't keep streaming a track nobody can hear. But AUDIBLE
    // MEANS AUDIBLE — an element paused at zero stays paused until something
    // asks it to play, and `setVolume` never did, so music turned off by
    // dragging the slider to 0 (the only music on/off control there is now)
    // came back mute and stayed that way. It only ever recovered by luck, when
    // a later click or keypress happened to run `retry()` — which a gamepad
    // never produces.
    if (!want) { try { this.el.pause(); } catch (e) { /* ok */ } }
    else if (this.playing && this.track && this.el.paused) this._play();
  }

  /**
   * Pre-roll the song after this one. The order is a SHUFFLE BAG rather than
   * a fresh random pick: every song in the pool plays once before any of them
   * plays again, which is what keeps a two-song arena alternating instead of
   * flipping a coin each time. A refilled bag never opens on the song that
   * just finished, so the wrap is not an immediate repeat either.
   */
  _roll() {
    if (!this.tracks.length) { this.next = null; return; }
    if (!this._bag.length) {
      const bag = this.tracks.slice();
      for (let i = bag.length - 1; i > 0; i--) {   // Fisher-Yates
        const j = (Math.random() * (i + 1)) | 0;
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // don't open a new bag on the song still playing
      if (bag.length > 1 && bag[0] === this.track) bag.push(bag.shift());
      this._bag = bag;
    }
    this.next = this._bag.shift();
  }

  /** Move onto the pre-rolled song and roll the one after it. */
  _advance() {
    if (!this.available) return;
    if (!this.next) this._roll();
    if (this.track) {
      this._history.push(this.track);
      if (this._history.length > HISTORY_MAX) this._history.shift();
    }
    this._switchTo(this.next);
    this._roll();
    this._changed();
  }

  /**
   * Point the element at `track` and play it — the half of `_advance` that
   * `back()` also needs. It is one function because the WARM BLOB's ownership
   * is the fiddly part (the element must be pointed elsewhere before the
   * previous object URL is revoked) and two copies of that is one copy too
   * many. It does NOT touch the history or the bag: who goes where is the
   * caller's business.
   */
  _switchTo(track) {
    if (!track) return;
    this.track = track;
    // play the primed blob when this is the song we pre-fetched; otherwise
    // stream it from the network as usual
    const warm = this._warm?.track === this.track ? this._warm : null;
    if (warm) this._warm = null;   // ownership moves to the element…
    else this._releaseWarm();      // …or the prime missed and is just garbage
    const prev = this._playingWarm;
    this._playingWarm = warm;
    try {
      this.el.preload = 'auto';
      this.el.src = warm ? warm.url : this.track.url;
      this.el.currentTime = 0;
    } catch (e) { /* ok */ }
    // only now, with the element pointed elsewhere, is the previous song's
    // blob safe to let go of
    if (prev) { try { URL.revokeObjectURL(prev.url); } catch (e) { /* ok */ } }
    this._applyVolume();
    this._play();
  }

  _play() {
    if (!this.el || !this.track || !this.enabled || this.muted) return;
    const p = this.el.play();
    // autoplay policy can reject before the first gesture — the game is deep
    // past one by battle time, but never let a rejection surface as an error
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  _changed() { try { this.onChange?.(this); } catch (e) { /* ok */ } }
}
