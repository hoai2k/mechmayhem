// ?debug=collider — the HURTBOX workbench.
//
//   ?debug=collider[&mech=<id>][&model=glb|proc][&clip=<name>][&at=hit]
//                   [&dummy=<distance, 0 = off>][&ball=0]
//
// What combat actually hits, drawn on top of what you see. The green
// capsules are the mech's measured hurtbox (src/combat/hurtbox.js): one per
// body region, bound to a bone, refreshed every frame — so play a clip and
// watch them follow the animation. The red wire ball is the OLD single
// `hitRadius` sphere, still used for blast falloff, kept on screen because
// the gap between the two is the entire point of this tool.
//
// The yellow capsule is a STRIKE: pick an attack clip and the workbench fires
// the same swept-limb volume melee uses, at the clip's own `hit` event,
// It runs from the elbow (or knee) to just past the fist (or foot), which
// is the shape combat tests. If it lies along the striking arm the strike
// is aimed right; if it hangs off the sternum, the clip has no strike limb
// the picker can find and combat is falling back to the old point.
//
// The DUMMY is a second mech standing at an adjustable distance, so you can
// see whether a swing at that spacing connects — the readout says which of
// ITS parts the strike lands on, which is the fastest way to sanity-check a
// reach change.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Engine } from '../core/engine.js';
import { buildMech } from '../mechs/factory.js';
import { Animator } from '../mechs/animator.js';
import { buildGlbForTool, fetchRawManifest } from '../mechs/gltf.js';
import { ROSTER, ROSTER_BY_ID } from '../mechs/roster.js';
import { CLIPS } from '../mechs/animations.js';
import { buildHurtbox, pickStrikeLimb, MELEE, PART_TABLE } from '../combat/hurtbox.js';
import { mechClipList } from './mechclips.js';
import { profileFor } from '../mechs/glbanim.js';
import { setupDevPanel } from './panelui.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mid = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// One reusable capsule mesh per part, stretched between the two world
// endpoints every frame. A CapsuleGeometry is built around the Y axis with
// its length baked in, so re-fitting means rebuilding it whenever the
// length changes materially — cheap enough at 15 parts and dev-only.
function makeCapsule(color, opacity) {
  const mat = new THREE.MeshBasicMaterial({
    color, wireframe: true, transparent: true, opacity, depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.2, 4, 10), mat);
  mesh.renderOrder = 999;
  mesh.userData.len = -1;
  mesh.userData.rad = -1;
  return mesh;
}

function fitCapsule(mesh, a, b, r) {
  const len = a.distanceTo(b);
  if (Math.abs(len - mesh.userData.len) > 1e-3 || Math.abs(r - mesh.userData.rad) > 1e-3) {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.CapsuleGeometry(r, len, 4, 10);
    mesh.userData.len = len;
    mesh.userData.rad = r;
  }
  _mid.copy(a).add(b).multiplyScalar(0.5);
  mesh.position.copy(_mid);
  if (len > 1e-4) {
    mesh.quaternion.setFromUnitVectors(UP, _b.copy(b).sub(a).divideScalar(len));
  } else {
    mesh.quaternion.identity();
  }
}

