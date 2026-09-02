// WHICH SHOULDER/ELBOW ANGLES ACTUALLY PUT THE HAND IN FRONT — the band the
// clip clamp (roster `foreCarry`) is derived from.
//   node tools/scratch/armband.mjs <mech>
// Prints hand-forward offset (fraction of body height, + = in front of the
// shoulder) over a grid of shoulder pitch x elbow fold.
import { launch } from '../lib/browser.mjs';
const mech = process.argv[2] || 'saurion';
const b = await launch();
const page = await b.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 60000 });
await page.waitForTimeout(4000);

const res = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const m = window.__showcaseMechs[0], a = m.animator;
  if (window.__showcaseEngine) window.__showcaseEngine.onUpdate = () => {};
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const D2R = Math.PI / 180;
  const H = (m.dims.hipHeight + m.dims.torsoH + m.dims.headSize * 2) || 1;
  const inv = new THREE.Matrix4(), p = new THREE.Vector3();
  const at = (n) => {
    const bone = m.rigBones?.[n] || m.joints?.[n];
    if (!bone) return null;
    bone.updateWorldMatrix(true, false);
    p.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv);
    return { y: p.y, z: p.z };
  };
  const meas = () => {
    m.group.updateMatrixWorld(true);
    inv.copy(m.group.matrixWorld).invert();
    const sh = at('shoulderL'), hd = at('handL'), el = at('elbowL');
    return { hand: +((hd.z - sh.z) / H).toFixed(3), elbow: +((el.z - sh.z) / H).toFixed(3),
      up: +((hd.y - sh.y) / H).toFixed(3) };
  };
  a.action = null;
  for (let i = 0; i < 40; i++) a.update(1 / 60, ctx);
  const rows = [];
  const P = [20, 10, 0, -20, -30, -38, -45, -52, -60, -75, -90, -110, -125, -140, -160];
  const E = [-20, -40, -55, -70, -85, -110];
  for (const sp of P) for (const e of E) {
    const pose = { shoulderL: [sp, 0, -9], shoulderR: [sp, 0, 9], elbowL: [e, 0, 0], elbowR: [e, 0, 0],
      handL: [28, 0, 10], handR: [28, 0, -10] };
    for (let i = 0; i < 6; i++) {
      a.update(1 / 60, ctx);
      for (const [j, v] of Object.entries(pose)) {
        const t = a.cur[j]; if (t) { t[0] = v[0] * D2R; t[1] = v[1] * D2R; t[2] = v[2] * D2R; }
      }
      a.applyPose(a.cur); a.adapter?.sync?.();
    }
    rows.push({ sp, e, ...meas() });
  }
  return rows;
});
await b.close();
console.log('shoulder elbow   hand   elbowZ   handY');
for (const r of res) {
  console.log(`${String(r.sp).padStart(6)} ${String(r.e).padStart(6)}  ${String(r.hand).padStart(6)} ${String(r.elbow).padStart(7)} ${String(r.up).padStart(7)}${r.hand < 0 ? '   BEHIND' : ''}`);
}
