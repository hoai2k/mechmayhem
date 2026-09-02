// GLACIER's freeze, on the clock: at each moment of the taunt, is the block
// there, is the body faded out, and is he still?
//
// Driven deterministically — the animator is stepped at a fixed 1/60 and
// iceTaunt is ticked with it — because under SwiftShader the clip is over in a
// couple of frames and a wall-clock screenshot lands wherever it likes.
import { launch } from '../lib/browser.mjs';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto('http://localhost:5173/?battle=neon&p1=glacier&p2=titanus&auto=0', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await p.waitForTimeout(5000);

const rows = await p.evaluate(() => {
  const w = window.__world, f = w.fighters[0];
  w.fighters[1].pos.set(18, 0, 0); w.fighters[1].isAI = false;
  f.pos.set(0, 0, 0); f.yaw = 0;
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const out = [];
  f.animator.action = null;
  f.animator.play('taunt');
  const dur = f.animator.action.clip.dur;
  // a joint that is easy to read and that the clip drives: the left elbow
  const el = () => (f.animator.cur.elbowL?.[0] ?? 0) * 180 / Math.PI;
  let prev = el();
  const steam = () => w.effects.smoke.liveCount() + w.effects.ice.liveCount();
  let before = steam();
  for (let i = 0; i < Math.round(dur * 60) + 30; i++) {
    const t = i / 60;
    f.animator.update(1 / 60, ctx);
    f.iceTaunt(1 / 60);
    w.effects.update(1 / 60);
    if (i % 6 === 0) {
      const now = el();
      out.push({ t: +t.toFixed(2), iceVis: !!f._ice?.visible, iceOp: +(f._ice?.material.opacity ?? 0).toFixed(2),
        k: +(f._iceK ?? 0).toFixed(2), move: +Math.abs(now - prev).toFixed(2), fog: steam() - before });
      prev = now; before = steam();
    }
  }
  return { dur, out };
});
await b.close();
console.log(`glacier taunt ${rows.dur}s\n t     block  opacity   k    jointmove/0.1s   new fog particles`);
for (const r of rows.out) {
  console.log(`${String(r.t).padEnd(5)} ${r.iceVis ? ' ICE ' : '  -  '}  ${String(r.iceOp).padStart(5)}  ${String(r.k).padStart(4)}   ${String(r.move).padStart(8)}        ${r.fog > 0 ? '+' + r.fog : ''}`);
}
