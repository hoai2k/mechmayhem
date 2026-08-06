// GRAND AXIS — the boulevard design system.
//
// The axial city: two straight principal boulevards crossing AT the spawn
// plaza (the arena's centre becomes the city's crossing node), and a second
// pair of boulevards running exactly ALONG the cell border — which is the
// design system's answer to the wrap seam. A lane whose centreline sits at
// P/2 is continuous across the border by construction, so leaving the board
// on any side means crossing an ordinary street into the next block: the
// seam is a place now, not an absence.
//
// The urban grammar is enclosure and the terminated vista: buildings stand in
// STREET WALLS flanking the boulevards (fronts aligned, rhythmic spacing, the
// city-block scale research puts at ~80–110 m — here one wall building every
// ~20 units with the crossing every cell), four gateway towers frame the
// central plaza diagonals, and the four cell-corner towers assemble — through
// the wrap — into one gateway cluster over the border crossing. Density
// falls off with distance from an avenue, and one or two POCKET PLAZAS
// (paved patches) open mid-quadrant so the dense walls have relief.
//
// The theme keeps its voice: boulevard kind/style/width come from the theme's
// own road lanes (which this system consumes), hazard and water lanes stay
// seeded and organic, and every prop is the theme's own, arranged instead of
// sprinkled.
import { TAU } from '../../core/utils.js';
import {
  makeSiteOk, makePropOk, placeNear, shuffle, classifyProps, emitClump,
  traitsFor, traitYaw, sunYawOf, frontClear,
} from './util.js';
import { planTraitClasses } from './proparrange.js';

const r1 = (v) => Math.round(v * 10) / 10;

