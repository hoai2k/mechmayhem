// WHICH WAY IS FORWARD, for each pitch lever, on this rig.
// The showcase faces the camera at yaw 0 — cam at +z — so world +z IS the
// mech's forward. Report how far the HEAD (and the hood/tail tip if the rig has
// one) travels along +z for a positive value of each lever.
//   node tools/scratch/leansign.mjs <mech> [extraBone]
import { chromium } from 'playwright-core';
const mech = process.argv[2] || 'wraith';
const extra = process.argv[3] || null;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await p.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 45000 });
const rows = await p.evaluate(({ extra }) => {
  const m = window.__showcaseMechs[0], a = m.animator;
  window.__showcaseEngine.onUpdate = () => {};
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const D2R = Math.PI / 180;
  const bone = (j) => m.boneMap?.[j] || m.joints?.[j] || m.rigBones?.[j];
  const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  const cases = [
    { label: 'zero', rot: {}, hips: null },
    { label: 'torso +30', rot: { torso: [30, 0, 0] }, hips: null },
    { label: 'torso -30', rot: { torso: [-30, 0, 0] }, hips: null },
    { label: 'hipsRot +30', rot: {}, hips: [30, 0, 0] },
    { label: 'hipsRot -30', rot: {}, hips: [-30, 0, 0] },
  ];
  const out = [];
  for (const c of cases) {
    a.action = null;
    for (let i = 0; i < 40; i++) a.update(1 / 60, ctx);
    for (let i = 0; i < 30; i++) {
      a.update(1 / 60, ctx);
      for (const [j, v] of Object.entries(c.rot)) {
        const t = a.cur[j]; if (t) { t[0] = v[0] * D2R; t[1] = v[1] * D2R; t[2] = v[2] * D2R; }
      }
      if (c.hips) a.cur.hipsRot = c.hips.map((v) => v * D2R);
      a.applyPose(a.cur); a.adapter?.sync?.();
    }
    window.__showcaseEngine.scene.updateMatrixWorld(true);
    const r = { label: c.label };
    for (const n of ['hips', 'head', extra].filter(Boolean)) {
      const bn = bone(n); if (bn) r[n] = wp(bn).map((v) => +v.toFixed(2));
    }
    out.push(r);
  }
  return out;
}, { extra });
await b.close();
const z0 = rows[0].head?.[2] ?? 0, y0 = rows[0].head?.[1] ?? 0;
for (const r of rows) {
  const dz = (r.head?.[2] ?? 0) - z0, dy = (r.head?.[1] ?? 0) - y0;
  console.log(`${r.label.padEnd(12)} head ${JSON.stringify(r.head)}  dz ${dz.toFixed(2)} ${dz > 0.05 ? '(FORWARD)' : dz < -0.05 ? '(BACK)' : ''}  dy ${dy.toFixed(2)}`
    + (extra && r[extra] ? `   ${extra} ${JSON.stringify(r[extra])}` : ''));
}
