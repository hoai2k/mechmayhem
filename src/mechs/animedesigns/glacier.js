// ============================================================================
// ANIME GLACIER — dedicated cel-route sculpt, built with the full protocol in
// docs/ANIME_FIDELITY_GUIDE.md (bone measure → grid + crops → runs profile →
// side profile → geometry probe → part sheets).
//
// SKELETON (bonemeasure, B = ground → dome apex ≈ 8.2 on the GLB, restated
// at a stature of B = 7.5): thigh joints 0.594 B · HIGH knees 0.40 B (model
// proportions are PRIMARY — guide step 0) · ankles low (no soleDepth) ·
// shoulder pivots 0.842 B at ±0.267 B · head joint 0.869 B · stance splays
// hips ±0.142 B → ankles ±0.187 B.
//
// SCULPTED, NOT BOXY: every region is an ASSEMBLY of 20-80 shapes — an
// 8-sided facet core or lathe bulge carrying beveled face plates, chamfer
// strips, collar rings and greebles — never a single rounded box. The `asm`
// helper opens a local frame per assembly so sub-parts compose cleanly.
// ============================================================================
import * as THREE from 'three';
import { cyl, cone, roundedBox, taperBox, beveledPlate, shieldOutline, rhombOutline, facetBulge, bulgeLathe } from '../parts.js';
import { addAnchor } from '../factory.js';
import { toon } from '../animeshade.js';

export function animeGlacierDims(D) {
  return {
    ...D,
    // model-primary: the GLB knee sits HIGH (0.40 B) — short thigh, long shin
    hipHeight: 4.30, thighLen: 1.20, shinLen: 2.60,
    torsoH: 2.10, torsoW: 2.04, torsoD: 1.50,
    shoulderY: 1.80, headY: 2.20, headZ: 0.24,
    shoulderW: 2.00, upperArmLen: 1.40, foreArmLen: 1.45,
    hipW: 1.07, footLen: 1.60,
  };
}

