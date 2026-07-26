// Sub-meshes of a GLB's one skinned mesh, scoped to a set of BONES.
//
// A procedural mech is a tree of real Object3Ds, so anything that wants to dress
// a limb — the charge-tell glow sheath, the rocket fist's cut interior — just
// traverses that limb's joint and works on the meshes it finds. A GLB has no
// geometry on the joints at all: it is ONE skinned mesh whose vertices ride
// bones. These helpers are the equivalent: pick the triangles that ride a limb's
// bones, and hand back a mesh over just those, SHARING the original's vertex
// buffers and skeleton so it deforms with the body and costs no extra memory.
import * as THREE from 'three';

// A geometry that SHARES another's vertex attributes but carries its own index —
// a sub-mesh with no duplicated vertex data.
export function subGeometry(src, triangles, idx) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    if (src.attributes[name]) g.setAttribute(name, src.attributes[name]);
  }
  const arr = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    arr[i * 3] = idx.getX(t * 3);
    arr[i * 3 + 1] = idx.getX(t * 3 + 1);
    arr[i * 3 + 2] = idx.getX(t * 3 + 2);
  }
  g.setIndex(new THREE.BufferAttribute(arr, 1));
  return g;
}

// Every bone index at or below `roots` in the skeleton. The procedural side
// traverses a joint's SUBTREE (dressing shoulderL also dresses the elbow, hand
// and fist hanging off it), so the bone version has to walk down too.
export function boneSubtreeIndices(mesh, roots) {
  const bones = mesh.skeleton.bones;
  const idxOf = new Map(bones.map((b, i) => [b, i]));
  const out = new Set();
  for (const r of roots) {
    if (!r) continue;
    r.traverse((o) => {
      const i = idxOf.get(o);
      if (i !== undefined) out.add(i);
    });
  }
  return out;
}

// Triangles whose every vertex rides one of `boneIndices`. Whole triangles only,
// so a shell never has torn edges hanging off the limb it dresses.
export function trianglesForBones(mesh, boneIndices) {
  const geo = mesh.geometry;
  const idx = geo.index;
  const si = geo.attributes.skinIndex;
  if (!idx || !si || !boneIndices.size) return [];
  const on = new Uint8Array(si.count);
  for (let i = 0; i < si.count; i++) if (boneIndices.has(si.getX(i))) on[i] = 1;
  const tris = [];
  for (let t = 0; t < idx.count / 3; t++) {
    const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2);
    if (on[a] && on[b] && on[c]) tris.push(t);
  }
  return tris;
}

/**
 * A SkinnedMesh over the limb(s) rooted at `rootBones`, sharing `mesh`'s vertex
 * buffers, skeleton and bind matrix — so it tracks the body exactly with no
 * transform bookkeeping of its own. Returns null when nothing rides those bones.
 */
export function buildBoneShell(mesh, rootBones, material, name = 'boneShell') {
  const tris = trianglesForBones(mesh, boneSubtreeIndices(mesh, rootBones));
  if (!tris.length) return null;
  const shell = new THREE.SkinnedMesh(subGeometry(mesh.geometry, tris, mesh.geometry.index), material);
  shell.name = name;
  shell.frustumCulled = false;
  shell.castShadow = false;
  // match the skinned mesh's own node transform, then share its bind matrix
  shell.position.copy(mesh.position);
  shell.quaternion.copy(mesh.quaternion);
  shell.scale.copy(mesh.scale);
  (mesh.parent || mesh).add(shell);
  shell.bind(mesh.skeleton, mesh.bindMatrix.clone());
  return shell;
}
