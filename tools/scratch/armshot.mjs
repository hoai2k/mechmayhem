// A close side-on look at the FORELIMBS over the run cycle.
//   node tools/scratch/armshot.mjs <mech> <out.png> [throttle] [frames]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const mech = process.argv[2] || 'saurion';
const out = process.argv[3] || 'arms.png';
const throttle = Number(process.argv[4] ?? 1);
const frames = Number(process.argv[5] ?? 4);
const base = process.env.RW_URL || 'http://localhost:5173';
const W = 520, H = 460;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`${base}/workbench/?edit=gait&mech=${mech}&throttle=${throttle}&compare=0&prints=0`,
  { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.__gaitWork?.animator', null, { timeout: 90000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__gaitWork.hidePanel(true); });

// frame on the SHOULDER, side on, close
await page.evaluate(({ }) => {
  const w = window.__gaitWork, m = w.mech;
  const b = (m.rigBones && m.rigBones.shoulderL) || m.joints.shoulderL;
  b.updateWorldMatrix(true, false);
  const e = b.matrixWorld.elements;
  const t = { x: e[12], y: e[13], z: e[14] };
  const s = (m.dims.hipHeight + m.dims.torsoH + m.dims.headSize * 2) || 1;
  w.orbit.target.set(t.x, t.y - 0.06 * s, t.z + 0.14 * s);
  w.camera.position.set(t.x - 1.55 * s, t.y + 0.12 * s, t.z + 0.14 * s);
  w.camera.lookAt(w.orbit.target);
  w.orbit.update();
}, {});

const shots = [];
for (let i = 0; i < frames; i++) {
  await page.evaluate(({ ph }) => {
    const w = window.__gaitWork;
    w.setPaused(true); w.setPhase(ph);
  }, { ph: (i / frames) * Math.PI * 2 });
  await page.waitForTimeout(900);
  shots.push(PNG.sync.read(await page.screenshot()));
}
await browser.close();

const sheet = new PNG({ width: W * frames, height: H });
shots.forEach((p, i) => PNG.bitblt(p, sheet, 0, 0, W, H, i * W, 0));
fs.writeFileSync(out, PNG.sync.write(sheet));
console.log(`${out} — ${mech} forelimbs, throttle ${throttle}, ${frames} phases`);
