// GAIT PROBE — the stride, measured instead of eyeballed.
//
//   node tools/gaitprobe.mjs <mech> [throttle] [vsGait] [steps]
//   node tools/gaitprobe.mjs viper 1 standard
//
// Walks a mech through one full gait cycle in the gait workbench and reports,
// for its own gait and for a comparison gait side by side:
//
//   reach      how far AHEAD of the hips the foot gets, in body heights
//   trail      how far BEHIND it gets  (reach + trail = the stride span, which
//              is the number behind "the legs never reach very far forward")
//   lift       peak foot clearance
//   sink       worst penetration below the floor (negative is bad: the leg is
//              reaching through the pavement)
//   track      how far the feet sit off the centre line (the "legs far apart" read)
//   lean       body pitch at the hips + torso, in degrees
//   armSwing   peak shoulder pitch travel, degrees
//   ankleAir   THE AIRBORNE FOOT check, in degrees: how far the ankle sits from
//              where it should while the foot is off the ground — its RESTING
//              angle to the shin, plus whatever `ankle.hang` points past it. ~0 is
//              the rule holding; a big number means something is still bending the
//              foot around in mid-air.
//   toeFwd     …and where that leaves the toes on a RAISED REAR foot: 1 = dead
//              ahead (the "walking on a floor that isn't there" tell), 0 = straight
//              down, negative = back. Perpendicular to a shin that is angled back
//              lands somewhere in 0.0-0.4, so this is a bound, not a target.
//   armPhase   the COUNTER-SWING check: correlation, over the cycle, between how
//              far forward a foot is and how far forward the arm on the SAME
//              side is. It must be NEGATIVE (left leg forward, left arm back) —
//              a positive number means the arms are marching with the legs,
//              which reads as a wind-up toy
//
// Everything is measured off the REAL posed model — same animator, same
// retarget, same foot calibration the game runs — so a number here is a number
// on screen.
import { chromium } from 'playwright-core';

const [mech = 'viper', throttle = '1', vs = 'standard', steps = '24'] = process.argv.slice(2);
const base = process.env.RW_BASE || 'http://localhost:5173';
const url = `${base}/workbench/?edit=gait&mech=${mech}&throttle=${throttle}&compare=1&vs=${vs}`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.__gaitWork?.ghostAnimator', null, { timeout: 90000 });
await page.waitForTimeout(4000);

