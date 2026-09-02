// Far-blend ("rubber") audit: report vertices strongly weighted to two
// hierarchy-DISTANT bones (A-B-C-D: strong on A and D, skipping B/C). These
// verts get averaged between unrelated limbs — rubbery smearing the
// seam-stretch audit can't see (no long edges form). Detection is static:
// a pure weights-table scan via skinops.farBlendScan.
//   node tools/weightaudit.mjs [baseUrl] [mechId,...]
// Fix: add {"purgeFar": true} to the mech's manifest skinOps (strips the
// minority far weights and renormalizes — keeps legitimate local blends).
import { launch } from './lib/browser.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5175';
const only = process.argv[3] ? process.argv[3].split(',') : null;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 200)));

await page.goto(`${base}/?rigtest`, { waitUntil: 'networkidle' });
const ids = await page.evaluate(async (only) => {
  const { fetchRawManifest } = await import('/src/mechs/gltf.js');
  const m = await fetchRawManifest();
  return Object.keys(m).filter((k) => m[k]?.url && (!only || only.includes(k)));
}, only);

for (const id of ids) {
  await page.goto(`${base}/?debug=skin&id=${id}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__skinTool?.mesh, null, { timeout: 60000 }).catch(() => {});
  const rep = await page.evaluate(async (id) => {
    const t = window.__skinTool;
    if (!t?.mesh) return { error: 'not ready' };
    const { farBlendScan } = await import('/src/mechs/skinops.js');
    const { fetchRawManifest } = await import('/src/mechs/gltf.js');
    const manifest = await fetchRawManifest();
    const mapped = new Set(Object.values(manifest[id]?.boneOverrides || {}));
    // NOTE: the workbench applies committed skinOps at load, so this scans
    // the SHIPPED weights (post-rebinds) — what actually renders in game.
    const pairs = farBlendScan(t.mesh, { minDist: 3, minW: 0.2 });
    const total = pairs.reduce((s, p) => s + p.verts.length, 0);
    // a pair only produces visible rubber if the two bones can MOVE APART —
    // i.e. at least one side is animated (mapped or descends from a mapped
    // bone... approximate: either bone mapped)
    return {
      total,
      pairs: pairs.slice(0, 8).map((p) => ({
        dom: p.dom, far: p.far, n: p.verts.length,
        meanW: +(p.wSum / p.verts.length).toFixed(2),
        animated: mapped.has(p.dom) || mapped.has(p.far),
      })),
    };
  }, id);
  if (rep.error) { console.log(`${id}: ERROR ${rep.error}`); continue; }
  console.log(`${id}: ${rep.total} far-blend verts`);
  for (const p of rep.pairs) {
    console.log(`   ${p.dom} <-> ${p.far}: n=${p.n} meanW=${p.meanW}${p.animated ? '' : ' (static pair)'}`);
  }
}
await browser.close();
