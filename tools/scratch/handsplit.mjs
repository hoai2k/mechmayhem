// GIVE A HAND ITS GEOMETRY BACK. When an auto-rig hands the whole forearm+hand
// to the ELBOW bone, the hand bone owns nothing and the fist deforms as part of
// the forearm — it looks like there is no hand there at all.
//
//   node tools/scratch/handsplit.mjs <mech> <elbowJoint> <handJoint> [out.json]
//
// The split is the NEAREST-BONE rule, which is what the proximity re-skin
// (reskin.js) would have drawn if it had been asked: every vertex the elbow
// currently owns that sits closer to the hand bone than to the elbow bone goes
// to the hand. Emits a PINNED skinOp — an explicit vertex list, not a `{comp:N}`
// ordinal — because an ordinal is an index into the partition the CURRENT rig
// draws and silently lands on other geometry the moment anything moves.
import { launch } from '../lib/browser.mjs';
import { writeFileSync } from 'fs';
const [mech = 'saurion', elbowJ = 'elbowL', handJ = 'handL', out = '/tmp/handsplit.json'] =
  process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 320, height: 240 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await p.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 150000 });

const res = await p.evaluate(({ elbowJ, handJ }) => {
  const m = window.__showcaseMechs[0];
  let mesh = null;
  m.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const sk = mesh.skeleton, g = mesh.geometry;
  const names = sk.bones.map((x) => x.name);
  const eb = m.boneMap[elbowJ], hb = m.boneMap[handJ];
  if (!eb || !hb) return { err: 'no such joint' };
  const ei = names.indexOf(eb.name), hi = names.indexOf(hb.name);
  const bi = g.attributes.skinIndex, bw = g.attributes.skinWeight, pos = g.attributes.position;
  // bone positions in the MESH's own local space, which is the space
  // `position` is in
  // BIND space, not posed space. `position` is the bind geometry, so the bones
  // have to be read where they were when the skin was bound — the posed bone
  // has walked away from it, and comparing the two silently answers "no vertex
  // is near the hand" no matter what the model looks like. three keeps the bind
  // pose in skeleton.boneInverses (the inverse of each bone's bind world
  // matrix); undo that, then take it back through bindMatrixInverse into the
  // space the position attribute lives in.
  const V3 = mesh.position.constructor;
  const bindPos = (idx) => {
    const m = sk.boneInverses[idx].clone().invert();
    return new V3().setFromMatrixPosition(m).applyMatrix4(mesh.bindMatrixInverse);
  };
  const E = bindPos(ei), H = bindPos(hi);
  // THE OTHER ARM IS THE TEMPLATE. This rig's arm bones are bunched at the
  // shoulder — elbow to hand is 0.036 while the arm's skin runs ten times that
  // — so neither "nearest bone" nor "far along the elbow->hand axis" can find a
  // hand: the bone positions simply do not describe the limb. What DOES is the
  // working side. Mirror each candidate vertex across the body's own lateral
  // mid-plane and keep the ones that land on geometry the reference hand owns.
  //
  // The lateral axis is measured from the two shoulders rather than assumed, so
  // this does not care which way the model was authored facing.
  const domOf = (v) => {
    let d = -1, w = 0;
    for (let k = 0; k < 4; k++) { const i = bi.getComponent(v, k), ww = bw.getComponent(v, k); if (ww > w) { w = ww; d = i; } }
    return d;
  };
  const mirrorJ = (j) => (j.endsWith('L') ? j.slice(0, -1) + 'R' : j.slice(0, -1) + 'L');
  const rHb = m.boneMap[mirrorJ(handJ)], rSb = m.boneMap[mirrorJ('shoulderL')] || m.boneMap.shoulderR;
  const sL = bindPos(names.indexOf(m.boneMap.shoulderL.name));
  const sR = bindPos(names.indexOf(m.boneMap.shoulderR.name));
  const dS = [sL.x - sR.x, sL.y - sR.y, sL.z - sR.z];
  const ax = dS.map(Math.abs).indexOf(Math.max(...dS.map(Math.abs)));   // 0=x 1=y 2=z
  const mid = [(sL.x + sR.x) / 2, (sL.y + sR.y) / 2, (sL.z + sR.z) / 2][ax];
  const rHi = names.indexOf(rHb.name);
  // the reference hand as a point cloud, on a coarse grid so the lookup is O(1)
  const CELL = 0.012;
  const key = (x, y, z) => `${Math.round(x / CELL)},${Math.round(y / CELL)},${Math.round(z / CELL)}`;
  const cloud = new Set();
  let refN = 0;
  for (let v = 0; v < pos.count; v++) {
    if (domOf(v) !== rHi) continue;
    refN++;
    cloud.add(key(pos.getX(v), pos.getY(v), pos.getZ(v)));
  }
  const midI = eb.parent && eb.parent.isBone ? names.indexOf(eb.parent.name) : -1;
  const verts = [];
  let keptE = 0;
  for (let v = 0; v < pos.count; v++) {
    const d = domOf(v);
    if (d !== ei && d !== midI) continue;
    const P = [pos.getX(v), pos.getY(v), pos.getZ(v)];
    P[ax] = 2 * mid - P[ax];                       // reflect onto the good side
    // a hit in the reference cloud, allowing one cell of slack for asymmetry
    let hit = false;
    for (let a1 = -1; a1 <= 1 && !hit; a1++) for (let b1 = -1; b1 <= 1 && !hit; b1++) for (let c1 = -1; c1 <= 1 && !hit; c1++) {
      if (cloud.has(key(P[0] + a1 * CELL, P[1] + b1 * CELL, P[2] + c1 * CELL))) hit = true;
    }
    if (hit) verts.push(v); else if (d === ei) keptE++;
  }
  return { elbowBone: eb.name, handBone: hb.name, moved: verts.length, keptE, verts,
    refHand: rHb.name, refN, lateralAxis: 'xyz'[ax], midBone: midI >= 0 ? names[midI] : null,
    elbowPos: [+E.x.toFixed(3), +E.y.toFixed(3), +E.z.toFixed(3)],
    handPos: [+H.x.toFixed(3), +H.y.toFixed(3), +H.z.toFixed(3)] };
}, { elbowJ, handJ });
await b.close();
if (res.err) { console.error(res.err); process.exit(1); }
console.log(`${mech}: ${elbowJ} (${res.elbowBone}) at ${res.elbowPos}, ${handJ} (${res.handBone}) at ${res.handPos}`);
console.log(`  reference hand ${res.refHand}: ${res.refN} verts (mirrored across the ${res.lateralAxis} mid-plane)`);
console.log(`  from ${res.elbowBone} + ${res.midBone}: ${res.moved} vertices move to the hand, ${res.keptE} stay`);
writeFileSync(out, JSON.stringify({ sel: { verts: res.verts }, to: res.handBone }));
console.log(`  op written to ${out}`);