const out = await page.evaluate(async ({ n }) => {
  const w = window.__gaitWork;
  w.setPaused(true);
  const R2D = 180 / Math.PI;

  // one sample of a posed body: feet relative to the hips, in body heights
  function sample(m, a) {
    const g = m.group;
    g.updateWorldMatrix(true, true);
    const V3 = g.position.constructor;              // THREE.Vector3, without importing three here
    const hip = m.joints.hips.getWorldPosition(new V3());
    const Q = g.quaternion.constructor;
    // WHICH FOOT IS UP, from the measured sole where the body has been calibrated
    // (a deep-booted heavy stands with its ankle a fifth of a body height up, so
    // ankle height alone calls a planted foot "raised" and the check misfires)
    const clr = a.soleClearanceBySide?.() || null;
    const legLen = m.dims.thighLen + m.dims.shinLen;
    const feet = {}, hands = {};
    for (const side of ['L', 'R']) {
      const o = m.joints['ankle' + side];
      const p = o.getWorldPosition(new V3());
      // where the toes point: the foot's own forward axis, in world
      const toe = new V3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new Q()));
      const air = clr && typeof clr[side] === 'number'
        ? clr[side] > 0.15 * legLen                 // measured: sole off the pavement
        : (p.y - g.position.y) > 0.20 * (m.dims.hipHeight + m.dims.torsoH + m.dims.headSize * 2);
      feet[side] = { fore: p.z - hip.z, up: p.y - g.position.y, side: p.x - hip.x, toe: toe.z, air };
      const hp = m.joints['hand' + side].getWorldPosition(new V3());
      hands[side] = { fore: hp.z - hip.z, up: hp.y - g.position.y };
    }
    return {
      feet, hands,
      hipY: hip.y - g.position.y,
      lean: (a.cur.hipsRot[0] + a.cur.torso[0]) * R2D,
      shoulder: a.cur.shoulderL[0] * R2D,
      // how far each ankle is from its resting line, for the airborne check
      ankleOff: { L: (a.cur.ankleL[0] - a.rest.ankleL[0]) * R2D, R: (a.cur.ankleR[0] - a.rest.ankleR[0]) * R2D },
      hang: (a.gait?.ankle?.hang || 0) * R2D,
    };
  }

  const runs = {};
  for (const [key, m, a] of [['mine', w.mech, w.animator], ['vs', w.ghost, w.ghostAnimator]]) {
    const h = (m.dims.hipHeight + m.dims.torsoH + m.dims.headSize * 2);
    const acc = {
      reach: -1e9, trail: -1e9, lift: -1e9, sink: 1e9, track: 0,
      hipMin: 1e9, hipMax: -1e9, lean: 0, shMin: 1e9, shMax: -1e9, sole: 1e9, toeFwd: -9, h,
      airOff: 0, airN: 0,
      // paired samples for the counter-swing correlation
      pairs: [],
      // WHEN EACH LIMB REACHES DOWN — the number behind "does his right claw
      // land with his left leg?".
      //
      // Measured RELATIVE TO THE HIPS, deliberately. A limb's absolute height
      // is its own cycle PLUS the body's, and on a body with a real bob (and a
      // pelvis follower on top of it) the shared term can dominate: jerry's
      // claws bottom out at the same phase whatever `arms.phase` says, because
      // that phase is the shell dropping, not the claw reaching. Taking the hips
      // out leaves each limb's own cycle, which is what the phase dials move.
      // `clr` keeps the absolute answer alongside it — how close that limb gets
      // to the floor at all, so "landing" can be told from "waving".
      //
      // …and the phase is taken from the FUNDAMENTAL HARMONIC of the height
      // curve, not from its lowest sample. A limb's bottom is often a plateau
      // (jerry's claw sits within a few percent of its lowest over a third of
      // the cycle), so argmin hops around inside the flat and reads as "the dial
      // did nothing" when the whole curve has in fact slid. One cosine fit per
      // limb — cos/sin sums over the cycle — gives a phase that moves with the
      // curve, which is what a timing comparison needs.
      wave: { footL: [0, 0], footR: [0, 0], handL: [0, 0], handR: [0, 0] },
      clr: { footL: 1e9, footR: 1e9, handL: 1e9, handR: 1e9 },
    };
    runs[key] = acc;
  }
  // WARM UP FIRST. Both bodies start at their REST pose, and the animator's pose
  // smoother (and the pelvis/sole follower, which has its own memory) takes a
  // while to arrive at a running gait. Sampling from a cold start let that
  // transient in as an outlier at one end of the cycle, which inflated the swing
  // ranges by up to 2x and made the numbers unrepeatable run to run.
  w.setPhase(0);
  for (let k = 0; k < 60; k++) await new Promise((r) => requestAnimationFrame(r));

  // sweep the cycle: both bodies are posed by their own animator at the same
  // phase, with the smoother given a few frames to arrive at each one
  for (let i = 0; i < n; i++) {
    w.setPhase((i / n) * Math.PI * 2);
    for (let k = 0; k < 18; k++) await new Promise((r) => requestAnimationFrame(r));
    for (const [key, m, a] of [['mine', w.mech, w.animator], ['vs', w.ghost, w.ghostAnimator]]) {
      const s = sample(m, a);
      const acc = runs[key];
      for (const side of ['L', 'R']) {
        const f = s.feet[side];
        acc.reach = Math.max(acc.reach, f.fore);
        acc.trail = Math.max(acc.trail, -f.fore);
        acc.lift = Math.max(acc.lift, f.up);
        acc.sink = Math.min(acc.sink, f.up);
        acc.track = Math.max(acc.track, Math.abs(f.side));
        // BEHIND the hips and OFF the ground: the window where a foot must not
        // still be pointing its toes forward
        if (f.fore < -0.20 * acc.h && f.air) acc.toeFwd = Math.max(acc.toeFwd, f.toe);
        // in the air, the ankle belongs at its resting line (+ the gait's `hang`)
        if (f.air) { acc.airOff += Math.abs(s.ankleOff[side] - s.hang); acc.airN++; }
      }
      for (const side of ['L', 'R']) acc.pairs.push([s.feet[side].fore, s.hands[side].fore]);
      // reach-down = the phase at which this limb hangs lowest BELOW THE HIPS
      // (its own cycle, one cosine fit); clearance = how low it gets absolutely
      const th = (i / n) * Math.PI * 2;
      for (const [name, up] of [['footL', s.feet.L.up], ['footR', s.feet.R.up],
        ['handL', s.hands.L.up], ['handR', s.hands.R.up]]) {
        const rel = up - s.hipY;
        acc.wave[name][0] += rel * Math.cos(th);
        acc.wave[name][1] += rel * Math.sin(th);
        if (up < acc.clr[name]) acc.clr[name] = up;
      }
      acc.hipMin = Math.min(acc.hipMin, s.hipY);
      acc.hipMax = Math.max(acc.hipMax, s.hipY);
      acc.lean = Math.max(acc.lean, s.lean);
      acc.shMin = Math.min(acc.shMin, s.shoulder);
      acc.shMax = Math.max(acc.shMax, s.shoulder);
      // the MEASURED sole, not the ankle bone: how far the real boot is off the
      // pavement. Below zero is the leg reaching through the floor.
      const clr = a.soleClearance?.();
      if (clr !== null && clr !== undefined) acc.sole = Math.min(acc.sole, clr);
    }
  }
  // Pearson r over the cycle, which is indifferent to the rest pose's own
  // fore/aft offset — only the SHAPE of the two swings is being compared
  const corr = (pairs) => {
    const n = pairs.length;
    const mx = pairs.reduce((t, p) => t + p[0], 0) / n;
    const my = pairs.reduce((t, p) => t + p[1], 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of pairs) { const dx = x - mx, dy = y - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx > 1e-9 && syy > 1e-9 ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  const norm = (a) => ({
    reach: a.reach / a.h, trail: a.trail / a.h, stride: (a.reach + a.trail) / a.h,
    lift: a.lift / a.h, sink: a.sink / a.h, track: a.track / a.h,
    bob: (a.hipMax - a.hipMin) / a.h, lean: a.lean, armSwing: a.shMax - a.shMin,
    sole: a.sole > 1e8 ? null : a.sole / a.h,
    toeFwd: a.toeFwd < -8 ? null : a.toeFwd,
    ankleAir: a.airN ? a.airOff / a.airN : null,
    armPhase: corr(a.pairs),
    // peak of the fitted cosine is the limb's HIGHEST; half a turn on is its
    // lowest — the moment it is reaching for the ground
    reachDown: Object.fromEntries(Object.entries(a.wave).map(([k, [c, s2]]) => {
      if (Math.hypot(c, s2) < 1e-6) return [k, null];
      const up = Math.atan2(s2, c) / (Math.PI * 2);
      return [k, ((up + 0.5) % 1 + 1) % 1];
    })),
    clearance: Object.fromEntries(Object.entries(a.clr).map(([k, v]) => [k, v > 1e8 ? null : v / a.h])),
  });
  return {
    mech: w.mech.def.id, gait: w.gaitId, vs: w.compareGait,
    // the claws only touch the ground on a foreleg gait; on a humanoid the
    // hand minimum is just the bottom of an arm swing and means nothing
    foreleg: !!(w.gait?.arms?.carry || w.gait?.arms?.handGround),
    armPhaseDial: w.gait?.arms?.phase || 0,
    legPhaseDial: w.gait?.legs?.phase || 0,
    mine: norm(runs.mine), other: norm(runs.vs),
  };
}, { n: Number(steps) });
await browser.close();

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const row = (label, a, b, f = pct) => console.log(
  `  ${label.padEnd(10)} ${String(f(a)).padStart(8)}   ${String(f(b)).padStart(8)}   ${
    typeof a === 'number' && typeof b === 'number' ? (a - b >= 0 ? '+' : '') + f(a - b) : ''}`);

