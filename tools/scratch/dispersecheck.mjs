// Is the apparition actually there? Reports the detached shell's presence,
// size, opacity and world bounding box across wraith's taunt exit.
//   node tools/scratch/dispersecheck.mjs
import { launch } from '../lib/browser.mjs';

const b = await launch();
const page = await b.newPage({ viewport: { width: 420, height: 320 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/?battle=neon&p1=wraith&p2=titanus&auto=0', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__world?.fighters?.length >= 2, { timeout: 60000 });
await page.waitForTimeout(4000);

const out = await page.evaluate(() => {
  const w = window.__world, eng = window.__engine, THREE = window.__THREE;
  const f = w.fighters[0], e = w.fighters[1];
  f.pos.set(0, 0, 0); f.yaw = 0;
  e.pos.set(60, 0, 0); e.isAI = false; e.ai = null;
  eng.paused = true;
  const rows = [];
  const sameScene = w.scene === eng.scene;
  const look = (label) => {
    const shells = [];
    w.scene.traverse((o) => {
      if (o.isGroup && o.children.some((c) => c.userData?.bakedGeo)) shells.push(o);
    });
    const r = { label, bodyScale: +f.scale.toFixed(2), shells: shells.length };
    let bodyOp = 1;
    f.group.traverse((o) => { if (o.isMesh) bodyOp = Math.min(bodyOp, o.material.opacity); });
    r.bodyOp = +bodyOp.toFixed(2);
    if (shells.length) {
      const s = shells[0];
      const box = new THREE.Box3().setFromObject(s);
      r.shellScale = +s.scale.x.toFixed(2);
      r.shellOp = +s.children[0].material.opacity.toFixed(2);
      r.meshes = s.children.length;
      r.baked = s.children.filter((c) => c.userData?.bakedGeo).length;
      r.h = +(box.max.y - box.min.y).toFixed(2);
      r.y0 = +box.min.y.toFixed(2);
      r.visible = s.visible && s.parent === w.scene;
    }
    rows.push(r);
  };
  // count the mech's own meshes for comparison
  let bodyMeshes = 0, skinned = 0;
  f.mech.group.traverse((o) => { if (o.isMesh) { bodyMeshes++; if (o.isSkinnedMesh) skinned++; } });
  f.animator.play('taunt');
  eng.step(2.6); look('taunt, near the end');
  eng.step(0.28); look('+0.02 past the end');
  eng.step(0.10); look('+0.12');
  eng.step(0.15); look('+0.27');
  eng.step(0.15); look('+0.42');
  eng.step(0.15); look('+0.57 (done)');
  return { sameScene, bodyMeshes, skinned, rows };
});
await b.close();
console.log(`world.scene === engine.scene : ${out.sameScene}`);
console.log(`wraith meshes: ${out.bodyMeshes} (${out.skinned} skinned)\n`);
for (const r of out.rows) {
  console.log(`  ${r.label.padEnd(22)} body x${r.bodyScale} op ${r.bodyOp}`
    + (r.shells ? `  |  shell x${r.shellScale} op ${r.shellOp} meshes ${r.meshes}(${r.baked} baked)`
      + ` h=${r.h} y0=${r.y0} vis=${r.visible}` : '  |  no shell'));
}
if (errs.length) console.log('\nPAGE MESSAGES:\n' + errs.join('\n'));
