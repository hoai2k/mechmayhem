// AN UNFOCUSED WINDOW PAUSES THE FIGHT (boot.js applyAway), as a hidden tab
// always did: into a real match through the menus with a virtual pad, past the
// loading card, then a window blur must raise the pause screen, and focus
// coming back must NOT resume it — the player unpauses when they are back.
// The loading card itself is not pausable, so a blur under it changes nothing.
//
// usage: node tools/scratch/blurpause.mjs
import { launch } from '../lib/browser.mjs';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
const fails = []; const ok = (c, m) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${m}`); if (!c) fails.push(m); };
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await p.addInitScript(() => {
  window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [{ connected: true, index: 0, id: 'virtual', mapping: 'standard',
    axes: window.__pad.axes, buttons: window.__pad.buttons }, null, null, null];
  window.__press = (i, on) => { window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  window.__focus = (v) => window.dispatchEvent(new Event(v ? 'focus' : 'blur'));
});
await p.goto('http://localhost:5173/?music=0', { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
for (let i = 0; i < 8; i++) {
  if (await p.evaluate(() => window.__game?.S?.mode) === 'battle') break;
  await p.evaluate(() => window.__press(0, true)); await p.waitForTimeout(700);
  await p.evaluate(() => window.__press(0, false)); await p.waitForTimeout(1400);
}
const snap = () => p.evaluate(() => { const B = window.__game.S.battle;
  return { loading: !!B?.loading, paused: !!B?.paused, match: B?.match?.state,
    pauseScreen: !!document.querySelector('.pause-title') }; });
let s = await snap();
ok(s.loading, 'in a match, under the loading card');
// a blur under the card: not a pausable state
await p.evaluate(() => { window.__focus(false); window.__focus(true); });
s = await snap(); ok(!s.paused, 'a blur under the loading card does not pause');
// past the card (the sim runs ~50x slow here, so tick its clock along)
for (let i = 0; i < 80; i++) {
  s = await snap(); if (!s.loading) break;
  await p.evaluate(() => { for (let k = 0; k < 6; k++) window.__game.tick(0.2); });
  await p.waitForTimeout(1200);
}
ok(!s.loading && !s.paused, `the fight is running (${s.match})`);
await p.evaluate(() => window.__focus(false)); await p.waitForTimeout(500);
s = await snap();
ok(s.paused, 'blurred: the fight is paused');
ok(s.pauseScreen, 'blurred: the pause screen is up');
await p.evaluate(() => window.__focus(true)); await p.waitForTimeout(800);
s = await snap();
ok(s.paused && s.pauseScreen, 'focused again: still paused, waiting for the player');
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length || errs.length ? 1 : 0);
