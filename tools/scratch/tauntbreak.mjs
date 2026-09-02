// A TAUNT MUST NOT EAT THE INPUT THAT ENDS IT. Play the taunt, then hold a
// direction (or a button) from a given frame on, and report how long it takes
// the mech to actually start doing it.
//
// The world is stepped at a fixed 1/60 so the answer is in FRAMES, not in
// whatever a SwiftShader frame happened to be worth.
import { launch } from '../lib/browser.mjs';
const mech = process.argv[2] || 'titanus';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=titanus&auto=0`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await p.waitForTimeout(5000);

const res = await p.evaluate(({ mech }) => {
  const w = window.__world, f = w.fighters[0], e = w.fighters[1];
  e.pos.set(30, 0, 0); e.isAI = false;
  const zero = () => ({ moveX: 0, moveZ: 0, jump: false, dash: false, light: false,
    heavy: false, special: false, ult: false, ranged: false, block: false, taunt: false });
  // …and the same input from a standstill with NO taunt, which is the number
  // the taunt case has to match: a couple of frames of acceleration is physics,
  // not a block.
  const base = (label, press, hold) => {
    f.pos.set(0, 0, 0); f.vel.set(0, 0, 0); f.yaw = 0;
    f.state = 'normal'; f.stateT = 0; f.animator.action = null; f.controlsLocked = false;
    Object.assign(f.intent, zero());
    for (let i = 0; i < 30; i++) w.update(1 / 60);
    const x0 = f.pos.x, z0 = f.pos.z;
    let frames = -1;
    for (let i = 0; i < 90; i++) {
      Object.assign(f.intent, zero(), press);
      w.update(1 / 60);
      if (frames < 0 && hold(f, x0, z0)) frames = i + 1;
    }
    return { label: label + ' (no taunt)', taunting: true, frames, moved: +Math.hypot(f.pos.x - x0, f.pos.z - z0).toFixed(2) };
  };
  const run = (label, press, hold) => {
    f.pos.set(0, 0, 0); f.vel.set(0, 0, 0); f.yaw = 0;
    f.state = 'normal'; f.stateT = 0; f.animator.action = null;
    f.controlsLocked = false;
    // start the taunt the way the game does
    Object.assign(f.intent, zero(), { taunt: true });
    w.update(1 / 60);
    Object.assign(f.intent, zero());
    for (let i = 0; i < 30; i++) w.update(1 / 60);      // half a second of taunting
    const taunting = f.taunting();
    const x0 = f.pos.x, z0 = f.pos.z;
    let frames = -1;
    for (let i = 0; i < 90; i++) {
      Object.assign(f.intent, zero(), press);
      w.update(1 / 60);
      if (frames < 0 && hold(f, x0, z0)) frames = i + 1;
    }
    return { label, taunting, frames, moved: +Math.hypot(f.pos.x - x0, f.pos.z - z0).toFixed(2) };
  };
  const moved = (g, x0, z0) => Math.hypot(g.pos.x - x0, g.pos.z - z0) > 0.25;
  return [
    base('push stick', { moveZ: 1 }, moved),
    run('push stick', { moveZ: 1 }, (g, x0, z0) => Math.hypot(g.pos.x - x0, g.pos.z - z0) > 0.25),
    run('light attack', { light: true }, (g) => g.state === 'attack' && g.animator.action?.clip.name !== 'taunt'),
    run('block', { block: true }, (g) => g.blocking),
    run('jump', { jump: true }, (g) => !g.grounded),
  ];
}, { mech });
await b.close();
for (const r of res) {
  console.log(`${r.label.padEnd(13)} taunting first: ${r.taunting}   reacted after ${r.frames < 0 ? 'NEVER' : r.frames + ' frame(s)'}   moved ${r.moved}`);
}
process.exit(res.every((r) => r.taunting && r.frames > 0 && r.frames <= 3) ? 0 : 1);
