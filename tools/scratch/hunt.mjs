// WILD HUNT, measured: where the pack spawns, whether it closes on the enemy,
// and the two lifetimes (a wolf that has bitten leaves at `duration`, one that
// has not keeps hunting to `huntMax`).
//   node tools/scratch/hunt.mjs [enemy]
import { chromium } from 'playwright-core';
const enemy = process.argv[2] || 'titanus';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await page.goto(`http://localhost:5173/?battle=neon&p1=fenrir&p2=${enemy}&auto=1&diff=ace`, { waitUntil: 'networkidle' });
await page.waitForTimeout(26000);
const res = await page.evaluate(() => {
  const w = window.__world, f = w.fighters[0], e = w.fighters[1];
  window.__engine.paused = true;
  f.ult = 1; f.ultCharges = 1;
  const cast = f.doUlt();
  const diag = { cast, state: f.state, ult: f.ult, id: f.def.moves.ult.id };
  const rows = [];
  const shells = () => w.scene.children.filter((o) => o.userData?.wildHunt);
  let t = 0;
  const hp0 = e.hp;
  for (let i = 0; i < 12 * 60 + 60; i++) {
    w.update(1 / 60); t += 1 / 60;
    if (i % 30 === 0) {
      const s = shells();
      const d = s.map((g) => Math.hypot(w.wrapDelta(g.position.x - e.pos.x), w.wrapDelta(g.position.z - e.pos.z)));
      rows.push({ t: +t.toFixed(1), wolves: s.length,
        near: d.length ? +Math.min(...d).toFixed(1) : null,
        mean: d.length ? +(d.reduce((a, v) => a + v, 0) / d.length).toFixed(1) : null,
        spread: d.length ? +Math.max(...d).toFixed(1) : null,
        dmg: +(hp0 - e.hp).toFixed(0) });
    }
  }
  return { rows, diag, kinds: w.scene.children.slice(-6).map((o) => o.type + ':' + o.children.length) };
});
await b.close();
console.log(JSON.stringify(res.diag), res.kinds.join(' '));
console.log('  t  wolves  nearest   mean   furthest  dmg   (distance from the enemy)');
for (const r of res.rows) {
  console.log(`${String(r.t).padStart(4)}  ${String(r.wolves).padStart(5)}  ${String(r.near).padStart(6)} ${String(r.mean).padStart(7)} ${String(r.spread).padStart(9)}  ${String(r.dmg).padStart(4)}`);
}
