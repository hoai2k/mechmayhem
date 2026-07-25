// FENRIR custom rig — a clean hand-placed skeleton for mech_fenrir.glb, a
// digitigrade werewolf biped. The Tripo auto-rig it replaces was unusable: the
// legs had NO chain below the hip (kneeL/ankleR both pointed at bone_32, and
// bone_32/33/34 are zero-weight junk bones sticking out in front of the model),
// so both legs were one rigid lump and 60 hand-written skinOps were patching
// the fallout. This rig gives every limb a real chain and lets the proximity
// re-skin (reskin.js) redraw the weights from scratch.
//
// Positions are MESH-LOCAL (raw GLB bind space): +x FORWARD (snout/toes),
// +y UP, +z LEFT / -z RIGHT. NOTE: this model's lateral centre line is
// z = +0.07, not 0 — every left/right pair below is mirrored about that, not
// about zero. Measured off the bind point cloud (feet at z 0.25 / -0.11,
// shoulders at z 0.255 / -0.115). Tune live in ?rigedit=fenrir.
//
// `skinSpan: 'child'`: each bone owns the limb slice BELOW it (shoulder→elbow
// is the upper arm, knee→hock is the shin), which is the slice three.js
// actually pivots around that bone. See reskin.js — the default 'parent'
// spans put the upper arm on `elbow`, so a bent elbow swings the whole upper
// arm off the shoulder. Fenrir bends hard (combatPose elbows sit at −56°, the
// quad lope folds both legs), so he gets the correct spans; the older rigs
// keep the legacy ones their bias values are tuned against.
//
// Bones that are NOT game joints (crest, snout, clawL/R, footL/R, tail0..5)
// are static: a bone with no animation of its own transforms exactly like its
// nearest animated ancestor, so they change nothing about how the mesh moves.
// The tip bones are there to give the last driven joint of each chain a span
// to reach along — `crest`/`snout` are what let the head hold the skull and
// muzzle, `claw*` the talons, `footL/R` the paws. The `tail*` chain is the one
// that owns real geometry: without it the blade-tail sweeping down past the
// right leg gets welded to that leg and kicks with every step.
export const FENRIR_RIG = {
  skinSpan: 'child',
  bones: [
    // ---- spine ---- (torso sits low, at the waist, so the belly rides the
    //      hips and the whole chest+neck column rides the torso)
    { name: 'hips', parent: null, pos: [0.05, 0.52, 0.07], bias: 0.9 },
    { name: 'torso', parent: 'hips', pos: [0.07, 0.665, 0.07], bias: 0.9 },
    { name: 'head', parent: 'torso', pos: [0.05, 0.845, 0.07], bias: 1.1 },
    { name: 'crest', parent: 'head', pos: [0.05, 0.985, 0.07] },
    { name: 'snout', parent: 'head', pos: [0.24, 0.85, 0.07] },
    // ---- LEFT arm (+z) ---- hangs nearly straight down, claw at thigh height
    { name: 'shoulderL', parent: 'torso', pos: [0.055, 0.765, 0.255], bias: 0.85 },
    { name: 'elbowL', parent: 'shoulderL', pos: [0.033, 0.61, 0.298] },
    { name: 'handL', parent: 'elbowL', pos: [0.105, 0.44, 0.315] },
    { name: 'clawL', parent: 'handL', pos: [0.115, 0.365, 0.305] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [0.055, 0.765, -0.115], bias: 0.85 },
    { name: 'elbowR', parent: 'shoulderR', pos: [0.033, 0.61, -0.158] },
    { name: 'handR', parent: 'elbowR', pos: [0.105, 0.44, -0.175] },
    { name: 'clawR', parent: 'handR', pos: [0.115, 0.365, -0.165] },
    // ---- LEFT leg (+z) ---- digitigrade: knee forward (x 0.105), hock BACK
    //      (x 0.038), paw forward again. `ankle` is the hock, matching the
    //      procedural DIGITIGRADE_REST the retarget captures against.
    { name: 'thighL', parent: 'hips', pos: [0.078, 0.50, 0.168] },
    { name: 'kneeL', parent: 'thighL', pos: [0.105, 0.37, 0.195] },
    { name: 'ankleL', parent: 'kneeL', pos: [0.038, 0.215, 0.20] },
    { name: 'footL', parent: 'ankleL', pos: [0.115, 0.045, 0.245] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [0.078, 0.50, -0.028] },
    { name: 'kneeR', parent: 'thighR', pos: [0.105, 0.37, -0.055] },
    { name: 'ankleR', parent: 'kneeR', pos: [0.038, 0.215, -0.06] },
    { name: 'footR', parent: 'ankleR', pos: [0.115, 0.045, -0.105] },
    // ---- tail: a long blade that leaves the pelvis, sweeps back and down and
    //      curls around the RIGHT leg to the floor (traced off the point cloud)
    { name: 'tail0', parent: 'hips', pos: [-0.06, 0.505, 0.06] },
    { name: 'tail1', parent: 'tail0', pos: [-0.145, 0.425, 0.036] },
    { name: 'tail2', parent: 'tail1', pos: [-0.21, 0.32, -0.05] },
    { name: 'tail3', parent: 'tail2', pos: [-0.225, 0.24, -0.20] },
    { name: 'tail4', parent: 'tail3', pos: [-0.155, 0.165, -0.30] },
    { name: 'tail5', parent: 'tail4', pos: [-0.03, 0.075, -0.31] },
  ],
};
