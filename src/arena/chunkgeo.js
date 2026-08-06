// WHAT A DESTRUCTIBLE CHUNK IS SHAPED LIKE.
//
// A building is a box because a building IS boxes — floors, walls, a roof.
// A crystal spire is not, and neither is a lava-country outcrop or a berg.
// Those are built out of the same chunks (so they collapse, take damage and
// can be climbed exactly like a tower) but every one of them read as what it
// literally was: a pile of cubes on a grid.
//
// The fix is two things, and BOTH are needed — either one alone still reads
// as a grid:
//
//   1. THE CHUNK'S OWN GEOMETRY. A crystal chunk is a faceted SHARD with a
//      pointed termination, a rock chunk is a lumpy BOULDER. Same unit size,
//      same instanced draw, one geometry per DestructibleSystem — which the
//      structures already have one of per material family, so this costs
//      nothing new.
//   2. PER-CHUNK ROTATION AND SWELL. A field of identical shards all facing
//      up on a lattice is still a lattice. Each chunk gets its own turn and
//      its own size multiplier, and the multiplier is deliberately over 1 so
//      neighbours INTERPENETRATE: overlapping blobs merge into one continuous
//      rock mass, overlapping shards into a single jagged crystal, which is
//      what stops the eye finding the cell boundaries.
//
// IT IS PURELY VISUAL. The chunk's collision box, its hp, its grid cell, the
// building AABB and everything combat measures are untouched — a rotated,
// swollen shard occupies exactly the cell it always did. So a shape change
// can never alter a fight.
import * as THREE from 'three';

// ---- helpers ----------------------------------------------------------

// A flat-shaded, NON-INDEXED geometry from a triangle soup, carrying the
// white `color` attribute every chunk mesh needs (see the note in
// destructible.js: `vertexColors` without it makes every chunk black).
function fromTris(tris) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(tris.length * 9);
  for (let t = 0; t < tris.length; t++) {
    for (let v = 0; v < 3; v++) {
      pos[t * 9 + v * 3 + 0] = tris[t][v][0];
      pos[t * 9 + v * 3 + 1] = tris[t][v][1];
      pos[t * 9 + v * 3 + 2] = tris[t][v][2];
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(pos.length).fill(1), 3));
  g.computeVertexNormals();
  return withGroup(boxProject(g));
}

// A CHUNK MESH IS BUILT WITH AN ARRAY OF SIX MATERIALS (the building path
// wants a roof material on two faces), and three renders an array-material
// mesh BY GROUP — a geometry with no groups draws nothing at all. A box has
// six of its own, one per face; anything else here needs one covering the
// whole thing. Leave it out and the structures are correct, present in every
// query, and invisible.
function withGroup(g) {
  const n = g.index ? g.index.count : g.attributes.position.count;
  g.clearGroups();
  g.addGroup(0, n, 0);
  return g;
}

/**
 * BOX-PROJECTED UVs. A shard and a boulder have no natural unwrap, and
 * without SOME uv the texture pack samples one texel and the whole chunk
 * comes out a flat colour — a rock material rendered as painted plastic.
 * Each triangle is projected down whichever world axis its normal points
 * along most, which on a faceted shape is exactly the projection that does
 * not stretch: every face is nearly flat and nearly axis-facing already.
 *
 * `scale` is in CHUNK-LOCAL units, and the geometry is a unit cube's worth,
 * so 1.0 puts one tile of the texture across one chunk. Landform chunks are
 * 4-8 world units, which is about the scale these materials are authored at.
 */
function boxProject(g, scale = 1) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    // which pair of coordinates to read off, per dominant axis
    const pick = ax > ay && ax > az ? ['z', 'y'] : (ay > az ? ['x', 'z'] : ['x', 'y']);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : (k === 1 ? b : c);
      uv[(t + k) * 2] = (v[pick[0]] + 0.5) * scale;
      uv[(t + k) * 2 + 1] = (v[pick[1]] + 0.5) * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// deterministic hash of a direction — the SAME value for every copy of a
// vertex. An icosahedron here is non-indexed, so a shared corner appears in
// five triangles; noising them independently opens five cracks.
function dirNoise(x, y, z) {
  const q = (v) => Math.round(v * 4096);
  let h = (q(x) * 374761393 + q(y) * 668265263 + q(z) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296);
}

// ---- the shapes -------------------------------------------------------

/**
 * A CRYSTAL SHARD: a hexagonal prism with a pointed termination, which is
 * the habit quartz and most gem crystals actually grow in — a shaft of
 * parallel faces ending in a pyramid, never a cube. Unit height 1 about the
 * origin, unit-ish width, so it drops into a chunk cell like the box did.
 *
 * The waist sits high (`yMid`) so the point is a short sharp cap rather than
 * a long cone, and the prism is slightly TAPERED (wider at the base) so a
 * cluster of them reads as growing out of the mass.
 */
export function shardGeometry({ sides = 6, yMid = 0.16, rBase = 0.5, rMid = 0.40 } = {}) {
  const tris = [];
  const ring = (r, y) => Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });
  const base = ring(rBase, -0.5);
  const mid = ring(rMid, yMid);
  const apex = [0, 0.5, 0];
  const centre = [0, -0.5, 0];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tris.push([base[i], base[j], mid[j]]);      // shaft
    tris.push([base[i], mid[j], mid[i]]);
    tris.push([mid[i], mid[j], apex]);          // termination
    tris.push([centre, base[j], base[i]]);      // base cap
  }
  return fromTris(tris);
}

