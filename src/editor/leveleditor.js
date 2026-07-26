// ?edit=level — the ROBOTWORLD level builder.
//
// Pick a base theme, then place / move / rotate / scale / delete buildings,
// props, terrain (hills, decks, bridges, lanes) and spawn points on a real
// themed stage. The arena wraps toroidally in game, so the editor renders the
// 8 neighbour tiles around the cell you're editing — what you see repeating IS
// what the match feels like. Export produces a level JSON the game loads
// (src/arena/level.js → Arena.authored); Playtest launches a live battle on it.
//
// Design notes:
// - The environment (sky, lights, ground, spawn plaza) is a real Arena built
//   from the current theme with no placed objects, so the stage looks in-game.
//   It's rebuilt only when the theme / size / plaza changes.
// - Everything you place is a lightweight editor proxy in `worldGroup`; the 8
//   tiling ghosts are clones. Nothing here mutates the shared prop materials.
// - Undo/redo snapshots the whole level as JSON (cheap + bulletproof).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Engine } from '../core/engine.js';
import { Arena } from '../arena/arena.js';
import { THEMES, THEMES_BY_ID } from '../arena/themes.js';
import { PROPS, PROP_MATS } from '../arena/props.js';
import { ROSTER } from '../mechs/roster.js';
import { emptyLevel, LEVEL_VERSION, PLAYTEST_KEY } from '../arena/level.js';
import { CATALOG, CATALOG_BY_ID, SWATCHES } from './catalog.js';
import { setupDevPanel } from '../dev/panelui.js';

const WRAP = 1.35;                 // arena wrapHalf = bounds * 1.35
const LS_PREFIX = 'rw_level:';     // saved-slot keys
const LS_AUTOSAVE = 'rw_level:__autosave';
const SHARED_MATS = new Set(Object.values(PROP_MATS));  // never dispose these

