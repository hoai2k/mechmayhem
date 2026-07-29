// THE MANNEQUIN — a reference humanoid on the game's own rig.
//
// Every workbench asks the same question in a different way: "where is this
// part SUPPOSED to be?" On a real mech that question is hard to answer, because
// the answer is buried under a Tripo model's own bind pose, its fused weapons,
// its digitigrade crouch and whatever the skin weights are doing. So here is a
// body with nothing hidden: blocky limbs, an unmistakable foot (heel behind the
// ankle, arch, toe box in front), a nose on the front of the head, a thumb on
// each hand, and one flat colour per bone.
//
// It is not decoration. It is the SAME 15 joints, in the SAME hierarchy, at the
// SAME measurements as the mech it stands in for (factory.buildRig / computeDims
// — see the conventions there: mech faces +Z, arms hang down -Y, L is -X), so:
//
//   · the gait workbench can run a mech's real gait on it and you can finally
//     see what the animator is asking of a foot;
//   · the pose workbench can pose it and the export is still a clip pose;
//   · the SKIN workbench can analyse it like any GLB, because it is a genuine
//     SkinnedMesh with real weights — one clean region per bone, blended across
//     a narrow band at each joint, which is the layout a repaired mech should
//     end up looking like;
//   · the RIG editor can stand it beside a raw model to show where a bone
//     belongs — the difference between the ANKLE (the joint, above and forward
//     of the heel) and the heel itself is a whole reference model's worth of
//     explanation.
//
// Colour is the vocabulary: WARM = the mech's LEFT side, COOL = its RIGHT, and
// each limb darkens as it goes outboard (upper arm → forearm → hand). The
// centre line (pelvis, chest, head) is neutral grey. Nothing here is per-mech.
import * as THREE from 'three';

// One tint per bone. Warm = left, cool = right; darker = further out the limb.
// Legs get their own hue pair so a leg is never mistaken for an arm in a
// screenshot. The skin workbench recolours by bone index anyway — these are for
// the tools that show the mannequin as itself (gait, pose, rig).
export const BONE_TINTS = {
  hips: 0x9aa2ae, torso: 0xc3c9d4, head: 0xe6eaf2,
  shoulderL: 0xffb03a, elbowL: 0xff8a1e, handL: 0xe06a00,
  shoulderR: 0x58c8ff, elbowR: 0x2ba6f0, handR: 0x0d78c8,
  thighL: 0xff5d7a, kneeL: 0xe33b5e, ankleL: 0xb81f42,
  thighR: 0x4fe0a0, kneeR: 0x27bd80, ankleR: 0x0f9260,
};

// The rig order the game uses (rigadapter JOINT_ORDER minus `hips`, which leads).
// The SkinnedMesh's skeleton is built in exactly this order, which is what makes
// the skin workbench's bone-index colours mean the same thing every time.
const BONE_ORDER = [
  'hips', 'torso', 'head',
  'shoulderL', 'elbowL', 'handL',
  'shoulderR', 'elbowR', 'handR',
  'thighL', 'kneeL', 'ankleL',
  'thighR', 'kneeR', 'ankleR',
];

/**
 * A canonical humanoid's measurements for a given total height, in the same
 * shape as factory.computeDims. Artist-mannequin proportions (~7.5 heads):
 * hip joints at 0.53H, knees at 0.285H, shoulders at 0.82H, foot 0.15H long.
 * Used where the point is the IDEAL layout (the rig and skin references)
 * rather than a particular mech's build.
 */
export function canonicalDims(height = 7) {
  const H = height;
  const hipHeight = 0.53 * H;
  const kneeY = 0.285 * H;
  const ankleY = 0.045 * H;
  const shoulderY = 0.82 * H;
  const elbowY = 0.625 * H;
  const wristY = 0.475 * H;
  return {
    scale: H / 7,
    bulk: 1,
    hipHeight,
    thighLen: hipHeight - 0.1 * (H / 7) - kneeY,   // the rig hangs the thigh from hips - 0.1*scale
    shinLen: kneeY - ankleY,
    hipW: 0.062 * H,
    torsoH: 0.31 * H,
    torsoW: 0.128 * H,          // chest, not shoulder span: the arms hang CLEAR
    torsoD: 0.085 * H,
    headSize: 0.058 * H,
    shoulderW: 0.115 * H,
    upperArmLen: shoulderY - elbowY,
    foreArmLen: elbowY - wristY,
    footLen: 0.15 * H,
    canonical: true,
  };
}

