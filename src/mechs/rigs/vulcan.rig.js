// VULCAN custom rig — a clean hand-placed skeleton for mech_vulcan.glb,
// replacing a Tripo auto-rig that had scrambled the model badly enough to need
// 30+ hand-written skinOps and STILL mis-owned whole assemblies: its
// `tripoHead_0` drove the LEFT shoulder backpack pod (island 14, centroid
// z +0.16) rather than the face, `bone_5`/`bone_6`/`bone_7` held pieces of the
// right arm, and the actual horned head rode the chest shell.
//
// Positions are MESH-LOCAL (raw GLB bind space): +x FORWARD (the gatling
// barrels and the toes), +y UP, +z LEFT / -z RIGHT. The model is 1.0 tall in
// this space and its lateral centre line is z = 0. Tune live in
// ?rigedit=vulcan and paste the export back (the editor emits only
// name/parent/pos, so `skinSpan`/`bias` are re-attached here).
//
// SHAPE NOTES (measured off the raw mesh — y-slices of the bind geometry):
//  • A short, deep torso: pelvis mass y 0.37-0.65, waist block y 0.58-0.71,
//    chest y 0.64-0.85. `hips` sits at 0.47, just above where the thighs start.
//  • The HEAD is the horned mask in the middle at y 0.85-0.96, sitting FORWARD
//    of the spine (the central column's centroid runs from x +0.04 at y 0.80
//    back to −0.08 at y 0.94 — that rearward mass is the backpack, not him).
//    `head` is placed at the neck under the mask; `packL`/`packR` take the two
//    shoulder-top pods so a head turn never swings them.
//  • The ARMS hang out and DOWN, gatlings muzzle-first at the bottom: shoulder
//    y 0.78 |z| 0.22, elbow y 0.63 |z| 0.30, wrist y 0.52 |z| 0.33, and the
//    barrel cluster forward at x 0.16 y 0.44. `gunL`/`gunR` are leaf tips that
//    keep the six-barrel mass on the hand instead of letting it fight the
//    forearm span.
//  • The LEGS are wide and short: hip y 0.44 |z| 0.14, knee y 0.25 |z| 0.17,
//    ankle y 0.10 |z| 0.20, and a long foot reaching x +0.09.
//
// `skinSpan: 'child'`: each bone owns the slice BELOW it (shoulder→elbow is the
// upper arm, knee→ankle the shin) — the slice three.js actually pivots about
// that bone. See reskin.js.
//
// `cutWelds` + `cutPairs`: like every Tripo shell this is ONE closed surface —
// the inner arms are welded to the hips across the air gap, and the gatling
// housings to the skirt. Rigidly split, those membranes fan into shards the
// moment an arm lifts. `cutWelds` drops triangles whose ends sit on bones 3+
// links apart; `cutPairs` adds the hips↔shoulder and hips↔gun pairs, which are
// only 2 links via the torso but the same spurious weld. `softSkin: 6` then
// relaxes the REAL joints over 6 rings so shoulders and knees bend rather than
// shear (4 rings left a visible gash on `dead`; 8 buys little and starts to
// rubberise the plates).
// Measured (tools/cliptear.mjs, all 91 clips, every cross-bone seam): worst
// stretch +0.082 mesh units / 32x, against the Tripo rig's +0.416 / 617x.
export const VULCAN_RIG = {
  skinSpan: 'child',
  softSkin: 6,
  cutWelds: true,
  cutPairs: [
    ['hips', 'shoulderL'], ['hips', 'shoulderR'],
    ['hips', 'gunL'], ['hips', 'gunR'],
    ['thighL', 'gunL'], ['thighR', 'gunR'],
  ],
  bones: [
    // ---- spine ---- pelvis low and deep, chest at the shoulder line
    { name: 'hips', parent: null, pos: [0.05, 0.47, 0.00], bias: 0.9 },
    { name: 'skirtL', parent: 'hips', pos: [0.02, 0.52, 0.17] },
    { name: 'skirtR', parent: 'hips', pos: [0.02, 0.52, -0.17] },
    { name: 'torso', parent: 'hips', pos: [0.03, 0.66, 0.00] },
    { name: 'chest', parent: 'torso', pos: [0.02, 0.79, 0.00] },
    // ---- head: the horned mask, forward of the spine ----
    { name: 'head', parent: 'torso', pos: [0.03, 0.86, 0.00], bias: 0.7 },
    { name: 'crest', parent: 'head', pos: [0.06, 0.94, 0.00] },
    // ---- shoulder-top backpack pods: torso mass, never head or arm ----
    { name: 'packL', parent: 'torso', pos: [-0.10, 0.90, 0.15] },
    { name: 'packR', parent: 'torso', pos: [-0.10, 0.90, -0.15] },
    // ---- LEFT arm (+z) ---- gatling hangs muzzle-down and forward
    { name: 'shoulderL', parent: 'torso', pos: [0.00, 0.78, 0.22] },
    { name: 'pauldronL', parent: 'shoulderL', pos: [-0.02, 0.80, 0.30] },
    { name: 'elbowL', parent: 'shoulderL', pos: [0.02, 0.63, 0.30], bias: 1.05 },
    { name: 'handL', parent: 'elbowL', pos: [0.05, 0.52, 0.33], bias: 1.05 },
    { name: 'gunL', parent: 'handL', pos: [0.16, 0.44, 0.35] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [0.00, 0.78, -0.22] },
    { name: 'pauldronR', parent: 'shoulderR', pos: [-0.02, 0.80, -0.30] },
    { name: 'elbowR', parent: 'shoulderR', pos: [0.02, 0.63, -0.30], bias: 1.05 },
    { name: 'handR', parent: 'elbowR', pos: [0.05, 0.52, -0.33], bias: 1.05 },
    { name: 'gunR', parent: 'handR', pos: [0.16, 0.44, -0.35] },
    // ---- LEFT leg (+z) ---- long foot: ankle back at x 0.00, toes at +0.09
    { name: 'thighL', parent: 'hips', pos: [0.03, 0.44, 0.14] },
    { name: 'kneeL', parent: 'thighL', pos: [0.02, 0.25, 0.17], bias: 0.95 },
    { name: 'ankleL', parent: 'kneeL', pos: [0.00, 0.10, 0.20] },
    { name: 'footL', parent: 'ankleL', pos: [0.09, 0.02, 0.22] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [0.03, 0.44, -0.14] },
    { name: 'kneeR', parent: 'thighR', pos: [0.02, 0.25, -0.17], bias: 0.95 },
    { name: 'ankleR', parent: 'kneeR', pos: [0.00, 0.10, -0.20] },
    { name: 'footR', parent: 'ankleR', pos: [0.09, 0.02, -0.22] },
  ],
};
