// Destruction check: loads a battle, blows a crater into the first massed
// building, fast-forwards the collapse, and screenshots the wreck up close.
// usage: node tools/smashtest.mjs <url> <out.png> [waitMs]
import { launch } from './lib/browser.mjs';

const [url, out, waitMs = '26000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => errors.push(String(e)));
await page.waitForTimeout(Number(waitMs));
const info = await page.evaluate(() => {
  const w = window.__world;
  if (!w) return { err: 'no __world' };
  const d = w.arena.destructo;
  const b = d.buildings.reduce((best, bb) =>
    (!best || bb.chunkCount > best.chunkCount) ? bb : best, null);
  if (!b) return { err: 'no buildings' };
  const a = b.aabb;
  const c = {
    x: (a.minX + a.maxX) / 2, z: (a.minZ + a.maxZ) / 2,
    y: Math.min(6, a.maxY * 0.35),
  };
  const before = b.alive;
  // two mid-height hits on one face: a crater, not a demolition
  const V = new (Object.getPrototypeOf(w.fighters[0].pos).constructor)();
  V.set(c.x + (a.maxX - a.minX) * 0.4, c.y, c.z);
  w.arena.damageSphere(V.clone(), 5.5, 300, null, true);
  V.set(c.x + (a.maxX - a.minX) * 0.4, c.y + 3, c.z + 2);
  w.arena.damageSphere(V.clone(), 4.5, 300, null, true);
  for (let i = 0; i < 400; i++) w.update(1 / 60);   // let the cascade settle
  const e = w.engine;
  e.onRender = null;
  const dist = Math.max(a.maxX - a.minX, a.maxZ - a.minZ) + 16;
  const ang = Math.atan2(c.x, c.z) + 0.5;
  e.camera.position.set(c.x + Math.sin(ang) * dist, a.maxY * 0.6 + 4, c.z + Math.cos(ang) * dist);
  e.camera.lookAt(c.x, a.maxY * 0.35, c.z);
  return { aliveBefore: before, aliveAfter: b.alive, chunkCount: b.chunkCount, collapsing: !!b.collapsing };
});
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log(JSON.stringify(info));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
