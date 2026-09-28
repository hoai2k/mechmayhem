// Static arena props (non-destructible dressing placed around the fight zone).
// Each builder returns a THREE.Group. Kept chunky & readable from far away.
// A prop with a generated model in public/models/props/ (see propglb.js) has
// its visuals swapped for the GLB at placement — gameplay hooks stay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand } from '../core/utils.js';
import { propGlbSwap } from './propglb.js';
import { M } from './props/kit.js';
import { COMMON, SET_PIECES } from './props/common.js';
import { FURNITURE } from './props/furniture.js';
import * as FOUNDRY from './props/foundry.js';
import * as FROZEN from './props/frozen.js';
import * as HARBOR from './props/harbor.js';
import * as JUNGLE from './props/jungle.js';
import * as NEON from './props/neon.js';
import * as ORBITAL from './props/orbital.js';
import * as QUARRY from './props/quarry.js';
import * as RUINS from './props/ruins.js';
import * as SCRAPYARD from './props/scrapyard.js';
import * as SKYTERRACE from './props/skyterrace.js';
import * as UPTOWN from './props/uptown.js';
import * as VOLCANO from './props/volcano.js';

export const PROP_MATS = M;

// THE TABLE, assembled from props/ in its original order — generic kit, each
// arena's original dressing, the shared set pieces, each arena's 2026-07
// landmarks, combat furniture — so every listing (the props workbench, the
// level editor's palette) reads as it always did. Add a prop to its arena's
// file (or props/common.js / props/furniture.js); nothing here changes.
export const PROPS = {
  ...COMMON,
  ...NEON.base,
  ...FOUNDRY.base,
  ...HARBOR.base,
  ...SKYTERRACE.base,
  ...SCRAPYARD.base,
  ...QUARRY.base,
  ...VOLCANO.base,
  ...FROZEN.base,
  ...RUINS.base,
  ...JUNGLE.base,
  ...ORBITAL.base,
  ...UPTOWN.base,
  ...SET_PIECES,
  ...NEON.landmarks,
  ...FOUNDRY.landmarks,
  ...UPTOWN.landmarks,
  ...HARBOR.landmarks,
  ...SKYTERRACE.landmarks,
  ...SCRAPYARD.landmarks,
  ...QUARRY.landmarks,
  ...VOLCANO.landmarks,
  ...FROZEN.landmarks,
  ...RUINS.landmarks,
  ...JUNGLE.landmarks,
  ...ORBITAL.landmarks,
  ...FURNITURE,
};

// ---------------------------------------------------------------------------
// MESH MERGE — the props' draw-call diet.
//
// A prop is authored as a pile of small boxes and cylinders (a substation is
// 28 of them) because that is how you sculpt readable shapes in code. The
// renderer sees 28 objects and issues 28 draw calls, and then the arena's
// toroidal wrap clones the whole prop group into the 8 neighbour cells, so
// every one of those meshes is submitted NINE times. Measured on `neon`:
// 2,439 prop meshes, ~720 of the frame's 1,590 draw calls — for 3% of its
// triangles. Props were never a triangle problem; they were an object-count
// problem.
//
// So once a prop is built, placed and MEASURED (its collider, hazards and
// hitboxes all come off the individual meshes — see Arena._regProp), the
// meshes that share a material are baked into one geometry. Same triangles,
// same pixels, a handful of objects instead of dozens.
//
// What is deliberately left alone:
//   · a named moving part (`userData.spinName` — the crusher beacon, the
//     conveyor drum, the sentry head): merging it into the body would weld
//     the animation shut, so that subtree is skipped whole
//   · a prop whose visuals came from a GLB — one mesh already
//   · anything with a single mesh, or a lone mesh per material
// Nothing about position, rotation, userData or the group's identity in
// propGroup.children changes, which is what the destruction path indexes.
export function mergePropMeshes(group) {
  if (!group || group.userData.merged) return 0;
  const keep = group.userData.spinName
    ? group.getObjectByName(group.userData.spinName)
    : null;
  group.updateMatrixWorld(true);
  // the body, then the moving part on its own: a spin part must stay a
  // separate object (it turns), but its own handful of meshes can still be
  // baked together inside it
  let saved = mergeUnder(group, keep);
  if (keep && keep.isObject3D && !keep.isMesh) saved += mergeUnder(keep, null);
  group.userData.merged = true;
  return saved;
}

