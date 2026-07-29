// SKIN STRETCH ANALYSIS — the measurement behind ?edit=skindebug.
//
// Pure geometry. No game imports, no THREE import of its own (the renderer is
// handed in, like everywhere else under workbench/tools/), no DOM. Give it a
// skinned mesh and a way to pose it and it answers one question:
//
//   WHERE DOES THIS SKIN DEFORM IN A WAY THE GEOMETRY CANNOT SURVIVE?
//
// WHAT IS MEASURED. Linear blend skinning moves a vertex as a weighted sum of
// its bones. Two vertices joined by a triangle edge therefore keep their
// distance EXACTLY when they share the same weights — an edge can only change
// length if its two ends are driven differently. That is the whole basis here:
//
//   · every triangle edge whose ends have different weight signatures is a
//     candidate ("at-risk edge"); everything else is rigid by construction and
//     is dropped before a single pose is sampled. On a mech that is typically
//     90% of the mesh gone, which is what makes scanning forty clips cheap.
//   · WELD PAIRS are candidates too: duplicated vertices at one position (a UV
//     or normal seam) carry no edge between them, so nothing in the mesh holds
//     them together. Weight them differently and the model splits open along
//     the seam — a crack, not a stretch, and the ugliest of the three.
//
// THREE FAILURE KINDS, one severity scale so a list can be ranked:
//   stretch  edge longer than it should be      sev = L/L0 - 1
//   pinch    edge collapsed (the candy-wrapper) sev = L0/L - 1
//   tear     weld pair pulled apart             sev = gap / (2% of height)
// A 2x stretch and a 2x collapse both score 1.0, which is the point: they are
// equally wrong and equally visible.
//
// EVERYTHING IS IN MESH-LOCAL UNITS. The bind positions in the geometry
// attribute and the skinned positions computed here live in the same space, so
// lengths compare directly; thresholds are expressed as a fraction of the
// model's own bind height so one number fits jerry and colossus alike.
//
// THE REFERENCE IS THE BIND POSE, deliberately. Measuring against the mech's
// rest stance would hide skin that is already broken standing still — so the
// rest stance is scanned as its own clip instead, and every spot carries an
// `atRest` flag telling you whether the animation caused it or merely showed it.

/**
 * Where the deliberate splits are, whichever way the model records them.
 *   live  geometry.userData.seamCut.seamId / .seamSide  (typed, this session)
 *   baked geometry.userData.rwSeam  (or .seamCut.seams) — plain arrays that
 *         survive being written into a .glb
 * Returns null for a model that was never cut.
 */
function seamLookup(geo, n) {
  const cut = geo.userData?.seamCut;
  if (cut?.seamId && cut?.seamSide) return { id: cut.seamId, side: cut.seamSide };
  const seams = geo.userData?.rwSeam || cut?.seams;
  if (!seams?.length) return null;
  const id = new Int32Array(n), side = new Uint8Array(n);
  for (const s of seams) {
    for (const v of s.a || []) if (v < n) { id[v] = s.id; side[v] = 1; }
    for (const v of s.b || []) if (v < n) { id[v] = s.id; side[v] = 2; }
  }
  return { id, side };
}

/** Weight signature: bones+weights as one string, order-independent. */
function signatures(geo, n) {
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const sig = new Int32Array(n);
  const seen = new Map();
  const pairs = [];
  for (let i = 0; i < n; i++) {
    pairs.length = 0;
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > 1e-4) { pairs.push([si.getComponent(i, k), w]); sum += w; }
    }
    if (!sum) sum = 1;
    pairs.sort((a, b) => a[0] - b[0]);
    let key = '';
    for (const [b, w] of pairs) key += b + ':' + Math.round((w / sum) * 512) + ';';
    let id = seen.get(key);
    if (id === undefined) { id = seen.size; seen.set(key, id); }
    sig[i] = id;
  }
  return sig;
}

/**
 * Everything about ONE skinned mesh that never changes as it animates: which
 * edges could possibly deform, their rest lengths, and the compact skin arrays
 * the per-pose maths reads.
 *
 * @param {*} mesh  a THREE.SkinnedMesh
 * @returns prepared-mesh record, or null when the mesh cannot deform at all
 */
