// Is an exported anchor still where it was authored?
//
// An anchor is a RIGID CHILD of a bone, so the pose-independent quantity is its
// offset from that bone's origin, in the bone's own frame. Comparing WORLD
// positions is wrong: the game build is posed and the export is at bind, so the
// same correct anchor reads as metres out. This measures the offset's LENGTH
// (as a fraction of body height, which cancels the units) on both sides.
//
//   node tools/scratch/anchorprobe.mjs <mech> <exported.glb>
import { launch } from '../lib/browser.mjs';
import fs from 'fs';

const PORT = process.env.PORT || '5175';
const id = process.argv[2] || 'titanus';
const b64 = fs.readFileSync(process.argv[3]).toString('base64');

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page]', m.text().slice(0, 160)); });
await page.goto(`http://127.0.0.1:${PORT}/?export=__probe`, { waitUntil: 'networkidle' });

const out = await page.evaluate(async ({ id, b64 }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { buildGlbForTool } = await import('/src/mechs/gltf.js');
  const { ROSTER } = await import('/src/mechs/roster.js');

  // offset length from the host bone, over body height, per anchor
  const measure = (root, anchors, H) => {
    const res = {};
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const [name, node] of Object.entries(anchors)) {
      if (!node) continue;
      let host = null;
      for (let p = node.parent; p; p = p.parent) if (p.isBone) { host = p; break; }
      if (!host) { res[name] = { host: '(virtual)', d: null }; continue; }
      host.updateWorldMatrix(true, false);
      node.updateWorldMatrix(true, false);
      a.setFromMatrixPosition(node.matrixWorld);
      b.setFromMatrixPosition(host.matrixWorld);
      res[name] = { host: host.name, d: a.distanceTo(b) / H };
    }
    return res;
  };

  const def = ROSTER.find((d) => d.id === id);
  const { mech } = await buildGlbForTool(def);
  mech.group.updateMatrixWorld(true);
  const gbox = new THREE.Box3().setFromObject(mech.group);
  const game = measure(mech.group, mech.anchors || {}, gbox.max.y - gbox.min.y);

  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer, '', res, rej));
  gltf.scene.updateMatrixWorld(true);
  const ebox = new THREE.Box3().setFromObject(gltf.scene);
  const eAnch = {};
  gltf.scene.traverse((o) => { if (o.name?.startsWith('anchor_')) eAnch[o.name.slice(7)] = o; });
  const exp = measure(gltf.scene, eAnch, ebox.max.y - ebox.min.y);

  return { gh: gbox.max.y - gbox.min.y, eh: ebox.max.y - ebox.min.y, game, exp };
}, { id, b64 });

await browser.close();

console.log(`\n${id}   game height ${out.gh.toFixed(3)}   export height ${out.eh.toFixed(3)}`);
console.log('\nanchor      host bone      offset from bone, as % of body height');
console.log('                           game      export     ratio');
let worst = 0, worstN = '';
for (const n of Object.keys(out.game)) {
  const g = out.game[n], e = out.exp[n];
  if (!e) { console.log(`${n.padEnd(10)}  MISSING FROM EXPORT`); continue; }
  if (g.d == null || e.d == null) { console.log(`${n.padEnd(10)} ${String(g.host).padEnd(14)} (virtual host)`); continue; }
  const ratio = e.d > 1e-9 || g.d > 1e-9 ? (g.d > 1e-9 ? e.d / g.d : Infinity) : 1;
  const off = Math.abs(g.d - e.d);
  if (off > worst) { worst = off; worstN = n; }
  console.log(`${n.padEnd(10)} ${String(e.host).padEnd(14)} ${(g.d * 100).toFixed(2).padStart(7)}%  ${(e.d * 100).toFixed(2).padStart(7)}%   ${ratio.toFixed(3)}x`);
}
console.log(`\nworst anchor displacement: ${(worst * 100).toFixed(2)}% of body height (${worstN})`);
console.log('ratio 1.000 = the anchor sits where it was authored.');
