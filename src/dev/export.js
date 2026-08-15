// ?export=<id> — THE PORTABLE MECH. Headless; renders nothing.
//
// tools/bake-glb.mjs finalizes a model FOR THIS GAME: it folds in everything
// that describes the model and deliberately leaves behind what describes the
// game's use of it, because the game is still there to supply that. An export
// has no game behind it, so it has to carry the lot — and three things the
// shipped asset has never contained at all:
//
//   THE TRANSFORM. `yawOffset` and `modelScale` x `heightScale` are manifest
//     numbers, so an importer gets a model facing the wrong way at a ninth of
//     its size (jerry: 270 degrees and 15.0124 x 0.59). Folded here through
//     bakeMechScene's `transform` option — into the vertices and the bone rest
//     offsets, so native units ARE game units.
//   THE ANCHORS. Every muzzle, booster and core anchor is built at RUNTIME from
//     the manifest and exists nowhere in the file. They are hand-placed and
//     under a house rule that re-rigging must never lose them, so they are
//     written as empty NODES parented to the bone they ride — which every
//     engine reads.
//   THE ANIMATION. Every shipped GLB has `animations: 0`: the whole library is
//     procedural (121 shared clips, 49 per-mech variants, plus a gait engine
//     that is a cycle rather than a clip). Sampled here through the REAL
//     animator, so what is exported is what ships, and written as ordinary
//     glTF keyframe tracks.
//
// The gait is not a clip and never was — it is a phase function of ground
// speed — so it is sampled at the two speeds the game itself names (the loose
// walk at 0.45 of top, the full run at 1.0) and emitted as looping clips. That
// is a lossy but honest translation: an engine that wants the in-between blends
// the two, which is what the crossfade does anyway.
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import { bakeMechScene, buildGlbForTool } from '../mechs/gltf.js';
import { ROSTER } from '../mechs/roster.js';
import { profileFor } from '../mechs/glbanim.js';
import { mechClips } from '../../workbench/adapters/mechclips.js';
import { moveSpeedFor } from '../combat/fighter.js';

const FPS = 30;
// Which model bone a runtime anchor belongs to when it rides the VIRTUAL rig
// rather than a model bone (core/overhead/boost* are built on the game's own
// skeleton, which does not exist outside the game).
const VIRTUAL_HOME = { core: 'torso', overhead: 'head', boostL: 'ankleL', boostR: 'ankleR' };

// The anchor's transform in the frame of the model bone it should hang off.
// Pose-independent by construction — it is a rigid child of that bone — so it
// can be read from a POSED build and applied to a BIND-pose skeleton.
function anchorLocals(mech) {
  mech.group.updateMatrixWorld(true);
  const out = [];
  for (const [name, a] of Object.entries(mech.anchors || {})) {
    if (!a) continue;
    // NEAREST BONE, not nearest mapped JOINT. An authored muzzle routinely
    // names a bone that is not one of the 15 — titanus hangs his boosters off
    // `stackL`/`stackR`, viper her blades off the forearms — and searching only
    // the joint map walks straight past them to the torso, which is a real
    // anchor moved several bones up the chain. Anything still unparented is on
    // the VIRTUAL rig (core/overhead/boost defaults), which does not exist
    // outside the game, so it falls back to the joint it stands on.
    let host = null;
    for (let p = a.parent; p; p = p.parent) if (p.isBone) { host = p; break; }
    if (!host) {
      const want = VIRTUAL_HOME[name] || 'hips';
      host = mech.boneMap?.[want] || mech.boneMap?.hips || null;
    }
    if (!host) continue;
    host.updateWorldMatrix(true, false);
    a.updateWorldMatrix(true, false);
    const local = new THREE.Matrix4().copy(host.matrixWorld).invert().multiply(a.matrixWorld);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    local.decompose(p, q, s);
    out.push({ name, bone: host.name, pos: p.toArray(), quat: q.toArray() });
  }
  return out;
}

// Hang the anchors on the BAKED skeleton as empty nodes.
//
// THE BAKE RENAMES BONES, and the anchors were read off a build that has not
// been baked — so an anchor hosted on `bone_36` is looking for a bone the baked
// skeleton now calls `handR`. Without the map every one of saurion's six
// anchors silently failed to place, which is the exact failure the house rule
// (re-rigging never loses an anchor) exists to prevent: no error, no anchors.
function installAnchors(scene, anchors, renames = {}) {
  const byName = new Map();
  scene.traverse((o) => { if (o.isBone) byName.set(o.name, o); });
  const placed = [], lost = [];
  for (const a of anchors) {
    const hostName = renames[a.bone] || a.bone;
    const bone = byName.get(hostName);
    if (!bone) { lost.push(`${a.name}@${a.bone}`); continue; }
    a.bone = hostName;
    const n = new THREE.Object3D();
    n.name = a.name.startsWith('anchor_') ? a.name : `anchor_${a.name}`;
    n.position.fromArray(a.pos);
    n.quaternion.fromArray(a.quat);
    bone.add(n);
    placed.push({ ...a, node: n.name });
  }
  return { placed, lost };
}