// ---------------------------------------------------------------------------
// geometry assembly: primitives baked into one skinned buffer
// ---------------------------------------------------------------------------
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();

class SkinBuilder {
  constructor(boneIndex) {
    this.boneIndex = boneIndex;         // name -> index in the skeleton
    this.pos = []; this.nrm = []; this.col = [];
    this.si = []; this.sw = [];
  }

  /**
   * Bake one primitive into the buffer.
   *   geo     a BufferGeometry, authored around the origin
   *   matrix  where it goes, in the mannequin's own space
   *   weights either a bone name (hard bind) or (x, y, z) => [[name, w], …]
   *           with the point already in mannequin space — that is what draws a
   *           real blend band across a joint instead of a hard seam
   *   tint    0xRRGGBB, or (x, y, z) => 0xRRGGBB for shading inside one bone
   */
  add(geo, matrix, weights, tint) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal;
    _nm.getNormalMatrix(matrix);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      const x = _v.x, y = _v.y, z = _v.z;
      this.pos.push(x, y, z);
      _v.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
      this.nrm.push(_v.x, _v.y, _v.z);
      c.setHex(typeof tint === 'function' ? tint(x, y, z) : tint, THREE.SRGBColorSpace);
      this.col.push(c.r, c.g, c.b);
      const w = typeof weights === 'function' ? weights(x, y, z) : [[weights, 1]];
      // four slots, normalised — the format three's skinning shader reads
      const slots = w.slice(0, 4);
      let total = slots.reduce((t, s) => t + s[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        const s = slots[k];
        this.si.push(s ? this.boneIndex[s[0]] : 0);
        this.sw.push(s ? s[1] / total : 0);
      }
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    // a UV channel, because some tools (and any material with a map) expect one
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((this.pos.length / 3) * 2), 2));
    geo.computeBoundingSphere();
    return geo;
  }
}

// A limb segment: a capsule from a to b, with a blend band across each end that
// shares weight with the neighbouring bone — the thing a good rig does and a bad
// one doesn't.
function segment(B, a, b, radius, bone, parentBone, childBone, tint) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-5) return;
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, len - radius * 2), 3, 10);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  _m.compose(mid, q, new THREE.Vector3(1, 1, 1));
  // blend band: a fifth of the segment at each end, or the joint radius,
  // whichever is smaller — narrow, so the seam still reads as being AT the joint
  const band = Math.min(len * 0.2, radius * 1.6);
  const axis = dir.clone().normalize();
  const weights = (x, y, z) => {
    const t = _v.set(x, y, z).sub(a).dot(axis);            // 0 at a, len at b
    if (parentBone && t < band) {
      const k = 0.5 * (1 - t / band);                       // 0.5 at the joint
      return [[bone, 1 - k], [parentBone, k]];
    }
    if (childBone && t > len - band) {
      const k = 0.5 * (1 - (len - t) / band);
      return [[bone, 1 - k], [childBone, k]];
    }
    return [[bone, 1]];
  };
  B.add(geo, _m.clone(), weights, tint);
}

function block(B, center, size, bone, tint, rotY = 0) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2], 1, 1, 1);
  _m.compose(center, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
    new THREE.Vector3(1, 1, 1));
  B.add(geo, _m.clone(), bone, tint);
}

function ball(B, center, r, bone, tint) {
  const geo = new THREE.SphereGeometry(r, 12, 8);
  _m.compose(center, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  B.add(geo, _m.clone(), bone, tint);
}

const darken = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
};

