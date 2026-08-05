// Shared vocabulary for the arena DESIGN SYSTEMS (see designs/index.js).
//
// Everything here is torus-aware: the arena is one periodic cell of period P,
// so "how far apart are these two things" and "is this pattern continuous
// across the border" are the same question, and both are answered with
// wrapped deltas. A design system that measures with plain Math.hypot builds
// a board whose seam ring is either empty or double-booked — the exact
// artifact the systems exist to remove.
import { TAU } from '../../core/utils.js';
import { traitsFor } from './proptraits.js';

export { traitsFor };

export const wrapD = (d, P) => {
  let x = (d + P / 2) % P;
  if (x < 0) x += P;
  return x - P / 2;
};

export const torusDist = (ax, az, bx, bz, P) =>
  Math.hypot(wrapD(ax - bx, P), wrapD(az - bz, P));

// fold a coordinate back into the primary cell [-P/2, P/2)
export const fold = (v, P) => wrapD(v, P);

/**
 * Building-site validator, mirroring the rules terrain.buildingSites enforces
 * (clearing kept open, off lanes / patches / hills / bridges / the viaduct,
 * inside the cell's chunk margin) — with TORUS spacing against already-chosen
 * sites, so two sites facing each other across the seam are correctly read as
 * neighbours.
 */
export function makeSiteOk(terrain, sites) {
  const P = terrain.P, C = terrain.clearing;
  return (x, z, minD = 15) => {
    if (Math.hypot(x, z) < C + 6) return false;
    if (Math.abs(x) > P / 2 - 12 || Math.abs(z) > P / 2 - 12) return false;
    if (terrain.onLane(x, z, 6.5)) return false;
    if (terrain.onPatch(x, z, 6)) return false;
    if (terrain.viaduct &&
        Math.abs(terrain.vLocal(x, z).perp) < terrain.viaduct.w / 2 + 6) return false;
    if (terrain.heightAt(x, z) > 0.1) return false;
    if (terrain.nearBridge(x, z, 7)) return false;
    return sites.every((s) => torusDist(s.x, s.z, x, z, P) > minD);
  };
}

/**
 * Prop-spot validator on top of the arena's own propSpotOk: adds the cell
 * margin (ghost clones cover the wrap, but a prop centred ON the seam would
 * double-draw) and keeps props out of building footprints — a designed row
 * beside a tower must run along its face, not through it.
 */
export function makePropOk(propSpotOk, sites, P, margin = 10.5) {
  return (x, z, name) => {
    if (Math.abs(x) > P / 2 - 6 || Math.abs(z) > P / 2 - 6) return false;
    if (!propSpotOk(x, z, name)) return false;
    return sites.every((s) => torusDist(s.x, s.z, x, z, P) > margin);
  };
}

/**
 * Try the intended spot, then a short spiral of nudges around it. Design
 * systems place PATTERNS over terrain they did not lay out (a seeded lava run
 * through a ward), and dropping every site the terrain touches shreds the
 * pattern — nudging keeps it mostly intact. Returns {x, z} or null.
 */
export function placeNear(ok, rng, x, z, minD, { tries = 7, step = 4.5 } = {}) {
  if (ok(x, z, minD)) return { x, z };
  for (let t = 1; t <= tries; t++) {
    const a = rng.range(0, TAU), r = step * (0.6 + t * 0.55);
    const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
    if (ok(nx, nz, minD)) return { x: nx, z: nz };
  }
  return null;
}

// Fisher–Yates on the design's own rng, so a system stays deterministic per seed
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Sort a theme's prop specs into the roles a designed city gives them.
 * The base classification is GENERIC — spec shape only — so a brand-new
 * theme's palette lands in sensible formations with no edit anywhere:
 *   hero    count 1            — a landmark (blast furnace, lighthouse)
 *   medium  count 2–4          — district dressing (kiosks, vats, wrecks)
 *   rhythm  count ≥ 5          — repeatable street furniture in rows/rings
 *   clumped spec.clump         — nests (groves, container yards), kept as nests
 * PLACEMENT TRAITS (designs/proptraits.js) then REFINE by name: gates frame
 * approaches, sacred pairs flank one facing the centre, centrepieces take a
 * plaza, solos isolate, row-trait dressing joins the rhythm class, and
 * scatter-trait props are left to the theme's organic ring scatter entirely.
 */
