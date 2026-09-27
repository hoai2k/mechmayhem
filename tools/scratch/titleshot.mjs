// The title screen at 1600x900, art loaded: node tools/scratch/titleshot.mjs out.png
import { launch } from '../lib/browser.mjs';
const [out = 'title.png'] = process.argv.slice(2);
const browser = await launch({ gl: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5173/?music=0', { waitUntil: 'load' });
await page.waitForTimeout(15000);
await page.screenshot({ path: out, ...(/\.jpe?g$/.test(out) ? { type: 'jpeg', quality: 84 } : {}) });
await browser.close();
