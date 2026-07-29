// ?edit=gait — the GAIT WORKBENCH. One mech, running on the spot, with every
// dial of its walk/run cycle under your hands.
//
//   /workbench/?edit=gait[&mech=<id>][&model=glb|proc][&alt=1]
//                        [&throttle=<0..1>][&game=<0.5..2>][&anim=<0.05..2>]
//
// WHAT A GAIT IS. Locomotion is not a clip — it is a set of numbers (stride
// amplitude, knee lift, arm swing, body lean…) that the animator turns into a
// cycle every frame. Those numbers live in src/mechs/gaits.js as NAMED GAITS,
// and a gait is SHARED: `sprint` is viper AND tempest AND wraith AND nova, so
// tuning it here moves all four. The panel says which gait the chosen mech
// runs, who else runs it, and the mech dropdown carries the gait name beside
// every entry — you always know what you are about to edit before you edit it.
//
// EDITS FOLLOW THE GAIT, NOT THE MECH. Change `sprint` on viper, switch to
// tempest, and tempest is running your edited sprint — that is the whole point
// of the shared table, and it is how you check a gait against every body it has
// to work on. Edits survive a reload (localStorage) until you Revert.
//
// THE MOTION CONTROLS, three different knobs that are easy to confuse:
//   · THROTTLE — how fast the mech is MOVING, as a fraction of its own top
//     speed. This is the gameplay input: the animator's `ratio` and the foot
//     cadence both come off it, so every `@run` dial fades in as you push it up.
//   · GAME SPEED — the ROBOT SPEED setting from the game's own menu (50–200%).
//     It changes the ground speed a full throttle means, so the stride gets
//     faster without getting longer. Preview the gait at the pace people play at.
//   · ANIMATION SPEED — a debugging dial only. It slows time down (or speeds it
//     up) without touching what the mech "is" doing, for reading a fast cycle.
//     PAUSE + the PHASE scrubber freeze one moment of the cycle.
//
// FOOTPRINTS run the GROUND instead of the mech. Locomotion is judged on the
// spot (that is what makes two gaits comparable), which hides the one thing a
// stride is for — covering ground. So each plant stamps a print where the foot
// landed and the whole floor, prints and grid together, scrolls backward at the
// mech's real speed. The gap between two prints of the same foot is the stride,
// measured rather than derived; the sideways offset is the track; and a stance
// foot sliding out from under its own print is a cadence that does not match
// the speed.
//
// THE MANNEQUIN (the third BUILD button) swaps the mech for the reference
// humanoid — src/mechs/mannequin.js, the same 15 joints at this mech's own
// measurements, one flat colour per bone (warm left, cool right), a foot with a
// real heel behind the ankle and a toe box in front. It runs this mech's gait,
// so it answers "where is the animator actually putting this foot" without a
// Tripo model's bind pose in the way.
//
// COMPARE lands a second, ghosted copy of the same mech beside the first
// running the SHIPPED gait, phase-locked to yours — the only honest way to
// judge "is this actually better".
//
// MOVING THE POSE ON SCREEN. Click a limb (or its dot) to select the joint. The
// panel then lists the dials that drive it, and DRAGGING THE HIGHLIGHTED JOINT
// tunes the active one — drag the limb the way you want it to go. The tool
// measures d(joint angle)/d(dial) at the phase you are parked on, works out
// which way that pushes the end of the limb ON SCREEN, and projects your drag
// onto it. So you pull the leg where you want it and a NUMBER moves; nothing is
// stored per-frame, because a gait has no frames.
//
// OUTPUT GAIT writes a file: every gait you touched, formatted exactly as
// src/mechs/gaits.js authors them, with a comment listing each changed dial
// (from → to) and which mechs run it. Hand that over and the gait can be
// updated wholesale.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { setupDevPanel } from '../ui/panel.js';
import { subjectSelect } from '../ui/subjectpick.js';
import { altChoice, altCheckbox } from '../ui/variantpick.js';

const STORE_KEY = 'rw.gaitEdits';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, n = 3) => (Math.round(v * 10 ** n) / 10 ** n).toString();

