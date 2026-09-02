// WARM-UP CONTROL FRAME PROBE — on the "preparing to battle" screen each
// fighter is framed from the FRONT by its own warm-up camera, so the control
// frame must be that camera's, not the match camera's. Pushing FORWARD must
// walk the mech AWAY from the eye; pulling BACK must bring him toward it.
//
//   node tools/scratch/warmupinput.mjs
//
// Drives the real menu flow (the warm-up screen only exists there) and then
// holds a real movement key, so the whole path runs — input.readIntent, the
// yaw the loop hands it, world.update. Reported as the distance from that
// fighter's own warm-up camera before and after, plus how far he travelled
// along the camera's own view direction (+ = away from the viewer).
import { launch } from '../lib/browser.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

for (let i = 0; i < 14; i++) {
  const mode = await page.evaluate(() => window.__game?.S?.mode);
  if (mode === 'battle') break;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
}
const state = await page.evaluate(() => ({
  mode: window.__game?.S?.mode, loading: !!window.__game?.S?.battle?.loading,
}));
console.log('state', state);
if (!state.loading) { console.log('never reached the warm-up screen'); await browser.close(); process.exit(1); }

const snap = () => page.evaluate(() => {
  const B = window.__game.S.battle;
  const f = B.humans[0].fighter;
  const cam = window.__game.engine.views[B.fighters.indexOf(f)].camera;
  const vx = f.pos.x - cam.position.x, vz = f.pos.z - cam.position.z;
  const L = Math.hypot(vx, vz) || 1;
  return { x: f.pos.x, z: f.pos.z, cx: cam.position.x, cz: cam.position.z, ux: vx / L, uz: vz / L, d: L };
});

for (const [name, key] of [['forward', 'KeyW'], ['back', 'KeyS']]) {
  await page.evaluate(() => {
    const B = window.__game.S.battle;
    const f = B.humans[0].fighter;
    f.pos.copy(f._wuSpawn); f.vel.set(0, 0, 0);
    B.loading.t = 0; // hold the warm-up open
  });
  await page.waitForTimeout(200);
  const a = await snap();
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
  const b = await snap();
  const away = (b.x - a.x) * a.ux + (b.z - a.z) * a.uz;
  console.log(`${name.padEnd(8)} dist to warm-up cam ${a.d.toFixed(2)} -> ${b.d.toFixed(2)}   ` +
    `travel along view dir ${away >= 0 ? '+' : ''}${away.toFixed(2)} (+ = away from camera)`);
  await page.waitForTimeout(300);
}
if (errors.length) console.log('page errors:', errors.slice(0, 3));
await browser.close();
