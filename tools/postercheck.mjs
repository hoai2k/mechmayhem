// postercheck — does the poster occupy the same pixels as the model?
//
// Drives the real mech-select stage: captures a frame while the POSTER is up,
// forces the handover, captures a frame with the MODEL up, and compares the
// two silhouettes. Reports the bounding-box drift in pixels and the fraction
// of pixels that agree — a good handover moves nothing.
//
//   node tools/postercheck.mjs <mech> [mech ...]
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const BASE = process.env.RW_URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const silhouette = (buf) => {
  const p = PNG.sync.read(buf);
  let x0 = p.width, x1 = -1, y0 = p.height, y1 = -1;
  const on = new Uint8Array(p.width * p.height);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      // the stage floor is very dark; the mech is not
      const lum = (p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3;
      if (lum > 12) {
        on[y * p.width + x] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { on, w: p.width, h: p.height, x0, x1, y0, y1 };
};
for (const mech of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  await page.goto(`${BASE}?menupose=${mech}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__menupose.showPoster());
  await page.waitForTimeout(2500);
  const a = silhouette(await page.screenshot());
  await page.evaluate(() => window.__menupose.promote());
  await page.waitForTimeout(3500);
  const b = silhouette(await page.screenshot());
  let both = 0, either = 0;
  for (let i = 0; i < a.on.length; i++) {
    if (a.on[i] || b.on[i]) either++;
    if (a.on[i] && b.on[i]) both++;
  }
  console.log(JSON.stringify({
    mech,
    posterBox: [a.x0, a.y0, a.x1, a.y1],
    modelBox: [b.x0, b.y0, b.x1, b.y1],
    driftPx: {
      left: b.x0 - a.x0, right: b.x1 - a.x1, top: b.y0 - a.y0, bottom: b.y1 - a.y1,
    },
    overlap: +(both / (either || 1)).toFixed(3),
  }));
  await page.close();
}
await browser.close();
