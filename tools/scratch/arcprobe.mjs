// Does every taunt arc actually pass IN FRONT of tempest's chest? Wraps the
// lightning pool's spawn, records each arc's endpoints and its bow, and reports
// the path midpoint's distance along the mech's own facing (positive = front).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 520, height: 600 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto('http://localhost:5173/?battle=neon&p1=tempest&p2=titanus&auto=0', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await p.waitForTimeout(5000);
await p.evaluate(() => {
  const w = window.__world, f = w.fighters[0];
  w.fighters[1].pos.set(16, 0, 0); w.fighters[1].isAI = false;
  f.pos.set(0, 0, 0); f.yaw = 0;
  window.__arcs = [];
  const L = w.effects.lightning, orig = L.spawn.bind(L);
  L.spawn = (from, to, o = {}) => {
    if (o.bow) {
      const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
      const mid = { x: (from.x + to.x) / 2 + o.bow.x, z: (from.z + to.z) / 2 + o.bow.z };
      const ends = [from, to].map((e) => +((e.x - f.pos.x) * fx + (e.z - f.pos.z) * fz).toFixed(2));
      window.__arcs.push({ mid: +((mid.x - f.pos.x) * fx + (mid.z - f.pos.z) * fz).toFixed(2), ends });
    }
    return orig(from, to, o);
  };
  f.animator.play('taunt');
});
await p.waitForTimeout(3000);
const arcs = await p.evaluate(() => window.__arcs);
await p.screenshot({ path: process.argv[2] || '/tmp/arc.png' });
await b.close();
console.log(`${arcs.length} arcs`);
for (const a of arcs) console.log(`  mid ${a.mid}  ends ${a.ends.join(' / ')}`);
const bad = arcs.filter((a) => a.mid <= 0);
console.log(bad.length ? `FAIL: ${bad.length} arcs bow behind him` : 'all arcs pass in front');
