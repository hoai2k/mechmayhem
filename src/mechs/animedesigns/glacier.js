// ============================================================================
// ANIME GLACIER — dedicated cel-route sculpt, built with the full protocol in
// docs/ANIME_FIDELITY_GUIDE.md (bone measure → grid + crops → runs profile →
// side profile → geometry probe → part sheets).
//
// SKELETON (bonemeasure, B = ground → dome apex ≈ 8.2 on the GLB, restated
// at a stature of B = 7.5):
//   thigh joints 0.594 B (leggier than titanus) · knee ~0.31 B · ankle low
//   (0.05 B — long paw-boots, not tall ones: NO soleDepth override)
//   shoulder pivots 0.842 B at ±0.267 B · head joint 0.869 B
//   stance splays: hips ±0.142 B → ankles ±0.187 B
// STYLING (drawing, runs + crops):
//   pauldrons: ROUNDED-SQUARE slabs, centres ±0.205 B (inboard of the arm
//   pivot), tops level with the dome apex, armour spikes + ice crystals on top
//   head: a wide armoured DOME with a wrap-around cyan visor, crystal CROWN
//   RIGHT arm is THE LANCE (shared-design contract: muzzleR down the barrel):
//   cuff → ribbed segment stack → exposed glowing core (magenta machinery in
//   the gaps) → twin ice blades flanking a drill tip, ~0.5 B long overall
//   LEFT hand: dark articulated glove, RELAXED half-curl, thumb at the front
//   feet: huge low paw-boots, a row of chunky TOE SEGMENTS round the front
// ============================================================================
import * as THREE from 'three';
import { cyl, cone, roundedBox, beveledPlate, shieldOutline, rhombOutline } from '../parts.js';
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
  // ICE CRYSTAL: pale translucent-reading blue, softly lit from within
  const crystal = toon(0x86c8f0, { emissive: 0x4cb2e6, emissiveIntensity: 0.15 });
  crystal.userData.rwGlow = true;         // no ink rim — a crystal edge is light
  // the magenta machinery peeking through the lance's gaps
  const magenta = toon(0xb84a86, { emissive: 0xb84a86, emissiveIntensity: 0.4 });
  magenta.userData.rwGlow = true;
  // wide lit fields (visor band, lance core) barely emit or the bloom pass
  // blazes them into blobs — the small hearts keep the full 'glow'
  const lens = toon(0x8fd6ff, { emissive: 0x5cc8f8, emissiveIntensity: 0.35 });
  lens.userData.rwGlow = true;

  // ======================= WAIST / PELVIS =======================
  A.tube('hips', 'frame', 0.30, 0.34, 0.70, { p: [0, 0.26, 0] });
  for (let i = 0; i < 3; i++) {
    A.tube('hips', 'dark', 0.37 - i * 0.015, 0.39 - i * 0.015, 0.13, {
      p: [0, 0.06 + i * 0.20, 0] });
  }
  A.part('hips', 'frame', roundedBox(1.35, 0.66, 1.05, 0.12), { p: [0, -0.26, 0] });
  // front crotch plate: chamfered pale pentagon
  A.plate('hips', 'primary', shieldOutline(0.70, 0.64, { taper: 0.72, tip: 0.28 }), 0.15, {
    p: [0, -0.34, 0.50], r: [0.10, 0, 0], round: 0.14 });
  // side skirts + hip drums
  for (const sx of [-1, 1]) {
    A.tube('hips', 'dark', 0.40, 0.40, 0.36, {
      p: [sx * 0.80, -0.30, 0], r: [0, 0, Math.PI / 2], seg: 16 });
    A.part('hips', 'primary', roundedBox(0.30, 0.70, 0.85, 0.10), {
      p: [sx * 1.02, -0.42, 0.05], r: [0, 0, sx * 0.14] });
  }
  A.plate('hips', 'accent', shieldOutline(0.95, 0.62, { taper: 0.78 }), 0.12, {
    p: [0, -0.42, -0.52], r: [-0.10, Math.PI, 0], round: 0.14 });

  // ======================= TORSO =======================
  const chH = D.torsoH;                   // 2.10; shoulders at 1.80, head at 2.00
  // belly: two rows of pale plates over a dark bellows
  A.taper('torso', 'dark', [1.30, 0.75, 1.05], 1.05, 1.0, { p: [0, 0.38, 0] });
  A.part('torso', 'primary', roundedBox(0.95, 0.40, 0.26, 0.05), { p: [0, 0.58, 0.50] });
  A.part('torso', 'primary', roundedBox(0.80, 0.36, 0.24, 0.05), { p: [0, 0.16, 0.46] });
  for (const sx of [-1, 1]) {
    A.part('torso', 'accent', roundedBox(0.42, 0.36, 0.22, 0.05), {
      p: [sx * 0.62, 0.55, 0.40], r: [0, sx * 0.32, 0] });
    A.part('torso', 'accent', roundedBox(0.36, 0.32, 0.20, 0.05), {
      p: [sx * 0.52, 0.14, 0.36], r: [0, sx * 0.32, 0] });
  }
  // ribcage mass: big, rounded, glacier-broad
  A.part('torso', 'accent', roundedBox(2.28, 1.35, 1.52, 0.22), { p: [0, 1.44, -0.02] });
  // pecs: big chamfered slabs meeting at a dark centre seam
  for (const sx of [-1, 1]) {
    A.part('torso', 'primary', roundedBox(1.10, 1.00, 0.36, 0.15), {
      p: [sx * 0.50, 1.54, 0.60], r: [-0.14, -sx * 0.15, -sx * 0.04] });
    A.part('torso', 'primary', roundedBox(0.75, 0.45, 0.26, 0.10), {
      p: [sx * 0.55, 0.92, 0.62], r: [0.16, -sx * 0.16, 0] });
    // side intake block under the shoulder
    A.taper('torso', 'accent', [0.55, 0.85, 0.95], 0.85, 0.9, {
      p: [sx * 1.10, 1.40, 0.02], r: [0, sx * 0.22, 0] });
  }
  A.sharpBox('torso', 'dark', [0.10, 0.60, 0.26], { p: [0, 1.58, 0.52] }); // centre seam, sunk between the pecs
  for (const sx of [-1, 1]) {             // under-pec shadow gap
    A.sharpBox('torso', 'dark', [0.85, 0.14, 0.30], { p: [sx * 0.55, 1.00, 0.58], r: [0, -sx * 0.16, 0] });
  }
  A.taper('torso', 'dark', [1.15, 0.30, 0.85], 0.9, 0.85, { p: [0, 2.12, 0.20] }); // collar bowl
  // the cyan chest lamp (left pec) + small diamond (right)
  A.sharpBox('torso', 'dark', [0.40, 0.20, 0.08], { p: [-0.50, 1.22, 0.74], r: [-0.14, -0.15, 0] });
  A.custom('torso', lens, new THREE.BoxGeometry(0.28, 0.11, 0.05), { p: [-0.50, 1.22, 0.79], r: [-0.14, -0.15, 0] });
  A.custom('torso', lens, new THREE.OctahedronGeometry(0.09, 0), { p: [0.92, 1.72, 0.66] });
  // throat: dark segmented bellows the dome sits into
  for (let i = 0; i < 3; i++) {
    A.tube('torso', 'dark', 0.34 - i * 0.02, 0.37 - i * 0.02, 0.14, {
      p: [0, 2.10 + i * 0.13, 0.10] });
  }
  A.taper('torso', 'accent', [1.30, 0.40, 0.90], 0.85, 0.85, { p: [0, 2.18, -0.25] }); // nape shelf
  // back: rounded pack
  A.part('torso', 'accent', roundedBox(1.55, 1.35, 0.55, 0.18), { p: [0, 1.45, -0.78] });

  // ======================= HEAD: the armoured DOME =======================
  // (apex lands at 1.0 B; the crystal crown rises behind it)
  A.lathe('head', 'primary', [[-0.18, 0.75], [0.30, 0.70], [0.66, 0.50], [0.95, 0.12]], {
    p: [0, 0.12, 0], scaleX: 1.20, scaleZ: 1.05, seg: 22 });
  // brow band + wrap-around cyan visor in a dark recess
  A.part('head', 'primary', roundedBox(1.15, 0.34, 0.44, 0.10), { p: [0, 0.60, 0.40] });
  A.sharpBox('head', 'dark', [1.04, 0.34, 0.16], { p: [0, 0.32, 0.56] });
  A.sharpBox('head', 'glow', [0.72, 0.17, 0.06], { p: [0, 0.33, 0.63] });

  for (const sx of [-1, 1]) {             // visor wraps round the cheeks
    A.custom('head', lens, new THREE.BoxGeometry(0.24, 0.13, 0.06), {
      p: [sx * 0.40, 0.32, 0.50], r: [0, sx * 0.55, 0] });
    // cheek plates
    A.part('head', 'primary', roundedBox(0.30, 0.40, 0.34, 0.08), {
      p: [sx * 0.44, 0.16, 0.24], r: [0, sx * 0.35, 0] });
  }
  // jaw grill + chin
  A.taper('head', 'dark', [0.52, 0.26, 0.36], 0.8, 0.75, { p: [0, 0.06, 0.30] });
  A.vents('head', 'frame', 3, 0.30, 0.08, 0.04, { p: [0, 0.05, 0.50] });
  A.tube('head', 'dark', 0.28, 0.32, 0.30, { p: [0, -0.08, 0.02] });      // neck
  // THE CRYSTAL CROWN: a rear arc of ice prisms, tall centre, shorter flanks
  const crown = [
    [0.06, 0.70, -0.32, 1.70, 0.34, 0.05],   // x, y, z, height, radius, tilt
    [-0.34, 0.66, -0.26, 1.25, 0.27, -0.15],
    [0.44, 0.64, -0.22, 1.10, 0.25, 0.18],
    [-0.62, 0.55, -0.10, 0.80, 0.20, -0.30],
    [0.70, 0.52, -0.05, 0.72, 0.18, 0.32],
    [0.16, 0.62, -0.55, 0.92, 0.21, -0.10],
  ];
  for (const [cx, cyy, cz, h, r, tilt] of crown) {
    A.custom('head', crystal, cone(r, h, 6), {
      p: [cx, cyy + 0.15 + h * 0.35, cz], r: [tilt * 0.4, cx * 2, tilt] });
  }

  // ======================= SHOULDERS =======================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side;
    const px0 = -sx * 0.18;               // pauldron centre — covers the arm, dome owns the middle
    A.ball(sh, 'frame', 0.36, {});
    // THE PAULDRON: big rounded-SQUARE slab (softer than titanus'), top at dome height
    A.part(sh, 'primary', roundedBox(1.75, 1.42, 1.55, 0.30), {
      p: [px0, 0.55, -0.02], r: [0, 0, -sx * 0.08] });
    A.part(sh, 'primary', roundedBox(1.35, 0.38, 1.18, 0.16), {
      p: [px0, 1.10, -0.02], r: [0, 0, -sx * 0.08] });
    A.sharpBox(sh, 'dark', [1.60, 0.14, 1.25], { p: [px0, -0.20, -0.02], r: [0, 0, -sx * 0.08] });
    // SPIKES + CRYSTALS on top: pale armour cones with ice between them
    const spikes = [[-0.42, 0.70, 0.18], [0.10, 0.88, 0.21], [0.58, 0.62, 0.16]];
    for (const [ox, h, r] of spikes) {
      A.spike(sh, 'primary', r, h, {
        p: [px0 + sx * ox, 1.30 + h * 0.35, -0.02], r: [0, 0, -sx * (0.10 + ox * 0.2)], seg: 6 });
    }
    A.custom(sh, crystal, cone(0.19, 0.85, 6), {
      p: [px0 - sx * 0.18, 1.56, -0.28], r: [-0.12, 0, sx * 0.15] });
    A.custom(sh, crystal, cone(0.15, 0.60, 6), {
      p: [px0 + sx * 0.36, 1.48, -0.30], r: [-0.15, 0, -sx * 0.2] });
    // inner step against the chest
    A.taper(sh, 'frame', [0.55, 0.36, 0.85], 0.8, 0.8, { p: [px0 - sx * 0.75, 0.30, -0.02] });
    // upper arm: chunky pale segments over dark rings
    A.tube(sh, 'frame', 0.26, 0.29, D.upperArmLen, { p: [0, -D.upperArmLen * 0.5, 0] });
    A.part(sh, 'primary', roundedBox(0.62, 0.55, 0.58, 0.12), { p: [0, -0.55, 0] });
    A.tube(sh, 'dark', 0.30, 0.32, 0.14, { p: [0, -0.92, 0] });
    A.part(sh, 'primary', roundedBox(0.56, 0.42, 0.52, 0.10), { p: [0, -1.18, 0] });
  }

  // ======================= RIGHT ARM: THE ICE LANCE =======================
  {
    const el = 'elbowR';
    A.tube(el, 'metal', 0.30, 0.30, 0.55, { p: [0, 0, 0], r: [0, 0, Math.PI / 2], seg: 14 });
    // cuff over the elbow end
    A.taper(el, 'primary', [1.15, 0.58, 1.08], 0.9, 0.9, { p: [0, -0.33, 0] });
    // ribbed segment stack (pale cylinders, dark collars between)
    A.tube(el, 'primary', 0.56, 0.58, 0.46, { p: [0, -0.78, 0], seg: 16 });
    A.tube(el, 'dark', 0.50, 0.50, 0.13, { p: [0, -1.07, 0], seg: 16 });
    A.tube(el, 'primary', 0.54, 0.56, 0.44, { p: [0, -1.34, 0], seg: 16 });
    A.tube(el, 'dark', 0.48, 0.48, 0.13, { p: [0, -1.60, 0], seg: 16 });
    // big collar where the core is exposed
    A.tube(el, 'primary', 0.62, 0.57, 0.26, { p: [0, -1.79, 0], seg: 16 });
    // THE GLOWING CORE, in two segments with a pale ring between
    A.custom(el, lens, cyl(0.38, 0.38, 0.62, 16), { p: [0, -2.14, 0] });
    A.tube(el, 'glow', 0.35, 0.35, 0.10, { p: [0, -1.92, 0], seg: 16 });
    A.tube(el, 'primary', 0.45, 0.45, 0.16, { p: [0, -2.50, 0], seg: 16 });
    A.custom(el, lens, cyl(0.36, 0.36, 0.52, 16), { p: [0, -2.82, 0] });
    // magenta machinery peeking through the gaps round the core
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI + 0.7;
      A.custom(el, magenta, new THREE.BoxGeometry(0.08, 0.26, 0.05), {
        p: [Math.cos(a) * 0.30, -2.02 - k * 0.42, Math.sin(a) * 0.30],
        r: [0, -a, 0] });
    }
    // side rails carrying the twin ice BLADES past the tip
    for (const bx of [-1, 1]) {
      A.taper(el, 'primary', [0.34, 1.05, 0.72], 0.85, 0.8, {
        p: [bx * 0.57, -2.07, 0], r: [0, 0, 0] });
      // long flat blade: tapered, canted a hair outward
      A.taper(el, 'primary', [0.20, 2.05, 0.62], 0.08, 0.25, {
        p: [bx * 0.56, -3.35, 0], r: [Math.PI, 0, bx * 0.06] });
    }
    // end cap + drill tip
    A.tube(el, 'primary', 0.31, 0.38, 0.22, { p: [0, -3.15, 0], seg: 14 });
    A.tube(el, 'metal', 0.12, 0.17, 0.20, { p: [0, -3.32, 0], seg: 10 });
    A.spike(el, 'metal', 0.11, 0.50, { p: [0, -3.60, 0], r: [Math.PI, 0, 0], seg: 8 });
  }

  // ======================= LEFT ARM: relaxed articulated glove =======================
  {
    const el = 'elbowL', ha = 'handL', sx = -1;
    A.tube(el, 'metal', 0.28, 0.28, 0.52, { p: [0, 0, 0], r: [0, 0, Math.PI / 2], seg: 14 });
    // pale forearm slab, flaring into a wrist cuff
    A.part(el, 'primary', roundedBox(0.72, 0.90, 0.70, 0.14), { p: [0, -0.60, 0] });
    A.taper(el, 'primary', [0.85, 0.40, 0.80], 1.12, 1.1, { p: [0, -1.18, 0] });
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
    for (let i = 0; i < 4; i++) {                                          // relaxed fingers
      const fx = (i - 1.5) * 0.21;
      fp('dark', roundedBox(0.19, 0.34, 0.25, 0.06), [fx, -0.64, 0.22], [0.35, 0, 0]);
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
    J[kn].position.x = sx * 0.12;         // the measured splay
    J[an].position.x = sx * 0.21;
    const lean = -sx * 0.07;

    // thigh: two overlapping chamfered slabs with a dark gap, plus hamstring
    A.ball(th, 'frame', 0.34, {});
    A.tube(th, 'frame', 0.24, 0.27, tl, { p: [sx * 0.05, -tl / 2, 0], r: [0, 0, lean] });
    A.part(th, 'primary', roundedBox(0.92, 0.95, 1.00, 0.16), {
      p: [sx * 0.06, -tl * 0.30, 0.04], r: [0, 0, lean] });
    A.part(th, 'primary', roundedBox(0.82, 0.70, 0.90, 0.14), {
      p: [sx * 0.10, -tl * 0.72, 0.08], r: [0.06, 0, lean] });
    A.taper(th, 'primary', [0.66, 0.72, 0.45], 0.8, 0.72, {
      p: [sx * 0.06, -tl * 0.38, -0.52], r: [-0.10, 0, lean] });      // hamstring
    A.tube(th, 'dark', 0.36, 0.36, 0.22, {
      p: [sx * 0.44, -0.12, 0], r: [0, 0, Math.PI / 2], seg: 16 });   // hip drum

    // knee: dark joint block, protruding rounded cap, side discs
    A.part(kn, 'dark', roundedBox(0.62, 0.55, 0.55, 0.12), { p: [0, -0.05, 0.05] });
    A.part(kn, 'primary', roundedBox(0.60, 0.55, 0.35, 0.14), {
      p: [0, -0.08, 0.42], r: [0.14, 0, 0] });
    for (const px of [-1, 1]) {
      A.tube(kn, 'dark', 0.30, 0.30, 0.16, {
        p: [px * 0.36, -0.05, 0], r: [0, 0, Math.PI / 2], seg: 14 });
    }
    // shin: calf mass + a big front plate flaring toward the ankle
    A.tube(kn, 'frame', 0.22, 0.26, sl, { p: [0, -sl / 2, 0] });
    A.taper(kn, 'primary', [0.82, 1.45, 0.92], 1.10, 1.05, { p: [0, -sl * 0.34, -0.14] });
    A.taper(kn, 'primary', [0.74, 1.55, 0.55], 0.80, 0.85, {
      p: [0, -sl * 0.50, 0.38], r: [0.04, 0, 0] });
    A.taper(kn, 'primary', [0.92, 0.55, 0.82], 0.80, 0.85, { p: [0, -sl * 0.88, 0.10] });
    A.taper(kn, 'dark', [0.60, 0.20, 0.60], 0.9, 0.9, { p: [0, -sl * 1.0, 0.02] });

    // FOOT: the huge low paw-boot with TOE SEGMENTS
    A.part(an, 'primary', roundedBox(1.10, 0.50, 1.25, 0.18), { p: [0, -0.02, 0.20] }); // instep
    A.part(an, 'primary', roundedBox(0.75, 0.30, 0.60, 0.10), { p: [0, 0.16, -0.02] }); // ankle plate
    // four toe segments splaying round the front rim
    for (let i = 0; i < 4; i++) {
      const tx = (i - 1.5) * 0.315;
      A.part(an, 'primary', roundedBox(0.34, 0.42, 0.62, 0.10), {
        p: [tx, -0.16, 0.80 + Math.cos(tx * 1.3) * 0.10], r: [0.14, tx * 0.30, 0] });
    }
    // side plates + heel
    for (const px of [-1, 1]) {
      A.part(an, 'primary', roundedBox(0.26, 0.40, 0.90, 0.10), {
        p: [px * 0.56, -0.14, 0.10], r: [0, 0, px * 0.10] });
    }
    A.part(an, 'primary', roundedBox(0.80, 0.44, 0.58, 0.10), { p: [0, -0.12, -0.46] });
    // dark sole
    A.sharpBox(an, 'dark', [1.15, 0.12, 1.90], { p: [0, -0.34, 0.18] });
  }

  // ======================= ANCHORS (§5 contract) =======================
  // muzzleR is THE LANCE: at the glowing core's mouth, firing down the barrel
  // (stated relative to handR, which sits inside the rigid lance forearm)
  anchors.muzzleR = addAnchor(J.handR, 0, -1.5, 0);
  anchors.muzzleL = addAnchor(J.handL, 0, -0.9, 0.30);
  anchors.core = addAnchor(J.torso, 0, 1.35, 0.45);
}
