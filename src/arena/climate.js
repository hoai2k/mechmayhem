// CLIMATE: what the weather over an arena is DOING — how hard it is coming
// down, which way the wind blows and when it gusts. Pure data and arithmetic
// (no three, no DOM), so `test/weather.test.mjs` can run a whole match of it
// in Node; arena/weather.js turns its numbers into rain, snow, ash and dust.
//
// WEATHER ONLY WHERE IT BELONGS. An arena gets a climate when its sky, its
// light and its place in the world can carry one — the painted backdrop is a
// fixed picture, and rain falling out of uptown's clear blue sky reads as a
// bug, not as weather. The calls, argued in docs/WEATHER.md:
//
//   neon       RAIN — the midnight city under cloud: drizzle to downpour,
//              with lightning when it is heavy. Its bed was always rain.
//   jungle     RAIN — tropical: lulls broken by sudden downpours.
//   frozen     SNOW — flurries to a blizzard, wind-driven, gusting hard.
//   volcano    ASH  — always falling from the caldera, thicker in bursts.
//   foundry    ASH  — a light fall of soot from the stacks, some rounds.
//   ruins      DUST — calm desert air, then OCCASIONAL sandstorms that roll
//              in, hold and blow through.
//   scrapyard  DUST — the same, rust-brown, and less often.
//   uptown, skyterrace, harbor, quarry, orbital — none. Clear blue skies
//   (uptown, the terrace above the cloud deck), a sunset harbour, a starlit
//   crystal pit and a space station: there is nothing for weather to fall
//   from, or nowhere for it to be.
//
// INTENSITY `k` (0..1) means the same thing to every kind: 0.1 is a drizzle /
// a few flakes / a dusting of ash / sand snaking along the ground, 1 is a
// rainstorm / blizzard / ash storm / wall of dust. Three REGIMES move it:
//   wander  a new target every `dwell` seconds, approached over `rise` —
//           weather that drifts from drizzle to downpour and back
//   bursty  lulls broken by short heavy bursts (tropical showers)
//   events  a calm baseline with occasional storms that build, hold and
//           decay (sandstorms) — the first one never in the opening seconds
// On top of the level, GUSTS: discrete events (sharp rise, slower decay,
// overlapping) plus a fast flutter, which push the wind and briefly thicken
// whatever is falling. The wind's heading drifts slowly and veers in a gust.
import { clamp, clamp01, lerp, makeRng } from '../core/utils.js';

const TAU = Math.PI * 2;

export const WEATHER_KINDS = ['rain', 'snow', 'ash', 'dust'];

// Per-arena climates. Colours are linear-ish sRGB hex; `storm` is what the
// fog, sky veil and haze move toward as k rises.
//   chance   share of rounds that have weather at all
//   range    [lo, hi] of k the regime moves between
//   wind     mean wind speed (units/s, a mech is ~7 units tall), `gust` the
//            extra a full gust adds; `gustGap` seconds between gusts
//   fogNear/fogFar  multipliers on the arena's fog band at k = 1
//   veil     how opaque the sky goes at k = 1 (0 = the painted sky stays)
//   dim      how much of the sun is lost at k = 1
//   haze     density of the moving weather volume at k = 1 (see weather.js)
//   driftTone how much paler than `drop` the ground streamers are — sand
//            streaming over sand needs lifting to be seen at all; over dark
//            dirt the same lift is a field of white lines
export const WEATHER = {
  neon: {
    kind: 'rain', chance: 0.85, range: [0.12, 1], regime: 'wander',
    dwell: [16, 34], rise: 11, bias: 1.15,
    wind: 3.5, gust: 7, gustGap: [3, 8],
    lightning: 1,
    storm: 0x2c2846, fogNear: 0.32, fogFar: 0.62, veil: 0.72, dim: 0.5, haze: 0.0045,
    drop: 0xa8b4d0,
    // the city's own light caught in the streaks
    tints: [0xff3dd4, 0x53e8ff], tintAmt: 0.3,
  },
  jungle: {
    kind: 'rain', chance: 0.72, range: [0.1, 1], regime: 'bursty',
    lull: [14, 32], burst: [7, 16], rise: 5,
    wind: 2.2, gust: 5.5, gustGap: [3, 9],
    lightning: 0.6,
    storm: 0x58705f, fogNear: 0.3, fogFar: 0.6, veil: 0.6, dim: 0.42, haze: 0.0055,
    drop: 0xd2dccc, tints: [], tintAmt: 0,
  },
  frozen: {
    kind: 'snow', chance: 0.92, range: [0.1, 0.95], regime: 'wander',
    dwell: [14, 30], rise: 9, bias: 1.25,
    wind: 4.5, gust: 13, gustGap: [2.5, 7],
    storm: 0x9fb4c6, fogNear: 0.3, fogFar: 0.58, veil: 0.75, dim: 0.35, haze: 0.009,
    drop: 0xf2f6ff,
  },
  volcano: {
    kind: 'ash', chance: 1, range: [0.25, 0.85], regime: 'wander',
    dwell: [14, 28], rise: 10, bias: 1,
    wind: 2.6, gust: 5, gustGap: [3, 9],
    embers: true,
    storm: 0x4a2a1e, fogNear: 0.5, fogFar: 0.75, veil: 0.45, dim: 0.3, haze: 0.004,
    drop: 0x6e6660,
  },
  foundry: {
    kind: 'ash', chance: 0.55, range: [0.15, 0.45], regime: 'wander',
    dwell: [18, 36], rise: 12, bias: 1.3,
    wind: 2, gust: 4, gustGap: [4, 10],
    storm: 0x3a2618, fogNear: 0.75, fogFar: 0.88, veil: 0.2, dim: 0.12, haze: 0.0025,
    // soot is dark, but a flake lit by the furnace glow reads mid-grey; any
    // darker and it vanishes against the plates it is falling on
    drop: 0x8a7c70,
  },
  ruins: {
    kind: 'dust', chance: 0.78, range: [0.05, 1], regime: 'events',
    calm: [0.04, 0.14], gap: [26, 70], first: [8, 30], build: 11, hold: [12, 26], fall: 16, peak: [0.65, 1],
    wind: 5, gust: 10, gustGap: [2, 6],
    storm: 0xc89c68, fogNear: 0.25, fogFar: 0.6, veil: 0.85, dim: 0.55, haze: 0.022,
    drop: 0xf0d2a0, driftTone: 0.42,
  },
  scrapyard: {
    kind: 'dust', chance: 0.6, range: [0.05, 0.9], regime: 'events',
    calm: [0.03, 0.1], gap: [34, 85], first: [12, 40], build: 12, hold: [10, 20], fall: 18, peak: [0.55, 0.9],
    wind: 4, gust: 8.5, gustGap: [2.5, 7],
    storm: 0x8a6440, fogNear: 0.28, fogFar: 0.62, veil: 0.75, dim: 0.5, haze: 0.02,
    drop: 0xb08454, driftTone: 0.08,
  },
};

