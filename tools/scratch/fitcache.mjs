// Does the per-entry fit cache answer what the measurement would have?
// Builds every GLB mech TWICE (first build measures, second replays) and diffs
// what the fit decides: model scale, container ground offset, foot calibration
// and the resting sole clearance.
//
// usage: node tools/scratch/fitcache.mjs [waitMs]
import { launch } from '../lib/browser.mjs';

const [waitMs = '25000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await page.goto('http://localhost:5173/?showcase', { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const rows = await page.evaluate(async () => {
  const { ROSTER } = await import('/src/mechs/roster.js');
  const { buildGlbForTool, loadManifest, manifestHasGlb } = await import('/src/mechs/gltf.js');
  await loadManifest();
  const read = (m) => {
    const a = m.premadeAnimator;
    return {
      scale: +(m.modelScaleInfo?.final ?? 0).toFixed(6),
      base: +(m.modelScaleInfo?.base ?? 0).toFixed(6),
      y: +(m.visual?.position.y ?? 0).toFixed(6),
      x: +(m.visual?.position.x ?? 0).toFixed(6),
      gain: +(a?.ankleGain ?? 0).toFixed(6),
      flat: +(a?.footFlat ?? 0).toFixed(6),
      depth: +(a?.footDepth ?? 0).toFixed(6),
      soles: (a?.soles || []).map((s) => `${s.side}:${s.points.length}:${s.points[0].toArray().map((v) => v.toFixed(4)).join(',')}`).join('|'),
      low: +(m.lowestRenderedY?.() ?? 0).toFixed(5),
    };
  };
  const out = [];
  for (const def of ROSTER) {
    if (!manifestHasGlb(def.id)) continue;
    try {
      // first build MEASURES; cloneGLB rebuilds from the same entry object,
      // which is the cached path (and the raptor pack's own path)
      const { mech } = await buildGlbForTool(def);
      const a = read(mech);
      const b = read(mech.cloneGLB());
      const diffs = Object.keys(a).filter((k) => String(a[k]) !== String(b[k]));
      out.push({ id: def.id, ok: !diffs.length, diffs: diffs.map((k) => `${k}: ${a[k]} -> ${b[k]}`) });
    } catch (e) { out.push({ id: def.id, ok: false, diffs: ['threw: ' + e.message] }); }
  }
  return out;
});
let bad = 0;
for (const r of rows) {
  if (r.ok) console.log(`ok   ${r.id}`);
  else { bad++; console.log(`FAIL ${r.id}  ${r.diffs.join(' · ')}`); }
}
console.log(`\n${rows.length - bad}/${rows.length} identical on rebuild`);
await browser.close();
process.exit(bad ? 1 : 0);
