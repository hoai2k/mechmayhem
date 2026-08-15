// Drive the real menus to ARENA SELECT and shoot it.
import { chromium } from 'playwright-core';
const out = process.argv[2] || 'arena.png';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push('REQFAIL ' + r.url()));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
// title -> press any key; then walk forward with Enter until arena cards exist
for (let i = 0; i < 14; i++) {
  if (await page.locator('.arena-card').count() > 0) break;
  const cls = await page.evaluate(() => [...document.querySelectorAll('#ui-root .screen')]
    .map((e) => e.className + '|' + (e.querySelector('.screen-heading')?.textContent || '')).join(' ;; '));
  console.log(i, cls.slice(0, 160));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
}
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const s = [...document.querySelectorAll('#ui-root .screen')].pop();
  return s ? s.className + ' :: ' + s.innerHTML.slice(0, 300) : 'no screen';
}));
const n = await page.locator('.arena-card').count();
const imgs = await page.locator('.arena-card img.arena-art').count();
const canv = await page.locator('.arena-card canvas.arena-art').count();
console.log(`cards=${n} painted=${imgs} canvas=${canv}`);
await page.screenshot({ path: out });
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
