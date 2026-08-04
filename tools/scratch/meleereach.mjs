// HOW FAR DOES A MELEE SWING ACTUALLY REACH? Pins the victim at increasing
// distance dead ahead and forces a light (then a heavy), reporting the last
// distance that still connects.
//
//   node tools/scratch/meleereach.mjs <mech> [victim]
//
// `range` in the roster is not the reach — it feeds the swing capsule's radius
// and how far past the fist it extends (Fighter.strikeVolume), while the hit
// itself is the swept LIMB against the victim's hurtbox. So the only way to
// know what a number buys is to measure the swing.
import { chromium } from 'playwright-core';
const mech = process.argv[2] || 'cranky', foe = process.argv[3] || 'titanus';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 320, height: 240 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await p.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=${foe}&auto=0`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__fighters?.length >= 2, null, { timeout: 150000 });
await p.waitForTimeout(5000);

const res = await p.evaluate(() => {
  const w = window.__world, [f, e] = window.__fighters;
  f.isAI = e.isAI = false;
  const zero = () => ({ moveX: 0, moveZ: 0, jump: false, dash: false, light: false,
    heavy: false, special: false, ult: false, ranged: false, block: false, taunt: false });
  const probe = (kind, d) => {
    f.pos.set(0, 0, 0); f.vel.set(0, 0, 0); f.yaw = f.targetYaw = f.torsoYaw = 0;
    f.setState('normal', 0); f.animator.action = null; f.comboIdx = 0; f.comboWindow = 0;
    f.controlsLocked = false; f.hp = f.maxHp;
    e.pos.set(0, 0, d); e.vel.set(0, 0, 0); e.yaw = Math.PI;
    e.setState('normal', 0); e.hp = e.maxHp; e.controlsLocked = false; e.blocking = false;
    const hp0 = e.hp;
    Object.assign(f.intent, zero(), { [kind]: true });
    w.update(1 / 60);
    Object.assign(f.intent, zero());
    for (let i = 0; i < 110; i++) {
      Object.assign(e.intent, zero());
      e.pos.set(0, 0, d); e.vel.set(0, 0, 0);   // pinned: measuring GEOMETRY
      w.update(1 / 60);
    }
    return hp0 - e.hp > 0.5;
  };
  const sweep = (kind) => {
    let last = 0;
    for (let d = 2; d <= 12; d += 0.25) if (probe(kind, d)) last = d;
    return last;
  };
  return {
    id: f.def.id, scale: +f.scale.toFixed(2), radius: +f.radius.toFixed(2),
    foeRadius: +e.radius.toFixed(2),
    lightRange: f.def.moves.light.range, heavyRange: f.def.moves.heavy.range,
    light: sweep('light'), heavy: sweep('heavy'),
  };
});
await b.close();
const gap = (r) => +(r - res.radius - res.foeRadius).toFixed(2);
console.log(`${res.id}: scale ${res.scale}, own radius ${res.radius}, victim radius ${res.foeRadius}`);
console.log(`  roster light.range ${res.lightRange} -> connects out to ${res.light}  (clear air past the two bodies: ${gap(res.light)})`);
console.log(`  roster heavy.range ${res.heavyRange} -> connects out to ${res.heavy}  (clear air: ${gap(res.heavy)})`);
