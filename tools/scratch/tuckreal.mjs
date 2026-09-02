// THE AIR TUCK, AFTER A REAL APPROACH. The somersault is BLOCK's, and
// blocking is funded by the SHARED stamina tank that sprinting and dashing
// spend. So the question is not "does the tuck work" (it does, on a full
// bar) but "is there anything left in the bar by the time you are in the
// air" — which is how a player actually arrives there.
//
//   node tools/scratch/tuckreal.mjs http://localhost:5173 http://localhost:5174
import { launch } from '../lib/browser.mjs';

const URLS = process.argv.slice(2);
if (!URLS.length) URLS.push('http://localhost:5173');
const browser = await launch();

async function run(base) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 160)));
  await page.goto(`${base}/?battle=uptown&p1=viper&p2=titanus`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fighters?.length && window.__engine, null, { timeout: 180000 });
  await page.evaluate(() => {
    const e = window.__engine;
    e.paused = true;
    window.__sim = (n) => { for (let i = 0; i < n; i++) {
      let dt = (1 / 60) * e.timeScale;
      if (e.hitStop > 0) { e.hitStop -= 1 / 60; dt *= 0.05; }
      e.elapsed += dt; e.onUpdate(dt);
    } };
    const [f, f2] = window.__fighters;
    f2.pos.set(300, 0, 300); f2.controlsLocked = true;
    f.controlsLocked = false;
  });
  const sim = (n) => page.evaluate((n) => window.__sim(n), n);
  const read = (fn) => page.evaluate(fn);
  await sim(240);

  // A: run for `runS` seconds holding sprint, spending `dashes` dashes on the
  // way in, then jump and ask for the tuck — the ordinary way into the air.
  async function approach(runS, dashes) {
    await page.evaluate(() => {
      const f = window.__fighters[0];
      f.setState('normal'); f.pos.set(0, 0, 0); f.vel.set(0, 0, 0);
      f.grounded = true; f.sprintEnergy = f.sprintEnergyMax;
      f._guardLock = false; f._airRoll = null; f._blockPrev = false;
      f.dashCd = 0; f.hoverFuel = f.hoverFuelMax;
    });
    // DASH and SPRINT are the same button (KB1 ShiftLeft): a TAP is a dash,
    // a HOLD is a run. So the approach is some taps, then the hold.
    await page.keyboard.down('KeyW');                    // forward
    for (let i = 0; i < dashes; i++) {
      await page.keyboard.down('ShiftLeft'); await sim(2); await page.keyboard.up('ShiftLeft');
      await sim(Math.round(60 * 0.62));                  // clear the cooldown
    }
    await page.keyboard.down('ShiftLeft');               // …and run the rest in
    await sim(Math.round(60 * runS));
    await page.keyboard.up('ShiftLeft');
    const tank = await read(() => +window.__fighters[0].sprintEnergy.toFixed(3));
    const lock = await read(() => !!window.__fighters[0]._guardLock);
    // …into the air, and ask for the ball
    await page.keyboard.down('Space'); await sim(3); await page.keyboard.up('Space');
    await sim(12);
    await page.keyboard.down('KeyH');
    // Hold it and watch the ball: what the player SEES is how long he stays
    // curled and how far he turns, not whether the state existed for a frame.
    const out = await page.evaluate(() => {
      const f = window.__fighters[0];
      let frames = 0, spin = 0, ever = false;
      for (let i = 0; i < 240; i++) {
        window.__sim(1);
        if (f._airRoll) { ever = true; frames++; spin = f._airRoll.spin; }
        else if (ever) break;
        if (f.grounded && i > 4) break;
      }
      return { rolled: ever, ballSeconds: +(frames / 60).toFixed(2),
        turns: +(spin / (Math.PI * 2)).toFixed(2),
        lockNow: !!f._guardLock, tankNow: +f.sprintEnergy.toFixed(3) };
    });
    await page.keyboard.up('KeyH');
    await page.keyboard.up('KeyW');
    await sim(60);
    return { tankAtJump: tank, lockAtJump: lock, ...out };
  }

  const rows = [];
  for (const [runS, dashes] of [[0, 0], [2, 2], [4, 3], [6, 4], [8, 5]])
    rows.push([`run ${runS}s + ${dashes} dashes`, await approach(runS, dashes)]);

  // THE CASE THE APPROACHES ABOVE CANNOT REACH: a bar actually run to EMPTY.
  // That is what a guard held too long, or a fight's worth of dashing, leaves
  // behind — and it is the state the lockout governs.
  async function afterEmpty(regenS) {
    await page.evaluate(() => {
      const f = window.__fighters[0];
      f.setState('normal'); f.pos.set(0, 0, 0); f.vel.set(0, 0, 0);
      f.grounded = true; f.hoverFuel = f.hoverFuelMax;
      f.sprintEnergy = 0.04 * f.sprintEnergyMax;   // a sliver
      f._guardLock = false; f._airRoll = null; f._blockPrev = false;
    });
    // hold the guard on the ground until the tank gives out — the lock sets
    await page.keyboard.down('KeyH'); await sim(60); await page.keyboard.up('KeyH');
    const drained = await read(() => {
      const f = window.__fighters[0];
      return { lock: !!f._guardLock, tank: +f.sprintEnergy.toFixed(3) };
    });
    await sim(Math.round(60 * regenS));            // …stand and breathe
    await page.keyboard.down('Space'); await sim(3); await page.keyboard.up('Space');
    await sim(12);
    await page.keyboard.down('KeyH');
    const out = await page.evaluate(() => {
      const f = window.__fighters[0];
      let frames = 0, spin = 0, ever = false;
      for (let i = 0; i < 240; i++) {
        window.__sim(1);
        if (f._airRoll) { ever = true; frames++; spin = f._airRoll.spin; }
        else if (ever) break;
        if (f.grounded && i > 4) break;
      }
      return { rolled: ever, ballSeconds: +(frames / 60).toFixed(2),
        turns: +(spin / (Math.PI * 2)).toFixed(2),
        lockNow: !!f._guardLock, tankNow: +f.sprintEnergy.toFixed(3) };
    });
    await page.keyboard.up('KeyH'); await sim(60);
    return { tankAtJump: `${drained.tank}/lock:${drained.lock}`, ...out };
  }
  for (const g of [0, 0.5, 1, 2])
    rows.push([`bar run dry, +${g}s rest`, await afterEmpty(g)]);

  // THE CASE A PLAYER IS ACTUALLY IN: the jets are LIT. Being in the air on
  // purpose means holding A, so this — not a bare ballistic jump — is where
  // "press block in the air" gets pressed.
  async function whileFlying() {
    await page.evaluate(() => {
      const f = window.__fighters[0];
      f.setState('normal'); f.pos.set(0, 0, 0); f.vel.set(0, 0, 0);
      f.grounded = true; f.hoverFuel = f.hoverFuelMax;
      f.sprintEnergy = f.sprintEnergyMax;
      f._guardLock = false; f._airRoll = null; f._blockPrev = false;
    });
    await page.keyboard.down('Space'); await sim(4); await page.keyboard.up('Space');
    await sim(2);
    await page.keyboard.down('Space');            // …and again: jets on
    await sim(20);
    const flying = await read(() => window.__fighters[0].hovering);
    await page.keyboard.down('KeyH');             // block, jets still held
    const out = await page.evaluate(() => {
      const f = window.__fighters[0];
      let frames = 0, spin = 0, ever = false;
      for (let i = 0; i < 240; i++) {
        window.__sim(1);
        if (f._airRoll) { ever = true; frames++; spin = f._airRoll.spin; }
        else if (ever) break;
        if (f.grounded && i > 4) break;
      }
      return { rolled: ever, ballSeconds: +(frames / 60).toFixed(2),
        turns: +(spin / (Math.PI * 2)).toFixed(2),
        lockNow: !!f._guardLock, tankNow: +f.sprintEnergy.toFixed(3) };
    });
    await page.keyboard.up('KeyH'); await page.keyboard.up('Space'); await sim(60);
    return { tankAtJump: `jets:${flying}`, ...out };
  }
  rows.push(['BLOCK while jets lit', await whileFlying()]);
  await page.close();
  return rows;
}

for (const u of URLS) {
  console.log(`\n===== ${u}`);
  try {
    for (const [label, r] of await run(u))
      console.log(`  ${label.padEnd(22)} tank@jump=${String(r.tankAtJump).padEnd(6)} -> rolled=${String(r.rolled).padEnd(5)} ball=${String(r.ballSeconds).padEnd(5)}s turns=${String(r.turns).padEnd(5)} lockAfter=${String(r.lockNow).padEnd(5)} tankAfter=${r.tankNow}`);
  } catch (e) { console.log('  FAILED', String(e).slice(0, 300)); }
}
await browser.close();
