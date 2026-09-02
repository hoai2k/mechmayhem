// THE DASH ECONOMY AND THE INPUT BUFFER — measured on a real fight.
//
// Everything here goes through the REAL input path (Playwright keys into
// input.js) on a deterministically stepped sim, because both changes are about
// what a BUTTON does: writing `fighter.intent` from the harness proves nothing,
// input.js overwrites it at the top of every frame.
//
// Two things it proves:
//   1. A press arriving during an attack's RECOVERY comes out. The A/B is
//      honest — `bufferInput` is stubbed to return '' to reproduce exactly the
//      old behaviour, every other number identical.
//   2. A tapped dash is no longer free: what the tank does under a mash, that
//      an empty tank REFUSES a tap, the i-frame uptime, and that a wound coil
//      still fires on an empty tank (the exemption it paid three seconds for).
//
//   node tools/scratch/dashbuffer.mjs
import { launch } from '../lib/browser.mjs';

const BASE = process.env.RW_URL || 'http://localhost:5173';
// VIPER: no punchHold/heavyHold, so a tap of the heavy key is a real swing
// with a real recovery — which is the window this is about.
const URL = `${BASE}/?battle=uptown&p1=viper&p2=titanus`;
let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}${extra ? '  — ' + extra : ''}`);
};

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__fighters?.length && window.__engine, null, { timeout: 180000 });

await page.evaluate(() => {
  const e = window.__engine;
  e.paused = true;
  window.__stat = { frames: 0, iframeFrames: 0 };
  const f = window.__fighters[0];
  // the sim advances only through __sim(), so a slow renderer can never put
  // the fight somewhere between two reads (tools/training.mjs' trick)
  window.__sim = (n) => {
    for (let i = 0; i < n; i++) {
      let dt = (1 / 60) * e.timeScale;
      if (e.hitStop > 0) { e.hitStop -= 1 / 60; dt *= 0.05; }
      e.elapsed += dt;
      e.onUpdate(dt);
      window.__stat.frames++;
      if (f.iframes > 0) window.__stat.iframeFrames++;
    }
  };
  const [, f2] = window.__fighters;
  if (f2) { f2.pos.set(300, 0, 300); f2.controlsLocked = true; }  // no sparring partner
  f.controlsLocked = false;
  // count what actually STARTS, at the source — a REFUSED dash still calls
  // doDash, so counting calls would report a mash that never moved him
  window.__n = { heavy: 0, dash: 0 };
  const oh = f.doHeavy.bind(f);
  f.doHeavy = (...a) => { window.__n.heavy++; return oh(...a); };
  const od = f.doDash.bind(f);
  f.doDash = (...a) => {
    const was = f.state;
    const r = od(...a);
    if (f.state === 'dash' && was !== 'dash') window.__n.dash++;
    return r;
  };
});
const sim = (n) => page.evaluate((n) => window.__sim(n), n);
const read = (fn) => page.evaluate(fn);
const tap = async (code, hold = 2) => {
  await page.keyboard.down(code); await sim(hold);
  await page.keyboard.up(code); await sim(1);
};

await sim(240);   // the round intro runs out and control comes back
check('control is the probe\'s (no CPU on P1)', await read(() => !window.__fighters[0].isAI && window.__fighters[0].canAct()));

// ---------------------------------------------------------------- 1. buffer
// Press HEAVY; wait until only ~0.1s of the swing's lock is left, so control
// is provably gone; press HEAVY again; see whether a second swing comes out.
async function heavyDuringRecovery(withBuffer) {
  await page.evaluate((withBuffer) => {
    const f = window.__fighters[0];
    if (!withBuffer) { f.__buf = f.__buf || f.bufferInput; f.bufferInput = () => ''; }
    else if (f.__buf) { f.bufferInput = f.__buf; f.__buf = null; }
    f.setState('normal'); f._buffered = null; f.sprintEnergy = f.sprintEnergyMax;
    window.__n.heavy = 0;
  }, withBuffer);
  await tap('KeyG');
  const left = await read(() => window.__fighters[0].stateT);
  await sim(Math.max(1, Math.round((left - 0.10) * 60)));   // sit out all but ~0.1s
  const mid = await read(() => {
    const f = window.__fighters[0];
    return { canAct: f.canAct(), state: f.state, stateT: +f.stateT.toFixed(3) };
  });
  await tap('KeyG');           // the too-early press
  await sim(45);               // …and let control come back
  return { n: await read(() => window.__n.heavy), mid, lock: +left.toFixed(3) };
}
const off = await heavyDuringRecovery(false);
const on = await heavyDuringRecovery(true);
console.log(`  heavy lock ${on.lock}s; second press with ${on.mid.stateT}s of it left`);
check('the second press really was too early (no control)',
  !off.mid.canAct && !on.mid.canAct && off.mid.state === 'attack', JSON.stringify(off.mid));
check('WITHOUT the buffer the press is eaten', off.n === 1, `heavies=${off.n}`);
check('WITH the buffer it comes out', on.n === 2, `heavies=${on.n}`);

// the buffer is about the next instant, not a queue: an old press is dropped
const stale = await page.evaluate(() => {
  const f = window.__fighters[0];
  f.setState('normal'); f._buffered = null; window.__n.heavy = 0;
  f.setState('attack', 1.5);                             // a long lock
  f._buffered = { act: 'heavy', t: f.world.time - 5 };   // pressed five seconds ago
  window.__sim(150);
  return window.__n.heavy;
});
check('a stale press is dropped, not queued', stale === 0, `heavies=${stale}`);

// ------------------------------------------------------------ 2. dash economy
// Mash the dash at its own cooldown rate, on the move, for ten dashes' worth.
await page.evaluate(() => {
  const f = window.__fighters[0];
  f.setState('normal'); f.sprintEnergy = f.sprintEnergyMax; f._buffered = null;
  f.pos.set(0, 0, 0); f.vel.set(0, 0, 0);
  window.__n.dash = 0;
  window.__stat.frames = 0; window.__stat.iframeFrames = 0;
});
await page.keyboard.down('KeyW');          // hold a direction: a press is a TAP dash
await sim(6);
let refusals = 0;
for (let i = 0; i < 16; i++) {
  const before = await read(() => window.__n.dash);
  await page.keyboard.down('ShiftLeft'); await sim(2);
  await page.keyboard.up('ShiftLeft');
  await sim(34);                           // ~0.6s, the cooldown
  if (await read(() => window.__n.dash) === before) refusals++;   // the tank said no
}
await page.keyboard.up('KeyW');
const mash = await read(() => ({
  dashes: window.__n.dash,
  uptime: +(window.__stat.iframeFrames / window.__stat.frames).toFixed(3),
  tank: +window.__fighters[0].sprintEnergy.toFixed(3),
}));
console.log('  mash:', JSON.stringify({ ...mash, refusals }));
check('the mash actually dashed (the B path fired)', mash.dashes >= 5, `dashes=${mash.dashes}`);
// THE MASH HAS AN END: it used to be able to run forever, since a dash gave
// back more than it cost. Sixteen presses on the cooldown now outrun the bar.
check('a sustained mash runs the tank dry and is refused', refusals > 0,
  `refused ${refusals} of 16, tank=${mash.tank}`);
check('i-frame uptime is well under the old 43%', mash.uptime < 0.30,
  `uptime=${(mash.uptime * 100).toFixed(1)}%`);

// an EMPTY tank refuses a tap…
const refusedOnEmpty = await page.evaluate(() => {
  const f = window.__fighters[0];
  f.setState('normal'); f.sprintEnergy = 0; f.dashCd = 0; window.__n.dash = 0;
  const before = f.vel.length();
  f.doDash(0);
  return { started: f.state === 'dash', velUnchanged: Math.abs(f.vel.length() - before) < 0.001 };
});
check('an empty tank refuses a tapped dash', !refusedOnEmpty.started && refusedOnEmpty.velUnchanged,
  JSON.stringify(refusedOnEmpty));

// …and a WOUND COIL still fires on one: wind it standing still, empty the tank
// at the last moment (winding regenerates), then push a direction.
await page.keyboard.down('ShiftLeft');
await sim(190);                                    // three seconds of crouch
const wound = await read(() => +window.__fighters[0]._dashCharge.toFixed(2));
await page.evaluate(() => {
  const f = window.__fighters[0];
  f.sprintEnergy = 0; f.iframes = 0; window.__n.dash = 0;
});
await page.keyboard.down('KeyW');                  // the coil fires on a direction
await sim(3);
const coil = await read(() => ({
  dashes: window.__n.dash,
  iframes: +window.__fighters[0].iframes.toFixed(3),
  state: window.__fighters[0].state,
}));
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
console.log('  coil:', JSON.stringify({ wound, ...coil }));
check('a wound coil still fires on an empty tank', coil.dashes === 1 && coil.state === 'dash',
  JSON.stringify(coil));
check('…and it is the real dodge (~0.42s of i-frames)', coil.iframes > 0.35, `iframes=${coil.iframes}`);

console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
await browser.close();
process.exit(fails ? 1 : 0);