// ---- animation sampling ----------------------------------------------------
// Read every bone's LOCAL transform each frame off the real build. Rotations
// transfer to the baked skeleton unchanged; POSITIONS do not — the build's
// bones are in the file's native units under a scaled container, the baked
// ones are in game units — so a position track is scaled by the same factor
// the transform bake applied.
function sampler(mech, scale, renames = {}) {
  const bones = [];
  mech.group.traverse((o) => { if (o.isBone) bones.push(o); });
  const rot = new Map(), pos = new Map(), rest = new Map();
  for (const b of bones) {
    rot.set(b.name, []); pos.set(b.name, []);
    rest.set(b.name, b.position.clone());
  }
  return {
    bones, times: [],
    grab(t) {
      this.times.push(t);
      for (const b of bones) {
        rot.get(b.name).push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        pos.get(b.name).push(b.position.x * scale, b.position.y * scale, b.position.z * scale);
      }
    },
    // A track per bone, dropping the ones that never move — a 15-bone mech with
    // 46 bones would otherwise carry 46 constant position tracks per clip.
    //
    // NAMED FOR THE BAKED SKELETON, not the one sampled. A glTF track binds to
    // its node BY NAME and the bake renames bones, so tracks recorded off the
    // unbaked build name `bone_36` and bind to nothing — and GLTFExporter drops
    // an unbindable track without a word. Saurion exported 25 clips and the
    // file came back with `animations: 0`.
    tracks(name) {
      const out = [];
      const times = Float32Array.from(this.times);
      if (times.length < 2) return out;
      for (const b of bones) {
        const target = renames[b.name] || b.name;
        const r = rot.get(b.name);
        if (varies(r, 4, 1e-5)) out.push(new THREE.QuaternionKeyframeTrack(`${target}.quaternion`, times, Float32Array.from(r)));
        const p = pos.get(b.name);
        if (varies(p, 3, 1e-4)) out.push(new THREE.VectorKeyframeTrack(`${target}.position`, times, Float32Array.from(p)));
      }
      return out;
    },
  };
}

// FEET ON THE FLOOR. The game grounds a model every build (rescaleAndReground),
// which is why the shipped asset has never needed to sit on y=0 — and why an
// importer gets a mech hovering half a unit up, or sunk. Nothing re-grounds an
// export, so it is done here, once: measure the lowest vertex at bind and shift
// the geometry and the root bones down by it, keeping x/z centred on the body.
// Rotations are untouched, so every sampled animation still applies exactly.
function groundModel(model) {
  model.updateMatrixWorld(true);
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3();
  const geos = new Set();
  const underBone = (o) => { for (let q = o.parent; q; q = q.parent) if (q.isBone) return true; return false; };
  model.traverse((o) => {
    const p = o.geometry?.attributes?.position;
    if (!p) return;
    if (!underBone(o)) geos.add(o.geometry);
    const step = Math.max(1, Math.floor(p.count / 20000));
    for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); min.min(v); max.max(v); }
  });
  if (!isFinite(min.y)) return null;
  const d = new THREE.Vector3(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
  const M = new THREE.Matrix4().makeTranslation(d.x, d.y, d.z);
  // GEOMETRY HANGING OFF A BONE MOVES WITH ITS BONE — translating it as well
  // applies the shift twice. Jerry's custom rig carries POST meshes (the black
  // rods standing in for his back legs) parented to bones, and they took the
  // offset a second time: the export came out 4.29 units taller and sunk by
  // exactly that much through the floor.
  for (const g of geos) g.applyMatrix4(M);
  model.traverse((o) => { if (o.isBone && !o.parent?.isBone) o.position.add(d); });
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    o.skeleton.calculateInverses();
    o.bind(o.skeleton, o.matrixWorld);
  });
  return { by: d.toArray().map((n) => +n.toFixed(4)) };
}

function varies(a, stride, eps) {
  for (let i = stride; i < a.length; i++) if (Math.abs(a[i] - a[i % stride]) > eps) return true;
  return false;
}

