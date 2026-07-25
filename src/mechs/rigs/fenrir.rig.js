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
// about zero. Tune live in ?rigedit=fenrir; the positions below are the latest
// tuning pass exported from it. `skinSpan` and `bias` are re-attached here
// because the editor's Export emits only name/parent/pos (+ bias/post).
//
// `skinSpan: 'child'`: each bone owns the limb slice BELOW it (shoulder→elbow
// is the upper arm, knee→ankle is the shin), which is the slice three.js
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
    // ---- spine ---- (torso rides high at the chest, so hips carry the whole
    //      pelvis + belly column and torso carries the ribcage up to the neck)
    { name: 'hips', parent: null, pos: [0.05, 0.52, 0.07], bias: 0.9 },
    { name: 'torso', parent: 'hips', pos: [0.07, 0.79, 0.07], bias: 0.9 },
    { name: 'head', parent: 'torso', pos: [0.05, 0.85, 0.07], bias: 1.1 },
    { name: 'crest', parent: 'head', pos: [0.07, 0.93, 0.07] },
    { name: 'snout', parent: 'head', pos: [0.24, 0.85, 0.07] },
    // ---- LEFT arm (+z) ---- hangs nearly straight down, claw at thigh height
    { name: 'shoulderL', parent: 'torso', pos: [0.06, 0.78, 0.23], bias: 0.85 },
    { name: 'elbowL', parent: 'shoulderL', pos: [0.03, 0.63, 0.28] },
    { name: 'handL', parent: 'elbowL', pos: [0.10, 0.46, 0.32] },
    { name: 'clawL', parent: 'handL', pos: [0.12, 0.37, 0.31] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [0.06, 0.78, -0.08], bias: 0.85 },
    { name: 'elbowR', parent: 'shoulderR', pos: [0.03, 0.63, -0.15] },
    { name: 'handR', parent: 'elbowR', pos: [0.10, 0.47, -0.18] },
    { name: 'clawR', parent: 'handR', pos: [0.12, 0.37, -0.17] },
    // ---- LEFT leg (+z) ---- knee forward, ankle low at the back of the paw,
    //      foot forward into the toes: three bends the digitigrade shape reads
    //      through, with the paw itself on `footL`.
    { name: 'thighL', parent: 'hips', pos: [0.08, 0.50, 0.17] },
    { name: 'kneeL', parent: 'thighL', pos: [0.10, 0.31, 0.20] },
    { name: 'ankleL', parent: 'kneeL', pos: [0.07, 0.08, 0.24] },
    { name: 'footL', parent: 'ankleL', pos: [0.13, 0.03, 0.26] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [0.08, 0.50, -0.03] },
    { name: 'kneeR', parent: 'thighR', pos: [0.10, 0.32, -0.05] },
    { name: 'ankleR', parent: 'kneeR', pos: [0.07, 0.07, -0.09] },
    { name: 'footR', parent: 'ankleR', pos: [0.11, 0.03, -0.09] },
    // ---- tail: a long blade that leaves the pelvis, sweeps back and down and
    //      curls around the RIGHT leg to the floor
    { name: 'tail0', parent: 'hips', pos: [-0.06, 0.51, 0.06] },
    { name: 'tail1', parent: 'tail0', pos: [-0.14, 0.43, 0.04] },
    { name: 'tail2', parent: 'tail1', pos: [-0.23, 0.32, -0.04] },
    { name: 'tail3', parent: 'tail2', pos: [-0.22, 0.24, -0.20] },
    { name: 'tail4', parent: 'tail3', pos: [-0.14, 0.18, -0.30] },
    { name: 'tail5', parent: 'tail4', pos: [-0.03, 0.08, -0.31] },
  ],
};
