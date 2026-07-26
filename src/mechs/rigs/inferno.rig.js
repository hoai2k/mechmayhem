// INFERNO custom rig — a clean hand-placed skeleton for mech_inferno.glb,
// replacing a Tripo auto-rig that needed 99 skinOps and still could not tell
// his arms apart from his fuel tanks.
//
// Currently wired as the mech's ALTERNATE build (manifest `inferno.alt`), so
// the shipped mech is unchanged while this one is judged side by side:
//   ?rigedit=inferno         (this rig, on the alt GLB — see rigedit's alt gate)
//   ?debug=models&mech=inferno&left=alt      procedural / alt / primary compare
//   node tools/variantcheck.mjs inferno
// Promoting it is a manifest edit only: move `rig` onto the primary entry and
// keep the Tripo entry as `alt` (MECH_ART_GUIDE §Route A+ step 4).
//
// Positions are MESH-LOCAL (raw GLB bind space): +x FORWARD (head, toes,
// torch barrels), +y UP, +z LEFT / -z RIGHT. The model is 1.0 tall in this
// space and its centre line is z = 0 — read positions straight off
// `node tools/rigscout.mjs inferno /tmp/inferno` and tune live in ?rigedit.
//
// SHAPE NOTES (measured off the islands rigscout reports):
//  • A tall, upright heavy biped. Hips at y≈0.42, chest at y≈0.66, and the
//    head (island 11) is a small cowl set FORWARD at x≈0.09, y≈0.84 — buried
//    between two shoulder stacks, so `crown` pins the top of it or the torso
//    takes the whole cowl.
//  • Two PROPANE TANKS ride the back at x≈-0.12, y≈0.88, one per side. They
//    are torso geometry: given to the shoulders they would swing out on every
//    punch, so `tankL`/`tankR` hold them as static children of `torso`.
//  • The arms hang outboard and RAKE FORWARD as they descend — shoulder at
//    z≈0.23/x≈0.00, elbow at z≈0.30, and the torch barrel ending at z≈0.33,
//    x≈0.15. `nozzleL`/`nozzleR` sit on those barrel tips and are what the
//    manifest hangs muzzleL/muzzleR on, so the flames leave the actual torch
//    instead of a guessed offset from a wrist.
//  • The legs are one shell each from hip to ankle (islands 2 and 6), so
//    thigh/knee/ankle are placed inside a continuous surface — `softSkin`
//    below is what keeps that surface from shearing at the knee.
//
// `skinSpan: 'child'`: each bone owns the slice BELOW it (shoulder→elbow is
// the upper arm, knee→ankle the shin) — the slice three.js actually pivots
// about that bone. See reskin.js.
//
// `softSkin: 6` relaxes the rigid assignment over 6 connectivity rings, so the
// welded shell bends at hips, knees and armpits instead of shearing. Measured
// with tools/cliptear.mjs over all 93 clips, worst cross-bone edge stretch:
// rigid 0.170 → 4 rings 0.141 → 6 rings 0.108 → 8 rings 0.085, against the
// Tripo primary's 0.208. It keeps climbing, but so does the risk of armour
// plates reading rubbery, so this stops at vulcan's setting.
//
// `cutWelds` is deliberately NOT set. Rhino and vulcan need it because their
// meshers spanned the air gap between arm and hip with a hidden membrane that
// fans out into shards on an uppercut; inferno has no such weld — at the
// default 3-link rule this rig reports ZERO far-hierarchy seam edges, so
// there is nothing to cut and the rule could only eat honest armour.
export const INFERNO_RIG = {
  skinSpan: 'child',
  softSkin: 6,
  bones: [
    // ---- spine ----
    { name: 'hips', parent: null, pos: [0.02, 0.42, 0.00], bias: 0.9 },
    { name: 'torso', parent: 'hips', pos: [0.01, 0.66, 0.00], bias: 0.85 },
    // the back tanks: static, so a punch never swings the fuel supply
    { name: 'tankL', parent: 'torso', pos: [-0.12, 0.88, 0.10] },
    { name: 'tankR', parent: 'torso', pos: [-0.12, 0.88, -0.10] },
    // ---- head: a small forward cowl, pinned top and bottom ----
    { name: 'head', parent: 'torso', pos: [0.05, 0.78, 0.00] },
    { name: 'crown', parent: 'head', pos: [0.09, 0.90, 0.00] },
    // ---- LEFT arm (+z) ----
    { name: 'shoulderL', parent: 'torso', pos: [0.00, 0.78, 0.23], bias: 1.2 },
    { name: 'stackL', parent: 'shoulderL', pos: [0.02, 0.88, 0.26] },
    { name: 'elbowL', parent: 'shoulderL', pos: [0.03, 0.56, 0.30], bias: 1.05 },
    { name: 'handL', parent: 'elbowL', pos: [0.09, 0.36, 0.32], bias: 1.05 },
    { name: 'nozzleL', parent: 'handL', pos: [0.15, 0.29, 0.33] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [0.00, 0.78, -0.23], bias: 1.2 },
    { name: 'stackR', parent: 'shoulderR', pos: [0.04, 0.88, -0.26] },
    { name: 'elbowR', parent: 'shoulderR', pos: [0.03, 0.56, -0.30], bias: 1.05 },
    { name: 'handR', parent: 'elbowR', pos: [0.09, 0.36, -0.32], bias: 1.05 },
    { name: 'nozzleR', parent: 'handR', pos: [0.15, 0.29, -0.33] },
    // ---- LEFT leg (+z) ----
    { name: 'thighL', parent: 'hips', pos: [0.02, 0.40, 0.15] },
    { name: 'kneeL', parent: 'thighL', pos: [0.02, 0.24, 0.17], bias: 0.95 },
    { name: 'ankleL', parent: 'kneeL', pos: [0.01, 0.12, 0.18] },
    { name: 'footL', parent: 'ankleL', pos: [0.12, 0.03, 0.18] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [0.02, 0.40, -0.15] },
    { name: 'kneeR', parent: 'thighR', pos: [0.02, 0.24, -0.17], bias: 0.95 },
    { name: 'ankleR', parent: 'kneeR', pos: [0.01, 0.12, -0.18] },
    { name: 'footR', parent: 'ankleR', pos: [0.12, 0.03, -0.18] },
  ],
};