/**
 * Build the reference humanoid.
 *   dims  factory.computeDims output (or canonicalDims) — the mannequin borrows
 *         a mech's real measurements so the animation it plays is that mech's
 *         animation, with only the BODY replaced by something readable
 *   def   optional roster def to carry (gait / restPose / combatPose). Its `id`
 *         is deliberately replaced: per-mech SIGNATURE motion reaches for joints
 *         a reference body has no business owning (tails, extra legs), so the
 *         mannequin shows the SHARED engine — the gait, the rest stance, the
 *         combat carriage — and nothing bespoke.
 *
 * Returns the same shape as buildMech: { group, joints, boneMap, dims, def, … }
 * plus `mesh` / `skeleton` for the geometry tools and `isMannequin: true`.
 */
export function buildMannequin({ dims, def = null } = {}) {
  const D = dims || canonicalDims(7);
  const s = D.scale, bulk = D.bulk || 1;

  // ---- the rig: factory.buildRig, in bones ----
  const bones = {};
  const root = new THREE.Group();
  root.name = 'root';
  const b = (name, parent, x = 0, y = 0, z = 0) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    (parent || root).add(bone);
    bones[name] = bone;
    return bone;
  };
  const hips = b('hips', root, 0, D.hipHeight, 0);
  const torso = b('torso', hips, 0, 0.18 * s, 0);
  b('head', torso, 0, D.torsoH, 0.05 * s);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = b('shoulder' + side, torso, sx * D.shoulderW, D.torsoH * 0.82, 0);
    const el = b('elbow' + side, sh, sx * 0.08 * s, -D.upperArmLen, 0);
    b('hand' + side, el, 0, -D.foreArmLen, 0);
    const th = b('thigh' + side, hips, sx * D.hipW, -0.1 * s, 0);
    const kn = b('knee' + side, th, 0, -D.thighLen, 0);
    b('ankle' + side, kn, 0, -D.shinLen, 0.02 * s);
  }
  root.updateMatrixWorld(true);

  // world (= mannequin-space) position of a bone at bind pose
  const at = (name) => bones[name].getWorldPosition(new THREE.Vector3());
  const boneList = BONE_ORDER.map((n) => bones[n]);
  const boneIndex = {};
  BONE_ORDER.forEach((n, i) => { boneIndex[n] = i; });

  // ---- the body ----
  const B = new SkinBuilder(boneIndex);
  const T = BONE_TINTS;
  const pelvis = at('hips'), chest = at('torso'), skull = at('head');
  const armR = 0.115 * s * bulk, legR = 0.145 * s * bulk;

  // PELVIS — a block, wider than deep, sitting just under the hip joint and
  // WIDER than the waist above it, so the two read as separate bones. The hips
  // bone is the body's root: everything the gait does to hipsPos/hipsRot moves
  // this block and everything hanging off it.
  const pelvisH = 0.46 * s;
  const pelvisTop = pelvis.y - 0.08 * s + pelvisH * 0.5;
  block(B, pelvis.clone().add(new THREE.Vector3(0, -0.08 * s, 0)),
    [D.hipW * 2 + 0.34 * s * bulk, pelvisH, D.torsoD * 0.9], 'hips', T.hips);

  // CHEST — from just above the pelvis up to the shoulder line, narrower than
  // the shoulder span so the arms hang clear of it, with a sternum ridge on the
  // FRONT so a screenshot can never be read back-to-front.
  const shY = at('shoulderL').y;
  const chestBot = Math.max(pelvisTop + 0.04 * s, chest.y);
  const chestH = Math.max(0.3 * s, shY - chestBot);
  const chestMid = chestBot + chestH * 0.5;
  block(B, new THREE.Vector3(0, chestMid, chest.z),
    [D.torsoW * 1.05, chestH, D.torsoD * 0.95], 'torso', T.torso);
  block(B, new THREE.Vector3(0, chestMid, chest.z + D.torsoD * 0.52),
    [D.torsoW * 0.3, chestH * 0.66, D.torsoD * 0.16], 'torso', darken(T.torso, 0.72));

  // NECK + SKULL + NOSE + EYES — the head's own orientation, unmissable.
  block(B, new THREE.Vector3(0, (shY + skull.y) * 0.5, skull.z * 0.5),
    [0.16 * s, Math.max(0.08 * s, skull.y - shY), 0.16 * s], 'head', darken(T.head, 0.7));
  const hs = D.headSize;
  block(B, skull.clone().add(new THREE.Vector3(0, hs, 0)), [hs * 1.7, hs * 2, hs * 1.8], 'head', T.head);
  block(B, skull.clone().add(new THREE.Vector3(0, hs, hs * 1.0)), [hs * 0.4, hs * 0.4, hs * 0.5], 'head', 0xff4d4d);
  for (const ex of [-1, 1]) {
    block(B, skull.clone().add(new THREE.Vector3(ex * hs * 0.45, hs * 1.35, hs * 0.86)),
      [hs * 0.34, hs * 0.26, hs * 0.12], 'head', 0x20242c);
  }

  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = at('shoulder' + side), el = at('elbow' + side), hd = at('hand' + side);
    const th = at('thigh' + side), kn = at('knee' + side), an = at('ankle' + side);

    // ARM: upper arm, forearm, and a paddle hand with a THUMB — which is how
    // you see whether a wrist roll has turned the palm the wrong way.
    ball(B, sh, armR * 1.25, 'shoulder' + side, darken(T['shoulder' + side], 0.8));
    segment(B, sh, el, armR, 'shoulder' + side, 'torso', 'elbow' + side, T['shoulder' + side]);
    ball(B, el, armR * 1.05, 'elbow' + side, darken(T['elbow' + side], 0.8));
    segment(B, el, hd, armR * 0.88, 'elbow' + side, 'shoulder' + side, 'hand' + side, T['elbow' + side]);
    const palmLen = 0.34 * s;
    block(B, hd.clone().add(new THREE.Vector3(0, -palmLen * 0.5, 0)),
      [armR * 1.5, palmLen, armR * 0.7], 'hand' + side, T['hand' + side]);
    block(B, hd.clone().add(new THREE.Vector3(sx * armR * 0.9, -palmLen * 0.28, armR * 0.2)),
      [armR * 0.9, palmLen * 0.35, armR * 0.5], 'hand' + side, darken(T['hand' + side], 1.25));

    // LEG: thigh, shin, and THE FOOT — the part every one of these tools is
    // really arguing about. The ankle JOINT is up here, at the back of the
    // arch; the heel juts behind it, the sole plate runs forward under the
    // arch, and the toe box is out in front. A foot that "points" is rotating
    // about this joint, not about the toe.
    ball(B, th, legR * 1.1, 'thigh' + side, darken(T['thigh' + side], 0.8));
    segment(B, th, kn, legR, 'thigh' + side, 'hips', 'knee' + side, T['thigh' + side]);
    ball(B, kn, legR * 1.02, 'knee' + side, darken(T['knee' + side], 0.8));
    segment(B, kn, an, legR * 0.85, 'knee' + side, 'thigh' + side, 'ankle' + side, T['knee' + side]);

    const footL = D.footLen || 0.85 * s;
    // a foot is a PLATFORM, not a stick: wide enough that its yaw and its
    // heel/toe axis are both obvious from any angle
    const footW = Math.max(legR * 2.2, footL * 0.36);
    // EXACTLY the procedural sole convention (animator: groundOffset is derived
    // against a sole 0.32 * scale under the ankle joint), so the mannequin
    // stands flat on the floor and its toe-off rolls through real ground.
    const soleY = an.y - 0.32 * s;
    const toe = T['ankle' + side], sole = darken(toe, 0.55);
    // sole plate, heel to toe, with the sole face shaded dark
    block(B, new THREE.Vector3(an.x, soleY + 0.06 * s, an.z + footL * 0.18),
      [footW, 0.12 * s, footL], 'ankle' + side,
      (x, y) => (y < soleY + 0.045 * s ? sole : toe));
    // heel block BEHIND the ankle — the offset that makes "ankle vs heel" real
    block(B, new THREE.Vector3(an.x, soleY + 0.18 * s, an.z - footL * 0.30),
      [footW * 0.9, 0.24 * s, footL * 0.26], 'ankle' + side, darken(toe, 0.8));
    // ankle stub: joint down to the arch, so the joint is visibly ABOVE the sole
    block(B, new THREE.Vector3(an.x, (an.y + soleY) * 0.5, an.z - footL * 0.06),
      [footW * 0.62, Math.max(0.1 * s, an.y - soleY), footW * 0.62], 'ankle' + side, toe);
    // toe box, tapered up at the front
    block(B, new THREE.Vector3(an.x, soleY + 0.16 * s, an.z + footL * 0.6),
      [footW * 0.94, 0.2 * s, footL * 0.3], 'ankle' + side, darken(toe, 1.2));
  }

  const geo = B.build();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0.05, flatShading: true,
  });
  const skeleton = new THREE.Skeleton(boneList);
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'mannequin';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(skeleton);

  // the tools' model shape. `joints` is what the animator drives (bones, so the
  // skin follows); `boneMap` is the same set under the name the GLB path uses,
  // which is what makes hurtbox/skin/rig code treat this like a rigged model.
  const joints = { root, ...bones };
  const height = D.hipHeight + D.torsoH + D.headSize * 2;
  return {
    group: root,
    joints,
    boneMap: { ...bones },
    bones,
    boneOrder: BONE_ORDER.slice(),
    mesh,
    skeleton,
    material: mat,
    anchors: {},
    dims: D,
    // gait / rest / stance carried over; identity dropped (see the note above)
    def: def ? { ...def, id: 'mannequin', name: 'MANNEQUIN' } : {
      id: 'mannequin', name: 'MANNEQUIN', body: { scale: s },
    },
    isMannequin: true,
    height,
  };
}

