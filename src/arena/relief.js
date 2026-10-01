// RELIEF: the ground is not a table top.
//
// Every arena used to stand on one flat plane at y = 0, with a single texture
// repeating every ~15 units over it. Real ground is never that: a street is a
// few centimetres BELOW its kerbs and crowned so rain runs off, a park lawn
// sits a little proud of the paths round it, a lava flow builds levees, snow is
// combed into drifts by the wind and a quarry floor is cut into benches. This
// module is that difference, as ONE smooth height field per arena.
//
// THREE RULES IT KEEPS.
//
// 1. IT TILES. The arena is a torus (the cell repeats at period P), so the
//    field must be periodic in P or a mech walking across the seam would step
//    off a cliff. Every term below is built from lattices whose cell count
//    divides the period (value noise wrapped mod L, dune wave vectors that are
//    integer multiples of 2π/P), so periodicity holds by construction rather
//    than by blending.
//
// 2. IT IS GENTLE. The field is something a mech walks OVER, never something
//    that stops him: amplitudes are fractions of a unit (a mech stands ~7
//    tall), and every authored slope stays under ~15° — the existing hills are
//    24° and nobody has ever noticed them as an obstacle. The fighter follows
//    it in applyPhysics (floor = this field), with a downhill snap so a
//    running mech hugs a descent instead of hopping off every crest.
//
// 3. IT STEPS ASIDE FOR THINGS THAT WERE BUILT. A building's chunks stand on
//    y = 0, so no ground may sit BELOW a footprint (that would float the
//    tower): footprints LIFT the field to 0 around them — a plinth, which is
//    what a real building stands on. A prop stands on whatever height it was
//    placed at, so the field is levelled to that height under it (a pad).
//    Hills, bridges and the viaduct's ramps are features measured from 0, so
//    the field is 0 under them. Voids are holes in the deck and stay at 0.
//
// The field is a GRID (sampled bilinearly, wrapped), baked in stages as the
// arena learns where things stand: the base terrain + the layout (roads,
// streams, ponds) when the Terrain is built, then the building footprints,
// then the props. Every consumer — physics, projectiles, rubble, props,
// crates, the ground mesh itself — reads the same grid, so what a mech walks
// on is exactly what is drawn.
//
// PER-ARENA CHARACTER lives in RELIEF below (and a theme may override it with
// its own `relief` block). The numbers are argued in docs/GROUND_RELIEF.md.
import { clamp, lerp } from '../core/utils.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---- per-arena profiles -------------------------------------------------
// Base terms (all optional, all periodic):
//   roll    {amp, cells, oct}  rolling fBm — grading, swales, lawns
//   ridge   {amp, cells}       ridged noise — flow ridges, rock ribs
//   bumps   {amp, cells}       small irregularity — roots, rubble, ruts
//   dunes   {amp, k:[kx,kz], warp, cells}  wind-built asymmetric ridges:
//           a gentle windward face and a steeper lee, wave vector in whole
//           cycles per cell so it tiles; amplitude breathes along the crests
//   terrace {step, edge}       quantizes the field into benches (quarry)
//   plates  {amp, n}           an n×n panel grid, each panel a fixed small
//           offset with bevelled edges (engineered decks)
// Layout shaping:
//   plaza   0..1   how much of the base survives in the spawn clearing
//   lanes   {kind|style: {depth, bevel, crown, levee}}  absolute targets
//   patches {kind: {depth|dome, bevel}}
// Shading (read by the ground shader, arena.js):
//   tint    {low, high, slope, lowAmt, highAmt, slopeAmt, range}
//   macro   {amp, tint, tintAmt}  large-scale brightness/hue variation
const CITY_LANES = {
  // a street sits below its kerbs and is crowned so water runs to the gutters
  asphalt: { depth: -0.24, bevel: 0.55, crown: 0.07 },
  plate: { depth: -0.12, bevel: 0.5, crown: 0.03 },
  canal: { depth: -0.6, bevel: 1.0 },              // a quay: steep sides
  water: { depth: -0.55, bevel: 2.2 },
  stripe: { depth: 0, bevel: 0 },                  // painted, not built
};

