// Deterministic pose screenshot: freeze one mech at an exact clip time.
//   node tools/pose.mjs <mechId> <clip> <timeSec> <outfile> [cam]
// `cam` is the showcase &cam=<zoom>[,<yaw°>[,<targetY>]] string — e.g. "2,150"
// for a close-up from behind.
// Loads ?showcase=<mechId>&anim=none, steps the Animator to <timeSec> of
// <clip> with fixed 1/120 ticks, freezes it, and screenshots — no more
// guessing SwiftShader wall-clock waits to catch a strike frame.
import { launch } from './lib/browser.mjs';

const [mechId, clip, timeSec, out, cam] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:5173/?showcase=${mechId}&anim=none${cam ? `&cam=${cam}` : ''}`, { waitUntil: 'networkidle' })
  .catch((e) => errors.push(String(e)));
await page.waitForFunction(() => window.__showcaseMechs?.length, null, { timeout: 60000 });
await page.waitForTimeout(4000); // let materials/shadows settle
await page.evaluate(([clipName, t]) => {
  const an = window.__showcaseMechs[0].animator;
  const step = 1 / 120;
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, alwaysReady: true };
  const run = (dur) => { for (let i = 0; i < Math.round(dur / step); i++) an.update(step, ctx); };
  run(1.5);            // settle into the combat stance first
  an.play(clipName);
  run(Number(t));
  an.update = () => {}; // freeze the pose; the render loop keeps drawing it
}, [clip, timeSec]);
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
