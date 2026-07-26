// ?debug=skin — GLB skin-repair workbench.
//
// Shows a mech's raw GLB colored BY DOMINANT BONE, so auto-rig weight
// mistakes read as wrong-colored patches (an arm-colored banner, a hip plate
// in forearm color). Click a patch to select its bone-island, then rebind it
// to the right bone; wiggle any bone to see exactly what moves with it.
// "Export ops" downloads a manifest patch: { "<id>": { "skinOps": [...] } } —
// paste into public/models/manifest.json (replaces the mech's skinOps).
// The SAME engine (skinops.js) applies those ops at game load, so what you
// see here is what ships.
//
//   ?debug=skin[&id=<mechId>]
//
// Wiggle can run a REAL game clip instead of the synthetic single-bone shake:
// the "Wiggle animation" dropdown lists every clip that actually drives the
// selected bone's rig joint, and plays it at 10% speed so the skin deformation
// is readable. The choice is sticky across bone switches when the new bone has
// that clip too, else it falls back to Default.
//
// Controls: orbit = drag · zoom = wheel · pan = right-drag
//   click patch = select island · T = textures on/off · W = wiggle bone
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Engine } from '../core/engine.js';
import { ROSTER, ROSTER_BY_ID } from '../mechs/roster.js';
import { altChoice, altCheckbox, reloadWithAlt } from './altpick.js';
import { loadRawGlbScene, fetchRawManifest, skinnedBox, buildGlbForTool } from '../mechs/gltf.js';
import { analyzeSkin, applySkinOps, compactSkinOps, skinOpsToJson } from '../mechs/skinops.js';
import { CLIPS } from '../mechs/animations.js';
import { mechClipList } from './mechclips.js';
import { setupDevPanel } from './panelui.js';

const CLIP_SPEED = 0.1;   // real game clips run at 10% so deformation is readable

