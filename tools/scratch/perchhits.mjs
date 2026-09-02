// SICKLE POUNCE, the ride: does every beat of the perch loop land a blow, and
// is the chip damage still what it was before the claws joined in?
//   node tools/scratch/perchhits.mjs [victim]
import { launch } from '../lib/browser.mjs';
const foe = process.argv[2] || 'titanus';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto(`http://localhost:5173/?battle=neon&p1=saurion&p2=${foe}&auto=0`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await p.waitForTimeout(6000);

const res = await p.evaluate(() => {
  const w = window.__world, f = w.fighters[0], e = w.fighters[1];
  e.isAI = false; f.isAI = false;
  const zero = () => ({ moveX: 0, moveZ: 0, jump: false, dash: false, light: false,
    heavy: false, special: false, ult: false, ranged: false, block: false, taunt: false });
  f.pos.set(0, 0, 0); f.vel.set(0, 0, 0); f.yaw = f.targetYaw = 0;
  f.state = 'normal'; f.stateT = 0; f.specialCd = 0; f.animator.action = null;
  e.pos.set(0, 0, 9); e.vel.set(0, 0, 0); e.hp = e.maxHp;
  Object.assign(f.intent, zero(), { special: true });
  w.update(1 / 60);
  Object.assign(f.intent, zero());
  const ticks = [];
  let hp = e.hp, t = 0;
  for (let i = 0; i < 200; i++) {
    Object.assign(e.intent, zero());
    e.vel.set(0, 0, 0);
    w.update(1 / 60); t += 1 / 60;
    if (e.hp < hp - 0.01) {
      ticks.push({ t: +t.toFixed(2), dmg: +(hp - e.hp).toFixed(1), clip: f.animator?.action?.clip?.name || '-' });
      hp = e.hp;
    }
  }
  return { ticks, total: +(e.maxHp - e.hp).toFixed(1), dmg: f.def.moves.special.dmg };
});
await b.close();
console.log(`sickle pounce (sp.dmg ${res.dmg}) — total ${res.total}`);
for (const k of res.ticks) console.log(`  t=${String(k.t).padStart(5)}  ${String(k.dmg).padStart(6)}  ${k.clip}`);
