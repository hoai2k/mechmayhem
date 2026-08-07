// CPU profile of ONE raptor-pack clone: which functions inside buildGlbMech
// spend the 44ms. usage: node tools/scratch/ultprof.mjs [waitMs]
import { chromium } from 'playwright-core';

const [waitMs = '30000'] = process.argv.slice(2);
const url = 'http://localhost:5173/?battle=neon&p1=saurion&p2=titanus&auto=1&diff=ace';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await page.evaluate(async () => {
  // profile the CAST, prewarmed exactly as a real round is
  const w = window.__world, f = w.fighters[0];
  const { prewarmSummons } = await import('/src/combat/specials.js');
  for (let i = 0; i < 6; i++) prewarmSummons(f, 1);
  f.ult = 1; f.ultCharges = 1;
  f.doUlt();
  for (let i = 0; i < 90; i++) w.update(1 / 60);
});
const { profile } = await cdp.send('Profiler.stop');

const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
for (const n of profile.nodes) {
  const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-1)[0]}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + (n.hitCount || 0));
}
const totalHits = [...self.values()].reduce((a, b) => a + b, 0);
const dur = (profile.endTime - profile.startTime) / 1000;
console.log(`total ${dur.toFixed(0)}ms over ${totalHits} samples\n`);
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`${(v / totalHits * 100).toFixed(1).padStart(5)}%  ${(v / totalHits * dur).toFixed(1).padStart(7)}ms  ${k}`);
}
await browser.close();