export const AVENUES = {
  id: 'avenues',

  plan(env) {
    const { theme, rng, P, clearing: C } = env;
    const L0 = theme.layout || {};

    // the theme's road/stripe lanes become the boulevards; everything else
    // (lava runs, canals, rivers) stays seeded and organic
    const lanes0 = L0.lanes || [];
    const roads = lanes0.filter((l) => l.kind === 'road' || l.kind === 'stripe');
    const others = lanes0.filter((l) => l.kind !== 'road' && l.kind !== 'stripe');
    const proto = roads[0] || { kind: 'road', style: 'asphalt', width: 7 };
    const Wp = (proto.width ?? 6) + 1.5;                    // the principal pair
    const Ws = Math.max(5, (proto.width ?? 6) - 0.5);       // the border pair
    const mk = (axis, at, width, amp) => ({
      kind: proto.kind, style: proto.style || proto.kind, axis, at, width,
      amp, phase: rng.range(0, TAU),
      glow: proto.glow || null, dash: proto.dash || null, color: proto.color || null,
    });
    const lanes = [
      mk('x', 0, Wp, rng.range(0, 1.5)),
      mk('z', 0, Wp, rng.range(0, 1.5)),
      mk('x', P / 2, Ws, 0),
      mk('z', P / 2, Ws, 0),
      ...others,
    ];

    // pocket plazas: one or two, mid-quadrant, paved
    const quads = shuffle(rng, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    const nPlaza = 1 + (rng.chance(0.5) ? 1 : 0);
    const plazas = [];
    for (let i = 0; i < nPlaza; i++) {
      const [sx, sz] = quads[i];
      plazas.push({
        x: r1(sx * (C + rng.range(16, 30))),
        z: r1(sz * (C + rng.range(16, 30))),
        r: r1(rng.range(10, 13)),
      });
    }

    const layout = {
      ...L0,
      lanes,
      patches: [
        { kind: 'pave', glow: theme.ground?.accent || null, list: plazas },
        ...(L0.patches || []),
      ],
    };

    const axis = { Wp, Ws, plazas };
    return {
      layout,
      buildings: (ctx) => planBuildings(env, axis, ctx),
      props: (ctx) => planProps(env, axis, ctx),
    };
  },
};

function planBuildings(env, axis, { terrain, rng, count }) {
  const { P, clearing: C } = env;
  const { Wp } = axis;
  const sites = [];
  const ok = makeSiteOk(terrain, sites);
  const put = (x, z, minD, extra = {}) => {
    const spot = placeNear(ok, rng, x, z, minD, { tries: 5, step: 3.5 });
    if (spot) sites.push({ cluster: -1, tall: false, ...spot, ...extra });
    return !!spot;
  };

  // four gateway towers framing the central crossing's diagonals, two tall
  const gr = C + 11;
  const tallDiag = rng.int(0, 3);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz], i) => {
    put(sx * gr + rng.range(-2, 2), sz * gr + rng.range(-2, 2), 14,
      { tall: i === tallDiag || i === (tallDiag + 2) % 4, cluster: 0 });
  });

  // four cell-corner towers — through the wrap these assemble into ONE
  // gateway cluster over the border crossing, one of them the vista terminus
  const cr = P / 2 - 15;
  const tallCorner = rng.int(0, 3);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz], i) => {
    put(sx * cr + rng.range(-1.5, 1.5), sz * cr + rng.range(-1.5, 1.5), 14,
      { tall: i === tallCorner, cluster: 1 });
  });

  // street walls: rows flanking both principal boulevards, filled from the
  // plaza outward and round-robin across the rows, so however much budget is
  // left the enclosure grows evenly where the fight is
  const setback = Wp / 2 + rng.range(8.5, 10.5);
  const step = rng.range(17, 20);
  const rows = [];
  for (const ax of ['x', 'z']) {
    for (const side of [1, -1]) rows.push({ ax, off: side * setback, slots: [] });
  }
  for (const row of rows) {
    for (let along = C + 8; along < P / 2 - 26; along += step) {
      for (const s of [1, -1]) row.slots.push(s * (along + rng.range(-1.5, 1.5)));
    }
    row.slots.sort((a, b) => Math.abs(a) - Math.abs(b));
  }
  // …and a SPARSER wall along the border boulevards, or the seam street runs
  // through nothing — a boulevard is a boulevard because something fronts it.
  // One row per axis per edge sign; through the wrap the row at +P/2 IS the
  // far side of the street the row at -P/2 fronts, so the pair walls both
  // sides of one road. Wider spacing than the principal walls (the seam is
  // the city's edge, not its heart), offsets clamped inside the cell margin
  // makeSiteOk enforces (|coord| <= P/2 - 12), and the same round-robin
  // shares the budget — border rows simply run out of slots sooner.
  const setbackB = Math.max(axis.Ws / 2 + 8, 13.5);
  const stepB = step * 1.6;
  for (const ax of ['x', 'z']) {
    for (const sign of [1, -1]) {
      const row = { ax, off: sign * (P / 2 - setbackB), slots: [], border: true };
      for (let along = 12; along < P / 2 - 30; along += stepB) {
        for (const s of [1, -1]) row.slots.push(s * (along + rng.range(-2, 2)));
      }
      row.slots.sort((a, b) => Math.abs(a) - Math.abs(b));
      rows.push(row);
    }
  }
  let more = true, si = 0;
  while (sites.length < count && more) {
    more = false;
    for (const row of rows) {
      if (sites.length >= count) break;
      // border rows fill at HALF the rate: the seam should read walled, not
      // outrank the principal boulevards the fight actually happens on
      if (row.border && si % 2) continue;
      const along = row.slots[row.border ? si / 2 : si];
      if (along === undefined) continue;
      more = true;
      const x = row.ax === 'x' ? along : row.off + rng.range(-1.2, 1.2);
      const z = row.ax === 'x' ? row.off + rng.range(-1.2, 1.2) : along;
      // the odd wall building rises tall — a skyline rhythm along the avenue
      put(x, z, 13, { cluster: 2 + rows.indexOf(row), tall: rng.chance(0.08) });
    }
    si++;
  }

  // whatever budget survives goes to quadrant interiors, thinning with
  // distance from the avenues (dense at the front, quiet behind)
  let guard = 0;
  while (sites.length < count && guard++ < 200) {
    const a = rng.range(0, TAU);
    const r = C + 10 + Math.abs(rng.range(0, 1) * rng.range(0, 1)) * (P / 2 - C - 30);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (ok(x, z, 17)) sites.push({ x, z, cluster: -1, tall: false });
  }
  return sites;
}

