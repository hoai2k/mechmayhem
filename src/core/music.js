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
// Usage:
//   const music = new MusicPlayer();
//   music.prime();            // start buffering the song start() will pick
//   music.start();            // plays the primed song
//   music.pause(); music.resume(); music.stop();
//   music.setEnabled(false);  // player toggle (persisted)
//   music.setMuted(true);     // global SOUND: OFF, not persisted here
// ============================================================================
import { MUSIC_BASE, MUSIC_FILES } from 'virtual:rw-music';
import { CONFIG, setMusicVolume } from './config.js';

/** Every song found in src/music/, alphabetical. `{ name, url }`. */
export const TRACKS = MUSIC_FILES
  .map((file) => ({
    name: file.replace(/\.[^.]+$/, ''),
    url: MUSIC_BASE + encodeURIComponent(file),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

const STORE_KEY = 'rw.musicOn';

export class MusicPlayer {
  constructor() {
    this.tracks = CONFIG.music ? TRACKS : [];
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
    if (typeof Audio !== 'undefined' && this.tracks.length) {
      try {
        this.el = new Audio();
        this.el.preload = 'none';   // nothing streams until we ask for it
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

  /** Pre-roll the song after this one: random, never an immediate repeat. */
  _roll() {
    if (!this.tracks.length) { this.next = null; return; }
    const pool = this.tracks.length > 1
      ? this.tracks.filter((t) => t !== this.track && t !== this.next)
      : this.tracks;
    const src = pool.length ? pool : this.tracks;
    this.next = src[(Math.random() * src.length) | 0];
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
