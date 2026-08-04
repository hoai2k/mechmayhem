// WHERE IS THE FIST, actually? Splits a melee swing's hit volume into the two
// things it is made of: the MODEL (the swept limb, measured off the animated
// skeleton every frame) and the ALLOWANCE (the extension past the fist and the
// capsule radius, both derived from the roster `range` number).
//
//   node tools/scratch/fistreach.mjs <mech> [more mechs...]
import { chromium } from 'playwright-core';
const mechs = process.argv.slice(2);
if (!mechs.length) mechs.push('cranky', 'titanus', 'konga');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 320, height: 240 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));

const rows = [];
for (const mech of mechs) {
  await p.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=titanus&auto=0`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__fighters?.length >= 2, null, { timeout: 150000 });
  await p.waitForTimeout(4000);
  rows.push(await p.evaluate(() => {
    const w = window.__world, [f, e] = window.__fighters;
    f.isAI = e.isAI = false;
    e.pos.set(0, 0, 40);
    const zero = () => ({ moveX: 0, moveZ: 0, jump: false, dash: false, light: false,
      heavy: false, special: false, ult: false, ranged: false, block: false, taunt: false });
    const M = window.__THREE ? null : null;
    const swing = (kind) => {
      f.pos.set(0, 0, 0); f.vel.set(0, 0, 0); f.yaw = f.targetYaw = f.torsoYaw = 0;
      f.setState('normal', 0); f.animator.action = null; f.comboIdx = 0; f.comboWindow = 0;
      f.controlsLocked = false;
      // wrap strikeVolume so we see exactly the segment the hit test uses, on
      // the frame the clip's `hit` event fires
      let best = null;
      const orig = f.strikeVolume.bind(f);
      f.strikeVolume = (atk, a, c) => {
        const r = orig(atk, a, c);
        const fwd = c.z - f.pos.z;                    // yaw 0, so +z is forward
        if (!best || fwd > best.fist) best = { fist: +fwd.toFixed(2), r: +r.r.toFixed(2) };
        return r;
      };
      Object.assign(f.intent, zero(), { [kind]: true });
      w.update(1 / 60);
      Object.assign(f.intent, zero());
      for (let i = 0; i < 110; i++) w.update(1 / 60);
      f.strikeVolume = orig;
      return best;
    };
    const L = swing('light'), H = swing('heavy');
    return { id: f.def.id, scale: +f.scale.toFixed(2),
      lightRange: f.def.moves.light.range, heavyRange: f.def.moves.heavy.range,
      light: L, heavy: H };
  }));
}
await b.close();

const OVER = 0.70, SWING_R = 0.24, SWING_MIN = 0.45;
console.log('the hit capsule = the MODEL (swept limb) + an ALLOWANCE from the roster number\n');
console.log('mech      move   range  fist fwd(model)  allowance(over+radius)  capsule tip');
for (const r of rows) {
  for (const [k, m] of [['light', r.light], ['heavy', r.heavy]]) {
    if (!m) continue;
    const range = k === 'light' ? r.lightRange : r.heavyRange;
    const over = OVER * range;
    const rad = Math.max(SWING_MIN * r.scale, SWING_R * range);
    // strikeVolume already applied the overshoot, so back it out to show the model alone
    console.log(`${r.id.padEnd(9)} ${k.padEnd(6)} ${String(range).padStart(4)}   `
      + `${(m.fist - over).toFixed(2).padStart(10)}   ${(over).toFixed(2).padStart(6)} + ${rad.toFixed(2)}`
      + `   ${m.fist.toFixed(2).padStart(8)}`);
  }
}
