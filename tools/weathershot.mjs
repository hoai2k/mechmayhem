// WEATHER SHOTS — an arena's weather at chosen intensities, through the real
// chase camera and the real post chain (the weather volume lives in the haze
// pass, so `postfx` stays on).
//
//   node tools/weathershot.mjs <theme> <out-prefix> [--k 0.15,0.5,1] [--kind rain|snow|ash|dust]
//        [--steps 8] [--hidefighters] [--strike] [--cam x,y,z,lx,ly,lz]
//
// --strike throws a lightning bolt just before each capture (rain arenas with
// lightning: neon, jungle).
//
// Writes <out-prefix>-k<k>.jpg per intensity. The climate is PINNED at each k
// (the regime and its gusts keep running on top, as in a match), the ground is
// given the wetness that much rain would have built, and the sim is stepped a
// few frames so the drops are mid-fall. Precipitation here is GEOMETRY, so —
// unlike the particle pools — it renders under SwiftShader and these pictures
// are evidence.
import { launch } from './lib/browser.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VALUED = new Set(['--k', '--kind', '--steps', '--cam', '--mech']);
const [theme, out] = args.filter((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1]));
if (!theme || !out) {
  console.log('usage: node tools/weathershot.mjs <theme> <out-prefix> [--k 0.15,0.5,1] [--kind k]');
  process.exit(1);
}
const ks = opt('--k', '0.15,0.5,1').split(',').map(Number);
const kind = opt('--kind', 'force');
const steps = +opt('--steps', 8);
const cam = opt('--cam', null)?.split(',').map(Number);
const mech = opt('--mech', 'titanus');

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto(`http://localhost:5173/?battle=${theme}&p1=${mech}&p2=viper&music=0&seed=7&weather=${kind}&weatherk=${ks[0]}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__world && window.__engine && window.__fighters?.length >= 2, null, { timeout: 240000 });
await page.waitForTimeout(16000);   // textures, and the fight settling into view
const info = await page.evaluate(() => {
  const w = window.__world.arena.weather;
  window.__engine.paused = true;
  document.querySelectorAll('#ui-root > *').forEach((d) => { d.style.display = 'none'; });
  return w ? { kind: w.kind } : null;
});
if (!info) { console.log('no weather on this arena'); await browser.close(); process.exit(1); }
console.log('weather:', info.kind);
for (const k of ks) {
  const shot = await page.evaluate(({ k, steps, hide, cam, strike }) => {
    const e = window.__engine, w = window.__world.arena.weather;
    w.climate.pin = k; w.climate.k = k; w.climate.target = k;
    if (w.kind === 'rain') w.wet = Math.min(1, k * 1.6);
    if (hide) for (const f of window.__fighters) f.group.visible = false;
    for (let i = 0; i < steps; i++) e.step(1 / 30);
    if (strike && w.bolt) { w._strike(); e.step(1 / 60); }
    if (cam) {
      e.onRender = null;
      e.camera.position.set(cam[0], cam[1], cam[2]);
      e.camera.lookAt(cam[3], cam[4], cam[5]);
      e.step(1 / 30);
    }
    return e.capture('image/jpeg');
  }, { k, steps, hide: args.includes('--hidefighters'), cam, strike: args.includes('--strike') });
  const f = `${out}-k${k}.jpg`;
  fs.writeFileSync(f, Buffer.from(shot.split(',')[1], 'base64'));
  console.log('wrote', f);
}
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 6).join('\n') : 'no page errors');
await browser.close();
