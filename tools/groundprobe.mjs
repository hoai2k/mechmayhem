// GROUND PROBE — does any of this mech go through the floor?
//
//   node tools/groundprobe.mjs <mech> [--frames 14] [--stride 7] [--all]
//
// A mech's feet are calibrated (animator.calibrateFeet, tools/ankleprobe.mjs)
// but nothing checks the REST of him, and the rest of him is what a player
// notices: a horn buried in the pavement, a chin through the road, a hand
// under the arena during a charge. That is a per-CLIP fault — one keyframe
// dropping the body further than the geometry allows — and it is invisible in
// any joint-space measurement, because the joint is fine and the mesh hanging
// off it is not.
//
// So this measures the MESH. Every clip the mech can actually play (the same
// list the workbenches use), sampled across its length, CPU-skinned at each
// sample, reporting the lowest world-space vertex and where it sits relative
// to the floor the mech is standing on.
//
//   sole    the lowest point when he is simply STANDING. This is the
//           reference, not zero: a rig can carry a small standing offset and
//           what matters is how far a clip drops BELOW its own rest.
//   min     the lowest point that clip reaches, in world units.
//   under   how far under the floor that is. Anything positive is geometry
//           inside the ground.
//   part    the bone that owns the offending vertex, which is the thing to
//           fix — it names the limb, and usually the key.
//
// A CONTACT LIMB IS ALLOWED TO DIG IN. A hand pressing on the floor or a hoof
// taking weight may sit slightly under it — that is what contact looks like,
// and holding a foot to a hairline would just make him hover. So the limit is
// per-part: generous for the things that grip the world (hands, feet, claws,
// hooves, toes), tight for everything else. A HORN through the pavement is a
// bug at a millimetre of the depth a palm is fine at.
//
// Vertices are sampled on a stride (a few thousand per frame, spread evenly
// through the buffer) — the lowest point of a mech is a horn tip or a hoof,
// features hundreds of vertices wide, so a stride finds them while a full
// scan of every clip would take minutes per mech.
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : Number(args[i + 1]); };
const ids = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const MECH = ids[0] || 'tritone';
const FRAMES = flag('frames', 14);
const STRIDE = flag('stride', 7);
const ALL = args.includes('all') || args.includes('--all');

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?showcase=${MECH}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);

const out = await page.evaluate(async ({ FRAMES, STRIDE, ALL }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { CLIPS } = await import('/src/mechs/animations.js');
  const { mechClipList } = await import('/workbench/adapters/mechclips.js');
  const { floorGuard } = await import('/src/combat/floorguard.js');
  const mech = window.__showcaseMechs?.[0];
  if (!mech) return { err: 'no showcase mech' };
  const anim = mech.animator;
  const def = mech.def;

  // the skinned body, and the bone each sampled vertex answers to
  let skin = null;
  mech.group.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o; });
  if (!skin) return { err: 'no skinned mesh (procedural build?)' };
  const pos = skin.geometry.attributes.position;
  const skinIndex = skin.geometry.attributes.skinIndex;
  const skinWeight = skin.geometry.attributes.skinWeight;
  const boneNames = skin.skeleton.bones.map((b) => b.name);
  const v = new THREE.Vector3();

  const lowest = () => {
    mech.group.updateMatrixWorld(true);
    let minY = Infinity, at = -1;
    for (let i = 0; i < pos.count; i += STRIDE) {
      v.fromBufferAttribute(pos, i);
      skin.applyBoneTransform(i, v);
      skin.localToWorld(v);
      if (v.y < minY) { minY = v.y; at = i; }
    }
    // whichever bone carries most of that vertex
    let bone = '?';
    if (at >= 0) {
      let best = -1;
      for (let c = 0; c < 4; c++) {
        const w = skinWeight.getComponent(at, c);
        if (w > best) { best = w; bone = boneNames[skinIndex.getComponent(at, c)] || '?'; }
      }
    }
    return { y: minY, bone };
  };

  // THE GAME FLOOR-CLAMPS A PRONE BODY (Fighter.update calls mech.groundClamp
  // for knockdown/getup), so a probe that skips it reports every mech's
  // knockdown as metres of buried tail. Replicate it exactly, for the same
  // clips, or the report is measuring the harness rather than the game.
  // PRONE CLIPS BELONG TO tools/proneprobe.mjs. A downed body is laid on the
  // floor by its own system (gltf.js' prone clamp), which has its own rules,
  // its own measurement and its own tool; replicating it here means keeping a
  // second copy of somebody else's logic in step, and the moment it drifts
  // this tool reports metres of buried tail for a body their probe says is
  // resting perfectly. Measure what this tool owns — the standing clips.
  const PRONE = new Set(['knockdown', 'getup', 'dead', 'flipOver', 'proneBack',
    'rollUpR', 'rollUpL', 'ragdoll']);
  let clamping = false;
  const step = (dt) => {
    anim.update(dt, {
      speed: 0, maxSpeed: 10, grounded: true, vy: 0,
      state: clamping ? 'knockdown' : 'normal',
    });
    mech.groundClamp?.(clamping);
    // the same post-pose correction Fighter.update applies, so what is
    // measured here is what the game shows (combat/floorguard.js)
    // ...and the guard, which the game runs in the same slot — but never
    // together with the prone clamp: they write the same offset (see
    // Fighter.update).
    if (mech.def.floorGuard && !clamping) floorGuard(guardSubject, dt, 0);
    else if (clamping) guardSubject._floorLift = 0;
  };
  const guardSubject = { def: mech.def, mech, scale: mech.dims?.scale || 1 };
  // the guard is a damped servo, so a clip that starts already buried needs a
  // few frames to be lifted clear — settle it the way a real frame sequence
  // would, rather than measuring the first frame of the correction

  // REST first: the mech standing, which is the reference every clip is
  // measured against (a rig may legitimately sit a hair into the floor).
  anim.stop(0);
  for (let i = 0; i < 40; i++) step(1 / 60);
  const rest = lowest();

  // mechClipList hands back {name, role} — the roles are what the workbenches
  // label the list with; here only the names matter.
  const listed = mechClipList(def, mech.animProfile || null);
  const names = ALL ? Object.keys(CLIPS) : listed.map((c) => c.name);
  const rows = [];
  const skipped = [];
  for (const name of names) {
    const clip = CLIPS[name];
    if (!clip) continue;
    if (PRONE.has(name)) { skipped.push(name); continue; }
    clamping = false;
    anim.stop(0);
    for (let i = 0; i < 20; i++) step(1 / 60);   // back to rest between clips
    clamping = PRONE.has(name);
    anim.play(name, { fade: 0 });
    let worst = { y: Infinity, bone: '?', t: 0 };
    const dur = clip.dur || 1;
    for (let k = 0; k <= FRAMES; k++) {
      // walk the clip in real time so the smoother is in the state it would
      // really be in — a pose sampled by teleporting the clock is a pose the
      // game never shows
      const target = (k / FRAMES) * dur;
      let guard = 0;
      while ((anim.action?.t ?? dur) < target && guard++ < 400) step(1 / 120);
      const lo = lowest();
      if (lo.y < worst.y) worst = { ...lo, t: target };
      worst.lift = Math.max(worst.lift || 0, guardSubject._floorLift || 0);
    }
    rows.push({ name, ...worst });
  }
  return { rest, rows, skipped, clips: names.length, scale: mech.dims?.scale || 1, verts: pos.count, sampled: Math.ceil(pos.count / STRIDE) };
}, { FRAMES, STRIDE, ALL });