export async function runLevelEditor(params) {
  const engine = new Engine(document.getElementById('game-canvas'));
  const { scene, camera, renderer } = engine;

  // ---------------------------------------------------------------- state
  // ?edit=level&load=<name> opens an existing level (public/levels/<name>.json)
  // for editing; otherwise resume the autosave, else a blank arena.
  const loadName = params.get('load');
  let level = loadAutosave() || emptyLevel(params.get('theme') || 'neon');
  let items = [];          // { id, def, obj3d, ghosts:[] }  (buildings/props/hills/bridges/lanes)
  let spawnItems = [];     // { id, def:{x,z,yaw}, obj3d }
  let sel = null;          // selected item (or spawn item)
  let paletteSel = null;   // active palette entry (place mode) or null
  let idSeq = 1;
  const nextId = () => 'o' + (idSeq++);

  let gridOn = true, gridSize = 2, tilingOn = true, gizmoMode = 'translate';
  const spinners = [];     // editor proxies that idle-spin for life

  // UI element handles (assigned in buildUI, declared here to dodge TDZ since
  // buildUI runs during the initial build below)
  let paletteBody, inspector, statsEl, hintEl, bMove, bRot, bGrid, bTile;
  let inspFields = [];

  const undoStack = [], redoStack = [];

  // effective play radius + wrap cell period (mirrors Arena math)
  const B = () => level.bounds;
  const P = () => level.bounds * WRAP * 2;

  // ---------------------------------------------------------------- scene rig
  const worldGroup = new THREE.Group();  scene.add(worldGroup);
  const ghostGroup = new THREE.Group();  scene.add(ghostGroup);
  const helperGroup = new THREE.Group(); scene.add(helperGroup);
  let envArena = null;

  camera.position.set(0, 130, 118);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0, 0);
  orbit.maxPolarAngle = Math.PI * 0.495;   // stay above ground
  orbit.update();

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSpace('local');
  gizmo.setSize(0.9);
  gizmo.showY = false;                     // ground-plane editing
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  gizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    if (e.value) { dragSnapshot = serialize(); }
    else onGizmoCommit();
  });
  gizmo.addEventListener('objectChange', onGizmoChange);
  let dragSnapshot = null;

  // selection outline
  let selBox = null;

  // placement marker (a ring + crosshair where the next object lands)
  const marker = makeMarker();
  helperGroup.add(marker); marker.visible = false;

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ================================================================ ENV
  function rebuildEnv() {
    if (envArena) { envArena.dispose(); envArena = null; }
    // a themed stage with NO placed objects and no procedural terrain — just
    // sky, lights, ground and the spawn plaza. Everything else is an editor proxy.
    const base = THEMES_BY_ID[level.theme] || THEMES[0];
    const env = JSON.parse(JSON.stringify(base));
    env.bounds = level.bounds / 2;                 // Arena doubles it back
    env.authored = [];
    env.layout = { clearing: level.clearing, plaza: level.plaza, clusters: { count: 0, size: [2, 3] }, lanes: [], hills: null, bridges: null };
    envArena = new Arena(engine, env, 7);
    renderer.toneMappingExposure = base.exposure ?? 1.0;
    // the arena's far skyline is camera-locked in a real match, but in the
    // editor's free-orbit view it just reads as static black boxes you can't
    // select — hide it so only the editable play cell shows.
    if (engine.backdrop) engine.backdrop.visible = false;
  }

  // ================================================================ HELPERS (geometry)
  function windowMat(tint) {
    // one shared window texture, per-building colour
    if (!windowMat._tex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = '#20242c'; x.fillRect(0, 0, 64, 64);
      for (let yy = 4; yy < 64; yy += 10) for (let xx = 4; xx < 64; xx += 8) {
        x.fillStyle = Math.random() < 0.5 ? '#3a4250' : '#8fb4d8';
        x.fillRect(xx, yy, 5, 6);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      windowMat._tex = t;
    }
    return new THREE.MeshStandardMaterial({ color: tint, map: windowMat._tex, roughness: 0.7, metalness: 0.2 });
  }

  function buildBuildingProxy(def) {
    const g = new THREE.Group();
    const w = (def.nx || 2) * (def.cw || 3.5);
    const h = (def.ny || 4) * (def.ch || 3.3);
    const d = (def.nz || 2) * (def.cd || 3.5);
    const m = windowMat(def.tint ?? 0x8a90a0);
    m.map = m.map; // keep ref
    const t = m.map.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
    m.map = t;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.5, d * 1.02),
      new THREE.MeshStandardMaterial({ color: 0x40464e, roughness: 0.9 }));
    roof.position.y = h + 0.2; g.add(roof);
    return g;
  }

  function buildHillProxy(def) {
    const deck = !!def.deck;
    const R = def.R ?? 12, Rtop = def.Rtop ?? R * (deck ? 0.72 : 0.34), H = def.H ?? 3.5;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: def.color ?? (deck ? 0x515a68 : 0x5a5248),
      roughness: deck ? 0.42 : 0.94, metalness: deck ? 0.6 : 0.04,
    });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(Rtop, R, H, deck ? 8 : 22, 1), mat);
    cone.position.y = H / 2; cone.castShadow = true; cone.receiveShadow = true;
    g.add(cone);
    const edge = def.edge ?? (deck ? 0x53e8ff : null);
    if (deck && edge) {
      const eMat = new THREE.MeshStandardMaterial({ color: edge, emissive: edge, emissiveIntensity: 2, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(Rtop + 0.06, Rtop + 0.06, 0.35, 8, 1, true), eMat);
      ring.position.y = H - 0.12; g.add(ring);
    }
    return g;
  }

  function buildBridgeProxy(def) {
    const g = new THREE.Group();
    const w = 8, H = def.H ?? 3.2, rampL = 6, flat = def.flat ?? 12;
    const mat = new THREE.MeshStandardMaterial({ color: def.color ?? 0x54565c, roughness: 0.8, metalness: 0.25 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, H, flat), mat);
    deck.position.y = H / 2; deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
    const hyp = Math.hypot(rampL, H), slope = Math.atan2(H, rampL);
    for (const sz of [-1, 1]) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, hyp + 0.6), mat);
      ramp.position.set(0, H / 2 - 0.28, sz * (flat / 2 + rampL / 2));
      ramp.rotation.x = -sz * slope; g.add(ramp);
    }
    if (def.edge) {
      const eMat = new THREE.MeshStandardMaterial({ color: def.edge, emissive: def.edge, emissiveIntensity: 1.5 });
      for (const sx of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, flat), eMat);
        strip.position.set(sx * (w / 2 - 0.22), H + 0.9, 0); g.add(strip);
      }
    }
    g.rotation.y = def.axis === 'x' ? Math.PI / 2 : 0;
    return g;
  }

  function buildLaneProxy(def) {
    // flat ribbon following the periodic centerline across the whole cell —
    // visualises exactly how the lane tiles across the wrap seam
    const per = P(), half = (def.width ?? 6) / 2, N = 96;
    const col = def.glow || def.color || laneColor(def.kind);
    const positions = [];
    for (let i = 0; i <= N; i++) {
      const along = -per / 2 + (i / N) * per;
      const c = (def.at || 0) + (def.amp || 0) * Math.sin((Math.PI * 2 * along) / per + (def.phase || 0));
      // two edge verts (axis 'z' means lane runs along z, perp is x)
      if (def.axis === 'z') { positions.push(c - half, 0, along, c + half, 0, along); }
      else { positions.push(along, 0, c - half, along, 0, c + half); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const idx = [];
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat); m.position.y = 0.06; m.renderOrder = 2;
    const g = new THREE.Group(); g.add(m);
    g.userData.laneRibbon = true;   // lanes are cell-global: don't offset ghosts
    return g;
  }
  function laneColor(kind) {
    return ({ road: 0x555a62, water: 0x2e86b0, lava: 0xff5a10, acid: 0x7bff2a, mud: 0x4a3a22,
      oil: 0x2c3a44, ice: 0x9be8ff, crystal: 0xb46bff, sand: 0x8a704c, canal: 0x53e8ff, stripe: 0x53e8ff }[kind]) || 0x888888;
  }

  function buildPropProxy(def) {
    const builder = PROPS[def.name];
    if (!builder) return new THREE.Group();
    const opts = { ...(def.opts || {}), seed: def.seed || 1, ry: 0 };
    const g = builder(opts);
    if (def.s && def.s !== 1) g.scale.setScalar(def.s);
    if (g.userData.spin) spinners.push(g);
    return g;
  }

  // build the editor proxy for any object def, positioned/rotated per def
  function buildProxy(def) {
    let g;
    if (def.k === 'building') g = buildBuildingProxy(def);
    else if (def.k === 'hill') g = buildHillProxy(def);
    else if (def.k === 'bridge') g = buildBridgeProxy(def);
    else if (def.k === 'lane') g = buildLaneProxy(def);
    else g = buildPropProxy(def);
    if (def.k !== 'lane') { g.position.set(def.x || 0, 0, def.z || 0); if (def.ry) g.rotation.y = def.ry; }
    return g;
  }

  // ================================================================ ITEM CRUD
  function addItem(def, { silent } = {}) {
    if (!silent) pushUndo();
    def = { ...def };
    const it = { id: def.id || nextId(), def, obj3d: buildProxy(def), ghosts: [] };
    it.def.id = it.id;
    worldGroup.add(it.obj3d);
    rebuildGhosts(it);
    items.push(it);
    refreshStats();
    return it;
  }

  function rebuildProxy(it) {
    // preserve which item; swap the 3D object after a shape/param change
    worldGroup.remove(it.obj3d); disposeObj(it.obj3d);
    it.obj3d = buildProxy(it.def);
    worldGroup.add(it.obj3d);
    rebuildGhosts(it);
    if (sel === it) { attachGizmo(it); updateSelBox(); }
  }

  function rebuildGhosts(it) {
    for (const gh of it.ghosts) { ghostGroup.remove(gh); disposeObj(gh, true); }
    it.ghosts.length = 0;
    if (it.def.k === 'lane') return;   // lanes already span the whole cell
    const per = P();
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
      if (!gx && !gz) continue;
      const c = it.obj3d.clone(true);
      c.position.set(it.obj3d.position.x + gx * per, 0, it.obj3d.position.z + gz * per);
      c.userData.ghostOffset = new THREE.Vector2(gx * per, gz * per);
      ghostGroup.add(c); it.ghosts.push(c);  // ghostGroup is never raycast — not pickable
    }
  }

  function syncGhostTransforms(it) {
    for (const gh of it.ghosts) {
      const off = gh.userData.ghostOffset;
      gh.position.set(it.obj3d.position.x + off.x, it.obj3d.position.y, it.obj3d.position.z + off.y);
      gh.rotation.copy(it.obj3d.rotation);
      gh.scale.copy(it.obj3d.scale);
    }
  }

  function deleteItem(it) {
    pushUndo();
    if (sel === it) select(null);
    worldGroup.remove(it.obj3d); disposeObj(it.obj3d);
    for (const gh of it.ghosts) { ghostGroup.remove(gh); disposeObj(gh, true); }
    items = items.filter((x) => x !== it);
    refreshStats();
  }

  function duplicateItem(it) {
    if (!it) return;
    const d = { ...it.def, id: undefined, x: (it.def.x || 0) + 6, z: (it.def.z || 0) + 6 };
    const ni = addItem(d);
    select(ni);
  }

  // ================================================================ SPAWNS
  function addSpawn(x = 0, z = 30, yaw, silent) {
    if (!silent) pushUndo();
    const def = { x, z, yaw: yaw ?? Math.atan2(-x, -z) };
    const obj = makeSpawnMarker(spawnItems.length);
    obj.position.set(x, 0, z); obj.rotation.y = def.yaw;
    const it = { id: nextId(), def, obj3d: obj, ghosts: [], spawn: true };
    worldGroup.add(obj);
    spawnItems.push(it);
    refreshStats();
    return it;
  }
  function deleteSpawn(it) {
    pushUndo();
    if (sel === it) select(null);
    worldGroup.remove(it.obj3d); disposeObj(it.obj3d);
    spawnItems = spawnItems.filter((x) => x !== it);
    refreshStats();
  }

  // ================================================================ SELECTION + GIZMO
  function select(it) {
    sel = it;
    if (selBox) { helperGroup.remove(selBox); selBox = null; }
    if (!it) { gizmo.detach(); buildInspector(); return; }
    attachGizmo(it);
    selBox = new THREE.BoxHelper(it.obj3d, 0x53e8ff);
    helperGroup.add(selBox);
    buildInspector();
  }
  function attachGizmo(it) {
    // lanes are cell-global — no drag gizmo (edit offset/width in the inspector)
    if (!it.spawn && it.def.k === 'lane') { gizmo.detach(); return; }
    gizmo.attach(it.obj3d);
    // spawns + props + bridges rotate around Y; buildings stay axis-aligned
    const canRotate = it.spawn || ['prop', 'bridge'].includes(it.def.k);
    if (gizmoMode === 'rotate' && canRotate) {
      gizmo.setMode('rotate'); gizmo.showX = false; gizmo.showZ = false; gizmo.showY = true;
    } else {
      gizmo.setMode('translate'); gizmo.showY = false; gizmo.showX = true; gizmo.showZ = true;
    }
    gizmo.setTranslationSnap(gridOn ? gridSize : null);
    gizmo.setRotationSnap(gridOn ? THREE.MathUtils.degToRad(15) : null);
  }
  function updateSelBox() { if (selBox) selBox.setFromObject(sel.obj3d); }

  function onGizmoChange() {
    if (!sel) return;
    const o = sel.obj3d;
    if (sel.spawn) {
      sel.def.x = round(o.position.x); sel.def.z = round(o.position.z); sel.def.yaw = round2(o.rotation.y);
    } else if (sel.def.k === 'lane') {
      // dragging a lane adjusts its centerline offset along the perpendicular
      const perp = sel.def.axis === 'z' ? o.position.x : o.position.z;
      sel.def.at = round(perp); o.position.set(0, 0.06, 0); // ribbon stays cell-centred visually
      rebuildProxy(sel);
    } else {
      sel.def.x = round(o.position.x); sel.def.z = round(o.position.z); sel.def.ry = round2(o.rotation.y);
      syncGhostTransforms(sel);
    }
    updateSelBox();
    refreshInspectorValues();
  }
  function onGizmoCommit() {
    if (dragSnapshot) { undoStack.push(dragSnapshot); redoStack.length = 0; trimUndo(); dragSnapshot = null; }
    if (sel && !sel.spawn && sel.def.k !== 'lane') rebuildGhosts(sel);
  }

  // ================================================================ PICKING / PLACEMENT
  function groundHit(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(groundPlane, p) ? p : null;
  }
  function pickItem(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(worldGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.parent !== worldGroup) o = o.parent;   // rise to the item root
      if (o) { const it = items.find((x) => x.obj3d === o) || spawnItems.find((x) => x.obj3d === o); if (it) return it; }
    }
    return null;
  }
  function snap(v) { return gridOn ? Math.round(v / gridSize) * gridSize : round(v); }

  function placeFromPalette(p) {
    const world = marker.userData.pos;
    if (!world) return;
    let def;
    if (p.k === 'lane') {
      const axis = Math.abs(world.x) > Math.abs(world.z) ? 'x' : 'z';
      const at = axis === 'z' ? snap(world.x) : snap(world.z);
      def = { k: 'lane', kind: p.kind, style: p.style || p.kind, axis, at, amp: 0, phase: 0, width: 6, glow: p.glow || null, dash: p.dash || null, color: p.color || null };
    } else if (p.k === 'building') {
      def = { k: 'building', x: snap(world.x), z: snap(world.z), nx: 2, ny: 5, nz: 2, cw: 3.6, ch: 3.3, cd: 3.6, tint: (THEMES_BY_ID[level.theme] || THEMES[0]).buildings.tints[0] };
    } else if (p.k === 'hill') {
      def = { k: 'hill', x: snap(world.x), z: snap(world.z), R: 13, H: 4, deck: !!p.deck, color: p.deck ? 0x515a68 : undefined, edge: p.deck ? 0x53e8ff : undefined };
    } else if (p.k === 'bridge') {
      def = { k: 'bridge', x: snap(world.x), z: snap(world.z), axis: 'x', flat: 12, H: 3.2, color: (THEMES_BY_ID[level.theme] || THEMES[0]).layout?.bridges?.color, edge: 0x53e8ff };
    } else { // prop
      def = { k: 'prop', name: p.name, x: snap(world.x), z: snap(world.z), ry: 0, s: 1, opts: {} };
      if (p.color) def.opts.color = SWATCHES[0];
    }
    const it = addItem(def);
    select(it);
  }

  // ================================================================ POINTER
  let downPos = null, moved = false;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downPos = { x: e.clientX, y: e.clientY }; moved = false;
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) moved = true;
    if (paletteSel) {
      const p = groundHit(e);
      if (p) { marker.visible = true; marker.position.set(snap(p.x), 0.1, snap(p.z)); marker.userData.pos = new THREE.Vector3(snap(p.x), 0, snap(p.z)); }
    }
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || gizmo.dragging) { downPos = null; return; }
    if (!moved) {
      if (paletteSel) placeFromPalette(paletteSel);
      else select(pickItem(e));
    }
    downPos = null;
  });

  // ================================================================ KEYBOARD
  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if (meta && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); if (sel && !sel.spawn) duplicateItem(sel); return; }
    if (meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveSlot(level.name); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (sel) (sel.spawn ? deleteSpawn(sel) : deleteItem(sel)); return; }
    if (e.key === 'Escape') { paletteSel = null; marker.visible = false; select(null); refreshPalette(); return; }
    if (e.key === 'g' || e.key === 'G') { setGizmoMode('translate'); return; }
    if (e.key === 'r' || e.key === 'R') { setGizmoMode('rotate'); return; }
    if ((e.key === '[' || e.key === ']') && sel && !sel.spawn) { nudgeRot(sel, e.key === '[' ? -15 : 15); return; }
    if (e.key.startsWith('Arrow') && sel) { nudgePos(sel, e.key); e.preventDefault(); }
  });
  function nudgeRot(it, deg) {
    pushUndo();
    it.def.ry = (it.def.ry || 0) + THREE.MathUtils.degToRad(deg);
    it.obj3d.rotation.y = it.def.ry; syncGhostTransforms(it); updateSelBox(); refreshInspectorValues();
  }
  function nudgePos(it, key) {
    pushUndo();
    const s = gridOn ? gridSize : 1;
    if (key === 'ArrowUp') it.def.z -= s; if (key === 'ArrowDown') it.def.z += s;
    if (key === 'ArrowLeft') it.def.x -= s; if (key === 'ArrowRight') it.def.x += s;
    it.obj3d.position.set(it.def.x, it.obj3d.position.y, it.def.z);
    if (!it.spawn) syncGhostTransforms(it); updateSelBox(); refreshInspectorValues();
  }

  // ================================================================ UNDO
  function serialize() {
    return JSON.stringify({
      v: LEVEL_VERSION, name: level.name, theme: level.theme, bounds: level.bounds,
      clearing: level.clearing, plaza: level.plaza,
      objects: items.map((i) => i.def), spawns: spawnItems.map((s) => s.def),
    });
  }
  function pushUndo() { undoStack.push(serialize()); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; }
  function trimUndo() { if (undoStack.length > 120) undoStack.shift(); }
  function undo() { if (!undoStack.length) return; redoStack.push(serialize()); loadLevelData(JSON.parse(undoStack.pop()), true); }
  function redo() { if (!redoStack.length) return; undoStack.push(serialize()); loadLevelData(JSON.parse(redoStack.pop()), true); }

  // full rebuild of the world from a level object
  function loadLevelData(data, keepUndo) {
    if (!keepUndo) { undoStack.length = 0; redoStack.length = 0; }
    // clear
    select(null);
    for (const it of items) { worldGroup.remove(it.obj3d); disposeObj(it.obj3d); for (const gh of it.ghosts) { ghostGroup.remove(gh); disposeObj(gh, true); } }
    for (const s of spawnItems) { worldGroup.remove(s.obj3d); disposeObj(s.obj3d); }
    items = []; spawnItems = []; spinners.length = 0;
    const themeChanged = data.theme !== level.theme || data.bounds !== level.bounds || data.plaza !== level.plaza || data.clearing !== level.clearing;
    level = { v: data.v || LEVEL_VERSION, name: data.name || 'Untitled', theme: data.theme || 'neon', bounds: data.bounds || 100, clearing: data.clearing ?? 38, plaza: data.plaza ?? true, objects: [], spawns: [] };
    rebuildEnv();
    for (const d of (data.objects || [])) addItem(d, { silent: true });
    for (const s of (data.spawns || [])) addSpawn(s.x, s.z, s.yaw, true);
    rebuildHelpers();
    buildUI();       // re-sync the LEVEL settings panel to the loaded values
    refreshAll();
  }

  // ================================================================ HELPERS: grid + boundaries + tiling
  let gridHelper = null, boundLines = null, cellLines = null;
  function rebuildHelpers() {
    for (const h of [gridHelper, boundLines, cellLines]) if (h) { helperGroup.remove(h); disposeObj(h, true); }
    const per = P(), b = B();
    gridHelper = new THREE.GridHelper(per * 3, Math.round(per * 3 / gridSize / 2) * 2 || 60, 0x2a3346, 0x1a2130);
    gridHelper.position.y = 0.02; gridHelper.visible = gridOn;
    helperGroup.add(gridHelper);
    // play-area boundary (fighters live within ±b)
    boundLines = squareLoop(b, 0x3a6a80, 0.5); helperGroup.add(boundLines);
    // wrap-cell boundary — the tile that repeats (bright)
    cellLines = squareLoop(per / 2, 0x53e8ff, 3); cellLines.position.y = 0.05; helperGroup.add(cellLines);
  }

  // ================================================================ RENDER LOOP
  let t = 0;
  engine.onUpdate = (dt) => { t += dt; for (const g of spinners) { const s = g.userData.spinName ? (g.getObjectByName(g.userData.spinName) || g) : g; s.rotation[g.userData.spinAxis || 'z'] += (g.userData.spin || 0.4) * dt; } };
  engine.onRender = () => { orbit.update(); if (selBox) selBox.update(); ghostGroup.visible = tilingOn; };

  // ================================================================ INITIAL BUILD
  rebuildEnv();
  rebuildHelpers();
  const startData = JSON.parse(JSON.stringify(level));
  for (const d of (level.objects || [])) addItem(d, { silent: true });
  for (const s of (level.spawns || [])) addSpawn(s.x, s.z, s.yaw, true);
  level.objects = []; level.spawns = [];   // items/spawnItems are now the source of truth

  buildUI();
  refreshAll();
  engine.start();
  window.__leveleditor = { get level() { return JSON.parse(serialize()); }, items: () => items };

  // load an existing level file into the editor if asked
  if (loadName) {
    fetch(`levels/${loadName}.json`).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) { loadLevelData(d); setHint(`Loaded “${d.name || loadName}”.`); }
      else console.error('level load: not found', loadName);
    }).catch((e) => console.error('level load failed:', e));
  }
  return engine;

  // ================================================================ UI
  function buildUI() {
    injectCss();
    // idempotent: clear any previously-built panels (so a Load can rebuild them
    // with the new level's settings)
    for (const n of root().querySelectorAll('.le-bar, .le-panel, .le-hint')) n.remove();
    // --- top bar ---
    const bar = el('div', 'le-bar');
    bar.append(
      tag('span', 'le-logo', 'ROBOTWORLD · LEVEL BUILDER'),
      btn('New', () => { if (confirm('Discard current level?')) loadLevelData(emptyLevel(level.theme)); }),
      buildOpenSelect(),
      btn('Save', () => saveSlot(prompt('Save as:', level.name) || level.name)),
      btn('Import', importJson),
      btn('Export ▾', exportJson, 'primary'),
      btn('▶ Playtest', playtest, 'go'),
      btn('?', showHelp),
    );
    root().append(bar);

    // --- left palette ---
    const pal = el('div', 'le-panel le-left');
    const search = el('input', 'le-search'); search.placeholder = 'search…';
    search.oninput = () => refreshPalette(search.value.trim().toLowerCase());
    pal.append(tag('div', 'le-h', 'PALETTE'), search);
    paletteBody = el('div', 'le-palbody'); pal.append(paletteBody);
    root().append(pal);
    setupDevPanel(pal, { key: 'leveditor.palette' });
    refreshPalette();

    // --- right panel ---
    const right = el('div', 'le-panel le-right');
    // tools
    const tools = el('div', 'le-tools');
    bMove = toolBtn('⬌ Move (G)', () => setGizmoMode('translate'));
    bRot = toolBtn('⟳ Rotate (R)', () => setGizmoMode('rotate'));
    tools.append(bMove, bRot);
    const tools2 = el('div', 'le-tools');
    tools2.append(
      toolBtn('⧉ Duplicate', () => sel && !sel.spawn && duplicateItem(sel)),
      toolBtn('🗑 Delete', () => sel && (sel.spawn ? deleteSpawn(sel) : deleteItem(sel))),
      toolBtn('↶', undo), toolBtn('↷', redo),
    );
    right.append(tag('div', 'le-h', 'TOOLS'), tools, tools2);

    // view options
    const view = el('div', 'le-tools');
    bGrid = toggleBtn('Grid snap', gridOn, (v) => { gridOn = v; if (gridHelper) gridHelper.visible = v; if (sel) attachGizmo(sel); });
    bTile = toggleBtn('Show tiling', tilingOn, (v) => { tilingOn = v; });
    view.append(bGrid, bTile);
    const gsz = el('div', 'le-row');
    gsz.append(tag('span', 'le-lbl', 'Grid'), select_(['1', '2', '4', '5', '8'], String(gridSize), (v) => { gridSize = +v; rebuildHelpers(); if (sel) attachGizmo(sel); }));
    right.append(tag('div', 'le-h', 'VIEW'), view, gsz,
      btn('⤓ Top view', () => { camera.position.set(0, P() * 0.9, 0.01); orbit.target.set(0, 0, 0); orbit.update(); }));

    // level settings
    const setg = el('div', 'le-body');
    setg.append(
      rowField('Name', level.name, (v) => { level.name = v; }),
      rowSelect('Theme', THEMES.map((t2) => ({ v: t2.id, l: t2.name })), level.theme, (v) => { pushUndo(); level.theme = v; rebuildEnv(); }),
      rowNum('Arena size', level.bounds, 40, 260, 4, (v) => { pushUndo(); level.bounds = v; rebuildEnv(); rebuildHelpers(); for (const it of items) rebuildGhosts(it); }),
      rowNum('Plaza radius', level.clearing, 10, 80, 1, (v) => { pushUndo(); level.clearing = v; rebuildEnv(); }),
      rowToggle('Paint plaza', level.plaza, (v) => { pushUndo(); level.plaza = v; rebuildEnv(); }),
    );
    right.append(tag('div', 'le-h', 'LEVEL'), setg);

    // spawns
    const sp = el('div', 'le-body');
    sp.append(btn('+ Add spawn point', () => select(addSpawn(round(rand(-30, 30)), round(rand(-30, 30))))));
    right.append(tag('div', 'le-h', 'SPAWNS'), sp);

    // inspector
    right.append(tag('div', 'le-h', 'INSPECTOR'));
    inspector = el('div', 'le-body le-insp'); right.append(inspector);

    // stats
    statsEl = el('div', 'le-stats'); right.append(statsEl);
    root().append(right);
    setupDevPanel(right, { key: 'leveditor.props', edge: 'left' });

    // bottom hint
    hintEl = el('div', 'le-hint');
    hintEl.textContent = 'Click a palette item, then click the ground to place. Click an object to select · G/R move/rotate · Del delete · Ctrl+Z undo · Esc deselect';
    root().append(hintEl);
  }

  function refreshPalette(filter) {
    if (!paletteBody) return;
    paletteBody.innerHTML = '';
    for (const grp of CATALOG) {
      const matches = grp.items.filter((it) => !filter || it.label.toLowerCase().includes(filter) || it.id.includes(filter));
      if (!matches.length) continue;
      paletteBody.append(tag('div', 'le-palh', grp.group));
      const wrap = el('div', 'le-palgrid');
      for (const it of matches) {
        const b = tag('button', 'le-palitem', it.label);
        b.title = it.hint || it.label;
        if (paletteSel && paletteSel.id === it.id) b.classList.add('on');
        b.onclick = () => {
          paletteSel = (paletteSel && paletteSel.id === it.id) ? null : it;
          marker.visible = false;
          refreshPalette(filter);
          setHint(paletteSel ? `Placing: ${it.label} — click the ground (Esc to stop)` : '');
        };
        wrap.append(b);
      }
      paletteBody.append(wrap);
    }
  }

  function setGizmoMode(m) { gizmoMode = m; if (bMove) bMove.classList.toggle('on', m === 'translate'); if (bRot) bRot.classList.toggle('on', m === 'rotate'); if (sel) attachGizmo(sel); }

  // ---- inspector -------------------------------------------------
  function buildInspector() {
    inspFields = [];
    if (!inspector) return;
    inspector.innerHTML = '';
    if (!sel) { inspector.append(tag('div', 'le-dim', 'Nothing selected.')); return; }
    const d = sel.def;
    if (sel.spawn) {
      inspector.append(tag('div', 'le-tag', 'SPAWN POINT'));
      addNum('X', () => d.x, (v) => { d.x = v; applyXform(); });
      addNum('Z', () => d.z, (v) => { d.z = v; applyXform(); });
      addNum('Facing°', () => Math.round(THREE.MathUtils.radToDeg(d.yaw)), (v) => { d.yaw = THREE.MathUtils.degToRad(v); applyXform(); });
      return;
    }
    inspector.append(tag('div', 'le-tag', (d.k === 'prop' ? d.name : d.k).toUpperCase()));
    if (d.k !== 'lane') { addNum('X', () => d.x, (v) => { d.x = v; applyXform(); }); addNum('Z', () => d.z, (v) => { d.z = v; applyXform(); }); }
    if (d.k === 'prop' || d.k === 'bridge') addNum('Rotation°', () => Math.round(THREE.MathUtils.radToDeg(d.ry || 0)), (v) => { d.ry = THREE.MathUtils.degToRad(v); applyXform(); });

    if (d.k === 'building') {
      addNum('Width (chunks)', () => d.nx, (v) => { d.nx = clampi(v, 1, 8); rebuildProxy(sel); }, 1);
      addNum('Depth (chunks)', () => d.nz, (v) => { d.nz = clampi(v, 1, 8); rebuildProxy(sel); }, 1);
      addNum('Height (chunks)', () => d.ny, (v) => { d.ny = clampi(v, 1, 16); rebuildProxy(sel); }, 1);
      addColor('Tint', () => d.tint, (v) => { d.tint = v; rebuildProxy(sel); }, (THEMES_BY_ID[level.theme] || THEMES[0]).buildings.tints);
    } else if (d.k === 'prop') {
      addNum('Scale', () => d.s || 1, (v) => { d.s = clampf(v, 0.3, 4); rebuildProxy(sel); }, 0.1);
      const cat = CATALOG_BY_ID[propCatId(d.name)];
      if (cat && cat.color) addColor('Colour', () => d.opts?.color ?? SWATCHES[0], (v) => { d.opts = { ...(d.opts || {}), color: v }; rebuildProxy(sel); }, SWATCHES);
    } else if (d.k === 'hill') {
      addToggle('Platform deck', () => !!d.deck, (v) => { d.deck = v; if (v && !d.edge) d.edge = 0x53e8ff; rebuildProxy(sel); });
      addNum('Radius', () => d.R, (v) => { d.R = clampf(v, 4, 40); rebuildProxy(sel); });
      addNum('Height', () => d.H, (v) => { d.H = clampf(v, 1, 14); rebuildProxy(sel); }, 0.5);
      addColor('Colour', () => d.color ?? 0x5a5248, (v) => { d.color = v; rebuildProxy(sel); }, SWATCHES);
      if (d.deck) addColor('Edge glow', () => d.edge ?? 0x53e8ff, (v) => { d.edge = v; rebuildProxy(sel); }, SWATCHES);
    } else if (d.k === 'bridge') {
      addSelect('Axis', [{ v: 'x', l: 'along X' }, { v: 'z', l: 'along Z' }], d.axis, (v) => { d.axis = v; rebuildProxy(sel); });
      addNum('Length', () => d.flat, (v) => { d.flat = clampf(v, 6, 40); rebuildProxy(sel); });
      addNum('Height', () => d.H, (v) => { d.H = clampf(v, 1.5, 8); rebuildProxy(sel); }, 0.5);
      addColor('Edge glow', () => d.edge ?? 0x53e8ff, (v) => { d.edge = v; rebuildProxy(sel); }, SWATCHES);
    } else if (d.k === 'lane') {
      addSelect('Axis', [{ v: 'x', l: 'along X' }, { v: 'z', l: 'along Z' }], d.axis, (v) => { d.axis = v; rebuildProxy(sel); });
      addNum('Offset', () => d.at, (v) => { d.at = v; rebuildProxy(sel); });
      addNum('Width', () => d.width, (v) => { d.width = clampf(v, 2, 16); rebuildProxy(sel); });
      addNum('Curve', () => d.amp || 0, (v) => { d.amp = clampf(v, 0, 20); rebuildProxy(sel); });
      addNum('Phase°', () => Math.round(THREE.MathUtils.radToDeg(d.phase || 0)), (v) => { d.phase = THREE.MathUtils.degToRad(v); rebuildProxy(sel); });
    }
  }
  function applyXform() {
    if (!sel) return;
    const d = sel.def, o = sel.obj3d;
    if (sel.spawn) { o.position.set(d.x, 0, d.z); o.rotation.y = d.yaw; }
    else if (d.k === 'lane') { rebuildProxy(sel); }
    else { o.position.set(d.x || 0, o.position.y, d.z || 0); o.rotation.y = d.ry || 0; syncGhostTransforms(sel); }
    updateSelBox();
  }
  function refreshInspectorValues() { for (const f of inspFields) f(); }

  // inspector field builders (each returns a refresher pushed to inspFields)
  function addNum(label, get, set, step = 1) {
    const row = el('div', 'le-row');
    const inp = el('input', 'le-num'); inp.type = 'number'; inp.step = step; inp.value = get();
    inp.onchange = () => { pushUndo(); set(parseFloat(inp.value)); };
    row.append(tag('span', 'le-lbl', label), inp); inspector.append(row);
    inspFields.push(() => { if (document.activeElement !== inp) inp.value = get(); });
  }
  function addColor(label, get, set, swatches) {
    const row = el('div', 'le-row le-colrow');
    row.append(tag('span', 'le-lbl', label));
    const wrap = el('div', 'le-swatches');
    for (const c of swatches) {
      const s = el('button', 'le-sw'); s.style.background = '#' + new THREE.Color(c).getHexString();
      s.onclick = () => { pushUndo(); set(c); refreshSw(); };
      s.dataset.c = c; wrap.append(s);
    }
    row.append(wrap); inspector.append(row);
    const refreshSw = () => { for (const s of wrap.children) s.classList.toggle('on', +s.dataset.c === (get() | 0)); };
    refreshSw(); inspFields.push(refreshSw);
  }
  function addToggle(label, get, set) {
    const row = el('div', 'le-row');
    const b = toggleBtn(label, get(), (v) => { pushUndo(); set(v); }); row.append(b); inspector.append(row);
    inspFields.push(() => b.classList.toggle('on', !!get()));
  }
  function addSelect(label, opts, cur, set) {
    const row = el('div', 'le-row'); row.append(tag('span', 'le-lbl', label), select_(opts.map((o) => o.v), cur, (v) => { pushUndo(); set(v); }, opts.map((o) => o.l))); inspector.append(row);
  }

  // ---- stats -----------------------------------------------------
  function refreshStats() {
    if (!statsEl) return;
    const bc = items.filter((i) => i.def.k === 'building').length;
    const pc = items.filter((i) => i.def.k === 'prop').length;
    const tc = items.filter((i) => ['hill', 'bridge', 'lane'].includes(i.def.k)).length;
    statsEl.textContent = `${items.length} objects  ·  ${bc} towers · ${pc} props · ${tc} terrain · ${spawnItems.length} spawns  ·  ${renderer.info.render.calls} draws`;
  }
  function refreshAll() { buildInspector(); refreshStats(); refreshPalette(); }

  // ================================================================ SAVE / LOAD / EXPORT
  function slotList() { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(LS_PREFIX) && k !== LS_AUTOSAVE) out.push(k.slice(LS_PREFIX.length)); } return out.sort(); }
  function saveSlot(name) {
    if (!name) return; level.name = name;
    localStorage.setItem(LS_PREFIX + name, serialize());
    setHint(`Saved “${name}”.`);
  }
  function autosave() { try { localStorage.setItem(LS_AUTOSAVE, serialize()); } catch { /* full */ } }
  function loadAutosave() { try { const s = localStorage.getItem(LS_AUTOSAVE); return s ? JSON.parse(s) : null; } catch { return null; } }
  // dropdown of every level you can open: the built-in / shipped levels from
  // public/levels/manifest.json, plus your own saved slots (localStorage).
  function buildOpenSelect() {
    const sel = el('select', 'le-sel le-open');
    const ph = document.createElement('option'); ph.value = ''; ph.textContent = '📂 Open level…'; sel.append(ph);
    const slots = slotList();
    if (slots.length) {
      const og = document.createElement('optgroup'); og.label = 'Saved (this browser)';
      for (const n of slots) { const o = document.createElement('option'); o.value = 'slot:' + n; o.textContent = n; og.append(o); }
      sel.append(og);
    }
    // built-in levels are fetched async, then appended
    fetch('levels/manifest.json').then((r) => r.ok ? r.json() : []).then((list) => {
      if (!Array.isArray(list) || !list.length) return;
      const og = document.createElement('optgroup'); og.label = 'Built-in levels';
      for (const n of list) { const o = document.createElement('option'); o.value = 'file:' + n; o.textContent = n; og.append(o); }
      sel.append(og);
    }).catch(() => {});
    sel.onchange = () => {
      const v = sel.value; sel.value = '';
      if (v.startsWith('slot:')) {
        const s = localStorage.getItem(LS_PREFIX + v.slice(5));
        if (s) loadLevelData(JSON.parse(s));
      } else if (v.startsWith('file:')) {
        const n = v.slice(5);
        fetch(`levels/${n}.json`).then((r) => r.ok ? r.json() : null).then((d) => {
          if (d) { loadLevelData(d); setHint(`Loaded “${d.name || n}”.`); }
          else alert('Could not load level: ' + n);
        }).catch((e) => alert('Load failed: ' + e.message));
      }
    };
    return sel;
  }
  function importJson() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { loadLevelData(JSON.parse(rd.result)); setHint('Imported.'); } catch (err) { alert('Bad level JSON: ' + err.message); } }; rd.readAsText(f); };
    inp.click();
  }
  function exportJson() {
    const data = JSON.parse(serialize());
    const txt = JSON.stringify(data, null, 2);
    navigator.clipboard?.writeText(txt).catch(() => {});
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    const fname = (level.name || 'level').replace(/\W+/g, '-').toLowerCase() + '.json';
    a.download = fname; a.click();
    showModal(`Exported <b>${fname}</b> (also copied to clipboard).<br><br>To play it in the game:<br>1. Save the file to <code>public/levels/${fname}</code><br>2. Open <code>?battle=${level.theme}&amp;level=${fname.replace('.json', '')}&amp;p1=titanus&amp;p2=viper</code><br><br>Or just hit <b>▶ Playtest</b> to try it right now.<br><br><textarea class="le-out" readonly>${txt.replace(/</g, '&lt;')}</textarea>`);
  }
  function playtest() {
    try { sessionStorage.setItem(PLAYTEST_KEY, serialize()); }
    catch { alert('Could not stash level for playtest.'); return; }
    const q = new URLSearchParams({ battle: level.theme, level: '__edit', p1: ptP1.value, p2: ptP2.value });
    window.open('?' + q.toString(), '_blank');
  }

  // ================================================================ MODALS
  let ptP1, ptP2;
  function showHelp() {
    showModal(`<h3>Level Builder</h3>
      <b>Place</b> — click a palette item, then click the ground. Keep clicking to place more; <b>Esc</b> stops.<br>
      <b>Select</b> — click any object. Drag the gizmo to move; <b>R</b> switches to rotate, <b>G</b> back to move.<br>
      <b>Nudge</b> — arrow keys move, <b>[</b> / <b>]</b> rotate 15°.<br>
      <b>Duplicate</b> Ctrl+D · <b>Delete</b> Del · <b>Undo/Redo</b> Ctrl+Z / Ctrl+Shift+Z · <b>Save</b> Ctrl+S.<br><br>
      <b>Tiling</b> — the arena wraps, so the faint copies around your tile show how it repeats in game. The bright cyan square is the wrap edge; anything crossing it reappears on the opposite side.<br><br>
      <b>Lanes</b> are cell-global streams (road/water/lava/acid/mud/…). Select one to set its offset, width and curve.<br><br>
      <b>Playtest</b> launches a live battle on your level in a new tab. <b>Export</b> writes a JSON you can drop in <code>public/levels/</code>.`);
  }
  function showModal(html) {
    const back = el('div', 'le-modalback');
    const m = el('div', 'le-modal'); m.innerHTML = html;
    // playtest mech pickers appended for export/help? only build once
    const close = btn('Close', () => back.remove(), 'primary'); close.classList.add('le-mclose');
    m.append(close); back.append(m); back.onclick = (e) => { if (e.target === back) back.remove(); };
    root().append(back);
  }

  // ================================================================ small DOM utils
  function root() { return document.getElementById('ui-root'); }
  function el(t2, cls) { const e = document.createElement(t2); if (cls) e.className = cls; e.style.pointerEvents = 'auto'; return e; }
  function tag(t2, cls, txt) { const e = el(t2, cls); if (txt != null) e.textContent = txt; return e; }
  function btn(txt, fn, kind) { const b = tag('button', 'le-btn' + (kind ? ' le-' + kind : ''), txt); b.onclick = fn; return b; }
  function toolBtn(txt, fn) { const b = tag('button', 'le-tbtn', txt); b.onclick = fn; return b; }
  function toggleBtn(txt, on, fn) { const b = tag('button', 'le-tbtn' + (on ? ' on' : ''), txt); b.onclick = () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); fn(v); }; return b; }
  function select_(vals, cur, fn, labels) { const s = el('select', 'le-sel'); vals.forEach((v, i) => { const o = document.createElement('option'); o.value = v; o.textContent = labels ? labels[i] : v; if (String(v) === String(cur)) o.selected = true; s.append(o); }); s.onchange = () => fn(s.value); return s; }
  function rowField(label, val, fn) { const r = el('div', 'le-row'); const i = el('input', 'le-txt'); i.value = val; i.onchange = () => fn(i.value); r.append(tag('span', 'le-lbl', label), i); return r; }
  function rowSelect(label, opts, cur, fn) { const r = el('div', 'le-row'); r.append(tag('span', 'le-lbl', label), select_(opts.map((o) => o.v), cur, fn, opts.map((o) => o.l))); return r; }
  function rowNum(label, val, min, max, step, fn) { const r = el('div', 'le-row'); const i = el('input', 'le-num'); i.type = 'number'; i.min = min; i.max = max; i.step = step; i.value = val; i.onchange = () => fn(clampf(+i.value, min, max)); r.append(tag('span', 'le-lbl', label), i); return r; }
  function rowToggle(label, on, fn) { const r = el('div', 'le-row'); r.append(toggleBtn(label, on, fn)); return r; }
  function setHint(s) { if (hintEl && s) hintEl.textContent = s; }
  function isTyping() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'); }

  // playtest opponent pickers live in the top bar area (hidden selects reused)
  function ensurePtPickers() {
    if (ptP1) return;
    ptP1 = document.createElement('select'); ptP2 = document.createElement('select');
    for (const s of [ptP1, ptP2]) { for (const m of ROSTER) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.name; s.append(o); } }
    ptP1.value = ROSTER[0].id; ptP2.value = ROSTER[1]?.id || ROSTER[0].id;
  }
  ensurePtPickers();

  // ---- utils ----
  function round(v) { return Math.round(v * 10) / 10; }
  function round2(v) { return Math.round(v * 1000) / 1000; }
  function clampf(v, a, b) { return Math.max(a, Math.min(b, isNaN(v) ? a : v)); }
  function clampi(v, a, b) { return Math.max(a, Math.min(b, Math.round(v) || a)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function propCatId(name) { for (const g of CATALOG) for (const it of g.items) if (it.k === 'prop' && it.name === name) return it.id; return name; }

  // Dispose a proxy. `keepShared` (ghost clones) shares geometry+materials with
  // its source proxy, so it disposes NOTHING. For a real proxy we dispose the
  // per-instance geometry always, but never the shared PROP_MATS singletons
  // (disposing those would break every other prop using them).
  function disposeObj(o, keepShared) {
    if (keepShared) return;
    o.traverse?.((c) => {
      if (!c.isMesh) return;
      c.geometry?.dispose?.();
      const m = c.material;
      if (m && !SHARED_MATS.has(m)) {
        if (m.map && m.map !== windowMat._tex) m.map.dispose?.();
        m.dispose?.();
      }
    });
  }

  function makeMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 28), new THREE.MeshBasicMaterial({ color: 0x62ff9a }));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    for (let i = 0; i < 2; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(i ? 0.2 : 5, 0.05, i ? 5 : 0.2), new THREE.MeshBasicMaterial({ color: 0x62ff9a })); g.add(bar); }
    g.userData.pos = null; return g;
  }
  function makeSpawnMarker(i) {
    const g = new THREE.Group();
    const col = [0x53e8ff, 0xff5040, 0x62ff9a, 0xffb43c][i % 4];
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.3, 24), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7 }));
    disc.position.y = 0.15; g.add(disc);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }));
    arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.9, 2.2); g.add(arrow);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 6), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2 }));
    pole.position.y = 3; g.add(pole);
    return g;
  }

  function squareLoop(h, color, width) {
    const pts = [new THREE.Vector3(-h, 0, -h), new THREE.Vector3(h, 0, -h), new THREE.Vector3(h, 0, h), new THREE.Vector3(-h, 0, h), new THREE.Vector3(-h, 0, -h)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: width }));
    m.position.y = 0.04; return m;
  }
}

