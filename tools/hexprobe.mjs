// HEX PROBE — a many-legged walk, leg by leg, against the floor it is standing on.
//
//   node tools/hexprobe.mjs <mech> [throttle] [steps]
//   node tools/hexprobe.mjs cranky 1
//
// gaitprobe reports the two legs the GAME knows about. A hexapod has four more
// (src/mechs/gaits.js `hex`), and the question that matters about all six is the
// same one: DOES THE FOOT KEEP UP WITH THE FLOOR. So for each leg this measures,
// off the real posed model:
//
//   travel   how far the foot moves fore-aft over one step, in world units —
//            the distance it has to cover for a plant to stay put
//   ground   how far the mech travels in that same step (speed / steps-per-sec,
//            straight out of the gait's cadence) — the distance it MUST cover
//   keep     travel / ground. 1.00 is a foot that stays exactly where it was
//            put. THE ROSTER'S OWN BASELINE IS 0.73 — that is what titanus
//            measures on the standard gait at every speed, so it is what a
//            normal, accepted-looking walk in this game is worth, not 1.00. What
//            this tool was written to catch is the other end: cranky's crab walk
//            measured 0.04, which is a mech wiggling his legs and floating along.
//   lift     peak height above that leg's own lowest point, in body heights
//   low      how close the foot gets to the floor at all
//
// The whole point of `keep` is that neither half is authored: `travel` is
// measured off the bones and `ground` falls out of the cadence, so they only
// agree if the gait is right.
import { launch } from './lib/browser.mjs';

const [mech = 'cranky', throttle = '1', steps = '20'] = process.argv.slice(2);
const base = process.env.RW_BASE || 'http://localhost:5173';
const url = `${base}/workbench/?edit=gait&mech=${mech}&throttle=${throttle}`;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.__gaitWork?.animator', null, { timeout: 120000 });
await page.waitForTimeout(3000);

