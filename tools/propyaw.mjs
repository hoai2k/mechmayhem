// WHICH WAY DOES THE IMPORTED PROP MODEL FACE?
//
// A placed prop is a procedural build whose visuals are swapped for a GLB
// (props.js propGlbSwap). Everything AROUND that swap is authored in the
// PROCEDURAL prop's frame: the yaw the arena editor shows you while you turn
// it, the multi-body colliders in `userData.bodies`, the arena recipe. So a
// model whose own bind orientation is a quarter turn from the prop it replaces
// is placed wrong in the game and in every collider derived from it — you turn
// a torii gate to face down the street and the game stands it across.
//
// This measures the turn rather than eyeballing it: each prop's footprint is
// rasterised into a coarse occupancy grid in its own normalised XZ box, and
// the GLB is scored against the procedural silhouette at 0/90/180/270. The
// grid (not the bounding box) is what tells a trawler's bow from its stern —
// a box is symmetric under 180 and a hull is not.
//
//   node tools/propyaw.mjs [--apply]
//
// --apply writes the correction into public/models/props/manifest.json as
// `ry` (degrees), which is what propglb.js already applies at load.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const MAN = 'public/models/props/manifest.json';
const apply = process.argv.includes('--apply');
const url = process.env.RW_URL || 'http://localhost:5173';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${url}/workbench/?edit=props`, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

const rows = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { PROPS } = await import('/src/arena/props.js');
  const { propManifest, preloadPropModels, propGlbSwap } = await import('/src/arena/propglb.js');
  const man = await propManifest();
  const names = Object.keys(man).sort();
  await preloadPropModels(names);

  // The FOOTPRINT as a point cloud in XZ, centred on its own mean. Every
  // measurement below is a moment of this cloud, so nothing depends on how
  // big the model is — only on its shape.
  const cloud = (obj) => {
    obj.updateMatrixWorld(true);
    const pts = [];
    const v = new THREE.Vector3();
    obj.traverse((m) => {
      const pos = m.isMesh && m.geometry?.attributes?.position;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 4000));   // bounded cost
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        pts.push(v.x, v.z);
      }
    });
    let mx = 0, mz = 0;
    for (let i = 0; i < pts.length; i += 2) { mx += pts[i]; mz += pts[i + 1]; }
    const n = pts.length / 2 || 1;
    mx /= n; mz /= n;
    for (let i = 0; i < pts.length; i += 2) { pts[i] -= mx; pts[i + 1] -= mz; }
    return pts;
  };

  // WHICH WAY IS THE LONG AXIS, and how elongated is it. Principal axis of the
  // 2x2 covariance: the angle is defined mod 180 (an axis has no head or
  // tail), and `elong` says whether the question even has an answer — a round
  // prop has no long axis and must be left alone.
  const axis = (pts) => {
    let sxx = 0, szz = 0, sxz = 0;
    for (let i = 0; i < pts.length; i += 2) {
      sxx += pts[i] * pts[i]; szz += pts[i + 1] * pts[i + 1]; sxz += pts[i] * pts[i + 1];
    }
    const n = pts.length / 2 || 1;
    sxx /= n; szz /= n; sxz /= n;
    const tr = sxx + szz, det = sxx * szz - sxz * sxz;
    const disc = Math.max(0, tr * tr / 4 - det);
    const l1 = tr / 2 + Math.sqrt(disc), l2 = tr / 2 - Math.sqrt(disc);
    return { ang: 0.5 * Math.atan2(2 * sxz, sxx - szz), elong: Math.sqrt(l1 / Math.max(l2, 1e-9)) };
  };
  // WHICH END IS THE FRONT: the third moment along the long axis. A hull is
  // heavier at the stern than the bow, and that is what separates a half turn
  // from no turn at all — a bounding box cannot see it.
  const skew = (pts, ang) => {
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let m2 = 0, m3 = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const u = pts[i] * c - pts[i + 1] * s;
      m2 += u * u; m3 += u * u * u;
    }
    const n = pts.length / 2 || 1;
    m2 /= n; m3 /= n;
    return m3 / Math.pow(Math.max(m2, 1e-9), 1.5);
  };

  const out = [];
  for (const name of names) {
    if (!PROPS[name]) { out.push({ name, err: 'no procedural builder' }); continue; }
    const pProc = cloud(PROPS[name]({ seed: 1, ry: 0 }));
    const glbObj = PROPS[name]({ seed: 1, ry: 0 });
    if (!propGlbSwap(name, glbObj)) { out.push({ name, err: 'no model loaded' }); continue; }
    const pGlb = cloud(glbObj);
    const a = axis(pProc), b = axis(pGlb);
    // turn that carries the model's long axis onto the prop's, snapped to the
    // quarter turns a placement can be out by
    let d = ((a.ang - b.ang) * 180) / Math.PI;
    d = ((d % 180) + 180) % 180;                 // axis angle: mod 180
    let deg = Math.abs(d - 90) < 45 ? 90 : 0;    // 0 or a quarter turn
    const resid = Math.min(Math.abs(d - deg), Math.abs(d - deg - 180));
    // ...then the half turn, decided by which end is heavy
    const sProc = skew(pProc, a.ang);
    const sGlb = skew(pGlb, b.ang + (deg * Math.PI) / 180);
    const flip = Math.abs(sProc) > 0.15 && Math.abs(sGlb) > 0.15 && Math.sign(sProc) !== Math.sign(sGlb);
    if (flip) deg = (deg + 180) % 360;
    out.push({
      name, deg, resid: +resid.toFixed(1), flip,
      elongProc: +a.elong.toFixed(2), elongGlb: +b.elong.toFixed(2),
      skewProc: +sProc.toFixed(2), skewGlb: +sGlb.toFixed(2),
    });
  }
  return out;
});
await browser.close();
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 3).join('\n'));

// A correction is only proposed for a prop that HAS a long axis to align: a
// round one (fuel tank, lava pool) has no orientation to get wrong, and a
// near-round one would take its answer from noise.
const ELONG = 1.25;     // below this a prop is round and has no orientation
const RESID = 20;       // degrees of disagreement left after snapping to a quarter turn
const fixes = [], review = [];
console.log('prop                 elong proc/glb   skew proc/glb    residual   proposed');
for (const r of rows) {
  if (r.err) { console.log(`${r.name.padEnd(20)} ${r.err}`); continue; }
  const round = r.elongProc < ELONG || r.elongGlb < ELONG;
  // A QUARTER TURN IS THE CLAIM THIS CAN PROVE. The axes either line up after
  // one or they do not, and `resid` says which. A half turn rests on the third
  // moment alone — good evidence for a hull, thin for a gantry — and a long
  // axis that still disagrees by more than RESID means the two shapes are not
  // the same shape, so neither answer is trustworthy: both are reported for a
  // human to judge and neither is written.
  const shaky = !round && (r.resid > RESID || (r.deg === 180 && r.flip));
  const want = round || shaky ? 0 : r.deg;
  if (want) fixes.push([r.name, want]);
  if (shaky) review.push(`${r.name} (${r.deg}°, residual ${r.resid}°${r.flip ? ', half turn from skew alone' : ''})`);
  console.log(`${r.name.padEnd(20)}${String(r.elongProc).padStart(6)} /${String(r.elongGlb).padStart(6)}`
    + `  ${String(r.skewProc).padStart(6)} /${String(r.skewGlb).padStart(6)}`
    + `  ${String(r.resid).padStart(7)}°   `
    + (round ? 'round — no orientation'
      : shaky ? `${r.deg}° — NEEDS AN EYE, not written`
        : want ? `ry: ${want}${r.flip ? ' (half turn: ends swapped)' : ''}` : 'already aligned'));
}
console.log(`\n${fixes.length} of ${rows.length} models sit turned from the prop they replace`
  + (fixes.length ? `: ${fixes.map(([n, d]) => `${n} ${d}°`).join(', ')}` : ''));
if (review.length) console.log(`left alone, judge these by eye: ${review.join(', ')}`);

if (!apply) { console.log('\n(dry run — pass --apply to write the manifest)'); process.exit(fixes.length ? 0 : 0); }

const man = JSON.parse(readFileSync(MAN, 'utf8'));
for (const [name, deg] of fixes) {
  if (!man[name]) continue;
  man[name].ry = ((man[name].ry || 0) + deg) % 360;
  if (!man[name].ry) delete man[name].ry;
}
writeFileSync(MAN, `${JSON.stringify(man, null, 2)}\n`);
console.log(`\nwrote ${MAN}`);
