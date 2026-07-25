// Custom rig: replace a GLB's (often scrambled) auto-rig skeleton with a
// clean, hand-placed one whose bones ARE the game joints, then rebind the mesh
// to it with per-part rigid weights. For hard-surface mechs this is exactly
// right — each shell part rides one bone — and it lets a crab's giant claws be
// real independent arms instead of geometry welded to a leg bone.
//
// A rig is data (see src/mechs/rigs/<id>.js), authored/tuned live in the
// ?rigedit tool:
//   { bones: [{ name, parent, pos:[x,y,z] }, ...] }   // pos in MESH-LOCAL space
// Bone names that match game joints (shoulderL, handR, thighL, ...) are what
// the RigAdapter drives; extra bones (name not a joint) hold static geometry
// (a crab's spare walking legs) so it doesn't follow a driven limb.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _av = new THREE.Vector3();

// nearest point-to-segment squared distance (segment a→b)
function segDist2(px, py, pz, a, b) {
  _ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  _av.set(px - a[0], py - a[1], pz - a[2]);
  const len2 = _ab.lengthSq();
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, _av.dot(_ab) / len2)) : 0;
  const dx = _av.x - _ab.x * t, dy = _av.y - _ab.y * t, dz = _av.z - _ab.z * t;
  return dx * dx + dy * dy + dz * dz;
}

// The spans a rig's bones compete over — every vertex joins the bone whose
// span it sits nearest. Which span a bone gets depends on `rig.skinSpan`:
//
//   'parent' (DEFAULT) — one span per bone, bone→its parent. The original
//     behaviour; cranky/glacier/jerry are placed and bias-tuned against it.
//   'child' — one span per bone→child pair (a leaf gets a point at its own
//     position), so a bone owns the limb hanging BELOW it.
//
// 'child' is the one that deforms correctly. three.js pivots a bone's
// vertices about that bone's OWN origin, so the slice a joint should carry is
// the one on the far side of it from the body: under 'parent' the upper arm
// belongs to `elbow`, and bending the elbow swings the upper arm around the
// elbow — the shoulder end flies off the body — instead of swinging the
// forearm. Opt in per rig; it changes which bone every vertex lands on, so an
// existing rig can't be switched without re-tuning its `bias` values.
function skinSpans(rig) {
  const index = Object.fromEntries(rig.bones.map((b, i) => [b.name, i]));
  const span = (b, other) => ({ idx: index[b.name], a: b.pos, b: other, bias: b.bias || 1 });
  if (rig.skinSpan !== 'child') {
    return rig.bones.map((b) => span(b,
      b.parent && index[b.parent] !== undefined ? rig.bones[index[b.parent]].pos : b.pos));
  }
  const kids = new Map();
  for (const b of rig.bones) {
    if (!b.parent || index[b.parent] === undefined) continue;
    if (!kids.has(b.parent)) kids.set(b.parent, []);
    kids.get(b.parent).push(b);
  }
  const spans = [];
  for (const b of rig.bones) {
    const cs = kids.get(b.name);
    if (!cs?.length) spans.push(span(b, b.pos));            // leaf: a point at the tip
    else for (const c of cs) spans.push(span(b, c.pos));    // one span per limb below it
  }
  return spans;
}

// Compute a rigid per-vertex bone assignment for `rig` against `mesh`
// geometry (mesh-local positions). Each vertex → the bone whose span (see
// skinSpans) is nearest. Returns {skinIndex, skinWeight}.
export function computeWeights(mesh, rig) {
  const pos = mesh.geometry.attributes.position;
  const n = pos.count;
  // a bone may over-reach: `bias` widens (<1) / narrows (>1) its win radius
  const segs = skinSpans(rig);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let best = 0, bestD = Infinity;
    for (const s of segs) {
      const d = segDist2(x, y, z, s.a, s.b) * s.bias;
      if (d < bestD) { bestD = d; best = s.idx; }
    }
    skinIndex[i * 4] = best;
    skinWeight[i * 4] = 1;
  }
  return { skinIndex, skinWeight };
}

// Build a bone hierarchy from rig data. Positions are MESH-LOCAL; bind pose is
// rotation-free so each bone's LOCAL position = its world pos minus the
// parent's. Returns { bones, byName, root }.
export function buildSkeletonBones(rig) {
  const byName = {};
  const bones = [];
  for (const bd of rig.bones) {
    const bone = new THREE.Bone();
    bone.name = bd.name;
    byName[bd.name] = bone;
    bones.push(bone);
  }
  let root = null;
  for (const bd of rig.bones) {
    const bone = byName[bd.name];
    if (bd.parent && byName[bd.parent]) {
      const pp = rig.bones.find((b) => b.name === bd.parent).pos;
      byName[bd.parent].add(bone);
      bone.position.set(bd.pos[0] - pp[0], bd.pos[1] - pp[1], bd.pos[2] - pp[2]);
    } else {
      bone.position.set(bd.pos[0], bd.pos[1], bd.pos[2]);
      root = bone;
    }
  }
  return { bones, byName, root };
}

