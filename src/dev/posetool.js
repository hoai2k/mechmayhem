// ?debug=models — side-by-side PROCEDURAL vs GLB debugger for a mech.
//
// Two modes (toggle top-left):
//  • ACTION — both models are live Fighters on a bare stage. A controller or
//    the keyboard triggers the SAME attack on BOTH at once, with real
//    projectiles, so you can compare the two renderings in motion. A speed
//    slider slow-mos everything; a status panel names the current action and
//    its known characteristics, tagging any that apply to only one version.
//    Each model faces an invincible dummy stood just in front (attacks that
//    need a target engage it; ground attacks hit the floor here too).
//  • POSE — both models frozen at the deterministic rest. A per-bone gizmo
//    poses the GLB to match the procedural; "Output config" emits a manifest
//    patch (boneCorrections / bonePos). A head-height guide shows the
//    canonical size (GLB head matched to procedural head-top).
//
//   ?debug=models[&mech=<id>][&mode=action|pose]
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Engine } from '../core/engine.js';
import { World } from '../game/world.js';
import { Fighter } from '../combat/fighter.js';
import { Input } from '../game/input.js';
import { buildMech } from '../mechs/factory.js';
import { Animator } from '../mechs/animator.js';
import { buildGlbForTool, fetchRawManifest, measureHeadTop } from '../mechs/gltf.js';
import { ROSTER, ROSTER_BY_ID } from '../mechs/roster.js';
import { applyColorScheme } from '../mechs/colorscheme.js';
import { JOINT_ORDER } from '../mechs/rigadapter.js';
import { describeAction, ACTIONS } from './actionchars.js';
import { anchorUses } from './anchoruses.js';

const R2D = 180 / Math.PI;
const PAIR_X = 6;              // half-separation of the two models
const INTENT_BTNS = ['light', 'lightHeld', 'heavy', 'heavyHeld', 'ranged', 'rangedHeld',
  'special', 'specialHeld', 'block', 'dash', 'jump', 'jumpHeld', 'duck'];

