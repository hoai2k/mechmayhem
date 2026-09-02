// tallbits — which OBJECT is making a baked mech the wrong size?
// Applies a bake, lists every renderable by its world-space vertical extent
// next to the same list pre-bake, then restores.
//   node tools/scratch/tallbits.mjs <mech>
import { launch } from '../lib/browser.mjs';
import { execSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || '5175';
const ROOT = process.cwd();
const id = process.argv[2] || 'jerry';
const MANIFEST = path.join(ROOT, 'public/models/manifest.json');
const BAKED = ['rig', 'skinOps', 'seamCuts', 'reparent', 'stretch', 'bonePos', 'alt',
  'dropGeo', 'dropBones', 'boneOverrides'];

const browser = await launch();

async function waitGlobal(page, name, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate((n) => !!window[n], name)) return; await page.waitForTimeout(300); }
  throw new Error('timeout ' + name);
}

async function list(tag) {
  const p = await browser.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(5000);
  const out = await p.evaluate(async (id) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ROSTER } = await import('/src/mechs/roster.js');
    const { buildGlbForTool } = await import('/src/mechs/gltf.js');
    const { mech } = await buildGlbForTool(ROSTER.find((d) => d.id === id));
    mech.group.updateMatrixWorld(true);
    const rows = [];
    const v = new THREE.Vector3();
    mech.group.traverse((o) => {
      const pa = o.geometry?.attributes?.position;
      if (!pa) return;
      let lo = Infinity, hi = -Infinity;
      const step = Math.max(1, Math.floor(pa.count / 4000));
      for (let i = 0; i < pa.count; i += step) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
        if (v.y < lo) lo = v.y; if (v.y > hi) hi = v.y;
      }
      rows.push({ name: o.name || o.type, skinned: !!o.isSkinnedMesh, verts: pa.count,
        lo: +lo.toFixed(2), hi: +hi.toFixed(2), parent: o.parent?.name || '-' });
    });
    rows.sort((a, b) => b.hi - a.hi);
    return rows;
  }, id);
  await p.close();
  return out;
}

try {
  const pre = await list('pre');
  const orig = fs.readFileSync(MANIFEST, 'utf8');
  const entry = JSON.parse(orig)[id];
  const p = await browser.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/?bake=${id}`, { waitUntil: 'networkidle' });
  await waitGlobal(p, '__bakeReady');
  const res = await p.evaluate(() => ({ err: window.__bakeErr, base64: window.__bakeGlb?.base64 }));
  await p.close();
  if (res.err) throw new Error(res.err);
  fs.writeFileSync(path.join(ROOT, 'public', entry.url), Buffer.from(res.base64, 'base64'));
  const m = JSON.parse(orig);
  const clean = {};
  for (const [k, v] of Object.entries(m[id])) if (!BAKED.includes(k)) clean[k] = v;
  m[id] = clean;
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
  const rigPath = path.join(ROOT, `src/mechs/rigs/${id}.rig.js`);
  if (fs.existsSync(rigPath)) {
    fs.rmSync(rigPath);
    const idx = path.join(ROOT, 'src/mechs/rigs/index.js');
    const C = `${id.toUpperCase()}_RIG`;
    fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').split('\n').filter((l) => !l.includes(C)).join('\n'));
  }
  const post = await list('post');
  const fmt = (rows) => rows.slice(0, 8).map((r) => `   ${String(r.hi).padStart(7)} .. ${String(r.lo).padStart(7)}  `
    + `${r.skinned ? 'SKIN' : 'mesh'} ${String(r.verts).padStart(6)}v  ${r.name} (under ${r.parent})`).join('\n');
  console.log('PRE-BAKE  (top 8 by height)\n' + fmt(pre));
  console.log('\nPOST-BAKE (top 8 by height)\n' + fmt(post));
  console.log(`\nobjects: pre ${pre.length}  post ${post.length}`);
} finally {
  execSync('git checkout -- public/models src/mechs/rigs', { cwd: ROOT });
  console.log('(tree restored)');
  await browser.close();
}
