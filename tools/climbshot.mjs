// WALL CLIMB — the pictures. Parks a climbing mech at the tallest building in
// an arena, holds the stick into it, and captures the frames worth looking at:
// the body damped onto the face, the haul over the lip, the rooftop crouch.
//
//   node tools/climbshot.mjs <out-prefix> [battle url]
//
// The engine is left RUNNING (not engine.paused + step): a paused page only
// presents every eighth frame, and under SwiftShader that starves
// page.screenshot's wait-for-a-fresh-frame until it times out. Instead the AI
// is taken off P1 and its intent object is written ONCE — nothing else touches
// it, so the hold persists across frames — and the tool just watches.
import { chromium } from 'playwright-core';

const out = process.argv[2] || 'climb';
const url = process.argv[3] ||
  'http://localhost:5173/?battle=neon&p1=jerry&p2=viper&auto=1';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 760, height: 430 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

const top = await page.evaluate(() => {
  const w = window.__world;
  window.__ais.length = 0;              // nobody else drives P1
  const [j, v] = window.__fighters;
  j.isAI = false;
  v.controlsLocked = true;              // the combined camera frames both
  let best = null;
  for (const b of w.arena.destructo.buildings) {
    if (b.alive <= 0) continue;
    if (!best || b.aabb.maxY > best.maxY) best = b.aabb;
  }
  j.pos.set((best.minX + best.maxX) / 2, 0, best.minZ - j.radius - 5);
  j.yaw = j.targetYaw = j.torsoYaw = 0;
  v.pos.set(j.pos.x + 7, 0, j.pos.z - 5);
  Object.assign(j.intent, { moveX: 0, moveZ: 1, jump: false, jumpHeld: false });
  return +best.maxY.toFixed(1);
});
console.log('tallest face:', top);

async function shoot(name, cond, waitMs = 90000) {
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < waitMs) {
    state = await page.evaluate((c) => {
      const f = window.__fighters[0];
      f.intent.moveZ = 1; f.intent.moveX = 0; f.intent.jump = false;
      return new Function('f', `return (${c});`)(f)
        ? { hit: true, y: +f.pos.y.toFixed(1), tilt: +(f._climbTilt || 0).toFixed(2) }
        : { hit: false, y: +f.pos.y.toFixed(1), tilt: +(f._climbTilt || 0).toFixed(2) };
    }, cond);
    if (state.hit) break;
    await page.waitForTimeout(250);
  }
  if (!state?.hit) { console.log(`${name}: never happened (y=${state?.y})`); return; }
  await page.screenshot({ path: `${out}-${name}.png`, timeout: 120000 });
  console.log(`${name}: y=${state.y} tilt=${state.tilt} -> ${out}-${name}.png`);
}

await shoot('wall', 'f.climb && f._climbTilt > 0.9');
await shoot('lip', 'f.climb && f._climbTilt > 0.25 && f._climbTilt < 0.8 && f.pos.y > 8');

if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
