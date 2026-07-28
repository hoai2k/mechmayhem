// ============================================================================
// audio.js — procedural audio system for Robotworld.
//
// 100% synthesized with the Web Audio API: no assets, no dependencies.
// Design language: heavy sci-fi mech combat with a steampunk edge — metallic
// clanks, steam hiss, deep sub thuds, gritty saw/square zaps, noise-burst
// explosions. Includes a 16-step lookahead music sequencer with four tracks
// (menu / battleDay / battleNight / battleIndustrial), all in the E-minor
// family so transitions feel coherent.
//
// Usage:
//   import { GameAudio } from './core/audio.js';
//   const audio = new GameAudio();          // safe headless / pre-gesture
//   window.addEventListener('pointerdown', () => audio.resume(), { once: true });
//   audio.play('hit');  audio.music('battleDay');  audio.stopMusic();
//
// Every public method is guarded: unknown names silently no-op, and nothing
// throws if AudioContext is unavailable or still suspended.
// ============================================================================

const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(+v) ? +v : 0));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12); // MIDI note -> Hz
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function makeDistCurve(k = 24, n = 512) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export class GameAudio {
  constructor() {
    // Lazy everything: constructor must be safe headless (Node, tests, SSR).
    this.ctx = null;
    this._sliced = {};   // recorded one-shots, cut into their own events
    this._available =
      typeof window !== 'undefined' &&
      !!(window.AudioContext || window.webkitAudioContext);
    this._sfxVol = 0.8;
    this._musicVol = 0.35;
    this._musicName = null;
    this._seq = null; // active sequencer state
    this._timer = null; // scheduler interval id
  }

  // --------------------------------------------------------------------
  // Context / graph bootstrap
  // --------------------------------------------------------------------

  _init() {
    if (this.ctx) return this.ctx;
    if (!this._available) return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();

      // Master limiter so stacked explosions don't clip.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 14;
      comp.attack.value = 0.002;
      comp.release.value = 0.22;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      comp.connect(master);
      master.connect(ctx.destination);

      // Buses.
      const sfxBus = ctx.createGain();
      sfxBus.gain.value = this._sfxVol;
      sfxBus.connect(comp);
      const musBus = ctx.createGain();
      musBus.gain.value = this._musicVol;
      musBus.connect(comp);

      // Distortion bus — heavy impacts route here for grit.
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistCurve(24);
      shaper.oversample = '2x';
      const distTrim = ctx.createGain();
      distTrim.gain.value = 0.5;
      shaper.connect(distTrim);
      distTrim.connect(sfxBus);

      // Music echo send (tempo-synced dotted-8th, set per track).
      const echoIn = ctx.createDelay(1.0);
      echoIn.delayTime.value = 0.3;
      const echoFb = ctx.createGain();
      echoFb.gain.value = 0.3;
      const echoOut = ctx.createGain();
      echoOut.gain.value = 0.3;
      echoIn.connect(echoFb);
      echoFb.connect(echoIn);
      echoIn.connect(echoOut);
      echoOut.connect(musBus);

      // Shared white-noise buffer (1.5 s, looped with random offsets).
      const len = (ctx.sampleRate * 1.5) | 0;
      const noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this._sfxBus = sfxBus;
      this._musBus = musBus;
      this._dist = shaper;
      this._echoIn = echoIn;
      this._noiseBuf = noiseBuf;
    } catch (e) {
      this._available = false;
      this.ctx = null;
    }
    return this.ctx;
  }

  // --------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------

  /** Call on the first user gesture. Safe to call repeatedly. */
  resume() {
    try {
      const ctx = this._init();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) {
      /* audio must never break the game */
    }
  }

  /**
   * Silence everything until the next resume() — used when the tab or embed
   * loses visibility. Suspending the context (rather than zeroing the gains)
   * also parks the scheduler, so nothing accumulates while we are away.
   * Never _init()s: if audio was never unlocked there is nothing to suspend.
   */
  suspend() {
    try {
      const ctx = this.ctx;
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    } catch (e) {
      /* audio must never break the game */
    }
  }

  /**
   * RECORDED ONE-SHOTS, SLICED. Some sounds are easier to record than to
   * synthesize — a neon tube's stutter is one — and a recording of them is
   * usually a LONG take with many takes inside it. This loads such a file
   * once, finds the individual events in it by energy, and hands back a table
   * of slices the game can trigger one at a time.
   *
   * Detection rather than a hand-written table on purpose: replace the file
   * and the slices follow, with no numbers to update in code.
   *
   * Returns a promise for the slice count (0 = unavailable; the caller should
   * keep whatever fallback it has).
   */
  loadSliced(name, url, { hop = 0.005, gap = 0.06, minDur = 0.03, pad = 0.02 } = {}) {
    if (this._sliced[name]) return this._sliced[name].ready;
    const entry = { buffer: null, slices: [], last: -1, ready: null };
    this._sliced[name] = entry;
    entry.ready = (async () => {
      try {
        const ctx = this._init();
        if (!ctx) return 0;
        const res = await fetch(url);
        if (!res.ok) return 0;
        const ab = await ctx.decodeAudioData(await res.arrayBuffer());
        const ch = ab.getChannelData(0);
        const sr = ab.sampleRate;
        // RMS envelope, then: above threshold = inside an event, and a run of
        // quiet longer than `gap` ends it
        const step = Math.max(1, Math.round(sr * hop));
        const env = [];
        for (let i = 0; i < ch.length; i += step) {
          let sum = 0;
          const n = Math.min(step, ch.length - i);
          for (let k = 0; k < n; k++) sum += ch[i + k] * ch[i + k];
          env.push(Math.sqrt(sum / n));
        }
        const sorted = [...env].sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        const peak = sorted[sorted.length - 1];
        // the take has a constant hum under it, so the floor is the MEDIAN,
        // not zero — an event is what rises clearly above the room
        const thr = Math.max(median * 3, peak * 0.06);
        const quietRun = Math.max(1, Math.round(gap / hop));
        const slices = [];
        let start = -1, quiet = 0;
        for (let i = 0; i < env.length; i++) {
          if (env[i] > thr) { if (start < 0) start = i; quiet = 0; }
          else if (start >= 0 && ++quiet >= quietRun) {
            slices.push([start, i - quiet]);
            start = -1;
          }
        }
        if (start >= 0) slices.push([start, env.length - 1]);
        entry.buffer = ab;
        entry.slices = slices
          .map(([a, z]) => ({ t: Math.max(0, a * hop - pad), d: (z - a) * hop + pad * 2 }))
          .filter((sl) => sl.d >= minDur);
        return entry.slices.length;
      } catch (e) {
        return 0;   // audio must never break the game
      }
    })();
    return entry.ready;
  }

  /** True once loadSliced() found at least one event in `name`. */
  hasSlices(name) { return (this._sliced[name]?.slices.length || 0) > 0; }

  /**
   * Play ONE event out of a sliced file — a different one each time, so a
   * repeated trigger never sounds looped. Short fades top and tail: a slice
   * cut out of a continuous take starts and ends mid-waveform, and without
   * them every trigger would click.
   */
  playSlice(name, { vol = 1, rate = 1 } = {}) {
    try {
      const e = this._sliced[name];
      if (!e?.buffer || !e.slices.length) return false;
      const ctx = this._init();
      if (!ctx || ctx.state !== 'running') return false;
      let i = (Math.random() * e.slices.length) | 0;
      if (e.slices.length > 1 && i === e.last) i = (i + 1) % e.slices.length;
      e.last = i;
      const sl = e.slices[i];
      const src = ctx.createBufferSource();
      src.buffer = e.buffer;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      const t = ctx.currentTime + 0.002;
      const dur = sl.d / rate;
      const fade = Math.min(0.012, dur * 0.25);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + fade);
      g.gain.setValueAtTime(vol, t + dur - fade);
      g.gain.linearRampToValueAtTime(0, t + dur);
      src.connect(g);
      g.connect(this._sfxBus);
      src.start(t, sl.t, sl.d);
      src.stop(t + dur + 0.02);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Fire-and-forget SFX. Unknown names silently no-op. opts: {vol, pitch}. */
  play(name, opts = {}) {
    try {
      const fn = has(SFX, name) ? SFX[name] : null;
      if (typeof fn !== 'function') return;
      const ctx = this._init();
      if (!ctx || ctx.state !== 'running') return;
      // ±10% pitch randomization so rapid repeats don't sound robotic.
      const p = (opts.pitch || 1) * (0.9 + Math.random() * 0.2);
      const v = opts.vol != null ? opts.vol : opts.volume != null ? opts.volume : 1;
      fn(this, ctx.currentTime + 0.002, p, v);
    } catch (e) {
      /* never throw from combat code paths */
    }
  }

  /** Start a looping procedural music track. Unknown names no-op. */
  music(name) {
    try {
      if (!has(TRACKS, name)) return;
      if (this._musicName === name && this._seq) return;
      const ctx = this._init();
      if (!ctx) return;
      this._stopSeq(0.8); // fade whatever is playing (cheap crossfade)

      const def = TRACKS[name];
      const now = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, now);
      out.gain.linearRampToValueAtTime(1, now + 0.9);
      out.connect(this._musBus);

      const spb = 60 / def.bpm / 4; // seconds per 16th step
      this._echoIn.delayTime.setTargetAtTime(spb * 3, now, 0.1);
      this._seq = { def, out, spb, barDur: spb * 16, step: 0, next: now + 0.1 };
      this._musicName = name;
      if (!this._timer && typeof setInterval === 'function') {
        this._timer = setInterval(() => this._tick(), 30);
      }
    } catch (e) {
      /* ignore */
    }
  }

  stopMusic() {
    try {
      this._stopSeq(0.6);
    } catch (e) {
      /* ignore */
    }
  }

  setSfxVolume(v) {
    this._sfxVol = clamp01(v);
    try {
      if (this._sfxBus) {
        this._sfxBus.gain.setTargetAtTime(this._sfxVol, this.ctx.currentTime, 0.03);
      }
    } catch (e) {
      /* ignore */
    }
  }

  setMusicVolume(v) {
    this._musicVol = clamp01(v);
    try {
      if (this._musBus) {
        this._musBus.gain.setTargetAtTime(this._musicVol, this.ctx.currentTime, 0.03);
      }
    } catch (e) {
      /* ignore */
    }
  }

  // --------------------------------------------------------------------
  // Sequencer core (lookahead scheduling)
  // --------------------------------------------------------------------

  _stopSeq(fade) {
    this._musicName = null;
    const s = this._seq;
    this._seq = null;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (s && this.ctx) {
      const t = this.ctx.currentTime;
      const g = s.out.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(g.value, 0.0001), t);
      g.exponentialRampToValueAtTime(0.0001, t + fade);
      const dead = s.out;
      if (typeof setTimeout === 'function') {
        setTimeout(() => {
          try {
            dead.disconnect();
          } catch (e) {
            /* ignore */
          }
        }, (fade + 3) * 1000);
      }
    }
  }

  _tick() {
    try {
      const s = this._seq;
      const ctx = this.ctx;
      if (!s || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (s.next < now - 0.08) {
        // Fell behind (tab throttling) — skip ahead silently, keep the grid.
        const behind = Math.ceil((now - s.next) / s.spb);
        s.next += behind * s.spb;
        s.step = (s.step + behind) % 128;
      }
      let guard = 0;
      while (s.next < now + 0.16 && guard++ < 32) {
        const bar = (s.step / 16) | 0; // 0..7 within the 8-bar super-loop
        const step = s.step % 16;
        try {
          s.def.schedule(this, s, step, s.next, bar);
        } catch (e) {
          /* keep the beat even if one step fails */
        }
        s.next += s.spb;
        s.step = (s.step + 1) % 128;
      }
    } catch (e) {
      /* ignore */
    }
  }

  // --------------------------------------------------------------------
  // Synthesis primitives (each ~2-5 nodes)
  // --------------------------------------------------------------------

  /** Percussive gain envelope: fast attack, optional hold, exp decay. */
  _env(t, vol, attack = 0.002, dur = 0.2, hold = 0) {
    const g = this.ctx.createGain();
    const a = Math.max(0.001, attack);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + a);
    if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, vol), t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + dur);
    return g;
  }

  /** One oscillator through an envelope, with optional pitch bend. */
  _tone(o) {
    const ctx = this.ctx;
    const t = o.t;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t);
    if (o.f1) {
      const end = t + (o.bendDur || o.dur);
      if (o.bend === 'lin') osc.frequency.linearRampToValueAtTime(Math.max(1, o.f1), end);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), end);
    }
    const g = this._env(t, o.vol, o.attack, o.dur, o.hold || 0);
    osc.connect(g);
    g.connect(o.dest || this._sfxBus);
    osc.start(t);
    osc.stop(t + (o.attack || 0.002) + (o.hold || 0) + o.dur + 0.08);
    return osc;
  }

  /** Filtered white-noise burst (steam hiss, cracks, whooshes, explosions). */
  _noise(o) {
    const ctx = this.ctx;
    const t = o.t;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = o.type || 'lowpass';
    flt.frequency.setValueAtTime(Math.max(10, o.f0 || 1000), t);
    if (o.f1) {
      flt.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + (o.bendDur || o.dur));
    }
    flt.Q.value = o.q || 0.8;
    const g = this._env(t, o.vol, o.attack, o.dur, o.hold || 0);
    src.connect(flt);
    flt.connect(g);
    g.connect(o.dest || this._sfxBus);
    src.start(t, Math.random() * 0.7);
    src.stop(t + (o.attack || 0.002) + (o.hold || 0) + o.dur + 0.08);
  }

  /** Metallic clank: inharmonic square partials through a bandpass. */
  _clank(o) {
    const ctx = this.ctx;
    const t = o.t;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = o.f * 2;
    bp.Q.value = o.q || 1.2;
    const g = this._env(t, o.vol, 0.001, o.dur);
    for (const r of [1, 2.756, 4.07]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(o.f * r * (1 + Math.random() * 0.015), t);
      osc.connect(bp);
      osc.start(t);
      osc.stop(t + o.dur + 0.08);
    }
    bp.connect(g);
    g.connect(o.dest || this._sfxBus);
  }

  /** Rolling rubble: one noise source, stepped multi-bump envelope. */
  _rubble(t, dur, vol, p, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 * p, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const spacing = 0.13;
    const bumps = Math.max(2, Math.floor(dur / spacing));
    for (let i = 0; i < bumps; i++) {
      const bt = t + i * spacing;
      const bv = Math.max(0.001, vol * (1 - i / (bumps + 1)) * (0.6 + Math.random() * 0.4));
      g.gain.linearRampToValueAtTime(bv, bt + 0.025);
      g.gain.linearRampToValueAtTime(bv * 0.25, bt + spacing * 0.9);
    }
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(lp);
    lp.connect(g);
    g.connect(dest || this._sfxBus);
    src.start(t, Math.random() * 0.7);
    src.stop(t + dur + 0.1);
  }

  // --------------------------------------------------------------------
  // Music voices (dest = per-track gain so tracks can crossfade)
  // --------------------------------------------------------------------

  _mKick(out, t, v = 1) {
    this._tone({ t, dur: 0.16, type: 'sine', f0: 130, f1: 36, vol: 0.8 * v, dest: out });
    this._noise({ t, dur: 0.02, vol: 0.1 * v, type: 'highpass', f0: 1200, dest: out });
  }

  _mSnare(out, t, v = 1) {
    this._noise({ t, dur: 0.13, vol: 0.25 * v, type: 'highpass', f0: 1700, dest: out });
    this._tone({ t, dur: 0.07, type: 'triangle', f0: 210, f1: 130, vol: 0.18 * v, dest: out });
  }

  _mHat(out, t, open = false, v = 1) {
    this._noise({
      t, dur: open ? 0.16 : 0.035, vol: 0.09 * v, type: 'highpass', f0: 7500, dest: out,
    });
  }

  /** Steam-hiss hat: bandpassed noise, softer attack. Steampunk pressure valve. */
  _mSteam(out, t, v = 1, dur = 0.09) {
    this._noise({
      t, dur, vol: 0.11 * v, attack: 0.02, type: 'bandpass', f0: 3200, q: 1.1, dest: out,
    });
  }

  _mClank(out, t, f, v = 1, dur = 0.22) {
    this._clank({ t, f, dur, vol: 0.24 * v, q: 1.5, dest: out });
  }

  _mBass(out, t, midi, dur, v = 1, type = 'square') {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(mtof(midi), t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 1.4;
    const g = this._env(t, 0.32 * v, 0.006, dur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  _mLead(out, t, midi, dur, v = 1, type = 'triangle', echo = false) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(mtof(midi), t);
    const g = this._env(t, 0.1 * v, 0.005, dur);
    osc.connect(g);
    g.connect(out);
    if (echo && this._echoIn) g.connect(this._echoIn);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  /** Deep pad / drone: two detuned saws through a dark lowpass. */
  _mPad(out, t, midi, dur, v = 1, cutoff = 460) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.15 * v, t + dur * 0.3);
    g.gain.setValueAtTime(0.15 * v, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    for (const det of [-9, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(mtof(midi), t);
      osc.detune.value = det;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + dur * 1.1);
    }
    lp.connect(g);
    g.connect(out);
  }
}

// ============================================================================
// SFX bank — each entry: (a: GameAudio, t: startTime, p: pitchMult, v: volMult)
// Musical cues (UI beeps, count/bell/stingers/fanfare) deliberately ignore p
// so they always land on pitch; combat sounds embrace the ±10% wobble.
// ============================================================================

const SFX = Object.assign(Object.create(null), {
  // ---- Combat / impact -----------------------------------------------
  hit(a, t, p, v) {
    a._tone({ t, dur: 0.11, type: 'sine', f0: 190 * p, f1: 55 * p, vol: 0.7 * v });
    a._noise({ t, dur: 0.06, vol: 0.3 * v, type: 'highpass', f0: 2200 * p });
  },
  hitHeavy(a, t, p, v) {
    a._tone({ t, dur: 0.26, type: 'sine', f0: 150 * p, f1: 34 * p, vol: 0.9 * v, dest: a._dist });
    a._noise({ t, dur: 0.14, vol: 0.5 * v, type: 'lowpass', f0: 3200 * p, f1: 280 });
    a._clank({ t, f: 320 * p, dur: 0.12, vol: 0.25 * v });
  },
  block(a, t, p, v) {
    a._clank({ t, f: 520 * p, dur: 0.18, vol: 0.55 * v, q: 2 });
    a._noise({ t, dur: 0.07, vol: 0.22 * v, type: 'highpass', f0: 3000 });
    a._tone({ t, dur: 0.1, type: 'sine', f0: 140 * p, f1: 60 * p, vol: 0.35 * v });
  },
  whoosh(a, t, p, v) {
    a._noise({
      t, dur: 0.22, vol: 0.4 * v, attack: 0.06, type: 'bandpass',
      f0: 350 * p, f1: 2400 * p, q: 1.4,
    });
  },
  whooshBig(a, t, p, v) {
    a._noise({
      t, dur: 0.42, vol: 0.6 * v, attack: 0.1, type: 'bandpass',
      f0: 160 * p, f1: 1500 * p, q: 1.2, dest: a._dist,
    });
    a._tone({ t, dur: 0.4, type: 'sine', f0: 90 * p, f1: 45 * p, vol: 0.3 * v, attack: 0.08 });
  },
  slam(a, t, p, v) {
    a._tone({ t, dur: 0.32, type: 'sine', f0: 120 * p, f1: 28 * p, vol: 1.0 * v, dest: a._dist });
    a._noise({ t, dur: 0.25, vol: 0.55 * v, type: 'lowpass', f0: 2200 * p, f1: 120 });
    a._clank({ t, f: 210 * p, dur: 0.2, vol: 0.3 * v });
  },
  bodyfall(a, t, p, v) {
    a._tone({ t, dur: 0.16, type: 'sine', f0: 110 * p, f1: 40 * p, vol: 0.65 * v });
    a._tone({ t: t + 0.13, dur: 0.14, type: 'sine', f0: 85 * p, f1: 34 * p, vol: 0.5 * v });
    a._noise({ t, dur: 0.2, vol: 0.25 * v, type: 'lowpass', f0: 900, f1: 200 });
  },
  land(a, t, p, v) {
    a._tone({ t, dur: 0.14, type: 'sine', f0: 140 * p, f1: 48 * p, vol: 0.55 * v });
    a._noise({ t, dur: 0.1, vol: 0.2 * v, type: 'lowpass', f0: 1200, f1: 300 });
  },
  jump(a, t, p, v) {
    // Steam vent + hydraulic lift.
    a._noise({ t, dur: 0.18, vol: 0.28 * v, attack: 0.01, type: 'highpass', f0: 1600 });
    a._tone({ t, dur: 0.16, type: 'triangle', f0: 240 * p, f1: 520 * p, vol: 0.22 * v, bend: 'lin' });
  },
  dash(a, t, p, v) {
    a._noise({
      t, dur: 0.2, vol: 0.42 * v, attack: 0.02, type: 'bandpass',
      f0: 600 * p, f1: 3200 * p, q: 1.3,
    });
    a._tone({ t, dur: 0.12, type: 'sawtooth', f0: 180 * p, f1: 520 * p, vol: 0.1 * v, bend: 'lin' });
  },
  servo(a, t, p, v) {
    // Short robotic servo whir: saw with a quick up-down pitch flick.
    const ctx = a.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(650 * p, t);
    osc.frequency.linearRampToValueAtTime(1500 * p, t + 0.05);
    osc.frequency.linearRampToValueAtTime(820 * p, t + 0.11);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = a._env(t, 0.15 * v, 0.004, 0.12);
    osc.connect(lp);
    lp.connect(g);
    g.connect(a._sfxBus);
    osc.start(t);
    osc.stop(t + 0.2);
  },
  slash(a, t, p, v) {
    a._noise({
      t, dur: 0.13, vol: 0.45 * v, attack: 0.005, type: 'bandpass',
      f0: 4200 * p, f1: 900 * p, q: 2.2,
    });
    a._tone({ t, dur: 0.09, type: 'triangle', f0: 2600 * p, f1: 1400 * p, vol: 0.12 * v });
  },

  // ---- Weapons ---------------------------------------------------------
  gatling(a, t, p, v) {
    // Very short punchy tick — called ~12x/sec while firing (5 nodes).
    a._tone({ t, dur: 0.05, type: 'square', f0: 230 * p, f1: 80 * p, vol: 0.38 * v });
    a._noise({ t, dur: 0.03, vol: 0.26 * v, type: 'highpass', f0: 2500 });
  },
  missile(a, t, p, v) {
    a._noise({
      t, dur: 0.4, vol: 0.38 * v, attack: 0.03, type: 'bandpass',
      f0: 400 * p, f1: 1600 * p, q: 1,
    });
    a._tone({
      t, dur: 0.35, type: 'sawtooth', f0: 110 * p, f1: 420 * p,
      vol: 0.16 * v, attack: 0.02, bend: 'lin',
    });
  },
  mortar(a, t, p, v) {
    a._tone({ t, dur: 0.2, type: 'sine', f0: 95 * p, f1: 42 * p, vol: 0.7 * v });
    a._tone({ t, dur: 0.16, type: 'triangle', f0: 240 * p, f1: 110 * p, vol: 0.3 * v });
    a._noise({ t, dur: 0.12, vol: 0.3 * v, type: 'lowpass', f0: 800, f1: 200 });
  },
  mortarBig(a, t, p, v) {
    a._tone({ t, dur: 0.34, type: 'sine', f0: 80 * p, f1: 30 * p, vol: 0.95 * v, dest: a._dist });
    a._tone({ t, dur: 0.2, type: 'triangle', f0: 190 * p, f1: 80 * p, vol: 0.35 * v });
    a._noise({ t, dur: 0.2, vol: 0.45 * v, type: 'lowpass', f0: 900, f1: 150 });
  },
  railgun(a, t, p, v) {
    a._tone({ t, dur: 0.14, type: 'sawtooth', f0: 3200 * p, f1: 120 * p, vol: 0.5 * v, dest: a._dist });
    a._noise({ t, dur: 0.08, vol: 0.5 * v, type: 'highpass', f0: 1800 });
    a._tone({ t, dur: 0.25, type: 'sine', f0: 110 * p, f1: 38 * p, vol: 0.6 * v });
  },
  plasma(a, t, p, v) {
    a._tone({ t, dur: 0.22, type: 'square', f0: 520 * p, f1: 70 * p, vol: 0.32 * v, dest: a._dist });
    a._tone({ t, dur: 0.18, type: 'square', f0: 545 * p, f1: 74 * p, vol: 0.18 * v });
  },
  dart(a, t, p, v) {
    a._noise({ t, dur: 0.07, vol: 0.25 * v, type: 'highpass', f0: 2600 });
    a._tone({ t, dur: 0.06, type: 'sine', f0: 950 * p, f1: 320 * p, vol: 0.2 * v });
  },
  wave(a, t, p, v) {
    // Rolling energy wave: dual detuned saws through an opening lowpass.
    const ctx = a.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 5;
    lp.frequency.setValueAtTime(250 * p, t);
    lp.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.32);
    const g = a._env(t, 0.32 * v, 0.04, 0.34);
    for (const f of [112, 115.5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * p, t);
      osc.frequency.linearRampToValueAtTime(f * 2.3 * p, t + 0.35);
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 0.45);
    }
    lp.connect(g);
    g.connect(a._sfxBus);
  },
  zap(a, t, p, v) {
    a._tone({ t, dur: 0.11, type: 'square', f0: 1500 * p, f1: 90 * p, vol: 0.32 * v, dest: a._dist });
    a._noise({ t, dur: 0.05, vol: 0.16 * v, type: 'highpass', f0: 3500 });
  },
  thunder(a, t, p, v) {
    a._noise({ t, dur: 0.05, vol: 0.65 * v, type: 'highpass', f0: 1200 }); // crack
    a._noise({ t: t + 0.02, dur: 0.85, vol: 0.7 * v, type: 'lowpass', f0: 2800, f1: 90, dest: a._dist });
    a._tone({ t: t + 0.02, dur: 0.6, type: 'sine', f0: 65 * p, f1: 26 * p, vol: 0.7 * v, dest: a._dist });
  },
  flame(a, t, p, v) {
    // Short whoosh-roar tick, called rapidly — keep tiny (5 nodes).
    a._noise({
      t, dur: 0.11, vol: 0.28 * v, attack: 0.02, type: 'bandpass',
      f0: (420 + Math.random() * 260) * p, f1: 950 * p, q: 0.8,
    });
    a._tone({ t, dur: 0.1, type: 'sine', f0: 120 * p, f1: 70 * p, vol: 0.1 * v });
  },
  shard(a, t, p, v) {
    a._tone({ t, dur: 0.12, type: 'triangle', f0: 1900 * p, f1: 1500 * p, vol: 0.24 * v });
    a._tone({ t: t + 0.02, dur: 0.1, type: 'triangle', f0: 2800 * p, f1: 2300 * p, vol: 0.16 * v });
    a._noise({ t, dur: 0.06, vol: 0.14 * v, type: 'highpass', f0: 5000 });
  },
  beam(a, t, p, v) {
    // Sustained hum: detuned saws, lowpass swells open then shut.
    const ctx = a.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(500 * p, t);
    lp.frequency.exponentialRampToValueAtTime(3000 * p, t + 0.12);
    lp.frequency.exponentialRampToValueAtTime(600 * p, t + 0.45);
    const g = a._env(t, 0.28 * v, 0.03, 0.42);
    for (const f of [165, 167.5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * p, t);
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 0.52);
    }
    lp.connect(g);
    g.connect(a._sfxBus);
  },
  freeze(a, t, p, v) {
    a._tone({ t, dur: 0.28, type: 'triangle', f0: 2300 * p, f1: 640 * p, vol: 0.22 * v, attack: 0.01 });
    a._noise({ t, dur: 0.25, vol: 0.14 * v, attack: 0.03, type: 'highpass', f0: 6000 });
  },
  freezeBig(a, t, p, v) {
    a._tone({ t, dur: 0.55, type: 'triangle', f0: 2400 * p, f1: 420 * p, vol: 0.28 * v });
    a._tone({ t, dur: 0.55, type: 'triangle', f0: 2450 * p, f1: 445 * p, vol: 0.18 * v });
    a._noise({ t, dur: 0.5, vol: 0.2 * v, attack: 0.05, type: 'highpass', f0: 5000 });
    a._tone({ t, dur: 0.3, type: 'sine', f0: 100 * p, f1: 40 * p, vol: 0.4 * v });
  },
  shatter(a, t, p, v) {
    a._noise({ t, dur: 0.28, vol: 0.45 * v, type: 'highpass', f0: 2800 });
    for (let i = 0; i < 3; i++) {
      const f = (2000 + Math.random() * 2500) * p;
      a._tone({
        t: t + i * 0.035 + Math.random() * 0.02, dur: 0.09, type: 'triangle',
        f0: f, f1: f * 0.7, vol: 0.16 * v,
      });
    }
  },
  cast(a, t, p, v) {
    const notes = [660, 880, 1320];
    for (let i = 0; i < notes.length; i++) {
      a._tone({ t: t + i * 0.07, dur: 0.14, type: 'triangle', f0: notes[i] * p, vol: 0.16 * v });
    }
    a._noise({ t, dur: 0.3, vol: 0.07 * v, attack: 0.05, type: 'highpass', f0: 5500 });
  },
  charge(a, t, p, v) {
    a._tone({
      t, dur: 0.55, type: 'sawtooth', f0: 90 * p, f1: 660 * p,
      vol: 0.22 * v, attack: 0.05, bendDur: 0.55,
    });
    a._noise({
      t, dur: 0.55, vol: 0.18 * v, attack: 0.2, type: 'bandpass',
      f0: 500 * p, f1: 3400 * p, q: 2,
    });
  },

  // ---- Explosions / destruction ---------------------------------------
  explosion(a, t, p, v) {
    a._noise({ t, dur: 0.5, vol: 0.75 * v, type: 'lowpass', f0: 2600 * p, f1: 100, dest: a._dist });
    a._tone({ t, dur: 0.4, type: 'sine', f0: 120 * p, f1: 30 * p, vol: 0.9 * v, dest: a._dist });
    a._noise({ t, dur: 0.05, vol: 0.45 * v, type: 'highpass', f0: 1500 });
  },
  explosionBig(a, t, p, v) {
    a._noise({ t, dur: 0.9, vol: 0.95 * v, type: 'lowpass', f0: 3000 * p, f1: 60, dest: a._dist });
    a._tone({ t, dur: 0.7, type: 'sine', f0: 100 * p, f1: 24 * p, vol: 1.0 * v, dest: a._dist });
    a._tone({ t: t + 0.05, dur: 0.6, type: 'triangle', f0: 180 * p, f1: 40 * p, vol: 0.3 * v });
    a._noise({ t, dur: 0.07, vol: 0.55 * v, type: 'highpass', f0: 1200 });
  },
  crumble(a, t, p, v) {
    a._rubble(t, 0.6, 0.45 * v, p);
    a._tone({ t, dur: 0.25, type: 'sine', f0: 90 * p, f1: 38 * p, vol: 0.4 * v });
  },
  crumbleBig(a, t, p, v) {
    a._rubble(t, 1.1, 0.6 * v, p);
    a._tone({ t, dur: 0.45, type: 'sine', f0: 75 * p, f1: 28 * p, vol: 0.7 * v, dest: a._dist });
  },

  // ---- Character --------------------------------------------------------
  powerup(a, t, p, v) {
    // Rising E-minor arp: E4 G4 B4 E5.
    const ctx = a.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const seq = [64, 67, 71, 76];
    for (let i = 0; i < seq.length; i++) osc.frequency.setValueAtTime(mtof(seq[i]) * p, t + i * 0.07);
    const g = a._env(t, 0.2 * v, 0.01, 0.28, 0.24);
    osc.connect(g);
    g.connect(a._sfxBus);
    osc.start(t);
    osc.stop(t + 0.6);
    a._noise({ t: t + 0.2, dur: 0.3, vol: 0.08 * v, attack: 0.1, type: 'highpass', f0: 6000 });
  },
  taunt(a, t, p, v) {
    // Robotic speech-like blips: formant-ish bandpassed saw.
    const ctx = a.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const notes = [330, 392, 294, 440];
    for (let i = 0; i < notes.length; i++) {
      const nt = t + i * 0.11;
      osc.frequency.setValueAtTime(notes[i] * p * (0.95 + Math.random() * 0.1), nt);
      g.gain.setValueAtTime(0.0001, nt);
      g.gain.linearRampToValueAtTime(0.2 * v, nt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, nt + 0.09);
    }
    osc.connect(bp);
    bp.connect(g);
    g.connect(a._sfxBus);
    osc.start(t);
    osc.stop(t + 0.55);
  },
  howl(a, t, p, v) {
    // Wolf-like synth howl: rise, hold, mournful fall, with vibrato.
    const ctx = a.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.26 * v, t + 0.18);
    g.gain.setValueAtTime(0.26 * v, t + 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 9;
    lfo.connect(lfoAmt);
    const f0 = 340 * p;
    const contour = (osc, mult) => {
      osc.frequency.setValueAtTime(f0 * mult, t);
      osc.frequency.linearRampToValueAtTime(f0 * 1.8 * mult, t + 0.3);
      osc.frequency.setValueAtTime(f0 * 1.8 * mult, t + 0.7);
      osc.frequency.linearRampToValueAtTime(f0 * 1.25 * mult, t + 1.35);
      lfoAmt.connect(osc.frequency);
      osc.start(t);
      osc.stop(t + 1.45);
    };
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    contour(o1, 1);
    o1.connect(g);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    contour(o2, 2.01);
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    o2.connect(g2);
    g2.connect(g);
    g.connect(a._sfxBus);
    lfo.start(t);
    lfo.stop(t + 1.5);
  },
  cloak(a, t, p, v) {
    a._noise({
      t, dur: 0.55, vol: 0.22 * v, attack: 0.12, type: 'bandpass',
      f0: 2400 * p, f1: 300 * p, q: 1.5,
    });
    a._tone({ t, dur: 0.5, type: 'triangle', f0: 880 * p, f1: 220 * p, vol: 0.13 * v, attack: 0.1 });
  },
  ultReady(a, t, p, v) {
    // Dramatic riser sting: detuned saw swell into a heavy hit.
    a._tone({
      t, dur: 0.5, type: 'sawtooth', f0: 110, f1: 440,
      vol: 0.22 * v, attack: 0.3, bendDur: 0.78,
    });
    a._tone({
      t, dur: 0.5, type: 'sawtooth', f0: 112, f1: 452,
      vol: 0.16 * v, attack: 0.3, bendDur: 0.78,
    });
    a._noise({
      t, dur: 0.35, vol: 0.18 * v, attack: 0.45, type: 'bandpass',
      f0: 600, f1: 4000, q: 1.5, bendDur: 0.78,
    });
    a._tone({ t: t + 0.78, dur: 0.35, type: 'sine', f0: 130, f1: 36, vol: 0.8 * v, dest: a._dist });
    a._clank({ t: t + 0.78, f: 420, dur: 0.3, vol: 0.32 * v });
  },

  // ---- UI ----------------------------------------------------------------
  // A neon tube stuttering: mains hum, its harsh third, and a thin crackle as
  // the starter arcs. Deliberately quiet — this plays under the title screen
  // every few seconds and must read as room tone, not as an event.
  neonZap(a, t, p, v) {
    const f = 118 * p;
    a._tone({ t, dur: 0.085, type: 'sawtooth', f0: f, f1: f * 0.92, vol: 0.05 * v, attack: 0.003 });
    a._tone({ t, dur: 0.07, type: 'square', f0: f * 3, f1: f * 2.5, vol: 0.018 * v });
    a._noise({ t, dur: 0.055, vol: 0.045 * v, type: 'bandpass', f0: 2600 * p, q: 3.5 });
  },
  uiMove(a, t, p, v) {
    a._tone({ t, dur: 0.05, type: 'square', f0: 520, f1: 480, vol: 0.12 * v });
  },
  uiConfirm(a, t, p, v) {
    const osc = a.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(523, t);
    osc.frequency.setValueAtTime(784, t + 0.07);
    const g = a._env(t, 0.14 * v, 0.005, 0.14, 0.05);
    osc.connect(g);
    g.connect(a._sfxBus);
    osc.start(t);
    osc.stop(t + 0.28);
  },
  uiBack(a, t, p, v) {
    const osc = a.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(494, t);
    osc.frequency.setValueAtTime(330, t + 0.07);
    const g = a._env(t, 0.12 * v, 0.005, 0.12, 0.04);
    osc.connect(g);
    g.connect(a._sfxBus);
    osc.start(t);
    osc.stop(t + 0.26);
  },
  uiSelect(a, t, p, v) {
    // Chunky confirm: blip + sub thump + click.
    a._tone({ t, dur: 0.1, type: 'square', f0: 330, vol: 0.16 * v });
    a._tone({ t, dur: 0.16, type: 'sine', f0: 150, f1: 70, vol: 0.4 * v });
    a._noise({ t, dur: 0.03, vol: 0.14 * v, type: 'highpass', f0: 2000 });
  },
  pause(a, t, p, v) {
    const osc = a.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.setValueAtTime(440, t + 0.09);
    const g = a._env(t, 0.16 * v, 0.005, 0.18, 0.05);
    osc.connect(g);
    g.connect(a._sfxBus);
    osc.start(t);
    osc.stop(t + 0.32);
  },

  // ---- Announcer-style stingers (synth, not voice) ------------------------
  stingRound(a, t, p, v) {
    a._tone({ t, dur: 0.5, type: 'sine', f0: 110, f1: 34, vol: 0.85 * v, dest: a._dist });
    a._clank({ t, f: 300, dur: 0.4, vol: 0.45 * v, q: 1.5 });
    a._noise({ t, dur: 0.4, vol: 0.35 * v, type: 'lowpass', f0: 2400, f1: 200 });
    a._tone({ t: t + 0.02, dur: 0.45, type: 'triangle', f0: 660, f1: 650, vol: 0.13 * v });
  },
  stingKO(a, t, p, v) {
    a._tone({ t, dur: 0.9, type: 'sine', f0: 90, f1: 26, vol: 1.0 * v, dest: a._dist });
    a._noise({ t, dur: 0.9, vol: 0.65 * v, type: 'lowpass', f0: 3000, f1: 70, dest: a._dist });
    a._clank({ t, f: 220, dur: 0.6, vol: 0.5 * v });
  },
  stingWin(a, t, p, v) {
    // ~2s victory fanfare in E minor: E4 G4 A4 B4 -> E5 held.
    const ctx = a.ctx;
    const seq = [[64, 0], [67, 0.16], [69, 0.32], [71, 0.48], [76, 0.8]];
    for (const det of [0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.detune.value = det;
      for (const [n, st] of seq) osc.frequency.setValueAtTime(mtof(n), t + st);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.13 * v, t + 0.02);
      g.gain.setValueAtTime(0.13 * v, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      osc.connect(g);
      g.connect(a._sfxBus);
      osc.start(t);
      osc.stop(t + 2.05);
    }
    a._tone({ t, dur: 1.2, type: 'sine', f0: mtof(40), vol: 0.32 * v, attack: 0.02, hold: 0.7 }); // E2 root
    a._noise({ t, dur: 0.5, vol: 0.25 * v, type: 'highpass', f0: 3000 });
    a._tone({ t: t + 0.8, dur: 0.4, type: 'sine', f0: 120, f1: 40, vol: 0.5 * v });
  },
  countBeep(a, t, p, v) {
    a._tone({ t, dur: 0.13, type: 'square', f0: 880, f1: 872, vol: 0.22 * v });
  },
  fightBell(a, t, p, v) {
    // Ring-side bell: inharmonic partials, double strike on one envelope.
    const ctx = a.ctx;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(0.5 * v, t + 0.005);
    master.gain.exponentialRampToValueAtTime(0.15 * v, t + 0.28);
    master.gain.linearRampToValueAtTime(0.5 * v, t + 0.31);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const partials = [[1, 0.5], [2.02, 0.3], [2.94, 0.18]];
    for (const [r, w] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640 * r, t);
      const pg = ctx.createGain();
      pg.gain.value = w;
      osc.connect(pg);
      pg.connect(master);
      osc.start(t);
      osc.stop(t + 1.55);
    }
    master.connect(a._sfxBus);
    a._noise({ t, dur: 0.04, vol: 0.3 * v, type: 'highpass', f0: 3000 });
  },
});