export function classifyProps(specs) {
  const out = {
    gates: [], flanks: [], centerpieces: [], solos: [],
    heroes: [], mediums: [], rhythm: [], clumped: [],
  };
  for (const spec of specs) {
    const tr = traitsFor(spec.name);
    if (tr.scatter) continue;                       // the ring scatter owns it
    if (tr.face === 'gate') out.gates.push(spec);
    else if (tr.centerpiece) out.centerpieces.push(spec);
    else if (tr.solo) out.solos.push(spec);
    else if (spec.clump) out.clumped.push(spec);
    else if (tr.face === 'center' && spec.count === 2) out.flanks.push(spec);
    else if (tr.row && spec.count >= 3) out.rhythm.push(spec);
    else if (spec.count === 1) out.heroes.push(spec);
    else if (spec.count <= 4) out.mediums.push(spec);
    else out.rhythm.push(spec);
  }
  return out;
}

// ---- orientation: every prop's FRONT (and a gate's passage) is +Z ----
// (measured off the builders in arena/props.js — see proptraits.js)

// yaw that aims a prop's +Z from (x,z) at (cx,cz)
export const yawTo = (x, z, cx, cz) => Math.atan2(cx - x, cz - z);
// yaw that lays a prop's +Z along direction (dx,dz)
export const yawAlong = (dx, dz) => Math.atan2(dx, dz);
// industrial: snap to the world grid
export const snapYaw = (ry) => Math.round(ry / (Math.PI / 2)) * (Math.PI / 2);

// lane kinds a mech (and a procession) actually walks — where gates belong
export const PATH_KINDS = new Set(['road', 'stripe', 'sand', 'ice', 'crystal', 'stone']);

// nearest lane to (x,z): { lane, d (to centreline), along }
export function nearestLane(terrain, x, z, kinds = null) {
  let best = null;
  for (const l of terrain.lanes) {
    if (kinds && !kinds.has(l.kind)) continue;
    const along = l.axis === 'z' ? z : x;
    const perp = l.axis === 'z' ? x : z;
    const d = Math.abs(terrain.wrapD(perp - terrain.laneCenter(l, along)));
    if (!best || d < best.d) best = { lane: l, d, along };
  }
  return best;
}

export function lanePoint(terrain, lane, along) {
  const c = terrain.laneCenter(lane, along);
  return lane.axis === 'z' ? { x: c, z: along } : { x: along, z: c };
}

// unit tangent of a lane's centreline at `along` (the sine curve's slope)
export function laneTangent(terrain, lane, along) {
  const slope = lane.amp * (TAU / terrain.P) *
    Math.cos((TAU * along) / terrain.P + lane.phase);
  const dx = lane.axis === 'z' ? slope : 1;
  const dz = lane.axis === 'z' ? 1 : slope;
  const n = Math.hypot(dx, dz) || 1;
  return { dx: dx / n, dz: dz / n };
}

/**
 * Resolve a placement's yaw from its traits. Returns undefined for "no
 * preference" (placeProp rolls a random yaw), which is the honest answer for
 * a rock. `rowDir` is the row's direction when the placement is part of one;
 * `focal` is the region's focal point (the battle circle, or the pocket
 * plaza the prop belongs to).
 */
export function traitYaw(tr, terrain, rng, x, z, { focal = { x: 0, z: 0 }, rowDir = null } = {}) {
  if (tr.face === 'center') return yawTo(x, z, focal.x, focal.z);
  if (tr.face === 'road') {
    const near = nearestLane(terrain, x, z);
    if (near && near.d < near.lane.half + 14) {
      const p = lanePoint(terrain, near.lane, near.along);
      return yawTo(x, z, p.x, p.z);            // square-on to the street
    }
    return yawTo(x, z, focal.x, focal.z);      // no street: address the fight
  }
  if (tr.lane) {
    const near = nearestLane(terrain, x, z);
    if (near && near.d < near.lane.half + 12) {
      const t = laneTangent(terrain, near.lane, near.along);
      const ry = yawAlong(t.dx, t.dz);
      return tr.long === 'x' ? ry + Math.PI / 2 : ry;
    }
  }
  if (rowDir) {
    let ry = yawAlong(rowDir.dx, rowDir.dz);
    if (tr.long === 'x') ry += Math.PI / 2;
    return tr.grid ? snapYaw(ry) : ry;
  }
  if (tr.grid) return snapYaw(rng.range(0, TAU));
  return undefined;
}

/**
 * Gate spots: where the walkable lanes cross the circle of radius R around
 * the focal point — a gate stands ON the path it frames, passage (+Z) along
 * it, which is what "providing a way outward" means as a yaw. Lanes give at
 * most two spots each (one either side of the centre); radial approaches at
 * `approaches` angles (or evenly spread) fill in when the theme has no path.
 */
