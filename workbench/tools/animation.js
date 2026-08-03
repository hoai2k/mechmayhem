// ?debug=models — side-by-side PROCEDURAL vs GLB ACTION debugger for a mech.
//
// Both models are live Fighters on a bare stage. A controller or the keyboard
// triggers the SAME attack on BOTH at once, with real projectiles, so you can
// compare the two renderings in motion. A speed slider slow-mos everything; a
// status panel names the current action and its known characteristics, tagging
// any that apply to only one version. The stage is EMPTY of opponents: attacks
// aim at combat's own no-target phantom (Fighter.aimPhantom), so a preview
// shows the exact trajectory the move takes in a real match with nothing in
// front of the mech. The anchor editor (below the action buttons) rides along.
//
// COMPARE TO (&compare): what stands beside the mech under study — the
// procedural body, the mech's alternate GLB, or NOTHING AT ALL ('solo', which
// centres the survivor). Solo is the DEFAULT: a second body halves the room the
// one you came to look at gets, and the comparison is a thing you ask for.
// Mechs without an alternate get a plain checkbox instead of the three-way
// dropdown. `&left=` is the old name of this param and is still read.
//
// POSING lives in its OWN workbench now — ?debug=pose (src/dev/posework.js):
// joint gizmo, bone display, limb-length constraints, and both the clip-pose
// and manifest bind-patch (boneCorrections / bonePos) exports.
//
//   /workbench/?edit=animation&mech=<id>[&compare=proc|alt|solo]
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { subjectSelect } from '../ui/subjectpick.js';
import { setupDevPanel } from '../ui/panel.js';
import { setupMobileChrome, barField, isMobileLayout } from '../ui/mobile.js';
import { describeAction, ACTIONS } from '../adapters/actionchars.js';

const R2D = 180 / Math.PI;
const PAIR_X = 6;              // half-separation of the two models
const INTENT_BTNS = ['light', 'lightHeld', 'heavy', 'heavyHeld', 'ranged', 'rangedHeld',
  'special', 'specialHeld', 'ult', 'block', 'dash', 'jump', 'jumpHeld', 'duck', 'taunt'];

