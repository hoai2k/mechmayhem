// Shared vocabulary for the arena DESIGN SYSTEMS (see designs/index.js).
//
// Everything here is torus-aware: the arena is one periodic cell of period P,
// so "how far apart are these two things" and "is this pattern continuous
// across the border" are the same question, and both are answered with
// wrapped deltas. A design system that measures with plain Math.hypot builds
// a board whose seam ring is either empty or double-booked — the exact
// artifact the systems exist to remove.
import { TAU } from '../../core/utils.js';

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
export function makePropOk(propSpotOk, sites, P) {
  return (x, z, name) => {
    if (Math.abs(x) > P / 2 - 6 || Math.abs(z) > P / 2 - 6) return false;
    if (!propSpotOk(x, z, name)) return false;
    return sites.every((s) => torusDist(s.x, s.z, x, z, P) > 10.5);
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
 * Sort a theme's prop specs into the roles a designed city gives them. The
 * classification is GENERIC — spec shape only, never prop names — so a new
 * theme's palette lands in sensible formations with no edit here:
 *   hero    count 1            — a landmark (blast furnace, great gate)
 *   pair    count 2            — gateposts (torii gates, sphinx guardians)
 *   medium  count 3–4          — district dressing (kiosks, vats, carts)
 *   rhythm  count ≥ 5          — repeatable street furniture (lights, pillars,
 *                                billboards) that reads best in rows and rings
 *   clumped spec.clump         — nests (groves, container yards), kept as nests
 */
export function classifyProps(specs) {
  const out = { heroes: [], pairs: [], mediums: [], rhythm: [], clumped: [] };
  for (const spec of specs) {
    if (spec.clump) out.clumped.push(spec);
    else if (spec.count === 1) out.heroes.push(spec);
    else if (spec.count === 2) out.pairs.push(spec);
    else if (spec.count <= 4) out.mediums.push(spec);
    else out.rhythm.push(spec);
  }
  return out;
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
  for (const seed of seeds) {
    if (!ok(seed.x, seed.z, spec.name)) continue;
    out.push({ x: seed.x, z: seed.z });
    const extra = rng.int(spec.clump.n[0], spec.clump.n[1]) - 1;
    for (let k = 0; k < extra; k++) {
      for (let t = 0; t < 8; t++) {
        const a = rng.range(0, TAU), r = rng.range(3, spec.clump.spread ?? 9);
        const x = seed.x + Math.cos(a) * r, z = seed.z + Math.sin(a) * r;
        if (!ok(x, z, spec.name)) continue;
        out.push({ x, z });
        break;
      }
    }
  }
  return out;
}
