// Did the hand-made VFX sprites load? effects.js keeps per-slot outcomes in
// `spriteStatus` precisely so a silent fall back to the procedural textures
// can be seen. Every slot in the manifest must say "ok".
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await page.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world?.effects?.spriteStatus, null, { timeout: 90000 });
await page.waitForTimeout(2500);
const status = await page.evaluate(() => window.__world.effects.spriteStatus);
await browser.close();
const bad = Object.entries(status).filter(([, v]) => v !== 'ok');
for (const [k, v] of Object.entries(status)) console.log(`${v === 'ok' ? 'OK  ' : 'FAIL'} ${k.padEnd(9)} ${v}`);
if (errs.length) console.log('PAGE/CONSOLE ERRORS:\n' + errs.join('\n'));
console.log(bad.length ? `\n${bad.length} sprite slot(s) did not load.` : '\nEvery sprite slot loaded.');
process.exit(bad.length || errs.length ? 1 : 0);
