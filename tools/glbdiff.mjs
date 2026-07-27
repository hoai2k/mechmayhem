// Structural diff between two GLBs — used to prove that the distribution
// build's compressed models are still the same RIG as the source models.
//
//   node tools/glbdiff.mjs <a.glb> <b.glb> [--json]
//
// WHAT THIS CHECKS, and why it stops where it does.
//
// Compression (tools/dist.mjs) does two things that defeat naive comparison:
// it REORDERS vertices (weld + cache optimisation, so vertex i in one file is
// not vertex i in the other), and it QUANTIZES positions and UVs to normalized
// integers whose dequantization rides on the inverse bind matrices. An
// index-wise vertex diff across that reports ~60% of model height on files
// that render identically, and a naive dequantize is easy to get subtly wrong.
// So geometry equivalence is NOT asserted here — it is verified in the game,
// through the real three.js loader, by tools/hurtboxfit.mjs (which measures
// the combat capsules off the loaded geometry) and by screenshots.
//
// What IS asserted here is computed purely from the node hierarchy, where no
// quantization is involved and the numbers are exact:
//
//   · skin / bone / mesh / node counts survive
//   · every bone still exists BY NAME
//   · every bone's rest-pose WORLD position is unmoved
//
// That is the property the hand-authored rigs, the muzzle anchors and the
// retargeting all stand on (MECH_ART_GUIDE §5). If this passes and hurtboxfit
// is unchanged, a compressed model cannot have moved a joint or a hitbox.
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

export function makeIO() {
  return new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

/** Bone rest-pose world translations keyed by name — the rig, as combat sees it. */
export function boneWorldPositions(doc) {
  const out = new Map();
  for (const skin of doc.getRoot().listSkins()) {
    for (const j of skin.listJoints()) {
      const m = j.getWorldMatrix();
      out.set(j.getName(), [m[12], m[13], m[14]]);
    }
  }
  return out;
}

function inventory(doc) {
  const root = doc.getRoot();
  let verts = 0;
  for (const m of root.listMeshes()) {
    for (const p of m.listPrimitives()) verts += p.getAttribute('POSITION').getCount();
  }
  return {
    skins: root.listSkins().length,
    bones: root.listSkins().reduce((n, s) => n + s.listJoints().length, 0),
    meshes: root.listMeshes().length,
    nodes: root.listNodes().length,
    textures: root.listTextures().length,
    verts,
  };
}

export function compareDocs(a, b) {
  const ia = inventory(a), ib = inventory(b);
  const res = { before: ia, after: ib, ok: true, notes: [] };

  for (const k of ['skins', 'bones', 'meshes', 'textures', 'verts']) {
    if (ia[k] !== ib[k]) { res.ok = false; res.notes.push(`${k}: ${ia[k]} -> ${ib[k]}`); }
  }

  const ba = boneWorldPositions(a), bb = boneWorldPositions(b);
  let boneMax = 0;
  for (const [name, p] of ba) {
    const q = bb.get(name);
    if (!q) { res.ok = false; res.notes.push(`bone missing after: ${name}`); continue; }
    boneMax = Math.max(boneMax, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  }
  res.maxBoneDev = boneMax;
  // bones are authored in model units where the mech is ~1 tall; anything
  // above float noise means the rig moved and the build must not ship
  if (boneMax > 1e-5) { res.ok = false; res.notes.push(`bones moved by ${boneMax.toExponential(2)}`); }
  return res;
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const [pathA, pathB] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!pathA || !pathB) {
    console.error('usage: node tools/glbdiff.mjs <a.glb> <b.glb> [--json]');
    process.exit(2);
  }
  const io = makeIO();
  const r = compareDocs(await io.read(pathA), await io.read(pathB));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    const b = r.before;
    console.log(`skins ${b.skins}  bones ${b.bones}  meshes ${b.meshes}  textures ${b.textures}  verts ${b.verts}`);
    console.log(`  max bone world dev  ${r.maxBoneDev.toExponential(3)}`);
    if (r.notes.length) console.log('  NOTES: ' + r.notes.join('; '));
    console.log(r.ok ? '  RIG INTACT' : '  RIG CHANGED — do not ship');
  }
  process.exit(r.ok ? 0 : 1);
}
