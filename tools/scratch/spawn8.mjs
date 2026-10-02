// EIGHT SPAWN PADS ON EVERY ARENA: builds each of the twelve arenas the way a
// match does (authored level where there is one) and asks for 8 spawn points.
// Fails if two pads are closer than two of the widest bodies on the roster
// (no robot may start inside another) or a pad sits inside a building/prop.
//   node tools/scratch/spawn8.mjs [baseUrl]
import { launch } from '../lib/browser.mjs';
const base = process.argv[2] || 'http://localhost:5173';
const b = await launch({ gl: false });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto(`${base}/?music=0`, { waitUntil: 'load' });
await p.waitForTimeout(3000);
const rows = await p.evaluate(async () => {
  const { THEMES } = await import('/src/arena/themes.js');
  const { resolveArenaTheme } = await import('/src/arena/authored.js');
  const { createBattle } = await import('/src/game/battle.js');
  const G = window.__game;
  const out = [];
  for (const th of THEMES) {
    const theme = await resolveArenaTheme(th);
    const { arena, world } = createBattle(G.engine, { theme, audio: G.audio, input: null, seed: 1234 });
    const pts = arena.spawnPoints(8);
    let minGap = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      minGap = Math.min(minGap, Math.hypot(world.wrapDelta(pts[i].pos.x - pts[j].pos.x), world.wrapDelta(pts[i].pos.z - pts[j].pos.z)));
    }
    // inside a building chunk or a prop body?
    let blocked = 0;
    for (const q of pts) {
      if (arena.propBodies?.some((pb) => pb.alive !== false && Math.hypot(world.wrapDelta(pb.x - q.pos.x), world.wrapDelta(pb.z - q.pos.z)) < pb.r)) { blocked++; continue; }
      for (const d of arena.destructoAll || []) {
        // the building's box is conservative (an L-shaped tower's box has air
        // in it); a pad inside one is reported and worth a look
        if (d.buildings?.some((bb) => bb.alive !== 0 && bb.aabb && q.pos.x > bb.aabb.minX && q.pos.x < bb.aabb.maxX && q.pos.z > bb.aabb.minZ && q.pos.z < bb.aabb.maxZ)) { blocked++; break; }
      }
    }
    out.push({ id: th.id, n: pts.length, minGap: +minGap.toFixed(1), blocked });
    world.dispose?.(); arena.dispose?.();
  }
  return out;
});
// the widest body on the roster is ~1.7 radius; two of them need 3.4 between centres
let fails = 0;
for (const r of rows) {
  const bad = r.n !== 8 || r.minGap < 3.5 || r.blocked;
  if (bad) fails++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${r.id.padEnd(11)} pads ${r.n}  closest pair ${String(r.minGap).padStart(5)}  inside something ${r.blocked}`);
}
if (errs.length) { console.log('PAGE ERRORS:', errs.join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILURES` : '\nEIGHT PADS ON EVERY ARENA ✓');
await b.close();
process.exit(fails ? 1 : 0);
