// THE PER-ROUND ARENA CHANGE, IN THE REAL GAME — the one path tools/crosshair.mjs
// cannot reach. It drives the actual menus with a virtual Xbox pad, waits out the
// warm-up and the countdown, then locks on, HOLDS LB and pushes the right stick,
// checking what only boot.js's own routing can answer: that a locked aim takes
// the stick (aimIn.x), that the crosshair leads, that the camera fov zooms, and
// that holding LB never toggles the lock.
//
// NOTE the clock: under SwiftShader the sim runs ~50x slower than the wall
// clock, so every wait here is in tens of seconds for a fraction of a game
// second — and a real LB TAP cannot be timed at all at ~1.5fps, which is why
// the lock is set through the latch (tools/scratch/lbprobe.mjs tests the tap).
//
// usage: node tools/scratch/roundswap.mjs
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

// a virtual pad, driven from the page
await p.addInitScript(() => {
  window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [{
    connected: true, index: 0, id: 'virtual', mapping: 'standard',
    axes: window.__pad.axes, buttons: window.__pad.buttons,
  }, null, null, null];
  window.__press = (i, on) => { window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  window.__stick = (rx, ry) => { window.__pad.axes[2] = rx; window.__pad.axes[3] = ry; };
});
await p.goto('http://localhost:5173/?textures=0&postfx=0&music=0', { waitUntil: 'networkidle' });
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
// wait for the BELL: while B.loading the warm-up owns the cameras and
// boot.js's render loop returns early, so nothing under test is running yet
for (let i = 0; i < 40; i++) {
  const g = await p.evaluate(() => {
    const B = window.__game?.S?.battle; const L = B?.loading;
    if (!L) return null;
    return { t: +L.t.toFixed(1), minT: L.minT, settle: +L.settle.toFixed(2), barK: +L.barK.toFixed(2),
      pending: B.fighters.filter((f) => f._modelPending).length, fade: L.fade };
  });
  if (!g) break;
  if (i % 4 === 0) console.log('warmup', JSON.stringify(g));
  await p.waitForTimeout(5000);
}
// ...and then for the COUNTDOWN: match.begin() re-locks everybody, and under
// SwiftShader the sim runs ~50x slower than the wall clock
for (let i = 0; i < 40; i++) {
  const st = await p.evaluate(() => {
    const B = window.__game?.S?.battle;
    return { state: B?.match?.state, locked: !!B?.humans?.[0]?.fighter?.controlsLocked };
  });
  if (st.state === 'fight' && !st.locked) break;
  await p.waitForTimeout(5000);
}
const state = await p.evaluate(() => {
  const S = window.__game.S, B = S.battle;
  return { mode: S.mode, humans: B?.humans?.length, loading: !!B?.loading };
});
console.log('reached:', JSON.stringify(state));
await p.evaluate(() => { window.__firstArena = window.__game.S.battle.arena; window.__nextReady = true; });


// ---- THE PER-ROUND ARENA CHANGE (boot.js onRoundStart) ----
// Waiting out a real round is hopeless at ~50x slow, so the round is started
// directly: that is the same call the round-end flow makes, and it is what
// runs the swap.
const before = await p.evaluate(() => {
  const B = window.__game.S.battle;
  return { arena: B.arena.theme.id, name: B.arena.theme.name, round: B.match.round };
});
console.log('round 1 arena:', JSON.stringify(before));
// the next arena is prepared in the background during the round — wait for it
for (let i = 0; i < 30; i++) {
  const ready = await p.evaluate(() => !!window.__game.S.battle?.match?.onRoundStart && !!window.__nextReady);
  if (ready) break;
  await p.waitForTimeout(2000);
}
const after = await p.evaluate(async () => {
  const B = window.__game.S.battle;
  B.match.startRound();
  await new Promise((r) => setTimeout(r, 400));
  const f = B.fighters[0];
  return {
    arena: B.arena.theme.id, name: B.arena.theme.name, round: B.match.round,
    crates: B.world.pickups.length,
    sameArenaObject: B.arena === window.__firstArena,
    fighterOnFloor: Math.abs(f.pos.y - (B.arena.terrainHeightAt?.(f.pos.x, f.pos.z) || 0)) < 0.6,
    inBounds: Math.max(Math.abs(f.pos.x), Math.abs(f.pos.z)) < B.arena.wrapHalf,
  };
});
console.log('round 2 arena:', JSON.stringify(after));
console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
