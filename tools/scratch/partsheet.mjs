// PART SHEET — a compound assembly (hand, foot, head…) close up, from four
// angles, as one tile sheet. The full-figure front view is where assembly
// incoherence HIDES: a hand can read fine head-on and be a mitten from the
// side. See docs/ANIME_FIDELITY_GUIDE.md (assembly turnarounds).
//   node tools/scratch/partsheet.mjs <mech> <joint> <out.png> [render] [dist] [lookDown]
//   node tools/scratch/partsheet.mjs titanus handR /tmp/hand.png anime 4.5 0.5
import { launch } from '../lib/browser.mjs';
import sharp from 'sharp';

const [mech = 'titanus', joint = 'handR', out = '/tmp/part.png',
  render = 'anime', distS = '4.5', lookDownS = '0.5'] = process.argv.slice(2);
const dist = +distS, lookDown = +lookDownS;
const T = 420;
const base = process.env.RW_BASE || 'http://localhost:5173';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: T, height: T } });
page.on('pageerror', (e) => console.error('PAGE', String(e).slice(0, 160)));
await page.goto(`${base}/?showcase=${mech}&anim=none&render=${render}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 60000 });

const tiles = [];
for (const yaw of [0, 0.8, Math.PI / 2, Math.PI]) {
  const ok = await page.evaluate(({ joint, yaw, dist, lookDown }) => {
    const m = window.__showcaseMechs[0], engine = window.__showcaseEngine;
    engine.onUpdate = () => {};
    const j = m.joints?.[joint];
    if (!j) return false;
    const v = new (j.position.constructor)(); j.getWorldPosition(v);
    const cam = engine.camera;
    cam.position.set(v.x + Math.sin(yaw) * dist, v.y + dist * 0.18, v.z + Math.cos(yaw) * dist);
    cam.lookAt(v.x, v.y - lookDown, v.z);
    cam.updateProjectionMatrix();
    engine.scene.updateMatrixWorld(true);
    return true;
  }, { joint, yaw, dist, lookDown });
  if (!ok) { console.error(`no joint "${joint}" on ${mech}`); process.exit(1); }
  await page.waitForTimeout(2500);
  tiles.push(await page.screenshot());
}
await browser.close();
const labels = ['front', '3/4', 'side', 'back'];
const comps = tiles.flatMap((t, i) => [
  { input: t, left: (i % 2) * T, top: Math.floor(i / 2) * T },
  { input: Buffer.from(`<svg width="120" height="26"><text x="8" y="19" font-family="monospace" font-size="16" fill="#ffd9a0">${labels[i]}</text></svg>`),
    left: (i % 2) * T + 6, top: Math.floor(i / 2) * T + 4 },
]);
await sharp({ create: { width: T * 2, height: T * 2, channels: 3, background: '#141a26' } })
  .composite(comps).png().toFile(out);
console.log(`${mech} ${joint} (${render}) -> ${out}`);
