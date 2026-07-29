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
    const feet = {}, hands = {};
    for (const side of ['L', 'R']) {
      const p = m.joints['ankle' + side].getWorldPosition(new V3());
      feet[side] = { fore: p.z - hip.z, up: p.y - g.position.y, side: p.x - hip.x };
      hands[side] = m.joints['hand' + side].getWorldPosition(new V3()).z - hip.z;
    }
    return {
      feet, hands,
      hipY: hip.y - g.position.y,
      lean: (a.cur.hipsRot[0] + a.cur.torso[0]) * R2D,
      shoulder: a.cur.shoulderL[0] * R2D,
    };
  }

  const runs = {};
  for (const [key, m, a] of [['mine', w.mech, w.animator], ['vs', w.ghost, w.ghostAnimator]]) {
    const h = (m.dims.hipHeight + m.dims.torsoH + m.dims.headSize * 2);
    const acc = {
      reach: -1e9, trail: -1e9, lift: -1e9, sink: 1e9, track: 0,
      hipMin: 1e9, hipMax: -1e9, lean: 0, shMin: 1e9, shMax: -1e9, sole: 1e9, h,
      // paired samples for the counter-swing correlation
      pairs: [],
    };
    runs[key] = acc;
  }
  // sweep the cycle: both bodies are posed by their own animator at the same
  // phase, with the smoother given a few frames to arrive at each one
  for (let i = 0; i < n; i++) {
    w.setPhase((i / n) * Math.PI * 2);
    for (let k = 0; k < 14; k++) await new Promise((r) => requestAnimationFrame(r));
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
      }
      for (const side of ['L', 'R']) acc.pairs.push([s.feet[side].fore, s.hands[side]]);
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
    armPhase: corr(a.pairs),
  });
  return {
    mech: w.mech.def.id, gait: w.gaitId, vs: w.compareGait,
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
console.log(`\n  arms ${out.mine.armPhase < -0.3 ? 'COUNTER-swing the legs (correct)'
  : out.mine.armPhase > 0.3 ? 'swing WITH the legs — WRONG, they should counter'
  : 'barely swing / out of phase with the legs'}`);
if (errs.length) console.log('\nPAGE ERRORS:\n' + errs.slice(0, 4).join('\n'));
