// MECH MODEL DIET — fewer triangles, smaller textures, same robot.
//
//   node tools/mechopt.mjs                       # DRY RUN over the roster: measure, write nothing
//   node tools/mechopt.mjs --apply [id …]        # rewrite public/models/<file>.glb
//   node tools/mechopt.mjs --out <dir> [id …]    # write the result elsewhere (for A/B harnesses)
//   node tools/mechopt.mjs --restore [--apply] [id …]   # put the pre-diet file back from git
//   node tools/mechopt.mjs --audit [id …]        # did any model change size or shape?
//   dials: --ratio 0.5  --error 0.02  --tex 1024  --mr 512  --quality 85
//          --no-simplify  --no-textures  --force-simplify
//
// WHAT IT DOES, and why each step is safe for a MECH (a prop is dressing —
// tools/propopt.mjs explains why that one may be blunter):
//
//   simplify   meshoptimizer's simplifyWithAttributes to --ratio of the
//              triangles, error-bounded, with the SKIN WEIGHTS and normals in
//              the metric so a collapse across a bone border costs as much as
//              a collapse across the model: the surviving vertices keep their
//              own joints/weights (nothing is interpolated), so what deforms is
//              a subset of what deformed before. The error budget is tried
//              loosest-first and the model keeps the first result whose
//              bounding box still matches (propopt's rule — a shrunken
//              extremity moves the ground fit and the hurtbox).
//   textures   base colour + normal to --tex (1024) and metallic-roughness to
//              --mr (512), JPEG at --quality. Measured at the LARGEST view the
//              game has (mech select, one picker, 1080p): 2048 -> 1024 is not
//              a difference anybody can see; 512 softens decals. VRAM is where
//              the win is: three 2048² maps are ~64 MB per mech with mips.
//
// ONLY A BAKED MECH MAY BE SIMPLIFIED. A manifest entry still carrying skinOps,
// dropGeo, seamCuts or a rig file names VERTEX INDICES or draws a partition off
// the raw file, and simplification renumbers every vertex; those mechs get the
// texture diet only, until tools/bake-glb.mjs has folded their layer in.
// (--force-simplify overrides, for an experiment.) A baked entry is bone-keyed
// throughout — muzzles, boneCorrections, every code hook — so nothing in it
// can break; what CHANGES is everything measured off the vertices at load:
// the hurtbox capsules (which sample in file order), the foot calibration and
// the ground fit. Re-run the gates after --apply:
//   node tools/hurtboxfit.mjs        containment must not fall, bloat near 1
//   node tools/skindebug.mjs <id>    same findings, ±10% is noise
//   node tools/groundprobe.mjs <id>  same clips under the floor
//   node tools/anchorkeep.mjs <id>   anchors are bone-keyed: must read 0
//   node tools/posters.mjs           the asset changed: re-render the posters
//
// NOTHING IS ARCHIVED, GIT IS THE ARCHIVE: the sidecar written beside the bake
// archive (public/models/source/<id>.opt.json) records the commit the diet was
// applied on top of, the dials, and every before/after number, and --restore
// reads the pre-diet bytes back out of that commit. The shipped file stays a
// PLAIN glb — float attributes, no meshopt, no quantization — because it is
// still the authoring master the workbenches and every tools/*.mjs read;
// tools/dist.mjs compresses it at release as before.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { compactPrimitive, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const APPLY = flag('--apply');
const AUDIT = flag('--audit');
const RESTORE = flag('--restore');
const OUT = opt('--out', null);
const RATIO = +opt('--ratio', 0.5);
const ERROR0 = +opt('--error', 0.02);
const TEX = +opt('--tex', 1024);
const MR = +opt('--mr', 512);
const QUALITY = +opt('--quality', 85);
const DO_SIMPLIFY = !flag('--no-simplify');
const DO_TEXTURES = !flag('--no-textures');
const FORCE_SIMPLIFY = flag('--force-simplify');
const valueFlags = new Set(['--out', '--ratio', '--error', '--tex', '--mr', '--quality']);
const only = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]));

const MODELS = path.resolve('public/models');
const SRC = path.join(MODELS, 'source');
const MANIFEST = path.join(MODELS, 'manifest.json');
// Decimation error budget, as a fraction of the model's size; loosest first,
// the first one that leaves the bounding box intact is kept.
const ERROR_LADDER = [ERROR0, ERROR0 / 5, ERROR0 / 20, ERROR0 / 100, 0];
const TOL = 0.005;        // 0.5% of the model's own size — the audit's line too
// what still lives in a manifest entry when the model is NOT baked
const VERTEX_KEYED = ['skinOps', 'dropGeo', 'seamCuts', 'rig', 'dropBones', 'boneOverrides', 'reparent', 'stretch', 'bonePos'];

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const ids = Object.keys(manifest).filter((id) => manifest[id]?.url && (!only.length || only.includes(id)));
const io = new NodeIO();
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;   // simplifyWithAttributes is behind this flag in 0.22

const kb = (n) => `${(n / 1024).toFixed(0)}k`;
const mb = (n) => `${(n / 1048576).toFixed(1)}M`;

