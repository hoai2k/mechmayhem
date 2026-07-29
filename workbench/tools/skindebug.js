// /workbench/?edit=skindebug&mech=<id> — the SKIN DEBUG workbench.
//
//   ?edit=skindebug[&mech=<id>][&alt=1][&clip=<name>][&i=<instance>][&scan=0]
//
// An AUDIT, not an editor. It plays every animation a mech can play, watches
// the skin deform, and hands back a ranked list of the places where the
// geometry is being pulled into a shape it cannot survive — so the work of
// fixing them is a list to walk rather than a hunt.
//
// WHAT COUNTS AS A PROBLEM (the maths is in ./stretchscan.js):
//   stretch  a triangle edge dragged well past its built length — the rubber
//            forearm, the neck that grows out of the collar
//   pinch    an edge collapsed to nothing — linear blend skinning's
//            candy-wrapper twist, which reads as a crushed joint
//   tear     two vertices that share a position in the file (a UV seam) pulled
//            APART, which opens a crack straight through the model
// Only edges whose two ends carry DIFFERENT skin weights can do any of this,
// so those are the only ones sampled: everything else is rigid by construction.
// The reference is the model's BIND pose, and the mech's rest stance is scanned
// as a clip of its own, so skin that is already broken standing still is
// reported once as its own finding instead of poisoning all forty clips. Every
// finding says whether it is also broken at rest (`at rest too`).
//
// HOW TO USE IT. Pick a mech; it scans on load. Then walk the list with ◀ ▶
// (or the arrow keys): each stop loads that finding's clip, parks it on the
// exact frame the deformation peaks, and paints the failing edges over the
// model in red — the highlight is skinned live, so it stays glued to the
// geometry while the clip plays. SPACE plays/pauses, the speed box runs it in
// slow motion, "worst frame" jumps back to the peak.
//
// AND THEN FIX IT. The three buttons open the workbench that owns the fix, in a
// new tab, on this mech, this clip, this frame:
//   Edit skin   weights are wrong — opens the skin workbench with the failing
//               island already selected (&vert=) and this clip in its wiggle
//               picker, which is the common case: an edge tears because its two
//               ends were auto-rigged to bones that pull apart.
//   Edit rig    the bone is in the wrong place — no clip to carry over.
//   Edit pose   the CLIP is the problem, not the model: opens the pose
//               workbench on this clip at this time (&clip=&t=).
// "Load from manifest" re-reads models/manifest.json and drops the cached GLBs,
// so a save made in the skin workbench next door is picked up and re-scanned
// without losing your place in the list.
//
// RELATED CLI PROBES, which ask narrower versions of the same question and are
// still the right tool for a scripted regression check:
//   tools/skinstretch.mjs   one clip, worst edges grouped by bone-island
//   tools/cliptear.mjs      every clip, far-hierarchy seams only, per-clip totals
//   tools/stretchaudit.mjs  a synthetic bone sweep, with suggested skinOps
//   tools/skindebug.mjs     THIS scan, headless, for diffing an audit over a fix
//
// Findings can be marked FIXED or IGNORED; both stick in localStorage per mech,
// so an audit survives a reload and the counter tells you how far through it
// you are. "Copy report" puts the whole list on the clipboard as JSON.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { setupDevPanel } from '../ui/panel.js';
import { subjectSelect } from '../ui/subjectpick.js';
import { altChoice, altCheckbox } from '../ui/variantpick.js';
import {
  prepareMesh, poseMatrices, skinVertices, edgeLengths,
  newPeaks, accumulate, clusterSpots, DEFAULTS,
} from './stretchscan.js';

const REST_CLIP = '(rest stance)';   // the pseudo-clip that is "just standing there"
const SAMPLE_CTX = { speed: 0, maxSpeed: 1, grounded: true, vy: 0 };
const SETTLE = 8;                    // animator updates per sampled frame (see sampleAt)
const STORE = 'rw.skindebug.marks';

