// /workbench/?edit=level — THE ARENA EDITOR.
//
// This is an editor of ARENAS, not a blank-canvas builder. Pick one of the 12
// shipped arenas from the top bar and the editor BAKES it: the arena is built
// for real, exactly as a match would build it, and everything in it — every
// massed tower, every prop with its own yaw and seed, the lanes, hills,
// bridges, pools and the elevated loop — comes back as objects you can click.
// From there you move, turn, copy and delete things in the viewport, and add
// new ones from a palette that stays out of the way until you ask for it.
// (src/arena/bake.js does the reading; Arena writes its own `recipe` as it
// places, so there is no second copy of the generation rules here.)
//
// Interaction model — the point of the redesign is that the WORK happens on
// screen, not in a panel:
//   · click an object to select it, shift-click to add, shift-drag empty space
//     to marquee a whole block
//   · DRAG a selected object to move it (the whole selection travels together)
//   · ALT-drag to leave a copy behind
//   · a small toolbar rides above the selection: turn, copy, delete
//   · R puts the gizmo in rotate mode around the selection's own centre
// The right panel only appears when something is selected, and the palette is
// a drawer behind ＋ ADD.
//
// Design notes:
// - Like every workbench, this tool imports NO GAME CODE. Arenas, themes,
//   props, the palette, the level format and the playtest hand-off all arrive
//   through `config.arena` (workbench/config/contract.js documents it,
//   workbench/adapters/mechmayhem/ answers it). three.js is not game code —
//   it is the renderer both sides share — so it is imported directly.
// - The environment (sky, lights, ground, spawn plaza) is a real arena stage
//   built from the current theme with no placed objects, so it looks in-game.
//   It's rebuilt only when the theme / size / plaza changes.
// - Everything you place is a lightweight editor proxy in `worldGroup`; the 8
//   tiling ghosts are clones. Nothing here mutates the shared prop materials.
// - Undo/redo snapshots the whole level as JSON (cheap + bulletproof).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setupDevPanel } from '../ui/panel.js';
import { addGizmo } from '../ui/gizmo.js';

const WRAP = 1.35;                 // arena wrapHalf = bounds * 1.35
const LS_PREFIX = 'rw_level:';     // saved-slot keys
const LS_AUTOSAVE = 'rw_level:__autosave';

// kinds that live across the whole wrap cell rather than at an (x,z) — they
// get no tiling ghosts, and a drag adjusts their centreline offset
const GLOBAL_KINDS = new Set(['lane', 'viaduct']);
// kinds that turn about Y (a chunk tower stays axis-aligned)
const TURNABLE = new Set(['prop', 'bridge', 'spawn']);
const _bar = new THREE.Vector3();  // scratch, for projecting the selection anchor
const DEFAULT_HINT = 'Drag an object to move it · shift-click adds to the selection · shift-drag marquees · R turns · Alt-drag copies · ＋ ADD for new pieces';

