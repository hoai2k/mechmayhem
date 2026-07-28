// PROP MODEL OPTIMIZER — shrink the arena-prop GLBs, keep the originals.
//
//   node tools/propopt.mjs                 # DRY RUN: measure + report, write nothing
//   node tools/propopt.mjs --apply         # optimize every prop
//   node tools/propopt.mjs --apply toriiGate headframe
//   node tools/propopt.mjs --restore       # put the originals back
//
// WHY THIS ONE IS ALLOWED TO TOUCH COMMITTED MODELS, when tools/dist.mjs
// insists compression belongs on a copy at release time: a mech GLB is an
// authoring master — the workbenches re-rig and re-skin it, hurtbox.js derives
// capsules from its vertices. A PROP is dressing. Nothing measures its
// vertices (its collider comes from a bounding box), no workbench edits it,
// and it arrives from an image-to-3D service at a density nobody chose.
//
// So the originals are not thrown away, they MOVE:
//
//   public/models/props/source/<name>.glb   the untouched service output
//   public/models/props/<name>.glb          the optimized model the game loads
//
// Both are servable, so /workbench/?edit=props can stand them side by side and
// judge the trade in the viewport. `--restore` copies source/ back over the
// shipped file, which is the whole revert. tools/dist.mjs skips source/, so
// the distribution carries the optimized models only.
//
// WHAT IT DOES, and why each step is safe for a prop:
//   dedup + prune   drop duplicate accessors/materials and unused nodes
//   weld            Tripo exports every triangle with its own vertices (~1.5
//                   verts per tri); welding halves the vertex count with no
//                   shape change beyond the normal tolerance
//   simplify        meshoptimizer decimation to TARGET_RATIO, error-bounded —
//                   these props are 15–19k triangles for something usually
//                   read at 20+ metres behind a fighter
//   textures        1024² -> TEX_SIZE JPEG. Three maps per prop at 1024 is
//                   12 MB of VRAM each; at 512 it is 3 MB
//   quantize+meshopt  the same compression the models arrived with, re-applied
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, quantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const PROPS_DIR = path.resolve('public/models/props');
const SRC_DIR = path.join(PROPS_DIR, 'source');
const TARGET_RATIO = 0.45;   // triangles kept by the simplifier
const SIMPLIFY_ERROR = 0.02; // as a fraction of the model's own size
const TEX_SIZE = 512;        // per-map resolution after the pass
const JPEG_Q = 82;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore');
const only = args.filter((a) => !a.startsWith('--'));

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu])
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

const names = (only.length ? only : fs.readdirSync(PROPS_DIR)
  .filter((f) => f.endsWith('.glb'))
  .map((f) => f.slice(0, -4))).sort();

// ---- measurement ---------------------------------------------------------
async function measure(file) {
  if (!fs.existsSync(file)) return null;
  const doc = await io.read(file);
  let tris = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      tris += idx ? idx.getCount() / 3 : (pos?.getCount() || 0) / 3;
      verts += pos?.getCount() || 0;
    }
  }
  let texPix = 0;
  const texes = [];
  for (const tex of doc.getRoot().listTextures()) {
    const size = tex.getSize() || [0, 0];
    texPix += size[0] * size[1];
    texes.push(`${size[0]}x${size[1]}`);
  }
  return {
    bytes: fs.statSync(file).size,
    tris: Math.round(tris),
    verts,
    textures: texes,
    // uncompressed GPU cost of the maps, mip chain included (~1.33x)
    vram: Math.round(texPix * 4 * 1.333),
  };
}

const kb = (n) => `${(n / 1024).toFixed(0)}k`;
const mb = (n) => `${(n / 1048576).toFixed(1)}M`;

// ---- restore -------------------------------------------------------------
if (RESTORE) {
  let n = 0;
  for (const name of names) {
    const src = path.join(SRC_DIR, `${name}.glb`);
    if (!fs.existsSync(src)) continue;
    if (APPLY) fs.copyFileSync(src, path.join(PROPS_DIR, `${name}.glb`));
    console.log(`${APPLY ? 'restored' : 'would restore'} ${name}`);
    n++;
  }
  console.log(`\n${n} model(s)${APPLY ? ' restored from' : ' available in'} public/models/props/source/`);
  process.exit(0);
}

// ---- optimize ------------------------------------------------------------
fs.mkdirSync(SRC_DIR, { recursive: true });

const rows = [];
for (const name of names) {
  const shipped = path.join(PROPS_DIR, `${name}.glb`);
  const original = path.join(SRC_DIR, `${name}.glb`);
  // First run moves the untouched model into source/; later runs always read
  // from there, so re-running never optimizes an already-optimized model.
  if (!fs.existsSync(original)) {
    if (!fs.existsSync(shipped)) { console.log(`skip ${name} — no model`); continue; }
    if (APPLY) fs.copyFileSync(shipped, original);
    else { console.log(`(dry run) would archive ${name}.glb -> source/`); }
  }
  const input = fs.existsSync(original) ? original : shipped;
  const before = await measure(input);

  const doc = await io.read(input);
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_RATIO, error: SIMPLIFY_ERROR }),
    textureCompress({
      encoder: sharp, targetFormat: 'jpeg', resize: [TEX_SIZE, TEX_SIZE],
      quality: JPEG_Q,
    }),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
  );
  // textureCompress hands each rewritten image a filename; a .glb wants them
  // embedded in the binary chunk, not written out beside it as sidecar jpegs
  for (const tex of doc.getRoot().listTextures()) tex.setURI('');
  doc.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const out = path.join(PROPS_DIR, `${name}.glb`);
  const tmp = `${out}.tmp`;
  fs.writeFileSync(tmp, await io.writeBinary(doc));
  const after = await measure(tmp);
  if (APPLY) fs.renameSync(tmp, out); else fs.unlinkSync(tmp);

  rows.push({ name, before, after });
  console.log(
    `${name.padEnd(20)} ${kb(before.bytes).padStart(6)} -> ${kb(after.bytes).padStart(6)}` +
    `   tris ${String(before.tris).padStart(6)} -> ${String(after.tris).padStart(6)}` +
    `   verts ${String(before.verts).padStart(6)} -> ${String(after.verts).padStart(6)}` +
    `   vram ${mb(before.vram)} -> ${mb(after.vram)}`);
}

const sum = (k, side) => rows.reduce((a, r) => a + r[side][k], 0);
console.log(`\n${rows.length} model(s)${APPLY ? '' : ' (DRY RUN — nothing written)'}`);
console.log(`  files  ${mb(sum('bytes', 'before'))} -> ${mb(sum('bytes', 'after'))}`);
console.log(`  tris   ${sum('tris', 'before')} -> ${sum('tris', 'after')}`);
console.log(`  verts  ${sum('verts', 'before')} -> ${sum('verts', 'after')}`);
console.log(`  vram   ${mb(sum('vram', 'before'))} -> ${mb(sum('vram', 'after'))}  (textures, mips included)`);
if (!APPLY) console.log('\nre-run with --apply to write them');
