import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});
const p = await b.newPage({viewport:{width:320,height:200}});
p.on('pageerror', e=>console.error('ERR',String(e).slice(0,220)));
await p.goto('http://localhost:5173/?rigtest',{waitUntil:'networkidle'});
const out = await p.evaluate(async () => {
  const { loadRawGlbScene } = await import('/src/mechs/gltf.js');
  const res = {};
  for (const id of ['konga','tritone']) {
    const raw = await loadRawGlbScene(id);
    let mesh=null; raw.scene.traverse(o=>{ if(o.isSkinnedMesh&&!mesh) mesh=o; });
    raw.scene.updateMatrixWorld(true);
    const V = mesh.position.constructor;
    // bone positions in MESH-LOCAL space (what a rig file uses)
    const inv = mesh.matrixWorld.clone().invert();
    const bones = {};
    for (const bn of mesh.skeleton.bones) {
      const w = bn.getWorldPosition(new V()).applyMatrix4(inv);
      bones[bn.name] = [ +w.x.toFixed(3), +w.y.toFixed(3), +w.z.toFixed(3) ];
    }
    // overall mesh-local bbox of the rendered skin
    const pos = mesh.geometry.attributes.position;
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    const v=new V();
    const st=Math.max(1,Math.floor(pos.count/8000));
    for(let i=0;i<pos.count;i+=st){ v.fromBufferAttribute(pos,i);
      for(const d of [0,1,2]){const c=[v.x,v.y,v.z][d]; if(c<mn[d])mn[d]=c; if(c>mx[d])mx[d]=c;} }
    res[id] = { bbox:{min:mn.map(n=>+n.toFixed(3)), max:mx.map(n=>+n.toFixed(3))}, bones };
  }
  return res;
});
console.log(JSON.stringify(out,null,0));
await b.close();
