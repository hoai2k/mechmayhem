// VIPER custom rig — a clean hand-placed skeleton for mech_viper.glb. Viper is
// the most straightforward humanoid in the roster (biped, two arms, digitigrade
// legs), so a proper skeleton beats the Tripo auto-rig outright: that rig had
// the spine joints scattered across limb chains (hips -> tripo0_Left_Limb_0,
// torso -> tripo0_Right_Limb_0) and needed 60 hand-written skinOps to keep the
// shells on the right limbs. This rig gives every limb a real chain and lets
// the proximity re-skin (reskin.js) redraw all the weights from scratch, so
// both the boneOverrides and the skinOps are gone from the manifest entry.
//
// Positions are MESH-LOCAL (raw GLB bind space): +x FORWARD (chest/toes),
// +y UP (0 = floor, 1 = crown), +z LEFT / -z RIGHT. The model is symmetric
// about z = 0. Tune live in ?rigedit=viper and paste the export back; `bias`
// and `skinSpan` are re-attached here because the editor's Export emits only
// name/parent/pos.
//
// `skinSpan: 'child'`: each bone owns the limb slice BELOW it (shoulder->elbow
// is the upper arm, knee->ankle is the shin), which is the slice three.js
// actually pivots around that bone. See reskin.js. Viper's combatPose folds
// the right elbow to -95 deg and both slashes swing from a deep coil, so the
// correct spans matter more here than on the older rigs.
//
// Bones that are NOT game joints (crest, horn, fingerL/R, toeL/R, heelL/R,
// bladeL/R + their tips) are static: a bone with no animation of its own
// transforms exactly like its nearest animated ancestor, so they change
// nothing about how the mesh moves. Most exist to give the last driven joint
// of a chain a span to reach along.
//
// THE HAND BLADES are the exception — they are load-bearing, not scenery, and
// contract.js declares them (`glbBones`/`glbAnchors` on viper). `bladeL` /
// `bladeR` hang off the ELBOW — the forearm bone, not the hand — so each dagger
// rides its forearm exactly the way the model mounts it, and every blade vertex
// lands on that one bone. That is what makes a dagger DETACHABLE: throwing it
// collapses the bone (Fighter.regrowWeapon), and scale carries down the
// subtree, so the tip bone and the whole blade go with it until it re-forges.
// The `*tip` children double as the mounts for the blade-trail anchors the
// manifest hangs off them.
export const VIPER_RIG = {
  skinSpan: 'child',
  bones: [
    // ---- spine ---- (hips carry the pelvis + waist column, torso the chest
    //      up to the collar; bias<1 so neither loses its middle to a limb)
    { name: 'hips', parent: null, pos: [0.02, 0.60, 0.00], bias: 0.9 },
    { name: 'torso', parent: 'hips', pos: [0.00, 0.70, 0.00], bias: 0.85 },
    { name: 'head', parent: 'torso', pos: [0.02, 0.82, 0.00], bias: 1.05 },
    { name: 'crest', parent: 'head', pos: [0.02, 0.96, 0.00] },   // skull + horn spire
    { name: 'horn', parent: 'head', pos: [-0.10, 0.87, 0.00] },   // back-swept horns
    // ---- LEFT arm (+z) ---- pauldron on the shoulder, dagger off the forearm
    { name: 'shoulderL', parent: 'torso', pos: [0.00, 0.78, 0.12], bias: 0.85 },
    { name: 'elbowL', parent: 'shoulderL', pos: [-0.02, 0.64, 0.18] },
    { name: 'handL', parent: 'elbowL', pos: [0.03, 0.51, 0.23] },
    { name: 'fingerL', parent: 'handL', pos: [0.05, 0.44, 0.27] },
    // left dagger: root at the forearm emitter, tip at the point. bias<1 so the
    // blade wins its own verts outright over the forearm/hand spans beside it
    { name: 'bladeL', parent: 'elbowL', pos: [0.03, 0.47, 0.28], bias: 0.75 },
    { name: 'bladeLtip', parent: 'bladeL', pos: [0.13, 0.18, 0.38] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [0.00, 0.78, -0.12], bias: 0.85 },
    { name: 'elbowR', parent: 'shoulderR', pos: [-0.02, 0.64, -0.18] },
    { name: 'handR', parent: 'elbowR', pos: [0.02, 0.51, -0.25] },
    { name: 'fingerR', parent: 'handR', pos: [0.05, 0.43, -0.27] },
    { name: 'bladeR', parent: 'elbowR', pos: [0.03, 0.47, -0.28], bias: 0.75 },
    { name: 'bladeRtip', parent: 'bladeR', pos: [0.13, 0.18, -0.37] },
    // ---- LEFT leg (+z) ---- digitigrade: the ankle sits high at the back of a
    //      long clawed foot, so toe/heel tips carry the talon and the spur
    { name: 'thighL', parent: 'hips', pos: [0.02, 0.59, 0.07] },
    { name: 'kneeL', parent: 'thighL', pos: [0.02, 0.36, 0.12] },
    { name: 'ankleL', parent: 'kneeL', pos: [-0.01, 0.08, 0.18] },
    { name: 'toeL', parent: 'ankleL', pos: [0.08, 0.02, 0.20] },
    { name: 'heelL', parent: 'ankleL', pos: [-0.09, 0.03, 0.16] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [0.02, 0.59, -0.07] },
    { name: 'kneeR', parent: 'thighR', pos: [0.02, 0.37, -0.12] },
    { name: 'ankleR', parent: 'kneeR', pos: [-0.02, 0.08, -0.19] },
    { name: 'toeR', parent: 'ankleR', pos: [0.08, 0.02, -0.20] },
    { name: 'heelR', parent: 'ankleR', pos: [-0.09, 0.03, -0.16] },
  ],
};
