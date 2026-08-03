// force P1's taunt in a real battle and shoot it as a filmstrip, so the FX
// (which only exist on a Fighter) can be judged. Runs the game's OWN loop —
// overriding engine.onUpdate stops the frame being drawn at all — so the times
// are wall-clock and approximate.
//   node tools/scratch/tauntshot.mjs <mech> <out.png> [times csv] [gap]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
const [mech = 'wraith', out = '/tmp/t.png', timesArg = '0.5,1.4,2.4,3.0,3.4,4.0', gapArg = '9'] =
  process.argv.slice(2);
const times = timesArg.split(',').map(Number);
const W = 460, H = 560;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 240)));
await page.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=titanus&auto=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await page.waitForTimeout(5000);

await page.evaluate(({ gap }) => {
  const w = window.__world;
  const f = w.fighters[0], e = w.fighters[1];
  f.pos.set(0, 0, 0); f.yaw = 0;
  e.pos.set(gap, 0, 0); e.yaw = -Math.PI / 2;
  e.isAI = false; e.ai = null;
  f.animator.play('taunt');
}, { gap: Number(gapArg) });

const tiles = [];
let now = 0;
for (const t of times) {
  await page.waitForTimeout(Math.max(16, (t - now) * 1000));
  now = t;
  tiles.push({ t, buf: await page.screenshot() });
}
const cols = Math.min(3, tiles.length), rows = Math.ceil(tiles.length / cols);
const lbl = (s) => Buffer.from(`<svg width="${W}" height="26"><text x="8" y="19" font-family="monospace" font-size="15" fill="#ffd9a0">${s}</text></svg>`);
const comp = [];
tiles.forEach((tl, i) => {
  const x = (i % cols) * W, y = Math.floor(i / cols) * H;
  comp.push({ input: tl.buf, left: x, top: y }, { input: lbl(`${mech} ~t=${tl.t}s`), left: x, top: y });
});
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#101520' } })
  .composite(comp).png().toFile(out);
console.log('->', out);
await b.close();
