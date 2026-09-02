// WHICH WAY DOES A PROP'S MODEL ACTUALLY FACE?
//   node tools/scratch/propfront.mjs "<battle url>" <prop> [<prop> …]
//
// The design systems aim a prop by yaw on one convention: the front is +Z
// (arena/designs/proptraits.js). That is measured off the PROCEDURAL builders
// — but a placed prop usually renders an imported GLB instead (propglb.js),
// turned by the manifest's `ry`, and tools/propyaw.mjs only aligns the model's
// LONG AXIS (mod 180). A sphinx's long axis is head-to-tail, so a model can be
// axis-aligned and still be back to front, which is a statue that faces the
// fight with its haunches.
//
// So measure it: take the rendered geometry in the PROP GROUP's own frame,
// and compare where the mass sits high up (the head, the face, the raised
// end) against where the whole prop sits. headZ > 0 means the model agrees
// with the convention; headZ < 0 means it is reversed and wants ry + 180.
//
// ONLY IMPORTED MODELS ARE JUDGED. The procedural builders DEFINE the
// convention (the sphinx's head, the idol's eyes, the billboard's face are
// at +z because that is where they were built), so measuring one is circular
// — and the measure is a heuristic that a flat-topped prop fools: the jungle
// idol's face is at +Z and its moss cap is the top third, which reads as
// "reversed" while the model is perfectly correct. A prop with a GLB is the
// one that can genuinely disagree, and that is what this checks.
import { readFileSync } from 'node:fs';
import { launch } from '../lib/browser.mjs';

const [url, ...props] = process.argv.slice(2);
let modelled = new Set();
try {
  modelled = new Set(Object.keys(JSON.parse(
    readFileSync(new URL('../../public/models/props/manifest.json', import.meta.url), 'utf8'))));
} catch { /* no prop manifest — nothing is modelled */ }
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world, null, { timeout: 90000 });
await page.waitForTimeout(2500);

const rows = await page.evaluate((names) => {
  const THREE = window.__THREE, w = window.__world;
  const out = [];
  for (const name of names) {
    const g = w.arena.propGroup.children.find((c) => c.name === `prop:${name}`);
    if (!g) { out.push({ name, missing: true }); continue; }
    g.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const v = new THREE.Vector3();
    const pts = [];
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 900));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        pts.push([v.x, v.y, v.z]);
      }
    });
    if (pts.length < 20) { out.push({ name, thin: true }); continue; }
    const ys = pts.map((p) => p[1]);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const cut = yMin + (yMax - yMin) * 0.65;          // the top third: the head
    const top = pts.filter((p) => p[1] >= cut);
    const mean = (a, k) => a.reduce((s, p) => s + p[k], 0) / a.length;
    const zAll = mean(pts, 2), zTop = mean(top, 2);
    const depth = Math.max(...pts.map((p) => p[2])) - Math.min(...pts.map((p) => p[2]));
    out.push({
      name, headZ: +(zTop - zAll).toFixed(2), depth: +depth.toFixed(1),
      share: +((zTop - zAll) / (depth || 1)).toFixed(3),
    });
  }
  return out;
}, props);
await browser.close();

// THE READING ONLY MEANS SOMETHING FOR A PROP WITH A FRONT. A colonnade's
// tallest columns are wherever the breakage rng left them, and its trait is
// `row` — it is aimed along its row, not at anything — so a "head offset" on
// one is noise. Judge the face-trait props; report the rest as information.
const { PROP_TRAITS } = await import('../../src/arena/designs/proptraits.js')
  .catch(() => ({ PROP_TRAITS: {} }));
let bad = 0;
for (const r of rows) {
  if (r.missing) { console.log(`--   ${r.name.padEnd(16)} not in this arena`); continue; }
  if (r.thin) { console.log(`--   ${r.name.padEnd(16)} too little geometry to measure`); continue; }
  if (!modelled.has(r.name)) {
    console.log(`--   ${r.name.padEnd(16)} procedural — it DEFINES the convention, not checked`);
    continue;
  }
  const faces = !!PROP_TRAITS[r.name]?.face;
  // a clear signal is worth ~5% of the prop's own depth; below that the prop
  // is symmetric front-to-back and the convention simply does not apply
  const symmetric = Math.abs(r.share) < 0.05;
  const verdict = symmetric ? 'symmetric — no front'
    : r.share > 0 ? 'faces +Z (agrees with the convention)'
      : 'REVERSED — its front is -Z, wants ry + 180';
  const fail = faces && !symmetric && r.share < 0;
  if (fail) bad++;
  console.log(`${fail ? 'FAIL' : faces ? 'OK  ' : '--  '} ${r.name.padEnd(16)} ` +
    `head offset ${r.headZ} of ${r.depth} deep (${r.share}) — ${verdict}` +
    (faces ? '' : '  [no face trait: informational]'));
}
console.log(bad ? `\n${bad} model(s) face the wrong way.` : '\nEvery face-trait model agrees with the +Z convention.');
process.exit(bad ? 1 : 0);
