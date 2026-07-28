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

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);   // dist builds compress props too
const templates = new Map();   // propName -> prepared THREE.Group
let loadPromise = null;

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

// kick off (or reuse) the async preload; safe to call many times
export function preloadPropModels() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let man = null;
    try {
      const res = await fetch('models/props/manifest.json');
      if (res.ok) man = await res.json();
    } catch { /* no manifest — all props stay procedural */ }
    if (!man) return;
    await Promise.all(Object.entries(man).map(async ([name, entry]) => {
      if (!entry || !entry.file) return;
      try {
        const gltf = await loader.loadAsync(`models/props/${entry.file}`);
        const t = prepare(gltf.scene, entry);
        if (t) templates.set(name, t);
      } catch { /* missing/broken file — procedural fallback */ }
    }));
  })();
  return loadPromise;
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
