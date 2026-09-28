// COLOSSUS's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// COLOSSUS for the GLB: a THUNDERCLAP in place of the shared overhead pound.
//
// THIS MODEL is the widest shell on the roster (body.scale 1.3 on top of torsoW
// 1.3 / bulk 1.15), and poundSlam's follow-through — both arms driven from
// overhead down past the hips — dragged its forearms straight THROUGH the chest
// and belly slabs. The clap swings in the HORIZONTAL plane instead: the arms
// stretch out wide to either side of that body on the wind-up, then scythe
// forward and slam shut on the centreline in front of the chest. Nothing crosses
// the torso volume at any point.
//
// GLB-ONLY on purpose. It was posed against these proportions, and the
// PROCEDURAL colossus can't reproduce it: its forearms are shorter, so folding
// them in doesn't buy enough closing distance and the fists stop ~2.0 units apart
// (against 0.86 here) — a two-fisted push, not a clap. That build keeps the
// pound, which suits it and never clipped on it. Both are hand-authored in
// ?debug=pose; see MECH_ART_GUIDE §4 for judging them.
//
// Compiled under the POUND's names below, which is what keeps the charge
// machinery working: def.heavyClip/heavyReleaseClip stay 'poundHold'/'poundSlam',
// so updateHeavyHold's isPlaying check, the mirror alternation and
// inTwoFistSmash all match either model. Both mirror names map here too — the
// clap is symmetric about the centreline, so its two "sides" are the same pose,
// and without those entries half of the GLB's heavies would fall through to the
// mirrored POUND.
export const COLOSSUS_CLAP_HOLD = { // charged clap wind-up: the span held open and
  // quaking until Y releases.
  // HAND-AUTHORED (owner's pose, squared up L/R — a dragged pose lands a few
  // degrees off symmetry and a clap's wind-up shows that). Upper arms out wide
  // and level at roll 96; past roll 90 the shoulder's pitch channel twists the
  // arm about its own axis rather than lifting it, so pitch -58 is what swings
  // the ELBOWS forward, and elbow -58 folds the forearms in ahead of the chest.
  // Reads as a bear-hug cocked to snap shut, and the fists start the swing
  // already on the plane they end it on.
  dur: 0.8, loop: true,
  keys: [
    { t: 0, pose: { hipsPos: [0, -0.261, -0.05], hipsRot: [-6, 0, 0], torso: [-16, 0, 0], shoulderL: [-58, -16, -96], shoulderR: [-58, 16, 96], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], kneeL: [20, 0, 0], kneeR: [20, 0, 0], thighL: [-10, 0, 0], thighR: [-10, 0, 0] } },
    { t: 0.4, ease: 'inOutQuad', pose: { hipsPos: [0, -0.3, -0.06], torso: [-18, 0, 0], shoulderL: [-61, -19, -100], shoulderR: [-61, 19, 100], elbowL: [-54, 0, 0], elbowR: [-54, 0, 0] } },
    { t: 0.8, ease: 'inOutQuad', pose: { hipsPos: [0, -0.261, -0.05], torso: [-16, 0, 0], shoulderL: [-58, -16, -96], shoulderR: [-58, 16, 96], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0] } },
  ],
};

