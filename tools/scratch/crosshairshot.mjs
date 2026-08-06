// Pictures of the crosshair: hip-fire lock, a led aim, and the scope at full
// zoom. usage: node tools/scratch/crosshairshot.mjs <outPrefix> [waitMs]
import { chromium } from 'playwright-core';

const [out = 'aim', waitMs = '30000'] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await p.goto('http://localhost:5173/?battle=neon&p1=titanus&p2=viper', { waitUntil: 'networkidle' });
await p.waitForTimeout(Number(waitMs));

// the ?battle= harness has no game HUD (it prints a text overlay instead), and
// the crosshair IS the thing under test — so mount the real one on its world
await p.evaluate(async () => {
  const { Hud } = await import('/src/ui/hud.js');
  const hud = new Hud(document.getElementById('ui-root'), window.__world);
  hud.buildPlates(window.__fighters);
  window.__hud = hud;
});

const shot = async (name, setup, frames) => {
  await p.evaluate(async ({ setup, frames }) => {
    const w = window.__world, cam = window.__cam, F = window.__fighters, eng = window.__engine;
    const [f, t] = F;
    eng.paused = true;
    f.pos.set(0, 0, 0); f.yaw = 0; f.vel.set(0, 0, 0);
    t.pos.set(0, 0, 26); t.yaw = Math.PI; t.vel.set(0, 0, 0);
    t.controlsLocked = true;
    window.__ais.length = 0;
    for (const g of [f, t]) { g.intent.moveX = g.intent.moveZ = 0; }
    const cfg = JSON.parse(setup);
    f.intent.lockOn = cfg.lock; f.intent.sniper = cfg.sniper;
    f.aimIn = { x: cfg.lead || 0, y: 0 };
    const dt = 1 / 60;
    for (let i = 0; i < frames; i++) {
      f.intent.lockOn = cfg.lock; f.intent.sniper = cfg.sniper;
      f.aimIn.x = cfg.lead || 0;
      w.update(dt); cam.update(dt, F, [f]);
      window.__hud.update(dt, window.__engine.camera, 60);
    }
    eng._render();
  }, { setup: JSON.stringify(setup), frames });
  // page.screenshot, not engine.capture: the crosshair is a DOM overlay and
  // only a page shot composites it over the canvas
  await p.screenshot({ path: `${out}-${name}.png`, timeout: 120000 });
};

await shot('lock', { lock: true, sniper: false, lead: 0 }, 120);
await shot('lead', { lock: true, sniper: false, lead: 1 }, 40);
await shot('scope', { lock: true, sniper: true, lead: 0 }, 120);
await shot('scope-lead', { lock: true, sniper: true, lead: 1 }, 40);
await b.close();
console.log('wrote', out + '-{lock,lead,scope,scope-lead}.png');
