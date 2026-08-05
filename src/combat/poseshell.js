// A POSED BODY, FROZEN AND DETACHED — a throwaway copy of a mech exactly as it
// is drawn this frame, owned by nobody, free to be moved, scaled and faded
// while the real mech carries on being a fighter.
//
// Two things want one (both WRAITH's, which is not a coincidence — he is the
// roster's ghost): GHOST PROTOCOL projects a spectre of his body that glides
// forward and hurts what it passes through, and the LOOM taunt leaves a giant
// apparition behind to swell and disperse into bats while he steps back out of
// it at his own size. Both need the same thing and neither can have the real
// body: it is mid-fight.
//
// WHY NOT CLONE THE SkinnedMesh. A skinned mesh's rendered vertices follow the
// BONES, and the bone matrices already contain the mesh node's own transform —
// so `matrixWorld` on a SkinnedMesh is not where its skin is drawn. Copying it
// onto a static mesh floats the copy metres off the ground (Tripo's exports
// carry an Armature offset that makes this loud). Cloning the skeleton instead
// gets it right but hands you a second animated rig to keep alive, which is a
// lot of machinery for a shell that never moves again. So the skin is BAKED:
// every vertex asked for its skinned position once (`getVertexPosition`, which
// applies the bone weights) and written into a plain static geometry.
//
// THE ORIGIN IS WHY THIS TAKES A PARAMETER. Baked vertices are absolute world
// positions, so the group they sit in has its own origin at the world origin —
// which is fine for translating a shell and useless for SCALING one, because
// scaling a group scales about its origin and the shell would fly off toward
// the middle of the arena. Pass the pivot you mean to grow about (a mech's feet)
// and the vertices are stored relative to it; put the group there and scale is
// about that point.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _shift = new THREE.Matrix4();

/**
 * Bake `root` as it is drawn right now into a detached static shell.
 *
 * @param {THREE.Object3D} root   the mech's group (posed, in the scene)
 * @param {Object}   opts
 * @param {THREE.Material|Function} opts.material  one material for the whole
 *        shell, or `(sourceMaterial) => Material` to derive one per source
 *        material — the second form is what keeps the shell LOOKING like the
 *        mech instead of like a spectre. Derived materials are cached per
 *        source, so a body sharing one material across ten meshes makes one.
 * @param {THREE.Vector3} [opts.origin]  the pivot to store vertices relative
 *        to; place the returned group here. Defaults to the world origin,
 *        which is "absolute world coordinates".
 * @param {boolean} [opts.normals]  recompute normals on the baked skin. Needed
 *        by any LIT material (the bake moved every vertex, so the source
 *        normals are for the bind pose); pass false for an unlit shell — a flat
 *        spectre does not read them and a second pass over the geometry is not
 *        free on a 100k-vertex body.
 * @returns {{group: THREE.Group, materials: THREE.Material[], dispose: Function}}
 */
export function bakePoseShell(root, { material, origin = null, normals = true } = {}) {
  const group = new THREE.Group();
  const owned = [];                 // materials WE made — dispose() frees these
  const derive = typeof material === 'function' ? material : null;
  const cache = derive ? new Map() : null;
  const matFor = (src) => {
    if (!derive) return material;
    if (!cache.has(src)) { const m = derive(src); cache.set(src, m); owned.push(m); }
    return cache.get(src);
  };
  const pick = (src) => (Array.isArray(src) ? src.map(matFor) : matFor(src));

  if (origin) _shift.makeTranslation(-origin.x, -origin.y, -origin.z);

  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    if (o.isSkinnedMesh) {
      o.skeleton.update();
      const src = o.geometry.attributes.position;
      const arr = new Float32Array(src.count * 3);
      for (let i = 0; i < src.count; i++) {
        o.getVertexPosition(i, _v);       // skin-aware: follows the bones
        o.localToWorld(_v);
        if (origin) _v.sub(origin);
        arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      if (o.geometry.index) geo.setIndex(o.geometry.index);
      // a multi-material mesh draws in GROUPS; drop them and only the first
      // material's slice is ever rendered
      for (const g of o.geometry.groups || []) geo.addGroup(g.start, g.count, g.materialIndex);
      if (normals) geo.computeVertexNormals();   // the bake moved them
      const m = new THREE.Mesh(geo, pick(o.material));
      m.matrixAutoUpdate = false;
      m.userData.bakedGeo = true;         // owned by the shell — dispose with it
      group.add(m);
      return;
    }
    // a plain mesh is where its matrixWorld says it is, so its geometry is
    // shared rather than copied and only the transform is baked
    const m = new THREE.Mesh(o.geometry, pick(o.material));
    m.matrixAutoUpdate = false;
    m.matrix.copy(o.matrixWorld);
    if (origin) m.matrix.premultiply(_shift);
    group.add(m);
  });

  return {
    group,
    materials: owned,
    dispose() {
      group.parent?.remove(group);
      for (const m of group.children) if (m.userData.bakedGeo) m.geometry.dispose();
      for (const m of owned) m.dispose();
      group.clear();
    },
  };
}