export const COLOSSUS_CLAP = { // the banked clap discharges. Same 0.7s / hit-at-0.18
  // shape as poundSlam, so the charged heavy plays identically either way.
  dur: 0.7,
  keys: [
    // t=0 IS the hold's base pose — the release takes the handover at fade 0, so
    // any drift here reads as a hitch mid-charge. Keep them equal.
    { t: 0, pose: { hipsPos: [0, -0.261, -0.05], hipsRot: [-6, 0, 0], torso: [-16, 0, 0], shoulderL: [-58, -16, -96], shoulderR: [-58, 16, 96], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], kneeL: [20, 0, 0], kneeR: [20, 0, 0], thighL: [-10, 0, 0], thighR: [-10, 0, 0] } },
    // Impact, HAND-AUTHORED (owner's keys, squared L/R). The fists shut on the
    // centreline by FOLDING THE FOREARMS IN — elbow yaw ~40deg — instead of
    // rolling the whole arm across the chest at roll 58 like the first pass did.
    // The upper arms stay out where the shoulders can reach and the closing
    // distance is bought at the elbow, so the span reads wider at the moment of
    // impact and the shoulders never wrench inward.
    { t: 0.18, ease: 'inCubic', pose: { hipsPos: [0, -0.44, 0.12], hipsRot: [8, 0, 0], torso: [22, 0, 0], head: [8, 0, 0], shoulderL: [-65, 3.1, 33.3], shoulderR: [-65, -3.1, -33.3], elbowL: [-26, 39.4, 0], elbowR: [-26, -39.4, 0], kneeL: [40, 0, 0], kneeR: [40, 0, 0], thighL: [-20, 0, 0], thighR: [-20, 0, 0], ankleL: [-16, 0, 0], ankleR: [-16, 0, 0] } },
    // The clap JAMS: the fists stay locked together and the whole span settles as
    // the frame rides the blow out. The arms drop further than the first pass let
    // them (shoulder pitch -39 against -76) and the forearms stay folded, so from
    // the front the fists sit low over the belly — but they are well FORWARD of
    // it, nothing intersects (checked from the side in ?showcase).
    { t: 0.36, ease: 'outQuad', pose: { hipsPos: [0, -0.34, 0.06], torso: [17, 0, 0], shoulderL: [-39, 2.2, 39.4], shoulderR: [-39, -2.2, -39.4], elbowL: [-8.5, 48.9, -22.2], elbowR: [-8.5, -48.9, 22.2] } },
    // recovery UNROLLS before it drops. Falling straight from the clapped pose to
    // rest swept both fists down across the belly plates — the very clipping this
    // clip exists to avoid. Open back to shoulder width first, then let the arms
    // fall outside the hips.
    { t: 0.5, ease: 'inOutQuad', pose: { hipsPos: [0, -0.2, 0.02], torso: [10, 0, 0], head: [4, 0, 0], shoulderL: [-46, 0, -4], shoulderR: [-46, 0, 4], elbowL: [-18, 0, 0], elbowR: [-18, 0, 0] } },
    { t: 0.7, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.1, type: 'sfx', arg: 'whooshBig' }, { t: 0.18, type: 'hit', arg: 0 }, { t: 0.2, type: 'shake', arg: 0.5 }],
};

// COLOSSUS — the SLOW CLAP.
//
// THE TWO POSES ARE THE OWNER'S, hand-set in the pose workbench, and the rest of
// the clip is those two repeated. What they fix is the READ: the first version
// reused the span and contact angles of his HEAVY's clap, which is a weapon —
// arms thrown wide and driven together on the horizontal — and a sarcastic clap
// is not a strike. These are asymmetric (one hand carried high and one low,
// meeting between them, and elbows folded across rather than out), so the hands
// come together UP AND DOWN in front of his chest. Small and unhurried; that is
// the whole joke.
//
// THE PAUSE IS THE CLAP. A slow clap is not four fast claps spaced out — the
// hands MEET and then STAY met, half a second, long enough that you can see him
// deciding whether to bother with the next one. So every contact is TWO keys
// carrying the identical pose with `linear` between them (interpolating a pose
// to itself is a hold), and the beat is generated from the table rather than
// hand-typed eight times, so the pause is one number to move.
export const COLOSSUS_SLOWCLAP = {
  lead: 0.34,    // arms up into the open pose
  close: 0.28,   // the hands coming together
  hold: 0.5,     // …and STAYING together
  open: 0.4,     // drawing them apart again
  claps: 4,
  out: 0.38,     // the last drop back to rest
};

export const COLOSSUS_OPEN = { shoulderL: [-15.12, 13.73, -14.67], shoulderR: [-79.75, -6.3, 11.95],
  elbowL: [-30, 0, 0], elbowR: [-30, 0, 0] };

export const COLOSSUS_SHUT = { shoulderL: [-44, 3, 30], shoulderR: [-44, -3, -30],
  elbowL: [6.26, -36.86, 37.78], elbowR: [-57.83, -85.37, -15.7] };

export function colossusClapClip(C = COLOSSUS_SLOWCLAP) {
  const keys = [{ t: 0, pose: {} },
    { t: C.lead, ease: 'outQuad', pose: { torso: [-6, 0, 0], head: [-8, 0, 0], ...COLOSSUS_OPEN } }];
  const events = [];
  let t = C.lead;
  for (let i = 0; i < C.claps; i++) {
    t += C.close;
    keys.push({ t, ease: 'inQuad', pose: { ...COLOSSUS_SHUT } });
    events.push({ t, type: 'sfx', arg: 'block' });
    t += C.hold;
    keys.push({ t, ease: 'linear', pose: { ...COLOSSUS_SHUT } });   // the pause
    if (i === C.claps - 1) break;
    t += C.open;
    keys.push({ t, ease: 'outQuad', pose: { ...COLOSSUS_OPEN } });
  }
  keys.push({ t: t + C.out, ease: 'inOutQuad', pose: REST_FULL });
  return { dur: t + C.out, cancelOnMove: true, keys, events };
}

export const COLOSSUS_TAUNT = colossusClapClip();