export const RELIEF = {
  neon: {
    roll: { amp: 0.16, cells: 3, oct: 2 }, plaza: 0.35,
    lanes: CITY_LANES,
    tint: { low: 0x0c0e14, lowAmt: 0.22, high: 0x7a7f8c, highAmt: 0.06, range: 0.3 },
    macro: { amp: 0.16, tint: 0x30264a, tintAmt: 0.10 },
  },
  uptown: {
    roll: { amp: 0.18, cells: 3, oct: 2 }, plaza: 0.35,
    lanes: CITY_LANES,
    patches: { grass: { dome: 0.55, bevel: 3 }, water: { depth: -0.55, bevel: 2.4 } },
    tint: { low: 0x6a6458, lowAmt: 0.12, high: 0xf4efe2, highAmt: 0.08, range: 0.4 },
    macro: { amp: 0.12, tint: 0xb8a78a, tintAmt: 0.10 },
  },
  foundry: {
    roll: { amp: 0.22, cells: 3, oct: 2 }, bumps: { amp: 0.05, cells: 24 }, plaza: 0.4,
    lanes: { ...CITY_LANES, lava: { depth: -0.4, bevel: 1.8, levee: 0.2 } },
    patches: { lava: { depth: -0.4, bevel: 1.8 } },
    tint: { low: 0x1a120c, lowAmt: 0.25, high: 0x9a7a5a, highAmt: 0.10, range: 0.4 },
    macro: { amp: 0.18, tint: 0x6a3a1c, tintAmt: 0.14 },
  },
  harbor: {
    // dock concrete is laid to fall toward the water: long, shallow grades
    roll: { amp: 0.2, cells: 2, oct: 2 }, plaza: 0.4,
    lanes: CITY_LANES,
    patches: { water: { depth: -0.55, bevel: 1.0 } },   // the basin has a quay edge
    tint: { low: 0x3a3c3a, lowAmt: 0.2, high: 0xd8d4c8, highAmt: 0.08, range: 0.35 },
    macro: { amp: 0.15, tint: 0x6a5434, tintAmt: 0.12 },
  },
  skyterrace: {
    // a roof falls to its drains in shallow planes — barely any of it
    roll: { amp: 0.08, cells: 4, oct: 1 }, plaza: 0.5,
    lanes: CITY_LANES,
    tint: { low: 0x50565e, lowAmt: 0.12, high: 0xe8edf2, highAmt: 0.05, range: 0.15 },
    macro: { amp: 0.10, tint: 0x8090a0, tintAmt: 0.08 },
  },
  orbital: {
    // an engineered deck: no terrain at all, but its panels are not one
    // casting — each sits a hair proud or shy of its neighbours
    plates: { amp: 0.09, n: 14 }, plaza: 1,
    lanes: CITY_LANES,
    tint: { low: 0x1a1e26, lowAmt: 0.18, high: 0xc8d2e0, highAmt: 0.08, range: 0.1 },
    macro: { amp: 0.10, tint: 0x283850, tintAmt: 0.10 },
  },
  scrapyard: {
    follow: 0.7,
    // a dirt lot: graded unevenly, churned by heavy plant, ruts in the tracks
    roll: { amp: 0.55, cells: 4, oct: 3 }, bumps: { amp: 0.1, cells: 30 }, plaza: 0.45,
    lanes: {
      dirt: { depth: -0.18, bevel: 1.4, ruts: 0.12 },
      oil: { depth: -0.3, bevel: 1.6 },
    },
    patches: { mud: { depth: -0.35, bevel: 2.5 }, oil: { depth: -0.25, bevel: 2 } },
    tint: { low: 0x2a2016, lowAmt: 0.3, high: 0xb09878, highAmt: 0.12, slope: 0x5a4632, slopeAmt: 0.15, range: 0.6 },
    macro: { amp: 0.2, tint: 0x4a3a28, tintAmt: 0.16 },
  },
  quarry: {
    follow: 0.7,
    // a working quarry floor is CUT, not grown: benches with steep risers
    roll: { amp: 1.3, cells: 3, oct: 3 }, ridge: { amp: 0.25, cells: 7 },
    terrace: { step: 0.42, edge: 0.22 }, plaza: 0.4,
    lanes: {
      dirt: { depth: -0.15, bevel: 1.6, ruts: 0.1 },
      crystal: { depth: 0.18, bevel: 1.2 },          // a vein stands proud of the rock
    },
    patches: { water: { depth: -0.7, bevel: 2.4 } },
    tint: { low: 0x1e1828, lowAmt: 0.25, high: 0xb0a0c8, highAmt: 0.12, slope: 0x2a2236, slopeAmt: 0.25, range: 0.8 },
    macro: { amp: 0.2, tint: 0x5a3a7a, tintAmt: 0.12 },
  },
  volcano: {
    follow: 0.7,
    // flows cool into ropy ridges and lobes; lava channels build their own
    // levees out of the crust they shed
    roll: { amp: 0.8, cells: 3, oct: 3 }, ridge: { amp: 0.55, cells: 6 },
    bumps: { amp: 0.12, cells: 26 }, plaza: 0.45,
    lanes: {
      lava: { depth: -0.45, bevel: 2.4, levee: 0.32 },
      stone: { depth: 0.05, bevel: 1.2 },
    },
    patches: { lava: { depth: -0.55, bevel: 2.2 }, ash: { depth: -0.1, bevel: 3 } },
    tint: { low: 0x3a2a26, lowAmt: 0.22, high: 0x0a0808, highAmt: 0.2, slope: 0x140e0c, slopeAmt: 0.2, range: 0.9 },
    macro: { amp: 0.22, tint: 0x5a2014, tintAmt: 0.12 },
  },
  frozen: {
    follow: 0.7,
    // wind-packed snow: drifts combed into long crests (sastrugi) across the
    // prevailing wind, the frozen river and lakes lying flat and low
    roll: { amp: 0.35, cells: 3, oct: 2 },
    dunes: { amp: 0.5, k: [6, 2], warp: 0.25, cells: 3 }, bumps: { amp: 0.05, cells: 32 },
    plaza: 0.45,
    lanes: { dirt: { depth: -0.22, bevel: 1.8, ruts: 0.1 }, ice: { depth: -0.32, bevel: 2.2 } },
    patches: { ice: { depth: -0.35, bevel: 2.6 } },
    tint: { low: 0x6a88a8, lowAmt: 0.16, high: 0xffffff, highAmt: 0.18, range: 0.6 },
    macro: { amp: 0.12, tint: 0x9ab8d8, tintAmt: 0.12 },
  },
  ruins: {
    follow: 0.7,
    // sand over old stone: dunes on the outskirts, the paved way and plaza
    // swept nearly level
    roll: { amp: 0.4, cells: 3, oct: 2 },
    dunes: { amp: 0.75, k: [4, 3], warp: 0.3, cells: 2 }, plaza: 0.3,
    lanes: { stone: { depth: 0.12, bevel: 0.8 }, sand: { depth: -0.35, bevel: 3 } },
    patches: { water: { depth: -0.6, bevel: 2.4 }, sand: { depth: -0.5, bevel: 2.5 } },
    tint: { low: 0x8a6a44, lowAmt: 0.14, high: 0xf0d8a8, highAmt: 0.14, range: 0.7 },
    macro: { amp: 0.14, tint: 0xc08850, tintAmt: 0.12 },
  },
  jungle: {
    follow: 0.7,
    // a forest floor heaved by roots: soft rolls, lumps everywhere, the
    // river and swamp pools sitting low
    roll: { amp: 0.6, cells: 4, oct: 3 }, bumps: { amp: 0.14, cells: 28 }, plaza: 0.45,
    lanes: { stone: { depth: -0.05, bevel: 1 }, water: { depth: -0.6, bevel: 2.2 } },
    patches: { mud: { depth: -0.4, bevel: 2.4 }, water: { depth: -0.6, bevel: 2.4 } },
    tint: { low: 0x1a2410, lowAmt: 0.25, high: 0x8aa060, highAmt: 0.12, slope: 0x3a3424, slopeAmt: 0.15, range: 0.6 },
    macro: { amp: 0.18, tint: 0x3a5a20, tintAmt: 0.14 },
  },
};

