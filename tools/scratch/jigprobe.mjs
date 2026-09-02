// viper's jig, measured: how wide is his stance, and how often does the BODY
// bounce as against how often his FEET move?
import { launch } from '../lib/browser.mjs';
const mech = process.argv[2] || 'viper', clip = process.argv[3] || 'taunt';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await p.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 45000 });
console.log(await p.evaluate(({ clip }) => {
  const m = window.__showcaseMechs[0], a = m.animator;
  window.__showcaseEngine.onUpdate = () => {};
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const bone = (n) => m.boneMap?.[n] || m.joints?.[n];
  const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  const hips = bone('hips'), aL = bone('ankleL'), aR = bone('ankleR');
  a.action = null;
  for (let i = 0; i < 60; i++) a.update(1 / 60, ctx);
  a.play(clip);
  const dur = a.action.clip.dur;
  const hipY = [], width = [], footY = [];
  for (let i = 0; i < Math.round(dur * 60); i++) {
    a.update(1 / 60, ctx);
    m.group.updateMatrixWorld(true);
    hipY.push(wp(hips)[1]);
    const l = wp(aL), r = wp(aR);
    width.push(Math.abs(l[0] - r[0]));
    footY.push(Math.max(l[1], r[1]));
  }
  // count local maxima (a bounce / a step) on a lightly smoothed signal
  const peaks = (arr, eps) => { let n = 0; for (let i = 2; i < arr.length - 2; i++)
    if (arr[i] > arr[i - 2] + eps && arr[i] >= arr[i + 2]) n++; return n; };
  const avg = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  return JSON.stringify({
    dur: +dur.toFixed(2),
    stanceWidth: { min: +Math.min(...width).toFixed(2), avg: +avg(width).toFixed(2), max: +Math.max(...width).toFixed(2) },
    hipBouncesPerSec: +(peaks(hipY, 0.004) / dur).toFixed(2),
    footStepsPerSec: +(peaks(footY, 0.02) / dur).toFixed(2),
    hipTravel: +(Math.max(...hipY) - Math.min(...hipY)).toFixed(2),
    footLift: +(Math.max(...footY) - Math.min(...footY)).toFixed(2),
  });
}, { clip }));
await b.close();
