// /workbench/?edit=rig&mech=<id> — interactive rig editor.
//
// Loads the raw GLB mesh, drops a clean hand-placed skeleton onto it (from
// src/mechs/rigs/<id>.rig.js), and lets you DRAG each bone with an on-screen
// gizmo. The mesh re-skins live (per-part nearest-bone), a color view shows
// which bone owns each shell, a Test-swing animates the claws so you can judge
// articulation, and Export emits the bones array to paste back into the rig
// file. Edits persist to localStorage so a reload keeps your work.
//
//   /workbench/?edit=rig&mech=cranky
//
// Everything game-shaped here arrives through `config` (the workbench
// contract): the subject list, its raw asset, the canonical joint names, the
// custom-rig registry and where a rig is saved. See workbench/config.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { setupDevPanel } from '../ui/panel.js';
import { wireExportChanges } from '../ui/save.js';
import { altChoice, altCheckbox, reloadWithVariant } from '../ui/variantpick.js';
import { subjectSelect, gotoSubject } from '../ui/subjectpick.js';

const VIEW = 10;                 // display scale for the small raw model
// distinct colors per bone role (game joints get vivid hues; struts gray)
function boneColor(name, i) {
  if (name.startsWith('shoulderL') || name.startsWith('elbowL') || name.startsWith('handL') || name === 'clawL') return [1.0, 0.15, 0.12];
  if (name.startsWith('shoulderR') || name.startsWith('elbowR') || name.startsWith('handR') || name === 'clawR') return [1.0, 0.62, 0.05];
  if (name.startsWith('thighL') || name.startsWith('kneeL') || name.startsWith('ankleL') || name === 'footL') return [0.15, 0.35, 1.0];
  if (name.startsWith('thighR') || name.startsWith('kneeR') || name.startsWith('ankleR') || name === 'footR') return [0.1, 0.8, 1.0];
  if (name === 'head') return [0.9, 0.9, 0.2];
  if (name === 'torso' || name === 'hips') return [0.55, 0.55, 0.6];
  // struts / extras — muted grays, slightly varied so neighbours differ
  const g = 0.28 + 0.08 * (i % 3);
  return [g, g, g * 1.1];
}

// Loud, centered "can't edit this" card, drawn where the model would be.
// Every bail-out below goes through here: the editor never starts half-built
// and never leaves a blank canvas with an exception in the console.
// The card carries the mech dropdown too — a blocked mech builds no panel, and
// without a picker here the only way out would be to hand-edit the URL.
function showBlocker({ title, detail, hint, id, config }) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;inset:0;z-index:200;display:flex;align-items:center;
    justify-content:center;background:rgba(10,13,18,0.92);font:14px/1.55 system-ui,sans-serif;color:#dfe8f5`;
  const card = document.createElement('div');
  card.style.cssText = `max-width:560px;padding:26px 30px;border:1px solid #46324a;border-radius:12px;
    background:#14181f;box-shadow:0 18px 60px rgba(0,0,0,0.6);text-align:left`;
  const h = document.createElement('div');
  h.style.cssText = 'font:600 19px/1.3 system-ui,sans-serif;color:#ffb4a2;margin-bottom:12px';
  h.textContent = `⚠  ${title}`;
  const d = document.createElement('div');
  d.style.cssText = 'color:#c3cede;margin-bottom:14px';
  d.textContent = detail;
  const t = document.createElement('div');
  t.style.cssText = `color:#8fa2ba;font:12.5px/1.6 ui-monospace,monospace;background:#0b0f16;
    border:1px solid #23303f;border-radius:6px;padding:10px 12px;white-space:pre-wrap`;
  t.textContent = hint;
  card.append(h, d, t);
  const pick = document.createElement('div');
  pick.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:16px;font-size:12px;color:#8fa2ba';
  const pl = document.createElement('span');
  pl.textContent = 'Open another mech:';
  pick.append(pl, subjectSelect({
    config,
    value: id,
    css: `flex:1;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px;
      border-radius:4px;font:12px system-ui,sans-serif`,
    note: (nid) => config.catalogue.note(nid),
    onPick: (next) => gotoSubject(next),
  }));
  card.appendChild(pick);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
}

