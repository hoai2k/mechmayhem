// CITY WARDS — the district design system (the default).
//
// Kevin Lynch's reading of what makes a city legible — paths, edges,
// DISTRICTS, NODES, LANDMARKS — applied to a toroidal fighting board. The
// cell is partitioned into a jittered 3×3 grid of WARDS (~90–100 units, a
// real city block scale), and each ward is given a ROLE, so the board has
// distinct neighbourhoods instead of one even sprinkle:
//
//   stage   — the ward the spawn plaza sits in; kept open (the arena's node)
//   blocks  — dense mini street grids of towers (the fight-in-alleys texture)
//   towers  — the high district: one landmark spire ringed by its court
//             (orientation: you always know which way the towers are)
//   market  — a couple of low sheds plus the theme's characterful mid props
//             clustered into a bazaar
//   yard    — low buildings and the theme's clumped props (container yards,
//             groves) nested together
//   plaza   — a paved pocket plaza (painted `pave` patch), no buildings, a
//             ring of street furniture — the second open node the ask for
//             "one or two plazas if the rest is dense" names; a second
//             scatter ward converts on a coin flip
//   scatter — loose solo cover, the breathing room between set pieces
//
// CONTINUITY ACROSS THE WRAP: the ward grid spans the whole cell period, so
// wards tile — a ward butting the border reads as the same ward continuing on
// the far side, and the seam ring carries ordinary city instead of going
// quiet. All spacing is measured on the torus (designs/util.js).
import { TAU } from '../../core/utils.js';
import {
  wrapD, torusDist, makeSiteOk, makePropOk, placeNear, shuffle,
  classifyProps, emitClump, traitsFor, traitYaw, PATH_KINDS,
  sunYawOf, frontClear,
  lanePoint, laneTangent, yawAlong,
} from './util.js';
import { planTraitClasses } from './proparrange.js';

const r1 = (v) => Math.round(v * 10) / 10;

// building budget shares per ward role (normalized over the wards actually dealt)
const ROLE_W = { blocks: 3, towers: 1.8, market: 0.7, yard: 1, scatter: 1.4 };

export const WARDS = {
  id: 'wards',

  plan(env) {
    const { theme, rng, P, clearing: C } = env;
    const n = 3, w = P / n;

    // jittered periodic grid of ward centres — covers the WHOLE cell, seam
    // ring included, which is what keeps the board continuous at the border
    const wards = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        wards.push({
          x: wrapD((i + 0.5) * w - P / 2 + rng.range(-0.14, 0.14) * w, P),
          z: wrapD((j + 0.5) * w - P / 2 + rng.range(-0.14, 0.14) * w, P),
          role: null,
        });
      }
    }
    // the ward holding the spawn plaza is the STAGE and stays open
    let stage = wards[0];
    for (const wd of wards) {
      if (torusDist(wd.x, wd.z, 0, 0, P) < torusDist(stage.x, stage.z, 0, 0, P)) stage = wd;
    }
    stage.role = 'stage';
    const rest = wards.filter((wd) => wd !== stage);
    const deck = shuffle(rng,
      ['blocks', 'blocks', 'towers', 'market', 'yard', 'plaza', 'scatter', 'scatter']);
    rest.forEach((wd, i) => { wd.role = deck[i % deck.length]; });
    // most of the deck is dense, so sometimes a second scatter ward opens up
    // into a plaza — "one or two plazas"
    if (rng.chance(0.45)) {
      const sc = rest.find((wd) => wd.role === 'scatter');
      if (sc) sc.role = 'plaza';
    }
    const plazas = rest.filter((wd) => wd.role === 'plaza');

    // pocket plazas are PAVED — a painted `pave` patch at each plaza ward,
    // put FIRST so the theme's seeded lakes and pools keep clear of them
    const paves = plazas.map((wd) => ({
      x: r1(wd.x), z: r1(wd.z), r: r1(rng.range(11, 15)),
    }));
    const L0 = env.theme.layout || {};
    const layout = {
      ...L0,
      patches: [
        { kind: 'pave', glow: theme.ground?.accent || null, list: paves },
        ...(L0.patches || []),
      ],
    };

    return {
      layout,
      buildings: (ctx) => planBuildings(env, wards, ctx),
      props: (ctx) => planProps(env, wards, paves, ctx),
    };
  },
};

