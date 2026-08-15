// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 3. AEGIS — cathedral knight, matched to the canonical image.
//    Silver-white + gold: twin heraldic banner pods towering behind
//    the shoulders (white faces, gold frames, cross emblems, tassels),
//    crowned helm with blue V-visor and a tall central spire, faceted
//    blue chest crystal in a gold ray housing, long front tabard,
//    grand layered tower shield on the left arm, crystalline energy
//    lance in the right hand.
// ============================================================
export function aegis(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;   // ~1.68 master width unit
  const chH = D.torsoH;
  const hs = D.headSize;
  const fA = D.foreArmLen;

  // dedicated decal skins (unmerged custom plates keep exact UVs)
  const plateMat = (decal, recipe, seedOff = 0) => {
    const tex = decalTexture({ seed: def.seed + seedOff, ...recipe }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // roof-slab rotation: flatten a plate (normal up), then roll the outer
  // edge down around world Z (see titanus.js)
  const slabRot = (tilt) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    const e = new THREE.Euler().setFromQuaternion(q);
    return [e.x, e.y, e.z];
  };
  // rectangle outline for banner standards
  const rectOutline = (w, h) => {
    const hw = w / 2, hh = h / 2;
    return [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]];
  };
  // flat gold cross built from two thin plates, on any joint
  const cross = (joint, mat, cx, cy, cz, wArm, tall, t, rot = [0, 0, 0]) => {
    A.plate(joint, mat, rectOutline(tall * 0.17, tall), t, {
      p: [cx, cy, cz], r: rot, round: 0.25 });
    A.plate(joint, mat, rectOutline(wArm, tall * 0.17), t, {
      p: [cx, cy + tall * 0.2, cz], r: rot, round: 0.25 });
  };

  // ================= WAIST / PELVIS =================
  // articulated waist column rising from the hip block
  A.lathe('hips', 'frame', [[0.55 * s, W * 0.28], [0.26 * s, W * 0.19], [-0.05 * s, W * 0.25]], {
    scaleX: 1.22 });
  // gold belt band at the pinch
  A.ring('hips', 'brass', W * 0.24, 0.035 * s, {
    p: [0, 0.24 * s, 0], r: [Math.PI / 2, 0, 0], s: [1.24, 1.02, 1] });
  // hip block: chamfered hex flare
  A.facet('hips', 'primary', W * 0.32, W * 0.42, W * 0.28, 0.85 * s, {
    sides: 6, scaleZ: 0.8, p: [0, -0.42 * s, 0] });

  // ---- FRONT TABARD: long shield plate, belt to between the knees ----
  const tabH = 2.05 * s, tabTilt = -0.2; // bottom flares forward, clears thighs
  const tabCy = 0.02 * s - Math.cos(tabTilt) * tabH / 2;
  const tabCz = W * 0.3 + Math.sin(-tabTilt) * tabH / 2;
  // gold under-plate reads as trim around the white face
  A.plate('hips', 'accent', shieldOutline(0.82 * s, tabH * 1.02, { taper: 0.66, tip: 0.16 }), 0.05 * s, {
    p: [0, tabCy, tabCz - 0.035 * s], r: [tabTilt, 0, 0], round: 0.1 });
  A.plate('hips', 'primary', shieldOutline(0.68 * s, tabH * 0.94, { taper: 0.64, tip: 0.16 }), 0.06 * s, {
    p: [0, tabCy + 0.02 * s, tabCz + 0.02 * s], r: [tabTilt, 0, 0], round: 0.1 });
  // gold cross emblem on the tabard face
  cross('hips', 'accent', 0, tabCy + tabH * 0.14, tabCz + 0.07 * s + Math.sin(-tabTilt) * tabH * 0.14,
    0.4 * s, 0.62 * s, 0.025 * s, [tabTilt, 0, 0]);

  // side skirt plates + gold hems
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', shieldOutline(W * 0.36, 0.85 * s, { taper: 0.7 }), 0.08 * s, {
      p: [sx * W * 0.44, -0.54 * s, 0], r: [0.08, sx * Math.PI / 2, sx * -0.16], round: 0.12 });
    A.plate('hips', 'accent', shieldOutline(W * 0.24, 0.44 * s, { taper: 0.68 }), 0.05 * s, {
      p: [sx * W * 0.52, -0.86 * s, 0], r: [0.08, sx * Math.PI / 2, sx * -0.2] });
  }
  // rear plate
  A.plate('hips', 'primary', shieldOutline(W * 0.4, 0.8 * s, { taper: 0.72 }), 0.07 * s, {
    p: [0, -0.55 * s, -W * 0.28], r: [-0.12, Math.PI, 0], round: 0.12 });
  A.sharpBox('hips', 'dark', [W * 0.3, 0.32 * s, W * 0.22], { p: [0, -0.58 * s, -W * 0.18] });

  // ================= TORSO: regal bulged chest =================
  A.lathe('torso', 'primary', [
    [chH * 0.12, W * 0.30],
    [chH * 0.40, W * 0.50],
    [chH * 0.68, W * 0.58],
    [chH * 0.92, W * 0.50],
    [chH * 1.05, W * 0.30],
  ], { scaleX: 1.32, scaleZ: 0.75, seg: 28 });
  // gold trim bands wrapping the chest mass (sit proud of the paint)
  A.ring('torso', 'brass', W * 0.575, 0.05 * s, {
    p: [0, chH * 0.44, 0], r: [Math.PI / 2, 0, 0], s: [1.32, 0.76, 1], seg: 28 });
  A.ring('torso', 'brass', W * 0.59, 0.05 * s, {
    p: [0, chH * 0.84, 0], r: [Math.PI / 2, 0, 0], s: [1.32, 0.76, 1], seg: 28 });

  // ---- CHEST CRYSTAL: faceted blue octahedron in a gold ray housing ----
  const cyY = chH * 0.62, cyZ = W * 0.5;
  // white sculpted backing plate
  A.plate('torso', 'primary', shieldOutline(W * 0.4, chH * 0.36, { taper: 0.78 }), 0.07 * s, {
    p: [0, cyY, cyZ - 0.06 * s], r: [-0.05, 0, 0], round: 0.16 });
  // gold rays fanning out behind the crystal
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    A.taper('torso', 'accent', [0.11 * s, 0.34 * s, 0.04 * s], 0.35, 0.8, {
      p: [Math.cos(a) * 0.3 * s, cyY + Math.sin(a) * 0.3 * s, cyZ - 0.01 * s],
      r: [0, 0, a - Math.PI / 2] });
  }
  // gold collar ring + elongated octahedron crystal (two cones base-to-base)
  A.ring('torso', 'brass', 0.21 * s, 0.038 * s, { p: [0, cyY, cyZ + 0.02 * s], seg: 22 });
  A.spike('torso', 'glow', 0.155 * s, 0.34 * s, { p: [0, cyY + 0.17 * s, cyZ + 0.05 * s], seg: 6 });
  A.spike('torso', 'glow', 0.155 * s, 0.34 * s, {
    p: [0, cyY - 0.17 * s, cyZ + 0.05 * s], r: [Math.PI, 0, 0], seg: 6 });

  // AEGIS nameplate on the upper-left chest (dedicated decal skin)
  A.custom('torso', plateMat({
    text: 'AEGIS', textY: 0.5, textScale: 0.24, color: '#c9a227', alpha: 0.88,
  }, def.skin.primary), beveledPlate(rhombOutline(W * 0.34, chH * 0.15, { cut: 0.26 }), 0.05 * s, { round: 0.14 }), {
    p: [-W * 0.26, chH * 0.9, W * 0.335], r: [0.34, 0, -0.1] });
  // gold pect chevron on the right side to balance
  A.plate('torso', 'accent', rhombOutline(W * 0.32, W * 0.15, { cut: 0.3 }), 0.05 * s, {
    p: [W * 0.29, chH * 0.9, W * 0.33], r: [0.32, 0, 0.14], round: 0.2 });
  // gorget collar + gold necklace ring
  A.tube('torso', 'frame', W * 0.16, W * 0.2, 0.18 * s, { p: [0, chH * 1.02, 0] });
  A.ring('torso', 'brass', W * 0.19, 0.028 * s, {
    p: [0, chH * 1.08, 0], r: [Math.PI / 2, 0, 0] });
  // exposed abdomen rings bridging chest to waist
  for (let i = 0; i < 2; i++) {
    A.tube('torso', 'dark', W * (0.19 - i * 0.02), W * (0.21 - i * 0.02), 0.09 * s, {
      p: [0, chH * (0.05 - i * 0.09), 0] });
  }
  // brass waist pistons angling out to the chest
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.16, chH * -0.05, W * 0.1],
      [sx * W * 0.36, chH * 0.28, W * 0.18], 0.04 * s);
  }

  // ================= TWIN HERALDIC BANNER PODS =================
  // Two tall flat standards rising above/behind the shoulders, framing
  // the head from the front. Mounted on the torso, clear of the arms.
  const bH = 2.6 * s;                    // panel height
  const bW = 0.66 * s;                   // panel width
  const bTop = chH * 1.05 + 1.35 * s;    // top edge ~1.4 head-heights over shoulders
  const bCy = bTop - bH / 2;
  const bZ = -D.torsoD * 0.72;
  // central rack post + brass crossbar feeding both standards
  A.facet('torso', 'frame', W * 0.16, W * 0.22, W * 0.14, chH * 0.5, {
    sides: 6, scaleZ: 0.7, p: [0, chH * 0.62, -W * 0.34] });
  A.tube('torso', 'brass', 0.045 * s, 0.045 * s, W * 0.94, {
    p: [0, chH * 0.88, bZ + 0.1 * s], r: [0, 0, Math.PI / 2] });
  for (const sx of [-1, 1]) {
    const bx = sx * W * 0.41;
    // support strut from the back of the chest up to the standard
    A.piston('torso', 'metal', [sx * W * 0.2, chH * 0.72, -D.torsoD * 0.4],
      [bx, bCy + bH * 0.1, bZ - 0.02 * s], 0.045 * s);
    // gold border frame (behind) + white face panel (front)
    A.plate('torso', 'accent', rectOutline(bW, bH), 0.06 * s, {
      p: [bx, bCy, bZ], r: [0.05, sx * -0.06, 0], round: 0.06 });
    A.plate('torso', 'primary', rectOutline(bW * 0.78, bH * 0.92), 0.05 * s, {
      p: [bx, bCy, bZ + 0.055 * s], r: [0.05, sx * -0.06, 0], round: 0.06 });
    // gold cross emblem on the face
    cross('torso', 'accent', bx, bCy + bH * 0.12, bZ + 0.11 * s, bW * 0.52, bH * 0.3, 0.022 * s,
      [0.05, sx * -0.06, 0]);
    // blue gem slit low on the face
    A.sharpBox('torso', 'glowSoft', [bW * 0.1, bH * 0.16, 0.03 * s], {
      p: [bx, bCy - bH * 0.28, bZ + 0.1 * s], r: [0.05, sx * -0.06, 0] });
    // back pole + cross finial spike on top
    A.tube('torso', 'brass', 0.03 * s, 0.03 * s, bH * 1.12, { p: [bx, bCy + 0.02 * s, bZ - 0.06 * s] });
    A.spike('torso', 'brass', 0.05 * s, 0.3 * s, { p: [bx, bTop + 0.2 * s, bZ - 0.06 * s] });
    A.sharpBox('torso', 'brass', [0.2 * s, 0.045 * s, 0.045 * s], {
      p: [bx, bTop + 0.1 * s, bZ - 0.06 * s] });
    // hanging tassels at the outer top corner
    const tx = bx + sx * (bW / 2 + 0.05 * s);
    A.sharpBox('torso', 'brass', [0.16 * s, 0.035 * s, 0.035 * s], {
      p: [bx + sx * bW * 0.42, bTop - 0.03 * s, bZ] });
    for (const dz of [-0.05, 0.05]) {
      A.tube('torso', 'brass', 0.02 * s, 0.025 * s, 0.14 * s, { p: [tx, bTop - 0.12 * s, bZ + dz * s] });
      A.spike('torso', 'accent', 0.035 * s, 0.12 * s, {
        p: [tx, bTop - 0.25 * s, bZ + dz * s], r: [Math.PI, 0, 0] });
    }
  }

  // ================= HEAD: crowned helm with spire =================
  const hy = hs * 0.95;
  A.tube('head', 'frame', hs * 0.4, hs * 0.48, hs * 0.6, { p: [0, hy * 0.28, 0] });
  // smooth lathe dome skull
  A.lathe('head', 'primary', [
    [-hs * 0.55, hs * 0.68],
    [hs * 0.05, hs * 0.78],
    [hs * 0.55, hs * 0.6],
    [hs * 0.85, hs * 0.22],
  ], { p: [0, hy + hs * 0.6, 0.04 * s], scaleZ: 1.1, seg: 20 });
  // glowing blue V-visor: two angled strips meeting at a low point
  for (const sx of [-1, 1]) {
    A.sharpBox('head', 'glow', [hs * 0.52, hs * 0.13, 0.07 * s], {
      p: [sx * hs * 0.26, hy + hs * 0.66, hs * 0.86], r: [0, sx * -0.18, sx * 0.38] });
  }
  A.ball('head', 'glow', hs * 0.09, { p: [0, hy + hs * 0.56, hs * 0.9], seg: 10 });
  // beveled face guard under the visor
  A.plate('head', 'primary', shieldOutline(hs * 1.05, hs * 0.7, { taper: 0.7 }), 0.07 * s, {
    p: [0, hy + hs * 0.16, hs * 0.62], r: [0.12, 0, 0], round: 0.15 });
  // gold brow band
  A.plate('head', 'accent', rhombOutline(hs * 1.5, hs * 0.42, { cut: 0.3 }), hs * 0.3, {
    p: [0, hy + hs * 1.0, hs * 0.08], r: [-0.15, 0, 0], round: 0.2 });
  // crown ring of small gold spikes around the dome
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    A.spike('head', 'brass', hs * 0.09, hs * 0.36, {
      p: [Math.cos(a) * hs * 0.52, hy + hs * 1.14, Math.sin(a) * hs * 0.52 - hs * 0.02],
      r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], seg: 6 });
  }
  // TALL central spire rising from the crown
  A.lathe('head', 'brass', [[0, hs * 0.2], [hs * 0.14, hs * 0.13], [hs * 0.3, hs * 0.06]], {
    p: [0, hy + hs * 1.28, 0], seg: 12 });
  A.tube('head', 'brass', 0.022 * s, 0.03 * s, hs * 1.15, { p: [0, hy + hs * 2.05, 0], seg: 8 });
  A.ball('head', 'glowSoft', hs * 0.1, { p: [0, hy + hs * 2.68, 0], seg: 10 });
  A.spike('head', 'brass', hs * 0.06, hs * 0.5, { p: [0, hy + hs * 3.0, 0], seg: 6 });
  // small swept gold cheek fins
  for (const sx of [-1, 1]) {
    A.blade('head', 'accent', hs * 0.7, hs * 0.24, 0.04 * s, {
      p: [sx * hs * 0.68, hy + hs * 0.85, -hs * 0.15], r: [-0.5, 0, sx * 0.7], taper: 0.25 });
  }

  // ================= ARMS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side;
    J[sh].position.x = sx * (D.shoulderW + 0.24 * s);

    // pauldron: angular pointed plates over a faceted core, gold-edged
    A.ball(sh, 'frame', 0.28 * s, {});
    A.facet(sh, 'primary', W * 0.26, W * 0.3, W * 0.16, 0.5 * s, {
      sides: 6, scaleZ: 0.9, p: [sx * 0.1 * s, 0.02 * s, 0] });
    // gold trim plate below the white roof plate (edge reads as gold)
    A.plate(sh, 'accent', rhombOutline(1.0 * s, 0.62 * s, { cut: 0.34 }), 0.05 * s, {
      p: [sx * 0.16 * s, 0.28 * s, 0], r: slabRot(sx * -0.4), round: 0.1 });
    A.plate(sh, 'primary', rhombOutline(0.88 * s, 0.54 * s, { cut: 0.34 }), 0.09 * s, {
      p: [sx * 0.18 * s, 0.35 * s, 0], r: slabRot(sx * -0.4), round: 0.1 });
    // pointed gold wing at the outer edge + blue glow slit
    A.blade(sh, 'accent', 0.62 * s, 0.24 * s, 0.05 * s, {
      p: [sx * 0.56 * s, 0.42 * s, -0.02 * s], r: [0, 0, sx * 0.6], taper: 0.25 });
    A.sharpBox(sh, 'glowSoft', [0.05 * s, 0.2 * s, 0.05 * s], {
      p: [sx * 0.42 * s, 0.12 * s, 0.16 * s], r: [0, 0, sx * 0.3] });
    // bulged upper arm
    A.lathe(sh, 'primary', [
      [-D.upperArmLen * 0.95, 0.19 * s],
      [-D.upperArmLen * 0.55, 0.25 * s],
      [-D.upperArmLen * 0.15, 0.2 * s],
    ], { p: [sx * 0.04 * s, 0, 0], seg: 16 });
    // elbow ring
    A.part(el, 'metal', new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 0.34 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    // forearm: faceted vambrace with gold spine + bracelet
    A.facet(el, 'primary', 0.26 * s, 0.36 * s, 0.28 * s, fA * 1.0, {
      sides: 8, scaleZ: 1.05, p: [0, -fA * 0.52, 0] });
    A.plate(el, 'accent', rhombOutline(fA * 0.6, 0.3 * s, { cut: 0.3 }), 0.05 * s, {
      p: [0, -fA * 0.5, 0.32 * s], r: [0, 0, Math.PI / 2], round: 0.12 });
    A.ring(el, 'brass', 0.28 * s, 0.03 * s, {
      p: [0, -fA * 0.88, 0], r: [Math.PI / 2, 0, 0] });
    A.piston(el, 'brass', [sx * 0.22 * s, -0.05 * s, -0.16 * s],
      [sx * 0.26 * s, -fA * 0.6, -0.2 * s], 0.04 * s);
  }

  // ================= GRAND TOWER SHIELD (left forearm) =================
  const sh = addJoint(J, 'shield', 'elbowL', -0.46 * s, -fA * 0.5, 0.02 * s);
  sh.rotation.y = 0.18; // face angled a touch inward: squares up when the
  // combat stance swings the arm across the front
  const shW = 1.75 * s, shH = 3.5 * s; // elongated hexagon, near torso+hips tall
  // layered gold-bordered white panels (dark backing -> gold -> white -> gold -> white)
  A.plate('shield', 'dark', rhombOutline(shW * 0.94, shH * 0.94, { cut: 0.32 }), 0.07 * s, {
    p: [0, 0, 0.02 * s], round: 0.08 });
  A.plate('shield', 'accent', rhombOutline(shW, shH, { cut: 0.32 }), 0.1 * s, {
    p: [0, 0, 0.12 * s], round: 0.07 });
  A.plate('shield', 'primary', rhombOutline(shW * 0.86, shH * 0.88, { cut: 0.32 }), 0.09 * s, {
    p: [0, 0, 0.21 * s], round: 0.08 });
  A.plate('shield', 'accent', rhombOutline(shW * 0.66, shH * 0.7, { cut: 0.32 }), 0.06 * s, {
    p: [0, 0, 0.28 * s], round: 0.08 });
  A.plate('shield', 'primary', rhombOutline(shW * 0.56, shH * 0.61, { cut: 0.32 }), 0.06 * s, {
    p: [0, 0, 0.33 * s], round: 0.08 });
  // gold cross + boss at the crossing
  cross('shield', 'accent', 0, -0.12 * s, 0.39 * s, 0.72 * s, 1.5 * s, 0.03 * s);
  A.ring('shield', 'brass', 0.17 * s, 0.035 * s, { p: [0, 0.18 * s, 0.41 * s] });
  A.ball('shield', 'glowSoft', 0.09 * s, { p: [0, 0.18 * s, 0.43 * s], seg: 12 });
  // AEGIS text plate near the top
  A.custom('shield', plateMat({
    text: 'AEGIS', textY: 0.5, textScale: 0.3, color: '#3f8cff', alpha: 0.9,
  }, def.skin.accent, 5), beveledPlate(rhombOutline(0.9 * s, 0.3 * s, { cut: 0.25 }), 0.05 * s, { round: 0.18 }), {
    p: [0, 1.18 * s, 0.37 * s] });
  // blue glow gem slits down the side points + rivets
  for (const gx of [-1, 1]) {
    A.sharpBox('shield', 'glowSoft', [0.06 * s, 0.66 * s, 0.05 * s], {
      p: [gx * shW * 0.36, 0, 0.28 * s] });
  }
  for (const [rx, ry] of [[-0.5, 1.35], [0.5, 1.35], [-0.5, -1.35], [0.5, -1.35]]) {
    A.ball('shield', 'brass', 0.05 * s, { p: [rx * s, ry * s, 0.26 * s], seg: 8 });
  }
  // grip block + frame straps across the back face
  A.sharpBox('shield', 'frame', [0.24 * s, 0.7 * s, 0.3 * s], { p: [0.3 * s, 0, -0.1 * s] });
  A.sharpBox('shield', 'frame', [1.2 * s, 0.16 * s, 0.06 * s], { p: [0, 0.8 * s, -0.04 * s] });
  A.sharpBox('shield', 'frame', [1.2 * s, 0.16 * s, 0.06 * s], { p: [0, -0.8 * s, -0.04 * s] });

  // ================= ENERGY LANCE (right hand) =================
  // The whole lance lives on its own 'lance' joint: the javelin throw hides
  // it (and regrows it in the grip), and the whirl heavy spins it freely.
  A.fist('handR', 'frame', 'dark', 0.3 * s, { side: 1 });
  addJoint(J, 'lance', 'handR', 0, 0, 0);
  // grip + gold guard bulge
  A.tube('lance', 'dark', 0.055 * s, 0.055 * s, 0.7 * s, {
    p: [0, -0.2 * s, -0.1 * s], r: [Math.PI / 2, 0, 0] });
  A.lathe('lance', 'brass', [[-0.1 * s, 0.1 * s], [0.02 * s, 0.19 * s], [0.14 * s, 0.06 * s]], {
    p: [0, -0.2 * s, 0.3 * s], r: [Math.PI / 2, 0, 0] });
  // dark segmented shaft with brass joint rings
  A.tube('lance', 'dark', 0.06 * s, 0.075 * s, 1.1 * s, {
    p: [0, -0.2 * s, 0.95 * s], r: [Math.PI / 2, 0, 0] });
  A.ring('lance', 'brass', 0.085 * s, 0.024 * s, { p: [0, -0.2 * s, 1.55 * s] });
  A.tube('lance', 'metal', 0.055 * s, 0.065 * s, 0.85 * s, {
    p: [0, -0.2 * s, 2.0 * s], r: [Math.PI / 2, 0, 0] });
  A.ring('lance', 'brass', 0.08 * s, 0.024 * s, { p: [0, -0.2 * s, 2.45 * s] });
  A.tube('lance', 'dark', 0.05 * s, 0.06 * s, 0.5 * s, {
    p: [0, -0.2 * s, 2.72 * s], r: [Math.PI / 2, 0, 0] });
  // ornate gold collar under the blade
  A.lathe('lance', 'brass', [[-0.18 * s, 0.055 * s], [-0.04 * s, 0.14 * s], [0.1 * s, 0.1 * s], [0.22 * s, 0.04 * s]], {
    p: [0, -0.2 * s, 3.08 * s], r: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 4; k++) { // small gold prongs at the collar
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    A.spike('lance', 'accent', 0.035 * s, 0.3 * s, {
      p: [Math.cos(a) * 0.14 * s, -0.2 * s + Math.sin(a) * 0.14 * s, 3.24 * s],
      r: [Math.PI / 2 + Math.sin(a) * 0.25, 0, 0], seg: 6 });
  }
  // crystalline blue blade tip: layered glow cones
  A.spike('lance', 'glowSoft', 0.13 * s, 0.55 * s, {
    p: [0, -0.2 * s, 3.36 * s], r: [Math.PI / 2, 0, 0], seg: 6 });
  A.spike('lance', 'glow', 0.095 * s, 0.95 * s, {
    p: [0, -0.2 * s, 3.62 * s], r: [Math.PI / 2, 0, 0], seg: 6 });
  A.fist('handL', 'frame', 'dark', 0.26 * s, { side: -1 });

  // ================= LEGS (plantigrade) =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

    // hip ball + bulged thigh with gold outer plate
    A.ball(th, 'frame', 0.26 * s, {});
    A.lathe(th, 'primary', [
      [-D.thighLen * 1.0, 0.23 * s],
      [-D.thighLen * 0.55, 0.32 * s],
      [-D.thighLen * 0.1, 0.26 * s],
    ], { scaleZ: 1.1, seg: 20 });
    A.plate(th, 'accent', rhombOutline(0.38 * s, D.thighLen * 0.55, { cut: 0.28 }), 0.05 * s, {
      p: [sx * 0.3 * s, -D.thighLen * 0.5, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.12 });

    // knee: joint sphere + white shield with gold trim plate
    A.ball(kn, 'metal', 0.19 * s, {});
    A.plate(kn, 'primary', shieldOutline(0.46 * s, 0.62 * s, { taper: 0.65 }), 0.1 * s, {
      p: [0, -0.02 * s, 0.28 * s], r: [0.12, 0, 0], round: 0.14 });
    A.plate(kn, 'accent', shieldOutline(0.28 * s, 0.42 * s, { taper: 0.6 }), 0.05 * s, {
      p: [0, -0.05 * s, 0.37 * s], r: [0.12, 0, 0] });
    A.piston(kn, 'brass', [0, 0.12 * s, -0.22 * s], [0, -D.shinLen * 0.4, -0.28 * s], 0.045 * s);

    // greave: calf swell + stacked white shin guards + gold trim bands
    A.lathe(kn, 'primary', [
      [-D.shinLen * 1.0, 0.23 * s],
      [-D.shinLen * 0.66, 0.33 * s],
      [-D.shinLen * 0.3, 0.36 * s],
      [-D.shinLen * 0.04, 0.25 * s],
    ], { scaleZ: 1.15, seg: 20 });
    A.plate(kn, 'primary', shieldOutline(0.44 * s, 0.6 * s, { taper: 0.75 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.44, 0.32 * s], r: [0.06, 0, 0], round: 0.12 });
    A.plate(kn, 'primary', shieldOutline(0.5 * s, 0.64 * s, { taper: 0.72 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.8, 0.3 * s], r: [-0.06, 0, 0], round: 0.12 });
    A.ring(kn, 'brass', 0.3 * s, 0.026 * s, {
      p: [0, -D.shinLen * 0.35, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.16, 1], seg: 22 });
    A.ring(kn, 'brass', 0.31 * s, 0.026 * s, {
      p: [0, -D.shinLen * 0.62, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.18, 1], seg: 22 });
    A.plate(kn, 'accent', shieldOutline(0.3 * s, 0.34 * s, { taper: 0.7 }), 0.05 * s, {
      p: [0, -D.shinLen * 0.92, 0.36 * s], r: [-0.06, 0, 0] });

    // sabaton: layered toe plates + gold toe cap + heel
    A.ball(an, 'frame', 0.17 * s, {});
    for (const tx of [-0.14, 0.14]) {
      A.part(an, 'primary', roundedBox(0.28 * s, 0.24 * s, 0.6 * s, 0.07 * s), {
        p: [tx * s, -0.13 * s, 0.28 * s], r: [-0.08, tx * 0.3, 0] });
    }
    A.plate(an, 'accent', shieldOutline(0.44 * s, 0.32 * s, { taper: 0.8 }), 0.05 * s, {
      p: [0, -0.06 * s, 0.56 * s], r: [0.62, 0, 0], round: 0.2 });
    A.facet(an, 'frame', 0.18 * s, 0.22 * s, 0.15 * s, 0.28 * s, {
      sides: 6, p: [0, -0.13 * s, -0.18 * s], r: [Math.PI / 2.4, 0, 0] });
    A.sharpBox(an, 'dark', [0.5 * s, 0.1 * s, 0.86 * s], { p: [0, -0.25 * s, 0.1 * s] });
  }

  anchors.muzzleR = addAnchor(J.lance, 0, -0.2 * s, 4.1 * s);
  anchors.shield = addAnchor(J.shield, 0, 0, 0.36 * s);
  anchors.core = addAnchor(J.torso, 0, cyY, W * 0.52);
}
