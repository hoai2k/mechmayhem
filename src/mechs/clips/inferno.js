// INFERNO's own clip data: raw key lists that src/mechs/animations.js
// compiles into GLB_CLIP_VARIANTS (under the SHARED clip name, so every check
// keyed on the name still matches) and the mech's glbanim profile hangs off
// `clipOverrides`. Angles in degrees; see the conventions at the top of
// animations.js. One file per mech so two people can work on two mechs.
import { REST_FULL } from './rest.js';

// inferno for the GLB: the shared `shootLoop` folds both elbows in tight, and
// this model's flame barrels are FOREARM mounts (the manifest pins muzzleR/L to
// forearm bones), so a folded elbow aims the torches up over his own shoulder —
// the flames sprayed skyward instead of at the target. Straighten both arms out
// along the aim line and keep the loop's breathing motion in the torso/shoulders
// so the barrels stay level and the jets travel forward.
export const INFERNO_FLAME_GLB = {
  dur: 0.36, upper: true, loop: true,
  keys: [
    { t: 0, pose: { shoulderR: [-78, 0, 6], elbowR: [8, 0, 0], shoulderL: [-79, 8, -6], elbowL: [8, 18, 0], torso: [2, -8, 0], head: [0, 5, 0] } },
    { t: 0.18, ease: 'inOutQuad', pose: { shoulderR: [-80, 0, 6], elbowR: [10, 0, 0], shoulderL: [-81, 8, -6], elbowL: [10, 18, 0], torso: [0, -6, 0] } },
    { t: 0.36, ease: 'inOutQuad', pose: { shoulderR: [-78, 0, 6], elbowR: [8, 0, 0], shoulderL: [-79, 8, -6], elbowL: [8, 18, 0], torso: [2, -8, 0] } },
  ],
};

// INFERNO — arms CROSSED over the chest while the machine vents. His taunt is
// the one that is all effect (stackToot in stackfx.js: the burners go dark and
// he blows soot out of every nozzle in a toot-toot rhythm), so the pose exists
// to give the venting a body to happen on: planted, arms folded, chin up, doing
// nothing about you at all.
//
// THE FOREARMS RUN SIDEWAYS, NOT UPWARD, and that is a shoulder YAW rather than
// the pitch-and-fold a person would guess at. Measured on the model (hand
// against elbow): the first pass' deep fold left each forearm tilted 31 degrees
// UP with the fists stacked in front of his chin; these numbers put the tilt at
// -1.9 degrees, 69% of the forearm's length running laterally, and each hand a
// little past the far side of his centreline. That is arms crossed.
// INFERNO'S VENT RHYTHM — one set of numbers that BOTH the pose and the smoke
// are built from.
//
// The taunt is a body and an effect doing the same thing: arms crossed while he
// blows, arms down while he does not. Those were two hand-written schedules
// once — key times in the clip, window times in fighter.js — which is two
// places to edit and one of them silently wrong the moment they disagree. Now
// the clip's keys are GENERATED from this table (infernoVentPlan below) and
// Fighter.tauntVenting reads the same plan for its emission windows, so a
// change here moves the arms and the smoke together.
//
// Seconds. The shape is: cross the arms, PUFF, breathe, PUFF, hold the pose a
// beat longer, drop the arms and wait — then do it all again.
export const INFERNO_VENT = {
  lead: 0.34,     // arms come up into the fold
  puff: 0.4,      // one puff of smoke
  gap: 0.3,       // between the two puffs of a pair
  hold: 0.2,      // arms stay crossed after the second puff
  relax: 1.5,     // arms down, waiting, between pairs
  cross: 0.28,    // how long the arms take to fold / unfold
  cycles: 1,      // pairs of puffs (press taunt again for another)
  out: 0.45,      // the last drop back to rest
};

/**
 * The rhythm above, resolved into absolute times. One source for the clip's
 * keyframes and for the emission windows — see INFERNO_VENT.
 * Returns { dur, cycles: [{ cross, puffs: [[a,b],[a,b]], crossEnd }] }.
 */

export function infernoVentPlan(V = INFERNO_VENT) {
  const cycleLen = 2 * V.puff + V.gap + V.hold + V.relax;
  const cycles = [];
  for (let c = 0; c < V.cycles; c++) {
    const s = V.lead + c * cycleLen;
    cycles.push({
      cross: s,                                        // arms folded BY here
      puffs: [[s, s + V.puff], [s + V.puff + V.gap, s + 2 * V.puff + V.gap]],
      crossEnd: s + 2 * V.puff + V.gap + V.hold,       // …and start unfolding
    });
  }
  const last = cycles[cycles.length - 1];
  return { cycles, dur: last.crossEnd + V.out, V };
}

// The fold itself — the owner's, set by hand in the pose workbench.
//
// (Do not tidy the right shoulder's euler. 120.9 / -82.35 / 166.68 looks like a
// mistake next to the left arm's numbers and is the same orientation reached
// the other way round the gimbal — it is what the gizmo produced, and
// "simplifying" it moves the arm.)
export const INFERNO_FOLD = {
  torso: [-6, 0, 0], head: [-10, 0, 0], hipsPos: [0, 0.04, 0],
  shoulderL: [-69.15, 73.87, 25.75], elbowL: [-73.52, 1.68, 0.44],
  shoulderR: [120.9, -82.35, 166.68], elbowR: [-51.84, -13.94, -0.93],
};

// …and what he stands in between the pairs: arms down at his sides, still up on
// his toes about it. NOT rest — rest is where the clip ENDS, and dropping all
// the way there mid-taunt reads as the taunt finishing twice.
export const INFERNO_EASY = {
  torso: [-2, 0, 0], head: [-4, 0, 0], hipsPos: [0, 0.01, 0],
  shoulderL: [-10, 8, -6], elbowL: [-26, 0, 0],
  shoulderR: [-10, -8, 6], elbowR: [-26, 0, 0],
};

// INFERNO — arms folded while the machine vents, in pairs, relaxing between.
// Every key time comes off INFERNO_VENT, so the pose cannot drift out of step
// with the smoke; the FOLD is repeated verbatim on each key that holds it,
// because a clip track is sparse and an arm named once and then not again
// until the rest key does not hold, it drifts there across the whole clip.
export const INFERNO_TAUNT = (() => {
  const plan = infernoVentPlan();
  const V = plan.V;
  const keys = [{ t: 0, pose: {} }];
  plan.cycles.forEach((cy, i) => {
    // fold (the first one rises out of the neutral start, later ones out of the
    // relaxed carriage they were left in)
    keys.push({ t: cy.cross, ease: 'outBack', pose: { ...INFERNO_FOLD } });
    // …held, dead still, right through both puffs and the extra beat after
    keys.push({ t: cy.crossEnd, ease: 'linear', pose: { ...INFERNO_FOLD } });
    if (i < plan.cycles.length - 1) {
      keys.push({ t: cy.crossEnd + V.cross, ease: 'inOutQuad', pose: { ...INFERNO_EASY } });
      keys.push({ t: plan.cycles[i + 1].cross - V.cross, ease: 'linear', pose: { ...INFERNO_EASY } });
    }
  });
  keys.push({ t: plan.dur, ease: 'inOutQuad', pose: REST_FULL });
  return {
    dur: plan.dur, cancelOnMove: true, keys,
    events: [{ t: V.lead, type: 'sfx', arg: 'taunt' }],
  };
})();
