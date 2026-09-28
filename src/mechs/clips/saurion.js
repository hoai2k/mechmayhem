// SAURION's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.

// SAURION for the GLB: this model's arms are SHORT next to its long skull and
// deep chest, so the shared raptor forms — authored against the procedural
// body's reach — land well behind the enemy. Measured against a target at the
// light move's own range (3.5), the claw rakes stopped ~1.8 units short: the
// jaws arrived, the claws swiped the air in front of his own chest.
// Both variants below drive the strike THROUGH the target instead of across
// the body: the shoulder opens to nearly straight-out, the elbow extends at
// the impact frame instead of staying folded, and the hips shift forward so
// the whole frame commits to the reach. Chamber and recovery are untouched, so
// the rake still reads as a rake.
export const SAURION_CLAW_R_GLB = {
  dur: 0.46,
  keys: [
    { t: 0, pose: {} },
    { t: 0.12, ease: 'outCubic', pose: { torso: [6, -12, 0], head: [-4, 8, 0], hipsRot: [0, -10, 0], hipsPos: [0, -0.08, -0.1], shoulderR: [-76, 26, 24], elbowR: [-78, 0, 0], handR: [-18, 0, -14], shoulderL: [-30, 0, -8], elbowL: [-58, 0, 0] } },
    { t: 0.22, ease: 'outBack', pose: { torso: [-8, 10, 0], head: [10, -12, 0], hipsRot: [0, 12, 0], hipsPos: [0, 0.02, 0.46], shoulderR: [-100, -6, 6], elbowR: [-6, 0, 0], handR: [-4, 0, -6], shoulderL: [-52, 0, -10], elbowL: [-34, 0, 0] } },
    { t: 0.33, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0.16], shoulderR: [-70, -24, 0], elbowR: [-28, 0, 0], handR: [10, 0, -8] } },
    { t: 0.46, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0] } },
  ],
  events: [{ t: 0.16, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 1 }],
};

// The sickle kicks already arrived at range, but with the leg still folded —
// the toe-claw got there and the shin didn't. Straighten the knee through the
// snap and drive the hips forward with it, so the kick reads as full-stretch
// and the claw carries past the target instead of stopping on it.
export const SAURION_KICK1_GLB = {
  strikeLimb: 'footR',
  dur: 0.5,
  keys: [
    { t: 0, pose: {} },
    { t: 0.12, ease: 'outCubic', pose: { torso: [4, -6, 0], head: [-2, 4, 0], hipsPos: [0, -0.14, -0.1], hipsRot: [0, -8, 0], thighR: [-62, 0, -4], kneeR: [38, 0, 0], ankleR: [-12, 0, 0], shoulderL: [-40, 0, -10], elbowL: [-66, 0, 0], handL: [30, 0, 10], shoulderR: [-26, 0, 10], elbowR: [-56, 0, 0], handR: [26, 0, -10] } },
    { t: 0.22, ease: 'outBack', pose: { torso: [-20, 6, 0], head: [16, -4, 0], hipsPos: [0, 0.04, 0.6], hipsRot: [0, 6, 0], thighR: [-64, 0, -8], kneeR: [-72, 0, 0], ankleR: [64, 0, 0], shoulderL: [-56, 0, -12], elbowL: [-30, 0, 0], shoulderR: [-46, 0, 12], elbowR: [-34, 0, 0] } },
    { t: 0.32, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0.18], thighR: [-48, 0, -6], kneeR: [-46, 0, 0], ankleR: [42, 0, 0] } },
    { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10] } },
  ],
  events: [{ t: 0.18, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 0 }],
};

// left eagle kick — written out rather than mirrorRaw'd off kick1 because it
// carries its OWN timing and combo index (dur 0.52, hit arg 1), and mirrorRaw
// copies `events` and key times through verbatim
export const SAURION_KICK2_GLB = {
  strikeLimb: 'footL',
  dur: 0.52,
  keys: [
    { t: 0, pose: {} },
    { t: 0.12, ease: 'outCubic', pose: { torso: [4, 6, 0], head: [-2, -4, 0], hipsPos: [0, -0.14, -0.1], hipsRot: [0, 8, 0], thighL: [-52, 0, 4], kneeL: [34, 0, 0], ankleL: [-12, 0, 0], shoulderR: [-40, 0, 10], elbowR: [-66, 0, 0], handR: [30, 0, -10], shoulderL: [-26, 0, -10], elbowL: [-56, 0, 0], handL: [26, 0, 10] } },
    { t: 0.24, ease: 'outBack', pose: { torso: [-20, -6, 0], head: [16, 4, 0], hipsPos: [0, 0.04, 0.4], hipsRot: [0, -6, 0], thighL: [-66, 0, 8], kneeL: [-86, 0, 0], ankleL: [68, 0, 0], shoulderR: [-56, 0, 12], elbowR: [-30, 0, 0], shoulderL: [-46, 0, -12], elbowL: [-34, 0, 0] } },
    { t: 0.34, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0.18], thighL: [-46, 0, 6], kneeL: [-58, 0, 0], ankleL: [46, 0, 0] } },
    { t: 0.52, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10] } },
  ],
  events: [{ t: 0.2, type: 'sfx', arg: 'whoosh' }, { t: 0.24, type: 'hit', arg: 1 }],
};

