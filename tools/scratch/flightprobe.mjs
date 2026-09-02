// THREE REPORTS, MEASURED ON BOTH BUILDS — the jets, the air tuck, and what
// a punch actually connects with.
//
// Point it at two servers (a git worktree of an older commit on another port)
// and the numbers say whether anything changed, instead of a reading of the
// diff saying it should not have:
//
//   node tools/scratch/flightprobe.mjs http://localhost:5173 http://localhost:5174
//
// Everything is driven through the REAL input path on a deterministically
// stepped sim, because all three reports are about what a BUTTON does.
import { launch } from '../lib/browser.mjs';

const URLS = process.argv.slice(2);
if (!URLS.length) URLS.push('http://localhost:5173');

const browser = await launch();

// One paused, deterministically stepped battle page.
async function open(base, url) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 160)));
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fighters?.length && window.__engine, null, { timeout: 180000 });
  await page.evaluate(() => {
    const e = window.__engine;
    e.paused = true;
    window.__sim = (n) => {
      for (let i = 0; i < n; i++) {
        let dt = (1 / 60) * e.timeScale;
        if (e.hitStop > 0) { e.hitStop -= 1 / 60; dt *= 0.05; }
        e.elapsed += dt; e.onUpdate(dt);
      }
    };
  });
  return page;
}

async function flight(base) {
  const page = await open(base, '/?battle=uptown&p1=viper&p2=titanus');
  await page.evaluate(() => {
    const [f, f2] = window.__fighters;
    if (f2) { f2.pos.set(300, 0, 300); f2.controlsLocked = true; }
    f.controlsLocked = false;
  });
  const sim = (n) => page.evaluate((n) => window.__sim(n), n);
  const read = (fn) => page.evaluate(fn);
  await sim(240);   // the intro runs out

  // ---------------------------------------------------------------- 1. JETS
  // Jump, then HOLD jump: ignite the jets and fly until the tank is dry.
  await page.evaluate(() => {
    const f = window.__fighters[0];
    f.setState('normal'); f.pos.set(0, 0, 0); f.vel.set(0, 0, 0);
    f.hoverFuel = f.hoverFuelMax; f.grounded = true;
  });
  const fuelMax = await read(() => +window.__fighters[0].hoverFuelMax.toFixed(3));
  await page.keyboard.down('Space');            // jump…
  await sim(4);
  await page.keyboard.up('Space');              // …release…
  await sim(2);
  await page.keyboard.down('Space');            // …and press again in the air: jets
  const jets = await page.evaluate(() => {
    const f = window.__fighters[0];
    let peak = 0, hoverFrames = 0, litAt = -1;
    for (let i = 0; i < 300; i++) {
      window.__sim(1);
      if (f.hovering) { hoverFrames++; if (litAt < 0) litAt = i; }
      peak = Math.max(peak, f.pos.y);
      if (f.grounded && i > 30) break;
    }
    return {
      peak: +peak.toFixed(2),
      hoverSeconds: +(hoverFrames / 60).toFixed(2),
      litAfter: litAt,
      fuelLeft: +f.hoverFuel.toFixed(3),
      rise: +f.hoverRise.toFixed(2),
    };
  });
  await page.keyboard.up('Space');
  await sim(60);

  // ------------------------------------------------------------ 2. AIR TUCK
  // Jump, then press BLOCK in the air: viper should curl into the somersault.
  async function tuck(tank) {
    await page.evaluate((tank) => {
      const f = window.__fighters[0];
      f.setState('normal'); f.pos.set(0, 0, 0); f.vel.set(0, 0, 0);
      f.grounded = true; f.hoverFuel = f.hoverFuelMax;
      f.sprintEnergy = tank * f.sprintEnergyMax;
      f._guardLock = false; f._airRoll = null; f._blockPrev = false;
    }, tank);
    await page.keyboard.down('Space'); await sim(3); await page.keyboard.up('Space');
    await sim(12);                                   // rising, off the ground
    const airborne = await read(() => !window.__fighters[0].grounded);
    await page.keyboard.down('KeyH');                // BLOCK (KB1)
    await sim(4);
    const out = await read(() => {
      const f = window.__fighters[0];
      return { rolled: !!f._airRoll, blocking: f.blocking, lock: !!f._guardLock,
        tank: +f.sprintEnergy.toFixed(3) };
    });
    await page.keyboard.up('KeyH');
    await sim(50);
    return { airborne, ...out };
  }
  const tuckFull = await tuck(1);
  const tuckLow = await tuck(0.02);       // almost nothing in the bar

  await page.close();
  return { jets: { ...jets, fuelMax }, tuckFull, tuckLow };
}

