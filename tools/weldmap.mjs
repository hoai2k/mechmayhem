// WELD MAP — WHERE is this model wrongly welded, and what does it do when it moves?
//
//   node tools/weldmap.mjs <mech> --list            every welded bone pair, ranked
//   node tools/weldmap.mjs <mech> [--pairs a~b,…] [--out <dir>] [--minDist 2]
//
// The skin audit (`?edit=skindebug`) tells you a spot deforms badly. It cannot
// tell you WHY, and the two causes want opposite fixes: wrong weights are a
// reskin, wrongly WELDED GEOMETRY is a cut (seamCuts — src/mechs/seamcut.js),
// because no weighting can help a triangle whose three corners genuinely belong
// to different limbs.
//
// So this reports the welds directly: every pair of bones that share a triangle
// despite being far apart in the skeleton (`--minDist`, default 2 links — a real
// armour joint is 1, an elbow welded to a thigh is 4), with the triangle count,
// where it sits, and how far those triangles are dragged when the model
// animates. `--list` prints the table; without it, each pair is rendered as a
// two-panel PNG: the weld highlighted at BIND pose, and the same triangles at
// the frame that abuses them most.
//
// Runs on the skindebug workbench page, which already builds the mech through
// the game's own path (so it sees skinOps and any seamCuts already applied) and
// exposes a camera to point. Needs the dev server on :5173.
import { launch } from './lib/browser.mjs';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const has = (n) => args.includes('--' + n);
const mech = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!mech) { console.error('usage: node tools/weldmap.mjs <mech> [--list] [--pairs a~b,…]'); process.exit(1); }
const base = flag('base', 'http://localhost:5173');
const outDir = flag('out', 'docs/welds');
const minDist = +flag('minDist', 2);
const wantPairs = flag('pairs') ? flag('pairs').split(',') : null;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 700, height: 640 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e).slice(0, 200)));
await page.goto(`${base}/workbench/?edit=skindebug&mech=${mech}&scan=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__skinDebug && !!window.__skinDebug.mech, null, { timeout: 300000 });
await page.evaluate(() => {
  window.__skinDebug.setHighlight(false);
  document.querySelector('.dev-panel').style.display = 'none';
});

// ---- find the welds ----
const pairs = await page.evaluate(async (minDist) => {
  const { rigFor } = await import('/src/mechs/rigs/index.js');
  const d = window.__skinDebug;
  let mesh = null;
  d.mech.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const g = mesh.geometry, idx = g.index, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const pos = g.attributes.position, n = pos.count;
  const bones = mesh.skeleton.bones.map((b) => b.name);
  const dom = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > bw) { bw = x; bi = si.getComponent(i, k); } }
    dom[i] = bi;
  }
  // Hierarchy distance — over the SKELETON THAT IS LOADED, not over a rig file.
  // A baked mech (tools/bake-glb.mjs) has no rig file left; its bones carry the
  // same names and the same parent links inside the .glb, and those are what
  // the distance actually means. The rig file is only consulted as a fallback
  // for a model whose skeleton somehow has no parenting.
  const skel = mesh.skeleton.bones;
  const nB = skel.length;
  const at = new Map(skel.map((b, i) => [b, i]));
  const adj = skel.map(() => []);
  let links = 0;
  skel.forEach((b, i) => {
    const p = at.get(b.parent);
    if (p !== undefined) { adj[i].push(p); adj[p].push(i); links++; }
  });
  let hd = () => 9;
  if (links) {
    const dist = new Uint8Array(nB * nB).fill(255);
    for (let s = 0; s < nB; s++) {
      const q = [s]; dist[s * nB + s] = 0;
      while (q.length) { const u = q.shift(); for (const v of adj[u]) if (dist[s * nB + v] === 255) { dist[s * nB + v] = dist[s * nB + u] + 1; q.push(v); } }
    }
    hd = (a, b) => (dist[a * nB + b] === 255 ? 9 : dist[a * nB + b]);
  } else {
    const rig = rigFor(d.mech.def?.id || '');
    if (rig) {
      const order = rig.bones.map((b) => b.name), rat = new Map(order.map((x, i) => [x, i])), rN = order.length;
      const radj = rig.bones.map(() => []);
      rig.bones.forEach((b, i) => { const p = rat.get(b.parent); if (p !== undefined) { radj[i].push(p); radj[p].push(i); } });
      const dist = new Uint8Array(rN * rN).fill(255);
      for (let s = 0; s < rN; s++) {
        const q = [s]; dist[s * rN + s] = 0;
        while (q.length) { const u = q.shift(); for (const v of radj[u]) if (dist[s * rN + v] === 255) { dist[s * rN + v] = dist[s * rN + u] + 1; q.push(v); } }
      }
      hd = (a, b) => { const i = rat.get(bones[a]), j = rat.get(bones[b]); return (i === undefined || j === undefined) ? 9 : dist[i * rN + j]; };
    }
  }
  // a seam cut already separated some of these; those are no longer welded
  const cut = g.userData.seamCut || null;
  const split = (a, b) => !!cut && cut.seamId[a] !== 0 && cut.seamId[a] === cut.seamId[b] && cut.seamSide[a] !== cut.seamSide[b];

  const map = new Map();
  for (let t = 0; t < idx.count; t += 3) {
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    for (const [x, y] of [[0, 1], [1, 2], [0, 2]]) {
      const a = dom[v[x]], b = dom[v[y]];
      if (a === b) continue;
      const dd = hd(a, b);
      if (dd < minDist) continue;
      if (split(v[x], v[y])) continue;
      const key = [bones[a], bones[b]].sort().join('~');
      let e = map.get(key);
      if (!e) { e = { key, dist: dd, tris: new Set(), verts: new Set() }; map.set(key, e); }
      e.tris.add(t / 3);
      for (const q of v) e.verts.add(q);
    }
  }
  return [...map.values()].map((e) => {
    const vs = [...e.verts];
    const c = [0, 0, 0];
    for (const q of vs) { c[0] += pos.getX(q); c[1] += pos.getY(q); c[2] += pos.getZ(q); }
    return { key: e.key, dist: e.dist, tris: [...e.tris], triCount: e.tris.size, verts: vs.length,
      centroid: c.map((x) => +(x / vs.length).toFixed(3)) };
  }).sort((a, b) => b.triCount - a.triCount);
}, minDist);

console.log(`\n=== ${mech}: welded bone pairs at hierarchy distance >= ${minDist} ===`);
for (const p of pairs) {
  console.log(`${p.key.padEnd(26)} d${p.dist}  ${String(p.triCount).padStart(4)} tri  ${String(p.verts).padStart(4)} vert  at ${JSON.stringify(p.centroid)}`);
}
if (!pairs.length) console.log('(none — nothing is welded across that distance)');
if (has('list')) { await browser.close(); process.exit(0); }

// ---- render each pair: the weld at bind, and at the frame that abuses it ----
mkdirSync(outDir, { recursive: true });
const chosen = pairs.filter((p) => !wantPairs || wantPairs.includes(p.key)).slice(0, +flag('max', 6));
const CLIPS = (flag('clips') || 'intro,light1,light3,heavy,dead,walk,taunt,victory,launched,ball').split(',');

for (const pair of chosen) {
  // which frame drags this weld furthest?
  const worst = await page.evaluate(async ([tris, clips]) => {
    const d = window.__skinDebug;
    let mesh = null;
    d.mech.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    const g = mesh.geometry, idx = g.index, pos = g.attributes.position;
    const V = d.camera.position.constructor;
    const a = new V(), b = new V();
    const edges = [];
    for (const t of tris) {
      const v = [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)];
      for (const [x, y] of [[0, 1], [1, 2], [0, 2]]) edges.push([v[x], v[y]]);
    }
    const restLen = edges.map(([u, v]) => {
      a.set(pos.getX(u), pos.getY(u), pos.getZ(u));
      b.set(pos.getX(v), pos.getY(v), pos.getZ(v));
      return a.distanceTo(b) || 1e-6;
    });
    const measure = () => {
      mesh.skeleton.update();
      let worstR = 1;
      for (let i = 0; i < edges.length; i++) {
        mesh.getVertexPosition(edges[i][0], a);
        mesh.getVertexPosition(edges[i][1], b);
        const r = a.distanceTo(b) / restLen[i];
        if (r > worstR) worstR = r;
      }
      return worstR;
    };
    let best = { clip: null, t: 0, ratio: 1 };
    for (const c of clips) {
      for (let s = 0; s <= 12; s++) {
        // 1.6s covers every clip in the list; the animator clamps past the end,
        // so an over-long sample just repeats that clip's final pose
        const t = (s / 12) * 1.6;
        try { d.poseAt(c, t); } catch (e) { continue; }
        d.mech.group.updateWorldMatrix(true, true);
        const r = measure();
        if (r > best.ratio) best = { clip: c, t, ratio: r };
      }
    }
    return best;
  }, [pair.tris, CLIPS]);

  // draw the welded triangles on top of the model, then shoot bind + worst
  await page.evaluate(async ([tris]) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const d = window.__skinDebug;
    let mesh = null;
    d.mech.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    window.__weld?.parent?.remove(window.__weld);
    const sub = mesh.geometry.clone();
    const ii = [];
    for (const t of tris) ii.push(mesh.geometry.index.getX(t * 3), mesh.geometry.index.getX(t * 3 + 1), mesh.geometry.index.getX(t * 3 + 2));
    sub.setIndex(ii);
    const m = new THREE.SkinnedMesh(sub, new THREE.MeshBasicMaterial({
      color: 0xff1744, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95,
    }));
    m.bind(mesh.skeleton, mesh.bindMatrix);
    m.frustumCulled = false;
    m.renderOrder = 999;
    mesh.parent.add(m);
    window.__weld = m;
  }, [pair.tris]);

  const shots = [];
  for (const [clip, t, label] of [[null, 0, 'bind'], [worst.clip, worst.t, 'worst']]) {
    if (label === 'worst' && !worst.clip) continue;
    await page.evaluate(([c, tt]) => window.__skinDebug.poseAt(c, tt), [clip, t]);
    await page.waitForTimeout(350);
    // frame the weld itself
    await page.evaluate(async ([tris]) => {
      const d = window.__skinDebug;
      let mesh = null;
      d.mech.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
      d.mech.group.updateWorldMatrix(true, true);
      mesh.skeleton.update();
      const V = d.camera.position.constructor;
      const p = new V(), c = new V();
      let n = 0;
      const seen = new Set();
      for (const t of tris) for (let k = 0; k < 3; k++) {
        const vi = mesh.geometry.index.getX(t * 3 + k);
        if (seen.has(vi)) continue;
        seen.add(vi);
        mesh.getVertexPosition(vi, p);
        mesh.localToWorld(p);
        c.add(p); n++;
      }
      c.multiplyScalar(1 / Math.max(1, n));
      let r = 0;
      for (const vi of seen) { mesh.getVertexPosition(vi, p); mesh.localToWorld(p); r = Math.max(r, p.distanceTo(c)); }
      const hip = new V(), head = new V();
      d.mech.joints.hips.getWorldPosition(hip);
      (d.mech.joints.head || d.mech.joints.torso).getWorldPosition(head);
      const body = Math.max(1, head.distanceTo(hip));
      const dist = Math.max(body * 0.75, r * 2.6);
      d.orbit.target.copy(c);
      d.camera.position.set(c.x + dist * 0.75, c.y + dist * 0.35, c.z + dist * 0.75);
      d.orbit.update();
    }, [pair.tris]);
    await page.waitForTimeout(350);
    const buf = await page.screenshot();
    shots.push({ buf, label, clip, t });
  }
  // two panels side by side, captioned
  const W = 700, H = 640;
  const caption = (txt) => Buffer.from(
    `<svg width="${W}" height="34"><rect width="100%" height="100%" fill="#0d1219"/>` +
    `<text x="10" y="23" font-family="monospace" font-size="15" fill="#dfe8f5">${txt}</text></svg>`);
  const panels = [];
  for (const s of shots) {
    const label = s.label === 'bind'
      ? `${pair.key}  ·  ${pair.triCount} welded tri  ·  BIND POSE`
      : `${pair.key}  ·  ${s.clip} t=${s.t.toFixed(2)}  ·  stretched ${worst.ratio.toFixed(1)}x`;
    panels.push(await sharp(s.buf).composite([{ input: caption(label), top: 0, left: 0 }]).png().toBuffer());
  }
  const file = `${outDir}/${mech}-weld-${pair.key.replace('~', '-')}.png`;
  await sharp({ create: { width: W * panels.length, height: H, channels: 3, background: '#0d1219' } })
    .composite(panels.map((b, i) => ({ input: b, left: i * W, top: 0 })))
    .png().toFile(file);
  console.log(`wrote ${file}  (${pair.triCount} tri, worst ${worst.clip} ${worst.ratio.toFixed(1)}x)`);
}
await browser.close();
