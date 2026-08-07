// Pictures of SAURION's clutch: the eggs down, one rolling, one hatching.
// usage: node tools/scratch/eggshot.mjs <outPrefix> [waitMs]
import { chromium } from 'playwright-core';
const [out = 'egg', waitMs = '30000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await p.goto('http://localhost:5173/?battle=neon&p1=saurion&p2=titanus', { waitUntil: 'networkidle' });
await p.waitForTimeout(Number(waitMs));
await p.evaluate(async () => {
  const w = window.__world, F = window.__fighters;
  window.__ais.length = 0; F[1].controlsLocked = true;
  for (let i = 0; i < 90; i++) { w.update(1/60); window.__cam.update(1/60, F, [F[0]]); }
  F[0].ult = 1; F[0].ultCharges = 1; F[0].doUlt();
  window.__engine.paused = true;
});
const shot = async (name, frames) => {
  await p.evaluate((n) => { const w = window.__world, F = window.__fighters; for (let i = 0; i < n; i++) { w.update(1/60); window.__cam.update(1/60, F, [F[0]]); } window.__engine._render(); }, frames);
  await p.screenshot({ path: `${out}-${name}.png`, timeout: 120000 });
};
await shot('laid', 100);       // eggs down and settling
await p.evaluate(() => {       // …and one kicked across the plaza by SAURION
  const w = window.__world, e = w.eggs.eggs[0];
  if (e) w.eggs.hit(e, w.fighters[0], { x: 1, y: 0, z: 0.4 }, 1);
});
await shot('rolling', 25);
await shot('hatching', 60);
await shot('hatched', 90);
await b.close();
console.log('wrote', out + '-{laid,rolling,hatching,hatched}.png');