export async function runSkinTool(startId) {
  const engine = new Engine(document.getElementById('game-canvas'));
  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(0x252a34);
  // dim, flat-ish lighting: the bone-color view must stay below the engine's
  // bloom threshold or every patch washes out into pastel glow
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x565c66, 1.15));
  const dir = new THREE.DirectionalLight(0xffffff, 1.25);
  dir.position.set(6, 11, 8);
  scene.add(dir);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x333844, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(40, 40, 0x38445a, 0x2a3242));

  camera.position.set(0, 5.2, 11.5);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 3.6, 0);
  orbit.update();

  const manifest = await fetchRawManifest();
  const glbIds = ROSTER.map((r) => r.id).filter((id) => manifest[id]?.url);
  let curId = (startId && manifest[startId]?.url) ? startId : (glbIds[0] || ROSTER[0].id);
  // ?alt=1 edits the manifest's `alt` entry — a second model (aegis, jerry) or
  // the same model on a staged custom rig (rhino, inferno). The panel's "Edit
  // Alternate GLB" box drives it; skinOps belong to whichever entry is loaded,
  // which is why the export below writes into `alt` when one is.
  const wantAlt = new URLSearchParams(location.search).get('alt') === '1';
  // per-mech, because the dropdown switches mechs without a reload and most
  // mechs have no alternate at all
  let altOn = wantAlt && !!manifest[curId]?.alt?.url;

  // ---- state ----
  let holder = null;         // scaled group containing the raw scene
  let mesh = null;           // the SkinnedMesh
  let bones = [];            // skeleton bones
  let pristine = null;       // {skinIndex, skinWeight} copies of the raw file
  let analysis = null;       // pristine analysis — ops with {comp} ids select against this
  let liveAnalysis = null;   // post-ops analysis — ALL picking/regions use this, so
                             // painted splits become their own selectable islands
  let colorAttr = null;      // Float32BufferAttribute vertexColors
  let ops = [];              // current op list (manifest skinOps replacement)
  let selComp = null;        // selected island (from pristine analysis)
  let mode = 'select';       // select | picktarget
  let texturedMat = null, boneMat = null, showTex = false;
  let wiggle = null;         // {bone, orig, clip} while wiggling
  // ---- real-animation driver ----
  // The workbench renders the RAW GLB (private geometry, pristine weights), so
  // it has no rig or animator of its own. To wiggle a bone with an ACTUAL game
  // clip we build a second, never-rendered mech from the same GLB and use it
  // purely as a pose source: its Animator + RigAdapter pose its bones, and we
  // copy those LOCAL rotations onto the raw skeleton by name each frame.
  let animMech = null;       // hidden driver build
  let animBones = null;      // Map bone name -> driver bone
  let jointOfBone = null;    // Map raw bone name -> canonical joint it retargets from
  let selBone = null;        // the bone Wiggle would move (drives the clip list)
  let clipOpts = [];         // [{name, role}] for clips that animate selBone
  let preferredClip = null;  // sticky choice, kept across bone switches when possible
  let clipRestore = null;    // raw bone rotations to put back when a clip stops
  let wigglePaused = false;  // SPACE freezes the wiggle so you can click a
                             // stretched-out piece of geometry
  let hoverInfo = '';
  // ---- bind-geometry panel: per-bone weights for the selected island ----
  let bindOpen = false;      // is the weight editor showing?
  // undo/redo of the ops list (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
  let undoStack = [], redoStack = [];
  // ---- paint mode: split one island across two bones with a brush ----
  let paintMode = false;
  let paintPhase = 'off';    // off | pickBone | pickRegion | paint
  let paintBone = null;      // target bone NAME to paint with
  let paintRegion = null;    // the island (comp) the brush is constrained to
  let regionSet = null;      // Set of that island's vertex indices
  let regionWorld = null;    // Map vi -> world position (rest pose, cached)
  let paintColorAttr = null; // RGBA vertex colors (region opaque, rest faded)
  let paintMat = null;
  let paintOp = null;        // live { sel:{verts:[]}, to } being grown
  let paintSet = null;       // Set mirror of paintOp's verts
  let painting = false;      // left button held & painting
  let strokePushed = false;  // did this stroke already snapshot for undo
  let brushRadius = 0.30;    // world units (model is normalized ~7 tall)
  let brushMode = 'radius';  // radius | loop (screen-space lasso selection)
  let looping = false;       // left button held, drawing the lasso
  let loopPts = [];          // lasso polygon, client coords
  let loopCanvas = null;     // 2D overlay the lasso is drawn on
  const PAINT_FADE = 0.12;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const _vp = new THREE.Vector3();

  const boneColor = (bi) => new THREE.Color().setHSL(((bi * 137.508) % 360) / 360, 0.8, 0.42);

  function rebuildColors() {
    const n = mesh.geometry.attributes.position.count;
    if (!colorAttr) colorAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    // ensure the geometry is showing the 3-comp bone colors (paint mode swaps
    // in a 4-comp RGBA attribute; this switches it back)
    if (mesh.geometry.getAttribute('color') !== colorAttr) mesh.geometry.setAttribute('color', colorAttr);
    // colors reflect the CURRENT (post-ops) dominant bone so a rebind is
    // instantly visible
    for (let i = 0; i < n; i++) {
      const c = boneColor(liveAnalysis.domBone[i]);
      colorAttr.setXYZ(i, c.r, c.g, c.b);
    }
    if (selComp) {
      for (const v of selComp.verts) colorAttr.setXYZ(v, 1, 1, 1);
    }
    colorAttr.needsUpdate = true;
  }

  function applyAllOps() {
    // restore pristine weights, then re-apply the FULL ops list against the
    // pristine analysis — matches exactly how the game loader applies them.
    // (array.set, not copyArray: saurion's GLB packs skin attributes as
    // InterleavedBufferAttribute, which has no copyArray)
    mesh.geometry.attributes.skinIndex.array.set(pristine.skinIndex);
    mesh.geometry.attributes.skinWeight.array.set(pristine.skinWeight);
    mesh.geometry.attributes.skinIndex.needsUpdate = true;
    mesh.geometry.attributes.skinWeight.needsUpdate = true;
    applySkinOps(mesh, ops, analysis);
    liveAnalysis = analyzeSkin(mesh);
    rebuildColors();
    renderOps();
  }

  // Selector for an op made from a LIVE island: islands unchanged since load
  // keep the compact pristine {comp:id} address; anything reshaped by earlier
  // ops or painting is addressed as an explicit vert list.
  function selectorFor(comp) {
    const pid = analysis.compId[comp.verts[0]];
    if (analysis.comps[pid].count === comp.count &&
        comp.verts.every((v) => analysis.compId[v] === pid)) return { comp: pid };
    return { verts: comp.verts.slice() };
  }

  // ---- undo/redo (snapshots of the ops list) ----
  const snapshotOps = () => ops.map((o) => JSON.parse(JSON.stringify(o)));
  function pushUndo() {
    undoStack.push(snapshotOps());
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!undoStack.length) { setStatus('Nothing to undo.'); return; }
    redoStack.push(snapshotOps());
    ops = undoStack.pop();
    selComp = null; stopWiggle();
    paintOp = null; paintSet = null;   // live paint op is now detached from ops
    afterHistory();
    setStatus(`Undo · ${ops.length} op(s).`);
  }
  function redo() {
    if (!redoStack.length) { setStatus('Nothing to redo.'); return; }
    undoStack.push(snapshotOps());
    ops = redoStack.pop();
    selComp = null; stopWiggle();
    paintOp = null; paintSet = null;
    afterHistory();
    setStatus(`Redo · ${ops.length} op(s).`);
  }
  // re-apply ops after an undo/redo — in paint mode, keep the paint view
  // (region fade + painted colors) in sync with the restored ops
  function afterHistory() {
    applyAllOps();
    if (paintMode && regionSet) refreshPaintColors();
  }

  async function load(id) {
    curId = id;
    altOn = wantAlt && !!manifest[id]?.alt?.url;
    refreshAltRow();
    panelUI.setSubtitle(`${id}${altOn ? ' · ALT' : ''}`);
    // keep the URL's ?mech= in sync so a reload / shared link reopens this mech.
    // replaceState (not pushState) avoids cluttering back-button history.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mech', id);
      url.searchParams.delete('id'); // legacy alias; 'mech' wins, drop the dupe
      window.history.replaceState(null, '', url);
    } catch (_) { /* non-browser / opaque origin — URL sync is best-effort */ }
    if (holder) { scene.remove(holder); holder = null; }
    selComp = null; wiggle = null; wigglePaused = false; ops = []; colorAttr = null;
    undoStack = []; redoStack = [];
    animMech = null; animBones = null; jointOfBone = null;
    selBone = null; clipOpts = []; clipRestore = null;   // preferredClip is sticky across mechs
    // reset paint mode for the new mesh (indices/islands differ per mech)
    paintMode = false; paintPhase = 'off'; painting = false;
    paintBone = null; paintRegion = null; regionSet = null; regionWorld = null;
    paintOp = null; paintSet = null; paintColorAttr = null;
    bindOpen = false; bindComp = null; bindRows = [];
    setOrbitPaintMode(false); updatePaintUI();
    const raw = await loadRawGlbScene(id, { alt: altOn });
    if (!raw) { setStatus('no GLB for ' + id); return; }
    mesh = null;
    raw.scene.traverse((o) => {
      if (o.isSkinnedMesh && !mesh) mesh = o;
      if (o.isMesh || o.isSkinnedMesh) o.frustumCulled = false;
    });
    if (!mesh) { setStatus('no skinned mesh in ' + id); return; }
    bones = mesh.skeleton.bones;
    pristine = {
      skinIndex: mesh.geometry.attributes.skinIndex.array.slice(),
      skinWeight: mesh.geometry.attributes.skinWeight.array.slice(),
    };
    analysis = analyzeSkin(mesh);
    // normalize display size: ~7 units tall, grounded, facing camera.
    // Measure the RENDERED skin (skinnedBox), not the geometry box — Tripo
    // rigs carry an Armature offset on the mesh node that skinning cancels,
    // so a geometry-box ground sinks the rendered mech into the floor.
    holder = new THREE.Group();
    holder.add(raw.scene);
    if (raw.entry.yawOffset) raw.scene.rotation.y = raw.entry.yawOffset * Math.PI / 180;
    const box = skinnedBox(raw.scene);
    const size = box.getSize(new THREE.Vector3());
    const k = 7 / Math.max(0.01, size.y);
    holder.scale.setScalar(k);
    holder.updateMatrixWorld(true);
    const b2 = skinnedBox(holder);
    const c = b2.getCenter(new THREE.Vector3());
    holder.position.set(-c.x, -b2.min.y, -c.z);
    scene.add(holder);
    texturedMat = mesh.material;
    boneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
    mesh.material = showTex ? texturedMat : boneMat;
    // Animation driver: same GLB, full rig + Animator, never added to the
    // scene. Built with skinOps stripped so it can't touch the shared cached
    // geometry the raw scene was cloned from (it only ever supplies poses).
    try {
      const built = await buildGlbForTool(ROSTER_BY_ID[id], { skinOps: [] }, { alt: altOn });
      if (built?.mech?.isGLB && built.mech.boneMap && built.mech.premadeAnimator) {
        animMech = built.mech;
        animBones = new Map();
        animMech.group.traverse((o) => { if (o.isBone) animBones.set(o.name, o); });
        jointOfBone = new Map();
        for (const [j, b] of Object.entries(animMech.boneMap)) if (b?.name) jointOfBone.set(b.name, j);
      }
    } catch (e) { console.warn('skintool: animation driver unavailable —', e); }
    // preload the mech's committed ops so Export is a full replacement
    ops = (raw.entry.skinOps || []).map((o) => ({ ...o }));
    applyAllOps();
    buildBoneList();
    setStatus(`${id.toUpperCase()} — ${liveAnalysis.comps.length} islands, ${bones.length} bones.` +
      `\nClick a wrong-colored patch to select it.`);
  }

  // ---- picking ----
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) return null;
    const f = hits[0].face;
    // pick the face vertex whose island is smallest — clicks near seams favor
    // the small (usually miscolored) patch the user is aiming at
    let best = null;
    for (const vi of [f.a, f.b, f.c]) {
      const comp = liveAnalysis.comps[liveAnalysis.compId[vi]];
      if (!best || comp.count < best.comp.count) best = { vi, comp };
    }
    return best;
  }

  // does the pointer event land on the mech at all? (any island)
  function rayHitsMesh(ev) {
    if (!mesh) return false;
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObject(mesh, false).length > 0;
  }
  // ...and specifically on the SOLO REGION (not the faded rest of the mech)?
  function rayHitsRegion(ev) {
    if (!mesh || !regionSet) return false;
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) return false;
    const f = hits[0].face;
    return regionSet.has(f.a) || regionSet.has(f.b) || regionSet.has(f.c);
  }

  // In paint mode, LEFT-drag paints only when it starts on the ACTIVE TARGET
  // (radius brush: the solo region · loop brush: anywhere on the mech);
  // grabbing anything else — faded geometry or empty space — orbits as normal,
  // so the model can be turned to reach the region's other sides. During the
  // pick phases every left-drag orbits (a clean <6px click still picks).
  // OrbitControls' own pointerdown listener registered first, so decide here on
  // window CAPTURE — it runs before target listeners — by flipping its LEFT
  // binding per press.
  window.addEventListener('pointerdown', (ev) => {
    if (!paintMode || ev.button !== 0 || ev.target !== renderer.domElement) return;
    let paints = false;
    if (paintPhase === 'paint') {
      paints = brushMode === 'loop' ? rayHitsMesh(ev) : rayHitsRegion(ev);
    }
    orbit.mouseButtons.LEFT = paints ? null : THREE.MOUSE.ROTATE;
  }, true);

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    ev._downX = ev.clientX; ev._downY = ev.clientY;
    renderer.domElement._down = { x: ev.clientX, y: ev.clientY };
    if (paintMode && paintPhase === 'paint') {
      if (brushMode === 'loop') {
        if (rayHitsMesh(ev)) {
          looping = true;
          loopPts = [{ x: ev.clientX, y: ev.clientY }];
          drawLoop();
        }
      } else if (rayHitsRegion(ev)) {
        painting = true; strokePushed = false;
        paintStroke(ev);
      }
    }
  });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (looping) { finishLoop(); return; }
    if (painting) {
      painting = false; strokePushed = false;
      // the stroke rewrote weights in place — refresh the island partition so
      // the painted patch is immediately its own pickable region
      liveAnalysis = analyzeSkin(mesh);
      return;
    }
    if (paintMode) {
      const dd = renderer.domElement._down;
      if (!dd || Math.hypot(ev.clientX - dd.x, ev.clientY - dd.y) > 6) return; // a drag (orbit)
      if (!mesh) return;
      if (paintPhase === 'pickBone') {
        // the clicked patch's CURRENT dominant bone becomes the paint color
        const h = pick(ev);
        if (h) {
          const b = bones[liveAnalysis.domBone[h.vi]];
          if (b) setPaintBone(b.name);
        }
      } else if (paintPhase === 'pickRegion') {
        const h = pick(ev);
        if (h) enterRegion(h.comp);
      }
      return;   // in paint mode, model clicks never do normal selection
    }
    const d = renderer.domElement._down;
    if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return; // it was a drag
    if (!mesh) return;
    const hit = pick(ev);
    if (!hit) return;
    if (mode === 'picktarget') {
      // rebind the selected island to the clicked point's CURRENT bone
      const targetBone = bones[liveAnalysis.domBone[hit.vi]];
      if (selComp && targetBone) addOp(selComp, targetBone.name);
      mode = 'select';
      updateModeUI();
      return;
    }
    selComp = hit.comp;
    setSelBone(bones[selComp.boneIndex]);   // clip list follows the island's bone
    stopWiggle();
    rebuildColors();
    if (bindOpen) openBindPanel();          // weight editor follows the selection
    setStatus(`Selected: island #${selComp.id} of ${selComp.boneName}` +
      `\n${selComp.count} verts · centroid [${selComp.centroid.map((v) => v.toFixed(2))}]` +
      `\nNow: "Rebind → click target" or pick a bone in the list.`);
  });

  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (looping) { loopPts.push({ x: ev.clientX, y: ev.clientY }); drawLoop(); return; }
    if (painting) { paintStroke(ev); return; }
    if (!mesh || ev.buttons) return;
    const hit = pick(ev);
    hoverInfo = hit ? `${hit.comp.boneName} · island ${hit.comp.id} · ${hit.comp.count}v` : '';
    hoverEl.textContent = hoverInfo;
  });

  function addOp(comp, toBone) {
    if (comp.boneName === toBone) { setStatus('That island already belongs to ' + toBone); return; }
    pushUndo();
    ops.push({ sel: selectorFor(comp), to: toBone });
    // CLOSE any live paint op: later strokes must append AFTER this rebind in
    // the ops list, or replay-order (game load) undoes them under it
    paintOp = null; paintSet = null;
    selComp = null;
    applyAllOps();
    setStatus(`Rebound island #${comp.id} (${comp.count}v) → ${toBone}`);
  }

  // Rebind the selected island 100% to ITS OWN dominant bone — a rigid
  // (weight 1.0) op strips any secondary-bone weights that island's verts
  // carry, so it stops following any other bone. Use when a patch is fine on
  // its own bone but rubber-blends toward a neighbour.
  function rebindSelfHard() {
    if (!selComp) { setStatus('Select an island first (click a patch).'); return; }
    const c = selComp;
    pushUndo();
    ops.push({ sel: selectorFor(c), to: c.boneName });
    paintOp = null; paintSet = null;   // close any live paint op (order matters on replay)
    selComp = null;
    applyAllOps();
    setStatus(`Island #${c.id} (${c.count}v) rebound 100% to ${c.boneName} — secondary weights removed.`);
  }

  // ================= BIND GEOMETRY (per-bone weight editor) =================
  // The selected island's CURRENT bindings, as numbers you can edit: one row
  // per bone that influences it, weight 0..1. Apply emits a manifest op —
  // { sel, to } when one bone survives, { sel, weights: {...} } when several —
  // so a shoulder pad can ride the torso 70% / arm 30% instead of snapping
  // rigidly to one bone. Exported with every other op.

  // Average weight per bone across an island's verts (what it's bound to NOW).
  function islandWeights(comp) {
    const jnt = mesh.geometry.attributes.skinIndex;
    const wgt = mesh.geometry.attributes.skinWeight;
    const sums = new Map();
    for (const v of comp.verts) {
      for (let k = 0; k < 4; k++) {
        const w = wgt.getComponent(v, k);
        if (w <= 0) continue;
        const name = bones[jnt.getComponent(v, k)]?.name;
        if (!name) continue;
        sums.set(name, (sums.get(name) || 0) + w);
      }
    }
    return [...sums.entries()]
      .map(([name, s]) => ({ name, w: s / comp.count }))
      .filter((r) => r.w >= 0.0005)
      .sort((a, b) => b.w - a.w);
  }

  let bindRows = [];          // [{name, w}] being edited
  let bindComp = null;        // island the rows describe

  function openBindPanel() {
    if (!selComp) { setStatus('Select an island first (click a patch), then Bind Geometry.'); return; }
    bindComp = selComp;
    bindRows = islandWeights(bindComp).map((r) => ({ name: r.name, w: +r.w.toFixed(3) }));
    if (!bindRows.length) bindRows = [{ name: bindComp.boneName, w: 1 }];
    bindOpen = true;
    renderBindPanel();
    setStatus(`Bind Geometry — island #${bindComp.id} (${bindComp.count}v).` +
      `\nEdit each bone's share, then Apply. Values are normalized (0.7/0.3 = 7/3).`);
  }
  function closeBindPanel() {
    bindOpen = false; bindComp = null; bindRows = [];
    renderBindPanel();
  }
  function toggleBindPanel() { bindOpen ? closeBindPanel() : openBindPanel(); }

  // Commit the edited rows as an op. One bone → the compact rigid form.
  function applyBind() {
    if (!bindComp) return;
    const live = bindRows.filter((r) => r.name && r.w > 0);
    if (!live.length) { setStatus('Every weight is 0 — give at least one bone a share.'); return; }
    if (live.length > 4) { setStatus('Max 4 bones per vertex (GPU limit) — remove some rows.'); return; }
    const c = bindComp;
    const sel = selectorFor(c);
    pushUndo();
    if (live.length === 1) {
      ops.push({ sel, to: live[0].name });
    } else {
      const sum = live.reduce((s, r) => s + r.w, 0);
      const weights = {};
      for (const r of live) weights[r.name] = +(r.w / sum).toFixed(4);
      ops.push({ sel, weights });
    }
    paintOp = null; paintSet = null;   // close any live paint op (replay order)
    selComp = null;
    applyAllOps();
    setStatus(`Island #${c.id} (${c.count}v) bound to ` +
      live.map((r) => `${r.name} ${(r.w * 100 / live.reduce((s, x) => s + x.w, 0)).toFixed(0)}%`).join(' · '));
    closeBindPanel();
  }

  // ================= PAINT MODE =================
  // Split one island across two bones: click a patch to pick a bone (the paint
  // color), click a region (the island — the rest fades), then brush-paint
  // sub-parts of that region onto the bone.
  // Painted verts become a { sel:{verts:[...]}, to } op — exportable + applied
  // at game load like every other op.
  function setOrbitPaintMode(on) {
    // free the LEFT button for the brush; rotate moves to RIGHT-drag
    orbit.mouseButtons = on
      ? { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  }
  function enterPaintMode() {
    paintMode = true; paintPhase = 'pickBone';
    paintBone = null; paintRegion = null; regionSet = null; regionWorld = null;
    paintOp = null; paintSet = null;
    selComp = null; stopWiggle(); mode = 'select'; updateModeUI();
    setOrbitPaintMode(true);
    updatePaintUI();
    setStatus('PAINT: click a patch on the model to choose the COLOR (its bone).' +
      '\n(The bone list on the left works as a palette too.)');
  }
  function exitPaintMode() {
    paintMode = false; paintPhase = 'off'; painting = false;
    clearLoop();
    paintBone = null; paintRegion = null; regionSet = null; regionWorld = null;
    paintOp = null; paintSet = null;
    setOrbitPaintMode(false);
    if (mesh) mesh.material = showTex ? texturedMat : boneMat;
    applyAllOps();               // restore the normal (opaque) bone-color view
    updatePaintUI();
    setStatus('Paint mode off.');
  }
  function setPaintBone(name) {
    paintBone = name;
    paintOp = null; paintSet = null;   // a bone change starts a fresh paint op
    // if a solo region is already active, go straight (back) to painting
    if (paintPhase === 'pickBone') paintPhase = regionSet ? 'paint' : 'pickRegion';
    updatePaintUI();
    setStatus(paintRegion
      ? `PAINT: now painting → ${name}. Left-drag over the region.`
      : `PAINT: color = ${name}. Now click the REGION to solo (others fade).`);
  }
  // skinned world position of a vertex (rest pose) — matches the raycast hit
  // space so the brush selects what's under the cursor
  function vertWorld(vi, out) {
    mesh.getVertexPosition(vi, out);
    return out.applyMatrix4(mesh.matrixWorld);
  }
  function enterRegion(comp) {
    paintRegion = comp;
    regionSet = new Set(comp.verts);
    regionWorld = new Map();
    mesh.updateMatrixWorld(true);
    for (const vi of comp.verts) regionWorld.set(vi, vertWorld(vi, new THREE.Vector3()));
    if (!paintMat) paintMat = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, roughness: 0.85, metalness: 0.05 });
    refreshPaintColors();
    mesh.material = paintMat;
    paintPhase = 'paint';
    paintOp = null; paintSet = null;
    updatePaintUI();
    setStatus(`PAINT: region #${comp.id} (${comp.count}v). Left-drag on the REGION = paint → ${paintBone}.` +
      `\nGrab anything else (faded mech or empty space) to orbit.`);
  }
  // RGBA vertex colors: region opaque in its live bone color, everything else
  // faded to PAINT_FADE alpha so the region stands out
  function refreshPaintColors() {
    const n = mesh.geometry.attributes.position.count;
    if (!paintColorAttr || paintColorAttr.count !== n) {
      paintColorAttr = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
    }
    for (let i = 0; i < n; i++) {
      const c = boneColor(liveAnalysis.domBone[i]);
      paintColorAttr.setXYZW(i, c.r, c.g, c.b, regionSet.has(i) ? 1 : PAINT_FADE);
    }
    mesh.geometry.setAttribute('color', paintColorAttr);
    paintColorAttr.needsUpdate = true;
  }
  function paintStroke(ev) {
    if (!regionSet || !paintBone) return;
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) return;
    const p = hits[0].point;
    const r2 = brushRadius * brushRadius;
    const hitVerts = [];
    for (const vi of regionSet) {
      if (paintSet && paintSet.has(vi)) continue;
      if (regionWorld.get(vi).distanceToSquared(p) <= r2) hitVerts.push(vi);
    }
    if (!hitVerts.length) return;
    if (!strokePushed) { pushUndo(); strokePushed = true; }
    paintVerts(hitVerts);
  }

  // apply the paint (weights + colors + live op) to a batch of region verts —
  // shared by the radius brush and the loop selector. Caller handles pushUndo.
  function paintVerts(hitVerts) {
    if (!paintOp || paintOp.to !== paintBone) {
      paintOp = { sel: { verts: [] }, to: paintBone }; ops.push(paintOp); paintSet = new Set();
    }
    const ti = bones.findIndex((b) => b.name === paintBone);
    const jnt = mesh.geometry.attributes.skinIndex;
    const wgt = mesh.geometry.attributes.skinWeight;
    const c = boneColor(ti);
    for (const vi of hitVerts) {
      paintSet.add(vi); paintOp.sel.verts.push(vi);
      jnt.setXYZW(vi, ti, 0, 0, 0); wgt.setXYZW(vi, 1, 0, 0, 0);
      paintColorAttr.setXYZW(vi, c.r, c.g, c.b, 1);
    }
    jnt.needsUpdate = true; wgt.needsUpdate = true; paintColorAttr.needsUpdate = true;
    renderOps();
  }

  // ---- loop selector ("magic loop"): lasso a screen region, paint the region
  // verts inside it. Exact polygon containment, no feathering; back-facing
  // verts are skipped so a tight loop doesn't bleed through to the far side.
  function drawLoop() {
    const r = renderer.domElement.getBoundingClientRect();
    if (!loopCanvas) {
      loopCanvas = document.createElement('canvas');
      loopCanvas.style.cssText = 'position:fixed;pointer-events:none;z-index:40';
      document.body.appendChild(loopCanvas);
    }
    loopCanvas.style.left = r.left + 'px'; loopCanvas.style.top = r.top + 'px';
    if (loopCanvas.width !== Math.round(r.width)) loopCanvas.width = Math.round(r.width);
    if (loopCanvas.height !== Math.round(r.height)) loopCanvas.height = Math.round(r.height);
    const ctx = loopCanvas.getContext('2d');
    ctx.clearRect(0, 0, loopCanvas.width, loopCanvas.height);
    if (loopPts.length < 2) return;
    ctx.strokeStyle = '#e88cff'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(loopPts[0].x - r.left, loopPts[0].y - r.top);
    for (const p of loopPts) ctx.lineTo(p.x - r.left, p.y - r.top);
    // closing edge back to the start so the user sees the area that will fill
    ctx.lineTo(loopPts[0].x - r.left, loopPts[0].y - r.top);
    ctx.stroke();
  }
  function clearLoop() {
    looping = false; loopPts = [];
    if (loopCanvas) loopCanvas.getContext('2d').clearRect(0, 0, loopCanvas.width, loopCanvas.height);
  }
  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function finishLoop() {
    const pts = loopPts;
    clearLoop();
    if (pts.length < 3 || !regionSet || !paintBone) return;
    const r = renderer.domElement.getBoundingClientRect();
    const nrm = mesh.geometry.attributes.normal;
    const nMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const camPos = camera.position;
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    const hitVerts = [];
    for (const vi of regionSet) {
      if (paintSet && paintSet.has(vi)) continue;
      const w = regionWorld.get(vi);
      // front-facing only (normal toward the camera)
      nv.set(nrm.getX(vi), nrm.getY(vi), nrm.getZ(vi)).applyMatrix3(nMat);
      if (nv.dot(v.copy(w).sub(camPos)) >= 0) continue;
      const p = v.copy(w).project(camera);
      if (p.z > 1) continue;   // behind the camera
      const sx = r.left + ((p.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - (p.y + 1) / 2)) * r.height;
      if (pointInPoly(sx, sy, pts)) hitVerts.push(vi);
    }
    if (!hitVerts.length) { setStatus('Loop caught 0 region verts — draw around visible region geometry.'); return; }
    pushUndo();
    paintVerts(hitVerts);
    liveAnalysis = analyzeSkin(mesh);
    setStatus(`Loop painted ${hitVerts.length}v → ${paintBone}.`);
  }

  // ---- bone wiggle (verify what moves) ----
  // Which of THIS MECH's clips move this bone?
  //
  // Two filters. First the mech: only clips it can actually play (mechclips.js)
  // — no point offering viper's slashes on colossus. Then the bone: a clip
  // animates canonical JOINTS, and the RigAdapter retargets each joint onto one
  // GLB bone, so we look at the joints for the bone ITSELF, its PARENT and its
  // GRANDPARENT — a parent bending is what stretches the skin across this
  // bone's region, so those clips matter here too. The skeleton ROOT is skipped:
  // nearly every clip moves it, which would match everything and tell you
  // nothing.
  const JOINT_TRACKS = { hips: ['hipsRot', 'hipsPos'] };   // hips is split in the clip data
  function clipsForBone(bone) {
    if (!bone || !animMech || !jointOfBone) return [];
    // walk up at most two levels, skipping the root bone
    const chain = [];
    let b = bone;
    for (let i = 0; i < 3 && b?.isBone; i++) {
      if (!isRootBone(b)) chain.push(b);
      b = b.parent;
    }
    const tracks = new Set();
    for (const cb of chain) {
      const joint = jointOfBone.get(cb.name);
      if (!joint) continue;
      for (const t of JOINT_TRACKS[joint] || [joint]) tracks.add(t);
    }
    if (!tracks.size) return [];
    const over = animMech.animProfile?.clipOverrides || {};
    const out = [];
    for (const c of mechClipList(ROSTER_BY_ID[curId], animMech.animProfile)) {
      const clip = over[c.name] || CLIPS[c.name];
      if (!clip?.tracks) continue;
      for (const t of tracks) if (clip.tracks[t]) { out.push(c); break; }
    }
    return out;
  }
  // the skeleton root: no bone parent (Tripo rigs hang theirs off an Armature
  // Object3D, so "parent isn't a bone" is the reliable test)
  function isRootBone(b) { return !b?.parent?.isBone; }
  // The sticky choice, honoured only when this bone actually has that clip.
  function activeClipChoice() {
    return preferredClip && clipOpts.some((c) => c.name === preferredClip) ? preferredClip : null;
  }
  // Point the clip dropdown at a bone (null clears it)
  function setSelBone(bone) {
    selBone = bone || null;
    clipOpts = clipsForBone(selBone);
    renderClipOptions();
  }

  function startWiggle(bone) {
    stopWiggle();
    if (bone !== selBone) setSelBone(bone);
    const clip = activeClipChoice();
    wiggle = { bone, orig: bone.quaternion.clone(), t: 0, clip };
    wigglePaused = false;
    if (clip) {
      // snapshot every raw bone: a real clip moves the whole body, not one bone
      clipRestore = bones.map((b) => b.quaternion.clone());
      animMech.premadeAnimator.play(clip, { speed: CLIP_SPEED });
      setStatus(`Playing "${clip}" on ${bone.name} at ${CLIP_SPEED * 100}% speed.`
        + `\nThe mech drops into its in-game stance while it runs. SPACE pauses · W stops.`);
    } else {
      setStatus(`Wiggling ${bone.name} — watch what moves. SPACE pauses · W stops.`);
    }
  }
  function stopWiggle() {
    if (wiggle) {
      if (wiggle.clip && clipRestore) {
        bones.forEach((b, i) => b.quaternion.copy(clipRestore[i]));
        if (animMech?.premadeAnimator) animMech.premadeAnimator.action = null;
      } else {
        wiggle.bone.quaternion.copy(wiggle.orig);
      }
      wiggle = null;
    }
    clipRestore = null;
    wigglePaused = false;
  }

  window.addEventListener('keydown', (ev) => {
    // undo/redo — Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
      ev.preventDefault();
      if (ev.shiftKey) redo(); else undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) {
      ev.preventDefault(); redo(); return;
    }
    if (ev.key === ' ') {
      // SPACE — freeze/unfreeze the wiggle so a stretched-out piece of
      // geometry holds still long enough to click
      if (wiggle) {
        ev.preventDefault();
        wigglePaused = !wigglePaused;
        setStatus(`Wiggle ${wigglePaused ? 'PAUSED — click the stretched geometry now' : 'resumed'} (${wiggle.bone.name}).`);
      }
      return;
    }
    if (ev.key === 'p' || ev.key === 'P') { paintMode ? exitPaintMode() : enterPaintMode(); return; }
    // in paint mode, swallow the other single-key tools (they'd fight the paint
    // material / selection); undo/redo/space/P above still work
    if (paintMode) { if (ev.key === 'Escape') exitPaintMode(); return; }
    if (ev.key === 't' || ev.key === 'T') {
      showTex = !showTex;
      if (mesh) mesh.material = showTex ? texturedMat : boneMat;
    } else if (ev.key === 'w' || ev.key === 'W') {
      if (wiggle) stopWiggle();
      else if (selComp) startWiggle(bones[selComp.boneIndex]);
    } else if (ev.key === 'b' || ev.key === 'B') {
      toggleBindPanel();
    } else if (ev.key === 'q' || ev.key === 'Q') {
      // same as clicking "Rebind → click target": toggle picktarget mode so you
      // can click a patch, W to wiggle, Q to rebind, then click the correct bone
      if (!selComp) { setStatus('Select an island first (click a patch).'); return; }
      mode = mode === 'picktarget' ? 'select' : 'picktarget';
      updateModeUI();
    } else if (ev.key === 'Escape') {
      selComp = null; mode = 'select'; stopWiggle(); setSelBone(null); rebuildColors(); updateModeUI();
    }
  });

  // ---- UI ----
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;top:10px;left:10px;z-index:50;font:12px/1.45 system-ui,sans-serif;
    color:#dfe8f5;background:rgba(14,18,26,0.94);border:1px solid #2c3648;border-radius:8px;
    padding:10px;width:270px;max-height:94vh;overflow:auto;user-select:none`;
  document.body.appendChild(panel);
  const panelUI = setupDevPanel(panel, { key: 'skin', workbench: 'skin' });

  const mechSel = document.createElement('select');
  mechSel.style.cssText = 'width:100%;margin-bottom:6px;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px';
  for (const id of glbIds) {
    const o = document.createElement('option'); o.value = id; o.textContent = id; mechSel.appendChild(o);
  }
  mechSel.value = curId;
  mechSel.onchange = () => load(mechSel.value);
  panel.appendChild(label('Mech'));
  panel.appendChild(mechSel);
  // rebuilt on every mech switch — the control only exists for mechs that
  // actually have an alternate
  const altSlot = document.createElement('div');
  panel.appendChild(altSlot);
  function refreshAltRow() {
    altSlot.textContent = '';
    const row = altCheckbox(altChoice(manifest, curId, altOn), reloadWithAlt);
    if (row) altSlot.appendChild(row);
  }
  refreshAltRow();

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin:4px 0';
  const rebindBtn = actionBtn('Rebind → click target (Q)', () => {
    if (!selComp) { setStatus('Select an island first (click a patch).'); return; }
    mode = mode === 'picktarget' ? 'select' : 'picktarget';
    updateModeUI();
  }, true);
  btnRow.appendChild(rebindBtn);
  panel.appendChild(btnRow);
  function updateModeUI() {
    rebindBtn.style.background = mode === 'picktarget' ? '#b0702b' : '#1f7a4d';
    rebindBtn.textContent = mode === 'picktarget' ? 'Click the CORRECT part…' : 'Rebind → click target (Q)';
  }

  const texRow = document.createElement('div');
  texRow.style.cssText = 'display:flex;gap:6px;margin:4px 0';
  texRow.appendChild(actionBtn('Colors/Textures (T)', () => {
    showTex = !showTex;
    if (mesh) mesh.material = showTex ? texturedMat : boneMat;
  }));
  texRow.appendChild(actionBtn('Wiggle bone (W)', () => {
    if (wiggle) stopWiggle();
    else if (selBone) startWiggle(selBone);
    else if (selComp) startWiggle(bones[selComp.boneIndex]);
    else setStatus('Select an island first, then Wiggle shows what its bone moves.');
  }));
  panel.appendChild(texRow);

  // ---- wiggle animation picker (per mech + per selected bone) ----
  panel.appendChild(label('Wiggle animation'));
  const clipSel = document.createElement('select');
  clipSel.style.cssText = 'width:100%;margin-bottom:2px;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px';
  // recompute right before the list drops open, so it always reflects the
  // mech + bone selected right now (ops can rebind an island under you)
  const refreshClips = () => { clipOpts = clipsForBone(selBone); renderClipOptions(); };
  clipSel.onmousedown = refreshClips;
  clipSel.onfocus = refreshClips;
  clipSel.onchange = () => {
    // '' = Default; picking it explicitly clears the sticky choice
    preferredClip = clipSel.value || null;
    if (wiggle) { const b = wiggle.bone; stopWiggle(); startWiggle(b); }   // restart under the new pick
    renderClipOptions();
  };
  panel.appendChild(clipSel);
  const clipNote = document.createElement('div');
  clipNote.style.cssText = 'color:#69788c;font-size:10px;margin-bottom:4px;line-height:1.4';
  panel.appendChild(clipNote);
  function renderClipOptions() {
    const chosen = activeClipChoice();
    clipSel.innerHTML = '';
    const mk = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; clipSel.appendChild(o); };
    mk('', 'Default (single-bone wiggle)');
    for (const c of clipOpts) mk(c.name, c.role ? `${c.name} — ${c.role}` : c.name);
    clipSel.value = chosen || '';
    clipSel.disabled = !selBone;
    if (!selBone) clipNote.textContent = 'Select an island or a bone to list its animations.';
    else if (!animMech) clipNote.textContent = 'Animation driver unavailable — Default only.';
    else if (!clipOpts.length) {
      clipNote.textContent = `No clip animates ${selBone.name}`
        + (jointOfBone?.get(selBone.name) ? '' : ' (no rig joint maps to it)') + ' — Default only.';
    } else {
      clipNote.textContent = `${clipOpts.length} of ${curId}'s clips move ${selBone.name} (or its parent/grandparent)`
        + (preferredClip && !clipOpts.some((c) => c.name === preferredClip)
          ? ` · "${preferredClip}" kept for bones that have it` : '');
    }
  }

  // ---- bind-geometry panel: edit the selected island's per-bone weights ----
  const bindBtn = actionBtn('Bind Geometry (B)', toggleBindPanel);
  panel.appendChild(bindBtn);
  const bindPanel = document.createElement('div');
  bindPanel.style.cssText = 'display:none;margin:4px 0;padding:7px;border:1px solid #2f5668;border-radius:6px;background:#0f1c22';
  panel.appendChild(bindPanel);
  function renderBindPanel() {
    bindBtn.style.background = bindOpen ? '#1f6d7a' : '#1a2433';
    bindBtn.style.color = bindOpen ? '#fff' : '#cfe0f5';
    bindPanel.style.display = bindOpen ? 'block' : 'none';
    bindPanel.innerHTML = '';
    if (!bindOpen || !bindComp) return;

    const head = document.createElement('div');
    head.style.cssText = 'font:11px ui-monospace,monospace;color:#9fdcf0;margin-bottom:5px';
    head.textContent = `island #${bindComp.id} · ${bindComp.count}v · owner ${bindComp.boneName}`;
    bindPanel.appendChild(head);

    bindRows.forEach((r, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:5px;align-items:center;margin:2px 0';
      const bi = bones.findIndex((b) => b.name === r.name);
      const sw = document.createElement('span');
      sw.style.cssText = `width:10px;height:10px;border-radius:2px;flex:none;background:#${boneColor(bi).getHexString()}`;
      const nm = document.createElement('span');
      nm.style.cssText = 'flex:1;font:11px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      nm.textContent = r.name;
      nm.title = r.name;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = '1'; inp.step = '0.05'; inp.value = String(r.w);
      inp.style.cssText = 'width:56px;background:#0b0f16;color:#8fe;border:1px solid #2c3648;border-radius:4px;padding:2px 4px;font:11px ui-monospace,monospace';
      inp.oninput = () => { r.w = Math.max(0, +inp.value || 0); updateBindTotal(); };
      const x = document.createElement('button');
      x.textContent = '✕';
      x.style.cssText = 'background:#3a2027;color:#ff9c9c;border:1px solid #553;border-radius:4px;cursor:pointer;font-size:10px;padding:1px 5px';
      x.onclick = () => { bindRows.splice(i, 1); renderBindPanel(); };
      row.append(sw, nm, inp, x);
      bindPanel.appendChild(row);
    });

    // add-a-bone picker (every bone in the skeleton, minus the rows already up)
    const add = document.createElement('select');
    add.style.cssText = 'width:100%;margin-top:4px;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:3px;font-size:11px';
    const mk = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; add.appendChild(o); };
    mk('', '＋ add bone…');
    for (const b of bones) if (!bindRows.some((r) => r.name === b.name)) mk(b.name, b.name);
    add.onchange = () => {
      if (!add.value) return;
      bindRows.push({ name: add.value, w: 0.25 });
      renderBindPanel();
    };
    bindPanel.appendChild(add);

    const total = document.createElement('div');
    total.style.cssText = 'color:#7d8ea3;font-size:10px;margin:4px 0 5px;line-height:1.4';
    bindPanel.appendChild(total);
    function updateBindTotal() {
      const live = bindRows.filter((r) => r.w > 0);
      const sum = live.reduce((s, r) => s + r.w, 0);
      total.textContent = live.length
        ? `${live.length} bone(s), total ${sum.toFixed(2)} → normalized ` +
          live.map((r) => `${(r.w / sum * 100).toFixed(0)}%`).join(' / ') +
          (live.length > 4 ? ' — TOO MANY (max 4)' : '')
        : 'all zero — nothing to apply';
      total.style.color = live.length > 4 ? '#ff9c9c' : '#7d8ea3';
    }
    updateBindTotal();

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
    row1.appendChild(actionBtn('100% own bone', () => {
      bindRows = [{ name: bindComp.boneName, w: 1 }];
      renderBindPanel();
    }));
    row1.appendChild(actionBtn('Even split', () => {
      const live = bindRows.filter((r) => r.w > 0);
      const share = live.length ? +(1 / live.length).toFixed(3) : 1;
      for (const r of bindRows) r.w = r.w > 0 ? share : 0;
      renderBindPanel();
    }));
    bindPanel.appendChild(row1);
    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:6px';
    row2.appendChild(actionBtn('Apply', applyBind, true));
    row2.appendChild(actionBtn('Cancel', closeBindPanel));
    bindPanel.appendChild(row2);
  }

  const histRow = document.createElement('div');
  histRow.style.cssText = 'display:flex;gap:6px;margin:4px 0';
  histRow.appendChild(actionBtn('↶ Undo (Ctrl+Z)', undo));
  histRow.appendChild(actionBtn('↷ Redo (Ctrl+Shift+Z)', redo));
  panel.appendChild(histRow);

  // ---- paint mode UI ----
  const paintBtn = actionBtn('Paint geometry (P)', () => { paintMode ? exitPaintMode() : enterPaintMode(); });
  panel.appendChild(paintBtn);
  const paintPanel = document.createElement('div');
  paintPanel.style.cssText = 'display:none;margin:4px 0;padding:7px;border:1px solid #4a3060;border-radius:6px;background:#191325';
  const paintInfo = document.createElement('div');
  paintInfo.style.cssText = 'font:11px ui-monospace,monospace;color:#d9c2ff;margin-bottom:5px';
  paintPanel.appendChild(paintInfo);
  const brushLbl = document.createElement('div');
  brushLbl.style.cssText = 'color:#7d8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin:2px 0';
  brushLbl.textContent = 'Brush size';
  paintPanel.appendChild(brushLbl);
  const brushRow = document.createElement('div');
  brushRow.style.cssText = 'display:flex;gap:6px;margin-bottom:5px';
  const brushBtns = [];
  for (const [lab, rad] of [['S', 0.15], ['M', 0.30], ['L', 0.55]]) {
    const b = actionBtn(lab, () => { brushMode = 'radius'; brushRadius = rad; updatePaintUI(); });
    b._r = rad; brushBtns.push(b); brushRow.appendChild(b);
  }
  {
    // magic loop: lasso an area on screen, paint every region vert inside it
    const b = actionBtn('Loop', () => {
      brushMode = 'loop'; updatePaintUI();
      setStatus('LOOP: left-drag on the mech to lasso an area — region verts inside it\nget painted on release. Drag empty space (or right-drag) to orbit.');
    });
    b._loop = true; brushBtns.push(b); brushRow.appendChild(b);
  }
  paintPanel.appendChild(brushRow);
  const repickRow = document.createElement('div');
  repickRow.style.cssText = 'display:flex;gap:6px';
  repickRow.appendChild(actionBtn('Change color', () => {
    if (!paintMode) return;
    paintPhase = 'pickBone';
    updatePaintUI();
    setStatus('PAINT: click a patch on the model to choose the new COLOR (its bone).');
  }));
  repickRow.appendChild(actionBtn('Change region', () => {
    if (!paintMode) return;
    paintPhase = 'pickRegion'; paintRegion = null; regionSet = null; regionWorld = null;
    paintOp = null; paintSet = null;
    if (mesh) mesh.material = showTex ? texturedMat : boneMat;
    applyAllOps();
    updatePaintUI();
    setStatus('PAINT: click the REGION to solo (others fade).');
  }));
  paintPanel.appendChild(repickRow);
  panel.appendChild(paintPanel);
  function updatePaintUI() {
    paintBtn.style.background = paintMode ? '#7a3fb0' : '#1a2433';
    paintBtn.style.color = paintMode ? '#fff' : '#cfe0f5';
    paintBtn.textContent = paintMode ? 'Painting — click to exit (P)' : 'Paint geometry (P)';
    paintPanel.style.display = paintMode ? 'block' : 'none';
    const phaseHint = { pickBone: 'click model = choose color', pickRegion: 'click model = solo region',
      paint: 'left-drag = paint' }[paintPhase] || '';
    paintInfo.innerHTML = '';
    if (paintBone) {
      const bi = bones.findIndex((b) => b.name === paintBone);
      const sw = document.createElement('span');
      sw.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;` +
        `vertical-align:-1px;background:#${boneColor(bi).getHexString()}`;
      paintInfo.appendChild(sw);
    }
    paintInfo.appendChild(document.createTextNode(
      `color: ${paintBone || '—'}  ·  region: ${paintRegion ? '#' + paintRegion.id : '—'}` +
      (phaseHint ? ` · ${phaseHint}` : '')));
    for (const b of brushBtns) {
      const active = b._loop ? brushMode === 'loop' : (brushMode === 'radius' && b._r === brushRadius);
      b.style.outline = active ? '2px solid #b98cff' : '';
    }
  }

  panel.appendChild(label('Ops (this session + committed)'));
  const opsEl = document.createElement('div');
  opsEl.style.cssText = 'margin-bottom:6px;max-height:150px;overflow:auto';
  panel.appendChild(opsEl);
  function renderOps() {
    opsEl.innerHTML = '';
    if (!ops.length) {
      const d = document.createElement('div');
      d.style.color = '#69788c'; d.textContent = '(none)';
      opsEl.appendChild(d);
      return;
    }
    ops.forEach((op, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:2px 0';
      const t = document.createElement('span');
      t.style.cssText = 'flex:1;font:11px ui-monospace,monospace;color:#9fdcc0';
      // ops without a `sel` are global weight-hygiene passes (purgeFar)
      if (op.purgeFar) {
        t.textContent = `purgeFar (strip far-hierarchy weights)`;
      } else if (op.purgePair) {
        t.textContent = `purgePair ${op.purgePair.join(' / ')}`;
      } else if (!op.sel) {
        t.textContent = JSON.stringify(op);
      } else if (op.weights) {
        const parts = Object.entries(op.weights).map(([b, w]) => `${b} ${Math.round(w * 100)}%`);
        const selTxt = op.sel.verts ? `${op.sel.verts.length}v` : `#${op.sel.comp}`;
        t.textContent = `${selTxt} → ${parts.join(' + ')}`;
      } else if (op.sel.verts) {
        t.textContent = `paint ${op.sel.verts.length}v → ${op.to}`;
      } else {
        const selTxt = op.sel.comp !== undefined && op.sel.bone === undefined
          ? `#${op.sel.comp}` : `${op.sel.bone}[${op.sel.comp ?? '*'}]`;
        t.textContent = `${selTxt} → ${op.to}`;
      }
      const x = document.createElement('button');
      x.textContent = '✕';
      x.style.cssText = 'background:#3a2027;color:#ff9c9c;border:1px solid #553;border-radius:4px;cursor:pointer;font-size:10px;padding:1px 6px';
      x.onclick = () => {
        pushUndo(); ops.splice(i, 1);
        paintOp = null; paintSet = null;   // the live paint op may be the one deleted
        applyAllOps();
        if (paintMode && regionSet) refreshPaintColors();
      };
      row.append(t, x);
      opsEl.appendChild(row);
    });
  }

  panel.appendChild(actionBtn('Export ops ▶', () => {
    // export compacted (superseded ops dropped) + one-op-per-line so pasting
    // into manifest.json doesn't re-grow the file the compactor just shrank
    // the ops belong to the entry they were painted on: nest them under
    // "alt" when the alternate build is loaded, or the patch would be pasted
    // onto the wrong model
    const json = altOn
      ? `{\n  "${curId}": {\n    "alt": {\n      "skinOps": ${skinOpsToJson(compactSkinOps(ops), '      ')}\n    }\n  }\n}`
      : `{\n  "${curId}": {\n    "skinOps": ${skinOpsToJson(compactSkinOps(ops), '    ')}\n  }\n}`;
    out.style.display = 'block';
    out.value = json;
    out.select();
    navigator.clipboard?.writeText(json).catch(() => {});
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skin-${curId}${altOn ? '-alt' : ''}.json`;
    a.click();
    setStatus('Ops copied + downloaded. Merge into manifest.json under "'
      + curId + (altOn ? '.alt' : '') + '".');
  }, true));

  const out = document.createElement('textarea');
  out.style.cssText = `width:100%;height:110px;margin-top:6px;background:#0b0f16;color:#8fe;border:1px solid #2c3648;
    font:11px/1.35 ui-monospace,monospace;display:none`;
  panel.appendChild(out);

  panel.appendChild(label('Bones (click = wiggle · dbl-click = rebind sel here)'));
  const boneList = document.createElement('div');
  boneList.style.cssText = 'max-height:230px;overflow:auto;font:11px ui-monospace,monospace';
  panel.appendChild(boneList);
  function buildBoneList() {
    boneList.innerHTML = '';
    const counts = new Map();
    for (const c of analysis.comps) counts.set(c.boneName, (counts.get(c.boneName) || 0) + c.count);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, cnt] of rows) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:1px 2px;cursor:pointer;border-radius:3px';
      const bi = bones.findIndex((b) => b.name === name);
      const sw = document.createElement('span');
      sw.style.cssText = `width:10px;height:10px;border-radius:2px;background:#${boneColor(bi).getHexString()};flex:none`;
      const t = document.createElement('span');
      t.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      t.textContent = name;
      const n = document.createElement('span');
      n.style.cssText = 'color:#69788c';
      n.textContent = cnt;
      row.append(sw, t, n);
      row.onmouseenter = () => { row.style.background = '#1a2433'; };
      row.onmouseleave = () => { row.style.background = ''; };
      row.onclick = () => {
        if (paintMode) { setPaintBone(name); return; }   // in paint mode the list is the color palette
        const b = bones[bi];
        if (!b) return;
        if (wiggle?.bone === b) { stopWiggle(); return; }
        setSelBone(b);          // list this bone's clips before starting
        startWiggle(b);
      };
      row.ondblclick = () => { if (!paintMode && selComp) addOp(selComp, name); };
      boneList.appendChild(row);
    }
  }

  const status = document.createElement('div');
  status.style.cssText = 'margin-top:8px;color:#9fb2c8;font-size:11px;min-height:3.6em;white-space:pre-line';
  panel.appendChild(status);
  function setStatus(s) { status.textContent = s; }

  const help = document.createElement('div');
  help.style.cssText = 'margin-top:6px;color:#69788c;font-size:10.5px;line-height:1.5';
  help.innerHTML = 'Colors = which bone owns each patch.<br>'
    + '1. Click a wrong-colored patch (selects it, turns white)<br>'
    + '2. “Rebind → click target” (Q), then click the part it should move with<br>'
    + '3. Wiggle (W) to verify · SPACE pauses a wiggle to click a stretched piece<br>'
    + '&nbsp;&nbsp;&nbsp;“Wiggle animation” swaps the shake for a real game clip that drives '
    + 'that bone, played at 10% speed.<br>'
    + '4. “Bind Geometry” (B) opens the selected patch’s bone weights as editable '
    + 'numbers — keep it 100% on one bone, or split it (e.g. torso 0.7 / shoulder 0.3). '
    + 'Apply writes an op that exports with the rest.<br>'
    + '5. “Paint geometry” (P): click a patch to pick the COLOR (its bone), click '
    + 'the REGION to solo it (others fade), then LEFT-drag on the region to paint '
    + 'it onto that bone — splits one island in two. Painted verts recolor live. '
    + 'Grabbing anything that isn’t the region (faded mech, empty space) orbits. '
    + 'The Loop brush lassos an area instead: drag a loop, region verts inside '
    + 'are painted exactly (front-facing only, no feathering).<br>'
    + 'Undo/redo: Ctrl+Z / Ctrl+Shift+Z · Export when happy.<br>'
    + 'Orbit: drag · Zoom: wheel · Pan: right-drag · Esc: deselect';
  panel.appendChild(help);

  const hoverEl = document.createElement('div');
  hoverEl.style.cssText = `position:fixed;right:12px;top:10px;z-index:50;color:#8fe8ff;
    font:12px ui-monospace,monospace;text-shadow:0 1px 2px #000;pointer-events:none`;
  document.body.appendChild(hoverEl);

  function label(t) { const d = document.createElement('div'); d.textContent = t;
    d.style.cssText = 'color:#7d8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin:6px 0 2px'; return d; }
  function actionBtn(text, fn, primary) { const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `flex:1;padding:6px;border-radius:5px;border:1px solid #2c3648;cursor:pointer;font-size:11px;width:100%;
      background:${primary ? '#1f7a4d' : '#1a2433'};color:${primary ? '#fff' : '#cfe0f5'}`;
    b.onclick = fn; return b; }

  await load(curId);
  updateModeUI();
  engine.onUpdate = (dt) => {
    orbit.update();
    if (wiggle && !wigglePaused) {
      if (wiggle.clip) {
        // drive the hidden rig with the real clip, then mirror its bone
        // rotations onto the raw skeleton we're actually rendering
        const an = animMech.premadeAnimator;
        if (!an.action || an.action.fadingOut) an.play(wiggle.clip, { speed: CLIP_SPEED });  // loop it
        an.update(dt);                       // ends in postAnimate -> adapter.sync()
        for (const b of bones) {
          const src = animBones.get(b.name);
          if (src) b.quaternion.copy(src.quaternion);
        }
      } else {
        wiggle.t += dt;
        const a = Math.sin(wiggle.t * 3.2) * 0.55;
        wiggle.bone.quaternion.copy(wiggle.orig)
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)));
      }
    }
  };
  engine.start();
  window.__skinTool = { engine, panel, get mesh() { return mesh; }, get ops() { return ops; }, get analysis() { return analysis; },
    get live() { return liveAnalysis; },
    addOp,
    addOpByComp: (cid, to) => { const c = analysis.comps[cid]; if (c) addOp(c, to); },
    selectComp: (cid) => { const c = analysis.comps[cid]; if (c) { selComp = c; rebuildColors(); } },
    bindSelfHard: rebindSelfHard, undo, redo, load, applyAllOps,
    // bind-geometry hooks (scripting / automated checks)
    bind: { open: openBindPanel, close: closeBindPanel, toggle: toggleBindPanel, apply: applyBind,
      set: (rows) => { bindRows = rows.map((r) => ({ ...r })); renderBindPanel(); },
      weightsOf: (cid) => { const c = liveAnalysis.comps[cid]; return c ? islandWeights(c) : null; },
      get state() { return { open: bindOpen, comp: bindComp?.id ?? null, rows: bindRows.map((r) => ({ ...r })) }; } },
    // wiggle-animation hooks (scripting / automated checks)
    anim: { setBone: setSelBone, start: startWiggle, stop: stopWiggle,
      clipsFor: (b) => clipsForBone(b).map((c) => c.name), clipDetail: clipsForBone, pick: (n) => { preferredClip = n || null; renderClipOptions(); },
      get state() {
        return { bone: selBone?.name || null, clips: clipOpts.map((c) => c.name),
          preferred: preferredClip, active: activeClipChoice(),
          running: wiggle ? (wiggle.clip || 'default') : null, driver: !!animMech };
      } },
    // paint-mode hooks (for testing/scripting)
    paint: { enter: enterPaintMode, exit: exitPaintMode, bone: setPaintBone,
      region: (cid) => { const c = liveAnalysis.comps[cid]; if (c) enterRegion(c); },
      strokeAt: (worldVec, bone) => {   // paint all region verts within brush of a world point
        if (bone) setPaintBone(bone);
        if (!regionSet || !paintBone) return 0;
        const r2 = brushRadius * brushRadius; const hitVerts = [];
        for (const vi of regionSet) { if (paintSet && paintSet.has(vi)) continue;
          if (regionWorld.get(vi).distanceToSquared(worldVec) <= r2) hitVerts.push(vi); }
        if (!hitVerts.length) return 0;
        if (!strokePushed) { pushUndo(); strokePushed = true; }
        if (!paintOp || paintOp.to !== paintBone) { paintOp = { sel: { verts: [] }, to: paintBone }; ops.push(paintOp); paintSet = new Set(); }
        const ti = bones.findIndex((b) => b.name === paintBone);
        const jnt = mesh.geometry.attributes.skinIndex, wgt = mesh.geometry.attributes.skinWeight, c = boneColor(ti);
        for (const vi of hitVerts) { paintSet.add(vi); paintOp.sel.verts.push(vi);
          jnt.setXYZW(vi, ti, 0, 0, 0); wgt.setXYZW(vi, 1, 0, 0, 0); paintColorAttr.setXYZW(vi, c.r, c.g, c.b, 1); }
        jnt.needsUpdate = wgt.needsUpdate = paintColorAttr.needsUpdate = true; strokePushed = false;
        liveAnalysis = analyzeSkin(mesh); renderOps();
        return hitVerts.length;
      },
      brush: (m) => { if (m === 'loop') brushMode = 'loop'; else { brushMode = 'radius'; if (typeof m === 'number') brushRadius = m; } updatePaintUI(); },
      get state() { return { paintMode, paintPhase, paintBone, region: paintRegion?.id, brushMode, brushRadius }; },
      get regionCentroidWorld() {
        if (!regionSet) return null;
        const v = new THREE.Vector3(); let n = 0;
        for (const vi of regionSet) { v.add(regionWorld.get(vi)); n++; }
        return n ? v.multiplyScalar(1 / n) : null;
      } } };
  return engine;
}
