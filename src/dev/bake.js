// ?bake=<id> — headless GLB finalization. Bakes every geometry/skeleton/skin
// edit (custom rig, skinOps, reparent, rig posts, stretch, bonePos) into a GLB
// and exposes the bytes for tools/bake-glb.mjs to write to disk. NOT an
// interactive tool — it renders nothing; it just prepares window.__bakeGlb.
//
// The RUNTIME half of the pipeline (RigAdapter retarget, glbanim gait, muzzles,
// height scaling) is intentionally NOT baked — it stays in the manifest/code
// and re-applies on load, driving the baked bones by name. See bakeMechScene.
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { bakeMechScene } from '../mechs/gltf.js';

export async function runBake(id) {
  window.__bakeReady = false;
  window.__bakeErr = null;
  try {
    const res = await bakeMechScene(id);
    if (!res) throw new Error(`no GLB manifest entry for "${id}"`);
    const { model, boneMap, customRig, renames, transform } = res;

    let meshes = 0, verts = 0;
    const boneNames = [];
    model.traverse((o) => {
      if (o.isBone) boneNames.push(o.name);
      if (o.isMesh || o.isSkinnedMesh) {
        meshes++; verts += o.geometry?.attributes?.position?.count || 0;
        // GLTFExporter writes geometry.userData into the file as primitive
        // extras, and feather.js caches its geodesic graph THERE (an object of
        // per-vertex adjacency, tens of MB as JSON). It is a session cache for a
        // skinOp the bake has just folded away, so in the file it is dead weight
        // the loader parses on every load: konga shipped at 29.6 MB with 21.7 MB
        // of it this graph, saurion 45.7 with 33.9. Only `rwSeam` (the seam
        // record the skin audit reads) is meant to leave with the model.
        const ud = o.geometry?.userData;
        if (ud) for (const k of Object.keys(ud)) if (k.startsWith('__')) delete ud[k];
      }
    });

    const exporter = new GLTFExporter();
    const buf = await new Promise((resolve, reject) =>
      exporter.parse(model, resolve, reject, { binary: true, onlyVisible: false }));

    // ArrayBuffer -> base64 (chunked; a GLB can be several MB)
    const u8 = new Uint8Array(buf);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    window.__bakeGlb = {
      base64: btoa(bin),
      byteLength: buf.byteLength,
      report: { id, customRig, bones: boneNames.length, meshes, verts,
        mappedJoints: Object.keys(boneMap).length, boneNames, renames, transform,
        // final joint -> bone NAME, after renameBonesToJoints. The tool writes
        // the residual `boneOverrides` from this: normally empty (every bone now
        // answers to its joint name), but a joint whose target name was already
        // taken keeps its override rather than being silently unmapped.
        jointBones: Object.fromEntries(Object.entries(boneMap).map(([j, b]) => [j, b?.name])) },
    };
    window.__bakeReady = true;
  } catch (e) {
    window.__bakeErr = String((e && e.stack) || e);
    window.__bakeReady = true;
  }
}