function planProps(env, axis, ctx) {
  const { rng, footprints, specs, propOk, terrain } = ctx;
  const { B, P, clearing: C } = env;
  // every traitYaw in this planner carries the arena's sun azimuth, so a
  // solar collector can answer to it (proptraits.js face:'sun')
  const sunYaw = sunYawOf(env.theme);
  const yawOf = (tr, x, z, extra = {}) =>
    traitYaw(tr, terrain, rng, x, z, { sunYaw, ...extra });
  const { Wp, plazas } = axis;
  const pOk = makePropOk(propOk, footprints, P);
  const plan = new Map();
  const cls = classifyProps(specs);

  // gates land ON the boulevards where they leave the plaza (gateSpots finds
  // the crossings), guardians flank those approaches facing in, fountains
  // take the pocket plazas, solos keep to themselves
  planTraitClasses(env, ctx, cls, plan, { plazas });

  // --- rhythm props run the avenues: staggered rows both sides, and the
  // third-and-later specs line the BORDER boulevards, so the seam reads
  // dressed exactly like any other street. Yaw is the trait's: lights and
  // billboards turn square-on to their street, colonnades run along it ---
  cls.rhythm.forEach((spec, si) => {
    const tr = traitsFor(spec.name);
    const out = [];
    const border = si >= 2;
    const ax = si % 2 === 0 ? 'x' : 'z';
    const off = border ? P / 2 - (axis.Ws / 2 + 3.5) : Wp / 2 + rng.range(3.5, 5);
    const span = border ? P / 2 - 20 : B * 1.05;
    const startR = border ? 10 : C + 4;
    const spacing = Math.max(12, (span - startR) / Math.max(2, Math.ceil(spec.count / 2)));
    const rowDir = ax === 'x' ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
    let k = 0;
    for (let along = startR; along <= span && k < spec.count; along += spacing) {
      for (const s of [1, -1]) {
        if (k >= spec.count) break;
        const side = (k % 2 === 0 ? 1 : -1) * off;
        const x = ax === 'x' ? s * along : side;
        const z = ax === 'x' ? side : s * along;
        // border rows live on the seam road's inner face (both faces exist
        // across the wrap already)
        if (!pOk(x, z, spec.name)) continue;
        const ry = yawOf(tr, x, z, { rowDir }) ?? (ax === 'x' ? Math.PI / 2 : 0);
        if (!frontClear(tr, footprints, x, z, ry)) continue;
        out.push({ x, z, ry });
        k++;
      }
    }
    if (out.length) plan.set(spec, out);
  });

  // --- mediums (counts 2–4) dress the pocket plazas and the mid-ring
  // boulevard fronts, each standing the way its trait says ---
  cls.mediums.forEach((spec, si) => {
    const tr = traitsFor(spec.name);
    const out = [];
    for (let i = 0; i < spec.count; i++) {
      let x, z;
      const pl = plazas[(si + i) % Math.max(1, plazas.length)];
      if (pl && i % 2 === 0) {
        const a = rng.range(0, TAU);
        x = pl.x + Math.cos(a) * (pl.r + rng.range(2, 5));
        z = pl.z + Math.sin(a) * (pl.r + rng.range(2, 5));
      } else {
        const ax = rng.chance(0.5) ? 'x' : 'z';
        const along = (rng.chance(0.5) ? 1 : -1) * rng.range(C + 8, C + 34);
        const side = (rng.chance(0.5) ? 1 : -1) * (Wp / 2 + rng.range(5, 9));
        x = ax === 'x' ? along : side;
        z = ax === 'x' ? side : along;
      }
      for (let t = 0; t < 8; t++) {
        const jx = x + rng.range(-2, 2) * t, jz = z + rng.range(-2, 2) * t;
        if (!pOk(jx, jz, spec.name)) continue;
        const focal = pl && i % 2 === 0 ? pl : { x: 0, z: 0 };
        out.push({ x: jx, z: jz, ry: yawOf(tr, jx, jz, { focal }) });
        break;
      }
    }
    if (out.length) plan.set(spec, out);
  });

  // --- heroes terminate vistas: beside the avenue, far down it, so looking
  // along the boulevard always ends on something (a sacred hero out there
  // faces back up the avenue at the fight) ---
  cls.heroes.forEach((spec, si) => {
    const tr = traitsFor(spec.name);
    const ax = si % 2 === 0 ? 'x' : 'z';
    const s = rng.chance(0.5) ? 1 : -1;
    for (let t = 0; t < 10; t++) {
      const along = s * (B * 0.72 + t * 3);
      const side = (Wp / 2 + 5) * (rng.chance(0.5) ? 1 : -1);
      const x = ax === 'x' ? along : side;
      const z = ax === 'x' ? side : along;
      if (!pOk(x, z, spec.name)) continue;
      plan.set(spec, [{ x, z, ry: yawOf(tr, x, z, {}) }]);
      break;
    }
  });

  // --- clumps fill the block interiors behind the street walls ---
  cls.clumped.forEach((spec) => {
    const seeds = [];
    for (let i = 0; i < spec.count; i++) {
      const a = rng.range(0, TAU);
      const r = rng.range(C + 16, P / 2 - 24);
      seeds.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    const out = emitClump(rng, pOk, spec, seeds);
    if (out.length) plan.set(spec, out);
  });

  return plan;
}
