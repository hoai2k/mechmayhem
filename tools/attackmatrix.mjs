// Attack-connect matrix: for every mech, force ranged / special / ult against
// a live circling victim and report damage actually dealt. Catches "projectile
// sails into the sky / lands where the target was" bugs.
//   node tools/attackmatrix.mjs [baseUrl]        (default http://localhost:5173)
// Non-damaging by design: fenrir ult (buff — damage only lands if the
// victim is close when the spin triggers).
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5173';
const MECHS = ['titanus', 'vulcan', 'viper', 'rhino',
  'tempest', 'fenrir', 'colossus', 'wraith', 'inferno', 'glacier',
  'cranky', 'saurion', 'frogger', 'jerry'];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

const rows = [];
for (const id of MECHS) {
  await page.goto(`${base}/?battle=neon&p1=${id}&p2=aegis&auto=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const w = window.__world, [atk, vic] = window.__fighters;
    const DT = 1 / 60;

    function clearIntents(f) {
      const I = f.intent;
      I.moveX = I.moveZ = 0;
      I.jump = I.light = I.heavy = I.ranged = I.special = I.ult = I.block = I.dash = I.taunt = false;
    }
    function reset(dist) {
      atk.resetForRound(new (atk.pos.constructor)(0, 0, 0), 0);
      vic.resetForRound(new (vic.pos.constructor)(0, 0, dist), Math.PI);
      atk.yaw = atk.targetYaw = Math.atan2(vic.pos.x - atk.pos.x, vic.pos.z - atk.pos.z);
      clearIntents(atk);   // stale AI intents from the pre-eval battle
      clearIntents(vic);
      w.clearTransient();
    }
    function step(secs, drive, motion = 'strafe') {
      for (let i = 0; i < secs * 60; i++) {
        const dx = vic.pos.x - atk.pos.x, dz = vic.pos.z - atk.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        if (motion === 'strafe') {
          // victim circles — homing/AoE must still connect
          vic.intent.moveX = (-dz / len) * 0.8;
          vic.intent.moveZ = (dx / len) * 0.8;
        } else {
          // victim closes in without dodging — direct fire is skill-aimed
          // now (no auto-aim), so we test aim correctness, not tracking
          const dir = len > 8 ? -0.5 : 0;
          vic.intent.moveX = (dx / len) * dir;
          vic.intent.moveZ = (dz / len) * dir;
        }
        vic.intent.block = false;
        drive?.(i);
        w.update(DT);
      }
    }
    function dmgDone() { return Math.round(vic.maxHp - vic.hp); }

    const out = {};
    // ranged for 4s at weapon-appropriate distance (flame is a short cone)
    reset(['flame', 'hose'].includes(atk.def.moves.ranged.type) ? 8 : 18);
    step(4, () => { atk.intent.ranged = true; }, 'approach');
    out.ranged = dmgDone();
    // special at close + mid range, take the better connect
    const spDmg = [];
    for (const d of [6, 14]) {
      reset(d);
      atk.specialCd = 0;
      let fired = false;
      step(6, () => {
        atk.intent.special = !fired && atk.canAct() ? (fired = true) : false;
      });
      spDmg.push(dmgDone());
    }
    out.special = Math.max(...spDmg);
    // ult at close + mid
    const uDmg = [];
    for (const d of [6, 14]) {
      reset(d);
      atk.ult = 1;
      let fired = false;
      step(7, () => {
        atk.intent.ult = !fired && atk.canAct() ? (fired = true) : false;
      });
      uDmg.push(dmgDone());
    }
    out.ult = Math.max(...uDmg);
    return out;
  });
  rows.push({ id, ...r });
  console.log(`${id.padEnd(9)} ranged:${String(r.ranged).padStart(4)}  special:${String(r.special).padStart(4)}  ult:${String(r.ult).padStart(4)}`);
}

const expectZero = new Set(); // every kit deals damage now (wraith ghost-walk included)
let fails = 0;
for (const r of rows) {
  for (const cat of ['ranged', 'special', 'ult']) {
    if (expectZero.has(`${r.id}:${cat}`)) continue;
    if (r[cat] <= 0) { console.log(`FAIL: ${r.id} ${cat} dealt no damage`); fails++; }
  }
}
console.log(fails ? `\n${fails} FAILURES` : '\nALL CONNECT ✓');
if (errors.length) console.log('PAGE ERRORS:', errors.join('\n'));
await browser.close();
process.exit(fails ? 1 : 0);
