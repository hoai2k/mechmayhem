// LB IS TWO CONTROLS: a TAP toggles the target lock, a HOLD is sniper mode and
// must NOT toggle it. Drives the real Input class with a stubbed pad and checks
// every transition, including the one that matters most — that raising and
// lowering the scope leaves the lock exactly as it found it.
//
// usage: node tools/scratch/lbprobe.mjs
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/?showcase', { waitUntil: 'domcontentloaded' });

const rows = await page.evaluate(async () => {
  const { Input } = await import('/src/game/input.js');
  const { TUNING } = await import('/src/core/tuning.js');
  const inp = new Input();
  const intent = {};
  // stub the pad: poll() reads navigator.getGamepads, so write the state the
  // frame pair (prev/cur) already exposes instead
  let down = false;
  const frame = () => {
    inp.padsPrev[0] = inp.padsCur[0];
    inp.padsCur[0] = { connected: true, LB: down };
    inp.readIntent('pad0', intent, 0);
    return { lock: intent.lockOn, sniper: intent.sniper };
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hold = TUNING.aim.holdTime * 1000;
  const out = [];
  // a TAP: down, up well inside the hold window
  down = true; frame();
  await wait(hold * 0.3);
  const midTap = frame();
  down = false;
  out.push({ case: 'tap', duringPress: midTap, after: frame() });
  // a HOLD: sniper comes up, the lock is untouched, and stays untouched on release
  down = true; frame();
  await wait(hold * 2);
  const midHold = frame();
  down = false;
  out.push({ case: 'hold (lock already on)', duringHold: midHold, after: frame() });
  // a second TAP releases the lock
  down = true; frame();
  await wait(hold * 0.3);
  frame(); down = false;
  out.push({ case: 'tap again', after: frame() });
  // a HOLD with the lock OFF: sniper alone, no lock
  down = true; frame();
  await wait(hold * 2);
  const midHold2 = frame();
  down = false;
  out.push({ case: 'hold (lock off)', duringHold: midHold2, after: frame() });
  return out;
});

const expect = [
  ['tap', (r) => r.after.lock === true && r.after.sniper === false && r.duringPress.sniper === false],
  ['hold (lock already on)', (r) => r.duringHold.sniper === true && r.duringHold.lock === true && r.after.lock === true && r.after.sniper === false],
  ['tap again', (r) => r.after.lock === false],
  ['hold (lock off)', (r) => r.duringHold.sniper === true && r.duringHold.lock === false && r.after.lock === false],
];
let bad = 0;
for (const r of rows) {
  const e = expect.find((x) => x[0] === r.case);
  const ok = e && e[1](r);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.case.padEnd(24)} ${JSON.stringify(r)}`);
}
console.log(`\n${rows.length - bad}/${rows.length} LB behaviours correct`);
await browser.close();
process.exit(bad ? 1 : 0);
