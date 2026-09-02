// rawislands: dump a GLB's skin islands in MESH-LOCAL (bind) space — the
// coordinates you author a custom rig from (src/mechs/rigs/<id>.rig.js). Prints
// each island's vertex count, current dominant bone, centroid and bbox.
//   node tools/rawislands.mjs <mechId> [alt]
import { launch } from './lib/browser.mjs';
const [id, alt] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto('http://localhost:5173/?rigtest', { waitUntil: 'networkidle' });
const rows = await p.evaluate(async ({ id, alt }) => {
  const { loadRawGlbScene } = await import('/src/mechs/gltf.js');
  const { analyzeSkin } = await import('/src/mechs/skinops.js');
  const raw = await loadRawGlbScene(id, { alt: !!alt });
  if (!raw) return null;
  let mesh = null; raw.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const a = analyzeSkin(mesh);
  const pos = mesh.geometry.attributes.position;
  return a.comps.filter((c) => c.count >= 200).map((c) => {
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9, sx = 0, sy = 0, sz = 0;
    for (const v of c.verts) { const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v); sx += x; sy += y; sz += z; mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z); }
    const n = c.verts.length;
    return { id: c.id, n: c.count, bone: c.boneName, c: [+(sx / n).toFixed(2), +(sy / n).toFixed(2), +(sz / n).toFixed(2)], bbox: [+(mxx - mnx).toFixed(2), +(mxy - mny).toFixed(2), +(mxz - mnz).toFixed(2)] };
  });
}, { id, alt });
if (!rows) { console.log('no GLB for', id, alt ? '(alt)' : ''); await b.close(); process.exit(0); }
console.log(`${id}${alt ? ' (alt)' : ''}: ${rows.length} islands (>=200 verts), mesh-local coords`);
console.log('id'.padStart(4), 'n'.padStart(6), 'bone'.padEnd(22), 'centroid'.padEnd(22), 'bboxWHD');
for (const r of rows) console.log(String(r.id).padStart(4), String(r.n).padStart(6), r.bone.padEnd(22), JSON.stringify(r.c).padEnd(22), JSON.stringify(r.bbox));
await b.close();
