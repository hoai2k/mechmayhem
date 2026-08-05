// WHERE ARE THE ARMS CARRIED, measured — the rendered hand/elbow against the
// shoulder in the mech's OWN frame (+z is forward, +y up), as a fraction of
// body height, at a standstill and at a run.
//
//   node tools/scratch/armcarry.mjs <mech> [throttle]
//   node tools/scratch/armcarry.mjs saurion 1 --sig shoulder=-1.15,elbow=-1.5,hand=0.3
//
// `--sig` overrides the signature's raptor carry constants live (window hook
// below), so a candidate can be measured before it is written into the file.
import { chromium } from 'playwright-core';

const mech = process.argv[2] || 'saurion';
const throttle = process.argv[3] ?? '1';
const base = process.env.RW_URL || 'http://localhost:5173';
const url = `${base}/workbench/?edit=gait&mech=${mech}&throttle=${throttle}&compare=0`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 320 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.__gaitWork?.animator', null, { timeout: 90000 });
await page.waitForTimeout(2500);

const out = await page.evaluate(async ({ thr }) => {
  const w = window.__gaitWork;
  const m = w.mech;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const H = (m.dims.hipHeight + m.dims.torsoH + m.dims.headSize * 2) || 1;
  const bones = m.rigBones || null;
  const at = (name) => {
    const b = (bones && bones[name]) || m.joints[name];
    if (!b) return null;
    b.updateWorldMatrix(true, false);
    const e = b.matrixWorld.elements;
    const p = { x: e[12], y: e[13], z: e[14] };
    // into the body's own frame
    const inv = m.group.matrixWorld.clone().invert().elements;
    const x = p.x, y = p.y, z = p.z;
    return {
      x: inv[0] * x + inv[4] * y + inv[8] * z + inv[12],
      y: inv[1] * x + inv[5] * y + inv[9] * z + inv[13],
      z: inv[2] * x + inv[6] * y + inv[10] * z + inv[14],
    };
  };
  const sample = async (ratio) => {
    w.setThrottle(ratio);
    await sleep(1400);
    const acc = { fwd: [], up: [], efwd: [] };
    for (let i = 0; i < 60; i++) {
      const sh = at('shoulderL'), hd = at('handL'), el = at('elbowL');
      if (sh && hd) { acc.fwd.push((hd.z - sh.z) / H); acc.up.push((hd.y - sh.y) / H); }
      if (sh && el) acc.efwd.push((el.z - sh.z) / H);
      await sleep(16);
    }
    const stat = (a) => ({
      mean: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(3),
      min: +Math.min(...a).toFixed(3), max: +Math.max(...a).toFixed(3),
    });
    return { handFwd: stat(acc.fwd), handUp: stat(acc.up), elbowFwd: stat(acc.efwd) };
  };
  const stand = await sample(0);
  const run = await sample(Number(thr));
  return { H: +H.toFixed(2), stand, run };
}, { thr: throttle });

await browser.close();
if (errs.length) console.error(errs.join('\n'));
const row = (k, s) => `    ${k.padEnd(9)} mean ${String(s.mean).padStart(7)}  [${s.min} … ${s.max}]`;
console.log(`${mech} — left arm carriage, body frame (+z forward), fraction of height ${out.H}`);
for (const [name, s] of [['STANDING', out.stand], [`RUN ${throttle}`, out.run]]) {
  console.log(`  ${name}`);
  console.log(row('handFwd', s.handFwd));
  console.log(row('handUp', s.handUp));
  console.log(row('elbowFwd', s.elbowFwd));
}
