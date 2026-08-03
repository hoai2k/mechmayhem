// Does every taunt arc actually pass IN FRONT of tempest's chest?
//
// It wraps the lightning pool's spawn and reports, per arc, how far along his
// own facing the two ENDPOINTS sit and where the bowed path's MIDDLE ends up
// (positive = in front of him). A back-to-back pair — the two shoulder stacks —
// is the case the bow exists for.
//
// IT DRIVES arcTaunt DIRECTLY rather than letting the clip play, because under
// SwiftShader a 2.4s taunt is over in one or two frames and the sampler catches
// one arc or none — which is an empty set, not a pass. The animator is stepped
// to a given moment of the clip, and then the effect is ticked at a fixed 1/60
// with the pose held there, so the arcs measured are the arcs that moment emits.
import { chromium } from 'playwright-core';
const shot = process.argv[2] || '/tmp/arc.png';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 520, height: 600 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto('http://localhost:5173/?battle=neon&p1=tempest&p2=titanus&auto=0', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await p.waitForTimeout(5000);

const arcs = await p.evaluate(() => {
  const w = window.__world, f = w.fighters[0];
  w.fighters[1].pos.set(16, 0, 0); w.fighters[1].isAI = false;
  f.pos.set(0, 0, 0); f.yaw = 0;
  const out = [];
  const L = w.effects.lightning, orig = L.spawn.bind(L);
  L.spawn = (from, to, o = {}) => {
    if (o.bow) {
      const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
      const fwd = (x, z) => +((x - f.pos.x) * fx + (z - f.pos.z) * fz).toFixed(2);
      out.push({
        ends: [fwd(from.x, from.z), fwd(to.x, to.z)],
        mid: fwd((from.x + to.x) / 2 + o.bow.x, (from.z + to.z) / 2 + o.bow.z),
      });
    }
    return orig(from, to, o);
  };
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  // three moments of the clip — the arms move a long way through it, so the
  // endpoints the arcs hang off do too
  for (const at of [0.5, 1.3, 1.9]) {
    f.animator.action = null;
    f.animator.play('taunt');
    for (let i = 0; i < Math.round(at * 60); i++) f.animator.update(1 / 60, ctx);
    f.group.updateWorldMatrix(true, true);
    f._arcT = 0;
    for (let i = 0; i < 90; i++) f.arcTaunt(1 / 60);   // ~1.5s of emission, pose held
  }
  return out;
});
await p.screenshot({ path: shot });
await b.close();

console.log(`${arcs.length} arcs`);
for (const a of arcs) console.log(`  ends ${String(a.ends[0]).padStart(6)} /${String(a.ends[1]).padStart(6)}   mid ${a.mid}`);
const bad = arcs.filter((a) => a.mid <= 0);
const behind = arcs.filter((a) => a.ends[0] < 0 && a.ends[1] < 0);
console.log(`${behind.length} of them have BOTH endpoints behind him (the case the bow is for)`);
console.log(bad.length ? `FAIL: ${bad.length} arcs bow behind him` : 'PASS: every arc passes in front');
process.exit(arcs.length && !bad.length ? 0 : 1);