// Play one action clip through the animator and sample it.
function sampleClip(mech, animator, clipName, scale, renames) {
  const dur = animator.play(clipName, { fade: 0 });
  if (!dur || !isFinite(dur) || dur <= 0) return null;
  const s = sampler(mech, scale, renames);
  const dt = 1 / FPS;
  const n = Math.max(2, Math.ceil(dur * FPS) + 1);
  for (let i = 0; i < n; i++) {
    animator.update(i === 0 ? 1e-4 : dt, { grounded: true, speed: 0, maxSpeed: 1, vy: 0, alwaysReady: true });
    mech.postAnimate();
    mech.group.updateMatrixWorld(true);
    s.grab(i * dt);
  }
  const tracks = s.tracks(clipName);
  animator.stop(0);
  return tracks.length ? new THREE.AnimationClip(clipName, s.times[s.times.length - 1], tracks) : null;
}

// The gait, as one full cycle at a fixed ground speed. Sampled by PHASE rather
// than by wall time so the clip loops seamlessly: the cycle's period is 2*PI of
// animator phase, whatever the cadence dial says the speed is.
function sampleGait(mech, animator, label, speed, maxSpeed, scale, renames) {
  const s = sampler(mech, scale, renames);
  const ctx = { speed, maxSpeed, grounded: true, vy: 0, alwaysReady: true };
  const dt = 1 / FPS;
  for (let i = 0; i < 400; i++) animator.update(dt, ctx);   // settle the smoother
  const start = animator.phase;
  let t = 0, guard = 0;
  mech.postAnimate(); mech.group.updateMatrixWorld(true);
  s.grab(0);
  while (guard++ < 2000) {
    animator.update(dt, ctx);
    mech.postAnimate();
    mech.group.updateMatrixWorld(true);
    t += dt;
    s.grab(t);
    let turned = animator.phase - start;
    while (turned < 0) turned += Math.PI * 2;
    if (turned >= Math.PI * 2 - 1e-3) break;
  }
  const tracks = s.tracks(label);
  return tracks.length ? new THREE.AnimationClip(label, t, tracks) : null;
}

export async function runExport(id) {
  window.__exportReady = false;
  window.__exportErr = null;
  try {
    const def = ROSTER.find((d) => d.id === id);
    if (!def) throw new Error(`no roster mech "${id}"`);

    // 1) the model, with EVERYTHING folded in — including the transform
    const baked = await bakeMechScene(id, { transform: true });
    if (!baked) throw new Error(`no GLB manifest entry for "${id}"`);
    const scale = baked.transform?.scale ?? 1;

    // 2) a real build, which is the only thing that knows where the anchors are
    //    and the only thing that can play an animation
    const { mech } = await buildGlbForTool(def);
    if (!mech?.isGLB) throw new Error('build fell back to procedural');
    const anchors = anchorLocals(mech);
    const { placed, lost } = installAnchors(baked.model, anchors, baked.renames);
    if (lost.length) throw new Error(`anchors could not be placed: ${lost.join(', ')}`);

    // 3) every clip this mech can actually play, plus the two gaits
    const animator = mech.premadeAnimator;
    const names = mechClips(def, mech.animProfile || profileFor(id));
    const clips = [], failed = [];
    for (const n of names) {
      try {
        const c = sampleClip(mech, animator, n, scale, baked.renames);
        if (c) clips.push(c); else failed.push(n);
      } catch (e) { failed.push(`${n} (${String(e).slice(0, 60)})`); }
    }
    const top = moveSpeedFor(def);
    for (const [label, sp] of [['walk', top * 0.45], ['run', top]]) {
      try {
        const c = sampleGait(mech, animator, label, sp, top, scale, baked.renames);
        if (c) clips.push(c); else failed.push(label);
      } catch (e) { failed.push(`${label} (${String(e).slice(0, 60)})`); }
    }

    // 4) feet on the floor — nothing re-grounds an export
    const grounded = groundModel(baked.model);

    // 5) out
    const exporter = new GLTFExporter();
    const buf = await new Promise((resolve, reject) =>
      exporter.parse(baked.model, resolve, reject,
        { binary: true, onlyVisible: false, animations: clips }));

    let bones = 0, verts = 0;
    baked.model.traverse((o) => {
      if (o.isBone) bones++;
      if (o.isMesh || o.isSkinnedMesh) verts += o.geometry?.attributes?.position?.count || 0;
    });
    const u8 = new Uint8Array(buf);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    window.__exportGlb = {
      base64: btoa(bin),
      byteLength: buf.byteLength,
      report: {
        id, bones, verts, scale, yawOffset: baked.transform?.yawOffset ?? 0,
        grounded: grounded?.by || null,
        anchors: placed.map((a) => ({ name: a.name, node: a.node, bone: a.bone })),
        clips: clips.map((c) => ({ name: c.name, dur: +c.duration.toFixed(3), tracks: c.tracks.length })),
        failed,
      },
    };
    window.__exportReady = true;
  } catch (e) {
    window.__exportErr = String((e && e.stack) || e);
    window.__exportReady = true;
  }
}