function planBuildings(env, wards, { terrain, rng, count }) {
  const { theme, P } = env;
  const [lo, hi] = theme.buildings.hRange;
  const sites = [];
  const ok = makeSiteOk(terrain, sites);
  const dense = wards.filter((wd) => ROLE_W[wd.role]);
  const totalW = dense.reduce((s, wd) => s + ROLE_W[wd.role], 0) || 1;

  dense.forEach((wd, ci) => {
    const quota = Math.max(1, Math.round(count * ROLE_W[wd.role] / totalW));
    switch (wd.role) {
      case 'blocks': {
        // a mini street grid: towers on a pitch with alleys between, aligned
        // to the world axes so the ward reads with the painted road grid.
        // PITCH AND SPACING LEAVE ROOM FOR THE ALLEY: a massed silhouette is
        // up to 19 wide, and at pitch 15-17 with 13-unit site spacing two
        // wide neighbours interpenetrated — usually reading as density,
        // occasionally sealing the alley into one solid block. The grid is a
        // touch wider now and the spacing floor higher, so the narrowest
        // alley two typical towers can leave is a walkable one.
        const pitch = rng.range(16.5, 18.5);
        const grid = shuffle(rng, [-1, 0, 1].flatMap((gx) => [-1, 0, 1].map((gz) => [gx, gz])));
        let placed = 0, first = true;
        for (const [gx, gz] of grid) {
          if (placed >= Math.min(quota, 7)) break;
          const spot = placeNear(ok, rng,
            wd.x + gx * pitch + rng.range(-1.6, 1.6),
            wd.z + gz * pitch + rng.range(-1.6, 1.6), 15, { tries: 3, step: 3 });
          if (!spot) continue;
          sites.push({ ...spot, cluster: ci, tall: first });
          first = false;
          placed++;
        }
        break;
      }
      case 'towers': {
        // the high district: a landmark spire with a court of near-full-height
        // towers around it — the skyline feature you orient by
        const centre = placeNear(ok, rng, wd.x, wd.z, 15);
        if (centre) sites.push({ ...centre, cluster: ci, tall: true });
        const court = Math.max(2, quota - 1);
        for (let i = 0; i < court; i++) {
          const a = rng.range(0, TAU) + (i / court) * TAU;
          const spot = placeNear(ok, rng,
            wd.x + Math.cos(a) * rng.range(17, 22),
            wd.z + Math.sin(a) * rng.range(17, 22), 14, { tries: 4 });
          if (spot) {
            sites.push({ ...spot, cluster: ci, tall: false, hRange: [Math.max(lo, hi - 1), hi] });
          }
        }
        break;
      }
      case 'market':
      case 'yard': {
        // low sheds — the props are the point of these wards
        const nB = wd.role === 'market' ? Math.min(quota, 2) : Math.min(quota, 3);
        for (let i = 0; i < nB; i++) {
          const a = rng.range(0, TAU);
          const spot = placeNear(ok, rng,
            wd.x + Math.cos(a) * rng.range(12, 20),
            wd.z + Math.sin(a) * rng.range(12, 20), 15, { tries: 5 });
          if (spot) {
            sites.push({ ...spot, cluster: -1, tall: false, hRange: [lo, Math.min(hi, lo + 1)] });
          }
        }
        break;
      }
      case 'scatter': {
        for (let i = 0; i < quota; i++) {
          const spot = placeNear(ok, rng,
            wd.x + rng.range(-0.42, 0.42) * (P / 3),
            wd.z + rng.range(-0.42, 0.42) * (P / 3), 17, { tries: 5 });
          if (spot) sites.push({ ...spot, cluster: -1, tall: false });
        }
        break;
      }
    }
  });

  // top up to the theme's budget with cell-wide solo cover (seam ring
  // included — uniform over the torus, so no band goes quiet)
  let guard = 0;
  while (sites.length < count && guard++ < 240) {
    const x = rng.range(-P / 2 + 14, P / 2 - 14), z = rng.range(-P / 2 + 14, P / 2 - 14);
    if (ok(x, z, 17)) sites.push({ x, z, cluster: -1, tall: false });
  }
  return sites;
}

