// KONGA custom rig — a hand-placed skeleton for mech_konga.glb, a knuckle-
// walking cyborg gorilla. The Tripo auto-rig is usable for LOCOMOTION (it
// found both long arm chains and both short leg chains, which is why the
// knuckle-walk worked on it) but it has no bone for anything that makes him
// KONGA: the whole upper body — skull, jaw, brow ridge and BOTH shoulder
// missile pods — is one 14k-vertex lump on `tripo0_Right_Limb_0`. So the face
// could not emote and the launchers could not aim; the engine drives all five
// of those on the procedural body and had nothing to drive here.
//
// This rig gives them real bones, and the proximity re-skin (reskin.js)
// redraws the weights around them.
//
// Positions are MESH-LOCAL (raw GLB bind space), measured off the model:
//   +x FORWARD (face, knuckles)   +y UP   +z LEFT / -z RIGHT
// The manifest's `yawOffset: 270` is what turns that into the game frame.
// Feature positions came from slicing the bind geometry (pods centre on
// y 0.93 / |z| 0.22, the muzzle mass runs x 0.12→0.27 at y 0.74→0.83, the
// brow ridge sits at x 0.14 / y 0.88).
//
// `skinSpan: 'child'` — each bone owns the slice BELOW it (shoulder→elbow is
// the upper arm), which is the slice three.js actually pivots about that bone.
// He bends hard at the elbow on every knuckle-step, so he needs the correct
// spans rather than the legacy 'parent' ones.
//
// Bones that are NOT game joints:
//   jaw / snout      the lower muzzle, hinged so jaw.rotation.x OPENS the mouth
//   browL / browR    the brow ridge — the readable half of a gorilla's face
//   podL / podR      the shoulder missile launchers (aimed by SIGNATURES.konga)
//   fistL / fistR    knuckle tips, so the hands have a span to reach along
//   crest            the sagittal crest, so the skull keeps its silhouette
export const KONGA_RIG = {
  skinSpan: 'child',
  bones: [
    // ---- spine ---- hips carry the pelvis, torso the barrel chest
    { name: 'hips', parent: null, pos: [-0.12, 0.37, 0], bias: 0.95 },
    { name: 'torso', parent: 'hips', pos: [-0.02, 0.60, 0], bias: 0.95 },
    { name: 'head', parent: 'torso', pos: [0.02, 0.83, 0], bias: 1.0 },
    { name: 'crest', parent: 'head', pos: [-0.06, 0.90, 0] },
    // the JAW pivots at the back of the muzzle so the mass hanging FORWARD of
    // it swings down and open; `snout` gives that span something to reach to.
    { name: 'jaw', parent: 'head', pos: [0.12, 0.785, 0], bias: 0.8 },
    { name: 'snout', parent: 'jaw', pos: [0.24, 0.775, 0], bias: 0.8 },
    // brow ridges, one per eye. Tuned by measurement: this owns ~400-600 verts
    // each, which IS the ridge. Wider (bias 0.3) and a brow takes the cranium
    // with it so a furrow warps the skull; narrower (2.2) and it owns nothing.
    { name: 'browL', parent: 'head', pos: [0.15, 0.882, 0.055], bias: 0.55 },
    { name: 'browR', parent: 'head', pos: [0.15, 0.882, -0.055], bias: 0.55 },
    // ---- SHOULDER MISSILE PODS ---- high and BEHIND the shoulders.
    // Each pod needs a TIP child: with skinSpan 'child' a leaf bone only gets a
    // POINT to compete with, and the torso->pod span then runs straight through
    // the launcher box and wins the whole thing (measured: pods owned 0 verts).
    // The tip gives each pod a span along its own box, front to back.
    // NOTE on `bias`: reskin scores d = dist^2 * bias, so bias BELOW 1 widens a
    // bone's win radius and above 1 narrows it. These sit at 1.0 — the tip span
    // already covers the box, and widening further would eat the back plate.
    { name: 'podL', parent: 'torso', pos: [-0.200, 0.930, 0.235], bias: 1.0 },
    { name: 'podTipL', parent: 'podL', pos: [0.030, 0.930, 0.235], bias: 1.0 },
    { name: 'podR', parent: 'torso', pos: [-0.205, 0.930, -0.220], bias: 1.0 },
    { name: 'podTipR', parent: 'podR', pos: [0.025, 0.930, -0.220], bias: 1.0 },
    // ---- LEFT arm (+z) ---- the long knuckle-walking forelimb
    { name: 'shoulderL', parent: 'torso', pos: [-0.03, 0.755, 0.185], bias: 0.85 },
    { name: 'elbowL', parent: 'shoulderL', pos: [0.05, 0.472, 0.345] },
    { name: 'handL', parent: 'elbowL', pos: [0.215, 0.180, 0.352] },
    { name: 'fistL', parent: 'handL', pos: [0.30, 0.055, 0.350] },
    // ---- RIGHT arm (-z) ---- the fully cybernetic one
    { name: 'shoulderR', parent: 'torso', pos: [-0.03, 0.755, -0.175], bias: 0.85 },
    { name: 'elbowR', parent: 'shoulderR', pos: [0.017, 0.412, -0.352] },
    { name: 'handR', parent: 'elbowR', pos: [0.165, 0.170, -0.350] },
    { name: 'fistR', parent: 'handR', pos: [0.26, 0.050, -0.348] },
    // ---- LEFT leg (+z) ---- short, bowed, tucked under the hips
    { name: 'thighL', parent: 'hips', pos: [-0.160, 0.340, 0.170] },
    { name: 'kneeL', parent: 'thighL', pos: [-0.190, 0.150, 0.212] },
    { name: 'ankleL', parent: 'kneeL', pos: [-0.225, 0.055, 0.200] },
    { name: 'footL', parent: 'ankleL', pos: [-0.130, 0.012, 0.235] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [-0.100, 0.340, -0.160] },
    { name: 'kneeR', parent: 'thighR', pos: [-0.112, 0.145, -0.172] },
    { name: 'ankleR', parent: 'kneeR', pos: [-0.180, 0.050, -0.195] },
    { name: 'footR', parent: 'ankleR', pos: [-0.030, 0.010, -0.195] },
  ],
};