// ---------------------------------------------------------- 3. HITTING JERRY
// A real attacker, standing at arm's reach, swinging for real: does the melee
// sweep find a capsule on the victim? The attacker is VIPER on purpose — a
// punchHold mech (titanus, colossus) only COCKS the fist on doLight(). Reported beside the victim's own
// measured parts, since a missing capsule is what a miss would look like.
async function victim(base, vic) {
  const page = await open(base, `/?battle=uptown&p1=viper&p2=${vic}`);
  const sim = (n) => page.evaluate((n) => window.__sim(n), n);
  await page.evaluate(() => {
    const [f, j] = window.__fighters;
    f.controlsLocked = false; j.controlsLocked = true;
  });
  await sim(240);

  const shape = await page.evaluate(() => {
    const j = window.__fighters[1], w = window.__world;
    const hb = j.hurtbox;
    if (!hb) return { parts: 0, names: [], missing: ['(no hurtbox)'], h: 0 };
    hb.refresh(w.time);
    const names = hb.parts.map((p) => p.name);
    const want = ['pelvis', 'chest', 'head', 'thighL', 'thighR', 'handL', 'handR'];
    return {
      parts: hb.parts.length,
      names,
      missing: want.filter((n) => !hb.byName.get(n)),
      // total capsule volume, as a fraction of the body's own height cubed —
      // "how much of him is actually there to hit"
      vol: +(hb.parts.reduce((s, p) => s + p.r * p.r * p.r, 0) / Math.pow(j.height || 1, 3)).toFixed(4),
      h: +(j.height || 0).toFixed(2),
    };
  });

  // Stand the attacker in front of him at light-attack range and swing, over
  // a spread of distances, taking the best. A whiff at every distance is the
  // bug; a hit at the closest ones is a body you can reach.
  const swings = [];
  for (const d of [3, 4, 5, 6, 7, 8]) {
    const hit = await page.evaluate(async (d) => {
      const [f, j] = window.__fighters;
      f.setState('normal'); f.vel.set(0, 0, 0); f.pos.set(0, 0, 0); f.yaw = 0;
      j.setState('normal'); j.vel.set(0, 0, 0); j.pos.set(0, 0, d); j.yaw = Math.PI;
      j.hp = j.maxHp; f.attackCd = 0; f.iframes = 0; j.iframes = 0;
      const hp0 = j.hp;
      window.__sim(2);
      f.doLight();
      for (let i = 0; i < 90; i++) { window.__sim(1); if (j.hp < hp0) return true; }
      return false;
    }, d);
    swings.push(hit ? d : null);
  }
  await page.close();
  return { ...shape, hitAt: swings.filter(Boolean) };
}

for (const u of URLS) {
  console.log(`\n===== ${u}`);
  try {
    const r = await flight(u);
    console.log('  JETS    ', JSON.stringify(r.jets));
    console.log('  TUCK    full tank ', JSON.stringify(r.tuckFull));
    console.log('  TUCK    empty tank', JSON.stringify(r.tuckLow));
  } catch (e) {
    console.log('  FLIGHT FAILED', String(e).slice(0, 300));
  }
  for (const v of ['jerry', 'viper']) {
    try {
      const r = await victim(u, v);
      console.log(`  VICTIM ${v.padEnd(6)}`, `parts=${r.parts} h=${r.h} vol=${r.vol}`,
        `missing=${JSON.stringify(r.missing)} hitAt=${JSON.stringify(r.hitAt)}`);
      console.log(`          names=${r.names.join(',')}`);
    } catch (e) {
      console.log(`  VICTIM ${v} FAILED`, String(e).slice(0, 300));
    }
  }
}
await browser.close();