export async function runCollider(startId) {
  const engine = new Engine(document.getElementById('game-canvas'));
  const { scene, camera, renderer } = engine;
  scene.background = new THREE.Color(0x1b2028);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x565c66, 2.0));
  const dir = new THREE.DirectionalLight(0xffffff, 2.0);
  dir.position.set(6, 12, 8);
  scene.add(dir);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x2c313b, roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(80, 80, 0x3a4658, 0x252d3a));

  const params = new URLSearchParams(location.search);
  const manifest = await fetchRawManifest();
  let curId = ROSTER_BY_ID[startId] ? startId : ROSTER[0].id;
  let useGlb = params.get('model') !== 'proc';
  let showLegacy = params.get('ball') !== '0';
  let dummyDist = params.has('dummy') ? Number(params.get('dummy')) : 4.5;
  let showDummy = dummyDist > 0.01;
  let playing = true;
  let speed = 0.35;

  camera.position.set(8, 6, 13);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 3.5, 0);
  orbit.update();

  // ---- live state ----
  let mech = null, animator = null, hurtbox = null, def = null;
  let dummy = null, dummyAnim = null, dummyHurt = null;
  let clipName = params.get('clip') || null, clipT = 0, clipDur = 1;
  const caps = new THREE.Group(); scene.add(caps);
  const dummyCaps = new THREE.Group(); scene.add(dummyCaps);
  const capPool = [], dummyPool = [];

  const legacyBall = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff4455, wireframe: true, transparent: true, opacity: 0.3, depthTest: false }));
  legacyBall.renderOrder = 998;
  scene.add(legacyBall);

  const strikeCap = makeCapsule(0xffd23c, 0.6);
  strikeCap.renderOrder = 1000;
  strikeCap.visible = false;
  scene.add(strikeCap);
  const _s0 = new THREE.Vector3(), _s1 = new THREE.Vector3();

  function disposeMech(m) {
    if (!m) return;
    scene.remove(m.group);
    m.group.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const mm of mats) mm?.dispose?.();
    });
  }

  async function build(id, z) {
    const d = ROSTER_BY_ID[id];
    const hasGlb = !!manifest[id]?.url;
    const m = (useGlb && hasGlb) ? (await buildGlbForTool(d)).mech : buildMech(d);
    // the rig faces +Z, so the dummy stands there — a strike aimed by the
    // limb only means anything when the attacker is actually facing it
    m.group.position.set(0, 0, z);
    scene.add(m.group);
    const an = m.premadeAnimator || new Animator(m);
    an.poseStatic();
    return { mech: m, animator: an, hasGlb };
  }

  async function load(id) {
    curId = id;
    def = ROSTER_BY_ID[id];
    const u = new URL(location.href);
    u.searchParams.set('mech', id);
    u.searchParams.set('model', useGlb ? 'glb' : 'proc');
    history.replaceState(null, '', u);
    disposeMech(mech); disposeMech(dummy);
    const built = await build(id, 0);
    mech = built.mech; animator = built.animator;
    hurtbox = buildHurtbox(mech);
    const dbuilt = await build(id, dummyDist);
    dummy = dbuilt.mech; dummyAnim = dbuilt.animator;
    dummy.group.rotation.y = Math.PI;
    dummyHurt = buildHurtbox(dummy);

    // clip list for THIS mech, the ones that carry a `hit` event first —
    // those are the only ones with a strike to inspect
    const profile = mech.animProfile || profileFor?.(def.id) || null;
    const hits = (n) => !!(profile?.clipOverrides?.[n] || CLIPS[n])?.events
      ?.some((e) => e.type === 'hit');
    const list = mechClipList(def, profile)
      .map((c) => c.name)
      .sort((a, b) => (hits(a) ? 0 : 1) - (hits(b) ? 0 : 1) || a.localeCompare(b));
    clipSel.innerHTML = '<option value="">— rest pose —</option>' + list.map((c) =>
      `<option value="${c}">${hits(c) ? '\u2694 ' : ''}${c}</option>`).join('');
    if (clipName && !list.includes(clipName)) clipName = null;
    clipSel.value = clipName || '';
    if (clipName) {
      startClip(clipName);
      // ?at=hit — load parked on the impact frame
      if (params.get('at') === 'hit') { animator.update(0.001, { grounded: true }); seekImpact(); }
    }
    mechSel.value = curId;
    for (const [b, on] of [[bGlb, useGlb && built.hasGlb], [bProc, !(useGlb && built.hasGlb)]]) {
      b.style.background = on ? '#2b6cb0' : '#1a2433';
      b.style.color = on ? '#fff' : '#9fb2c8';
    }
    glbNote.textContent = (useGlb && !built.hasGlb) ? 'no GLB for this mech — procedural shown' : '';
    fit = fitReport(mech, hurtbox);
    frame();
    report();
  }

  // frame the pair: mechs range from jerry to a colossus, so a fixed camera
  // either buries the small ones or crops the big ones
  function frame() {
    // Frame off the HURTBOX, not Box3.setFromObject: for a skinned GLB that
    // helper measures the bind-pose geometry box through the mesh node's
    // transform chain, which on these rigs is metres away from the rendered
    // model. The capsules are already in world space and correct.
    let h = (mech.dims.hipHeight + mech.dims.torsoH + mech.dims.headSize * 2) * 1.02;
    let wide = h * 0.5;
    if (hurtbox) {
      hurtbox.refresh(null);
      h = 0; wide = 0;
      for (const p of hurtbox.parts) {
        h = Math.max(h, p.a.y + p.r, p.b.y + p.r);
        wide = Math.max(wide, Math.abs(p.a.x) + p.r, Math.abs(p.b.x) + p.r,
          Math.abs(p.a.z) + p.r, Math.abs(p.b.z) + p.r);
      }
    }
    const span = Math.max(h, wide * 2, 2);
    const cz = showDummy ? dummyDist * 0.5 : 0;
    orbit.target.set(0, h * 0.5, cz);
    // side-on: the swing arc and the gap to the dummy both read from here
    camera.position.set(span * (showDummy ? 1.9 : 1.5), h * 0.8, cz + span * 0.35);
    orbit.update();
  }

  function startClip(name) {
    clipName = name || null;
    clipT = 0;
    if (!clipName) { animator.stop(0.05); clipDur = 1; return; }
    clipDur = animator.play(clipName, { fade: 0.02 }) || 1;
  }

  // ---- per-frame overlay ----------------------------------------------
  function syncPool(pool, group, n) {
    while (pool.length < n) {
      const m = makeCapsule(0x46e07a, 0.75);
      pool.push(m); group.add(m);
    }
    for (let i = 0; i < pool.length; i++) pool[i].visible = i < n;
  }

  function drawHurtbox(hb, pool, group, stamp) {
    if (!hb) { syncPool(pool, group, 0); return; }
    hb.refresh(stamp);
    syncPool(pool, group, hb.parts.length);
    hb.parts.forEach((p, i) => fitCapsule(pool[i], p.a, p.b, p.r));
  }

  // The exact strike the fighter would resolve at this clip's hit frame:
  // same limb picker, same swing radius (MELEE), so what you see here is
  // what combat tests. Returns { hit } for the readout.
  function updateStrike(stamp) {
    const clip = animator.action?.clip;
    const ev = clip?.events?.find((e) => e.type === 'hit');
    if (!clip || !ev || !hurtbox) { strikeCap.visible = false; return null; }
    // only show it around the impact frame, so the capsule doesn't chase
    // the fist through the whole wind-up
    const near = Math.abs(clipT - ev.t) < 0.09;
    strikeCap.visible = near;
    if (!near) return null;
    const reach = (def.moves.light.range || 3.5) * def.body.scale;
    const r = Math.max(MELEE.SWING_MIN * def.body.scale, MELEE.SWING_R * reach);
    const over = MELEE.OVERSHOOT * reach;
    const twoFist = clip.name === 'heavy' || clip.name === 'poundSlam';
    let limb = null;
    if (twoFist && hurtbox.strikeSegment('handL', over, _a, _b, stamp) &&
        hurtbox.strikeSegment('handR', over, _s0, _s1, stamp)) {
      _s0.add(_a).multiplyScalar(0.5);
      _s1.add(_b).multiplyScalar(0.5);
      limb = 'fists';
    } else {
      limb = pickStrikeLimb(hurtbox, clip, 0, 1, mech.group.position.x, mech.group.position.z,
        0.35 * def.body.scale, stamp);
      if (limb) hurtbox.strikeSegment(limb, over, _s0, _s1, stamp);
      else {
        _s1.set(mech.group.position.x, reach * 0.5 + 1.5, mech.group.position.z + reach * 0.75);
        _s0.set(mech.group.position.x, _s1.y, mech.group.position.z);
      }
    }
    fitCapsule(strikeCap, _s0, _s1, r);
    // what would it land on?
    let hit = null;
    if (dummyHurt && showDummy) {
      const res = dummyHurt.hitSegment(_s0, _s1, r, MELEE.PAD * def.body.scale, stamp);
      if (res) hit = res.part.name;
    }
    return { limb, hit, r };
  }

  // ---- UI --------------------------------------------------------------
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:10px;top:10px;z-index:20;font:12px system-ui;
    color:#dbe6f5;background:#131a24ee;border-radius:8px;padding:10px;
    width:300px;max-height:94vh;overflow:auto;border-color:#2a3646`;
  document.body.appendChild(panel);
  setupDevPanel(panel, { key: 'collider' });
  const row = (h) => { const d = document.createElement('div'); d.style.cssText = 'display:flex;gap:6px;align-items:center;margin:5px 0'; d.innerHTML = h; panel.appendChild(d); return d; };
  const btnCss = 'background:#1a2433;color:#9fb2c8;border:1px solid #2f3c4e;border-radius:5px;padding:4px 9px;cursor:pointer;font:12px system-ui';

  panel.insertAdjacentHTML('beforeend',
    '<div style="font-weight:600;color:#8fd7ff;margin-bottom:2px">HURTBOX WORKBENCH</div>' +
    '<div style="color:#7c8ba0;line-height:1.45;margin-bottom:6px">' +
    '<span style="color:#46e07a">green</span> = capsules combat hits &middot; ' +
    '<span style="color:#ff4455">red</span> = old hitRadius ball &middot; ' +
    '<span style="color:#ffd23c">yellow</span> = strike volume at the hit frame</div>');

  const mechRow = row('<span style="width:44px;color:#8ba0b8">mech</span>');
  const mechSel = document.createElement('select');
  mechSel.style.cssText = 'flex:1;background:#0f151d;color:#dbe6f5;border:1px solid #2f3c4e;border-radius:5px;padding:3px';
  mechSel.innerHTML = ROSTER.map((r) => `<option value="${r.id}">${r.id}</option>`).join('');
  mechRow.appendChild(mechSel);
  mechSel.onchange = () => load(mechSel.value);

  const modelRow = row('<span style="width:44px;color:#8ba0b8">model</span>');
  const bGlb = document.createElement('button'); bGlb.textContent = 'GLB'; bGlb.style.cssText = btnCss;
  const bProc = document.createElement('button'); bProc.textContent = 'procedural'; bProc.style.cssText = btnCss;
  modelRow.append(bGlb, bProc);
  bGlb.onclick = () => { useGlb = true; load(curId); };
  bProc.onclick = () => { useGlb = false; load(curId); };
  const glbNote = document.createElement('div');
  glbNote.style.cssText = 'color:#e0a13c;font-size:11px;min-height:13px';
  panel.appendChild(glbNote);

  const clipRow = row('<span style="width:44px;color:#8ba0b8">clip</span>');
  const clipSel = document.createElement('select');
  clipSel.style.cssText = 'flex:1;background:#0f151d;color:#dbe6f5;border:1px solid #2f3c4e;border-radius:5px;padding:3px';
  clipRow.appendChild(clipSel);
  clipSel.onchange = () => startClip(clipSel.value);

  const scrubRow = row('<span style="width:44px;color:#8ba0b8">time</span>');
  const scrub = document.createElement('input');
  scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0';
  scrub.style.cssText = 'flex:1';
  const bPlay = document.createElement('button'); bPlay.textContent = '⏸'; bPlay.style.cssText = btnCss;
  scrubRow.append(scrub, bPlay);
  scrub.oninput = () => {
    playing = false; bPlay.textContent = '▶';
    if (!animator.action) return;
    clipT = (+scrub.value / 1000) * clipDur;
    animator.action.t = clipT;
    animator.action.lastT = clipT;   // never re-fire events while scrubbing
  };
  bPlay.onclick = () => { playing = !playing; bPlay.textContent = playing ? '⏸' : '▶'; };
  // park on the frame the blow lands — the only frame the strike volume is
  // real, and the one you actually want to study
  const bHit = document.createElement('button');
  bHit.textContent = 'impact'; bHit.style.cssText = btnCss;
  bHit.onclick = () => seekImpact();
  scrubRow.appendChild(bHit);
  function seekImpact() {
    const ev = animator.action?.clip?.events?.find((e) => e.type === 'hit');
    if (!ev) return;
    playing = false; bPlay.textContent = '▶';
    clipT = ev.t;
    animator.action.t = clipT;
    animator.action.lastT = clipT;
    animator.action.weight = 1;      // no fade-in blur on a parked frame
    scrub.value = String(Math.round((clipT / clipDur) * 1000));
  }

  const spdRow = row('<span style="width:44px;color:#8ba0b8">speed</span>');
  const spd = document.createElement('input');
  spd.type = 'range'; spd.min = '5'; spd.max = '100'; spd.value = String(speed * 100);
  spd.style.cssText = 'flex:1';
  const spdVal = document.createElement('span'); spdVal.style.cssText = 'width:38px;color:#8ba0b8;text-align:right';
  spdVal.textContent = speed.toFixed(2) + 'x';
  spdRow.append(spd, spdVal);
  spd.oninput = () => { speed = +spd.value / 100; spdVal.textContent = speed.toFixed(2) + 'x'; };

  const distRow = row('<span style="width:44px;color:#8ba0b8">dummy</span>');
  const dist = document.createElement('input');
  dist.type = 'range'; dist.min = '0'; dist.max = '150'; dist.value = String(dummyDist * 10);
  dist.style.cssText = 'flex:1';
  const distVal = document.createElement('span'); distVal.style.cssText = 'width:38px;color:#8ba0b8;text-align:right';
  distVal.textContent = dummyDist.toFixed(1);
  distRow.append(dist, distVal);
  dist.oninput = () => {
    dummyDist = +dist.value / 10;
    distVal.textContent = dummyDist.toFixed(1);
    if (dummy) dummy.group.position.z = dummyDist;
  };

  const toggles = row('');
  for (const [label, get, set] of [
    ['old ball', () => showLegacy, (v) => { showLegacy = v; }],
    ['dummy', () => showDummy, (v) => { showDummy = v; }],
  ]) {
    const b = document.createElement('button');
    b.style.cssText = btnCss;
    const paint = () => {
      b.textContent = label;
      b.style.background = get() ? '#2b6cb0' : '#1a2433';
      b.style.color = get() ? '#fff' : '#9fb2c8';
    };
    b.onclick = () => { set(!get()); paint(); };
    paint();
    toggles.appendChild(b);
  }

  const out = document.createElement('div');
  out.style.cssText = 'margin-top:8px;border-top:1px solid #2a3646;padding-top:7px;color:#9fb2c8;font:11px ui-monospace,monospace;line-height:1.5;white-space:pre-wrap';
  panel.appendChild(out);

  // Objective fit check, so "does that look right?" has an answer. Samples
  // the mech's RENDERED vertices (skin-aware) and reports:
  //   contain — % of them inside some capsule. Low = holes in the hurtbox.
  //   bloat   — capsule bounding box volume / model bounding box volume.
  //             Much over 1 = the mech is a bigger target than it looks.
  function fitReport(m, hb) {
    if (!hb) return null;
    // updateMatrixWorld, NOT updateWorldMatrix: only the former is
    // overridden by SkinnedMesh to refresh bindMatrixInverse, without
    // which getVertexPosition reports the GLB's own pre-scaling frame.
    m.group.updateMatrixWorld(true);
    hb.refresh(null);
    const mBox = new THREE.Box3(), hBox = new THREE.Box3();
    for (const p of hb.parts) {
      hBox.expandByPoint(_a.copy(p.a).addScalar(-p.r));
      hBox.expandByPoint(_a.copy(p.a).addScalar(p.r));
      hBox.expandByPoint(_a.copy(p.b).addScalar(-p.r));
      hBox.expandByPoint(_a.copy(p.b).addScalar(p.r));
    }
    let inside = 0, total = 0;
    m.group.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton.update();
      const pos = (o.isMesh || o.isSkinnedMesh) && o.geometry?.attributes?.position;
      if (!pos) return;
      const stride = Math.max(1, Math.floor(pos.count / 3000));
      for (let i = 0; i < pos.count; i += stride) {
        o.getVertexPosition(i, _a); o.localToWorld(_a);
        mBox.expandByPoint(_a);
        total++;
        for (const p of hb.parts) {
          const seg = _b.copy(p.b).sub(p.a);
          const ll = seg.lengthSq();
          const rel = _mid.copy(_a).sub(p.a);
          const t = ll > 1e-9 ? Math.min(1, Math.max(0, rel.dot(seg) / ll)) : 0;
          if (rel.addScaledVector(seg, -t).length() <= p.r) { inside++; break; }
        }
      }
    });
    const vol = (bx) => { const s = bx.getSize(new THREE.Vector3()); return Math.max(1e-6, s.x * s.y * s.z); };
    return { contain: total ? inside / total : 0, bloat: vol(hBox) / vol(mBox) };
  }

  let lastStrike = null, fit = null;
  function report() {
    if (!mech) return;
    const s = def.body.scale;
    const lines = [];
    lines.push(`legacy hitRadius  ${(1.7 * s).toFixed(2)}`);
    if (!hurtbox) {
      lines.push('NO HURTBOX — this model falls back to the ball');
    } else {
      const missing = PART_TABLE.map(([n]) => n).filter((n) => !hurtbox.part(n));
      lines.push(`parts ${hurtbox.parts.length}/${PART_TABLE.length}` +
        (missing.length ? `  missing: ${missing.join(' ')}` : ''));
      if (fit) {
        lines.push(`contain ${(fit.contain * 100).toFixed(0)}%   bloat ${fit.bloat.toFixed(2)}x`);
      }
      for (const p of hurtbox.parts) {
        lines.push(`  ${p.name.padEnd(10)} r ${p.r.toFixed(2)}  len ${p.a.distanceTo(p.b).toFixed(2)}`);
      }
    }
    if (lastStrike) {
      lines.push('');
      lines.push(`strike limb  ${lastStrike.limb || '(fallback point)'}`);
      lines.push(`swing radius ${lastStrike.r.toFixed(2)}`);
      lines.push(`lands on     ${lastStrike.hit || '— miss —'}`);
    }
    out.textContent = lines.join('\n');
  }

  // ---- loop ------------------------------------------------------------
  let acc = 0;
  engine.onUpdate = (dt) => {
    const step = dt * speed;
    if (mech) {
      if (playing && animator.action) {
        clipT += step;
        if (clipT > clipDur) { clipT = 0; startClip(clipName); }
        scrub.value = String(Math.round((clipT / clipDur) * 1000));
      }
      animator.update(playing ? step : 0, { grounded: true });
      mech.postAnimate?.();
      dummyAnim?.update(0, { grounded: true });
      dummy?.postAnimate?.();

      const stamp = performance.now();
      drawHurtbox(hurtbox, capPool, caps, stamp);
      drawHurtbox(showDummy ? dummyHurt : null, dummyPool, dummyCaps, stamp);
      dummy.group.visible = showDummy;

      legacyBall.visible = showLegacy;
      const h = (mech.dims.hipHeight + mech.dims.torsoH + mech.dims.headSize * 2) * 1.02;
      legacyBall.position.set(mech.group.position.x, h * 0.55, mech.group.position.z);
      legacyBall.scale.setScalar(1.7 * def.body.scale);

      const st = updateStrike(stamp);
      if (st) lastStrike = st;
      acc += dt;
      if (acc > 0.15) { acc = 0; report(); }
    }
    orbit.update();
  };

  await load(curId);
  engine.start();
}
