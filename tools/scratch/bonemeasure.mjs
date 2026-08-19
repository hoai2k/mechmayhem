// BONE MEASURE — the canonical 3D model's real proportions, from its bones.
//   node tools/scratch/bonemeasure.mjs <mech>
// Reports each game joint's bone world position at rest plus the rendered
// vertical extents. THE POINT (docs/ANIME_FIDELITY_GUIDE.md): a concept
// DRAWING carries perspective, so vertical ratios read off its pixels lie —
// an anime-design skeleton (dims override) is derived from THESE numbers,
// and the drawing decides only styling, widths and value pattern.
import { chromium } from 'playwright-core';

const mech = process.argv[2] || 'titanus';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
page.on('pageerror', (e) => console.error('PAGE', String(e).slice(0, 200)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0]?.isGLB, { timeout: 60000 });
await page.waitForTimeout(3000);
const out = await page.evaluate(() => {
  const m = window.__showcaseMechs[0];
  m.group.updateMatrixWorld(true);
  const pos = (o) => { const v = new (o.position.constructor)(); o.getWorldPosition(v); return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) }; };
  const res = { isGLB: !!m.isGLB, bones: {}, virtual: {} };
  // real model bones through the retarget map
  const bm = m.boneMap || m.adapter?.boneMap || null;
  const names = ['hips', 'torso', 'head', 'shoulderL', 'elbowL', 'handL',
    'thighL', 'kneeL', 'ankleL'];
  if (bm) for (const n of names) { if (bm[n]) res.bones[n] = pos(bm[n]); }
  for (const n of names) { if (m.joints?.[n]) res.virtual[n] = pos(m.joints[n]); }
  res.dims = m.dims ? { scale: m.dims.scale, hipHeight: m.dims.hipHeight } : null;
  res.baseHeight = m.baseHeight ?? null;
  // measure real top/bottom from geometry
  let minY = 1e9, maxY = -1e9;
  m.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry; const p = g.attributes.position;
    if (!p) return;
    o.updateWorldMatrix(true, false);
    const mtx = o.matrixWorld.elements;
    // skinned meshes: approximate with bind positions through matrixWorld —
    // rest pose, good enough for landmark ratios
    for (let i = 0; i < p.count; i += 23) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const wy = mtx[1] * x + mtx[5] * y + mtx[9] * z + mtx[13];
      if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
    }
  });
  res.geomY = { min: +minY.toFixed(3), max: +maxY.toFixed(3) };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