// Bake every mesh under `root` (skipping `exclude`'s subtree) into one mesh
// per material, expressed in root's own local space. Returns meshes removed.
function mergeUnder(root, exclude) {
  const isProtected = (o) => {
    if (!exclude) return false;
    for (let p = exclude; p; p = p.parent) if (p === o) return true;
    return false;
  };

  const byMat = new Map();   // material -> the meshes wearing it
  let scanned = 0;
  for (const child of [...root.children]) {
    if (isProtected(child)) continue;
    child.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || !o.geometry?.attributes?.position) return;
      scanned++;
      const bucket = byMat.get(o.material) || [];
      bucket.push(o);
      byMat.set(o.material, bucket);
    });
  }
  if (scanned < 2) return 0;

  const rootInv = root.matrixWorld.clone().invert();
  const merged = [];
  let removed = 0;
  for (const [mat, meshes] of byMat) {
    if (meshes.length < 2) continue;
    const geos = [];
    let cast = false, receive = false;
    for (const m of meshes) {
      const g2 = m.geometry.clone();
      // into ROOT's local space: the group's own transform (where the prop
      // stands in the arena, its yaw) must stay on the group, not be baked in
      g2.applyMatrix4(rootInv.clone().multiply(m.matrixWorld));
      // merging needs identical attribute sets; the sculpting vocabulary only
      // ever produces position/normal/uv, but a stray extra would break it
      for (const key of Object.keys(g2.attributes)) {
        if (key !== 'position' && key !== 'normal' && key !== 'uv') g2.deleteAttribute(key);
      }
      if (!g2.attributes.normal) g2.computeVertexNormals();
      if (!g2.attributes.uv) {
        const n = g2.attributes.position.count;
        g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      geos.push(g2);
      cast = cast || m.castShadow;
      receive = receive || m.receiveShadow;
    }
    // mergeGeometries needs one answer for the whole batch: keep the indices
    // when every part has them (the sculpting primitives all do, and dropping
    // them would inflate a 24-vertex box into 36), otherwise flatten
    const parts = geos.every((g2) => g2.index) ? geos : geos.map((g2) => {
      if (!g2.index) return g2;
      const flat = g2.toNonIndexed();
      g2.dispose();
      return flat;
    });
    const combined = mergeGeometries(parts, false);
    parts.forEach((g2) => g2.dispose());
    if (!combined) continue;
    const mesh = new THREE.Mesh(combined, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    merged.push(mesh);
    for (const m of meshes) {
      m.removeFromParent();
      m.geometry.dispose();
      removed++;
    }
  }
  // empty husks left behind by the meshes that moved into a merged buffer
  for (const child of [...root.children]) {
    if (isProtected(child) || child.isMesh) continue;
    if (!child.children.length) child.removeFromParent();
  }
  merged.forEach((m) => root.add(m));
  return removed - merged.length;
}

// place a prop group at a position with rotation
export function placeProp(scene, list, name, x, z, opts = {}) {
  const builder = PROPS[name];
  if (!builder) return null;
  const g = builder(opts);
  g.name = `prop:${name}`;   // findable in the scene graph from dev tools
  propGlbSwap(name, g);   // generated model available? swap visuals, keep hooks
  g.position.x = x;
  g.position.z = z;
  if (opts.ry !== undefined) g.rotation.y = opts.ry;
  else g.rotation.y = rand(Math.PI * 2);
  scene.add(g);
  list.push(g);
  return g;
}
