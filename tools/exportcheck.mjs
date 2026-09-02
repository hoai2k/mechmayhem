// exportcheck — does a portable export actually stand up on its own?
//
//   node tools/exportcheck.mjs <mechId> [...]   ·   --all   ·   --dir <dir>
//
// It loads `public/models/export/<id>.glb` with a PLAIN GLTFLoader — no
// manifest, no rig registry, no retarget, nothing from this game — and asks the
// four questions that decide whether it is any use to another engine:
//
//   SIZE + FACING   is it game-sized, standing on y=0, facing +z? (Compared with
//                   what the GAME builds, so this is the real number, not a
//                   plausible one.)
//   SKELETON        are the 15 game joints there BY NAME?
//   ANCHORS         is every runtime anchor present as a node, on the right
//                   bone, at the right place? (The house rule.)
//   ANIMATION       do the clips exist, and does playing one actually MOVE the
//                   bones — a track that binds to nothing is silent, not an
//                   error.
import { launch } from './lib/browser.mjs';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || '5175';
const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const DIR = path.resolve(ROOT, flag('dir', 'public/models/export'));
let ids = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (args.includes('--all')) {
  ids = fs.readdirSync(DIR).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, ''));
}
if (!ids.length) { console.error('usage: node tools/exportcheck.mjs <mechId> […] | --all'); process.exit(1); }

const JOINTS = ['hips', 'torso', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR',
  'elbowR', 'handR', 'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR'];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