// sensible fallbacks for a lane/patch kind a profile does not name
const LANE_DEFAULT = {
  road: { depth: -0.2, bevel: 0.6, crown: 0.05 },
  water: { depth: -0.55, bevel: 2 }, canal: { depth: -0.7, bevel: 0.7 },
  lava: { depth: -0.4, bevel: 2, levee: 0.2 }, oil: { depth: -0.25, bevel: 1.5 },
  acid: { depth: -0.4, bevel: 1.4 }, mud: { depth: -0.3, bevel: 2 },
  ice: { depth: -0.25, bevel: 2 }, sand: { depth: -0.25, bevel: 2.5 },
  crystal: { depth: 0.15, bevel: 1 }, stripe: { depth: 0, bevel: 0 },
};
const PATCH_DEFAULT = {
  water: { depth: -0.5, bevel: 2.2 }, lake: { depth: -0.5, bevel: 2.2 },
  lava: { depth: -0.4, bevel: 2 }, acid: { depth: -0.4, bevel: 2 },
  oil: { depth: -0.2, bevel: 2 }, mud: { depth: -0.3, bevel: 2.2 },
  ice: { depth: -0.25, bevel: 2.4 }, sand: { depth: -0.3, bevel: 2.4 },
  grass: { dome: 0.35, bevel: 3 }, ash: { depth: -0.08, bevel: 3 },
  pave: { flat: true, bevel: 2 }, void: { flat: true, bevel: 1.5 },
  lowgrav: { flat: true, bevel: 1.5 },
};

