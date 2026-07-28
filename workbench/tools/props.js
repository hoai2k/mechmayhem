// ?edit=props — the PROPS workbench: original beside optimized.
//
//   /workbench/?edit=props[&prop=<name>][&route=glb|proc][&spin=0]
//
// The arena dressing got two optimizations, and both are reversible, so both
// are judged here — not in a table of numbers, in the viewport, at the same
// scale, under the same light.
//
//   ROUTE "glb"   the imported models (public/models/props/*.glb).
//                 LEFT is the untouched service export, archived by
//                 tools/propopt.mjs at public/models/props/source/;
//                 RIGHT is the shipped model: welded, decimated, 512² maps.
//                 `node tools/propopt.mjs --restore --apply` is the revert.
//
//   ROUTE "proc"  the hand-sculpted props (src/arena/props.js). LEFT is the
//                 prop as authored — one mesh per box and cylinder; RIGHT is
//                 the same prop after mergePropMeshes(), which bakes the
//                 meshes sharing a material into one buffer. Same pixels,
//                 fewer draw calls. `?props=raw` in the GAME's url is the
//                 revert.
//
// The readout under each model is what the renderer actually deals with:
// objects (= draw calls, before culling), triangles, vertices, materials,
// texture resolution and the memory those maps occupy on the GPU. SCAN ALL
// walks the whole prop table and totals it, which is the number that matters
// — one prop is never the problem, four hundred of them are.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { subjectSelect } from '../ui/subjectpick.js';
import { setupDevPanel } from '../ui/panel.js';

const GAP = 0.62;   // side-by-side separation, as a fraction of model width

// ---------------------------------------------------------------------------
// measurement: what the renderer sees, not what the file says
function measure(obj) {
  const out = {
    objects: 0, tris: 0, verts: 0, mats: new Set(), texes: new Map(), vram: 0,
  };
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
  return out;
}

const fmt = (n) => n.toLocaleString('en-US');
const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const pct = (before, after) => {
  if (!before) return '';
  const d = Math.round((1 - after / before) * 100);
  if (d === 0) return '<span style="color:#7c8ba0">same</span>';
  const good = d > 0;
  return `<span style="color:${good ? '#4fdc8b' : '#ff8a7a'}">${good ? '−' : '+'}${Math.abs(d)}%</span>`;
};

