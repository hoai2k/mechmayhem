// TAIL SKIN — rebind a bone CHAIN organically, and nothing else.
//
//   node tools/tailskin.mjs <mech> [--prefix tail] [--band 0.35] [--step 0.1]
//                           [--root hips] [--write]
//
// THE PROBLEM. A chain like fenrir's blade-tail is easy to skin BADLY and the
// bad way is the obvious one: give each segment's geometry rigidly to its own
// bone. That is five hard bands with a seam at every joint — the tail bends in
// five visible kinks, the seams shear as it sweeps, and the base cannot be
// articulated at all, because the geometry where the tail meets the body is
// welded half to `hips` and half to `tail0` with nothing in between.
//
// WHAT THIS DOES INSTEAD. Every vertex the chain already owns is projected onto
// the chain's own POLYLINE, which gives it a position `t` measured in segments
// from the root. Its weights then come from where it sits:
//   · mid-segment           100% on that segment's bone (armour stays rigid)
//   · within `band` of a joint   a smooth blend into the neighbouring bone,
//                           reaching 50/50 exactly at the joint
//   · before the first bone the blend is into `--root` (the body bone the chain
//                           hangs off), which is what makes the very base
//                           articulate FROM `tail0` rather than tear away from
//                           the hips
// A bend is then shared across a band of geometry instead of happening at one
// ring of vertices, which is the whole difference between a chain of segments
// and something that curves.
//
// WHICH VERTICES. Exactly the ones the mech's CURRENT skinOps already hand to
// the chain — the owner's own definition of "this is the tail", taken verbatim.
// Nothing outside that set is looked at, so this cannot touch the rest of the
// body however wrong it gets the chain.
//
// It PRINTS a manifest patch (house rule: tools export, humans apply). The
// emitted ops are `weights` blends with explicit vertex lists, so they are
// pinned to geometry and survive a re-rig. Needs `npm run dev`.
import { launch } from './lib/browser.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const mech = argv.find((a) => !a.startsWith('--')) || 'fenrir';
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : argv[i + 1];
};
const prefix = flag('prefix', 'tail');
const band = +flag('band', 0.35);
const step = +flag('step', 0.1);
const root = flag('root', 'hips');
const out = flag('json', null);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e).slice(0, 400)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none&debug=3d`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 120000 });

const report = await page.evaluate(async ({ mech, prefix, band, step, root }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { fetchRawManifest } = await import('/src/mechs/gltf.js');
  const m = window.__showcaseMechs[0];
  const manifest = await fetchRawManifest();
  const ops = manifest[mech]?.skinOps || [];
  let sk = null;
  m.group.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
  if (!sk) return { err: 'no skinned mesh' };
  const bonesByName = m.rigBones;
  if (!bonesByName) return { err: 'this mech has no custom rig — nothing named to project onto' };

  // ---- the chain, and the vertices it already owns -----------------------
  const chain = [];
  for (let i = 0; ; i++) {
    const b = bonesByName[prefix + i];
    if (!b) break;
    chain.push({ name: prefix + i, bone: b });
  }
  if (chain.length < 2) return { err: `no ${prefix}0…${prefix}1 chain` };
  const chainNames = new Set(chain.map((c) => c.name));
  const verts = new Set();
  for (const op of ops) {
    const touches = op.to ? chainNames.has(op.to)
      : Object.keys(op.weights || {}).some((k) => chainNames.has(k));
    if (touches && Array.isArray(op.sel?.verts)) for (const v of op.sel.verts) verts.add(v);
  }
  if (!verts.size) return { err: `no existing skinOp hands geometry to ${prefix}*` };

  // ---- everything in ONE space: the mesh's own ---------------------------
  m.group.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(sk.matrixWorld).invert();
  const P = chain.map((c) => c.bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(toLocal));
  const v = new THREE.Vector3(), ab = new THREE.Vector3(), av = new THREE.Vector3();

  // t = segment index + fraction along it, from the nearest point on the
  // polyline. Past either end it saturates, so a stray vertex cannot invent a
  // segment that is not there.
  const paramOf = (p) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      ab.subVectors(P[i + 1], P[i]);
      const len2 = ab.lengthSq() || 1e-9;
      av.subVectors(p, P[i]);
      const f = Math.max(0, Math.min(1, av.dot(ab) / len2));
      const d = av.addScaledVector(ab, -f).lengthSq();
      if (d < bestD) { bestD = d; best = i + f; }
    }
    return best;
  };

  // ---- weights from where the vertex sits --------------------------------
  const smooth = (x) => x * x * (3 - 2 * x);
  const quant = (w) => Math.max(0, Math.min(1, Math.round(w / step) * step));
  const buckets = new Map();          // "a|b|w" -> vertex list
  let rootBlend = 0, joints = 0;
  for (const vi of verts) {
    sk.getVertexPosition(vi, v);
    const t = paramOf(v);
    const i = Math.min(P.length - 2, Math.floor(t));
    const f = t - i;
    let a = chain[i].name, b = null, wb = 0;
    if (f < band) {
      // toward the joint ABOVE this segment — the body bone at the very root
      b = i === 0 ? root : chain[i - 1].name;
      wb = 0.5 * (1 - smooth(f / band));
      if (i === 0) rootBlend++;
    } else if (f > 1 - band) {
      b = chain[Math.min(chain.length - 1, i + 1)].name;
      wb = 0.5 * (1 - smooth((1 - f) / band));
    }
    wb = quant(wb);
    if (!b || wb <= 0) { b = null; wb = 0; } else joints++;
    const key = b ? `${a}|${b}|${wb.toFixed(2)}` : `${a}||0`;
    (buckets.get(key) || buckets.set(key, []).get(key)).push(vi);
  }

  const fresh = [];
  for (const [key, list] of [...buckets.entries()].sort((x, y) => y[1].length - x[1].length)) {
    const [a, b, w] = key.split('|');
    list.sort((x, y) => x - y);
    fresh.push(+w > 0
      ? { sel: { verts: list }, weights: { [a]: +(1 - +w).toFixed(2), [b]: +w } }
      : { sel: { verts: list }, to: a });
  }
  // THE WHOLE LIST COMES BACK, not just the chain's share: a skinOps patch is a
  // full replacement and the ops REPLAY IN ORDER, so the chain's new ops go in
  // exactly where its old ones were and every other op is passed through
  // untouched. That is what "without changing the rest of him" means here.
  const isChainOp = (o) => (o.to && chainNames.has(o.to))
    || Object.keys(o.weights || {}).some((k) => chainNames.has(k));
  const patch = [];
  let dropped = 0, placed = false;
  for (const o of ops) {
    if (!isChainOp(o)) { patch.push(o); continue; }
    dropped++;
    if (!placed) { patch.push(...fresh); placed = true; }
  }
  if (!placed) patch.push(...fresh);
  return {
    chain: chain.map((c) => c.name), verts: verts.size, ops: fresh.length,
    rootBlend, joints, replaced: dropped, total: patch.length, kept: patch.length - fresh.length,
    patch,
  };
}, { mech, prefix, band, step, root });

await browser.close();
if (report.err) { console.error(report.err); process.exit(1); }
console.error(`${mech}: ${report.chain.join(' ')} — ${report.verts} verts, `
  + `${report.joints} in a joint band (${report.rootBlend} of them blending into ${root}), `
  + `${report.replaced} old op(s) -> ${report.ops} new · ${report.kept} other op(s) passed through `
  + `(${report.total} total)`);
const patch = { [mech]: { skinOps: report.patch } };
if (out) { fs.writeFileSync(out, JSON.stringify(patch)); console.error(`wrote ${out}`); }
else console.log(JSON.stringify(patch));
