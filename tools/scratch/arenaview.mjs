// A LOOK AT THE PLACE, from a mech's own eye line.
//   node tools/scratch/arenaview.mjs "<battle url>" <out.png> [yawDeg] [height] [dist]
// Parks the camera out on the spawn ring looking across the arena centre —
// the view a player actually fights in, which is the only honest way to judge
// whether the big structures read.
import { chromium } from 'playwright-core';
const [url, out, yawD = '35', hgt = '12', dist = '70'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world, null, { timeout: 90000 });
await page.waitForTimeout(3500);
const info = await page.evaluate(({ yawD, hgt, dist }) => {
  const w = window.__world, eng = w.engine;
  const a = (+yawD) * Math.PI / 180;
  eng.camera.position.set(Math.cos(a) * +dist, +hgt, Math.sin(a) * +dist);
  eng.camera.up.set(0, 1, 0);
  eng.camera.lookAt(0, 5, 0);
  eng.onRender = () => {};
  for (const f of w.fighters) f.group.visible = false;
  const counts = {};
  for (const d of w.arena.destructoAll || []) counts[d.buildings.length] = (counts[d.buildings.length] || 0);
  return {
    systems: (w.arena.destructoAll || []).map((d) => `${d.buildings.length} masses / ${d.count} chunks`),
  };
}, { yawD, hgt, dist });
await page.waitForTimeout(1500);
await page.screenshot({ path: out, timeout: 120000 });
console.log(JSON.stringify(info));
await browser.close();
