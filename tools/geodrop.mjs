// GEO DROP — find a lump of sculpted geometry, and emit the patch that deletes it.
//
//   node tools/geodrop.mjs <mech>                       list the islands
//   node tools/geodrop.mjs <mech> --above 0.9           ...only the high ones
//   node tools/geodrop.mjs <mech> --bone bone_24        ...only what this bone owns
//   node tools/geodrop.mjs <mech> --pick 4,5            emit a `dropGeo` patch
//
// WHY IT EXISTS. `dropBones` takes off everything a bone owns, which is right
// when the surplus lump has a bone to itself (inferno's flame tongues sat on
// `stackL`/`stackR` and nothing else did). It is useless when the lump shares a
// bone with armour you want to keep — TEMPEST's sculpted "spark" squiggles are
// welded to nothing and weighted to the same two bones as the entire shoulder
// pauldron, so dropping the bone would take the shoulders with it.
//
// What those squiggles ARE, though, is their own connected components: lumps
// resting on the chimney mouth, sharing no vertex with it. So the selector that
// fits is the ISLAND — a connected component of the mesh — and this tool ranks
// them so you can see which is which, then writes out the one thing that cannot
// be renumbered by a re-rig: the vertex list itself (`dropGeo`, dropgeo.js).
//
// Topology is done in POSITION-WELDED space for the same reason everything else
// in dropgeo.js is: an auto-mesher splits vertices along every uv seam, so a
// single lump arrives as a dozen "components" unless coincident vertices are
// treated as one.
//
// It PRINTS (house rule: tools export, humans apply). Needs `npm run dev`.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const mech = argv.find((a) => !a.startsWith('--')) || 'tempest';
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : argv[i + 1];
};
const above = flag('above', null);
const boneFilter = flag('bone', null);
const pick = flag('pick', null);
const out = flag('json', null);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e).slice(0, 400)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none&debug=3d`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 120000 });
await page.waitForTimeout(2000);

const report = await page.evaluate(async ({ above, boneFilter }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  let sk = null;
  window.__showcaseMechs[0].group.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
  if (!sk) return { err: 'no skinned mesh' };
  const g = sk.geometry;
  if (!g.index) return { err: 'geometry is not indexed' };
  const pos = g.attributes.position, idx = g.index;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const names = sk.skeleton.bones.map((b) => b.name);

  // ---- weld by position, then union-find over the triangles ---------------
  const n = pos.count;
  const first = new Map(), rep = new Int32Array(n);
  const q = (x) => Math.round(x * 1e5);
  for (let v = 0; v < n; v++) {
    const k = `${q(pos.getX(v))},${q(pos.getY(v))},${q(pos.getZ(v))}`;
    const f = first.get(k);
    if (f === undefined) { first.set(k, v); rep[v] = v; } else rep[v] = f;
  }
  const par = new Int32Array(n);
  for (let v = 0; v < n; v++) par[v] = v;
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  for (let t = 0; t < idx.count; t += 3) {
    const a = rep[idx.getX(t)], b = rep[idx.getX(t + 1)], c = rep[idx.getX(t + 2)];
    uni(a, b); uni(b, c);
  }

  const comps = new Map();
  const v3 = new THREE.Vector3();
  for (let v = 0; v < n; v++) {
    const r = find(rep[v]);
    let e = comps.get(r);
    if (!e) comps.set(r, e = { verts: [], box: new THREE.Box3(), tally: new Map() });
    e.verts.push(v);
    v3.fromBufferAttribute(pos, v);
    e.box.expandByPoint(v3);
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; bi = si.getComponent(v, k); } }
    e.tally.set(names[bi], (e.tally.get(names[bi]) || 0) + 1);
  }

  const rows = [];
  for (const e of comps.values()) {
    if (above != null && e.box.max.y < +above) continue;
    const owners = [...e.tally.entries()].sort((a, b) => b[1] - a[1]);
    if (boneFilter && owners[0][0] !== boneFilter) continue;
    const c = e.box.getCenter(new THREE.Vector3()), s = e.box.getSize(new THREE.Vector3());
    rows.push({
      verts: e.verts,
      n: e.verts.length,
      y: [+e.box.min.y.toFixed(3), +e.box.max.y.toFixed(3)],
      c: [+c.x.toFixed(3), +c.y.toFixed(3), +c.z.toFixed(3)],
      s: [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)],
      owners: owners.slice(0, 3).map(([nm, k]) => `${nm}:${k}`),
    });
  }
  rows.sort((a, b) => b.n - a.n);
  return { total: n, comps: comps.size, rows };
}, { above, boneFilter });

await browser.close();
if (report.err) { console.error(report.err); process.exit(1); }

console.error(`${mech}: ${report.total} verts in ${report.comps} island(s)`
  + `${above != null ? `, ${report.rows.length} reaching y >= ${above}` : ''}`
  + `${boneFilter ? ` owned by ${boneFilter}` : ''}`);
report.rows.forEach((r, i) => {
  console.error(`[${String(i).padStart(2)}] ${String(r.n).padStart(6)} verts  y ${r.y[0]}..${r.y[1]}`
    + `  c=[${r.c.join(',')}] size=[${r.s.join(',')}]  ${r.owners.join(' ')}`);
});

if (pick) {
  const want = pick.split(',').map(Number);
  const sel = want.map((i) => {
    const r = report.rows[i];
    if (!r) { console.error(`no island [${i}]`); process.exit(1); }
    return { verts: r.verts.slice().sort((a, b) => a - b) };
  });
  const total = sel.reduce((k, s) => k + s.verts.length, 0);
  console.error(`picked ${want.join(', ')} — ${total} verts`);
  const patch = { [mech]: { dropGeo: sel } };
  if (out) { fs.writeFileSync(out, JSON.stringify(patch)); console.error(`wrote ${out}`); }
  else console.log(JSON.stringify(patch));
}
