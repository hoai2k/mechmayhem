// Ult-fountain end-to-end check: waits for fountains to spawn, walks a
// fighter into one, verifies the charge/collect/spend lifecycle, and
// screenshots the fountain + the collect flash.
// usage: node tools/fountaintest.mjs <battle url> <outPrefix> [waitMs]
import { chromium } from 'playwright-core';

const [url, prefix, waitMs = '30000'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => errors.push(String(e)));
await page.waitForTimeout(Number(waitMs));

// 1. fountains exist? frame one.
const s1 = await page.evaluate(() => {
  const w = window.__world;
  if (!w?.fountains) return { err: 'no fountains system' };
  const F = w.fountains;
  // fast-forward the spawner so the board fills to cap
  for (let i = 0; i < 3000; i++) w.update(1 / 60);
  const list = F.active.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), z: Math.round(f.z) }));
  if (!list.length) return { err: 'no fountains spawned', cap: F.cap() };
  const fn = F.active[0];
  const e = w.engine;
  e.onRender = null;
  e.camera.position.set(fn.x + 10, fn.y + 5, fn.z + 10);
  e.camera.lookAt(fn.x, fn.y + 2, fn.z);
  return { cap: F.cap(), count: list.length, list: list.slice(0, 6) };
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${prefix}_fountain.png` });

// 2. collect: teleport P1 into it, step, verify charge + flash frame.
const s2 = await page.evaluate(() => {
  const w = window.__world;
  const F = w.fountains;
  const f = w.fighters[0];
  const r = { before: f.ultCharges };
  const fn = F.active[0];
  if (!fn) return { err: 'no fountain to collect' };
  f.pos.set(fn.x, fn.y, fn.z);
  for (let i = 0; i < 20; i++) w.update(1 / 60);
  r.after = f.ultCharges;
  r.ultMirror = f.ult;
  // second fountain → second charge; third should refuse (max 2)
  for (const k of [0, 1]) {
    const g = F.active[0];
    if (!g) break;
    f.pos.set(g.x, g.y, g.z);
    for (let i = 0; i < 20; i++) w.update(1 / 60);
  }
  r.afterMore = f.ultCharges;
  const e = w.engine;
  const c = f.center();
  e.camera.position.set(c.x + 8, c.y + 3, c.z + 8);
  e.camera.lookAt(c.x, c.y, c.z);
  return r;
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${prefix}_collect.png` });

// 3. spend: fire the ult, check consumption + flash timer.
const s3 = await page.evaluate(() => {
  const w = window.__world;
  const f = w.fighters[0];
  const before = f.ultCharges;
  f.doUlt();
  const r = { before, after: f.ultCharges, flashT: +f.ultFlashT.toFixed(2), ultMirror: f.ult, state: f.state };
  for (let i = 0; i < 30; i++) w.update(1 / 60);
  return r;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}_ult.png` });

console.log(JSON.stringify({ spawn: s1, collect: s2, spend: s3 }, null, 1));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