export async function runSkinDebugWorkbench(config, params) {
  const startId = params.get('mech') || params.get('id');
  const engine = config.stage.engine();
  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(0x21252e);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x565c66, 1.9));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight.position.set(6, 11, 8);
  scene.add(dirLight);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x32363f, roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(60, 60, 0x38445a, 0x232b38));

  camera.position.set(7, 6, 12);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 4, 0);
  orbit.update();

  const manifest = config.manifest();
  const catalogue = config.catalogue.list();
  const glbIds = catalogue.filter((c) => c.hasModel).map((c) => c.id);
  let curId = (startId && catalogue.some((c) => c.id === startId)) ? startId : (glbIds[0] || catalogue[0].id);
  let altOn = params.get('alt') === '1' || params.get('variant') === 'alt';

  // ---- live state ----
  let mech = null, animator = null;
  let preps = [];              // one per skinned mesh (see stretchscan.prepareMesh)
  let restFlags = [];          // per mesh: Set of edges already failing at rest
  let rawSpots = [];           // one clustered spot per clip, before merging
  let instances = [];          // the audit — one per PLACE on the model, worst first
  let curIdx = -1;             // which finding
  let curOcc = 0;              // which of that finding's clips is being previewed
  let scanning = false, cancelScan = false;
  let limits = { ...DEFAULTS };
  let show = { stretch: true, pinch: true, tear: true };
  let hideDone = false;
  let highlight = true, showOthers = false, autoFocus = true;
  let playing = false, playT = 0, playSpeed = 0.25;
  let previewClip = null;      // the compiled clip the preview is parked on
  let scrubT = 0;
  let marks = loadMarks();
  const bodyCenter = new THREE.Vector3(0, 4, 0);   // where the mech is, for framing

  // ---- highlight overlay ----
  const overlay = new THREE.Group();
  overlay.renderOrder = 999;
  scene.add(overlay);
  const lineMat = (color, width, op) => new THREE.LineBasicMaterial({
    color, linewidth: width, transparent: true, opacity: op, depthTest: false,
  });
  const hotLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0xff3b5c, 3, 0.95));
  const otherLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0xffc24d, 1, 0.5));
  for (const l of [hotLines, otherLines]) { l.frustumCulled = false; overlay.add(l); }
  // the failing vertices themselves, as screen-sized dots: most findings are a
  // handful of vertices, and a few red lines on a red-lit mech can be missed
  const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
    color: 0xffe8ee, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.95, depthTest: false,
  }));
  dots.frustumCulled = false;
  overlay.add(dots);
  // a locator bubble, so a six-vertex finding can still be FOUND from across
  // the arena. Deliberately faint — it is a pointer, not the evidence.
  const ring = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff3b5c, wireframe: true, transparent: true, opacity: 0.14, depthTest: false }));
  ring.frustumCulled = false;
  overlay.add(ring);

  // ================= panel =================
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;top:10px;left:10px;z-index:50;font:12px/1.45 system-ui,sans-serif;
    color:#dfe8f5;background:rgba(14,18,26,0.94);border:1px solid #2c3648;border-radius:8px;
    padding:10px;width:310px;max-height:94vh;overflow:auto;user-select:none`;
  document.body.appendChild(panel);
  const panelUI = setupDevPanel(panel, { key: 'skindebug', workbench: 'skindebug' });

  const label = (t) => {
    const d = document.createElement('div');
    d.textContent = t;
    d.style.cssText = 'color:#7d8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin:7px 0 2px';
    return d;
  };
  const btn = (text, fn, primary) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `flex:1;padding:6px;border-radius:5px;border:1px solid #2c3648;cursor:pointer;
      font-size:11px;background:${primary ? '#a33c62' : '#1a2433'};color:${primary ? '#fff' : '#cfe0f5'}`;
    b.onclick = fn;
    return b;
  };
  const row = (...kids) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;gap:6px;margin:4px 0;align-items:center';
    d.append(...kids);
    return d;
  };
  const check = (text, get, set, title) => {
    const l = document.createElement('label');
    l.style.cssText = 'display:flex;gap:5px;align-items:center;font-size:11px;cursor:pointer;flex:1';
    if (title) l.title = title;
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = get();
    c.onchange = () => { set(c.checked); };
    l.append(c, document.createTextNode(text));
    l._input = c;
    return l;
  };

  // ---- subject ----
  const mechSel = subjectSelect({
    config, value: curId, label: (id) => id,
    onPick: (id) => { curId = id; altOn = false; load(id); },
  });
  panel.appendChild(mechSel);
  const altRow = document.createElement('div');
  panel.appendChild(altRow);
  function refreshAltRow() {
    altRow.innerHTML = '';
    const box = altCheckbox(altChoice(manifest, curId, altOn), (next) => { altOn = next; load(curId); });
    if (box) altRow.appendChild(box);
  }

  const status = document.createElement('div');
  status.style.cssText = `white-space:pre-wrap;font:11px/1.45 ui-monospace,monospace;color:#9fb2c8;
    margin:5px 0;padding:5px;background:#0d1219;border:1px solid #222c3a;border-radius:5px`;
  panel.appendChild(status);

  // ---- the finding on screen ----
  panel.appendChild(label('Finding'));
  const navRow = document.createElement('div');
  navRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin:2px 0';
  const prevBtn = btn('◀', () => step(-1));
  const nextBtn = btn('▶', () => step(1));
  const counter = document.createElement('div');
  counter.style.cssText = 'flex:2;text-align:center;font:12px ui-monospace,monospace;color:#dfe8f5';
  navRow.append(prevBtn, counter, nextBtn);
  panel.appendChild(navRow);

  const detail = document.createElement('div');
  detail.style.cssText = `white-space:pre-wrap;font:11px/1.5 ui-monospace,monospace;color:#e8b3c0;
    margin:4px 0;padding:6px;background:#170f14;border:1px solid #3a2530;border-radius:5px;min-height:34px`;
  panel.appendChild(detail);

  // Which of this finding's clips to watch it in. One spot usually fails in
  // many clips (same bad weights, different motion); the list is worst first,
  // so the default pick is the one that shows the damage most clearly.
  const occSel = document.createElement('select');
  occSel.style.cssText = `width:100%;margin:3px 0;background:#0e131b;color:#dfe8f5;
    border:1px solid #2c3648;padding:4px;border-radius:4px;font:11px ui-monospace,monospace`;
  occSel.onchange = () => { curOcc = +occSel.value || 0; applyOccurrence(); };
  panel.appendChild(occSel);

  const markRow = row(
    btn('✓ Fixed', () => setMark('fixed')),
    btn('· Ignore', () => setMark('ignored')),
    btn('↺ Open', () => setMark(null)));
  panel.appendChild(markRow);

  // ---- preview ----
  panel.appendChild(label('Preview'));
  const playBtn = btn('▶ Play', togglePlay, true);
  const speedSel = document.createElement('select');
  speedSel.style.cssText = 'background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:4px;border-radius:4px;font-size:11px';
  for (const s of [1, 0.5, 0.25, 0.1]) {
    const o = document.createElement('option');
    o.value = String(s); o.textContent = s === 1 ? '1×' : `${s}×`;
    speedSel.appendChild(o);
  }
  speedSel.value = String(playSpeed);
  speedSel.onchange = () => { playSpeed = +speedSel.value; };
  panel.appendChild(row(playBtn, speedSel, btn('⤓ Worst frame', toWorstFrame)));
  const scrub = document.createElement('input');
  scrub.type = 'range'; scrub.min = '0'; scrub.max = '1'; scrub.step = '0.001'; scrub.value = '0';
  scrub.style.cssText = 'width:100%;margin:3px 0';
  scrub.oninput = () => { stopPlay(); scrubT = +scrub.value; poseAt(scrubT); syncTime(); };
  panel.appendChild(scrub);
  const timeNote = document.createElement('div');
  timeNote.style.cssText = 'font:10px ui-monospace,monospace;color:#7d8ea3;margin-bottom:2px';
  panel.appendChild(timeNote);

  panel.appendChild(row(
    check('Highlight (H)', () => highlight, (v) => { highlight = v; refreshOverlay(); }),
    check('Other spots', () => showOthers, (v) => { showOthers = v; refreshOverlay(); },
      'Also outline every OTHER finding in this same clip, in amber.')));
  panel.appendChild(row(
    check('Auto-frame (F)', () => autoFocus, (v) => { autoFocus = v; if (v) focusSpot(); }),
    btn('Focus spot', focusSpot)));

  // ---- jump to the tool that fixes it ----
  panel.appendChild(label('Fix it in'));
  panel.appendChild(row(
    btn('Edit skin', () => openTool('skin')),
    btn('Edit rig', () => openTool('rig')),
    btn('Edit pose', () => openTool('pose'))));
  const linkNote = document.createElement('div');
  linkNote.style.cssText = 'font-size:10px;color:#69788c;line-height:1.4;margin-bottom:2px';
  linkNote.textContent = 'Opens in a new tab on this mech · skin gets the failing island + clip, pose gets the clip at this frame.';
  panel.appendChild(linkNote);

  // ---- the list ----
  panel.appendChild(label('All findings'));
  const filterRow = document.createElement('div');
  filterRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:2px 0';
  for (const k of ['stretch', 'pinch', 'tear']) {
    filterRow.appendChild(check(k, () => show[k], (v) => { show[k] = v; renderList(); }));
  }
  filterRow.appendChild(check('hide done', () => hideDone, (v) => { hideDone = v; renderList(); }));
  panel.appendChild(filterRow);
  const list = document.createElement('div');
  list.style.cssText = 'max-height:210px;overflow:auto;border:1px solid #222c3a;border-radius:5px;background:#0d1219';
  panel.appendChild(list);

  // ---- scan controls ----
  panel.appendChild(label('Scan'));
  const limRow = document.createElement('div');
  limRow.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:10px;color:#7d8ea3';
  const num = (key, tip) => {
    const i = document.createElement('input');
    i.type = 'number'; i.step = key === 'tear' ? '0.001' : '0.05'; i.value = String(limits[key]);
    i.title = tip;
    i.style.cssText = 'width:100%;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;padding:3px;border-radius:4px;font-size:11px';
    i.onchange = () => { limits[key] = +i.value || DEFAULTS[key]; i.value = String(limits[key]); };
    const w = document.createElement('div');
    w.style.cssText = 'flex:1';
    const t = document.createElement('div'); t.textContent = key;
    w.append(t, i);
    return w;
  };
  limRow.append(
    num('stretch', 'Flag an edge this many times its built length (1.35 = 35% longer).'),
    num('pinch', 'Flag an edge collapsed to this fraction of its built length.'),
    num('tear', 'Flag a weld seam gaping this fraction of body height.'));
  panel.appendChild(limRow);
  panel.appendChild(row(
    btn('⟳ Rescan', () => scan(), true),
    btn('⟳ Load from manifest', reloadFromManifest)));
  panel.appendChild(row(
    btn('Copy report', copyReport),
    btn('Download report', downloadReport)));
  const help = document.createElement('div');
  help.style.cssText = 'font-size:10px;color:#69788c;line-height:1.45;margin-top:6px';
  help.textContent = '← → finding · SPACE play/pause · H highlight · F frame the spot · '
    + 'orbit = drag · zoom = wheel';
  panel.appendChild(help);

  // ================= marks (fixed / ignored), remembered per mech =================
  function loadMarks() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; }
  }
  function saveMarks() {
    try { localStorage.setItem(STORE, JSON.stringify(marks)); } catch (e) { /* private mode */ }
  }
  function setMark(state) {
    const inst = instances[curIdx];
    if (!inst) return;
    if (state) marks[inst.key] = state; else delete marks[inst.key];
    saveMarks();
    renderList(); renderDetail();
  }

  // ================= build =================
  async function load(id) {
    stopPlay();
    cancelScan = true;
    curId = id;
    const alt = altChoice(manifest, id, altOn);
    altOn = alt.useAlt;
    const u = new URL(location.href);
    u.searchParams.set('mech', id);
    if (altOn) u.searchParams.set('alt', '1'); else u.searchParams.delete('alt');
    history.replaceState(null, '', u);
    if (mech) {
      scene.remove(mech.group);
      mech.group.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) m?.dispose?.();
      });
    }
    mech = null; animator = null; preps = []; restFlags = [];
    instances = []; curIdx = -1; previewClip = null;
    renderList(); renderDetail(); refreshOverlay();
    mechSel.value = id;
    refreshAltRow();
    setStatus('building…');
    mech = await config.variants.build(id, { variant: altOn ? 'alt' : 'glb' });
    if (!mech) { setStatus(`no model for ${id}`); return; }
    mech.group.position.set(0, 0, 0);
    scene.add(mech.group);
    animator = config.anim.animator(mech, id);
    animator.poseStatic();
    mech.group.updateWorldMatrix(true, true);
    panelUI.setSubtitle(`${id}${altOn ? ' · ALT' : ''} · ${mech.isGLB ? 'GLB' : 'procedural'}`);
    frameCamera();
    // gather the skinned meshes — the only geometry that CAN deform
    const meshes = [];
    mech.group.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    preps = meshes.map((m) => prepareMesh(m)).filter(Boolean);
    if (!preps.length) {
      setStatus(mech.isGLB
        ? `${id}: no skinned geometry to audit.`
        : `${id} has no GLB — the procedural body is rigid parts on joints, so there is no skin to stretch.`);
      return;
    }
    if (params.get('scan') === '0') {
      setStatus(`${id}: ${preps.reduce((a, p) => a + p.E, 0)} deformable edges ready. Press Rescan.`);
      return;
    }
    await scan();
  }

  function frameCamera() {
    mech.group.updateWorldMatrix(true, true);
    let top = 0;
    const v = new THREE.Vector3();
    for (const j of config.rig.joints) {
      const o = mech.joints?.[j];
      if (o) top = Math.max(top, o.getWorldPosition(v).y);
    }
    const h = Math.max(3, config.geometry.headTop(mech) || 0, top * 1.12);
    bodyCenter.set(0, h * 0.55, 0);
    orbit.target.copy(bodyCenter);
    camera.position.set(h * 0.55, h * 0.78, h * 1.85);
    orbit.update();
  }

  // ================= posing =================
  // The same settle the pose workbench uses: the animator smooths towards its
  // target, so a single update lands short of the authored pose. Eight steps at
  // dt 0.15 are converged to ~1e-13, and it makes a sampled frame REPRODUCIBLE —
  // "worst frame" shows exactly the geometry the scan measured.
  function poseStaticRest() {
    animator.poseStatic();
    animator.impulses.length = 0;
    animator.action = null;
    mech.group.updateWorldMatrix(true, true);
  }
  function poseClipAt(clip, t) {
    animator.poseStatic();
    animator.impulses.length = 0;
    const dt = 0.15;
    for (let i = 0; i < SETTLE; i++) {
      // a FRESH action each step, not one whose `t` is rewound: a one-shot clip
      // sampled at its own end starts fading and the animator drops the action
      // on the next update (`weight <= 0`), which would leave nothing to rewind.
      // fadeIn 1e-6 means the new action is already at full weight after the
      // first update, so this samples exactly what a rewind would have.
      animator.action = {
        clip, t: t - dt, speed: 1, weight: 1, fadeIn: 1e-6, fadingOut: false, onEvent: null, lastT: -1,
      };
      animator.update(dt, SAMPLE_CTX);
    }
    animator.action = null;
    mech.group.updateWorldMatrix(true, true);
  }
  function poseAt(t) {
    if (!mech) return;
    if (previewClip) poseClipAt(previewClip, t); else poseStaticRest();
  }

  // ================= the scan =================
  function clipsForMech() {
    return config.anim.clipsFor(curId, mech?.isGLB ? mech : null)
      .map((c) => ({ ...c, clip: config.anim.clip(c.name, mech) }))
      .filter((c) => c.clip && c.clip.dur > 0);
  }

  async function scan() {
    if (!preps.length || scanning) return;
    scanning = true; cancelScan = false;
    stopPlay();
    instances = []; rawSpots = []; curIdx = -1; previewClip = null;
    renderList(); renderDetail(); refreshOverlay();
    const clips = clipsForMech();
    const lens = preps.map((p) => new Float32Array(p.E));
    const t0 = performance.now();

    // ---- pass 1: the rest stance ----
    // Its findings are real findings (skin that is wrong before anything moves),
    // AND the baseline every clip finding is annotated against.
    restFlags = preps.map(() => new Set());
    poseStaticRest();
    {
      const peaks = preps.map((p) => newPeaks(p));
      for (let i = 0; i < preps.length; i++) {
        const mats = poseMatrices(THREE, preps[i].mesh, preps[i]._mats);
        preps[i]._mats = mats;
        skinVertices(preps[i], mats);
        edgeLengths(preps[i], lens[i]);
        accumulate(preps[i], peaks[i], lens[i], 0, limits);
        for (let e = 0; e < preps[i].E; e++) if (peaks[i].type[e]) restFlags[i].add(e);
        addSpots(clusterSpots(preps[i], peaks[i]), { name: REST_CLIP, role: 'rest stance', dur: 0 }, i);
      }
    }

    // ---- pass 2: every clip this mech can play ----
    for (let ci = 0; ci < clips.length; ci++) {
      if (cancelScan) break;
      const c = clips[ci];
      setStatus(`scanning ${curId} — ${ci + 1}/${clips.length}  ${c.name}\n${rawSpots.length} spot(s) so far`);
      await new Promise((r) => requestAnimationFrame(r));   // let the panel paint
      const n = Math.max(8, Math.min(60, Math.round(c.clip.dur / 0.04)));
      const peaks = preps.map((p) => newPeaks(p));
      for (let s = 0; s <= n; s++) {
        const t = (c.clip.dur * s) / n;
        poseClipAt(c.clip, t);
        for (let i = 0; i < preps.length; i++) {
          const mats = poseMatrices(THREE, preps[i].mesh, preps[i]._mats);
          preps[i]._mats = mats;
          skinVertices(preps[i], mats);
          edgeLengths(preps[i], lens[i]);
          accumulate(preps[i], peaks[i], lens[i], t, limits);
        }
      }
      for (let i = 0; i < preps.length; i++) addSpots(clusterSpots(preps[i], peaks[i]), c, i);
    }

    const splitPairs = preps.reduce((a, p) => a + (p.splitPairs || 0), 0);
    instances = mergeSpots();
    scanning = false;
    const ms = Math.round(performance.now() - t0);
    setStatus(`${curId}${altOn ? ' · ALT' : ''} — ${instances.length} finding(s) `
      + `from ${rawSpots.length} spot·clip hit(s) over ${clips.length + 1} clip(s), ${(ms / 1000).toFixed(1)}s\n`
      + `${preps.reduce((a, p) => a + p.E, 0)} deformable edges of ${preps.reduce((a, p) => a + p.n, 0)} verts`
      + (splitPairs ? `\n${splitPairs} seam-cut pair(s) skipped — split on purpose, see manifest seamCuts` : ''));
    renderList();
    // ?clip= / ?i= deep-link one finding; otherwise open on the worst
    const wantClip = params.get('clip');
    const wantI = params.has('i') ? +params.get('i') - 1 : NaN;
    let idx = 0;
    if (Number.isFinite(wantI) && instances[wantI]) idx = wantI;
    else if (wantClip) idx = Math.max(0, instances.findIndex((x) => x.seen.some((o) => o.clip === wantClip)));
    if (instances.length) select(idx); else { renderDetail(); refreshOverlay(); }
  }

  // One clustered spot in one clip. Kept raw until the whole scan is in, then
  // merged — see mergeSpots.
  function addSpots(spots, clip, meshIdx) {
    for (const spot of spots) {
      rawSpots.push({
        ...spot, meshIdx,
        clip: clip.name, role: clip.role || '', dur: clip.dur || 0,
        atRest: clip.name === REST_CLIP || spot.edges.some((e) => restFlags[meshIdx]?.has(e)),
      });
    }
  }

  // A FINDING IS A PLACE ON THE MODEL, NOT A PLACE IN A CLIP.
  //
  // The same few stray vertices tear in every animation that moves the bone
  // they were mis-assigned to, so a per-clip list is the same defect written
  // out forty times — and forty entries that are all fixed by one rebind is a
  // list nobody can work through. So spots that share geometry are merged into
  // one finding, carrying every clip it showed up in (`seen`, worst first). The
  // headline numbers are the worst occurrence; the clip dropdown walks the rest.
  function mergeSpots() {
    const parent = new Map();
    const find = (a) => { let r = a; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(a) !== r) { const p = parent.get(a); parent.set(a, r); a = p; } return r; };
    const add = (k) => { if (!parent.has(k)) parent.set(k, k); return k; };
    const key = (meshIdx, vert) => `${meshIdx}:${vert}`;
    for (const spot of rawSpots) {
      const first = add(key(spot.meshIdx, spot.verts[0]));
      for (const v of spot.verts) {
        const k = add(key(spot.meshIdx, v));
        const ra = find(first), rb = find(k);
        if (ra !== rb) parent.set(rb, ra);
      }
    }
    const groups = new Map();
    for (const spot of rawSpots) {
      const r = find(key(spot.meshIdx, spot.verts[0]));
      let g = groups.get(r);
      if (!g) { g = []; groups.set(r, g); }
      g.push(spot);
    }
    // ...then merge what is merely NEXT TO each other. Sharing a vertex is too
    // strict: one bad weight patch usually fails as two or three little runs
    // separated by a vertex whose own weights happen to match its neighbour's,
    // and reporting those separately is the per-clip problem again in miniature.
    const merged = mergeAdjacent([...groups.values()]);
    const jointOfBone = new Map();
    for (const [j, b] of Object.entries(mech.boneMap || {})) if (b?.name) jointOfBone.set(b.name, j);
    const out = [];
    for (const g of merged) {
      g.sort((a, b) => b.sev - a.sev);
      const worst = g[0];
      const prep = preps[worst.meshIdx];
      const bones = prep.mesh.skeleton.bones;
      const slots = [...new Set(g.flatMap((s) => s.slots))];
      const edges = [...new Set(g.flatMap((s) => s.edges))];
      const verts = slots.map((s) => prep.verts[s]);
      const tally = new Map();
      for (const s of slots) {
        const name = bones[prep.domSlot[s]]?.name || '?';
        tally.set(name, (tally.get(name) || 0) + 1);
      }
      const boneNames = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([n, c]) => `${n}${jointOfBone.has(n) ? `(${jointOfBone.get(n)})` : ''}×${c}`);
      out.push({
        key: `${curId}|${altOn ? 'alt' : 'glb'}|${worst.type}|${Math.min(...verts)}`,
        mech: curId, variant: altOn ? 'alt' : 'glb',
        meshIdx: worst.meshIdx,
        type: worst.type, sev: worst.sev, ratio: worst.ratio, len: worst.len, rest: worst.rest,
        clip: worst.clip, role: worst.role, dur: worst.dur, t: worst.t, hits: worst.hits,
        slots, edges, verts, peakVert: worst.peakVert,
        boneNames, where: [...tally.keys()].sort().join('+'),
        atRest: g.some((s) => s.atRest),
        // every clip this spot fails in, worst first — ONE row per clip, since a
        // merged finding usually collected several runs from the same clip
        seen: worstPerClip(g),
      });
    }
    out.sort((a, b) => b.sev - a.sev);
    out.forEach((inst, i) => { inst.n = i + 1; });
    return out;
  }

  function worstPerClip(g) {
    const byClip = new Map();
    for (const s of g) {
      const prev = byClip.get(s.clip);
      if (!prev || s.sev > prev.sev) {
        byClip.set(s.clip, { clip: s.clip, role: s.role, dur: s.dur, t: s.t, sev: s.sev, type: s.type, ratio: s.ratio, hits: s.hits });
      }
    }
    return [...byClip.values()].sort((a, b) => b.sev - a.sev);
  }

  // Merge groups that TOUCH on the mesh (see mergeSpots). A group's reach is its
  // vertices plus everything one mesh edge (or one weld mate) away, so two runs
  // with a single rigid vertex between them fuse and nothing else does — the
  // reach is bounded by the geometry rather than by a distance guess, so a
  // finding cannot creep across a whole torso one small spot at a time.
  function mergeAdjacent(groups) {
    const parent = groups.map((_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    const owner = new Map();     // "mesh:vert" -> first group that reaches it
    groups.forEach((g, gi) => {
      const prep = preps[g[0].meshIdx];
      const reach = new Set();
      for (const spot of g) {
        for (const slot of spot.slots) {
          reach.add(prep.verts[slot]);
          for (const nb of prep.adj[slot]) reach.add(nb);
        }
      }
      for (const v of reach) {
        const k = `${g[0].meshIdx}:${v}`;
        const prev = owner.get(k);
        if (prev === undefined) owner.set(k, gi); else union(prev, gi);
      }
    });
    const out = new Map();
    groups.forEach((g, i) => {
      const r = find(i);
      const cur = out.get(r);
      if (cur) cur.push(...g); else out.set(r, [...g]);
    });
    return [...out.values()];
  }

  // ================= navigation =================
  function visible() {
    return instances.filter((x) => show[x.type] && !(hideDone && marks[x.key]));
  }
  function select(idx, occ = 0) {
    if (!instances.length) return;
    curIdx = Math.max(0, Math.min(instances.length - 1, idx));
    curOcc = occ;
    renderOccOptions();
    applyOccurrence();
    renderList();
  }
  // Park the preview on one (finding, clip) pair: its clip, its peak frame.
  function applyOccurrence() {
    const inst = instances[curIdx];
    if (!inst) return;
    const occ = inst.seen[Math.min(curOcc, inst.seen.length - 1)] || inst.seen[0];
    stopPlay();
    if (!occ || occ.clip === REST_CLIP) {
      previewClip = null; scrubT = 0; poseStaticRest();
    } else {
      previewClip = config.anim.clip(occ.clip, mech) || null;
      scrubT = occ.t;
      poseAt(scrubT);
    }
    syncTime();
    renderDetail(); refreshOverlay();
    if (autoFocus) focusSpot();
  }
  function renderOccOptions() {
    const inst = instances[curIdx];
    occSel.innerHTML = '';
    occSel.disabled = !inst;
    if (!inst) return;
    inst.seen.forEach((o, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${o.clip}  sev ${o.sev.toFixed(1)}  t=${o.t.toFixed(2)}`
        + (o.role ? `  · ${o.role}` : '');
      occSel.appendChild(opt);
    });
    occSel.value = String(Math.min(curOcc, inst.seen.length - 1));
  }
  // The clip on screen right now — what the "fix it in" links carry over.
  function curOccurrence() {
    const inst = instances[curIdx];
    if (!inst) return null;
    return inst.seen[Math.min(curOcc, inst.seen.length - 1)] || null;
  }
  // Step through what is CURRENTLY listed, so the filters mean something: with
  // "hide done" on, the arrows walk the work that is left.
  function step(dir) {
    const vis = visible();
    if (!vis.length) return;
    const here = instances[curIdx];
    let at = vis.indexOf(here);
    if (at < 0) { select(instances.indexOf(vis[dir > 0 ? 0 : vis.length - 1])); return; }
    at = (at + dir + vis.length) % vis.length;
    select(instances.indexOf(vis[at]));
  }

  // ================= playback =================
  function togglePlay() {
    if (playing) stopPlay(); else startPlay();
  }
  function startPlay() {
    const inst = instances[curIdx];
    if (!inst || !previewClip) return;
    playing = true;
    playT = scrubT >= previewClip.dur - 1e-3 ? 0 : scrubT;
    syncPlayUI();
  }
  function stopPlay() {
    if (!playing) return;
    playing = false;
    syncPlayUI();
  }
  function tickPlay(dt) {
    if (!playing || !previewClip) return;
    playT += dt * playSpeed;
    if (playT > previewClip.dur) playT -= previewClip.dur;
    // driven the same way the scan sampled it, so the geometry on screen at the
    // peak time IS the geometry that was measured
    poseClipAt(previewClip, playT);
    scrubT = playT;
    syncTime();
  }
  function toWorstFrame() {
    const occ = curOccurrence();
    if (!occ) return;
    stopPlay();
    scrubT = occ.t;
    poseAt(scrubT);
    syncTime();
  }
  function syncPlayUI() {
    playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play';
    playBtn.style.background = playing ? '#1f7a4d' : '#a33c62';
    const can = !!previewClip;
    playBtn.disabled = !can;
    playBtn.style.opacity = can ? '1' : '0.45';
  }
  function syncTime() {
    const dur = previewClip?.dur || 0;
    scrub.max = String(Math.max(0.001, dur));
    scrub.step = String(Math.max(0.001, dur / 240));
    scrub.value = String(scrubT);
    scrub.disabled = !dur;
    const occ = curOccurrence();
    timeNote.textContent = dur
      ? `t ${scrubT.toFixed(3)} / ${dur.toFixed(2)}s${occ ? `  ·  peak ${occ.t.toFixed(3)}` : ''}`
      : 'static pose — nothing to play';
    syncPlayUI();
  }

  // ================= overlay =================
  // The highlight is SKINNED EVERY FRAME rather than baked at the peak: a
  // finding is a piece of geometry, and watching it deform through the whole
  // clip is how you tell a weight problem from a clip problem.
  function refreshOverlay() {
    const inst = instances[curIdx];
    overlay.visible = !!inst && highlight;
    ring.visible = overlay.visible;
    otherLines.visible = overlay.visible && showOthers;
    if (!overlay.visible) return;
    setLineEdges(hotLines, inst.meshIdx, inst.edges);
    dots.userData.slots = inst.slots;
    dots.userData.meshIdx = inst.meshIdx;
    if (dots.geometry.attributes.position?.count !== inst.slots.length) {
      dots.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(inst.slots.length * 3), 3));
    }
    if (showOthers) {
      const clipNow = curOccurrence()?.clip;
      const others = instances.filter((x, i) => i !== curIdx && x.meshIdx === inst.meshIdx
        && x.seen.some((o) => o.clip === clipNow));
      setLineEdges(otherLines, inst.meshIdx, others.flatMap((x) => x.edges));
    }
    updateOverlay();
  }
  function worldScale(meshIdx) {
    return preps[meshIdx].mesh.matrixWorld.getMaxScaleOnAxis();
  }
  function setLineEdges(lines, meshIdx, edges) {
    lines.userData.edges = edges;
    lines.userData.meshIdx = meshIdx;
    const g = lines.geometry;
    const need = edges.length * 6;
    if (!g.attributes.position || g.attributes.position.array.length !== need) {
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(need), 3));
    }
  }
  const _v = new THREE.Vector3();
  function writeLine(lines) {
    const edges = lines.userData.edges;
    const prep = preps[lines.userData.meshIdx];
    if (!edges || !prep) return;
    const arr = lines.geometry.attributes.position.array;
    const p = prep._pose;
    const mw = prep.mesh.matrixWorld;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      for (const [k, slot] of [[0, prep.edgeA[e]], [1, prep.edgeB[e]]]) {
        _v.set(p[slot * 3], p[slot * 3 + 1], p[slot * 3 + 2]).applyMatrix4(mw);
        arr[i * 6 + k * 3] = _v.x; arr[i * 6 + k * 3 + 1] = _v.y; arr[i * 6 + k * 3 + 2] = _v.z;
      }
    }
    lines.geometry.attributes.position.needsUpdate = true;
    lines.geometry.computeBoundingSphere();
  }
  function updateOverlay() {
    const inst = instances[curIdx];
    if (!overlay.visible || !inst) return;
    // re-skin the meshes the overlay reads, then rewrite the line buffers
    const used = new Set([inst.meshIdx]);
    if (showOthers) used.add(otherLines.userData.meshIdx);
    for (const i of used) {
      if (preps[i] === undefined) continue;
      const mats = poseMatrices(THREE, preps[i].mesh, preps[i]._mats);
      preps[i]._mats = mats;
      skinVertices(preps[i], mats);
    }
    writeLine(hotLines);
    if (showOthers) writeLine(otherLines);
    {
      const prep = preps[inst.meshIdx];
      const arr = dots.geometry.attributes.position.array;
      inst.slots.forEach((slot, i) => {
        _v.set(prep._pose[slot * 3], prep._pose[slot * 3 + 1], prep._pose[slot * 3 + 2])
          .applyMatrix4(prep.mesh.matrixWorld);
        arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z;
      });
      dots.geometry.attributes.position.needsUpdate = true;
      dots.geometry.computeBoundingSphere();
    }
    // the locator ring grows with the spot, so it reads as "this thing here"
    // whether the finding is six vertices or a whole shoulder
    const { center, radius, bodyH } = spotBounds(inst);
    ring.position.copy(center);
    ring.scale.setScalar(Math.min(bodyH * 0.45, Math.max(bodyH * 0.03, radius * 1.15)));
  }
  // Where the finding IS right now, in world space, and how big it is. Measured
  // on the POSED geometry, so a spot that has smeared halfway across the arena
  // reports the size it currently has — which is what the camera has to fit.
  const _c = new THREE.Vector3();
  function spotBounds(inst) {
    const prep = preps[inst.meshIdx];
    const p = prep._pose;
    _c.set(0, 0, 0);
    for (const s of inst.slots) _c.add(_v.set(p[s * 3], p[s * 3 + 1], p[s * 3 + 2]));
    _c.multiplyScalar(1 / Math.max(1, inst.slots.length));
    let r = 0;
    for (const s of inst.slots) {
      r = Math.max(r, _v.set(p[s * 3], p[s * 3 + 1], p[s * 3 + 2]).distanceTo(_c));
    }
    const k = worldScale(inst.meshIdx);
    return { center: _c.clone().applyMatrix4(prep.mesh.matrixWorld), radius: r * k, bodyH: prep.height * k };
  }
  // Close enough to see the deformation, far enough to see WHERE ON THE MECH it
  // is: a bare "put the camera near the centroid" loses the body entirely on the
  // small findings, which are most of them.
  function focusSpot() {
    const inst = instances[curIdx];
    if (!inst) return;
    const prep = preps[inst.meshIdx];
    const mats = poseMatrices(THREE, prep.mesh, prep._mats);
    prep._mats = mats;
    skinVertices(prep, mats);
    const { center, radius, bodyH } = spotBounds(inst);
    // THE MECH MUST STAY IN SHOT. A finding is only meaningful as "that piece,
    // there, on this robot" — and the worst ones smear their geometry (and so
    // their centroid) a long way from the body, so pulling the camera in tight
    // on the centroid can leave nothing recognisable on screen at all. Hence
    // three floors on the distance: the body's own height, the spot's current
    // size, and how far the spot has wandered from the body.
    const away = center.distanceTo(bodyCenter);
    const d = Math.max(bodyH * 0.85, radius * 2.2, away * 1.15);
    const dir = camera.position.clone().sub(orbit.target).normalize();
    orbit.target.lerpVectors(center, bodyCenter, 0.25);
    camera.position.copy(orbit.target).addScaledVector(dir, d);
    orbit.update();
  }

  // ================= readouts =================
  function setStatus(t) { status.textContent = t; }
  const TYPE_COLOR = { stretch: '#ff6b8a', pinch: '#ffb347', tear: '#7fd8ff' };
  function pct(x) { return `${Math.round(x * 100)}%`; }
  function describe(inst) {
    if (inst.type === 'tear') return `gap ${(inst.len / preps[inst.meshIdx].height * 100).toFixed(2)}% of height`;
    if (inst.type === 'pinch') return `${pct(inst.ratio)} of rest length`;
    return `${inst.ratio.toFixed(2)}× rest length`;
  }
  function renderDetail() {
    const inst = instances[curIdx];
    counter.textContent = instances.length
      ? `${curIdx + 1} / ${instances.length}${visible().length !== instances.length ? ` (${visible().length} shown)` : ''}`
      : '—';
    for (const b of [prevBtn, nextBtn]) {
      b.disabled = !instances.length;
      b.style.opacity = instances.length ? '1' : '0.4';
    }
    if (!inst) {
      detail.textContent = scanning ? 'scanning…' : 'No findings — nothing over the limits.';
      detail.style.color = '#8ba0b8';
      syncTime();
      return;
    }
    detail.style.color = TYPE_COLOR[inst.type] || '#e8b3c0';
    const mark = marks[inst.key];
    const occ = curOccurrence() || inst.seen[0];
    detail.textContent =
      `${inst.type.toUpperCase()}  worst sev ${inst.sev.toFixed(2)}   ${describe(inst)}\n`
      + `bones ${inst.boneNames.join('  ')}\n`
      + `${inst.slots.length} vert(s), ${inst.edges.length} edge(s) · `
      + `fails in ${inst.seen.length} clip(s)\n`
      + `showing ${occ.clip}${occ.role ? ` · ${occ.role}` : ''}  `
      + `sev ${occ.sev.toFixed(2)} at t=${occ.t.toFixed(3)}s (${occ.hits} frame(s))`
      + (inst.atRest ? '\n⚠ also broken at REST — the skinning, not any one clip' : '')
      + (mark ? `\n● marked ${mark}` : '');
  }
  function renderList() {
    const vis = visible();
    list.innerHTML = '';
    for (const inst of vis) {
      const i = instances.indexOf(inst);
      const b = document.createElement('button');
      const mark = marks[inst.key];
      b.style.cssText = `display:flex;gap:6px;width:100%;text-align:left;border:0;cursor:pointer;
        padding:4px 6px;font:11px/1.35 ui-monospace,monospace;
        background:${i === curIdx ? '#2a1c24' : 'transparent'};
        color:${mark ? '#5d6b7d' : '#cfe0f5'};${mark ? 'text-decoration:line-through;' : ''}
        border-bottom:1px solid #161d27`;
      const dot = document.createElement('span');
      dot.textContent = '■';
      dot.style.color = mark ? '#3f4b5c' : (TYPE_COLOR[inst.type] || '#fff');
      const txt = document.createElement('span');
      txt.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      txt.textContent = `${inst.n}. ${inst.sev.toFixed(1)} ${inst.where}`
        + (inst.seen.length > 1 ? ` ×${inst.seen.length}` : '');
      b.title = `${inst.type} · ${describe(inst)} · worst in ${inst.clip} at t=${inst.t.toFixed(2)}`
        + ` · ${inst.seen.length} clip(s) · ${inst.where}`;
      b.append(dot, txt);
      b.onclick = () => select(i);
      list.appendChild(b);
    }
    if (!vis.length) {
      const d = document.createElement('div');
      d.style.cssText = 'padding:8px;color:#69788c;font-size:11px';
      d.textContent = instances.length ? 'Everything is filtered out.' : (scanning ? 'scanning…' : 'Nothing found.');
      list.appendChild(d);
    }
    renderDetailCounterOnly();
  }
  function renderDetailCounterOnly() {
    counter.textContent = instances.length
      ? `${curIdx + 1} / ${instances.length}${visible().length !== instances.length ? ` (${visible().length} shown)` : ''}`
      : '—';
  }

  // ================= hand-off to the other workbenches =================
  function openTool(tool) {
    const inst = instances[curIdx];
    const p = new URLSearchParams();
    p.set('edit', tool);
    p.set('mech', curId);
    if (altOn) p.set('alt', '1');
    const occ = curOccurrence();
    if (inst) {
      // Whatever is ON SCREEN travels, not the finding's worst clip: if you
      // switched the preview to another clip to see the problem better, that is
      // the clip you want next door. A clip only means something where a clip
      // can be shown — the rig editor builds a static skeleton, so it gets the
      // mech and nothing else.
      const clip = occ && occ.clip !== REST_CLIP ? occ.clip : null;
      if (tool === 'pose' && clip) {
        p.set('clip', clip);
        p.set('t', occ.t.toFixed(3));
      }
      if (tool === 'skin') {
        // The vertex whose island IS the problem. Translated back to the FILE's
        // own numbering first: a seam cut adds vertices to the built model that
        // the raw GLB the skin workbench edits has never heard of.
        p.set('vert', String(sourceVert(inst.meshIdx, inst.peakVert)));
        if (clip) p.set('clip', clip);
      }
    }
    const dir = location.pathname.includes('/workbench/')
      ? location.pathname
      : location.pathname.replace(/[^/]*$/, '') + 'workbench/';
    window.open(`${dir}?${p.toString()}`, '_blank', 'noopener');
  }

  // A built model's vertex id in the numbering of the FILE it was built from.
  // seamcut.js appends vertices (split copies and cap lids) past the end of the
  // original buffer and records where each came from; without this a hand-off
  // to the skin workbench could name a vertex that does not exist there.
  function sourceVert(meshIdx, vert) {
    const src = preps[meshIdx]?.mesh.geometry.userData?.seamCut?.source;
    return src && vert < src.length ? src[vert] : vert;
  }

  // ================= re-read the sources =================
  async function reloadFromManifest() {
    if (!config.reload) { setStatus('this game config cannot re-read its sources'); return; }
    const keep = instances[curIdx]?.key || null;
    setStatus('re-reading models/manifest.json…');
    await config.reload();
    await load(curId);
    if (keep) {
      const i = instances.findIndex((x) => x.key === keep);
      if (i >= 0) select(i);
    }
  }

  // ================= report =================
  function report() {
    return {
      mech: curId, variant: altOn ? 'alt' : 'glb', limits,
      generated: new Date().toISOString(),
      findings: instances.map((x) => ({
        n: x.n, type: x.type, where: x.where,
        sev: +x.sev.toFixed(3), ratio: +x.ratio.toFixed(3),
        worstClip: x.clip, role: x.role, t: +x.t.toFixed(3), frames: x.hits,
        clips: x.seen.length,
        bones: x.boneNames, verts: x.slots.length, edges: x.edges.length,
        peakVert: x.peakVert, atRest: x.atRest, mark: marks[x.key] || null,
        seen: x.seen.map((o) => ({ clip: o.clip, sev: +o.sev.toFixed(2), t: +o.t.toFixed(3) })),
      })),
    };
  }
  function copyReport() {
    const text = JSON.stringify(report(), null, 2);
    navigator.clipboard?.writeText(text)
      .then(() => setStatus(`report copied — ${instances.length} finding(s)`))
      .catch(() => setStatus('clipboard refused; use Download report'));
  }
  function downloadReport() {
    const blob = new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skindebug-${curId}${altOn ? '-alt' : ''}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ================= keys =================
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.code === 'Space') { togglePlay(); e.preventDefault(); }
    else if (e.key === 'h' || e.key === 'H') {
      highlight = !highlight;
      refreshOverlay(); syncChecks();
    } else if (e.key === 'f' || e.key === 'F') focusSpot();
  });
  // the two keyboard-reachable toggles have a box in the panel; keep them honest
  function syncChecks() {
    for (const l of panel.querySelectorAll('label')) {
      if (l.textContent.startsWith('Highlight')) l._input.checked = highlight;
    }
  }

  // ================= run =================
  await load(curId);
  engine.onUpdate = (dt) => {
    orbit.update();
    tickPlay(dt);
    updateOverlay();
  };
  engine.start();

  // scripting / headless audit (tools/skinaudit.mjs)
  window.__skinDebug = {
    engine, panel, camera, orbit,
    // pose the model exactly as the scan did, for a scripted look at a frame
    poseAt: (clipName, t) => {
      previewClip = clipName ? (config.anim.clip(clipName, mech) || null) : null;
      scrubT = t || 0;
      poseAt(scrubT);
      syncTime();
    },
    setHighlight: (on) => { highlight = !!on; refreshOverlay(); syncChecks(); },
    get mech() { return mech; },
    get instances() { return instances; },
    get scanning() { return scanning; },
    get index() { return curIdx; },
    get report() { return report(); },
    load, scan, select, step, focus: focusSpot,
    play: startPlay, pause: stopPlay, toWorstFrame,
    setLimits: (l) => { limits = { ...limits, ...l }; },
    reloadFromManifest,
  };
  return engine;
}
