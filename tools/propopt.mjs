// PROP MODEL OPTIMIZER — shrink the arena-prop GLBs, keep the originals.
//
//   node tools/propopt.mjs                 # DRY RUN: measure + report, write nothing
//   node tools/propopt.mjs --apply         # optimize every prop
//   node tools/propopt.mjs --apply toriiGate headframe
//   node tools/propopt.mjs --restore       # put the originals back
//   node tools/propopt.mjs --audit         # did any model CHANGE SIZE OR SHAPE?
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
import { NodeIO, getBounds } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, quantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const PROPS_DIR = path.resolve('public/models/props');
const SRC_DIR = path.join(PROPS_DIR, 'source');
const TARGET_RATIO = 0.45;   // triangles kept by the simplifier
// Decimation error budget, as a fraction of the model's size. Tried in this
// order and the first one that leaves the bounding box intact is kept — see
// the note in the optimize loop.
const ERROR_LADDER = [0.02, 0.004, 0.001, 0.0002, 0];
const TEX_SIZE = 512;        // per-map resolution after the pass
const JPEG_Q = 82;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore');
const AUDIT = args.includes('--audit');
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

// ---- audit ---------------------------------------------------------------
// DID THE OPTIMIZATION MOVE ANYTHING? Decimation and position quantization are
// both allowed to nudge vertices, and a prop that came out 4% shorter is a prop
// whose collider, muzzle clearance and "walk between the legs" gaps all changed
// with it. So compare the two files as SHAPES, in the model's own units:
//
//   size    the bounding box, per axis
//   ratio   optimized / original, per axis — 1.000 is untouched
//   centre  where the box sits, as a fraction of the model's size (a shifted
//           centre means the geometry moved even if the extents match)
//   in-game the height the loader fits it to (props/manifest.json `fit`) and
//           the footprint that fit produces, which is what the arena measures
//           its collider from
//
// Anything past TOL is called out. Nothing here is expected to change: the
// pass is meant to remove detail, not resize models.
const TOL = 0.005;   // 0.5% — quantization noise lives well below this

if (AUDIT) {
  const man = JSON.parse(fs.readFileSync(path.join(PROPS_DIR, 'manifest.json'), 'utf8'));
  const size = async (file) => {
    if (!fs.existsSync(file)) return null;
    const doc = await io.read(file);
    const scene = doc.getRoot().listScenes()[0];
    if (!scene) return null;
    const { min, max } = getBounds(scene);
    return {
      min, max,
      d: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      c: [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2],
    };
  };
  let flagged = 0, checked = 0;
  console.log('\nmodel                 axis   original  optimized   ratio    in-game (fitted)');
  for (const name of names) {
    const a = await size(path.join(SRC_DIR, `${name}.glb`));
    const b = await size(path.join(PROPS_DIR, `${name}.glb`));
    if (!a || !b) { console.log(`${name.padEnd(20)} — no pair to compare`); continue; }
    checked++;
    const ratio = a.d.map((v, i) => (v > 1e-9 ? b.d[i] / v : 1));
    // the loader scales each model to a target HEIGHT, so what reaches the
    // arena is the footprint that fit produces — report both
    const fit = man[name]?.fit || 8;
    const inGameA = a.d.map((v) => (v * fit) / Math.max(a.d[1], 1e-9));
    const inGameB = b.d.map((v) => (v * fit) / Math.max(b.d[1], 1e-9));
    const off = ratio.map((r) => Math.abs(r - 1));
    // a centre shift is measured against the model's own size, so a 20 m ship
    // and a 1 m mine are held to the same relative standard
    const shift = a.c.map((v, i) => Math.abs(b.c[i] - v) / Math.max(a.d[i], 1e-9));
    const bad = Math.max(...off, ...shift) > TOL;
    if (bad) flagged++;
    const axes = ['x', 'y', 'z'];
    for (let i = 0; i < 3; i++) {
      const mark = (off[i] > TOL || shift[i] > TOL) ? ' <-- CHANGED' : '';
      console.log(
        `${(i ? '' : name).padEnd(20)} ${axes[i]}   ${a.d[i].toFixed(3).padStart(9)}`
        + ` ${b.d[i].toFixed(3).padStart(10)}   ${ratio[i].toFixed(4).padStart(6)}`
        + `   ${inGameA[i].toFixed(2).padStart(6)} -> ${inGameB[i].toFixed(2).padStart(6)} m${mark}`);
    }
  }
  console.log(`\n${checked} model(s) compared, tolerance ${(TOL * 100).toFixed(1)}%`);
  console.log(flagged
    ? `\nFAIL — ${flagged} model(s) changed size or shifted\n`
    : '\nPASS — every optimized model matches its original in size, proportion and placement\n');
  process.exit(flagged ? 1 : 0);
}

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

