// THE JETS OVER A FIGHT, NOT OVER ONE FLIGHT. A single flight off a full
// tank has never been the complaint — it is the SECOND one, and the fourth,
// that arrive as stubs, because fuel only regrows on the ground.
//
//   node tools/scratch/jetprobe.mjs [http://localhost:5173] [mech]
//
// Three readings, all driven through the real input path on a
// deterministically stepped sim:
//   BURST     four flights in a row with a fixed, realistic touchdown between
//             them — the shape a player flies in
//   AIRTIME   over a 20s window of "fly whenever the game lets me", the share
//             of the window actually spent under thrust
//   RELIGHT   how long on the ground before the jets will light at all
import { launch } from '../lib/browser.mjs';

const BASE = process.argv[2] || 'http://localhost:5173';
const MECH = process.argv[3] || 'viper';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 200)));
await page.goto(`${BASE}/?battle=uptown&p1=${MECH}&p2=titanus`, { waitUntil: 'domcontentloaded' });
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

const reset = () => page.evaluate(() => {
  const f = window.__fighters[0];
  f.setState('normal'); f.pos.set(0, 0, 0); f.vel.set(0, 0, 0);
  f.grounded = true; f.hoverFuel = f.hoverFuelMax; f._airRoll = null;
});

// One flight: jump, relight in the air, hold A until the thrust dies, and
// report what that flight was worth.
async function oneFlight(maxFrames = 400) {
  await page.keyboard.down('Space'); await sim(4); await page.keyboard.up('Space');
  await sim(2);
  await page.keyboard.down('Space');
  const r = await page.evaluate((maxFrames) => {
    const f = window.__fighters[0];
    let thrust = 0, peak = 0, air = 0;
    for (let i = 0; i < maxFrames; i++) {
      window.__sim(1);
      if (f.hovering) thrust++;
      if (!f.grounded) air++;
      peak = Math.max(peak, f.pos.y);
      if (f.grounded && i > 20) break;
    }
    return { thrust: +(thrust / 60).toFixed(2), air: +(air / 60).toFixed(2),
      peak: +peak.toFixed(1), fuel: +f.hoverFuel.toFixed(2) };
  }, maxFrames);
  await page.keyboard.up('Space');
  return r;
}

const out = { mech: MECH };
out.fuelMax = await read(() => +window.__fighters[0].hoverFuelMax.toFixed(2));

// ---- BURST: four flights, a fixed beat on the ground between them ----
for (const gap of [0.5, 1.5]) {
  await reset();
  const flights = [];
  for (let n = 0; n < 4; n++) {
    flights.push(await oneFlight());
    await sim(Math.round(60 * gap));           // the touchdown between flights
  }
  out[`burst@${gap}s`] = flights.map((f) => f.thrust);
  out[`peaks@${gap}s`] = flights.map((f) => f.peak);
}

// ---- AIRTIME: 20s of MASHING A to stay up as long as possible ----
// The relight wants an EDGE, which a held key cannot give twice, so this is
// tapped from outside the page exactly as a player mashing would.
await reset();
{
  let thrust = 0, frames = 0;
  while (frames < 1200) {
    await page.keyboard.down('Space');
    const r = await page.evaluate(() => {
      const f = window.__fighters[0];
      let t = 0;
      for (let i = 0; i < 10; i++) { window.__sim(1); if (f.hovering) t++; }
      return t;
    });
    thrust += r; frames += 10;
    await page.keyboard.up('Space');
    const r2 = await page.evaluate(() => {
      const f = window.__fighters[0];
      let t = 0;
      for (let i = 0; i < 2; i++) { window.__sim(1); if (f.hovering) t++; }
      return t;
    });
    thrust += r2; frames += 2;
  }
  out.mashThrust20s = +(thrust / 60).toFixed(2);
  out.mashHeightEnd = await read(() => +window.__fighters[0].pos.y.toFixed(1));
}

// ---- RELIGHT: from a dry tank, how long on the ground before A works ----
await page.evaluate(() => {
  const f = window.__fighters[0];
  f.setState('normal'); f.pos.set(0, 0, 0); f.vel.set(0, 0, 0);
  f.grounded = true; f.hoverFuel = 0; f._airRoll = null;
});
out.relightSeconds = await page.evaluate(() => {
  const f = window.__fighters[0];
  for (let i = 0; i < 900; i++) {
    window.__sim(1);
    if (f.hoverFuel > 0.2) return +(i / 60).toFixed(2);
  }
  return -1;
});
out.fullRefillSeconds = await page.evaluate(() => {
  const f = window.__fighters[0];
  f.hoverFuel = 0;
  for (let i = 0; i < 1800; i++) {
    window.__sim(1);
    if (f.hoverFuel >= f.hoverFuelMax - 1e-3) return +(i / 60).toFixed(2);
  }
  return -1;
});

console.log(JSON.stringify(out, null, 1));
await page.close();
await browser.close();
