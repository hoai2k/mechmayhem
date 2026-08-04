// THE PROP'S REAL SHAPE.
//
// A prop's gameplay collider is ONE VERTICAL CYLINDER measured off its ground
// band (Arena._regProp), which is right for a smokestack and a lie for anything
// that is not round. THE GEAR is the worked example: a thin brass disc standing
// on edge, six units across and one deep, whose cylinder is a solid pillar as
// wide as the disc and as tall as the top of it. A mech walking at it stopped
// three units short of a face he could see, and a SURFACE WALKER climbed the
// pillar — konga ended up hanging in the air beside a gear with all four limbs
// reaching and nothing to hold.
//
// So a prop also carries its SHELL: the world boxes of its own meshes, merged
// down to a handful. That is what the fighter is pushed out of
// (Arena.collideFighter) and what the climber's field reads (climb.js
// collectSolids), so what you touch is what you see. The cylinder STAYS and is
// still the broad phase: the damage radius, "am I inside a prop", the AI's
// avoidance and the ghost clones all want one cheap round number, and none of
// them are about contact.
//
// Merged greedily, cheapest union first, because the count is what everything
// downstream pays: 13 meshes on a gear become 3 boxes that still say "disc",
// where their single union would say "block".
//
// It lives in its own module so `node tools/propshell.mjs` — the audit that
// ranks every prop in every arena by how far its collider floats off its own
// geometry — measures the SAME code the game builds with.
import * as THREE from 'three';

const _bb = new THREE.Box3();

const volOf = (b) => Math.max(0, b[3] - b[0]) * Math.max(0, b[4] - b[1]) * Math.max(0, b[5] - b[2]);
const unionOf = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]),
  Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])];

// The PHANTOM SKIN of a collider: points sampled over its own surface, each
// measured to the nearest point ON THE MODEL. That is literally how far a body
// held against the collider sits off the thing it looks like it is touching, so
// it is the number that decides which collider a prop gets.
//
// MEASURED AGAINST THE VERTICES, not against the mesh boxes — that distinction
// is the whole reason this function is honest. Score a box shell against the
// boxes it was built from and it reads 0.00 by construction, which says a ROCK
// (an irregular blob whose box has a whole corner of air in it) is perfectly
// fitted; a body then stands on the box's flat top a metre above the stone.
// The cloud is decimated to `VERT_CAP` points, evenly through each mesh, so the
// cost is bounded and the comparison between the two candidates is fair.
const VERT_CAP = 320;