/**
 * A ROCK BOULDER: a subdivided icosahedron pushed in and out per direction,
 * flat-shaded, so it comes out as a lumpy angular stone rather than a ball.
 * `bump` is how far the surface wanders (0.3 = a third of the radius), which
 * is enough to read as rock and little enough that the chunk still fills its
 * cell.
 */
export function boulderGeometry({ detail = 1, bump = 0.3, r = 0.56 } = {}) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    // two octaves off the direction hash: broad lobes plus a finer chip
    const k = 1 + (dirNoise(n.x, n.y, n.z) - 0.5) * 2 * bump
      + (dirNoise(n.y * 3.1, n.z * 3.1, n.x * 3.1) - 0.5) * bump * 0.5;
    p.setXYZ(i, n.x * r * k, n.y * r * k, n.z * r * k);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(p.count * 3).fill(1), 3));
  return withGroup(boxProject(g));
}

/** The plain chunk — what every building is made of, and the default. */
export function boxGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.setAttribute('color', new THREE.BufferAttribute(
    new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

/**
 * CHUNK SHAPES BY NAME. `geo` builds the geometry; the rest is how each
 * chunk is turned and swollen when it is written:
 *
 *   tilt    max lean from straight up, radians (0 = never tipped)
 *   spin    true to also roll it about every axis — right for a boulder,
 *           which has no up, wrong for a shard, which is growing out of
 *           something
 *   elong   [lo,hi] stretch along the shape's own axis — what makes a shard
 *           a shard rather than a lump
 *   swell   [lo,hi] overall size multiplier. OVER 1 ON PURPOSE: neighbours
 *           must overlap or the mass is a grid of separate objects
 */
export const CHUNK_SHAPES = {
  box: { geo: boxGeometry, tilt: 0, spin: false, elong: [1, 1], swell: [1, 1] },

  // a rock formation: rounded, overlapping heavily, every stone turned
  // differently so no two neighbours share a silhouette
  boulder: {
    geo: () => boulderGeometry({ bump: 0.32 }),
    tilt: Math.PI, spin: true, elong: [0.8, 1.15], swell: [1.25, 1.7],
  },
  // jagged crystal: shards mostly growing upward and outward, strongly
  // elongated, fused into each other
  crystal: {
    geo: () => shardGeometry({ sides: 6 }),
    tilt: 0.62, spin: false, elong: [1.35, 2.7], swell: [1.05, 1.5],
  },
  // natural ice: shards again, but blunter and fatter — a berg is fractured
  // rather than grown, and snow packs into the gaps
  icefall: {
    geo: () => shardGeometry({ sides: 5, yMid: 0.02, rMid: 0.46 }),
    tilt: 0.85, spin: false, elong: [0.95, 1.7], swell: [1.2, 1.65],
  },
  // jointed columnar basalt (basaltCliff): a colonnade is parallel prisms
  // standing together, so no taper (rBase = rMid), a high waist so the
  // "termination" is a short bevel reading as a weathered column top rather
  // than a spike, near-upright with just enough lean to break the parade,
  // and mild swell — columns SHOULD read as adjacent shafts, so unlike every
  // other shape here the lattice is almost the point
  column: {
    geo: () => shardGeometry({ sides: 6, yMid: 0.42, rBase: 0.5, rMid: 0.5 }),
    tilt: 0.09, spin: false, elong: [1.5, 2.4], swell: [1.06, 1.22],
  },
  // cut ice: a human made these, so they keep a common upright grain rather
  // than a berg's chaos — but they are still SHARDS. The first attempt held
  // them near-vertical and barely elongated, which came out as stacked
  // translucent bricks: the geometry was a shard and the read was a box,
  // because a shard as tall as it is wide is a lump. Long and leaning.
  iceSlab: {
    geo: () => shardGeometry({ sides: 5, yMid: 0.26, rMid: 0.46 }),
    tilt: 0.34, spin: false, elong: [1.7, 3.1], swell: [1.1, 1.45],
  },
  // wind-packed snow: smooth, wide, low, and overlapping enough to lose the
  // cells entirely — a drift, not a stack
  snow: {
    // detail 1, not 2: a chunk is drawn nine times over (the wrap ghosts) and
    // a drift is 600 of them, so 320 triangles each is a million and a half
    // for a snow bank. The smoothness comes from the low bump and the heavy
    // overlap, not from subdivision.
    geo: () => boulderGeometry({ detail: 1, bump: 0.14 }),
    tilt: Math.PI, spin: true, elong: [0.62, 0.92], swell: [1.5, 2.0],
  },
};

/** Per-chunk turn + size for a shape, drawn from the building's own rng. */
export function chunkTransform(shape, rng) {
  if (!shape || shape === CHUNK_SHAPES.box) return null;
  const q = new THREE.Quaternion();
  if (shape.spin) {
    q.setFromEuler(new THREE.Euler(
      rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2)));
  } else if (shape.tilt > 0) {
    // lean by up to `tilt` in a random compass direction, then roll about
    // the shard's own axis so its facets don't all line up
    const az = rng.range(0, Math.PI * 2);
    const lean = shape.tilt * Math.sqrt(rng());     // area-even, so the
    // middle of the cone isn't over-populated
    q.setFromAxisAngle(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), lean);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2)));
  }
  const s = rng.range(shape.swell[0], shape.swell[1]);
  const e = rng.range(shape.elong[0], shape.elong[1]);
  return { q, sx: s, sy: s * e, sz: s };
}