console.log(`\n${out.mech} @ throttle ${throttle} — gait '${out.gait}' vs '${out.vs}'`);
console.log('  (feet/stride as a fraction of body height)\n');
console.log(`  ${''.padEnd(10)} ${out.gait.padStart(8)}   ${String(out.vs).padStart(8)}   delta`);
row('reach', out.mine.reach, out.other.reach);
row('trail', out.mine.trail, out.other.trail);
row('stride', out.mine.stride, out.other.stride);
row('lift', out.mine.lift, out.other.lift);
row('sink', out.mine.sink, out.other.sink);
row('track', out.mine.track, out.other.track);
row('bob', out.mine.bob, out.other.bob);
if (out.mine.sole !== null) row('sole min', out.mine.sole, out.other.sole);
row('lean°', out.mine.lean, out.other.lean, (v) => v.toFixed(1));
row('armSwing°', out.mine.armSwing, out.other.armSwing, (v) => v.toFixed(1));
row('armPhase r', out.mine.armPhase, out.other.armPhase, (v) => v.toFixed(2));
if (out.mine.ankleAir !== null) row('ankleAir°', out.mine.ankleAir, out.other.ankleAir ?? 0, (v) => v.toFixed(1));
if (out.mine.toeFwd !== null) row('toeFwd', out.mine.toeFwd, out.other.toeFwd ?? 0, (v) => v.toFixed(2));
console.log(`\n  airborne foot: ${out.mine.ankleAir === null ? 'never leaves the ground in this sample'
  : out.mine.ankleAir < 8 ? 'hangs at its resting line (correct)'
  : `${out.mine.ankleAir.toFixed(0)}° away from its resting line — something is still bending it in mid-air`}`
  + (out.mine.toeFwd === null ? ''
    : out.mine.toeFwd > 0.6 ? `, and its toes still point FORWARD (${out.mine.toeFwd.toFixed(2)})`
    : `, toes ${out.mine.toeFwd < 0 ? 'back' : 'down'} (${out.mine.toeFwd.toFixed(2)})`));
