// ?debug=pose — the POSE workbench. One mech, frozen, posed by hand.
//
//   ?debug=pose[&mech=<id>][&model=glb|proc][&clip=<name>]
//
// Pick a mech, optionally load one of ITS OWN poses as a starting point (the
// dropdown lists only the clips that mech can actually play — vulcan's ult
// pose is in his list because vulcan is the one who casts it), then drag joints
// with the gizmo and hit "Copy pose". The export is a clip-key pose block in
// DEGREES, the same shape animations.js is authored in, so a pose dialled here
// can be pasted straight into a clip — or handed to someone as "this is the arm
// pose I want".
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
  let constrain = true;
  let showBones = true;

  camera.position.set(7, 6, 12);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 4, 0);
  orbit.update();

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSpace('local'); gizmo.setMode('rotate'); gizmo.setSize(0.8);
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });

  // ---- live state ----
  let mech = null, animator = null, selJoint = null;
  let restPose = null;          // animator rest — the baseline the export diffs
  const hipsHome = new THREE.Vector3();
  const jointHome = {};         // every joint's rest local position (reset target)
  const boneBase = {};          // GLB real-bone baseline, for the bind patch
  let loadedFrom = 'rest';      // what the current pose started life as
  const boneGroup = new THREE.Group(); scene.add(boneGroup);
  const _wa = new THREE.Vector3(), _wb = new THREE.Vector3();

  // ================= build =================
  async function load(id) {
    curId = id;
    const u = new URL(location.href);
    u.searchParams.set('mech', id);
    u.searchParams.set('model', useGlb ? 'glb' : 'proc');
    history.replaceState(null, '', u);
    gizmo.detach(); selJoint = null;
    if (mech) {
      scene.remove(mech.group);
      mech.group.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) m?.dispose?.();
      });
    }
    const def = ROSTER_BY_ID[id];
    const hasGlb = !!manifest[id]?.url;
    mech = (useGlb && hasGlb) ? (await buildGlbForTool(def)).mech : buildMech(def);
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
    buildJointButtons();
    buildBoneMarks();
    buildClipOptions();
    frameCamera();
    out.style.display = 'none';
    note.textContent = '';
    window.__poseWork = {
      get mech() { return mech; }, get animator() { return animator; },
      get sel() { return selJoint; },
      select: selectJoint, loadClip: applyClipPose, pose: readPose,
      patch: bindPatch, reset: resetAll,
      setConstrain: (v) => { constrain = !!v; conCheck.checked = constrain; applyConstraint(); },
    };
  }

  // Frame whatever was just loaded: mechs run from jerry's knee height to
  // colossus, so a fixed camera either crops the head off or loses him.
  function frameCamera() {
    mech.group.updateWorldMatrix(true, true);
    // head top, measured off the posed skin (Box3 reads a skinned mesh at its
    // BIND pose, which is the wrong size for whatever is on screen)
    const h = Math.max(2, measureHeadTop(mech) || 6);
    orbit.target.set(0, h * 0.55, 0);
    camera.position.set(h * 0.5, h * 0.72, h * 2.1);
    orbit.update();
  }

  // ================= starting poses =================
  // Only the clips THIS mech can play (mechclips.js reads the real play sites),
  // so vulcan's list carries his ult's hurricaneSpin and nobody else's.
  function clipsForMech() {
    const def = ROSTER_BY_ID[curId];
    return mechClipList(def, mech?.isGLB ? profileFor(curId) : null).filter((c) => CLIPS[c.name]);
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
      applyClipPose(want);
    } else {
      timeRow.style.display = 'none';
    }
  }
  // Sample a clip through the REAL animator, so what lands here is exactly what
  // the game shows at that moment — profile overrides, mirrored arms, signature
  // motion and all. Then the animator is stopped and the joints are yours.
  function applyClipPose(name, tRaw) {
    if (!name) { resetAll(); loadedFrom = 'rest'; timeRow.style.display = 'none'; return; }
    const clip = CLIPS[name];
    if (!clip) return;
    const t = tRaw === undefined ? clip.dur : Math.max(0, Math.min(clip.dur, tRaw));
    timeRow.style.display = 'flex';
    timeSlider.max = String(clip.dur);
    timeSlider.step = String(Math.max(0.01, clip.dur / 100));
    timeSlider.value = String(t);
    timeVal.textContent = `t ${t.toFixed(2)} / ${clip.dur.toFixed(2)}s`;

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
    loadedFrom = `${name} @ t=${t.toFixed(2)}`;
    gizmo.detach(); selJoint = null;
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
  function outputPose() {
    const pose = readPose();
    const n = Object.keys(pose).length;
    const payload = {
      mech: curId,
      model: mech.isGLB ? 'glb' : 'procedural',
      from: loadedFrom,
      units: 'degrees — clip-key pose, animations.js authoring space',
      pose,
    };
    show(JSON.stringify(payload, null, 2), `pose-${curId}.json`,
      n ? `${n} channel(s) off rest` : 'pose matches rest');
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
  function selectJoint(j) {
    const o = mech.joints[j];
    if (!o) return;
    if (selJoint === j) { selJoint = null; gizmo.detach(); refreshJointButtons(); return; }
    selJoint = j;
    gizmo.attach(o);
    applyConstraint();
    refreshJointButtons();
  }
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
    note.textContent = 'Reset to rest';
  }

  // ================= bone display =================
  const boneMat = new THREE.MeshBasicMaterial({ color: 0x62e0ff, depthTest: false });
  const boneSelMat = new THREE.MeshBasicMaterial({ color: 0xffc447, depthTest: false });
  const linkMat = new THREE.LineBasicMaterial({ color: 0x2f7f9c, depthTest: false });
  const dots = [];
  function buildBoneMarks() {
    while (boneGroup.children.length) {
      const c = boneGroup.children.pop();
      c.geometry?.dispose?.();
    }
    dots.length = 0;
    const r = (mech.dims?.scale || 1) * 0.1;
    for (const j of JOINT_ORDER) {
      if (!mech.joints[j]) continue;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), boneMat);
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
      d.dot.material = d.j === selJoint ? boneSelMat : boneMat;
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
  const mechSel = el('select', 'width:100%;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px;border-radius:4px');
  for (const r of ROSTER) {
    const o = document.createElement('option');
    o.value = r.id; o.textContent = r.name + (manifest[r.id]?.url ? '' : '  (procedural only)');
    mechSel.appendChild(o);
  }
  mechSel.onchange = () => load(mechSel.value);
  panel.appendChild(mechSel);

  const modelRow = el('div', 'display:flex;gap:6px;margin-top:6px');
  const bGlb = btn('GLB', () => { useGlb = true; load(curId); });
  const bProc = btn('Procedural', () => { useGlb = false; load(curId); });
  modelRow.append(bGlb, bProc);
  panel.appendChild(modelRow);
  const glbNote = el('div', 'color:#ffd9a0;font-size:10px;margin-top:3px');
  panel.appendChild(glbNote);

  panel.appendChild(label('Starting pose (this mech only)'));
  const clipSel = el('select', 'width:100%;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px;border-radius:4px');
  clipSel.onchange = () => applyClipPose(clipSel.value);
  panel.appendChild(clipSel);
  const timeRow = el('div', 'display:none;align-items:center;gap:6px;margin-top:5px');
  const timeSlider = el('input', 'flex:1'); timeSlider.type = 'range'; timeSlider.min = '0';
  timeSlider.oninput = () => applyClipPose(clipSel.value, +timeSlider.value);
  const timeVal = el('span', 'color:#9fb2c8;font-size:10px;white-space:nowrap');
  timeRow.append(timeSlider, timeVal);
  panel.appendChild(timeRow);

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
  help.textContent = 'Orbit: drag empty space · Zoom: wheel · Click a joint, then drag the gizmo rings.';
  panel.appendChild(help);

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
