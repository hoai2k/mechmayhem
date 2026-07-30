// /workbench/?edit=skin&mech=<id> — skin-repair workbench.
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
// PAINT GEOMETRY (P) splits one island across two bones by hand: pick the
// colour (a bone), solo a region, then paint it. Three brushes —
//   S/M/L  round brush, world-radius, follows the cursor over the region;
//   Loop   screen lasso; paints the region verts INSIDE it that face you;
//   Slice  the same lasso, cutting THROUGH the model — near side, far side and
//          anything buried between, so geometry you can't see (and would have
//          to orbit around) is reachable in one stroke.
//
// Controls: orbit = drag · zoom = wheel · pan = right-drag
//   click patch = select island · T = textures on/off · W = wiggle bone
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { altChoice, altCheckbox, reloadWithVariant } from '../ui/variantpick.js';
import { subjectSelect } from '../ui/subjectpick.js';
import { setupDevPanel } from '../ui/panel.js';
import { wireExportChanges } from '../ui/save.js';
import { prepareMesh, poseMatrices, skinVertices, edgeLengths, scoreEdge, DEFAULTS } from './stretchscan.js';

const CLIP_SPEED = 0.1;   // real game clips run at 10% so deformation is readable

export async function runSkinWorkbench(config, params) {
  const startId = params.get('mech') || params.get('id');
  // everything game-shaped comes from the contract, nothing from src/
  const {
    analyze: analyzeSkin, apply: applySkinOps, compact: compactSkinOps, toJson: skinOpsToJson,
    blendPatch, weldedAdjacency, enclaveScan,
  } = config.skin;
  const skinnedBox = config.geometry.skinnedBox;
  const engine = config.stage.engine();
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

  const manifest = config.manifest();
  const glbIds = config.catalogue.list().filter((c) => c.hasModel).map((c) => c.id);
  let curId = (startId && manifest[startId]?.url) ? startId : (glbIds[0] || config.catalogue.list()[0].id);
  // ?alt=1 edits the manifest's `alt` entry — a second model (aegis, jerry) or
  // the same model on a staged custom rig (rhino, inferno). The panel's "Edit
  // Alternate GLB" box drives it; skinOps belong to whichever entry is loaded,
  // which is why the export below writes into `alt` when one is.
  const wantAlt = new URLSearchParams(location.search).get('alt') === '1';
  // per-mech, because the dropdown switches mechs without a reload and most
  // mechs have no alternate at all
  let altOn = wantAlt && !!manifest[curId]?.alt?.url;
  // MANNEQUIN REFERENCE: not a mech at all — the reference humanoid
  // (src/mechs/mannequin.js) loaded through the same path, so this tool paints
  // it with the same bone colours it paints a mech with. That is the point: it
  // is what a REPAIRED bind looks like — one contiguous region per bone, seams
  // at the joints, a narrow blend band across each one, no enclaves and no
  // strays. Read-only (there is no manifest entry to save to).
  let mannOn = new URLSearchParams(location.search).get('ref') === 'mannequin';
  // …and the mannequin can be the SUBJECT too (it sits at the bottom of the mech
  // list). Either way this view is read-only: there is no manifest entry behind it.
  const refSubject = () => (config.catalogue.reference?.() || []).includes(curId);
  const onReference = () => mannOn || refSubject();

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
  // the deformation model (edges whose ends are weighted differently), built on
  // demand for "Debug output" and dropped whenever the mesh changes
  let stretchPrep = null;
  // ---- seam-cut preview ----
  // A READ-ONLY view of what the GAME renders. This workbench authors weights
  // on the raw file, where a seam cut has not happened yet, so a wiggle here
  // reports welds the game has already separated. Toggling this on swaps a CUT
  // copy of the current geometry (live ops included) in for the editable one,
  // which is the only way to answer "does any torso geometry move when I move
  // an arm" in the tool where you are asking it. Editing is blocked while it is
  // on: the cut adds vertices, so island ids and vertex ids no longer mean what
  // an op selector means.
  let cutView = false;
  let editGeo = null;        // the editable geometry, parked while previewing
  let cutInfo = null;        // what the cut did, for the status line
  let seamCuts = [];         // this entry's rules
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
  // radius = round brush · loop = screen lasso, front faces only ·
  // slice = the same lasso cutting clean through the model (see finishLoop)
  let brushMode = 'radius';
  let looping = false;       // left button held, drawing the lasso
  let loopPts = [];          // lasso polygon, client coords
  let loopCanvas = null;     // 2D overlay the lasso is drawn on
  // both lasso brushes share every bit of machinery except one facing test
  const isLasso = () => brushMode === 'loop' || brushMode === 'slice';
  const PAINT_FADE = 0.12;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const _vp = new THREE.Vector3();

  const boneColor = (bi) => new THREE.Color().setHSL(((bi * 137.508) % 360) / 360, 0.8, 0.42);

  function rebuildColors() {
    // the seam-cut preview owns its own colours (colorByBone): the analysis
    // behind these is sized for the editable mesh, not the cut one
    if (cutView) return;
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
    if (blockedByCutView()) return;
    if (!undoStack.length) { setStatus('Nothing to undo.'); return; }
    redoStack.push(snapshotOps());
    ops = undoStack.pop();
    selComp = null; stopWiggle();
    paintOp = null; paintSet = null;   // live paint op is now detached from ops
    afterHistory();
    setStatus(`Undo · ${ops.length} op(s).`);
  }
  function redo() {
    if (blockedByCutView()) return;
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
    panelUI.setSubtitle(onReference() ? 'MANNEQUIN reference (read-only)' : `${id}${altOn ? ' · ALT' : ''}`);
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
    stretchPrep = null;
    selBone = null; clipOpts = []; clipRestore = null;   // preferredClip is sticky across mechs
    // reset paint mode for the new mesh (indices/islands differ per mech)
    paintMode = false; paintPhase = 'off'; painting = false;
    paintBone = null; paintRegion = null; regionSet = null; regionWorld = null;
    paintOp = null; paintSet = null; paintColorAttr = null;
    bindOpen = false; bindComp = null; bindRows = [];
    setOrbitPaintMode(false); updatePaintUI();
    const raw = await config.variants.raw(id, { variant: (mannOn || refSubject()) ? 'mannequin' : altOn ? 'alt' : 'glb' });
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
    // the mannequin has no manifest entry behind it — hence the optional chain
    if (raw.entry?.yawOffset) raw.scene.rotation.y = raw.entry.yawOffset * Math.PI / 180;
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
      if (onReference()) throw new Error('mannequin reference: static');
      const built = await config.variants.build(id, { variant: altOn ? 'alt' : 'glb', overrides: { skinOps: [] } });
      if (built?.isGLB && built.boneMap && built.premadeAnimator) {
        animMech = built;
        animBones = new Map();
        animMech.group.traverse((o) => { if (o.isBone) animBones.set(o.name, o); });
        jointOfBone = new Map();
        for (const [j, b] of Object.entries(animMech.boneMap)) if (b?.name) jointOfBone.set(b.name, j);
      }
    } catch (e) { console.warn('skintool: animation driver unavailable —', e); }
    const cuts = raw.entry?.seamCuts || [];
    seamCuts = cuts;
    cutView = false; editGeo = null; cutInfo = null;
    cutChk.checked = false;
    cutRow.style.display = cuts.length ? 'flex' : 'none';
    seamNote.style.display = cuts.length ? 'block' : 'none';
    if (cuts.length) {
      seamNote.textContent = `${cuts.length} seam cut${cuts.length > 1 ? 's' : ''} NOT applied here: `
        + cuts.map((c) => `${(c.a || []).join('/')} ↔ ${(c.b || []).join('/')}`).join(', ')
        + '. The game separates that geometry after skinOps; in this view it is still joined, '
        + 'so it will still stretch when you wiggle. Judge a cut in Skin Debug (chevron above).';
    }
    // preload the mech's committed ops so Export is a full replacement
    ops = (raw.entry?.skinOps || []).map((o) => ({ ...o }));
    applyAllOps();
    updateCutUI();
    buildBoneList();
    refreshMannRow();
    if (onReference()) {
      setStatus(`MANNEQUIN REFERENCE — ${liveAnalysis.comps.length} islands, ${bones.length} bones.`
        + '\nThis is the target: ONE island per bone, seams at the joints, a narrow'
        + '\nblend band across each. Nothing here can be saved — untick to go back'
        + (mannOn ? `\nto ${id.toUpperCase()}.` : '\nPick a mech above to go back to real geometry.'));
    } else {
      setStatus(`${id.toUpperCase()} — ${liveAnalysis.comps.length} islands, ${bones.length} bones.` +
        `\nClick a wrong-colored patch to select it.`);
    }
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
    // ...and the vertex actually UNDER the cursor, which is what a blend-patch
    // flood fill must start from (the smallest-island rule would seed the fill
    // in the wrong region near a seam)
    if (best) {
      const p = hits[0].point;
      let near = f.a, nd = Infinity;
      for (const vi of [f.a, f.b, f.c]) {
        mesh.getVertexPosition(vi, _vp);
        const d = _vp.applyMatrix4(mesh.matrixWorld).distanceToSquared(p);
        if (d < nd) { nd = d; near = vi; }
      }
      best.nearVi = near;
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
      paints = isLasso() ? rayHitsMesh(ev) : rayHitsRegion(ev);
    }
    orbit.mouseButtons.LEFT = paints ? null : THREE.MOUSE.ROTATE;
  }, true);

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    ev._downX = ev.clientX; ev._downY = ev.clientY;
    renderer.domElement._down = { x: ev.clientX, y: ev.clientY };
    if (paintMode && paintPhase === 'paint') {
      if (isLasso()) {
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
    if (cutView) {
      // picking addresses islands of the EDITABLE mesh; the preview's vertices
      // are a different set, so a click here would select the wrong geometry
      setStatus('Read-only preview — click is off. Wiggle (W) and "What moves?" (M) still work.');
      return;
    }
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
    if (ev.shiftKey) { selectBlendPatch(hit.nearVi ?? hit.vi); return; }
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
    hoverInfo = hit ? `${hit.comp.boneName} · island ${hit.comp.id} · ${hit.comp.count}v · shift-click = blend patch` : '';
    hoverEl.textContent = hoverInfo;
  });

  // Is every vertex of `verts` ALREADY rigid (weight 1) on `boneName`? The old
  // guard here refused any rebind whose target matched the island's dominant
  // bone — but "dominant" is not "only": a torso island carrying a minority
  // shoulderR weight wiggles with the arm, and rebinding it to torso is exactly
  // the fix. So the refusal now tests what the op would actually change.
  function alreadyRigidOn(verts, boneName) {
    const ti = bones.findIndex((b) => b.name === boneName);
    if (ti < 0) return false;
    const jnt = mesh.geometry.attributes.skinIndex;
    const wgt = mesh.geometry.attributes.skinWeight;
    for (const v of verts) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (jnt.getComponent(v, k) === ti) w += wgt.getComponent(v, k);
      if (w < 0.999) return false;
    }
    return true;
  }

  function addOp(comp, toBone) {
    if (blockedByCutView()) return;
    if (alreadyRigidOn(comp.verts, toBone)) {
      setStatus(`Already 100% on ${toBone} — nothing to change.`);
      return;
    }
    pushUndo();
    ops.push({ sel: selectorFor(comp), to: toBone });
    // CLOSE any live paint op: later strokes must append AFTER this rebind in
    // the ops list, or replay-order (game load) undoes them under it
    paintOp = null; paintSet = null;
    selComp = null;
    applyAllOps();
    setStatus(`Rebound ${comp.id != null ? `island #${comp.id}` : `patch`} (${comp.count}v) → ${toBone}`);
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
    setStatus(`${c.id != null ? `Island #${c.id}` : `Patch`} (${c.count}v) rebound 100% to ${c.boneName} — secondary weights removed.`);
  }

  // ================= BLEND PATCH (shift-click) =================
  // "Part of the torso wiggles with shoulderR, but not all of it." That region
  // is INSIDE the torso island — analyzeSkin partitions by dominant bone, so it
  // has no island of its own and clicking selects the whole chest. Shift-click
  // floods out from the clicked vertex across the geometry that shares its
  // dominant bone AND its minority influence (skinops.blendPatch), which is
  // precisely the wiggling region and stops where the arm takes over. It then
  // behaves like any other selection: rebind it, or open Bind Geometry on it.
  function patchPseudoComp(res) {
    const c = { id: null, patch: true, verts: res.verts, count: res.verts.length,
      boneIndex: res.dom, boneName: res.domName, foreign: res.foreignName, avgW: res.avgW,
      centroid: [0, 0, 0] };
    const pos = mesh.geometry.attributes.position;
    for (const v of res.verts) { c.centroid[0] += pos.getX(v); c.centroid[1] += pos.getY(v); c.centroid[2] += pos.getZ(v); }
    c.centroid = c.centroid.map((x) => x / Math.max(1, c.count));
    return c;
  }
  function selectBlendPatch(vi, foreign = null) {
    const res = blendPatch(mesh, vi, { foreign, adjacency: weldedAdjacency(mesh) });
    if (!res.verts.length) {
      setStatus(`That vertex is rigid on ${res.domName} — no secondary weight to isolate.` +
        `\n(Shift-click only finds a patch where geometry is SHARED between bones.)`);
      return null;
    }
    selComp = patchPseudoComp(res);
    setSelBone(bones[res.dom]);
    stopWiggle();
    rebuildColors();
    if (bindOpen) openBindPanel();
    setStatus(`Blend patch: ${res.verts.length}v of ${res.domName} also weighted to ` +
      `${res.foreignName} (avg ${res.avgW.toFixed(2)}).` +
      `\nB / "Bind Geometry" → 100% own bone, or rebind it anywhere.`);
    return selComp;
  }

  // ================= ABSORB ENCLAVES =================
  // The bulk version of the same idea, one level up: an island bound to a limb
  // bone but sitting INSIDE another bone's region — a knuckle on a thigh, a hip
  // plate on a forearm — is almost never intentional on a rigid mech. skinops'
  // enclaveScan finds every island whose BOUNDARY is mostly one other bone and
  // hands the surrounding bone the patch, iterating until nothing moves (one
  // dissolved enclave can expose another).
  function absorbEnclaves() {
    if (blockedByCutView()) return;
    if (!mesh) return;
    const { ops: found, report } = enclaveScan(mesh, analysis);
    if (!found.length) {
      setStatus('No enclaves found — every island is already bound to what surrounds it.');
      return;
    }
    pushUndo();
    ops.push(...found);
    paintOp = null; paintSet = null;      // replay order: strokes must come after
    selComp = null;
    applyAllOps();
    const lines = report.slice(0, 4).map((r2) =>
      `#${r2.island} ${r2.from} → ${r2.to} (${r2.count}v, ${Math.round(r2.surround * 100)}% surrounded)`);
    setStatus(`Absorbed ${found.length} enclave(s):\n` + lines.join('\n') +
      (report.length > 4 ? `\n…+${report.length - 4} more (see the ops list)` : ''));
    console.info('[skintool] enclaves absorbed:', report);
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
    setStatus(`Bind Geometry — ${bindComp.id != null ? `island #${bindComp.id}` : 'blend patch'} (${bindComp.count}v).` +
      `\nEdit each bone's share, then Apply. Values are normalized (0.7/0.3 = 7/3).`);
  }
  function closeBindPanel() {
    bindOpen = false; bindComp = null; bindRows = [];
    renderBindPanel();
  }
  function toggleBindPanel() { if (blockedByCutView()) return; bindOpen ? closeBindPanel() : openBindPanel(); }

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
    setStatus(`${c.id != null ? `Island #${c.id}` : 'Patch'} (${c.count}v) bound to ` +
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
    if (blockedByCutView()) return;
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

  // ---- lasso selectors: draw a screen region, paint the region verts inside
  // it. Exact polygon containment, no feathering. The two modes differ by ONE
  // test:
  //   LOOP  skips back-facing verts, so a tight lasso paints the surface you
  //         are looking at and does not bleed through to the far side;
  //   SLICE keeps them, so the lasso cuts clean through the model and takes
  //         everything of the region within it — the near shell, the far shell
  //         and whatever is buried between them. That is the only way to
  //         re-colour a part you cannot see without orbiting to it (inside a
  //         shoulder housing, the back of a hip block), and the reason it is a
  //         separate button rather than a modifier: painting through the model
  //         is destructive in a way you should have to ask for.
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
    // slice draws amber, loop violet — while you're mid-drag the colour of the
    // line is the only reminder of whether this cut goes through the far side
    ctx.strokeStyle = brushMode === 'slice' ? '#ffc36b' : '#e88cff';
    ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
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
    const slice = brushMode === 'slice';
    const what = slice ? 'Slice' : 'Loop';
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
      // LOOP: front-facing only (normal toward the camera). SLICE keeps every
      // facing, which is the whole point — it cuts through.
      if (!slice) {
        nv.set(nrm.getX(vi), nrm.getY(vi), nrm.getZ(vi)).applyMatrix3(nMat);
        if (nv.dot(v.copy(w).sub(camPos)) >= 0) continue;
      }
      const p = v.copy(w).project(camera);
      if (p.z > 1) continue;   // behind the camera
      const sx = r.left + ((p.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - (p.y + 1) / 2)) * r.height;
      if (pointInPoly(sx, sy, pts)) hitVerts.push(vi);
    }
    if (!hitVerts.length) {
      setStatus(`${what} caught 0 region verts — draw around ${slice ? '' : 'visible '}region geometry.`);
      return;
    }
    pushUndo();
    paintVerts(hitVerts);
    liveAnalysis = analyzeSkin(mesh);
    setStatus(`${what} painted ${hitVerts.length}v → ${paintBone}` +
      `${slice ? ' (through the model — both sides)' : ''}.`);
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
    const out = [];
    for (const c of config.anim.clipsFor(curId, animMech)) {
      const clip = config.anim.clip(c.name, animMech);
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
    if (ev.key === 'm' || ev.key === 'M') { reportMoves(); return; }
    if (ev.key === 'p' || ev.key === 'P') {
      if (blockedByCutView()) return;
      paintMode ? exitPaintMode() : enterPaintMode(); return;
    }
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
    } else if (ev.key === 'e' || ev.key === 'E') {
      absorbEnclaves();
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

  // through subjectSelect so the ordering rule (alphabetical, work-in-progress
  // mechs under a rule at the end) lives in one place; `label` keeps this
  // tool's bare-id text rather than the display name.
  const mechSel = subjectSelect({
    config,
    ids: glbIds,
    value: curId,
    label: (id) => id,
    css: 'width:100%;margin-bottom:6px;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px',
    onPick: (id) => load(id),
  });
  panel.appendChild(label('Mech'));
  panel.appendChild(mechSel);
  // rebuilt on every mech switch — the control only exists for mechs that
  // actually have an alternate
  const altSlot = document.createElement('div');
  panel.appendChild(altSlot);
  // WHAT THIS VIEW IS NOT. The workbench renders the RAW file with skinOps and
  // nothing else, because that is what it edits — a vertex id here is the
  // file's own numbering, which is what an op selector means. A SEAM CUT
  // (seamcut.js) is applied later, when the GAME builds the mech, so geometry
  // the game has already separated is still joined in here and still stretches
  // in here. Unsaid, that makes the tool lie: wiggling jerry's elbow swings his
  // hand, and the hand is still welded to the torso in this view alone.
  const seamNote = document.createElement('div');
  seamNote.style.cssText = `display:none;margin:2px 0 6px;padding:6px 8px;border-radius:5px;
    background:#241d10;border:1px solid #5a4a2a;color:#ffcc66;font-size:10.5px;line-height:1.45`;
  panel.appendChild(seamNote);
  // the preview toggle lives with the warning it answers
  const cutRow = document.createElement('label');
  cutRow.style.cssText = 'display:none;gap:6px;align-items:center;margin:0 0 6px;font-size:11px;cursor:pointer';
  const cutChk = document.createElement('input');
  cutChk.type = 'checkbox';
  cutChk.onchange = () => setCutView(cutChk.checked);
  cutRow.append(cutChk, document.createTextNode(' View with seam cuts (read-only)'));
  cutRow.title = 'Swap in the geometry the GAME builds — welds already cut, weights unblended. '
    + 'Editing is off while this is on, because the cut renumbers vertices and islands.';
  panel.appendChild(cutRow);
  // "what should this look like?" — the reference bind, one click away
  const mannRow = document.createElement('label');
  mannRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin:0 0 6px;font-size:11px;cursor:pointer';
  const mannChk = document.createElement('input');
  mannChk.type = 'checkbox';
  mannChk.checked = mannOn;
  mannChk.onchange = () => {
    mannOn = mannChk.checked;
    const u = new URL(location.href);
    if (mannOn) u.searchParams.set('ref', 'mannequin'); else u.searchParams.delete('ref');
    history.replaceState(null, '', u);
    load(curId);
  };
  mannRow.append(mannChk, document.createTextNode(' Mannequin reference'));
  mannRow.title = 'Swap the mech for the REFERENCE humanoid and look at its colours: one '
    + 'contiguous island per bone, the seam at each joint, a narrow blend band across it. That '
    + 'is the layout a repaired mech should end up with — read-only, nothing to save.';
  panel.appendChild(mannRow);
  // The buttons that WRITE are built further down the panel, so they register
  // themselves here and this runs again once they exist (and on every load).
  const writeBtns = [];
  function refreshMannRow() {
    mannChk.checked = mannOn;
    mannRow.style.display = refSubject() ? 'none' : 'flex';   // already ON it
    const ro = onReference();
    for (const b of writeBtns) {
      b.disabled = ro;
      b.style.opacity = ro ? 0.45 : 1;
      b.title = ro ? 'The mannequin is a reference — there is no manifest entry to save to.' : '';
    }
  }
  function refreshAltRow() {
    altSlot.textContent = '';
    const row = altCheckbox(altChoice(manifest, curId, altOn), reloadWithVariant);
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
  // Everything that WRITES is off while the preview is up. Not cosmetic: the
  // cut geometry has extra vertices, so a selection, a paint stroke or a rebind
  // would be addressing vertices that do not exist in the file being edited.
  const EDIT_BTN = /Rebind|Paint geometry|Bind Geometry|Absorb enclaves|Undo|Redo/;
  function updateCutUI() {
    for (const b of panel.querySelectorAll('button')) {
      if (!EDIT_BTN.test(b.textContent)) continue;
      b.disabled = cutView;
      b.style.opacity = cutView ? '0.4' : '1';
      b.style.cursor = cutView ? 'not-allowed' : 'pointer';
    }
    seamNote.style.borderColor = cutView ? '#2f6d3a' : '#5a4a2a';
    seamNote.style.background = cutView ? '#10210f' : '#241d10';
    seamNote.style.color = cutView ? '#7fdca0' : '#ffcc66';
    if (cutView) {
      seamNote.textContent = 'PREVIEWING the game build: seam cuts applied, editing off. '
        + 'Wiggle a bone (W) and press "What moves?" (M) to see exactly which bones\' geometry follows it.';
    } else if (seamCuts.length) {
      seamNote.textContent = `${seamCuts.length} seam cut${seamCuts.length > 1 ? 's' : ''} NOT applied here: `
        + seamCuts.map((c) => `${(c.a || []).join('/')} ↔ ${(c.b || []).join('/')}`).join(', ')
        + '. Tick the box above to preview the geometry the game actually builds.';
    }
  }
  // a write attempted while previewing: say why rather than doing nothing
  function blockedByCutView() {
    if (!cutView) return false;
    setStatus('Read-only: the seam-cut preview is on. Untick "View with seam cuts" to edit.');
    return true;
  }

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
  texRow.appendChild(actionBtn('What moves? (M)', reportMoves));
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
  panel.appendChild(actionBtn('Absorb enclaves (E)', absorbEnclaves));
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
    head.textContent = (bindComp.id != null ? `island #${bindComp.id}` : `blend patch → ${bindComp.foreign || '?'}`)
      + ` · ${bindComp.count}v · owner ${bindComp.boneName}`;
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
  brushRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:5px';
  const brushBtns = [];
  for (const [lab, rad] of [['S', 0.15], ['M', 0.30], ['L', 0.55]]) {
    const b = actionBtn(lab, () => { brushMode = 'radius'; brushRadius = rad; updatePaintUI(); });
    b._r = rad; brushBtns.push(b); brushRow.appendChild(b);
  }
  // the two lassos: LOOP takes the surface you can see, SLICE cuts through
  for (const [lab, mode, hint] of [
    ['Loop', 'loop',
      'LOOP: left-drag on the mech to lasso an area — the region verts you can SEE\ninside it get painted on release. Drag empty space (or right-drag) to orbit.'],
    ['Slice', 'slice',
      'SLICE: same lasso, but it cuts THROUGH the model — every region vert inside\nthe outline is painted, near side, far side and anything buried between.\nUse it to reach geometry you would otherwise have to orbit around.'],
  ]) {
    const b = actionBtn(lab, () => { brushMode = mode; updatePaintUI(); setStatus(hint); });
    b._mode = mode; brushBtns.push(b); brushRow.appendChild(b);
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
      paint: brushMode === 'slice' ? 'left-drag = slice through'
        : brushMode === 'loop' ? 'left-drag = lasso'
          : 'left-drag = paint' }[paintPhase] || '';
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
      const active = b._mode ? brushMode === b._mode : (brushMode === 'radius' && b._r === brushRadius);
      b.style.outline = active ? `2px solid ${b._mode === 'slice' ? '#ffc36b' : '#b98cff'}` : '';
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

  // ================= SEAM-CUT PREVIEW =================
  // Colour ANY geometry by dominant bone, with the same hue per bone the
  // editable view uses — the cut geometry has its own vertex count, so it
  // cannot borrow the analysis-driven colours.
  function colorByBone(geo) {
    const n = geo.attributes.position.count;
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let bw = -1, bi = 0;
      for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > bw) { bw = x; bi = si.getComponent(i, k); } }
      const c = boneColor(bi);
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }

  function setCutView(on) {
    if (!mesh) return;
    if (on && !seamCuts.length) { setStatus('This mech has no seam cuts to preview.'); cutChk.checked = false; return; }
    if (on === cutView) return;
    if (on) {
      // cut a COPY of what is on screen, so the preview includes this session's
      // unsaved ops — you are seeing your own edits as the game would build them
      editGeo = mesh.geometry;
      const cut = editGeo.clone();
      cut.userData = { ...cut.userData };
      delete cut.userData.seamCut;
      mesh.geometry = cut;
      cutInfo = config.skin.applySeamCuts(mesh, seamCuts);
      colorByBone(cut);
      cutView = true;
      stretchPrep = null;                 // the measurement must follow the geometry
      const r = cutInfo?.rules?.[0];
      setStatus(`SEAM-CUT PREVIEW — read-only.\n`
        + (r ? `${r.bridgeTris} welded triangle(s) split, ${r.duplicated} vertex copies, ${r.capTris} lid triangle(s).\n` : 'no welded triangles to split.\n')
        + `Wiggle a bone and watch: geometry the cut separated no longer follows it.`);
    } else {
      mesh.geometry.dispose();
      mesh.geometry = editGeo;
      editGeo = null; cutView = false; cutInfo = null;
      stretchPrep = null;
      rebuildColors();
      setStatus('Back to the editable raw mesh (seam cuts not applied).');
    }
    updateCutUI();
  }

  // WHAT ACTUALLY MOVES. The question behind the whole preview: when this bone
  // turns, which geometry follows it? Measured, not squinted at — every vertex
  // is skinned at the current pose and compared with its bind position, then
  // tallied by the bone it is bound to. "torso 0/6593" is the answer you want
  // after cutting an arm free of the body.
  function whatMoves() {
    if (!mesh) return null;
    holder?.updateMatrixWorld(true);
    mesh.skeleton.update();
    const geo = mesh.geometry;
    const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const n = pos.count;
    geo.computeBoundingBox();
    const h = Math.max(1e-6, geo.boundingBox.max.y - geo.boundingBox.min.y);
    const eps = h * 0.001;                // a thousandth of body height: sub-pixel
    const v = new THREE.Vector3(), r = new THREE.Vector3();
    const moved = new Map(), total = new Map();
    for (let i = 0; i < n; i++) {
      let bw = -1, bi = 0;
      for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > bw) { bw = x; bi = si.getComponent(i, k); } }
      const name = bones[bi]?.name || '?';
      total.set(name, (total.get(name) || 0) + 1);
      mesh.getVertexPosition(i, v);
      r.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (v.distanceTo(r) > eps) moved.set(name, (moved.get(name) || 0) + 1);
    }
    return {
      eps: +eps.toFixed(5),
      cutView,
      moving: [...moved.entries()].sort((a, b) => b[1] - a[1])
        .map(([name, c]) => ({ bone: name, moved: c, of: total.get(name) })),
      still: [...total.keys()].filter((k) => !moved.has(k)).sort(),
    };
  }

  // Two questions, and they are NOT the same one — which is the whole reason a
  // weld is confusing:
  //
  //   WHAT MOVES   which bones' vertices travel. A welded torso vertex does
  //                NOT move: it is rigid on the torso and stays exactly put.
  //   WHAT IS PULLED APART   which triangles span moving and stationary
  //                geometry and are therefore being stretched between them.
  //                THIS is what a weld looks like, and what the smear is.
  //
  // So both are reported. "torso is still" alone would have said the arm was
  // clean while the shell was being dragged across the arena between them.
  function reportMoves() {
    const m = whatMoves();
    if (!m) return;
    const st = stretchNow(0);
    const pulled = (st?.byBonePair || []).filter((p) => p.edges > 0);
    if (!m.moving.length && !pulled.length) {
      setStatus('Nothing is moving — wiggle a bone first (W), and pause with SPACE at full deflection.');
      return;
    }
    setStatus(`AT THIS POSE — ${cutView ? 'SEAM-CUT PREVIEW (what the game builds)' : 'raw view (cuts NOT applied)'}\n`
      + `moving: ${m.moving.map((x) => `${x.bone} ${x.moved}/${x.of}`).join(' · ') || 'nothing'}\n`
      + `still:  ${m.still.join(' ') || '—'}\n`
      + (pulled.length
        ? `PULLED APART (geometry stretched between two bones):\n`
          + pulled.map((p) => `  ${p.pair}  ${p.edges} edge(s), worst ${p.worst}x`).join('\n')
        : 'PULLED APART: nothing — no triangle spans two bones that separate. ✓'));
  }

  // ================= DEBUG OUTPUT =================
  // One file that answers "what am I looking at, and why is it doing that".
  //
  // Reading a skinning problem over someone's shoulder needs three things at
  // once: the PICTURE (what deformed), the STATE (which mech, which build,
  // which bone is wiggling, which ops are live) and the MEASUREMENT (which
  // edges are actually being stretched, on which bones, in which islands). A
  // screenshot has the first, the panel has the second and only the skin audit
  // has the third — so this bundles all three into a single self-contained HTML
  // file: two screenshots (shaded + bone colours), the state, and the worst
  // stretching edges at THIS moment, each named by vertex, bone and island so
  // it can be looked up here or handed to `?edit=skindebug`.
  //
  // The raw JSON is embedded verbatim in a <script type="application/json">
  // block, so the file is readable by eye AND parseable by machine.

  // Every edge that is over the limits AT THE CURRENT POSE. Same maths as the
  // skin audit (stretchscan.js), run on this workbench's own raw mesh, so a
  // wiggle can be measured while it is happening.
  function stretchNow(limit = 50) {
    if (!mesh) return null;
    if (!stretchPrep) stretchPrep = prepareMesh(mesh);
    const prep = stretchPrep;
    if (!prep) return { note: 'nothing on this mesh can deform (no differing weights)' };
    holder?.updateMatrixWorld(true);
    mesh.skeleton.update();
    prep._mats = poseMatrices(THREE, mesh, prep._mats);
    skinVertices(prep, prep._mats);
    prep._lens = edgeLengths(prep, prep._lens);
    const lim = { ...DEFAULTS };
    const nameOf = (slot) => bones[prep.domSlot[slot]]?.name || '?';
    const weightsOf = (vi) => {
      const jnt = mesh.geometry.attributes.skinIndex, wgt = mesh.geometry.attributes.skinWeight;
      const out = [];
      for (let k = 0; k < 4; k++) {
        const w = wgt.getComponent(vi, k);
        if (w > 1e-4) out.push(`${bones[jnt.getComponent(vi, k)]?.name || '?'}:${w.toFixed(3)}`);
      }
      return out;
    };
    const rows = [];
    const byPair = new Map();
    for (let e = 0; e < prep.E; e++) {
      const sc = scoreEdge(prep, e, prep._lens[e], lim);
      if (!sc) continue;
      const sa = prep.edgeA[e], sb = prep.edgeB[e];
      const va = prep.verts[sa], vb = prep.verts[sb];
      const pair = [nameOf(sa), nameOf(sb)].sort().join('~');
      const agg = byPair.get(pair) || { pair, edges: 0, worst: 0 };
      agg.edges++;
      agg.worst = Math.max(agg.worst, sc.sev);
      byPair.set(pair, agg);
      rows.push({
        type: sc.type, sev: +sc.sev.toFixed(2), ratio: +sc.ratio.toFixed(2),
        rest: +prep.restLen[e].toFixed(4), now: +prep._lens[e].toFixed(4),
        pair,
        a: { vert: va, bone: nameOf(sa), island: liveAnalysis?.compId[va], pristineIsland: analysis?.compId[va], weights: weightsOf(va) },
        b: { vert: vb, bone: nameOf(sb), island: liveAnalysis?.compId[vb], pristineIsland: analysis?.compId[vb], weights: weightsOf(vb) },
      });
    }
    rows.sort((x, y) => y.sev - x.sev);
    return {
      limits: lim,
      deformableEdges: prep.E,
      flagged: rows.length,
      byBonePair: [...byPair.values()].sort((x, y) => y.worst - x.worst)
        .map((x) => ({ ...x, worst: +x.worst.toFixed(2) })),
      worstEdges: rows.slice(0, limit),
    };
  }

  function debugState() {
    const entry = manifest?.[curId] || null;
    const live = altOn ? entry?.alt : entry;
    const boneAngles = {};
    for (const b of bones) {
      const e = b.rotation;
      if (Math.abs(e.x) + Math.abs(e.y) + Math.abs(e.z) > 1e-4) {
        boneAngles[b.name] = [e.x, e.y, e.z].map((v) => +(v * 180 / Math.PI).toFixed(2));
      }
    }
    return {
      tool: 'skin workbench', url: location.href, when: new Date().toISOString(),
      mech: curId, build: altOn ? 'alt' : 'primary',
      // THE THING THAT CATCHES PEOPLE OUT: this workbench renders the RAW file
      // with skinOps applied and NOTHING else. A seam cut is applied when the
      // GAME builds the mech (seamcut.js, after skinOps), so geometry that the
      // game has separated is still welded here and still stretches here.
      seamCuts: {
        inManifest: live?.seamCuts || null,
        appliedInThisView: cutView,
        note: live?.seamCuts?.length
          ? 'This mech HAS seam cuts, and this workbench does NOT apply them — it '
            + 'edits the raw file. Geometry the game has already split is still '
            + 'joined in this view, so it will still stretch here. Judge a cut in '
            + '?edit=skindebug (or in game), not here.'
          : 'none for this mech',
      },
      selection: {
        island: selComp ? { id: selComp.id, bone: selComp.boneName, verts: selComp.count } : null,
        bone: selBone?.name || null,
      },
      wiggle: wiggle
        ? { bone: wiggle.bone?.name, clip: wiggle.clip || '(single-bone shake)', paused: wigglePaused, t: +(wiggle.t || 0).toFixed(2) }
        : null,
      clipPicker: { preferred: preferredClip, offered: clipOpts.map((c) => c.name), driver: !!animMech },
      poseNow: boneAngles,
      ops: { count: ops.length, list: compactSkinOps(ops) },
      mesh: mesh ? {
        verts: mesh.geometry.attributes.position.count,
        tris: mesh.geometry.index ? mesh.geometry.index.count / 3 : 0,
        bones: bones.map((b) => b.name),
        islands: liveAnalysis?.comps.length,
      } : null,
      camera: {
        position: camera.position.toArray().map((v) => +v.toFixed(3)),
        target: orbit.target.toArray().map((v) => +v.toFixed(3)),
      },
      view: cutView ? 'SEAM-CUT PREVIEW (what the game builds)' : 'raw editable mesh (skinOps only)',
      seamCutPreview: cutView ? (cutInfo?.rules || null) : null,
      whatMovesAtThisPose: whatMoves(),
      stretchAtThisMoment: stretchNow(),
    };
  }

  function debugOutput() {
    if (!mesh) { setStatus('Nothing loaded to report on.'); return; }
    // two shots of the same frame: what you are looking at, and the same view
    // in bone colours (which is what makes a wrong binding legible)
    const wasTex = showTex;
    mesh.material = wasTex ? texturedMat : boneMat;
    const shotNow = engine.capture('image/png');
    mesh.material = wasTex ? boneMat : texturedMat;
    const shotOther = engine.capture('image/png');
    mesh.material = wasTex ? texturedMat : boneMat;      // put it back
    const shaded = wasTex ? shotNow : shotOther;
    const boneView = wasTex ? shotOther : shotNow;

    const state = debugState();
    const st = state.stretchAtThisMoment || {};
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = (st.worstEdges || []).map((r) => `<tr>
      <td class="${r.type}">${r.type}</td><td class="n">${r.sev}</td><td class="n">${r.ratio}x</td>
      <td>${esc(r.pair)}</td>
      <td>v${r.a.vert} <span class="d">${esc(r.a.bone)} · island ${r.a.island} · ${esc(r.a.weights.join(' '))}</span></td>
      <td>v${r.b.vert} <span class="d">${esc(r.b.bone)} · island ${r.b.island} · ${esc(r.b.weights.join(' '))}</span></td>
    </tr>`).join('');
    const pairRows = (st.byBonePair || []).map((p) =>
      `<tr><td>${esc(p.pair)}</td><td class="n">${p.edges}</td><td class="n">${p.worst}</td></tr>`).join('');

    const html = `<!doctype html><meta charset="utf-8">
<title>skin debug — ${esc(curId)}${altOn ? ' (alt)' : ''}</title>
<style>
 body{background:#0d1219;color:#dfe8f5;font:13px/1.5 system-ui,sans-serif;margin:0;padding:24px}
 h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:26px 0 8px;color:#f5a33c}
 .sub{color:#8ba0b8;font:12px ui-monospace,monospace;margin-bottom:18px}
 .shots{display:flex;gap:14px;flex-wrap:wrap} .shots figure{margin:0;flex:1;min-width:340px}
 .shots img{width:100%;border:1px solid #2c3648;border-radius:6px;display:block}
 figcaption{color:#8ba0b8;font-size:11px;margin-top:4px}
 table{border-collapse:collapse;width:100%;font:11px/1.45 ui-monospace,monospace}
 th{text-align:left;color:#7d8ea3;font-weight:400;border-bottom:1px solid #2c3648;padding:4px 6px}
 td{padding:3px 6px;border-bottom:1px solid #161d27;vertical-align:top}
 td.n{text-align:right} .d{color:#7d8ea3}
 .stretch{color:#ff6b8a} .pinch{color:#ffb347} .tear{color:#7fd8ff}
 .warn{background:#241d10;border:1px solid #5a4a2a;color:#ffcc66;padding:10px 14px;border-radius:6px;margin:14px 0}
 pre{background:#0b0f16;border:1px solid #222c3a;border-radius:6px;padding:12px;overflow:auto;font-size:11px;max-height:420px}
</style>
<h1>skin workbench debug — ${esc(curId)}${altOn ? ' · ALT' : ''}</h1>
<div class="sub">${esc(state.when)} · ${esc(state.url)}</div>
${state.seamCuts.inManifest ? `<div class="warn"><b>Seam cuts are NOT applied in this view.</b><br>${esc(state.seamCuts.note)}</div>` : ''}
<div class="shots">
  <figure><img src="${shaded}"><figcaption>textures / shaded</figcaption></figure>
  <figure><img src="${boneView}"><figcaption>bone colours (one hue per bone)</figcaption></figure>
</div>
<h2>Wiggle</h2>
<div class="sub">${state.wiggle
  ? `bone <b>${esc(state.wiggle.bone)}</b> · clip ${esc(state.wiggle.clip)} · ${state.wiggle.paused ? 'PAUSED' : 'running'}`
  : 'not wiggling — this is the rest pose'} · selected island ${state.selection.island
  ? `#${state.selection.island.id} of ${esc(state.selection.island.bone)}` : '(none)'}</div>
<h2>Stretching right now — by bone pair</h2>
<table><tr><th>bones</th><th>edges over</th><th>worst sev</th></tr>${pairRows || '<tr><td colspan=3>nothing over the limits</td></tr>'}</table>
<h2>Worst edges (${st.flagged || 0} over the limits, of ${st.deformableEdges || 0} that can deform)</h2>
<table><tr><th>type</th><th>sev</th><th>ratio</th><th>bones</th><th>end A</th><th>end B</th></tr>${rows || '<tr><td colspan=6>none</td></tr>'}</table>
<h2>Full state</h2>
<pre>${esc(JSON.stringify(state, null, 2))}</pre>
<script type="application/json" id="rw-skin-debug">${JSON.stringify(state)}<\/script>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skin-debug-${curId}${altOn ? '-alt' : ''}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    setStatus(`Debug output downloaded — ${st.flagged || 0} edge(s) over the limits right now`
      + (st.byBonePair?.length ? `\nworst: ${st.byBonePair[0].pair} (${st.byBonePair[0].worst})` : '')
      + `\nOpen it in a browser, or send the file on.`);
  }

  // the patch this session's ops make, as an object — the one source both
  // Export (text, for pasting) and Save (POST, for writing) format from
  function opsPatch() {
    const list = outgoingOps();
    return altOn ? { [curId]: { alt: { skinOps: list } } } : { [curId]: { skinOps: list } };
  }

  // SAVE — write the ops into public/models/manifest.json on this machine via
  // the dev server (vite.config.js), so a reload of the game or any workbench
  // picks them up. Still local: committing is what publishes them.
  // WHAT LEAVES THIS TOOL. Superseded ops dropped (compact), then every
  // whole-island selector pinned to the vertices it means (pin) — a `{comp:N}`
  // ordinal is only valid against the rig that drew the partition, and a rig
  // edit renumbers it onto other geometry without a word. See pinSkinOps.
  const outgoingOps = () => pinSkinOps(compactSkinOps(ops), analysis);

  const saveBtn = actionBtn('Save to manifest ▶', async () => {
    const list = outgoingOps();
    saveBtn.disabled = true;
    setStatus(`Saving ${list.length} op(s) to manifest.json under "${curId}${altOn ? '.alt' : ''}"…`);
    const res = await config.skin.save(curId, list, { variant: altOn ? 'alt' : 'glb' });
    saveBtn.disabled = false;
    if (res.ok) {
      setStatus(`SAVED — ${list.length} op(s) written to public/models/manifest.json (${res.written.join(', ')}).` +
        `\nThis machine's canonical state; commit to publish it.`);
      changes.refresh();
    } else if (res.offline) {
      setStatus(`No dev server to save through (${res.error}).` +
        `\nRun \`npm run dev\` and reload, or use Export ops and paste it in.`);
    } else {
      setStatus(`Save FAILED: ${res.error}\nNothing was written — use Export ops as the fallback.`);
    }
  }, true);
  panel.appendChild(saveBtn);
  writeBtns.push(saveBtn);
  refreshMannRow();          // the mannequin reference greys it out
  // hand the whole batch of local saves to whoever commits them
  const exportChangesBtn = actionBtn('Export uncommitted saves', () => {});
  panel.appendChild(exportChangesBtn);
  const changes = wireExportChanges(exportChangesBtn, { setStatus: (t) => setStatus(t) });

  const exportOpsBtn = actionBtn('Export ops ▶', () => {
    // export compacted (superseded ops dropped) + one-op-per-line so pasting
    // into manifest.json doesn't re-grow the file the compactor just shrank
    // the ops belong to the entry they were painted on: nest them under
    // "alt" when the alternate build is loaded, or the patch would be pasted
    // onto the wrong model
    const list = outgoingOps();
    const json = altOn
      ? `{\n  "${curId}": {\n    "alt": {\n      "skinOps": ${skinOpsToJson(list, '      ')}\n    }\n  }\n}`
      : `{\n  "${curId}": {\n    "skinOps": ${skinOpsToJson(list, '    ')}\n  }\n}`;
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
  }, true);
  panel.appendChild(exportOpsBtn);
  // an ops patch is keyed by the MECH id, so it means nothing off the reference
  // body — the mannequin greys this out along with Save
  writeBtns.push(exportOpsBtn);
  refreshMannRow();

  // WHAT AM I LOOKING AT — a picture, the state and the live measurement, in
  // one file to send on when the deformation needs another pair of eyes
  panel.appendChild(actionBtn('Debug output ▶', debugOutput));

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
  status.id = 'rw-skin-status';   // scripted checks read this
  function setStatus(s) { status.textContent = s; }

  const help = document.createElement('div');
  help.style.cssText = 'margin-top:6px;color:#69788c;font-size:10.5px;line-height:1.5';
  help.innerHTML = 'Colors = which bone owns each patch.<br>'
    + '1. Click a wrong-colored patch (selects it, turns white)<br>'
    + '2. “Rebind → click target” (Q), then click the part it should move with<br>'
    + '3. Wiggle (W) to verify · SPACE pauses a wiggle to click a stretched piece<br>'
    + '&nbsp;&nbsp;&nbsp;“Wiggle animation” swaps the shake for a real game clip that drives '
    + 'that bone, played at 10% speed.<br>'
    + '3b. SHIFT-CLICK selects a BLEND PATCH: the run of geometry sharing that '
    + 'vertex’s own bone AND a minority weight on another one — the bit of the '
    + 'torso that wiggles with an arm. Rebinding it to its own bone kills the '
    + 'wiggle without touching the rest of the island.<br>'
    + '&nbsp;&nbsp;&nbsp;“Absorb enclaves” (E) does the island-level version in bulk: any patch '
    + 'bound to a limb but surrounded by another bone’s region is handed to the '
    + 'bone around it.<br>'
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

  // Select an island by one of its VERTICES (the ?edit=skindebug hand-off).
  // The live analysis is the right one to address: it is what a click would
  // have selected, so the arriving link behaves exactly like clicking the spot.
  function selectVert(vi) {
    if (!mesh || !liveAnalysis) return false;
    const cid = liveAnalysis.compId[vi];
    const comp = liveAnalysis.comps[cid];
    if (!comp) return false;
    selComp = comp;
    setSelBone(bones[comp.boneIndex]);
    stopWiggle();
    rebuildColors();
    if (bindOpen) openBindPanel();
    return true;
  }
  function selectFromUrl() {
    const p = new URLSearchParams(location.search);
    const wantClip = p.get('clip');
    if (wantClip) preferredClip = wantClip;
    const vi = p.has('vert') ? +p.get('vert') : NaN;
    if (!Number.isFinite(vi) || !selectVert(vi)) { if (wantClip) renderClipOptions(); return; }
    renderClipOptions();
    setStatus(`Selected island #${selComp.id} of ${selComp.boneName} — vertex ${vi} from the skin audit.`
      + `\n${selComp.count} verts`
      + (wantClip ? `\nWiggle animation set to "${wantClip}".` : ''));
  }

  function label(t) { const d = document.createElement('div'); d.textContent = t;
    d.style.cssText = 'color:#7d8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin:6px 0 2px'; return d; }
  function actionBtn(text, fn, primary) { const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `flex:1;padding:6px;border-radius:5px;border:1px solid #2c3648;cursor:pointer;font-size:11px;width:100%;
      background:${primary ? '#1f7a4d' : '#1a2433'};color:${primary ? '#fff' : '#cfe0f5'}`;
    b.onclick = fn; return b; }

  await load(curId);
  // ---- deep link from the SKIN DEBUG workbench ----
  // `&vert=<geometry index>` selects the island that vertex belongs to, and
  // `&clip=<name>` preloads the wiggle picker with the animation that showed the
  // problem: an audit finding hands over the exact piece of geometry that tore,
  // so arriving here should not mean hunting for it again by eye.
  selectFromUrl();
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
    // seam-cut preview + the "what follows this bone" measurement, for scripted
    // checks (tools/*.mjs) as well as the panel
    cutView: setCutView, get cutState() { return { on: cutView, rules: seamCuts, applied: cutInfo }; },
    moves: whatMoves, debugOutput,
    // blend-patch + enclave hooks (scripting / automated checks)
    patchAt: (vi, foreign) => selectBlendPatch(vi, foreign),
    absorbEnclaves,
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
      brush: (m) => {
        if (m === 'loop' || m === 'slice') brushMode = m;
        else { brushMode = 'radius'; if (typeof m === 'number') brushRadius = m; }
        updatePaintUI();
      },
      // drive the lasso from a script: client-space points, current brushMode
      // decides loop (visible only) vs slice (through the model)
      lasso: (pts) => { loopPts = pts.map((p) => ({ x: p.x, y: p.y })); finishLoop(); },
      get state() { return { paintMode, paintPhase, paintBone, region: paintRegion?.id, brushMode, brushRadius }; },
      get regionCentroidWorld() {
        if (!regionSet) return null;
        const v = new THREE.Vector3(); let n = 0;
        for (const vi of regionSet) { v.add(regionWorld.get(vi)); n++; }
        return n ? v.multiplyScalar(1 / n) : null;
      } } };
  return engine;
}
