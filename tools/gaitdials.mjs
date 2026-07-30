// GAIT DIAL RELEVANCE — which of the gait table's dials can actually move THIS
// mech, and which are dead weight on its panel.
//
//   node tools/gaitdials.mjs <mech> [throttle]
//   node tools/gaitdials.mjs fenrir 1
//
// A gait is one table shared by every mech that names it, but a gait is not one
// pass. Fenrir's gallop layer OVERWRITES both arms outright once the blend is
// full (~75% throttle and up), so every `arms.*` dial in the panel is a slider
// that cannot move him however far you drag it — while the same rows are live
// on titanus. The `*Run` twins are the same story from the other end: they are
// multiplied by the speed ratio, so at a standstill none of them do anything.
//
// The gait workbench measures this and hides what is dead (see scanEffects in
// workbench/tools/gait.js); this is the same measurement on the command line, so
// "why does this slider do nothing" has an answer that is not a screenshot.
//
// EFFECT is the largest joint movement, in degrees, that the dial can produce
// anywhere in the cycle when swept across its whole range. Under ~0.25° it
// counts as inert, and the BAND column says where in the throttle range it does
// work — that is the useful half of "does nothing".
import { chromium } from 'playwright-core';

const mech = process.argv[2] || 'titanus';
const throttle = process.argv[3] ?? '1';
const base = process.env.RW_URL || 'http://localhost:5173';
const url = `${base}/workbench/?edit=gait&mech=${mech}&throttle=${throttle}&compare=0`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 320 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.__gaitWork?.animator', null, { timeout: 90000 });
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  const w = window.__gaitWork;
  w.scanEffects();
  const R2D = 180 / Math.PI;
  return {
    gaitId: w.gaitId,
    dials: w.dials().map((d) => ({
      ...d, effect: +(w.effect(d.group, d.key) * R2D).toFixed(2),
    })),
  };
});
await browser.close();
if (errs.length) console.error(errs.join('\n'));

const pct = (v) => `${Math.round(v * 100)}%`;
console.log(`${mech} — gait '${out.gaitId}' at throttle ${pct(Number(throttle))}\n`);
const live = out.dials.filter((d) => !d.inert);
const dead = out.dials.filter((d) => d.inert);
console.log(`  LIVE (${live.length}) — moves this body here`);
for (const d of live) console.log(`    ${`${d.group}.${d.key}`.padEnd(22)} ${String(d.effect).padStart(8)}°`);
console.log(`\n  INERT (${dead.length}) — hidden in the workbench`);
for (const d of dead) {
  const band = d.band
    ? (d.band.lo <= 0.001 && d.band.hi >= 0.999 ? 'never at this throttle'
      : d.band.lo <= 0.001 ? `works below ${pct(d.band.hi + 0.05)}`
        : d.band.hi >= 0.999 ? `works above ${pct(d.band.lo - 0.05)}`
          : `works ${pct(d.band.lo - 0.05)}–${pct(d.band.hi + 0.05)}`)
    : 'nothing it touches survives to the final pose';
  console.log(`    ${`${d.group}.${d.key}`.padEnd(22)} ${String(d.effect).padStart(8)}°   ${band}`);
}
