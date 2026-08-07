// DEATH SWARM, measured: does the ult run the TAUNT's apparition (grow, ghost,
// bats) and does the flock that follows actually hunt?
//   node tools/scratch/deathswarm.mjs [enemy]
import { chromium } from 'playwright-core';
const enemy = process.argv[2] || 'titanus';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await page.goto(`http://localhost:5173/?battle=neon&p1=wraith&p2=${enemy}&auto=1&diff=ace`, { waitUntil: 'networkidle' });
await page.waitForTimeout(26000);
const out = await page.evaluate(() => {
  const w = window.__world, f = w.fighters[0], e = w.fighters[1];
  window.__engine.paused = true;
  const s0 = f.scale;
  f.ult = 1; f.ultCharges = 1;
  f.doUlt();
  const diag = { justCast: f.animator?.action?.clip?.name, state: f.state, taunting: f.taunting() };
  w.update(1 / 60);
  diag.after1 = f.animator?.action?.clip?.name; diag.state1 = f.state; diag.k1 = f._growK;
  const rows = [];
  const hp0 = e.hp;
  let t = 0;
  const flock = () => w.scene.children.find((o) => o.isInstancedMesh && o.material?.uniforms?.uOpacity);
  for (let i = 0; i < 11 * 60; i++) {
    w.update(1 / 60); t += 1 / 60;
    if (i % 15 === 0) {
      const im = flock();
      rows.push({ t: +t.toFixed(2), grow: +(f.scale / s0).toFixed(2), k: +(f._growK ?? 0).toFixed(2),
        clip: f.animator?.action?.clip?.name || '-', bats: w.effects.bats.liveCount(),
        flock: im ? im.count : 0, op: im ? +im.material.uniforms.uOpacity.value.toFixed(2) : 0, dmg: +(hp0 - e.hp).toFixed(0) });
    }
  }
  return { rows, diag };
});
await b.close();
console.log(JSON.stringify(out.diag));
console.log('   t   grow    k   clip        poolBats  flock  dmg');
for (const r of out.rows) {
  console.log(`${String(r.t).padStart(5)} ${String(r.grow).padStart(5)} ${String(r.k).padStart(5)}  ${r.clip.padEnd(10)} ${String(r.bats).padStart(6)} ${String(r.flock).padStart(6)} ${String(r.op).padStart(5)} ${String(r.dmg).padStart(5)}`);
}
