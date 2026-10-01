// Weather in SPLIT SCREEN, and the settings toggle switching it off live.
//   node tools/scratch/weathersplit.mjs <out-prefix>
import { launch } from '../lib/browser.mjs';
import fs from 'node:fs';
const out = process.argv[2] || '/tmp/wsplit';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?battle=neon&p1=titanus&p2=viper&forcesplit=1&humans=2&music=0&seed=7&weather=force&weatherk=0.9', { waitUntil: 'load' });
await page.waitForFunction(() => window.__world && window.__engine && window.__fighters?.length >= 2, null, { timeout: 240000 });
await page.waitForTimeout(15000);
const r = await page.evaluate(async () => {
  const e = window.__engine; e.paused = true;
  document.querySelectorAll('#ui-root > *').forEach((d) => { d.style.display = 'none'; });
  const w = window.__world.arena;
  for (let i = 0; i < 6; i++) e.step(1 / 30);
  const on = e.capture('image/jpeg');
  const fogOn = [w.scene.fog.near, w.scene.fog.far];
  const { CONFIG } = await import('/src/core/config.js');
  CONFIG.weather = false;
  e.step(1 / 30);
  const off = e.capture('image/jpeg');
  const visible = w.weather.objects.filter((o) => o.visible).length;
  const res = {
    views: e.views?.length || 1,
    fogOn, fogOff: [w.scene.fog.near, w.scene.fog.far], fogBase: [w.fogBase.near, w.fogBase.far],
    sunOff: e.sun.intensity, sunBase: w.lightBase.sun, volume: !!e.weatherVolume, visible,
    wet: w.groundMat.userData.groundUniforms.uNtWet.value,
  };
  CONFIG.weather = true;
  return { on, off, res };
});
fs.writeFileSync(`${out}-on.jpg`, Buffer.from(r.on.split(',')[1], 'base64'));
fs.writeFileSync(`${out}-off.jpg`, Buffer.from(r.off.split(',')[1], 'base64'));
console.log(JSON.stringify(r.res));
const ok = r.res.views === 2 && Math.abs(r.res.fogOff[1] - r.res.fogBase[1]) < 1e-6 && Math.abs(r.res.sunOff - r.res.sunBase) < 1e-6
  && !r.res.volume && r.res.visible === 0 && r.res.wet === 0 && r.res.fogOn[1] < r.res.fogBase[1];
console.log(ok ? 'PASS' : 'FAIL', errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
process.exit(ok ? 0 : 1);
