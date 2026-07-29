// JERRY custom rig — a hand-placed skeleton for mech_jerry_alt.glb, the
// OFFICIAL/primary Jerry (the old Tripo mech_jerry.glb lives in the `alt` slot).
// A lobster/shrimp: two big front CLAW-ARMS (the pincers) + two back legs, plus
// a segmented tail and antennae on static struts.
//
// FOUR limbs: the two claw-arms carry the game ARM joints (strikers), the two
// back legs carry the game LEG joints (walkers). There is NO separate skeleton
// for the black posts — the back-leg bones are flagged `post`, so the black rod
// renders along the SAME bones that skin + animate the legs (a render-time
// add-on to the leg rig, inseparable from it).
//
// Positions are MESH-LOCAL (raw bind space): +x FORWARD (the claws reach +x),
// +y UP, +z LEFT / -z RIGHT; the tail arches up-back at -x. Positions below are
// the latest ?rigedit=jerry tuning; `post`/`bias` are re-attached here because
// the editor's Export emits only name/parent/pos.
export const JERRY_RIG = {
  bones: [
    // ---- body ----
    { name: 'hips', parent: null, pos: [0.00, 0.48, 0.00], bias: 0.55 },
    { name: 'torso', parent: 'hips', pos: [0.02, 0.60, -0.02], bias: 0.45 },
    { name: 'head', parent: 'torso', pos: [0.22, 0.56, 0.00], bias: 0.9 },
    // ---- LEFT claw-arm (+z) ---- shoulder->elbow->hand->claw pincer tip
    { name: 'shoulderL', parent: 'torso', pos: [-0.12, 0.55, 0.10] },
    { name: 'elbowL', parent: 'shoulderL', pos: [0.04, 0.29, 0.17] },
    { name: 'handL', parent: 'elbowL', pos: [0.21, 0.55, 0.29] },
    { name: 'clawL', parent: 'handL', pos: [0.40, 0.05, 0.38] },
    // ---- RIGHT claw-arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [-0.12, 0.55, -0.10] },
    { name: 'elbowR', parent: 'shoulderR', pos: [0.03, 0.28, -0.18] },
    { name: 'handR', parent: 'elbowR', pos: [0.22, 0.56, -0.31] },
    { name: 'clawR', parent: 'handR', pos: [0.40, 0.04, -0.38] },
    // ---- LEFT back leg (+z) ---- thigh->knee->ankle->foot, `post` on every
    //      segment so the black rod runs straight along the leg bones
    { name: 'thighL', parent: 'hips', pos: [-0.05, 0.52, 0.08], post: true },
    { name: 'kneeL', parent: 'thighL', pos: [-0.24, 0.41, 0.13], post: true },
    { name: 'ankleL', parent: 'kneeL', pos: [-0.38, 0.10, 0.22], post: true },
    { name: 'footL', parent: 'ankleL', pos: [-0.40, 0.04, 0.21], post: true },
    // ---- RIGHT back leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [-0.11, 0.51, -0.07], post: true },
    { name: 'kneeR', parent: 'thighR', pos: [-0.29, 0.41, -0.13], post: true },
    { name: 'ankleR', parent: 'kneeR', pos: [-0.43, 0.09, -0.20], post: true },
    { name: 'footR', parent: 'ankleR', pos: [-0.43, 0.04, -0.20], post: true },
    // ---- static struts: tail over the back + antennae/spare bits ----
    { name: 'tail', parent: 'torso', pos: [-0.10, 0.86, 0.00], bias: 0.7 },
    // The two CANNON PODS. Moved off the mid-struts and up into the barrels
    // themselves (?rigedit=jerry), so the cannon geometry skins to them and a
    // glbanim post hook can swing each pod forward to spit its goo — and the
    // muzzle anchors ride the bone that actually aims (manifest `muzzles`).
    { name: 'strutMidL', parent: 'hips', pos: [0.08, 0.77, 0.32] },
    { name: 'strutMidR', parent: 'hips', pos: [0.07, 0.76, -0.32] },
    { name: 'belly', parent: 'hips', pos: [0.00, 0.47, 0.00] },
  ],
};
