// Why is he off the ground? Per-frame trace of the floor guard's own loop:
// what it measures, what it asks for, and where the body actually ends up.
// usage: node tools/scratch/floatdiag.mjs <mech> [waitMs]
import { launch } from '../lib/browser.mjs';

const [mech = 'tritone', waitMs = '30000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=titanus`, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, F = window.__fighters;
  const [p, t] = F;
  window.__ais.length = 0; t.controlsLocked = true;
  const dt = 1 / 60;
  p.pos.set(0, 0, 0); p.yaw = p.targetYaw = 0;
  t.pos.set(0, 0, 30);
  const rows = [];
  globalThis.__fgLog = [];
  for (let i = 0; i < 240; i++) {
    p.intent.moveZ = i > 30 ? 1 : 0;
    w.update(dt);
    if (i % 20 === 0) {
      const m = p.mech.lowestRenderedY(true);
      rows.push({
        i, state: p.state, grounded: p.grounded,
        posY: +p.pos.y.toFixed(2),
        lift: +(p._floorLift || 0).toFixed(2),
        containerY: +(p.mech.visual?.position.y ?? 0).toFixed(2),
        minY: +m.minY.toFixed(2), core: +m.minCore.toFixed(2),
        tail: Number.isFinite(m.minTail) ? +m.minTail.toFixed(2) : null,
        clip: p.animator?.cur?.name || null,
      });
    }
  }
  return { scale: +p.scale.toFixed(2), rows, fg: globalThis.__fgLog.slice(150, 172) };
});
console.log('scale', out.scale);
for (const r of out.rows) console.log(JSON.stringify(r));
console.log('--- inside the guard ---');
for (const r of out.fg) console.log(JSON.stringify(r));
await browser.close();
