// Does every mech's post-gait layer survive the relevance scan's decoy
// animator? A signature that throws is disabled for that body (the measurement
// falls back to the gait alone) and says so on the console — this catches that.
//   node tools/scratch/sigdecoy.mjs [mech …]
import { chromium } from 'playwright-core';

const ids = process.argv.slice(2);
const base = process.env.RW_URL || 'http://localhost:5173';
const list = ids.length ? ids : [
  'titanus', 'viper', 'vulcan', 'tempest', 'fenrir', 'colossus', 'wraith', 'inferno',
  'glacier', 'tide', 'saurion', 'frogger', 'jerry', 'cranky', 'konga', 'rhino',
  'nullbot', 'aegis', 'nova', 'tritone',
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
let bad = 0;
for (const mech of list) {
  const page = await browser.newPage({ viewport: { width: 420, height: 320 } });
  const msgs = [];
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') msgs.push(m.text()); });
  page.on('pageerror', (e) => msgs.push(`PAGEERROR ${e}`));
  try {
    await page.goto(`${base}/workbench/?edit=gait&mech=${mech}&throttle=1&compare=0`,
      { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('!!window.__gaitWork?.animator', null, { timeout: 90000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.__gaitWork.scanEffects(); });
    await page.waitForTimeout(300);
  } catch (e) { msgs.push(`HARNESS ${e}`); }
  const hits = msgs.filter((t) => /post-gait|PAGEERROR|HARNESS/.test(t));
  if (hits.length) { bad++; console.log(`FAIL ${mech}\n  ${hits.join('\n  ')}`); }
  else console.log(`ok   ${mech}`);
  await page.close();
}
await browser.close();
console.log(bad ? `\n${bad} body(ies) fell back to the gait alone` : '\nevery post-gait layer ran clean');
process.exit(bad ? 1 : 0);
