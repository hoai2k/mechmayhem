// GLACIER custom rig — a clean humanoid skeleton for mech_glacier.glb, matched
// to the model so it can be compared (as the manifest `alt`, same GLB file)
// against the stock Tripo rig in ?debug=models. Glacier is a big biped brawler
// carrying a long ice LANCE in his LEFT hand; the right hand is an open claw.
//
// Positions are MESH-LOCAL (raw bind space): +x FORWARD (toes), +y UP,
// +z LEFT / -z RIGHT. Tune live in ?rigedit=glacier and paste the export back
// (the editor exports only name/parent/pos, so `skinSpan`/`bias` are
// re-attached here by hand).
//
// `skinSpan: 'child'`: each bone owns the limb slice BELOW it (shoulder→elbow
// is the upper arm, knee→ankle is the shin) — the slice three.js actually
// pivots about that bone. The default 'parent' spans this rig used to run put
// the upper arm on `elbow`, the thigh on `knee`, the shin on `ankle` and the
// forearm on `hand`, so every bend swung the segment ABOVE the joint: a bent
// elbow tore the upper arm off the shoulder and a planted foot dragged the
// shin. See reskin.js for the full explanation.
//
// TIP bones (crest, backSpine, lanceL, clawR, footL/R) are NOT game joints, so
// they are static — a bone with no animation of its own transforms exactly like
// its nearest animated ancestor. They exist to give the last driven joint of
// each chain something to reach along: without `lanceL` the ice lance is a leaf
// bone's single point and the forearm out-competes it for the blade; without
// footL/R the toes go to the shin; `crest` is what lets `head` hold the skull;
// `backSpine` keeps the tall back ice crest on the torso.
export const GLACIER_RIG = {
  skinSpan: 'child',
  bones: [
    // ---- spine ---- (bias<1: the torso/hips own the chest & armor slab, so a
    //      limb can't reach in and take a piece of it)
    { name: 'hips', parent: null, pos: [-0.02, 0.56, 0.00], bias: 0.8 },
    { name: 'torso', parent: 'hips', pos: [-0.06, 0.74, 0.00], bias: 0.8 },
    { name: 'backSpine', parent: 'torso', pos: [-0.24, 0.93, 0.00] },
    { name: 'head', parent: 'torso', pos: [0.07, 0.80, -0.01], bias: 0.7 },
    { name: 'crest', parent: 'head', pos: [0.15, 0.84, -0.01] },
    // ---- LEFT arm (+z) ---- holds the lance
    // shoulder bias BELOW the torso's: the spiked pauldron sits above the
    // shoulder joint, outside the shoulder→elbow span, and the torso→shoulder
    // span ends at the very same point — so without the tie-break the pauldrons
    // stay welded to the chest and the arms raise out of them.
    { name: 'shoulderL', parent: 'torso', pos: [-0.08, 0.78, 0.24], bias: 0.7 },
    { name: 'elbowL', parent: 'shoulderL', pos: [-0.11, 0.61, 0.28] },
    { name: 'handL', parent: 'elbowL', pos: [0.03, 0.43, 0.31] },
    { name: 'lanceL', parent: 'handL', pos: [0.28, 0.17, 0.40] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [-0.08, 0.78, -0.26], bias: 0.7 },
    { name: 'elbowR', parent: 'shoulderR', pos: [-0.11, 0.61, -0.30] },
    { name: 'handR', parent: 'elbowR', pos: [-0.01, 0.42, -0.33] },
    { name: 'clawR', parent: 'handR', pos: [0.05, 0.33, -0.32] },
    // ---- LEFT leg (+z) ----
    { name: 'thighL', parent: 'hips', pos: [-0.02, 0.55, 0.13] },
    { name: 'kneeL', parent: 'thighL', pos: [-0.01, 0.37, 0.15] },
    { name: 'ankleL', parent: 'kneeL', pos: [-0.02, 0.05, 0.18], bias: 0.85 },
    { name: 'footL', parent: 'ankleL', pos: [0.13, 0.02, 0.19] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [-0.03, 0.55, -0.14] },
    { name: 'kneeR', parent: 'thighR', pos: [0.00, 0.37, -0.17] },
    { name: 'ankleR', parent: 'kneeR', pos: [-0.03, 0.04, -0.19], bias: 0.85 },
    { name: 'footR', parent: 'ankleR', pos: [0.13, 0.02, -0.19] },
  ],
};