let bad = 0;
for (const id of ids) {
  const glb = path.join(DIR, `${id}.glb`);
  if (!fs.existsSync(glb)) { console.log(`\n== ${id} ==\n   MISSING ${path.relative(ROOT, glb)}`); bad++; continue; }
  const side = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
  const rel = path.relative(path.join(ROOT, 'public'), glb).split(path.sep).join('/');

  const r = await page.evaluate(async ({ id, rel, JOINTS, wantAnchors }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const { ROSTER } = await import('/src/mechs/roster.js');
    const { buildGlbForTool } = await import('/src/mechs/gltf.js');

    // ---- the export, loaded cold ----
    const g = await new Promise((ok, no) => new GLTFLoader().load('/' + rel, ok, undefined, no));
    const scene = g.scene;
    scene.updateMatrixWorld(true);
    const bones = {}, nodes = {};
    scene.traverse((o) => { if (o.isBone) bones[o.name] = o; else nodes[o.name] = o; });

    // Real vertex extents (a bbox-of-bbox inflates with any residual yaw), over
    // the SKINNED meshes only. A game build is not just the file: GLB_DRESS and
    // the anim profile's build hook bolt PROCEDURAL geometry onto it — wraith's
    // cape is the loud one — and no export can contain something the game makes
    // at runtime. Counting it made the export look 20% too small in z, which is
    // the reference being wrong, not the export.
    const measure = (root) => {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      const v = new THREE.Vector3();
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const p = o.isSkinnedMesh ? o.geometry?.attributes?.position : null;
        if (!p) return;
        const step = Math.max(1, Math.floor(p.count / 20000));
        for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); min.min(v); max.max(v); }
      });
      return { size: max.clone().sub(min), min: min.clone() };
    };
    const got = measure(scene);

    // ---- what the GAME builds, as the reference ----
    const def = ROSTER.find((d) => d.id === id);
    const { mech } = await buildGlbForTool(def);
    mech.group.updateMatrixWorld(true);
    const ref = measure(mech.group);
    const rbm = mech.boneMap, V = THREE.Vector3;
    const refShoulder = rbm.shoulderL && rbm.shoulderR
      ? rbm.shoulderL.getWorldPosition(new V()).sub(rbm.shoulderR.getWorldPosition(new V())).normalize() : null;
    const gotShoulder = bones.shoulderL && bones.shoulderR
      ? bones.shoulderL.getWorldPosition(new V()).sub(bones.shoulderR.getWorldPosition(new V())).normalize() : null;

    // ---- anchors: present, on the right bone, AND IN THE RIGHT PLACE ----
    // The placement half is not a formality. An anchor is a rigid child of its
    // bone, so the pose-independent quantity is the LENGTH of its offset from
    // that bone, and comparing it as a fraction of body height cancels the
    // units — which is what makes the export and the posed game build
    // comparable at all. Folding the transform into the skeleton used to divide
    // every one of these by the model scale (titanus: all four at 0.111x, i.e.
    // 1/9.044, muzzleR arriving 1.2% of a body height from the palm instead of
    // 10.9%) and this check reported "all present, on the right bones".
    const anchorMiss = [], anchorOff = [], anchorMoved = [];
    const offsetOf = (node, host, H) => node.getWorldPosition(new V())
      .distanceTo(host.getWorldPosition(new V())) / H;
    for (const a of wantAnchors) {
      const n = nodes[a.node];
      if (!n) { anchorMiss.push(a.name); continue; }
      const host = n.parent;
      if (!host || host.name !== a.bone) { anchorOff.push(`${a.name}: on ${host?.name || '?'} not ${a.bone}`); continue; }
      // the same anchor on the live build, against its own host bone
      const refNode = mech.anchors?.[a.name];
      if (!refNode) continue;
      let refHost = null;
      for (let p = refNode.parent; p; p = p.parent) if (p.isBone) { refHost = p; break; }
      if (!refHost) continue;             // rides the virtual rig; nothing to compare
      const want = offsetOf(refNode, refHost, ref.size.y);
      const have = offsetOf(n, host, got.size.y);
      if (Math.abs(want - have) > 0.005) {
        anchorMoved.push(`${a.name}: ${(have * 100).toFixed(1)}% of height from ${a.bone}, authored at ${(want * 100).toFixed(1)}%`);
      }
    }

    // ---- animation ----
    // TWO questions, and the second is the one an importer actually depends on.
    //
    //   Does playing a clip MOVE anything? A track that binds to nothing is
    //   silent, not an error.
    //   Does the clip STATE THE WHOLE SKELETON? An AnimationMixer writes the
    //   bones a clip has tracks for and leaves every other bone where the last
    //   clip left it, so a clip that names only the joints it moves is not a
    //   pose — it is a delta onto whatever came before, and an attack imports
    //   as an upper body welded onto the previous animation. Inside this game
    //   the animator supplies the rest every frame; nothing outside it does.
    const clipReport = [];
    const mixer = new THREE.AnimationMixer(scene);
    const boneNames = Object.keys(bones);
    for (const clip of g.animations) {
      const before = Object.values(bones).map((b) => b.quaternion.clone());
      const act = mixer.clipAction(clip);
      act.reset(); act.play();
      mixer.setTime(Math.min(clip.duration * 0.5, clip.duration));
      scene.updateMatrixWorld(true);
      let moved = 0;
      Object.values(bones).forEach((b, i) => { if (b.quaternion.angleTo(before[i]) > 1e-4) moved++; });
      act.stop();
      const driven = new Set(clip.tracks.map((t) => t.name.split('.')[0]));
      const uncovered = boneNames.filter((n) => !driven.has(n));
      clipReport.push({ name: clip.name, dur: +clip.duration.toFixed(2), tracks: clip.tracks.length, moved,
        uncovered: uncovered.length, missing: uncovered.slice(0, 4) });
    }
    mixer.setTime(0);

    return {
      bones: Object.keys(bones).length,
      jointsFound: JOINTS.filter((j) => bones[j]).length,
      jointsMissing: JOINTS.filter((j) => !bones[j]),
      size: [+got.size.x.toFixed(3), +got.size.y.toFixed(3), +got.size.z.toFixed(3)],
      refSize: [+ref.size.x.toFixed(3), +ref.size.y.toFixed(3), +ref.size.z.toFixed(3)],
      minY: +got.min.y.toFixed(3),
      facingDeg: refShoulder && gotShoulder
        ? +(Math.acos(Math.max(-1, Math.min(1, refShoulder.dot(gotShoulder)))) * 180 / Math.PI).toFixed(2) : null,
      anchorMiss, anchorOff, anchorMoved,
      clips: clipReport, animations: g.animations.length,
    };
  }, { id, rel, JOINTS, wantAnchors: side.anchors });

  const sizeErr = Math.max(...[0, 1, 2].map((i) => Math.abs(r.size[i] - r.refSize[i]) / (r.refSize[i] || 1)));
  const dead = r.clips.filter((c) => c.moved === 0).map((c) => c.name);
  const partial = r.clips.filter((c) => c.uncovered > 0);
  const ok = r.jointsMissing.length === 0 && sizeErr <= 0.01 && (r.facingDeg ?? 0) <= 1
    && !r.anchorMiss.length && !r.anchorOff.length && !r.anchorMoved.length
    && r.animations > 0 && !dead.length && !partial.length;
  if (!ok) bad++;

  console.log(`\n== ${id} ==`);
  console.log(`   skeleton: ${r.bones} bones · ${r.jointsFound}/15 game joints by name`
    + `${r.jointsMissing.length ? '  MISSING: ' + r.jointsMissing.join(', ') : ''}`);
  console.log(`   size:     ${r.size.join(' x ')}   game builds ${r.refSize.join(' x ')}`
    + `   (${(sizeErr * 100).toFixed(2)}% off)   feet at y ${r.minY}`);
  console.log(`   facing:   ${r.facingDeg === null ? '(no shoulders)' : r.facingDeg + '° from the game build'}`);
  const anchorsOk = !r.anchorMiss.length && !r.anchorOff.length && !r.anchorMoved.length;
  console.log(`   anchors:  ${side.anchors.length} declared`
    + `${r.anchorMiss.length ? `   MISSING: ${r.anchorMiss.join(', ')}` : ''}`
    + `${r.anchorOff.length ? `   WRONG BONE: ${r.anchorOff.join('; ')}` : ''}`
    + `${r.anchorMoved.length ? `   MOVED: ${r.anchorMoved.join('; ')}` : ''}`
    + `${anchorsOk ? '   all present, on the right bones, where they were authored' : ''}`);
  console.log(`   clips:    ${r.animations}`
    + `   ${r.clips.reduce((s, c) => s + c.tracks, 0)} tracks`
    + `   ${dead.length ? `SILENT: ${dead.join(', ')}` : 'every clip moves bones'}`);
  console.log(`   coverage: ${partial.length ? `${partial.length} clip(s) DO NOT state the whole skeleton — `
    + partial.slice(0, 3).map((c) => `${c.name} (${c.uncovered} bones adrift: ${c.missing.join(', ')}…)`).join('; ')
    : `every clip states all ${r.bones} bones — a clip is a pose, not a delta`}`);
  console.log(`   ${ok ? 'PASS ✓ stands up with no game around it' : 'FAIL ✗'}`);
}
await page.close();
await browser.close();
if (errs.length) console.log('\npage errors:', errs.slice(0, 3));
if (bad) { console.log(`\n${bad} of ${ids.length} failed.`); process.exit(1); }
console.log(`\nall ${ids.length} exports check out.`);
