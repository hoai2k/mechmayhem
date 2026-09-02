// CAN THIS MECH ACTUALLY WIN? A headless 1v1 bench: two ACE AI fighters, N
// matches, no rendering and no match/HUD layer — just the AI controllers and
// the world, stepped at a fixed 1/60.
//
//   node tools/scratch/arena1v1.mjs <mech> [opponent] [matches] [arena]
//
// Prints one line per match and a summary: wins, average time to kill, and the
// average HP fraction the winner had left (how COMFORTABLE the win was, which
// separates "wins narrowly" from "walks it").
import { launch } from '../lib/browser.mjs';
const [mech = 'tempest', foe = 'titanus', nArg = '6', arena = 'neon'] = process.argv.slice(2);
const N = Number(nArg) || 6;
const b = await launch();
const p = await b.newPage({ viewport: { width: 320, height: 240 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await p.goto(`http://localhost:5173/?battle=${arena}&p1=${mech}&p2=${foe}&auto=1&diff=ace`,
  { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__ais?.length >= 2 && window.__fighters?.length >= 2, null, { timeout: 150000 });
await p.waitForTimeout(6000);

const out = await p.evaluate(({ N }) => {
  const w = window.__world, ais = window.__ais;
  const [a, c] = window.__fighters;
  // resetForRound is the game's OWN between-rounds reset — every field a death
  // touches, in one place that cannot drift from what a real round does.
  const reset = (f, x, z, yaw) => {
    f.resetForRound(new window.__THREE.Vector3(x, 0, z), yaw);
    f.controlsLocked = false;
    f.animator.action = null;
  };
  const rows = [];
  for (let m = 0; m < N; m++) {
    // alternate who starts on which side, so a spawn advantage cannot favour
    // one mech across the whole run
    const s = m % 2 === 0 ? 1 : -1;
    reset(a, 0, -14 * s, s > 0 ? 0 : Math.PI);
    reset(c, 0, 14 * s, s > 0 ? Math.PI : 0);
    let t = 0, winner = null;
    const MAX = 90;
    while (t < MAX) {
      for (const ai of ais) ai.update(1 / 60);
      w.update(1 / 60);
      t += 1 / 60;
      if (!a.alive || !c.alive) break;
    }
    if (!c.alive && a.alive) winner = 'A';
    else if (!a.alive && c.alive) winner = 'B';
    rows.push({ m, winner, t: +t.toFixed(1),
      aHp: +(a.hp / a.maxHp).toFixed(2), bHp: +(c.hp / c.maxHp).toFixed(2) });
  }
  return { a: a.def.id, b: c.def.id, rows };
}, { N });
await b.close();

const wins = out.rows.filter((r) => r.winner === 'A').length;
const losses = out.rows.filter((r) => r.winner === 'B').length;
const draws = out.rows.length - wins - losses;
const kills = out.rows.filter((r) => r.winner);
const avgT = kills.length ? (kills.reduce((s, r) => s + r.t, 0) / kills.length).toFixed(1) : '-';
const margin = out.rows.reduce((s, r) => s + (r.aHp - r.bHp), 0) / out.rows.length;
for (const r of out.rows) {
  console.log(`  match ${r.m + 1}: ${r.winner === 'A' ? out.a.toUpperCase() : r.winner === 'B' ? out.b.toUpperCase() : 'draw'}`
    + `  ${r.t}s   ${out.a} ${(r.aHp * 100) | 0}%  ${out.b} ${(r.bHp * 100) | 0}%`);
}
console.log(`RESULT ${out.a} vs ${out.b}: ${wins}W ${losses}L ${draws}D`
  + `  avg kill ${avgT}s  hp margin ${(margin * 100).toFixed(0)}%`);
