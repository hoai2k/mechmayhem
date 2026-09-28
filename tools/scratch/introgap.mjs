// NOTHING BETWEEN THE MENU AND THE INTRO CARD: drives the real menus with a
// virtual pad into a match and logs every frame from the moment the choice is
// made to the reveal, failing on any frame where the canvas is DRAWING
// (engine.covered false) with neither a menu screen nor the loading card over
// it — i.e. a frame of the arena before the card (the "unrendered board").
//   node tools/scratch/introgap.mjs [baseUrl]
// Runs with ?prefetch=0: the gap only opens while a fighter model is still
// downloading (the menus normally warm the picks), so the probe forces a cold one.
import { launch } from '../lib/browser.mjs';
const base = process.argv[2] || 'http://localhost:5173';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => {
  window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [{
    connected: true, index: 0, id: 'virtual', mapping: 'standard',
    axes: window.__pad.axes, buttons: window.__pad.buttons,
  }, null, null, null];
  window.__press = (i, on) => { window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  // every frame: is anything opaque covering the canvas, and is it drawing?
  window.__frames = [];
  const tick = () => {
    const root = document.getElementById('ui-root');
    const G = window.__game;
    if (root && G) {
      const ls = root.querySelector('.ls');
      const screen = root.querySelector('.screen.sel-screen, .screen.arena-screen, .screen.title-screen');
      const covered = !!G.engine?.covered;
      window.__frames.push({ t: performance.now() | 0, mode: G.S?.mode, ls: !!ls, lsOut: !!ls?.classList.contains('out'),
        screen: screen?.className.split(' ').pop() || null, covered, battle: !!G.S?.battle });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await p.goto(`${base}/?music=0&prefetch=0`, { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
const tapA = async () => {
  await p.evaluate(() => window.__press(0, true));
  await p.waitForTimeout(700);
  await p.evaluate(() => window.__press(0, false));
  await p.waitForTimeout(1400);
};
for (let i = 0; i < 8; i++) {
  if (await p.evaluate(() => window.__game?.S?.mode) === 'battle') break;
  await tapA();
}
for (let i = 0; i < 90; i++) {
  const st = await p.evaluate(() => { const S = window.__game?.S; const L = S?.battle?.loading; return { mode: S?.mode, battle: !!S?.battle, loading: !!L, t: L?.t, starting: S?.starting, pend: !!window.__game?.loadPending }; });
  if (i % 10 === 0) console.log(JSON.stringify(st));
  if (st.loading) { await p.waitForTimeout(1500); break; }   // the card is up: the handover is over
  await p.waitForTimeout(2000);
}
const frames = await p.evaluate(() => window.__frames);
// from the first frame the card or battle exists — the handover window
const start = frames.findIndex((f) => f.ls || f.battle || f.mode === 'battle');
const win = frames.slice(Math.max(0, start - 3));
let exposed = 0, prev = '';
for (const f of win) {
  const bad = !f.covered && !f.ls && !f.screen && !f.battle ? true : (!f.covered && !f.ls && !f.screen && f.battle && f.mode === 'battle' && !f.lsOut && false);
  const naked = !f.covered && !f.ls && !f.screen && f.mode === 'battle' && !f.lsOut;
  if (naked) exposed++;
  const k = `${f.mode} ls=${f.ls}${f.lsOut ? '(out)' : ''} screen=${f.screen} covered=${f.covered} battle=${f.battle}${naked ? '  <-- ARENA EXPOSED' : ''}`;
  if (k !== prev) console.log(`${f.t}ms ${k}`);
  prev = k;
}
// the reveal itself removes the card on purpose; only frames BEFORE the card
// was ever up count
const firstCard = win.findIndex((f) => f.ls);
const before = win.slice(0, firstCard < 0 ? win.length : firstCard)
  .filter((f) => !f.covered && !f.screen && f.mode === 'battle').length;
console.log(`\nframes drawing the arena before the card was up: ${before}`);
if (errs.length) console.log('PAGE ERRORS:', errs.join('\n'));
await b.close();
process.exit(before || errs.length ? 1 : 0);
