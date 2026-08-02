// CLIP SHEET — an action clip, frozen, as a filmstrip you can actually judge.
//
//   node tools/clipsheet.mjs <mech> <clip> [out.png] [frames] [view]
//
//   node tools/clipsheet.mjs konga taunt /tmp/konga.png 8 front
//     konga's taunt at eight evenly spaced moments, shot head-on.
//
// The same idea as tools/gaitsheet.mjs, for the thing a gait sheet cannot
// show: a one-shot clip. It drives the showcase's animator DETERMINISTICALLY
// — the engine's own update is unhooked and the animator is stepped at a fixed
// 1/60 — so the pose in frame n is the pose the game plays at that time, not
// whatever a screenshot wait happened to land on under SwiftShader.
//
// Each frame settles for a few extra steps at its own time before the shot,
// because the animator SMOOTHS toward its pose target: sampling the instant
// after a jump reports the pose the clip is heading for rather than the one it
// is in. Stepping from t=0 every frame (rather than continuing) keeps the
// smoothing history right — a clip is a trajectory, and a frame taken by
// jumping straight to 0.9s is a pose the body never actually passes through.
//
// `view`: front (default) | side | back | q (three-quarter). The camera frames
// the mech's own measured height, so a crab and a colossus both fill the tile.
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const [mech = 'titanus', clip = 'taunt', out = '/tmp/clip.png', framesArg = '8', view = 'front'] =
  process.argv.slice(2);
const N = Math.max(2, Math.min(12, Number(framesArg) || 8));
const W = 420, H = 560;
const base = process.env.RW_BASE || 'http://localhost:5173';

const VIEWS = { front: 0, q: Math.PI * 0.25, side: Math.PI * 0.5, back: Math.PI };
const yaw = VIEWS[view] ?? VIEWS.front;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(`${base}/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 45000 });

// Frame the mech on its own measured height, from `yaw` around it, and take
// the clip's duration off the resolved clip — which is the per-mech override
// where there is one, exactly what the game will play.
const dur = await page.evaluate(({ yaw, clip }) => {
  const m = window.__showcaseMechs[0], engine = window.__showcaseEngine;
  engine.onUpdate = () => {};                       // we own the clock now
  const h = m.dims?.height || 7;
  const cam = engine.camera;
  const d = h * 2.7;
  cam.position.set(Math.sin(yaw) * d, h * 0.66, Math.cos(yaw) * d);
  cam.lookAt(0, h * 0.5, 0);
  cam.updateProjectionMatrix();
  m.animator.action = null;
  m.animator.play(clip);
  return m.animator.action ? m.animator.action.clip.dur : null;
}, { yaw, clip });
if (!dur) { console.error(`no clip "${clip}" on ${mech}`); await browser.close(); process.exit(1); }

const times = [];
const total = dur;
for (let i = 0; i < N; i++) times.push(+(total * (i / (N - 1))).toFixed(3));

const tiles = [];
for (const t of times) {
  const ok = await page.evaluate(({ clip, t }) => {
    const m = window.__showcaseMechs[0], a = m.animator;
    const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
    const dt = 1 / 60;
    a.action = null;
    for (let i = 0; i < 90; i++) a.update(dt, ctx);      // settle to rest
    a.play(clip);
    if (!a.action) return false;
    const n = Math.max(0, Math.round(t / dt));
    for (let i = 0; i < n; i++) a.update(dt, ctx);
    window.__showcaseEngine.scene.updateMatrixWorld(true);
    return true;
  }, { clip, t });
  if (!ok) { console.error(`no clip "${clip}" on ${mech}`); await browser.close(); process.exit(1); }
  await page.waitForTimeout(220);   // let the renderer catch up under SwiftShader
  tiles.push({ t, buf: await page.screenshot() });
}

const cols = Math.min(4, N), rows = Math.ceil(N / cols);
const svgLabel = (txt) => Buffer.from(
  `<svg width="${W}" height="26"><text x="8" y="19" font-family="monospace" font-size="16" fill="#ffd9a0">${txt}</text></svg>`);
const composites = [];
for (let i = 0; i < tiles.length; i++) {
  const x = (i % cols) * W, y = Math.floor(i / cols) * H;
  composites.push({ input: tiles[i].buf, left: x, top: y });
  composites.push({ input: svgLabel(`${mech} ${clip}  t=${tiles[i].t.toFixed(2)}s`), left: x, top: y });
}
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#141a26' } })
  .composite(composites).png().toFile(out);

console.log(`${mech} ${clip}: ${N} frames over ${total.toFixed(2)}s -> ${out}`);
if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 5).join('\n'));
await browser.close();