export function animeGlacier(A, D, J, anchors, def) {
  const s = D.scale;                      // 1.24
  // ICE CRYSTAL: pale blue, calm emissive so it stays a solid, not a light
  const crystal = toon(0x86c8f0, { emissive: 0x4cb2e6, emissiveIntensity: 0.15 });
  crystal.userData.rwGlow = true;         // no ink rim — a crystal edge is light
  const magenta = toon(0xb84a86, { emissive: 0xb84a86, emissiveIntensity: 0.4 });
  magenta.userData.rwGlow = true;
  // wide lit fields barely emit or the bloom pass blazes them into blobs
  const lens = toon(0x8fd6ff, { emissive: 0x5cc8f8, emissiveIntensity: 0.35 });
  lens.userData.rwGlow = true;
  // …and small pale-surrounded trim lights dimmer still (the chest lamp sat
  // in a white field and its halo read as a searchlight)
  const lensDim = toon(0x7fc6ea, { emissive: 0x47aede, emissiveIntensity: 0.15 });
  lensDim.userData.rwGlow = true;

  // ---- assembly helper: a local frame to compose sub-parts in ----
  const _q1 = new THREE.Quaternion();
  const _e = new THREE.Euler(); const _v = new THREE.Vector3();
  const asm = (joint, origin, rot = [0, 0, 0]) => {
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    const o = origin;
    return (mat, geo, lp, lr = [0, 0, 0]) => {
      _q1.setFromEuler(_e.set(lr[0], lr[1], lr[2])).premultiply(q0);
      _v.set(lp[0], lp[1], lp[2]).applyQuaternion(q0);
      const p = [o[0] + _v.x, o[1] + _v.y, o[2] + _v.z];
      const r = [_e.setFromQuaternion(_q1).x, _e.y, _e.z];
      if (typeof mat === 'string') A.part(joint, mat, geo, { p, r });
      else A.custom(joint, mat, geo, { p, r });
    };
  };
  // an ice crystal: a 6-sided bipyramid (tall cone up + short cone down)
  const iceCrystal = (joint, lp, h, r, lr = [0, 0, 0]) => {
    A.custom(joint, crystal, cone(r, h, 6), {
      p: [lp[0], lp[1] + h * 0.32, lp[2]], r: lr });
    A.custom(joint, crystal, cone(r * 0.92, h * 0.28, 6), {
      p: [lp[0], lp[1] - h * 0.18, lp[2]], r: [Math.PI + lr[0], lr[1], -lr[2]] });
  };

  // ======================= WAIST / PELVIS =======================
  A.tube('hips', 'frame', 0.30, 0.34, 0.70, { p: [0, 0.26, 0] });
  for (let i = 0; i < 3; i++) {
    A.tube('hips', 'dark', 0.37 - i * 0.015, 0.39 - i * 0.015, 0.13, {
      p: [0, 0.06 + i * 0.20, 0] });
  }
  // pelvis: chamfered 8-side masses, not boxes
  A.facet('hips', 'frame', 0.62, 0.74, 0.60, 0.70, { sides: 8, scaleZ: 0.78, p: [0, -0.26, 0] });
  A.facet('hips', 'accent', 0.50, 0.56, 0.44, 0.34, { sides: 8, scaleZ: 0.80, p: [0, -0.62, 0] });
  // front crotch plate: pale pentagon over a raised wedge
  A.taper('hips', 'primary', [0.56, 0.55, 0.22], 0.75, 0.8, { p: [0, -0.36, 0.46] });
  A.plate('hips', 'primary', shieldOutline(0.70, 0.64, { taper: 0.72, tip: 0.28 }), 0.12, {
    p: [0, -0.36, 0.58], r: [0.10, 0, 0], round: 0.14 });
  A.sharpBox('hips', 'dark', [0.30, 0.12, 0.05], { p: [0, -0.14, 0.62] });
  // side skirts: two-layer chamfered plates over the hip drums
  for (const sx of [-1, 1]) {
    A.tube('hips', 'dark', 0.40, 0.40, 0.36, {
      p: [sx * 0.80, -0.30, 0], r: [0, 0, Math.PI / 2], seg: 16 });
    A.tube('hips', 'metal', 0.12, 0.12, 0.06, {
      p: [sx * 1.00, -0.30, 0], r: [0, 0, Math.PI / 2] });
    A.plate('hips', 'primary', rhombOutline(0.80, 0.62, { cut: 0.28 }), 0.12, {
      p: [sx * 1.00, -0.38, 0.06], r: [0.04, sx * Math.PI / 2, sx * 0.16], round: 0.14 });
    A.plate('hips', 'accent', rhombOutline(0.60, 0.44, { cut: 0.3 }), 0.08, {
      p: [sx * 1.10, -0.52, 0.02], r: [0.04, sx * Math.PI / 2, sx * 0.22], round: 0.14 });
  }
  A.plate('hips', 'accent', shieldOutline(0.95, 0.62, { taper: 0.78 }), 0.12, {
    p: [0, -0.42, -0.52], r: [-0.10, Math.PI, 0], round: 0.14 });

  // ======================= TORSO =======================
  // abdomen: three chamfered 8-side segments narrowing to the waist
  A.facet('torso', 'dark', 0.58, 0.66, 0.56, 0.34, { sides: 8, scaleZ: 0.82, p: [0, 0.10, 0] });
  A.facet('torso', 'frame', 0.62, 0.72, 0.62, 0.36, { sides: 8, scaleZ: 0.84, p: [0, 0.44, 0] });
  A.facet('torso', 'dark', 0.68, 0.78, 0.70, 0.38, { sides: 8, scaleZ: 0.86, p: [0, 0.80, 0] });
  // belly plates: broad pale slabs with chamfer wings, riding the segments
  A.part('torso', 'primary', roundedBox(0.95, 0.40, 0.24, 0.05), { p: [0, 0.58, 0.52] });
  A.part('torso', 'primary', roundedBox(0.80, 0.36, 0.22, 0.05), { p: [0, 0.16, 0.48] });
  for (const sx of [-1, 1]) {
    A.part('torso', 'accent', roundedBox(0.42, 0.36, 0.20, 0.05), {
      p: [sx * 0.62, 0.55, 0.42], r: [0, sx * 0.35, 0] });
    A.part('torso', 'accent', roundedBox(0.36, 0.32, 0.18, 0.05), {
      p: [sx * 0.52, 0.14, 0.38], r: [0, sx * 0.35, 0] });
    A.piston('torso', 'metal', [sx * 0.42, 0.06, -0.28], [sx * 0.55, 0.85, -0.35], 0.05);
  }
  // ribcage: a wide chamfered 8-side barrel the pecs hang on
  A.facet('torso', 'accent', 0.60, 0.68, 0.55, 1.30, { sides: 8, scaleX: 1.75, scaleZ: 1.05, p: [0, 1.44, -0.02] });
  // pec assemblies: main facet plate + brow plate + outer chamfer + under strip
  for (const sx of [-1, 1]) {
    const pec = asm('torso', [sx * 0.50, 1.50, 0.58], [-0.14, -sx * 0.15, -sx * 0.04]);
    pec('primary', beveledPlate(rhombOutline(1.02, 0.90, { cut: 0.22 }), 0.20, { round: 0.10 }), [0, 0, 0]);
    pec('primary', beveledPlate(rhombOutline(0.80, 0.34, { cut: 0.3 }), 0.12, { round: 0.12 }), [sx * 0.02, 0.52, 0.02], [-0.35, 0, 0]);
    pec('primary', beveledPlate(rhombOutline(0.55, 0.62, { cut: 0.3 }), 0.12, { round: 0.12 }), [sx * 0.48, -0.05, -0.06], [0, sx * 0.55, 0]);
    pec('accent', new THREE.BoxGeometry(0.50, 0.16, 0.10), [sx * 0.10, -0.52, 0.02], [0.3, 0, 0]);
  }
  A.sharpBox('torso', 'dark', [0.10, 0.60, 0.24], { p: [0, 1.58, 0.54] }); // centre seam
  for (const sx of [-1, 1]) {             // under-pec shadow gap
    A.sharpBox('torso', 'dark', [0.85, 0.13, 0.28], { p: [sx * 0.52, 1.00, 0.52], r: [0, -sx * 0.15, 0] });
  }
  // chest lamp (left pec) + cyan stud (right)
  A.sharpBox('torso', 'dark', [0.40, 0.20, 0.08], { p: [-0.50, 1.22, 0.72], r: [-0.14, -0.15, 0] });
  A.custom('torso', lensDim, new THREE.BoxGeometry(0.24, 0.10, 0.05), { p: [-0.50, 1.22, 0.77], r: [-0.14, -0.15, 0] });
  A.custom('torso', lensDim, new THREE.OctahedronGeometry(0.08, 0), { p: [0.92, 1.72, 0.62] });
  // side intakes: chamfered block + slats + outer cap plate
  for (const sx of [-1, 1]) {
    A.facet('torso', 'accent', 0.30, 0.36, 0.26, 0.90, { sides: 8, scaleZ: 1.6, p: [sx * 1.12, 1.38, 0.02], r: [0, sx * 0.22, 0] });
    A.vents('torso', 'dark', 3, 0.30, 0.09, 0.05, { p: [sx * 1.16, 1.56, 0.42], r: [0, sx * 0.5, 0] });
    A.plate('torso', 'primary', rhombOutline(0.44, 0.60, { cut: 0.3 }), 0.09, {
      p: [sx * 1.32, 1.40, 0.05], r: [0, sx * Math.PI / 2, sx * 0.12], round: 0.14 });
  }
  // throat bellows + collar bowl the dome sits into
  for (let i = 0; i < 3; i++) {
    A.tube('torso', 'dark', 0.34 - i * 0.02, 0.37 - i * 0.02, 0.14, {
      p: [0, 2.10 + i * 0.13, 0.10] });
  }
  A.taper('torso', 'dark', [1.15, 0.30, 0.85], 0.9, 0.85, { p: [0, 2.12, 0.20] });
  A.tube('torso', 'frame', 0.52, 0.56, 0.16, { p: [0, 2.26, 0.16], seg: 18 });
  A.taper('torso', 'accent', [1.30, 0.40, 0.90], 0.85, 0.85, { p: [0, 2.18, -0.25] }); // nape shelf
  // back pack: chamfered mass + rear plate + vents
  A.facet('torso', 'accent', 0.70, 0.80, 0.66, 1.25, { sides: 8, scaleX: 1.15, scaleZ: 0.55, p: [0, 1.45, -0.80] });
  A.plate('torso', 'primary', rhombOutline(1.05, 0.85, { cut: 0.25 }), 0.10, {
    p: [0, 1.60, -1.06], r: [0.06, Math.PI, 0], round: 0.12 });
  A.vents('torso', 'dark', 4, 0.6, 0.08, 0.05, { p: [0, 1.05, -1.02], r: [0, Math.PI, 0] });

  // ======================= HEAD: the armoured DOME =======================
  const dome = asm('head', [0, 0.12, 0]);
  A.lathe('head', 'primary', [[-0.18, 0.75], [0.30, 0.70], [0.66, 0.50], [0.95, 0.12]], {
    p: [0, 0.12, 0], scaleX: 1.20, scaleZ: 1.05, seg: 22 });
  // dome PETAL PLATES: beveled panels laid over the shell — the drawing's
  // faceted dome — three along the centre arc, two flanking pairs
  dome('primary', beveledPlate(rhombOutline(0.55, 0.40, { cut: 0.3 }), 0.06, { round: 0.2 }), [0, 0.70, 0.48], [-1.15, 0, 0]);
  dome('primary', beveledPlate(rhombOutline(0.60, 0.45, { cut: 0.3 }), 0.06, { round: 0.2 }), [0, 0.92, 0.10], [-1.55, 0, 0]);
  dome('primary', beveledPlate(rhombOutline(0.55, 0.42, { cut: 0.3 }), 0.06, { round: 0.2 }), [0, 0.86, -0.34], [-2.0, 0, 0]);
  for (const sx of [-1, 1]) {
    dome('primary', beveledPlate(rhombOutline(0.48, 0.55, { cut: 0.3 }), 0.06, { round: 0.2 }),
      [sx * 0.55, 0.60, 0.10], [-1.3, sx * 0.85, 0]);
    dome('primary', beveledPlate(rhombOutline(0.40, 0.45, { cut: 0.3 }), 0.05, { round: 0.2 }),
      [sx * 0.66, 0.34, -0.18], [-1.2, sx * 1.5, 0]);
  }
  // crest fin down the centre
  A.blade('head', 'primary', 0.50, 0.15, 0.28, { p: [0, 1.02, 0.02], r: [0, Math.PI / 2, 0], taper: 0.5 });
  // brow band + wrap-around visor
  A.part('head', 'primary', roundedBox(1.15, 0.34, 0.44, 0.10), { p: [0, 0.62, 0.52] });
  A.sharpBox('head', 'dark', [1.04, 0.34, 0.18], { p: [0, 0.33, 0.72] });
  A.sharpBox('head', 'glow', [0.72, 0.17, 0.06], { p: [0, 0.34, 0.82] });
  for (const sx of [-1, 1]) {
    A.custom('head', lens, new THREE.BoxGeometry(0.24, 0.13, 0.06), {
      p: [sx * 0.44, 0.33, 0.68], r: [0, sx * 0.55, 0] });
    // cheek: plate + chamfer strip
    A.part('head', 'primary', roundedBox(0.30, 0.40, 0.34, 0.08), {
      p: [sx * 0.44, 0.16, 0.24], r: [0, sx * 0.35, 0] });
    A.sharpBox('head', 'primary', [0.10, 0.34, 0.26], {
      p: [sx * 0.58, 0.20, 0.12], r: [0, sx * 0.8, 0] });
  }
  // jaw grill + chin + neck rings
  A.taper('head', 'dark', [0.52, 0.26, 0.36], 0.8, 0.75, { p: [0, 0.07, 0.44] });
  A.vents('head', 'frame', 3, 0.30, 0.08, 0.04, { p: [0, 0.06, 0.64] });
  A.taper('head', 'primary', [0.34, 0.14, 0.20], 0.8, 0.8, { p: [0, -0.05, 0.52] });
  A.tube('head', 'dark', 0.28, 0.32, 0.16, { p: [0, -0.05, 0.02] });
  A.tube('head', 'dark', 0.30, 0.34, 0.12, { p: [0, -0.18, 0.02] });
  // THE CRYSTAL CROWN: bipyramid prisms, tall centre — plus small companions
  const crown = [
    [0.06, 0.74, -0.32, 1.70, 0.34, 0.05],
    [-0.34, 0.70, -0.26, 1.25, 0.27, -0.15],
    [0.44, 0.68, -0.22, 1.10, 0.25, 0.18],
    [-0.62, 0.58, -0.10, 0.80, 0.20, -0.30],
    [0.70, 0.55, -0.05, 0.72, 0.18, 0.32],
    [0.16, 0.66, -0.55, 0.92, 0.21, -0.10],
  ];
  for (const [cx, cyy, cz, h, r, tilt] of crown) {
    iceCrystal('head', [cx, cyy, cz], h, r, [tilt * 0.4, cx * 2, tilt]);
  }
  iceCrystal('head', [-0.14, 0.66, -0.14], 0.45, 0.11, [0.1, 0, -0.4]);
  iceCrystal('head', [0.28, 0.62, -0.42], 0.40, 0.10, [-0.1, 0, 0.35]);

  // ======================= SHOULDERS =======================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side;
    const px0 = -sx * 0.18;
    A.ball(sh, 'frame', 0.36, {});
    // THE PAULDRON as a real assembly: chamfered 8-side core, rounded crown,
    // beveled face plates on four faces, rim strips, chamfered under-skirt,
    // spike bosses and ice — ~34 shapes a side
    const pd = asm(sh, [px0, 0.42, -0.02], [0, 0, -sx * 0.08]);
    pd('primary', facetBulge(0.72, 0.82, 0.66, 1.15, { sides: 8, scaleX: 1.22, scaleZ: 0.95 }), [0, 0.10, 0]);
    pd('primary', bulgeLathe([[-0.05, 0.72], [0.20, 0.64], [0.40, 0.42], [0.52, 0.06]], { seg: 18, scaleX: 1.18, scaleZ: 0.80 }), [0, 0.62, 0]);
    pd('primary', beveledPlate(rhombOutline(1.30, 0.85, { cut: 0.24 }), 0.10, { round: 0.12 }), [0, 0.22, 0.72], [-0.06, 0, 0]);
    pd('primary', beveledPlate(rhombOutline(1.10, 0.95, { cut: 0.26 }), 0.10, { round: 0.12 }), [sx * 0.88, 0.18, 0], [0, sx * Math.PI / 2, 0]);
    pd('primary', beveledPlate(rhombOutline(1.20, 0.80, { cut: 0.26 }), 0.09, { round: 0.12 }), [0, 0.22, -0.70], [0.06, Math.PI, 0]);
    pd('accent', beveledPlate(rhombOutline(0.95, 0.36, { cut: 0.3 }), 0.08, { round: 0.12 }), [0, -0.30, 0.68], [0.10, 0, 0]);
    pd('dark', new THREE.BoxGeometry(1.55, 0.12, 0.16), [0, -0.52, 0.55], [0.5, 0, 0]);
    pd('dark', new THREE.BoxGeometry(1.55, 0.12, 0.16), [0, -0.52, -0.55], [-0.5, 0, 0]);
    pd('dark', new THREE.BoxGeometry(0.16, 0.12, 1.10), [sx * 0.85, -0.52, 0], [0, 0, -sx * 0.5]);
    pd('primary', facetBulge(0.62, 0.70, 0.58, 0.34, { sides: 8, scaleX: 1.15, scaleZ: 0.82 }), [0, -0.70, 0]);
    pd('frame', taperBox(0.55, 0.34, 0.80, 0.8, 0.8), [-sx * 0.85, -0.10, 0]);
    // spike bosses: cone + collar each; ice crystals between them
    for (const [ox, h, r] of [[-0.44, 0.66, 0.17], [0.08, 0.85, 0.20], [0.55, 0.58, 0.15]]) {
      pd('primary', cone(r, h, 6), [ox, 1.02 + h * 0.35, 0], [0, 0, -sx * (0.08 + ox * 0.18)]);
      pd('primary', cyl(r * 0.85, r * 1.15, 0.12, 8), [ox, 1.00, 0]);
    }
    pd(crystal, cone(0.19, 0.85, 6), [-sx * 0.22, 1.55, -0.26], [-0.10, 0, sx * 0.12]);
    pd(crystal, cone(0.175, 0.24, 6), [-sx * 0.22, 1.20, -0.26], [Math.PI - 0.10, 0, -sx * 0.12]);
    pd(crystal, cone(0.14, 0.58, 6), [sx * 0.34, 1.44, -0.30], [-0.22, 0, -sx * 0.22]);
    pd(crystal, cone(0.13, 0.18, 6), [sx * 0.34, 1.20, -0.30], [Math.PI - 0.22, 0, sx * 0.22]);
    // upper arm: chamfered segments + dark rings + side bolt
    A.tube(sh, 'frame', 0.26, 0.29, D.upperArmLen, { p: [0, -D.upperArmLen * 0.5, 0] });
    A.facet(sh, 'primary', 0.30, 0.34, 0.28, 0.52, { sides: 8, p: [0, -0.55, 0] });
    A.tube(sh, 'dark', 0.30, 0.32, 0.14, { p: [0, -0.92, 0] });
    A.facet(sh, 'primary', 0.27, 0.31, 0.26, 0.40, { sides: 8, p: [0, -1.18, 0] });
    A.tube(sh, 'metal', 0.08, 0.08, 0.10, { p: [sx * 0.30, -0.55, 0], r: [0, 0, Math.PI / 2] });
  }

  // ======================= RIGHT ARM: THE ICE LANCE =======================
  {
    const el = 'elbowR';
    A.tube(el, 'metal', 0.30, 0.30, 0.55, { p: [0, 0, 0], r: [0, 0, Math.PI / 2], seg: 14 });
    for (const px of [-1, 1]) {
      A.tube(el, 'dark', 0.33, 0.33, 0.08, { p: [px * 0.30, 0, 0], r: [0, 0, Math.PI / 2], seg: 16 });
    }
    // cuff, then the ribbed stack: each segment a core cylinder wearing SIX
    // pale panel staves + a dark collar with bolt studs — machinery, not boxes
    A.facet(el, 'primary', 0.52, 0.60, 0.50, 0.58, { sides: 8, scaleZ: 0.94, p: [0, -0.34, 0] });
    const seg = (yc, rr, hh) => {
      A.tube(el, 'frame', rr - 0.05, rr - 0.03, hh, { p: [0, yc, 0], seg: 16 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.26;
        A.part(el, 'primary', roundedBox(0.26, hh * 0.94, 0.10, 0.03), {
          p: [Math.cos(a) * rr, yc, Math.sin(a) * rr], r: [0, -a + Math.PI / 2, 0] });
      }
      A.tube(el, 'dark', rr + 0.015, rr + 0.015, 0.12, { p: [0, yc - hh / 2 - 0.07, 0], seg: 16 });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        A.ball(el, 'metal', 0.045, { p: [Math.cos(a) * (rr + 0.02), yc - hh / 2 - 0.07, Math.sin(a) * (rr + 0.02)], seg: 8 });
      }
    };
    seg(-0.80, 0.52, 0.42);
    seg(-1.36, 0.49, 0.40);
    // big collar where the core is exposed
    A.tube(el, 'primary', 0.62, 0.57, 0.26, { p: [0, -1.79, 0], seg: 16 });
    A.tube(el, 'dark', 0.58, 0.58, 0.08, { p: [0, -1.94, 0], seg: 16 });
    // the glowing core (lens) in two runs, magenta machinery in the gaps
    A.tube(el, 'glow', 0.35, 0.35, 0.10, { p: [0, -1.92, 0], seg: 16 });
    A.custom(el, lens, cyl(0.38, 0.38, 0.62, 16), { p: [0, -2.14, 0] });
    A.tube(el, 'primary', 0.45, 0.45, 0.16, { p: [0, -2.50, 0], seg: 16 });
    A.custom(el, lens, cyl(0.36, 0.36, 0.52, 16), { p: [0, -2.82, 0] });
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.7;
      A.custom(el, magenta, new THREE.BoxGeometry(0.08, 0.24, 0.05), {
        p: [Math.cos(a) * 0.30, -2.05 - k * 0.30, Math.sin(a) * 0.30], r: [0, -a, 0] });
    }
    // side rails: chamfered bars + ridge plates, carrying the twin blades
    for (const bx of [-1, 1]) {
      A.facet(el, 'primary', 0.17, 0.20, 0.15, 1.05, { sides: 6, scaleZ: 1.9, p: [bx * 0.57, -2.07, 0] });
      A.part(el, 'primary', roundedBox(0.10, 0.85, 0.50, 0.04), { p: [bx * 0.68, -2.02, 0] });
      // blade: a long edged fin + companion edge ridge — not a plank
      A.taper(el, 'primary', [0.16, 2.05, 0.55], 0.06, 0.22, {
        p: [bx * 0.56, -3.35, 0], r: [Math.PI, 0, bx * 0.06] });
      A.taper(el, 'primary', [0.10, 1.30, 0.30], 0.10, 0.3, {
        p: [bx * 0.64, -3.05, 0.06], r: [Math.PI, 0, bx * 0.10] });
    }
    // tip: cap ring, drill collar, drill
    A.tube(el, 'primary', 0.31, 0.38, 0.22, { p: [0, -3.15, 0], seg: 14 });
    A.tube(el, 'metal', 0.12, 0.17, 0.20, { p: [0, -3.32, 0], seg: 10 });
    A.tube(el, 'dark', 0.14, 0.14, 0.06, { p: [0, -3.42, 0], seg: 10 });
    A.spike(el, 'metal', 0.11, 0.50, { p: [0, -3.62, 0], r: [Math.PI, 0, 0], seg: 8 });
  }

  // ======================= LEFT ARM: relaxed articulated glove =======================
  {
    const el = 'elbowL', ha = 'handL', sx = -1;
    A.tube(el, 'metal', 0.28, 0.28, 0.52, { p: [0, 0, 0], r: [0, 0, Math.PI / 2], seg: 14 });
    for (const px of [-1, 1]) {
      A.tube(el, 'dark', 0.31, 0.31, 0.08, { p: [px * 0.28, 0, 0], r: [0, 0, Math.PI / 2], seg: 16 });
    }
    // forearm: chamfered core + front/outer plates + flaring wrist cuff
    A.facet(el, 'primary', 0.36, 0.42, 0.34, 0.88, { sides: 8, scaleZ: 0.92, p: [0, -0.60, 0] });
    A.plate(el, 'primary', rhombOutline(0.52, 0.66, { cut: 0.26 }), 0.09, {
      p: [0, -0.58, 0.40], round: 0.12 });
    A.plate(el, 'accent', rhombOutline(0.40, 0.55, { cut: 0.3 }), 0.07, {
      p: [sx * 0.40, -0.60, 0], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
    A.facet(el, 'primary', 0.46, 0.40, 0.48, 0.36, { sides: 8, scaleZ: 0.94, p: [0, -1.16, 0] });
    // the hand: dark, articulated, RELAXED — fingers half-curled, thumb front
    const yawQ = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx * Math.PI / 2);
    const _fe = new THREE.Euler(); const _fq = new THREE.Quaternion();
    const _fv = new THREE.Vector3();
    const fp = (mat, geo, p, r = [0, 0, 0]) => {
      _fq.setFromEuler(_fe.set(r[0], r[1], r[2])).premultiply(yawQ);
      _fv.set(p[0], p[1], p[2]).applyQuaternion(yawQ);
      A.part(ha, mat, geo, { p: [_fv.x, _fv.y, _fv.z],
        r: [_fe.setFromQuaternion(_fq).x, _fe.y, _fe.z] });
    };
    fp('frame', roundedBox(0.82, 0.62, 0.68, 0.13), [0, -0.30, 0.02]);      // metacarpal
    fp('dark', roundedBox(0.68, 0.50, 0.17, 0.06), [0, -0.35, -0.30]);     // palm plate
    fp('primary', beveledPlate(rhombOutline(0.62, 0.48, { cut: 0.26 }), 0.10, { round: 0.14 }),
      [0, -0.24, 0.34], [0.20, 0, 0]);                                     // back-of-hand plate
    for (let i = 0; i < 4; i++) {                                          // relaxed fingers
      const fx = (i - 1.5) * 0.21;
      fp('dark', roundedBox(0.19, 0.34, 0.25, 0.06), [fx, -0.64, 0.22], [0.35, 0, 0]);
      fp('metal', roundedBox(0.15, 0.10, 0.16, 0.04), [fx, -0.55, 0.34], [0.35, 0, 0]);
      fp('dark', roundedBox(0.18, 0.32, 0.23, 0.05), [fx, -0.96, 0.13], [0.95, 0, 0]);
      fp('dark', roundedBox(0.17, 0.27, 0.20, 0.05), [fx, -1.14, -0.07], [1.6, 0, 0]);
    }
    fp('dark', roundedBox(0.22, 0.34, 0.25, 0.06),                          // thumb
      [-sx * 0.42, -0.52, 0.18], [0.45, -sx * 0.5, -sx * 0.3]);
    fp('dark', roundedBox(0.19, 0.29, 0.21, 0.05),
      [-sx * 0.29, -0.78, 0.29], [1.0, -sx * 0.5, -sx * 0.2]);
  }

  // ======================= LEGS =======================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    const tl = D.thighLen, sl = D.shinLen;
    J[kn].position.x = sx * 0.12;
    J[an].position.x = sx * 0.21;
    const lean = -sx * 0.07;

    // thigh: lathe core + front plate + outer plate + hamstring + hip drum
    A.ball(th, 'frame', 0.34, {});
    A.lathe(th, 'primary', [[-tl * 1.05, 0.34], [-tl * 0.62, 0.44], [-tl * 0.18, 0.40], [0.06, 0.30]], {
      p: [sx * 0.06, 0, 0.02], r: [0, 0, lean], scaleX: 1.15, scaleZ: 1.05, seg: 18 });
    A.plate(th, 'primary', rhombOutline(0.62, 0.72, { cut: 0.26 }), 0.11, {
      p: [sx * 0.08, -tl * 0.42, 0.46], r: [0.06, 0, lean], round: 0.12 });
    A.plate(th, 'primary', rhombOutline(0.50, 0.60, { cut: 0.3 }), 0.09, {
      p: [sx * 0.48, -tl * 0.40, 0.02], r: [0, sx * Math.PI / 2, lean], round: 0.12 });
    A.taper(th, 'primary', [0.55, 0.62, 0.36], 0.78, 0.72, {
      p: [sx * 0.06, -tl * 0.42, -0.44], r: [-0.10, 0, lean] });
    A.tube(th, 'dark', 0.36, 0.36, 0.22, {
      p: [sx * 0.44, -0.12, 0], r: [0, 0, Math.PI / 2], seg: 16 });
    A.tube(th, 'metal', 0.11, 0.11, 0.06, {
      p: [sx * 0.56, -0.12, 0], r: [0, 0, Math.PI / 2] });

    // knee: dark 8-side joint mass + protruding facet boss + cap + discs
    A.facet(kn, 'dark', 0.32, 0.36, 0.30, 0.55, { sides: 8, scaleZ: 0.9, p: [0, -0.05, 0.05] });
    A.facet(kn, 'primary', 0.30, 0.34, 0.24, 0.30, { sides: 8, scaleZ: 0.9, p: [0, -0.06, 0.40], r: [Math.PI / 2 + 0.12, 0, 0] });
    A.plate(kn, 'primary', rhombOutline(0.42, 0.46, { cut: 0.3 }), 0.08, {
      p: [0, -0.05, 0.58], r: [0.12, 0, 0], round: 0.12 });
    for (const px of [-1, 1]) {
      A.tube(kn, 'dark', 0.30, 0.30, 0.16, {
        p: [px * 0.36, -0.05, 0], r: [0, 0, Math.PI / 2], seg: 14 });
      A.tube(kn, 'metal', 0.09, 0.09, 0.05, {
        p: [px * 0.45, -0.05, 0], r: [0, 0, Math.PI / 2] });
    }
    // shin: calf lathe + LONG front guard (facet + crest plate) + side
    // chamfers + lower flare + ankle collar and discs
    A.tube(kn, 'frame', 0.22, 0.26, sl, { p: [0, -sl / 2, 0] });
    A.lathe(kn, 'primary', [[-sl * 0.62, 0.34], [-sl * 0.40, 0.44], [-sl * 0.16, 0.38], [-sl * 0.02, 0.26]], {
      p: [0, 0, -0.14], scaleX: 1.05, seg: 18 });
    A.facet(kn, 'primary', 0.34, 0.40, 0.28, sl * 0.60, { sides: 6, scaleX: 1.15, scaleZ: 0.75, p: [0, -sl * 0.50, 0.36] });
    A.plate(kn, 'primary', rhombOutline(0.40, sl * 0.42, { cut: 0.28 }), 0.08, {
      p: [0, -sl * 0.48, 0.56], r: [0.02, 0, 0], round: 0.12 });
    for (const px of [-1, 1]) {
      A.sharpBox(kn, 'primary', [0.12, sl * 0.40, 0.30], {
        p: [px * 0.38, -sl * 0.52, 0.18], r: [0, px * 0.5, 0] });
    }
    A.taper(kn, 'primary', [0.85, 0.55, 0.75], 0.78, 0.82, { p: [0, -sl * 0.86, 0.06] });
    A.taper(kn, 'dark', [0.60, 0.20, 0.60], 0.9, 0.9, { p: [0, -sl * 0.98, 0.02] });
    A.tube(kn, 'dark', 0.24, 0.24, 0.14, {
      p: [sx * 0.30, -sl * 0.96, 0], r: [0, 0, Math.PI / 2], seg: 12 });

    // FOOT: paw-boot as an assembly — 8-side instep dome + top plate + toe
    // segments with caps + side plates + heel + ribbed sole
    A.facet(an, 'primary', 0.52, 0.60, 0.46, 0.50, { sides: 8, scaleX: 1.15, scaleZ: 1.30, p: [0, -0.02, 0.20] });
    A.plate(an, 'primary', rhombOutline(0.72, 0.80, { cut: 0.26 }), 0.09, {
      p: [0, 0.24, 0.24], r: [Math.PI / 2 - 0.25, 0, 0], round: 0.14 });
    A.facet(an, 'primary', 0.34, 0.40, 0.30, 0.30, { sides: 8, scaleZ: 0.9, p: [0, 0.20, -0.05] });
    for (let i = 0; i < 4; i++) {
      const tx = (i - 1.5) * 0.315;
      A.part(an, 'primary', roundedBox(0.34, 0.42, 0.62, 0.10), {
        p: [tx, -0.16, 0.80 + Math.cos(tx * 1.3) * 0.10], r: [0.14, tx * 0.30, 0] });
      A.part(an, 'accent', roundedBox(0.28, 0.16, 0.30, 0.06), {
        p: [tx, 0.04, 0.92 + Math.cos(tx * 1.3) * 0.10], r: [0.35, tx * 0.30, 0] });
    }
    for (const px of [-1, 1]) {
      A.part(an, 'primary', roundedBox(0.26, 0.40, 0.90, 0.10), {
        p: [px * 0.56, -0.14, 0.10], r: [0, 0, px * 0.10] });
      A.plate(an, 'accent', rhombOutline(0.55, 0.32, { cut: 0.3 }), 0.06, {
        p: [px * 0.68, -0.10, 0.10], r: [0, px * Math.PI / 2, 0], round: 0.14 });
    }
    A.facet(an, 'primary', 0.38, 0.44, 0.34, 0.42, { sides: 8, scaleZ: 0.9, p: [0, -0.10, -0.48] });
    A.sharpBox(an, 'dark', [1.15, 0.12, 1.90], { p: [0, -0.34, 0.18] });
    for (let i = 0; i < 4; i++) {
      A.sharpBox(an, 'dark', [1.17, 0.05, 0.16], { p: [0, -0.37, -0.55 + i * 0.45] });
    }
  }

  // ======================= ANCHORS (§5 contract) =======================
  anchors.muzzleR = addAnchor(J.handR, 0, -1.5, 0);
  anchors.muzzleL = addAnchor(J.handL, 0, -0.9, 0.30);
  anchors.core = addAnchor(J.torso, 0, 1.35, 0.45);
}
