// EIGHT PLAYERS, end to end through the real menus. Exposes EIGHT virtual
// gamepads (a real Chromium caps at four — this is the code path, not the
// browser), joins every one on fighter select with its own A, locks them all,
// picks an arena and fights. Asserts: 8 seats filled by 8 distinct pads, a
// match of 8 humans, the 8-way split (camera layout g8), a HUD plate per
// fighter inside its own view, 8 spawn points far enough apart that nobody
// starts inside anybody, and that each pad's stick moves ITS robot and no other.
//   node tools/scratch/eight.mjs [baseUrl] [out.png]
import { launch } from '../lib/browser.mjs';
const base = process.argv[2] || 'http://localhost:5173';
const shot = process.argv[3] || null;
const N = 8;
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.addInitScript((N) => {
  const mk = (i) => ({ connected: true, index: i, id: `virtual ${i}`, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  window.__pads = Array.from({ length: N }, (_, i) => mk(i));
  navigator.getGamepads = () => window.__pads;
  window.__press = (i, btn, on) => { window.__pads[i].buttons[btn] = { pressed: on, value: on ? 1 : 0 }; };
  window.__stick = (i, x, y) => { window.__pads[i].axes[0] = x; window.__pads[i].axes[1] = y; };
}, N);
await p.goto(`${base}/?music=0&postfx=off`, { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
const tap = async (i, btn = 0) => {
  await p.evaluate(([i, btn]) => window.__press(i, btn, true), [i, btn]); await p.waitForTimeout(600);
  await p.evaluate(([i, btn]) => window.__press(i, btn, false), [i, btn]); await p.waitForTimeout(900);
};
const mode = () => p.evaluate(() => window.__game?.S?.mode);
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

for (let k = 0; k < 4 && (await mode()) !== 'mechselect'; k++) await tap(0);
check((await mode()) === 'mechselect', 'pad 1 reaches fighter select');
// every other pad joins with A
for (let i = 1; i < N; i++) await tap(i);
const seats = await p.evaluate(() => {
  const sel = window.__game.S.screen || window.__sel;
  const scr = [...document.querySelectorAll('.sel-side')].filter((e) => !e.classList.contains('empty') && !e.classList.contains('pos-none'));
  return { sides: scr.length, tags: scr.map((e) => e.querySelector('.sd-tag')?.textContent?.trim()) };
});
check(seats.sides === N, `${N} sides filled (${seats.sides}): ${seats.tags.join(' | ')}`);
// everyone locks
for (let i = 0; i < N; i++) await tap(i);
for (let k = 0; k < 4 && (await mode()) !== 'arenaselect'; k++) await tap(0);
check((await mode()) === 'arenaselect', 'all locked → arena select');
for (let k = 0; k < 3 && (await mode()) !== 'battle'; k++) await tap(0);
// THE LOADING CARD, advanced by hand: eight split views drawn by SwiftShader
// cost seconds a frame, so the real-time card would take many minutes. The
// render loop stops and the game is ticked instead — the card's gate is sim
// time + the texture loader going idle + every model in, all of which still
// have to happen for real (the loader keeps streaming between the chunks).
await p.waitForFunction(() => window.__game?.S?.battle, null, { timeout: 120000 });
await p.evaluate(() => { window.__game.engine._running = false; });
let gate = null;
for (let k = 0; k < 120; k++) {
  gate = await p.evaluate(() => {
    const G = window.__game, B = G.S.battle;
    for (let i = 0; i < 30 && B.loading; i++) G.tick(1 / 60);
    const L = B.loading;
    return L ? { t: +L.t.toFixed(1), pending: B.fighters.filter((f) => f._modelPending).length, status: L.status.textContent, prewarmed: L.prewarmed } : null;
  });
  if (!gate) break;
  if (k % 10 === 0) console.log('     card:', JSON.stringify(gate));
  await p.waitForTimeout(500);
}
check(!gate, `the loading card lifts${gate ? ' — STUCK: ' + JSON.stringify(gate) : ''}`);

const r = await p.evaluate(() => {
  const G = window.__game, B = G.S.battle;
  const step = (s) => { for (let i = 0; i < s * 60; i++) G.tick(1 / 60); };
  step(3.2);   // through the intro to FIGHT
  const devices = B.humans.map((h) => h.device);
  const layout = B.cameraSys.layoutKind(B.humans.length);
  // plates: one per fighter, on screen, not overlapping each other
  const plates = [...document.querySelectorAll('.hud-plate, .plate')].filter((e) => e.offsetParent);
  const rects = plates.map((e) => e.getBoundingClientRect());
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], c = rects[j];
    if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) overlaps++;
  }
  const inside = rects.every((q) => q.left >= -1 && q.top >= -1 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1);
  // spawn spacing
  let minGap = Infinity;
  const F = B.fighters, w = B.world;
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const d = Math.hypot(w.wrapDelta(F[i].pos.x - F[j].pos.x), w.wrapDelta(F[i].pos.z - F[j].pos.z));
    minGap = Math.min(minGap, d - F[i].radius - F[j].radius);
  }
  return { humans: B.humans.length, fighters: F.length, devices, layout, state: B.match.state,
    plates: rects.length, overlaps, inside, minGap: +minGap.toFixed(2), views: B.cameraSys.views?.length ?? null };
});
check(r.humans === N && r.fighters === N, `a match of ${r.humans} humans / ${r.fighters} fighters (${r.state})`);
check(new Set(r.devices).size === N, `8 distinct devices: ${r.devices.join(',')}`);
check(r.layout === 'g8', `camera layout ${r.layout}`);
check(r.plates >= N && r.overlaps === 0 && r.inside, `HUD: ${r.plates} plates, ${r.overlaps} overlapping, all on screen ${r.inside}`);
check(r.minGap > 0, `spawns: nobody starts inside anybody (closest pair ${r.minGap} apart, surface to surface)`);

// each pad moves its own robot and nobody else's
const own = [];
for (let i = 0; i < N; i++) {
  const mv = await p.evaluate((i) => {
    const G = window.__game, B = G.S.battle;
    const step = (s) => { for (let k = 0; k < s * 60; k++) G.tick(1 / 60); };
    const before = B.fighters.map((f) => ({ x: f.pos.x, z: f.pos.z }));
    window.__stick(i, 1, 0); step(0.8); window.__stick(i, 0, 0); step(0.3);
    const moved = B.fighters.map((f, k) => Math.hypot(f.pos.x - before[k].x, f.pos.z - before[k].z));
    const mine = B.humans.find((h) => h.device === 'pad' + i)?.fighter;
    const mi = B.fighters.indexOf(mine);
    return { mi, mine: +moved[mi].toFixed(2), others: +Math.max(0, ...moved.filter((_, k) => k !== mi)).toFixed(2) };
  }, i);
  own.push(mv);
}
const ok = own.every((m) => m.mi >= 0 && m.mine > 2 && m.others < 0.3);
check(ok, `each pad drives its own robot only: ${own.map((m, i) => `pad${i}→P${m.mi + 1} ${m.mine}/${m.others}`).join('  ')}`);
if (shot) {
  await p.evaluate(() => { const G = window.__game; G.engine._running = true; G.engine.start?.(); });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: shot });
}
if (errs.length) { console.log('PAGE ERRORS:', errs.join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILURES` : '\nEIGHT PLAYERS ✓');
await b.close();
process.exit(fails ? 1 : 0);
