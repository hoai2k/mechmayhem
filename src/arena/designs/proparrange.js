// SHARED TRAIT PLACEMENT — the prop roles that mean the same thing in every
// design system, because they are defined relative to the FOCAL POINT (the
// battle circle) and the lanes, not to any one system's geometry:
//
//   GATES        stand ON a walkable path where it crosses the plaza rim,
//                passage aligned along it — they frame the way in and out.
//                No path? They gate radial approaches instead.
//   FLANKS       sacred pairs (sphinxes, idols) flanking a gated approach —
//                symmetric about its axis, centred on it, both FACING the
//                focal point. This is the fix for "sphinxes at odd angles".
//   CENTREPIECES fountains, pads: the middle of a designed square (the
//                system's pocket plazas); with no plaza to take they fall
//                back to the system's own hero handling.
//   SOLOS        campfires, bus stops, vents: placed apart from everything,
//                never in a formation; street-facing solos still answer to
//                the nearest road.
//
// Each system calls this once from its planProps, then lays out the classes
// that ARE its own geometry (rhythm rows, district dressing, nests, heroes).
import { TAU } from '../../core/utils.js';
import {
  torusDist, makePropOk, gateSpots, gateNudge, makeGateOk, flankSpots,
  traitsFor, traitYaw, yawTo, shuffle,
} from './util.js';

/**
 * env: the design plan env ({ theme, rng, B, P, clearing }).
 * ctx: the prop-plan ctx arena.js hands over ({ terrain, sites, propOk }).
 * cls: classifyProps' output — this consumes gates/flanks/centerpieces/solos.
 * plan: the Map being built (spec → placements).
 * opts.plazas:     [{x, z, r}] the system's pocket plazas (pave patches).
 * opts.approaches: preferred approach angles for radial gate fallbacks
 *                  (the circuit passes its open corridors).
 * Returns the gate angles actually used, so callers can align with them.
 */
export function planTraitClasses(env, ctx, cls, plan, { plazas = [], approaches = null } = {}) {
  const { rng, P, clearing: C } = env;
  const { terrain, sites, propOk } = ctx;
  const pOk = makePropOk(propOk, sites, P);
  // guardians stand against walls — a plinth beside a facade is classical —
  // so flanks keep only a plinth's worth of building clearance
  const pOkTight = makePropOk(propOk, sites, P, 6.5);
  const gOk = makeGateOk(terrain, sites);

  // ---- gates: on the paths, at the plaza rim, one per crossing ----
  const wantGates = cls.gates.reduce((s, sp) => s + sp.count, 0);
  const usedAngles = [];
  if (wantGates) {
    const spots = gateSpots(terrain, rng, C + 5, wantGates, approaches);
    let gi = 0;
    for (const spec of cls.gates) {
      const out = [];
      for (let i = 0; i < spec.count; i++) {
        // walk the candidate list until one stands on legal ground; a lane
        // spot that fails slides ALONG its path, a radial one backs outward
        while (gi < spots.length && out.length <= i) {
          const s = spots[gi++];
          for (let t = 0; t < 8; t++) {
            const n = gateNudge(terrain, s, t);
            if (!gOk(n.x, n.z)) continue;
            out.push({ x: n.x, z: n.z, ry: n.ry });
            usedAngles.push(Math.atan2(n.z, n.x));
            break;
          }
        }
      }
      if (out.length) plan.set(spec, out);
    }
  }

  // ---- flanks: guardian pairs on the gated approaches, facing the centre ----
  cls.flanks.forEach((spec, si) => {
    const a = usedAngles.length
      ? usedAngles[si % usedAngles.length]
      : (approaches?.length ? approaches[si % approaches.length] : rng.range(0, TAU));
    for (let t = 0; t < 6; t++) {
      const r = C + 11 + t * 3.5;
      const pair = flankSpots(a, r, 17 + t * 1.5);
      if (pair.every((p) => pOkTight(p.x, p.z, spec.name))) {
        plan.set(spec, pair);
        return;
      }
    }
    // no room astride the approach: sweep the rim for any two footholds,
    // still facing in — guardians, just not an avenue
    const out = [];
    for (let i = 0; i < 8 && out.length < 2; i++) {
      const aa = a + Math.PI / 2 + i * (TAU / 8);
      for (let t = 0; t < 6; t++) {
        const r = C + 10 + t * 3.5;
        const x = Math.cos(aa) * r, z = Math.sin(aa) * r;
        if (!pOkTight(x, z, spec.name)) continue;
        if (out.some((o) => torusDist(o.x, o.z, x, z, P) < 14)) break;
        out.push({ x, z, ry: yawTo(x, z, 0, 0) });
        break;
      }
    }
    if (out.length) plan.set(spec, out);
  });

  // ---- centrepieces: the middle of a designed square ----
  const freePlazas = shuffle(rng, [...plazas]);
  for (const spec of cls.centerpieces) {
    const out = [];
    for (let i = 0; i < spec.count; i++) {
      const pl = freePlazas.pop();
      if (pl && propOk(pl.x, pl.z, spec.name)) out.push({ x: pl.x, z: pl.z });
    }
    if (out.length === spec.count) plan.set(spec, out);
    else cls.heroes.push(spec);        // no plaza to take — a landmark then
  }

  // ---- solos: apart from everything, never in a formation ----
  for (const spec of cls.solos) {
    const tr = traitsFor(spec.name);
    const out = [];
    let guard = 0;
    while (out.length < spec.count && guard++ < 60) {
      const a = rng.range(0, TAU);
      const r = rng.range(C + 14, P / 2 - 20);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!pOk(x, z, spec.name)) continue;
      if (out.some((o) => torusDist(o.x, o.z, x, z, P) < 30)) continue;
      out.push({ x, z, ry: traitYaw(tr, terrain, rng, x, z, {}) });
    }
    if (out.length) plan.set(spec, out);
  }

  return usedAngles;
}
