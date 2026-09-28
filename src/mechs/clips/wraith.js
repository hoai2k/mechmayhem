// WRAITH's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.

// WRAITH — HE JUST GETS BIGGER, and then he comes apart into bats. THE GROWTH
// IS THE EFFECT (`tauntGrow`, fighter.js growTaunt — the render group, the
// combat radius/height, and Animator.sizeMul with them), so the pose's whole
// job is to not get in its way: he draws himself up, tips a little forward onto
// you, and holds it. The cloak takes a wind for the duration and the hood stays
// on your face; the exit is the giant being replaced by the mech on one frame,
// with the bats carrying the apparition away.
//
// IT IS TWO KEYS, AND IT USED TO BE FIVE. The earlier version arrived at the
// draw-up and then kept going — the spine curling to 46°, the hips to 14, the
// arms closing down and around, "a loom is a thing that keeps arriving". The
// owner's call is that it isn't: a body that goes on folding forward while it
// scales is TWO effects competing for the same silhouette, and the one you can
// actually read at arena distance is the size. So the deepening keys are gone.
// He reaches the drawn-up lean (a 10.4° tip at the hips against a 5° torso
// counter, so the spine carries about 5° of forward — a lean, not a fold) and
// STAYS THERE for the remaining second and a half while the growth does the
// work.
//
// IT DOES NOT UNWIND, and that survives the trim. Every other taunt here ends
// on REST_FULL; this one simply has no key after the one it reaches, so the
// held pose runs to the last frame. The exit is not the body relaxing — a key
// easing him back to rest would play a huge ghost standing up straight first.
//
// WHICH WAY IS FORWARD (`tools/scratch/leansign.mjs`): POSITIVE torso pitch and
// POSITIVE hipsRot both tip a mech FORWARD, onto its own facing, and the head
// counters with a NEGATIVE value to lift the face back up. That is the rule on
// every rig; there is no per-mech sign to look up.
//
// MEASURE A BONE ABOVE THE PIVOT. An early pass measured his HANDS and
// concluded the opposite — `torso: [25,0,0]` walked them from z +0.4 to z -0.2,
// which looks exactly like the top of the body going backward. It isn't: a
// rotation about the torso joint carries everything ABOVE it forward and
// everything BELOW it back, and his hands hang at y 2.5 under a torso joint at
// y 4.8. So the sign came out inverted and he leaned away from you for a whole
// release. Read the HEAD (or the hood), never a hanging limb.
// THE HOLD IS THE ONLY PART THAT SHORTENED. He reaches the drawn-up lean at
// 1.396s and the rest of the clip is him standing in it; `dur` 2.9 spent 1.504s
// there, which is a long time to look at a pose that has stopped changing. It
// is 0.902s now — 40% off the PAUSE, with the draw-up itself untouched, because
// the rise is the part that is still moving and cutting into it would only make
// the growth snap. Everything else is timed off this: the fighter reads `dur`
// for when to hand over, so the dispersal simply arrives sooner.
export const WRAITH_TAUNT = {
  dur: 2.3, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // drawing himself UP and slightly OVER you — chin lifting, arms opening,
    // the hips carrying the forward tip. Held from here to the last frame.
    { t: 1.3964, ease: 'outCubic', pose: { hipsPos: [0, 0.12, 0], hipsRot: [10.37, 1.65, -0.1],
      torso: [-5, 0, 0], head: [-8, 0, 0],
      shoulderL: [-16, 0, -42], elbowL: [-30, 0, 0], shoulderR: [-16, 0, 42], elbowR: [-30, 0, 0] } },
  ],
  events: [{ t: 0.1, type: 'sfx', arg: 'cloak' }, { t: 0.55, type: 'sfx', arg: 'powerup' }],
};