/**
 * The climate a theme should have, or null. `force` (from `?weather=`):
 *   undefined/'on'  the profile, with its own chance of happening
 *   'force'         the profile, every time
 *   'off'           none
 *   a kind          that kind on ANY arena (a dev switch, borrowing the first
 *                   profile of that kind for its numbers)
 */
export function climateProfile(theme, { force, rng } = {}) {
  if (force === 'off') return null;
  if (WEATHER_KINDS.includes(force)) {
    const own = WEATHER[theme.id];
    if (own && own.kind === force) return own;
    return Object.values(WEATHER).find((p) => p.kind === force) || null;
  }
  const p = theme.weather === false ? null : (theme.weather || WEATHER[theme.id] || null);
  if (!p) return null;
  if (force === 'force') return p;
  return (rng ? rng() : Math.random()) < (p.chance ?? 1) ? p : null;
}

export class Climate {
  /**
   * @param {object} prof  a WEATHER entry
   * @param {number} seed
   * @param {number} [pin] hold k at this value (screenshots, probes)
   */
  constructor(prof, seed = 1, pin = null) {
    this.prof = prof;
    this.rng = makeRng(seed);
    this.pin = pin;
    this.t = 0;
    const [lo, hi] = prof.range;
    // open somewhere inside the climate rather than always at its floor
    this.k = pin ?? this._pick();
    if (prof.regime === 'events') this.k = pin ?? this.rng.range(...prof.calm);
    this.target = this.k;
    this.rise = prof.rise ?? 10;
    this.timer = prof.regime === 'events'
      ? this.rng.range(...(prof.first || prof.gap))
      : this.rng.range(...(prof.dwell || prof.lull || [10, 20]));
    this.phase = 'calm';          // events: calm | build | hold | fall; bursty: lull | burst
    if (prof.regime === 'bursty') {
      this.phase = this.rng.chance(0.35) ? 'burst' : 'lull';
      if (pin == null) this.k = this.target = this.phase === 'burst' ? this.rng.range(0.6, hi) : this.rng.range(lo, lo + 0.25);
    }
    this.storm = 0;               // events: 0..1 how far into a storm (for callers)
    // wind
    this.heading = this.rng.range(0, TAU);
    this.veerPh = this.rng.range(0, TAU);
    this.gusts = [];              // {a, t, rise, hold, fall}
    this.gustIn = this.rng.range(...prof.gustGap);
    this.gust = 0;                // 0..1 envelope
    this.windSpeed = prof.wind;
    this.windX = Math.cos(this.heading) * prof.wind;
    this.windZ = Math.sin(this.heading) * prof.wind;
    this.kEff = this.k;
    void lo;
  }

