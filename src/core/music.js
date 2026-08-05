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
import { CONFIG, setMusicVolume } from './config.js';

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

export class MusicPlayer {
  /**
   * @param {object} [opts]
   * @param {Array}  [opts.tracks] play THESE songs instead of the src/music/
   *   rotation (the menu theme; see MENU_TRACKS).
   * @param {boolean} [opts.loop] loop the one song forever rather than
   *   advancing to another when it ends.
   */
  constructor(opts = {}) {
    this.loop = !!opts.loop;
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
  /** The music bus level (the settings slider writes it through CONFIG). */
  get volume() { return CONFIG.musicVolume; }
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
    if (this.playing) return;
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

  /** Skip to the next pre-rolled song. */
  skip() {
    if (!this.available || !this.playing) return;
    this._advance();
  }

  // ------------------------------------------------------------------ volume

  /** The player's music on/off toggle. Persisted across sessions. */
  setEnabled(on) {
    this.enabled = !!on;
    try { localStorage.setItem(STORE_KEY, this.enabled ? '1' : '0'); } catch (e) { /* ok */ }
    this._applyVolume();
    // turning it back on mid-battle should actually start something
    if (this.enabled && this.playing && !this.track) this._advance();
    else if (this.enabled && this.playing) this._play();
    this._changed();
  }

  /** Global SOUND: OFF from the corner button / settings. Not persisted here. */
  setMuted(m) {
    this.muted = !!m;
    this._applyVolume();
    if (!this.muted && this.playing && this.track) this._play();
    this._changed();
  }

  /** Settings slider: 0..1 on the music bus alone. Persisted through CONFIG. */
  setVolume(v) {
    setMusicVolume(v);
    this._applyVolume();
    this._changed();
  }

  // ----------------------------------------------------------------- internals

  _applyVolume() {
    if (!this.el) return;
    const want = this.enabled && !this.muted ? this.volume : 0;
    this.el.volume = want;
    // silent means silent: don't keep streaming a track nobody can hear
    if (!want) { try { this.el.pause(); } catch (e) { /* ok */ } }
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
    this.track = this.next;
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
    this._roll();
    this._changed();
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
