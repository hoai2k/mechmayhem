// SIDE (and front) profile of a mech's LEG CHAIN, from geometry:
//  - GLB: bind-pose vertices bucketed by dominant skin bone (thigh/knee/ankle)
//  - procedural/anime: mesh vertices under the leg joints
// Reports per y-band: z-extent (side profile) and x-extent (front profile),
// in world units. node sideprofile.mjs <mech> <render: models|anime>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/user/mechmayhem/node_modules/playwright-core');
const [mech = 'titanus', render = 'models'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 200, height: 150 } });
page.on('pageerror', (e) => console.error('PAGE', String(e).slice(0, 160)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none&render=${render}`,
  { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 60000 });
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const m = window.__showcaseMechs[0];
  m.group.updateMatrixWorld(true);
  const bands = [];                       // world y bands, bottom to top
  for (let y = 0; y < 4.2; y += 0.3) bands.push([y, y + 0.3]);
  const acc = bands.map(() => ({ zmin: 1e9, zmax: -1e9, xmin: 1e9, xmax: -1e9, n: 0 }));
  const feed = (wx, wy, wz) => {
    const bi = Math.floor(wy / 0.3);
    if (bi < 0 || bi >= acc.length) return;
    const a = acc[bi];
    if (wz < a.zmin) a.zmin = wz; if (wz > a.zmax) a.zmax = wz;
    if (wx < a.xmin) a.xmin = wx; if (wx > a.xmax) a.xmax = wx;
    a.n++;
  };
  if (m.isGLB && m.boneMap) {
    // bind-pose vertices of the RIGHT leg bones, through the mesh matrix
    let sk = null;
    m.group.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
    const bones = sk.skeleton.bones;
    const want = new Set();
    for (const n of ['thighR', 'kneeR', 'ankleR']) {
      const b = m.boneMap[n];
      const i = bones.indexOf(b);
      if (i >= 0) want.add(i);
      // include children of the ankle (toes) — walk down
      if (b) b.traverse((c) => { const j = bones.indexOf(c); if (j >= 0) want.add(j); });
    }
    const g = sk.geometry;
    const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    sk.updateWorldMatrix(true, false);
    const e = sk.matrixWorld.elements;
    for (let i = 0; i < pos.count; i += 3) {
      // dominant bone
      let bi = si.getX(i), bw = sw.getX(i);
      if (sw.getY(i) > bw) { bw = sw.getY(i); bi = si.getY(i); }
      if (sw.getZ(i) > bw) { bw = sw.getZ(i); bi = si.getZ(i); }
      if (sw.getW(i) > bw) { bw = sw.getW(i); bi = si.getW(i); }
      if (!want.has(bi)) continue;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      feed(e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
  } else {
    const roots = ['thighR', 'kneeR', 'ankleR'].map((n) => m.joints[n]).filter(Boolean);
    for (const root of roots) {
      root.traverse((o) => {
        if (!o.isMesh || o.userData.rwInk) return;
        const p = o.geometry?.attributes?.position; if (!p) return;
        o.updateWorldMatrix(true, false);
        const e = o.matrixWorld.elements;
        for (let i = 0; i < p.count; i += 3) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          feed(e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14]);
        }
      });
    }
  }
  return bands.map(([y0, y1], i) => {
    const a = acc[i];
    if (!a.n) return null;
    return { y: +((y0 + y1) / 2).toFixed(2),
      z: [+a.zmin.toFixed(2), +a.zmax.toFixed(2)], d: +(a.zmax - a.zmin).toFixed(2),
      x: [+a.xmin.toFixed(2), +a.xmax.toFixed(2)], w: +(a.xmax - a.xmin).toFixed(2) };
  }).filter(Boolean);
});
console.log(render, mech);
for (const b of out) console.log(`y=${b.y}  depth=${b.d} z[${b.z}]  width=${b.w} x[${b.x}]`);
await browser.close();
