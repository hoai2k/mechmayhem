// Where does an ULT's cost go? Times the cast frame (the spawn stall) and the
// steady-state world step before/after, so a summon ult's two very different
// costs are separated.
//
// usage: node tools/scratch/ultprobe.mjs <mech> [ult] [waitMs]
import { chromium } from 'playwright-core';

const [mech = 'saurion', waitMs = '30000'] = process.argv.slice(2);
const url = `http://localhost:5173/?battle=neon&p1=${mech}&p2=titanus&auto=1&diff=ace`;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 160)); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world;
  const dt = 1 / 60;
  const f = w.fighters[0];
  const step = (n) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      for (const a of (window.__ais || [])) a.update(dt);
      for (const g of w.fighters) g.update(dt);
      w.projectiles.update(dt); w.effects.update(dt); w.arena.update(dt);
    }
    return (performance.now() - t0) / n;
  };
  const before = step(120);
  // the pack is built during the round intro in a real match (match.js) —
  // do the same here so the measurement is of what ships
  const { prewarmSummons } = await import('/src/combat/specials.js');
  for (let i = 0; i < 6; i++) prewarmSummons(f, 1);
  // fire the ult
  f.ult = 1; f.ultCharges = 1;
  const t0 = performance.now();
  f.doUlt();
  const castMs = performance.now() - t0;
  // the volley staggers spawns over ~0.7s: step and record per-frame peaks
  const frames = [];
  for (let i = 0; i < 120; i++) {
    const a = performance.now();
    for (const g of w.fighters) g.update(dt);
    w.projectiles.update(dt); w.effects.update(dt); w.arena.update(dt);
    for (const u of [0]) void u;
    w.update ? null : null;
    frames.push(performance.now() - a);
  }
  // run pending scheduled callbacks via the real world update
  const sched = [];
  for (let i = 0; i < 120; i++) {
    const a = performance.now();
    w.update(dt);
    sched.push(performance.now() - a);
  }
  const after = step(120);
  // ...and the RENDER side, which a world-step measurement cannot see: three
  // more skinned bodies are three more skinned draws, their bone textures and
  // their shadow passes. engine.step() renders synchronously.
  const eng = window.__engine;
  const renderTimes = [];
  eng.paused = true;
  for (let i = 0; i < 20; i++) {
    const a = performance.now(); eng.step(1 / 60); renderTimes.push(performance.now() - a);
  }
  renderTimes.sort((x, y) => x - y);
  const draws = eng.renderer.info.render;
  return {
    before, castMs, after,
    renderMedian: +renderTimes[10].toFixed(1), renderWorst: +renderTimes[19].toFixed(1),
    drawCalls: draws.calls, tris: draws.triangles,
    minions: w.minions.length, fighters: w.fighters.length,
    peakFrame: Math.max(...sched), sortedTop: sched.slice().sort((a, b) => b - a).slice(0, 6),
    frameTop: frames.slice().sort((a, b) => b - a).slice(0, 4),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
