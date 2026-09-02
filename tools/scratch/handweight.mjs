// WHAT DOES EACH BONE ACTUALLY OWN? Counts the vertices whose DOMINANT weight
// is each named joint, with the bounding box of that geometry — the same
// "dominant weight" rule seamcut, dropgeo and the skin audit use.
//
//   node tools/scratch/handweight.mjs <mech> [bone ...]
//
// A limb that looks bare on screen is usually a limb whose vertices were handed
// to its PARENT: the count says so immediately, and the L/R pair says whether
// it is the model or the binding.
import { launch } from '../lib/browser.mjs';
const [mech = 'saurion', ...want] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 320, height: 240 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await p.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 150000 });

const out = await p.evaluate(({ want }) => {
  const m = window.__showcaseMechs[0];
  let mesh = null;
  m.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) return { err: 'no skinned mesh' };
  const sk = mesh.skeleton, g = mesh.geometry;
  const names = sk.bones.map((x) => x.name);
  const bi = g.attributes.skinIndex, bw = g.attributes.skinWeight, pos = g.attributes.position;
  const own = new Map();     // bone index -> {n, box}
  for (let v = 0; v < pos.count; v++) {
    let d = -1, w = 0;
    for (let k = 0; k < 4; k++) {
      const i = bi.getComponent(v, k), ww = bw.getComponent(v, k);
      if (ww > w) { w = ww; d = i; }
    }
    if (d < 0) continue;
    let e = own.get(d);
    if (!e) own.set(d, e = { n: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] });
    e.n++;
    const P = [pos.getX(v), pos.getY(v), pos.getZ(v)];
    for (let a = 0; a < 3; a++) { if (P[a] < e.lo[a]) e.lo[a] = P[a]; if (P[a] > e.hi[a]) e.hi[a] = P[a]; }
  }
  // report the game joints (through boneMap) plus anything asked for by name
  const rows = [];
  const add = (label, boneName) => {
    const idx = names.indexOf(boneName);
    const e = idx >= 0 ? own.get(idx) : null;
    rows.push({ label, bone: boneName, n: e ? e.n : 0,
      mid: e ? [+(e.sx / e.n).toFixed(3), +(e.sy / e.n).toFixed(3), +(e.sz / e.n).toFixed(3)] : null,
      size: e ? [+(e.hi[0] - e.lo[0]).toFixed(3), +(e.hi[1] - e.lo[1]).toFixed(3), +(e.hi[2] - e.lo[2]).toFixed(3)] : null });
  };
  const joints = ['shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR'];
  for (const extra of ['bone_42', 'bone_29']) add('(mid) ' + extra, extra);
  for (const j of joints) { const bn = m.boneMap?.[j]; if (bn) add(j, bn.name); }
  for (const w of want) add('(asked) ' + w, w);
  return { total: pos.count, rows, bones: names.length };
}, { want });
await b.close();
if (out.err) { console.error(out.err); process.exit(1); }
console.log(`${mech}: ${out.total} vertices, ${out.bones} bones`);
console.log('joint        bone            verts   centroid            own bbox');
for (const r of out.rows) {
  console.log(`${r.label.padEnd(12)} ${r.bone.padEnd(15)} ${String(r.n).padStart(6)}   ${(r.mid ? r.mid.join(',') : '-').padEnd(20)}${r.size ? r.size.join(' x ') : '-'}`);
}
