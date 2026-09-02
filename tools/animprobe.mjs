// animprobe: freeze a mech at chosen clip times, report which limbs actually
// move (world-space bone displacement) + screenshot. Diagnoses retarget/skin
// issues like "attacks with the wrong limb".
//   node tools/animprobe.mjs <mechId> <clip> [t0,t1,...] [outPrefix]
// Samples the animator deterministically (fixed 1/60 steps) so a fast clip can
// be inspected frame-accurately instead of gambling on a screenshot wait.
import { launch } from './lib/browser.mjs';

const [mechId, clip, tlist = '0,0.3,0.55', prefix = `/tmp/probe_${mechId}`] = process.argv.slice(2);
const times = tlist.split(',').map(Number);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`http://localhost:5173/?showcase=${mechId}&anim=none&debug=3d`,
  { waitUntil: 'networkidle' }).catch((e) => errors.push(String(e)));
// wait for the mech to build
await page.waitForFunction(() => window.__showcaseMechs && window.__showcaseMechs[0], { timeout: 30000 });

// tracked virtual joints (what the animator drives) — the bone map resolves
// each to the GLB bone the retarget actually moves.
const JOINTS = ['shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR'];

for (const t of times) {
  const data = await page.evaluate(({ clip, t, JOINTS }) => {
    const mech = window.__showcaseMechs[0];
    const engine = window.__showcaseEngine;
    // bone map: prefer mech.boneMap, else reconstruct from adapter.entries
    const bmap = mech.boneMap || (mech.adapter
      ? Object.fromEntries(mech.adapter.entries.map((e) => [e.jname, e.bone])) : {});
    engine.onUpdate = () => {};                 // freeze the built-in driver
    const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
    const dt = 1 / 60;

    // reset to a clean rest, then settle so smoothing converges to rest first
    mech.animator.action = null;
    for (let i = 0; i < 60; i++) mech.animator.update(dt, ctx);
    const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
    const restJoint = {}, restBone = {};
    for (const j of JOINTS) {
      if (mech.joints[j]) restJoint[j] = wp(mech.joints[j]);
      if (bmap[j]) restBone[j] = wp(bmap[j]);
    }

    // play the clip and step to time t
    mech.animator.play(clip);
    const n = Math.max(1, Math.round(t / dt));
    for (let i = 0; i < n; i++) mech.animator.update(dt, ctx);
    engine.scene.updateMatrixWorld(true);

    const out = { t, joint: {}, bone: {}, boneName: {} };
    for (const j of JOINTS) {
      if (mech.joints[j]) {
        const p = wp(mech.joints[j]);
        out.joint[j] = { d: Math.hypot(p[0] - restJoint[j][0], p[1] - restJoint[j][1], p[2] - restJoint[j][2]) };
      }
      if (bmap[j]) {
        const p = wp(bmap[j]);
        out.bone[j] = { p: p.map((v) => +v.toFixed(2)), d: Math.hypot(p[0] - restBone[j][0], p[1] - restBone[j][1], p[2] - restBone[j][2]) };
        out.boneName[j] = bmap[j].name;
      }
    }
    return out;
  }, { clip, t, JOINTS });

  await page.screenshot({ path: `${prefix}_t${String(t).replace('.', '')}.png` });
  // report: per joint, virtual-joint displacement vs retargeted-bone displacement
  console.log(`\n=== ${mechId} ${clip} @ t=${t}s ===`);
  console.log('joint'.padEnd(10), 'boneName'.padEnd(24), 'jointΔ'.padStart(7), 'boneΔ'.padStart(7), '  bonePos');
  for (const j of JOINTS) {
    const b = data.bone[j], jt = data.joint[j];
    console.log(
      j.padEnd(10),
      (data.boneName[j] || '-').padEnd(24),
      (jt ? jt.d.toFixed(3) : '-').padStart(7),
      (b ? b.d.toFixed(3) : '-').padStart(7),
      '  ' + (b ? JSON.stringify(b.p) : ''));
  }
}
if (errors.length) console.log('\nPAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