// ============================================================================
// Music tracks — 16-step patterns, E-minor family, variation on an
// 8-bar super-loop (bar = 0..7). schedule(a, seq, step, time, bar).
// ============================================================================

// Menu: Em | C | Am | Bm — pad root + 8th-note arp.
const MENU_BARS = [
  { root: 40, arp: [52, 59, 64, 67, 71, 67, 64, 59] }, // Em
  { root: 36, arp: [48, 55, 64, 67, 71, 67, 64, 55] }, // C
  { root: 33, arp: [45, 52, 57, 64, 69, 64, 60, 52] }, // Am
  { root: 35, arp: [47, 54, 59, 62, 66, 62, 59, 54] }, // Bm
];

// Battle day bass riffs (E minor pentatonic, -1 = rest).
const DAY_RIFF_A = [40, -1, 40, 40, -1, 43, -1, 40, -1, 45, -1, 43, 40, -1, 38, -1];
const DAY_RIFF_B = [40, -1, 40, 43, -1, 45, -1, 47, -1, 45, -1, 43, 45, -1, 43, -1];
const DAY_LEAD = [64, 67, 71, 74, 76, 74, 71, 67];

// Battle night: brooding bass + arpeggiated minor-7th chords.
const NIGHT_BASS_A = [40, -1, -1, -1, 40, -1, 40, -1, 40, -1, -1, -1, 43, -1, 38, -1];
const NIGHT_BASS_B = [40, -1, -1, -1, 40, -1, 40, -1, 36, -1, -1, -1, 35, -1, 38, -1];
const NIGHT_CHORDS = [
  [52, 55, 59, 62], // Em7
  [52, 55, 59, 62], // Em7
  [48, 52, 55, 59], // Cmaj7
  [47, 50, 54, 57], // Bm7
];

