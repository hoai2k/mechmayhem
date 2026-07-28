// ?edit=props — the PROP MODEL workbench: original beside optimized.
//
//   /workbench/?edit=props[&prop=<name>][&spin=0]
//
// The imported arena props (public/models/props/*.glb) were run through
// tools/propopt.mjs: welded, decimated, re-textured at 512² and re-compressed.
// The originals were not overwritten — they moved to
// public/models/props/source/ — so the trade can be judged instead of trusted.
// `node tools/propopt.mjs --restore --apply` is the revert.
//
// TWO VIEWPORTS, NOT TWO MODELS IN ONE SCENE. Each side is its own scene with
// its own light rig, drawn into its own half of the canvas, and the model sits
// alone in the middle of it — the way you would look at it if you were only
// looking at one. What is deliberately SHARED is the camera: both viewports use
// the same orbit, the same distance and the same target, framed off the
// OPTIMIZED model. Frame each side to its own bounds and a model that came back
// 3% shorter would look identical; framed together, it cannot hide.
//
// Only props with an imported model are listed. The hand-sculpted props are
// code, not assets — their optimization (mergePropMeshes) changes the object
// count and not one pixel, so there is nothing to look at.
//
// The readout is what the renderer deals with: objects (= draw calls),
// triangles, vertices, materials, texture resolution, the memory those maps
// occupy, file size — plus the model's MEASURED SIZE in metres, which is the
// number that must not have moved (`node tools/propopt.mjs --audit` is the
// same check over all twenty, from the files themselves).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { subjectSelect } from '../ui/subjectpick.js';
import { setupDevPanel } from '../ui/panel.js';

const FILL = 0.72;    // fraction of the viewport height the model should occupy
const SIZE_TOL = 0.005;

// ---------------------------------------------------------------------------
// measurement: what the renderer sees, not what the file says
function measure(obj) {
  const out = { objects: 0, tris: 0, verts: 0, mats: new Set(), texes: new Map(), vram: 0 };
  if (!obj) return out;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    out.objects++;
    const g = o.geometry;
    const pos = g.attributes.position;
    out.tris += g.index ? g.index.count / 3 : (pos?.count || 0) / 3;
    out.verts += pos?.count || 0;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      out.mats.add(m);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        const t = m[key];
        const img = t?.image;
        if (!img || out.texes.has(t)) continue;
        const w = img.width || 0, h = img.height || 0;
        out.texes.set(t, [w, h]);
        out.vram += w * h * 4 * 1.333;   // RGBA + mip chain
      }
    }
  });
  out.tris = Math.round(out.tris);
  const box = new THREE.Box3().setFromObject(obj);
  out.size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  out.centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  return out;
}

const fmt = (n) => n.toLocaleString('en-US');
const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const dim = (v) => `${v.x.toFixed(2)} × ${v.y.toFixed(2)} × ${v.z.toFixed(2)} m`;
const pct = (before, after) => {
  if (!before) return '<span style="color:#7c8ba0">—</span>';
  const d = Math.round((1 - after / before) * 100);
  if (d === 0) return '<span style="color:#7c8ba0">same</span>';
  return `<span style="color:${d > 0 ? '#4fdc8b' : '#ff8a7a'}">${d > 0 ? '−' : '+'}${Math.abs(d)}%</span>`;
};
// the worst per-axis size difference between the two models, as a fraction
const sizeDrift = (a, b) => ['x', 'y', 'z'].reduce((worst, k) => Math.max(
  worst, a[k] > 1e-6 ? Math.abs(b[k] / a[k] - 1) : 0), 0);

async function fileSize(url) {
  if (!url) return 0;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return 0;
    const n = Number(res.headers.get('content-length') || 0);
    if (n) return n;
    return (await (await fetch(url)).arrayBuffer()).byteLength;   // no length header
  } catch { return 0; }
}

function disposeTree(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of Array.isArray(o.material) ? o.material : (o.material ? [o.material] : [])) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) m[k]?.dispose?.();
      m.dispose?.();
    }
  });
  obj.removeFromParent();
}