// bounding box of a document's first scene, in the model's own units
function boundsOf(doc) {
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) return null;
  const { min, max } = getBounds(scene);
  return {
    d: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    c: [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2],
  };
}

// how far two boxes differ, as the worst of (per-axis size ratio, per-axis
// centre shift measured against the model's own size)
function shapeDrift(a, b) {
  if (!a || !b) return 0;
  let worst = 0;
  for (let i = 0; i < 3; i++) {
    const span = Math.max(a.d[i], 1e-9);
    worst = Math.max(worst, Math.abs(b.d[i] / span - 1), Math.abs(b.c[i] - a.c[i]) / span);
  }
  return worst;
}

async function optimize(file, error) {
  const doc = await io.read(file);
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_RATIO, error }),
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
  return doc;
}

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
  const beforeBox = boundsOf(await io.read(input));

  // SIZE IS NOT NEGOTIABLE. Decimation is free to spend its error budget on
  // whatever costs least, and on a few of these models that was an extremity —
  // a mast, a roof vent, a fingertip — which shrinks the bounding box, and the
  // loader then scales the whole prop up to hit its `fit` height, moving the
  // footprint the arena measures its collider from. So the error budget is
  // tried loosest-first and the model KEEPS the first one whose bounding box
  // still matches the original within TOL. A model that will not decimate
  // without changing shape simply keeps its triangles; the textures, which are
  // most of the win, are unaffected either way.
  let doc = null, after = null, used = null, drift = 0;
  const tmp = `${shipped}.tmp`;
  for (const error of ERROR_LADDER) {
    doc = await optimize(input, error);
    fs.writeFileSync(tmp, await io.writeBinary(doc));
    after = await measure(tmp);
    drift = shapeDrift(beforeBox, boundsOf(doc));
    used = error;
    if (drift <= TOL) break;
    fs.unlinkSync(tmp);
  }
  if (drift > TOL) {
    // never happened on this set, but a model that cannot hold its shape at
    // any error budget must not be silently reshaped
    console.log(`${name.padEnd(20)} SKIPPED — shape drifts ${(drift * 100).toFixed(2)}% even at error 0`);
    continue;
  }
  if (APPLY) fs.renameSync(tmp, shipped); else fs.unlinkSync(tmp);

  rows.push({ name, before, after });
  console.log(
    `${name.padEnd(20)} ${kb(before.bytes).padStart(6)} -> ${kb(after.bytes).padStart(6)}` +
    `   tris ${String(before.tris).padStart(6)} -> ${String(after.tris).padStart(6)}` +
    `   verts ${String(before.verts).padStart(6)} -> ${String(after.verts).padStart(6)}` +
    `   vram ${mb(before.vram)} -> ${mb(after.vram)}` +
    `   err ${used}${used === ERROR_LADDER[0] ? '' : ' (tightened to hold its size)'}`);
}

const sum = (k, side) => rows.reduce((a, r) => a + r[side][k], 0);
console.log(`\n${rows.length} model(s)${APPLY ? '' : ' (DRY RUN — nothing written)'}`);
console.log(`  files  ${mb(sum('bytes', 'before'))} -> ${mb(sum('bytes', 'after'))}`);
console.log(`  tris   ${sum('tris', 'before')} -> ${sum('tris', 'after')}`);
console.log(`  verts  ${sum('verts', 'before')} -> ${sum('verts', 'after')}`);
console.log(`  vram   ${mb(sum('vram', 'before'))} -> ${mb(sum('vram', 'after'))}  (textures, mips included)`);
if (!APPLY) console.log('\nre-run with --apply to write them');
