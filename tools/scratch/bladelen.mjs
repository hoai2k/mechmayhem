// how long is viper's blade, really — the farthest skinned vertex owned by the
// forearm/hand, measured along the elbow->hand axis at rest.
import { launch } from '../lib/browser.mjs';
const mech = process.argv[2] || 'viper';
const b = await launch();
const page = await b.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 45000 });
console.log(JSON.stringify(await page.evaluate(() => {
  const m = window.__showcaseMechs[0];
  const out = {};
  let mesh = null;
  m.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) return { err: 'no skinned mesh' };
  const sk = mesh.skeleton, g = mesh.geometry;
  const names = sk.bones.map((x) => x.name);
  const bi = g.attributes.skinIndex, bw = g.attributes.skinWeight, pos = g.attributes.position;
  for (const side of ['L', 'R']) {
    const hb = m.boneMap?.['hand' + side], eb = m.boneMap?.['elbow' + side];
    if (!hb || !eb) { out[side] = 'missing'; continue; }
    const hi = names.indexOf(hb.name), ei = names.indexOf(eb.name);
    // rest-pose bone frame: elbow -> hand direction, both in world
    hb.updateWorldMatrix(true, false); eb.updateWorldMatrix(true, false);
    const he = hb.matrixWorld.elements, ee = eb.matrixWorld.elements;
    const hp = [he[12], he[13], he[14]], ep = [ee[12], ee[13], ee[14]];
    const d = [hp[0] - ep[0], hp[1] - ep[1], hp[2] - ep[2]];
    const L = Math.hypot(...d), u = d.map((v) => v / L);
    // world position of each vertex at bind = mesh matrixWorld * position (bind pose)
    let best = -1e9, bestP = null, n = 0;
    const mw = mesh.matrixWorld.elements;
    for (let v = 0; v < pos.count; v++) {
      let own = -1, w = 0;
      for (let k = 0; k < 4; k++) {
        const idx = bi.getComponent(v, k), ww = bw.getComponent(v, k);
        if (ww > w) { w = ww; own = idx; }
      }
      if (own !== hi && own !== ei) continue;
      n++;
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const wx = mw[0] * x + mw[4] * y + mw[8] * z + mw[12];
      const wy = mw[1] * x + mw[5] * y + mw[9] * z + mw[13];
      const wz = mw[2] * x + mw[6] * y + mw[10] * z + mw[14];
      const t = (wx - ep[0]) * u[0] + (wy - ep[1]) * u[1] + (wz - ep[2]) * u[2];
      if (t > best) { best = t; bestP = [wx, wy, wz]; }
    }
    out[side] = { bone: hb.name, forearm: +L.toFixed(3), reach: +best.toFixed(3),
      ratio: +(best / L).toFixed(3), verts: n, tip: bestP?.map((v) => +v.toFixed(2)) };
  }
  return out;
})));
await b.close();