const out = await page.evaluate(async ({ n }) => {
  const w = window.__gaitWork;
  const m = w.mech, a = w.animator;
  const g = m.group;
  const V3 = g.position.constructor;
  const h = m.dims.hipHeight + m.dims.torsoH + m.dims.headSize * 2;

  // every leg this body has: the two the game drives plus whatever hexLegs found
  const hex = a.hexLegs?.() || null;
  const bones = m.rigBones || {};
  const legs = [];
  if (hex) {
    for (const l of hex.legs) {
      legs.push({
        name: l.hip, rank: l.rank, side: l.side > 0 ? 'L' : 'R', group: l.group,
        driven: l.driven, drop: l.drop, reach: l.reach,
        // the far end of the leg: its foot bone where there is one
        tip: bones[l.foot] || bones[l.knee] || bones[l.hip],
      });
    }
  }
  for (const side of ['L', 'R']) {
    if (legs.some((l) => l.name === `thigh${side}`)) continue;
    if (m.joints?.[`ankle${side}`]) {
      legs.push({ name: `thigh${side}`, rank: null, side, group: null, driven: false, tip: m.joints[`ankle${side}`] });
    }
  }

  w.setPaused(true);
  w.setPhase(0);
  for (let k = 0; k < 60; k++) await new Promise((r) => requestAnimationFrame(r));

  const acc = legs.map(() => ({ fore: [], up: [] }));
  const hipTrack = [];
  const hipY = [];
  const bias = [];
  for (let i = 0; i < n; i++) {
    w.setPhase((i / n) * Math.PI * 2);
    for (let k = 0; k < 14; k++) await new Promise((r) => requestAnimationFrame(r));
    g.updateWorldMatrix(true, true);
    const hip = m.joints.hips.getWorldPosition(new V3());
    hipTrack.push(hip.z - g.position.z);
    hipY.push(hip.y - g.position.y);
    bias.push(a._footBias || 0);
    legs.forEach((l, j) => {
      if (!l.tip) return;
      const p = l.tip.getWorldPosition(new V3());
      // fore-aft RELATIVE TO THE HIPS: the body itself does not move on this
      // stage, so the hips' own sway would otherwise read as foot travel
      acc[j].fore.push(p.z - hip.z);
      acc[j].up.push(p.y - g.position.y);
    });
  }

  // …AND THE SAME BODY RUNNING, not stepped. The sweep above parks the cycle at
  // each phase and lets the pose settle, which is the right way to read a POSE —
  // but the pelvis-follows-the-feet loop is deliberately slow (see
  // SOLE_FOLLOW_RATE), so given a dozen frames to converge at every phase it
  // tracks the sole exactly and reports a heave nothing on screen ever does. So
  // let it run: ANIMATION SPEED scales the animator's dt, and the follower's damp
  // scales with it, so a tenth-speed cycle has identical dynamics per radian of
  // phase and simply gives a slow renderer enough frames to see it.
  w.setPaused(false);
  w.setAnimSpeed(0.12);
  for (let k = 0; k < 40; k++) await new Promise((r) => requestAnimationFrame(r));
  const liveY = [];
  let last = a.phase, turned = 0;
  for (let k = 0; k < 900 && turned < 2 * Math.PI; k++) {
    await new Promise((r) => requestAnimationFrame(r));
    turned += Math.abs(a.phase - last); last = a.phase;
    g.updateWorldMatrix(true, true);
    liveY.push(m.joints.hips.getWorldPosition(new V3()).y - g.position.y);
  }
  // TWO THINGS THAT MUST BE TRUE OF ANY LEG THE GAIT DRIVES, and were not when
  // these legs ran off their own clock inside a glbanim profile: pausing the
  // workbench must stop them (there is no clock but the gait phase), and
  // standing still must return them to the rig's rest angles rather than
  // freezing them mid-stride.
  const legBones = hex ? hex.legs.filter((l) => l.driven).flatMap((l) => [l.hip, l.knee]).filter(Boolean) : [];
  const readLegs = () => legBones.map((n) => {
    const o = bones[n];
    return o ? [o.rotation.x, o.rotation.y, o.rotation.z] : [0, 0, 0];
  });
  const spread = (p, q) => (p.length
    ? Math.max(...p.map((v, i) => Math.max(...v.map((c, j) => Math.abs(c - q[i][j]))))) : 0);
  w.setPaused(true);
  for (let k = 0; k < 30; k++) await new Promise((r) => requestAnimationFrame(r));
  const frozen = readLegs();
  for (let k = 0; k < 40; k++) await new Promise((r) => requestAnimationFrame(r));
  const pausedDrift = spread(frozen, readLegs());
  w.setPaused(false);
  w.setThrottle(0);
  for (let k = 0; k < 180; k++) await new Promise((r) => requestAnimationFrame(r));
  const restAngles = hex ? hex.legs.filter((l) => l.driven).flatMap((l) => [l.restHip, l.restKnee]) : [];
  const restDrift = restAngles.length ? spread(readLegs(), restAngles) : null;

  // what the cadence is asking of every one of them
  const gait = w.gait;
  const legLen = m.dims.thighLen + m.dims.shinLen;
  const ratio = Number(new URLSearchParams(location.search).get('throttle') ?? 1);
  const speed = w.topSpeedNow ?? null;
  return {
    h,
    legLen,
    ratio,
    speed,
    gaitId: w.gaitId,
    phaseRate: a._lastRate ?? null,
    gait: { legs: { ...gait.legs }, hex: gait.hex ? { ...gait.hex } : null },
    hipSway: Math.max(...hipTrack) - Math.min(...hipTrack),
    // HEAVE: how far the shell itself rides up and down over the cycle, and how
    // much of that is the pelvis chasing the measured sole rather than the gait
    heave: Math.max(...hipY) - Math.min(...hipY),
    biasSwing: Math.max(...bias) - Math.min(...bias),
    liveHeave: liveY.length > 8 ? Math.max(...liveY) - Math.min(...liveY) : null,
    liveN: liveY.length,
    pausedDrift, restDrift,
    legs: legs.map((l, j) => ({
      name: l.name, side: l.side, rank: l.rank, group: l.group, driven: l.driven,
      drop: l.drop ?? null, reach: l.reach ?? null,
      travel: Math.max(...acc[j].fore) - Math.min(...acc[j].fore),
      lift: Math.max(...acc[j].up) - Math.min(...acc[j].up),
      low: Math.min(...acc[j].up),
    })),
  };
}, { n: Number(steps) });

