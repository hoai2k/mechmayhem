// Menu backdrop: dark stage with a rotating mech line-up / preview.
// Extracted from boot.js — owns the whole "menu 3D scene": floor + ring,
// display mechs (procedural or GLB), the RANDOM "?" sprite and per-player
// preview rings.
import * as THREE from 'three';
import { ROSTER_BY_ID, playableRoster, isPlayable } from '../mechs/roster.js';
import { randomLineup } from './lineup.js';
import { applyColorScheme } from '../mechs/colorscheme.js';
import { buildMech } from '../mechs/factory.js';
import { Animator } from '../mechs/animator.js';
import { PLAYER_COLORS } from '../core/colors.js';
import { createMech, is3dMode, manifestHasGlb } from '../mechs/gltf.js';

// Loading spinner shown in place of a mech while its GLB downloads (only in
// ?debug=3d, where we suppress the procedural stand-in). Two counter-rotating
// rings + a soft core, tinted by the mech's glow color. Tagged isSpinner so
// the stage's update() spins it instead of running an animator.
function makeSpinner(color = 0x8fd8ff) {
  const g = new THREE.Group();
  g.isSpinner = true;
  const mat = (o) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, side: THREE.DoubleSide });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 40), mat(0.85));
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 36), mat(0.5));
  r2.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), mat(0.9));
  g.add(r1, r2, core);
  g.userData.spin = { r1, r2, core, t: 0 };
  g.position.y = 4.2; // float at torso height
  return g;
}
// Soft radial bloom used behind a mech the instant its player locks in. A
// fresh texture per burst — clearMechs() disposes the sprites it owns, and a
// shared map would be disposed out from under the next one.
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

function disposeSpinner(g) {
  g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
}

