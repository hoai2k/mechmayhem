// WHERE DOES A SPECIAL ACTUALLY REACH? Fires it with the victim parked at a
// grid of (distance, bearing) offsets and reports whether they took damage.
//
//   node tools/scratch/specialmap.mjs tempest [victim]
//
// Bearing 0 is dead ahead of the caster, 90 is their right, 180 behind. The
// world is stepped at a fixed 1/60 so the answer does not depend on frame rate.
import { launch } from '../lib/browser.mjs';
const mech = process.argv[2] || 'tempest', foe = process.argv[3] || 'titanus';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=${foe}&auto=0`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await p.waitForTimeout(5000);

const res = await p.evaluate(() => {
  const w = window.__world, f = w.fighters[0], e = w.fighters[1];
  e.isAI = false; f.isAI = false;
  const zero = () => ({ moveX: 0, moveZ: 0, jump: false, dash: false, light: false,
    heavy: false, special: false, ult: false, ranged: false, block: false, taunt: false });
  const sp = f.def.moves.special;
  const dists = [2, 4, 6, 8, 10, 12, 14, 16, 18];
  const bearings = [0, 30, 60, 90, 135, 180];
  const grid = [];
  for (const bg of bearings) {
    const row = { bearing: bg, hits: [] };
    for (const d of dists) {
      f.pos.set(0, 0, 0); f.vel.set(0, 0, 0); f.yaw = f.targetYaw = 0;
      f.state = 'normal'; f.stateT = 0; f.specialCd = 0; f.animator.action = null;
      f.controlsLocked = false; f.hp = f.maxHp;
      const a = bg * Math.PI / 180;
      e.pos.set(Math.sin(a) * d, 0, Math.cos(a) * d);
      e.vel.set(0, 0, 0); e.hp = e.maxHp; e.state = 'normal'; e.stateT = 0;
      e.controlsLocked = false;
      const hp0 = e.hp;
      // capture what the special actually aimed at: the first ring it spawns is
      // drawn at the storm's centre
      let fired = null;
      const R = w.effects.rings, orig = R.spawn.bind(R);
      R.spawn = (pos, o) => { if (!fired) fired = { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), yaw: +(f.yaw * 180 / Math.PI).toFixed(0) }; return orig(pos, o); };
      Object.assign(f.intent, zero(), { special: true });
      w.update(1 / 60);
      Object.assign(f.intent, zero());
      for (let i = 0; i < 240; i++) {          // four seconds: cast + every bolt
        Object.assign(e.intent, zero());
        e.pos.set(Math.sin(a) * d, 0, Math.cos(a) * d);   // pinned: we are mapping GEOMETRY
        e.vel.set(0, 0, 0);
        w.update(1 / 60);
      }
      R.spawn = orig;
      row.hits.push(+(hp0 - e.hp).toFixed(0));
      if (bg === 90 || bg === 0) row.aim = (row.aim || []).concat([`d${d}:${fired ? fired.x + ',' + fired.z + ' yaw' + fired.yaw : 'NONE'}`]);
    }
    grid.push(row);
  }
  return { name: sp.name, id: sp.id, radius: sp.radius, dmg: sp.dmg, dists, grid };
});
await b.close();

console.log(`${mech} special "${res.name}" (${res.id}) — roster radius ${res.radius}, dmg ${res.dmg}`);
console.log('damage dealt, by victim position; bearing 0 = dead ahead\n');
console.log('bearing |' + res.dists.map((d) => String(d).padStart(5)).join(''));
console.log('--------+' + '-----'.repeat(res.dists.length));
for (const r of res.grid) {
  console.log(String(r.bearing).padStart(7) + ' |' + r.hits.map((h) => String(h || '.').padStart(5)).join(''));
}
for (const r of res.grid) if (r.aim) console.log(`\nbearing ${r.bearing} storm centre: ` + r.aim.join('  '));
