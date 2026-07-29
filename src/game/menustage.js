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
import { CONFIG } from '../core/config.js';
import { pbrMaterial } from '../core/texload.js';
import { loadPosterIndex, posterMeta, posterUrl, POSTER_YAW, SETTLE_MS, POSTER_ASPECT } from '../ui/posters.js';

// THE PREVIEW FRAMING, in one place. The poster generator (dev/postershot.js)
// points an identical camera at an identical stage, which is the whole reason
// a pre-rendered picture can stand in for the model without moving a pixel:
// both go through this function, so neither can drift from the other.
//
// UI chrome flanks the stage (roster grid left, info card right); the clear
// band between them is centered a little right of mid-screen, so the camera
// aims to drop the mechs there (~56% across → +0.12 NDC). Note that offset is
// applied in NDC, so where a mech lands on screen does NOT move with the
// window's aspect — only its lateral world offset does, by a few degrees of
// profile, which is why one reference render covers every window size.
export const PREVIEW_X = 6.5;   // stage x of a single preview mech
export function aimPreviewCamera(cam, n, cx) {
  const dist = n === 1 ? 20 : 18 + n * 5;
  const halfW = Math.tan((cam.fov * Math.PI) / 360) * dist * cam.aspect;
  const tx = cx - halfW * 0.12;
  cam.position.set(n === 1 ? tx - 1 : tx, n > 2 ? 8 : 6.5, dist);
  cam.lookAt(tx, 5, 0);
  cam.updateMatrixWorld();
  return cam;
}

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
// A RING WITH SOFT EDGES. Ring geometry gave a hard-edged n-gon: the facets
// showed at 48 segments and, with MSAA off, both edges crawled with jaggies
// against the dark floor. This is one quad wearing a canvas texture whose ring
// FADES at both edges, so the silhouette is resolved by the alpha ramp instead
// of by polygon edges — smooth at any size, and no thin geometry to alias.
// Mipmaps + anisotropy keep it from shimmering when the floor tilts away.
function ringMesh(renderer, outerR, thickness, color, opacity) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const c = S / 2;
  // stroke in rings from the middle of the band outwards, alpha falling to 0
  const px = (S / 2) * (thickness / outerR);       // band width in pixels
  const rPx = (S / 2) * ((outerR - thickness / 2) / outerR);
  const steps = Math.max(6, Math.round(px));
  ctx.lineCap = 'butt';
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1);                     // 0..1 across the band
    const a = Math.sin(f * Math.PI) ** 0.8;        // soft on both edges
    ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.lineWidth = px / steps + 0.6;              // overlap so there are no gaps
    ctx.beginPath();
    ctx.arc(c, c, rPx + (f - 0.5) * px, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, renderer?.capabilities?.getMaxAnisotropy?.() ?? 4);
  tex.needsUpdate = true;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(outerR * 2, outerR * 2),
    new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
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

    // The menu floor borrows an arena ground (the foundry's iron plate by
    // default) so the stage reads as a place rather than a void. CONFIG
    // .menuFloorTextured is the off switch; a missing texture pack falls
    // through to the plain disc on its own.
    const plain = () => new THREE.MeshStandardMaterial({ color: 0x161b24, roughness: 0.6, metalness: 0.5 });
    let fmat = null;
    if (CONFIG.useTextures && CONFIG.menuFloorTextured) {
      fmat = pbrMaterial('ground', CONFIG.menuFloorTex, {
        repeat: 9,
        // pulled well down toward the stage's own dark blue so the mechs
        // still own the frame — this is a backdrop, not the subject
        color: new THREE.Color(0x2a3038),
      });
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 96), fmat || plain());
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    const ring = ringMesh(engine.renderer, 12, 0.75, 0x38e8ff, 0.75);
    ring.position.y = 0.04;
    this.group.add(ring);

    this.mechs = [];
    this.rings = [];
    this.previewId = null;
    this._previewKey = null;
    this._gen = 0; // bumped on clearMechs; stale GLB swaps check against it
    this.t = 0;
    // ---- poster flipping (see ui/posters.js) ----
    this.posters = [];      // <img> overlays currently standing in for a model
    this._built = new Set();// mechs whose model exists — never posted again
    this._swayT0 = 0;       // idle-sway phase origin, reset on every handover
    loadPosterIndex();      // fire and forget; no poster = old behaviour
  }

  /** Poster metadata for a mech, or null when there is none (the generator
   *  hasn't run, or this mech is new). Every caller falls back to building. */
  posterFor(id) { return posterMeta(id); }

  /** The mech's poster, laid over the canvas at the NDC rect the generator
   *  recorded — a DOM <img>, not a scene object, because the picture already
   *  contains the stage camera's perspective and only needs to land on the
   *  right pixels. Cheap to show, cheap to drop, and it cannot cost a frame
   *  the way building a body does. */
  showPoster(entry, x) {
    const meta = this.posterFor(entry.id);
    if (!meta || !meta.ndc) return null;
    const img = document.createElement('img');
    img.src = posterUrl(entry.id);
    img.alt = '';
    img.decoding = 'sync';
    img.style.cssText = 'position:absolute;pointer-events:none;image-rendering:auto;' +
      'will-change:transform;z-index:1';
    img.dataset.poster = entry.id;
    (this.posterRoot || document.getElementById('ui-root') || document.body).appendChild(img);
    const mesh = { img, userData: { poster: { id: entry.id, entry, x, settle: SETTLE_MS / 1000 } } };
    this.posters.push(mesh);
    this.layoutPosters();
    return mesh;
  }

  /** Place every live poster against the canvas's current size. Called on
   *  show and every frame — the canvas can be resized at any time, and the
   *  NDC rect is resolution-independent by construction. */
  layoutPosters() {
    if (!this.posters.length) return;
    const cv = this.engine.renderer?.domElement;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    for (const p of this.posters) {
      const meta = this.posterFor(p.userData.poster.id);
      if (!meta?.ndc) continue;
      const n = meta.ndc;
      // VERTICAL is aspect-free: the camera's fov is vertical, so NDC y maps
      // straight onto the canvas height. NDC y is up, CSS y is down.
      const top = ((1 - n.y1) / 2) * h;
      const bottom = ((1 - n.y0) / 2) * h;
      // HORIZONTAL needs care. The stage aims by an NDC offset, so where the
      // mech sits across the screen does not move with aspect — but its NDC
      // WIDTH does (a wider window means a wider frustum for the same body).
      // Its width in PIXELS, however, is invariant against canvas HEIGHT, so
      // convert through the reference aspect rather than the live width.
      const cxNdc = (n.x0 + n.x1) / 2;
      const halfPx = ((n.x1 - n.x0) / 2) * (h * POSTER_ASPECT) / 2;
      const cxPx = ((cxNdc + 1) / 2) * w;
      const left = cxPx - halfPx;
      const right = cxPx + halfPx;
      p.img.style.left = `${left.toFixed(1)}px`;
      p.img.style.top = `${top.toFixed(1)}px`;
      p.img.style.width = `${(right - left).toFixed(1)}px`;
      p.img.style.height = `${(bottom - top).toFixed(1)}px`;
    }
  }

  /** Build the real body for a poster and drop the picture. Called when the
   *  choice has settled, or right away on a lock-in. */
  promotePoster(mesh) {
    const p = mesh.userData.poster;
    if (!p || p.promoted) return;
    p.promoted = true;
    const def = applyColorScheme(ROSTER_BY_ID[p.entry.id], p.entry.variant || 0);
    this.spawnUnit(def, new THREE.Vector3(p.x, 0, 0), POSTER_YAW,
      { slotIdx: p.entry.slotIdx, stageX: p.x, yawOffset: 0, fx: null });
    this._built.add(p.entry.id);
    // the model appears at the poster's own yaw and drifts off from there
    this._swayT0 = this.t;
    this.dropPoster(mesh);
  }

  dropPoster(mesh) {
    mesh.img?.remove();
    this.posters = this.posters.filter((m) => m !== mesh);
  }

  /** Lock-in (or anything else that needs the body now) can't wait out the
   *  settle timer. Safe to call when there is no poster. */
  promoteAll() {
    for (const m of this.posters.slice()) this.promotePoster(m);
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
      0xc07aff, 0x5fe08a, 0xffa62b, 0xff8fd0, 0xc98b4a, 0xf3e3c4, 0xcfd8e2];
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
      } else if (this.posterFor(e.id) && !this._built.has(e.id)) {
        // FLIPPING: show the pre-rendered picture and build nothing. The real
        // body is created once this choice has sat still for SETTLE_MS (see
        // update), or immediately when it is locked in — and a mech already
        // built never comes back here.
        this.showPoster(e, x);
      } else {
        // spawnUnit shows the procedural body, or (in ?debug=3d) a spinner
        // that swaps to the GLB when it loads — the exact body the battle uses
        const def = applyColorScheme(ROSTER_BY_ID[e.id], e.variant || 0);
        this.spawnUnit(def, new THREE.Vector3(x, 0, 0), 0,
          { slotIdx: e.slotIdx, stageX: x, yawOffset: 0, fx: null });
        this._built.add(e.id);
      }
      if (n > 1) {
        const ring = ringMesh(this.engine.renderer, 2.7, 0.5, PLAYER_COLORS[e.slotIdx % 4], 0.85);
        ring.position.set(x, 0.06, 0);
        this.group.add(ring);
        this.rings.push(ring);
      }
    });
    aimPreviewCamera(this.engine.camera, n, cx);
  }

  unitFor(slotIdx) { return this.mechs.find((m) => m.slotIdx === slotIdx) || null; }

  // LOCK-IN FLOURISH: the mech whips around twice while a glow blooms behind
  // it, so a lock reads instantly across a four-player table.
  lockFx(slotIdx) {
    this.promoteAll();   // a lock-in wants the real body now, not in 0.7s
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
    for (const mesh of this.posters.slice()) this.dropPoster(mesh);
    for (const m of this.mechs) {
      this.group.remove(m.group);
      if (m.isSpinner) disposeSpinner(m.group);
    }
    this.mechs = [];
    for (const r of this.rings) {
      this.group.remove(r);
      r.geometry.dispose();
      r.material.map?.dispose();
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
    // a poster that has stood still long enough earns its real body
    this.layoutPosters();
    for (const mesh of this.posters.slice()) {
      const p = mesh.userData.poster;
      p.settle -= dt;
      if (p.settle <= 0) this.promotePoster(mesh);
    }
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
        // sway measured from the handover, so a model that just replaced a
        // poster starts at exactly the yaw the poster was rendered at
        m.group.rotation.y = Math.sin((this.t - this._swayT0) * 0.4) * 0.55 + POSTER_YAW;
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
