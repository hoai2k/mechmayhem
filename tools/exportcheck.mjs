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
import { chromium } from 'playwright-core';
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

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
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

    // ---- anchors ----
    const anchorMiss = [], anchorOff = [];
    for (const a of wantAnchors) {
      const n = nodes[a.node];
      if (!n) { anchorMiss.push(a.name); continue; }
      const host = n.parent;
      if (!host || host.name !== a.bone) anchorOff.push(`${a.name}: on ${host?.name || '?'} not ${a.bone}`);
    }

    // ---- animation: does playing one MOVE anything? ----
    const clipReport = [];
    const mixer = new THREE.AnimationMixer(scene);
    for (const clip of g.animations) {
      const before = Object.values(bones).map((b) => b.quaternion.clone());
      const act = mixer.clipAction(clip);
      act.reset(); act.play();
      mixer.setTime(Math.min(clip.duration * 0.5, clip.duration));
      scene.updateMatrixWorld(true);
      let moved = 0;
      Object.values(bones).forEach((b, i) => { if (b.quaternion.angleTo(before[i]) > 1e-4) moved++; });
      act.stop();
      clipReport.push({ name: clip.name, dur: +clip.duration.toFixed(2), tracks: clip.tracks.length, moved });
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
      anchorMiss, anchorOff,
      clips: clipReport, animations: g.animations.length,
    };
  }, { id, rel, JOINTS, wantAnchors: side.anchors });

  const sizeErr = Math.max(...[0, 1, 2].map((i) => Math.abs(r.size[i] - r.refSize[i]) / (r.refSize[i] || 1)));
  const dead = r.clips.filter((c) => c.moved === 0).map((c) => c.name);
  const ok = r.jointsMissing.length === 0 && sizeErr <= 0.01 && (r.facingDeg ?? 0) <= 1
    && !r.anchorMiss.length && !r.anchorOff.length && r.animations > 0 && !dead.length;
  if (!ok) bad++;

  console.log(`\n== ${id} ==`);
  console.log(`   skeleton: ${r.bones} bones · ${r.jointsFound}/15 game joints by name`
    + `${r.jointsMissing.length ? '  MISSING: ' + r.jointsMissing.join(', ') : ''}`);
  console.log(`   size:     ${r.size.join(' x ')}   game builds ${r.refSize.join(' x ')}`
    + `   (${(sizeErr * 100).toFixed(2)}% off)   feet at y ${r.minY}`);
  console.log(`   facing:   ${r.facingDeg === null ? '(no shoulders)' : r.facingDeg + '° from the game build'}`);
  console.log(`   anchors:  ${side.anchors.length} declared`
    + `${r.anchorMiss.length ? `   MISSING: ${r.anchorMiss.join(', ')}` : ''}`
    + `${r.anchorOff.length ? `   WRONG BONE: ${r.anchorOff.join('; ')}` : ''}`
    + `${!r.anchorMiss.length && !r.anchorOff.length ? '   all present, on the right bones' : ''}`);
  console.log(`   clips:    ${r.animations}`
    + `   ${r.clips.reduce((s, c) => s + c.tracks, 0)} tracks`
    + `   ${dead.length ? `SILENT: ${dead.join(', ')}` : 'every clip moves bones'}`);
  console.log(`   ${ok ? 'PASS ✓ stands up with no game around it' : 'FAIL ✗'}`);
}
await page.close();
await browser.close();
if (errs.length) console.log('\npage errors:', errs.slice(0, 3));
if (bad) { console.log(`\n${bad} of ${ids.length} failed.`); process.exit(1); }
console.log(`\nall ${ids.length} exports check out.`);
