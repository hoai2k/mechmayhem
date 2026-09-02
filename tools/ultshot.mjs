// Screenshot driver for ultimates: loads a battle, freezes the AI, lines the
// two bots up, force-fires P1's ult, then fast-forwards the world
// synchronously and screenshots at the requested frame marks.
import { launch } from './lib/browser.mjs';

const [, , p1, p2, phasesArg, prefix, distArg] = process.argv;
const phases = phasesArg.split(',').map(Number);
const dist = Number(distArg) || 14;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(
  `http://localhost:5173/?battle=neon&p1=${p1}&p2=${p2}&auto=1&diff=rookie&debug=ultimates`,
  { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__world && window.__fighters, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate((d) => {
  window.__ais.length = 0; // stop the brains; we direct this scene
  const [a, b] = window.__fighters;
  for (const f of [a, b]) { // ...and wipe the intents the brains left behind
    for (const k of Object.keys(f.intent)) {
      f.intent[k] = typeof f.intent[k] === 'number' ? 0 : false;
    }
  }
  a.pos.set(0, 0, -d / 2); a.yaw = a.targetYaw = 0; a.vel.set(0, 0, 0);
  b.pos.set(0, 0, d / 2); b.yaw = b.targetYaw = Math.PI; b.vel.set(0, 0, 0);
  a.ult = 1;
  a.doUlt();
}, dist);
let n = 0;
for (const steps of phases) {
  await page.evaluate((s) => {
    const w = window.__world;
    for (let i = 0; i < s; i++) w.update(1 / 60);
  }, steps);
  await page.waitForTimeout(1100); // real-time: camera eases + a frame renders
  await page.screenshot({ path: `${prefix}_${n++}.png` });
}
await browser.close();
console.log('done', prefix);
