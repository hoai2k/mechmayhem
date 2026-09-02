// Skin audit: for every GLB mech, find bones whose skinned geometry is
// SPLIT into spatially-distant clumps — the signature of auto-rig weight
// mistakes (a hip plate bound to a forearm, a banner to an arm, an arm and
// a leg sharing one bone). Uses the same analyzeSkin as the runtime loader
// and the ?debug=skin workbench, via the vite dev server's module graph.
//   node tools/skinaudit.mjs [baseUrl] [mechId,...]
import { launch } from './lib/browser.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5175';
const only = process.argv[3] ? process.argv[3].split(',') : null;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 200)));
await page.goto(`${base}/?rigtest`, { waitUntil: 'networkidle' });

const report = await page.evaluate(async (only) => {
  const { loadRawGlbScene, fetchRawManifest } = await import('/src/mechs/gltf.js');
  const { analyzeSkin } = await import('/src/mechs/skinops.js');
  const manifest = await fetchRawManifest();
  const ids = Object.keys(manifest).filter((k) => manifest[k]?.url && (!only || only.includes(k)));
  const out = {};
  for (const id of ids) {
    try {
      const raw = await loadRawGlbScene(id);
      let mesh = null;
      raw.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
      if (!mesh) { out[id] = { error: 'no skinned mesh' }; continue; }
      const a = analyzeSkin(mesh);
      // model height for distance normalization
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const c of a.comps) for (let d = 0; d < 3; d++) {
        mn[d] = Math.min(mn[d], c.min[d]); mx[d] = Math.max(mx[d], c.max[d]);
      }
      const H = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      // group comps by dominant bone
      const byBone = new Map();
      for (const c of a.comps) {
        if (!byBone.has(c.boneName)) byBone.set(c.boneName, []);
        byBone.get(c.boneName).push(c);
      }
      const flags = [];
      for (const [bone, comps] of byBone) {
        const main = comps[0]; // largest (global order is size-desc)
        for (let i = 1; i < comps.length; i++) {
          const c = comps[i];
          if (c.count < 60) continue; // ignore greebles
          const dx = c.centroid[0] - main.centroid[0];
          const dy = c.centroid[1] - main.centroid[1];
          const dz = c.centroid[2] - main.centroid[2];
          const dist = Math.hypot(dx, dy, dz);
          if (dist > 0.30 * H) {
            flags.push({
              bone, perBoneIdx: i, globalComp: c.id, count: c.count,
              dist: +(dist / H).toFixed(2),
              centroid: c.centroid.map((v) => +v.toFixed(2)),
              mainCentroid: main.centroid.map((v) => +v.toFixed(2)),
              mainCount: main.count,
            });
          }
        }
      }
      out[id] = {
        comps: a.comps.length,
        bones: byBone.size,
        flags: flags.sort((x, y) => y.count - x.count),
      };
    } catch (e) {
      out[id] = { error: String(e).slice(0, 200) };
    }
  }
  return out;
}, only);

for (const [id, r] of Object.entries(report)) {
  if (r.error) { console.log(`${id}: ERROR ${r.error}`); continue; }
  console.log(`${id}: ${r.comps} comps, ${r.bones} bones, ${r.flags.length} flagged`);
  for (const f of r.flags.slice(0, 8)) {
    console.log(`   ${f.bone}[${f.perBoneIdx}] n=${f.count} dist=${f.dist}H ctr=[${f.centroid}] (main n=${f.mainCount} at [${f.mainCentroid}])`);
  }
}
await browser.close();
