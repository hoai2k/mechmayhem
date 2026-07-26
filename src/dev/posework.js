// ?debug=pose — the POSE workbench. One mech, frozen, posed by hand.
//
//   ?debug=pose[&mech=<id>][&model=glb|proc][&clip=<name>][&key=<n>|&t=<s>][&alt=1]
//
// `alt=1` (the panel's "Edit Alternate GLB" box, same control as ?debug=skin /
// ?rigedit) poses the manifest's alternate build instead of the primary.
//
// Pick a mech, optionally load one of ITS OWN poses as a starting point (the
// dropdown lists only the clips that mech can actually play — vulcan's ult
// pose is in his list because vulcan is the one who casts it), then CLICK A
// JOINT IN THE VIEWPORT (the cyan dots, or just the body part you want — the
// nearest joint wins), drag the gizmo and hit "Copy pose". The joint buttons in
// the panel do the same thing for joints that are hard to hit on screen.
// R / T switch the gizmo between rotate and translate, G flips local/world,
// Esc deselects. The export is a clip-key pose block in
// DEGREES, the same shape animations.js is authored in, so a pose dialled here
// can be pasted straight into a clip — or handed to someone as "this is the arm
// pose I want".
//
// WHICH KEY OF THE CLIP: the scrubber under the dropdown steps KEYFRAME BY
// KEYFRAME — it stops only on times the clip actually authors (◀ key / key ▶
// walk them too), because an in-between time is an interpolated pose that exists
// in no key, and an edit made there has nowhere to go in animations.js. It opens
// on the LAST key: the pose a hold/loop clip holds, but the RECOVERY of a
// one-shot strike — so colossusClap or heavy opens on the rest stance, which is
// genuinely that clip's last key, not a bug. Step to the impact key to pose the
// blow. `&key=<index>` deep-links one; `&t=<seconds>` snaps to the nearest.
//
// EDITING A SPECIFIC KEY: "Copy pose" reports which key was on screen (index, t,
// ease, and the clip's full key-time list), what that key AUTHORS today, and a
// per-joint `changed: {joint: {from, to}}` of what the gizmo actually moved —
// diffed against the pose as loaded, not against the file, so the sampler's own
// settling error never shows up as an edit. Hand that JSON over and the change
// lands on exactly the key it came from.
//
// WHAT IS BEING POSED: the mech's VIRTUAL joints (rigadapter JOINT_ORDER) — the
// same rig the clips drive. On a GLB the retarget pushes them onto the real
// bones every frame, so you edit in clip space and watch the shipped model
// move. Nothing here is live combat: the animator is stopped while you pose.
//
// APPLY CONSTRAINTS (on by default) is the animation framework's own rule:
// clips may only ROTATE joints — the single exception is the hips, whose
// translation is the clip channel `hipsPos`. Limb length is fixed, so with this
// on a limb joint is given no translate handle at all and an arm cannot be
// dragged longer than it is. Turn it off and translation unlocks everywhere,
// but those offsets are NOT clip-expressible: they only survive as a GLB
// manifest bind patch ("Copy bind patch").
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Engine } from '../core/engine.js';
import { buildMech } from '../mechs/factory.js';
import { Animator } from '../mechs/animator.js';
import { buildGlbForTool, fetchRawManifest, measureHeadTop } from '../mechs/gltf.js';
import { ROSTER, ROSTER_BY_ID } from '../mechs/roster.js';
import { JOINT_ORDER } from '../mechs/rigadapter.js';
import { CLIPS } from '../mechs/animations.js';
import { profileFor } from '../mechs/glbanim.js';
import { mechClipList } from './mechclips.js';
import { setupDevPanel } from './panelui.js';
import { mechSelect } from './mechpick.js';
import { altChoice, altCheckbox } from './altpick.js';

const R2D = 180 / Math.PI;
// Joints whose clip value is read RELATIVE to the mech's rest stance (the
// animator's restBias): a digitigrade mech keeps its leg bend through clips, so
// its authored numbers are offsets from that bend, not absolute angles.
const BIASED = (j) => j.startsWith('thigh') || j.startsWith('knee') || j.startsWith('ankle') ||
  j === 'torso' || j === 'head';
// Hips translation IS a clip channel (hipsPos); every other joint is
// rotation-only, and that is exactly what keeps limbs from stretching.
const CAN_TRANSLATE = 'hips';