// SAURION — SOMETHING REGISTERS. He STOPS, stands up out of the hunt crouch and
// snatches both claws up under his chin, freezes there, takes a sniff of the
// air, then turns his skull hard to one side, all the way across to the other,
// and back to centre — holding still for half a second at every one of those.
// It is a LISTENING animal rather than a jeering one, which is the point: run
// together the same poses are a nervous tic, and the pauses are what make it a
// predator working out where you are.
//
// THIS CLIP IS THE OWNER'S, exported from the pose workbench key by key, and it
// is written out flat FOR THAT REASON. It was generated from a table for one
// release — which is the right shape while the rhythm is still being dialled in
// — and the moment the poses and the timings started coming back hand-tuned
// (the sniff that now comes down in two stages, the tail lopped off) a
// generator stopped saving work and started standing between the workbench and
// the file. A flat key list is a paste; a generator is a re-derivation.
//
// THE ALERT is the owner's pose too: both claws snatched up under the chin, the
// right one curled, the skull cocked over. Arms are ABSOLUTE, so these land the
// same whatever the spine is doing; the head is additive over restPose, so
// [2.2, 4.32, 6.94] is a small cock off his own resting carriage and doubles as
// the CENTRE the scan swings either side of.
export const SAURION_ALERT = {
  shoulderR: [-91.74, -8.84, 16.74], shoulderL: [-79.6, 9.41, -3.18],
  elbowR: [-80.97, 11.21, -38.58], elbowL: [-86.44, -0.01, 28.22],
  handR: [35.16, 18.79, 1.76],
};

export const SAURION_ALERT_HEAD = [2.2, 4.32, 6.94];

// WHICH WAY IS LEFT, and which way is UP — measured on his own snout rather
// than guessed (tripoHead_4 in the mech's own frame, where -x is his left):
// head yaw -90 takes the snout to x -1.12, +90 to +0.83, so NEGATIVE YAW IS
// HIS LEFT; head pitch -20 lifts the snout 4.81 -> 5.06, so NEGATIVE PITCH IS
// NOSE UP, which is what a sniff is.
//
// IT ENDS ON THE HOLD, with no key easing him back to rest — the owner cut the
// second sniff and the relax. So the arms stay in the alert tuck to the last
// frame (a track a key is silent about keeps its last value) and the crossfade
// out of the clip is what puts him down, which is the same way wraith's loom
// ends.
// SAURION's VICTORY — the shared one is a fist punched up over the head, which
// on a raptor is the one thing his forelimbs cannot do: the arm goes back over
// his own skull and the claws end up behind him (measured -0.09 of body height
// behind the shoulder, in the chest's own frame). So he wins the way he hunts.
// He rears up out of the hunting pitch, throws his head back and SHRIEKS
// twice, with the claws held exactly where his taunt holds them — up under the
// chest, in front — snapping once on each cry. Leg/torso/head values are
// deltas over his raptor rest pose; arm values are absolute.
export const SAURION_SNAP = {
  shoulderR: [-104, -9, 17], shoulderL: [-94, 9, -3],
  elbowR: [-58, 11, -39], elbowL: [-62, 0, 28],
  handR: [40, 19, 2], handL: [40, -19, -2],
};

