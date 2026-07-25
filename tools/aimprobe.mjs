// Where does a mech's muzzle actually POINT at the fire frame?
//   node aimprobe.mjs <mechId> <clip> <t0,t1,...>
import { chromium } from 'playwright-core';
const [mechId, clip, tlist = '0,0.1,0.11,0.2'] = process.argv.slice(2);
const times = tlist.split(',').map(Number);
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto(`http://localhost:5173/?showcase=${mechId}&anim=none`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__showcaseMechs?.length, null, { timeout: 60000 });
const rows = await p.evaluate(async ([clipName, times]) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const mech = window.__showcaseMechs[0];
  const engine = window.__showcaseEngine;
  engine.onUpdate = () => {};
  const an = mech.animator;
  const step = 1 / 120;
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const run = (d) => { for (let i = 0; i < Math.round(d / step); i++) an.update(step, ctx); };
  const out = [];
  for (const t of times) {
    an.action = null;
    run(1.5);
    an.play(clipName);
    run(t);
    engine.scene.updateMatrixWorld(true);
    const res = {};
    for (const key of ['muzzleR', 'muzzleL', 'eye', 'scope']) {
      const a = mech.anchors[key];
      if (!a) continue;
      const q = a.getWorldQuaternion(new THREE.Quaternion());
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
      const pos = a.getWorldPosition(new THREE.Vector3());
      res[key] = {
        pos: pos.toArray().map((v) => +v.toFixed(2)),
        dir: f.toArray().map((v) => +v.toFixed(3)),
        // mech faces +Z in the showcase: azimuth from +Z toward +X, elevation up
        azi: +(Math.atan2(f.x, f.z) * 180 / Math.PI).toFixed(1),
        ele: +(Math.asin(Math.max(-1, Math.min(1, f.y))) * 180 / Math.PI).toFixed(1),
      };
    }
    out.push({ t, res });
  }
  return out;
}, [clip, times]);
for (const r of rows) {
  console.log(`t=${r.t}`);
  for (const [k, v] of Object.entries(r.res)) {
    console.log(`   ${k.padEnd(8)} pos ${JSON.stringify(v.pos).padEnd(22)} azi ${String(v.azi).padStart(7)}°  ele ${String(v.ele).padStart(7)}°`);
  }
}
await b.close();