if (out.err) { console.error(out.err); await browser.close(); process.exit(1); }
console.log(`${MECH}: ${out.sampled} of ${out.verts} vertices sampled per frame, ${FRAMES + 1} frames per clip`);
console.log(`standing, the lowest geometry sits at y=${out.rest.y.toFixed(3)} (${out.rest.bone})\n`);
// how deep a part may legitimately go, as a fraction of the mech's own scale
// ...and a TAIL counts here too: it is not a locking point, but a tail tip
// brushing the floor is contact, not a bug, and the engine classifies it the
// same way (gltf.js keeps it out of the core measurement so a dragging tail
// cannot lift a prone body).
const CONTACT = /^(hand|foot|toe|hoof|claw|ankle|paw|finger|thumb)/i;
// A TAIL IS LOOSER STILL. It hangs near the deck by design and dragging is
// what it should look like; the engine treats it the same way (gltf.js keeps
// it out of the core measurement, and combat/floorguard.js gives it its own,
// wider allowance) because holding a trailing tail off the floor lifts the
// entire animal.
const TAILISH = /^tail/i;
const allow = (bone) => (TAILISH.test(bone) ? 0.6 : CONTACT.test(bone) ? 0.35 : 0.06) * (out.scale || 1);

console.log('clip                      min y   under   part            limit');
const bad = [];
for (const r of out.rows.sort((a, b) => a.y - b.y)) {
  const under = -r.y;
  const lim = allow(r.bone);
  const over = under > lim;
  if (over) bad.push(r);
  console.log(`${r.name.padEnd(22)}${r.y.toFixed(3).padStart(8)}` +
    `${under > 0 ? under.toFixed(3).padStart(8) : '       -'}   ${r.bone.padEnd(14)}` +
    `${lim.toFixed(2).padStart(6)}${over ? '  <-- THROUGH THE FLOOR' : ''}`);
}
if (out.skipped?.length) {
  console.log(`\n(${out.skipped.join(', ')} are prone clips — see tools/proneprobe.mjs)`);
}
console.log(`${out.rows.length} clips checked. ` + (bad.length
  ? `FAIL: ${bad.length} put geometry under the arena floor`
  : 'nothing is under the floor beyond what a contact limb may dig in.'));
if (errors.length) console.log('page errors:', errors.slice(0, 3));
await browser.close();
process.exit(bad.length ? 1 : 0);
