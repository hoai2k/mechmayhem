// bakecost — what does the correction layer cost, and WHERE?
//
// Two numbers per mech, because they are two different questions:
//   build  — buildGlbForTool: a fresh entry object, so fitCache MISSES and the
//            measurement passes run. This is a page-load / match-start build.
//   clone  — mech.cloneGLB(): the same entry object, so fitCache HITS. This is
//            what a summon pays mid-fight (saurion's pack, fenrir's hunt), and
//            it still re-runs the custom-rig re-skin + skinOps every time.
// A bake removes the correction work from BOTH.
import { chromium } from 'playwright-core';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

const rows = await page.evaluate(async () => {
  const { ROSTER } = await import('/src/mechs/roster.js');
  const { buildGlbForTool, fetchRawManifest } = await import('/src/mechs/gltf.js');
  const man = await fetchRawManifest();
  const med = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const out = [];
  for (const def of ROSTER) {
    const e = man[def.id];
    if (!e?.url) continue;
    try {
      const first = await buildGlbForTool(def);   // warm the gltf cache
      const bt = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now(); await buildGlbForTool(def); bt.push(performance.now() - t0);
      }
      const ct = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now(); first.mech.cloneGLB(); ct.push(performance.now() - t0);
      }
      out.push({ id: def.id, build: +med(bt).toFixed(1), clone: +med(ct).toFixed(1),
        rig: !!e.rig, ops: e.skinOps?.length || 0 });
    } catch (err) { out.push({ id: def.id, err: String(err).slice(0, 90) }); }
  }
  return out;
});
await browser.close();

rows.sort((a, b) => (b.clone || 0) - (a.clone || 0));
console.log('mech         build(ms)  clone(ms)  customRig  skinOps');
for (const r of rows) {
  if (r.err) { console.log(r.id.padEnd(12), 'ERR', r.err); continue; }
  console.log(r.id.padEnd(12), String(r.build).padStart(7), String(r.clone).padStart(10),
    '   ', (r.rig ? 'YES' : ' - ').padEnd(9), String(r.ops).padStart(5));
}
const g = (f) => rows.filter((r) => r.clone !== undefined && !!r.rig === f);
const mean = (a, k) => (a.reduce((s, r) => s + r[k], 0) / a.length).toFixed(1);
for (const [label, f] of [['custom-rig', true], ['stock-rig ', false]]) {
  const a = g(f);
  console.log(`\n${label} (${a.length}): build ${mean(a, 'build')} ms · clone ${mean(a, 'clone')} ms`);
}
if (errs.length) console.log('page errors:', errs.slice(0, 3));
