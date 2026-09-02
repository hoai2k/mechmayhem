// SAURION'S CLUTCH, PACED — where does a frame go between the cast and the
// third hatchling? Steps the world by hand and reports every frame over a
// threshold, with what happened on it (a body BUILT, an egg CRACKING, a raptor
// HATCHED), for a warm pool and again for a cold one.
//
// usage: node tools/scratch/eggpace.mjs [waitMs]
import { launch } from '../lib/browser.mjs';

const [waitMs = '25000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?battle=neon&p1=saurion&p2=titanus', { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, F = window.__fighters;
  const [s, foe] = F;
  const dt = 1 / 60;
  window.__ais.length = 0;
  foe.controlsLocked = true;
  const { prewarmSummons, clearSpares } = await import('/src/combat/specials.js');

  const reset = () => {
    w.eggs.clear();
    for (const f of w.fighters.slice(2)) { w.scene.remove(f.group); }
    w.minions.length = 0;
    w.fighters.length = 2;
    s.pos.set(0, 0, 0); s.yaw = s.targetYaw = 0; s.vel.set(0, 0, 0);
    foe.pos.set(0, 0, 26); foe.vel.set(0, 0, 0);
    s.intent.moveX = s.intent.moveZ = 0;
  };

  const run = (label, warm) => {
    clearSpares(s);
    reset();
    if (warm) for (let i = 0; i < 8; i++) prewarmSummons(s, 1);
    const pool = () => (s._ultSpares?.length ?? 0);
    const poolBefore = pool();
    s.ult = 1; s.ultCharges = 1;
    const t0 = performance.now();
    s.doUlt();
    const castMs = +(performance.now() - t0).toFixed(2);
    const frames = [];
    const hatchTimes = [];
    let bodies = 0, lastMinions = 0;
    const buildTimes = [];
    for (let i = 0; i < 60 * 16; i++) {
      const before = w.eggs.eggs.filter((e) => e.body).length;
      const a = performance.now();
      w.update(dt);
      const ms = performance.now() - a;
      const built = w.eggs.eggs.filter((e) => e.body).length - before;
      if (w.minions.length > lastMinions) {
        hatchTimes.push(+(i / 60).toFixed(2));
        lastMinions = w.minions.length;
      }
      if (built > 0) { bodies += built; buildTimes.push(+(i / 60).toFixed(2)); }
      frames.push({ t: +(i / 60).toFixed(2), ms: +ms.toFixed(2), built });
    }
    const worst = frames.slice().sort((a, b) => b.ms - a.ms).slice(0, 6);
    return {
      label, poolBefore, castMs, bodiesBuiltDuringFight: bodies,
      buildTimes, hatchTimes, minions: w.minions.length,
      worstFrames: worst,
      over8ms: frames.filter((f) => f.ms > 8).map((f) => `${f.t}s ${f.ms}ms${f.built ? ' BUILD' : ''}`),
    };
  };

  const a = run('cast 1 (warm pool)', true);
  const b = run('cast 2 (warm pool)', true);
  const c = run('cast 3 (cold pool)', false);
  const d = run('cast 4 (warm pool)', true);
  return { a, b, c, d };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
