// COLOSSEUM CIRCUIT — the combat-flow design system.
//
// Built from arena-shooter map grammar rather than urban grammar: fights in
// this game ORBIT — players circle each other around the spawn plaza — so the
// board is arranged as rings the orbit flows through, with no dead ends
// anywhere:
//
//   inner ring — small cover pods just outside the plaza edge, alternating
//     with open water so the orbit always has both a wall to break line of
//     sight on and a gap to shoot through
//   bastion ring — k dense building clusters (k = 3 or 4) with ROTATIONAL
//     symmetry: one bastion template, stamped at equal angles, so no spawn
//     approach reads different from another (the fairness rule symmetric
//     shooter maps are built on). Between bastions lie the GATES — wide open
//     corridors, the "one or two plazas" of this system — so the mid-field
//     alternates dense cover pockets with open kill ground
//   landmark — exactly ONE bastion carries an extra-tall spire. A perfectly
//     symmetric board is unreadable (which way was I running?); one deliberate
//     break is the orientation cue
//   seam bastions — clusters at the four CELL CORNERS and singles at the edge
//     midpoints. Wrap tiling assembles the corner arcs into full clusters
//     straddling the border, so crossing the seam lands you in cover, not in
//     an empty band, and the circuit continues cell to cell
//
// The theme keeps its terrain (hills, hazards, viaduct — verticality and
// risk); this system only re-chooses where the mass and the props stand.
import { TAU } from '../../core/utils.js';
import {
  makeSiteOk, makePropOk, placeNear, classifyProps, emitClump,
} from './util.js';

export const CIRCUIT = {
  id: 'circuit',

  plan(env) {
    const { rng, B, P, clearing: C } = env;
    const k = rng.chance(0.4) ? 4 : 3;
    const theta0 = rng.range(0, TAU);
    const rBastion = Math.min(Math.max(B * 0.72, C + 26), P / 2 - 34);
    const rInner = C + 11;
    // one bastion TEMPLATE, stamped rotated at every bastion angle — the
    // rotational symmetry that keeps every approach fair
    const template = [
      { dx: 0, dz: 0, main: true },
      { dx: rng.range(13, 16), dz: rng.range(-4, 4) },
      { dx: rng.range(-5, 5), dz: rng.range(13, 16) },
      { dx: rng.range(-15, -12), dz: rng.range(6, 10) },
    ];
    const geo = { k, theta0, rBastion, rInner, template };
    return {
      layout: null,   // terrain stays the theme's own: hazards ARE the risk
      buildings: (ctx) => planBuildings(env, geo, ctx),
      props: (ctx) => planProps(env, geo, ctx),
    };
  },
};

const bastionAngle = (geo, i) => geo.theta0 + (i / geo.k) * TAU;
const gateAngle = (geo, i) => geo.theta0 + ((i + 0.5) / geo.k) * TAU;

function planBuildings(env, geo, { terrain, rng, count }) {
  const { theme, P } = env;
  const { k, rBastion, rInner, template } = geo;
  const [lo, hi] = theme.buildings.hRange;
  const sites = [];
  const ok = makeSiteOk(terrain, sites);
  const put = (x, z, minD, extra = {}) => {
    const spot = placeNear(ok, rng, x, z, minD, { tries: 6, step: 3.5 });
    if (spot) sites.push({ cluster: -1, tall: false, ...spot, ...extra });
    return !!spot;
  };

  const room = () => sites.length < count;
  // bastions: the same template rotated to each angle; bastion 0 is the
  // landmark and its main tower goes tall
  const perBastion = Math.max(3, Math.min(template.length, Math.floor((count * 0.45) / k)));
  for (let i = 0; i < k; i++) {
    const a = bastionAngle(geo, i);
    const cx = Math.cos(a) * rBastion, cz = Math.sin(a) * rBastion;
    const cos = Math.cos(a + Math.PI / 2), sin = Math.sin(a + Math.PI / 2);
    for (let m = 0; m < perBastion; m++) {
      const t = template[m];
      put(cx + t.dx * cos - t.dz * sin, cz + t.dx * sin + t.dz * cos, 13,
        { cluster: i, tall: !!t.main && i === 0 });
    }
  }

  // inner ring: low cover pods on the half-step angles, alternating with the
  // open gates so the orbit is cover-gap-cover all the way round
  for (let i = 0; i < k * 2 && room(); i++) {
    const a = geo.theta0 + ((i + 0.5) / (k * 2)) * TAU;
    put(Math.cos(a) * (rInner + rng.range(-2, 2)), Math.sin(a) * (rInner + rng.range(-2, 2)),
      14, { hRange: [lo, Math.min(hi, lo + 1)] });
  }

  // seam bastions: corner arcs that wrap-assemble into full clusters over the
  // border, plus a single at each edge midpoint — the circuit continues into
  // the next cell instead of fading out. Everything past the bastions honours
  // the theme's building budget (chunk capacity is a shared purse).
  const cr = P / 2 - 14;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (room()) put(sx * cr + rng.range(-1.5, 1.5), sz * (cr - rng.range(14, 18)), 13, { cluster: 10 });
    if (room()) put(sx * (cr - rng.range(14, 18)), sz * cr + rng.range(-1.5, 1.5), 13, { cluster: 10 });
  }
  for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (room()) put(ex * cr + ez * rng.range(-8, 8), ez * cr + ex * rng.range(-8, 8), 15);
  }

  // leftover budget: sparse mid-field solo cover between the rings
  let guard = 0;
  while (sites.length < count && guard++ < 200) {
    const a = rng.range(0, TAU), r = rng.range(rInner + 14, P / 2 - 24);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (ok(x, z, 18)) sites.push({ x, z, cluster: -1, tall: false });
  }
  return sites;
}

