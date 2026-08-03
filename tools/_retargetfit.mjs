// How well do the mapped BONES follow the virtual humanoid joints they are
// driven from? Mean |bonePos - jointPos| over a clip, per joint, in body
// heights. A mirrored mapping drives an arm from the opposite arm's joint, so
// the bone is dragged to the wrong side of the body and this number explodes.
import { chromium } from 'playwright-core';
const mech = process.argv[2] || 'saurion';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
page.on('pageerror', e => console.error('PAGE ERROR', String(e).slice(0,300)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 45000 });
const res = await page.evaluate(async (clips) => {
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
}, ['saurionClawR','saurionClawL','saurionKick1','saurionKick2','saurionBite','taunt','walk']);
let tot = 0;
console.log('joint       rest    mean-over-clips   (fraction of body height)');
for (const [j, v] of Object.entries(res)) { console.log(j.padEnd(10), String(v.rest).padStart(7), String(v.mean).padStart(12)); tot += v.mean; }
console.log('TOTAL'.padEnd(10), ' '.repeat(7), tot.toFixed(4).padStart(12));
await browser.close();
