// WRAITH custom rig — a clean hand-placed skeleton for mech_wraith.glb, the
// hooded sniper: a narrow humanoid under a heavy shredded cloak, digitigrade
// legs, and a rifle nearly as long as he is tall carried muzzle-down in one
// hand.
//
// WHY REPLACE THE AUTO-RIG: Tripo's skeleton scattered this model. `hips` and
// `torso` were mapped onto two LIMB roots (tripo0_Left_Limb_0 / _Right_Limb_0),
// the two arm chains came from unrelated bone_N runs, and the cloak+rifle —
// two thirds of the silhouette — were spread over a dozen junk bones with no
// relation to what they hang off. 44 hand-written skinOps were patching the
// fallout and the cloak still tore with every step. This rig gives every part
// a bone that means something and lets the proximity re-skin (reskin.js)
// redraw the weights from scratch. The old rig is kept as the manifest `alt`
// entry (?rigedit=wraith&alt=1 / the pose tool's Compare Alternate GLB) so the
// two can be judged side by side.
//
// SPACE: positions are MESH-LOCAL (raw GLB bind space): +x FORWARD (hood
// point, toes), +y UP, +z the model's LEFT / -z its RIGHT. This model's
// lateral centre line sits at z ≈ -0.05, not 0 — every left/right pair below
// is mirrored about that. Whole model is 1.0 tall in this space. Tune live in
// ?rigedit=wraith.
//
// HANDEDNESS: the rifle is in the model's LEFT hand, so the bones are named
// anatomically (handL holds the gun) and glbanim's wraith profile sets
// `mirrorArms` — the game's right-arm clip tracks play on the left arm with
// yaw/roll mirrored, so the aim/fire motion drives the arm that actually
// holds the rifle. That is strictly better than the old rig, which crossed
// the arm bones (handR ON the gun arm) and got every lateral arm motion
// backwards — the reason its profile needed a hand-written punch fixup.
//
// `skinSpan: 'child'`: each bone owns the slice BELOW it (shoulder→elbow is
// the upper arm), which is the slice three.js actually pivots about that bone.
// See reskin.js.
//
// STATIC BONES (not game joints) hold the geometry the humanoid rig has no
// route for; a bone with no animation of its own transforms exactly like its
// nearest animated ancestor:
//   hood/brow         — the pointed hood, so the head carries it
//   mantleL/mantleR   — the shoulder capes, on the TORSO: they must NOT swing
//                       with the arms (they sit right on top of the deltoids,
//                       so the shoulder spans would otherwise claim them)
//   rifle/rifleButt/rifleTip — the whole gun as one rigid body on handL. The
//                       barrel reaches the floor, which puts its lower half
//                       nearer the LEG bones than the hand: without these it
//                       gets skinned to the shin and the rifle kicks with
//                       every step. rifleTip is the muzzle (manifest muzzles).
//   cape0 + cape{R,MR,ML,L}{1,2,3} — the cloak, four columns of three, hung
//                       off the torso. Same story as the rifle: the drape
//                       wraps outside the legs, so proximity alone welds it to
//                       them. The columns also give the glbanim profile
//                       something to sway (each column lags a little).
//   footL/footR, clawR — the toe splay and the open right hand: tips for the
//                       last driven joint of each chain to reach along.
export const WRAITH_RIG = {
  skinSpan: 'child',
  bones: [
    // ---- spine ---- narrow body under the cloak; the hood sits high and
    //      forward, so `head` gets both an up tip (hood) and a forward one
    //      (brow) or the peak/brim splits onto the shoulders.
    { name: 'hips', parent: null, pos: [0.02, 0.62, -0.06] },
    { name: 'torso', parent: 'hips', pos: [0.01, 0.73, -0.05] },
    { name: 'head', parent: 'torso', pos: [0.00, 0.80, -0.06], bias: 0.85 },
    { name: 'hood', parent: 'head', pos: [-0.01, 0.94, -0.07] },
    // `eye` doubles as the hood's forward span target and the DEATH SWARM
    // flare anchor (contract §5) — the GLB had no eye anchor before, so the
    // ult flared from the mech centre.
    { name: 'eye', parent: 'head', pos: [0.09, 0.86, -0.06] },
    // shoulder capes — torso-borne, so they stay put when the arms swing
    { name: 'mantleL', parent: 'torso', pos: [0.00, 0.80, 0.10], bias: 0.9 },
    { name: 'mantleR', parent: 'torso', pos: [0.00, 0.80, -0.21], bias: 0.9 },

    // ---- LEFT arm (+z) — the GUN arm: tucked in, elbow bent, the rifle
    //      hanging muzzle-down along the leg
    { name: 'shoulderL', parent: 'torso', pos: [0.02, 0.79, 0.055] },
    { name: 'elbowL', parent: 'shoulderL', pos: [0.02, 0.66, 0.125] },
    { name: 'handL', parent: 'elbowL', pos: [0.035, 0.55, 0.185] },
    // the rifle: grip at the hand, butt up past the shoulder, muzzle at the
    // floor. Three bones = two spans that cover the whole length.
    { name: 'rifle', parent: 'handL', pos: [0.05, 0.505, 0.215], bias: 0.8 },
    { name: 'rifleButt', parent: 'rifle', pos: [0.05, 0.80, 0.175], bias: 0.8 },
    { name: 'rifleTip', parent: 'rifle', pos: [0.095, 0.015, 0.295], bias: 0.8 },
    // optics housing — the `scope` anchor of the contract, and a third span
    // for the rifle to hold its upper receiver with
    { name: 'scope', parent: 'rifle', pos: [0.055, 0.70, 0.19], bias: 0.8 },

    // ---- RIGHT arm (-z) — empty hand, hanging open
    { name: 'shoulderR', parent: 'torso', pos: [0.02, 0.80, -0.165] },
    { name: 'elbowR', parent: 'shoulderR', pos: [0.015, 0.665, -0.235] },
    { name: 'handR', parent: 'elbowR', pos: [0.04, 0.55, -0.285] },
    { name: 'clawR', parent: 'handR', pos: [0.06, 0.455, -0.30] },

    // ---- LEFT leg (+z) ---- digitigrade: knee mid-thigh, long foot forward
    //      onto the toes. The ankle used to sit on the HOCK at y 0.155 — a
    //      0.98-unit boot, which had calibrateFeet damping the gait's roll to
    //      0.32 of what it was authored for. At y 0.048 (top of the sole) the
    //      hock is just shin and the roll comes back (tools/ankleprobe.mjs).
    { name: 'thighL', parent: 'hips', pos: [0.02, 0.615, 0.02] },
    { name: 'kneeL', parent: 'thighL', pos: [0.03, 0.44, 0.05] },
    { name: 'ankleL', parent: 'kneeL', pos: [0.03, 0.048, 0.10] },
    { name: 'footL', parent: 'ankleL', pos: [0.11, 0.03, 0.125] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [0.02, 0.615, -0.145] },
    { name: 'kneeR', parent: 'thighR', pos: [0.03, 0.44, -0.165] },
    { name: 'ankleR', parent: 'kneeR', pos: [0.03, 0.048, -0.185] },
    { name: 'footR', parent: 'ankleR', pos: [0.10, 0.03, -0.205] },

    // ---- cloak ---- one attachment at the upper back, then four columns of
    //      three running down and BACK with the drape's flare (it leaves the
    //      shoulders at x≈-0.06 and its fringe hangs at x≈-0.15). Ordered
    //      R (-z) to L (+z).
    { name: 'cape0', parent: 'torso', pos: [-0.06, 0.755, -0.055], bias: 0.85 },
    { name: 'capeR1', parent: 'cape0', pos: [-0.095, 0.55, -0.20], bias: 0.85 },
    { name: 'capeR2', parent: 'capeR1', pos: [-0.135, 0.34, -0.245], bias: 0.85 },
    { name: 'capeR3', parent: 'capeR2', pos: [-0.15, 0.21, -0.265], bias: 0.85 },
    { name: 'capeMR1', parent: 'cape0', pos: [-0.095, 0.55, -0.10], bias: 0.85 },
    { name: 'capeMR2', parent: 'capeMR1', pos: [-0.14, 0.34, -0.125], bias: 0.85 },
    { name: 'capeMR3', parent: 'capeMR2', pos: [-0.155, 0.21, -0.135], bias: 0.85 },
    { name: 'capeML1', parent: 'cape0', pos: [-0.095, 0.55, 0.00], bias: 0.85 },
    { name: 'capeML2', parent: 'capeML1', pos: [-0.14, 0.34, 0.015], bias: 0.85 },
    { name: 'capeML3', parent: 'capeML2', pos: [-0.155, 0.21, 0.025], bias: 0.85 },
    { name: 'capeL1', parent: 'cape0', pos: [-0.095, 0.55, 0.10], bias: 0.85 },
    { name: 'capeL2', parent: 'capeL1', pos: [-0.135, 0.34, 0.135], bias: 0.85 },
    { name: 'capeL3', parent: 'capeL2', pos: [-0.15, 0.21, 0.155], bias: 0.85 },
  ],
};
