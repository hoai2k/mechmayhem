// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 5. NOVA — star-oracle, matched to the canonical image. White +
//    deep teal + gold trim, magenta glow: broken-halo of two large
//    crescent panels orbiting behind the head, featureless egg dome
//    with a vertical slit and a tall crown spire, radiant magenta
//    star core in a teal inlay, floor-length robe of alternating
//    white/teal panels (open at the front), ring-and-star staff.
// ============================================================
export function nova(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;   // ~1.28 master width unit
  const chH = D.torsoH;
  const hs = D.headSize;
  const fA = D.foreArmLen;

  // dedicated decal skin (unmerged custom plates keep exact UVs)
  const plateMat = (decal, recipe, seedOff = 0) => {
    const tex = decalTexture({ seed: def.seed + seedOff, ...recipe }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // compose euler rotations (first arg = outermost / applied last)
  const eul = (...steps) => {
    const q = new THREE.Quaternion(), t = new THREE.Quaternion();
    for (const st of steps) {
      t.setFromEuler(new THREE.Euler(st[0], st[1], st[2]));
      q.multiply(t);
    }
    const e = new THREE.Euler().setFromQuaternion(q);
    return [e.x, e.y, e.z];
  };

  // ================= WAIST / PELVIS =================
  // narrow articulated waist column
  A.lathe('hips', 'frame', [[0.62 * s, W * 0.2], [0.34 * s, W * 0.14], [0.0 * s, W * 0.2]], {
    scaleX: 1.1 });
  A.ring('hips', 'brass', W * 0.165, 0.028 * s, {
    p: [0, 0.34 * s, 0], r: [Math.PI / 2, 0, 0], s: [1.1, 1, 1] });
  // small hex pelvis — the exposed inner frame seen through the open front
  A.facet('hips', 'primary', W * 0.28, W * 0.34, W * 0.22, 0.55 * s, {
    sides: 6, scaleZ: 0.85, p: [0, -0.32 * s, 0] });
  A.tube('hips', 'dark', W * 0.14, W * 0.16, 0.3 * s, { p: [0, -0.68 * s, 0] });

  // ================= FLOOR-LENGTH ROBE SKIRT =================
  // Outer row: large beveled panels, longer toward the back, alternating
  // white (gold-hemmed) / deep teal. The front center stays OPEN.
  const r0 = W * 0.28 + 0.14 * s;
  const topY = -0.42 * s;
  const outer = [
    { a: Math.PI, len: 2.1, mat: 'primary' },
    { a: 2.531, len: 1.95, mat: 'accent' }, { a: -2.531, len: 1.95, mat: 'accent' },
    { a: 1.920, len: 1.75, mat: 'primary' }, { a: -1.920, len: 1.75, mat: 'primary' },
    { a: 1.309, len: 1.5, mat: 'accent' }, { a: -1.309, len: 1.5, mat: 'accent' },
    { a: 0.698, len: 1.28, mat: 'primary' }, { a: -0.698, len: 1.28, mat: 'primary' },
  ];
  for (const { a, len, mat } of outer) {
    const L = len * s;
    const tilt = 0.26 + 0.14 * (1 - Math.cos(a)) / 2; // extra flare at the back
    const cy = topY - Math.cos(tilt) * L / 2;
    const rad = r0 + Math.sin(tilt) * L / 2;
    const wid = (Math.abs(a) < 1 ? 0.56 : 0.62) * s;
    const rot = eul([0, a, 0], [-tilt, 0, 0]);
    const outline = shieldOutline(wid, L, { taper: 0.85, tip: 0.14 });
    if (a === 0.698) { // NOVA decal on a front-side panel
      A.custom('hips', plateMat({ text: 'NOVA', textY: 0.62, textScale: 0.24, color: '#2f7d7b', alpha: 0.88 },
        def.skin.primary), beveledPlate(outline, 0.05 * s, { round: 0.12 }), {
        p: [Math.sin(a) * rad, cy, Math.cos(a) * rad], r: rot });
    } else {
      A.plate('hips', mat, outline, 0.05 * s, {
        p: [Math.sin(a) * rad, cy, Math.cos(a) * rad], r: rot, round: 0.12 });
    }
    if (mat === 'primary') { // gold hem strip low on the white panels
      const d = L * 0.8;
      A.plate('hips', 'accent', rhombOutline(wid * 0.66, 0.11 * s, { cut: 0.3 }), 0.03 * s, {
        p: [Math.sin(a) * (r0 + Math.sin(tilt) * d + 0.045 * s), topY - Math.cos(tilt) * d,
          Math.cos(a) * (r0 + Math.sin(tilt) * d + 0.045 * s)], r: rot, round: 0.2 });
    }
  }
  // Inner row: shorter petals in the gaps (teal/white alternating)
  const inner = [0.96, 1.62, 2.27, 2.92];
  for (let i = 0; i < inner.length; i++) {
    for (const sgn of [-1, 1]) {
      const a = sgn * inner[i];
      const L = (0.85 + 0.25 * (1 - Math.cos(a)) / 2) * s;
      const tilt = 0.2;
      A.plate('hips', i % 2 ? 'primary' : 'accent', shieldOutline(0.42 * s, L, { taper: 0.8, tip: 0.2 }), 0.04 * s, {
        p: [Math.sin(a) * (r0 - 0.06 * s + Math.sin(tilt) * L / 2), topY + 0.06 * s - Math.cos(tilt) * L / 2,
          Math.cos(a) * (r0 - 0.06 * s + Math.sin(tilt) * L / 2)],
        r: eul([0, a, 0], [-tilt, 0, 0]), round: 0.16 });
    }
  }

  // ================= TORSO: smooth feminine lathe =================
  A.lathe('torso', 'primary', [
    [chH * 0.06, W * 0.20],
    [chH * 0.32, W * 0.35],
    [chH * 0.60, W * 0.47],
    [chH * 0.85, W * 0.42],
    [chH * 1.04, W * 0.24],
  ], { scaleX: 1.18, scaleZ: 0.82, seg: 28 });
  // gold sash ring at the waist pinch
  A.ring('torso', 'brass', W * 0.24, 0.03 * s, {
    p: [0, chH * 0.12, 0], r: [Math.PI / 2, 0, 0], s: [1.18, 0.84, 1], seg: 24 });

  // ---- MAGENTA STAR CORE in a teal chest inlay ----
  const coreY = chH * 0.58, coreZ = W * 0.38;
  A.plate('torso', 'accent', shieldOutline(W * 0.44, chH * 0.42, { taper: 0.8 }), 0.05 * s, {
    p: [0, coreY, coreZ - 0.02 * s], r: [-0.06, 0, 0], round: 0.2 });
  A.ring('torso', 'brass', 0.29 * s, 0.04 * s, { p: [0, coreY, coreZ + 0.045 * s], seg: 26 });
  A.ball('torso', 'glow', 0.17 * s, { p: [0, coreY, coreZ + 0.05 * s], seg: 18 });
  // four thin glow blades radiating in a + shape
  A.sharpBox('torso', 'glow', [0.042 * s, 0.72 * s, 0.03 * s], { p: [0, coreY, coreZ + 0.045 * s] });
  A.sharpBox('torso', 'glow', [0.72 * s, 0.042 * s, 0.03 * s], { p: [0, coreY, coreZ + 0.045 * s] });
  // slim collar
  A.tube('torso', 'frame', W * 0.13, W * 0.16, 0.16 * s, { p: [0, chH * 1.02, 0] });
  A.ring('torso', 'brass', W * 0.15, 0.022 * s, {
    p: [0, chH * 1.08, 0], r: [Math.PI / 2, 0, 0] });
  // small back cowl over the halo mount
  A.lathe('torso', 'accent', [[-chH * 0.16, W * 0.16], [0, W * 0.22], [chH * 0.2, W * 0.1]], {
    p: [0, chH * 0.82, -D.torsoD * 0.42], scaleZ: 0.7, seg: 16 });

  // ================= HALO: two crescent panels (broken halo) =================
  // Both crescents live ON the halo joint, centered on it — the animator
  // spins .z constantly, so they orbit the head. Tips point inward-up.
  addJoint(J, 'halo', 'torso', 0, chH * 1.26, -D.torsoD * 0.72);
  const hR = 1.24 * s;
  const arc = 1.6;
  for (const start of [1.885, -0.35]) { // left and right crescents
    // white body panel: flattened partial torus
    A.part('halo', 'primary', new THREE.TorusGeometry(hR, 0.18 * s, 8, 26, arc), {
      r: [0, 0, start], s: [1, 1, 0.3] });
    // glow inlay riding the front face — this is the strip that SURGES
    // when the crescents sweep through apex alignment (animator drives
    // glowSoft emissive)
    A.part('halo', 'glowSoft', new THREE.TorusGeometry(hR, 0.075 * s, 8, 26, arc), {
      p: [0, 0, 0.045 * s], r: [0, 0, start], s: [1, 1, 0.55] });
    A.part('halo', 'glowSoft', new THREE.TorusGeometry(hR, 0.075 * s, 8, 26, arc), {
      p: [0, 0, -0.045 * s], r: [0, 0, start], s: [1, 1, 0.55] }); // back face too
    // gold trim arcs along both edges
    A.part('halo', 'brass', new THREE.TorusGeometry(hR + 0.19 * s, 0.022 * s, 6, 26, arc), {
      r: [0, 0, start], s: [1, 1, 0.8] });
    A.part('halo', 'brass', new THREE.TorusGeometry(hR - 0.19 * s, 0.022 * s, 6, 26, arc), {
      r: [0, 0, start], s: [1, 1, 0.8] });
    // gold tip caps + magenta gems at both ends
    for (const ang of [start, start + arc]) {
      const tp = [Math.cos(ang) * hR, Math.sin(ang) * hR, 0];
      A.ball('halo', 'brass', 0.075 * s, { p: tp, seg: 10 });
      A.ball('halo', 'glowSoft', 0.09 * s, { p: [tp[0], tp[1], 0.06 * s], seg: 8 });
    }
  }

  // ================= HEAD: featureless egg + crown spire =================
  const hy = hs * 0.95;
  A.tube('head', 'frame', hs * 0.3, hs * 0.36, hs * 0.5, { p: [0, hy * 0.26, 0] });
  // smooth egg dome — no face
  A.lathe('head', 'primary', [
    [-hs * 0.5, hs * 0.6],
    [hs * 0.05, hs * 0.7],
    [hs * 0.5, hs * 0.55],
    [hs * 0.78, hs * 0.2],
  ], { p: [0, hy + hs * 0.55, 0.02 * s], scaleZ: 1.08, seg: 22 });
  // the ONLY facial feature: thin vertical magenta slit
  A.sharpBox('head', 'glow', [hs * 0.11, hs * 0.55, 0.06 * s], {
    p: [0, hy + hs * 0.66, hs * 0.74], r: [0.14, 0, 0] });
  // small teal swept fins at the temples
  for (const sx of [-1, 1]) {
    A.blade('head', 'accent', hs * 0.7, hs * 0.2, 0.035 * s, {
      p: [sx * hs * 0.66, hy + hs * 0.78, -hs * 0.14], r: [-0.55, 0, sx * 0.75], taper: 0.25 });
  }
  // TALL ornate crown spire: gold+white blade/cone stack + magenta gem
  A.lathe('head', 'brass', [[0, hs * 0.18], [hs * 0.12, hs * 0.1], [hs * 0.26, hs * 0.045]], {
    p: [0, hy + hs * 1.18, 0], seg: 12 });
  A.blade('head', 'primary', hs * 0.9, hs * 0.38, 0.035 * s, {
    p: [0, hy + hs * 1.8, 0], taper: 0.28 });
  A.tube('head', 'brass', 0.018 * s, 0.026 * s, hs * 0.85, { p: [0, hy + hs * 1.8, 0], seg: 8 });
  A.ball('head', 'glowSoft', hs * 0.11, { p: [0, hy + hs * 2.32, 0], seg: 10 });
  A.spike('head', 'brass', hs * 0.05, hs * 0.42, { p: [0, hy + hs * 2.62, 0], seg: 6 });

  // ================= ARMS (slender) =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side;

    // small rounded white pauldron shell over a teal underlayer
    A.ball(sh, 'frame', 0.18 * s, {});
    A.lathe(sh, 'accent', [
      [-0.2 * s, W * 0.2],
      [-0.06 * s, W * 0.17],
      [0.06 * s, W * 0.1],
    ], { p: [sx * 0.05 * s, 0.0, 0], scaleZ: 0.9, seg: 16 });
    A.lathe(sh, 'primary', [
      [-0.12 * s, W * 0.21],
      [0.1 * s, W * 0.18],
      [0.26 * s, W * 0.08],
    ], { p: [sx * 0.05 * s, 0.06 * s, 0], scaleZ: 0.92, seg: 18 });
    A.ring(sh, 'brass', W * 0.2, 0.02 * s, {
      p: [sx * 0.05 * s, -0.06 * s, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.92, 1] });
    // slim upper arm
    A.lathe(sh, 'primary', [
      [-D.upperArmLen * 0.95, 0.12 * s],
      [-D.upperArmLen * 0.5, 0.16 * s],
      [-D.upperArmLen * 0.1, 0.13 * s],
    ], { seg: 14 });
    // elbow + hex forearm sleeve with bracelet
    A.part(el, 'metal', new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.24 * s, 10), {
      r: [0, 0, Math.PI / 2] });
    A.facet(el, 'primary', 0.14 * s, 0.19 * s, 0.13 * s, fA * 0.95, {
      sides: 6, p: [0, -fA * 0.5, 0] });
    A.plate(el, 'accent', rhombOutline(fA * 0.5, 0.22 * s, { cut: 0.3 }), 0.035 * s, {
      p: [0, -fA * 0.45, 0.17 * s], r: [0, 0, Math.PI / 2], round: 0.14 });
    A.ring(el, 'brass', 0.16 * s, 0.022 * s, {
      p: [0, -fA * 0.82, 0], r: [Math.PI / 2, 0, 0] });
  }
  // small articulated silver hands
  A.fist('handR', 'metal', 'dark', 0.21 * s, { side: 1 });
  A.fist('handL', 'metal', 'dark', 0.21 * s, { side: -1 });

  // ================= STAR STAFF (right hand) =================
  // thin silver shaft, taller than the shoulder line
  A.tube('handR', 'metal', 0.042 * s, 0.042 * s, 4.6 * s, {
    p: [0, -0.15 * s, 0.9 * s], r: [Math.PI / 2, 0, 0] });
  A.tube('handR', 'dark', 0.056 * s, 0.056 * s, 0.5 * s, {
    p: [0, -0.15 * s, 0.05 * s], r: [Math.PI / 2, 0, 0] });
  // rear counterweight spike + tiny magenta gem
  A.lathe('handR', 'brass', [[-0.1 * s, 0.04 * s], [0, 0.08 * s], [0.12 * s, 0.03 * s]], {
    p: [0, -0.15 * s, -1.32 * s], r: [Math.PI / 2, 0, 0] });
  A.ball('handR', 'glowSoft', 0.05 * s, { p: [0, -0.15 * s, -1.46 * s], seg: 8 });
  A.spike('handR', 'metal', 0.045 * s, 0.28 * s, {
    p: [0, -0.15 * s, -1.62 * s], r: [-Math.PI / 2, 0, 0], seg: 8 });
  // ornate head: gold socket at the shaft's end
  A.lathe('handR', 'brass', [[-0.12 * s, 0.05 * s], [0.02 * s, 0.11 * s], [0.18 * s, 0.04 * s]], {
    p: [0, -0.15 * s, 2.52 * s], r: [Math.PI / 2, 0, 0] });
  // large gold ring, coaxial — the star burst floats at its center
  A.ring('handR', 'brass', 0.46 * s, 0.038 * s, { p: [0, -0.15 * s, 3.0 * s], seg: 30 });
  A.ball('handR', 'glow', 0.13 * s, { p: [0, -0.15 * s, 3.0 * s], seg: 16 });
  A.sharpBox('handR', 'glow', [0.036 * s, 0.68 * s, 0.036 * s], { p: [0, -0.15 * s, 3.0 * s] });
  A.sharpBox('handR', 'glow', [0.68 * s, 0.036 * s, 0.036 * s], { p: [0, -0.15 * s, 3.0 * s] });
  // two white crescent blades framing the ring
  for (const start of [2.39, -0.75]) {
    A.part('handR', 'primary', new THREE.TorusGeometry(0.6 * s, 0.05 * s, 6, 18, 1.5), {
      p: [0, -0.15 * s, 3.0 * s], r: [0, 0, start], s: [1, 1, 0.55] });
  }
  // spike finial on top (forward, past the ring)
  A.lathe('handR', 'brass', [[-0.08 * s, 0.05 * s], [0.02 * s, 0.07 * s], [0.1 * s, 0.03 * s]], {
    p: [0, -0.15 * s, 3.3 * s], r: [Math.PI / 2, 0, 0] });
  A.spike('handR', 'metal', 0.05 * s, 0.42 * s, {
    p: [0, -0.15 * s, 3.55 * s], r: [Math.PI / 2, 0, 0], seg: 8 });

  // ================= LEGS (slender plantigrade, heeled boots) =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

    // hip ball + long slim thigh
    A.ball(th, 'frame', 0.19 * s, {});
    A.lathe(th, 'primary', [
      [-D.thighLen * 1.0, 0.18 * s],
      [-D.thighLen * 0.5, 0.25 * s],
      [-D.thighLen * 0.08, 0.2 * s],
    ], { scaleZ: 1.08, seg: 18 });
    A.plate(th, 'accent', rhombOutline(0.24 * s, D.thighLen * 0.45, { cut: 0.3 }), 0.035 * s, {
      p: [sx * 0.23 * s, -D.thighLen * 0.5, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.14 });

    // knee + graceful calf swell
    A.ball(kn, 'metal', 0.14 * s, {});
    A.plate(kn, 'primary', shieldOutline(0.3 * s, 0.42 * s, { taper: 0.65 }), 0.07 * s, {
      p: [0, -0.02 * s, 0.2 * s], r: [0.12, 0, 0], round: 0.16 });
    A.lathe(kn, 'primary', [
      [-D.shinLen * 1.0, 0.15 * s],
      [-D.shinLen * 0.62, 0.26 * s],
      [-D.shinLen * 0.26, 0.28 * s],
      [-D.shinLen * 0.02, 0.19 * s],
    ], { scaleZ: 1.12, seg: 18 });
    // teal shin trim + gold anklet
    A.plate(kn, 'accent', shieldOutline(0.24 * s, 0.5 * s, { taper: 0.75 }), 0.04 * s, {
      p: [0, -D.shinLen * 0.55, 0.27 * s], r: [0.04, 0, 0], round: 0.16 });
    A.ring(kn, 'brass', 0.17 * s, 0.02 * s, {
      p: [0, -D.shinLen * 0.92, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.1, 1] });
    A.piston(kn, 'brass', [0, 0.08 * s, -0.16 * s], [0, -D.shinLen * 0.4, -0.24 * s], 0.035 * s);

    // heeled boot: slim pointed toe, teal cap, thin heel column
    A.ball(an, 'frame', 0.13 * s, {});
    A.part(an, 'primary', roundedBox(0.2 * s, 0.16 * s, 0.64 * s, 0.05 * s), {
      p: [0, -0.17 * s, 0.28 * s], r: [-0.1, 0, 0] });
    A.plate(an, 'accent', shieldOutline(0.2 * s, 0.28 * s, { taper: 0.7 }), 0.035 * s, {
      p: [0, -0.12 * s, 0.5 * s], r: [0.72, 0, 0], round: 0.2 });
    // small toe pad + slender heel down to the same sole plane
    A.sharpBox(an, 'dark', [0.16 * s, 0.05 * s, 0.3 * s], { p: [0, -0.28 * s, 0.42 * s] });
    A.tube(an, 'brass', 0.045 * s, 0.06 * s, 0.16 * s, { p: [0, -0.2 * s, -0.14 * s], seg: 8 });
    A.sharpBox(an, 'dark', [0.12 * s, 0.05 * s, 0.14 * s], { p: [0, -0.28 * s, -0.14 * s] });
  }

  anchors.muzzleR = addAnchor(J.handR, 0, -0.15 * s, 3.0 * s);
  anchors.core = addAnchor(J.torso, 0, coreY, W * 0.44);
}