async function fileSize(url) {
  if (!url) return 0;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return 0;
    const n = Number(res.headers.get('content-length') || 0);
    if (n) return n;
    const buf = await (await fetch(url)).arrayBuffer();   // dev server may not send a length
    return buf.byteLength;
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

export async function runPropsWorkbench(config, params) {
  if (!config.props) {
    document.body.innerHTML = '<p style="font:14px system-ui;color:#dfe8f5;padding:40px">'
      + 'This game\'s workbench config has no <code>props</code> section.</p>';
    return;
  }
  const catalogue = config.props.list();
  const byId = Object.fromEntries(catalogue.map((p) => [p.id, p]));

  let curId = byId[params.get('prop')] ? params.get('prop') : catalogue[0].id;
  let route = params.get('route') === 'proc' ? 'proc'
    : (params.get('route') === 'glb' ? 'glb' : (byId[curId].hasModel ? 'glb' : 'proc'));
  let spin = params.get('spin') !== '0';
  let wire = false;

  // ---- stage ----
  const engine = config.stage.engine();
  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(0x161b23);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x4a5058, 1.9));
  const sun = new THREE.DirectionalLight(0xfff4e2, 2.1);
  sun.position.set(9, 16, 7);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.97 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);
  const grid = new THREE.GridHelper(200, 40, 0x44536a, 0x2b3444);
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.material.depthWrite = false;
  scene.add(grid);

  const orbit = new OrbitControls(camera, renderer.domElement);
  camera.position.set(0, 12, 34);
  orbit.target.set(0, 4, 0);
  orbit.update();

  // one turntable per side, so a spin compares the same angle on both
  const leftPivot = new THREE.Group();
  const rightPivot = new THREE.Group();
  scene.add(leftPivot, rightPivot);
  let leftModel = null, rightModel = null;
  let leftStats = measure(null), rightStats = measure(null);
  let leftBytes = 0, rightBytes = 0;
  let missing = '';

  function applyWire(obj, on) {
    obj?.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m && 'wireframe' in m) m.wireframe = on;
      }
    });
  }

  // ---- build the pair ---------------------------------------------------
  async function load(id = curId) {
    curId = id;
    const u = new URL(location.href);
    u.searchParams.set('prop', curId);
    u.searchParams.set('route', route);
    history.replaceState(null, '', u);

    disposeTree(leftModel); disposeTree(rightModel);
    leftModel = rightModel = null;
    leftBytes = rightBytes = 0;
    missing = '';

    if (route === 'glb') {
      const [orig, opt] = await Promise.all([
        config.props.load(curId, 'source'),
        config.props.load(curId, 'optimized'),
      ]);
      leftModel = orig; rightModel = opt;
      if (!opt) missing = `${curId} has no imported model — switch to PROCEDURAL`;
      else if (!orig) missing = 'no archived original (this model was never run through tools/propopt.mjs)';
      [leftBytes, rightBytes] = await Promise.all([
        fileSize(config.props.url(curId, 'source')),
        fileSize(config.props.url(curId, 'optimized')),
      ]);
    } else {
      // the same prop built twice from the same seed: one left as authored,
      // one put through the arena's merge
      leftModel = config.props.build(curId);
      rightModel = config.props.build(curId);
      if (rightModel) config.props.merge(rightModel);
    }

    if (leftModel) leftPivot.add(leftModel);
    if (rightModel) rightPivot.add(rightModel);
    leftStats = measure(leftModel);
    rightStats = measure(rightModel);
    applyWire(leftModel, wire); applyWire(rightModel, wire);

    frame();
    report();
    panelUI.setSubtitle(`${curId} · ${route === 'glb' ? 'GLB' : 'PROCEDURAL'}`);
    propSel.value = curId;
  }

  // put the two models a model-width apart and back the camera off far enough
  // to hold both — props run from a 1 m mine to a 24 m blast furnace
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  function frame() {
    box.makeEmpty();
    for (const m of [leftModel, rightModel]) if (m) box.expandByObject(m);
    if (box.isEmpty()) return;
    box.getSize(size);
    const w = Math.max(size.x, size.z, 2), h = Math.max(size.y, 2);
    const off = w * (0.5 + GAP);
    leftPivot.position.set(-off, 0, 0);
    rightPivot.position.set(off, 0, 0);
    const span = Math.max(off * 2 + w, h * 1.6);
    // the side panel eats the left quarter of the window, so the pair is
    // framed off-centre — otherwise the ORIGINAL sits behind the readout that
    // describes it
    const bias = span * 0.2;
    camera.position.set(-bias, h * 0.55 + span * 0.16, span * 1.15);
    orbit.target.set(-bias, h * 0.42, 0);
    orbit.update();
    grid.scale.setScalar(Math.max(0.25, span / 120));
    labelL.style.opacity = leftModel ? '1' : '0.35';
    labelR.style.opacity = rightModel ? '1' : '0.35';
  }

  // ---- panel ------------------------------------------------------------
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:10px;top:10px;z-index:20;font:12px system-ui;
    color:#dbe6f5;background:#131a24ee;border-radius:8px;padding:10px;
    width:340px;max-height:94vh;overflow:auto;border-color:#2a3646`;
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
    + '<b style="color:#ff9d5c">left</b> = original &middot; '
    + '<b style="color:#4fdc8b">right</b> = optimized. The same prop, same '
    + 'scale, same light.</div>');

  const propRow = row('<span style="width:38px;color:#8ba0b8">prop</span>');
  const propSel = subjectSelect({
    config,
    entries: catalogue,
    value: curId,
    label: (id) => id,
    note: (id) => (byId[id]?.hasModel ? '  · GLB' : ''),
    css: 'flex:1;background:#0f151d;color:#dbe6f5;border:1px solid #2f3c4e;border-radius:5px;padding:3px',
    onPick: (id) => {
      // a prop with no imported model has nothing to compare on the GLB route
      if (!byId[id]?.hasModel && route === 'glb') route = 'proc';
      load(id).then(syncButtons);
    },
  });
  propRow.appendChild(propSel);

  const routeRow = row('<span style="width:38px;color:#8ba0b8">route</span>');
  const bGlb = document.createElement('button');
  bGlb.style.cssText = btnCss; bGlb.textContent = 'GLB model';
  const bProc = document.createElement('button');
  bProc.style.cssText = btnCss; bProc.textContent = 'Procedural';
  routeRow.append(bGlb, bProc);
  bGlb.onclick = () => { route = 'glb'; load().then(syncButtons); };
  bProc.onclick = () => { route = 'proc'; load().then(syncButtons); };

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
    applyWire(leftModel, wire); applyWire(rightModel, wire);
    syncButtons();
  };
  bFrame.onclick = () => { leftPivot.rotation.y = rightPivot.rotation.y = 0; frame(); };

  function syncButtons() {
    const set = (b, on) => {
      b.style.background = on ? '#2b6cb0' : '#1a2433';
      b.style.color = on ? '#fff' : '#9fb2c8';
    };
    set(bGlb, route === 'glb'); set(bProc, route === 'proc');
    set(bSpin, spin); set(bWire, wire);
    bGlb.disabled = !byId[curId]?.hasModel;
    bGlb.style.opacity = bGlb.disabled ? '0.45' : '1';
  }

  const readout = document.createElement('div');
  readout.style.cssText = 'margin-top:8px;line-height:1.5';
  panel.appendChild(readout);

  const scanRow = row('');
  const bScan = document.createElement('button');
  bScan.style.cssText = btnCss + ';flex:1';
  bScan.textContent = 'Scan all props';
  scanRow.appendChild(bScan);
  const scanOut = document.createElement('div');
  scanOut.style.cssText = 'margin-top:6px;line-height:1.45;color:#9fb2c8';
  panel.appendChild(scanOut);

  // ---- readouts ---------------------------------------------------------
  function statBlock(title, color, s, bytes) {
    const tex = [...s.texes.values()];
    const texLine = tex.length
      ? `${tex.length} × ${tex.map((t) => `${t[0]}²`).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`
      : '—';
    return `<div style="margin-top:6px">
      <b style="color:${color}">${title}</b>
      <table style="width:100%;border-collapse:collapse;margin-top:3px">
        ${[['objects', fmt(s.objects)], ['triangles', fmt(s.tris)], ['vertices', fmt(s.verts)],
        ['materials', fmt(s.mats.size)], ['textures', texLine],
        ['texture VRAM', s.vram ? mb(s.vram) : '—'],
        ['file', bytes ? mb(bytes) : '—']]
        .map(([k, v]) => `<tr><td style="color:#7c8ba0;padding:1px 0">${k}</td>
          <td style="text-align:right">${v}</td></tr>`).join('')}
      </table></div>`;
  }

  function report() {
    const deltas = [
      ['objects / draw calls', leftStats.objects, rightStats.objects],
      ['triangles', leftStats.tris, rightStats.tris],
      ['vertices', leftStats.verts, rightStats.verts],
      ['texture VRAM', leftStats.vram, rightStats.vram],
      ['file size', leftBytes, rightBytes],
    ];
    readout.innerHTML =
      (missing ? `<div style="color:#ffcc66;margin-bottom:4px">${missing}</div>` : '')
      + statBlock('ORIGINAL', '#ff9d5c', leftStats, leftBytes)
      + statBlock('OPTIMIZED', '#4fdc8b', rightStats, rightBytes)
      + `<div style="margin-top:8px;border-top:1px solid #2a3646;padding-top:6px">
        <b style="color:#dbe6f5">saved</b>
        <table style="width:100%;border-collapse:collapse;margin-top:3px">${deltas
        .map(([k, a, b]) => `<tr><td style="color:#7c8ba0">${k}</td>
          <td style="text-align:right">${a ? pct(a, b) : '—'}</td></tr>`).join('')}
        </table></div>`;
  }

  // Every prop, both routes, totalled — the arena scatters hundreds of these,
  // so the per-prop numbers above only mean something in aggregate.
  async function scanAll() {
    bScan.disabled = true;
    bScan.textContent = 'scanning…';
    let objBefore = 0, objAfter = 0, triProc = 0;
    let glbCount = 0, glbBefore = 0, glbAfter = 0, triGlbBefore = 0, triGlbAfter = 0;
    for (const p of catalogue) {
      const raw = config.props.build(p.id);
      if (raw) {
        const a = measure(raw);
        const merged = config.props.build(p.id);
        config.props.merge(merged);
        const b = measure(merged);
        objBefore += a.objects; objAfter += b.objects; triProc += b.tris;
        disposeTree(raw); disposeTree(merged);
      }
      if (p.hasModel) {
        glbCount++;
        const [sa, sb] = await Promise.all([
          fileSize(config.props.url(p.id, 'source')),
          fileSize(config.props.url(p.id, 'optimized')),
        ]);
        glbBefore += sa; glbAfter += sb;
        const [ma, mb2] = await Promise.all([
          config.props.load(p.id, 'source'),
          config.props.load(p.id, 'optimized'),
        ]);
        triGlbBefore += measure(ma).tris;
        triGlbAfter += measure(mb2).tris;
        disposeTree(ma); disposeTree(mb2);
      }
      bScan.textContent = `scanning… ${p.id}`;
    }
    scanOut.innerHTML = `
      <div style="color:#dbe6f5;margin-top:4px"><b>${catalogue.length} procedural props</b></div>
      <div>objects ${fmt(objBefore)} → ${fmt(objAfter)} ${pct(objBefore, objAfter)}
        <span style="color:#5d6b7d">(× 9 arena tiles at run time)</span></div>
      <div style="color:#dbe6f5;margin-top:6px"><b>${glbCount} imported models</b></div>
      <div>files ${mb(glbBefore)} → ${mb(glbAfter)} ${pct(glbBefore, glbAfter)}</div>
      <div>triangles ${fmt(triGlbBefore)} → ${fmt(triGlbAfter)} ${pct(triGlbBefore, triGlbAfter)}</div>
      <div style="color:#5d6b7d;margin-top:4px">an arena loads 1–3 of these, not all ${glbCount}</div>`;
    bScan.disabled = false;
    bScan.textContent = 'Scan all props';
  }
  bScan.onclick = () => scanAll();

  // ---- viewport labels ---------------------------------------------------
  const mkLabel = (text, color) => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:16px;left:0;z-index:19;transform:translateX(-50%);
      font:600 13px system-ui;letter-spacing:.08em;color:${color};
      background:#0d1219cc;border:1px solid #2a3646;border-radius:6px;padding:4px 12px`;
    el.textContent = text;
    document.body.appendChild(el);
    return el;
  };
  const labelL = mkLabel('ORIGINAL', '#ff9d5c');
  const labelR = mkLabel('OPTIMIZED', '#4fdc8b');
  // each label tracks its own model, so orbiting never leaves them describing
  // the wrong half of the screen
  const _p = new THREE.Vector3();
  function placeLabels() {
    for (const [el, pivot] of [[labelL, leftPivot], [labelR, rightPivot]]) {
      _p.copy(pivot.position).project(camera);
      el.style.left = `${(_p.x * 0.5 + 0.5) * window.innerWidth}px`;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'w') bWire.click();
    else if (e.key === ' ') { e.preventDefault(); bSpin.click(); }
  });

  await load(curId);
  syncButtons();

  engine.onUpdate = (dt) => {
    if (spin) {
      leftPivot.rotation.y += dt * 0.35;
      rightPivot.rotation.y = leftPivot.rotation.y;
    }
    orbit.update();
    placeLabels();
  };
  engine.start();
}
