// postercheck — does each poster occupy the same pixels as the model it hands
// over to, at every player count?
//
// Drives the real mech-select stage (dev/menupose.js): stages the posters,
// isolates one slot, screenshots it, forces that slot's handover, screenshots
// again, and compares the two silhouettes. A good handover moves nothing.
//
//   node tools/postercheck.mjs viper                  # 1 picker
//   node tools/postercheck.mjs viper,rhino            # 2 pickers, both checked
//   node tools/postercheck.mjs viper,rhino,cranky,jerry
//
// Several comma-lists may be given; each is one run.
import { launch } from './lib/browser.mjs';
import { PNG } from 'pngjs';

const BASE = process.env.RW_URL || 'http://localhost:5173/';
const browser = await launch();
const silhouette = (buf) => {
  const p = PNG.sync.read(buf);
  let x0 = p.width, x1 = -1, y0 = p.height, y1 = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      const lum = (p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3;
      if (lum > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, x1, y0, y1, empty: x1 < 0 };
};
let worst = 0;
for (const list of process.argv.slice(2)) {
  const ids = list.split(',').filter(Boolean);
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  page.on('pageerror', (e) => console.log('  PAGE ERROR:', String(e).slice(0, 200)));
  await page.goto(`${BASE}?menupose=${list}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  const n = await page.evaluate(() => window.__menupose.stage());
  console.log(`\n${ids.length} picker(s): ${list}   (${n} posters staged)`);
  for (let slot = 0; slot < ids.length; slot++) {
    await page.evaluate((s) => window.__menupose.solo(s), slot);
    await page.waitForTimeout(1600);
    const a = silhouette(await page.screenshot());
    await page.evaluate((s) => window.__menupose.promote(s), slot);
    // the GLB swaps in behind a spinner — wait for the real body, or the
    // comparison is against a placeholder
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(400);
      if (await page.evaluate(() => window.__menupose.glbReady())) break;
    }
    await page.waitForTimeout(1200);
    const b = silhouette(await page.screenshot());
    if (a.empty || b.empty) { console.log(`  slot ${slot} ${ids[slot]}: EMPTY FRAME`); continue; }
    const d = { left: b.x0 - a.x0, right: b.x1 - a.x1, top: b.y0 - a.y0, bottom: b.y1 - a.y1 };
    const max = Math.max(...Object.values(d).map(Math.abs));
    worst = Math.max(worst, max);
    console.log(`  slot ${slot} ${ids[slot].padEnd(9)} drift L${String(d.left).padStart(4)} R${String(d.right).padStart(4)}` +
                ` T${String(d.top).padStart(4)} B${String(d.bottom).padStart(4)}   worst ${max}px`);
    await page.evaluate(() => window.__menupose.all());
  }
  await page.close();
}
console.log(`\nworst drift across all runs: ${worst}px`);
await browser.close();