export class MenuStage {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    engine.scene.fog = new THREE.Fog(0x0a0e18, 40, 140);
    engine.scene.background = new THREE.Color(0x0a0e18);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({ color: 0x161b24, roughness: 0.6, metalness: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(11.5, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.group.add(ring);

    this.mechs = [];
    this.rings = [];
    this.previewId = null;
    this._previewKey = null;
    this._gen = 0; // bumped on clearMechs; stale GLB swaps check against it
    this.t = 0;
  }

  // spawn one display unit at pos with base yaw rotY. In ?debug=3d with a GLB
  // available, shows a spinner and swaps the GLB in when it loads (never the
  // procedural stand-in); otherwise builds the procedural mech immediately.
  spawnUnit(def, pos, rotY = 0, meta = null) {
    const gen = this._gen;
    const tag = (u) => (meta ? Object.assign(u, meta) : u);
    if (is3dMode() && manifestHasGlb(def.id)) {
      const spin = makeSpinner(def.colors?.glow ?? 0x8fd8ff);
      spin.position.set(pos.x, pos.y + 4.2, pos.z);
      const unit = tag({ group: spin, isSpinner: true });
      this.group.add(spin);
      this.mechs.push(unit);
      createMech(def).then((glb) => {
        if (this._gen !== gen || !glb.isGLB) return;
        const idx = this.mechs.indexOf(unit);
        if (idx < 0) return;
        glb.animator = glb.premadeAnimator;
        glb.group.position.copy(pos);
        glb.group.rotation.y = rotY;
        this.group.remove(spin);
        disposeSpinner(spin);
        this.group.add(glb.group);
        // the placeholder may have been spun / locked while the GLB loaded —
        // carry that state over, or the flourish vanishes on swap
        this.mechs[idx] = Object.assign(tag(glb), {
          yawOffset: unit.yawOffset || 0, fx: unit.fx || null,
        });
      });
      return unit;
    }
    const mech = tag(buildMech(def));
    mech.animator = new Animator(mech);
    mech.group.position.copy(pos);
    mech.group.rotation.y = rotY;
    this.group.add(mech.group);
    this.mechs.push(mech);
    return mech;
  }

  // title line-up: three hero mechs, freshly dealt on every visit to the
  // title screen (boot.js calls this each time the title comes up)
  showLineup(ids = randomLineup()) {
    this.clearMechs();
    // a hidden (work-in-progress) hero is swapped for a playable stand-in
    // so the title screen never advertises a mech the game won't offer
    const shown = new Set(ids.filter(isPlayable));
    ids = ids.map((id) => {
      if (isPlayable(id)) return id;
      const sub = playableRoster().find((m) => !shown.has(m.id));
      if (sub) shown.add(sub.id);
      return sub ? sub.id : id;
    });
    ids.forEach((id, i) => {
      this.spawnUnit(ROSTER_BY_ID[id], new THREE.Vector3((i - 1) * 10, 0, i === 1 ? 0 : -4), (i - 1) * -0.4);
    });
    this.previewId = null;
    this._previewKey = null;
    this.engine.camera.position.set(0, 7.5, 26);
    this.engine.camera.lookAt(0, 6, 0);
  }

  showPreview(id) {
    this.showPreviews([{ id, slotIdx: 0 }]);
  }

  // big floating "?" stand-in for the RANDOM roster pick, tinted by the
  // chosen color scheme (the scheme carries onto whatever robot is dealt)
  questionSprite(variant = 0) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.font = '900 italic 104px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(160,220,255,0.9)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText('?', 64, 70);
    const tex = new THREE.CanvasTexture(cv);
    // one tint per SCHEME_NAMES entry, in the same order
    const RANDOM_TINTS = [0x9fd8ef, 0xff7a28, 0x3fc8ff, 0x6a7280,
      0xc07aff, 0x5fe08a, 0xffa62b, 0xff8fd0, 0xc98b4a];
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      color: RANDOM_TINTS[variant % RANDOM_TINTS.length],
    }));
    spr.scale.set(5.2, 5.2, 1);
    return spr;
  }

  // one preview mech per human picker, each on a player-colored ring
  showPreviews(entries) {
    if (!entries || !entries.length) return;
    const key = entries.map((e) => `${e.id}:${e.slotIdx}:${e.variant || 0}`).join('|');
    if (this._previewKey === key) return;
    this._previewKey = key;
    this.previewId = key;
    this.clearMechs();
    const n = entries.length;
    const cx = n === 1 ? 6.5 : 2.5;
    const spacing = 6.5;
    entries.forEach((e, i) => {
      const x = cx + (i - (n - 1) / 2) * spacing;
      if (e.id === 'random') {
        // mystery unit: a hovering "?" instead of a mech
        const spr = this.questionSprite(e.variant || 0);
        spr.position.set(x, 4.8, 0);
        this.group.add(spr);
        this.extras = this.extras || [];
        this.extras.push(spr);
      } else {
        // spawnUnit shows the procedural body, or (in ?debug=3d) a spinner
        // that swaps to the GLB when it loads — the exact body the battle uses
        const def = applyColorScheme(ROSTER_BY_ID[e.id], e.variant || 0);
        this.spawnUnit(def, new THREE.Vector3(x, 0, 0), 0,
          { slotIdx: e.slotIdx, stageX: x, yawOffset: 0, fx: null });
      }
      if (n > 1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(2.3, 2.7, 40),
          new THREE.MeshBasicMaterial({
            color: PLAYER_COLORS[e.slotIdx % 4], transparent: true, opacity: 0.7, side: THREE.DoubleSide,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.06, 0);
        this.group.add(ring);
        this.rings.push(ring);
      }
    });
    const dist = n === 1 ? 20 : 18 + n * 5;
    // UI chrome flanks the stage (roster grid left, info card right); the
    // clear band between them is centered a little right of mid-screen, so
    // aim the camera to drop the mechs there (~56% across → +0.12 NDC)
    const cam = this.engine.camera;
    const halfW = Math.tan((cam.fov * Math.PI) / 360) * dist * cam.aspect;
    const tx = cx - halfW * 0.12;
    cam.position.set(n === 1 ? tx - 1 : tx, n > 2 ? 8 : 6.5, dist);
    cam.lookAt(tx, 5, 0);
  }

  unitFor(slotIdx) { return this.mechs.find((m) => m.slotIdx === slotIdx) || null; }

  // LOCK-IN FLOURISH: the mech whips around twice while a glow blooms behind
  // it, so a lock reads instantly across a four-player table.
  lockFx(slotIdx) {
    const m = this.unitFor(slotIdx);
    if (!m) return;
    m.fx = { t: 0, dur: 0.72 };
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: PLAYER_COLORS[slotIdx % 4], opacity: 0,
    }));
    spr.position.set(m.stageX ?? m.group.position.x, 4.6, -1.6);
    spr.scale.setScalar(6);
    this.group.add(spr);
    this.extras = this.extras || [];
    this.extras.push(spr);
    m.fx.glow = spr;
  }

  // right stick held on a locked pick: drive that mech's yaw directly
  setYaw(slotIdx, delta) {
    const m = this.unitFor(slotIdx);
    if (m) m.yawOffset = (m.yawOffset || 0) + delta;
  }

  clearMechs() {
    this._gen++; // invalidate any in-flight GLB swaps from a prior screen
    for (const m of this.mechs) {
      this.group.remove(m.group);
      if (m.isSpinner) disposeSpinner(m.group);
    }
    this.mechs = [];
    for (const r of this.rings) {
      this.group.remove(r);
      r.geometry.dispose();
      r.material.dispose();
    }
    this.rings = [];
    for (const s of this.extras || []) {
      this.group.remove(s);
      s.material.map?.dispose();
      s.material.dispose();
    }
    this.extras = [];
  }

  update(dt) {
    this.t += dt;
    for (const m of this.mechs) {
      if (m.isSpinner) {
        const s = m.group.userData.spin;
        s.t += dt;
        s.r1.rotation.z += dt * 2.4; s.r1.rotation.x += dt * 1.2;
        s.r2.rotation.y += dt * 3.2;
        s.core.scale.setScalar(0.85 + Math.sin(s.t * 4) * 0.15);
        continue;
      }
      if (m.fx) {
        // two fast turns, easing out; the glow blooms and fades with them
        m.fx.t += dt;
        const p = Math.min(1, m.fx.t / m.fx.dur);
        const e = 1 - (1 - p) * (1 - p) * (1 - p);
        m.group.rotation.y = (m.yawOffset || 0) + e * Math.PI * 4;
        if (m.fx.glow) {
          m.fx.glow.material.opacity = Math.sin(p * Math.PI) * 0.85;
          m.fx.glow.scale.setScalar(6 + e * 5);
        }
        if (p >= 1) {
          if (m.fx.glow) {
            this.group.remove(m.fx.glow);
            m.fx.glow.material.map?.dispose();
            m.fx.glow.material.dispose();
            this.extras = (this.extras || []).filter((s) => s !== m.fx.glow);
          }
          m.fx = null;
        }
      } else if (m.yawOffset) {
        m.group.rotation.y = m.yawOffset; // player is steering this one
      } else if (this.previewId) {
        m.group.rotation.y = Math.sin(this.t * 0.4) * 0.55 + 0.15;
      }
      // lineup & select previews always show the combat-ready carriage
      m.animator.update(dt, { speed: 0, grounded: true, alwaysReady: true });
    }
  }

  destroy() {
    this.clearMechs();
    this.engine.scene.remove(this.group);
  }
}
