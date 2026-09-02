// TRITONE's rear, measured: are the hind feet still on the ground, is the tail
// above them, and is the floor guard having to prop him up?
//   node tools/scratch/rearprobe.mjs [mech] [clip]
import { launch } from '../lib/browser.mjs';
const mech = process.argv[2] || 'tritone', clip = process.argv[3] || 'taunt';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 250)));
await p.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 45000 });
const rows = await p.evaluate(({ clip }) => {
  const m = window.__showcaseMechs[0], a = m.animator;
  window.__showcaseEngine.onUpdate = () => {};
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const bone = (n) => m.boneMap?.[n] || m.rigBones?.[n] || m.joints?.[n];
  const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  a.action = null;
  for (let i = 0; i < 60; i++) a.update(1 / 60, ctx);
  a.play(clip);
  const dur = a.action?.clip.dur;
  if (!dur) return null;
  const out = [];
  const N = 14;
  for (let k = 0; k <= N; k++) {
    const target = dur * (k / N);
    a.action = null;
    for (let i = 0; i < 60; i++) a.update(1 / 60, ctx);
    a.play(clip);
    for (let i = 0; i < Math.round(target * 60); i++) a.update(1 / 60, ctx);
    window.__showcaseEngine.scene.updateMatrixWorld(true);
    const r = { t: +target.toFixed(2) };
    for (const n of ['ankleL', 'ankleR', 'head', 'tail0', 'tail1', 'tail2', 'tailTip']) {
      const bn = bone(n); if (bn) r[n] = +wp(bn)[1].toFixed(2);
    }
    r.low = +(m.lowestRenderedY?.() ?? NaN).toFixed(2);
    out.push(r);
  }
  return out;
}, { clip });
await b.close();
if (!rows) { console.error('no clip'); process.exit(1); }
console.log('t     ankleL ankleR  head   tail0 tail1 tail2 tailTip   lowestY');
for (const r of rows) {
  console.log(`${String(r.t).padEnd(5)} ${String(r.ankleL).padStart(6)} ${String(r.ankleR).padStart(6)} ${String(r.head).padStart(6)}  `
    + `${String(r.tail0).padStart(5)} ${String(r.tail1).padStart(5)} ${String(r.tail2).padStart(5)} ${String(r.tailTip).padStart(7)}   ${String(r.low).padStart(6)}`);
}
const foot = Math.min(...rows.map((r) => Math.min(r.ankleL, r.ankleR)));
const worst = Math.min(...rows.map((r) => Math.min(r.tail0, r.tail1, r.tail2, r.tailTip)));
console.log(`\nlowest hind ankle ${foot.toFixed(2)} · lowest tail bone ${worst.toFixed(2)}`
  + (worst < foot - 0.05 ? '  <-- TAIL BELOW THE FEET' : '  (tail stays at/above the feet)'));
