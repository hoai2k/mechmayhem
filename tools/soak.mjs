// Fast-forward logic soak: step world+AI synchronously, report errors/state.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
await page.goto(process.argv[2], { waitUntil: 'networkidle' });
// WAIT FOR THE WORLD, don't guess at it. A fixed pause was fine when an
// arena was procedural colour; a themed one now streams several MB of
// texture before it builds, and on SwiftShader that overran four seconds —
// which surfaced as `Cannot read properties of undefined (reading 'events')`
// and reads like a crash in the game rather than a harness that started early.
await page.waitForFunction(() => window.__world && window.__ais && window.__fighters,
  null, { timeout: 120000 });
await page.waitForTimeout(1500);
const result = await page.evaluate(() => {
  const w = window.__world, ais = window.__ais, fighters = window.__fighters;
  const log = [];
  let kos = 0;
  w.events.on('ko', (d) => { kos++; log.push(`KO: ${d.fighter.def.id} by ${d.attacker?.def?.id}`); });
  try {
    for (let i = 0; i < 7200; i++) {          // 120s of game time
      for (const ai of ais) ai.update(1 / 60);
      w.update(1 / 60);
      // force everyone's special/ult often to exercise all code paths
      if (i % 600 === 300) for (const f of fighters) { f.ult = 1; f.specialCd = 0; }
    }
  } catch (e) {
    return { crash: String(e.stack || e).slice(0, 800), log, kos };
  }
  return {
    crash: null, kos, log: log.slice(0, 12),
    fighters: fighters.map((f) => ({ id: f.def.id, hp: Math.round(f.hp), alive: f.alive, state: f.state })),
    projectiles: w.projectiles.active.length, tasks: w.tasks.length,
  };
});
console.log(JSON.stringify(result, null, 1));
if (errors.length) console.log('PAGE ERRORS:', errors.join('\n'));
await browser.close();
