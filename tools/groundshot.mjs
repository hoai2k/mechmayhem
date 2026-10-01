// GROUND JUDGING SHOTS — the arena floor from a fixed camera, no fighters in
// the way, with the shader's fold correction on and off.
//
//   node tools/groundshot.mjs <theme> <out-prefix> [--relief0] [--h 9] [--far 46] [--x 0 --z 0]
//
// Writes <out-prefix>-fix.jpg and <out-prefix>-nofix.jpg (the second with the
// measured fold profile zeroed, i.e. the raw mirrored texture through the same
// anti-tiling shader). --relief0 loads with ?relief=0 for the flat baseline.
// The camera stands h units up at (x, z) looking `far` units along +z, which is
// roughly the chase camera's view of the ground without a mech filling it.
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const VALUED = new Set(['--h', '--far', '--x', '--z', '--yaw']);
const [theme, out] = args.filter((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1]));
const relief0 = args.includes('--relief0');
const h = opt('--h', 9), far = opt('--far', 46), x = opt('--x', 0), z = opt('--z', 0), yaw = opt('--yaw', 0);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?battle=${theme}&p1=titanus&p2=viper&music=0&seed=7&postfx=off${relief0 ? '&relief=0' : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__world && window.__engine && window.__fighters?.length >= 2, null, { timeout: 240000 });
await page.waitForTimeout(25000);   // textures land
const shots = await page.evaluate(({ h, far, x, z, yaw }) => {
  const e = window.__engine;
  e.paused = true;
  window.__ais.length = 0;
  for (const f of window.__fighters) f.group.visible = false;
  document.querySelectorAll('#ui-root > *').forEach((d) => { d.style.display = 'none'; });
  e.onRender = null;
  const cam = e.camera;
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const g = window.__world.groundY(x, z);
  cam.position.set(x, g + h, z);
  cam.up.set(0, 1, 0);
  cam.lookAt(x + dx * far, window.__world.groundY(x + dx * far, z + dz * far), z + dz * far);
  const mat = window.__world.arena.groundMat;
  const U = mat?.userData?.groundUniforms;
  const res = { fix: e.capture('image/jpeg') };
  if (U?.uNtFA) {
    const keep = U.uNtFA.value.map((v) => v.clone());
    const keepN = U.uNtFN.value.map((v) => v.clone());
    const keepR = U.uNtFR.value.map((v) => v.clone());
    for (const arr of [U.uNtFA, U.uNtFN, U.uNtFR]) arr.value.forEach((v) => v.set(0, 0, 0, 0));
    res.nofix = e.capture('image/jpeg');
    U.uNtFA.value.forEach((v, i) => v.copy(keep[i]));
    U.uNtFN.value.forEach((v, i) => v.copy(keepN[i]));
    U.uNtFR.value.forEach((v, i) => v.copy(keepR[i]));
  }
  return res;
}, { h, far, x, z, yaw });
const fs = await import('node:fs');
for (const [k, v] of Object.entries(shots)) {
  fs.writeFileSync(`${out}-${k}.jpg`, Buffer.from(v.split(',')[1], 'base64'));
  console.log('wrote', `${out}-${k}.jpg`);
}
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