export function gateSpots(terrain, rng, R, want, approaches = null) {
  const spots = [];
  for (const l of terrain.lanes) {
    if (!PATH_KINDS.has(l.kind)) continue;
    let prev = null;
    for (let t = -terrain.B * 1.15; t <= terrain.B * 1.15; t += 2) {
      const p = lanePoint(terrain, l, t);
      const d = Math.hypot(p.x, p.z) - R;
      if (prev !== null && (prev < 0) !== (d < 0)) {
        const pp = lanePoint(terrain, l, t - 1);
        const tan = laneTangent(terrain, l, t - 1);
        spots.push({
          x: pp.x, z: pp.z, ry: yawAlong(tan.dx, tan.dz),
          lane: l, along: t - 1,
        });
      }
      prev = d;
    }
  }
  shuffle(rng, spots);
  let a0 = rng.range(0, TAU), i = 0;
  while (spots.length < want) {
    const a = approaches?.length ? approaches[i++ % approaches.length] : (a0 += TAU / (want + 1));
    spots.push({
      x: Math.cos(a) * R, z: Math.sin(a) * R,
      ry: yawAlong(Math.cos(a), Math.sin(a)), lane: null,
    });
  }
  return spots;
}

// the t-th placement candidate for a gate spot: a LANE spot slides ALONG its
// path (a blocked gate moves down the road, it does not step off it); a
// radial spot backs outward along its approach
export function gateNudge(terrain, spot, t) {
  if (!spot.lane) {
    const a = Math.atan2(spot.z, spot.x);
    const rr = Math.hypot(spot.x, spot.z) + t * 4;
    return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, ry: spot.ry };
  }
  const along = spot.along + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 5;
  const p = lanePoint(terrain, spot.lane, along);
  const tan = laneTangent(terrain, spot.lane, along);
  return { x: p.x, z: p.z, ry: yawAlong(tan.dx, tan.dz) };
}

/**
 * Gate validity: a gate deliberately straddles its path, so this is the
 * arena's prop rule WITHOUT the "never on a lane" clause — gates are
 * walk-through by construction (their colliders are their posts). Everything
 * else still applies: flat ground, off hazards/bridges/the viaduct, clear of
 * buildings, inside the cell.
 */
export function makeGateOk(terrain, sites) {
  const P = terrain.P;
  return (x, z) => {
    if (Math.hypot(x, z) < 16) return false;
    if (Math.abs(x) > P / 2 - 6 || Math.abs(z) > P / 2 - 6) return false;
    const patch = terrain.onPatch(x, z, 1);
    if (patch && (patch.hazard || patch.kind === 'ice')) return false;
    if (terrain.nearBridge(x, z, 2.5)) return false;
    if (terrain.viaduct &&
        Math.abs(terrain.vLocal(x, z).perp) < terrain.viaduct.w / 2 + 1.5) return false;
    if (terrain.heightAt(x, z) > 0.15) return false;
    return sites.every((s) => torusDist(s.x, s.z, x, z, P) > 12);
  };
}

// a guardian pair flanking the approach at angle `a`: symmetric about it,
// both at radius r from the focal point, both FACING it
export function flankSpots(a, r, gap) {
  const da = Math.asin(Math.min(0.9, (gap / 2) / r));
  return [a - da, a + da].map((aa) => {
    const x = Math.cos(aa) * r, z = Math.sin(aa) * r;
    return { x, z, ry: yawTo(x, z, 0, 0) };
  });
}

// a spec's authored ring band in WORLD units (theme rings are pre-scale)
export const ringBand = (spec) => [spec.ring[0] * 1.85, spec.ring[1] * 1.85];

/**
 * Emit a clump spec exactly the way the fallback scatter does — count seeds,
 * each nesting n[0]..n[1] of the prop — but at DESIGNED seed positions, so a
 * container yard lands in the yard ward instead of anywhere. Budget matches
 * the fallback's expectation, so no theme gets denser or thinner by design.
 */
export function emitClump(rng, ok, spec, seeds) {
  const out = [];
  const tr = traitsFor(spec.name);
  for (const seed of seeds) {
    if (!ok(seed.x, seed.z, spec.name)) continue;
    // a grid-trait nest is a YARD: every member shares one grid-snapped yaw
    // (container rows, quonset camps); an organic nest keeps random yaws
    const ry = tr.grid ? snapYaw(rng.range(0, TAU)) : undefined;
    out.push({ x: seed.x, z: seed.z, ry });
    const extra = rng.int(spec.clump.n[0], spec.clump.n[1]) - 1;
    for (let k = 0; k < extra; k++) {
      for (let t = 0; t < 8; t++) {
        const a = rng.range(0, TAU), r = rng.range(3, spec.clump.spread ?? 9);
        const x = seed.x + Math.cos(a) * r, z = seed.z + Math.sin(a) * r;
        if (!ok(x, z, spec.name)) continue;
        out.push({ x, z, ry });
        break;
      }
    }
  }
  return out;
}
