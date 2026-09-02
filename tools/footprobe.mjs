// footprobe — does this mech's walk actually plant its feet, at any body size?
//
//   node tools/footprobe.mjs [mech] [scale]        (default: colossus 4)
//
// Drives the ?debug=models fighter forward and measures, per sim frame:
//
//   cadence   steps/second (gait phase crossings) — should fall 1:1 with size,
//             because a leg that is N times longer covers N times the ground
//   footSpeed world-space speed of an ankle. A grown body should land near the
//             SAME number as at scale 1: the stride is longer but proportionally
//             slower. Several times higher means feet teleporting.
//   slip      min(|v_ankleL|, |v_ankleR|) — the STANCE foot's world speed, which
//             is the honest skating measure: whichever foot is planted should be
//             standing still on the pavement, whatever size the mech is.
//
// Each size is measured twice: with Animator.sizeMul live (what ships) and with
// it pinned to 1 (the pre-fix behaviour), so the difference is attributable.
import { launch } from './lib/browser.mjs';

const mech = process.argv[2] || 'colossus';
const SCALE = Number(process.argv[3] || 4);
const URL = `http://localhost:5173/?debug=models&mech=${mech}&compare=solo`;

const browser = await launch();
// small viewport: SwiftShader is the bottleneck and every frame is a sample
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(24000);

await page.evaluate(() => {
  const d = window.__poseDebug, f = d.glbF;
  const P = (j) => { j.updateWorldMatrix(true, false); const e = j.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  window.__fp = { on: false, foot: [], slip: [], body: 0, n: 0, p0: null, p1: null, t0: 0, t1: 0 };
  let lastL = null, lastR = null, lastT = null;
  const tick = () => {
    requestAnimationFrame(tick);
    const p = window.__fp;
    if (!p.on) { lastL = null; return; }
    const L = P(f.mech.joints.ankleL), R = P(f.mech.joints.ankleR), t = d.engine.elapsed;
    if (lastL && t > lastT) {
      const dt = t - lastT;
      if (dt > 0.02 && dt < 0.2) {
        const vL = Math.hypot(L[0] - lastL[0], L[1] - lastL[1], L[2] - lastL[2]) / dt;
        const vR = Math.hypot(R[0] - lastR[0], R[1] - lastR[1], R[2] - lastR[2]) / dt;
        p.foot.push(vL);
        p.slip.push(Math.min(Math.hypot(L[0] - lastL[0], L[2] - lastL[2]) / dt,
          Math.hypot(R[0] - lastR[0], R[2] - lastR[2]) / dt));
        p.body += Math.hypot(f.vel.x, f.vel.z); p.n++;
      }
    }
    lastL = L; lastR = R; lastT = t;
    if (p.p0 === null) { p.p0 = f.animator.phase; p.t0 = t; }
    p.p1 = f.animator.phase; p.t1 = t;
  };
  requestAnimationFrame(tick);
  window.__fpStart = () => Object.assign(window.__fp, { on: true, foot: [], slip: [], body: 0, n: 0, p0: null, p1: null });
  window.__fpStop = () => {
    const p = window.__fp; p.on = false;
    const q = (arr, x) => { const s = arr.slice().sort((a, b) => a - b);
      return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * x))].toFixed(2) : 0; };
    return {
      cadence: +((p.p1 - p.p0) / Math.max(1e-3, p.t1 - p.t0) / Math.PI).toFixed(3),
      footMed: q(p.foot, 0.5), footP95: q(p.foot, 0.95),
      slipMed: q(p.slip, 0.5), slipP95: q(p.slip, 0.95),
      body: +(p.body / Math.max(1, p.n)).toFixed(2),
      steps: +((p.p1 - p.p0) / Math.PI).toFixed(1), frames: p.n,
    };
  };
});

async function run(label, S, mul, ms = 40000) {
  await page.evaluate(({ S, mul }) => {
    const f = window.__poseDebug.glbF;
    f.group.scale.setScalar(S);
    f.animator.sizeMul = mul;
    window.__poseDebug.engine.timeScale = 3;   // SwiftShader: buy sim time
  }, { S, mul });
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);             // let the gait settle
  await page.evaluate(() => window.__fpStart());
  await page.waitForTimeout(ms);
  const r = await page.evaluate(() => window.__fpStop());
  await page.keyboard.up('w');
  await page.waitForTimeout(1500);
  console.log(label.padEnd(22), JSON.stringify(r));
  return r;
}

console.log(`${mech} — walking, ankle speed in world units/s\n`);
await run('scale 1', 1, 1);
await run(`scale ${SCALE} (sizeMul on)`, SCALE, SCALE);
await run(`scale ${SCALE} (sizeMul 1)`, SCALE, 1);
console.log('\n' + (errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 5).join('\n') : 'no page errors'));
await browser.close();