export async function runPoseWork(startId) {
  const engine = new Engine(document.getElementById('game-canvas'));
  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(0x232833);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x565c66, 2.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
  dirLight.position.set(6, 11, 8);
  scene.add(dirLight);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x353a44, roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(60, 60, 0x38445a, 0x222c3a));

  const params = new URLSearchParams(location.search);
  const manifest = await fetchRawManifest();
  let curId = ROSTER_BY_ID[startId] ? startId : ROSTER[0].id;
  let useGlb = params.get('model') !== 'proc';
  // ?alt=1 — pose the manifest's ALTERNATE build (a second model, or the same
  // model on a staged custom rig). Same control as ?debug=skin / ?rigedit; here
  // it rebuilds in place instead of reloading, since this tool already swaps
  // mechs live.
  let altOn = params.get('alt') === '1';
  let constrain = true;
  let showBones = true;

  camera.position.set(7, 6, 12);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 4, 0);
  orbit.update();

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSpace('local'); gizmo.setMode('rotate'); gizmo.setSize(1.05);
  // r166 hands you the controls object itself; newer three wants getHelper().
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  let dragging = false;      // gizmo has the pointer
  let swallowClick = false;  // the click that ended a gizmo drag is not a pick
  gizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    dragging = e.value;
    if (!e.value) swallowClick = true;
  });

  // ---- live state ----
  let mech = null, animator = null, selJoint = null, hoverJoint = null;
  let restPose = null;          // animator rest — the baseline the export diffs
  const hipsHome = new THREE.Vector3();
  const jointHome = {};         // every joint's rest local position (reset target)
  const boneBase = {};          // GLB real-bone baseline, for the bind patch
  let loadedFrom = 'rest';      // what the current pose started life as
  let curClip = null;           // the clip object the key was sampled from
  let curKeys = null;           // its authored key times (the scrubber's stops)
  let curKeyIdx = 0;            // which of those keys is on screen
  let loadedPose = null;        // that key's pose BEFORE any drag — the export's baseline
  const boneGroup = new THREE.Group(); scene.add(boneGroup);
  const _wa = new THREE.Vector3(), _wb = new THREE.Vector3();

  // ================= build =================
  // `keepCam`: a BUILD switch (GLB↔procedural, primary↔alt) must not move the
  // camera. Those three toggles exist to A/B one mech against itself, and
  // re-framing between them reads as the model changing size — it doesn't: the
  // framing height (measureHeadTop) is measured off whatever geometry the HEAD
  // BONE owns, which is a property of the RIG, not of the model. Colossus'
  // custom rig gives `head` the collar block (top 8.06) where the Tripo rig's
  // head bone owns the upper chest (7.71), so the camera used to jump 4.5%
  // closer on the alt while the mesh stayed the exact same 9.594 units tall.
  // Framing follows the MECH, so switching mech still re-frames.
  async function load(id, { keepCam = false } = {}) {
    const sameMech = keepCam && id === curId;
    curId = id;
    const alt = altChoice(manifest, id, altOn);
    altOn = alt.useAlt;          // a mech with no alternate falls back silently
    const u = new URL(location.href);
    u.searchParams.set('mech', id);
    u.searchParams.set('model', useGlb ? 'glb' : 'proc');
    if (altOn) u.searchParams.set('alt', '1'); else u.searchParams.delete('alt');
    history.replaceState(null, '', u);
    gizmo.detach(); selJoint = null; hoverJoint = null;
    if (mech) {
      scene.remove(mech.group);
      mech.group.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) m?.dispose?.();
      });
    }
    const def = ROSTER_BY_ID[id];
    const hasGlb = !!alt.entry?.url;
    mech = (useGlb && hasGlb) ? (await buildGlbForTool(def, null, { alt: altOn })).mech : buildMech(def);
    mech.group.position.set(0, 0, 0);
    scene.add(mech.group);
    animator = mech.premadeAnimator || new Animator(mech);
    animator.poseStatic();
    restPose = animator.makeRestTarget();
    hipsHome.copy(mech.joints.hips.position);
    for (const k of Object.keys(jointHome)) delete jointHome[k];
    for (const j of JOINT_ORDER) if (mech.joints[j]) jointHome[j] = mech.joints[j].position.clone();
    // GLB bind baseline: the real bones before anything is posed, so the bind
    // patch reports only what this session moved
    for (const k of Object.keys(boneBase)) delete boneBase[k];
    for (const [j, b] of Object.entries(mech.boneMap || {})) {
      boneBase[j] = { q: b.quaternion.clone(), p: b.position.clone() };
    }
    loadedFrom = 'rest';
    mechSel.value = curId;
    for (const [b, on] of [[bGlb, useGlb && hasGlb], [bProc, !(useGlb && hasGlb)]]) {
      b.style.background = on ? '#2b6cb0' : '#1a2433';
      b.style.color = on ? '#fff' : '#9fb2c8';
    }
    modelRow.style.display = hasGlb ? 'flex' : 'none';
    glbNote.textContent = (useGlb && !hasGlb) ? 'no GLB for this mech — procedural shown' : '';
    refreshAltRow();
    panelUI.setSubtitle(`${curId}${altOn ? ' · ALT' : ''} · ${mech.isGLB ? 'GLB' : 'procedural'}`);
    buildJointButtons();
    buildBoneMarks();
    buildClipOptions();
    if (!sameMech) frameCamera();
    out.style.display = 'none';
    note.textContent = '';
    window.__poseWork = {
      get mech() { return mech; }, get animator() { return animator; },
      get sel() { return selJoint; },
      gizmo, camera, pick: pickJoint,
      // loadClip(name, {key:<index>} | {t:<seconds>}) — same key snapping as the UI
      select: selectJoint, deselect, loadClip: applyClipPose, pose: readPose,
      get key() { return curKeys ? { index: curKeyIdx, of: curKeys.length, t: curKeys[curKeyIdx], times: curKeys } : null; },
      patch: bindPatch, reset: resetAll, export: outputPose,
      setConstrain: (v) => { constrain = !!v; conCheck.checked = constrain; applyConstraint(); },
    };
  }

  // Frame whatever was just loaded: mechs run from jerry's knee height to
  // colossus, so a fixed camera either crops the head off or loses him.
  function frameCamera() {
    mech.group.updateWorldMatrix(true, true);
    // How tall is this thing, really? measureHeadTop reads the POSED skin (a
    // Box3 would read a skinned mesh at its BIND pose, the wrong size for
    // what's on screen) — but it can come back short when a GLB's head bone
    // owns few verts, and a short answer parks the camera inside the mech.
    // The joint fan-out is the sanity check: nothing sits above the head, so
    // the tallest joint is a hard floor on the height.
    let top = 0;
    for (const j of JOINT_ORDER) {
      const o = mech.joints[j];
      if (o) top = Math.max(top, o.getWorldPosition(_wa).y);
    }
    const h = Math.max(3, measureHeadTop(mech) || 0, top * 1.12);
    orbit.target.set(0, h * 0.55, 0);
    camera.position.set(h * 0.55, h * 0.78, h * 1.85);
    orbit.update();
  }

  // ================= starting poses =================
  // Only the clips THIS mech can play (mechclips.js reads the real play sites),
  // so vulcan's list carries his ult's hurricaneSpin and nobody else's.
  function clipsForMech() {
    const def = ROSTER_BY_ID[curId];
    // the built mech's OWN profile first — an alternate build may carry its own
    // (`profileKey`), and that's the clip set it actually plays
    const profile = mech?.isGLB ? (mech.animProfile || profileFor(curId)) : null;
    return mechClipList(def, profile).filter((c) => CLIPS[c.name]);
  }
  function buildClipOptions() {
    const list = clipsForMech();
    clipSel.innerHTML = '';
    const rest = document.createElement('option');
    rest.value = ''; rest.textContent = '— rest stance —';
    clipSel.appendChild(rest);
    for (const c of list) {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = `${c.name}${c.role ? '  ·  ' + c.role : ''}`;
      clipSel.appendChild(o);
    }
    const want = params.get('clip');
    if (want && list.some((c) => c.name === want)) {
      clipSel.value = want;
      // &key=<index> / &t=<seconds> deep-link ONE key — the strike key of a
      // one-shot clip rather than the recovery pose it ends on. `t` snaps to the
      // nearest key, so either spelling lands on a real pose.
      const wantKey = params.has('key') ? +params.get('key') : NaN;
      const wantT = params.has('t') ? +params.get('t') : NaN;
      applyClipPose(want,
        Number.isFinite(wantKey) ? { key: wantKey }
          : Number.isFinite(wantT) ? { t: wantT } : undefined);
    } else {
      clearClipContext();  // a rebuild/mech switch leaves no key loaded
    }
  }
  // No key is loaded: hide the scrubber and make sure the export stops claiming
  // one. Called on reset and whenever a rebuild invalidates the old clip.
  function clearClipContext() {
    curClip = null; curKeys = null; curKeyIdx = 0; loadedPose = null;
    timeRow.style.display = 'none';
    keyRow.style.display = 'none';
  }
  // Which clip the animator will ACTUALLY play under this name — a GLB profile
  // may swap in a bespoke variant (glbanim clipOverrides), and that variant has
  // its own keys. Resolved exactly the way Animator.play resolves it.
  function clipUnderName(name) {
    return animator?.profile?.clipOverrides?.[name] || CLIPS[name];
  }
  // The clip's authored key times: compile() shreds each key into per-joint
  // tracks, so the keys are the UNION of the track times. A key that only moves
  // two joints (a strike's follow-through) is a key all the same.
  //
  // t=0 is always a stop. Plenty of clips open on `{ t: 0, pose: {} }` — "start
  // from wherever the body already is" — which writes no track at all and so is
  // invisible here. It IS a key, it is just empty, and posing it is a real
  // authoring act (giving a clip an explicit opening pose), so it gets a stop and
  // `authored` reports it as writing nothing.
  function keyTimesOf(clip) {
    const seen = new Set([0]);
    for (const track of Object.values(clip.tracks)) {
      for (const k of track) seen.add(Math.round(k.t * 1e4) / 1e4);
    }
    return [...seen].sort((a, b) => a - b);
  }
  // What the clip AUTHORS at this key — the literal numbers in animations.js,
  // for the joints this key writes (tracks are sparse, so a key mentions only
  // what it moves). Degrees, same space as readPose.
  function authoredAt(clip, t) {
    const pose = {}; let ease = null;
    for (const [j, track] of Object.entries(clip.tracks)) {
      const k = track.find((e) => Math.abs(e.t - t) < 1e-3);
      if (!k) continue;
      ease = ease || k.ease;
      pose[j] = j === 'hipsPos' ? k.v.map((n) => rnd(n, 3)) : k.v.map((n) => rnd(n * R2D));
    }
    return { pose, ease };
  }

  // Sample a clip through the REAL animator, so what lands here is exactly what
  // the game shows at that moment — profile overrides, mirrored arms, signature
  // motion and all. Then the animator is stopped and the joints are yours.
  //
  // `at` picks the key: {key:<index>} outright, or {t:<seconds>} snapped to the
  // NEAREST key. Default is the last key — the pose a hold/loop clip holds.
  function applyClipPose(name, at) {
    if (!name) { resetAll(); return; }
    const clip = clipUnderName(name);
    if (!clip) return;
    const keys = keyTimesOf(clip);
    let idx = keys.length - 1;
    if (at && at.key !== undefined) idx = at.key;
    else if (at && at.t !== undefined) {
      // snap: the nearest authored key to the time asked for
      let best = Infinity;
      keys.forEach((kt, i) => { const d = Math.abs(kt - at.t); if (d < best) { best = d; idx = i; } });
    }
    idx = Math.max(0, Math.min(keys.length - 1, idx));
    const t = keys[idx];
    curClip = clip; curKeys = keys; curKeyIdx = idx;
    timeRow.style.display = 'flex';
    keyRow.style.display = keys.length > 1 ? 'flex' : 'none';
    timeSlider.max = String(keys.length - 1);
    timeSlider.value = String(idx);
    timeVal.textContent = `key ${idx + 1}/${keys.length} · t ${t.toFixed(2)}`;

    animator.poseStatic();
    animator.action = null;
    animator.impulses.length = 0;
    animator.play(name);
    if (!animator.action) return;
    animator.action.weight = 1;
    animator.action.fadeIn = 1e-6;
    const ctx = { speed: 0, maxSpeed: 1, grounded: true, vy: 0 };
    // run to t, then keep ticking with the clip clock PINNED there so the
    // animator's pose smoother settles onto the pose at exactly t
    for (let i = 0; i < 48; i++) {
      animator.update(0.04, ctx);
      if (animator.action) animator.action.t = Math.min(animator.action.t, t);
    }
    animator.action = null;      // hand the joints over to the gizmo
    loadedFrom = `${name} key ${idx + 1}/${keys.length} @ t=${t.toFixed(2)}`;
    // The pose AS LOADED, before a single drag. The export diffs against this,
    // which is what makes "here is what I changed" exact: the sampled pose is
    // not identical to the authored numbers (the smoother settles a degree or
    // two short, signature motion adds its own), so diffing against the file
    // would report drift nobody touched as an edit.
    loadedPose = readPose();
    // keep the selection across a clip load — scrubbing the key slider while
    // holding a joint is the whole point of the slider
    if (selJoint && mech.joints[selJoint]) gizmo.attach(mech.joints[selJoint]);
    refreshJointButtons();
    note.textContent = `Loaded ${loadedFrom}`;
  }

  // ================= pose read-back =================
  // Clip space: DEGREES, with the biased joints (legs/torso/head) reported as
  // offsets from the mech's rest stance, which is how clips are authored.
  function readPose() {
    const pose = {};
    for (const j of JOINT_ORDER) {
      const o = mech.joints[j];
      if (!o || j === 'hips') continue;
      const bias = BIASED(j) ? (restPose[j] || [0, 0, 0]) : [0, 0, 0];
      const rest = restPose[j] || [0, 0, 0];
      const v = [(o.rotation.x - bias[0]) * R2D, (o.rotation.y - bias[1]) * R2D, (o.rotation.z - bias[2]) * R2D];
      const ref = [(rest[0] - bias[0]) * R2D, (rest[1] - bias[1]) * R2D, (rest[2] - bias[2]) * R2D];
      if (Math.abs(v[0] - ref[0]) > 0.15 || Math.abs(v[1] - ref[1]) > 0.15 || Math.abs(v[2] - ref[2]) > 0.15) {
        pose[j] = v.map((n) => rnd(n));
      }
    }
    // hips: rotation is the clip channel hipsRot, translation is hipsPos —
    // authored in metres at scale 1, so divide the mech's scale back out
    const hr = mech.joints.hips.rotation, hrr = restPose.hipsRot || [0, 0, 0];
    const hv = [(hr.x - hrr[0]) * R2D, (hr.y - hrr[1]) * R2D, (hr.z - hrr[2]) * R2D];
    if (hv.some((n) => Math.abs(n) > 0.15)) pose.hipsRot = hv.map((n) => rnd(n));
    const dh = mech.joints.hips.position.clone().sub(hipsHome).divideScalar(animator.s || 1);
    if (dh.length() > 1e-3) pose.hipsPos = [rnd(dh.x, 3), rnd(dh.y, 3), rnd(dh.z, 3)];
    return pose;
  }
  // What the gizmo moved since the key was loaded. Threshold 0.75deg (0.004 on
  // hipsPos) so the smoother's own settling error never reads as an edit.
  function editsSinceLoad(pose) {
    if (!loadedPose) return null;
    const changed = {};
    const eps = (j) => (j === 'hipsPos' ? 0.004 : 0.75);
    for (const j of new Set([...Object.keys(pose), ...Object.keys(loadedPose)])) {
      const to = pose[j] || [0, 0, 0], from = loadedPose[j] || [0, 0, 0];
      if (to.some((n, i) => Math.abs(n - from[i]) > eps(j))) changed[j] = { from, to };
    }
    return changed;
  }
  function outputPose() {
    const pose = readPose();
    const n = Object.keys(pose).length;
    const payload = {
      mech: curId,
      model: mech.isGLB ? 'glb' : 'procedural',
      from: loadedFrom,
      units: 'degrees — clip-key pose, animations.js authoring space',
    };
    // Loaded off a clip key: say WHICH key, and hand over both the authored
    // numbers and what moved, so an edit can be applied to that one key in
    // animations.js without guessing which one was on screen.
    let edits = null;
    if (curClip && curKeys) {
      const { pose: authored, ease } = authoredAt(curClip, curKeys[curKeyIdx]);
      payload.clip = clipSel.value;
      payload.key = {
        index: curKeyIdx, of: curKeys.length, t: curKeys[curKeyIdx],
        ease: ease || 'inOutQuad', times: curKeys,
      };
      payload.authored = authored;   // what this key writes in animations.js today
      edits = editsSinceLoad(pose);
      if (edits) payload.changed = edits;
    }
    payload.pose = pose;             // the whole pose, paste-ready as a clip key
    const nEdit = edits ? Object.keys(edits).length : 0;
    show(JSON.stringify(payload, null, 2), `pose-${curId}.json`,
      curClip
        ? `${nEdit} joint(s) edited on key ${curKeyIdx + 1}/${curKeys.length} · ${n} channel(s) off rest`
        : (n ? `${n} channel(s) off rest` : 'pose matches rest'));
  }

  // The old ?debug=models POSE-mode export, kept alive here: a manifest patch
  // that BAKES the current pose into a GLB's bind (boneCorrections rotate a
  // bone off its parent, bonePos translates its rest position).
  function bindPatch() {
    const boneCorrections = {}, bonePos = {};
    for (const [j, b] of Object.entries(mech.boneMap || {})) {
      const bs = boneBase[j]; if (!bs) continue;
      const corr = bs.q.clone().invert().multiply(b.quaternion);
      const e = new THREE.Euler().setFromQuaternion(corr, 'XYZ');
      const d = [e.x * R2D, e.y * R2D, e.z * R2D];
      if (Math.abs(d[0]) > 0.15 || Math.abs(d[1]) > 0.15 || Math.abs(d[2]) > 0.15) {
        boneCorrections[j] = d.map((n) => rnd(n));
      }
      const pd = b.position.clone().sub(bs.p);
      if (pd.length() > 1e-3) bonePos[j] = [rnd(pd.x, 4), rnd(pd.y, 4), rnd(pd.z, 4)];
    }
    const patch = {};
    if (Object.keys(boneCorrections).length) patch.boneCorrections = boneCorrections;
    if (Object.keys(bonePos).length) patch.bonePos = bonePos;
    return { [curId]: patch };
  }
  function outputBindPatch() {
    if (!mech.isGLB) {
      note.textContent = 'Bind patches are a GLB manifest thing — nothing to emit for a procedural model.';
      return;
    }
    const patch = bindPatch();
    const n = Object.keys(patch[curId]).length;
    show(JSON.stringify(patch, null, 2), `bind-${curId}.json`,
      n ? 'manifest patch — paste into public/models/manifest.json' : 'bones match their bind');
  }
  function show(json, filename, msg) {
    out.style.display = 'block'; out.value = json; out.select();
    navigator.clipboard?.writeText(json).catch(() => {});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = filename; a.click();
    note.textContent = `${msg} — copied to clipboard`;
  }

  // ================= editing =================
  function selectJoint(j, toggle = true) {
    const o = mech?.joints[j];
    if (!o) return;
    if (toggle && selJoint === j) return deselect();
    selJoint = j;
    gizmo.attach(o);
    applyConstraint();
    refreshJointButtons();
  }
  function deselect() {
    selJoint = null;
    gizmo.detach();
    refreshJointButtons();
  }

  // ---- clicking a joint in the 3D view ----
  // Two ways to hit one, tried in order:
  //   1. the joint DOTS — nearest joint whose screen position is within
  //      PICK_PX of the cursor. The dots draw through the model (depthTest
  //      off), so what you can see is what you can click.
  //   2. the BODY — raycast the mech and hand the hit to the closest joint.
  //      Grabbing a forearm and getting the elbow is what you meant anyway.
  const PICK_PX = 26;
  const ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _pv = new THREE.Vector3();
  function pickJoint(cx, cy) {
    if (!mech) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const px = cx - rect.left, py = cy - rect.top;
    mech.group.updateWorldMatrix(true, true);
    let best = null, bestD = PICK_PX, bestZ = Infinity;
    for (const j of JOINT_ORDER) {
      const o = mech.joints[j];
      if (!o) continue;
      o.getWorldPosition(_pv).project(camera);
      if (_pv.z > 1) continue;                       // behind the camera
      const sx = (_pv.x * 0.5 + 0.5) * rect.width;
      const sy = (-_pv.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      // ties inside the pick radius go to the joint nearest the camera, so a
      // near shoulder wins over the far one lined up behind it
      if (d <= bestD && (d < bestD - 4 || _pv.z < bestZ)) { best = j; bestD = d; bestZ = _pv.z; }
    }
    if (best) return best;
    _ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
    ray.setFromCamera(_ndc, camera);
    const hits = ray.intersectObject(mech.group, true)
      .filter((h) => h.object.visible && h.object.type !== 'Line');
    if (!hits.length) return null;
    const p = hits[0].point;
    let jBest = null, jD = Infinity;
    for (const j of JOINT_ORDER) {
      const o = mech.joints[j];
      if (!o) continue;
      const d = o.getWorldPosition(_pv).distanceTo(p);
      if (d < jD) { jD = d; jBest = j; }
    }
    return jBest;
  }

  const canvas = renderer.domElement;
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging || gizmo.axis) { hoverJoint = null; canvas.style.cursor = ''; return; }
    hoverJoint = pickJoint(e.clientX, e.clientY);
    canvas.style.cursor = hoverJoint ? 'pointer' : '';
    hoverTag.style.display = hoverJoint ? 'block' : 'none';
    if (hoverJoint) {
      hoverTag.textContent = hoverJoint;
      hoverTag.style.left = `${e.clientX + 12}px`;
      hoverTag.style.top = `${e.clientY + 12}px`;
    }
  });
  canvas.addEventListener('pointerleave', () => {
    hoverJoint = null; hoverTag.style.display = 'none';
  });
  canvas.addEventListener('pointerup', (e) => {
    // the gizmo's own listeners run first (it was constructed first), so by
    // here a finished drag has already cleared `dragging` — swallowClick is
    // what keeps letting go of a rotate ring from re-picking a joint
    if (swallowClick) { swallowClick = false; return; }
    if (e.button !== 0 || dragging || gizmo.axis) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;   // that was an orbit
    const j = pickJoint(e.clientX, e.clientY);
    if (j) { selectJoint(j, false); note.textContent = `Selected ${j}`; } else deselect();
  });
  // R rotate · T translate · G local/world · Esc deselect
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'r') { gizmo.setMode('rotate'); markGiz(); }
    else if (k === 't') { if (!bMov.disabled) { gizmo.setMode('translate'); markGiz(); } }
    else if (k === 'g') bSpace.onclick();
    else if (e.key === 'Escape') deselect();
  });
  // THE CONSTRAINT: clips rotate joints, they never move them — the hips are
  // the one exception. With it on, a limb joint is given no translate handle,
  // so its bone length cannot be changed by accident.
  function applyConstraint() {
    const canMove = !constrain || selJoint === CAN_TRANSLATE;
    if (!canMove && gizmo.mode === 'translate') gizmo.setMode('rotate');
    bMov.disabled = !canMove;
    bMov.style.opacity = canMove ? '1' : '0.4';
    bMov.style.cursor = canMove ? 'pointer' : 'not-allowed';
    conNote.textContent = constrain
      ? 'Rotation only (hips may also translate) — limb lengths locked.'
      : 'UNLOCKED: translating a limb joint stretches it. Not clip-expressible.';
    markGiz();
  }
  function resetJoint() {
    if (!selJoint) return;
    const o = mech.joints[selJoint];
    if (selJoint === 'hips') {
      o.position.copy(hipsHome);
      o.rotation.set(...(restPose.hipsRot || [0, 0, 0]));
    } else {
      o.rotation.set(...(restPose[selJoint] || [0, 0, 0]));
      if (jointHome[selJoint]) o.position.copy(jointHome[selJoint]);   // undo a stretch
    }
    note.textContent = `Reset ${selJoint}`;
  }
  function resetAll() {
    animator.action = null;
    animator.poseStatic();
    for (const [j, p] of Object.entries(jointHome)) mech.joints[j].position.copy(p);
    mech.joints.hips.position.copy(hipsHome);
    // back to rest is no longer "an edit of key N" — drop the key context so the
    // export can't claim a rest pose is that key's new value
    clearClipContext();
    clipSel.value = '';
    loadedFrom = 'rest';
    note.textContent = 'Reset to rest';
  }

  // ================= bone display =================
  const boneMat = new THREE.MeshBasicMaterial({ color: 0x62e0ff, depthTest: false });
  const boneSelMat = new THREE.MeshBasicMaterial({ color: 0xffc447, depthTest: false });
  const boneHoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  const linkMat = new THREE.LineBasicMaterial({ color: 0x2f7f9c, depthTest: false });
  const dots = [];
  function buildBoneMarks() {
    while (boneGroup.children.length) {
      const c = boneGroup.children.pop();
      c.geometry?.dispose?.();
    }
    dots.length = 0;
    for (const j of JOINT_ORDER) {
      if (!mech.joints[j]) continue;
      // unit sphere, re-scaled per frame by distance — a jerry-sized mech and
      // colossus both get dots you can actually hit with the mouse
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), boneMat);
      dot.renderOrder = 998;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), linkMat);
      line.renderOrder = 997;
      boneGroup.add(dot, line);
      dots.push({ j, dot, line });
    }
  }
  function updateBoneMarks() {
    boneGroup.visible = showBones;
    if (!showBones || !mech) return;
    mech.group.updateWorldMatrix(true, true);
    for (const d of dots) {
      const o = mech.joints[d.j];
      o.getWorldPosition(_wa);
      d.dot.position.copy(_wa);
      const sel = d.j === selJoint, hov = d.j === hoverJoint;
      d.dot.material = sel ? boneSelMat : (hov ? boneHoverMat : boneMat);
      // constant on-screen size (~9px radius at this FOV), so the dot is the
      // same click target whether you're framed on the whole mech or a hand
      const dist = camera.position.distanceTo(_wa);
      d.dot.scale.setScalar(dist * (sel || hov ? 0.0145 : 0.011));
      // link back to the nearest ANCESTOR that is itself a posable joint, so
      // the display reads as the rig's own skeleton rather than the raw scene
      let p = o.parent, host = null;
      while (p && !host) {
        for (const j of JOINT_ORDER) if (mech.joints[j] === p) { host = p; break; }
        p = p.parent;
      }
      const pos = d.line.geometry.attributes.position;
      (host || o).getWorldPosition(_wb);
      pos.setXYZ(0, _wa.x, _wa.y, _wa.z);
      pos.setXYZ(1, _wb.x, _wb.y, _wb.z);
      pos.needsUpdate = true;
      d.line.geometry.computeBoundingSphere();
    }
  }

  // ================= UI =================
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:10px;top:10px;width:264px;max-height:96vh;overflow:auto;
    background:#121821ee;border:1px solid #2c3648;border-radius:8px;padding:10px;
    font:12px/1.4 system-ui,sans-serif;color:#dfe8f5;z-index:20`;
  document.body.appendChild(panel);
  const panelUI = setupDevPanel(panel, { key: 'posework', workbench: 'pose' });
  const el = (tag, css) => { const e = document.createElement(tag); e.style.cssText = css; return e; };
  const label = (t) => { const d = el('div', 'color:#7d8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin:8px 0 2px'); d.textContent = t; return d; };
  const btn = (text, fn, primary) => { const b = el('button', `flex:1;padding:6px;border-radius:5px;border:1px solid #2c3648;cursor:pointer;font-size:11px;background:${primary ? '#1f7a4d' : '#1a2433'};color:${primary ? '#fff' : '#cfe0f5'}`); b.textContent = text; b.onclick = fn; return b; };
  const check = (text, on, fn) => {
    const w = el('label', 'display:flex;align-items:center;gap:6px;margin:4px 0;cursor:pointer;font-size:11px');
    const c = el('input', 'cursor:pointer'); c.type = 'checkbox'; c.checked = on;
    c.onchange = () => fn(c.checked);
    const s = el('span', ''); s.textContent = text;
    w.append(c, s);
    return [w, c];
  };
  const rnd = (v, d = 2) => { const m = 10 ** d; return Math.round(v * m) / m; };

  panel.appendChild(label('Mech'));
  const mechSel = mechSelect({
    value: curId,
    note: (id) => (manifest[id]?.url ? '' : '  (procedural only)'),
    onPick: (id) => load(id),
  });
  panel.appendChild(mechSel);
  // rebuilt per mech — the control only exists for mechs that have an alternate
  const altSlot = el('div', 'margin-top:6px');
  panel.appendChild(altSlot);
  function refreshAltRow() {
    altSlot.textContent = '';
    const row = altCheckbox(altChoice(manifest, curId, altOn), (next) => { altOn = next; load(curId, { keepCam: true }); });
    if (row) altSlot.appendChild(row);
  }

  const modelRow = el('div', 'display:flex;gap:6px;margin-top:6px');
  const bGlb = btn('GLB', () => { useGlb = true; load(curId, { keepCam: true }); });
  const bProc = btn('Procedural', () => { useGlb = false; load(curId, { keepCam: true }); });
  modelRow.append(bGlb, bProc);
  panel.appendChild(modelRow);
  const glbNote = el('div', 'color:#ffd9a0;font-size:10px;margin-top:3px');
  panel.appendChild(glbNote);

  panel.appendChild(label('Starting pose (this mech only)'));
  const clipSel = el('select', 'width:100%;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px;border-radius:4px');
  clipSel.onchange = () => applyClipPose(clipSel.value);
  panel.appendChild(clipSel);
  // The scrubber steps KEY BY KEY, not by time: its value is a key index, so it
  // can only ever land on a pose the clip actually authors. Scrubbing to an
  // in-between time would hand you an interpolated pose that exists in no key,
  // and any edit made there has nowhere to go in animations.js.
  const timeRow = el('div', 'display:none;align-items:center;gap:6px;margin-top:5px');
  const timeSlider = el('input', 'flex:1'); timeSlider.type = 'range'; timeSlider.min = '0';
  timeSlider.step = '1';
  timeSlider.oninput = () => applyClipPose(clipSel.value, { key: +timeSlider.value });
  const timeVal = el('span', 'color:#9fb2c8;font-size:10px;white-space:nowrap');
  timeRow.append(timeSlider, timeVal);
  panel.appendChild(timeRow);
  const keyRow = el('div', 'display:none;gap:6px;margin-top:4px');
  const stepKey = (d) => applyClipPose(clipSel.value, { key: curKeyIdx + d });
  keyRow.append(btn('◀ key', () => stepKey(-1)), btn('key ▶', () => stepKey(1)));
  panel.appendChild(keyRow);

  panel.appendChild(label('Gizmo'));
  const gizRow = el('div', 'display:flex;gap:6px');
  const bRot = btn('Rotate', () => { gizmo.setMode('rotate'); markGiz(); });
  const bMov = btn('Translate', () => { if (!bMov.disabled) { gizmo.setMode('translate'); markGiz(); } });
  const bSpace = btn('Local', () => {
    const l = gizmo.space === 'local';
    gizmo.setSpace(l ? 'world' : 'local');
    bSpace.textContent = l ? 'World' : 'Local';
  });
  gizRow.append(bRot, bMov, bSpace);
  panel.appendChild(gizRow);
  function markGiz() {
    for (const [b, m] of [[bRot, 'rotate'], [bMov, 'translate']]) {
      const on = gizmo.mode === m;
      b.style.background = on ? '#2b6cb0' : '#1a2433';
      b.style.color = on ? '#fff' : '#9fb2c8';
    }
  }

  const [conRow, conCheck] = check('Apply constraints', true, (v) => { constrain = v; applyConstraint(); });
  panel.appendChild(conRow);
  const conNote = el('div', 'color:#7d8ea3;font-size:10px;margin:-2px 0 2px');
  panel.appendChild(conNote);
  const [boneRow] = check('Show bones', true, (v) => { showBones = v; });
  panel.appendChild(boneRow);

  panel.appendChild(label('Joint'));
  const jointGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:4px');
  panel.appendChild(jointGrid);
  function buildJointButtons() {
    jointGrid.innerHTML = '';
    for (const j of JOINT_ORDER) {
      const has = !!mech.joints[j];
      const driven = !mech.isGLB || !!mech.boneMap?.[j];
      const b = el('button', `padding:3px 2px;font-size:11px;border-radius:4px;cursor:${has ? 'pointer' : 'not-allowed'};background:${has ? '#1a2433' : '#141821'};color:${has ? (driven ? '#cfe0f5' : '#8a94a5') : '#55606f'};border:1px solid #2c3648`);
      b.textContent = j + (has && !driven ? ' ·' : '');
      b.disabled = !has;
      b._joint = j;
      if (has) b.onclick = () => selectJoint(j);
      jointGrid.appendChild(b);
    }
    refreshJointButtons();
  }
  function refreshJointButtons() {
    for (const b of jointGrid.children) b.style.outline = b._joint === selJoint ? '2px solid #48b0ff' : '';
  }

  const resetRow = el('div', 'display:flex;gap:6px;margin-top:8px');
  resetRow.append(btn('Reset joint', resetJoint), btn('Reset all', resetAll));
  panel.appendChild(resetRow);

  panel.appendChild(label('Export'));
  const outRow = el('div', 'display:flex;gap:6px');
  outRow.append(btn('Copy pose ▶', outputPose, true), btn('Bind patch', outputBindPatch));
  panel.appendChild(outRow);
  const note = el('div', 'color:#9fe8c0;font-size:10px;margin-top:5px;min-height:1.2em');
  panel.appendChild(note);
  const out = el('textarea', `width:100%;height:150px;margin-top:6px;background:#0b0f16;color:#8fe;
    border:1px solid #2c3648;font:11px/1.35 ui-monospace,monospace;display:none`);
  panel.appendChild(out);
  const help = el('div', 'color:#7d8ea3;font-size:10px;margin-top:8px');
  help.innerHTML = 'Click a joint dot (or the body part) to select it, then drag the gizmo.<br>' +
    'Orbit: drag empty space · Zoom: wheel · <b>R</b> rotate · <b>T</b> translate · ' +
    '<b>G</b> local/world · <b>Esc</b> deselect.';
  panel.appendChild(help);

  // cursor-follow name tag for the joint under the pointer
  const hoverTag = el('div', `position:fixed;display:none;pointer-events:none;z-index:30;
    background:#0b0f16dd;border:1px solid #2c3648;border-radius:4px;padding:2px 6px;
    font:11px/1.3 ui-monospace,monospace;color:#8fe`);
  document.body.appendChild(hoverTag);

  markGiz();
  await load(curId);
  applyConstraint();

  // ---- loop: the pose is whatever the joints say; a GLB just needs the
  // retarget re-run so the real bones follow what the gizmo did ----
  engine.onUpdate = () => {
    if (!mech) return;
    if (mech.isGLB) mech.postAnimate?.();
  };
  engine.onRender = () => {
    orbit.update();
    updateBoneMarks();
  };
  engine.start();
}