export async function runAnimationWorkbench(config, params) {
  const startId = params.get('mech') || params.get('id');
  const anchorUses = (id, name, avail) => config.anchors.uses(id, name, avail);
  const engine = config.stage.engine();
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
  const world = config.stage.world(engine);
  const input = config.stage.input();
  world.input = input;

  camera.position.set(14, 8, 15);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 4, 2);
  orbit.update();

  // The anchor gizmo: anchors are draggable while the action plays, so the
  // live previews (projectiles, muzzle flashes) spawn from the point you are
  // moving. Joint posing lives in ?debug=pose.
  const anchorGizmo = new TransformControls(camera, renderer.domElement);
  anchorGizmo.setSpace('local'); anchorGizmo.setMode('translate'); anchorGizmo.setSize(0.55);
  scene.add(anchorGizmo.getHelper ? anchorGizmo.getHelper() : anchorGizmo);
  anchorGizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    // one drag = one undo step, taken AFTER the drop so the auto-bind
    // re-parent is part of the same step
    if (!e.value) { onAnchorDrop(); pushAnchorHistory(); }
  });

    const manifest = config.manifest();
  const glbIds = config.catalogue.list().filter((c) => c.hasModel).map((c) => c.id);
  let curId = (startId && manifest[startId]?.url) ? startId : (glbIds[0] || config.catalogue.list()[0].id);
  let timeScale = 1;
  // Set by the mobile chrome below: the fixed desktop camera is framed for a
  // landscape window, and on a portrait phone it cuts both fighters in half.
  // Null (and so a no-op) on a desktop.
  let mobileFrame = null;

  // ---- live state ----
  let procF = null, glbF = null;
  // LEFT-SLOT mode: what stands next to the mech under study.
  //   'proc' — the procedural body (the default comparison)
  //   'alt'  — the mech's alternate GLB (only offered when it has one)
  //   'solo' — nothing: the main GLB alone, centred on the stage
  let soloMode = false;
  // where each fighter's home spot is. Solo re-centres the survivor so a lone
  // mech isn't parked off to one side of the camera.
  const homeX = (f) => (f && f === procF ? -PAIR_X : (soloMode ? 0 : PAIR_X));
  const scratch = blankIntent(), pad = blankIntent(), prev = {};
  let lastAction = 'idle';
  // ---- anchor editor state ----
  let selAnchor = null;              // anchor name the anchor gizmo holds
  const anchorBase = {};             // name -> {parent, pos, rot} captured at load
  const anchorMarks = new THREE.Group(); scene.add(anchorMarks);
  // Direction arrow for the held anchor. It draws WHAT THE GAME WILL USE, not
  // the raw +Z: an anchor with an authored `rot` aims along its own +Z (a
  // barrel — world.js barrelDeflect), and a BOOSTER with no rot thrusts down
  // the BODY's -Y whatever its ankle bone is doing (fighter.js boosterJets).
  // Drawing +Z there was a lie — an un-rotated boostL rides the ankle bone,
  // whose +Z points wherever the rig's foot axis happens to point (forward on
  // most of the roster), so the arrow said "forward" about a jet that has
  // always burned straight down. Amber = the body-down default, orange = an
  // authored aim.
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
    for (const f of [procF, glbF]) {
      if (!f) continue;
      const x = homeX(f);
      f.pos.set(x, 0, 0);
      f.vel.set(0, 0, 0);
      f.yaw = f.targetYaw = f.torsoYaw = 0;
      f.grounded = true;
      f._floorLift = 0; f.mech.visualFloorLift?.(0); // clear the pose-tool floor lift
    }
    idleT = 0;
  }
  // FALLING DOWN: the floored reaction, driven exactly the way a launching hit
  // drives it (fighter.takeHit) — kick the body up and backwards into
  // 'launched' and let the state machine carry it through landing, the
  // knockdown loop and the get-up. Both models take it at the same instant.
  function knockBothDown() {
    for (const f of [procF, glbF]) {
      if (!f || !f.alive || f.state === 'launched' || f.state === 'knockdown') continue;
      f.vel.x = -Math.sin(f.yaw) * 5;
      f.vel.z = -Math.cos(f.yaw) * 5;
      f.vel.y = 9;
      f.grounded = false;
      f.firing = false;
      f.setState('launched', 3);
      f.animator.play('launched');
    }
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
    // MEASURE THE THING YOU LIFT. `visualFloorLift` moves the MODEL container,
    // and this used to scan the whole fighter GROUP — which also carries the FX
    // combat parents to it. Blocking adds a guard-bubble sphere hanging 0.8
    // below the feet; the clamp read that as the mech sinking, lifted the model
    // 0.8 to compensate, and the sphere (a sibling, not inside the container)
    // never moved — so `need` stayed 0.8 for ever and the mech was left
    // permanently floating, chimney flames and all, long after the block ended.
    // Reported as "the chimney fires changed position after a block".
    const g = f.mech.visual || f.group;
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
      // …and only what is actually DRAWN. The same bubble stays parented and
      // merely switches off, so an invisible mesh must not hold the clamp up.
      if (!o.visible || (o.parent && !o.parent.visible)) return;
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

  // one controllable subject on the stage — the config builds it with the
  // game's own actor type, so the state machine under it is the real one
  function makeFighter(id, x, opts = {}) {
    return config.stage.actor(world, id, {
      pos: new THREE.Vector3(x, 0, 0), yaw: 0, playerIndex: opts.pi ?? 0, isAI: false, mech: opts.mech,
    });
  }

  async function load(id) {
    curId = id;
    const u = new URL(location.href);
    u.searchParams.set('mech', id);
    history.replaceState(null, '', u);
    anchorGizmo.detach(); selAnchor = null;
    for (const f of [procF, glbF]) disposeFighter(f);
    world.fighters.length = 0;
    if (Array.isArray(world.projectiles)) world.projectiles.length = 0;

    const hasAlt = !!manifest[id]?.alt?.url;
    // COMPARE TO: procedural by default; 'alt' stands the mech's alternate model
    // there instead (own intake — a full independent fighter) so alt-vs-original
    // can be judged side by side; 'solo' leaves the slot EMPTY so the mech under
    // study stands alone, centred, with nothing else to read past.
    const slot = (compareTo === 'alt' && !hasAlt) ? 'proc' : compareTo;
    soloMode = slot === 'solo';
    procF = null;
    if (!soloMode) {
      if (slot === 'alt') {
        const altModel = await config.variants.build(id, { variant: 'alt' });
        procF = makeFighter(id, -PAIR_X, { pi: 0, mech: altModel });
      } else {
        // no `mech` override: the actor builds this game's DEFAULT comparison
        // body (robotworld: the hand-sculpted procedural one)
        procF = makeFighter(id, -PAIR_X, { pi: 0 });
      }
    }
    const model = await config.variants.build(id, { variant: 'glb' });
    glbF = makeFighter(id, soloMode ? 0 : PAIR_X, { pi: 1, mech: model });
    syncSlotUI(hasAlt, slot);
    panelUI.setSubtitle(`${id} · GLB vs ${slot === 'alt' ? 'ALT' : slot === 'solo' ? '(solo)' : 'procedural'}`);
    // NO stand-in enemies on the stage. Attacks aim at the combat code's own
    // no-target phantom (Fighter.aimPhantom): an imagined opponent dead ahead
    // at the move's ideal distance — close for melee, out at working range for
    // a gun. That is the same trajectory the mech takes in a real match with
    // nothing in front of it, so what the workbench previews is the shipping
    // behaviour rather than a rig-only special case. The two previewed mechs
    // are flagged ALLIES of each other so neither counts as the other's
    // nearest enemy and slews to aim across the stage.
    if (procF) procF.allyOf = glbF;
    world.fighters.push(...[procF, glbF].filter(Boolean));

    window.__poseDebug = { proc: procF?.mech || null, glb: glbF.mech, procF, glbF, world, engine, camera, scene,
      // anchor-editor hooks (scripting / automated checks)
      anchors: { select: selectAnchor, drop: onAnchorDrop, output: outputAnchors,
        patch: buildAnchorPatch, reset: resetAnchor, changed: anchorChanged,
        nearestBone, boneRefName, base: anchorBase,
        undo: anchorUndo, redo: anchorRedo, push: pushAnchorHistory,
        get history() { return { at: aHistIdx, len: aHist.length }; },
        get sel() { return selAnchor; } } };
    captureAnchorBase();
    // the mech was rebuilt: old anchor objects and parents are gone, so the
    // stack starts again from this load's state
    resetAnchorHistory();
    pushAnchorHistory();
    buildAnchorButtons();
    anchorNote.textContent = '';
    anchorOut.style.display = 'none';
    setStatus('idle');
    mobileFrame?.();   // solo re-centres the survivor, so the fit changes with it
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
    ['ult', (s) => s.ult], ['special', (s) => s.special], ['heavy', (s) => s.heavy], ['light', (s) => s.light],
    ['dash', (s) => s.dash], ['ranged', (s) => s.ranged || s.rangedHeld], ['block', (s) => s.block],
    ['taunt', (s) => s.taunt], ['fall', () => pulse.fall],
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
    const d = describeAction(config.catalogue.get(curId), action);
    let html = `<div style="font-weight:600;color:#cfe3ff;margin-bottom:3px">▶ ${d.title}</div>`;
    for (const ln of d.lines) {
      const tag = ln.v === 'proc' ? ' <span style="color:#8fd8ff">(Procedural only)</span>'
        : ln.v === 'glb' ? ' <span style="color:#ffd060">(GLB only)</span>' : '';
      html += `<div style="color:#9fb2c8;font-size:11px">• ${ln.t}${tag}</div>`;
    }
    statusPanel.innerHTML = html;
  }

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
  // load-time baseline: the state Undo can always walk back to
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

  // ================= anchor undo / redo =================
  // Same model as the pose workbench: a step is a STATE, not a delta — every
  // anchor's parent + local transform, which is exactly what the manifest
  // records, so restoring one reproduces what that step looked like including
  // the auto-bind re-parent a drop performed.
  //
  // A drag is ONE step (the snapshot is taken when the gizmo lets go, after
  // the drop has rebound), and states are deduped by content, so clicking
  // anchors, switching Move/Rotate or firing actions never floods the stack.
  // Rebuilding the mech clears it: the anchor objects and their parents are
  // new, so a state from before the switch means nothing after it.
  const A_HIST_CAP = 100;
  let aHist = [], aHistIdx = -1, aRestoring = false;
  function anchorSnapshot() {
    const out = {};
    for (const [name, obj] of Object.entries(glbF?.mech?.anchors || {})) {
      if (!obj?.isObject3D) continue;
      out[name] = { parent: obj.parent, pos: obj.position.toArray(), rot: [obj.rotation.x, obj.rotation.y, obj.rotation.z] };
    }
    return out;
  }
  // content of a state — parents by uuid, so a re-parent registers as a change
  const anchorSig = (s) => JSON.stringify(Object.entries(s).map(([n, a]) =>
    [n, a.parent?.uuid || null, a.pos.map((v) => +v.toFixed(5)), a.rot.map((v) => +v.toFixed(5))]));
  function pushAnchorHistory() {
    if (aRestoring || !glbF?.mech) return;
    const snap = anchorSnapshot();
    if (aHistIdx >= 0 && anchorSig(aHist[aHistIdx]) === anchorSig(snap)) { syncAnchorHistUI(); return; }
    aHist.length = aHistIdx + 1;        // a new edit discards the redo tail
    aHist.push(snap);
    if (aHist.length > A_HIST_CAP) aHist.shift();
    aHistIdx = aHist.length - 1;
    syncAnchorHistUI();
  }
  function restoreAnchorState(snap) {
    aRestoring = true;
    try {
      for (const [name, a] of Object.entries(snap)) {
        const obj = glbF?.mech?.anchors?.[name];
        if (!obj || !a.parent) continue;
        // add() (not attach()) — the snapshot holds LOCAL numbers, and those
        // are what the manifest carries; attach would re-solve them from world
        if (obj.parent !== a.parent) a.parent.add(obj);
        obj.position.fromArray(a.pos);
        obj.rotation.set(a.rot[0], a.rot[1], a.rot[2]);
        obj.scale.setScalar(1);
      }
    } finally { aRestoring = false; }
    refreshAnchorUI();
  }
  function anchorUndo() {
    if (aHistIdx <= 0) { anchorNote.textContent = 'Nothing to undo.'; return; }
    aHistIdx--;
    restoreAnchorState(aHist[aHistIdx]);
    anchorNote.textContent = `Undo · anchor step ${aHistIdx + 1}/${aHist.length}`;
  }
  function anchorRedo() {
    if (aHistIdx >= aHist.length - 1) { anchorNote.textContent = 'Nothing to redo.'; return; }
    aHistIdx++;
    restoreAnchorState(aHist[aHistIdx]);
    anchorNote.textContent = `Redo · anchor step ${aHistIdx + 1}/${aHist.length}`;
  }
  function resetAnchorHistory() { aHist = []; aHistIdx = -1; }
  function syncAnchorHistUI() {
    const canU = aHistIdx > 0, canR = aHistIdx < aHist.length - 1;
    for (const [b, on] of [[aUndoBtn, canU], [aRedoBtn, canR]]) {
      if (!b) continue;
      b.disabled = !on;
      b.style.opacity = on ? '1' : '0.4';
      b.style.cursor = on ? 'pointer' : 'not-allowed';
    }
    if (aHistStep) {
      aHistStep.textContent = aHist.length > 1
        ? `step ${aHistIdx + 1}/${aHist.length} · Ctrl/⌘+Z`
        : 'Ctrl/⌘+Z · Shift to redo';
    }
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
      // `rot` IS THE AUTHORING, not a readout. Its presence is what tells the
      // loader the orientation was chosen — a muzzle aims along its barrel, a
      // booster with no rot thrusts down the BODY rather than along an ankle
      // bone's +Z. So it is emitted only where it means something: always for a
      // muzzle (dropping a near-zero rot would silently turn barrel-aiming off),
      // for an anchor the manifest ALREADY authored one on, and for one this
      // session actually turned in Rotate mode. Whatever rotation an anchor
      // merely INHERITED from its bone is not an edit, and moving an anchor
      // must not quietly author an aim the owner never asked for.
      const r = [obj.rotation.x * R2D, obj.rotation.y * R2D, obj.rotation.z * R2D];
      const isMuzzle = key === 'R' || key === 'L' || mech.anchors[name]?.userData?.aimRot;
      const bs = anchorBase[name];
      const turned = !bs || Math.abs(obj.rotation.x - bs.rot.x) > 1e-4
        || Math.abs(obj.rotation.y - bs.rot.y) > 1e-4
        || Math.abs(obj.rotation.z - bs.rot.z) > 1e-4;
      if (isMuzzle || turned) spec.rot = [rnd(r[0]), rnd(r[1]), rnd(r[2])];
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
  const panelUI = setupDevPanel(panel, { key: 'models', workbench: 'models' });

  const mechLabel = label('Mech');
  panel.appendChild(mechLabel);
  // subjectSelect owns the ordering rule (alphabetical, work-in-progress mechs
  // under a rule at the end); `label` keeps this tool's bare-id text.
  const mechSel = subjectSelect({
    config,
    // this workbench drives the game's real fighter state machine, so it offers
    // only real mechs — the reference body has no moves to trigger
    ids: config.catalogue.list().filter((c) => !c.reference).map((c) => c.id),
    ids: glbIds,
    value: curId,
    label: (id) => id,
    css: 'width:100%;margin-bottom:8px;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px',
    onPick: (id) => load(id),
  });
  panel.appendChild(mechSel);

  // COMPARE TO — what stands beside the mech under study.
  // A mech WITH an alternate GLB gets the full three-way dropdown; one without
  // has nothing to compare against but procedural, so it gets a plain checkbox
  // instead of a two-item select.
  // `left=` is this param's old name; still read so old links keep working,
  // never written back.
  let compareTo = params.get('compare') || params.get('left')
    || (params.get('alt') === '1' ? 'alt' : 'solo');
  if (!['proc', 'alt', 'solo'].includes(compareTo)) compareTo = 'solo';
  const setCompareTo = (v) => {
    compareTo = v;
    const u = new URL(location.href);
    u.searchParams.delete('alt');                 // legacy flag, superseded
    u.searchParams.delete('left');                // ditto — 'compare' is the name now
    if (v === 'solo') u.searchParams.delete('compare'); else u.searchParams.set('compare', v);
    history.replaceState(null, '', u);
    load(curId);
  };
  panel.appendChild(label('Compare to'));
  const slotSel = el('select', 'width:100%;margin-bottom:8px;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px;display:none');
  for (const [v, t] of [['proc', 'Procedural Robot'], ['alt', 'Alternate GLB'], ['solo', 'None (view solo)']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = t; slotSel.appendChild(o);
  }
  slotSel.onchange = () => setCompareTo(slotSel.value);
  panel.appendChild(slotSel);
  const soloRow = el('label', 'display:none;gap:6px;align-items:center;cursor:pointer;margin-bottom:8px;font-size:11px;color:#cfe0f5');
  const soloCheck = document.createElement('input');
  soloCheck.type = 'checkbox';
  soloRow.appendChild(soloCheck);
  soloRow.appendChild(document.createTextNode(' None (view solo)'));
  soloCheck.onchange = () => setCompareTo(soloCheck.checked ? 'solo' : 'proc');
  panel.appendChild(soloRow);
  // called from load() once the mech's alt availability is known
  function syncSlotUI(hasAlt, slot) {
    slotSel.style.display = hasAlt ? 'block' : 'none';
    soloRow.style.display = hasAlt ? 'none' : 'flex';
    slotSel.value = slot;
    soloCheck.checked = slot === 'solo';
  }

  // ---------- ACTION UI ----------
  const actionModeUI = el('div', '');
  panel.appendChild(actionModeUI);
  actionModeUI.appendChild(label('Trigger action'));
  const btnGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px');
  const BTNS = [['walk', 'Walk (W/stick) — hold'], ['light', 'Light (F/✕)'], ['heavy', 'Heavy (G/△)'], ['ranged', 'Ranged (R/RB)'],
    ['special', 'Special (T/RT)'], ['ult', 'Ultimate (Y/DPad↑)'], ['block', 'Block (H/LB)'], ['dash', 'Dash (⇧/B)'],
    ['taunt', 'Taunt (B/DPad↓)'], ['fall', 'Falling down']];
  // ONE-SHOT actions fire on press and clear themselves the next frame: an ult
  // held down would relaunch the moment the last one ends, and knockdown is a
  // direct state kick, not an intent at all.
  // A TAUNT IS A ONE-SHOT for the same reason an ult is: fighter.js starts it
  // from `normal` on the intent being SET, not on its edge, so a held button
  // relaunches it the instant the last one hands the body back.
  const ONE_SHOT = new Set(['ult', 'taunt', 'fall']);
  for (const [act, txt] of BTNS) {
    const b = el('button', `padding:5px 3px;font-size:11px;border-radius:4px;cursor:pointer;background:#1a2433;color:#cfe0f5;border:1px solid #2c3648`);
    b.textContent = txt;
    if (ONE_SHOT.has(act)) { b.onclick = () => { pulse[act] = true; }; btnGrid.appendChild(b); continue; }
    // hold-to-fire so held moves (block/ranged) behave; tap fires once
    b.onpointerdown = () => { uiPress[act] = true; };
    const up = () => { uiPress[act] = false; };
    b.onpointerup = up; b.onpointerleave = up;
    btnGrid.appendChild(b);
  }
  actionModeUI.appendChild(btnGrid);
  const uiPress = {};
  const pulse = {};   // one-shot presses, consumed by the next update

  // Which kind of press an action wants. The buttons above express this with
  // the pointer itself (hold the button, hold the move); a dropdown — which is
  // what the mobile bar offers instead of a nine-button grid — has no press to
  // hold, so it says it here: HOLD actions stay down until the choice changes,
  // the rest are a press and a release a moment later.
  const HOLD_ACTIONS = new Set(['walk', 'block', 'ranged']);
  function triggerAction(act, { release = 240 } = {}) {
    for (const k of Object.keys(uiPress)) uiPress[k] = false;
    if (!act) return;
    if (ONE_SHOT.has(act)) { pulse[act] = true; return; }
    uiPress[act] = true;
    if (!HOLD_ACTIONS.has(act)) setTimeout(() => { uiPress[act] = false; }, release);
  }

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

  // ---------- ANCHOR editor UI ----------
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
  aResetRow.appendChild(btn('Reset anchor', () => {
    if (selAnchor) { resetAnchor(selAnchor); refreshAnchorUI(); pushAnchorHistory(); }
  }));
  aResetRow.appendChild(btn('Reset all anchors', () => {
    for (const n of Object.keys(anchorBase)) resetAnchor(n);
    refreshAnchorUI();
    pushAnchorHistory();
  }));
  panel.appendChild(aResetRow);
  const aHistRow = el('div', 'display:flex;gap:6px;margin-bottom:4px');
  const aUndoBtn = btn('↶ Undo', () => anchorUndo());
  const aRedoBtn = btn('↷ Redo', () => anchorRedo());
  aHistRow.append(aUndoBtn, aRedoBtn);
  panel.appendChild(aHistRow);
  const aHistStep = el('div', 'color:#69788c;font-size:10px;margin-bottom:5px');
  panel.appendChild(aHistStep);
  syncAnchorHistUI();
  // Ctrl/⌘+Z · Shift to redo · Ctrl+Y — chorded, so they can't collide with
  // the single-key action triggers the workbench feeds to the game input
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); (e.shiftKey ? anchorRedo : anchorUndo)(); }
    else if (k === 'y') { e.preventDefault(); anchorRedo(); }
  });
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
      ? `${selAnchor} · on ${parentLabel(mech, mech.anchors[selAnchor])} · ${anchorGizmo.mode} · ANIM FROZEN`
      : 'Click an anchor to grab it · shift-click = rotate';
    // ---- what this anchor drives ----
    if (selAnchor) {
      const avail = new Set(Object.keys(mech?.anchors || {}));
      const { role, uses, notes } = anchorUses(curId, selAnchor, avail);
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
  help.innerHTML = 'Orbit: drag empty space · Zoom: wheel<br>'
    + 'Left = what you compare to · Right = this mech\'s GLB<br>'
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

  // ---------- MOBILE ----------
  // On a phone the panel above is the whole screen, and the model — the thing
  // this tool exists to show — is a sliver beside it. So the two controls you
  // touch constantly (which mech, which action) move to a bar across the top,
  // the rest of the screen is the viewer, and ⚙ raises the panel as a sheet
  // when you want anything else. Nothing here runs on a desktop.
  let actionSel = null;
  if (isMobileLayout()) {
    actionSel = document.createElement('select');
    actionSel.title = 'trigger this action on both models';
    actionSel.innerHTML = '<option value="">— no action —</option>'
      + BTNS.map(([act, txt]) => {
        // the button captions name the key/pad binding, which a touch screen
        // has neither of
        const name = txt.replace(/\s*[—(].*$/, '').trim();
        return `<option value="${act}">${name}${HOLD_ACTIONS.has(act) ? ' (hold)' : ''}</option>`;
      }).join('');
    actionSel.onchange = () => {
      const act = actionSel.value;
      triggerAction(act);
      // a HELD move stays selected — it is a state you are in, and choosing
      // something else leaves it. Everything else falls back to "no action",
      // so picking the same move twice fires it twice.
      if (act && !HOLD_ACTIONS.has(act)) actionSel.value = '';
    };
  }
  const mobile = setupMobileChrome(panel, {
    primary: [mechSel],                                    // MOVED, same element
    secondary: actionSel ? [barField('action', actionSel)] : [],
    orbit,
    title: 'Animation workbench',
  });
  if (mobile.active) {
    mechLabel.remove();          // the bar is the label now
    // FIT THE PAIR TO A PORTRAIT SCREEN. The desktop camera is a hand-picked
    // point that suits a wide window; solve the distance instead, off the real
    // fov and aspect, keeping the same viewing direction. Re-run on rotation.
    mobileFrame = () => {
      const halfW = soloMode ? 4.5 : PAIR_X + 4.5;   // the pair, plus air
      const halfH = 6.5;                             // a tall mech, plus air
      const vfov = camera.fov * Math.PI / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (camera.aspect || 1));
      const dist = Math.max(halfW / Math.tan(hfov / 2), halfH / Math.tan(vfov / 2)) * 1.06;
      orbit.target.set(0, 4, 0);
      camera.position.copy(new THREE.Vector3(14, 8, 15).normalize().multiplyScalar(dist));
      orbit.update();
    };
    window.addEventListener('resize', () => mobileFrame());
    mobileFrame();
    help.innerHTML = 'One finger: orbit · two fingers: pan + pinch to zoom<br>'
      + 'Left = what you compare to · Right = this mech\'s GLB<br>'
      + 'Everything else is in this sheet — ⚙ opens it, Done dismisses it.';
  }

  setSpeed(100);
  await load(curId);

  // ---- loop ----
  engine.onUpdate = (dt) => {
    input.poll();
    readCombined(scratch);
    // fold in on-screen button presses (held-style)
    for (const [k, v] of Object.entries(uiPress)) {
      if (!v) continue;
      if (k === 'walk') { scratch.moveZ = 1; }  // hold-to-walk forward
      else if (k === 'ranged') { scratch.ranged = scratch.rangedHeld = true; }
      else if (k === 'block') scratch.block = true;
      else { scratch[k] = true; scratch[k + 'Held'] = true; }
    }
    // one-shot presses: the ult rides the intent, the knockdown is applied
    // to the fighters directly further down
    if (pulse.ult) scratch.ult = true;
    if (pulse.taunt) scratch.taunt = true;
    // a NEW action press snaps everyone home first, so the move plays out
    // from the reference spot (translation from the previous move is temporary)
    if (detectAction()) { resetPositions(); lastWasWalk = false; }
    for (const f of [procF, glbF]) {
      if (!f) continue;
      copyIntent(f.intent, scratch);
      f.hp = f.maxHp; f.ult = 1; f.specialCd = 0; f.rangedCd = 0; f.iframes = 0;
      if (f.ammoMax !== undefined) f.ammo = f.ammoMax;
    }
    if (pulse.fall) knockBothDown();
    pulse.ult = pulse.taunt = pulse.fall = false;
    world.update(dt);      // dt pre-scaled by engine.timeScale
    if (selAnchor) {
      // ANCHOR EDITING: hold both mechs at the deterministic rest so the
      // geometry under the handle stays still while you place the point.
      // poseStatic only rewrites the visual pose — the action state machine
      // keeps running underneath, so firing still previews from the anchor.
      for (const f of [procF, glbF]) {
        if (!f) continue;
        f.pos.set(homeX(f), 0, 0); f.vel.set(0, 0, 0);
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
    const moved = displaced(procF, homeX(procF)) || displaced(glbF, homeX(glbF));
    if (busy) idleT = 0;
    else if (moved) {
      idleT += dt / (engine.timeScale || 1);
      if (idleT > (lastWasWalk ? 2 : 3)) resetPositions();
    } else idleT = 0;
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
        // a boost nozzle with no authored rot burns down the BODY, not along +Z
        const bodyDown = selAnchor.startsWith('boost') && !sel.userData.aimRot;
        _barrelV.set(0, bodyDown ? -1 : 0, bodyDown ? 0 : 1)
          .applyQuaternion((bodyDown ? glbF.group : sel).getWorldQuaternion(_barrelQ));
        barrelArrow.setDirection(_barrelV.normalize());
        barrelArrow.setColor(bodyDown ? 0xffb347 : 0xff6a3d);
      }
    }
  };
  engine.start();
  return engine;
}
