// CREATE DISTRIBUTION — the build you upload, as opposed to the build you work in.
//
//   node tools/dist.mjs [--out dist-web] [--keep-hidden] [--no-textures] [--no-models]
//   npm run dist:web
//
// WHY THIS IS A SEPARATE STEP, rather than something `npm run build` does.
//
// The models and textures in the repo are AUTHORING MASTERS. The workbenches
// pose, re-skin and re-rig them; tools/anchorkeep, hurtboxfit and cliptear
// measure them; src/combat/hurtbox.js derives capsules from their geometry.
// Compression is lossy in exactly the dimension all of that cares about —
// quantized positions, reordered vertices, transcoded texels — so it must
// never touch the files under version control, and must never be in the way
// when iterating. It belongs at the end, on a COPY, once per release.
//
// So this branches a distribution off the tree without changing a byte of it:
//
//   1. builds with RW_DIST=1, which drops the /workbench/ page from the build
//      inputs and compiles out the ?debug / ?showcase / level-editor routes
//   2. removes the models of mechs the shipped game cannot reach (roster
//      `hidden: true`) and the workbench-only `alt` sub-entries, rewriting
//      public/models/manifest.json in the OUTPUT only
//   3. quantizes (16-bit) + meshopt-compresses every surviving GLB. Safe
//      because src/mechs/dequantize.js folds quantization back into the
//      vertices at load; see the note at the compression step for what is
//      still deliberately left off, and why
//   4. transcodes the PNG texture pack to WebP and rewrites the hashed
//      references in the emitted JS
//   5. verifies every compressed model still has the same rig (tools/glbdiff)
//      and prints a size table
//
// The source tree is read-only throughout. `dist-web/` is what you zip.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { compareDocs, makeIO } from './glbdiff.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

const OUT = path.resolve(opt('--out', 'dist-web'));
const KEEP_HIDDEN = flag('--keep-hidden');
const DO_TEXTURES = !flag('--no-textures');
const DO_MODELS = !flag('--no-models');

const MB = (n) => (n / 1e6).toFixed(2) + ' MB';
const dirSize = (d) => {
  let t = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    t += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return t;
};
const step = (s) => console.log(`\n\x1b[36m▸ ${s}\x1b[0m`);

// ---------------------------------------------------------------- 1. build
step(`vite build → ${path.relative(process.cwd(), OUT)}`);
fs.rmSync(OUT, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], {
  stdio: 'inherit',
  env: { ...process.env, RW_DIST: '1' },
});

const sizeAfterBuild = dirSize(OUT);

// ------------------------------------------------- 2. drop unreachable models
step('pruning models the shipped game cannot reach');
const manifestPath = path.join(OUT, 'models/manifest.json');
const modelsDir = path.join(OUT, 'models');
let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const { ROSTER, playableRoster } = await import('../src/mechs/roster.js');
const playable = new Set(playableRoster().map((m) => m.id));
const hidden = ROSTER.filter((m) => m.hidden).map((m) => m.id);

