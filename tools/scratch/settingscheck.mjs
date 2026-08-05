// Open the title screen, open SETTINGS, screenshot the modal; also assert the
// ?procedural=1 → 'fallback' and ?design= mappings in CONFIG.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);
await page.click('#settings-btn').catch(async () => {
  await page.evaluate(() => document.querySelector('#settings-btn')?.click());
});
await page.waitForTimeout(1500);
await page.screenshot({ path: process.argv[2] });
for (const [q, want] of [['?procedural=1', 'fallback'], ['?design=circuit', 'circuit'], ['', 'authored']]) {
  const p2 = await browser.newPage();
  await p2.goto('http://localhost:5173/' + q, { waitUntil: 'domcontentloaded' });
  const got = await p2.evaluate(async () => (await import('/src/core/config.js')).CONFIG.arenaDesign);
  console.log(`${q || '(none)'} -> ${got} ${got === want ? 'OK' : 'WANT ' + want}`);
  await p2.close();
}
await browser.close();
