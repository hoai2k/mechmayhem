// A closer look at an overhead: shoots at 1920x1080 and saves the four
// quadrants as separate 960x540 files. node tools/scratch/clipshot.mjs <url> <out-prefix> [waitMs]
import { launch } from '../lib/browser.mjs';
const [url, out, waitMs = '60000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(Number(waitMs));
for (const [qx, qy, tag] of [[0, 0, 'tl'], [960, 0, 'tr'], [0, 540, 'bl'], [960, 540, 'br']]) {
  await page.screenshot({ path: `${out}_${tag}.png`, clip: { x: qx, y: qy, width: 960, height: 540 }, timeout: 240000 });
}
await browser.close();
console.log('clips done');