// ---- WHO LANDS WITH WHOM ----
// Only meaningful when the claws are feet (a foreleg gait); on a humanoid the
// lowest point of a hand is just the bottom of an arm swing.
if (out.foreleg) {
  const td = out.mine.reachDown, clr = out.mine.clearance;
  const turn = (v) => (v === null ? '—' : `${(v * 100).toFixed(0)}%`);
  // shortest way round the circle, in cycles: 0 = together, 0.5 = opposite
  const gap = (a, b) => {
    if (a === null || b === null) return null;
    const d = Math.abs(a - b) % 1;
    return Math.min(d, 1 - d);
  };
  const NAME = { footL: 'foot L', footR: 'foot R', handL: 'claw L', handR: 'claw R' };
  console.log(`\n  reach-down — where each limb sits lowest in its OWN cycle (hips taken out),`);
  console.log('  and how close it gets to the floor at all (% of body height, ~0 = it lands)'
    + `${out.armPhaseDial ? `   [arms.phase ${out.armPhaseDial.toFixed(2)}]` : ''}`
    + `${out.legPhaseDial ? `   [legs.phase ${out.legPhaseDial.toFixed(2)}]` : ''}`);
  for (const k of ['footL', 'footR', 'handL', 'handR']) {
    console.log(`    ${NAME[k].padEnd(7)} at ${turn(td[k]).padStart(4)} of the cycle`
      + `   clearance ${clr[k] === null ? '—' : pct(clr[k]).padStart(7)}`
      + (clr[k] !== null && clr[k] > 0.12 ? '  (never reaches the ground)' : ''));
  }
  for (const [a, b] of [['handR', 'footL'], ['handL', 'footR'], ['handR', 'footR'], ['handL', 'footL']]) {
    const g = gap(td[a], td[b]);
    if (g === null) continue;
    console.log(`    ${NAME[a]} vs ${NAME[b]}: ${(g * 100).toFixed(0)}% apart`
      + (g < 0.08 ? '  ← together' : g > 0.42 ? '  ← dead opposite' : ''));
  }
  console.log('    (arms.phase slides the claws round this clock — π swaps the pair;'
    + ' legs.phase does the same for the legs)');
}

console.log(`\n  arms ${out.mine.armPhase < -0.3 ? 'COUNTER-swing the legs (correct)'
  : out.mine.armPhase > 0.3 ? 'swing WITH the legs — WRONG, they should counter'
  : 'barely swing / out of phase with the legs'}`);
if (errs.length) console.log('\nPAGE ERRORS:\n' + errs.slice(0, 4).join('\n'));