/** A standalone reference body of a given total height, canonically proportioned. */
export function buildReferenceMannequin(height = 7) {
  return buildMannequin({ dims: canonicalDims(height) });
}

/**
 * NAMED DOTS on every joint of a mannequin — the answer to "which one of these
 * is the ankle?". A group of sprites (always camera-facing, always legible) plus
 * a dot at each bone, parented to the bones so they follow any pose. Add it to
 * the scene beside the mannequin; `scale` is in world units for the text height.
 */
export function mannequinLabels(m, { size = 0.22, dot = 0.055 } = {}) {
  const group = new THREE.Group();
  group.name = 'mannequin-labels';
  const items = [];
  for (const name of BONE_ORDER) {
    const bone = m.bones[name];
    if (!bone) continue;
    const tint = BONE_TINTS[name] || 0xffffff;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const g2 = cv.getContext('2d');
    g2.fillStyle = 'rgba(10,14,20,0.72)';
    g2.roundRect?.(2, 8, 252, 48, 10);
    if (g2.roundRect) g2.fill(); else g2.fillRect(2, 8, 252, 48);
    g2.font = 'bold 34px ui-monospace, monospace';
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
    g2.fillText(name, 128, 33);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
    }));
    sprite.scale.set(size * 4, size, 1);
    sprite.position.set(0, size * 0.9, 0);
    sprite.renderOrder = 1002;
    const pip = new THREE.Mesh(new THREE.SphereGeometry(dot, 10, 8),
      new THREE.MeshBasicMaterial({ color: tint, depthTest: false }));
    pip.renderOrder = 1001;
    const holder = new THREE.Group();
    holder.add(pip, sprite);
    // PARENTED TO THE BONE, not collected into the returned group: a label has
    // to ride its joint through any pose, and Object3D.add() would re-parent it
    // away from the bone. The handle below only exists to hide/dispose the set.
    bone.add(holder);
    items.push(holder);
  }
  group.userData.items = items;
  group.setVisible = (v) => { for (const h of items) h.visible = v; };
  group.dispose = () => {
    for (const h of items) {
      h.parent?.remove(h);
      h.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
    }
    items.length = 0;
  };
  return group;
}
