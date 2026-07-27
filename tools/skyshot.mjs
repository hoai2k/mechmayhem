// Sky/horizon/prop inspector: loads a battle, freezes the camera system and
// aims a camera by hand, so the generated sky panorama, horizon ring and prop
// textures can actually be judged (the game camera looks down at the fight).
//
//   node skyshot.mjs <url> <out.png> <waitMs> [pitchDeg] [yawDeg] [height]
//   node skyshot.mjs <url> <out.png> <waitMs> prop:<propName> [dist]
//
// The prop form frames the nearest instance of that prop (placeProp names
// every group `prop:<name>`) from `dist` metres away.
import { chromium } from 'playwright-core';

const [url, out, waitMs = '25000', pitch = '8', yaw = '0', height = '14'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => errors.push(String(e)));
await page.waitForTimeout(Number(waitMs));
const framing = String(pitch).startsWith('prop:')
  ? { prop: String(pitch).slice(5), dist: Number(yaw) || 14 } : null;
const info = await page.evaluate(([p, y, h, frame]) => {
  const w = window.__world;
  if (!w) return { err: 'no __world' };
  const e = w.engine;
  e.onRender = null;                       // stop the camera system fighting us
  const cam = e.camera;
  if (frame) {
    // frame the nearest live instance of a named prop
    let best = null, bestD = Infinity;
    e.scene.traverse((o) => {
      if (o.name !== `prop:${frame.prop}` || !o.visible) return;
      const d = Math.hypot(o.position.x, o.position.z);
      if (d < bestD) { bestD = d; best = o; }
    });
    if (!best) return { err: `no prop:${frame.prop} in scene` };
    const c = best.position;
    const a = Math.atan2(c.x, c.z);
    cam.position.set(c.x + Math.sin(a) * frame.dist, 4.5, c.z + Math.cos(a) * frame.dist);
    cam.lookAt(c.x, 3, c.z);
    return { framed: frame.prop, at: [Math.round(c.x), Math.round(c.z)], dist: frame.dist };
  }
  const ry = (y * Math.PI) / 180, rp = (p * Math.PI) / 180;
  cam.position.set(0, Number(h), 0);
  cam.rotation.set(rp, ry, 0, 'YXZ');
  return {
    fogNear: w.scene.fog?.near, fogFar: w.scene.fog?.far,
    wrapHalf: w.wrapHalf, period: w.wrapHalf * 2,
    hasPano: !!e.scene.children.find((c) => c.material?.uniforms?.uHasPano?.value),
  };
}, [Number(pitch), Number(yaw), Number(height), framing]);
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
console.log(JSON.stringify(info));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