function measure(doc, file) {
  let tris = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices(), pos = prim.getAttribute('POSITION');
    tris += idx ? idx.getCount() / 3 : (pos?.getCount() || 0) / 3;
    verts += pos?.getCount() || 0;
  }
  let texPix = 0; const textures = [];
  for (const tex of doc.getRoot().listTextures()) {
    const s = tex.getSize() || [0, 0]; texPix += s[0] * s[1]; textures.push(`${s[0]}x${s[1]}`);
  }
  return { bytes: file ? fs.statSync(file).size : 0, tris: Math.round(tris), verts, textures, vram: Math.round(texPix * 4 * 1.333) };
}
function boundsOf(doc) {
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) return null;
  const { min, max } = getBounds(scene);
  return { d: [0, 1, 2].map((i) => max[i] - min[i]), c: [0, 1, 2].map((i) => (max[i] + min[i]) / 2) };
}
function shapeDrift(a, b) {
  if (!a || !b) return 0;
  let worst = 0;
  for (let i = 0; i < 3; i++) {
    const span = Math.max(a.d[i], 1e-9);
    worst = Math.max(worst, Math.abs(b.d[i] / span - 1), Math.abs(b.c[i] - a.c[i]) / span);
  }
  return worst;
}
const isBaked = (entry) => !VERTEX_KEYED.some((k) => entry[k] != null);
const sidecarPath = (id) => path.join(SRC, `${id}.opt.json`);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

// ---- simplify one primitive, skin-aware ------------------------------------
// meshopt's simplifier only ever REMOVES vertices, so JOINTS_0/WEIGHTS_0 stay
// exactly what the file authored for every vertex that survives; what the
// attribute metric buys is WHICH survive — an edge collapse that would hand a
// chest vertex to the shoulder is charged for the weight it moves.
function simplifyPrim(prim, ratio, error) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  if (!pos || !idx) return null;
  const positions = Float32Array.from(pos.getArray());
  const indices = Uint32Array.from(idx.getArray());
  const parts = [];   // [array, components, weight]
  const nrm = prim.getAttribute('NORMAL'); if (nrm) parts.push([nrm.getArray(), 3, 0.3]);
  const w = prim.getAttribute('WEIGHTS_0'); if (w) parts.push([w.getArray(), 4, 0.5]);
  const stride = parts.reduce((a, p) => a + p[1], 0);
  const attrs = new Float32Array(pos.getCount() * stride);
  const weights = [];
  let off = 0;
  for (const [arr, n, wt] of parts) {
    const norm = w && arr === w.getArray() && !(arr instanceof Float32Array) ? (arr instanceof Uint8Array ? 255 : 65535) : 1;
    for (let v = 0; v < pos.getCount(); v++) for (let k = 0; k < n; k++) attrs[v * stride + off + k] = arr[v * n + k] / norm;
    for (let k = 0; k < n; k++) weights.push(wt);
    off += n;
  }
  const target = Math.floor(ratio * indices.length / 3) * 3;
  const [out, err] = stride
    ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attrs, stride, weights, null, target, error, [])
    : MeshoptSimplifier.simplify(indices, positions, 3, target, error, []);
  idx.setArray(out.length > 65535 || pos.getCount() > 65535 ? out : new Uint16Array(out));
  compactPrimitive(prim);
  const after = prim.getAttribute('POSITION').getCount();
  if (after <= 65535 && !(prim.getIndices().getArray() instanceof Uint16Array)) {
    prim.getIndices().setArray(new Uint16Array(prim.getIndices().getArray()));
  }
  return { error: err, tris: out.length / 3 };
}

async function diet(file, entry, error, log) {
  const doc = await io.read(file);
  const simplified = [];
  if (DO_SIMPLIFY && (isBaked(entry) || FORCE_SIMPLIFY)) {
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      const r = simplifyPrim(prim, RATIO, error);
      if (r) simplified.push(r);
    }
  }
  if (DO_TEXTURES) {
    await doc.transform(
      textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [TEX, TEX], quality: QUALITY, slots: /^(baseColor|normal|emissive|occlusion)/ }),
      textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [MR, MR], quality: QUALITY, slots: /^metallicRoughness/ }),
    );
    for (const tex of doc.getRoot().listTextures()) tex.setURI('');
  }
  return { doc, simplified };
}

// ---- audit -----------------------------------------------------------------
if (AUDIT) {
  let flagged = 0, checked = 0;
  for (const id of ids) {
    const sc = fs.existsSync(sidecarPath(id)) ? JSON.parse(fs.readFileSync(sidecarPath(id), 'utf8')) : null;
    if (!sc) { console.log(`${id.padEnd(10)} — no diet recorded`); continue; }
    const file = path.join('public', manifest[id].url);
    const before = await io.readBinary(new Uint8Array(execFileSync('git', ['show', `${sc.commit}:${file}`], { maxBuffer: 1 << 30 })));
    const after = await io.read(file);
    const drift = shapeDrift(boundsOf(before), boundsOf(after));
    checked++;
    if (drift > TOL) flagged++;
    console.log(`${id.padEnd(10)} shape drift ${(drift * 100).toFixed(3)}%${drift > TOL ? '  <-- CHANGED' : ''}   (vs ${sc.commit.slice(0, 8)})`);
  }
  console.log(`\n${checked} model(s) compared, tolerance ${(TOL * 100).toFixed(1)}%`);
  console.log(flagged ? `\nFAIL — ${flagged} model(s) changed size or shifted\n` : '\nPASS — every dieted model matches its pre-diet self in size and placement\n');
  process.exit(flagged ? 1 : 0);
}

