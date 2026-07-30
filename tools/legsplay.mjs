// legsplay — do this mech's legs hang straight, or angle out to the sides?
//
//   node tools/legsplay.mjs <mech> [<mech> …]
//
// The number behind "his legs look bandy when he runs". For each leg it
// measures the lean of the hip->ankle line out of vertical IN THE FRONTAL
// PLANE (the hip line is the lateral axis, so it works whichever way the model
// faces), at the rest stance and around one full stride at full throttle:
//
//   + outboard (knee/foot away from the midline — the splay)
//   - inboard  (crossing toward the midline — knock-kneed)
//
// MEASURED ON THE BONES, NOT THE VIRTUAL JOINTS, which is the whole point. The
// retarget (rigadapter.js) drives each bone's world ORIENTATION from the game's
// clean humanoid rig, but the bone POSITIONS are the custom rig's own, so a rig
// whose knee sits outboard of its hip leans the leg outboard in every pose and
// the gait's own `adduct` dial reads as if the legs were tracking straight.
// Viper: the virtual joints measure 10° INBOARD at full speed while the bones
// measure 15° out, peaking at 44° on the knee lift.
//
// THE LEVER, when the numbers are too wide: `boneCorrections` in the manifest —
// degrees [x,y,z] per joint, applied in bone-local space after the retarget
// (RigAdapter, `corr`). On a custom rig every bone rests unrotated, so bone-local
// x is the mesh's forward axis and a rotation about it is exactly adduction:
//
//   "boneCorrections": { "thighL": [10, 0, 0], "thighR": [-10, 0, 0] }
//
// Positive on the LEFT pulls that leg in. Rotation in the rig FILE would not
// work — see the note in src/mechs/rigs/README-ish header of any rig, or the
// derivation in CLAUDE.md: applyCustomRig rebinds at rest and RigAdapter
// captures a rest offset per bone, so both halves cancel a bind rotation out.
//
// Needs the dev server (npm run dev).
import { chromium } from 'playwright-core';

const mechs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!mechs.length) { console.error('usage: node tools/legsplay.mjs <mech> [<mech> …]'); process.exit(1); }
const base = process.env.RW_URL || 'http://localhost:5173';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

for (const mech of mechs) {
  await page.goto(`${base}/workbench/?edit=gait&mech=${mech}&throttle=1&prints=0&compare=0`,
    { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__gaitWork?.animator, null, { timeout: 90000 });
  await page.waitForTimeout(8000);
  const rows = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const w = window.__gaitWork;
    // THE BONES the model actually renders with; the virtual joints only as a
    // fallback for a mech with no bone by that name
    const at = (n) => {
      const j = w.mech.boneMap?.[n] || w.mech.joints[n];
      j.updateWorldMatrix(true, false);
      return j.getWorldPosition(new THREE.Vector3());
    };
    const out = [];
    for (const thr of [0, 1]) {
      w.setThrottle(thr);
      w.setPaused(true);
      const perPhase = [];
      for (let i = 0; i < 12; i++) {
        w.setPhase((i / 12) * Math.PI * 2);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const hL = at('thighL'), hR = at('thighR');
        const lat = hL.clone().sub(hR).normalize();     // the hip line IS the lateral axis
        const up = new THREE.Vector3(0, 1, 0);
        const lean = (hip, joint, sign) => {
          const v = joint.clone().sub(hip);
          return Math.atan2(v.dot(lat) * sign, Math.max(1e-4, -v.dot(up))) * 180 / Math.PI;
        };
        perPhase.push({
          L: lean(hL, at('ankleL'), 1), R: lean(hR, at('ankleR'), -1),
          kL: lean(hL, at('kneeL'), 1), kR: lean(hR, at('kneeR'), -1),
        });
      }
      out.push({ throttle: thr, perPhase });
    }
    return out;
  });
  console.log(`\n=== ${mech} — hip-to-joint lean out of vertical (+ outboard, - inboard)`);
  for (const r of rows) {
    const st = (k) => {
      const v = r.perPhase.map((x) => x[k]);
      const avg = v.reduce((s, x) => s + x, 0) / v.length;
      return `${avg.toFixed(1)}° (${Math.min(...v).toFixed(1)}..${Math.max(...v).toFixed(1)})`;
    };
    console.log(`  ${r.throttle ? 'running ' : 'standing'}   ankle L ${st('L')}  R ${st('R')}`);
    console.log(`               knee  L ${st('kL')}  R ${st('kR')}`);
  }
}
if (errors.length) console.log('\nPAGE ERRORS:', errors.join('\n'));
await browser.close();
