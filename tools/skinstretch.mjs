// Find geometry that STRETCHES when a mech animates: skin diagnostics.
//
//   node tools/skinstretch.mjs <mechId> [clip] [--alt]
//
// Rigid custom-rig skinning binds every vertex to ONE bone, so a triangle
// whose corners sit on two bones is torn apart by exactly the distance those
// bones move relative to each other. A little of that is normal (it is what a
// knee or an elbow is); a LOT of it means an island is bound to a bone it does
// not belong to, and that is what reads in-game as a piece of the model
// smearing across the arena.
//
// This poses the mech through a real game clip (the same animator the game
// runs), measures every triangle edge against its bind length, and reports the
// worst offenders grouped by BONE-ISLAND — the same numbering the skin
// workbench shows (`?edit=skin`), so a finding is directly actionable:
// {"sel":{"comp":<id>},"to":"<bone>"}.
import { chromium } from 'playwright-core';

const [id = 'jerry', clip = 'walk', ...rest] = process.argv.slice(2);
const alt = rest.includes('--alt');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
const url = `http://localhost:5173/workbench/?edit=animation&mech=${id}&mode=action${alt ? '&variant=alt' : ''}`;
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(20000);

const report = await page.evaluate(async ({ clip, id }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { analyzeSkin } = await import('/src/mechs/skinops.js');
  const { computeWeights } = await import('/src/mechs/reskin.js');
  const { rigFor } = await import('/src/mechs/rigs/index.js');
  const d = window.__poseDebug;
  if (!d) return { error: 'no __poseDebug — is this the animation workbench?' };
  const mech = d.glb, f = d.glbF;
  let mesh = null;
  mech.group.traverse((o) => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  if (!mesh) return { error: 'no SkinnedMesh' };

  const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
  const n = pos.count;
  const bones = mesh.skeleton.bones;
  // The LIVE analysis (what the model is skinned as right now, manifest
  // skinOps and all) — its bone names say what actually drives a vertex.
  const analysis = analyzeSkin(mesh);
  // ...and the PRISTINE one: the islands of the bare custom-rig proximity
  // skinning, which is the numbering `?edit=skin` shows and every manifest
  // {"sel":{"comp":N}} selects against (ops are resolved against the
  // pre-op analysis, see workbench/tools/skin.js). Report in THAT numbering
  // or a finding can't be acted on.
  let pristine = analysis;
  const rig = rigFor(id);
  if (rig) {
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const si0 = si.array.slice(), sw0 = sw.array.slice();
    const w = computeWeights(mesh, rig);
    si.array.set(w.skinIndex); sw.array.set(w.skinWeight);
    pristine = analyzeSkin(mesh);
    si.array.set(si0); sw.array.set(sw0);
    si.needsUpdate = sw.needsUpdate = true;
  }

  // ---- bind-pose edge lengths (unique edges off the triangle list) ----
  const tris = [];
  if (idx) for (let t = 0; t < idx.count; t += 3) tris.push([idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]);
  else for (let t = 0; t < n; t += 3) tris.push([t, t + 1, t + 2]);
  const edges = new Map();               // "a,b" -> [a, b]
  for (const [a, b, c] of tris) {
    for (const [u, v] of [[a, b], [b, c], [a, c]]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      if (!edges.has(k)) edges.set(k, [u, v]);
    }
  }
  const E = [...edges.values()];
  const bindLen = new Float32Array(E.length);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  for (let i = 0; i < E.length; i++) {
    _a.fromBufferAttribute(pos, E[i][0]); _b.fromBufferAttribute(pos, E[i][1]);
    bindLen[i] = _a.distanceTo(_b);
  }

  // ---- pose through the clip, measure ----
  const worst = new Float32Array(n);     // per-vertex worst |stretch ratio - 1|
  const skinned = new Float32Array(n * 3);
  const _v = new THREE.Vector3();
  const ctx = { speed: clip === 'walk' ? 8 : 0, maxSpeed: 10, grounded: true, vy: 0 };
  const FRAMES = 40;
  if (clip !== 'walk' && clip !== 'idle') f.animator.play(clip);
  for (let fr = 0; fr < FRAMES; fr++) {
    f.animator.update(1 / 30, ctx);
    mech.postAnimate?.();
    mech.group.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(pos, i);
      mesh.applyBoneTransform(i, _v);
      skinned[i * 3] = _v.x; skinned[i * 3 + 1] = _v.y; skinned[i * 3 + 2] = _v.z;
    }
    for (let e = 0; e < E.length; e++) {
      const [u, v] = E[e];
      const dx = skinned[u * 3] - skinned[v * 3];
      const dy = skinned[u * 3 + 1] - skinned[v * 3 + 1];
      const dz = skinned[u * 3 + 2] - skinned[v * 3 + 2];
      const L = Math.hypot(dx, dy, dz), L0 = bindLen[e];
      if (L0 < 1e-6) continue;
      const s = Math.abs(L / L0 - 1);
      if (s > worst[u]) worst[u] = s;
      if (s > worst[v]) worst[v] = s;
    }
  }

  // ---- roll up per island ----
  // Rest position of every bone in the rig's own (mesh-local) space — the same
  // space the geometry and the island centroids live in, so `dist` reads as
  // "how far this piece of geometry sits from the bone dragging it around".
  const bonePos = {};
  for (const bd of (rig?.bones || [])) bonePos[bd.name] = new THREE.Vector3(...bd.pos);
  const _c = new THREE.Vector3();
  const rows = pristine.comps.map((c) => {
    let mx = 0, sum = 0, bad = 0;
    const drivers = new Map();
    for (const v of c.verts) {
      mx = Math.max(mx, worst[v]); sum += worst[v]; if (worst[v] > 0.5) bad++;
      const bn = bones[analysis.domBone[v]]?.name || '?';
      drivers.set(bn, (drivers.get(bn) || 0) + 1);
    }
    const boundTo = [...drivers.entries()].sort((a, b) => b[1] - a[1])
      .map(([bn, k]) => `${bn}:${k}`).slice(0, 3).join(' ');
    const drv = [...drivers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    _c.set(c.centroid[0], c.centroid[1], c.centroid[2]);
    const dist = bonePos[drv] ? +_c.distanceTo(bonePos[drv]).toFixed(3) : -1;
    return { comp: c.id, restBone: c.boneName, boundTo, dist, verts: c.count, max: +mx.toFixed(2),
      avg: +(sum / c.count).toFixed(2), badFrac: +(bad / c.count).toFixed(2),
      centroid: c.centroid.map((x) => +x.toFixed(2)) };
  });
  rows.sort((a, b) => b.max * b.badFrac - a.max * a.badFrac);

  // ---- which bone PAIRS the stretched edges bridge (the actual tear line) ----
  const pairs = new Map();
  for (let e = 0; e < E.length; e++) {
    const [u, v] = E[e];
    const bu = analysis.domBone[u], bv = analysis.domBone[v];
    if (bu === bv) continue;
    if (Math.max(worst[u], worst[v]) < 0.5) continue;
    const k = bu < bv ? `${bones[bu]?.name} | ${bones[bv]?.name}` : `${bones[bv]?.name} | ${bones[bu]?.name}`;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  return {
    mech: id, clip, verts: n, islands: pristine.comps.length,
    top: rows.slice(0, 16),
    tears: [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}, { clip, id });

console.log(JSON.stringify(report, null, 1));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