const dropped = [];
if (!KEEP_HIDDEN) {
  for (const id of Object.keys(manifest)) {
    if (!playable.has(id)) { dropped.push(`${id} (not in the playable roster)`); delete manifest[id]; }
  }
}
// `alt` sub-entries are a workbench affordance (a second model, or the same
// model on a staged rig). The game never loads them.
let altCount = 0;
for (const [id, entry] of Object.entries(manifest)) {
  if (entry && typeof entry === 'object' && entry.alt) {
    if (entry.alt.url) dropped.push(`${id}.alt`);
    delete entry.alt;
    altCount++;
  }
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// delete every GLB the rewritten manifest no longer references
const referenced = new Set(
  Object.values(manifest).map((e) => e?.url).filter(Boolean).map((u) => path.basename(u)),
);
let removedBytes = 0, removedFiles = 0;
for (const f of fs.readdirSync(modelsDir)) {
  if (!f.endsWith('.glb') || referenced.has(f)) continue;
  removedBytes += fs.statSync(path.join(modelsDir, f)).size;
  fs.rmSync(path.join(modelsDir, f));
  removedFiles++;
}
console.log(`  hidden mechs: ${hidden.join(', ') || '(none)'}`);
console.log(`  dropped entries: ${dropped.join(', ') || '(none)'} · alt entries stripped: ${altCount}`);
console.log(`  removed ${removedFiles} GLB files, ${MB(removedBytes)}`);

// ---------------------------------------------------- 3. compress the models
const modelRows = [];
if (DO_MODELS) {
  step('meshopt-compressing models');
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const verifyIO = makeIO();

  for (const f of fs.readdirSync(modelsDir).filter((x) => x.endsWith('.glb'))) {
    const p = path.join(modelsDir, f);
    const before = fs.statSync(p).size;
    const doc = await io.read(p);
    // QUANTIZE AT 16 BITS, THEN COMPRESS — and deliberately NOT the stock
    // gltf-transform meshopt() pipeline. Both halves of that are measured.
    //
    // Quantization is safe now because src/mechs/dequantize.js folds it back
    // into the vertices at load, so nothing downstream sees normalized
    // integers (that file explains the failure it exists to prevent). What is
    // NOT safe is meshopt()'s REORDER pass: src/combat/hurtbox.js samples
    // every Nth vertex in file order, so shuffling the order re-rolls which
    // vertices the capsule fits see. Vertex counts are unchanged — it is
    // purely the sampling — but the fits move, and colossus' bloat went
    // 1.26x -> 2.13x on a reordered roster. Turning that on means re-measuring
    // hitboxes across the whole roster, i.e. a balance change; it is worth
    // roughly another 23 MB and belongs in its own task.
    //
    // 16 bits rather than the default depths: at defaults, cranky/frogger/
    // inferno/tempest drift by a point of containment and ~0.03 bloat. At 16
    // bits every shipped mech is identical except tempest (+1% containment,
    // +0.01 bloat). The extra ~6 MB buys a much stronger claim.
    await doc.transform(quantize({
      quantizePosition: 16, quantizeNormal: 16, quantizeTexcoord: 16,
      quantizeWeight: 16, quantizeGeneric: 16,
    }));
    doc.createExtension(EXTMeshoptCompression).setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    const buf = await io.writeBinary(doc);
    fs.writeFileSync(p, buf);

    // gate: the rig must be untouched. This is a cheap structural backstop,
    // NOT proof of geometric equivalence — see tools/glbdiff.mjs for what it
    // deliberately does not assert. The real geometry check is hurtboxfit,
    // run against a swapped-in compressed roster (see docs/WEB_LAUNCH_CHECKLIST).
    const cmp = compareDocs(await verifyIO.read(path.join('public/models', f)), await verifyIO.read(p));
    if (!cmp.ok) {
      console.error(`\n  ✗ ${f}: ${cmp.notes.join('; ')}`);
      throw new Error(`compression changed the rig of ${f} — distribution aborted`);
    }
    modelRows.push({ f, before, after: buf.length, boneDev: cmp.maxBoneDev, bones: cmp.before.bones });
    console.log(`  ${f.padEnd(24)} ${MB(before).padStart(9)} → ${MB(buf.length).padStart(9)}`
      + `  (${(before / buf.length).toFixed(1)}×)  rig ok, bone dev ${cmp.maxBoneDev.toExponential(1)}`);
  }
}

// -------------------------------------------------- 4. transcode the textures
let texBefore = 0, texAfter = 0, texCount = 0;
if (DO_TEXTURES) {
  step('transcoding the texture pack to WebP');
  const assets = path.join(OUT, 'assets');
  const pngs = fs.readdirSync(assets).filter((f) => f.endsWith('.png'));

  // Quality by map type. Albedo and emissive are viewed through lighting and
  // tolerate more; normal and roughness drive shading maths, so they keep more
  // bits. (Only the generated pack under src/textures/ lands in assets/ — the
  // sprite atlases and thumbs are copied verbatim from public/.)
  const qualityFor = (name) => (/_(normal|rough|metal)-/.test(name) ? 95 : 90);

  const renames = new Map();
  for (const f of pngs) {
    const p = path.join(assets, f);
    const before = fs.statSync(p).size;
    const outName = f.replace(/\.png$/, '.webp');
    await sharp(p).webp({ quality: qualityFor(f), effort: 5 }).toFile(path.join(assets, outName));
    const after = fs.statSync(path.join(assets, outName)).size;
    fs.rmSync(p);
    renames.set(f, outName);
    texBefore += before; texAfter += after; texCount++;
  }

  // Rewrite the hashed references in the emitted JS. Safe as a plain string
  // swap: these filenames carry a content hash, so they are unique tokens and
  // appear nowhere else. The import.meta.glob KEYS in texload.js still say
  // ".png" and are untouched — only the URL values move.
  let patched = 0;
  for (const f of fs.readdirSync(assets).filter((x) => x.endsWith('.js'))) {
    const p = path.join(assets, f);
    let src = fs.readFileSync(p, 'utf8');
    let hit = false;
    for (const [from, to] of renames) {
      if (src.includes(from)) { src = src.split(from).join(to); hit = true; }
    }
    if (hit) { fs.writeFileSync(p, src); patched++; }
  }
  console.log(`  ${texCount} textures  ${MB(texBefore)} → ${MB(texAfter)}`
    + `  (${texBefore ? (texBefore / texAfter).toFixed(1) : 0}×), references patched in ${patched} chunk(s)`);
}

// ------------------------------------------------------------- 5. the report
const finalSize = dirSize(OUT);
step('distribution ready');
const srcSize = dirSize(path.resolve('public')) ;
console.log(`  output            ${path.relative(process.cwd(), OUT)}/`);
console.log(`  after vite build  ${MB(sizeAfterBuild)}`);
console.log(`  after packaging   ${MB(finalSize)}   (${(sizeAfterBuild / finalSize).toFixed(1)}× smaller)`);
if (modelRows.length) {
  const b = modelRows.reduce((n, r) => n + r.before, 0);
  const a = modelRows.reduce((n, r) => n + r.after, 0);
  console.log(`  models            ${MB(b)} → ${MB(a)}  across ${modelRows.length} files, every rig verified`);
}
if (texCount) console.log(`  textures          ${MB(texBefore)} → ${MB(texAfter)}  across ${texCount} files`);
console.log(`\n  zip the CONTENTS of ${path.relative(process.cwd(), OUT)}/ (index.html at the zip root) for itch.io.`);
console.log(`  the source tree was not modified — public/models is untouched (${MB(srcSize)}).`);
