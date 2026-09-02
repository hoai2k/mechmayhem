// THE CROSSHAIR AND THE SCOPE, IN THE REAL GAME — the one path tools/crosshair.mjs
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
// usage: node tools/scratch/realaim.mjs
import { launch } from '../lib/browser.mjs';
const b = await launch();
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

// LOCK ON first (the tap toggle's own latch — a real tap cannot be timed
// against a renderer running ~50x slow), then LB held + right stick: the
// locked half of boot.js's routing, where X is the aim's and not the camera's
await p.evaluate(() => { window.__game.input._lockLatch[0] = true; });
await p.waitForTimeout(20000);
const locked = await p.evaluate(() => {
  const f = window.__game.S.battle.humans[0].fighter;
  return { lock: !!f.intent.lockOn, target: f.lockTarget?.def?.id || null, aiming: !!f.aiming };
});
console.log('locked:', JSON.stringify(locked));
await p.evaluate(() => { window.__press(4, true); window.__stick(0.9, 0); });
await p.waitForTimeout(40000);
const held = await p.evaluate(() => {
  const f = window.__game.S.battle.humans[0].fighter;
  return {
    sniper: !!f.intent.sniper, aiming: !!f.aiming, sniperK: +(f.sniperK || 0).toFixed(2),
    _diag: { mode: window.__game.S.mode, match: window.__game.S.battle.match.state,
      alive: f.alive, cl: !!f.controlsLocked, latch: window.__game.input._lockLatch[0],
      lbDown: window.__game.input._lbDown[0], padLB: !!window.__game.input.padsCur[0].LB },
    leadDeg: f.lockTarget ? +(((f.aimYaw - f.yawTo(f.lockTarget)) * 180 / Math.PI + 540) % 360 - 180).toFixed(1) : null,
    aimIn: f.aimIn && { x: +f.aimIn.x.toFixed(2), y: +f.aimIn.y.toFixed(2) },
    lock: !!f.intent.lockOn, hasCrosshair: !!f._lockAim,
    fov: +window.__game.engine.camera.fov.toFixed(1),
  };
});
console.log('LB held:', JSON.stringify(held));
await p.screenshot({ path: 'real-scope.png', timeout: 120000 });

// release: back to normal, and the lock must NOT have toggled
await p.evaluate(() => { window.__press(4, false); window.__stick(0, 0); });
await p.waitForTimeout(30000);
const after = await p.evaluate(() => {
  const f = window.__game.S.battle.humans[0].fighter;
  return { sniperK: +(f.sniperK || 0).toFixed(3), lock: !!f.intent.lockOn, fov: +window.__game.engine.camera.fov.toFixed(1) };
});
console.log('released:', JSON.stringify(after));
console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
