// bonehighlight: paint the skinned mesh by which virtual joint drives each
// vertex — arm joints RED, leg joints BLUE, everything else gray. Answers
// "is the giant claw actually driven by the arm bones, or by a leg chain?"
//   node tools/bonehighlight.mjs <mechId> [outPrefix]
import { launch } from './lib/browser.mjs';
const [mechId, prefix = `/tmp/bhl_${mechId}`] = process.argv.slice(2);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:5173/?showcase=${mechId}&anim=none&debug=3d`,
  { waitUntil: 'networkidle' }).catch((e) => errors.push(String(e)));
await page.waitForFunction(() => window.__showcaseMechs && window.__showcaseMechs[0], { timeout: 30000 });

const legend = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const mech = window.__showcaseMechs[0];
  const engine = window.__showcaseEngine;
  engine.onUpdate = () => {};
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  mech.animator.action = null;
  for (let i = 0; i < 60; i++) mech.animator.update(1 / 60, ctx);

  const ARM = ['shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR'];
  const LEG = ['thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR'];
  // bone name -> role. left arm = red, right arm = orange; left leg = blue, right leg = cyan
  const role = {};
  for (const e of mech.adapter.entries) {
    if (ARM.includes(e.jname)) role[e.bone.name] = e.jname.endsWith('L') ? 'armL' : 'armR';
    else if (LEG.includes(e.jname)) role[e.bone.name] = e.jname.endsWith('L') ? 'legL' : 'legR';
  }
  const COL = {
    armL: [1.0, 0.05, 0.05], armR: [1.0, 0.55, 0.0],
    legL: [0.1, 0.2, 1.0], legR: [0.0, 0.8, 1.0],
    none: [0.28, 0.28, 0.3],
  };
  let mesh = null;
  mech.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const geo = mesh.geometry;
  const jnt = geo.attributes.skinIndex, wgt = geo.attributes.skinWeight;
  const n = geo.attributes.position.count;
  const bones = mesh.skeleton.bones;
  const col = new Float32Array(n * 3);
  const counts = { armL: 0, armR: 0, legL: 0, legR: 0, none: 0 };
  for (let i = 0; i < n; i++) {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) { const w = wgt.getComponent(i, k); if (w > bw) { bw = w; bi = jnt.getComponent(i, k); } }
    const r = role[bones[bi].name] || 'none';
    counts[r]++;
    const c = COL[r];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // flatten material to show the vertex colors clearly
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    m.vertexColors = true; m.map = null; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null;
    m.emissiveMap = null; m.aoMap = null; m.color && m.color.set(0xffffff);
    m.metalness = 0.0; m.roughness = 1.0; m.needsUpdate = true;
  }
  return counts;
});

// screenshot from the default showcase camera (front 3/4), then rotate the mech
await page.screenshot({ path: `${prefix}_front.png` });
await page.evaluate(() => { window.__showcaseMechs[0].group.rotation.y = Math.PI; window.__showcaseEngine.scene.updateMatrixWorld(true); });
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}_back.png` });
await page.evaluate(() => { window.__showcaseMechs[0].group.rotation.y = Math.PI / 2; window.__showcaseEngine.scene.updateMatrixWorld(true); });
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}_side.png` });

console.log('vertex counts by role (armL=red armR=orange legL=blue legR=cyan none=gray):');
console.log(JSON.stringify(legend, null, 1));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