export const SAURION_VICTORY = {
  dur: 2.6, hold: true,
  keys: [
    { t: 0, pose: {} },
    // up out of the crouch, claws to the alert carry (his rest is a 27 degree
    // forward pitch, so -34 stands him just past upright)
    { t: 0.4, ease: 'outBack', pose: { torso: [-34, 0, 0], head: [8, 0, 0], hipsPos: [0, 0.3, 0],
      thighL: [24, 0, 6], thighR: [20, 0, -6], kneeL: [-46, 0, 0], kneeR: [-40, 0, 0],
      ankleL: [22, 0, 0], ankleR: [18, 0, 0], ...SAURION_ALERT, handL: [35, -19, -2] } },
    // FIRST CRY — head thrown back, claws snap out and open
    { t: 0.72, ease: 'outCubic', pose: { torso: [-40, 0, 0], head: [34, 0, 0], ...SAURION_SNAP } },
    { t: 1.06, ease: 'inOutQuad', pose: { torso: [-34, 0, 0], head: [8, 0, 0],
      ...SAURION_ALERT, handL: [35, -19, -2] } },
    // …and again, harder
    { t: 1.42, ease: 'outCubic', pose: { torso: [-42, 0, 0], head: [40, 0, 0], ...SAURION_SNAP } },
    { t: 1.86, ease: 'inOutQuad', pose: { torso: [-34, 0, 0], head: [6, 0, 0],
      ...SAURION_ALERT, handL: [35, -19, -2] } },
    // held: standing tall over the kill, claws up
    { t: 2.6, ease: 'inOutQuad', pose: { torso: [-32, 0, 0], head: [2, 0, 0], hipsPos: [0, 0.26, 0] } },
  ],
  events: [{ t: 0.4, type: 'sfx', arg: 'powerup' }, { t: 0.72, type: 'sfx', arg: 'howl' },
    { t: 1.42, type: 'sfx', arg: 'howl' }],
};

export const SAURION_TAUNT = {
  dur: 4.48, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // HE HEARS SOMETHING — additive over restPose, which is why the torso key
    // is a big negative: his rest IS a 27 degree forward pitch, so -30 stands
    // him just past upright. The arms arrive on an outBack, so the snatch under
    // the chin overshoots and settles.
    { t: 0.20, ease: 'outBack', pose: { torso: [-30, 0, 0], head: SAURION_ALERT_HEAD, hipsPos: [0, 0.26, 0],
      thighL: [22, 0, 6], thighR: [18, 0, -6], kneeL: [-44, 0, 0], kneeR: [-38, 0, 0],
      ankleL: [20, 0, 0], ankleR: [17, 0, 0], ...SAURION_ALERT } },
    { t: 0.34, ease: 'linear', pose: { head: SAURION_ALERT_HEAD } },
    { t: 0.84, ease: 'linear', pose: { torso: [-30, 0, 0], head: SAURION_ALERT_HEAD } },
    // the sniff — nose up, then down in TWO stages: a quick drop most of the
    // way and a slow one the rest, which is a nose settling rather than a head
    // snapping back
    { t: 1.00, ease: 'outQuad', pose: { torso: [-24.45, -3.05, 0.3], head: [-20.79, 10.85, 0.25] } },
    { t: 1.1802, ease: 'inQuad', pose: { torso: [-35.93, -4.15, -0.47], head: [-14.97, 8.77, -1.58] } },
    { t: 1.66, ease: 'linear', pose: { torso: [-35.93, -4.15, -0.47], head: [4.42, 8.87, -0.76] } },
    // THE SCAN. Each look is a real three-axis pose — pitched down and rolled
    // over as it turns, which is how an animal points an eye at something — and
    // each one OVERSHOOTS and settles back a few degrees, so the head arrives
    // rather than stops. Then it HOLDS, which is the half-second that makes the
    // difference between a scan and a twitch.
    { t: 1.96, ease: 'outQuad', pose: { torso: [-30, -5, 0], head: [-40.39, -70.41, -62.43] } },
    { t: 2.10, ease: 'linear', pose: { head: [-26.62, -62.52, -54.86] } },
    { t: 2.60, ease: 'linear', pose: { torso: [-30, -5, 0], head: [-26.62, -62.52, -54.86] } },
    // all the way across — the long sweep, and the only slow move in the clip
    { t: 3.04, ease: 'inOutQuad', pose: { torso: [-30, 5, 0], head: [-91.58, 58.51, 109.4] } },
    { t: 3.18, ease: 'linear', pose: { head: [-57.23, 59.9, 66.9] } },
    { t: 3.68, ease: 'linear', pose: { torso: [-30, 5, 0], head: [-57.23, 59.9, 66.9] } },
    // …and home
    { t: 3.98, ease: 'inOutQuad', pose: { torso: [-30, 0, 0], head: [4.61, 6.85, -1.35] } },
    { t: 4.48, ease: 'linear', pose: { torso: [-30, 0, 0], head: [4.61, 6.85, -1.35] } },
  ],
  events: [{ t: 0.20, type: 'sfx', arg: 'taunt' }, { t: 3.98, type: 'sfx', arg: 'howl' }],
};
