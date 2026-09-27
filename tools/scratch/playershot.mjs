// Screenshot a battle at 1600x900: node tools/scratch/playershot.mjs "<url>" out.png [waitMs]
// (the stock shot.mjs is 960x540 — too small to judge an 8-way split's HUD)
import { launch } from '../lib/browser.mjs';
const [url, out, waitMs = '20000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' }).catch((e) => errors.push(String(e)));
await page.waitForTimeout(Number(waitMs));
// the battle harness' debug readout is for a terminal, not a picture
await page.evaluate(() => document.querySelectorAll('#ui-root > div').forEach((d) => {
  if (d.style.font?.includes('monospace')) d.style.display = 'none';
}));
await page.screenshot({ path: out, timeout: 180000, ...(/\.jpe?g$/.test(out) ? { type: 'jpeg', quality: 84 } : {}) });
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 8).join('\n') : 'no page errors');
await browser.close();