// Wire visible "posts" (metal rods) through the rig — for every bone flagged
// `post` in the rig, a cylinder from its PARENT to it, parented to the parent
// bone so it follows the animation and bends at each joint. Purely generated
// from the current bone positions, so it survives any rig edit: move a bone and
// the post moves, add a bone (with post) and a new segment appears. Fills in a
// limb the GLB never modeled (jerry's back legs). Returns the meshes so the
// caller can dispose + rebuild them after an edit. General — any rig can use it.
//   bone.post: true | { radius?, color? }
export function buildRigPosts(byName, rig, opts = {}) {
  const meshes = [];
  const up = new THREE.Vector3(0, 1, 0);
  const to = new THREE.Vector3();
  const byBd = Object.fromEntries(rig.bones.map((b) => [b.name, b]));
  for (const bd of rig.bones) {
    if (!bd.post || !bd.parent) continue;
    const bone = byName[bd.name], parent = byName[bd.parent];
    if (!bone || !parent) continue;
    to.copy(bone.position);                 // child's local offset from parent (bind)
    const len = to.length();
    if (len < 1e-4) continue;
    const cfg = typeof bd.post === 'object' ? bd.post : {};
    const r = cfg.radius ?? opts.radius ?? 0.02;
    const geo = new THREE.CylinderGeometry(r, r, len, 10);
    geo.translate(0, len / 2, 0);           // base at the parent joint, extends toward the child
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color ?? opts.color ?? 0x0b0b0e, roughness: 0.45, metalness: 0.85,
    });
    const m = new THREE.Mesh(geo, mat);
    m.quaternion.setFromUnitVectors(up, to.clone().normalize());
    m.castShadow = true;
    m.userData.rigPost = bd.name;
    parent.add(m);
    meshes.push(m);
    // a little cap sphere at the joint so segments read as one continuous rod
    if (byBd[bd.name]?.post) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 10, 8), mat);
      bone.add(cap); meshes.push(cap);
    }
  }
  return meshes;
}

// Re-write the mesh's per-vertex weights from the current rig (used live by
// ?rigedit after a bone is moved) without touching the skeleton binding.
export function setWeights(mesh, rig) {
  const { skinIndex, skinWeight } = computeWeights(mesh, rig);
  mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

// Recapture the CURRENT bone poses as the bind pose (so the mesh renders at
// rest for whatever positions the bones are in now). Used after a gizmo move
// so editing bind positions never deforms the model.
export function rebindRest(mesh, bones) {
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld.clone());
}

// Replace `mesh`'s skeleton with a fresh hand-placed one and rebind. The bones
// are placed in mesh-LOCAL space and parented under the mesh's own parent, so
// they inherit the model's transform (scale/ground/yaw) exactly like the
// original armature did. Returns { bones, byName, root, skeleton }.
export function applyCustomRig(mesh, rig) {
  // Own the geometry before rewriting skin weights. cloneSkinned shares
  // geometry across clones (and the cached gltf scene), so re-skinning in place
  // would corrupt every other user of this GLB — notably a same-file variant
  // (glacier's `alt` is the same GLB as its Tripo primary). A private clone
  // keeps the re-skin local to this build.
  mesh.geometry = mesh.geometry.clone();
  const { bones, byName, root } = buildSkeletonBones(rig);
  // No root = an empty rig, or every bone naming a parent (typo/cycle). Say so
  // instead of letting the next line throw on null — callers (createMech, the
  // ?rigedit preflight) can then report something a human can act on.
  if (!root) {
    throw new Error(`custom rig has no root bone (${rig.bones?.length || 0} bones): `
      + 'exactly one bone must have parent: null');
  }

  // place the bone tree in the SAME space the geometry lives in. mesh.matrix
  // maps mesh-local → parent space; bones authored in mesh-local must be
  // pre-multiplied by it so they land on the geometry when parented to
  // mesh.parent (Tripo SkinnedMeshes usually sit at identity, but don't assume).
  const parent = mesh.parent || mesh;
  mesh.updateMatrix();
  root.applyMatrix4(mesh.matrix);   // fold mesh-local→parent-space into the root
  parent.add(root);
  parent.updateMatrixWorld(true);

  const { skinIndex, skinWeight } = computeWeights(mesh, rig);
  mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const skeleton = new THREE.Skeleton(bones);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton, mesh.matrixWorld.clone());
  return { bones, byName, root, skeleton };
}