// ------------------------------------------------------------------ CSS
function injectCss() {
  if (document.getElementById('le-css')) return;
  const s = document.createElement('style'); s.id = 'le-css';
  s.textContent = `
  #ui-root { pointer-events: none; }
  .le-bar { position:fixed; top:0; left:0; right:0; height:44px; display:flex; align-items:center; gap:6px; padding:0 10px;
    background:linear-gradient(#0e1420ee,#0a0f18ee); border-bottom:1px solid #223047; z-index:60; font:13px system-ui,sans-serif; }
  .le-logo { color:#7fe9ff; font-weight:700; letter-spacing:.06em; margin-right:8px; font-size:12px; }
  .le-btn { background:#182338; color:#cfe0f5; border:1px solid #2c3d57; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:12px; }
  .le-btn:hover { background:#22314c; }
  .le-btn.le-primary { background:#1f5f7a; border-color:#2c88a8; color:#eafcff; }
  .le-btn.le-go { background:#1f7a4d; border-color:#2ca86a; color:#eafff2; font-weight:600; }
  .le-panel { position:fixed; top:44px; bottom:26px; width:224px; overflow:auto; z-index:55;
    background:#0c1220e8; border:1px solid #1e2b40; font:12px system-ui,sans-serif; color:#cfe0f5; padding:8px; }
  .le-left { left:0; border-left:none; }
  .le-right { right:0; border-right:none; width:250px; }
  .le-h { color:#6f86a4; font-size:10px; letter-spacing:.08em; text-transform:uppercase; margin:10px 2px 4px; border-top:1px solid #1a2740; padding-top:8px; }
  .le-h:first-child { border-top:none; padding-top:0; margin-top:2px; }
  .le-search, .le-txt, .le-num, .le-sel { width:100%; background:#0a0f18; color:#dfe8f5; border:1px solid #263650; border-radius:5px; padding:4px 6px; font-size:12px; box-sizing:border-box; }
  .le-open { width:auto; background:#182338; border-color:#2c3d57; cursor:pointer; }
  .le-palh { color:#5f86b0; font-size:10px; margin:8px 2px 3px; letter-spacing:.05em; }
  .le-palgrid { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
  .le-palitem { background:#141d30; color:#cbd9ee; border:1px solid #24344e; border-radius:5px; padding:5px 4px; cursor:pointer; font-size:11px; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .le-palitem:hover { background:#1d2b45; }
  .le-palitem.on { background:#1f6f8f; border-color:#3fbfe0; color:#eafcff; }
  .le-tools { display:flex; gap:4px; margin:4px 0; }
  .le-tbtn { flex:1; background:#141d30; color:#cbd9ee; border:1px solid #24344e; border-radius:5px; padding:6px 4px; cursor:pointer; font-size:11px; }
  .le-tbtn:hover { background:#1d2b45; }
  .le-tbtn.on { background:#1f6f8f; border-color:#3fbfe0; color:#eafcff; }
  .le-row { display:flex; align-items:center; gap:6px; margin:4px 0; }
  .le-lbl { color:#8ea3bf; font-size:11px; min-width:80px; }
  .le-body { margin-bottom:4px; }
  .le-tag { color:#7fe9ff; font-weight:700; font-size:11px; letter-spacing:.05em; margin:2px 0 6px; }
  .le-dim { color:#5f7089; font-style:italic; }
  .le-colrow { align-items:flex-start; }
  .le-swatches { display:flex; flex-wrap:wrap; gap:3px; }
  .le-sw { width:18px; height:18px; border-radius:4px; border:2px solid #0a0f18; cursor:pointer; }
  .le-sw.on { border-color:#fff; }
  .le-stats { color:#6f86a4; font-size:10.5px; margin-top:10px; border-top:1px solid #1a2740; padding-top:6px; }
  .le-hint { position:fixed; left:0; right:0; bottom:0; height:26px; line-height:26px; z-index:60; padding:0 12px;
    background:#0a0f18ee; border-top:1px solid #1e2b40; color:#7f93af; font:11px system-ui,sans-serif; overflow:hidden; white-space:nowrap; }
  .le-modalback { position:fixed; inset:0; background:#03060cc0; z-index:100; display:flex; align-items:center; justify-content:center; }
  .le-modal { background:#0e1626; border:1px solid #26405e; border-radius:10px; padding:22px; max-width:560px; color:#d6e4f5; font:13px/1.55 system-ui,sans-serif; box-shadow:0 20px 60px #000a; }
  .le-modal h3 { margin:0 0 10px; color:#7fe9ff; }
  .le-modal code { background:#0a1220; padding:1px 5px; border-radius:4px; color:#8fe6b0; font-size:12px; }
  .le-out { width:100%; height:150px; margin-top:10px; background:#080d16; color:#8fe6b0; border:1px solid #223047; border-radius:6px; font:11px ui-monospace,monospace; }
  .le-mclose { margin-top:14px; }
  `;
  document.head.append(s);
}
