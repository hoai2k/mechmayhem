// TRITONE custom rig — a hand-placed skeleton for mech_tritone.glb, a
// cybernetic ceratopsian gun platform. Tripo's prerigcheck called this model
// `others` (not a biped) and the forced biped rig, while usable for walking,
// splits the body across chains that mean nothing: one rear leg has three
// links and the other two, the frill and the flank cannons ride bones that
// also carry chunks of hide, and there is no jaw or brow at all.
//
// The engine drives NINE non-joint parts on the procedural Tritone — jaw,
// both brows, the frill, both flank cannons and a three-segment tail — and had
// bones for none of them here. This rig gives every one a real bone and lets
// the proximity re-skin (reskin.js) redraw the weights from scratch.
//
// Positions are MESH-LOCAL (raw GLB bind space), read off the model:
//   +x FORWARD (beak, horns)   +y UP   +z LEFT / -z RIGHT
// The manifest's `yawOffset: 270` turns that into the game frame. Note how
// FLAT he is: the whole body spans y 0 → 0.40 while running x -0.5 → +0.5.
// That is the shape, not an error — he is a long low bridge on four columns.
//
// `skinSpan: 'child'` — a bone owns the slice beyond it, which is what makes
// a columnar leg bend at the right place.
//
// Bones that are NOT game joints:
//   jaw / beak         the lower jaw, hinged so jaw.rotation.x opens it
//   browL / browR      the bony eye ridges
//   frill              the neck shield + its rocket-tube crown (flares on a
//                      brace, jams forward as a shield on a charge)
//   cannonL / cannonR  the flank cannon assemblies (+ barrel tips to span along)
//   tail0..tail2       the armoured tail — driven by the gait's own tail layer
export const TRITONE_RIG = {
  skinSpan: 'child',
  bones: [
    // ---- spine ---- a rigid weight-bearing bridge, hips at the back
    { name: 'hips', parent: null, pos: [-0.06, 0.235, 0], bias: 1.0 },
    { name: 'torso', parent: 'hips', pos: [0.10, 0.275, 0], bias: 1.0 },
    { name: 'head', parent: 'torso', pos: [0.275, 0.225, 0], bias: 0.9 },
    // ---- FACE ---- the jaw pivots behind the beak so the mass forward of it
    // swings open; `beak` gives that span its reach.
    { name: 'jaw', parent: 'head', pos: [0.375, 0.140, 0], bias: 0.8 },
    { name: 'beak', parent: 'jaw', pos: [0.470, 0.115, 0], bias: 0.8 },
    // The brows sit OUT at the eyes rather than up by the frill base: at the
    // midline the frill's own (deliberately wide) span wins everything, so a
    // brow parked there owned nothing at all. Measured: 0.28 gave each brow
    // 3100+ verts (most of the skull), 2.4 gave none; out here at 0.85 they
    // take the bony ridge over the eye and stop.
    { name: 'browL', parent: 'head', pos: [0.360, 0.205, 0.108], bias: 0.85 },
    { name: 'browR', parent: 'head', pos: [0.360, 0.205, -0.108], bias: 0.85 },
    // ---- FRILL ---- the big shield above and behind the skull, rimmed with
    // rocket tubes. `bias` scores d = dist^2 * bias, so BELOW 1 widens the win
    // radius: the frill is one big plate and wants a wide one to take it whole.
    // Same leaf problem as konga's pods: the frill needs a TIP so it owns a
    // span up its own plate rather than a bare point (it owned 0 verts as a
    // leaf). Root at the base of the shield, tip at the rocket-tube crown.
    { name: 'frill', parent: 'head', pos: [0.315, 0.235, 0], bias: 0.75 },
    { name: 'frillTip', parent: 'frill', pos: [0.338, 0.392, 0], bias: 0.75 },
    // ---- FLANK CANNONS ---- housing on the body, barrel reaching forward
    { name: 'cannonL', parent: 'torso', pos: [0.110, 0.215, 0.150], bias: 0.9 },
    { name: 'barrelL', parent: 'cannonL', pos: [0.300, 0.190, 0.225], bias: 0.9 },
    { name: 'cannonR', parent: 'torso', pos: [0.110, 0.215, -0.150], bias: 0.9 },
    { name: 'barrelR', parent: 'cannonR', pos: [0.300, 0.190, -0.230], bias: 0.9 },
    // ---- FRONT legs = the ARM joints (the quadruped convention fenrir uses)
    { name: 'shoulderL', parent: 'torso', pos: [0.242, 0.222, 0.116], bias: 0.85 },
    { name: 'elbowL', parent: 'shoulderL', pos: [0.215, 0.121, 0.108] },
    { name: 'handL', parent: 'elbowL', pos: [0.262, 0.042, 0.096] },
    { name: 'toeL', parent: 'handL', pos: [0.290, 0.008, 0.096] },
    { name: 'shoulderR', parent: 'torso', pos: [0.242, 0.222, -0.119], bias: 0.85 },
    { name: 'elbowR', parent: 'shoulderR', pos: [0.215, 0.121, -0.115] },
    { name: 'handR', parent: 'elbowR', pos: [0.262, 0.042, -0.103] },
    { name: 'toeR', parent: 'handR', pos: [0.290, 0.008, -0.103] },
    // ---- REAR legs = the LEG joints ---- columnar, straight under the hips
    { name: 'thighL', parent: 'hips', pos: [-0.055, 0.238, 0.100] },
    { name: 'kneeL', parent: 'thighL', pos: [-0.040, 0.130, 0.115] },
    { name: 'ankleL', parent: 'kneeL', pos: [-0.035, 0.045, 0.115] },
    { name: 'hoofL', parent: 'ankleL', pos: [-0.010, 0.008, 0.115] },
    { name: 'thighR', parent: 'hips', pos: [-0.055, 0.238, -0.103] },
    { name: 'kneeR', parent: 'thighR', pos: [-0.040, 0.130, -0.118] },
    { name: 'ankleR', parent: 'kneeR', pos: [-0.035, 0.045, -0.118] },
    { name: 'hoofR', parent: 'ankleR', pos: [-0.010, 0.008, -0.118] },
    // ---- TAIL ---- three segments running back and down, driven by the
    // gait's tail layer (GAITS.trike.tail) exactly as fenrir's blade is
    { name: 'tail0', parent: 'hips', pos: [-0.110, 0.222, 0], bias: 0.9 },
    { name: 'tail1', parent: 'tail0', pos: [-0.223, 0.171, 0], bias: 0.9 },
    { name: 'tail2', parent: 'tail1', pos: [-0.352, 0.113, 0], bias: 0.9 },
    { name: 'tailTip', parent: 'tail2', pos: [-0.480, 0.090, 0], bias: 0.9 },
  ],
};