export function reliefProfile(theme) {
  return theme.relief || RELIEF[theme.id] || null;
}

// ---- periodic noise -----------------------------------------------------
function hash(i, j, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const quint = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// value noise on an L×L lattice that wraps — u, v in cell fractions [0,1)
function pnoise(u, v, L, s) {
  const x = u * L, y = v * L;
  const i0 = Math.floor(x), j0 = Math.floor(y);
  const fx = quint(x - i0), fy = quint(y - j0);
  const a = ((i0 % L) + L) % L, b = ((j0 % L) + L) % L;
  const a1 = (a + 1) % L, b1 = (b + 1) % L;
  const n00 = hash(a, b, s), n10 = hash(a1, b, s), n01 = hash(a, b1, s), n11 = hash(a1, b1, s);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);   // 0..1
}
function fbm(u, v, L, oct, s) {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += (pnoise(u, v, L << o, s + o * 17) - 0.5) * amp;
    norm += amp * 0.5;
    amp *= 0.5;
  }
  return sum / norm;    // ~ -1..1
}

const strSeed = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

export class Relief {
  // `terrain` supplies the layout (lanes, patches, hills, bridges, viaduct,
  // clearing) and the wrap helpers; `profile` is RELIEF[theme] or the theme's
  // own block. The noise seed comes from the THEME, not the match seed, so an
  // authored arena stands on the same ground every time it is played.
  constructor(terrain, profile, { res = 256 } = {}) {
    this.t = terrain;
    this.prof = profile || {};
    this.P = terrain.P;
    this.N = res;
    this.cell = this.P / res;
    this.seed = strSeed(terrain.theme.id || 'ground') & 0xffff;
    this.base = new Float32Array(res * res);
    this.grid = new Float32Array(res * res);
    this.layout = new Float32Array(res * res);
    this.footprints = [];   // {minX,maxX,minZ,maxZ} — lift to >= 0
    this.pads = [];         // {x,z,r,y} — levelled to y
    this.enabled = !!profile;
    this._baseField();
    this._layoutField();
    this.compose();
  }

  // world coords of grid node (i, j) — node centres span [-P/2, P/2)
  nodeX(i) { return -this.P / 2 + i * this.cell; }

