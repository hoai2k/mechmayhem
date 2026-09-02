// SKY TERRACE'S DROP, on the clock: a robot stood on a `void` patch falls
// (controls locked, no ground clamp), and after the fall he is back on the
// spawn pad furthest from everyone else, lighter by 15% of his hp, with
// iframes. node tools/scratch/voidfall.mjs [mech]
//
// The patch is SYNTHETIC (pushed onto the live terrain) so the test does not
// depend on where the seed put the arena's own voids; those are counted and
// their distance from the plaza reported beside it.
import { launch } from '../lib/browser.mjs';

const mech = process.argv[2] || 'titanus';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto(`http://localhost:5173/?battle=skyterrace&p1=${mech}&p2=viper&auto=0`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, null, { timeout: 120000 });
await p.waitForTimeout(3000);

const r = await p.evaluate(() => {
  const w = window.__world, f = w.fighters[0], o = w.fighters[1];
  const terra = w.arena.terrain, DT = 1 / 60;
  o.isAI = false; o.intent.moveX = 0; o.intent.moveZ = 0;
  const voids = terra.patches.filter((q) => q.kind === 'void');
  const shipped = voids.map((q) => ({ r: +q.r.toFixed(1), fromCentre: +Math.hypot(q.x, q.z).toFixed(1) }));
  // the enemy stands on one spawn pad; the drop must put us on the OTHER one
  const pads = w.arena.spawnPoints(2);
  o.pos.copy(pads[0].pos);
  f.resetForRound(f.pos.clone().set(0, 0, 0), 0);
  f.controlsLocked = false;
  for (let i = 0; i < 30; i++) w.update(DT);
  const hp0 = f.hp;
  terra.patches.push({ kind: 'void', x: 60, z: 0, r: 8, hazard: 'void', lobes: [{ dx: 0, dz: 0, s: 1 }] });
  f.pos.set(60, 0, 0); f.vel.set(0, 0, 0);
  const trace = [];
  let fell = 0, back = -1, minY = 0, landed = null;
  for (let i = 0; i < 240; i++) {
    f.intent.moveX = 1;   // a held stick must NOT steer the fall
    w.update(DT);
    minY = Math.min(minY, f.pos.y);
    if (f._voidFall) fell++;
    if (back < 0 && fell && !f._voidFall) { back = i; landed = f.pos.clone(); }
    if (i % 6 === 0) trace.push({ t: +(i / 60).toFixed(2), y: +f.pos.y.toFixed(1), fall: !!f._voidFall, x: +f.pos.x.toFixed(1) });
    if (back >= 0 && i > back + 12) break;
  }
  terra.patches.pop();
  // measured where he CAME BACK, before the held stick walks him off the pad
  const at = landed || f.pos;
  const near = pads.map((q) => Math.hypot(q.pos.x - at.x, q.pos.z - at.z));
  return {
    shipped, hp0, hp1: f.hp, fellFrames: fell, minY: +minY.toFixed(1),
    landedPad: near.indexOf(Math.min(...near)), padDist: +Math.min(...near).toFixed(2),
    enemyPad: 0, iframes: +f.iframes.toFixed(2), grounded: f.grounded, trace,
  };
});
await b.close();
console.log(`${mech} on skyterrace — shipped void patches: ${r.shipped.length} ` +
  r.shipped.map((s) => `r${s.r}@${s.fromCentre}`).join(' '));
console.log(`fell for ${r.fellFrames} frames (${(r.fellFrames / 60).toFixed(2)}s), lowest y ${r.minY}`);
console.log(`hp ${r.hp0} -> ${r.hp1} (${(100 * (r.hp0 - r.hp1) / r.hp0).toFixed(1)}%), iframes ${r.iframes}, grounded ${r.grounded}`);
console.log(`landed on pad ${r.landedPad} (enemy on pad ${r.enemyPad}), ${r.padDist} off its centre`);
for (const t of r.trace) console.log(`  t=${t.t} x=${t.x} y=${t.y} ${t.fall ? 'FALLING' : ''}`);
const ok = r.fellFrames > 20 && r.minY < -5 && r.landedPad !== r.enemyPad && r.padDist < 1 &&
  Math.abs((r.hp0 - r.hp1) / r.hp0 - 0.15) < 0.01 && r.iframes > 0.9;
console.log(ok ? 'the drop works: OK' : 'FAIL');
process.exit(ok ? 0 : 1);
