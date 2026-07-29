// GAIT SHEET — the stride, frozen, as a filmstrip you can actually judge.
//
//   node tools/gaitsheet.mjs <mech> <out.png> [throttle] [frames] [vsGait]
//
//   node tools/gaitsheet.mjs viper out.png 1 6 standard
//     viper at full throttle, six evenly spaced moments of the cycle, each one
//     showing his CURRENT gait beside a ghost running the `standard` gait —
//     which is exactly the before/after for "the fast mechs walk stiffly".
//
// Drives the gait workbench (/workbench/?edit=gait) through its own headless
// hook, so the poses in the sheet are the poses the game runs: same animator,
// same gait table, same calibration. Leave `vsGait` off and the ghost runs the
// mech's own gait AS SHIPPED, which is the before/after for an uncommitted edit.
//
// SwiftShader renders this ~20x slower than a real GPU, so each frozen frame
// gets a settle wait — the pose smoother needs a few frames to arrive at a
// phase you jumped to.
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const [mech = 'viper', out = 'gait.png', throttle = '1', frames = '6', vs = ''] = process.argv.slice(2);
const N = Math.max(2, Math.min(10, Number(frames) || 6));
const W = 520, H = 620;

const base = process.env.RW_BASE || 'http://localhost:5173';
// `prints=0`: the footprint treadmill re-frames the camera to leave room for the
// trail, and a filmstrip wants the tight framing (nothing is scrolling anyway —
// every frame is frozen)
const url = `${base}/workbench/?edit=gait&mech=${mech}&throttle=${throttle}&compare=1&prints=0`
  + (vs ? `&vs=${vs}` : '');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.__gaitWork?.mech', null, { timeout: 90000 });
await page.waitForTimeout(6000);              // models + first frames

const info = await page.evaluate(async () => {
  const w = window.__gaitWork;
  await w.setCompare(true, new URLSearchParams(location.search).get('vs') || undefined);
  w.hidePanel(true);
  w.setPaused(true);
  return { gait: w.gaitId, mech: w.mech.def.id };
});

const shots = [];
for (let i = 0; i < N; i++) {
  const ph = (i / N) * Math.PI * 2;
  await page.evaluate((p) => window.__gaitWork.setPhase(p), ph);
  await page.waitForTimeout(2200);            // let the pose smoother arrive
  shots.push(await page.screenshot());
}
await browser.close();

// one strip, phase left to right
const tiles = await Promise.all(shots.map((b) => sharp(b).resize(W, H).toBuffer()));
await sharp({ create: { width: W * N, height: H, channels: 3, background: '#151a22' } })
  .composite(tiles.map((input, i) => ({ input, left: i * W, top: 0 })))
  .png().toFile(out);

console.log(`${out} — ${info.mech} · gait '${info.gait}'`
  + ` vs ghost '${vs || `${info.gait} (shipped)`}' · throttle ${throttle} · ${N} phases`);
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 5).join('\n'));