// one side of the comparison: its own scene, its own light rig, its own camera
function makeViewport(THREE_) {
  const scene = new THREE_.Scene();
  scene.background = new THREE_.Color(0x161b23);
  scene.add(new THREE_.HemisphereLight(0xdfe6f2, 0x4a5058, 1.9));
  const sun = new THREE_.DirectionalLight(0xfff4e2, 2.1);
  sun.position.set(9, 16, 7);
  scene.add(sun);
  const fill = new THREE_.DirectionalLight(0x9fc0ff, 0.5);
  fill.position.set(-8, 5, -9);
  scene.add(fill);
  const ground = new THREE_.Mesh(new THREE_.PlaneGeometry(600, 600),
    new THREE_.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.97 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);
  const grid = new THREE_.GridHelper(200, 40, 0x44536a, 0x2b3444);
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  grid.material.depthWrite = false;
  scene.add(grid);
  const pivot = new THREE_.Group();
  scene.add(pivot);
  const camera = new THREE_.PerspectiveCamera(42, 1, 0.05, 4000);
  return { scene, camera, pivot, grid, model: null };
}

export async function runPropsWorkbench(config, params) {
  if (!config.props) {
    document.body.innerHTML = '<p style="font:14px system-ui;color:#dfe8f5;padding:40px">'
      + 'This game\'s workbench config has no <code>props</code> section.</p>';
    return;
  }
  // GLB-backed props only — the rest have no imported model to compare
  const catalogue = config.props.list().filter((p) => p.hasModel);
  if (!catalogue.length) {
    document.body.innerHTML = '<p style="font:14px system-ui;color:#dfe8f5;padding:40px">'
      + 'No prop has an imported model.</p>';
    return;
  }
  const byId = Object.fromEntries(catalogue.map((p) => [p.id, p]));
  let curId = byId[params.get('prop')] ? params.get('prop') : catalogue[0].id;
  let spin = params.get('spin') !== '0';
  let wire = false;

  // the renderer only — this tool draws two scenes into one canvas itself,
  // rather than handing a single scene to the engine's loop
  const engine = config.stage.engine();
  const { renderer } = engine;
  const left = makeViewport(THREE);
  const right = makeViewport(THREE);

  let leftStats = measure(null), rightStats = measure(null);
  let leftBytes = 0, rightBytes = 0;
  let note = '';

  // ---- layout: the canvas right of the panel, split in two ---------------
  function layout() {
    const pad = 8;
    const panelRect = panel.getBoundingClientRect();
    const x0 = Math.min(panelRect.right + pad, window.innerWidth * 0.6);
    const w = Math.max(120, window.innerWidth - x0 - pad);
    const h = Math.max(120, window.innerHeight - pad * 2);
    return { x0, y0: pad, w: w / 2, h, gap: 6 };
  }

  function applyWire(obj, on) {
    obj?.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m && 'wireframe' in m) m.wireframe = on;
      }
    });
  }

  // ---- framing ----------------------------------------------------------
  // ONE camera pose for both sides, sized to the OPTIMIZED model (falling back
  // to the original when there is no optimized one to measure): a difference in
  // size has to show up as a difference on screen, which it cannot do if each
  // side is framed to its own bounds.
  let camDist = 20, camTarget = new THREE.Vector3(), camPhi = 1.15, camTheta = 0.6;
  function frame() {
    const s = (rightStats.size?.length() ? rightStats : leftStats);
    const size = s.size || new THREE.Vector3(4, 4, 4);
    const h = Math.max(size.y, 0.5);
    const wide = Math.max(size.x, size.z, 0.5);
    const { w, h: vh } = layout();
    const aspect = Math.max(w / Math.max(vh, 1), 0.2);
    const fov = (42 * Math.PI) / 180;
    // distance that puts the model at FILL of the viewport, in whichever
    // direction is tighter (a gantry crane is wide, an obelisk is tall)
    const distH = (h / 2) / Math.tan(fov / 2);
    const distW = (wide / 2) / Math.tan(fov / 2) / aspect;
    camDist = Math.max(distH, distW) / FILL + wide * 0.35;
    camTarget.set(0, h * 0.45, 0);
    camPhi = 1.15;
    camTheta = 0.6;
    placeCamera();
  }

  // spherical -> both cameras, identically
  function placeCamera() {
    const x = camDist * Math.sin(camPhi) * Math.sin(camTheta);
    const y = camDist * Math.cos(camPhi);
    const z = camDist * Math.sin(camPhi) * Math.cos(camTheta);
    left.camera.position.set(x, y, z).add(camTarget);
    left.camera.lookAt(camTarget);
    orbit.target.copy(camTarget);
    orbit.object.position.copy(left.camera.position);
    orbit.update();
  }

  // ---- load the pair ----------------------------------------------------
  async function load(id = curId) {
    curId = id;
    const u = new URL(location.href);
    u.searchParams.set('prop', curId);
    history.replaceState(null, '', u);

    disposeTree(left.model); disposeTree(right.model);
    left.model = right.model = null;
    note = '';

    const [orig, opt] = await Promise.all([
      config.props.load(curId, 'source'),
      config.props.load(curId, 'optimized'),
    ]);
    left.model = orig; right.model = opt;
    if (!orig) note = 'no archived original — this model never went through tools/propopt.mjs';
    if (!opt) note = 'the shipped model failed to load';
    if (orig) left.pivot.add(orig);
    if (opt) right.pivot.add(opt);

    [leftBytes, rightBytes] = await Promise.all([
      fileSize(config.props.url(curId, 'source')),
      fileSize(config.props.url(curId, 'optimized')),
    ]);
    leftStats = measure(orig);
    rightStats = measure(opt);
    applyWire(orig, wire); applyWire(opt, wire);
    left.pivot.rotation.y = right.pivot.rotation.y = 0;

    // the grid reads as a ruler: one cell per metre-ish, scaled to the model
    const gs = Math.max(0.25, (rightStats.size?.x || 4) / 12);
    left.grid.scale.setScalar(gs);
    right.grid.scale.setScalar(gs);

    frame();
    report();
    panelUI.setSubtitle(`${curId} · GLB`);
    propSel.value = curId;
  }

  // ---- panel ------------------------------------------------------------
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:10px;top:10px;z-index:20;font:12px system-ui;
    color:#dbe6f5;background:#131a24ee;border-radius:8px;padding:10px;
    width:330px;max-height:94vh;overflow:auto;border-color:#2a3646`;
  document.body.appendChild(panel);
  const panelUI = setupDevPanel(panel, { key: 'props', workbench: 'props' });
  const btnCss = 'background:#1a2433;color:#9fb2c8;border:1px solid #2f3c4e;border-radius:5px;padding:4px 9px;cursor:pointer;font:12px system-ui';
  const row = (html) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;gap:6px;align-items:center;margin:5px 0';
    d.innerHTML = html;
    panel.appendChild(d);
    return d;
  };

  panel.insertAdjacentHTML('beforeend',
    '<div style="color:#7c8ba0;line-height:1.45;margin-bottom:6px">'
    + '<b style="color:#ff9d5c">left</b> = archived original &middot; '
    + '<b style="color:#4fdc8b">right</b> = shipped, optimized. Two viewports, '
    + 'one shared camera.</div>');

  const propRow = row('<span style="width:38px;color:#8ba0b8">prop</span>');
  const propSel = subjectSelect({
    config,
    entries: catalogue,
    value: curId,
    label: (id) => id,
    css: 'flex:1;background:#0f151d;color:#dbe6f5;border:1px solid #2f3c4e;border-radius:5px;padding:3px',
    onPick: (id) => load(id),
  });
  propRow.appendChild(propSel);

  const viewRow = row('<span style="width:38px;color:#8ba0b8">view</span>');
  const bSpin = document.createElement('button');
  bSpin.style.cssText = btnCss; bSpin.textContent = 'turntable';
  const bWire = document.createElement('button');
  bWire.style.cssText = btnCss; bWire.textContent = 'wireframe';
  const bFrame = document.createElement('button');
  bFrame.style.cssText = btnCss; bFrame.textContent = 'reframe';
  viewRow.append(bSpin, bWire, bFrame);
  bSpin.onclick = () => { spin = !spin; syncButtons(); };
  bWire.onclick = () => {
    wire = !wire;
    applyWire(left.model, wire); applyWire(right.model, wire);
    syncButtons();
  };
  bFrame.onclick = () => { left.pivot.rotation.y = right.pivot.rotation.y = 0; frame(); };

  function syncButtons() {
    const set = (b, on) => {
      b.style.background = on ? '#2b6cb0' : '#1a2433';
      b.style.color = on ? '#fff' : '#9fb2c8';
    };
    set(bSpin, spin); set(bWire, wire);
  }

  const readout = document.createElement('div');
  readout.style.cssText = 'margin-top:8px;line-height:1.5';
  panel.appendChild(readout);

  const scanRow = row('');
  const bScan = document.createElement('button');
  bScan.style.cssText = `${btnCss};flex:1`;
  bScan.textContent = 'Scan all models';
  scanRow.appendChild(bScan);
  const scanOut = document.createElement('div');
  scanOut.style.cssText = 'margin-top:6px;line-height:1.45;color:#9fb2c8';
  panel.appendChild(scanOut);

  // ---- readout ----------------------------------------------------------
  function statBlock(title, color, s, bytes) {
    const tex = [...s.texes.values()];
    const texLine = tex.length
      ? `${tex.length} × ${[...new Set(tex.map((t) => `${t[0]}²`))].join(', ')}`
      : '—';
    const rows = [
      ['size', s.size?.length() ? dim(s.size) : '—'],
      ['objects', fmt(s.objects)],
      ['triangles', fmt(s.tris)],
      ['vertices', fmt(s.verts)],
      ['materials', fmt(s.mats.size)],
      ['textures', texLine],
      ['texture VRAM', s.vram ? mb(s.vram) : '—'],
      ['file', bytes ? mb(bytes) : '—'],
    ];
    return `<div style="margin-top:6px"><b style="color:${color}">${title}</b>
      <table style="width:100%;border-collapse:collapse;margin-top:3px">${rows
      .map(([k, v]) => `<tr><td style="color:#7c8ba0;padding:1px 0">${k}</td>
        <td style="text-align:right">${v}</td></tr>`).join('')}</table></div>`;
  }

  function report() {
    const drift = (leftStats.size && rightStats.size)
      ? sizeDrift(leftStats.size, rightStats.size) : 0;
    const sizeVerdict = !leftStats.size?.length() || !rightStats.size?.length()
      ? ''
      : (drift <= SIZE_TOL
        ? `<div style="color:#4fdc8b;margin-top:6px">✓ same size — worst axis differs by
             ${(drift * 100).toFixed(2)}%</div>`
        : `<div style="color:#ff8a7a;margin-top:6px">⚠ SIZE CHANGED — worst axis differs by
             ${(drift * 100).toFixed(2)}%. Re-run <code>node tools/propopt.mjs --audit</code></div>`);
    const deltas = [
      ['triangles', leftStats.tris, rightStats.tris],
      ['vertices', leftStats.verts, rightStats.verts],
      ['texture VRAM', leftStats.vram, rightStats.vram],
      ['file size', leftBytes, rightBytes],
    ];
    readout.innerHTML =
      (note ? `<div style="color:#ffcc66;margin-bottom:4px">${note}</div>` : '')
      + statBlock('ORIGINAL', '#ff9d5c', leftStats, leftBytes)
      + statBlock('OPTIMIZED', '#4fdc8b', rightStats, rightBytes)
      + `<div style="margin-top:8px;border-top:1px solid #2a3646;padding-top:6px">
        <b style="color:#dbe6f5">saved</b>
        <table style="width:100%;border-collapse:collapse;margin-top:3px">${deltas
        .map(([k, a, b]) => `<tr><td style="color:#7c8ba0">${k}</td>
          <td style="text-align:right">${pct(a, b)}</td></tr>`).join('')}</table>${sizeVerdict}</div>`;
  }

  // every imported model, totalled — and any that changed size, named
  async function scanAll() {
    bScan.disabled = true;
    let fA = 0, fB = 0, tA = 0, tB = 0, vA = 0, vB = 0;
    const moved = [];
    for (const p of catalogue) {
      bScan.textContent = `scanning… ${p.id}`;
      const [a, b] = await Promise.all([
        config.props.load(p.id, 'source'),
        config.props.load(p.id, 'optimized'),
      ]);
      const [sa, sb] = await Promise.all([
        fileSize(config.props.url(p.id, 'source')),
        fileSize(config.props.url(p.id, 'optimized')),
      ]);
      const ma = measure(a), mbb = measure(b);
      fA += sa; fB += sb;
      tA += ma.tris; tB += mbb.tris;
      vA += ma.vram; vB += mbb.vram;
      if (a && b) {
        const d = sizeDrift(ma.size, mbb.size);
        if (d > SIZE_TOL) moved.push(`${p.id} ${(d * 100).toFixed(1)}%`);
      }
      disposeTree(a); disposeTree(b);
    }
    scanOut.innerHTML = `
      <div style="color:#dbe6f5;margin-top:4px"><b>${catalogue.length} imported models</b></div>
      <div>files ${mb(fA)} → ${mb(fB)} ${pct(fA, fB)}</div>
      <div>triangles ${fmt(tA)} → ${fmt(tB)} ${pct(tA, tB)}</div>
      <div>texture VRAM ${mb(vA)} → ${mb(vB)} ${pct(vA, vB)}</div>
      <div style="margin-top:4px;color:${moved.length ? '#ff8a7a' : '#4fdc8b'}">${moved.length
        ? `⚠ size changed: ${moved.join(', ')}` : '✓ every model kept its exact size'}</div>
      <div style="color:#5d6b7d;margin-top:4px">an arena loads 1–3 of these, not all ${catalogue.length}</div>`;
    bScan.disabled = false;
    bScan.textContent = 'Scan all models';
  }
  bScan.onclick = () => scanAll();

  // ---- viewport chrome ---------------------------------------------------
  const mkLabel = (text, color) => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;z-index:19;transform:translateX(-50%);
      font:600 12px system-ui;letter-spacing:.09em;color:${color};
      background:#0d1219dd;border:1px solid #2a3646;border-radius:6px;padding:4px 12px;
      pointer-events:none`;
    el.textContent = text;
    document.body.appendChild(el);
    return el;
  };
  const labelL = mkLabel('ORIGINAL', '#ff9d5c');
  const labelR = mkLabel('OPTIMIZED', '#4fdc8b');
  const divider = document.createElement('div');
  divider.style.cssText = 'position:fixed;z-index:19;width:1px;background:#3a4658;pointer-events:none';
  document.body.appendChild(divider);

  function placeChrome() {
    const { x0, y0, w, h } = layout();
    labelL.style.left = `${x0 + w / 2}px`;
    labelL.style.top = `${y0 + 10}px`;
    labelR.style.left = `${x0 + w * 1.5}px`;
    labelR.style.top = `${y0 + 10}px`;
    divider.style.left = `${x0 + w}px`;
    divider.style.top = `${y0}px`;
    divider.style.height = `${h}px`;
  }

  // ---- shared orbit ------------------------------------------------------
  // one control, on the left camera; the right camera copies it every frame,
  // so the two views can never drift apart
  const orbit = new OrbitControls(left.camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'w') bWire.click();
    else if (e.key === ' ') { e.preventDefault(); bSpin.click(); }
    else if (e.key === 'f') bFrame.click();
  });

  await load(curId);
  syncButtons();

  // ---- the loop: two scissored viewports, one canvas ---------------------
  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (spin) {
      left.pivot.rotation.y += dt * 0.3;
      right.pivot.rotation.y = left.pivot.rotation.y;
    }
    orbit.update();
    // the right camera IS the left camera — same pose, same lens
    right.camera.position.copy(left.camera.position);
    right.camera.quaternion.copy(left.camera.quaternion);

    const { x0, y0, w, h } = layout();
    const aspect = w / h;
    for (const v of [left, right]) {
      if (v.camera.aspect !== aspect) {
        v.camera.aspect = aspect;
        v.camera.updateProjectionMatrix();
      }
    }
    // scissor coordinates are measured from the BOTTOM of the drawing buffer
    const yGl = window.innerHeight - y0 - h;
    renderer.setScissorTest(true);
    renderer.setViewport(x0, yGl, w, h);
    renderer.setScissor(x0, yGl, w, h);
    renderer.render(left.scene, left.camera);
    renderer.setViewport(x0 + w, yGl, w, h);
    renderer.setScissor(x0 + w, yGl, w, h);
    renderer.render(right.scene, right.camera);
    renderer.setScissorTest(false);
    placeChrome();
  }
  requestAnimationFrame(tick);
  window.addEventListener('resize', () => { placeChrome(); });
}
