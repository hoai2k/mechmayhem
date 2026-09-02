// ORBITAL'S LOW-GRAVITY PADS, measured: the same jump from pavement and from
// a `lowgrav` patch (apex height, hang time), and the cryo tank's blast
// freezing whoever it catches. node tools/scratch/lowgrav.mjs [mech]
import { launch } from '../lib/browser.mjs';

const mech = process.argv[2] || 'titanus';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto(`http://localhost:5173/?battle=orbital&p1=${mech}&p2=viper&auto=0`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, null, { timeout: 120000 });
await p.waitForTimeout(3000);

const r = await p.evaluate(() => {
  const w = window.__world, f = w.fighters[0], o = w.fighters[1];
  const terra = w.arena.terrain, DT = 1 / 60;
  o.isAI = false; o.pos.set(200, 0, 200);
  const pads = terra.patches.filter((q) => q.kind === 'lowgrav');
  const shipped = pads.map((q) => ({ r: +q.r.toFixed(1), fromCentre: +Math.hypot(q.x, q.z).toFixed(1) }));
  const jump = (x) => {
    f.resetForRound(f.pos.clone().set(x, 0, 0), 0);
    f.controlsLocked = false;
    for (let i = 0; i < 30; i++) w.update(DT);
    f.intent.jump = true; w.update(DT); f.intent.jump = false;
    // a spring-loader winds up first
    let apex = 0, n = 0, air = 0;
    for (n = 0; n < 400; n++) {
      w.update(DT);
      apex = Math.max(apex, f.pos.y);
      if (!f.grounded) air++;
      if (air > 3 && f.grounded) break;
    }
    return { apex: +apex.toFixed(2), hang: +(air / 60).toFixed(2), gravMul: f._gravMul, jumpMul: f._jumpMul };
  };
  const pave = jump(0);
  terra.patches.push({ kind: 'lowgrav', x: 60, z: 0, r: 30, hazard: 'lowgrav', lobes: [{ dx: 0, dz: 0, s: 1 }] });
  const low = jump(60);
  terra.patches.pop();
  // cryo tank: stand next to one and set it off
  const cryo = w.arena.explosives.find((e) => e.name === 'cryoTank' && !e.dead);
  let freeze = null;
  if (cryo) {
    f.resetForRound(f.pos.clone().set(cryo.x + 3, 0, cryo.z), 0);
    f.controlsLocked = false; f.iframes = 0;
    for (let i = 0; i < 10; i++) w.update(DT);
    const hp0 = f.hp;
    w.arena.detonateExplosive(cryo);
    w.update(DT);
    freeze = { state: f.state, frozenT: +(f.status.frozen?.t ?? 0).toFixed(2), dmg: +(hp0 - f.hp).toFixed(1) };
  }
  return { shipped, pave, low, cryo: !!cryo, freeze, names: [...new Set(w.arena.explosives.map((e) => e.name))] };
});
await b.close();
console.log(`${mech} on orbital — shipped lowgrav pads: ${r.shipped.length} ` +
  r.shipped.map((s) => `r${s.r}@${s.fromCentre}`).join(' '));
console.log(`jump on pavement: apex ${r.pave.apex}  hang ${r.pave.hang}s  (gravMul ${r.pave.gravMul}, jumpMul ${r.pave.jumpMul})`);
console.log(`jump on lowgrav:  apex ${r.low.apex}  hang ${r.low.hang}s  (gravMul ${r.low.gravMul}, jumpMul ${r.low.jumpMul})`);
console.log(`explosives on deck: ${r.names.join(', ')}`);
if (r.freeze) console.log(`cryo tank blast: state ${r.freeze.state}, frozen ${r.freeze.frozenT}s, dmg ${r.freeze.dmg}`);
else console.log('no live cryoTank on this seed');
// jump x1.3 under gravity x0.45: apex scales by 1.3^2/0.45 = 3.76
const ok = r.low.apex > r.pave.apex * 3 && r.low.hang > r.pave.hang * 2 &&
  (!r.cryo || (r.freeze.state === 'frozen' && r.freeze.frozenT > 0.5));
console.log(ok ? 'low gravity + cryo freeze: OK' : 'FAIL');
process.exit(ok ? 0 : 1);