await browser.close();

// ground per step, from the gait's own cadence — the same formula the animator
// advances the phase with (gaitPhaseRate), so this is what the mech is actually
// asking of its feet.
const L = out.gait.legs;
const swing = L.swing + L.swingRun * out.ratio;
const groundPerStep = Math.PI * out.legLen * L.cadence * swing;

const pc = (v) => `${(v / out.h * 100).toFixed(1)}%`;
console.log(`\n${mech} @ throttle ${out.ratio} — gait '${out.gaitId}'`);
console.log(`  body height ${out.h.toFixed(2)} u · leg length ${out.legLen.toFixed(2)} u`);
console.log(`  the floor moves ${groundPerStep.toFixed(2)} u under each step `
  + `(cadence ${L.cadence} x swing ${swing.toFixed(2)})\n`);
// THE TWO LEVER ARMS, so a yaw mix can be costed rather than guessed: a radian
// of pitch carries the foot `drop` forward, a radian of yaw carries it `reach`.
// Both are in the RIG's own units (they are measured off the bind skeleton), so
// read the RATIO between them, not the number — `travel` is the world one.
const yawMix = out.gait.hex?.yaw ?? 0;
if (out.gait.hex) {
  console.log(`  stride is ${Math.round(yawMix * 100)}% a swing ROUND the hip, `
    + `${Math.round((1 - yawMix) * 100)}% a pendulum under it (hex.yaw)\n`);
}
console.log('  leg          rank  tripod   drop  reach  lever   travel   keep   lift    low');
let worst = null;
for (const l of out.legs) {
  const keep = groundPerStep > 1e-6 ? l.travel / groundPerStep : 0;
  if (worst === null || keep < worst) worst = keep;
  const lever = l.drop === null ? null : (1 - yawMix) * l.drop + yawMix * l.reach;
  const n = (v, w = 5) => (v === null ? '—'.padStart(w) : v.toFixed(2).padStart(w));
  console.log(`  ${l.name.padEnd(12)} ${String(l.rank ?? '-').padStart(3)}  `
    + `${String(l.group ?? '-').padStart(5)}  ${n(l.drop)} ${n(l.reach)}  ${n(lever)}   `
    + `${l.travel.toFixed(2).padStart(5)} u  ${keep.toFixed(2).padStart(5)}  `
    + `${pc(l.lift).padStart(6)} ${pc(l.low).padStart(6)}`);
}
console.log(`\n  shell heave ${out.liveHeave === null ? '?' : pc(out.liveHeave)} of body height RUNNING`
  + ` (${pc(out.heave)} stepped phase by phase, of which the pelvis`
  + ` foot-follow is ${out.biasSwing.toFixed(2)} u — see the note in this file)`);
console.log(`  worst keep ${worst.toFixed(2)} — `
  + (worst > 0.7 ? 'the feet keep up with the floor (the roster\'s own baseline is 0.73)'
    : worst > 0.4 ? 'under-striding: below what the rest of the roster manages'
      : 'FLOATING: the legs are decoration, the mech is sliding'));
if (out.restDrift !== null) {
  console.log(`  paused, the legs drift ${out.pausedDrift.toFixed(5)} rad `
    + `${out.pausedDrift < 0.002 ? '(frozen — the gait phase is their only clock)' : 'FAIL: something else is moving them'}`);
  console.log(`  standing, they sit ${out.restDrift.toFixed(4)} rad from the rig's rest angles `
    + `${out.restDrift < 0.02 ? '(settled)' : 'FAIL: stuck mid-stride'}`);
}
if (errs.length) console.log(`\n  page errors: ${errs.join(' | ')}`);