  _pick() {
    const [lo, hi] = this.prof.range;
    return lo + (hi - lo) * Math.pow(this.rng(), this.prof.bias ?? 1);
  }

  step(dt) {
    const p = this.prof;
    this.t += dt;
    if (this.pin == null) this._level(dt);
    this._wind(dt);
    // a gust briefly thickens what is falling — the lash of a squall
    this.kEff = clamp01(this.k * (1 + 0.3 * this.gust) + (p.kind === 'dust' ? 0.12 * this.gust * this.k : 0));
    return this;
  }

  _level(dt) {
    const p = this.prof;
    const [lo, hi] = p.range;
    this.timer -= dt;
    let rise = this.rise;
    if (p.regime === 'wander') {
      if (this.timer <= 0) {
        this.target = this._pick();
        this.timer = this.rng.range(...p.dwell);
      }
    } else if (p.regime === 'bursty') {
      if (this.timer <= 0) {
        if (this.phase === 'lull') {
          this.phase = 'burst';
          this.target = this.rng.range(0.62, hi);
          this.timer = this.rng.range(...p.burst);
        } else {
          this.phase = 'lull';
          this.target = this.rng.range(lo, lo + 0.25);
          this.timer = this.rng.range(...p.lull);
        }
      }
      rise = this.phase === 'burst' ? p.rise : p.rise * 1.4;   // downpours arrive fast, ease off slower
    } else if (p.regime === 'events') {
      if (this.timer <= 0) {
        if (this.phase === 'calm') {
          this.phase = 'build';
          this.peak = this.rng.range(...p.peak);
          this.target = this.peak;
          this.timer = p.build;
        } else if (this.phase === 'build') {
          this.phase = 'hold';
          this.timer = this.rng.range(...p.hold);
        } else if (this.phase === 'hold') {
          this.phase = 'fall';
          this.target = this.rng.range(...p.calm);
          this.timer = p.fall;
        } else {
          this.phase = 'calm';
          this.timer = this.rng.range(...p.gap);
        }
      }
      // a storm front arrives over `build` and blows through over `fall`;
      // inside a phase the level breathes a little so a hold is not a plateau
      rise = this.phase === 'build' ? p.build / 3 : this.phase === 'fall' ? p.fall / 3 : 4;
      if (this.phase === 'hold') this.target = clamp(this.peak + 0.12 * Math.sin(this.t * 0.45), lo, hi);
      this.storm = clamp01((this.k - p.calm[1]) / Math.max(0.05, (this.peak ?? hi) - p.calm[1]));
    }
    this.k = lerp(this.k, this.target, 1 - Math.exp(-dt / Math.max(0.1, rise)));
    this.k = clamp(this.k, 0, 1);
  }

  _wind(dt) {
    const p = this.prof;
    // gust events: a sharp rise, a hold, a slower decay; they overlap
    this.gustIn -= dt * (0.7 + 0.6 * this.k);          // stormier = gustier
    if (this.gustIn <= 0) {
      this.gusts.push({
        a: this.rng.range(0.35, 1), t: 0,
        rise: this.rng.range(0.35, 1.1), hold: this.rng.range(0, 1.2), fall: this.rng.range(1.4, 3.8),
        veer: this.rng.range(-0.25, 0.25),
      });
      this.gustIn = this.rng.range(...p.gustGap);
    }
    let g = 0, veer = 0;
    for (let i = this.gusts.length - 1; i >= 0; i--) {
      const e = this.gusts[i];
      e.t += dt;
      let v;
      if (e.t < e.rise) v = e.t / e.rise;
      else if (e.t < e.rise + e.hold) v = 1;
      else v = 1 - (e.t - e.rise - e.hold) / e.fall;
      if (v <= 0 && e.t > e.rise) { this.gusts.splice(i, 1); continue; }
      v = clamp01(v);
      v = v * v * (3 - 2 * v);
      if (v * e.a > g) { g = v * e.a; veer = e.veer * v; }
    }
    // fast flutter on top — wind is never a smooth number
    const fl = 0.08 * (Math.sin(this.t * 3.1 + 1.3) + Math.sin(this.t * 5.3) * 0.6 + Math.sin(this.t * 8.7 + 2) * 0.3);
    this.gust = clamp01(g + fl * (0.3 + 0.7 * this.k));
    const dir = this.heading + 0.35 * Math.sin(this.t * 0.031 + this.veerPh) + veer;
    this.windSpeed = p.wind * (0.55 + 0.45 * this.k) + p.gust * this.gust * (0.4 + 0.6 * this.k);
    this.windX = Math.cos(dir) * this.windSpeed;
    this.windZ = Math.sin(dir) * this.windSpeed;
  }
}
