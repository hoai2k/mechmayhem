// ============================================================================
// ANIME TITANUS — dedicated cel-route sculpt, authored part-by-part against
// docs/canonical/anime/mech_titanus.png (see the region crops read in the
// session that built this). NOT the shared designs/titanus.js: this file owns
// its own part decomposition AND its own proportions, both measured off the
// drawing's pixels (grid overlay, figure 1410px tall):
//
// TWO SOURCES, TWO JOBS (docs/ANIME_FIDELITY_GUIDE.md): the DRAWING is the
// styling truth (part shapes, value pattern, glows) but it carries
// perspective, so its VERTICAL ratios lie — the SKELETON comes from the real
// GLB's bones, measured at rest (tools/scratch/bonemeasure.mjs; B = ground →
// helmet top ≈ 7.95 on the model):
//   hips 0.524 B · knee 0.329 B · ANKLE 0.153 B (the boots are TALL)
//   hip joints ±0.165 B, ankles ±0.200 B — the stance SPLAYS outward
//   shoulder pivots 0.848 B at ±0.277 B; head joint 0.877 B
//   PAULDRON TOPS ≈ HELMET TOP (the head is sunken level with them —
//   headY/headZ/shoulderY dims, read by factory.buildRig)
//   fist bottoms at the knee line; tower tops 1.137 B
//
// Materials are the anime toon set (anime.js toonMaterials); the only custom
// material is the flat hazard-chevron canvas. Anchors keep the §5 contract:
// rocket fists fire from the knuckles, core sits in the chest.
// ============================================================================
import * as THREE from 'three';
import { cyl, roundedBox, beveledPlate, shieldOutline, rhombOutline } from '../parts.js';
import { addAnchor } from '../factory.js';
import { hazardMaterial, toon } from '../animeshade.js';

export function animeTitanusDims(D) {
  return {
    ...D,
    // GLB bone ratios at a stature of B = 6.85 (see header)
    hipHeight: 3.59, thighLen: 1.21, shinLen: 1.24,
    torsoH: 2.45, torsoW: 2.30, torsoD: 1.55,
    // shoulder pivots below the chest top, head sunken level with the
    // pauldron tops — stated here, honoured by buildRig
    shoulderY: 1.99, headY: 2.28, headZ: 0.16,
    shoulderW: 1.90, upperArmLen: 1.13, foreArmLen: 1.13,
    hipW: 0.78, footLen: 1.30, headSize: 0.46,
    // the ankle rides HIGH inside the tall boot — tell the animator where
    // the sole really is or it sinks the body boot-deep (see Animator ctor)
    soleDepth: 1.0,
  };
}

