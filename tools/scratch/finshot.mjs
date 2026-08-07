// PICTURES OF A FINISHER. Drives one mech's finisher by hand (the world is
// stepped by the harness, so a 20x-slow headless renderer still lands on the
// beat you asked for) and shoots the frames you name.
//   node tools/scratch/finshot.mjs <mech> <out-prefix> <t0,t1,...> [victim]
import { chromium } from 'playwright-core';

const [mech = 'saurion', out = '/tmp/fin', times = '1.6,2.2,3,3.8', vic = 'titanus'] = process.argv.slice(2);
const TS = times.split(',').map(Number);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await page.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=${vic}&auto=0`, { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);
await page.evaluate(() => {
  const w = window.__world, [win, v] = window.__fighters;
  for (const f of window.__fighters) f.controlsLocked = true;
  window.__engine.paused = true;
  v.hp = 1;
  w.startFinisher(win, v, () => {});
});
let at = 0;
for (const t of TS) {
  const adv = t - at; at = t;
  await page.evaluate((adv) => {
    const w = window.__world;
    for (let i = 0; i < Math.round(adv * 60); i++) w.update(1 / 60);
    window.__engine.step(0);
  }, adv);
  const file = `${out}-${String(t).replace('.', 'p')}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
