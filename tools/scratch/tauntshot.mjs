// Force P1's taunt in a real battle and shoot it as a filmstrip, so the FX
// (which only exist on a Fighter) can be judged.
//
//   node tools/scratch/tauntshot.mjs <mech> <out.png> [times csv] [gap]
//   node tools/scratch/tauntshot.mjs wraith /tmp/t.png 2.7,2.95,3.1,3.25,3.4 9
//
// GAME TIME, NOT WALL CLOCK. This used to sleep between shots and label the
// frames "~t=", because SwiftShader runs the game about 20x slow and the times
// were whatever the sleeps happened to land on — useless for anything shorter
// than a second, and wraith's dispersal is half of one. The engine has the
// answer already: `paused` stops RAF advancing the sim while it keeps
// presenting frames, `step(dt)` advances it by exactly what you ask, and
// `capture()` draws and reads in the same synchronous call (through the real
// post chain). So the times below are the times.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
const [mech = 'wraith', out = '/tmp/t.png', timesArg = '0.5,1.4,2.4,3.0,3.4,4.0', gapArg = '9'] =
  process.argv.slice(2);
const times = timesArg.split(',').map(Number).sort((a, b) => a - b);
const W = 460, H = 560;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 240)));
await page.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=titanus&auto=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await page.waitForTimeout(5000);

await page.evaluate(({ gap }) => {
  const w = window.__world, eng = window.__engine;
  const f = w.fighters[0], e = w.fighters[1];
  f.pos.set(0, 0, 0); f.yaw = 0;
  // the partner goes BEHIND THE CAMERA rather than off to one side: a mech
  // stood beside the subject is a mech the tile has to spend pixels on, and the
  // chase cam is off anyway. `gap` is how far back.
  e.pos.set(0, 0, gap); e.yaw = Math.PI;
  // NOBODY DRIVES EITHER BODY. The taunt is `cancelOnMove`, so an AI that
  // decides to close the distance cancels it on the first frame and the whole
  // capture is of a mech standing still — which is what moving the partner out
  // of reach caused the first time this was tried.
  window.__ais.length = 0;
  for (const x of [f, e]) { x.isAI = false; x.ai = null; }
  eng.paused = true;                    // we own the clock; RAF keeps drawing
  // …AND THE CAMERA. The chase cam frames BOTH fighters, so it swings behind
  // whoever is nearer and puts the sparring partner between you and the thing
  // you came to look at. onRender is where it updates, so dropping it and
  // parking the camera by hand is what makes the frames comparable to each
  // other — the subject is in the same place in every tile.
  eng.onRender = null;
  const h = f.baseHeight || 7;
  const cam = eng.camera;
  window.__lockCam = () => {
    cam.position.set(-h * 1.5, h * 1.25, h * 2.6);
    cam.lookAt(0, h * 0.85, 0);
    cam.updateProjectionMatrix();
  };
  window.__lockCam();
  f.animator.play('taunt');
}, { gap: Number(gapArg) });

const tiles = [];
let now = 0;
for (const t of times) {
  const stat = await page.evaluate(({ dtTotal }) => {
    const eng = window.__engine, w = window.__world;
    // ONE step() call for the whole gap, not one per frame: step() subdivides
    // internally (1/30 sub-steps) and renders ONCE at the end, while a loop of
    // step(1/60) renders every sub-step — 168 SwiftShader frames to reach 2.8s,
    // which is minutes of wall clock for a picture nobody sees.
    if (dtTotal > 0) eng.step(dtTotal);
    window.__lockCam();
    const f = w.fighters[0];
    // the detached apparition(s), if any, and how solid each body is
    let shells = 0, shellOp = 0, shellScale = 0;
    for (const o of w.scene.children) {
      // .some(), not children[0]: only the SKINNED mesh is baked, and a body
      // whose first child is a plain mesh (wraith's rifle) reported no shell
      if (o.isGroup && o.children.some((c) => c.userData?.bakedGeo)) {
        shells++; shellScale = o.scale.x; shellOp = o.children[0].material.opacity;
      }
    }
    let bodyOp = 1;
    f.group.traverse((o) => { if (o.isMesh) bodyOp = Math.min(bodyOp, o.material.opacity); });
    return { scale: +f.scale.toFixed(2), bodyOp: +bodyOp.toFixed(2),
      shells, shellOp: +shellOp.toFixed(2), shellScale: +shellScale.toFixed(2) };
  }, { dtTotal: t - now });
  now = t;
  console.log(`  t=${String(t).padStart(5)}s  body x${stat.scale} op ${stat.bodyOp}`
    + `  ·  apparitions ${stat.shells} (x${stat.shellScale}, op ${stat.shellOp})`);
  const uri = await page.evaluate(() => window.__engine.capture());
  tiles.push({ t, buf: Buffer.from(uri.split(',')[1], 'base64') });
}
if (errs.length) console.error('PAGE ERRORS:\n' + errs.join('\n'));

const cols = Math.min(3, tiles.length), rows = Math.ceil(tiles.length / cols);
const lbl = (s) => Buffer.from(`<svg width="${W}" height="26"><text x="8" y="19" font-family="monospace" font-size="15" fill="#ffd9a0">${s}</text></svg>`);
const comp = [];
tiles.forEach((tl, i) => {
  const x = (i % cols) * W, y = Math.floor(i / cols) * H;
  comp.push({ input: tl.buf, left: x, top: y }, { input: lbl(`${mech} t=${tl.t}s`), left: x, top: y });
});
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#101520' } })
  .composite(comp).png().toFile(out);
console.log('->', out);
await b.close();
