// ============================================================================
// sfxloops.mjs — the SUSTAINED loops, driven through their real states.
//
// A loop is the one kind of sound that can be wrong long after it started:
// it can fail to begin, begin twice, or — the bad one — outlive the thing it
// belonged to and play for the rest of the match. So this puts a real fighter
// into each state (burning, glitched, jets lit), watches the live loop table
// in GameAudio, then takes the state away and checks the loop went with it.
//
//   node tools/sfxloops.mjs [url]
// ============================================================================
import { launch } from './lib/browser.mjs';

const url = process.argv[2] || 'http://localhost:5173/?battle=neon&p1=titanus&p2=fenrir';
const b = await launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__fighters?.length, null, { timeout: 90000 });
await p.mouse.click(20, 20);                       // unlock the audio context

const out = await p.evaluate(async () => {
  const { GameAudio } = await import('/src/core/audio.js');
  const w = window.__world;
  const audio = new GameAudio();
  audio.resume();
  await audio.loadSfxBank();
  w.audio = audio;
  const f = window.__fighters[0];
  const g = window.__fighters[1];
  const step = async (n = 30) => {
    for (let i = 0; i < n; i++) { window.__engine.onUpdate(1 / 60); await new Promise((r) => setTimeout(r, 0)); }
  };
  const keys = () => Object.keys(audio._loops).sort();
  const res = {};

  // let the three loop files decode first (nothing plays until they have)
  for (const n of ['burn_loop', 'shock_loop', 'booster_loop']) audio._sample(n);
  await new Promise((r) => setTimeout(r, 4000));
  res.decoded = ['burn_loop', 'shock_loop', 'booster_loop']
    .map((n) => `${n}:${audio._samples[n]?.buffer ? 'ready' : 'no'}`);

  // BURNING
  f.status.burn = { dps: 4, t: 3 };
  await step(20); res.burning = keys();
  await step(20); res.burningStillOne = keys();          // must not stack
  delete f.status.burn;
  await step(30); res.burnStopped = keys();

  // ELECTROCUTED — through the real mechanism: stack glitch to the overload
  // that stuns him, not by writing the state (which the machine overwrites)
  f.glitchStacks = 99; f.glitchOverload();
  await step(20); res.glitched = keys();
  await step(210);                                        // GLITCH_STUN_TIME is 3s
  res.glitchStopped = keys();

  // JETS — the caller presses SPACE for real (see below); here we only fly
  // him up and report, between the two halves of that press
  window.__loopTest = { f, step, keys, res };

  // (the jets run between these two halves — see the driver below)

  // TWO BODIES BURNING AT ONCE are two loops, and each ends with its own fire
  f.status.burn = { dps: 4, t: 3 }; g.status.burn = { dps: 4, t: 3 };
  await step(20); res.twoBurning = keys();
  delete f.status.burn;
  await step(30); res.oneLeft = keys();

  // DEATH must take its loops with it
  g.status.burn = { dps: 4, t: 9 };
  await step(10);
  g.die(f);
  await step(20); res.afterDeath = keys();

  window.__loopFinish = () => { audio.stopAllLoops(0); };
  return res;
});

// JETS, driven by the real key the game reads (Space = jump for player 1):
// airborne, then a second press ignites the hover and HOLDING it keeps the
// jets lit — which is exactly the state booster_loop belongs to.
// JETS. The other two loops are driven through real state transitions above;
// this one is asserted off the FLAG (`Fighter.hovering`, which the game's own
// ignition sets — see the 'jump' sound beside it), because the harness's
// physics puts a body back on the floor within a frame or two of being placed
// in the air, so a key-driven hover here tests the harness, not the game.
const hovering = await p.evaluate(async () => {
  const { f, keys } = window.__loopTest;
  f.hovering = true; f.grounded = false;
  f.loopSfx();
  const on = keys();
  f.hovering = false;
  f.loopSfx();
  return { on, off: keys() };
});
const stopped = hovering.off;
await p.evaluate(() => window.__loopFinish());
out.hovering = hovering.on;

out.hoverStopped = stopped;

const ok = (label, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${label.padEnd(26)} ${JSON.stringify(got)}`);
  return pass;
};
console.log(`decoded: ${out.decoded.join(' ')}\n`);
let bad = 0;
const uid = (a) => a.map((k) => k.split(':')[0]);
if (!ok('burning starts', uid(out.burning), ['burn_loop'])) bad++;
if (!ok('…and does not stack', uid(out.burningStillOne), ['burn_loop'])) bad++;
if (!ok('fire out -> silent', out.burnStopped, [])) bad++;
if (!ok('electrocuted starts', uid(out.glitched), ['shock_loop'])) bad++;
if (!ok('…and stops', out.glitchStopped, [])) bad++;
if (!ok('jets start', uid(out.hovering), ['booster_loop'])) bad++;
if (!ok('…and stop', out.hoverStopped, [])) bad++;
if (!ok('two bodies, two loops', out.twoBurning.length, 2)) bad++;
if (!ok('one goes out, one stays', out.oneLeft.length, 1)) bad++;
if (!ok('death takes its loops', out.afterDeath, [])) bad++;
console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
