// THE LOADING SCREEN, IN THE REAL GAME: drives the menus with a virtual pad
// into a match, photographs the card while it is up, waits for the reveal
// (the match must open ONLY after the card is gone), then starts a new round
// on a new arena and photographs that card too — asserting the round is HELD
// behind it and released after it.
//
// usage: node tools/scratch/loadscreen.mjs [out-prefix]
import { launch } from '../lib/browser.mjs';
const out = process.argv[2] || '/tmp/loadscreen';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
await p.addInitScript(() => {
  window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [{
    connected: true, index: 0, id: 'virtual', mapping: 'standard',
    axes: window.__pad.axes, buttons: window.__pad.buttons,
  }, null, null, null];
  window.__press = (i, on) => { window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
});
await p.goto('http://localhost:5173/?music=0', { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
const tapA = async () => {
  await p.evaluate(() => window.__press(0, true));
  await p.waitForTimeout(700);
  await p.evaluate(() => window.__press(0, false));
  await p.waitForTimeout(1400);
};
for (let i = 0; i < 8; i++) {
  const mode = await p.evaluate(() => window.__game?.S?.mode);
  if (mode === 'battle') break;
  await tapA();
}
const snap = () => p.evaluate(() => {
  const B = window.__game?.S?.battle; const L = B?.loading;
  return { mode: window.__game?.S?.mode, loading: !!L, t: L ? +L.t.toFixed(1) : null, barK: L ? +L.barK.toFixed(2) : null,
    fade: L?.fade, pending: B?.fighters.filter((f) => f._modelPending).length, match: B?.match?.state,
    hudHidden: B?.hud?.el?.style?.display === 'none', sandbox: !!B?.world?.sandbox,
    card: !!document.querySelector('.ls'), cardOut: !!document.querySelector('.ls.out'),
    cards: [...document.querySelectorAll('.ls-card')].map((c) => getComputedStyle(c).opacity).join(',') };
});
let s = await snap();
console.log('entered battle:', JSON.stringify(s));
if (!s.loading || !s.card) { console.log('FAIL no loading card'); process.exit(1); }
// the card, with the bar moving
await p.waitForTimeout(6000);
await p.screenshot({ path: out + '-round1.png', timeout: 180000 });
s = await snap();
console.log('card up:', JSON.stringify(s));
let wrong = 0;
if (s.match !== 'idle') { console.log('FAIL match ran under the card'); wrong++; }
if (!s.hudHidden) { console.log('FAIL hud visible under the card'); wrong++; }
// the reveal. SwiftShader runs the sim ~100x slow, so the card's own clock is
// advanced with boot's tick hook between real frames — the texture loader
// still runs on wall time, so the gate's other half is real
const advance = () => p.evaluate(() => { for (let k = 0; k < 6; k++) window.__game.tick(0.2); });
let revealed = null;
for (let i = 0; i < 80; i++) {
  s = await snap();
  if (!s.loading) { revealed = s; break; }
  if (i % 4 === 0) console.log('waiting', JSON.stringify(s));
  await advance();
  await p.waitForTimeout(1500);
}
console.log('revealed:', JSON.stringify(revealed));
if (!revealed || revealed.match !== 'intro' || revealed.card || revealed.sandbox) { console.log('FAIL reveal'); wrong++; }
await p.waitForTimeout(1500);
await p.screenshot({ path: out + '-revealed.png', timeout: 180000 });

// ---- a new round on a new arena ----
for (let i = 0; i < 30; i++) {
  const ready = await p.evaluate(() => !!window.__game.S.battle?.match?.onRoundStart);
  if (ready) break;
  await p.waitForTimeout(2000);
}
const r2 = await p.evaluate(async () => {
  const B = window.__game.S.battle;
  const before = B.arena.theme.id;
  B.match.startRound();
  await new Promise((r) => setTimeout(r, 300));
  return { before, after: B.arena.theme.id, round: B.match.round, state: B.match.state, loading: !!B.loading };
});
console.log('round 2:', JSON.stringify(r2));
if (r2.before === r2.after) console.log('note: the next arena was not ready — same city, no card (allowed)');
else if (r2.state !== 'held' || !r2.loading) { console.log('FAIL round not held behind its card'); wrong++; }
if (r2.loading) {
  await p.waitForTimeout(6000);
  await p.screenshot({ path: out + '-round2.png', timeout: 180000 });
  const c2 = await snap();
  console.log('round-2 card:', JSON.stringify(c2));
  if (!c2.cards || c2.cards.split(',').some((o) => +o < 0.99)) { console.log('FAIL fighter cards not visible on the round-2 card'); wrong++; }
  let rel = null;
  for (let i = 0; i < 80; i++) {
    s = await snap();
    if (!s.loading) { rel = s; break; }
    await advance();
    await p.waitForTimeout(1500);
  }
  console.log('round 2 released:', JSON.stringify(rel));
  if (!rel || rel.match !== 'intro') { console.log('FAIL round 2 not released into its intro'); wrong++; }
}
console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
process.exit(wrong ? 1 : 0);
