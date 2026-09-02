// skinmove: which VISIBLE geometry actually moves during an attack.
// Groups skinned vertices by dominant bone (post-skinOps) and reports each
// bone's mesh-centroid displacement rest->strike. Unlike animprobe (bone
// pivots), this measures where the pixels go — catches skinOps/mesh-vs-skeleton
// mismatches ("the claw mesh sits on a bone nobody animates").
//   node tools/skinmove.mjs <mechId> <clip> <t> [outPrefix]
import { launch } from './lib/browser.mjs';

const [mechId, clip, tStr = '0.23', prefix = `/tmp/skinmove_${mechId}`] = process.argv.slice(2);
const t = Number(tStr);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:5173/?showcase=${mechId}&anim=none&debug=3d`,
  { waitUntil: 'networkidle' }).catch((e) => errors.push(String(e)));
await page.waitForFunction(() => window.__showcaseMechs && window.__showcaseMechs[0], { timeout: 30000 });

const data = await page.evaluate(async ({ clip, t }) => {
  const THREE = (await import('/node_modules/three/build/three.module.js')).default
    || await import('/node_modules/three/build/three.module.js');
  const mech = window.__showcaseMechs[0];
  const engine = window.__showcaseEngine;
  engine.onUpdate = () => {};
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const dt = 1 / 60;

  // find the skinned mesh
  let mesh = null;
  mech.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const bones = mesh.skeleton.bones;
  const geo = mesh.geometry;
  const pos = geo.attributes.position, jnt = geo.attributes.skinIndex, wgt = geo.attributes.skinWeight;
  const n = pos.count;
  // dominant bone per vertex (post-skinOps binding already baked into geo)
  const dom = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) { const w = wgt.getComponent(i, k); if (w > bw) { bw = w; bi = jnt.getComponent(i, k); } }
    dom[i] = bi;
  }
  // which bones are animator-driven (adapter entries)
  const drivenBoneNames = new Set(mech.adapter.entries.map((e) => e.bone.name));
  const jointOfBone = {};
  for (const e of mech.adapter.entries) jointOfBone[e.bone.name] = e.jname;

  const v = new THREE.Vector3();
  const skinnedWorld = (i) => {
    v.fromBufferAttribute(pos, i);
    (mesh.applyBoneTransform || mesh.boneTransform).call(mesh, i, v);
    return mesh.localToWorld(v);
  };
  const settle = (playClip, steps) => {
    if (playClip) mech.animator.play(playClip);
    for (let i = 0; i < steps; i++) mech.animator.update(dt, ctx);
    engine.scene.updateMatrixWorld(true);
  };

  // rest
  mech.animator.action = null;
  settle(null, 70);
  const cnt = {}, rest = {};
  for (let i = 0; i < n; i++) {
    const bn = bones[dom[i]].name;
    const p = skinnedWorld(i);
    if (!rest[bn]) { rest[bn] = [0, 0, 0]; cnt[bn] = 0; }
    rest[bn][0] += p.x; rest[bn][1] += p.y; rest[bn][2] += p.z; cnt[bn]++;
  }
  for (const bn in rest) { rest[bn] = rest[bn].map((c) => c / cnt[bn]); }

  // strike
  const steps = Math.max(1, Math.round(t / dt));
  settle(clip, steps);
  const strike = {};
  for (let i = 0; i < n; i++) {
    const bn = bones[dom[i]].name;
    const p = skinnedWorld(i);
    if (!strike[bn]) strike[bn] = [0, 0, 0];
    strike[bn][0] += p.x; strike[bn][1] += p.y; strike[bn][2] += p.z;
  }
  const rows = [];
  for (const bn in strike) {
    const c = [strike[bn][0] / cnt[bn], strike[bn][1] / cnt[bn], strike[bn][2] / cnt[bn]];
    const d = Math.hypot(c[0] - rest[bn][0], c[1] - rest[bn][1], c[2] - rest[bn][2]);
    rows.push({ bone: bn, verts: cnt[bn], restC: rest[bn].map((x) => +x.toFixed(2)), disp: +d.toFixed(2),
      driven: drivenBoneNames.has(bn) ? jointOfBone[bn] : '' });
  }
  rows.sort((a, b) => b.disp - a.disp);
  return { total: n, rows };
}, { clip, t });

await page.screenshot({ path: `${prefix}_t${String(t).replace('.', '')}.png` });
console.log(`\n=== ${mechId} ${clip} @ t=${t}s — skinned-mesh centroid displacement by dominant bone ===`);
console.log(`(total verts ${data.total})`);
console.log('bone'.padEnd(24), 'verts'.padStart(7), 'disp'.padStart(6), 'driven→joint'.padStart(13), '   restCentroid');
for (const r of data.rows) {
  console.log(r.bone.padEnd(24), String(r.verts).padStart(7), String(r.disp).padStart(6),
    (r.driven || '·').padStart(13), '   ' + JSON.stringify(r.restC));
}
if (errors.length) console.log('\nERRORS:\n' + errors.join('\n'));
await browser.close();