export function animeTitanus(A, D, J, anchors, def) {
  const s = D.scale;                      // 1.28
  const hazard = hazardMaterial('#e0a721', '#23252b');
  // matte amber for WIDE lit fields (core corona, tower grilles): a wide
  // surface at glow intensity blooms into a blob, so these barely emit and
  // the small hearts/slits carry the bloom
  const lens = toon(0xf5a92c, { emissive: 0xf5a92c, emissiveIntensity: 0.30 });
  lens.userData.rwGlow = true;            // still no ink rim around it

  // ======================= WAIST / PELVIS (hips) =======================
  // banded waist column rising toward the torso: stacked dark rings over a
  // gunmetal core, exactly the vertebra look of the drawing's midriff
  A.tube('hips', 'frame', 0.26, 0.30, 0.85, { p: [0, 0.28, 0] });
  for (let i = 0; i < 3; i++) {
    A.tube('hips', 'dark', 0.33 - i * 0.015, 0.35 - i * 0.015, 0.14, {
      p: [0, 0.10 + i * 0.22, 0] });
  }
  // pelvis mass
  A.taper('hips', 'frame', [1.20, 0.60, 1.00], 1.10, 0.95, { p: [0, -0.24, 0] });
  A.sharpBox('hips', 'dark', [0.98, 0.24, 0.90], { p: [0, -0.50, 0] });
  // big side hip drums (dark cylinders, metal cap + dimple) the thighs hang off
  for (const sx of [-1, 1]) {
    A.tube('hips', 'dark', 0.40, 0.40, 0.42, {
      p: [sx * 0.62, -0.30, 0], r: [0, 0, Math.PI / 2], seg: 16 });
    A.tube('hips', 'frame', 0.30, 0.30, 0.10, {
      p: [sx * 0.84, -0.30, 0], r: [0, 0, Math.PI / 2], seg: 16 });
    A.tube('hips', 'metal', 0.10, 0.10, 0.06, {
      p: [sx * 0.90, -0.30, 0], r: [0, 0, Math.PI / 2] });
  }
  // front crotch box: chamfered yellow block, dark inset panel across its top
  A.taper('hips', 'primary', [0.66, 0.64, 0.32], 0.82, 0.85, { p: [0, -0.36, 0.52] });
  A.sharpBox('hips', 'dark', [0.44, 0.18, 0.06], { p: [0, -0.14, 0.70] });
  A.sharpBox('hips', 'primary', [0.36, 0.12, 0.04], { p: [0, -0.14, 0.735] });
  // small side skirt plates over the drums + rear plate
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', rhombOutline(0.62, 0.55, { cut: 0.3 }), 0.10, {
      p: [sx * 0.74, -0.54, 0.18], r: [0.05, sx * Math.PI / 2, sx * 0.12] });
  }
  A.plate('hips', 'accent', shieldOutline(0.85, 0.6, { taper: 0.75 }), 0.10, {
    p: [0, -0.5, -0.55], r: [-0.08, Math.PI, 0] });

  // ======================= TORSO =======================
  const chH = D.torsoH;                   // 2.35, shoulders at 0.82 * chH
  // ---- abdomen: stacked dark segments narrowing to the waist ----
  A.taper('torso', 'frame', [1.55, 0.40, 1.25], 1.06, 1.0, { p: [0, 0.72, 0] });
  A.taper('torso', 'frame', [1.35, 0.36, 1.10], 1.08, 1.0, { p: [0, 0.40, 0] });
  A.taper('torso', 'frame', [1.15, 0.32, 0.98], 1.10, 1.0, { p: [0, 0.08, 0] });
  // centre abdominal plate (small yellow angular block between the segments)
  A.taper('torso', 'accent', [0.44, 0.50, 0.14], 0.78, 0.9, { p: [0, 0.48, 0.58] });
  A.sharpBox('torso', 'dark', [0.26, 0.12, 0.05], { p: [0, 0.64, 0.66] });
  // ---- ribcage mass the pecs and core sit on ----
  A.taper('torso', 'accent', [2.05, 1.20, 1.45], 1.05, 0.95, { p: [0, 1.48, 0] });
  A.taper('torso', 'frame', [1.55, 0.55, 0.95], 0.9, 0.85, { p: [0, 2.18, 0] });

  // ---- THE CORE: layered amber reactor, dead-centre chest ----
  // (housing → yellow petal ring → dark ring → corona → 8 dark spokes → heart)
  const cy = 1.45, cz = 0.72;
  A.tube('torso', 'dark', 0.48, 0.52, 0.30, { p: [0, cy, cz], r: [Math.PI / 2, 0, 0], seg: 24 });
  for (let k = 0; k < 10; k++) {          // yellow scalloped petal ring
    const a = (k / 10) * Math.PI * 2;
    A.taper('torso', 'primary', [0.20, 0.17, 0.10], 0.68, 1, {
      p: [Math.cos(a) * 0.43, cy + Math.sin(a) * 0.43, cz + 0.10],
      r: [0, 0, a - Math.PI / 2] });
  }
  A.tube('torso', 'dark', 0.33, 0.35, 0.10, { p: [0, cy, cz + 0.14], r: [Math.PI / 2, 0, 0], seg: 24 });
  A.custom('torso', lens, cyl(0.30, 0.30, 0.05, 24), { p: [0, cy, cz + 0.18], r: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 8; k++) {           // dark radial spokes over the lens
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    A.sharpBox('torso', 'dark', [0.045, 0.11, 0.04], {
      p: [Math.cos(a) * 0.225, cy + Math.sin(a) * 0.225, cz + 0.21],
      r: [0, 0, a - Math.PI / 2] });
  }
  A.tube('torso', 'glow', 0.16, 0.16, 0.06, { p: [0, cy, cz + 0.22], r: [Math.PI / 2, 0, 0], seg: 20 });

  // ---- pec slabs: big angled yellow plates with dark hex insets ----
  for (const sx of [-1, 1]) {
    A.plate('torso', 'primary', rhombOutline(1.18, 1.05, { cut: 0.24 }), 0.24, {
      p: [sx * 0.60, 1.68, 0.62], r: [-0.16, -sx * 0.22, -sx * 0.06], round: 0.10 });
    // dark hexagonal inset on the upper-outer corner
    A.plate('torso', 'accent', rhombOutline(0.26, 0.20, { cut: 0.3 }), 0.05, {
      p: [sx * 0.94, 2.00, 0.80], r: [-0.16, -sx * 0.22, -sx * 0.06] });
    // second, lower pec face angling toward the core
    A.plate('torso', 'primary', rhombOutline(0.85, 0.55, { cut: 0.3 }), 0.16, {
      p: [sx * 0.58, 1.08, 0.68], r: [0.18, -sx * 0.22, sx * 0.05], round: 0.10 });
    // side intake block + vent slats
    A.taper('torso', 'accent', [0.52, 0.95, 0.85], 0.85, 0.9, {
      p: [sx * 1.12, 1.52, 0.12], r: [0, sx * 0.28, 0] });
    A.vents('torso', 'dark', 3, 0.34, 0.10, 0.05, {
      p: [sx * 1.18, 1.70, 0.48], r: [0, sx * 0.55, 0] });
  }
  // amber indicator lights beside the left pec (drawing: small stacked slits)
  A.sharpBox('torso', 'glowSoft', [0.06, 0.11, 0.05], { p: [-1.02, 1.16, 0.60] });
  A.sharpBox('torso', 'glowSoft', [0.06, 0.11, 0.05], { p: [-1.02, 1.00, 0.60] });
  A.ball('torso', 'glowSoft', 0.05, { p: [1.02, 1.08, 0.62], seg: 10 });

  // ---- HEAD SOCKET: the helmet sits down IN the chest, so instead of a
  // collar UNDER a perched head this is a recess AROUND a tucked one — a
  // vented sill below the chin, angled walls beside the helmet, a nape wall
  A.taper('torso', 'dark', [0.95, 0.30, 0.66], 0.90, 0.85, { p: [0, 2.32, 0.32] });
  A.vents('torso', 'frame', 3, 0.36, 0.09, 0.05, { p: [0, 2.32, 0.62] });
  for (const sx of [-1, 1]) {
    A.taper('torso', 'accent', [0.28, 0.46, 0.66], 0.82, 0.78, {
      p: [sx * 0.62, 2.52, 0.10], r: [0, 0, sx * 0.10] });
  }
  A.sharpBox('torso', 'accent', [1.10, 0.44, 0.26], { p: [0, 2.50, -0.40] });

  // ---- back plant + TWIN RADIATOR TOWERS ----
  A.taper('torso', 'accent', [1.7, 1.35, 0.6], 0.9, 0.8, { p: [0, 1.5, -0.72] });
  A.sharpBox('torso', 'dark', [1.6, 0.18, 0.25], { p: [0, 2.25, -0.62] }); // cross beam
  for (const sx of [-1, 1]) {
    const tx = sx * 0.68, tz = -0.58;
    // base collar + column (slight taper up)
    A.sharpBox('torso', 'dark', [0.58, 0.30, 0.52], { p: [tx, 2.28, tz] });
    A.taper('torso', 'frame', [0.48, 1.15, 0.44], 0.94, 0.94, { p: [tx, 2.90, tz] });
    // recessed front grille: amber glow behind thin dark slats
    A.sharpBox('torso', 'dark', [0.34, 0.95, 0.05], { p: [tx, 2.92, tz + 0.21] });
    A.custom('torso', lens, new THREE.BoxGeometry(0.28, 0.85, 0.03), { p: [tx, 2.92, tz + 0.235] });
    for (let i = 0; i < 7; i++) {
      A.sharpBox('torso', 'dark', [0.30, 0.07, 0.035], {
        p: [tx, 2.58 + i * 0.125, tz + 0.245] });
    }
    // side window slits (amber), one high one low, on the outer face
    A.sharpBox('torso', 'glow', [0.04, 0.15, 0.05], { p: [tx + sx * 0.235, 2.66, tz + 0.05] });
    A.sharpBox('torso', 'glow', [0.04, 0.15, 0.05], { p: [tx + sx * 0.235, 3.22, tz - 0.02] });
    // chamfered cap block with the crenellated notch (two prongs, gap centre)
    A.taper('torso', 'accent', [0.62, 0.44, 0.56], 0.88, 0.88, { p: [tx, 3.68, tz] });
    for (const px of [-1, 1]) {
      A.sharpBox('torso', 'dark', [0.20, 0.26, 0.50], { p: [tx + px * 0.17, 4.00, tz] });
    }
    // greebles at the base: small pistons + a stub cylinder
    A.tube('torso', 'metal', 0.05, 0.05, 0.35, { p: [tx + sx * 0.30, 2.36, tz + 0.18] });
    A.tube('torso', 'dark', 0.09, 0.09, 0.22, { p: [tx - sx * 0.28, 2.38, tz + 0.20] });
  }

  // ======================= HEAD =======================
  // small, sunken between the towers: yellow helmet + crest, amber chevron
  // visor in a dark recess, dark vented chin guard, cheek pods
  A.tube('head', 'dark', 0.26, 0.30, 0.34, { p: [0, 0.03, 0] });                 // neck
  A.taper('head', 'primary', [0.68, 0.54, 0.72], 0.78, 0.82, { p: [0, 0.48, 0.02] }); // helmet
  A.taper('head', 'primary', [0.26, 0.18, 0.66], 0.62, 0.75, { p: [0, 0.78, 0.06] }); // crest ridge
  A.taper('head', 'primary', [0.64, 0.16, 0.28], 0.85, 0.9, { p: [0, 0.66, 0.32] });  // brow
  A.sharpBox('head', 'dark', [0.60, 0.24, 0.12], { p: [0, 0.45, 0.33] });        // visor recess
  for (const sx of [-1, 1]) {             // amber chevron visor, meeting centre
    A.sharpBox('head', 'glow', [0.24, 0.07, 0.06], {
      p: [sx * 0.125, 0.455, 0.40], r: [0, 0, -sx * 0.16] });
  }
  A.sharpBox('head', 'glow', [0.08, 0.05, 0.05], { p: [0, 0.405, 0.415] });       // centre notch
  A.taper('head', 'dark', [0.46, 0.24, 0.40], 0.78, 0.7, { p: [0, 0.15, 0.12] }); // jaw
  A.vents('head', 'frame', 3, 0.3, 0.08, 0.04, { p: [0, 0.14, 0.40] });
  for (const sx of [-1, 1]) {             // cheek pods
    A.tube('head', 'dark', 0.10, 0.10, 0.14, {
      p: [sx * 0.36, 0.42, 0.10], r: [0, 0, Math.PI / 2] });
  }
  A.sharpBox('head', 'accent', [0.42, 0.30, 0.20], { p: [0, 0.42, -0.30] });      // nape block

  // ======================= ARMS =======================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;

    // ---- shoulder joint + segmented upper arm ----
    // the elbow rides OUTBOARD of the pivot (measured: forearm centres at
    // ±0.33 B), so the arm stack slants out to meet it
    J[el].position.x = sx * 0.30;
    A.ball(sh, 'frame', 0.36, {});
    A.tube(sh, 'frame', 0.24, 0.27, D.upperArmLen * 0.95, {
      p: [sx * 0.12, -D.upperArmLen * 0.5, 0], r: [0, 0, -sx * 0.20] });
    for (let i = 0; i < 4; i++) {         // dark vertebra rings down the arm
      A.tube(sh, 'dark', 0.31 - i * 0.012, 0.33 - i * 0.012, 0.13, {
        p: [sx * (0.02 + i * 0.065), -0.28 - i * 0.20, 0] });
    }
    A.piston(sh, 'brass', [sx * 0.16, -0.2, 0.22], [sx * 0.1, -D.upperArmLen * 0.8, 0.26], 0.045);

    // ---- THE PAULDRON: measured off the drawing's run profile ----
    // Centre ±1.35 from the body axis (INBOARD of the arm pivot — it reads
    // as the chest's own shoulder), ~1.9 wide, and the TOP IS ROUNDED AND
    // TAPERS: a narrow crest at ~+0.45 over the full-width line, which
    // itself sits at chest-top/head-mid height. The bottom tapers back in.
    const px0 = -sx * 0.42;               // pauldron centre, relative to the pivot
    const rz = -sx * 0.10;                // just a hint of outer-edge droop
    // main body: soft-cornered slab (full width at the shoulder line)
    A.part(sh, 'primary', roundedBox(1.90, 1.00, 1.15, 0.16), {
      p: [px0, 0.30, -0.03], r: [0, 0, rz] });
    // the rounded, tapering top: a squashed dome over the slab
    A.lathe(sh, 'primary', [[-0.10, 0.80], [0.15, 0.70], [0.33, 0.45], [0.46, 0.06]], {
      p: [px0, 0.74, -0.03], r: [0, 0, rz], scaleX: 1.16, scaleZ: 0.66, seg: 20 });
    // small raised ridge riding the crest, toward the inner edge
    A.part(sh, 'primary', roundedBox(0.44, 0.18, 0.72, 0.06), {
      p: [px0 - sx * 0.22, 0.94, -0.03], r: [0, 0, rz] });
    // hazard chevron band across the lower front face
    A.custom(sh, hazard, beveledPlate(rhombOutline(1.40, 0.40, { cut: 0.18 }), 0.06, { round: 0.08 }), {
      p: [px0, -0.02, 0.56], r: [0, 0, rz] });
    // dark lower rim, then a skirt that TAPERS BACK IN at the bottom
    A.sharpBox(sh, 'dark', [1.70, 0.13, 1.06], { p: [px0, -0.28, -0.03], r: [0, 0, rz] });
    A.taper(sh, 'primary', [1.55, 0.34, 0.98], 1.12, 1.02, {
      p: [px0, -0.50, -0.03], r: [0, 0, rz] });
    // inner shoulder step against the chest
    A.taper(sh, 'frame', [0.55, 0.34, 0.80], 0.80, 0.8, {
      p: [px0 - sx * 0.85, 0.30, -0.03] });

    // ---- elbow ----
    A.tube(el, 'metal', 0.30, 0.30, 0.62, { p: [0, 0, 0], r: [0, 0, Math.PI / 2], seg: 14 });
    for (const px of [-1, 1]) {           // dark cap discs + dimples
      A.tube(el, 'dark', 0.34, 0.34, 0.08, { p: [px * 0.34, 0, 0], r: [0, 0, Math.PI / 2], seg: 16 });
      A.tube(el, 'metal', 0.10, 0.10, 0.05, { p: [px * 0.39, 0, 0], r: [0, 0, Math.PI / 2] });
    }

    // ---- FOREARM: the enormous multi-piece drum ----
    const fl = D.foreArmLen;              // 1.30
    // upper cuff over the elbow end (its own beveled slab, slightly larger)
    A.taper(el, 'primary', [1.24, 0.48, 1.10], 0.92, 0.94, { p: [0, -0.30, 0] });
    // main drum
    A.box(el, 'primary', [1.16, 0.82, 1.04], { p: [0, -fl * 0.66, 0], bevel: 0.07 });
    // big front panel with an inset rectangle outline (panel-in-panel)
    A.plate(el, 'primary', rhombOutline(0.88, 0.62, { cut: 0.16 }), 0.10, {
      p: [0, -fl * 0.62, 0.54], r: [0, 0, Math.PI / 2], round: 0.08 });
    A.sharpBox(el, 'dark', [0.52, 0.38, 0.04], { p: [0, -fl * 0.60, 0.615] });
    A.sharpBox(el, 'primary', [0.44, 0.30, 0.03], { p: [0, -fl * 0.60, 0.64] });
    // outer-face dark inset + piston greeble near the elbow
    A.sharpBox(el, 'accent', [0.08, 0.52, 0.58], { p: [sx * 0.56, -fl * 0.45, -0.05] });
    A.tube(el, 'dark', 0.09, 0.09, 0.34, { p: [sx * 0.50, -0.36, -0.30] });
    A.piston(el, 'metal', [sx * 0.42, -0.18, -0.34], [sx * 0.40, -fl * 0.62, -0.38], 0.05);
    // inner-face vent slats
    A.vents(el, 'dark', 3, 0.4, 0.09, 0.05, { p: [-sx * 0.50, -fl * 0.5, 0.22], r: [0, Math.PI / 2, 0] });
    // wrist collar
    A.taper(el, 'dark', [0.98, 0.22, 0.90], 0.9, 0.9, { p: [0, -fl * 0.96, 0] });
    // underside plate
    A.sharpBox(el, 'frame', [0.92, 0.5, 0.2], { p: [0, -fl * 0.7, -0.48] });

    // ---- FIST: gorilla knuckle cluster, bottom just below the knee line ----
    A.tube(ha, 'dark', 0.30, 0.33, 0.22, { p: [0, 0.06, 0] });                   // wrist ring
    A.part(ha, 'frame', roundedBox(0.98, 0.92, 0.92, 0.16), { p: [0, -0.55, 0.02] }); // palm block
    // back-of-hand plate (yellow, beveled, tipped with the hang of the arm)
    A.plate(ha, 'primary', rhombOutline(0.85, 0.68, { cut: 0.24 }), 0.14, {
      p: [0, -0.38, -0.48], r: [-0.12, 0, 0], round: 0.12 });
    // four finger columns, three segments each, curling forward-down
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.235;
      A.part(ha, 'primary', roundedBox(0.21, 0.30, 0.28, 0.06), {
        p: [fx, -0.42, 0.52], r: [0.15, 0, 0] });
      A.part(ha, 'dark', roundedBox(0.20, 0.27, 0.25, 0.05), {
        p: [fx, -0.74, 0.55], r: [0.55, 0, 0] });
      A.part(ha, 'dark', roundedBox(0.18, 0.24, 0.21, 0.05), {
        p: [fx, -1.00, 0.40], r: [1.1, 0, 0] });
    }
    // thumb, two segments, inboard
    A.part(ha, 'primary', roundedBox(0.22, 0.30, 0.26, 0.06), {
      p: [-sx * 0.55, -0.55, 0.28], r: [0.3, 0, -sx * 0.4] });
    A.part(ha, 'dark', roundedBox(0.19, 0.26, 0.22, 0.05), {
      p: [-sx * 0.62, -0.82, 0.38], r: [0.8, 0, -sx * 0.4] });
    // knuckle guard ridge across the top of the fingers
    A.sharpBox(ha, 'dark', [0.95, 0.14, 0.30], { p: [0, -0.30, 0.56], r: [0.15, 0, 0] });
  }

  // ======================= LEGS =======================
  // long by the model's own bones (knee 0.329 B, ankle up at 0.153 B in a
  // tall boot), SPLAYED outward like the model's stance, knees carrying real
  // dark structure round the hex plates, shins/boots FLARING toward the ground
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    const tl = D.thighLen, sl = D.shinLen;
    // measured off the drawing's leg runs: thighs leave a NARROW hip
    // (±0.135 B) and the knees sit OUT at ±0.164 B, boots wider still — the
    // classic A-stance. Baked into the joints so the whole leg carries it.
    J[kn].position.x = sx * 0.34;
    J[an].position.x = sx * 0.10;

    // ---- thigh: leans OUTWARD from the narrow hip to the wide knee ----
    const lean = -sx * 0.26;              // atan(0.34 / thighLen), the splay angle
    A.ball(th, 'frame', 0.34, { p: [sx * 0.04, -0.02, 0] });
    A.tube(th, 'frame', 0.22, 0.25, tl * 1.05, {
      p: [sx * 0.16, -tl / 2, 0], r: [0, 0, lean] });
    // main thigh box riding the lean
    A.taper(th, 'primary', [0.92, 0.92, 0.90], 0.84, 0.9, {
      p: [sx * 0.13, -tl * 0.34, 0.02], r: [0, 0, lean] });
    // front plate with the bottom notch
    A.plate(th, 'primary', shieldOutline(0.60, 0.70, { taper: 0.8, tip: 0.2 }), 0.10, {
      p: [sx * 0.19, -tl * 0.42, 0.47], r: [0.06, 0, lean], round: 0.10 });
    A.sharpBox(th, 'dark', [0.20, 0.10, 0.06], { p: [sx * 0.26, -tl * 0.74, 0.48] });
    // outer hip drum (big dark disc + dimple), riding the lean
    A.tube(th, 'dark', 0.34, 0.34, 0.20, {
      p: [sx * 0.40, -0.14, 0], r: [0, 0, Math.PI / 2 + lean], seg: 16 });
    A.tube(th, 'metal', 0.10, 0.10, 0.06, {
      p: [sx * 0.50, -0.17, 0], r: [0, 0, Math.PI / 2 + lean] });
    // inner guard plate
    A.sharpBox(th, 'accent', [0.10, 0.56, 0.55], {
      p: [-sx * 0.28, -tl * 0.48, 0], r: [0, 0, lean] });

    // ---- knee: REAL DARK STRUCTURE, not just a plate ----
    // joint drums BOTH sides (big keyed disc outboard, smaller inboard)
    A.tube(kn, 'dark', 0.42, 0.42, 0.24, {
      p: [sx * 0.36, -0.04, 0], r: [0, 0, Math.PI / 2], seg: 18 });
    A.tube(kn, 'frame', 0.32, 0.32, 0.08, {
      p: [sx * 0.50, -0.04, 0], r: [0, 0, Math.PI / 2], seg: 18 });
    A.sharpBox(kn, 'metal', [0.05, 0.22, 0.08], { p: [sx * 0.545, -0.04, 0] });
    A.tube(kn, 'dark', 0.30, 0.30, 0.16, {
      p: [-sx * 0.34, -0.04, 0], r: [0, 0, Math.PI / 2], seg: 16 });
    // dark knee mass BEHIND the hex plate, so the yellow octagon reads as a
    // cap over machinery with shadow showing all round its rim
    A.taper(kn, 'dark', [0.66, 0.55, 0.44], 0.85, 0.8, { p: [0, -0.10, 0.18] });
    A.sharpBox(kn, 'dark', [0.50, 0.20, 0.22], { p: [0, -sl * 0.36, 0.30] });
    // shin core + centre-front piston in the dark gap between the hex plates
    A.tube(kn, 'frame', 0.20, 0.24, sl, { p: [0, -sl / 2, 0] });
    A.piston(kn, 'metal', [0, -sl * 0.22, 0.36], [0, -sl * 0.55, 0.34], 0.05);
    // THE HEX PLATE STACK: large knee octagon over a WIDER dark backing
    // plate, so the joint's dark structure shows all round the yellow rim
    A.plate(kn, 'dark', rhombOutline(1.06, 1.10, { cut: 0.3 }), 0.08, {
      p: [0, -0.16, 0.36], r: [0.10, 0, 0], round: 0.10 });
    A.plate(kn, 'primary', rhombOutline(0.86, 0.90, { cut: 0.34 }), 0.16, {
      p: [0, -0.14, 0.46], r: [0.10, 0, 0], round: 0.08 });
    A.plate(kn, 'primary', rhombOutline(0.78, 0.80, { cut: 0.34 }), 0.14, {
      p: [0, -sl * 0.62, 0.46], r: [-0.04, 0, 0], round: 0.08 });
    // dark side faces on the shin (the drawing keeps the sides in shadow)
    for (const px of [-1, 1]) {
      A.sharpBox(kn, 'accent', [0.09, 0.55, 0.48], { p: [px * 0.42, -sl * 0.55, -0.02] });
    }
    // calf bulge up high…
    A.taper(kn, 'primary', [0.78, 0.85, 0.78], 1.14, 1.06, { p: [0, -sl * 0.50, -0.14] });
    // …then the lower shin FLARES: wide at the boot, narrower up top
    A.taper(kn, 'primary', [0.92, 0.50, 0.86], 0.72, 0.85, { p: [0, -sl * 0.90, 0.04] });
    A.taper(kn, 'dark', [0.72, 0.20, 0.68], 0.88, 0.9, { p: [0, -sl * 1.02, 0.02] });
    // ankle joint disc, outer side
    A.tube(kn, 'dark', 0.26, 0.26, 0.16, {
      p: [sx * 0.36, -sl * 0.98, 0], r: [0, 0, Math.PI / 2], seg: 14 });

    // ---- foot: TALL flared treaded boot (the ankle rides high in it) ----
    A.sharpBox(an, 'dark', [0.66, 0.20, 0.62], { p: [0, 0.28, 0.06] });         // top cuff
    // boot column, flaring wide toward the ground
    A.taper(an, 'primary', [1.20, 0.95, 1.18], 0.54, 0.58, { p: [0, -0.26, 0.10] });
    A.taper(an, 'primary', [1.48, 0.36, 1.42], 0.80, 0.82, { p: [0, -0.79, 0.10] });
    // dark toe cap + stepped tread blocks marching down the front
    A.taper(an, 'dark', [1.10, 0.42, 0.66], 0.80, 0.62, { p: [0, -0.66, 0.64] });
    A.sharpBox(an, 'dark', [1.05, 0.16, 0.24], { p: [0, -0.76, 0.84] });
    A.sharpBox(an, 'dark', [0.95, 0.14, 0.22], { p: [0, -0.84, 1.00] });
    A.sharpBox(an, 'dark', [0.82, 0.12, 0.18], { p: [0, -0.92, 1.13] });
    // heel block + side ankle pods
    A.taper(an, 'dark', [1.00, 0.42, 0.55], 0.80, 0.76, { p: [0, -0.78, -0.44] });
    for (const px of [-1, 1]) {
      A.tube(an, 'dark', 0.15, 0.15, 0.16, {
        p: [px * 0.56, -0.50, -0.08], r: [0, 0, Math.PI / 2], seg: 12 });
    }
    // sole + tread ribs
    A.sharpBox(an, 'dark', [1.42, 0.12, 1.80], { p: [0, -0.955, 0.16] });
    for (let i = 0; i < 4; i++) {
      A.sharpBox(an, 'dark', [1.44, 0.05, 0.18], { p: [0, -0.985, -0.48 + i * 0.44] });
    }
  }

  // ======================= ANCHORS (§5 contract) =======================
  // rocket fists fire from the knuckles; core light sits inside the chest
  anchors.muzzleR = addAnchor(J.handR, 0, -0.72, 0.62);
  anchors.muzzleL = addAnchor(J.handL, 0, -0.72, 0.62);
  anchors.core = addAnchor(J.torso, 0, 1.10, 0.45);
}