function planProps(env, geo, { rng, sites, specs, propOk }) {
  const { B, P, clearing: C } = env;
  const { k, rBastion } = geo;
  const pOk = makePropOk(propOk, sites, P);
  const plan = new Map();
  const cls = classifyProps(specs);

  // --- rhythm props: a colonnade ringing the plaza (the colosseum wall),
  // leftovers marking the gate corridors like a race circuit's aprons ---
  cls.rhythm.forEach((spec, si) => {
    const out = [];
    let budget = spec.count;
    if (si === 0) {
      const rr = C + 5.5;
      const ringN = Math.min(budget, 8);
      for (let i = 0; i < ringN; i++) {
        const a = (i / ringN) * TAU + rng.range(-0.06, 0.06);
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        if (!pOk(x, z, spec.name)) continue;
        out.push({ x, z, ry: a + Math.PI / 2 });
        budget--;
      }
    }
    let gi = 0, guard = 0;
    while (budget > 0 && guard++ < 40) {
      const a = gateAngle(geo, gi++ % k) + rng.range(-0.12, 0.12);
      const r = rng.range(C + 16, Math.min(B * 1.1, P / 2 - 16));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!pOk(x, z, spec.name)) continue;
      out.push({ x, z, ry: a + Math.PI / 2 });
      budget--;
    }
    if (out.length) plan.set(spec, out);
  });

  // --- pairs flank a gate each: gateposts on the open corridors ---
  cls.pairs.forEach((spec, si) => {
    const out = [];
    const a = gateAngle(geo, si % k);
    const r = rBastion - rng.range(4, 8);
    const px = -Math.sin(a), pz = Math.cos(a);   // perpendicular across the gate
    for (const s of [1, -1]) {
      for (let t = 0; t < 8; t++) {
        const w = (12 + t * 2.5) * s;
        const x = Math.cos(a) * r + px * w, z = Math.sin(a) * r + pz * w;
        if (!pOk(x, z, spec.name)) continue;
        out.push({ x, z, ry: a });
        break;
      }
    }
    if (out.length) plan.set(spec, out);
  });

  // --- mediums clutter the bastion fronts: cover at the cover ---
  cls.mediums.forEach((spec, si) => {
    const out = [];
    for (let i = 0; i < spec.count; i++) {
      const a = bastionAngle(geo, (si + i) % k) + rng.range(-0.2, 0.2);
      for (let t = 0; t < 10; t++) {
        const r = rBastion - rng.range(12, 22) - t * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!pOk(x, z, spec.name)) continue;
        out.push({ x, z });
        break;
      }
    }
    if (out.length) plan.set(spec, out);
  });

  // --- the hero stands at the landmark bastion, facing the arena ---
  cls.heroes.forEach((spec, si) => {
    const a = bastionAngle(geo, si % k) + rng.range(-0.15, 0.15);
    for (let t = 0; t < 12; t++) {
      const r = rBastion + rng.range(10, 16) + t * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!pOk(x, z, spec.name)) continue;
      plan.set(spec, [{ x, z, ry: a + Math.PI }]);
      break;
    }
  });

  // --- clumps shelter BEHIND the bastions, in their shadow ---
  cls.clumped.forEach((spec, si) => {
    const seeds = [];
    for (let i = 0; i < spec.count; i++) {
      const a = bastionAngle(geo, (si + i) % k) + rng.range(-0.25, 0.25);
      const r = rBastion + rng.range(14, 26);
      seeds.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    const out = emitClump(rng, pOk, spec, seeds);
    if (out.length) plan.set(spec, out);
  });

  return plan;
}
