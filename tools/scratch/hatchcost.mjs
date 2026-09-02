// WHAT ONE HATCH COSTS, broken into its parts — the body (prepare), the
// Fighter, the AI, and the frame the raptor first walks on. Also: how much a
// live minion costs per step, since three of them is a permanent tax the
// player feels as "lag after the ult" whether or not any single frame spiked.
import { launch } from '../lib/browser.mjs';
const [waitMs = '25000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?battle=neon&p1=saurion&p2=titanus', { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, [s, foe] = window.__fighters;
  const dt = 1 / 60;
  window.__ais.length = 0;
  foe.controlsLocked = true;
  const { cloneMech } = await import('/src/mechs/factory.js');
  const R = {};
  const time = (fn, n = 5) => {
    const xs = [];
    for (let i = 0; i < n; i++) { const a = performance.now(); fn(i); xs.push(performance.now() - a); }
    return xs.map((x) => +x.toFixed(2));
  };
  R.cloneMechMs = time(() => cloneMech(s.mech), 5);

  const settle = (n) => { for (let i = 0; i < n; i++) w.update(dt); };
  const stepCost = (n = 240) => {
    const xs = [];
    for (let i = 0; i < n; i++) { const a = performance.now(); w.update(dt); xs.push(performance.now() - a); }
    xs.sort((a, b) => a - b);
    return { median: +xs[n >> 1].toFixed(2), p95: +xs[(n * 0.95) | 0].toFixed(2), worst: +xs[n - 1].toFixed(2) };
  };
  const clean = () => {
    w.eggs.clear(); w.minions.length = 0;
    for (const f of w.fighters.slice(2)) w.scene.remove(f.group);
    w.fighters.length = 2;
  };
  clean(); settle(30);
  R.stepNoMinions = stepCost();

  // cast for real and watch the frames each hatch lands on
  s.ult = 1; s.ultCharges = 1; s.doUlt();
  const per = [];
  let seen = 0;
  for (let i = 0; i < 60 * 9; i++) {
    const a = performance.now();
    w.update(dt);
    const ms = performance.now() - a;
    if (w.minions.length > seen) { seen = w.minions.length; per.push({ hatch: seen, t: +(i / 60).toFixed(2), ms: +ms.toFixed(2) }); }
  }
  R.hatchFrames = per;
  settle(60);
  R.stepThreeMinions = stepCost();
  return R;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
