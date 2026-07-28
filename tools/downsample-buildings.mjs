#!/usr/bin/env node
// Downsample building-donor GLBs to the fidelity the game actually uses.
//
// Building donors get VOXELIZED into the destructible chunk grid at load
// (src/arena/buildglb.js) — only the silhouette + per-cell sampled colors
// survive, at chunk resolution. So the raw Tripo H3 mesh (~124k tris, ~5 MB,
// 2K textures) is wildly over-detailed for the job. This script:
//   1. archives the untouched original to assets/models/buildings/<name>.glb
//      (source of truth — NOT under public/, so it never ships in the build)
//   2. writes a slimmed copy back to public/models/buildings/<name>.glb:
//        weld  →  simplify (~7k tris, silhouette preserved)  →  512px textures
//      ~10× smaller (~0.5 MB), voxelizes identically.
//
// Idempotent: the archived original is always the input, so re-running never
// double-simplifies. Drop a fresh donor in public/, run this, commit both.
//
// Usage:  node tools/downsample-buildings.mjs [name ...]   (default: all)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public', 'models', 'buildings');
const SRC = path.join(ROOT, 'assets', 'models', 'buildings');
const TMP = path.join(ROOT, 'tools', '.dsl-tmp');

// simplify: keep enough tris for a clean blocky silhouette (buildings are big
// readable forms); textures shrink to 512 — voxel color-sampling is per-cell,
// far coarser than that. Tuned on decoTower: 124k→7.5k tris, 5MB→0.5MB, the
// voxelized building is pixel-identical in-arena.
const RATIO = '0.06', ERROR = '0.01', TEX = '512';

const gt = (args) => execFileSync('gltf-transform', args, { stdio: ['ignore', 'ignore', 'inherit'] });
const tris = (f) => { const b = fs.readFileSync(f); const jl = b.readUInt32LE(12);
  const g = JSON.parse(b.subarray(20, 20 + jl).toString()); let t = 0;
  for (const m of g.meshes || []) for (const p of m.primitives) { const a = g.accessors[p.indices]; if (a) t += a.count / 3; }
  return Math.round(t); };
const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(2);

fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

let names = process.argv.slice(2);
if (!names.length) names = fs.readdirSync(PUB).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));

for (const name of names) {
  const pub = path.join(PUB, `${name}.glb`);
  const src = path.join(SRC, `${name}.glb`);
  if (!fs.existsSync(pub) && !fs.existsSync(src)) { console.error(`skip ${name}: no GLB`); continue; }
  // archive the original the first time we see it; thereafter src is canonical
  if (!fs.existsSync(src)) fs.copyFileSync(pub, src);
  const t0 = path.join(TMP, 'w.glb'), t1 = path.join(TMP, 's.glb');
  gt(['weld', src, t0]);
  gt(['simplify', t0, t1, '--ratio', RATIO, '--error', ERROR]);
  gt(['resize', t1, pub, '--width', TEX, '--height', TEX]);
  console.log(`${name.padEnd(16)} src ${mb(src)}MB/${tris(src)}t  →  pub ${mb(pub)}MB/${tris(pub)}t`);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log('\ndone — commit public/models/buildings/ (slim) AND assets/models/buildings/ (originals)');
