// CLIP TEAR AUDIT — the stretchaudit question ("does the skin tear?") asked
// with the poses the GAME actually plays instead of a synthetic ±0.9 rad
// sweep. For every clip in animations.js it steps the real Animator over the
// mech's rig and measures how far the far-hierarchy seam edges (endpoints on
// bones 3+ links apart) elongate vs their bind length.
//
//   node tools/cliptear.mjs <mechId> [primary|alt] [minHierDist] [baseUrl]
//
// minHierDist defaults to 3 (only seams between bones 3+ links apart, the ones
// that can never be a legitimate joint). Pass 1 to include EVERY cross-bone
// edge — a welded shell tears at ordinary joints too (a shoulder/torso armpit
// seam is hierarchy distance 1 and still shreds if the weights are rigid).
//
// `alt` audits the manifest's alternate entry for the same mech (for rhino:
// the old Tripo rig + skinOps) so a custom rig can be compared against what
// it replaced under identical motion. Output: worst clips, worst bone pairs.
import { launch } from './lib/browser.mjs';
const [id, which = 'primary', minDistArg = '3', base = 'http://localhost:5173'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${base}/?showcase=${id}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction('window.__showcaseMechs && window.__showcaseMechs.length', null, { timeout: 60000 });
const rep = await page.evaluate(async ([id, which, minDist]) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ROSTER_BY_ID } = await import('/src/mechs/roster.js');
  const { buildGlbForTool } = await import('/src/mechs/gltf.js');
  const { Animator } = await import('/src/mechs/animator.js');
  const { CLIPS } = await import('/src/mechs/animations.js');
  let mech;
  if (which === 'alt') {
    const built = await buildGlbForTool(ROSTER_BY_ID[id], null, { alt: true });
    mech = built.mech;
    window.__showcaseEngine.scene.add(mech.group);
  } else {
    mech = window.__showcaseMechs[0];
  }
  mech.animator = mech.animator || mech.premadeAnimator || new Animator(mech);
  let mesh = null; mech.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const bones = mesh.skeleton.bones, nB = bones.length;
  const names = bones.map((b) => b.name);
  // hierarchy distance
  const idxOf = new Map(bones.map((b, i) => [b, i]));
  const adj = bones.map(() => []);
  bones.forEach((b, i) => { const p = idxOf.get(b.parent); if (p !== undefined) { adj[i].push(p); adj[p].push(i); } });
  const dist = new Uint8Array(nB * nB).fill(255);
  for (let s = 0; s < nB; s++) { const q = [s]; dist[s * nB + s] = 0;
    while (q.length) { const u = q.shift(); for (const v of adj[u]) if (dist[s * nB + v] === 255) { dist[s * nB + v] = dist[s * nB + u] + 1; q.push(v); } } }
  // dominant bone per vertex
  const g = mesh.geometry, idx = g.index, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const dom = new Int32Array(g.attributes.position.count);
  for (let i = 0; i < dom.length; i++) { let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } dom[i] = bi; }
  // far seam edges
  const seam = [], seen = new Set();
  const add = (a, b) => { if (dom[a] === dom[b]) return; if (dist[dom[a] * nB + dom[b]] < minDist) return;
    const k = a < b ? a * 4e6 + b : b * 4e6 + a; if (seen.has(k)) return; seen.add(k); seam.push(a, b); };
  for (let k = 0; k < idx.count; k += 3) { const a = idx.getX(k), b = idx.getX(k+1), c = idx.getX(k+2); add(a,b); add(a,c); add(b,c); }
  const nE = seam.length / 2;
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  const measure = (out) => {
    mech.group.updateMatrixWorld(true); mesh.skeleton.update();
    for (let e = 0; e < nE; e++) { mesh.getVertexPosition(seam[e*2], va); mesh.getVertexPosition(seam[e*2+1], vb); out[e] = va.distanceTo(vb); }
  };
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  for (let i = 0; i < 60; i++) mech.animator.update(1/60, ctx);
  const bind = new Float32Array(nE); measure(bind);
  const cur = new Float32Array(nE);
  const perClip = [], pairMax = new Map(), absPair = new Map();
  for (const [name, clip] of Object.entries(CLIPS)) {
    mech.animator.play(name);
    let worst = 0, over3 = 0, worstE = -1, worstAbs = 0, worstAbsE = -1;
    const steps = Math.ceil((clip.dur || 0.6) / (1/60)) + 4;
    for (let s = 0; s < steps; s++) {
      mech.animator.update(1/60, ctx);
      measure(cur);
      for (let e = 0; e < nE; e++) {
        const r = cur[e] / Math.max(1e-6, bind[e]);
        if (r > worst) { worst = r; worstE = e; }
        const abs = cur[e] - bind[e];
        if (abs > worstAbs) { worstAbs = abs; worstAbsE = e; }
      }
    }
    for (let e = 0; e < nE; e++) if (cur[e] - bind[e] > 0.05) over3++;   // >0.05 mesh units ~ visible gash
    if (worstAbsE >= 0) {
      const pv = g.attributes.position, a = seam[worstAbsE*2];
      const k = [names[dom[seam[worstAbsE*2]]], names[dom[seam[worstAbsE*2+1]]]].sort().join(' ~ ');
      const at = [pv.getX(a), pv.getY(a), pv.getZ(a)].map((v) => +v.toFixed(2));
      const prev = absPair.get(k);
      if (!prev || worstAbs > prev.a) absPair.set(k, { a: worstAbs, at });
    }
    if (worstE >= 0) {
      const k = [names[dom[seam[worstE*2]]], names[dom[seam[worstE*2+1]]]].sort().join(' ~ ');
      const pv = g.attributes.position, a = seam[worstE*2];
      const at = [pv.getX(a), pv.getY(a), pv.getZ(a)].map((v) => +v.toFixed(2));
      const prev = pairMax.get(k);
      if (!prev || worst > prev.r) pairMax.set(k, { r: worst, at });
    }
    perClip.push({ clip: name, maxR: +worst.toFixed(1), maxAbs: +worstAbs.toFixed(3), over3 });
    // let it settle back to rest between clips
    for (let i = 0; i < 40; i++) mech.animator.update(1/60, ctx);
  }
  perClip.sort((a, b) => b.maxAbs - a.maxAbs);
  return { which, bones: nB, seamEdges: nE,
    worstClips: perClip.slice(0, 10),
    cleanClips: perClip.filter((c) => c.maxAbs < 0.02).length,
    gashes: perClip.reduce((a, c) => a + c.over3, 0),
    totalClips: perClip.length,
    pairs: [...pairMax.entries()].sort((a, b) => b[1].r - a[1].r).slice(0, 8)
      .map(([k, v]) => `${k}: ${v.r.toFixed(1)}x at ${JSON.stringify(v.at)}`),
    absPairs: [...absPair.entries()].sort((a, b) => b[1].a - a[1].a).slice(0, 8)
      .map(([k, v]) => `${k}: +${v.a.toFixed(3)} at ${JSON.stringify(v.at)}`) };
}, [id, which, +minDistArg]);
console.log(`${id} (${rep.which}): ${rep.bones} bones, ${rep.seamEdges} far-seam edges, ` +
  `${rep.cleanClips}/${rep.totalClips} clips clean (<0.02 stretch)`);
console.log('worst clips:', rep.worstClips.map((c) => `${c.clip} +${c.maxAbs} (${c.maxR}x, ${c.over3} gashes)`).join(', '));
console.log('worst pairs by ratio:', rep.pairs.join(' | '));
console.log('worst pairs by absolute stretch:', rep.absPairs.join(' | '));
if (errs.length) console.log('PAGE ERRORS', errs.join('\n'));
await browser.close();
