// THE ARM, BONE BY BONE. Walks each arm's bone chain in BIND space and reports
// every bone's parent, its distance from the parent, and how much skin it owns
// — so a mis-mapped joint (the game's `handL` pointing at a mid-forearm bone)
// separates from a correctly-mapped one that simply has no geometry.
//
//   node tools/scratch/bonechain.mjs <mech>
import { launch } from '../lib/browser.mjs';
const mech = process.argv[2] || 'saurion';
const b = await launch();
const p = await b.newPage({ viewport: { width: 320, height: 240 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await p.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 150000 });

const out = await p.evaluate(() => {
  const m = window.__showcaseMechs[0];
  let mesh = null;
  m.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const sk = mesh.skeleton, g = mesh.geometry;
  const names = sk.bones.map((x) => x.name);
  const V3 = mesh.position.constructor;
  const bindPos = (i) => new V3().setFromMatrixPosition(sk.boneInverses[i].clone().invert())
    .applyMatrix4(mesh.bindMatrixInverse);
  const bi = g.attributes.skinIndex, bw = g.attributes.skinWeight, pos = g.attributes.position;
  const owns = new Array(names.length).fill(0);
  for (let v = 0; v < pos.count; v++) {
    let d = -1, w = 0;
    for (let k = 0; k < 4; k++) {
      const i = bi.getComponent(v, k), ww = bw.getComponent(v, k);
      if (ww > w) { w = ww; d = i; }
    }
    if (d >= 0) owns[d]++;
  }
  // which game joint (if any) points at each bone
  const jointOf = {};
  for (const [j, bn] of Object.entries(m.boneMap || {})) if (bn) jointOf[bn.name] = j;
  // walk from each shoulder outward, following the first bone child each time
  const chain = (startJoint) => {
    const rows = [];
    let node = m.boneMap?.[startJoint];
    let guard = 0;
    while (node && guard++ < 10) {
      const i = names.indexOf(node.name);
      const P = bindPos(i);
      const par = node.parent && names.indexOf(node.parent.name) >= 0 ? node.parent : null;
      const d = par ? bindPos(names.indexOf(par.name)).distanceTo(P) : 0;
      rows.push({ bone: node.name, joint: jointOf[node.name] || '', verts: owns[i],
        fromParent: +d.toFixed(4) });
      node = node.children.find((c) => c.isBone);
    }
    return rows;
  };
  return { L: chain('shoulderL'), R: chain('shoulderR') };
});
await b.close();
for (const side of ['R', 'L']) {
  console.log(`\n--- ${side} arm`);
  console.log('bone            joint       verts   dist from parent');
  for (const r of out[side]) {
    console.log(`${r.bone.padEnd(15)} ${r.joint.padEnd(10)} ${String(r.verts).padStart(6)}   ${r.fromParent}`);
  }
}
