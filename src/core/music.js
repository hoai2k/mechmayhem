// ============================================================================
// music.js — the licensed BATTLE SOUNDTRACK (real audio files, not the synth).
//
// Every audio file dropped in `src/music/` is a song. Nothing here names them:
// the list is a build-time glob, so ADDING A FILE ADDS IT TO THE ROTATION with
// no code change, and the FILENAME (minus extension) is the song title shown in
// the "now playing" readout.
//
// It sits BESIDE the procedural sequencer in core/audio.js rather than inside
// it: that one is a WebAudio note scheduler, this is an <audio> element with a
// fixed low gain so the synthesized combat SFX still cut through it. The menus
// keep the sequencer; battles play these.
//
// Usage:
//   const music = new MusicPlayer();
//   music.start();            // random song, avoids repeating the last one
//   music.pause(); music.resume(); music.stop();
//   music.setEnabled(false);  // player toggle (persisted)
//   music.setMuted(true);     // global SOUND: OFF, not persisted here
// ============================================================================

// Build-time glob: `../music/<title>.<ext>` → hashed asset url. Eager so the
// track list exists synchronously at boot (it's just urls, not audio data).
const FILES = import.meta.glob('../music/*.{mp3,ogg,m4a,wav,webm}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Every song found in src/music/, alphabetical. `{ name, url }`. */
export const TRACKS = Object.entries(FILES)
  .map(([path, url]) => ({
    name: decodeURIComponent(path.split('/').pop().replace(/\.[^.]+$/, '')),
    url,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

const STORE_KEY = 'rw.musicOn';
const DEFAULT_VOL = 0.22; // under the 0.8 SFX bus: songs sit behind the fight

export class MusicPlayer {
  constructor({ volume = DEFAULT_VOL } = {}) {
    this.tracks = TRACKS;
    this.volume = volume;
    this.track = null;      // the song currently loaded (playing or paused)
    this.playing = false;   // wants to be audible (false while paused/stopped)
    this.muted = false;     // global SOUND: OFF
    this.enabled = true;    // the player's own music toggle
    this.onChange = null;   // UI hook: re-render the "now playing" readout
    try {
      const s = localStorage.getItem(STORE_KEY);
      if (s !== null) this.enabled = s !== '0';
    } catch (e) { /* private mode: default on */ }

    this.el = null;
    if (typeof Audio !== 'undefined' && this.tracks.length) {
      try {
        this.el = new Audio();
        this.el.preload = 'none';
        this.el.volume = this.volume;
        // one song ends → straight into another one, forever
        this.el.addEventListener('ended', () => { if (this.playing) this._pick(); });
        this.el.addEventListener('error', () => {
          // a bad/unsupported file must not end the soundtrack
          if (this.playing && this.tracks.length > 1) this._pick();
        });
      } catch (e) { this.el = null; }
    }
  }

  get available() { return !!this.el && this.tracks.length > 0; }
  /** Song name for the readout, or null when nothing is loaded. */
  get nowPlaying() { return this.track ? this.track.name : null; }

  // ------------------------------------------------------------------ control

  /** Begin the soundtrack: a random song, never the one that just played. */
  start() {
    if (!this.available) return;
    this.playing = true;
    this._pick();
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
    if (!this.track) { this._pick(); return; }
    this._play();
    this._changed();
  }

  /** End the soundtrack — back to the menu sequencer. */
  stop() {
    if (!this.available) return;
    this.playing = false;
    this.track = null;
    try { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); } catch (e) { /* ok */ }
    this._changed();
  }

  /** Skip to another random song (kept for the readout's click-through). */
  next() {
    if (!this.available || !this.playing) return;
    this._pick();
  }

  // ------------------------------------------------------------------ volume

  /** The player's music on/off toggle. Persisted across sessions. */
  setEnabled(on) {
    this.enabled = !!on;
    try { localStorage.setItem(STORE_KEY, this.enabled ? '1' : '0'); } catch (e) { /* ok */ }
    this._applyVolume();
    // turning it back on mid-battle should actually start something
    if (this.enabled && this.playing && !this.track) this._pick();
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

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, +v || 0));
    this._applyVolume();
  }

  /** True when a song is actually meant to be audible right now. */
  get audible() { return this.playing && this.enabled && !this.muted; }

  // ----------------------------------------------------------------- internals

  _applyVolume() {
    if (!this.el) return;
    const want = this.enabled && !this.muted ? this.volume : 0;
    this.el.volume = want;
    // silent means silent: don't keep decoding a track nobody can hear
    if (!want) { try { this.el.pause(); } catch (e) { /* ok */ } }
  }

  _pick() {
    if (!this.available) return;
    const pool = this.tracks.length > 1
      ? this.tracks.filter((t) => t !== this.track)
      : this.tracks;
    this.track = pool[(Math.random() * pool.length) | 0];
    try {
      this.el.src = this.track.url;
      this.el.currentTime = 0;
    } catch (e) { /* ok */ }
    this._applyVolume();
    this._play();
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