const TRACKS = Object.assign(Object.create(null), {
  // Moody atmospheric menu: slow triangle arp, deep saw pad, sparse percussion.
  menu: {
    bpm: 96,
    schedule(a, s, step, t, bar) {
      const o = s.out;
      const ch = MENU_BARS[bar % 4];
      if (step === 0) a._mPad(o, t, ch.root, s.barDur, 1, 420);
      if (step % 2 === 0) {
        const accent = step % 8 === 0 ? 1.2 : 0.8;
        a._mLead(o, t, ch.arp[step >> 1], s.spb * 1.8, accent, 'triangle', true);
      }
      if (step === 0) a._mKick(o, t, 0.45);
      if (step === 10 && bar % 2 === 1) a._mKick(o, t, 0.3);
      if (step === 4 || step === 12) a._mHat(o, t, false, 0.6);
      if (step === 14 && bar % 4 === 3) a._mSteam(o, t, 0.8, 0.2);
    },
  },

  // Driving battle: 4-on-floor kick, offbeat hats, pentatonic square bass,
  // arp lead in the back half of the 8-bar loop, snare fill every 4th bar.
  battleDay: {
    bpm: 132,
    schedule(a, s, step, t, bar) {
      const o = s.out;
      if (step % 4 === 0) a._mKick(o, t, 1);
      if (step % 4 === 2) a._mHat(o, t, bar % 2 === 1 && step === 14, 1);
      const riff = bar % 8 < 4 ? DAY_RIFF_A : DAY_RIFF_B;
      const n = riff[step];
      if (n >= 0) a._mBass(o, t, n, s.spb * 1.7, 1, 'square');
      if (bar % 8 >= 4 && step % 2 === 1) {
        a._mLead(o, t, DAY_LEAD[(step >> 1) % 8], s.spb * 1.5, 0.8, 'square', true);
      }
      if (bar % 4 === 3 && step >= 12) a._mSnare(o, t, 0.5 + (step - 12) * 0.18);
    },
  },

  // Darker synthwave: kick 1/3, snare 2/4, 16th hats, saw bass, m7 arps.
  battleNight: {
    bpm: 132,
    schedule(a, s, step, t, bar) {
      const o = s.out;
      if (step === 0 || step === 8) a._mKick(o, t, 1);
      if (step === 4 || step === 12) a._mSnare(o, t, 1);
      if (step % 2 === 1) a._mHat(o, t, false, 0.5);
      const row = bar % 8 < 4 ? NIGHT_BASS_A : NIGHT_BASS_B;
      const n = row[step];
      if (n >= 0) a._mBass(o, t, n, s.spb * 3.4, 1, 'sawtooth');
      const ch = NIGHT_CHORDS[bar % 4];
      const note = ch[step % 4] + (step % 8 >= 4 ? 12 : 0);
      a._mLead(o, t, note, s.spb * 1.4, 0.55, 'triangle', step % 4 === 0);
    },
  },

  // Steampunk foundry: E1 drone, half-time kick, anvil clanks, steam hats,
  // relentless low pulse chug.
  battleIndustrial: {
    bpm: 132,
    schedule(a, s, step, t, bar) {
      const o = s.out;
      if (step === 0 && bar % 2 === 0) a._mPad(o, t, 28, s.barDur * 2, 1.4, 170);
      if (step === 0 || step === 8) a._mKick(o, t, 1.15);
      if (step === 4) a._mClank(o, t, bar % 4 === 2 ? 340 : 460, 1, 0.3); // anvil
      if (step === 12) a._mClank(o, t, 300, 0.9, 0.35); // anvil answer
      if (step % 2 === 0 && step !== 0 && step !== 8) {
        a._mBass(o, t, step === 14 && bar % 2 === 1 ? 43 : 40, s.spb * 1.2, 0.55, 'square');
      }
      if (step % 4 === 2) a._mSteam(o, t, 1, 0.08);
      if (bar % 4 === 3 && step === 15) a._mSteam(o, t, 1.3, 0.4); // pressure release
      if (bar % 2 === 1 && step === 7) a._mClank(o, t, 820 + (bar % 4) * 90, 0.35, 0.12);
    },
  },
});
