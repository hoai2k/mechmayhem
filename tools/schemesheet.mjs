// schemesheet: shoot one mech in several colour schemes from the same camera
// and stitch them into a single strip, so a recolor change can be judged at a
// glance. One browser for the whole run (SwiftShader boot is the slow part).
//   node tools/schemesheet.mjs <mechId> <out.png> [schemeIdxCsv] [waitMs]
import { launch } from './lib/browser.mjs';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const [id, out, list = '0,1,2,3', waitMs = '12000'] = process.argv.slice(2);
const schemes = list.split(',').map(Number);
const W = 480, H = 480;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const shots = [];
for (const c of schemes) {
  await page.goto(`http://localhost:5173/?showcase=${id}&anim=none&c=${c}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(Number(waitMs));
  shots.push(PNG.sync.read(await page.screenshot()));
}
await browser.close();

const sheet = new PNG({ width: W * shots.length, height: H });
shots.forEach((s, i) => PNG.bitblt(s, sheet, 0, 0, W, H, i * W, 0));
fs.writeFileSync(out, PNG.sync.write(sheet));
console.log(`${out}: ${id} schemes ${schemes.join(',')}`, errors.length ? '\nERRORS:\n' + errors.join('\n') : '');