function vertDist(cloud, x, y, z) {
  let best = Infinity;
  for (let i = 0; i < cloud.length; i += 3) {
    const dx = x - cloud[i], dy = y - cloud[i + 1], dz = z - cloud[i + 2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function phantom(pts, cloud) {
  let sum = 0, max = 0;
  for (const p of pts) {
    const d = vertDist(cloud, p[0], p[1], p[2]);
    sum += d;
    if (d > max) max = d;
  }
  return { mean: sum / Math.max(1, pts.length), max };
}

/** A decimated world-space point cloud of the prop's own surface. */
export function propCloud(group, cap = VERT_CAP) {
  const meshes = [];
  let total = 0;
  group.updateWorldMatrix(true, true);
  group.traverse((o) => {
    if (!o.isMesh || o.userData.noCollide) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    meshes.push(o);
    total += pos.count;
  });
  if (!meshes.length) return new Float32Array(0);
  const step = Math.max(1, Math.ceil(total / cap));
  const out = [];
  const v = new THREE.Vector3();
  for (const o of meshes) {
    const pos = o.geometry.attributes.position;
    // every mesh contributes at least its first vertex, so a small part of a
    // big prop is never sampled away entirely
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  }
  return new Float32Array(out);
}

// sample points over a standing cylinder (side + top) and over a box's faces
function cylPoints(r, h, cx, cz) {
  const pts = [];
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    for (let k = 1; k <= 5; k++) pts.push([cx + Math.cos(th) * r, (k / 6) * h, cz + Math.sin(th) * r]);
    pts.push([cx + Math.cos(th) * r * 0.6, h, cz + Math.sin(th) * r * 0.6]);
  }
  return pts;
}

function boxPoints(b) {
  const pts = [];
  const at = (a, z, t) => a + (z - a) * t;
  for (let i = 0; i <= 2; i++) {
    for (let j = 0; j <= 2; j++) {
      const u = i / 2, v = j / 2;
      pts.push([b[0], at(b[1], b[4], u), at(b[2], b[5], v)]);
      pts.push([b[3], at(b[1], b[4], u), at(b[2], b[5], v)]);
      pts.push([at(b[0], b[3], u), b[1], at(b[2], b[5], v)]);
      pts.push([at(b[0], b[3], u), b[4], at(b[2], b[5], v)]);
      pts.push([at(b[0], b[3], u), at(b[1], b[4], v), b[2]]);
      pts.push([at(b[0], b[3], u), at(b[1], b[4], v), b[5]]);
    }
  }
  return pts;
}

/** Every mesh's world box — the model, as the audit and the chooser see it. */
export function propMeshBoxes(group) {
  const out = [];
  group.updateWorldMatrix(true, true);
  group.traverse((o) => {
    if (!o.isMesh || o.userData.noCollide) return;
    _bb.setFromObject(o);
    if (!_bb.isEmpty()) out.push([_bb.min.x, _bb.min.y, _bb.min.z, _bb.max.x, _bb.max.y, _bb.max.z]);
  });
  return out;
}

/** The phantom skin of a prop's two candidate colliders, for the audit. */
export function propSkins(group, cylinder, maxBoxes = 6) {
  const cloud = propCloud(group);
  if (!cloud.length) return null;
  const shell = shellBoxes(group, maxBoxes);
  return {
    meshes: propMeshBoxes(group).length,
    cyl: cylinder ? phantom(cylPoints(cylinder.r, cylinder.h, cylinder.x || 0, cylinder.z || 0), cloud) : null,
    shell: shell ? phantom(shell.flatMap(boxPoints), cloud) : null,
    boxes: shell ? shell.length : 0,
  };
}

/**
 * THE COLLIDER A PROP ACTUALLY GETS. Boxes when they hug the model better than
 * the round collider does, `null` when they do not — WHICH IS MEASURED, not
 * guessed, because "the shell is more accurate" is only true of props that are
 * not round: a smokestack, a fuel tank or a coolant vat is a cylinder, and
 * boxing it makes the corners worse. Sampling both and keeping the better one
 * costs a few thousand clamps once per placed prop and means no prop is ever
 * given a worse collider than it had.
 */
export function propShell(group, cylinder = null, maxBoxes = 6) {
  const boxes = shellBoxes(group, maxBoxes);
  if (!boxes || !cylinder) return boxes;
  const cloud = propCloud(group);
  if (!cloud.length) return null;
  const cyl = phantom(cylPoints(cylinder.r, cylinder.h, cylinder.x || 0, cylinder.z || 0), cloud);
  const sh = phantom(boxes.flatMap(boxPoints), cloud);
  // the mean is what a body meets on an average approach; the worst direction
  // breaks a tie, since that is the one that reads as a hover
  if (sh.mean > cyl.mean || (sh.mean === cyl.mean && sh.max > cyl.max)) return null;
  return boxes;
}

/**
 * The world-space boxes of a built prop's own meshes, merged to at most
 * `maxBoxes`. Returns null when the group has no mesh to measure.
 */
function shellBoxes(group, maxBoxes = 6) {
  const boxes = [];
  group.updateWorldMatrix(true, true);
  group.traverse((o) => {
    if (!o.isMesh || o.userData.noCollide) return;
    _bb.setFromObject(o);
    if (!_bb.isEmpty()) boxes.push([_bb.min.x, _bb.min.y, _bb.min.z, _bb.max.x, _bb.max.y, _bb.max.z]);
  });
  if (!boxes.length) return null;
  while (boxes.length > maxBoxes) {
    let bi = 0, bj = 1, best = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const cost = volOf(unionOf(boxes[i], boxes[j])) - volOf(boxes[i]) - volOf(boxes[j]);
        if (cost < best) { best = cost; bi = i; bj = j; }
      }
    }
    boxes[bi] = unionOf(boxes[bi], boxes[bj]);
    boxes.splice(bj, 1);
  }
  return boxes;
}
