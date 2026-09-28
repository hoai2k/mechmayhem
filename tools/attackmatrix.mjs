// Attack-connect matrix: for every mech, force ranged / special / ult against
// a live circling victim and report damage actually dealt. Catches "projectile
// sails into the sky / lands where the target was" bugs.
//   node tools/attackmatrix.mjs [baseUrl] [id …] [--victim=<id>]
//     (default http://localhost:5173, the whole roster, victim titanus)
// Ults that are not direct attacks are exempt (expectZero, with the reason).
// DETERMINISTIC: Math.random is seeded at load AND reseeded at the start of
// every scenario (the battle runs in real time before the harness takes over,
// so how much of the sequence it has used varies run to run) — the same code
// gives the same numbers, and a FAIL is a real miss, not a bad roll.
import { launch, seedRandom } from './lib/browser.mjs';
import { ROSTER } from '../src/mechs/roster.js';

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith('--'));
const base = pos[0] || 'http://localhost:5173';
// the whole roster, from the roster (a hand-kept list had fallen three behind)
const MECHS = pos.length > 1 ? pos.slice(1) : ROSTER.map((d) => d.id);
// a FIXED victim: an unknown id (this used to name the retired 'aegis') makes
// battletest pick a random, unseeded mech, so no two runs were comparable
const VICTIM = (argv.find((a) => a.startsWith('--victim=')) || '--victim=titanus').slice(9);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

const rows = [];
await seedRandom(page);
// …and nothing runs in REAL TIME: the engine's frame loop is STOPPED the
// instant battletest publishes it, so the arena is untouched and the fighters
// unmoved when the harness starts stepping. Not merely paused — a paused
// engine still draws every eighth frame, and a draw refreshes the skinned
// bone matrices the hurtboxes are measured from, so how many draws happened
// before the harness began still moved the totals by ~1%.
await page.addInitScript(() => {
  let eng = null;
  Object.defineProperty(window, '__engine', {
    configurable: true,
    get: () => eng,
    set: (e) => { eng = e; if (e) e._running = false; },
  });
});
for (const id of MECHS) {
  await page.goto(`${base}/?battle=neon&p1=${id}&p2=${VICTIM}&auto=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__world && window.__fighters?.length >= 2, null, { timeout: 120000 });
  const r = await page.evaluate(() => {
    const w = window.__world, [atk, vic] = window.__fighters;
    const DT = 1 / 60;

    function clearIntents(f) {
      const I = f.intent;
      I.moveX = I.moveZ = 0;
      I.jump = I.light = I.heavy = I.ranged = I.special = I.ult = I.block = I.dash = I.taunt = false;
    }
    // every scenario starts from the same point in the same random sequence
    function reseed() {
      let s = 0x2f6e2b1;
      Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
    }
    function reset(dist) {
      reseed();
      atk.resetForRound(new (atk.pos.constructor)(0, 0, 0), 0);
      vic.resetForRound(new (vic.pos.constructor)(0, 0, dist), Math.PI);
      atk.yaw = atk.targetYaw = Math.atan2(vic.pos.x - atk.pos.x, vic.pos.z - atk.pos.z);
      clearIntents(atk);   // stale AI intents from the pre-eval battle
      clearIntents(vic);
      // the animators seed their gait phase and clock from Math.random when
      // they are built, after async loading has used an unknowable share of
      // the sequence — pin them, or the same swing lands on a different frame
      for (const f of [atk, vic]) { f.animator.phase = 0; f.animator.t = 0; }
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

// ULTS THAT ARE NOT DIRECT ATTACKS, each with the reason it cannot connect in
// this harness (7s, world stepped without the AI list, victim circling):
const expectZero = new Map([
  ['colossus:ult', 'COLOSSAL FORM is a size buff — the damage is whatever he does while giant'],
  ['saurion:ult', 'RAPTOR PACK summons raptors, and minions only fight when their AI runs'],
  ['inferno:ult', 'FIRE TORNADO is a hazard that hunts at 6.5 u/s — a circling mech outruns it'],
]);
let fails = 0;
for (const r of rows) {
  for (const cat of ['ranged', 'special', 'ult']) {
    if (expectZero.has(`${r.id}:${cat}`)) {
      if (r[cat] <= 0) console.log(`exempt: ${r.id} ${cat} — ${expectZero.get(`${r.id}:${cat}`)}`);
      continue;
    }
    if (r[cat] <= 0) { console.log(`FAIL: ${r.id} ${cat} dealt no damage`); fails++; }
  }
}
console.log(fails ? `\n${fails} FAILURES` : '\nALL CONNECT ✓');
if (errors.length) console.log('PAGE ERRORS:', errors.join('\n'));
await browser.close();
process.exit(fails ? 1 : 0);
