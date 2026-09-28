// FENRIR'S POUNCE LANDS WHERE IT IS AIMED: fire the special at a standing
// victim down the aim line (the leap clamps onto them), and at one off the
// line (the leap runs its full `leap`), and report how far he actually went
// against how far he meant to, plus the damage the landing did.
//   node tools/scratch/pounce.mjs [baseUrl]
// A leap onto a victim stops against their body, so it is judged against the
// distance less the two radii. Exits 1 if a leap lands under 85% of what it
// should cover or past 115% of its aim, or a leap onto a victim deals no damage.
import { launch, seedRandom } from '../lib/browser.mjs';

const base = process.argv[2] || 'http://localhost:5173';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

let fails = 0;
for (const auto of [0, 1]) {
  await seedRandom(page);
  await page.goto(`${base}/?battle=neon&p1=fenrir&p2=titanus${auto ? '&auto=1' : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__world && window.__fighters?.length >= 2, null, { timeout: 120000 });
  const rows = await page.evaluate(() => {
    const w = window.__world, [atk, vic] = window.__fighters;
    const clear = (f) => {
      const I = f.intent;
      I.moveX = I.moveZ = 0;
      I.jump = I.light = I.heavy = I.ranged = I.special = I.ult = I.block = I.dash = I.taunt = false;
    };
    const out = [];
    // [victim distance, victim bearing off the aim]: on the line clamps, off it runs full
    for (const [d, off] of [[6, 0], [10, 0], [13, 0], [30, 0], [10, 1.2]]) {
      atk.resetForRound(new (atk.pos.constructor)(0, 0, 0), 0);
      vic.resetForRound(new (vic.pos.constructor)(Math.sin(off) * d, 0, Math.cos(off) * d), Math.PI);
      atk.yaw = atk.targetYaw = 0;
      clear(atk); clear(vic);
      w.clearTransient();
      atk.specialCd = 0;
      const leap = atk.def.moves.special.leap;
      // the AI turns onto its victim, so for it nothing is off the line
      const want = off && !atk.isAI ? leap : Math.min(leap, d);
      // a leap onto a body stops at the body: up to the two radii short
      const contact = (off && !atk.isAI) || d > leap ? 0 : atk.radius + vic.radius;
      let fired = false, air = false, landedAt = null;
      for (let i = 0; i < 180 && !landedAt; i++) {
        clear(vic);
        atk.intent.special = !fired && atk.canAct() ? (fired = true) : false;
        w.update(1 / 60);
        atk.intent.special = false;
        if (fired && !atk.grounded) air = true;
        if (air && atk.grounded) landedAt = { x: atk.pos.x, z: atk.pos.z };
      }
      // let the landing's scheduled shockwave fire
      for (let i = 0; i < 20; i++) { clear(vic); w.update(1 / 60); }
      const went = landedAt ? Math.hypot(landedAt.x, landedAt.z) : 0;
      out.push({ d, off, want, contact, went, dmg: Math.round(vic.maxHp - vic.hp), ai: atk.isAI });
    }
    return out;
  });
  for (const r of rows) {
    // onto a victim: he lands against them (within the two radii) and hits
    const ratio = r.went / Math.max(0.1, r.want - r.contact);
    const bad = ratio < 0.85 || r.went > r.want * 1.15 || (r.contact > 0 && r.dmg <= 0);
    if (bad) fails++;
    console.log(`${r.ai ? 'AI   ' : 'human'} victim ${String(r.d).padStart(2)}u ${r.off ? 'off-line' : 'on-line '}` +
      `  wanted ${r.want.toFixed(1)}${r.contact ? ` (-${r.contact.toFixed(1)} contact)` : ''}  went ${r.went.toFixed(1)} (${(ratio * 100).toFixed(0)}%)  dmg ${r.dmg}${bad ? '  FAIL' : ''}`);
  }
}
if (errors.length) { console.log('PAGE ERRORS:', errors.join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILURES` : '\nPOUNCE LANDS ✓');
await browser.close();
process.exit(fails ? 1 : 0);