export async function runRigWorkbench(config, params) {
  const startId = params.get('mech') || params.get('rigedit') || params.get('id');
  const JOINT_SET = new Set(config.rig.joints);
  const rigFor = (x) => config.rig.custom.get(x);
  const rigIds = () => config.rig.custom.ids();
  const { apply: applyCustomRig, setWeights, rebindRest, buildPosts: buildRigPosts } = config.rig.custom;
  const catalogue = config.catalogue.list();
  const id = startId && startId !== 'true' && startId !== '1'
    ? startId
    : (catalogue.find((c) => c.hasRig)?.id || catalogue[0]?.id);
  // WHICH BUILD. A mech's custom rig may live on the manifest's `alt` entry
  // rather than the primary (rhino, inferno — a re-rig staged for judging
  // before promotion). That build is then the ONLY one with a rig to edit, so
  // open it instead of bailing out; altpick.altChoice decides, and the panel's
  // "Edit Alternate GLB" box shows the state (ticked + disabled when forced).
  const manifest = config.manifest();
  const wantAlt = params.get('alt') === '1' || params.get('variant') === 'alt';
  const alt = altChoice(manifest, id, wantAlt, 'rig');
  const useAlt = alt.useAlt;
  const LS_KEY = () => `rigedit:${id}`;
  function loadRig() {
    const saved = localStorage.getItem(LS_KEY());
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    const r = rigFor(id);
    return r ? JSON.parse(JSON.stringify(r)) : { bones: [] };
  }

  // ---- preflight ---------------------------------------------------------
  // This editor drops a hand-authored skeleton (src/mechs/rigs/<id>.rig.js)
  // onto a GLB, so it needs BOTH halves. Check them up front and explain
  // what's missing on screen — previously a mech with no rig file sailed
  // through to applyCustomRig and died on a null bone root.
  let raw = null, loadErr = null;
  try { raw = await config.variants.raw(id, { variant: useAlt ? 'alt' : 'glb' }); } catch (e) { loadErr = e; }
  let probeMesh = null;
  raw?.scene.traverse((o) => { if (o.isSkinnedMesh && !probeMesh) probeMesh = o; });
  const startRig = loadRig();
  const editable = rigIds().join(', ');
  const problem = loadErr
    ? { title: `${id}'s GLB failed to load`,
      detail: 'The model file is listed in the manifest but could not be parsed, so there is nothing to rig.',
      hint: `?edit=rig&mech=${id}${useAlt ? ' (alt)' : ''}\n${loadErr.message || loadErr}` }
    : !raw
      ? { title: `No GLB for "${id}"`,
        detail: `The rig editor edits a GLB mech. public/models/manifest.json has no ${useAlt ? '"alt" ' : ''}entry with a url for this mech${useAlt ? '' : ', so it runs on the procedural model and has no rig to edit'}.`,
        hint: `Editable now: ${editable}\nAdd a GLB + manifest entry for "${id}" first.` }
      : !probeMesh
        ? { title: `${id}'s GLB has no skinned mesh`,
          detail: 'The file loaded but contains no SkinnedMesh, so there is no skin to re-bind to a rig.',
          hint: `?edit=rig&mech=${id}${useAlt ? '&alt=1' : ''}` }
        : !startRig.bones?.length
          ? { title: `${id} has no custom rig to edit`,
            detail: 'This mech runs on its GLB\'s own auto-rig (manifest boneOverrides + skinOps). '
              + 'The editor only edits hand-authored rigs — the skeletons in src/mechs/rigs/ that REPLACE an auto-rig — so there is nothing here to drag yet.',
            hint: `Editable now: ${editable}\n\nTo start one for "${id}":\n`
              + `  1. create src/mechs/rigs/${id}.rig.js exporting\n`
              + `     { bones: [{ name: 'hips', parent: null, pos: [x, y, z] }, ...] }\n`
              + `     (positions are MESH-LOCAL, i.e. raw GLB bind space)\n`
              + `  2. register it in src/mechs/rigs/index.js\n`
              + `  3. reload ?edit=rig&mech=${id} and drag the bones into place` }
          : !startRig.bones.some((b) => !b.parent || !startRig.bones.some((p) => p.name === b.parent))
            ? { title: `${id}'s rig has no root bone`,
              detail: 'Every bone in the rig names a parent, so the skeleton has no root to hang off — usually a typo in a `parent` field, or a cycle.',
              hint: `Fix src/mechs/rigs/${id}.rig.js: exactly one bone must have parent: null.` }
            : null;
  if (problem) {
    console.warn(`rigedit: ${problem.title}`);
    showBlocker({ ...problem, id, config });
    return null;
  }

  const engine = config.stage.engine();
  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(0x1a1f29);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x565c66, 2.2));
  const dl = new THREE.DirectionalLight(0xffffff, 2.0); dl.position.set(6, 12, 8); scene.add(dl);
  const grid = new THREE.GridHelper(40, 40, 0x33445e, 0x223040); scene.add(grid);

  camera.position.set(9, 7, 12);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 4, 0); orbit.update();

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode('translate'); gizmo.setSpace('world'); gizmo.setSize(0.8);
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  gizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    if (e.value) { dragSnap = snapshotRig(); captureSoloMoveTargets(); }  // pre-drag state
    else { onEditCommit(); soloMoveTargets = null; }                      // reweight on release
  });
  gizmo.addEventListener('objectChange', onGizmoMove);

  // Solo move: freeze the world positions of the selected bone's DIRECT children
  // at drag-start. Re-pinning them there each frame (below) keeps the whole
  // subtree still while only the selected joint moves.
  function captureSoloMoveTargets() {
    soloMoveTargets = null;
    if (!soloMove || !selName) return;
    soloMoveTargets = new Map();
    for (const bd of rigObj.bones) {
      if (bd.parent !== selName) continue;
      const c = byName[bd.name];
      if (c) soloMoveTargets.set(bd.name, c.getWorldPosition(new THREE.Vector3()));
    }
  }

  // ---- state ----
  let mesh = null, armature = null, container = null;
  let rigObj = null, bones = null, byName = null, root = null;
  let selName = null;
  let skelHelper = null;
  let postMeshes = [];             // black rig posts (reskin.buildRigPosts)
  const handles = [];              // {mesh, name}
  let origMat = null, colorMat = null, colorOn = false;
  let swing = 0, swinging = false;
  let soloRoot = null;             // solo a bone's subtree (declutter the rest)
  let undoStack = [], redoStack = [];
  let dragSnap = null;             // rig snapshot captured at gizmo drag-start
  let soloMove = false;            // move a joint WITHOUT dragging its subtree
  let soloMoveTargets = null;      // Map childName -> frozen world pos during a solo-move drag

  // ---- undo/redo (snapshots of rigObj) ----
  const snapshotRig = () => JSON.parse(JSON.stringify(rigObj));
  function pushUndo() {
    undoStack.push(snapshotRig());
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
  }
  function restoreRig(snap) {
    rigObj = snap;
    rebuild(true); buildBoneUI();
    if (selName && rigObj.bones.some((b) => b.name === selName)) selectBone(selName);
    else { gizmo.detach(); selName = null; }
    if (soloRoot && !rigObj.bones.some((b) => b.name === soloRoot)) soloRoot = null;
    updateSolo();
    saveRig();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshotRig());
    restoreRig(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshotRig());
    restoreRig(redoStack.pop());
  }

  // ---- solo a bone's subtree (bone + all descendants) ----
  function subtreeSet(rootName) {
    const set = new Set();
    if (!rootName) return set;
    const kids = new Map();
    for (const b of rigObj.bones) {
      if (!kids.has(b.parent)) kids.set(b.parent, []);
      kids.get(b.parent).push(b.name);
    }
    const stack = [rootName];
    while (stack.length) {
      const n = stack.pop();
      if (set.has(n)) continue;
      set.add(n);
      for (const k of (kids.get(n) || [])) stack.push(k);
    }
    return set;
  }
  // Solo just DECLUTTERS: it hides the other bones' dots and the skeleton
  // connections between them so you can focus on one subtree. It does NOT
  // touch the robot rendering (no dimming, no forced color view) — the mesh
  // looks exactly the same.
  function toggleSolo(name) {
    soloRoot = soloRoot === name ? null : name;
    updateSolo();
    styleList();
    refreshModeButtons();
  }
  function updateSolo() {
    const sub = soloRoot ? subtreeSet(soloRoot) : null;
    for (const h of handles) h.mesh.visible = !sub || sub.has(h.name);
    // hide the full skeleton and, while soloing, draw ONLY the subtree's
    // connections in a dedicated line set (masking the shared helper buffer is
    // unreliable across GL backends, so use real geometry instead)
    if (skelHelper) skelHelper.visible = !soloRoot;
    buildSoloLines(sub);
  }
  // list of [{child, parent}] connections, one per skeleton segment
  let helperSeg = [];
  let soloLines = null;   // THREE.LineSegments of just the solo subtree
  let soloSeg = [];       // the {child,parent} pairs currently in soloLines
  function refreshHelperSeg() {
    helperSeg = [];
    if (!skelHelper) return;
    for (const b of skelHelper.bones) {
      if (b.parent && b.parent.isBone) helperSeg.push({ child: b.name, parent: b.parent.name });
    }
  }
  function disposeSoloLines() {
    if (!soloLines) return;
    scene.remove(soloLines);
    soloLines.geometry.dispose(); soloLines.material.dispose();
    soloLines = null; soloSeg = [];
  }
  function buildSoloLines(sub) {
    disposeSoloLines();
    if (!sub) return;
    soloSeg = helperSeg.filter((s) => sub.has(s.child) && sub.has(s.parent));
    if (!soloSeg.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(soloSeg.length * 6), 3));
    // draw on top like the handles so the focused chain reads clearly
    const mat = new THREE.LineBasicMaterial({ color: 0x8fe6b0, depthTest: false, transparent: true });
    soloLines = new THREE.LineSegments(geo, mat);
    soloLines.renderOrder = 998;
    scene.add(soloLines);
    updateSoloLines();
  }
  const _wa = new THREE.Vector3(), _wb = new THREE.Vector3();
  function updateSoloLines() {
    if (!soloLines) return;
    const pos = soloLines.geometry.attributes.position;
    for (let i = 0; i < soloSeg.length; i++) {
      const cb = byName[soloSeg[i].child], pb = byName[soloSeg[i].parent];
      if (!cb || !pb) continue;
      cb.getWorldPosition(_wa); pb.getWorldPosition(_wb);
      pos.setXYZ(i * 2, _wa.x, _wa.y, _wa.z);
      pos.setXYZ(i * 2 + 1, _wb.x, _wb.y, _wb.z);
    }
    pos.needsUpdate = true;
  }

  function saveRig() { localStorage.setItem(LS_KEY(), JSON.stringify(rigObj)); }

  // `raw` / `startRig` came from the preflight above — both are known good.
  function load() {
    container = new THREE.Group();
    container.scale.setScalar(VIEW);
    container.add(raw.scene);
    scene.add(container);
    raw.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    armature = mesh.parent;
    container.updateMatrixWorld(true);
    // ground it: drop so the lowest skinned vertex sits on y=0
    origMat = mesh.material;
    rigObj = startRig;
    rebuild(true);
    groundIt();
    buildBoneUI();
  }

  // (re)build the skeleton + weights from rigObj, refresh helpers/handles
  function rebuild(full) {
    if (full) {
      // remove any prior custom bone root
      if (root && root.parent) root.parent.remove(root);
      const res = applyCustomRig(mesh, rigObj);
      bones = res.bones; byName = res.byName; root = res.root;
      if (skelHelper) { scene.remove(skelHelper); skelHelper.dispose?.(); }
      skelHelper = new THREE.SkeletonHelper(root);
      skelHelper.material.linewidth = 2;
      scene.add(skelHelper);
      refreshHelperSeg();
      buildHandles();
    }
    regenPosts();
    updateColors();
  }

  // (re)wire the black posts from the current bone positions (they're parented
  // to the bones, so this reflects every move/add the user makes). This runs on
  // structural changes (add/del/reset); the per-frame updatePostsLive() below
  // keeps the rods glued to the bones WHILE you drag.
  function regenPosts() {
    for (const m of postMeshes) { m.parent?.remove(m); m.geometry?.dispose?.(); }
    postMeshes = buildRigPosts(byName, rigObj);
  }

  // The posts are an add-on for rendering, not core geometry — they must track
  // the back-leg bones live. Each rod cylinder is parented to its PARENT bone
  // and points at the CHILD bone; every frame we re-length + re-orient it from
  // the bones' current positions so moving a joint drags its rod with it. (Cap
  // spheres are parented to the child bone, so they follow on their own.)
  const _PU = new THREE.Vector3(0, 1, 0);
  const _pc = new THREE.Vector3();
  function updatePostsLive() {
    for (const m of postMeshes) {
      const childName = m.userData.rigPost;               // set only on rod cylinders
      if (!childName || !m.geometry?.parameters?.height) continue;
      const child = byName[childName];
      const parentBone = m.parent;                        // the bone the rod hangs off
      if (!child || !parentBone) continue;
      child.getWorldPosition(_pc);
      parentBone.worldToLocal(_pc);                       // child offset in parent space
      const len = _pc.length();
      if (len < 1e-4) continue;
      m.scale.set(1, len / m.geometry.parameters.height, 1); // geometry base sits at origin
      m.quaternion.setFromUnitVectors(_PU, _pc.normalize());
      m.position.set(0, 0, 0);
    }
  }

  function groundIt() {
    container.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    container.position.y -= box.min.y;
    container.updateMatrixWorld(true);
  }

  // clickable sphere per bone, positioned each frame at the bone's world pos
  function buildHandles() {
    for (const h of handles) scene.remove(h.mesh);
    handles.length = 0;
    rigObj.bones.forEach((bd, i) => {
      const col = boneColor(bd.name, i);
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 10),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(col[0], col[1], col[2]), depthTest: false }));
      m.renderOrder = 999;
      m.userData.name = bd.name;
      scene.add(m);
      handles.push({ mesh: m, name: bd.name });
    });
  }

  function syncHandles() {
    for (const h of handles) {
      const b = byName[h.name];
      if (b) b.getWorldPosition(h.mesh.position);
      const on = h.name === selName;
      h.mesh.scale.setScalar(on ? 1.6 : 1);
    }
  }

  // recompute rigObj positions from the live bones (mesh-local, unscaled)
  function syncRigFromBones() {
    const p = new THREE.Vector3();
    for (const bd of rigObj.bones) {
      const b = byName[bd.name];
      if (!b) continue;
      b.getWorldPosition(p);
      armature.worldToLocal(p);
      bd.pos = [round(p.x), round(p.y), round(p.z)];
    }
  }

  const _smp = new THREE.Vector3();
  function onGizmoMove() {
    if (!selName) return;
    // solo move: counter-move the direct children so their world positions stay
    // put — only the selected joint shifts, the rest of the limb holds still
    // relative to the geometry (grandchildren ride their frozen parents, so
    // pinning direct children freezes the whole subtree)
    if (soloMove && soloMoveTargets) {
      const sel = byName[selName];
      sel.updateWorldMatrix(true, false);
      for (const [name, worldTarget] of soloMoveTargets) {
        const c = byName[name];
        if (!c) continue;
        _smp.copy(worldTarget);
        sel.worldToLocal(_smp);   // where the child must sit in the moved parent's space
        c.position.copy(_smp);
      }
    }
    // moving the bind: keep the mesh at REST (don't deform while editing)
    if (!swinging) rebindRest(mesh, bones);
  }
  function onEditCommit() {
    if (!selName || swinging) return;
    syncRigFromBones();
    // record the pre-drag snapshot on the undo stack only if the drag actually
    // moved something
    if (dragSnap && JSON.stringify(dragSnap) !== JSON.stringify(rigObj)) {
      undoStack.push(dragSnap);
      if (undoStack.length > 200) undoStack.shift();
      redoStack.length = 0;
    }
    dragSnap = null;
    setWeights(mesh, rigObj);   // reassign vertices to the nearest new bone
    rebindRest(mesh, bones);
    regenPosts();               // posts follow the moved bones
    updateColors();
    saveRig();
  }

  function selectBone(name) {
    selName = name;
    const b = byName[name];
    if (b) gizmo.attach(b);
    for (const c of jointList.children) c.dataset.on = String(c.dataset.name === name);
    styleList();
    posReadout();
  }

  // color the mesh by which bone owns each vertex
  function makeColorMat() {
    return new THREE.MeshBasicMaterial({ vertexColors: true }); // flat, no bloom
  }
  function updateColors() {
    if (!colorOn) return;
    const geo = mesh.geometry;
    const jnt = geo.attributes.skinIndex;
    const n = jnt.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const bi = jnt.getX(i);
      const bd = rigObj.bones[bi];
      const c = bd ? boneColor(bd.name, bi) : [0.3, 0.3, 0.3];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  function setColorMode(on) {
    colorOn = on;
    if (on) {
      colorMat = colorMat || makeColorMat();
      mesh.material = colorMat;
      updateColors();
    } else {
      mesh.material = origMat;
    }
    refreshModeButtons();
  }

  // ---- picking ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (gizmo.dragging) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // only pick VISIBLE handles — when soloing, the dimmed-out bones aren't
    // selectable, so you can only move the joints you're focused on
    const hit = ray.intersectObjects(handles.filter((h) => h.mesh.visible).map((h) => h.mesh), false)[0];
    if (hit) selectBone(hit.object.userData.name);
  });

  // ---- keyboard: undo/redo + solo ----
  window.addEventListener('keydown', (e) => {
    if (document.activeElement === addName) return;   // don't hijack the name field
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault(); if (e.shiftKey) redo(); else undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault(); redo(); return;
    }
    if (e.key === 's' || e.key === 'S') {
      if (selName) toggleSolo(selName);
    }
  });

  // ---- test swing (rotate the claw + leg joints to check articulation) ----
  function applyTestPose(k) {
    // k: 0 rest .. 1 full. claws pitch forward, legs take a step.
    const set = (name, x, y, z) => { const b = byName[name]; if (b) b.rotation.set(x, y, z); };
    for (const s of ['L', 'R']) {
      set('shoulder' + s, -0.5 * k, 0, 0);
      set('elbow' + s, -0.35 * k, 0, 0);
      set('hand' + s, -0.2 * k, 0, 0);
    }
    set('thighL', 0.3 * k, 0, 0); set('kneeL', -0.4 * k, 0, 0);
    set('thighR', -0.3 * k, 0, 0); set('kneeR', 0.4 * k, 0, 0);
    mesh.updateMatrixWorld(true);
  }
  function resetPose() {
    for (const b of bones) b.rotation.set(0, 0, 0);
    mesh.updateMatrixWorld(true);
  }

  // ---- export ----
  // the bone list as data — what Export prints and Save posts, from one place
  function rigBonesPayload() {
    syncRigFromBones();
    return rigObj.bones.map((b) => {
      const o = { name: b.name, parent: b.parent ?? null, pos: b.pos.map((v) => +Number(v).toFixed(3)) };
      if (b.post !== undefined) o.post = b.post;
      if (b.bias !== undefined) o.bias = b.bias;
      return o;
    });
  }

  // SAVE — write the bones into src/mechs/rigs/<id>.rig.js via the dev server.
  // Only the bone array is replaced: the file's header comment and its
  // skinSpan/softSkin/cutWelds/cutPairs survive (tools/rigfmt.mjs), which is
  // the whole reason this is a splice and not a file write.
  async function saveRig() {
    const bones = rigBonesPayload();
    saveBtn.disabled = true;
    setNote(`Saving ${bones.length} bones to ${id}.rig.js…`);
    const res = await config.rig.save(id, bones);
    saveBtn.disabled = false;
    if (res.ok) {
      setNote(`SAVED — ${res.bones} bones written to ${res.file}`
        + (res.kept ? ' (skinSpan / softSkin / cut* preserved)' : '')
        + '. Reload to see it rebuilt from file. Commit to publish.');
      changes?.refresh();
    } else if (res.offline) {
      setNote(`No dev server to save through (${res.error}). Run \`npm run dev\`, or use Export rig.`);
    } else {
      setNote(`Save FAILED: ${res.error}\nNothing was written — Export rig is the fallback.`);
    }
  }

  function exportRig() {
    syncRigFromBones();
    const lines = rigObj.bones.map((b) => {
      // preserve the semantic flags the rig depends on — `post` (renders a black
      // rod along the bone) and `bias` (skin win-radius tuning) — so a
      // round-trip through Export doesn't silently drop them
      let extra = '';
      if (b.post !== undefined) extra += `, post: ${typeof b.post === 'object' ? JSON.stringify(b.post) : b.post}`;
      if (b.bias !== undefined) extra += `, bias: ${b.bias}`;
      return `    { name: '${b.name}', parent: ${b.parent ? `'${b.parent}'` : 'null'}, pos: [${b.pos.map((v) => v.toFixed(2)).join(', ')}]${extra} },`;
    });
    const txt = `export const ${id.toUpperCase()}_RIG = {\n  bones: [\n${lines.join('\n')}\n  ],\n};\n`;
    out.value = txt; out.style.display = 'block'; out.select();
    navigator.clipboard?.writeText(txt).catch(() => {});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
    a.download = `${id}.rig.js`; a.click();
  }

  // ================= UI =================
  const panel = el('div', `position:fixed;top:10px;left:10px;z-index:50;font:12px/1.4 system-ui,sans-serif;
    color:#dfe8f5;background:rgba(16,20,28,0.94);border:1px solid #2c3648;border-radius:8px;
    padding:10px;width:260px;max-height:96vh;overflow:auto;user-select:none`);
  document.body.appendChild(panel);
  setupDevPanel(panel, {
    key: 'rigedit', workbench: 'rigedit', subtitle: `${id}${useAlt ? ' · ALT' : ''}`,
  });
  // Mech picker, like every other workbench. This editor builds its whole
  // world (raw GLB, skeleton, re-skin, undo stack) around one id at start-up,
  // so a switch is a navigation, not a rebuild — gotoSubject rewrites ?mech=
  // and drops the old mech's &alt.
  panel.appendChild(lbl('Mech'));
  panel.appendChild(subjectSelect({
    config,
    value: id,
    note: (nid) => config.catalogue.note(nid),
    onPick: (next) => { if (next !== id) gotoSubject(next); },
  }));
  const altRow = altCheckbox(alt, reloadWithVariant);
  if (altRow) { altRow.style.marginTop = '6px'; panel.appendChild(altRow); }

  const modeRow = el('div', 'display:flex;gap:6px;margin:6px 0');
  const bMove = tog('Move', () => gizmo.setMode('translate'));
  const bColor = tog('Color view', () => setColorMode(!colorOn));
  const bSolo = tog('Solo subtree (S)', () => { if (selName) toggleSolo(selName); });
  modeRow.append(bMove, bColor, bSolo); panel.appendChild(modeRow);

  const smRow = el('div', 'display:flex;gap:6px;margin:0 0 6px');
  const bSoloMove = tog('Solo move: off', () => { soloMove = !soloMove; refreshModeButtons(); });
  bSoloMove.title = 'When on, dragging a joint moves ONLY that joint — its child joints stay put relative to the geometry instead of following.';
  smRow.append(bSoloMove); panel.appendChild(smRow);

  const histRow = el('div', 'display:flex;gap:6px;margin:0 0 6px');
  histRow.append(tog('↶ Undo', undo), tog('↷ Redo', redo));
  panel.appendChild(histRow);

  // background color of the 3D viewer — the black posts vanish on a black
  // backdrop, so let the user recolor it (persisted across reloads)
  const BG_KEY = 'rigedit:bg';
  const savedBg = localStorage.getItem(BG_KEY) || '#1a1f29';
  scene.background = new THREE.Color(savedBg);
  const bgRow = el('div', 'display:flex;gap:5px;align-items:center;margin:0 0 6px');
  const bgLab = el('span', 'color:#7d8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.05em');
  bgLab.textContent = 'BG';
  const bgInput = el('input', 'width:30px;height:22px;border:1px solid #2c3648;border-radius:4px;background:#0e131b;cursor:pointer;padding:1px');
  bgInput.type = 'color'; bgInput.value = savedBg;
  const setBg = (hex) => { scene.background = new THREE.Color(hex); bgInput.value = hex; try { localStorage.setItem(BG_KEY, hex); } catch { /* ignore */ } };
  bgInput.oninput = () => setBg(bgInput.value);
  bgRow.append(bgLab, bgInput);
  for (const [name, hex] of [['dark', '#1a1f29'], ['slate', '#4a5568'], ['light', '#c8d0da'], ['teal', '#123a3a']]) {
    const sw = el('button', `width:20px;height:20px;border-radius:4px;border:1px solid #2c3648;cursor:pointer;background:${hex}`);
    sw.title = name; sw.onclick = () => setBg(hex);
    bgRow.appendChild(sw);
  }
  panel.appendChild(bgRow);

  // ---- MANNEQUIN REFERENCE -------------------------------------------------
  // "Where does a bone actually belong?" The reference humanoid, ghosted in
  // place at this model's height with every joint NAMED on screen, is the
  // answer: the ankle sits above and forward of the heel, the knee at the front
  // of the shin, the shoulder inboard of the deltoid. Drag your bone to the
  // labelled dot and the rig is anatomically right before you even test a pose.
  let mannGroup = null, mannLabels = null, mannOn = false;
  function modelHeight() {
    container.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    return Math.max(0.5, box.max.y - box.min.y);
  }
  function setMannequin(on) {
    mannOn = on;
    if (!on) {
      if (mannLabels) { mannLabels.dispose?.(); mannLabels = null; }
      if (mannGroup) {
        scene.remove(mannGroup);
        mannGroup.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        mannGroup = null;
      }
      return;
    }
    if (mannGroup) { mannGroup.visible = true; return; }
    const ref = config.reference?.mannequin?.(modelHeight());
    if (!ref) { note.textContent = 'no mannequin reference in this game config'; return; }
    mannGroup = ref.group;
    // X-RAY, not a ghost behind an opaque mech: the whole job of this overlay is
    // to be compared against bones INSIDE the model, so it draws through it.
    mannGroup.traverse((o) => {
      if (!o.material) return;
      const fade = (m) => {
        const c = m.clone();
        c.transparent = true; c.opacity = 0.34;
        c.depthWrite = false; c.depthTest = false;
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(fade) : fade(o.material);
      o.renderOrder = 900;
    });
    // stand it where the model stands, so a bone and its reference joint are
    // directly comparable — same ground, same height, same centre line
    container.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    mannGroup.position.set((box.min.x + box.max.x) * 0.5, box.min.y, (box.min.z + box.max.z) * 0.5);
    scene.add(mannGroup);
    mannLabels = config.reference?.labels?.(ref, { size: modelHeight() * 0.045 });
    note.textContent = `reference: ${ref.height.toFixed(2)} tall vs model ${modelHeight().toFixed(2)}`;
  }
  const mannRow = el('div', 'display:flex;gap:5px;align-items:center;margin:0 0 6px');
  const mannChk = document.createElement('input');
  mannChk.type = 'checkbox';
  mannChk.onchange = () => setMannequin(mannChk.checked);
  const mannLab = document.createElement('label');
  mannLab.style.cssText = 'display:flex;gap:5px;align-items:center;font-size:11px;cursor:pointer;color:#dfe8f5';
  mannLab.append(mannChk, document.createTextNode(' Mannequin reference (named joints)'));
  mannLab.title = 'Ghost the REFERENCE humanoid over this model at the same height, with every '
    + 'joint labelled. It is the map for what each bone name MEANS: the ankle is the joint above '
    + 'and forward of the heel, not the heel itself; the knee is at the front of the leg; the '
    + 'shoulder is inboard of the arm.';
  mannRow.appendChild(mannLab);
  panel.appendChild(mannRow);

  function refreshModeButtons() {
    bColor.style.background = colorOn ? '#24405e' : '#1a2433';
    bSolo.style.background = soloRoot ? '#1f7a4d' : '#1a2433';
    bSolo.textContent = soloRoot ? `Solo: ${soloRoot} (S)` : 'Solo subtree (S)';
    bSoloMove.style.background = soloMove ? '#8a5a1f' : '#1a2433';
    bSoloMove.textContent = `Solo move: ${soloMove ? 'ON' : 'off'}`;
  }

  panel.appendChild(lbl('Bones (click to select, drag gizmo to place)'));
  const jointList = el('div', 'display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px');
  panel.appendChild(jointList);
  const posEl = el('div', 'color:#9fb2c8;font-size:11px;margin-bottom:6px;min-height:14px'); panel.appendChild(posEl);

  const addRow = el('div', 'display:flex;gap:4px;margin-bottom:6px');
  const addName = el('input', 'flex:1;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:3px;font-size:11px');
  addName.placeholder = 'new bone name';
  addRow.append(addName, btn('+ add', addBone)); panel.appendChild(addRow);
  panel.appendChild(btn('Delete selected bone', delBone));

  panel.appendChild(lbl('Test'));
  const swRow = el('label', 'display:flex;gap:6px;align-items:center;margin-bottom:4px;cursor:pointer');
  const swChk = document.createElement('input'); swChk.type = 'checkbox';
  swChk.onchange = () => { swinging = swChk.checked; if (!swinging) resetPose(); };
  swRow.append(swChk, document.createTextNode(' Swing claws/legs (loop)')); panel.appendChild(swRow);

  const saveBtn = btn('Save rig to file ▶', saveRig, true);
  panel.appendChild(saveBtn);
  const exportChangesBtn = btn('Export uncommitted saves', () => {});
  panel.appendChild(exportChangesBtn);
  panel.appendChild(btn('Export rig ▶', exportRig, true));
  panel.appendChild(btn('Reset to file rig', () => {
    pushUndo();
    localStorage.removeItem(LS_KEY());
    rigObj = loadRig(); rebuild(true); groundIt(); buildBoneUI();
    if (soloRoot && !rigObj.bones.some((b) => b.name === soloRoot)) soloRoot = null;
    updateSolo();
  }));
  const out = el('textarea', `width:100%;height:150px;margin-top:8px;background:#0b0f16;color:#8fe;border:1px solid #2c3648;font:10.5px/1.35 ui-monospace,monospace;display:none`);
  panel.appendChild(out);
  const note = el('div', 'margin-top:6px;color:#9fb2c8;font-size:11px;white-space:pre-line;min-height:1.2em');
  panel.appendChild(note);
  const setNote = (t) => { note.textContent = t; };
  const changes = wireExportChanges(exportChangesBtn, { setStatus: setNote });

  const help = el('div', 'margin-top:8px;color:#69788c;font-size:10.5px;line-height:1.5');
  help.innerHTML = 'Orbit: drag empty space · Zoom: wheel<br>Red/orange = claws (arms) · blue/cyan = legs · gray = struts.<br>'
    + 'Drag a bone into the geometry it should drive, then Color view to check ownership.<br>'
    + 'Undo/redo: Ctrl+Z / Ctrl+Shift+Z · Solo a bone’s subtree: select + S, or right-click a bone (hides the other dots + connections so only those joints are pickable; the robot render is untouched).';
  panel.appendChild(help);

  function buildBoneUI() {
    jointList.innerHTML = '';
    rigObj.bones.forEach((bd) => {
      const c = boneColor(bd.name, 0);
      const b = el('button', `padding:3px 5px;font-size:10.5px;border-radius:4px;cursor:pointer;border:1px solid #2c3648;background:#1a2433;color:#cfe0f5`);
      b.textContent = bd.name; b.dataset.name = bd.name;
      b.style.borderLeft = `4px solid rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
      b.onclick = () => selectBone(bd.name);
      b.oncontextmenu = (e) => { e.preventDefault(); toggleSolo(bd.name); }; // right-click = solo
      b.title = 'click: select · right-click: solo subtree';
      jointList.appendChild(b);
    });
    styleList();
  }
  function styleList() {
    const sub = soloRoot ? subtreeSet(soloRoot) : null;
    for (const c of jointList.children) {
      const on = c.dataset.on === 'true';
      const solo = sub && sub.has(c.dataset.name);
      c.style.outline = on ? '2px solid #48b0ff' : (c.dataset.name === soloRoot ? '2px solid #6ee7a0' : '');
      c.style.background = on ? '#24405e' : (solo ? '#255c3f' : '#1a2433');
      c.style.opacity = (sub && !solo) ? '0.4' : '1';
    }
  }
  function posReadout() {
    const bd = rigObj.bones.find((b) => b.name === selName);
    posEl.textContent = bd ? `${selName}  [${bd.pos.map((v) => v.toFixed(2)).join(', ')}]  parent: ${bd.parent || '—'}` : '';
  }
  function addBone() {
    const name = (addName.value || '').trim();
    if (!name || rigObj.bones.some((b) => b.name === name)) return;
    pushUndo();
    const parent = selName || 'hips';
    const pp = rigObj.bones.find((b) => b.name === parent)?.pos || [0, 0.3, 0];
    rigObj.bones.push({ name, parent, pos: [pp[0], pp[1] + 0.05, pp[2]] });
    addName.value = '';
    rebuild(true); buildBoneUI(); selectBone(name); updateSolo(); saveRig();
  }
  function delBone() {
    if (!selName || selName === 'hips') return;
    pushUndo();
    if (soloRoot === selName) soloRoot = null;
    rigObj.bones = rigObj.bones.filter((b) => b.name !== selName && b.parent !== selName);
    gizmo.detach(); selName = null;
    rebuild(true); buildBoneUI(); updateSolo(); saveRig();
  }

  function el(t, css) { const e = document.createElement(t); e.style.cssText = css; return e; }
  function lbl(t) { const d = el('div', 'color:#7d8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin:6px 0 2px'); d.textContent = t; return d; }
  function tog(t, fn) { const b = el('button', 'flex:1;padding:5px;border-radius:4px;border:1px solid #2c3648;cursor:pointer;font-size:11px;background:#1a2433;color:#cfe0f5'); b.textContent = t; b.onclick = fn; return b; }
  function btn(t, fn, primary) { const b = el('button', `width:100%;padding:6px;margin-top:4px;border-radius:5px;border:1px solid #2c3648;cursor:pointer;font-size:11px;background:${primary ? '#1f7a4d' : '#1a2433'};color:${primary ? '#fff' : '#cfe0f5'}`); b.textContent = t; b.onclick = fn; return b; }
  function round(v) { return Math.round(v * 100) / 100; }

  load();

  engine.onUpdate = (dt) => {
    if (swinging && !gizmo.dragging) {
      swing += dt * 1.4;
      applyTestPose((Math.sin(swing) * 0.5 + 0.5));
    }
    syncHandles();
    skelHelper?.update?.();
    updateSoloLines();   // keep the solo subtree's connections on the bones
    updatePostsLive();   // keep the black rods glued to the back-leg bones
  };
  engine.onRender = () => orbit.update();
  engine.start();
  window.__rigedit = { get rig() { return rigObj; }, byName: () => byName,
    solo: toggleSolo, undo, redo, select: selectBone,
    // test hook: drive the real solo-move path (capture → move → counter-adjust)
    _simSoloMove: (boneName, dx, dy, dz) => {
      soloMove = true; selName = boneName; captureSoloMoveTargets();
      const before = {};
      for (const [n] of (soloMoveTargets || [])) before[n] = byName[n].getWorldPosition(new THREE.Vector3()).toArray();
      const b = byName[boneName]; b.position.x += dx; b.position.y += dy; b.position.z += dz;
      onGizmoMove();
      const after = {};
      for (const [n] of (soloMoveTargets || [])) after[n] = byName[n].getWorldPosition(new THREE.Vector3()).toArray();
      soloMoveTargets = null;
      return { before, after };
    } };
  return engine;
}