export function prepareMesh(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  if (!geo.attributes.skinIndex || !geo.attributes.skinWeight) return null;
  const n = pos.count;
  const sig = signatures(geo, n);

  // model height in mesh-local units — every threshold is a fraction of it
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const height = Math.max(1e-6, maxY - minY);

  // ---- candidate edges ----
  const ea = [], eb = [], kind = [];
  const seen = new Set();
  const addEdge = (a, b, k) => {
    if (a === b || sig[a] === sig[b]) return;   // rigid: cannot change length
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo * 4294967296 + hi;           // n < 2^32, exact in a double
    if (seen.has(key)) return;
    seen.add(key);
    ea.push(lo); eb.push(hi); kind.push(k);
  };
  const idx = geo.index;
  if (idx) {
    for (let t = 0; t + 2 < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      addEdge(a, b, 0); addEdge(b, c, 0); addEdge(a, c, 0);
    }
  } else {
    for (let t = 0; t + 2 < n; t += 3) { addEdge(t, t + 1, 0); addEdge(t + 1, t + 2, 0); addEdge(t, t + 2, 0); }
  }
  // weld pairs — same position, no edge between them, nothing holding them
  // together but matching weights
  //
  // …EXCEPT the pairs a seam cut SPLIT ON PURPOSE. src/mechs/seamcut.js
  // separates two parts the mesher wrongly welded — it duplicates the vertices
  // along the seam, binds each copy to its own side and caps both rims. Those
  // pairs are MEANT to come apart, and the lid is what stops it being a hole.
  // The geometry says which cut each vertex is on and which side of it
  // (`userData.seamCut.seamId/seamSide`) — an optional convention, absent on a
  // model that was never cut — and ONLY a pair on opposite sides of the SAME
  // cut is excused, so an unrelated crack at the same seam still reports.
  // Counted, never silently dropped: `splitPairs` reaches the status line.
  // Two spellings of the same record: the live one a runtime cut leaves behind,
  // and the compact one a BAKED model carries in its mesh extras. Normalized
  // here so the audit reads a baked mech exactly like a cut-at-load one.
  const seam = seamLookup(mesh.geometry, n);
  const sameSeamSplit = (a, b) => !!seam && seam.id[a] !== 0
    && seam.id[a] === seam.id[b] && seam.side[a] !== seam.side[b];
  const weldMates = new Map();     // vert -> the other verts sharing its position
  let splitPairs = 0;
  {
    const first = new Map();
    const q = 1e4;
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(pos.getX(i) * q)},${Math.round(pos.getY(i) * q)},${Math.round(pos.getZ(i) * q)}`;
      const f = first.get(key);
      if (f === undefined) { first.set(key, i); continue; }
      if (sameSeamSplit(f, i)) { splitPairs++; continue; }
      addEdge(f, i, 1);
      for (const [a, b] of [[f, i], [i, f]]) {
        let l = weldMates.get(a);
        if (!l) { l = []; weldMates.set(a, l); }
        l.push(b);
      }
    }
  }
  if (!ea.length) return null;

  // ---- compact the vertices those edges touch ----
  const slotOf = new Int32Array(n).fill(-1);
  const verts = [];
  for (let e = 0; e < ea.length; e++) {
    for (const v of [ea[e], eb[e]]) if (slotOf[v] < 0) { slotOf[v] = verts.length; verts.push(v); }
  }
  const V = verts.length;
  const bind = new Float32Array(V * 3);
  const si4 = new Uint16Array(V * 4);
  const sw4 = new Float32Array(V * 4);
  const domSlot = new Uint16Array(V);   // heaviest bone, for naming a finding
  const siA = geo.attributes.skinIndex, swA = geo.attributes.skinWeight;
  for (let s = 0; s < V; s++) {
    const i = verts[s];
    bind[s * 3] = pos.getX(i); bind[s * 3 + 1] = pos.getY(i); bind[s * 3 + 2] = pos.getZ(i);
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += swA.getComponent(i, k);
    if (!sum) sum = 1;
    let best = -1, bestW = -1;
    for (let k = 0; k < 4; k++) {
      const w = swA.getComponent(i, k) / sum;
      si4[s * 4 + k] = siA.getComponent(i, k);
      sw4[s * 4 + k] = w;
      if (w > bestW) { bestW = w; best = si4[s * 4 + k]; }
    }
    domSlot[s] = Math.max(0, best);
  }
  const E = ea.length;
  const edgeA = new Uint32Array(E), edgeB = new Uint32Array(E);
  const restLen = new Float32Array(E), edgeKind = new Uint8Array(kind);
  for (let e = 0; e < E; e++) {
    const sa = slotOf[ea[e]], sb = slotOf[eb[e]];
    edgeA[e] = sa; edgeB[e] = sb;
    const dx = bind[sa * 3] - bind[sb * 3];
    const dy = bind[sa * 3 + 1] - bind[sb * 3 + 1];
    const dz = bind[sa * 3 + 2] - bind[sb * 3 + 2];
    restLen[e] = Math.hypot(dx, dy, dz);
  }
  // ---- who is NEXT TO whom ----
  // Neighbours (one mesh edge, or a weld mate) of every at-risk vertex,
  // including neighbours that are not themselves at risk. Two failing runs
  // separated by a single rigid vertex are ONE defect, and this is how the
  // workbench knows that without resorting to a distance guess.
  const adj = Array.from({ length: V }, () => []);
  const link = (a, b) => { const s = slotOf[a]; if (s >= 0 && !adj[s].includes(b)) adj[s].push(b); };
  if (idx) {
    for (let t = 0; t + 2 < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      link(a, b); link(b, a); link(b, c); link(c, b); link(a, c); link(c, a);
    }
  } else {
    for (let t = 0; t + 2 < n; t += 3) {
      link(t, t + 1); link(t + 1, t); link(t + 1, t + 2); link(t + 2, t + 1); link(t, t + 2); link(t + 2, t);
    }
  }
  for (const [v, mates] of weldMates) for (const m of mates) link(v, m);

  return {
    mesh, n, height, verts, slotOf, bind, si4, sw4, domSlot, adj, splitPairs,
    edgeA, edgeB, restLen, edgeKind, V, E,
    // scratch, reused across every sample
    _pose: new Float32Array(V * 3),
    _mats: null,
  };
}

/**
 * Fold the skeleton's CURRENT world matrices into one matrix per bone, in the
 * space the geometry attribute lives in:  bindInv · boneWorld · boneInverse · bind.
 * Call once per pose, then skin as many vertices as you like against it.
 */
export function poseMatrices(THREE, mesh, cache) {
  const sk = mesh.skeleton;
  const B = sk.bones.length;
  if (!cache || cache.length !== B * 16) cache = new Float32Array(B * 16);
  const m = poseMatrices._m || (poseMatrices._m = new THREE.Matrix4());
  const bindInv = mesh.bindMatrixInverse, bind = mesh.bindMatrix;
  for (let b = 0; b < B; b++) {
    m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]);
    m.premultiply(bindInv);
    m.multiply(bind);
    for (let k = 0; k < 16; k++) cache[b * 16 + k] = m.elements[k];
  }
  return cache;
}

/** Skin every at-risk vertex of `prep` with `mats` into prep._pose. */
export function skinVertices(prep, mats) {
  const { V, bind, si4, sw4, _pose: out } = prep;
  for (let s = 0; s < V; s++) {
    const x = bind[s * 3], y = bind[s * 3 + 1], z = bind[s * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw4[s * 4 + k];
      if (w === 0) continue;
      const o = si4[s * 4 + k] * 16;
      ox += w * (mats[o] * x + mats[o + 4] * y + mats[o + 8] * z + mats[o + 12]);
      oy += w * (mats[o + 1] * x + mats[o + 5] * y + mats[o + 9] * z + mats[o + 13]);
      oz += w * (mats[o + 2] * x + mats[o + 6] * y + mats[o + 10] * z + mats[o + 14]);
    }
    out[s * 3] = ox; out[s * 3 + 1] = oy; out[s * 3 + 2] = oz;
  }
  return out;
}

/** Posed length of every candidate edge, into `out` (Float32Array(E)). */
export function edgeLengths(prep, out) {
  const { E, edgeA, edgeB, _pose: p } = prep;
  const o = out && out.length === E ? out : new Float32Array(E);
  for (let e = 0; e < E; e++) {
    const a = edgeA[e] * 3, b = edgeB[e] * 3;
    o[e] = Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]);
  }
  return o;
}

/** Default limits. Ratios are multiples of rest length; the rest are fractions
 *  of the model's bind height. */
export const DEFAULTS = {
  stretch: 1.35,   // an edge 35% longer than it was built
  pinch: 0.60,     // ...or collapsed to 60% of it
  tear: 0.006,     // a weld seam gaping 0.6% of body height
  minAbs: 0.004,   // ignore sub-visible changes however large the ratio
};

/**
 * Score one edge at one pose. Returns null when it is within limits.
 * `sev` is the common ranking scale described at the top of this file.
 */
export function scoreEdge(prep, e, len, lim) {
  const rest = prep.restLen[e];
  const h = prep.height;
  if (prep.edgeKind[e] === 1) {
    // weld pair: rest length is zero by definition, so the GAP is the measure
    if (len < lim.tear * h) return null;
    return { type: 'tear', ratio: 0, sev: len / (0.02 * h) };
  }
  if (rest < 1e-9) return null;
  const ratio = len / rest;
  if (ratio >= lim.stretch && (len - rest) >= lim.minAbs * h) {
    return { type: 'stretch', ratio, sev: ratio - 1 };
  }
  if (ratio <= lim.pinch && (rest - len) >= lim.minAbs * h) {
    return { type: 'pinch', ratio, sev: 1 / Math.max(1e-6, ratio) - 1 };
  }
  return null;
}

/**
 * Accumulate the WORST pose each candidate edge ever reaches over a run of
 * samples. One record per clip; `note(t)` is called with the sample time.
 *
 * peak[e] holds the severity, peakT[e] the time it happened, peakLen[e] the
 * length — enough to rebuild the finding without keeping every frame.
 */
export function newPeaks(prep) {
  return {
    sev: new Float32Array(prep.E),
    t: new Float32Array(prep.E),
    len: new Float32Array(prep.E),
    type: new Uint8Array(prep.E),      // 0 none · 1 stretch · 2 pinch · 3 tear
    hits: new Uint16Array(prep.E),     // how many samples were over the line
  };
}
const TYPE_ID = { stretch: 1, pinch: 2, tear: 3 };
export const TYPE_NAME = ['', 'stretch', 'pinch', 'tear'];

export function accumulate(prep, peaks, lens, t, lim) {
  let flagged = 0;
  for (let e = 0; e < prep.E; e++) {
    const s = scoreEdge(prep, e, lens[e], lim);
    if (!s) continue;
    flagged++;
    peaks.hits[e]++;
    if (s.sev > peaks.sev[e]) {
      peaks.sev[e] = s.sev; peaks.t[e] = t; peaks.len[e] = lens[e]; peaks.type[e] = TYPE_ID[s.type];
    }
  }
  return flagged;
}

/**
 * Turn a clip's peak table into SPOTS: connected runs of failing edges, which
 * is what a person means by "this bit of the model is wrong". Two failing
 * edges belong to the same spot when they share a vertex (following weld pairs
 * too, so a crack and the stretch feeding it are one finding rather than two).
 *
 * Returns [{ sev, type, t, ratio, edges[], verts[], vertIds[], peakEdge }],
 * worst first.
 */
export function clusterSpots(prep, peaks) {
  const parent = new Map();
  const find = (a) => { let r = a; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(a) !== r) { const p = parent.get(a); parent.set(a, r); a = p; } return r; };
  const add = (v) => { if (!parent.has(v)) parent.set(v, v); };
  const flagged = [];
  for (let e = 0; e < prep.E; e++) {
    if (!peaks.type[e]) continue;
    flagged.push(e);
    const a = prep.edgeA[e], b = prep.edgeB[e];
    add(a); add(b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }
  if (!flagged.length) return [];
  const byRoot = new Map();
  for (const e of flagged) {
    const r = find(prep.edgeA[e]);
    let spot = byRoot.get(r);
    if (!spot) { spot = { edges: [], verts: new Set(), sev: 0, peakEdge: -1 }; byRoot.set(r, spot); }
    spot.edges.push(e);
    spot.verts.add(prep.edgeA[e]); spot.verts.add(prep.edgeB[e]);
    if (peaks.sev[e] > spot.sev) { spot.sev = peaks.sev[e]; spot.peakEdge = e; }
  }
  const out = [];
  for (const spot of byRoot.values()) {
    const e = spot.peakEdge;
    const slots = [...spot.verts];
    const cx = [0, 0, 0];
    for (const s of slots) { cx[0] += prep.bind[s * 3]; cx[1] += prep.bind[s * 3 + 1]; cx[2] += prep.bind[s * 3 + 2]; }
    out.push({
      sev: spot.sev,
      type: TYPE_NAME[peaks.type[e]],
      t: peaks.t[e],
      len: peaks.len[e],
      rest: prep.restLen[e],
      ratio: prep.restLen[e] > 1e-9 ? peaks.len[e] / prep.restLen[e] : 0,
      hits: peaks.hits[e],
      edges: spot.edges,
      slots,                                              // compacted indices
      verts: slots.map((s) => prep.verts[s]),             // real geometry indices
      peakVert: prep.verts[prep.edgeA[e]],
      centroid: cx.map((v) => v / slots.length),
    });
  }
  out.sort((a, b) => b.sev - a.sev);
  return out;
}