// ---- restore ---------------------------------------------------------------
if (RESTORE) {
  let n = 0;
  for (const id of ids) {
    if (!fs.existsSync(sidecarPath(id))) continue;
    const sc = JSON.parse(fs.readFileSync(sidecarPath(id), 'utf8'));
    const file = path.join('public', manifest[id].url);
    if (APPLY) {
      fs.writeFileSync(file, execFileSync('git', ['show', `${sc.commit}:${file}`], { maxBuffer: 1 << 30 }));
      fs.rmSync(sidecarPath(id));
    }
    console.log(`${APPLY ? 'restored' : 'would restore'} ${id} from ${sc.commit.slice(0, 8)}`);
    n++;
  }
  console.log(`\n${n} model(s)${APPLY ? ' restored' : ' restorable'}`);
  process.exit(0);
}

// ---- diet ------------------------------------------------------------------
if (OUT) fs.mkdirSync(OUT, { recursive: true });
if (APPLY) fs.mkdirSync(SRC, { recursive: true });
const commit = git('rev-parse', 'HEAD');
const rows = [];
for (const id of ids) {
  const entry = manifest[id];
  const file = path.join('public', entry.url);
  if (!fs.existsSync(file)) { console.log(`skip ${id} — no model`); continue; }
  if (fs.existsSync(sidecarPath(id)) && APPLY && !OUT) {
    console.log(`skip ${id} — already dieted (${sidecarPath(id)}); --restore first to re-run`);
    continue;
  }
  const srcDoc = await io.read(file);
  const before = measure(srcDoc, file);
  const beforeBox = boundsOf(srcDoc);
  const why = !isBaked(entry) && !FORCE_SIMPLIFY ? ` textures only — not baked (${VERTEX_KEYED.filter((k) => entry[k] != null).join(',')})` : '';
  let result = null, used = null, drift = 0, buf = null;
  for (const error of ERROR_LADDER) {
    result = await diet(file, entry, error, console.log);
    buf = await io.writeBinary(result.doc);
    drift = shapeDrift(beforeBox, boundsOf(result.doc));
    used = error;
    if (drift <= TOL || !result.simplified.length) break;
  }
  if (drift > TOL) { console.log(`${id.padEnd(10)} SKIPPED — shape drifts ${(drift * 100).toFixed(2)}% even at error 0`); continue; }
  const outFile = OUT ? path.join(OUT, path.basename(file)) : file;
  if (APPLY || OUT) fs.writeFileSync(outFile, buf);
  const after = measure(result.doc, APPLY || OUT ? outFile : null);
  after.bytes = buf.length;
  const simpErr = result.simplified.length ? Math.max(...result.simplified.map((s) => s.error)) : null;
  if (APPLY && !OUT) {
    fs.writeFileSync(sidecarPath(id), JSON.stringify({
      mech: id, file, commit, appliedAt: new Date().toISOString(),
      note: 'Diet applied by tools/mechopt.mjs on top of the model at `commit`; --restore reads that version back out of git.',
      dials: { ratio: RATIO, error: used, tex: TEX, mr: MR, quality: QUALITY, simplified: !!result.simplified.length },
      before, after, shapeDrift: drift, simplifyError: simpErr,
    }, null, 2) + '\n');
  }
  rows.push({ id, before, after });
  console.log(`${id.padEnd(10)} ${kb(before.bytes).padStart(7)} -> ${kb(after.bytes).padStart(7)}`
    + `   tris ${String(before.tris).padStart(6)} -> ${String(after.tris).padStart(6)}`
    + `   verts ${String(before.verts).padStart(6)} -> ${String(after.verts).padStart(6)}`
    + `   vram ${mb(before.vram)} -> ${mb(after.vram)}`
    + `   drift ${(drift * 100).toFixed(3)}%${result.simplified.length ? ` err ${used}${used !== ERROR_LADDER[0] ? ' (tightened)' : ''}` : ''}${why}`);
}
const sum = (k, side) => rows.reduce((a, r) => a + r[side][k], 0);
if (rows.length) {
  console.log(`\n${rows.length} model(s): ${mb(sum('bytes', 'before'))} -> ${mb(sum('bytes', 'after'))} on disk (plain glb; dist.mjs compresses), `
    + `${sum('tris', 'before')} -> ${sum('tris', 'after')} triangles, ${mb(sum('vram', 'before'))} -> ${mb(sum('vram', 'after'))} texture VRAM`);
  console.log(APPLY && !OUT ? 'APPLIED — now run the gates listed in the header.' : OUT ? `written to ${OUT}` : 'DRY RUN — nothing written. Re-run with --apply.');
}
