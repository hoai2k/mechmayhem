// Hurtbox fit audit: measures EVERY mech on BOTH routes and reports how
// well the capsules describe the model.
//
//   node tools/hurtboxfit.mjs [http://localhost:5173]
//
//   parts   — how many of the 15 body regions were measurable
//   contain — % of the model's rendered vertices inside some capsule.
//             Thin appendages (jerry's claw nests, fenrir's tail) are not
//             body regions and drag this down honestly; a low number on a
//             plain humanoid means a hole.
//   bloat   — capsule bounding-box volume / model bounding-box volume.
//             Well over 1 means the mech became a BIGGER target than it
//             looks, which is the failure this whole system exists to avoid.
//
// Run it after touching the fit constants in src/combat/hurtbox.js — a
// regression shows up here long before it shows up in a fight.
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
// The GAME page, deliberately. This used to open ?debug=collider, which the
// workbench split turned into a redirect to /workbench/?edit=hurtbox — and on
// that page `models/manifest.json` resolves one directory deep, where Vite's
// SPA fallback answers with index.html. fetchRawManifest() parses that as
// "no models", so every GLB row was silently skipped and the audit reported
// only the procedural route. Nothing here needs a dev page: the evaluate below
// imports the modules it needs by absolute path.
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

const rows = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ROSTER } = await import('/src/mechs/roster.js');
  const { buildMech } = await import('/src/mechs/factory.js');
  const { Animator } = await import('/src/mechs/animator.js');
  const { buildGlbForTool, fetchRawManifest } = await import('/src/mechs/gltf.js');
  const { buildHurtbox, PART_TABLE } = await import('/src/combat/hurtbox.js');
  const manifest = await fetchRawManifest();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

  const audit = (mech, hb) => {
    if (!hb) return { parts: 0, contain: 0, bloat: 0 };
    // updateMatrixWorld, NOT updateWorldMatrix: only the former is
    // overridden by SkinnedMesh to refresh bindMatrixInverse, and without
    // that refresh getVertexPosition reports vertices in the GLB's own
    // pre-scaling frame — metres away from where the model renders.
    mech.group.updateWorldMatrix(true, false);
    mech.group.updateMatrixWorld(true);
    hb.refresh(null);
    const mBox = new THREE.Box3(), hBox = new THREE.Box3();
    for (const p of hb.parts) {
      for (const e of [p.a, p.b]) {
        hBox.expandByPoint(_a.copy(e).addScalar(-p.r));
        hBox.expandByPoint(_a.copy(e).addScalar(p.r));
      }
    }
    let inside = 0, total = 0;
    mech.group.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton.update();
      const pos = (o.isMesh || o.isSkinnedMesh) && o.geometry?.attributes?.position;
      if (!pos) return;
      const stride = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += stride) {
        o.getVertexPosition(i, _a); o.localToWorld(_a);
        mBox.expandByPoint(_a);
        total++;
        for (const p of hb.parts) {
          const seg = _b.copy(p.b).sub(p.a);
          const ll = seg.lengthSq();
          const rel = _c.copy(_a).sub(p.a);
          const t = ll > 1e-9 ? Math.min(1, Math.max(0, rel.dot(seg) / ll)) : 0;
          if (rel.addScaledVector(seg, -t).length() <= p.r) { inside++; break; }
        }
      }
    });
    const vol = (bx) => { const s = bx.getSize(new THREE.Vector3()); return Math.max(1e-6, s.x * s.y * s.z); };
    return {
      parts: hb.parts.length,
      contain: total ? inside / total : 0,
      bloat: vol(hBox) / vol(mBox),
      missing: PART_TABLE.map(([n]) => n).filter((n) => !hb.part(n)),
    };
  };

  const out = [];
  for (const def of ROSTER) {
    for (const route of ['glb', 'proc']) {
      if (route === 'glb' && !manifest[def.id]?.url) continue;
      let mech = null;
      try {
        mech = route === 'glb' ? (await buildGlbForTool(def)).mech : buildMech(def);
        (mech.premadeAnimator || new Animator(mech)).poseStatic();
        out.push({ id: def.id, route, ...audit(mech, buildHurtbox(mech)) });
      } catch (e) {
        out.push({ id: def.id, route, error: String(e.message).slice(0, 120) });
      }
      mech?.group.traverse((o) => o.geometry?.dispose?.());
    }
  }
  return out;
});

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('mech', 12), pad('route', 6), pad('parts', 6), pad('contain', 8), pad('bloat', 7), 'missing');
for (const r of rows) {
  if (r.error) { console.log(pad(r.id, 12), pad(r.route, 6), 'ERROR', r.error); continue; }
  console.log(pad(r.id, 12), pad(r.route, 6), pad(`${r.parts}/15`, 6),
    pad(`${(r.contain * 100).toFixed(0)}%`, 8), pad(`${r.bloat.toFixed(2)}x`, 7),
    (r.missing || []).join(' '));
}
if (errors.length) console.log('PAGE ERRORS:', errors.join('\n'));
await browser.close();