function planProps(env, wards, paves, ctx) {
  const { rng, footprints, specs, propOk, terrain } = ctx;
  const { P } = env;
  // every traitYaw in this planner carries the arena's sun azimuth, so a
  // solar collector can answer to it (proptraits.js face:'sun')
  const sunYaw = sunYawOf(env.theme);
  const yawOf = (tr, x, z, extra = {}) =>
    traitYaw(tr, terrain, rng, x, z, { sunYaw, ...extra });
  const pOk = makePropOk(propOk, footprints, P);
  const plan = new Map();
  const cls = classifyProps(specs);
  const byRole = (role) => wards.filter((wd) => wd.role === role);
  const denseWards = wards.filter((wd) => ['blocks', 'towers', 'market', 'yard'].includes(wd.role));
  const plazaWards = byRole('plaza');

  // gates on the paths, guardians flanking them, centrepieces on the pocket
  // plazas, solos apart — the trait classes shared by every system
  planTraitClasses(env, ctx, cls, plan, { plazas: paves });

  // --- rhythm props: rows along ward block faces + a ring round each plaza;
  // lane-trait specs (colonnades, rails) line the walkable lanes instead ---
  const walkLanes = terrain.lanes.filter((l) => PATH_KINDS.has(l.kind));
  cls.rhythm.forEach((spec, si) => {
    const tr = traitsFor(spec.name);
    const out = [];
    let budget = spec.count;
    if (tr.lane && walkLanes.length) {
      // a processional row: along the path, set back off its shoulder
      const lane = walkLanes[si % walkLanes.length];
      const side = rng.chance(0.5) ? 1 : -1;
      const start = (rng.chance(0.5) ? 1 : -1) * rng.range(env.clearing + 6, env.B * 0.5);
      const spacing = rng.range(8, 10);
      for (let i = 0; i < spec.count; i++) {
        const along = start + i * spacing * Math.sign(start || 1);
        const p = lanePoint(terrain, lane, along);
        const t = laneTangent(terrain, lane, along);
        const x = p.x + -t.dz * (lane.half + 2.6) * side;
        const z = p.z + t.dx * (lane.half + 2.6) * side;
        if (!pOk(x, z, spec.name)) continue;
        out.push({ x, z, ry: yawAlong(t.dx, t.dz) });
        budget--;
      }
    }
    if (si === 0 && plazaWards.length && budget > 0) {
      for (const wd of plazaWards) {
        const ringN = Math.min(6, Math.max(4, Math.floor(budget / 2)));
        const rr = rng.range(15, 18);
        for (let i = 0; i < ringN && budget > 0; i++) {
          const a = (i / ringN) * TAU + rng.range(-0.1, 0.1);
          const x = wd.x + Math.cos(a) * rr, z = wd.z + Math.sin(a) * rr;
          if (!pOk(x, z, spec.name)) continue;
          // street furniture on a plaza rim addresses the plaza
          const ry = yawOf(tr, x, z, { focal: wd }) ?? (a + Math.PI / 2);
          if (!frontClear(tr, footprints, x, z, ry)) continue;
          out.push({ x, z, ry });
          budget--;
        }
        if (budget <= 0) break;
      }
    }
    // colonnade rows: along a random face of a dense ward, spaced ~8, aligned
    const rows = shuffle(rng, [...denseWards]);
    for (const wd of rows) {
      if (budget <= 0) break;
      const axis = rng.chance(0.5) ? 'x' : 'z';
      const side = rng.chance(0.5) ? 1 : -1;
      const off = rng.range(30, 38) * side;      // just outside the block grid
      const len = Math.min(budget, rng.int(3, 5));
      const spacing = rng.range(7.5, 9.5);
      const a0 = -((len - 1) / 2) * spacing;
      const rowDir = axis === 'x' ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
      for (let i = 0; i < len; i++) {
        const along = a0 + i * spacing;
        const x = axis === 'x' ? wd.x + along : wd.x + off;
        const z = axis === 'x' ? wd.z + off : wd.z + along;
        if (!pOk(x, z, spec.name)) continue;
        const ry = yawOf(tr, x, z, { rowDir }) ?? yawAlong(rowDir.dx, rowDir.dz);
        // a collector will not stand looking into a wall (proptraits clearFront)
        if (!frontClear(tr, footprints, x, z, ry)) continue;
        out.push({ x, z, ry });
        budget--;
      }
    }
    // leftovers scatter near dense ward centres
    let guard = 0;
    while (budget > 0 && guard++ < 40) {
      const wd = denseWards[rng.int(0, denseWards.length - 1)] || wards[0];
      const a = rng.range(0, TAU), rr = rng.range(14, 40);
      const x = wd.x + Math.cos(a) * rr, z = wd.z + Math.sin(a) * rr;
      if (!pOk(x, z, spec.name)) continue;
      const ry = yawOf(tr, x, z, {});
      if (!frontClear(tr, footprints, x, z, ry)) continue;
      out.push({ x, z, ry });
      budget--;
    }
    if (out.length) plan.set(spec, out);
  });

  // --- medium props (counts 2–4): the first two specs cluster into the
  // MARKET ward's bazaar; later specs spread ward to ward as dressing.
  // Yaw answers to traits — obelisks face the fight, vats snap to the grid ---
  const market = byRole('market')[0];
  cls.mediums.forEach((spec, si) => {
    const tr = traitsFor(spec.name);
    const out = [];
    if (si < 2 && market) {
      for (let i = 0; i < spec.count; i++) {
        for (let t = 0; t < 10; t++) {
          const a = rng.range(0, TAU), rr = rng.range(6, 18);
          const x = market.x + Math.cos(a) * rr, z = market.z + Math.sin(a) * rr;
          if (!pOk(x, z, spec.name)) continue;
          out.push({ x, z, ry: yawOf(tr, x, z, {}) });
          break;
        }
      }
    } else {
      const pool = shuffle(rng, [...denseWards, ...byRole('scatter')]);
      for (let i = 0; i < spec.count; i++) {
        const wd = pool[i % Math.max(1, pool.length)] || wards[0];
        for (let t = 0; t < 10; t++) {
          const a = rng.range(0, TAU), rr = rng.range(8, 26);
          const x = wd.x + Math.cos(a) * rr, z = wd.z + Math.sin(a) * rr;
          if (!pOk(x, z, spec.name)) continue;
          out.push({ x, z, ry: yawOf(tr, x, z, {}) });
          break;
        }
      }
    }
    if (out.length) plan.set(spec, out);
  });

  // --- heroes anchor districts: the tower court first, then a plaza rim ---
  const heroSpots = [...byRole('towers'), ...plazaWards, ...byRole('yard')];
  cls.heroes.forEach((spec, si) => {
    const tr = traitsFor(spec.name);
    const wd = heroSpots[si % Math.max(1, heroSpots.length)];
    if (!wd) return;
    for (let t = 0; t < 12; t++) {
      const a = rng.range(0, TAU), rr = rng.range(16, 26) + t * 1.5;
      const x = wd.x + Math.cos(a) * rr, z = wd.z + Math.sin(a) * rr;
      if (!pOk(x, z, spec.name)) continue;
      plan.set(spec, [{ x, z, ry: yawOf(tr, x, z, {}) }]);
      break;
    }
  });

  // --- clumped props nest in the yard (then scatter wards), as real yards ---
  const nests = [...byRole('yard'), ...byRole('scatter'), ...byRole('market')];
  cls.clumped.forEach((spec, si) => {
    const seeds = [];
    for (let i = 0; i < spec.count; i++) {
      const wd = nests[(si + i) % Math.max(1, nests.length)] || wards[0];
      seeds.push({
        x: wd.x + rng.range(-0.35, 0.35) * (P / 3),
        z: wd.z + rng.range(-0.35, 0.35) * (P / 3),
      });
    }
    const out = emitClump(rng, pOk, spec, seeds);
    if (out.length) plan.set(spec, out);
  });

  return plan;
}
