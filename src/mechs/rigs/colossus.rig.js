// COLOSSUS custom rig — a hand-placed skeleton for mech_colossus.glb, offered
// as the model's ALTERNATE entry (manifest colossus.alt) so it can be compared
// against the shipping Tripo rig before anyone promotes it.
//
// Why try one: the stock auto-rig is workable but its weights are not — the
// primary entry needs 60+ hand-written skinOps to keep hip plates off the
// forearms, and its `head` bone sits at the exact position of `torso` (a nod
// that moves nothing). Both cannons ride ARM chains: the right barrel is welded
// to tripo0_Right_Limb_0, so a right-arm swing waves a howitzer. A proximity
// re-skin off correctly-placed bones fixes all three by construction.
//
// Positions are MESH-LOCAL (raw GLB bind space): +x FORWARD (toes), +y UP,
// +z / -z the two sides — matched to the SHIPPING entry's boneOverrides, so
// `shoulderL` here drives the same arm the primary calls shoulderL. The model
// is 1.0 tall in this space and its lateral centre line is z = 0. Tune live in
// ?rigedit=colossus&alt=1 and paste the export back (the editor emits only
// name/parent/pos, so `skinSpan`/`bias` are re-attached here).
//
// SHAPE NOTES (measured off the geometry — tools/rigscout.mjs, and the bind
// positions of the Tripo skeleton it replaces):
//  • A firebase on legs: short wide torso (chest y 0.60-0.78), pelvis at 0.46,
//    knees at 0.29, feet flat on the floor with toes out to x 0.22.
//  • The TWIN CANNONS run from a base at y≈0.80, z≈±0.13 up and BACK to tips
//    at y=1.00, x≈-0.10. They are chest hardware — the manifest's muzzles hang
//    off `torso` — so `cannonL/R` (+ their tips) are extra, undriven bones
//    parented to the torso: the guns hold still when an arm swings, and the
//    whole battery tracks the chest.
//  • The ARMS are near-vertical columns drifting outboard as they fall:
//    z≈0.25 at the pauldron (y 0.74), 0.27 at the elbow (0.58), 0.29 at the
//    fist (0.38). Shoulders sit at z ±0.20, inside the pauldron block, so the
//    shoulder→elbow span runs down the upper arm instead of across the chest.
//  • The `head` is the sensor block on top of the chest (y 0.78-0.87), set
//    BACK at x≈-0.05 with `crown` as its tip so it owns the whole block.
//
// `skinSpan: 'child'`: each bone owns the slice BELOW it (shoulder→elbow is the
// upper arm, knee→ankle the shin) — the slice three.js actually pivots about
// that bone. See reskin.js.
//
// `softSkin: 4` relaxes the rigid assignment over 4 connectivity rings, so the
// armpit/waist welds in this single-shell mesh bend instead of shearing.
//
// `cutWelds` (reskin.js): the mesher shipped ONE closed shell, and the fists
// hang a few centimetres from the thighs — welded to them through a membrane
// spanning that air gap. Rigidly split, the membrane shreds the moment an arm
// swings (measured: +0.48 mesh units on viperHeavy, the worst seam in the
// model). cutWelds drops triangles whose ends sit on bones 3+ links apart —
// fist-to-thigh, hand-to-knee — which no joint can explain. `cutPairs` adds
// hips↔shoulder, only 2 links via the torso (so cutWelds' 3-link rule spares
// it) but the same spurious weld: the back plate hangs over the pelvis.
export const COLOSSUS_RIG = {
  skinSpan: 'child',
  softSkin: 4,
  cutWelds: true,
  cutPairs: [['hips', 'shoulderL'], ['hips', 'shoulderR']],
  bones: [
    // ---- spine ---- (pelvis 0.46, chest 0.63, sensor block 0.80)
    { name: 'hips', parent: null, pos: [0.01, 0.46, 0.00], bias: 0.9 },
    { name: 'torso', parent: 'hips', pos: [-0.02, 0.63, 0.00], bias: 0.85 },
    { name: 'head', parent: 'torso', pos: [-0.05, 0.80, 0.00] },
    { name: 'crown', parent: 'head', pos: [-0.12, 0.84, 0.00] },
    // ---- twin cannons: chest hardware, never an arm ----
    { name: 'cannonL', parent: 'torso', pos: [-0.05, 0.81, 0.13] },
    { name: 'cannonLTip', parent: 'cannonL', pos: [-0.10, 1.00, 0.14] },
    { name: 'cannonR', parent: 'torso', pos: [-0.05, 0.81, -0.13] },
    { name: 'cannonRTip', parent: 'cannonR', pos: [-0.10, 1.00, -0.14] },
    // ---- LEFT arm (+z) ----
    { name: 'shoulderL', parent: 'torso', pos: [-0.02, 0.74, 0.22], bias: 1.25 },
    { name: 'elbowL', parent: 'shoulderL', pos: [-0.02, 0.58, 0.27], bias: 1.25 },
    { name: 'handL', parent: 'elbowL', pos: [0.03, 0.44, 0.285] },
    { name: 'fistL', parent: 'handL', pos: [0.08, 0.38, 0.29] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [-0.02, 0.74, -0.22], bias: 1.25 },
    { name: 'elbowR', parent: 'shoulderR', pos: [-0.02, 0.58, -0.27], bias: 1.25 },
    { name: 'handR', parent: 'elbowR', pos: [0.03, 0.44, -0.285] },
    { name: 'fistR', parent: 'handR', pos: [0.08, 0.38, -0.29] },
    // ---- LEFT leg (+z) ---- ankle back at x≈0.05, toes out to 0.17
    { name: 'thighL', parent: 'hips', pos: [0.02, 0.46, 0.14] },
    { name: 'kneeL', parent: 'thighL', pos: [0.05, 0.29, 0.16], bias: 0.95 },
    { name: 'ankleL', parent: 'kneeL', pos: [0.05, 0.10, 0.19] },
    { name: 'footL', parent: 'ankleL', pos: [0.17, 0.03, 0.22] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [0.02, 0.46, -0.14] },
    { name: 'kneeR', parent: 'thighR', pos: [0.05, 0.29, -0.16], bias: 0.95 },
    { name: 'ankleR', parent: 'kneeR', pos: [0.05, 0.10, -0.19] },
    { name: 'footR', parent: 'ankleR', pos: [0.17, 0.03, -0.22] },
  ],
};