  _baseField() {
    const { N, P, seed } = this;
    const p = this.prof;
    if (!this.enabled) return;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const u = i / N, v = j / N;
        let h = 0;
        if (p.roll) h += p.roll.amp * fbm(u, v, p.roll.cells, p.roll.oct ?? 2, seed + 1);
        if (p.ridge) {
          const r = 1 - Math.abs(2 * pnoise(u, v, p.ridge.cells, seed + 41) - 1);
          const r2 = 1 - Math.abs(2 * pnoise(u, v, p.ridge.cells * 2, seed + 43) - 1);
          h += p.ridge.amp * (r * r * 0.75 + r2 * r2 * 0.25 - 0.4);
        }
        if (p.bumps) h += p.bumps.amp * fbm(u, v, p.bumps.cells, 2, seed + 71);
        if (p.dunes) {
          const d = p.dunes;
          // whole cycles across the cell in each axis -> periodic by construction
          const warp = d.warp * fbm(u, v, d.cells ?? 3, 2, seed + 91);
          const ph = d.k[0] * u + d.k[1] * v + warp;
          const s = ph - Math.floor(ph);
          // gentle windward rise over 72% of the wave, steeper lee after it
          const prof = s < 0.72 ? smooth(0, 0.72, s) : 1 - smooth(0.72, 1, s);
          const breathe = 0.55 + 0.9 * pnoise(u, v, 2, seed + 97);
          h += d.amp * (prof - 0.45) * breathe;
        }
        if (p.terrace) {
          const st = p.terrace.step, e = p.terrace.edge ?? 0.2;
          const q = h / st, f = q - Math.floor(q);
          // flat treads, a riser in the last `edge` of each step
          h = st * (Math.floor(q) + smooth(1 - e, 1, f));
        }
        if (p.plates) {
          const n = p.plates.n, x = u * n, y = v * n;
          const ci = Math.floor(x), cj = Math.floor(y);
          const off = (hash(ci % n, cj % n, seed + 113) - 0.5) * 2 * p.plates.amp;
          // bevel the last 6% of each panel down to its neighbour's seam
          const ex = Math.min(x - ci, 1 - (x - ci)), ey = Math.min(y - cj, 1 - (y - cj));
          h += off * smooth(0, 0.06, Math.min(ex, ey));
        }
        this.base[j * N + i] = h;
      }
    }
    void P;
  }

  // roads / streams / ponds / the plaza, as a target and a weight per node
  _layoutField() {
    const { N } = this;
    const t = this.t, p = this.prof;
    if (!this.enabled) return;
    const plazaKeep = p.plaza ?? 0.4;
    const C = t.clearing ?? 38;
    // A CHANNEL FOLLOWS THE LAND it runs through. An absolute depth is right
    // for a street (the city is graded flat round it) and wrong across
    // rolling ground: a river cut to one level through a field that rises
    // and falls by a unit leaves a cliff for a bank wherever the land is
    // high. `follow` is how much of the surrounding ground a lane's bed keeps
    // (0 = a street, ~0.7 = a stream in a valley); a patch keeps the ground
    // level at its CENTRE, so a lake bed is flat but sits where it fell.
    const follow0 = p.follow ?? 0;
    const patchBase = new Map();
    for (const q of t.patches) patchBase.set(q, this._baseAt(q.x, q.z));
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = this.nodeX(i), z = this.nodeX(j);
        let h = this.base[j * N + i];
        // the spawn clearing keeps only some of the roll — a fair start
        const r = Math.hypot(x, z);
        h *= lerp(plazaKeep, 1, smooth(C * 0.55, C + 12, r));
        // lanes: an absolute surface target inside, blended over the bevel
        for (const l of t.lanes) {
          const sp = (p.lanes && (p.lanes[l.style] || p.lanes[l.kind]))
            || LANE_DEFAULT[l.kind] || LANE_DEFAULT.road;
          if (!sp.bevel && !sp.depth) continue;
          const along = l.axis === 'z' ? z : x;
          const perp = l.axis === 'z' ? x : z;
          const d = Math.abs(t.wrapD(perp - t.laneCenter(l, along)));
          const bevel = sp.bevel || 0.5;
          if (d > l.half + bevel + (sp.levee ? 3 : 0)) continue;
          const w = 1 - smooth(l.half, l.half + bevel, d);
          let target = sp.depth + (sp.follow ?? follow0) * h;
          if (sp.crown) target += sp.crown * (1 - (d / l.half) ** 2) * (d < l.half ? 1 : 0);
          if (sp.ruts) {
            // two wheel tracks a third of the way in from each edge
            const k = d / Math.max(0.1, l.half);
            target -= sp.ruts * Math.exp(-(((k - 0.55) / 0.12) ** 2));
          }
          h = lerp(h, target, w);
          if (sp.levee) {
            const lv = sp.levee * Math.exp(-(((d - l.half - bevel * 0.75) / 1.8) ** 2));
            h += lv;
          }
        }
        // patches: basins, domes and flat pads
        for (const q of t.patches) {
          const sp = (p.patches && p.patches[q.kind]) || PATCH_DEFAULT[q.kind];
          if (!sp) continue;
          const sd = this._patchSD(q, x, z);    // <0 inside
          const bevel = sp.bevel ?? 2;
          if (sd > bevel) continue;
          const w = 1 - smooth(-bevel * 0.35, bevel, sd);
          const keep = (sp.follow ?? follow0) * patchBase.get(q);
          if (sp.flat) h = lerp(h, 0, w);
          else if (sp.dome) h = lerp(h, keep + sp.dome * smooth(0, q.r * 0.7, -sd), w);
          else h = lerp(h, keep + sp.depth, w);
        }
        this.layout[j * N + i] = h;
      }
    }
  }

  // the BASE field (before any layout) under (x,z), bilinear and wrapped
  _baseAt(x, z) {
    const { N, P } = this;
    let u = (x + P / 2) / this.cell, v = (z + P / 2) / this.cell;
    u -= Math.floor(u / N) * N; v -= Math.floor(v / N) * N;
    const i0 = Math.floor(u), j0 = Math.floor(v), fx = u - i0, fy = v - j0;
    const i1 = (i0 + 1) % N, j1 = (j0 + 1) % N, g = this.base;
    return lerp(lerp(g[j0 * N + i0], g[j0 * N + i1], fx), lerp(g[j1 * N + i0], g[j1 * N + i1], fx), fy);
  }

  // signed distance (approx) to a patch's lobe-union outline, <0 inside
  _patchSD(q, x, z) {
    const t = this.t;
    const dx = t.wrapD(x - q.x), dz = t.wrapD(z - q.z);
    if (!q.lobes) return Math.hypot(dx, dz) - q.r;
    let best = Infinity;
    for (const lb of q.lobes) best = Math.min(best, Math.hypot(dx - lb.dx, dz - lb.dz) - q.r * lb.s);
    return best;
  }

  addFootprint(b) { this.footprints.push(b); }
  addPad(x, z, r, y) { this.pads.push({ x, z, r, y }); }

  // layout + every flattening rule -> the grid everything reads
  compose() {
    const { N } = this;
    const t = this.t;
    this.grid.set(this.layout);
    if (!this.enabled) return;
    const g = this.grid;
    // generic disc/rect blends, walking only the nodes in reach
    const forNodes = (cx, cz, reach, fn) => {
      const n = Math.ceil(reach / this.cell);
      const ci = Math.round((cx + this.P / 2) / this.cell);
      const cj = Math.round((cz + this.P / 2) / this.cell);
      for (let dj = -n; dj <= n; dj++) {
        const j = (((cj + dj) % N) + N) % N;
        const dz = t.wrapD(this.nodeX(j) - cz);
        for (let di = -n; di <= n; di++) {
          const i = (((ci + di) % N) + N) % N;
          fn(j * N + i, t.wrapD(this.nodeX(i) - cx), dz);
        }
      }
    };
    // HILLS stand on 0: level the field under each cone and a little round it
    for (const hl of t.hills) {
      const F = 4;
      forNodes(hl.x, hl.z, hl.R + F, (k, dx, dz) => {
        const w = 1 - smooth(hl.R - 0.5, hl.R + F, Math.hypot(dx, dz));
        g[k] = lerp(g[k], 0, w);
      });
    }
    // BRIDGES land their ramps on 0
    for (const br of t.bridges) {
      const F = 3;
      const reach = Math.hypot(br.len / 2, br.w / 2) + F;
      const bx = br.x, bz = br.z;
      forNodes(bx, bz, reach, (k, dx, dz) => {
        const loc = t.brLocal(br, bx + dx, bz + dz);
        const ea = Math.abs(loc.along) - br.len / 2, ep = Math.abs(loc.perp) - br.w / 2;
        const out = Math.max(ea, ep, 0);
        g[k] = lerp(g[k], 0, 1 - smooth(0, F, out));
      });
    }
    // THE VIADUCT's on/off ramps meet the ground at 0
    if (t.viaduct) {
      const v = t.viaduct;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = this.nodeX(i), z = this.nodeX(j);
          const { along, perp } = t.vLocal(x, z);
          if (Math.abs(perp) > v.w / 2 + 4) continue;
          let near = Infinity;
          for (const rc of v.ramps) near = Math.min(near, Math.abs(t.wrapD(along - rc)));
          if (near > v.rampL + 4) continue;
          const w = (1 - smooth(v.w / 2, v.w / 2 + 4, Math.abs(perp))) * (1 - smooth(v.rampL, v.rampL + 4, near));
          g[j * N + i] = lerp(g[j * N + i], 0, w);
        }
      }
    }
    // BUILDINGS: no ground below their base anywhere near the footprint
    for (const b of this.footprints) {
      const F = 3.5, M = 1.2;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const hx = (b.maxX - b.minX) / 2, hz = (b.maxZ - b.minZ) / 2;
      forNodes(cx, cz, Math.hypot(hx, hz) + M + F, (k, dx, dz) => {
        const out = Math.max(Math.abs(dx) - hx - M, Math.abs(dz) - hz - M, 0);
        const w = 1 - smooth(0, F, out);
        if (g[k] < 0) g[k] = lerp(g[k], 0, w);
      });
    }
    // PROPS: levelled to the height they were set down at
    for (const pd of this.pads) {
      const F = 2.5;
      forNodes(pd.x, pd.z, pd.r + F, (k, dx, dz) => {
        const w = 1 - smooth(pd.r, pd.r + F, Math.hypot(dx, dz));
        g[k] = lerp(g[k], pd.y, w);
      });
    }
  }

  // ---- queries ----------------------------------------------------------
  // bilinear, wrapped — the one function every consumer reads
  at(x, z) {
    if (!this.enabled) return 0;
    const { N, P } = this;
    let u = (x + P / 2) / this.cell, v = (z + P / 2) / this.cell;
    u -= Math.floor(u / N) * N;
    v -= Math.floor(v / N) * N;
    const i0 = Math.floor(u), j0 = Math.floor(v);
    const fx = u - i0, fy = v - j0;
    const i1 = (i0 + 1) % N, j1 = (j0 + 1) % N;
    const g = this.grid;
    return lerp(lerp(g[j0 * N + i0], g[j0 * N + i1], fx), lerp(g[j1 * N + i0], g[j1 * N + i1], fx), fy);
  }

  // surface normal from central differences (unit, +y up)
  normal(x, z, out) {
    const e = this.cell;
    const hx = this.at(x + e, z) - this.at(x - e, z);
    const hz = this.at(x, z + e) - this.at(x, z - e);
    const nx = -hx / (2 * e), nz = -hz / (2 * e);
    const l = Math.hypot(nx, 1, nz);
    out.x = nx / l; out.y = 1 / l; out.z = nz / l;
    return out;
  }

  // worst slope in the grid, in degrees — for the probe and the doc
  stats() {
    const { N } = this;
    let lo = Infinity, hi = -Infinity, maxSlope = 0, sum = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = this.grid[j * N + i];
        lo = Math.min(lo, h); hi = Math.max(hi, h);
        const hr = this.grid[j * N + (i + 1) % N], hd = this.grid[((j + 1) % N) * N + i];
        const s = Math.hypot(hr - h, hd - h) / this.cell;
        maxSlope = Math.max(maxSlope, s);
        sum += s;
      }
    }
    return {
      min: lo, max: hi,
      maxSlopeDeg: Math.atan(maxSlope) * 180 / Math.PI,
      meanSlopeDeg: Math.atan(sum / (N * N)) * 180 / Math.PI,
    };
  }
}

