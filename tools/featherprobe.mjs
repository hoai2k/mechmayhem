// featherprobe: HOW SOFT IS THIS BIND? — the measurement behind the FEATHER
// SEAMS panel (src/mechs/feather.js).
//
//   node tools/featherprobe.mjs <mech> [--alt] [--off]
//                               [--radius 0.05] [--rigid pod*,jaw] [--maxLinks 2]
//
// Loads the mech exactly as the skin workbench does (raw GLB + custom rig +
// the manifest's own skinOps) and reports what the weights look like:
//
//   • the share of the mesh carrying 1 / 2 / 3+ influences — a rigid bind is
//     100% single-influence, which is the number a hard border reads as;
//   • BORDER SHARPNESS: over every mesh edge whose two ends have different
//     dominant bones, how much the dominant weight jumps. 1.00 is a step (the
//     paint brush's finest border), and the lower it goes the more the two
//     bones cross over gradually instead;
//   • the bone pairs that now overlap, biggest first — the seams that got soft.
//
// `--off` reports the mech AS SHIPPED (no extra feather applied), so a before /
// after is two runs. Any --radius/--rigid/--maxLinks flag runs feather.js with
// those values on top of the shipped ops, which is how a value is chosen
// without editing the manifest. Needs the dev server (npm run dev) on :5173.
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const has = (n) => args.includes('--' + n);
const mech = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!mech) { console.error('usage: node tools/featherprobe.mjs <mech> [--off] [--radius r] [--rigid a,b] [--maxLinks n]'); process.exit(1); }

// --band 'pod*=0.012,jaw=0.03' — per-bone bands on top of the global --radius
const band = (flag('band', '') || '').split(',').filter(Boolean)
  .map((s) => s.split('=')).reduce((m, [k, v]) => (m[k] = +v, m), {});
const opts = has('off') ? null : {
  radius: Object.keys(band).length ? { '*': +flag('radius', 0.05), ...band } : +flag('radius', 0.05),
  rigid: (flag('rigid', '') || '').split(',').filter(Boolean),
  maxLinks: +flag('maxLinks', 2),
};

const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?rigtest', { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async ({ mech, alt, opts }) => {
  const { loadRawGlbScene } = await import('/src/mechs/gltf.js');
  const { applySkinOps } = await import('/src/mechs/skinops.js');
  const { featherSkin } = await import('/src/mechs/feather.js');
  const raw = await loadRawGlbScene(mech, { alt });
  if (!raw) return { error: 'no GLB for ' + mech };
  let mesh = null;
  raw.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const shipped = (raw.entry.skinOps || []);
  applySkinOps(mesh, shipped);
  const extra = opts ? featherSkin(mesh, opts) : null;

  const geo = mesh.geometry;
  const jnt = geo.attributes.skinIndex, wgt = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const n = geo.attributes.position.count;
  const infl = [0, 0, 0, 0, 0];
  const dom = new Int32Array(n), domW = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let c = 0, bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > 0.01) c++;
      if (w > bw) { bw = w; bi = jnt.getComponent(i, k); }
    }
    dom[i] = bi; domW[i] = bw;
    infl[Math.min(4, c)]++;
  }
  // border sharpness over every edge crossing a bone border
  const idx = geo.index;
  let edges = 0, jump = 0, worst = 0;
  const hardPairs = new Map();     // borders still crossing as a step, by bone pair
  const seen = new Set();
  const test = (a, b) => {
    if (dom[a] === dom[b]) return;
    const key = a < b ? a * 4e6 + b : b * 4e6 + a;
    if (seen.has(key)) return;
    seen.add(key);
    const wOn = (v, bi) => { let s = 0; for (let k = 0; k < 4; k++) if (jnt.getComponent(v, k) === bi) s += wgt.getComponent(v, k); return s; };
    // how much bone(a)'s influence drops from a to b, and vice versa
    const d = Math.max(Math.abs(wOn(a, dom[a]) - wOn(b, dom[a])), Math.abs(wOn(a, dom[b]) - wOn(b, dom[b])));
    edges++; jump += d; if (d > worst) worst = d;
    if (d > 0.9) {
      const key = [bones[dom[a]]?.name, bones[dom[b]]?.name].sort().join('~');
      hardPairs.set(key, (hardPairs.get(key) || 0) + 1);
    }
  };
  if (idx) for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    test(a, b); test(b, c); test(c, a);
  }
  // overlapping bone pairs
  const pairs = new Map();
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k), bi = jnt.getComponent(i, k);
      if (w <= 0.02 || bi === dom[i]) continue;
      const key = [bones[dom[i]]?.name, bones[bi]?.name].sort().join('~');
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  }
  return {
    mech, n, ops: shipped.length, extra,
    infl, meanDomW: [...domW].reduce((s, v) => s + v, 0) / n,
    edges, jump: edges ? jump / edges : 0, worst,
    hardPairs: [...hardPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    pairs: [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16),
  };
}, { mech, alt: has('alt'), opts });

if (out.error) { console.error(out.error); await browser.close(); process.exit(1); }
const pct = (v) => (100 * v / out.n).toFixed(1).padStart(5) + '%';
console.log(`\n=== ${out.mech} — ${out.n} verts, ${out.ops} shipped skinOp(s)`
  + `${opts ? `, + feather radius ${JSON.stringify(opts.radius)} rigid[${opts.rigid.join(',') || '-'}] maxLinks ${opts.maxLinks}` : ' (as shipped)'} ===`);
console.log(`influences   1 bone ${pct(out.infl[1])} · 2 ${pct(out.infl[2])} · 3 ${pct(out.infl[3])} · 4 ${pct(out.infl[4])}`);
console.log(`dominant weight mean ${out.meanDomW.toFixed(3)}   (1.000 = fully rigid)`);
console.log(`border edges ${out.edges}   mean dominant-weight jump ${out.jump.toFixed(3)}   worst ${out.worst.toFixed(3)}`);
console.log(`   (1.000 = a step; a feathered border crosses over gradually)`);
if (out.extra) console.log(`feather: ${out.extra.blended} vert(s) blended over ${out.extra.bones} bone(s), band ${out.extra.radius.toFixed(4)} model units`);
console.log('still a hard step (edges):');
for (const [p, c] of out.hardPairs) console.log('  ' + String(c).padStart(6) + '  ' + p);
console.log('overlapping pairs:');
for (const [p, c] of out.pairs) console.log('  ' + String(c).padStart(6) + '  ' + p);
await browser.close();
