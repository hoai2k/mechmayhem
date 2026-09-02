// islandmap: list the skinned mesh's geometry islands (post-skinOps, live) with
// size, current dominant bone, animator role, and world centroid — the map you
// need to decide claw/leg reassignment.  node tools/islandmap.mjs <mechId>
import { launch } from './lib/browser.mjs';
const [mechId] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?showcase=${mechId}&anim=none&debug=3d`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs && window.__showcaseMechs[0], { timeout: 30000 });
const rows = await page.evaluate(async () => {
  const { analyzeSkin } = await import('/src/mechs/skinops.js');
  const THREE = await import('/node_modules/three/build/three.module.js');
  const mech = window.__showcaseMechs[0], engine = window.__showcaseEngine;
  engine.onUpdate = () => {};
  const ctx = { speed:0, maxSpeed:10, grounded:true, vy:0, alwaysReady:true };
  mech.animator.action = null;
  for (let i=0;i<60;i++) mech.animator.update(1/60, ctx);
  engine.scene.updateMatrixWorld(true);
  let mesh = null; mech.group.traverse((o)=>{ if(o.isSkinnedMesh && !mesh) mesh=o; });
  const a = analyzeSkin(mesh);
  const roleOf = {};
  for (const e of mech.adapter.entries) roleOf[e.bone.name] = e.jname;
  const v = new THREE.Vector3();
  const worldCentroid = (verts) => {
    const c = new THREE.Vector3();
    const step = Math.max(1, Math.floor(verts.length / 200));
    let cnt = 0;
    for (let i=0;i<verts.length;i+=step){ v.fromBufferAttribute(mesh.geometry.attributes.position, verts[i]); (mesh.applyBoneTransform||mesh.boneTransform).call(mesh, verts[i], v); mesh.localToWorld(v); c.add(v); cnt++; }
    return c.multiplyScalar(1/cnt);
  };
  return a.comps.filter((c)=>c.count>=200).map((c)=>{
    const wc = worldCentroid(c.verts);
    return { id: c.id, verts: c.count, bone: c.boneName, role: roleOf[c.boneName]||'', wc: [+wc.x.toFixed(2), +wc.y.toFixed(2), +wc.z.toFixed(2)] };
  });
});
console.log('id'.padStart(4), 'verts'.padStart(7), 'bone'.padEnd(22), 'role'.padEnd(10), 'worldCentroid[x,y,z]  (front≈+z, up=+y)');
for (const r of rows) console.log(String(r.id).padStart(4), String(r.verts).padStart(7), r.bone.padEnd(22), (r.role||'·').padEnd(10), JSON.stringify(r.wc));
await browser.close();
