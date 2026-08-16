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
//     its size (jerry: 270 degrees and 15.0124 x 0.59). Carried here on the
//     ARMATURE NODE above the joints — the layout Blender emits — so the model
//     stands up game-sized and facing +z, and the mesh, the skeleton and the
//     clips all stay in ONE frame. See installArmature: folding it into the
//     data instead is what used to tear the skin and collapse the anchors.
//   THE ANCHORS. Every muzzle, booster and core anchor is built at RUNTIME from
//     the manifest and exists nowhere in the file. They are hand-placed and
//     under a house rule that re-rigging must never lose them, so they are
//     written as empty NODES parented to the bone they ride — which every
//     engine reads.
//   THE ANIMATION. Every shipped GLB has `animations: 0`: the whole library is
//     procedural (121 shared clips, 49 per-mech variants, plus a gait engine
//     that is a cycle rather than a clip). Sampled here through the REAL
//     animator, so what is exported is what ships, and written as ordinary
//     glTF keyframe tracks. EVERY CLIP STATES THE WHOLE SKELETON — see
//     sampler.tracks for why an exported clip may not be a delta.
//
// The gait is not a clip and never was — it is a phase function of ground
// speed — so it is sampled at the two speeds the game itself names (the loose
// walk at 0.45 of top, the full run at 1.0) and emitted as looping clips. That
// is a lossy but honest translation: an engine that wants the in-between blends
// the two, which is what the crossfade does anyway.
//
// Jump, hover, crouch and the battle idle are not clips either — they are
// animator LAYERS keyed off the frame context — so they are sampled as short
// held clips (samplePose). Without them an importer has no idle and no
// airborne pose at all.
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
// Read every bone's LOCAL transform each frame off the real build.
//
// THE SKELETON, THE MESH AND THE CLIPS ARE ALL IN THE BUILD'S OWN FRAME, and
// that is the whole reason this is simple: the game transform rides the
// ARMATURE NODE above the joints (see installArmature) instead of being folded
// into the data, so a sampled bone transform needs no correction of any kind.
// It used to be folded, and the sampler did not answer the fold — see
// installArmature for what that cost.
function sampler(mech, renames = {}) {
  // ONE bone per NAME. A build carries more bone objects than the baked
  // skeleton has (titanus: 66 against 26 — helper rigs, dead auto-rig bones),
  // and two sharing a name would silently interleave their samples into one
  // track through the per-name maps below.
  const bones = [], seen = new Set();
  mech.group.traverse((o) => {
    if (o.isBone && !seen.has(o.name)) { seen.add(o.name); bones.push(o); }
  });
  const rot = new Map(), pos = new Map();
  for (const b of bones) { rot.set(b.name, []); pos.set(b.name, []); }
  return {
    bones, times: [],
    grab(t) {
      this.times.push(t);
      for (const b of bones) {
        rot.get(b.name).push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        pos.get(b.name).push(b.position.x, b.position.y, b.position.z);
      }
    },
    // A track per bone, NAMED FOR THE BAKED SKELETON rather than the one
    // sampled. A glTF track binds to its node BY NAME and the bake renames
    // bones, so tracks recorded off the unbaked build name `bone_36` and bind
    // to nothing — and GLTFExporter drops an unbindable track without a word.
    // Saurion exported 25 clips and the file came back with `animations: 0`.
    //
    // `keep` — the baked bone set — does two jobs, and EVERY sampler passes it.
    //
    // It KEEPS THE CONSTANT TRACKS, which is the property an exported clip has
    // to have. Inside this game the animator is a pose function over the whole
    // body: a clip key names the handful of joints it moves and the base (the
    // ready carriage, the gait, the breath) supplies the other twenty, every
    // frame. Nothing outside this game has that base. An importer has an
    // AnimationMixer, which writes the bones a clip has tracks for and leaves
    // every other bone exactly where the last clip left it — so dropping the
    // tracks that never move did not compress the clip, it DELETED the standing
    // half of it, and an attack arrived as an upper body welded onto whatever
    // was playing before. AN EXPORTED CLIP IS A COMPLETE POSE, NOT A DELTA.
    // The cost is a few hundred KB of constant tracks against ~9 MB of mesh.
    //
    // And it is a SET rather than a blanket because of the bone-count gap
    // above: a track for a build-only bone binds to nothing on the way out, and
    // GLTFExporter discards THE WHOLE CLIP on the first one.
    tracks(name, keep) {
      const out = [];
      const times = Float32Array.from(this.times);
      if (times.length < 2) return out;
      for (const b of bones) {
        const target = renames[b.name] || b.name;
        if (!keep.has(target)) continue;
        out.push(new THREE.QuaternionKeyframeTrack(`${target}.quaternion`, times,
          Float32Array.from(rot.get(b.name))));
        out.push(new THREE.VectorKeyframeTrack(`${target}.position`, times,
          Float32Array.from(pos.get(b.name))));
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

// THE TRANSFORM GOES ABOVE THE JOINTS, NOT INTO THE DATA.
//
// `yawOffset` and `modelScale` x `heightScale` are manifest numbers, so a raw
// file imports facing the wrong way at a ninth of its size (jerry: 270 degrees
// and 15.0124 x 0.59). They have to travel with the export. WHERE they are put
// is the whole question, and this used to get it wrong.
//
// It used to FOLD them — bakeMechScene's `transform` option, into the vertices
// and the bone rest offsets. That silently split the export into two frames:
// the mesh and the skeleton were folded, the animation was sampled from the
// live build and was not, and the anchors were read off the build in native
// units and installed into a skeleton that had been scaled into game units.
// Three consequences, all measured:
//
//   THE SKIN TORE. Every clip's root track drove the skeleton back to the
//     unfolded frame while the mesh stayed folded, so the body deformed
//     through a rotation its vertices never took — barely visible standing,
//     and worse the further a pose travelled from bind. Reported from the
//     receiving end as "even his normal punch causes his geometry to do all
//     sorts of weird things".
//   THE ANCHORS COLLAPSED ONTO THEIR BONES. An anchor's offset came out
//     divided by the scale — measured on titanus, every one at 0.111x where it
//     belonged (1/9.044, exactly S), muzzleR sitting 10.9% of a body height
//     from the palm it was authored on and arriving 1.2% from it. Nothing
//     caught it: exportcheck tests that an anchor is PRESENT and on the RIGHT
//     BONE, not that it is in the right PLACE.
//   AND THE FIX FOR THE FIRST WOULD NOT HAVE FIXED THE OTHERS. Folding the
//     sample too (premultiplying the fold's rotation onto the root bone's
//     sampled quaternion) is arithmetic that has to be repeated correctly in
//     every sampler, and its "which bones are roots" test reads the BUILD's
//     hierarchy while the fold read the BAKED one — which are not the same
//     tree, because the bake reparents, re-rigs and prunes.
//
// So: nothing is folded. The model, the skeleton and the clips stay in the
// build's own frame, where they agree BY CONSTRUCTION, and the yaw and scale
// go on a NODE ABOVE THE JOINTS. glTF has a place for exactly this and every
// importer honours it — it is the layout Blender itself emits (the Armature
// node), so it is the best-tested arrangement in the ecosystem. A transform
// there applies rigidly AFTER the skin has deformed, so it cannot deform
// anything, and it scales the anchors along with the body for free.
//
// THE RULE TO KEEP: the model, the skeleton and the animation must share one
// frame. If a transform has to be applied, apply it above the joints.
function installArmature(model, entry) {
  const yawDeg = entry.yawOffset ?? 0;
  const S = (typeof entry.modelScale === 'number' && entry.modelScale > 0 ? entry.modelScale : 1)
    * (entry.heightScale ?? 1);
  const arm = new THREE.Object3D();
  arm.name = 'Armature';
  // the children are moved, not the model: `model` is what gets exported, so
  // the node has to sit INSIDE it, above everything the skin and rig touch.
  for (const c of [...model.children]) arm.add(c);
  model.add(arm);
  if (yawDeg) arm.rotation.y = yawDeg * Math.PI / 180;
  arm.scale.setScalar(S);
  arm.updateMatrix();
  model.updateMatrixWorld(true);
  return { yawOffset: yawDeg, scale: S, node: arm.name };
}

// THE NEUTRAL EVERY CLIP MUST DEPART FROM.
//
// The animator is a SMOOTHER over an integrator, not a pose function: `cur`
// eases toward the frame target, the pelvis follows measured sole clearance,
// the ready carriage damps in, and the leg smoothing is scaled by body size.
// None of it is at its resting value the instant you call it — it converges
// over seconds.
//
// So a clip sampled from a COLD animator does not open on the mech's neutral
// stance, it opens on whatever the previous clip left behind, still sliding.
// Every action clip used to record frame 0 mid-transient — legs further into
// their crouch, feet lifted off the floor — so an importer cross-fading idle
// into an attack saw the legs SNAP on the first frame of every strike.
//
// Settling first, at one shared neutral, makes every clip start from the
// identical converged pose. EVERY SAMPLER MUST USE THE SAME NEUTRAL or the
// clips disagree about what standing is.
const NEUTRAL_CTX = { grounded: true, speed: 0, maxSpeed: 1, vy: 0, alwaysReady: true };
const SETTLE_FRAMES = 90;   // ~3s at FPS
function settle(mech, animator, ctx = NEUTRAL_CTX, frames = SETTLE_FRAMES) {
  const dt = 1 / FPS;
  for (let i = 0; i < frames; i++) {
    animator.update(dt, ctx);
    mech.postAnimate();
    mech.group.updateMatrixWorld(true);
  }
}

// Play one action clip through the animator and sample it.
function sampleClip(mech, animator, clipName, renames, keep) {
  animator.stop(0);
  settle(mech, animator);
  const dur = animator.play(clipName, { fade: 0 });
  if (!dur || !isFinite(dur) || dur <= 0) return null;
  const s = sampler(mech, renames);
  const dt = 1 / FPS;
  const n = Math.max(2, Math.ceil(dur * FPS) + 1);
  for (let i = 0; i < n; i++) {
    animator.update(i === 0 ? 1e-4 : dt, NEUTRAL_CTX);
    mech.postAnimate();
    mech.group.updateMatrixWorld(true);
    s.grab(i * dt);
  }
  const tracks = s.tracks(clipName, keep);
  animator.stop(0);
  return tracks.length ? new THREE.AnimationClip(clipName, s.times[s.times.length - 1], tracks) : null;
}

// A PROCEDURAL LAYER, HELD. Jump, hover and crouch have never been clips — they
// are animator layers keyed off the frame context (the airborne rising tuck and
// falling spread, the hover jet pose, the duck layer), and battleIdle is the
// ready stance itself. An importer has no animator to run them, so each is
// sampled here as a short HELD clip: feed the animator a synthetic ctx, let the
// smoothers settle onto it, then record. Without these an importer has no idle,
// no jump and no crouch at all — which is most of what a body does.
function samplePose(mech, animator, label, poseCtx, renames, keep, dur) {
  animator.stop(0);
  const ctx = { ...NEUTRAL_CTX, ...poseCtx };
  settle(mech, animator, ctx);
  const s = sampler(mech, renames);
  const dt = 1 / FPS;
  const n = Math.ceil(dur * FPS) + 1;
  for (let i = 0; i < n; i++) {
    animator.update(dt, ctx);
    mech.postAnimate();
    mech.group.updateMatrixWorld(true);
    s.grab(i * dt);
  }
  const tracks = s.tracks(label, keep);
  return tracks.length ? new THREE.AnimationClip(label, s.times[s.times.length - 1], tracks) : null;
}

// The gait, as one full cycle at a fixed ground speed. Sampled by PHASE rather
// than by wall time so the clip loops seamlessly: the cycle's period is 2*PI of
// animator phase, whatever the cadence dial says the speed is.
function sampleGait(mech, animator, label, speed, maxSpeed, renames, keep) {
  animator.stop(0);
  const s = sampler(mech, renames);
  const ctx = { ...NEUTRAL_CTX, speed, maxSpeed };
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
  const tracks = s.tracks(label, keep);
  return tracks.length ? new THREE.AnimationClip(label, t, tracks) : null;
}

export async function runExport(id) {
  window.__exportReady = false;
  window.__exportErr = null;
  try {
    const def = ROSTER.find((d) => d.id === id);
    if (!def) throw new Error(`no roster mech "${id}"`);

    // 1) the model, with everything that describes it baked in — but NOT the
    //    game transform, which goes on the armature node in step 5 so that the
    //    mesh, the skeleton and the clips all stay in one frame.
    const baked = await bakeMechScene(id, { transform: false });
    if (!baked) throw new Error(`no GLB manifest entry for "${id}"`);

    // 2) a real build, which is the only thing that knows where the anchors are
    //    and the only thing that can play an animation
    const { mech } = await buildGlbForTool(def);
    if (!mech?.isGLB) throw new Error('build fell back to procedural');
    // The anchor locals are read in the build's own units, and the baked
    // skeleton is in those same units — that is what step 1 buys.
    const anchors = anchorLocals(mech);
    const { placed, lost } = installAnchors(baked.model, anchors, baked.renames);
    if (lost.length) throw new Error(`anchors could not be placed: ${lost.join(', ')}`);

    // The names that exist on the EXPORTED skeleton. Every sampler is handed
    // this set — see sampler.tracks for both jobs it does.
    const keep = new Set();
    baked.model.traverse((o) => { if (o.isBone) keep.add(o.name); });

    // 3) every clip this mech can actually play, plus the two gaits
    const animator = mech.premadeAnimator;
    const names = mechClips(def, mech.animProfile || profileFor(id));
    const clips = [], failed = [];
    for (const n of names) {
      try {
        const c = sampleClip(mech, animator, n, baked.renames, keep);
        if (c) clips.push(c); else failed.push(n);
      } catch (e) { failed.push(`${n} (${String(e).slice(0, 60)})`); }
    }
    const top = moveSpeedFor(def);
    for (const [label, sp] of [['walk', top * 0.45], ['run', top]]) {
      try {
        const c = sampleGait(mech, animator, label, sp, top, baked.renames, keep);
        if (c) clips.push(c); else failed.push(label);
      } catch (e) { failed.push(`${label} (${String(e).slice(0, 60)})`); }
    }
    // …and the animator's own procedural layers, held (see samplePose). These
    // are states the game has no clip for at all, so without them an import has
    // no idle, no jump, no hover and no crouch.
    const duckDepth = def.stats?.duck ?? 0.55;   // fighter.js' own default
    for (const [label, pctx, dur] of [
      ['battleIdle', { }, 1.0],
      ['jumpRise', { grounded: false, vy: 8 }, 0.5],
      ['jumpFall', { grounded: false, vy: -8 }, 0.5],
      ['hover', { grounded: false, hovering: true, speed: top, maxSpeed: top }, 0.5],
      ['crouch', { duck: duckDepth }, 0.5],
    ]) {
      try {
        const c = samplePose(mech, animator, label, pctx, baked.renames, keep, dur);
        if (c) clips.push(c); else failed.push(label);
      } catch (e) { failed.push(`${label} (${String(e).slice(0, 60)})`); }
    }

    // 4) feet on the floor — nothing re-grounds an export. Done BEFORE the
    //    armature node goes on, so the shift is measured and applied in the
    //    same (native) units as the geometry and bones it moves. The node's
    //    rotation is about Y and its scale is uniform, so both map y=0 to y=0
    //    and the feet stay on the floor through step 5.
    const grounded = groundModel(baked.model);

    // 5) the game transform, on the node above the joints
    const transform = installArmature(baked.model, baked.entry);
    const scale = transform.scale;

    // 6) out
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
        id, bones, verts, scale, yawOffset: transform.yawOffset,
        transformNode: transform.node,
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
