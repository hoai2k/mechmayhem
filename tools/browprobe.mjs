// browprobe: WHAT DO THE BROWS ACTUALLY DO? — the audit behind face.js.
//
//   node tools/browprobe.mjs <mech> [--clips a,b] [--frames 24] [--all]
//
// A brow is allowed to RAISE AND LOWER. It is not allowed to swing sideways:
// a bony ridge over the eye has one hinge, and lateral travel reads instantly
// as the face coming apart. Both are easy to write by accident, because the
// performance is authored as `rotation.x` and what THAT means depends on which
// way the rig's bind frame points — on the game's own joints local x IS the
// lateral hinge, and on a custom rig authored in the raw GLB's frame it is the
// FORWARD axis, so the same line pitches on one route and rolls on the other.
//
// So the measurement is not the angle, it is where the brow GOES. Each frame
// the brow's tip is expressed in the HEAD's own frame and compared with where
// it sits at rest, split into:
//
//   lift   — travel along the head's up axis (what a brow is for)
//   side   — travel along the head's lateral axis (what it must never do)
//   fwd    — travel along the head's forward axis (a furrow; harmless)
//
// reported as a percentage of body height, worst frame per clip. `side` should
// be a rounding error next to `lift`.
//
// Needs the dev server (npm run dev) on :5173.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const has = (n) => args.includes('--' + n);
const mech = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!mech) { console.error('usage: node tools/browprobe.mjs <mech> [--clips a,b] [--frames 24]'); process.exit(1); }

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none&debug=3d`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__showcaseMechs && window.__showcaseMechs[0], null, { timeout: 120000 });

const out = await page.evaluate(async ({ mech, want, frames }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { mechClipList } = await import('/workbench/adapters/mechclips.js');
  const { CLIPS } = await import('/src/mechs/animations.js');
  const { ROSTER } = await import('/src/mechs/roster.js');
  const { profileFor } = await import('/src/mechs/glbanim.js');
  const engine = window.__showcaseEngine;
  engine.onUpdate = () => {};
  const m = window.__showcaseMechs[0];
  const def = ROSTER.find((d) => d.id === mech);
  const anim = m.premadeAnimator || m.animator;
  const browL = anim.part('browL'), browR = anim.part('browR');
  if (!browL || !browR) return { error: `${mech} has no brow joints` };
  // the reference frame is the brow's OWN PARENT, not `part('head')`: on a GLB
  // build those are two different objects (the retarget's virtual joint and the
  // rig's actual head bone, in two different frames), and mixing them reports
  // the head's whole gesture as brow travel.
  const head = browL.parent;

  const clips = want?.length ? want
    : mechClipList(def, m.animProfile || profileFor(mech)).map((c) => c.name || c);
  // body height in the same units the probe measures in (head-local = the
  // rig's own bind units), so a percentage means the same thing on any mech
  engine.scene.updateMatrixWorld(true);
  const worldBox = new THREE.Box3().setFromObject(m.group);
  const headScale = new THREE.Vector3();
  head.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), headScale);
  const bodyH = (worldBox.max.y - worldBox.min.y) / Math.max(1e-6, headScale.x);

  // WHAT THE PLAYER SEES is the RIDGE, not the hinge, so the probe points are
  // the brow's own geometry: the corners of the bone-local bounding box of the
  // vertices that bone dominates. A roll about a bone whose geometry sticks out
  // to the side moves nothing at the hinge and a lot at the ends.
  let skin = null;
  m.group.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o; });
  const cornersOf = (bone) => {
    if (!skin) return [new THREE.Vector3(0, 0, 0)];
    const bi = skin.skeleton.bones.indexOf(bone);
    if (bi < 0) return [new THREE.Vector3(0, 0, 0)];
    const pos = skin.geometry.attributes.position;
    const jnt = skin.geometry.attributes.skinIndex, wgt = skin.geometry.attributes.skinWeight;
    // bind-space, not mesh-space: boneInverses map BIND-WORLD -> bone-local, and
    // the geometry is in the mesh's own space, so the bindMatrix has to come
    // first (leaving it out scales every offset by the model scale, which reads
    // as a brow ridge reaching most of a body height)
    const inv = new THREE.Matrix4().multiplyMatrices(skin.skeleton.boneInverses[bi], skin.bindMatrix);
    const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
    const v = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      let bw = -1, bj = 0;
      for (let k = 0; k < 4; k++) { const w = wgt.getComponent(i, k); if (w > bw) { bw = w; bj = jnt.getComponent(i, k); } }
      if (bj !== bi) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(inv);      // bind -> bone-local
      mn.min(v); mx.max(v); n++;
    }
    if (!n) return [new THREE.Vector3(0, 0, 0)];
    const out = [];
    for (const x of [mn.x, mx.x]) for (const y of [mn.y, mx.y]) for (const z of [mn.z, mx.z]) out.push(new THREE.Vector3(x, y, z));
    return out;
  };
  const corners = { L: cornersOf(browL), R: cornersOf(browR) };

  // THE HEAD'S AXES, MEASURED — never assumed. A rig authored in the raw GLB's
  // bind space does not agree with the game's own joint frame about which local
  // axis is which, and assuming one of them is how a lateral swing gets
  // reported as a lift. Lateral comes from the two brows themselves, up from
  // world up at rest, forward from their cross product.
  const headInv = new THREE.Matrix4();
  engine.scene.updateMatrixWorld(true);
  headInv.copy(head.matrixWorld).invert();
  const lateral = new THREE.Vector3().subVectors(browR.position, browL.position);
  if (lateral.lengthSq() < 1e-9) lateral.set(1, 0, 0);
  lateral.normalize();
  const up = new THREE.Vector3(0, 1, 0).transformDirection(headInv).normalize();
  const fwdAx = new THREE.Vector3().crossVectors(up, lateral).normalize();

  const p = new THREE.Vector3();
  const probe = (part, pts) => {
    engine.scene.updateMatrixWorld(true);
    headInv.copy(head.matrixWorld).invert();
    return pts.map((c) => p.copy(c).applyMatrix4(part.matrixWorld).applyMatrix4(headInv).clone());
  };

  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true, state: 'idle' };
  // rest reference: no clip, a few frames to settle
  anim.action = null;
  for (let i = 0; i < 30; i++) anim.update(1 / 60, ctx);
  const rest = { L: probe(browL, corners.L), R: probe(browR, corners.R) };
  const rows = [];
  for (const name of clips) {
    const clip = CLIPS[name];
    if (!clip) continue;
    anim.action = null;
    for (let i = 0; i < 10; i++) anim.update(1 / 60, ctx);
    try { anim.play(name); } catch (e) { continue; }
    let side = 0, lift = 0, fwd = 0, sideAt = 0, liftAt = 0, ang = 0;
    const dur = Math.max(clip.dur || 0.6, 0.3);
    const steps = Math.max(6, Math.round(dur * 60));
    for (let i = 0; i < steps; i++) {
      anim.update(1 / 60, ctx);
      for (const [k, part] of [['L', browL], ['R', browR]]) {
        ang = Math.max(ang, Math.abs(2 * Math.acos(Math.min(1, Math.abs(part.quaternion.w)))) * 180 / Math.PI);
        const now = probe(part, corners[k]);
        for (let j = 0; j < now.length; j++) {
          const d = now[j].clone().sub(rest[k][j]);
          const sd = Math.abs(d.dot(lateral)), lf = Math.abs(d.dot(up)), fw = Math.abs(d.dot(fwdAx));
          if (sd > side) { side = sd; sideAt = i / 60; }
          if (lf > lift) { lift = lf; liftAt = i / 60; }
          if (fw > fwd) fwd = fw;
        }
      }
    }
    rows.push({ clip: name, side: 100 * side / bodyH, lift: 100 * lift / bodyH, fwd: 100 * fwd / bodyH, sideAt, liftAt, ang });
  }
  // how far the ridge reaches from its hinge — the lever the angle acts on
  const reach = Math.max(...['L', 'R'].flatMap((k) => corners[k].map((c) => c.length()))) / bodyH;
  return { mech, bodyH, rows, clips: clips.length, reach: 100 * reach };
}, { mech, want: (flag('clips', '') || '').split(',').filter(Boolean), frames: +flag('frames', 24) });

if (out.error) { console.error(out.error); await browser.close(); process.exit(1); }
const rows = out.rows.sort((a, b) => b.side - a.side || b.lift - a.lift);
console.log(`\n=== ${out.mech} brows — ${rows.length} clip(s), travel of the brow tip in the HEAD's frame, `
  + `% of body height (${out.bodyH.toFixed(2)} units) ===`);
console.log(`ridge reaches ${out.reach.toFixed(1)}% of body height from its hinge — that is the lever the angle acts on`);
console.log('clip'.padEnd(20) + 'side%'.padStart(8) + 'lift%'.padStart(8) + 'fwd%'.padStart(8) + 'angle°'.padStart(8) + '   worst side at');
for (const r of rows) {
  if (!has('all') && r.side < 0.01 && r.lift < 0.01) continue;
  console.log(r.clip.padEnd(20) + r.side.toFixed(2).padStart(8) + r.lift.toFixed(2).padStart(8)
    + r.fwd.toFixed(2).padStart(8) + r.ang.toFixed(1).padStart(8) + `   t=${r.sideAt.toFixed(2)}`);
}
const worst = rows[0];
console.log(`\nworst LATERAL: ${worst.clip} ${worst.side.toFixed(2)}% of body height`
  + `  ·  biggest LIFT: ${rows.slice().sort((a, b) => b.lift - a.lift)[0].clip} `
  + `${Math.max(...rows.map((r) => r.lift)).toFixed(2)}%`);
await browser.close();
