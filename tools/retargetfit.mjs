#!/usr/bin/env node
// RETARGETFIT — how far is each mapped BONE from the virtual joint driving it?
//
//   node tools/retargetfit.mjs <mechId>        (needs `npm run dev`)
//
// RigAdapter drives a GLB bone's world ORIENTATION from the game's clean
// humanoid rig, but the bone's POSITION is the model's own — it falls out of
// its parent's matrix and its bind offset. So a mapping that names the wrong
// bone still produces a body that MOVES, just one whose limbs are dragged away
// from where the animation thinks they are. This measures that gap: mean
// |bonePos - jointPos| per joint, as a fraction of body height, at rest and
// over every clip the mech can play.
//
// It is the number that settles a `boneOverrides` edit. Saurion's mirrored
// mapping (tools/rigmirror.mjs, which finds the fault without a renderer)
// summed 3.64 body-heights over the twelve limb joints; naming each bone on
// its own side took it to 1.80, every single joint better, his knees 0.28 ->
// 0.09. READ IT AGAINST A HEALTHY MECH, not against zero — the residue is the
// model's own proportions, which no mapping can close, and tempest, whose
// mapping was never in doubt, measures 1.34.
import { launch } from './lib/browser.mjs';
const mech = process.argv[2] || 'saurion';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
page.on('pageerror', e => console.error('PAGE ERROR', String(e).slice(0,300)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 45000 });
const res = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const m = window.__showcaseMechs[0], a = m.animator;
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const dt = 1/60, H = m.dims?.height || 7;
  const J = ['thighL','kneeL','ankleL','thighR','kneeR','ankleR',
             'shoulderL','elbowL','handL','shoulderR','elbowR','handR'];
  const acc = {}, n = {};
  for (const j of J) { acc[j] = 0; n[j] = 0; }
  const sample = () => {
    window.__showcaseEngine.scene.updateMatrixWorld(true);
    for (const j of J) {
      const bone = m.boneMap?.[j], joint = m.joints?.[j];
      if (!bone || !joint) continue;
      const p = bone.getWorldPosition(new THREE.Vector3());
      const q = joint.getWorldPosition(new THREE.Vector3());
      acc[j] += p.distanceTo(q) / H; n[j]++;
    }
  };
  a.action = null;
  for (let i = 0; i < 90; i++) a.update(dt, ctx);
  sample();
  const rest = {}; for (const j of J) rest[j] = acc[j];
  const { mechClipList } = await import('/workbench/adapters/mechclips.js');
  const clips = mechClipList(m.def, m.animProfile).map((c) => c.name);
  for (const c of clips) {
    a.action = null;
    for (let i = 0; i < 60; i++) a.update(dt, ctx);
    a.play(c);
    if (!a.action) continue;
    const N = Math.round(a.action.clip.dur / dt);
    for (let i = 0; i < N; i++) { a.update(dt, ctx); sample(); }
  }
  const out = {};
  for (const j of J) out[j] = { rest: +rest[j].toFixed(4), mean: +(acc[j]/Math.max(1,n[j])).toFixed(4) };
  return out;
});
let tot = 0;
console.log('joint       rest    mean-over-clips   (fraction of body height)');
for (const [j, v] of Object.entries(res)) { console.log(j.padEnd(10), String(v.rest).padStart(7), String(v.mean).padStart(12)); tot += v.mean; }
console.log('TOTAL'.padEnd(10), ' '.repeat(7), tot.toFixed(4).padStart(12));
await browser.close();
