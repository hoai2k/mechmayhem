// Ghost Protocol still projects a spectre after the poseshell refactor.
//   node tools/scratch/ghostwalkcheck.mjs
import { launch } from '../lib/browser.mjs';
const b = await launch();
const page = await b.newPage({ viewport: { width: 420, height: 320 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?battle=neon&p1=wraith&p2=titanus&auto=0', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const w = window.__world, eng = window.__engine, THREE = window.__THREE;
  const f = w.fighters[0];
  window.__ais.length = 0; for (const x of w.fighters) { x.isAI = false; x.ai = null; }
  eng.paused = true; eng.onRender = null;
  f.pos.set(0, 0, 0); f.yaw = 0; f.specialCd = 0;
  const rows = [];
  const look = (label) => {
    let n = 0, box = null;
    w.scene.traverse((o) => {
      if (o.isGroup && o.children.some((c) => c.userData?.bakedGeo)) {
        n++; box = new THREE.Box3().setFromObject(o);
      }
    });
    rows.push({ label, spectres: n,
      h: box ? +(box.max.y - box.min.y).toFixed(2) : null,
      z: box ? +((box.max.z + box.min.z) / 2).toFixed(2) : null });
  };
  look('before');
  f.intent = { ...(f.intent || {}), special: true, specialHeld: true };
  f.doSpecial ? f.doSpecial() : null;
  eng.step(0.3); look('+0.3s');
  eng.step(0.6); look('+0.9s');
  eng.step(1.2); look('+2.1s');
  f.intent.specialHeld = false;
  eng.step(0.6); look('released +0.6s');
  eng.step(1.0); look('released +1.6s');
  return { rows, state: f.state };
});
await b.close();
for (const r of out.rows) {
  console.log(`  ${r.label.padEnd(16)} spectres ${r.spectres}`
    + (r.h !== null ? `  h=${r.h}  z=${r.z}` : ''));
}
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