void TAU;

// ONE CELL of displaced ground, P×P, as a mesh the arena tiles 3×3 (the same
// way it ghost-tiles props). Positions follow the relief exactly, normals come
// from the field itself (so the lighting reads every rise even where the mesh
// is coarse), uv runs 0..1 across the cell in the convention the old flat
// PlaneGeometry used (u = x/P + 0.5, v = 0.5 - z/P) so the painted overlay and
// the ground textures land where they always did. `aRel` carries the height
// for the ground shader's low/high shading. With relief off it is one quad.
export function reliefCellGeometry(relief, seg, yOff = 0) {
  const P = relief.P;
  if (!relief.enabled) seg = 1;
  const n = seg + 1;
  const pos = new Float32Array(n * n * 3), nrm = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2), rel = new Float32Array(n * n);
  const nv = { x: 0, y: 1, z: 0 };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -P / 2 + (i / seg) * P, z = -P / 2 + (j / seg) * P;
      const h = relief.at(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h + yOff; pos[k * 3 + 2] = z;
      relief.normal(x, z, nv);
      nrm[k * 3] = nv.x; nrm[k * 3 + 1] = nv.y; nrm[k * 3 + 2] = nv.z;
      uv[k * 2] = i / seg; uv[k * 2 + 1] = 1 - j / seg;
      rel[k] = h;
    }
  }
  const idx = new Uint32Array(seg * seg * 6);
  let o = 0;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b;      // wound to face +y
      idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
  }
  return { pos, nrm, uv, rel, idx };
}