export async function runLevelWorkbench(config, params) {
  const AR = config.arena;
  const THEMES = AR.themes();
  const THEME_NAME = (id) => THEMES.find((t) => t.id === id)?.name || id;
  const IS_THEME = (id) => THEMES.some((t) => t.id === id);
  const CATALOG = AR.palette();
  const SWATCHES = AR.swatches();
  const SHARED_MATS = AR.sharedMaterials();   // never dispose these
  const LEVEL_VERSION = AR.version;

  const engine = config.stage.engine(document.getElementById('game-canvas'));
  const { scene, camera, renderer } = engine;

  // ---------------------------------------------------------------- state
  // ?edit=level&arena=<theme>  opens a shipped arena, BAKED for editing
  // ?edit=level&theme=<theme>  opens a BLANK level on that theme (as it always did)
  // ?edit=level&load=<name>    opens public/levels/<name>.json
  // otherwise: resume the autosave, else bake the default arena.
  const loadName = params.get('load');
  const arenaName = params.get('arena');
  const blankTheme = params.get('theme');
  let level = AR.blank('neon');
  let items = [];          // { id, def, obj3d, ghosts:[] } — EVERY editable thing
  let sel = [];            // current selection (array — multi-select is normal)
  let paletteSel = null;   // active palette entry (place mode) or null
  let idSeq = 1;
  const nextId = () => 'o' + (idSeq++);

  let gridOn = true, gridSize = 2, tilingOn = true, gizmoMode = 'translate';
  // who fights when you hit Playtest (set in the settings modal). Plain ids
  // rather than <select> elements: everything the UI builds lives below the
  // `return engine`, so a handle declared down there is never initialised —
  // which is exactly why Playtest used to throw on its own mech pickers.
  const FIGHTERS = AR.fighters();
  let ptP1 = FIGHTERS[0].id, ptP2 = FIGHTERS[1]?.id || FIGHTERS[0].id;
  let bakeSeed = +(params.get('seed') || 7) || 7;
  let sourceLabel = '';    // what the top bar says we are editing
  const spinners = [];     // editor proxies that idle-spin for life

  // UI element handles (assigned in buildUI / rebuilt on load)
  let drawer, drawerBody, fabEl, inspector, inspPanel, statsEl, hintEl;
  let selBar, arenaSel, seedRow;
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

  camera.position.set(0, 150, 140);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0, 0);
  orbit.maxPolarAngle = Math.PI * 0.495;   // stay above ground
  orbit.update();

  // The gizmo hangs off a PIVOT at the selection's centre, never off an object:
  // one selected thing and twenty behave identically, and a rotation turns the
  // group about its own middle instead of spinning each item in place.
  const pivot = new THREE.Object3D();
  scene.add(pivot);
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSpace('local');
  gizmo.setSize(0.85);
  // Shift already means "add to the selection" and "drag a marquee" here, and
  // both of those were losing to the rotate ring parked over the selection —
  // so Shift takes the handles off screen too (ui/gizmo.js).
  addGizmo(scene, gizmo);
  gizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    if (e.value) { dragSnapshot = serialize(); pivotStart.copy(pivot.position); pivotYaw0 = pivot.rotation.y; captureSelStart(); }
    else commitDrag();
  });
  gizmo.addEventListener('objectChange', onGizmoChange);
  let dragSnapshot = null;
  const pivotStart = new THREE.Vector3();
  let pivotYaw0 = 0;

  // selection outlines
  const selBoxes = [];

  // placement marker (a ring + crosshair where the next object lands)
  const marker = makeMarker();
  helperGroup.add(marker); marker.visible = false;

  // marquee (shift-drag box select)
  let marqueeEl = null, marqueeStart = null;

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ================================================================ ENV
  function rebuildEnv() {
    if (envArena) { envArena.dispose(); envArena = null; }
    // the themed environment with NO placed objects — sky, lights, ground and
    // the spawn plaza. Everything else on it is an editor proxy.
    envArena = AR.stage(engine, level);
  }

  // ================================================================ BAKING AN ARENA
  // Build the chosen arena for real, read it back as a level, throw the build
  // away. Anything the editor can't hold onto would be a fidelity bug, so this
  // deliberately goes through the game's own arena builder.
  function bakeArena(themeId, seed) {
    const tmp = AR.build(engine, themeId, seed);
    const baked = AR.bake(tmp, { name: `${THEME_NAME(themeId)} (edit)` });
    tmp.dispose();
    return baked;
  }

  // AN ARENA THAT HAS BEEN AUTHORED OPENS FROM ITS FILE. Baking is how you
  // edit a city the GENERATOR wrote; once someone has laid one out by hand,
  // that file is what the game plays, and re-baking it here would hand them a
  // procedural roll of the same theme wearing its name — every edit made on
  // top of the wrong city, and a save quietly reverting their work. So the
  // authored file wins whenever there is one, and `fresh` (the seed ⟳ button,
  // or an explicit &seed= in the url) is how you deliberately ask for a
  // generated layout anyway.
  function openArena(themeId, seed, { fresh = false } = {}) {
    const authored = !fresh && AR.authoredLevel?.(themeId);
    if (authored) {
      setHint(`Loading ${THEME_NAME(themeId)}…`);
      AR.levels.load(authored).then((d) => {
        if (!d) return openArena(themeId, seed, { fresh: true }); // no file: generate one
        loadLevelData(d);
        sourceLabel = `${THEME_NAME(themeId)} · authored (${authored})`;
        setHint(`${(d.objects || []).length} objects loaded from the authored ${THEME_NAME(themeId)}`
          + ' — this is the arena the game plays. seed ⟳ builds a procedural one instead.');
        refreshSource();
      }).catch(() => openArena(themeId, seed, { fresh: true }));
      return;
    }
    setHint(`Baking ${THEME_NAME(themeId)}…`);
    // one frame of breathing room so the hint actually paints before the
    // (synchronous, ~half-second) arena build blocks the thread
    requestAnimationFrame(() => {
      const baked = bakeArena(themeId, seed);
      loadLevelData(baked);
      sourceLabel = `${THEME_NAME(themeId)} · seed ${seed}`;
      setHint(`${baked.objects.length} objects loaded from ${sourceLabel}. Click anything to edit it.`);
      refreshSource();
    });
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
    // A STRUCTURE IS NOT A TOWER. `struct` names one of the game's landform
    // kinds (crystal spire, basalt cliff, berg, snow drift) and the adapter
    // builds its stand-in out of the game's own silhouette, chunk shape and
    // material — drawing it here as a windowed office block would be the
    // editor showing you a different arena from the one it just baked.
    if (def.struct) {
      const s = AR.structure?.(def);
      if (s) return s;
    }
    const g = new THREE.Group();
    const cw = def.cw || 3.5, ch = def.ch || 3.3, cd = def.cd || 3.5;
    const m = windowMat(def.tint ?? 0x8a90a0);
    const t = m.map.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    m.map = t;
    let body;
    if (def.cells?.length) {
      // A BAKED TOWER keeps its massing: setbacks, ziggurat tiers, warehouse
      // spines. Drawn as one merged geometry — 30 towers of 80 cells each,
      // times the 9 tiling copies, is not 21600 meshes worth of silhouette.
      const nx = def.nx || cellSpan(def.cells, 'gx'), nz = def.nz || cellSpan(def.cells, 'gz');
      const geos = [];
      const box = new THREE.BoxGeometry(cw, ch, cd);
      for (const c of def.cells) {
        const gcopy = box.clone();
        gcopy.translate((c.gx - (nx - 1) / 2) * cw, c.gy * ch + ch / 2, (c.gz - (nz - 1) / 2) * cd);
        geos.push(gcopy);
      }
      box.dispose();
      body = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos, false), m);
      for (const q of geos) q.dispose();
      t.repeat.set(1, 1);
    } else {
      const w = (def.nx || 2) * cw, h = (def.ny || 4) * ch, d = (def.nz || 2) * cd;
      t.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
      body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      body.position.y = h / 2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.5, d * 1.02),
        new THREE.MeshStandardMaterial({ color: 0x40464e, roughness: 0.9 }));
      roof.position.y = h + 0.2; g.add(roof);
    }
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    return g;
  }
  function cellSpan(cells, key) { let m = 0; for (const c of cells) m = Math.max(m, c[key]); return m + 1; }

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

  // A ribbon following a periodic centreline across the whole cell, built about
  // a ZERO offset — the group's own position carries `at`, so dragging the
  // ribbon sideways is just a translate and reads back as the new offset.
  function ribbon(def, { width, y, thickness = 0, color, opacity }) {
    const per = P(), half = width / 2, N = 96;
    const positions = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const along = -per / 2 + (i / N) * per;
      const c = (def.amp || 0) * Math.sin((Math.PI * 2 * along) / per + (def.phase || 0));
      if (def.axis === 'z') { positions.push(c - half, 0, along, c + half, 0, along); }
      else { positions.push(along, 0, c - half, along, 0, c + half); }
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat); m.position.y = y; m.renderOrder = 2;
    const g = new THREE.Group(); g.add(m);
    if (thickness) {   // a raised deck gets a body under it so it reads as solid
      const under = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: 0x2a2f36, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      under.position.y = y - thickness; g.add(under);
    }
    return g;
  }

  function buildLaneProxy(def) {
    return ribbon(def, {
      width: def.width ?? 6, y: 0.06,
      color: def.glow || def.color || laneColor(def.kind), opacity: 0.5,
    });
  }
  function buildViaductProxy(def) {
    const g = ribbon(def, { width: def.w ?? 7.5, y: def.h ?? 6.8, thickness: 0.9, color: def.edge || 0x8fa4c0, opacity: 0.55 });
    // piers, so the loop's footprint is visible from the ground
    const per = P(), every = Math.max(1, def.pylonEvery ?? 3), nSeg = Math.max(24, Math.round(per / 6));
    const pm = new THREE.MeshStandardMaterial({ color: def.color ?? 0x3a3f46, roughness: 0.85 });
    for (let i = 0; i < nSeg; i += every) {
      const along = -per / 2 + (i + 0.5) * (per / nSeg);
      const c = (def.amp || 0) * Math.sin((Math.PI * 2 * along) / per + (def.phase || 0));
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, def.h ?? 6.8, 6), pm);
      col.position.set(def.axis === 'z' ? c : along, (def.h ?? 6.8) / 2, def.axis === 'z' ? along : c);
      g.add(col);
    }
    return g;
  }
  function laneColor(kind) {
    return ({ road: 0x555a62, water: 0x2e86b0, lava: 0xff5a10, acid: 0x7bff2a, mud: 0x4a3a22,
      oil: 0x2c3a44, ice: 0x9be8ff, crystal: 0xb46bff, sand: 0x8a704c, canal: 0x53e8ff, stripe: 0x53e8ff }[kind]) || 0x888888;
  }
  function patchColor(kind) {
    return ({ lake: 0x2e86b0, water: 0x2e86b0, lava: 0xff5a10, acid: 0x7bff2a, oil: 0x2c3a44,
      mud: 0x4a3a22, ice: 0x9be8ff, sand: 0x8a704c, grass: 0x4f9a44, ash: 0x4a4640,
      void: 0x0a0d14, lowgrav: 0x1e2a3c }[kind]) || 0x777777;
  }

  function buildPatchProxy(def) {
    const g = new THREE.Group();
    const col = def.glow || def.color || patchColor(def.kind);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(def.r ?? 9, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.07; disc.renderOrder = 2;
    g.add(disc);
    return g;
  }

  function buildPropProxy(def) {
    const g = AR.prop(def.name, { ...(def.opts || {}), seed: def.opts?.seed || def.seed || 1, ry: 0 });
    if (!g) return new THREE.Group();
    if (def.s && def.s !== 1) g.scale.setScalar(def.s);
    if (g.userData.spin) spinners.push(g);
    return g;
  }

  function buildSpawnProxy(def, i) {
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

  // build the editor proxy for any object def, positioned/rotated per def
  function buildProxy(def, idx = 0) {
    let g;
    if (def.k === 'building') g = buildBuildingProxy(def);
    else if (def.k === 'hill') g = buildHillProxy(def);
    else if (def.k === 'bridge') g = buildBridgeProxy(def);
    else if (def.k === 'lane') g = buildLaneProxy(def);
    else if (def.k === 'viaduct') g = buildViaductProxy(def);
    else if (def.k === 'patch') g = buildPatchProxy(def);
    else if (def.k === 'spawn') g = buildSpawnProxy(def, idx);
    else g = buildPropProxy(def);
    placeProxy(g, def);
    return g;
  }

  // where a proxy sits. Cell-global kinds ride their perpendicular offset;
  // everything else stands at (x, groundY, z).
  function placeProxy(g, def) {
    if (GLOBAL_KINDS.has(def.k)) {
      g.position.set(def.axis === 'z' ? (def.at || 0) : 0, 0, def.axis === 'z' ? 0 : (def.at || 0));
      return;
    }
    g.position.set(def.x || 0, seatY(def), def.z || 0);
    g.rotation.y = def.k === 'bridge' ? (def.axis === 'x' ? Math.PI / 2 : 0) : (def.ry || def.yaw || 0);
  }

  // Props ride the hillside in game (Arena seats authored props on
  // terrain.heightAt), so they do here — otherwise a prop baked onto a mound
  // looks buried the moment you open the arena.
  const FLAT_KINDS = new Set(['hill', 'bridge', 'patch', 'spawn']);
  function seatY(def) {
    if (FLAT_KINDS.has(def.k) || def.k === 'building') return 0;
    return groundYAt(def.x || 0, def.z || 0);
  }
  function groundYAt(x, z) {
    let y = 0;
    for (const it of items) {
      const d = it.def;
      if (d.k !== 'hill') continue;
      const dist = Math.hypot(x - d.x, z - d.z);
      const R = d.R ?? 12, Rtop = d.Rtop ?? R * (d.deck ? 0.72 : 0.34), H = d.H ?? 3.5;
      if (dist >= R) continue;
      y = Math.max(y, dist <= Rtop ? H : H * (R - dist) / (R - Rtop));
    }
    return y;
  }

  // ================================================================ ITEM CRUD
  function addItem(def, { silent } = {}) {
    if (!silent) pushUndo();
    def = { ...def };
    // the elevated loop is a singleton — placing one replaces the old one
    if (def.k === 'viaduct') { for (const o of items.filter((i) => i.def.k === 'viaduct')) removeItem(o); }
    const idx = def.k === 'spawn' ? items.filter((i) => i.def.k === 'spawn').length : 0;
    const it = { id: def.id || nextId(), def, obj3d: buildProxy(def, idx), ghosts: [] };
    it.def.id = it.id;
    worldGroup.add(it.obj3d);
    rebuildGhosts(it);
    items.push(it);
    refreshStats();
    return it;
  }

  // Fetch the imported models this level's props use, then rebuild the props
  // that got one so the editor shows the model the game will place. Tracked so
  // a level swap mid-fetch cannot rebuild the props of the level you left, and
  // so each model is only ever asked for once per session.
  let propModelToken = 0;
  const propModelsAsked = new Set();
  function ensurePropModels(objects) {
    if (!AR.preloadProps) return;
    const want = [...new Set(objects.filter((o) => o.k === 'prop').map((o) => o.name))]
      .filter((n) => !propModelsAsked.has(n));
    if (!want.length) return;
    want.forEach((n) => propModelsAsked.add(n));
    const token = ++propModelToken;
    AR.preloadProps(want).then(() => {
      if (token !== propModelToken) return;             // a different level is loaded now
      const named = new Set(want);
      for (const it of items) if (it.def.k === 'prop' && named.has(it.def.name)) rebuildProxy(it);
    }).catch(() => { /* no model: the procedural build stands, as in game */ });
  }

  function rebuildProxy(it) {
    // preserve which item; swap the 3D object after a shape/param change
    worldGroup.remove(it.obj3d); disposeObj(it.obj3d);
    const idx = it.def.k === 'spawn' ? items.filter((i) => i.def.k === 'spawn').indexOf(it) : 0;
    it.obj3d = buildProxy(it.def, idx);
    worldGroup.add(it.obj3d);
    rebuildGhosts(it);
    refreshSelBoxes();
  }

  function rebuildGhosts(it) {
    for (const gh of it.ghosts) { ghostGroup.remove(gh); disposeObj(gh, true); }
    it.ghosts.length = 0;
    if (GLOBAL_KINDS.has(it.def.k)) return;   // already span the whole cell
    const per = P();
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
      if (!gx && !gz) continue;
      const c = it.obj3d.clone(true);
      c.position.set(it.obj3d.position.x + gx * per, it.obj3d.position.y, it.obj3d.position.z + gz * per);
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

  function removeItem(it) {
    worldGroup.remove(it.obj3d); disposeObj(it.obj3d);
    for (const gh of it.ghosts) { ghostGroup.remove(gh); disposeObj(gh, true); }
    items = items.filter((x) => x !== it);
    if (sel.includes(it)) sel = sel.filter((x) => x !== it);
  }

  function deleteSelection() {
    if (!sel.length) return;
    pushUndo();
    const n = sel.length;
    for (const it of sel) removeItem(it);
    select([]);
    refreshStats();
    setHint(`Deleted ${n} object${n === 1 ? '' : 's'}.`);
  }

  // copy the selection. `offset` false is the alt-drag case: the copies land on
  // top of the originals and the drag carries them off.
  function duplicateSelection(offset = true) {
    if (!sel.length) return [];
    pushUndo();
    const made = [];
    for (const it of sel) {
      if (it.def.k === 'viaduct') continue;     // singleton
      const d = { ...it.def, id: undefined };
      if (offset) { if (GLOBAL_KINDS.has(d.k)) d.at = (d.at || 0) + 10; else { d.x = (d.x || 0) + 6; d.z = (d.z || 0) + 6; } }
      made.push(addItem(d, { silent: true }));
    }
    select(made);
    return made;
  }

  // ================================================================ SELECTION
  function select(list) {
    sel = Array.isArray(list) ? list.filter(Boolean) : (list ? [list] : []);
    refreshSelBoxes();
    updatePivot();
    buildInspector();
    refreshSelBar();
  }
  function toggleSel(it) {
    if (sel.includes(it)) select(sel.filter((x) => x !== it));
    else select([...sel, it]);
  }
  const selTop = new THREE.Vector3();   // where the floating toolbar hangs
  const selRings = [];                  // one per selected item, index-matched
  function refreshSelBoxes() {
    for (const b of selBoxes) { helperGroup.remove(b); b.geometry?.dispose(); b.material?.dispose?.(); }
    selBoxes.length = 0; selRings.length = 0;
    if (!sel.length) return;
    // The toolbar's anchor is measured HERE and not per frame: Ctrl+A selects a
    // few hundred objects and boxing all of them every frame is a stutter.
    const box = new THREE.Box3(), one = new THREE.Box3();
    for (const it of sel) {
      const b = new THREE.BoxHelper(it.obj3d, 0x53e8ff);
      helperGroup.add(b); selBoxes.push(b);
      one.setFromObject(it.obj3d);
      box.union(one);
      // A wireframe box is one pixel wide and vanishes at arena zoom, so the
      // thing that actually says "this one" is a ring on the ground under it —
      // drawn through whatever is in front, which is how you find a selected
      // prop tucked behind a tower.
      const r = Math.max(1.5, Math.max(one.max.x - one.min.x, one.max.z - one.min.z) / 2 + 1);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + Math.max(0.35, r * 0.06), 40),
        new THREE.MeshBasicMaterial({ color: 0x53e8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set((one.min.x + one.max.x) / 2, 0.12, (one.min.z + one.max.z) / 2);
      ring.renderOrder = 900;
      ring.userData.off = new THREE.Vector2(ring.position.x - it.obj3d.position.x, ring.position.z - it.obj3d.position.z);
      helperGroup.add(ring); selBoxes.push(ring); selRings.push(ring);
    }
    selTop.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  }
  // a drag moves the helpers rather than rebuilding them — a marquee can hold
  // a few hundred objects and rebuilding that much geometry per pointermove is
  // a stutter you feel
  function syncSelHelpers() {
    for (let i = 0; i < selRings.length; i++) {
      const it = sel[i], ring = selRings[i];
      if (!it) continue;
      const off = ring.userData.off;
      ring.position.set(it.obj3d.position.x + off.x, 0.12, it.obj3d.position.z + off.y);
    }
    if (sel.length) { selTop.x = 0; selTop.z = 0; for (const it of sel) { selTop.x += it.obj3d.position.x / sel.length; selTop.z += it.obj3d.position.z / sel.length; } }
  }
  function selCentre() {
    const c = new THREE.Vector3();
    if (!sel.length) return c;
    for (const it of sel) c.add(it.obj3d.position);
    return c.multiplyScalar(1 / sel.length);
  }
  function updatePivot() {
    if (!sel.length) { gizmo.detach(); return; }
    // THE GIZMO IS ONLY FOR TURNING. Moving is a plain drag on the object
    // itself, so a translate gizmo would only sit on top of the thing you want
    // to grab and eat the drag — which is exactly what it did.
    const canTurn = sel.length > 1 || sel.every((it) => TURNABLE.has(it.def.k));
    if (gizmoMode !== 'rotate' || !canTurn) { gizmo.detach(); return; }
    pivot.position.copy(selCentre());
    pivot.rotation.set(0, 0, 0);
    gizmo.attach(pivot);
    gizmo.setMode('rotate'); gizmo.showX = false; gizmo.showZ = false; gizmo.showY = true;
    gizmo.setRotationSnap(gridOn ? THREE.MathUtils.degToRad(15) : null);
  }
  function setGizmoMode(m) {
    gizmoMode = m;
    updatePivot();
    refreshSelBar();
  }

  // ---- the shared move/turn maths -------------------------------------
  // Every way of shifting the selection (gizmo drag, direct drag, arrow keys)
  // funnels through these two, so they can't disagree about what a move means.
  let selStart = [];
  function captureSelStart() {
    selStart = sel.map((it) => ({
      it, x: it.def.x || 0, z: it.def.z || 0, at: it.def.at || 0,
      ry: it.def.ry ?? it.def.yaw ?? 0,
    }));
  }
  function applyMove(dx, dz, yaw = 0, about = null) {
    const c = about || selCentre();
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const s of selStart) {
      const d = s.it.def;
      if (GLOBAL_KINDS.has(d.k)) {
        // a cell-global stream only has one degree of freedom: its offset
        d.at = wrapAt(round(s.at + (d.axis === 'z' ? dx : dz)));
      } else {
        let nx = s.x + dx, nz = s.z + dz;
        if (yaw) {
          const rx = nx - c.x, rz = nz - c.z;
          nx = c.x + rx * cos + rz * sin; nz = c.z - rx * sin + rz * cos;
        }
        d.x = round(nx); d.z = round(nz);
        if (yaw && TURNABLE.has(d.k)) {
          if (d.k === 'spawn') d.yaw = round2(s.ry + yaw); else d.ry = round2(s.ry + yaw);
        }
      }
      placeProxy(s.it.obj3d, d);
      syncGhostTransforms(s.it);
    }
    syncSelHelpers();
    refreshInspectorValues();
  }
  function wrapAt(v) { const p = P(); let x = (v + p / 2) % p; if (x < 0) x += p; return round(x - p / 2); }

  function onGizmoChange() {
    if (!sel.length) return;
    applyMove(0, 0, pivot.rotation.y - pivotYaw0, pivotStart);
  }
  // A DRAG THE BROWSER TOOK AWAY is put back where it started. The pre-drag
  // state is already on the undo stack (pushUndo runs the moment a move
  // begins), so restoring it is that entry, popped rather than left behind —
  // the user did not perform an edit, so there is nothing to undo afterwards.
  function cancelDrag() {
    dragSnapshot = null;
    if (undoStack.length) loadLevelData(JSON.parse(undoStack.pop()), true);
    setHint('Drag cancelled — the browser took the pointer.');
  }
  function clearMarquee() {
    if (marqueeEl) { marqueeEl.remove(); marqueeEl = null; }
  }

  function commitDrag() {
    if (dragSnapshot) { undoStack.push(dragSnapshot); redoStack.length = 0; trimUndo(); dragSnapshot = null; }
    // ghosts are cheap clones but not free — resettle them once, at the end of
    // the drag, rather than on every pointermove
    for (const it of sel) if (!GLOBAL_KINDS.has(it.def.k)) rebuildGhosts(it);
    reseatProps();
    updatePivot();
    autosave();
  }

  // ================================================================ PICKING
  function toNdc(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function groundHit(e) {
    toNdc(e); ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(groundPlane, p) ? p : null;
  }
  function pickItem(e) {
    toNdc(e); ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(worldGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.parent !== worldGroup) o = o.parent;   // rise to the item root
      if (o) { const it = items.find((x) => x.obj3d === o); if (it) return it; }
    }
    return null;
  }
  function snap(v) { return gridOn ? Math.round(v / gridSize) * gridSize : round(v); }

  // ================================================================ PLACEMENT
  function placeFromPalette(p) {
    const world = marker.userData.pos;
    if (!world) return;
    let def;
    if (p.k === 'lane') {
      const axis = Math.abs(world.x) > Math.abs(world.z) ? 'x' : 'z';
      const at = axis === 'z' ? snap(world.x) : snap(world.z);
      def = { k: 'lane', kind: p.kind, style: p.style || p.kind, axis, at, amp: 0, phase: 0, width: 6, glow: p.glow || null, dash: p.dash || null, color: p.color || null };
    } else if (p.k === 'viaduct') {
      const axis = Math.abs(world.x) > Math.abs(world.z) ? 'x' : 'z';
      def = { k: 'viaduct', axis, at: axis === 'z' ? snap(world.x) : snap(world.z), amp: 0, phase: 0, h: 6.8, w: 7.5, rampL: 14, r0: 0, pylonEvery: 3, color: 0x3a3f46, edge: null };
    } else if (p.k === 'building' && p.struct) {
      // A LANDFORM CARRIES NO SILHOUETTE OF ITS OWN: `struct` names the kind
      // and the game grows the cells from where it stands, so the rock the
      // proxy draws is the rock the match builds. No nx/ny/nz — those are a
      // tower's footprint and would only be a second, disagreeing answer.
      def = { k: 'building', struct: p.struct, x: snap(world.x), z: snap(world.z) };
    } else if (p.k === 'building') {
      def = { k: 'building', x: snap(world.x), z: snap(world.z), nx: 2, ny: 5, nz: 2, cw: 3.6, ch: 3.3, cd: 3.6, tint: AR.tints(level.theme)[0] };
    } else if (p.k === 'hill') {
      def = { k: 'hill', x: snap(world.x), z: snap(world.z), R: 13, H: 4, deck: !!p.deck, color: p.deck ? 0x515a68 : undefined, edge: p.deck ? 0x53e8ff : undefined };
    } else if (p.k === 'bridge') {
      def = { k: 'bridge', x: snap(world.x), z: snap(world.z), axis: 'x', flat: 12, H: 3.2, color: AR.bridgeColor(level.theme), edge: 0x53e8ff };
    } else if (p.k === 'patch') {
      def = { k: 'patch', kind: p.kind, x: snap(world.x), z: snap(world.z), r: 9, glow: p.glow ?? null, color: null };
    } else if (p.k === 'spawn') {
      def = { k: 'spawn', x: snap(world.x), z: snap(world.z), yaw: Math.atan2(-world.x, -world.z) };
    } else { // prop
      def = { k: 'prop', name: p.name, x: snap(world.x), z: snap(world.z), ry: 0, s: 1, opts: {} };
      if (p.color) def.opts.color = SWATCHES[0];
      ensurePropModels([def]);   // first one of its kind: fetch its model too
    }
    select([addItem(def)]);
  }

  // ================================================================ POINTER
  // Left-drag on an object MOVES it (that is the whole redesign); left-drag on
  // empty ground is left to OrbitControls, and shift-drag on empty ground draws
  // a marquee.
  // ONE POINTER, ONE OWNER. This listener runs in the CAPTURE phase, ahead of
  // OrbitControls' own — which is the whole point. OrbitControls was
  // constructed first, so on a plain listener it saw every press first, took
  // pointer capture and started a rotate; we then set `orbit.enabled = false`
  // mid-gesture to move the object, which does not end the gesture it had
  // already begun — it only stops it being updated. Its pointer bookkeeping was
  // then left holding a press that would never be handed back cleanly, and a
  // drag that ended abnormally (a pointercancel from the trackpad, a release
  // off-window) left it stuck for good: the camera stopped answering the mouse
  // while `orbit.enabled` still read true, and every further interrupted drag
  // made it worse. That is the "I slowly lose the ability to move around".
  //
  // So the decision is made BEFORE OrbitControls sees the press: if this drag
  // belongs to the editor, the event is stopped here and the controls never
  // start a gesture at all. Nothing to leak, by construction.
  let down = null;          // { x, y, item, ground, mode }
  renderer.domElement.addEventListener('pointerdown', (e) => {
    // the gizmo owns the pointer whenever it is hovered or held
    if (e.button !== 0 || gizmo.dragging || gizmo.axis) return;
    const it = paletteSel ? null : pickItem(e);
    const g = groundHit(e);
    down = { x: e.clientX, y: e.clientY, item: it, ground: g, moved: false, mode: null, alt: e.altKey, shift: e.shiftKey, id: e.pointerId };
    if (it && !e.shiftKey) {
      // dragging something not in the selection selects it first, so a drag is
      // never a surprise operation on an old selection
      if (!sel.includes(it)) select([it]);
      down.mode = 'move';
    } else if (!it && e.shiftKey) {
      down.mode = 'marquee';
      marqueeStart = { x: e.clientX, y: e.clientY };
    }
    if (!down.mode) return;                 // camera drag: leave it to the controls
    e.stopPropagation();                    // ...this one is ours, and only ours
    orbit.enabled = false;
    // and OUR gesture is captured, so its end is guaranteed to arrive even if
    // the release happens outside the window
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* fine */ }
  }, true);

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (down && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
      down.moved = true;
      if (down.mode === 'move') {
        pushUndo();
        if (down.alt) duplicateSelection(false);    // alt-drag leaves a copy behind
        captureSelStart();
        setHint('Moving — release to drop · Esc cancels');
      }
    }
    if (down?.moved && down.mode === 'move' && down.ground) {
      const g = groundHit(e);
      if (g) {
        const dx = g.x - down.ground.x, dz = g.z - down.ground.z;
        applyMove(gridOn ? Math.round(dx / gridSize) * gridSize : round(dx),
          gridOn ? Math.round(dz / gridSize) * gridSize : round(dz));
        updatePivot();
      }
      return;
    }
    if (down?.moved && down.mode === 'marquee') { drawMarquee(e); return; }
    if (paletteSel) {
      const p = groundHit(e);
      if (p) { marker.visible = true; marker.position.set(snap(p.x), 0.1, snap(p.z)); marker.userData.pos = new THREE.Vector3(snap(p.x), 0, snap(p.z)); }
    }
  });

  function endPointer(e, cancelled) {
    if (!down) return;
    const d = down; down = null;
    try { renderer.domElement.releasePointerCapture(d.id); } catch { /* already gone */ }
    orbit.enabled = !gizmo.dragging;
    // A CANCELLED DRAG IS NOT A CLICK. The browser takes the pointer away
    // mid-gesture (a trackpad deciding the press was a scroll, a pen leaving
    // range, a window losing focus); finishing the move as if the user had
    // released would drop the object wherever it had got to, and treating it
    // as a click would change the selection they never meant to change.
    if (cancelled) {
      if (d.moved && d.mode === 'move') { cancelDrag(); setHint(''); }
      if (d.mode === 'marquee') clearMarquee();
      return;
    }
    if (d.mode === 'marquee') { endMarquee(e, d); return; }
    if (d.moved) {
      if (d.mode === 'move') { commitDrag(); setHint(''); }
      return;
    }
    // a click, not a drag
    if (paletteSel) { placeFromPalette(paletteSel); return; }
    if (d.item) { d.shift ? toggleSel(d.item) : select([d.item]); }
    else if (!d.shift) select([]);
  }
  window.addEventListener('pointerup', (e) => endPointer(e, false));
  // every way a press can end WITHOUT a pointerup — each one used to leave the
  // camera disabled for the rest of the session
  window.addEventListener('pointercancel', (e) => endPointer(e, true));
  renderer.domElement.addEventListener('lostpointercapture', (e) => endPointer(e, true));
  // last resort: a window that loses focus mid-drag never hears the release at
  // all, and the camera must not be the thing that pays for it
  window.addEventListener('blur', () => {
    if (down) endPointer(null, true);
    else if (!gizmo.dragging) orbit.enabled = true;
  });

  // ---- marquee -------------------------------------------------------
  function drawMarquee(e) {
    if (!marqueeEl) { marqueeEl = el('div', 'le-marquee'); root().append(marqueeEl); }
    const x0 = Math.min(marqueeStart.x, e.clientX), y0 = Math.min(marqueeStart.y, e.clientY);
    marqueeEl.style.left = x0 + 'px'; marqueeEl.style.top = y0 + 'px';
    marqueeEl.style.width = Math.abs(e.clientX - marqueeStart.x) + 'px';
    marqueeEl.style.height = Math.abs(e.clientY - marqueeStart.y) + 'px';
  }
  function endMarquee(e, d) {
    clearMarquee();
    if (!d.moved) return;
    const r = renderer.domElement.getBoundingClientRect();
    const x0 = Math.min(marqueeStart.x, e.clientX) - r.left, x1 = Math.max(marqueeStart.x, e.clientX) - r.left;
    const y0 = Math.min(marqueeStart.y, e.clientY) - r.top, y1 = Math.max(marqueeStart.y, e.clientY) - r.top;
    const hit = [];
    const v = new THREE.Vector3();
    for (const it of items) {
      v.copy(it.obj3d.position).project(camera);
      const sx = (v.x * 0.5 + 0.5) * r.width, sy = (-v.y * 0.5 + 0.5) * r.height;
      if (v.z < 1 && sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) hit.push(it);
    }
    select([...new Set([...sel, ...hit])]);
    setHint(`${sel.length} selected.`);
  }

  // ================================================================ KEYBOARD
  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if (meta && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicateSelection(); return; }
    if (meta && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); select([...items]); return; }
    if (meta && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveSlot(level.name); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return; }
    if (e.key === 'Escape') { closeDrawer(); paletteSel = null; marker.visible = false; select([]); return; }
    if (e.key === 'g' || e.key === 'G') { setGizmoMode('translate'); return; }
    if (e.key === 'r' || e.key === 'R') { setGizmoMode(gizmoMode === 'rotate' ? 'translate' : 'rotate'); return; }
    if (e.key === 'f' || e.key === 'F') { frameSelection(); return; }
    if (e.key === '[' || e.key === ']') { nudgeRot(e.key === '[' ? -15 : 15); return; }
    if (e.key.startsWith('Arrow') && sel.length) { nudgePos(e.key); e.preventDefault(); }
  });
  function nudgeRot(deg) {
    if (!sel.length) return;
    pushUndo(); captureSelStart();
    applyMove(0, 0, THREE.MathUtils.degToRad(deg));
    commitDrag();
  }
  function nudgePos(key) {
    pushUndo(); captureSelStart();
    const s = gridOn ? gridSize : 1;
    applyMove(key === 'ArrowLeft' ? -s : key === 'ArrowRight' ? s : 0,
      key === 'ArrowUp' ? -s : key === 'ArrowDown' ? s : 0);
    commitDrag();
  }
  function frameSelection() {
    if (!sel.length) return;
    const c = selCentre();
    const box = new THREE.Box3();
    for (const it of sel) box.expandByObject(it.obj3d);
    const r = Math.max(8, box.getSize(new THREE.Vector3()).length());
    const dir = camera.position.clone().sub(orbit.target).normalize();
    orbit.target.copy(c);
    camera.position.copy(c).addScaledVector(dir, r * 1.8);
    orbit.update();
  }

  // ================================================================ UNDO
  function serialize() {
    const via = items.find((i) => i.def.k === 'viaduct');
    return JSON.stringify({
      v: LEVEL_VERSION, name: level.name, theme: level.theme, bounds: level.bounds,
      clearing: level.clearing, plaza: level.plaza,
      objects: items.filter((i) => i.def.k !== 'spawn' && i.def.k !== 'viaduct').map((i) => i.def),
      viaduct: via ? { ...via.def, k: undefined, id: undefined } : null,
      spawns: items.filter((i) => i.def.k === 'spawn').map((i) => ({ x: i.def.x, z: i.def.z, yaw: i.def.yaw })),
    });
  }
  function pushUndo() { undoStack.push(serialize()); trimUndo(); redoStack.length = 0; }
  function trimUndo() { if (undoStack.length > 120) undoStack.shift(); }
  function undo() { if (!undoStack.length) return setHint('Nothing to undo.'); redoStack.push(serialize()); loadLevelData(JSON.parse(undoStack.pop()), true); }
  function redo() { if (!redoStack.length) return setHint('Nothing to redo.'); undoStack.push(serialize()); loadLevelData(JSON.parse(redoStack.pop()), true); }

  // full rebuild of the world from a level object
  function loadLevelData(data, keepUndo) {
    if (!keepUndo) { undoStack.length = 0; redoStack.length = 0; }
    select([]);
    for (const it of [...items]) removeItem(it);
    items = []; spinners.length = 0;
    level = {
      v: data.v || LEVEL_VERSION, name: data.name || 'Untitled', theme: data.theme || 'neon',
      bounds: data.bounds || 100, clearing: data.clearing ?? 38, plaza: data.plaza ?? true,
      objects: [], spawns: [],
    };
    rebuildEnv();
    // WHAT THE GAME WILL BUILD, not a stand-in for it: a prop's visuals are
    // the imported model wherever one exists, so fetch this level's models and
    // rebuild the proxies once they land. Nothing waits on it — the procedural
    // build is on screen immediately and is what the game falls back to anyway.
    ensurePropModels(data.objects || []);
    for (const d of (data.objects || [])) addItem(d, { silent: true });
    if (data.viaduct) addItem({ ...data.viaduct, k: 'viaduct' }, { silent: true });
    for (const s of (data.spawns || [])) addItem({ k: 'spawn', ...s }, { silent: true });
    // props sit on hills, and the hills only exist once everything is in
    for (const it of items) if (!FLAT_KINDS.has(it.def.k) && it.def.k !== 'building' && !GLOBAL_KINDS.has(it.def.k)) { placeProxy(it.obj3d, it.def); syncGhostTransforms(it); }
    rebuildHelpers();
    refreshAll();
    autosave();
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
  engine.onUpdate = (dt) => { for (const g of spinners) { const s = g.userData.spinName ? (g.getObjectByName(g.userData.spinName) || g) : g; s.rotation[g.userData.spinAxis || 'z'] += (g.userData.spin || 0.4) * dt; } };
  engine.onRender = () => {
    orbit.update();
    for (const b of selBoxes) b.update?.();   // rings have no update; boxes do
    ghostGroup.visible = tilingOn;
    positionSelBar();
  };

  // ================================================================ INITIAL BUILD
  rebuildEnv();
  rebuildHelpers();
  buildUI();

  const resume = loadAutosave();
  if (loadName) {
    AR.levels.load(loadName).then((d) => {
      if (d) { loadLevelData(d); sourceLabel = `level “${d.name || loadName}”`; refreshSource(); setHint(`Loaded “${d.name || loadName}”.`); }
      else { console.error('level load: not found', loadName); openArena('neon', bakeSeed); }
    }).catch((e) => { console.error('level load failed:', e); openArena('neon', bakeSeed); });
  } else if (arenaName && IS_THEME(arenaName)) {
    // &seed=<n> names a layout, which only a generated arena has — asking for
    // one is asking to bake, authored file or not
    openArena(arenaName, bakeSeed, { fresh: params.has('seed') });
  } else if (blankTheme && IS_THEME(blankTheme)) {
    loadLevelData(AR.blank(blankTheme));
    sourceLabel = 'blank arena';
    refreshSource();
    setHint('Empty arena — ＋ ADD to place your first object, or pick an arena above to edit one.');
  } else if (resume) {
    loadLevelData(resume);
    sourceLabel = `resumed “${resume.name || 'autosave'}”`;
    refreshSource();
    setHint(`Resumed your last edit (“${resume.name || 'autosave'}”). Pick an arena above to start fresh.`);
  } else {
    openArena('neon', bakeSeed);
  }

  engine.start();
  window.__leveleditor = {
    engine,                                   // tools/arenabake.mjs builds arenas with it
    get level() { return JSON.parse(serialize()); },
    items: () => items,
    gizmo,
    selection: () => sel.map((s) => s.def),
    open: (id, seed) => openArena(id, seed ?? bakeSeed),
    // camera state, so a probe can ask whether the view is still drivable
    camera,
    orbitEnabled: () => orbit.enabled,
    orbit,
  };
  return engine;

  // ================================================================ UI
  function buildUI() {
    injectCss();
    for (const n of root().querySelectorAll('.le-bar, .le-panel, .le-hint, .le-drawer, .le-selbar, .le-fab')) n.remove();

    // --- top bar: WHAT you are editing, then what you do with it ---
    const bar = el('div', 'le-bar');
    arenaSel = buildArenaSelect();
    seedRow = el('span', 'le-seedrow');
    const seedIn = el('input', 'le-seed'); seedIn.type = 'number'; seedIn.value = bakeSeed; seedIn.title = 'Layout seed';
    seedIn.onchange = () => { bakeSeed = +seedIn.value || 7; };
    seedRow.append(tag('span', 'le-seedlbl', 'seed'), seedIn,
      // `fresh` — a reroll is the explicit ask for a GENERATED layout, so it
      // bakes even for an arena that ships an authored one
      btn('⟳', () => { bakeSeed = Math.floor(Math.random() * 9999) + 1; seedIn.value = bakeSeed; if (level.theme) openArena(level.theme, bakeSeed, { fresh: true }); }, 'mini'));
    seedRow.querySelector('.le-mini').title = 'Reroll this arena with a new seed';

    // the logo is the way back to the other workbenches — this tool has its own
    // chrome, so it doesn't wear the shared title bar with the switcher chevron
    const logo = tag('a', 'le-logo', 'ARENA EDITOR');
    logo.href = './'; logo.title = 'All workbenches';
    bar.append(
      logo,
      arenaSel, seedRow,
      tag('span', 'le-sep'),
      btn('↶', undo, 'mini'), btn('↷', redo, 'mini'),
      tag('span', 'le-sep'),
      btn('⚙', openSettings, 'mini'),
      btn('Save', () => saveSlot(prompt('Save as:', level.name) || level.name)),
      btn('Import', importJson),
      btn('Export', exportJson, 'primary'),
      btn('▶ Playtest', playtest, 'go'),
      btn('?', showHelp, 'mini'),
    );
    root().append(bar);

    // --- ＋ ADD: the palette is a drawer, shut until you want it ---
    fabEl = tag('button', 'le-fab', '＋  ADD');
    fabEl.onclick = () => (drawer.classList.contains('open') ? closeDrawer() : openDrawer());
    root().append(fabEl);

    drawer = el('div', 'le-drawer');
    const dhead = el('div', 'le-dhead');
    const search = el('input', 'le-search'); search.placeholder = 'search buildings, props, terrain…';
    search.oninput = () => refreshPalette(search.value.trim().toLowerCase());
    dhead.append(search, btn('✕', closeDrawer, 'mini'));
    drawerBody = el('div', 'le-dbody');
    drawer.append(dhead, drawerBody);
    root().append(drawer);
    refreshPalette();

    // --- the selection's own toolbar, floating over it in the viewport ---
    selBar = el('div', 'le-selbar');
    selBar.append(
      tag('span', 'le-selname', ''),
      toolBtn('⟳', () => setGizmoMode(gizmoMode === 'rotate' ? 'translate' : 'rotate'), 'Turn (R)'),
      toolBtn('⧉', () => duplicateSelection(), 'Duplicate (Ctrl+D)'),
      toolBtn('🗑', deleteSelection, 'Delete (Del)'),
      toolBtn('✎', () => inspPanel.classList.toggle('open'), 'Properties'),
    );
    selBar.style.display = 'none';
    root().append(selBar);

    // --- inspector: only there when something is selected ---
    inspPanel = el('div', 'le-panel le-right');
    inspPanel.append(tag('div', 'le-h', 'PROPERTIES'));
    inspector = el('div', 'le-body le-insp'); inspPanel.append(inspector);
    statsEl = el('div', 'le-stats'); inspPanel.append(statsEl);
    root().append(inspPanel);
    setupDevPanel(inspPanel, { key: 'leveditor.props', edge: 'left' });

    hintEl = el('div', 'le-hint');
    root().append(hintEl);
    setHint('');
  }

  // ---- top-bar arena picker -----------------------------------------
  // One list, in the order you'd reach for them: the 12 shipped arenas first
  // (that is what this editor is FOR), then level files, then your own saves.
  function buildArenaSelect() {
    const s = el('select', 'le-sel le-arena');
    const og = document.createElement('optgroup'); og.label = 'Arenas (bake & edit)';
    for (const t of THEMES) { const o = document.createElement('option'); o.value = 'theme:' + t.id; o.textContent = t.name; og.append(o); }
    s.append(og);
    const blank = document.createElement('optgroup'); blank.label = 'Blank';
    for (const t of THEMES) { const o = document.createElement('option'); o.value = 'blank:' + t.id; o.textContent = `Empty · ${t.name}`; blank.append(o); }
    s.append(blank);
    const slots = slotList();
    if (slots.length) {
      const sg = document.createElement('optgroup'); sg.label = 'Saved (this browser)';
      for (const n of slots) { const o = document.createElement('option'); o.value = 'slot:' + n; o.textContent = n; sg.append(o); }
      s.append(sg);
    }
    AR.levels.list().then((list) => {
      if (!Array.isArray(list) || !list.length) return;
      const fg = document.createElement('optgroup'); fg.label = 'Level files';
      for (const n of list) { const o = document.createElement('option'); o.value = 'file:' + n; o.textContent = n; fg.append(o); }
      s.append(fg);
      refreshSource();
    }).catch(() => {});
    s.onchange = () => {
      const v = s.value;
      if (v.startsWith('theme:')) openArena(v.slice(6), bakeSeed);
      else if (v.startsWith('blank:')) { loadLevelData(AR.blank(v.slice(6))); sourceLabel = 'blank arena'; refreshSource(); setHint('Empty arena — ＋ ADD to place your first object.'); }
      else if (v.startsWith('slot:')) {
        const raw = localStorage.getItem(LS_PREFIX + v.slice(5));
        if (raw) { loadLevelData(JSON.parse(raw)); sourceLabel = `save “${v.slice(5)}”`; refreshSource(); }
      } else if (v.startsWith('file:')) {
        const n = v.slice(5);
        AR.levels.load(n).then((d) => {
          if (d) { loadLevelData(d); sourceLabel = `level “${d.name || n}”`; refreshSource(); setHint(`Loaded “${d.name || n}”.`); }
          else alert('Could not load level: ' + n);
        }).catch((err) => alert('Load failed: ' + err.message));
      }
    };
    return s;
  }
  // keep the picker + seed box showing what is actually loaded
  function refreshSource() {
    if (!arenaSel) return;
    const want = sourceLabel.startsWith('blank') ? 'blank:' + level.theme : 'theme:' + level.theme;
    for (const o of arenaSel.querySelectorAll('option')) if (o.value === want) { arenaSel.value = want; break; }
    // the seed box belongs to any arena opened BY THEME — including one opened
    // from its authored file, since ⟳ is the way back to a generated layout
    if (seedRow) {
      seedRow.style.display = (sourceLabel.includes('seed') || sourceLabel.includes('authored')) ? '' : 'none';
    }
  }

  // ---- palette drawer ------------------------------------------------
  // the ＋ button stands where the drawer opens, so it steps aside for it
  function openDrawer() { drawer.classList.add('open'); if (fabEl) fabEl.style.display = 'none'; drawer.querySelector('.le-search')?.focus(); }
  function closeDrawer() { drawer?.classList.remove('open'); if (fabEl) fabEl.style.display = ''; }
  function refreshPalette(filter) {
    if (!drawerBody) return;
    drawerBody.innerHTML = '';
    const groups = [{ group: 'Spawns', items: [{ id: 'spawn', label: 'Spawn point', k: 'spawn', hint: 'Where a fighter starts' }] }, ...CATALOG];
    for (const grp of groups) {
      const matches = grp.items.filter((it) => !filter || it.label.toLowerCase().includes(filter) || it.id.includes(filter));
      if (!matches.length) continue;
      drawerBody.append(tag('div', 'le-palh', grp.group));
      const wrap = el('div', 'le-palgrid');
      for (const it of matches) {
        const b = tag('button', 'le-palitem', it.label);
        b.title = it.hint || it.label;
        if (paletteSel && paletteSel.id === it.id) b.classList.add('on');
        b.onclick = () => {
          paletteSel = (paletteSel && paletteSel.id === it.id) ? null : it;
          marker.visible = false;
          select([]);
          refreshPalette(filter);
          setHint(paletteSel ? `Placing: ${it.label} — click the ground (keep clicking for more, Esc stops)` : '');
        };
        wrap.append(b);
      }
      drawerBody.append(wrap);
    }
  }

  // ---- the floating selection toolbar --------------------------------
  function refreshSelBar() {
    if (!selBar) return;
    if (!sel.length) { selBar.style.display = 'none'; inspPanel.classList.remove('open'); return; }
    selBar.style.display = '';
    inspPanel.classList.add('open');
    const name = sel.length > 1 ? `${sel.length} selected` : labelOf(sel[0].def);
    selBar.querySelector('.le-selname').textContent = name;
    selBar.querySelectorAll('.le-tbtn')[0].classList.toggle('on', gizmoMode === 'rotate');
  }
  function positionSelBar() {
    if (!selBar || !sel.length) return;
    const top = _bar.copy(selTop).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    selBar.style.left = (r.left + (top.x * 0.5 + 0.5) * r.width) + 'px';
    selBar.style.top = (r.top + (-top.y * 0.5 + 0.5) * r.height - 42) + 'px';
    selBar.style.visibility = top.z < 1 ? 'visible' : 'hidden';
  }
  function labelOf(d) {
    if (d.k === 'prop') return d.name;
    if (d.k === 'lane' || d.k === 'patch') return `${d.kind} ${d.k}`;
    return d.k;
  }

  // ---- inspector -------------------------------------------------
  function buildInspector() {
    inspFields = [];
    if (!inspector) return;
    inspector.innerHTML = '';
    if (!sel.length) { inspector.append(tag('div', 'le-dim', 'Nothing selected. Click an object in the arena.')); return; }
    if (sel.length > 1) {
      inspector.append(tag('div', 'le-tag', `${sel.length} OBJECTS`));
      inspector.append(tag('div', 'le-dim', 'Drag to move them together · ⟳ turns the whole group about its centre · Ctrl+D copies · Del removes.'));
      return;
    }
    const it = sel[0], d = it.def;
    inspector.append(tag('div', 'le-tag', labelOf(d).toUpperCase()));

    if (GLOBAL_KINDS.has(d.k)) {
      addSelect('Axis', [{ v: 'x', l: 'along X' }, { v: 'z', l: 'along Z' }], d.axis, (v) => { d.axis = v; rebuildProxy(it); });
      addNum('Offset', () => d.at, (v) => { d.at = wrapAt(v); rebuildProxy(it); });
      addNum('Curve', () => d.amp || 0, (v) => { d.amp = clampf(v, 0, 24); rebuildProxy(it); });
      addNum('Phase°', () => Math.round(THREE.MathUtils.radToDeg(d.phase || 0)), (v) => { d.phase = THREE.MathUtils.degToRad(v); rebuildProxy(it); });
    } else {
      addNum('X', () => d.x, (v) => { d.x = v; applyXform(it); });
      addNum('Z', () => d.z, (v) => { d.z = v; applyXform(it); });
    }
    if (d.k === 'prop') addNum('Rotation°', () => Math.round(THREE.MathUtils.radToDeg(d.ry || 0)), (v) => { d.ry = THREE.MathUtils.degToRad(v); applyXform(it); });
    if (d.k === 'spawn') addNum('Facing°', () => Math.round(THREE.MathUtils.radToDeg(d.yaw || 0)), (v) => { d.yaw = THREE.MathUtils.degToRad(v); applyXform(it); });

    if (d.k === 'building' && d.struct && !d.cells?.length) {
      // A HAND-PLACED LANDFORM has no footprint to edit — its silhouette is
      // grown from its kind and its position, so what there is to change is
      // WHICH ROCK you got (the seed) and what colour it is.
      inspector.append(tag('div', 'le-note',
        `${d.struct} — a landform, not a tower. Its shape is grown from the kind; `
        + 'move it or reroll for a different one.'));
      inspector.append(btn('Reroll shape', () => {
        pushUndo();
        d.seed = Math.floor(Math.random() * 99999) + 1;
        rebuildProxy(it);
      }));
      addColor('Tint', () => d.tint ?? 0xffffff, (v) => { d.tint = v; rebuildProxy(it); }, AR.tints(level.theme));
    } else if (d.k === 'building') {
      if (d.cells?.length) {
        inspector.append(tag('div', 'le-note', `Massed silhouette — ${d.cells.length} chunks, ${d.ny || cellSpan(d.cells, 'gy')} floors. Resize the chunk cell below, or “Simplify” to make it an editable box.`));
        addNum('Chunk width', () => d.cw, (v) => { d.cw = clampf(v, 2, 6); rebuildProxy(it); }, 0.1);
        addNum('Chunk height', () => d.ch, (v) => { d.ch = clampf(v, 2, 6); rebuildProxy(it); }, 0.1);
        inspector.append(btn('Simplify to box', () => {
          pushUndo();
          d.nx = cellSpan(d.cells, 'gx'); d.ny = cellSpan(d.cells, 'gy'); d.nz = cellSpan(d.cells, 'gz');
          delete d.cells; rebuildProxy(it); buildInspector();
        }));
      } else {
        addNum('Width (chunks)', () => d.nx, (v) => { d.nx = clampi(v, 1, 8); rebuildProxy(it); }, 1);
        addNum('Depth (chunks)', () => d.nz, (v) => { d.nz = clampi(v, 1, 8); rebuildProxy(it); }, 1);
        addNum('Height (chunks)', () => d.ny, (v) => { d.ny = clampi(v, 1, 16); rebuildProxy(it); }, 1);
      }
      addColor('Tint', () => d.tint, (v) => { d.tint = v; rebuildProxy(it); }, AR.tints(level.theme));
    } else if (d.k === 'prop') {
      addNum('Scale', () => d.s || 1, (v) => { d.s = clampf(v, 0.3, 4); rebuildProxy(it); }, 0.1);
      const cat = AR.paletteEntry(propCatId(d.name));
      if (cat && cat.color) addColor('Colour', () => d.opts?.color ?? SWATCHES[0], (v) => { d.opts = { ...(d.opts || {}), color: v }; rebuildProxy(it); }, SWATCHES);
    } else if (d.k === 'hill') {
      addToggle('Platform deck', () => !!d.deck, (v) => { d.deck = v; if (v && !d.edge) d.edge = 0x53e8ff; rebuildProxy(it); reseatProps(); });
      addNum('Radius', () => d.R, (v) => { d.R = clampf(v, 4, 40); rebuildProxy(it); reseatProps(); });
      addNum('Height', () => d.H, (v) => { d.H = clampf(v, 1, 14); rebuildProxy(it); reseatProps(); }, 0.5);
      addColor('Colour', () => d.color ?? 0x5a5248, (v) => { d.color = v; rebuildProxy(it); }, SWATCHES);
      if (d.deck) addColor('Edge glow', () => d.edge ?? 0x53e8ff, (v) => { d.edge = v; rebuildProxy(it); }, SWATCHES);
    } else if (d.k === 'bridge') {
      addSelect('Axis', [{ v: 'x', l: 'along X' }, { v: 'z', l: 'along Z' }], d.axis, (v) => { d.axis = v; rebuildProxy(it); });
      addNum('Length', () => d.flat, (v) => { d.flat = clampf(v, 6, 40); rebuildProxy(it); });
      addNum('Height', () => d.H, (v) => { d.H = clampf(v, 1.5, 8); rebuildProxy(it); }, 0.5);
      addColor('Edge glow', () => d.edge ?? 0x53e8ff, (v) => { d.edge = v; rebuildProxy(it); }, SWATCHES);
    } else if (d.k === 'lane') {
      addNum('Width', () => d.width, (v) => { d.width = clampf(v, 2, 16); rebuildProxy(it); });
    } else if (d.k === 'patch') {
      addNum('Radius', () => d.r, (v) => { d.r = clampf(v, 3, 40); rebuildProxy(it); });
      addColor('Colour', () => d.color ?? patchColor(d.kind), (v) => { d.color = v; rebuildProxy(it); }, SWATCHES);
    } else if (d.k === 'viaduct') {
      addNum('Deck height', () => d.h, (v) => { d.h = clampf(v, 3, 14); rebuildProxy(it); }, 0.5);
      addNum('Deck width', () => d.w, (v) => { d.w = clampf(v, 4, 16); rebuildProxy(it); }, 0.5);
      addNum('Ramp length', () => d.rampL, (v) => { d.rampL = clampf(v, 6, 30); }, 1);
      addNum('Pier spacing', () => d.pylonEvery, (v) => { d.pylonEvery = clampi(v, 1, 10); rebuildProxy(it); }, 1);
    }
  }
  function applyXform(it) {
    placeProxy(it.obj3d, it.def);
    syncGhostTransforms(it);
    refreshSelBoxes(); updatePivot();
  }
  // a hill that grew or moved changes what the props on it stand on
  function reseatProps() {
    for (const it of items) {
      if (FLAT_KINDS.has(it.def.k) || it.def.k === 'building' || GLOBAL_KINDS.has(it.def.k)) continue;
      placeProxy(it.obj3d, it.def); syncGhostTransforms(it);
    }
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

  // ---- arena settings (behind the gear — you touch these once) ----
  function openSettings() {
    const body = el('div', 'le-setbody');
    body.append(
      rowField('Name', level.name, (v) => { level.name = v; }),
      rowSelect('Base theme', THEMES.map((t) => ({ v: t.id, l: t.name })), level.theme, (v) => { pushUndo(); level.theme = v; rebuildEnv(); }),
      rowNum('Arena size', level.bounds, 40, 260, 4, (v) => { pushUndo(); level.bounds = v; rebuildEnv(); rebuildHelpers(); for (const it of items) { if (GLOBAL_KINDS.has(it.def.k)) rebuildProxy(it); else rebuildGhosts(it); } }),
      rowNum('Plaza radius', level.clearing, 10, 80, 1, (v) => { pushUndo(); level.clearing = v; rebuildEnv(); }),
      rowToggle('Paint plaza', level.plaza, (v) => { pushUndo(); level.plaza = v; rebuildEnv(); }),
      tag('div', 'le-h', 'VIEW'),
      rowToggle('Grid snap', gridOn, (v) => { gridOn = v; if (gridHelper) gridHelper.visible = v; updatePivot(); }),
      rowToggle('Show tiling', tilingOn, (v) => { tilingOn = v; }),
      rowSelect('Grid size', ['1', '2', '4', '5', '8'].map((x) => ({ v: x, l: x + 'm' })), String(gridSize), (v) => { gridSize = +v; rebuildHelpers(); updatePivot(); }),
      btnRow('⤓ Top-down view', () => { camera.position.set(0, P() * 0.9, 0.01); orbit.target.set(0, 0, 0); orbit.update(); }),
      tag('div', 'le-h', 'PLAYTEST'),
      rowSelect('Fighter 1', FIGHTERS.map((m) => ({ v: m.id, l: m.name })), ptP1, (v) => { ptP1 = v; }),
      rowSelect('Fighter 2', FIGHTERS.map((m) => ({ v: m.id, l: m.name })), ptP2, (v) => { ptP2 = v; }),
    );
    showModal('<h3>Arena settings</h3>', body);
  }

  // ---- stats -----------------------------------------------------
  function refreshStats() {
    if (!statsEl) return;
    const n = (k) => items.filter((i) => i.def.k === k).length;
    statsEl.textContent = `${n('building')} towers · ${n('prop')} props · ${n('hill') + n('bridge') + n('lane') + n('patch')} terrain · ${n('spawn')} spawns`;
  }
  function refreshAll() { buildInspector(); refreshStats(); refreshPalette(); refreshSelBar(); refreshSource(); }

  // ================================================================ SAVE / LOAD / EXPORT
  function slotList() { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(LS_PREFIX) && k !== LS_AUTOSAVE) out.push(k.slice(LS_PREFIX.length)); } return out.sort(); }
  function saveSlot(name) {
    if (!name) return; level.name = name;
    localStorage.setItem(LS_PREFIX + name, serialize());
    setHint(`Saved “${name}”.`);
  }
  function autosave() { try { localStorage.setItem(LS_AUTOSAVE, serialize()); } catch { /* full */ } }
  function loadAutosave() { try { const s = localStorage.getItem(LS_AUTOSAVE); return s ? JSON.parse(s) : null; } catch { return null; } }

  function importJson() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { loadLevelData(JSON.parse(rd.result)); sourceLabel = 'imported level'; refreshSource(); setHint('Imported.'); } catch (err) { alert('Bad level JSON: ' + err.message); } }; rd.readAsText(f); };
    inp.click();
  }
  function exportJson() {
    const txt = JSON.stringify(JSON.parse(serialize()), null, 2);
    navigator.clipboard?.writeText(txt).catch(() => {});
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    const fname = (level.name || 'level').replace(/\W+/g, '-').toLowerCase() + '.json';
    a.download = fname; a.click();
    const body = el('div');
    body.innerHTML = `Exported <b>${fname}</b> (also copied to clipboard).<br><br>To play it in the game:<br>1. Save the file to <code>public/levels/${fname}</code><br>2. Open <code>../?battle=${level.theme}&amp;level=${fname.replace('.json', '')}&amp;p1=titanus&amp;p2=viper</code><br><br>Or just hit <b>▶ Playtest</b> to try it right now.<br><textarea class="le-out" readonly>${txt.replace(/</g, '&lt;')}</textarea>`;
    showModal('<h3>Export</h3>', body);
  }
  function playtest() {
    let url;
    try { url = AR.playtest(JSON.parse(serialize()), { p1: ptP1, p2: ptP2 }); }
    catch { alert('Could not stash level for playtest.'); return; }
    window.open(url, '_blank');
  }

  // ================================================================ MODALS
  function showHelp() {
    const body = el('div');
    body.innerHTML = `
      <b>Pick an arena</b> — the dropdown top-left opens one of the 12 shipped arenas and hands you every piece of it. An arena that has been AUTHORED (a hand-built level the game plays as-is) opens from its file, so you are editing what ships; every other arena is generated for real from its theme, and <b>seed ⟳</b> rerolls that layout — or builds a procedural version of an authored one.<br><br>
      <b>Select</b> — click an object · shift-click to add · shift-drag empty ground to marquee a block · Ctrl+A everything.<br>
      <b>Move</b> — just drag it. The whole selection travels. <b>Alt-drag</b> leaves a copy behind.<br>
      <b>Turn</b> — <b>R</b> (or ⟳ on the floating toolbar) puts the gizmo in rotate mode, turning the selection about its own centre. <b>[</b> / <b>]</b> nudge 15°.<br>
      Holding <b>Shift</b> also takes the rotate ring off screen, so it cannot eat a shift-click or the start of a marquee.<br>
      <b>Nudge</b> arrow keys · <b>Frame</b> F · <b>Duplicate</b> Ctrl+D · <b>Delete</b> Del · <b>Undo</b> Ctrl+Z · <b>Save</b> Ctrl+S.<br><br>
      <b>Add</b> — ＋ ADD opens the palette; pick a thing, then click the ground. Keep clicking to place more, Esc stops.<br><br>
      <b>Tiling</b> — the arena wraps, so the faint copies around your tile show how it repeats in game. The bright cyan square is the wrap edge.<br><br>
      <b>Lanes and the elevated loop</b> are cell-global: they run the whole width of the tile, so dragging one only slides it sideways.<br><br>
      <b>Playtest</b> launches a live battle on your arena in a new tab. <b>Export</b> writes a JSON for <code>public/levels/</code>.`;
    showModal('<h3>Arena editor</h3>', body);
  }
  function showModal(html, bodyEl) {
    const back = el('div', 'le-modalback');
    const m = el('div', 'le-modal'); m.innerHTML = html;
    if (bodyEl) m.append(bodyEl);
    const close = btn('Close', () => back.remove(), 'primary'); close.classList.add('le-mclose');
    m.append(close); back.append(m); back.onclick = (e) => { if (e.target === back) back.remove(); };
    root().append(back);
  }

  // ================================================================ small DOM utils
  function root() { return document.getElementById('ui-root'); }
  function el(t2, cls) { const e = document.createElement(t2); if (cls) e.className = cls; e.style.pointerEvents = 'auto'; return e; }
  function tag(t2, cls, txt) { const e = el(t2, cls); if (txt != null) e.textContent = txt; return e; }
  function btn(txt, fn, kind) { const b = tag('button', 'le-btn' + (kind ? ' le-' + kind : ''), txt); b.onclick = fn; return b; }
  function btnRow(txt, fn) { const r = el('div', 'le-row'); r.append(btn(txt, fn)); return r; }
  function toolBtn(txt, fn, title) { const b = tag('button', 'le-tbtn', txt); b.title = title || txt; b.onclick = fn; return b; }
  function toggleBtn(txt, on, fn) { const b = tag('button', 'le-tbtn' + (on ? ' on' : ''), txt); b.onclick = () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); fn(v); }; return b; }
  function select_(vals, cur, fn, labels) { const s = el('select', 'le-sel'); vals.forEach((v, i) => { const o = document.createElement('option'); o.value = v; o.textContent = labels ? labels[i] : v; if (String(v) === String(cur)) o.selected = true; s.append(o); }); s.onchange = () => fn(s.value); return s; }
  function rowField(label, val, fn) { const r = el('div', 'le-row'); const i = el('input', 'le-txt'); i.value = val; i.onchange = () => fn(i.value); r.append(tag('span', 'le-lbl', label), i); return r; }
  function rowSelect(label, opts, cur, fn) { const r = el('div', 'le-row'); r.append(tag('span', 'le-lbl', label), select_(opts.map((o) => o.v), cur, fn, opts.map((o) => o.l))); return r; }
  function rowNum(label, val, min, max, step, fn) { const r = el('div', 'le-row'); const i = el('input', 'le-num'); i.type = 'number'; i.min = min; i.max = max; i.step = step; i.value = val; i.onchange = () => fn(clampf(+i.value, min, max)); r.append(tag('span', 'le-lbl', label), i); return r; }
  function rowToggle(label, on, fn) { const r = el('div', 'le-row'); r.append(toggleBtn(label, on, fn)); return r; }
  function setHint(s) { if (hintEl) hintEl.textContent = s || DEFAULT_HINT; }
  function isTyping() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'); }

  // ---- utils ----
  function round(v) { return Math.round(v * 10) / 10; }
  function round2(v) { return Math.round(v * 1000) / 1000; }
  function clampf(v, a, b) { return Math.max(a, Math.min(b, isNaN(v) ? a : v)); }
  function clampi(v, a, b) { return Math.max(a, Math.min(b, Math.round(v) || a)); }
  function propCatId(name) { for (const g of CATALOG) for (const it of g.items) if (it.k === 'prop' && it.name === name) return it.id; return name; }

  // Dispose a proxy. `keepShared` (ghost clones) shares geometry+materials with
  // its source proxy, so it disposes NOTHING. For a real proxy we dispose the
  // per-instance geometry always, but never the shared prop-material singletons
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
  .le-logo { color:#62ff9a; font-weight:700; letter-spacing:.06em; margin-right:8px; font-size:12px; text-decoration:none; }
  .le-logo:hover { color:#a6ffc6; }
  .le-sep { width:1px; height:22px; background:#22314c; margin:0 4px; }
  .le-btn { background:#182338; color:#cfe0f5; border:1px solid #2c3d57; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:12px; }
  .le-btn:hover { background:#22314c; }
  .le-btn.le-mini { padding:6px 8px; }
  .le-btn.le-primary { background:#1f5f7a; border-color:#2c88a8; color:#eafcff; }
  .le-btn.le-go { background:#1f7a4d; border-color:#2ca86a; color:#eafff2; font-weight:600; }
  .le-arena { width:auto; min-width:190px; background:#152742; border-color:#2f5a86; color:#dff0ff; font-weight:600; cursor:pointer; }
  .le-seedrow { display:flex; align-items:center; gap:4px; }
  .le-seedlbl { color:#6f86a4; font-size:11px; }
  .le-seed { width:66px; background:#0a0f18; color:#dfe8f5; border:1px solid #263650; border-radius:5px; padding:5px 6px; font-size:12px; }

  /* ＋ ADD and its drawer */
  .le-fab { position:fixed; left:14px; bottom:44px; z-index:58; background:#1f6f8f; color:#eafcff; border:1px solid #3fbfe0;
    border-radius:22px; padding:10px 18px; cursor:pointer; font:600 13px system-ui,sans-serif; letter-spacing:.04em; box-shadow:0 6px 20px #0008; }
  .le-fab:hover { background:#2a86ab; }
  .le-drawer { position:fixed; left:0; top:44px; bottom:26px; width:300px; z-index:57; display:flex; flex-direction:column;
    background:#0c1220f2; border-right:1px solid #1e2b40; font:12px system-ui,sans-serif; color:#cfe0f5; }
  .le-drawer:not(.open) { display:none; }
  .le-dhead { display:flex; gap:6px; padding:8px; border-bottom:1px solid #1a2740; }
  .le-dbody { overflow:auto; padding:8px; flex:1; }
  .le-search, .le-txt, .le-num, .le-sel { width:100%; background:#0a0f18; color:#dfe8f5; border:1px solid #263650; border-radius:5px; padding:4px 6px; font-size:12px; box-sizing:border-box; }
  .le-palh { color:#5f86b0; font-size:10px; margin:8px 2px 3px; letter-spacing:.05em; text-transform:uppercase; }
  .le-palgrid { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
  .le-palitem { background:#141d30; color:#cbd9ee; border:1px solid #24344e; border-radius:5px; padding:5px 4px; cursor:pointer; font-size:11px; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .le-palitem:hover { background:#1d2b45; }
  .le-palitem.on { background:#1f6f8f; border-color:#3fbfe0; color:#eafcff; }

  /* the selection's floating toolbar */
  .le-selbar { position:fixed; z-index:59; display:flex; align-items:center; gap:3px; transform:translateX(-50%);
    background:#0d1626f2; border:1px solid #2f5a86; border-radius:8px; padding:4px 5px; box-shadow:0 6px 18px #0009; font:12px system-ui,sans-serif; }
  .le-selname { color:#7fe9ff; font-size:11px; font-weight:600; padding:0 6px 0 3px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .le-marquee { position:fixed; z-index:59; border:1px solid #53e8ff; background:#53e8ff22; pointer-events:none; }

  /* properties panel — only present with a selection */
  .le-panel { position:fixed; top:44px; bottom:26px; width:250px; overflow:auto; z-index:55;
    background:#0c1220e8; border:1px solid #1e2b40; font:12px system-ui,sans-serif; color:#cfe0f5; padding:8px; }
  /* shown/hidden outright, never slid: a panel that only arrives once a CSS
     transition finishes is a panel that can be stuck off screen */
  .le-right { right:0; border-right:none; }
  .le-right:not(.open) { display:none; }
  .le-h { color:#6f86a4; font-size:10px; letter-spacing:.08em; text-transform:uppercase; margin:10px 2px 4px; border-top:1px solid #1a2740; padding-top:8px; }
  .le-h:first-child { border-top:none; padding-top:0; margin-top:2px; }
  .le-tools { display:flex; gap:4px; margin:4px 0; }
  .le-tbtn { background:#141d30; color:#cbd9ee; border:1px solid #24344e; border-radius:5px; padding:6px 9px; cursor:pointer; font-size:12px; }
  .le-tbtn:hover { background:#1d2b45; }
  .le-tbtn.on { background:#1f6f8f; border-color:#3fbfe0; color:#eafcff; }
  .le-row { display:flex; align-items:center; gap:6px; margin:4px 0; }
  .le-lbl { color:#8ea3bf; font-size:11px; min-width:86px; }
  .le-body { margin-bottom:4px; }
  .le-tag { color:#7fe9ff; font-weight:700; font-size:11px; letter-spacing:.05em; margin:2px 0 6px; }
  .le-dim { color:#5f7089; font-style:italic; line-height:1.5; }
  .le-note { color:#8ea3bf; font-size:11px; line-height:1.45; margin:2px 0 8px; border-left:2px solid #2c3d57; padding-left:7px; }
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
  .le-setbody { min-width:320px; }
  .le-out { width:100%; height:150px; margin-top:10px; background:#080d16; color:#8fe6b0; border:1px solid #223047; border-radius:6px; font:11px ui-monospace,monospace; }
  .le-mclose { margin-top:14px; }
  `;
  document.head.append(s);
}
