// GLB overrides for arena props (Tripo / any image-to-3D output).
//
// Drop a model at public/models/props/<propName>.glb and list it in
// public/models/props/manifest.json:
//   { "toriiGate": { "file": "toriiGate.glb", "fit": 13, "y": 0, "ry": 0 } }
//
// `fit` is the target world HEIGHT in meters — the loader uniform-scales the
// model so its bounding box matches, recenters it on its footprint and sits
// it on the ground, so raw Tripo exports need no manual sizing. `y` nudges it
// vertically after fitting, `ry` (degrees) pre-rotates it.
//
// The swap is VISUAL ONLY: placeProp() still runs the procedural builder for
// its gameplay userData (explosive / spikes / spin / campfire / bodies...),
// then replaces the built meshes with a clone of the prepared GLB. Collider
// measurement happens after the swap, so the game collides with what you see.
// A missing/broken file just means the procedural prop keeps rendering.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Where the model files live, relative to the page. The game sits at the site
// root; the workbench page is one directory down and says so
// (setPropAssetBase('../')), the same way gltf.js's setAssetBase works for the
// mech models.
let assetBase = '';
export function setPropAssetBase(base) { assetBase = base || ''; }

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);   // dist builds compress props too
const templates = new Map();   // propName -> prepared THREE.Group
const inFlight = new Map();    // propName -> Promise, so nothing loads twice
let manifestPromise = null;

function prepare(scene, entry) {
  const root = new THREE.Group();
  root.add(scene);
  scene.updateWorldMatrix(true, true);
  const bb = new THREE.Box3().setFromObject(scene);
  if (bb.isEmpty()) return null;
  const h = bb.max.y - bb.min.y;
  const s = (entry.fit || 8) / Math.max(h, 1e-3);
  scene.scale.setScalar(s);
  scene.position.set(
    -(bb.min.x + bb.max.x) / 2 * s,
    -bb.min.y * s + (entry.y || 0),
    -(bb.min.z + bb.max.z) / 2 * s,
  );
  if (entry.ry) scene.rotation.y = (entry.ry * Math.PI) / 180;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (entry.emissiveBoost && o.material?.emissive) {
        o.material.emissiveIntensity = (o.material.emissiveIntensity || 1) * entry.emissiveBoost;
      }
    }
  });
  return root;
}

// the prop manifest itself (a few hundred bytes), read once
export function propManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const res = await fetch(`${assetBase}models/props/manifest.json`);
        if (res.ok) return await res.json();
      } catch { /* no manifest — all props stay procedural */ }
      return {};
    })();
  }
  return manifestPromise;
}

/**
 * Warm the prop GLBs — BY NAME.
 *
 * An arena uses one to three of these models; loading all twenty at boot cost
 * ~13 MB of downloads and ~300 MB of texture memory for nineteen models nobody
 * was going to see. So the caller says which props its theme places
 * (`preloadPropModels(namesFromTheme)`) and only those are fetched. Each name
 * is remembered, so walking from arena to arena accumulates rather than
 * reloads, and calling with no argument still means "everything" — the level
 * editor genuinely can place any prop.
 */
export function preloadPropModels(names = null) {
  return (async () => {
    const man = await propManifest();
    const wanted = names ? [...new Set(names)].filter((n) => man[n]) : Object.keys(man);
    await Promise.all(wanted.map((name) => {
      if (templates.has(name)) return null;
      if (inFlight.has(name)) return inFlight.get(name);
      const entry = man[name];
      if (!entry || !entry.file) return null;
      const p = loader.loadAsync(`${assetBase}models/props/${entry.file}`)
        .then((gltf) => {
          const t = prepare(gltf.scene, entry);
          if (t) templates.set(name, t);
        })
        .catch(() => { /* missing/broken file — procedural fallback */ });
      inFlight.set(name, p);
      return p;
    }));
  })();
}

/**
 * Load ONE prop model on its own, prepared (fitted + grounded) exactly the way
 * the game prepares it, from either the shipped models or the pre-optimization
 * archive tools/propopt.mjs keeps in `props/source/`. Nothing is cached: this
 * exists for /workbench/?edit=props, which stands the two side by side and
 * measures them, and a workbench must always see the file as it is on disk.
 * Returns null when there is no model (or the file is missing).
 */
export async function loadPropModel(name, which = 'optimized') {
  const man = await propManifest();
  const entry = man?.[name];
  if (!entry?.file) return null;
  const dir = which === 'source' ? 'models/props/source' : 'models/props';
  try {
    const gltf = await loader.loadAsync(`${assetBase}${dir}/${entry.file}`);
    return prepare(gltf.scene, entry);
  } catch {
    return null;
  }
}

// synchronous: swap a built procedural prop's visuals for the GLB, keeping
// the group (position/rotation/userData hooks) intact. True if swapped.
const _bb = new THREE.Box3();
export function propGlbSwap(name, group) {
  const t = templates.get(name);
  if (!t) return false;
  // multi-body colliders were authored against the procedural silhouette —
  // remap them onto the GLB's footprint so "walk between the legs" still
  // matches what's on screen (offsets scale with the XZ extents, heights
  // clamp to the model)
  let remap = null;
  if (group.userData.bodies) {
    _bb.setFromObject(group);
    const pw = Math.max(_bb.max.x - _bb.min.x, 0.001);
    const pd = Math.max(_bb.max.z - _bb.min.z, 0.001);
    _bb.setFromObject(t);
    const sx = (_bb.max.x - _bb.min.x) / pw;
    const sz = (_bb.max.z - _bb.min.z) / pd;
    const gh = _bb.max.y;
    remap = { sx, sz, sr: Math.min((sx + sz) / 2, 1.4), gh };
  }
  group.clear();
  group.add(t.clone(true));
  if (remap) {
    group.userData.bodies = group.userData.bodies.map((b) => ({
      ...b,
      dx: b.dx * remap.sx, dz: b.dz * remap.sz,
      r: b.r * remap.sr, h: Math.min(b.h, remap.gh),
    }));
  }
  // a spin hook aimed at a named procedural part (crusher beacon, solar
  // wing) has no target inside the GLB — dropping it beats spinning the
  // entire model
  if (group.userData.spinName && !group.getObjectByName(group.userData.spinName)) {
    delete group.userData.spin;
    delete group.userData.spinName;
  }
  return true;
}