export async function runPoseTool(startId) {
  const engine = new Engine(document.getElementById('game-canvas'));
  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(0x232833);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x565c66, 2.0));
  const dir = new THREE.DirectionalLight(0xffffff, 2.2);
  dir.position.set(6, 11, 8);
  scene.add(dir);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x353a44, roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(60, 60, 0x38445a, 0x222c3a));

  // bare world (no arena — clean stage; World's arena hooks are all optional)
  const world = new World(engine, null);
  const input = new Input();
  world.input = input;

  camera.position.set(14, 8, 15);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 4, 2);
  orbit.update();

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSpace('local'); gizmo.setMode('rotate'); gizmo.setSize(0.7);
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });

  // A SECOND gizmo dedicated to anchor editing, independent of the pose-mode
  // joint gizmo so anchors stay draggable in ACTION mode — where the live
  // previews (projectiles, muzzle flashes) spawn from the anchor you're moving.
  const anchorGizmo = new TransformControls(camera, renderer.domElement);
  anchorGizmo.setSpace('local'); anchorGizmo.setMode('translate'); anchorGizmo.setSize(0.55);
  scene.add(anchorGizmo.getHelper ? anchorGizmo.getHelper() : anchorGizmo);
  anchorGizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    if (!e.value) onAnchorDrop();   // rebind on release
  });

  const params = new URLSearchParams(location.search);
  const manifest = await fetchRawManifest();
  const glbIds = ROSTER.map((r) => r.id).filter((id) => manifest[id]?.url);
  let curId = (startId && manifest[startId]?.url) ? startId : (glbIds[0] || ROSTER[0].id);
  let mode = params.get('mode') === 'pose' ? 'pose' : 'action';
  let timeScale = 1;

  // ---- live state ----
  let procF = null, glbF = null, procDummy = null, glbDummy = null;
  let selJoint = null;
  const base = {};                         // gizmo baseline (pose mode)
  const refGroup = new THREE.Group(); scene.add(refGroup);
  const scratch = blankIntent(), pad = blankIntent(), prev = {};
  let lastAction = 'idle';
  let dummyPost = 8;   // z distance of the invisible aim targets
  // ---- anchor editor state ----
  let selAnchor = null;              // anchor name the anchor gizmo holds
  const anchorBase = {};             // name -> {parent, pos, rot} captured at load
  const anchorMarks = new THREE.Group(); scene.add(anchorMarks);
  // barrel-direction arrow for the held anchor: its +Z is what combat fires
  // along once the anchor carries a `rot` (see world.js barrelDeflect)
  const barrelArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(),
    2.4, 0xff6a3d, 0.55, 0.3);
  barrelArrow.visible = false;
  for (const c of [barrelArrow.line, barrelArrow.cone]) {
    if (c?.material) { c.material.depthTest = false; c.renderOrder = 999; }
  }
  scene.add(barrelArrow);
  let autoBind = true;               // on drop, re-parent to the nearest geometry bone
  let idleT = 0;       // real seconds both fighters have been back at rest
  let lastWasWalk = false; // last displacement came from stick movement (2s reset)

  // Actions that translate the mech (lunges, dashes) move it only
  // TEMPORARILY: positions snap back home 3s after the action settles, or
  // the moment the next action starts — so the animation can be studied
  // without chasing the mechs around the stage.
  function resetPositions() {
    for (const [f, x] of [[procF, -PAIR_X], [glbF, PAIR_X]]) {
      if (!f) continue;
      f.pos.set(x, 0, 0);
      f.vel.set(0, 0, 0);
      f.yaw = f.targetYaw = f.torsoYaw = 0;
      f.grounded = true;
      f._floorLift = 0; f.mech.visualFloorLift?.(0); // clear the pose-tool floor lift
    }
    idleT = 0;
  }
  function fighterBusy(f) {
    return !!f && (f.state !== 'normal' || (f.animator.action && !f.animator.action.fadingOut));
  }
  function displaced(f, x) {
    return !!f && (Math.abs(f.pos.x - x) > 0.05 || Math.abs(f.pos.z) > 0.05 || f.pos.y > 0.05 ||
      Math.abs(f.yaw) > 0.02);
  }

  // Lift-only floor clamp: a GLB whose retargeted gait pushes a rigid limb
  // through the stage (fenrir's hind legs are single un-foldable bones, so
  // the gallop's thigh swing overshoots downward) reads as sinking into the
  // ground. Each frame, after the world poses the mech, raise it just enough
  // that its LOWEST rendered vertex rests on the floor — never pull it down,
  // so legitimate airtime (jump/lunge) still rises. Studying-tool cosmetic
  // only; combat is untouched.
  const _clampV = new THREE.Vector3();
  function floorClamp(f, dt) {
    // Only GLBs, and apply the lift to the MODEL (mech.visualFloorLift), NEVER
    // f.group.position — that IS f.pos (aliased), so lifting the group corrupts
    // physics: it accumulates (mech floats up) and jerks pos.y during animation
    // (the reported twitch + a spurious airborne/landing "circle").
    if (!f?.mech?.isGLB || !f.mech.visualFloorLift) return;
    const g = f.group;
    // Reset the model to its base first, so minY is the UN-lifted penetration
    // (combat's groundClamp resets the container some frames, so we can't trust
    // an accumulated offset — measure absolute each frame). `need` is then the
    // exact lift that plants the lowest vertex on y=0.
    f.mech.visualFloorLift(0);
    g.updateMatrixWorld(true);
    let minY = Infinity;
    g.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton.update();
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const pos = o.geometry?.attributes?.position;
      if (!pos) return;
      const stride = Math.max(1, Math.floor(pos.count / 1500));
      for (let i = 0; i < pos.count; i += stride) {
        o.getVertexPosition(i, _clampV); o.localToWorld(_clampV);
        if (_clampV.y < minY) minY = _clampV.y;
      }
    });
    if (minY === Infinity) return;
    // Asymmetric envelope: rise INSTANTLY so the lowest vertex never dips below
    // the floor, then settle back down — SLOW while still lifted a lot (hold
    // near the planted height instead of heaving per stride), FAST once barely
    // lifted (a stopped mech drops promptly). Applied to the MODEL only.
    const need = minY < 0 ? -minY : 0;
    const prev = f._floorLift || 0;
    const settle = need > 0.25 ? 0.8 : 12;          // units/sec
    f._floorLift = need > prev ? need : Math.max(need, prev - settle * (dt || 0.016));
    if (f._floorLift > 0.0005) { f.mech.visualFloorLift(f._floorLift); g.updateMatrixWorld(true); }
  }

  function blankIntent() {
    return { moveX: 0, moveZ: 0, jump: false, jumpHeld: false, light: false, heavy: false,
      ranged: false, rangedHeld: false, special: false, specialHeld: false, ult: false,
      block: false, dash: false, taunt: false, strafe: false, duck: false, aimYaw: undefined };
  }

  function disposeFighter(f) {
    if (!f) return;
    scene.remove(f.group);
    f.group.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) m?.dispose?.();
    });
  }

  function makeFighter(def, x, opts = {}) {
    const f = new Fighter(world, def, {
      pos: new THREE.Vector3(x, 0, 0), yaw: 0, playerIndex: opts.pi ?? 0, isAI: false, mech: opts.mech,
    });
    return f;
  }

  async function load(id) {
    curId = id;
    const u = new URL(location.href);
    u.searchParams.set('mech', id); u.searchParams.set('mode', mode);
    history.replaceState(null, '', u);
    gizmo.detach(); selJoint = null;
    anchorGizmo.detach(); selAnchor = null;
    for (const k of Object.keys(base)) delete base[k];
    for (const f of [procF, glbF, procDummy, glbDummy]) disposeFighter(f);
    world.fighters.length = 0;
    if (Array.isArray(world.projectiles)) world.projectiles.length = 0;

    const def = ROSTER_BY_ID[id];
    // LEFT slot: procedural by default; with "Compare Alternate GLB" on, the
    // mech's alternate model instead (own intake — full independent fighter),
    // so alt-vs-original can be judged directly side by side.
    const useAlt = compareAlt && manifest[id]?.alt?.url;
    if (useAlt) {
      const altBuilt = await buildGlbForTool(def, null, { alt: true });
      procF = makeFighter(def, -PAIR_X, { pi: 0, mech: altBuilt.mech });
    } else {
      procF = makeFighter(def, -PAIR_X, { pi: 0 });
    }
    const built = await buildGlbForTool(def);
    glbF = makeFighter(def, PAIR_X, { pi: 1, mech: built.mech });
    altRow.style.display = manifest[id]?.alt?.url ? 'flex' : 'none';
    altCheck.checked = !!useAlt;
    // dummies stand just in front (heavy reach + a hair) as attack targets
    const drange = (def.moves?.heavy?.range ?? 4) + 1.5;
    const ddef = applyColorScheme(ROSTER_BY_ID.titanus, 3);
    procDummy = new Fighter(world, ddef, { pos: new THREE.Vector3(-PAIR_X, 0, drange), yaw: Math.PI, playerIndex: 2, isAI: true });
    glbDummy = new Fighter(world, ddef, { pos: new THREE.Vector3(PAIR_X, 0, drange), yaw: Math.PI, playerIndex: 3, isAI: true });
    procDummy.controlsLocked = glbDummy.controlsLocked = true;
    // the dummies are pure AIM TARGETS: never rendered, pinned to their posts
    // every frame (dummyPost) so targeted attacks aim as if an enemy stood
    // just in front — without an enemy cluttering the comparison view
    procDummy.group.visible = glbDummy.group.visible = false;
    dummyPost = drange;
    world.fighters.push(procF, glbF, procDummy, glbDummy);

    window.__poseDebug = { proc: procF.mech, glb: glbF.mech, procF, glbF, world, engine, camera, scene,
      // anchor-editor hooks (scripting / automated checks)
      anchors: { select: selectAnchor, drop: onAnchorDrop, output: outputAnchors,
        patch: buildAnchorPatch, reset: resetAnchor, changed: anchorChanged,
        nearestBone, boneRefName, base: anchorBase,
        get sel() { return selAnchor; } } };
    applyMode();
    buildJointButtons();
    captureAnchorBase();
    buildAnchorButtons();
    anchorNote.textContent = '';
    anchorOut.style.display = 'none';
    setStatus('idle');
  }

  // ---- mode handling ----
  function applyMode() {
    const poseMode = mode === 'pose';
    gizmo.visible = poseMode;
    if (!poseMode) gizmo.detach();
    refGroup.visible = poseMode;
    poseModeUI.style.display = poseMode ? 'block' : 'none';
    actionModeUI.style.display = poseMode ? 'none' : 'block';
    if (poseMode) {
      // freeze both at the deterministic rest and capture the gizmo baseline
      procF.animator.poseStatic();
      glbF.animator.poseStatic();
      for (const f of [procF, glbF]) { if (f) { f._floorLift = 0; f.mech.visualFloorLift?.(0); } }
      drawSizeRef();
      for (const [j, b] of Object.entries(glbF.mech.boneMap || {})) {
        base[j] = { q: b.quaternion.clone(), p: b.position.clone() };
      }
    }
    const u = new URL(location.href); u.searchParams.set('mode', mode); history.replaceState(null, '', u);
  }

  // ---- action input ----
  function orIntent(dst, src) { for (const k of INTENT_BTNS) if (src[k]) dst[k] = src[k]; }
  function readCombined(out) {
    input.readIntent('kb1', out, 0);
    for (let i = 0; i < 4; i++) { input.readIntent('pad' + i, pad, 0); orIntent(out, pad); }
  }
  function copyIntent(dstIntent, src) {
    for (const k of INTENT_BTNS) dstIntent[k] = src[k];
    // movement passes through (left stick / WASD) so the walk/run cycle can be
    // compared too; both mechs stride in the same direction in lockstep
    dstIntent.moveX = src.moveX; dstIntent.moveZ = src.moveZ;
    dstIntent.aimYaw = undefined;
  }
  const ACTION_FROM_INTENT = [
    ['walk', (s) => Math.abs(s.moveX) + Math.abs(s.moveZ) > 0.1],
    ['special', (s) => s.special], ['heavy', (s) => s.heavy], ['light', (s) => s.light],
    ['dash', (s) => s.dash], ['ranged', (s) => s.ranged || s.rangedHeld], ['block', (s) => s.block],
  ];
  function detectAction() {
    let pressed = false;
    for (const [name, test] of ACTION_FROM_INTENT) {
      const now = !!test(scratch), was = !!prev[name];
      if (now && !was) { lastAction = name; setStatus(name); pressed = true; }
      prev[name] = now;
    }
    return pressed;
  }

  // ---- status panel ----
  function setStatus(action) {
    const d = describeAction(ROSTER_BY_ID[curId], action);
    let html = `<div style="font-weight:600;color:#cfe3ff;margin-bottom:3px">▶ ${d.title}</div>`;
    for (const ln of d.lines) {
      const tag = ln.v === 'proc' ? ' <span style="color:#8fd8ff">(Procedural only)</span>'
        : ln.v === 'glb' ? ' <span style="color:#ffd060">(GLB only)</span>' : '';
      html += `<div style="color:#9fb2c8;font-size:11px">• ${ln.t}${tag}</div>`;
    }
    statusPanel.innerHTML = html;
  }

  // ---- pose-mode size reference ----
  function drawSizeRef() {
    while (refGroup.children.length) {
      const c = refGroup.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.();
    }
    if (!procF?.mech?.joints?.head) return;
    const procHeadY = measureHeadTop(procF.mech);
    const glbHeadY = glbF?.mech?.isGLB ? measureHeadTop(glbF.mech) : procHeadY;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-9, procHeadY, 0), new THREE.Vector3(9, procHeadY, 0)]),
      new THREE.LineBasicMaterial({ color: 0x48b0ff }));
    refGroup.add(line);
    const dot = (x, y, col) => {
      const mm = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: col }));
      mm.position.set(x, y, 0); refGroup.add(mm);
    };
    dot(-PAIR_X, procHeadY, 0x8fd8ff); dot(PAIR_X, glbHeadY, 0xffd060);
    sizeReadout = `head top  proc ${procHeadY.toFixed(2)}  ·  glb ${glbHeadY.toFixed(2)}  (Δ ${(glbHeadY - procHeadY >= 0 ? '+' : '') + (glbHeadY - procHeadY).toFixed(2)})`;
    if (sizeEl) sizeEl.textContent = sizeReadout;
  }
  let sizeReadout = '';

  // ================= ANCHOR EDITOR =================
  // Anchors are the mech's named spawn points — muzzleR/muzzleL (every ranged
  // shot, cannon and most special origins), plus per-mech extras combat reads
  // by name (vulcan's podL/podR, aegis' shield, wraith's eye/scope). Each is an
  // Object3D parented to a rig joint or a real GLB bone, so it rides the
  // animation. Dragging one here moves the LIVE anchor: fire in ACTION mode and
  // the projectiles come out of the new spot.
  const _nbV = new THREE.Vector3();
  const _barrelV = new THREE.Vector3(), _barrelQ = new THREE.Quaternion();
  // Nearest bone to a world point, by the GEOMETRY nearest it — sample the
  // posed skin, take the closest vertex, return that vertex's dominant bone.
  // (Bone-origin distance would bind a barrel tip to whatever pivot happens to
  // sit near it; the skin is what the user is actually pointing at.)
  function nearestBone(mech, worldPos) {
    let best = null, bestD = Infinity;
    mech.group.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.skeleton.update();
      const pos = o.geometry?.attributes?.position;
      if (!pos) return;
      const stride = Math.max(1, Math.floor(pos.count / 6000));
      for (let i = 0; i < pos.count; i += stride) {
        o.getVertexPosition(i, _nbV); o.localToWorld(_nbV);
        const d = _nbV.distanceToSquared(worldPos);
        if (d < bestD) { bestD = d; best = { mesh: o, vi: i }; }
      }
    });
    if (!best) return null;
    const jnt = best.mesh.geometry.attributes.skinIndex;
    const wgt = best.mesh.geometry.attributes.skinWeight;
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(best.vi, k);
      if (w > bw) { bw = w; bi = jnt.getComponent(best.vi, k); }
    }
    return best.mesh.skeleton.bones[bi] || null;
  }
  // Prefer the canonical boneMap key ("handR") over the raw GLB bone name —
  // installMuzzle resolves boneMap first, so the canonical key is unambiguous.
  function boneRefName(mech, bone) {
    for (const [k, b] of Object.entries(mech.boneMap || {})) if (b === bone) return k;
    return bone.name;
  }
  function jointNameOf(mech, obj) {
    for (const [k, v] of Object.entries(mech.joints || {})) if (v === obj) return k;
    return null;
  }
  function parentLabel(mech, obj) {
    const p = obj?.parent;
    if (!p) return '—';
    if (p.isBone) return 'bone ' + boneRefName(mech, p);
    const jn = jointNameOf(mech, p);
    return jn ? 'joint ' + jn : (p.name || 'unknown');
  }
  function anchorChanged(name) {
    const obj = glbF?.mech?.anchors?.[name], bs = anchorBase[name];
    if (!obj || !bs) return false;
    return obj.parent !== bs.parent
      || obj.position.distanceTo(bs.pos) > 1e-4
      || Math.abs(obj.rotation.x - bs.rot.x) > 1e-4
      || Math.abs(obj.rotation.y - bs.rot.y) > 1e-4
      || Math.abs(obj.rotation.z - bs.rot.z) > 1e-4;
  }
  function captureAnchorBase() {
    for (const k of Object.keys(anchorBase)) delete anchorBase[k];
    for (const [name, obj] of Object.entries(glbF?.mech?.anchors || {})) {
      if (!obj?.isObject3D) continue;
      anchorBase[name] = { parent: obj.parent, pos: obj.position.clone(), rot: obj.rotation.clone() };
    }
  }
  // On release: bind the anchor to whatever geometry it now sits on, so it
  // rides that part (a cannon barrel, a shoulder pod) through every animation.
  function onAnchorDrop() {
    if (!selAnchor || !glbF?.mech) return;
    const obj = glbF.mech.anchors[selAnchor];
    if (!obj) return;
    if (autoBind) {
      const bone = nearestBone(glbF.mech, obj.getWorldPosition(new THREE.Vector3()));
      if (bone && obj.parent !== bone) bone.attach(obj);  // attach keeps world transform
    }
    refreshAnchorUI();
  }
  function selectAnchor(name, mode) {
    const obj = glbF?.mech?.anchors?.[name];
    if (!obj) return;
    if (selAnchor === name && !mode) {      // clicking the held anchor releases it
      selAnchor = null; anchorGizmo.detach(); refreshAnchorUI(); return;
    }
    selAnchor = name;
    gizmo.detach(); selJoint = null;         // never hold both gizmos at once
    anchorGizmo.setMode(mode || anchorGizmo.mode || 'translate');
    anchorGizmo.attach(obj);
    refreshAnchorUI();
  }
  function resetAnchor(name) {
    const obj = glbF?.mech?.anchors?.[name], bs = anchorBase[name];
    if (!obj || !bs) return;
    if (obj.parent !== bs.parent) bs.parent.add(obj);
    obj.position.copy(bs.pos); obj.rotation.copy(bs.rot); obj.scale.setScalar(1);
  }
  // Emits the mech's COMPLETE muzzles block (existing manifest entries carried
  // through, edited ones replaced) so it can be pasted over the manifest whole
  // rather than hand-merged.
  function buildAnchorPatch() {
    const mech = glbF?.mech;
    if (!mech) return { changed: [], patch: null };
    const units = mech.muzzleUnits || { joint: mech.dims.scale, bone: mech.dims.scale };
    const muzzles = JSON.parse(JSON.stringify(manifest[curId]?.muzzles || {}));
    const changed = [];
    for (const name of Object.keys(mech.anchors || {})) {
      if (!anchorChanged(name)) continue;
      const obj = mech.anchors[name];
      const key = name === 'muzzleR' ? 'R' : name === 'muzzleL' ? 'L' : name;
      const p = obj.parent;
      const spec = {};
      if (p?.isBone) spec.bone = boneRefName(mech, p);
      else {
        const jn = jointNameOf(mech, p);
        if (!jn) { console.warn(`anchor ${name}: parent is neither a bone nor a rig joint — skipped`); continue; }
        spec.joint = jn;
      }
      const k = (p?.isBone ? units.bone : units.joint) || 1;
      spec.offset = [rnd(obj.position.x / k, 3), rnd(obj.position.y / k, 3), rnd(obj.position.z / k, 3)];
      const r = [obj.rotation.x * R2D, obj.rotation.y * R2D, obj.rotation.z * R2D];
      if (r.some((v) => Math.abs(v) > 0.05)) spec.rot = [rnd(r[0]), rnd(r[1]), rnd(r[2])];
      muzzles[key] = spec;
      changed.push(`${name} → ${spec.bone ? 'bone ' + spec.bone : 'joint ' + spec.joint}`);
    }
    return { changed, patch: { [curId]: { muzzles } } };
  }
  function outputAnchors() {
    const { changed, patch } = buildAnchorPatch();
    if (!changed.length) { anchorNote.textContent = 'No anchor changes to output.'; return; }
    const json = JSON.stringify(patch, null, 2);
    anchorOut.style.display = 'block'; anchorOut.value = json; anchorOut.select();
    navigator.clipboard?.writeText(json).catch(() => {});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `anchors-${curId}.json`; a.click();
    anchorNote.textContent = `Exported ${changed.length} change(s): ${changed.join(' · ')}`;
  }

  // ---- UI ----
  const panel = el('div', `position:fixed;top:10px;left:10px;z-index:50;font:12px/1.4 system-ui,sans-serif;
    color:#dfe8f5;background:rgba(16,20,28,0.93);border:1px solid #2c3648;border-radius:8px;
    padding:10px;width:270px;max-height:95vh;overflow:auto;user-select:none`);
  document.body.appendChild(panel);

  panel.appendChild(label('Mech'));
  const mechSel = el('select', 'width:100%;margin-bottom:8px;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px');
  for (const id of glbIds) { const o = document.createElement('option'); o.value = id; o.textContent = id; mechSel.appendChild(o); }
  mechSel.value = curId; mechSel.onchange = () => load(mechSel.value);
  panel.appendChild(mechSel);

  // Compare Alternate GLB — only shown for mechs that have manifest[id].alt.
  // Checked: the LEFT slot shows the alternate model instead of procedural.
  let compareAlt = params.get('alt') === '1';
  const altRow = el('label', 'display:none;gap:6px;align-items:center;cursor:pointer;margin-bottom:8px;font-size:11px;color:#cfe0f5');
  const altCheck = document.createElement('input');
  altCheck.type = 'checkbox';
  altRow.appendChild(altCheck);
  altRow.appendChild(document.createTextNode(' Compare Alternate GLB (left slot)'));
  altCheck.onchange = () => {
    compareAlt = altCheck.checked;
    const u = new URL(location.href);
    if (compareAlt) u.searchParams.set('alt', '1'); else u.searchParams.delete('alt');
    history.replaceState(null, '', u);
    load(curId);
  };
  panel.appendChild(altRow);

  // mode toggle
  const modeRow = el('div', 'display:flex;gap:6px;margin-bottom:8px');
  const bAction = toggle('▶ Action', () => setMode('action'));
  const bPose = toggle('✋ Pose', () => setMode('pose'));
  modeRow.append(bAction, bPose); panel.appendChild(modeRow);
  function setMode(m) { mode = m; styleMode(); applyMode(); refreshAnchorUI(); }
  function styleMode() {
    for (const [b, m] of [[bAction, 'action'], [bPose, 'pose']]) {
      const on = mode === m;
      b.style.background = on ? '#2b6cb0' : '#1a2433'; b.style.color = on ? '#fff' : '#9fb2c8';
    }
  }

  // ---------- ACTION-mode UI ----------
  const actionModeUI = el('div', '');
  panel.appendChild(actionModeUI);
  actionModeUI.appendChild(label('Trigger action'));
  const btnGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px');
  const BTNS = [['walk', 'Walk (W/stick) — hold'], ['light', 'Light (F/✕)'], ['heavy', 'Heavy (G/△)'], ['ranged', 'Ranged (R/RB)'],
    ['special', 'Special (T/RT)'], ['block', 'Block (H/LB)'], ['dash', 'Dash (⇧/B)']];
  for (const [act, txt] of BTNS) {
    const b = el('button', `padding:5px 3px;font-size:11px;border-radius:4px;cursor:pointer;background:#1a2433;color:#cfe0f5;border:1px solid #2c3648`);
    b.textContent = txt;
    // hold-to-fire so held moves (block/ranged) behave; tap fires once
    b.onpointerdown = () => { uiPress[act] = true; };
    const up = () => { uiPress[act] = false; };
    b.onpointerup = up; b.onpointerleave = up;
    btnGrid.appendChild(b);
  }
  actionModeUI.appendChild(btnGrid);
  const uiPress = {};

  actionModeUI.appendChild(label('Animation time scale'));
  const spdRow = el('div', 'display:flex;gap:6px;align-items:center;margin-bottom:6px');
  const slider = el('input', 'flex:1'); slider.type = 'range'; slider.min = '5'; slider.max = '150'; slider.value = '100';
  const spdNum = el('input', 'width:56px;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:2px'); spdNum.type = 'number';
  spdNum.min = '5'; spdNum.max = '300'; spdNum.step = '5'; spdNum.value = '100';
  const setSpeed = (pct) => {
    pct = Math.max(1, +pct || 100); timeScale = pct / 100;
    engine.timeScale = timeScale; slider.value = String(Math.min(150, pct)); spdNum.value = String(pct);
  };
  slider.oninput = () => setSpeed(slider.value);
  spdNum.oninput = () => setSpeed(spdNum.value);
  const pct = el('span', 'color:#9fb2c8;font-size:11px'); pct.textContent = '%';
  spdRow.append(slider, spdNum, pct); actionModeUI.appendChild(spdRow);
  const quickRow = el('div', 'display:flex;gap:4px;margin-bottom:8px');
  for (const p of [10, 25, 50, 100]) {
    const b = el('button', 'flex:1;padding:3px;font-size:11px;border-radius:4px;cursor:pointer;background:#1a2433;color:#cfe0f5;border:1px solid #2c3648');
    b.textContent = (p / 100) + '×'; b.onclick = () => setSpeed(p); quickRow.appendChild(b);
  }
  actionModeUI.appendChild(quickRow);

  actionModeUI.appendChild(label('Current action'));
  const statusPanel = el('div', 'background:#0b0f16;border:1px solid #2c3648;border-radius:5px;padding:7px;min-height:60px');
  actionModeUI.appendChild(statusPanel);

  // ---------- POSE-mode UI ----------
  const poseModeUI = el('div', 'display:none');
  panel.appendChild(poseModeUI);
  const gizRow = el('div', 'display:flex;gap:6px;margin:2px 0 6px');
  const bRot = toggle('Rotate', () => { gizmo.setMode('rotate'); markGiz(); });
  const bMov = toggle('Translate', () => { gizmo.setMode('translate'); markGiz(); });
  const bSpace = toggle('Local', () => { const l = gizmo.space === 'local'; gizmo.setSpace(l ? 'world' : 'local'); bSpace.textContent = l ? 'World' : 'Local'; });
  gizRow.append(bRot, bMov, bSpace); poseModeUI.appendChild(label('Gizmo')); poseModeUI.appendChild(gizRow);
  function markGiz() { for (const [b, m] of [[bRot, 'rotate'], [bMov, 'translate']]) { const on = gizmo.mode === m; b.style.background = on ? '#2b6cb0' : '#1a2433'; b.style.color = on ? '#fff' : '#9fb2c8'; } }
  poseModeUI.appendChild(label('Joint'));
  const jointGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px');
  poseModeUI.appendChild(jointGrid);
  const actRow = el('div', 'display:flex;gap:6px;margin:6px 0');
  actRow.appendChild(btn('Reset joint', () => { if (selJoint && base[selJoint]) { const b = glbF.mech.boneMap[selJoint]; b.quaternion.copy(base[selJoint].q); b.position.copy(base[selJoint].p); } }));
  actRow.appendChild(btn('Reset all', () => { for (const [j, b] of Object.entries(glbF.mech.boneMap || {})) if (base[j]) { b.quaternion.copy(base[j].q); b.position.copy(base[j].p); } }));
  poseModeUI.appendChild(actRow);
  poseModeUI.appendChild(btn('Output config ▶', outputConfig, true));
  const out = el('textarea', `width:100%;height:130px;margin-top:8px;background:#0b0f16;color:#8fe;border:1px solid #2c3648;font:11px/1.35 ui-monospace,monospace;display:none`);
  poseModeUI.appendChild(out);
  const sizeEl = el('div', 'margin-top:8px;color:#9fb2c8;font-size:11px'); poseModeUI.appendChild(sizeEl);

  function buildJointButtons() {
    jointGrid.innerHTML = '';
    const map = glbF?.mech?.boneMap || {};
    for (const j of JOINT_ORDER) {
      const has = !!map[j];
      const b = el('button', `padding:3px 2px;font-size:11px;border-radius:4px;cursor:${has ? 'pointer' : 'not-allowed'};background:${has ? '#1a2433' : '#141821'};color:${has ? '#cfe0f5' : '#55606f'};border:1px solid #2c3648`);
      b.textContent = j; b.disabled = !has;
      if (has) b.onclick = () => {
        selJoint = j; gizmo.attach(map[j]);
        anchorGizmo.detach(); selAnchor = null; refreshAnchorUI();  // one gizmo at a time
        for (const c of jointGrid.children) c.style.outline = ''; b.style.outline = '2px solid #48b0ff';
      };
      jointGrid.appendChild(b);
    }
  }
  function outputConfig() {
    const boneCorrections = {}, bonePos = {};
    for (const [j, b] of Object.entries(glbF.mech.boneMap || {})) {
      const bs = base[j]; if (!bs) continue;
      const corr = bs.q.clone().invert().multiply(b.quaternion);
      const e = new THREE.Euler().setFromQuaternion(corr, 'XYZ');
      const dx = e.x * R2D, dy = e.y * R2D, dz = e.z * R2D;
      if (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15 || Math.abs(dz) > 0.15) boneCorrections[j] = [rnd(dx), rnd(dy), rnd(dz)];
      const pd = b.position.clone().sub(bs.p);
      if (pd.length() > 1e-3) bonePos[j] = [rnd(pd.x, 4), rnd(pd.y, 4), rnd(pd.z, 4)];
    }
    const patch = {};
    if (Object.keys(boneCorrections).length) patch.boneCorrections = boneCorrections;
    if (Object.keys(bonePos).length) patch.bonePos = bonePos;
    const json = JSON.stringify({ [curId]: patch }, null, 2);
    out.style.display = 'block'; out.value = json; out.select();
    navigator.clipboard?.writeText(json).catch(() => {});
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `pose-${curId}.json`; a.click();
  }

  // ---------- ANCHOR editor UI (both modes) ----------
  panel.appendChild(label('Anchors — ranged / special origins (GLB, right)'));
  const anchorInfo = el('div', 'font:11px ui-monospace,monospace;color:#ffd9a0;margin-bottom:4px;min-height:1.3em');
  panel.appendChild(anchorInfo);
  const anchorGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px');
  panel.appendChild(anchorGrid);
  // what the held anchor actually drives, so you know what you're affecting
  const anchorUsePanel = el('div', `display:none;background:#0b0f16;border:1px solid #3a3020;border-radius:5px;
    padding:7px;margin-bottom:6px`);
  panel.appendChild(anchorUsePanel);
  const aGizRow = el('div', 'display:flex;gap:6px;margin-bottom:5px');
  const bAMove = toggle('Move', () => { anchorGizmo.setMode('translate'); markAGiz(); });
  const bARot = toggle('Rotate', () => { anchorGizmo.setMode('rotate'); markAGiz(); });
  aGizRow.append(bAMove, bARot); panel.appendChild(aGizRow);
  function markAGiz() {
    for (const [b, m] of [[bAMove, 'translate'], [bARot, 'rotate']]) {
      const on = anchorGizmo.mode === m;
      b.style.background = on ? '#b0702b' : '#1a2433'; b.style.color = on ? '#fff' : '#9fb2c8';
    }
  }
  const bindRow = el('label', 'display:flex;gap:6px;align-items:center;cursor:pointer;margin-bottom:5px;font-size:11px;color:#cfe0f5');
  const bindCheck = document.createElement('input');
  bindCheck.type = 'checkbox'; bindCheck.checked = autoBind;
  bindCheck.onchange = () => { autoBind = bindCheck.checked; };
  bindRow.appendChild(bindCheck);
  bindRow.appendChild(document.createTextNode(' Bind to nearest geometry on drop'));
  panel.appendChild(bindRow);
  const aResetRow = el('div', 'display:flex;gap:6px;margin-bottom:5px');
  aResetRow.appendChild(btn('Reset anchor', () => { if (selAnchor) { resetAnchor(selAnchor); refreshAnchorUI(); } }));
  aResetRow.appendChild(btn('Reset all anchors', () => { for (const n of Object.keys(anchorBase)) resetAnchor(n); refreshAnchorUI(); }));
  panel.appendChild(aResetRow);
  const outBtn = btn('Output changes ▶', outputAnchors, true);
  panel.appendChild(outBtn);
  const anchorNote = el('div', 'margin-top:5px;color:#9fb2c8;font-size:10.5px;line-height:1.45');
  panel.appendChild(anchorNote);
  const anchorOut = el('textarea', `width:100%;height:110px;margin-top:6px;background:#0b0f16;color:#8fe;
    border:1px solid #2c3648;font:11px/1.35 ui-monospace,monospace;display:none`);
  panel.appendChild(anchorOut);

  function buildAnchorButtons() {
    anchorGrid.innerHTML = '';
    while (anchorMarks.children.length) {
      const c = anchorMarks.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.();
    }
    const anchors = glbF?.mech?.anchors || {};
    for (const name of Object.keys(anchors).sort()) {
      if (!anchors[name]?.isObject3D) continue;
      const b = el('button', `padding:4px 3px;font-size:11px;border-radius:4px;cursor:pointer;
        background:#1a2433;color:#cfe0f5;border:1px solid #2c3648`);
      b.textContent = name;
      b._anchor = name;
      // plain click = move handle · shift-click = rotate handle
      b.onclick = (ev) => selectAnchor(name, ev.shiftKey ? 'rotate' : (selAnchor === name ? null : 'translate'));
      anchorGrid.appendChild(b);
      // a small marker so every anchor is visible in the scene, not just the held one
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffb347, depthTest: false, transparent: true, opacity: 0.9 }));
      m.renderOrder = 999; m._anchor = name;
      anchorMarks.add(m);
    }
    refreshAnchorUI();
  }
  function refreshAnchorUI() {
    for (const c of anchorGrid.children) {
      const on = c._anchor === selAnchor;
      const dirty = anchorChanged(c._anchor);
      c.style.outline = on ? '2px solid #ffb347' : '';
      c.style.background = dirty ? '#3a2f1a' : '#1a2433';
      c.style.color = dirty ? '#ffd9a0' : '#cfe0f5';
    }
    const mech = glbF?.mech;
    anchorInfo.textContent = selAnchor && mech
      ? `${selAnchor} · on ${parentLabel(mech, mech.anchors[selAnchor])} · ${anchorGizmo.mode}`
        + (mode === 'action' ? ' · ANIM FROZEN' : '')
      : 'Click an anchor to grab it · shift-click = rotate';
    // ---- what this anchor drives ----
    if (selAnchor) {
      const avail = new Set(Object.keys(mech?.anchors || {}));
      const { role, uses, notes } = anchorUses(ROSTER_BY_ID[curId], selAnchor, avail);
      const obj = mech.anchors[selAnchor];
      const bs = anchorBase[selAnchor];
      const moved = bs && obj.parent !== bs.parent;
      let html = `<div style="font-weight:600;color:#ffd9a0;margin-bottom:3px">${selAnchor} drives</div>`;
      // which bone/joint it currently rides — flagged when the drag rebound it
      html += `<div style="font-size:11px;margin-bottom:4px;color:${moved ? '#7ee0a0' : '#cfe0f5'}">`
        + `Attached to: <b>${parentLabel(mech, obj)}</b>`
        + (moved ? ` <span style="color:#8a97a8">(was ${parentLabel(mech, { parent: bs.parent })})</span>` : '')
        + '</div>';
      if (uses.length) {
        for (const u of uses) {
          html += `<div style="color:#cfe0f5;font-size:11px">• ${u.label}`
            + (u.detail ? ` <span style="color:#8a97a8">(${u.detail})</span>` : '') + '</div>';
        }
      } else {
        html += `<div style="color:#9fb2c8;font-size:11px">• No action on ${curId.toUpperCase()} reads this anchor.</div>`;
      }
      for (const n of notes || []) {
        html += `<div style="color:#ffb347;font-size:10.5px;margin-top:3px">⚠ ${n}</div>`;
      }
      if (role) html += `<div style="color:#7d8ea3;font-size:10px;margin-top:4px;line-height:1.4">${role}</div>`;
      anchorUsePanel.innerHTML = html;
      anchorUsePanel.style.display = 'block';
    } else anchorUsePanel.style.display = 'none';
    // ---- Output only when there is something to output ----
    const dirtyCount = Object.keys(anchorBase).filter(anchorChanged).length;
    outBtn.disabled = !dirtyCount;
    outBtn.style.opacity = dirtyCount ? '1' : '0.4';
    outBtn.style.cursor = dirtyCount ? 'pointer' : 'not-allowed';
    outBtn.style.background = dirtyCount ? '#1f7a4d' : '#243040';
    outBtn.textContent = dirtyCount ? `Output changes (${dirtyCount}) ▶` : 'Output changes ▶';
    markAGiz();
  }

  const help = el('div', 'margin-top:8px;color:#69788c;font-size:10.5px;line-height:1.5');
  help.innerHTML = 'Orbit: drag empty space · Zoom: wheel<br>Left = procedural · Right = GLB<br>'
    + 'Action: keyboard F/G/R/T/H + ⇧ or a gamepad, or the buttons above.<br>'
    + 'Anchors: click = move handle · shift-click = rotate · drop binds it to the '
    + 'nearest geometry so it rides that part. Animation freezes while a point is '
    + 'held (firing still previews from it); release the point to resume.';
  panel.appendChild(help);

  // ---- helpers ----
  function el(tag, css) { const e = document.createElement(tag); e.style.cssText = css; return e; }
  function label(t) { const d = el('div', 'color:#7d8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin:4px 0 2px'); d.textContent = t; return d; }
  function toggle(text, fn) { const b = el('button', 'flex:1;padding:5px;border-radius:4px;border:1px solid #2c3648;cursor:pointer;font-size:11px;background:#1a2433;color:#9fb2c8'); b.textContent = text; b.onclick = fn; return b; }
  function btn(text, fn, primary) { const b = el('button', `width:100%;flex:1;padding:6px;border-radius:5px;border:1px solid #2c3648;cursor:pointer;font-size:11px;background:${primary ? '#1f7a4d' : '#1a2433'};color:${primary ? '#fff' : '#cfe0f5'}`); b.textContent = text; b.onclick = fn; return b; }
  function rnd(v, d = 2) { const m = 10 ** d; return Math.round(v * m) / m; }

  styleMode(); markGiz(); setSpeed(100);
  await load(curId);

  // ---- loop ----
  engine.onUpdate = (dt) => {
    input.poll();
    if (mode === 'action') {
      readCombined(scratch);
      // fold in on-screen button presses (held-style)
      for (const [k, v] of Object.entries(uiPress)) {
        if (!v) continue;
        if (k === 'walk') { scratch.moveZ = 1; }  // hold-to-walk forward
        else if (k === 'ranged') { scratch.ranged = scratch.rangedHeld = true; }
        else if (k === 'block') scratch.block = true;
        else { scratch[k] = true; scratch[k + 'Held'] = true; }
      }
      // a NEW action press snaps everyone home first, so the move plays out
      // from the reference spot (translation from the previous move is temporary)
      if (detectAction()) { resetPositions(); lastWasWalk = false; }
      for (const f of [procF, glbF]) {
        copyIntent(f.intent, scratch);
        f.hp = f.maxHp; f.ult = 1; f.specialCd = 0; f.rangedCd = 0; f.iframes = 0;
        if (f.ammoMax !== undefined) f.ammo = f.ammoMax;
      }
      // pin the invisible aim targets to their posts (knockback would drift
      // them, and a drifted target skews the next attack's aim)
      for (const [d, x] of [[procDummy, -PAIR_X], [glbDummy, PAIR_X]]) {
        d.hp = d.maxHp;
        if (!d.alive) { d.alive = true; d.hp = d.maxHp; d.state = 'normal'; }
        d.pos.set(x, 0, dummyPost);
        d.vel.set(0, 0, 0);
        d.yaw = d.targetYaw = Math.PI;
      }
      world.update(dt);      // dt pre-scaled by engine.timeScale
      if (selAnchor) {
        // ANCHOR EDITING: hold both mechs at the deterministic rest so the
        // geometry under the handle stays still while you place the point.
        // poseStatic only rewrites the visual pose — the action state machine
        // keeps running underneath, so firing still previews from the anchor.
        for (const [f, x] of [[procF, -PAIR_X], [glbF, PAIR_X]]) {
          if (!f) continue;
          f.pos.set(x, 0, 0); f.vel.set(0, 0, 0);
          f.yaw = f.targetYaw = f.torsoYaw = 0;
          f._floorLift = 0; f.mech.visualFloorLift?.(0);
          f.animator.poseStatic();
        }
        idleT = 0;
      } else {
        floorClamp(glbF, dt); floorClamp(procF, dt);  // keep GLB rigid-limb overshoot on the floor
      }
      input.endFrame();
      // settle-reset: snap home a few REAL seconds after everything is at
      // rest (slow-mo doesn't stretch the wait) — 2s after the stick is
      // released from a walk, 3s after an action finishes
      const walking = Math.abs(scratch.moveX) > 0.08 || Math.abs(scratch.moveZ) > 0.08;
      if (walking) lastWasWalk = true;
      const busy = walking || fighterBusy(procF) || fighterBusy(glbF);
      const moved = displaced(procF, -PAIR_X) || displaced(glbF, PAIR_X);
      if (busy) idleT = 0;
      else if (moved) {
        idleT += dt / (engine.timeScale || 1);
        if (idleT > (lastWasWalk ? 2 : 3)) resetPositions();
      } else idleT = 0;
    } else {
      input.endFrame();
    }
  };
  engine.onRender = () => {
    orbit.update();
    // markers ride the live anchors (which ride the animated bones), so every
    // spawn point stays visible while the mech moves
    const anchors = glbF?.mech?.anchors;
    if (anchors) {
      // only the SELECTED anchor shows a marker — the rest would just clutter
      // the model while you work on one point
      for (const m of anchorMarks.children) {
        const a = anchors[m._anchor];
        m.visible = !!a && m._anchor === selAnchor;
        if (m.visible) a.getWorldPosition(m.position);
      }
      const sel = selAnchor && anchors[selAnchor];
      barrelArrow.visible = !!sel;
      if (sel) {
        sel.getWorldPosition(barrelArrow.position);
        barrelArrow.setDirection(_barrelV.set(0, 0, 1)
          .applyQuaternion(sel.getWorldQuaternion(_barrelQ)).normalize());
      }
    }
  };
  engine.start();
  return engine;
}