export async function runGaitWorkbench(config, params) {
  if (!config.gait) throw new Error('this game config has no gait section');
  const G = config.gait;
  const JOINT_ORDER = config.rig.joints;
  const schema = G.schema();
  const dials = schema.flatMap((g) => g.params.map((p) => ({ ...p, group: g.id })));

  // ---------- scene ----------
  const engine = config.stage.engine();
  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(0x1d2330);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x565c66, 2.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
  dirLight.position.set(7, 12, 9);
  scene.add(dirLight);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x323845, roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // The grid is the SKATE TEST: the mech runs on the spot, so a stance foot
  // that slides over the lines is a cadence that doesn't match the ground speed.
  // Coarse cells on purpose (5 units), because this grid SCROLLS with the
  // treadmill below — 1-unit lines at 39 u/s strobe instead of flowing.
  const GRID_CELL = 5;
  const grid = new THREE.GridHelper(240, 240 / GRID_CELL, 0x3d4a5e, 0x27303f);
  scene.add(grid);
  // a fixed centre line, so a scrolling world still has one honest reference
  const centreLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.01, -60), new THREE.Vector3(0, 0.01, 60)]),
    new THREE.LineBasicMaterial({ color: 0x55657a }));
  scene.add(centreLine);
  camera.position.set(9, 5.5, 10);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 3.6, 0);
  orbit.update();

  // ---------- state ----------
  const manifest = config.manifest?.() || null;
  const catalogue = config.catalogue.list();
  let curId = config.catalogue.get(params.get('mech') || params.get('id')) ? (params.get('mech') || params.get('id')) : catalogue[0].id;
  // WHICH BODY: the shipped GLB, the hand-sculpted procedural robot, or the
  // MANNEQUIN — the reference humanoid (src/mechs/mannequin.js) on this mech's
  // own measurements, which is the body to look at when the question is "where
  // is the animator actually putting this foot".
  let build = params.get('model') === 'proc' ? 'proc'
    : params.get('model') === 'mannequin' ? 'mann' : 'glb';
  let altOn = params.get('alt') === '1';
  let throttle = clamp(Number(params.get('throttle')) || 1, 0, 1);
  let gameSpeed = clamp(Number(params.get('game')) || G.gameSpeed?.() || 1, 0.5, 2);
  let animSpeed = clamp(Number(params.get('anim')) || 1, 0.05, 2);
  let sprintOn = false;
  let paused = false;
  let scrubPhase = 0;
  let compare = params.get('compare') !== '0';
  // WHICH gait the ghost runs. null = this gait as it ships (did my edit help?);
  // a gait id = that gait, shipped (what would this mech look like under the
  // OTHER gait? — how a mech gets moved between gaits with eyes open).
  let compareGait = params.get('vs') || null;
  let selJoint = null, hoverJoint = null, activeDial = null;

  let mech = null, animator = null, gaitId = null;
  let ghost = null, ghostAnim = null;

  // ---------- the edited gaits ----------
  // One live object per gait id. The animator holds it BY REFERENCE, so a
  // slider moves the mech on the next frame with no re-install; and because the
  // game shares one gait between mechs, so does this — switch mech and your
  // edited sprint walks in on the next model.
  const live = {};
  const stored = readStore();
  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeStore() {
    const out = {};
    for (const [id, g] of Object.entries(live)) {
      const d = G.diff(G.shipped(id), g);
      if (d.length) {
        out[id] = {};
        for (const c of d) (out[id][c.group] ||= {})[c.key] = c.to;
      }
    }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch (e) { /* private mode */ }
  }
  function gaitOf(id) {
    if (!live[id]) {
      const g = G.clone(G.shipped(id));
      for (const [grp, vals] of Object.entries(stored[id] || {})) {
        if (!g[grp]) continue;
        for (const [k, v] of Object.entries(vals)) if (typeof g[grp][k] === 'number') g[grp][k] = v;
      }
      live[id] = g;
    }
    return live[id];
  }
  const editedIds = () => Object.keys(live).filter((id) => G.diff(G.shipped(id), live[id]).length);
  const dialValue = (d) => gaitOf(gaitId)?.[d.group]?.[d.key];
  const shippedValue = (d) => G.shipped(gaitId)?.[d.group]?.[d.key];

  // ---------- build ----------
  function disposeModel(m) {
    if (!m) return;
    scene.remove(m.group);
    m.group.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const mm of mats) mm?.dispose?.();
    });
  }

  async function buildOne(id, x) {
    const hasGlb = !!altChoice(manifest, id, altOn).entry?.url;
    const variant = build === 'mann' ? 'mannequin'
      : build === 'glb' && hasGlb ? (altOn ? 'alt' : 'glb') : 'proc';
    const m = await config.variants.build(id, { variant });
    m.group.position.set(x, 0, 0);
    scene.add(m.group);
    const a = config.anim.animator(m, id);
    a.poseStatic();
    return { m, a, hasGlb };
  }

  async function load(id, { keepCam = false } = {}) {
    const same = keepCam && id === curId;
    curId = id;
    altOn = altChoice(manifest, id, altOn).useAlt;
    const u = new URL(location.href);
    u.searchParams.set('mech', id);
    u.searchParams.set('model', build === 'mann' ? 'mannequin' : build === 'proc' ? 'proc' : 'glb');
    if (altOn) u.searchParams.set('alt', '1'); else u.searchParams.delete('alt');
    history.replaceState(null, '', u);

    disposeModel(mech); disposeModel(ghost);
    mech = ghost = animator = ghostAnim = null;
    selJoint = null; hoverJoint = null;

    const built = await buildOne(id, 0);
    mech = built.m; animator = built.a;
    // the gait id comes from the GAME (roster def), never from this tool
    gaitId = animator.gaitId || G.idFor(id);
    G.install(animator, gaitOf(gaitId));

    if (compare) await buildGhost();

    mechSel.value = curId;
    // the MANNEQUIN can also be the subject itself (it sits at the bottom of the
    // mech list) — then it is the only build there is, and the other two say so
    const isRef = !!mech.isMannequin && build !== 'mann';
    const shown = (build === 'mann' || mech.isMannequin) ? 'mann' : (build === 'glb' && built.hasGlb) ? 'glb' : 'proc';
    for (const [b, key] of [[bGlb, 'glb'], [bProc, 'proc'], [bMann, 'mann']]) {
      const on = shown === key;
      b.disabled = isRef && key !== 'mann';
      b.style.background = on ? '#2b6cb0' : '#1a2433';
      b.style.color = on ? '#fff' : (b.disabled ? '#55647a' : '#9fb2c8');
    }
    glbNote.textContent = (build === 'glb' && !built.hasGlb && !mech.isMannequin)
      ? 'no GLB for this mech — procedural shown' : '';
    refreshAltRow();
    panelUI.setSubtitle(`${curId}${altOn ? ' · ALT' : ''} · ${
      mech.isMannequin ? 'MANNEQUIN' : mech.isGLB ? 'GLB' : 'procedural'} · gait: ${gaitId}`);
    buildPrints();
    buildGaitHeader();
    buildCompareOptions();
    buildDialRows();
    refreshSelection();
    if (!same) frameCamera();
  }

  async function buildGhost() {
    if (!mech || ghost) return;
    // BESIDE, ALONG Z. The judging camera is side-on (a stride is a profile),
    // so the pair has to be separated along the axis that reads as horizontal
    // from there — put the ghost across the screen, not behind the model.
    const built = await buildOne(curId, 0);
    built.m.group.position.set(0, 0, -ghostSpan());
    ghost = built.m; ghostAnim = built.a;
    installGhostGait();
    // CLONE the materials first: a GLB build shares material instances with
    // every other clone of that model, so ghosting them in place would fade
    // the mech you are actually editing too.
    ghost.group.traverse((o) => {
      if (!o.material) return;
      const fade = (m) => {
        const c = m.clone();
        c.transparent = true; c.opacity = 0.34; c.depthWrite = false;
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(fade) : fade(o.material);
    });
  }

  // the ghost always runs a SHIPPED gait, and always a private clone, so
  // nothing on this side of the screen can reach the baseline it is here to be
  function installGhostGait() {
    if (!ghostAnim) return;
    const id = compareGait && G.shipped(compareGait) ? compareGait : gaitId;
    G.install(ghostAnim, G.clone(G.shipped(id)));
  }

  function dropGhost() { disposeModel(ghost); ghost = null; ghostAnim = null; }

  // How big this body actually is, measured off its POSED JOINTS. Box3 on a
  // skinned mesh measures the bind pose through a node chain that can be metres
  // from what you see, and head-top alone is no use on a quadruped whose skull
  // is at knee height and whose body is three times as long as it is tall — so
  // take the joint cloud, which is where the animation actually put the model,
  // and pad it for the geometry hanging off it (blades, tails, cannons).
  const _bp = new THREE.Vector3();
  function bodySize() {
    if (!mech) return { h: 6, len: 4 };
    mech.group.updateWorldMatrix(true, true);
    const base = mech.group.position.y;
    let top = -Infinity, back = Infinity, front = -Infinity;
    for (const j of JOINT_ORDER) {
      const o = mech.joints[j];
      if (!o) continue;
      o.getWorldPosition(_bp);
      top = Math.max(top, _bp.y - base);
      back = Math.min(back, _bp.z);
      front = Math.max(front, _bp.z);
    }
    const d = mech.dims;
    if (!Number.isFinite(top) || top < 0.5) return { h: (d.hipHeight + d.torsoH + d.headSize * 2) * 1.02, len: d.hipHeight };
    return { h: top * 1.25, len: Math.max((front - back) * 1.3, top * 0.6) };
  }
  const ghostSpan = () => bodySize().len * 1.15;

  // FIT, don't guess. The panel is resizable and this tool gets shot at
  // filmstrip aspect ratios (tools/gaitsheet.mjs), so a fixed camera distance
  // either crops the mech or strands it in the middle of an empty frame.
  // Solve the distance that fits the body height AND the width of the pair,
  // through the camera's real fov and aspect.
  function frameCamera() {
    const { h, len } = bodySize();
    // with the treadmill running, the trail behind the mech is part of what you
    // are looking at, so give it room and sit the mech forward of centre
    const trail = printsOn && !compare ? len * 0.8 : 0;
    const wide = (compare ? len * 1.15 : 0) + len + trail;
    const vfov = camera.fov * Math.PI / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (camera.aspect || 1.6));
    const dist = Math.max(
      (h * 1.12 * 0.5) / Math.tan(vfov / 2),
      (wide * 0.5) / Math.tan(hfov / 2),
    ) * 1.08;
    const cz = compare ? -ghostSpan() * 0.5 : -trail * 0.3;
    orbit.target.set(0, h * 0.5, cz);
    // side-on: a stride is a profile, not a front view
    camera.position.set(dist, h * 0.58, cz + dist * 0.06);
    orbit.update();
  }

  // ---------- the frame ----------
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0 };
  let readoutT = 0;
  engine.onUpdate = (dt) => {
    if (!animator) return;
    const step = Math.min(dt, 0.05);
    const maxSpeed = G.topSpeed(curId, { game: gameSpeed, sprint: sprintOn });
    ctx.speed = maxSpeed * throttle;
    ctx.maxSpeed = maxSpeed;
    const ratio = throttle;
    const gait = gaitOf(gaitId);
    const legLen = mech.dims.thighLen + mech.dims.shinLen;
    const rate = G.phaseRate(gait, { speed: ctx.speed, ratio, legLen, sizeMul: animator.sizeMul || 1 });

    if (paused) {
      // freeze the cycle where the scrubber says: update() advances the phase
      // itself, so hand it a phase one step BEHIND the one we want to land on.
      // The pose smoother still runs, so a frozen pose settles instead of
      // hanging halfway to it.
      animator.phase = scrubPhase - rate * step;
      animator.update(step, ctx);
      animator.phase = scrubPhase;
    } else {
      animator.update(step * animSpeed, ctx);
      scrubPhase = ((animator.phase % TAU) + TAU) % TAU;
    }
    if (ghostAnim) {
      // phase-locked to the edited one, or the two cycles drift apart and the
      // comparison becomes "spot the difference between two moments"
      ghostAnim.phase = animator.phase;
      ghostAnim.update(paused ? step : step * animSpeed, ctx);
      ghostAnim.phase = animator.phase;
    }
    if (printsOn && !paused) {
      trackFeet(animator.phase);
      scrollGround(ctx.speed * step * animSpeed);
    }
    drawMarks();
    readoutT += dt;
    if (readoutT > 0.1) { readoutT = 0; refreshReadout(rate); }
  };
  engine.start();

  // ---------- FOOTPRINTS: the treadmill ----------
  // The mech runs ON THE SPOT, which is what makes every dial comparable — and
  // also what hides the thing a stride is FOR. So run the ground instead: every
  // time a foot plants, stamp a print where it landed, then scroll the prints
  // (and the grid) backward at the real ground speed. The trail behind the mech
  // is then a true record of the gait — the gap between successive prints of the
  // same foot IS the stride length, the offset between left and right IS the
  // track width, and a foot that skates shows up as a print that slides out from
  // under it.
  const PRINT_POOL = 32;
  const printGroup = new THREE.Group();
  scene.add(printGroup);
  const prints = [];                 // ring buffer of { mesh, side, alive }
  let printAt = 0;                   // next slot to (re)use
  const feet = { L: null, R: null }; // per-foot plant detector
  let measured = { stride: 0, track: 0 };
  let printsOn = params.get('prints') !== '0';
  const _fw = new THREE.Vector3(), _fq = new THREE.Quaternion(), _fz = new THREE.Vector3();

  // A foot-shaped decal: rounded heel, wider rounded toe, so which way the foot
  // was pointing when it landed is readable at a glance.
  function footShape(len, wid) {
    const hw = wid * 0.5, sh = new THREE.Shape();
    sh.moveTo(-hw * 0.78, -len * 0.28);
    sh.quadraticCurveTo(-hw * 0.9, -len * 0.5, 0, -len * 0.5);
    sh.quadraticCurveTo(hw * 0.9, -len * 0.5, hw * 0.78, -len * 0.28);
    sh.lineTo(hw, len * 0.22);
    sh.quadraticCurveTo(hw, len * 0.5, 0, len * 0.5);
    sh.quadraticCurveTo(-hw, len * 0.5, -hw, len * 0.22);
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh, 8);
    g.rotateX(Math.PI / 2);          // lie flat, toe pointing +Z (the facing)
    return g;
  }

  function buildPrints() {
    for (const p of prints) { printGroup.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
    prints.length = 0;
    printAt = 0;
    if (!mech) return;
    const d = mech.dims;
    const len = (d.footLen || 0.85 * d.scale) * 1.05;
    const wid = (0.30 * d.scale) * (d.bulk || 1) * 1.5;
    for (let i = 0; i < PRINT_POOL; i++) {
      const mesh = new THREE.Mesh(footShape(len, wid), new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.renderOrder = 5;
      mesh.visible = false;
      printGroup.add(mesh);
      prints.push({ mesh, side: 'L', z0: 0 });
    }
    // L warm / R cool, the same reading as the mannequin's own colours
    feet.L = { prev: Infinity, falling: false, lastPh: -99, last: null, colour: 0xff7a5c };
    feet.R = { prev: Infinity, falling: false, lastPh: -99, last: null, colour: 0x5cc8ff };
    measured = { stride: 0, track: 0 };
  }

  function stampPrint(side, x, z, yaw) {
    const slot = prints[printAt % prints.length];
    printAt++;
    if (!slot) return;
    slot.side = side;
    slot.mesh.visible = true;
    slot.mesh.material.color.setHex(feet[side].colour);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.position.set(x, 0.02 * (mech.dims.scale || 1), z);
    slot.mesh.rotation.set(0, yaw, 0);
    // the gap to this foot's PREVIOUS print is the stride — and because the
    // prints have been scrolling backward at ground speed since then, that gap
    // is the real distance covered, measured rather than derived
    const prev = feet[side].last;
    if (prev && prev.mesh.visible) {
      measured.stride = Math.hypot(x - prev.mesh.position.x, z - prev.mesh.position.z);
    }
    const other = feet[side === 'L' ? 'R' : 'L'].last;
    if (other && other.mesh.visible) measured.track = Math.abs(x - other.mesh.position.x);
    feet[side].last = slot;
  }

  // Plant detection. The obvious rule — "stamp at the local minimum of the
  // ankle's height" — needs the frame rate to out-sample the stride, and it
  // doesn't: at 5 steps/s (and far worse under SwiftShader in a screenshot) the
  // minimum falls between frames and whole steps go unstamped. So use the rule
  // that survives coarse sampling: a foot is PLANTED when it is near the ground
  // AND it is the lower of the two, and one plant per foot per cycle is enforced
  // by a gait-phase guard rather than by the height signal.
  function trackFeet(phase) {
    if (!mech || !prints.length) return;
    const d = mech.dims;
    const legLen = d.thighLen + d.shinLen;
    const floor = 0.32 * (d.scale || 1) + legLen * 0.2;      // "near the ground"
    const h = {}, pos = {}, yaw = {};
    for (const side of ['L', 'R']) {
      const j = mech.joints['ankle' + side];
      if (!j) return;
      j.getWorldPosition(_fw);
      h[side] = _fw.y - mech.group.position.y;
      pos[side] = _fw.clone();
      j.getWorldQuaternion(_fq);
      _fz.set(0, 0, 1).applyQuaternion(_fq);
      yaw[side] = Math.atan2(_fz.x, _fz.z);
    }
    for (const side of ['L', 'R']) {
      const f = feet[side];
      const other = side === 'L' ? 'R' : 'L';
      if (!f || h[side] > floor || h[side] > h[other] || phase - f.lastPh < 2.0) continue;
      // the print belongs under the FOOT, which reaches forward of its joint
      const fl = (d.footLen || 0.85 * d.scale) * 0.18;
      stampPrint(side, pos[side].x + Math.sin(yaw[side]) * fl,
        pos[side].z + Math.cos(yaw[side]) * fl, yaw[side]);
      f.lastPh = phase;
    }
  }

  // everything on the ground moves backward at the mech's own ground speed
  let gridScroll = 0;
  function scrollGround(dz) {
    if (!dz) return;
    for (const p of prints) {
      if (!p.mesh.visible) continue;
      p.mesh.position.z -= dz;
      // fade with distance travelled, and retire well before the pool wraps
      const back = -p.mesh.position.z;
      p.mesh.material.opacity = 0.85 * clamp(1 - back / (mech.dims.hipHeight * 14), 0, 1);
      if (p.mesh.material.opacity <= 0.01) p.mesh.visible = false;
    }
    gridScroll = (gridScroll + dz) % GRID_CELL;
    grid.position.z = -gridScroll;
  }

  function setPrintsOn(v) {
    printsOn = !!v;
    printGroup.visible = printsOn;
    if (!printsOn) { grid.position.z = 0; gridScroll = 0; }
    else buildPrints();
    const u = new URL(location.href);
    if (printsOn) u.searchParams.delete('prints'); else u.searchParams.set('prints', '0');
    history.replaceState(null, '', u);
  }

  // ---------- joint marks ----------
  const marks = new THREE.Group();
  scene.add(marks);
  const markMat = new THREE.MeshBasicMaterial({ color: 0x9fb2c8, depthTest: false, transparent: true, opacity: 0.7 });
  const selMat = new THREE.MeshBasicMaterial({ color: 0xff9f43, depthTest: false });
  const hovMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, depthTest: false });
  const markPool = {};
  const _wp = new THREE.Vector3();
  function drawMarks() {
    if (!mech) return;
    mech.group.updateWorldMatrix(true, true);
    const r = (mech.dims.scale || 1) * 0.09;
    for (const j of JOINT_ORDER) {
      const o = mech.joints[j];
      if (!o) continue;
      let dot = markPool[j];
      if (!dot) {
        dot = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), markMat);
        dot.renderOrder = 999;
        markPool[j] = dot; marks.add(dot);
      }
      dot.position.copy(o.getWorldPosition(_wp));
      const sel = j === selJoint, hov = j === hoverJoint;
      dot.scale.setScalar(r * (sel ? 1.8 : hov ? 1.4 : 1));
      dot.material = sel ? selMat : hov ? hovMat : markMat;
    }
  }

  // ---------- picking ----------
  const PICK_PX = 26;
  const ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _pv = new THREE.Vector3();
  function pickJoint(cx, cy) {
    if (!mech) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const px = cx - rect.left, py = cy - rect.top;
    mech.group.updateWorldMatrix(true, true);
    let best = null, bestD = PICK_PX, bestZ = Infinity;
    for (const j of JOINT_ORDER) {
      const o = mech.joints[j];
      if (!o) continue;
      o.getWorldPosition(_pv).project(camera);
      if (_pv.z > 1) continue;
      const sx = (_pv.x * 0.5 + 0.5) * rect.width;
      const sy = (-_pv.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d <= bestD && (d < bestD - 4 || _pv.z < bestZ)) { best = j; bestD = d; bestZ = _pv.z; }
    }
    if (best) return best;
    _ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
    ray.setFromCamera(_ndc, camera);
    const hits = ray.intersectObject(mech.group, true).filter((h) => h.object.visible && h.object.type !== 'Line');
    if (!hits.length) return null;
    const p = hits[0].point;
    let jBest = null, jD = Infinity;
    for (const j of JOINT_ORDER) {
      const o = mech.joints[j];
      if (!o) continue;
      const d = o.getWorldPosition(_pv).distanceTo(p);
      if (d < jD) { jD = d; jBest = j; }
    }
    return jBest;
  }

  // Which dials drive this joint? The schema says so (`joints`), which is why
  // adding a dial to gaits.js needs no edit here. `hips` covers both hips
  // channels, since that is one thing to grab on screen.
  function dialsFor(joint) {
    if (!joint) return [];
    const keys = joint === 'hips' ? ['hipsPos', 'hipsRot'] : [joint];
    const gait = gaitOf(gaitId);
    // only the dials THIS gait actually has: the quad group drives thighs and
    // shoulders too, but a biped gait carries no `quad` block to tune
    return dials.filter((d) => gait[d.group] !== undefined
      && typeof gait[d.group][d.key] === 'number'
      && d.joints?.some((j) => keys.includes(j)));
  }

  // d(pose)/d(dial) at the phase and speed on screen, measured by nudging the
  // dial and re-running the gait — no hand-written derivatives to fall out of
  // date when the cycle changes.
  function sensitivity(dial, joint) {
    const gait = gaitOf(gaitId);
    const env = {
      ph: animator.phase, ratio: throttle, s: mech.dims.scale,
      ankleGain: animator.ankleGain, footFlat: animator.footFlat,
      hipHeight: mech.dims.hipHeight,
    };
    const key = joint === 'hips' ? 'hipsRot' : joint;
    const eps = Math.max(1e-3, (dial.max - dial.min) * 0.01);
    const before = G.evaluate(gait, env);
    const was = gait[dial.group][dial.key];
    gait[dial.group][dial.key] = was + eps;
    const after = G.evaluate(gait, env);
    gait[dial.group][dial.key] = was;
    const a = after[key] || after.hipsRot, b = before[key] || before.hipsRot;
    if (!a || !b) return { axis: 0, d: 0 };
    let axis = 0, d = 0;
    for (let i = 0; i < 3; i++) {
      const v = (a[i] - b[i]) / eps;
      if (Math.abs(v) > Math.abs(d)) { d = v; axis = i; }
    }
    return { axis, d };
  }

  // The far end of the limb a joint carries — what your eye is actually
  // dragging. A leaf (hand, foot, head) has no child joint, so take a point out
  // along its own local +Z, which is where hands and feet point.
  const CHILD = {
    hips: 'torso', torso: 'head', shoulderL: 'elbowL', shoulderR: 'elbowR',
    elbowL: 'handL', elbowR: 'handR', thighL: 'kneeL', thighR: 'kneeR',
    kneeL: 'ankleL', kneeR: 'ankleR',
  };
  const _t0 = new THREE.Vector3(), _t1 = new THREE.Vector3(), _ax = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  function tipWorld(joint, out) {
    const c = CHILD[joint];
    if (c && mech.joints[c]) return mech.joints[c].getWorldPosition(out);
    return mech.joints[joint].localToWorld(out.set(0, 0, 0.6 * (mech.dims.scale || 1)));
  }

  // DRAG THE LIMB WHERE YOU WANT IT. Turn one dial into a screen-space
  // direction: which way, in pixels, the end of this limb travels when the dial
  // goes up. The drag is then projected onto that direction, so pulling a foot
  // forward raises the dial that reaches the foot forward — no per-joint sign
  // table, and it stays right when you orbit the camera.
  function dragBasis(dial, joint) {
    const s = sensitivity(dial, joint);
    const o = mech.joints[joint];
    if (!o || Math.abs(s.d) < 1e-4) return { s, sx: 0, sy: 0, len2: 0 };
    o.getWorldPosition(_t0);
    _ax.set(0, 0, 0).setComponent(s.axis, 1);
    if (dial.joints.includes('hipsPos')) {
      // a translation channel: the body just moves along that axis
      (o.parent || o).getWorldQuaternion(_q);
      _ax.applyQuaternion(_q);
    } else {
      o.getWorldQuaternion(_q);
      _ax.applyQuaternion(_q);
      tipWorld(joint, _t1).sub(_t0);
      _ax.cross(_t1);                       // v = axis x r, the tip's velocity
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const p0 = _t0.clone().project(camera);
    const p1 = _t0.clone().add(_ax).project(camera);
    const sx = (p1.x - p0.x) * 0.5 * rect.width;
    const sy = -(p1.y - p0.y) * 0.5 * rect.height;   // screen y grows downward
    return { s, sx, sy, len2: sx * sx + sy * sy };
  }

  function setDial(dial, value, { fromDrag = false } = {}) {
    const gait = gaitOf(gaitId);
    if (!gait[dial.group]) return;
    gait[dial.group][dial.key] = clamp(value, dial.min, dial.max);
    writeStore();
    refreshDialRow(dial);
    if (!fromDrag) refreshGaitStatus();
    else statusLine.textContent = `${dial.group}.${dial.key} = ${fmt(gait[dial.group][dial.key])}`;
  }

  // ---------- pointer ----------
  const canvas = renderer.domElement;
  let downX = 0, downY = 0, dragDial = null, dragSens = null;
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX; downY = e.clientY;
    if (e.button !== 0 || !selJoint || !activeDial) return;
    // a drag that STARTS on the selected joint tunes it; anywhere else orbits
    if (pickJoint(e.clientX, e.clientY) !== selJoint) return;
    dragDial = activeDial;
    dragSens = dragBasis(dragDial, selJoint);
    orbit.enabled = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragDial) {
      const dx = e.clientX - downX, dy = e.clientY - downY;
      downX = e.clientX; downY = e.clientY;
      if (dragSens.len2 < 1e-3) {
        statusLine.textContent = Math.abs(dragSens.s.d) < 1e-4
          ? `${dragDial.group}.${dragDial.key} does nothing at this phase/throttle`
          : `${dragDial.group}.${dragDial.key} moves straight at the camera — orbit round`;
        return;
      }
      // drag projected onto the limb's own screen direction → joint radians →
      // dial units (dividing by how much this dial moves that joint)
      const dTheta = (dx * dragSens.sx + dy * dragSens.sy) / dragSens.len2;
      setDial(dragDial, dialValue(dragDial) + dTheta / dragSens.s.d, { fromDrag: true });
      return;
    }
    if (!mech) return;
    hoverJoint = pickJoint(e.clientX, e.clientY);
    canvas.style.cursor = hoverJoint === selJoint && activeDial ? 'move' : hoverJoint ? 'pointer' : '';
  });
  const endDrag = (e) => {
    if (!dragDial) return;
    dragDial = null; orbit.enabled = true;
    canvas.releasePointerCapture?.(e.pointerId);
    refreshGaitStatus();
  };
  canvas.addEventListener('pointerup', (e) => {
    if (dragDial) { endDrag(e); return; }
    if (e.button !== 0) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;  // that was an orbit
    const j = pickJoint(e.clientX, e.clientY);
    selJoint = j || null;
    activeDial = null;
    refreshSelection();
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { hoverJoint = null; });
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'Escape') { selJoint = null; activeDial = null; refreshSelection(); }
    else if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
    else if (e.key === '[') { setPaused(true); setPhase(scrubPhase - Math.PI / 12); }
    else if (e.key === ']') { setPaused(true); setPhase(scrubPhase + Math.PI / 12); }
  });

  // =========================== UI ===========================
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:10px;top:10px;z-index:20;font:12px system-ui;
    color:#dbe6f5;background:#131a24ee;border-radius:8px;padding:10px;
    width:330px;max-height:94vh;overflow:auto;border-color:#2a3646`;
  document.body.appendChild(panel);
  const panelUI = setupDevPanel(panel, { key: 'gait', workbench: 'gait' });
  const btnCss = 'background:#1a2433;color:#9fb2c8;border:1px solid #2f3c4e;border-radius:5px;padding:4px 9px;cursor:pointer;font:12px system-ui';
  const el = (tag, css, html) => {
    const d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (html !== undefined) d.innerHTML = html;
    return d;
  };
  const row = (html) => {
    const d = el('div', 'display:flex;gap:6px;align-items:center;margin:5px 0', html);
    panel.appendChild(d);
    return d;
  };

  // ---- subject ----
  const mechRow = row('<span style="width:38px;color:#8ba0b8">mech</span>');
  // The gait each mech runs, right there in the dropdown: you pick a body AND
  // you pick which shared gait you are about to edit, in one glance.
  const mechSel = subjectSelect({
    config,
    label: (id, def) => `${def?.name || id} — ${G.idFor(id)}`,
    css: 'flex:1;background:#0f151d;color:#dbe6f5;border:1px solid #2f3c4e;border-radius:5px;padding:3px',
    value: curId,
    onPick: (id) => load(id),
  });
  mechRow.appendChild(mechSel);

  const modelRow = row('<span style="width:38px;color:#8ba0b8">build</span>');
  const bGlb = el('button', btnCss, 'GLB');
  const bProc = el('button', btnCss, 'Procedural');
  const bMann = el('button', btnCss, 'Mannequin');
  bMann.title = 'The REFERENCE humanoid, on this mech\'s own measurements and running this '
    + 'mech\'s gait: one flat colour per bone (warm = left, cool = right), a foot with a real '
    + 'heel behind the ankle and a toe box in front, a nose on the head. What the animator is '
    + 'asking for, with nothing hidden. Per-mech signature motion is off.';
  const pick = (next) => { if (build !== next) { build = next; load(curId, { keepCam: true }); } };
  bGlb.onclick = () => pick('glb');
  bProc.onclick = () => pick('proc');
  bMann.onclick = () => pick('mann');
  modelRow.append(bGlb, bProc, bMann);
  const glbNote = el('span', 'color:#e0a13c;font-size:11px');
  modelRow.appendChild(glbNote);
  const altRow = el('div', '');
  panel.appendChild(altRow);
  function refreshAltRow() {
    altRow.innerHTML = '';
    const box = altCheckbox(altChoice(manifest, curId, altOn), (next) => { altOn = next; load(curId, { keepCam: true }); });
    if (box) altRow.appendChild(box);
  }

  // ---- the gait itself ----
  const gaitBox = el('div', `margin:8px 0;padding:8px;border:1px solid #2f3c4e;border-radius:6px;
    background:#101720`);
  panel.appendChild(gaitBox);
  function buildGaitHeader() {
    const gait = gaitOf(gaitId);
    const users = G.users(gaitId);
    gaitBox.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:6px">
        <b style="color:#ff9f43;font-size:14px">${gait.name || gaitId}</b>
        <code style="color:#7c8ba0;font-size:11px">gait: '${gaitId}'</code>
      </div>
      <div style="color:#9fb2c8;margin-top:4px;font-size:11.5px">${gait.note || ''}</div>
      <div style="color:#7c8ba0;margin-top:6px;font-size:11px">also run by</div>`;
    const who = el('div', 'display:flex;flex-wrap:wrap;gap:4px;margin-top:3px');
    for (const id of users) {
      const b = el('button', `${btnCss};padding:2px 6px;font-size:11px${id === curId ? ';border-color:#ff9f43;color:#ffd8a8' : ''}`, id);
      // one click to check the same gait on another body — the edits come along
      b.onclick = () => { if (id !== curId) load(id); };
      who.appendChild(b);
    }
    if (!users.length) who.appendChild(el('span', 'color:#7c8ba0;font-size:11px', 'nobody else'));
    gaitBox.appendChild(who);
    gaitBox.appendChild(gaitStatus);
    refreshGaitStatus();
  }
  const gaitStatus = el('div', 'margin-top:7px;font-size:11px;color:#8ba0b8');
  function refreshGaitStatus() {
    const changed = G.diff(G.shipped(gaitId), gaitOf(gaitId));
    const others = editedIds().filter((id) => id !== gaitId);
    gaitStatus.innerHTML = changed.length
      ? `<span style="color:#4fdc8b">${changed.length} dial${changed.length > 1 ? 's' : ''} changed</span>`
        + (others.length ? ` · also edited: ${others.join(', ')}` : '')
      : `unchanged from shipped${others.length ? ` · edited elsewhere: ${others.join(', ')}` : ''}`;
  }

  // ---- motion ----
  panel.appendChild(el('div', 'margin:10px 0 2px;color:#7c8ba0;letter-spacing:.08em;font-size:10.5px', 'MOTION'));
  const readout = el('div', `font:11px ui-monospace,monospace;color:#8fd8ff;background:#0d131b;
    border-radius:5px;padding:5px 7px;margin:4px 0;line-height:1.5`);
  panel.appendChild(readout);

  function slider({ label, min, max, step, value, fmtVal, onInput, title }) {
    const wrap = el('div', 'margin:6px 0');
    wrap.title = title || '';
    const head = el('div', 'display:flex;justify-content:space-between;font-size:11px;color:#9fb2c8');
    const name = el('span', '', label);
    const val = el('span', 'color:#dbe6f5;font-family:ui-monospace,monospace');
    head.append(name, val);
    const inp = el('input', 'width:100%;accent-color:#ff9f43');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    const show = () => { val.textContent = fmtVal ? fmtVal(Number(inp.value)) : fmt(Number(inp.value)); };
    inp.oninput = () => { onInput(Number(inp.value)); show(); };
    show();
    wrap.append(head, inp);
    return { wrap, inp, show, set: (v) => { inp.value = v; show(); } };
  }

  const thr = slider({
    label: 'throttle — how fast it is moving', min: 0, max: 1, step: 0.01, value: throttle,
    fmtVal: (v) => `${Math.round(v * 100)}%`,
    title: 'Fraction of this mech\'s own top speed. Drives the animator\'s `ratio`, so every "@run" dial fades in with it.',
    onInput: (v) => { throttle = v; },
  });
  panel.appendChild(thr.wrap);
  const preRow = row('');
  for (const [lbl, v] of [['idle', 0.05], ['walk', 0.3], ['jog', 0.6], ['run', 1]]) {
    const b = el('button', `${btnCss};padding:2px 8px;font-size:11px`, lbl);
    b.onclick = () => { throttle = v; thr.set(v); };
    preRow.appendChild(b);
  }
  const sprintChk = el('label', 'display:flex;gap:4px;align-items:center;font-size:11px;margin-left:auto;cursor:pointer');
  const sprintBox = el('input');
  sprintBox.type = 'checkbox';
  sprintBox.onchange = () => { sprintOn = sprintBox.checked; };
  sprintChk.append(sprintBox, document.createTextNode('sprint'));
  sprintChk.title = 'The game\'s sprint multiplier on top of the top speed — same ratio, more ground per second.';
  preRow.appendChild(sprintChk);

  const gs = slider({
    label: 'game speed (ROBOT SPEED setting)', min: 0.5, max: 2, step: 0.05, value: gameSpeed,
    fmtVal: (v) => `${Math.round(v * 100)}%`,
    title: 'The player-facing pace dial. Changes how much ground a full throttle covers, so the stride gets faster without getting longer.',
    onInput: (v) => { gameSpeed = v; },
  });
  panel.appendChild(gs.wrap);
  const as = slider({
    label: 'animation speed (debug only)', min: 0.05, max: 2, step: 0.05, value: animSpeed,
    fmtVal: (v) => `${fmt(v, 2)}×`,
    title: 'Slows time for reading a fast cycle. Does NOT change the gait — the mech is still moving at the throttle above.',
    onInput: (v) => { animSpeed = v; },
  });
  panel.appendChild(as.wrap);

  const playRow = row('');
  const bPlay = el('button', btnCss, '⏸ pause');
  bPlay.onclick = () => setPaused(!paused);
  const bStepB = el('button', btnCss, '◀');
  const bStepF = el('button', btnCss, '▶');
  bStepB.onclick = () => { setPaused(true); setPhase(scrubPhase - Math.PI / 12); };
  bStepF.onclick = () => { setPaused(true); setPhase(scrubPhase + Math.PI / 12); };
  playRow.append(bPlay, bStepB, bStepF);
  const phaseInp = el('input', 'flex:1;accent-color:#ff9f43');
  phaseInp.type = 'range'; phaseInp.min = 0; phaseInp.max = TAU; phaseInp.step = 0.01; phaseInp.value = 0;
  phaseInp.title = 'Where in the stride cycle you are parked. 0 = left leg forward, π = right.';
  phaseInp.oninput = () => { setPaused(true); setPhase(Number(phaseInp.value)); };
  playRow.appendChild(phaseInp);
  function setPaused(v) {
    paused = v;
    bPlay.textContent = paused ? '▶ play' : '⏸ pause';
    if (paused && animator) scrubPhase = ((animator.phase % TAU) + TAU) % TAU;
  }
  function setPhase(p) {
    scrubPhase = ((p % TAU) + TAU) % TAU;
    phaseInp.value = scrubPhase;
  }

  const printRow = row('');
  const printChk = el('input');
  printChk.type = 'checkbox';
  printChk.checked = printsOn;
  printChk.onchange = () => setPrintsOn(printChk.checked);
  const printLbl = el('label', 'display:flex;gap:5px;align-items:center;font-size:11.5px;cursor:pointer');
  printLbl.append(printChk, document.createTextNode('footprints — run the ground instead of the mech'));
  printLbl.title = 'The mech runs on the spot, so the GROUND scrolls: a print is stamped where '
    + 'each foot plants and then travels backward at the real ground speed. The gap between two '
    + 'prints of the same foot is the true stride length (shown above), the sideways offset is '
    + 'the track width, and a stance foot that slides out from under the mech is a cadence that '
    + 'does not match the speed.';
  printRow.appendChild(printLbl);

  const cmpRow = row('');
  const cmpChk = el('input');
  cmpChk.type = 'checkbox'; cmpChk.checked = compare;
  cmpChk.onchange = async () => {
    compare = cmpChk.checked;
    if (compare) await buildGhost(); else dropGhost();
    frameCamera();
  };
  const cmpLbl = el('label', 'display:flex;gap:5px;align-items:center;font-size:11.5px;cursor:pointer');
  cmpLbl.append(cmpChk, document.createTextNode('ghost:'));
  cmpRow.appendChild(cmpLbl);
  const cmpSel = el('select', `flex:1;background:#0f151d;color:#dbe6f5;border:1px solid #2f3c4e;
    border-radius:5px;padding:2px;font-size:11px`);
  cmpSel.title = 'What the phase-locked ghost beside the mech runs: this gait as it ships '
    + '(did my edit help?), or any OTHER gait, as shipped (what would this body look like under that one?).';
  cmpRow.appendChild(cmpSel);
  function buildCompareOptions() {
    cmpSel.innerHTML = `<option value="">${gaitId} — as shipped</option>` +
      G.ids().filter((id) => id !== gaitId).map((id) => `<option value="${id}">${id} — as shipped</option>`).join('');
    cmpSel.value = compareGait && compareGait !== gaitId ? compareGait : '';
  }
  cmpSel.onchange = () => {
    compareGait = cmpSel.value || null;
    const u = new URL(location.href);
    if (compareGait) u.searchParams.set('vs', compareGait); else u.searchParams.delete('vs');
    history.replaceState(null, '', u);
    installGhostGait();
  };

  function refreshReadout(rate) {
    const steps = rate / Math.PI;                 // a full cycle is two steps
    const strideLen = steps > 0.01 ? ctx.speed / steps : 0;
    readout.innerHTML =
      `speed  ${fmt(ctx.speed, 1)} u/s  of ${fmt(ctx.maxSpeed, 1)}   ratio ${fmt(throttle, 2)}<br>` +
      `stride ${fmt(steps, 2)} steps/s · ${fmt(strideLen, 2)} u per step<br>` +
      (printsOn && measured.stride
        // MEASURED off the footfalls, not derived from the cadence: the gap the
        // prints actually left behind, and how far apart the two feet track
        ? `landed ${fmt(measured.stride / 2, 2)} u per step (${fmt(measured.stride, 2)} u same foot)`
          + ` · track ${fmt(measured.track, 2)} u<br>`
        : '') +
      `phase  ${fmt(scrubPhase, 2)} rad${paused ? '  (frozen)' : ''}`;
    if (!paused) phaseInp.value = scrubPhase;
  }

  // ---- selected joint ----
  const selBox = el('div', `margin:8px 0;padding:7px;border:1px dashed #2f3c4e;border-radius:6px;
    background:#101720;font-size:11.5px`);
  panel.appendChild(selBox);
  function refreshSelection() {
    if (!selJoint) {
      selBox.innerHTML = '<span style="color:#7c8ba0">Click a limb in the viewport to see which gait dials '
        + 'drive it — then drag that joint to tune the one you pick.</span>';
      return;
    }
    const list = dialsFor(selJoint);
    selBox.innerHTML = `<b style="color:#ff9f43">${selJoint}</b>`;
    if (!list.length) {
      selBox.appendChild(el('div', 'color:#7c8ba0;margin-top:4px', 'no gait dial drives this joint — it is posed by the rest/combat stance or a signature.'));
      return;
    }
    if (!activeDial || !list.includes(activeDial)) {
      // default to the dial that moves this joint MOST where you are parked
      let best = list[0], bestD = -1;
      for (const d of list) {
        const s = Math.abs(sensitivity(d, selJoint).d);
        if (s > bestD) { bestD = s; best = d; }
      }
      activeDial = best;
    }
    const hint = el('div', 'color:#7c8ba0;margin:3px 0 5px', 'drag this limb to tune:');
    selBox.appendChild(hint);
    for (const d of list) {
      const b = el('button', `${btnCss};padding:2px 6px;font-size:11px;margin:2px 3px 0 0` +
        (d === activeDial ? ';border-color:#ff9f43;color:#ffd8a8' : ''), `${d.group}.${d.key}`);
      b.onclick = () => { activeDial = d; refreshSelection(); };
      selBox.appendChild(b);
    }
  }

  // ---- the dials ----
  const dialWrap = el('div', 'margin-top:8px');
  panel.appendChild(dialWrap);
  const dialRows = new Map();
  function buildDialRows() {
    dialWrap.innerHTML = '';
    dialRows.clear();
    const gait = gaitOf(gaitId);
    for (const group of schema) {
      if (!gait[group.id]) continue;              // e.g. no quad block on a biped
      const det = el('details', 'margin:6px 0;border:1px solid #26303f;border-radius:6px;background:#0f151d');
      det.open = group.id !== 'quad';
      const sum = el('summary', 'cursor:pointer;padding:5px 7px;color:#cfe0f5;font-size:11.5px;letter-spacing:.02em', group.label);
      det.appendChild(sum);
      const body = el('div', 'padding:2px 8px 8px');
      det.appendChild(body);
      for (const p of group.params) {
        if (typeof gait[group.id][p.key] !== 'number') continue;
        const d = dials.find((x) => x.group === group.id && x.key === p.key);
        body.appendChild(makeDialRow(d));
      }
      dialWrap.appendChild(det);
    }
  }
  function makeDialRow(d) {
    const wrap = el('div', 'margin:5px 0');
    wrap.title = d.help || '';
    const head = el('div', 'display:flex;align-items:center;gap:5px;font-size:11px');
    const name = el('span', 'color:#9fb2c8;flex:1', d.label);
    const val = el('input', `width:58px;background:#0d131b;color:#dbe6f5;border:1px solid #2c3648;
      border-radius:4px;padding:1px 3px;font:11px ui-monospace,monospace;text-align:right`);
    val.type = 'number'; val.step = d.step; val.min = d.min; val.max = d.max;
    const undo = el('button', `${btnCss};padding:0 5px;font-size:11px;line-height:1.4;visibility:hidden`, '↺');
    undo.title = 'back to the shipped value';
    undo.onclick = () => { setDial(d, shippedValue(d)); };
    head.append(name, val, undo);
    const rng = el('input', 'width:100%;accent-color:#ff9f43;height:14px');
    rng.type = 'range'; rng.min = d.min; rng.max = d.max; rng.step = d.step;
    rng.oninput = () => setDial(d, Number(rng.value));
    val.onchange = () => setDial(d, Number(val.value));
    wrap.append(head, rng);
    dialRows.set(`${d.group}.${d.key}`, { wrap, rng, val, undo, name, d });
    refreshDialRow(d);
    return wrap;
  }
  function refreshDialRow(d) {
    const r = dialRows.get(`${d.group}.${d.key}`);
    if (!r) return;
    const v = dialValue(d);
    if (v === undefined) return;
    r.rng.value = v;
    if (document.activeElement !== r.val) r.val.value = fmt(v);
    const changed = Math.abs(v - shippedValue(d)) > 1e-6;
    r.name.style.color = changed ? '#4fdc8b' : '#9fb2c8';
    r.undo.style.visibility = changed ? 'visible' : 'hidden';
  }
  function refreshAllDialRows() { for (const [, r] of dialRows) refreshDialRow(r.d); }

  // ---- output / revert ----
  const outRow = row('');
  const bOut = el('button', `${btnCss};border-color:#ff9f43;color:#ffd8a8`, 'Output gait');
  const bRevert = el('button', btnCss, 'Revert this gait');
  const bRevertAll = el('button', btnCss, 'Revert all');
  outRow.append(bOut, bRevert, bRevertAll);
  const statusLine = el('div', 'font:11px ui-monospace,monospace;color:#8ba0b8;min-height:14px;margin-top:2px');
  panel.appendChild(statusLine);
  const outBox = el('textarea', `display:none;width:100%;height:190px;margin-top:6px;background:#0d131b;
    color:#cfe0f5;border:1px solid #2c3648;border-radius:5px;font:11px ui-monospace,monospace;padding:6px`);
  panel.appendChild(outBox);

  bRevert.onclick = () => {
    live[gaitId] = G.clone(G.shipped(gaitId));
    G.install(animator, live[gaitId]);
    writeStore();
    refreshAllDialRows();
    refreshGaitStatus();
    statusLine.textContent = `${gaitId} back to shipped`;
  };
  bRevertAll.onclick = () => {
    for (const id of Object.keys(live)) live[id] = G.clone(G.shipped(id));
    G.install(animator, live[gaitId]);
    writeStore();
    refreshAllDialRows();
    refreshGaitStatus();
    statusLine.textContent = 'every gait back to shipped';
  };

  // THE FILE. Everything you touched, in the shape gaits.js is authored in,
  // with the changes spelled out above each block so a reviewer can see what
  // moved without diffing numbers by eye.
  function buildOutput() {
    const ids = editedIds();
    const head = [
      '// GAIT OUTPUT — /workbench/?edit=gait',
      `// tuned on ${curId} (${mech?.isGLB ? 'GLB' : 'procedural'}${altOn ? ' · alt' : ''})`
        + ` at throttle ${Math.round(throttle * 100)}%, game speed ${Math.round(gameSpeed * 100)}%`,
      '//',
    ];
    if (!ids.length) {
      head.push('// NOTHING CHANGED — this is the shipped gait, verbatim.');
      ids.push(gaitId);
    } else {
      head.push('// Paste each block below over the matching entry in GAITS');
      head.push('// (src/mechs/gaits.js). Nothing else in the game needs to change:');
      head.push('// a gait is shared by every mech whose roster def names it.');
    }
    const blocks = ids.map((id) => {
      const changes = G.diff(G.shipped(id), live[id] || G.shipped(id));
      const users = G.users(id);
      const lines = ['', `// ===== ${id} — run by ${users.join(', ') || 'nobody yet'} =====`];
      for (const c of changes) {
        lines.push(`//   ${c.group}.${c.key}: ${fmt(c.from)} → ${fmt(c.to)}`);
      }
      if (!changes.length) lines.push('//   (unchanged)');
      lines.push(G.format(id, live[id] || G.shipped(id)));
      return lines.join('\n');
    });
    return `${head.join('\n')}\n${blocks.join('\n')}\n`;
  }
  bOut.onclick = async () => {
    const text = buildOutput();
    outBox.style.display = 'block';
    outBox.value = text;
    outBox.select?.();
    const ids = editedIds();
    const name = `gait-${(ids.length ? ids : [gaitId]).join('-')}.js`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    try { await navigator.clipboard.writeText(text); statusLine.textContent = `${name} downloaded · copied to clipboard`; }
    catch (e) { statusLine.textContent = `${name} downloaded`; }
  };

  panel.appendChild(el('div', 'margin-top:8px;color:#5d6b7d;font-size:10.5px;line-height:1.5',
    'Space pause · [ ] step the cycle · Esc deselect · click a limb, then drag it where you want it.'));

  // headless hook — tools/*.mjs drive the workbench through this
  window.__gaitWork = {
    get mech() { return mech; },
    get animator() { return animator; },
    get ghost() { return ghost; },
    get ghostAnimator() { return ghostAnim; },
    get compareGait() { return compareGait; },
    get gaitId() { return gaitId; },
    get gait() { return gaitOf(gaitId); },
    load,
    setThrottle: (v) => { throttle = clamp(v, 0, 1); thr.set(throttle); },
    setGameSpeed: (v) => { gameSpeed = clamp(v, 0.5, 2); gs.set(gameSpeed); },
    setAnimSpeed: (v) => { animSpeed = clamp(v, 0.05, 2); as.set(animSpeed); },
    setPaused, setPhase,
    setPrints: setPrintsOn,
    get footfalls() { return { ...measured, stamped: printAt }; },
    setCompare: async (v, vs) => {
      compare = !!v; cmpChk.checked = compare;
      if (vs !== undefined) { compareGait = vs || null; cmpSel.value = compareGait || ''; }
      if (compare) await buildGhost(); else dropGhost();
      installGhostGait();
      frameCamera();
    },
    hidePanel: (v) => { panel.style.display = v ? 'none' : ''; },
    setParam: (group, key, v) => {
      const d = dials.find((x) => x.group === group && x.key === key);
      if (d) setDial(d, v);
    },
    dials: () => dials.map((d) => ({ group: d.group, key: d.key, value: dialValue(d), shipped: shippedValue(d) })),
    output: buildOutput,
    revert: () => bRevert.onclick(),
    camera, orbit, pick: pickJoint,
    select: (j) => { selJoint = j; activeDial = null; refreshSelection(); },
  };

  await load(curId);
  setPaused(false);
  return engine;
}
