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
import { loadPosterIndex, posterMeta, posterUrl, POSTER_YAW, SETTLE_MS } from '../ui/posters.js';

const _pv = new THREE.Vector3(); // scratch for projecting poster boxes

// How long a model may take to arrive before the preview admits it is
// loading. Under this, showing nothing beats a spinner that blinks — a
// cached GLB (a repaint, or a mech you have already seen) lands in a frame
// or two, and the flash reads as a glitch rather than as progress.
const SPINNER_DELAY = 700;

// THE IDLE SWAY every preview model shares: yaw = sin(phase) * SWAY_AMP +
// POSTER_YAW, one wave for the whole stage. It is deliberately GLOBAL — with
// two to four pickers the marks stand side by side, and models drifting on
// private phases read as four separate toys rather than one line-up.
const SWAY_RATE = 0.4;   // radians of phase per second
const SWAY_AMP = 0.55;   // peak yaw either side of POSTER_YAW

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

// WHICH BODY THE PREVIEW SHOWS — the single source of truth, used by
// spawnUnit below AND by the poster generator (dev/postershot.js).
//
// READ THIS BEFORE TOUCHING POSTERS. The select screen shows the GLB: the
// manifest models are the DEFAULT for every mech (`?debug=fallback` is the
// only way to get the procedural roster), so a poster is a stand-in FOR THE
// GLB and must be rendered from one. createMech() is that decision — it
// resolves the manifest, returns the GLB when there is one, and falls back to
// the procedural body only when there genuinely isn't. Anything that
// re-derives this with its own `is3dMode() && manifestHasGlb()` test can be
// wrong in a way that is invisible until someone looks at the pictures:
// manifestHasGlb() reads a manifest that may not be LOADED yet and quietly
// answers false, which is exactly how a set of procedural posters got
// generated for a screen that shows GLBs.
export function previewBody(def) { return createMech(def); }

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

// THE CHANGE FLOURISH — what plays whenever the robot on a mark becomes a
// different one. Two layers, and the ORDER of loudness matters: the flash
// carries the moment, the motes only season it.
//
//   FLASH  a soft round glow that blooms out of the body's middle and fades,
//          plus a thin ring chasing it outward — a beam-in, not an explosion.
//          This is the part that reads, and it is what covers the frame where
//          a poster hands over to a model or a repaint swaps textures.
//   MOTES  a light scatter of sparks riding on top. Deliberately faint: an
//          earlier pass threw 90 fat bright points and read as a firework
//          going off in the menu.
//
// THE WHOLE THING IS AN INDICATOR, NOT AN EVENT. It exists to say "that
// changed" and to hide the swap frame; if you can describe it as an effect
// while playing, it is too loud. Two passes have already been turned down —
// keep the peaks here under ~0.45 and let the mech stay the brightest thing
// on the mark.
function sparkleMotes(group, x, y, spread, color) {
  const N = 22;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread * 0.45;
    pos[i * 3] = x + Math.cos(a) * r;
    pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread * 0.8;
    pos[i * 3 + 2] = Math.sin(a) * r;
    vel[i * 3] = Math.cos(a) * (0.2 + Math.random() * 0.8);
    vel[i * 3 + 1] = 0.45 + Math.random() * 1.2;
    vel[i * 3 + 2] = Math.sin(a) * (0.2 + Math.random() * 0.8);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size: 0.1, transparent: true, opacity: 0.26,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.fx = { kind: 'motes', t: 0, dur: 0.6, vel, peak: 0.26 };
  group.add(pts);
  return pts;
}

// One soft round sprite that blooms and dies. `ring` makes it a thin
// expanding halo instead of a filled core, so two of these stacked give the
// bloom-plus-shockwave read a teleport wants.
function beamGlow(group, x, y, size, color, ring) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ring ? ringTexture() : glowTexture(),
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color, opacity: 0,
  }));
  spr.position.set(x, y, ring ? -0.4 : 0);
  spr.scale.setScalar(size * (ring ? 0.5 : 0.35));
  spr.userData.fx = {
    kind: 'glow', t: 0, dur: ring ? 0.5 : 0.42,
    from: size * (ring ? 0.5 : 0.35), to: size * (ring ? 1.5 : 1.0),
    peak: ring ? 0.12 : 0.26,
  };
  group.add(spr);
  return spr;
}

// a hollow soft-edged ring, for the flash's outgoing halo
function ringTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 40, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
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
    this._previewN = 0;
    this._gen = 0; // bumped on clearMechs; stale GLB swaps check against it
    this.t = 0;
    // ---- poster flipping (see ui/posters.js) ----
    this.posters = [];      // <img> overlays currently standing in for a model
    this._built = new Set();// mechs whose model exists — never posted again
    this._swayT0 = 0;       // idle-sway phase origin (see armSway)
    this._swayHold = new Set(); // slots parked at POSTER_YAW waiting to join it
    this.sparkles = [];     // live sparkle bursts (see sparkleBurst)
    loadPosterIndex();      // fire and forget; no poster = old behaviour
  }

  /** The change flourish over a preview mark: a beam-in flash out of the
   *  body's middle, a chasing ring, and a light scatter of motes. Sized to
   *  the mech, tinted to the player. */
  sparkleAt(x, slotIdx = 0, height = 7) {
    const c = PLAYER_COLORS[slotIdx % 4];
    const mid = height * 0.52;
    this.sparkles.push(
      beamGlow(this.group, x, mid, height, 0xdff2ff, false),
      beamGlow(this.group, x, mid, height, c, true),
      sparkleMotes(this.group, x, mid, height * 0.8, c)
    );
  }

  updateSparkles(dt) {
    for (const p of this.sparkles.slice()) {
      const f = p.userData.fx;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        this.group.remove(p);
        p.geometry?.dispose();
        p.material.map?.dispose();
        p.material.dispose();
        this.sparkles = this.sparkles.filter((o) => o !== p);
        continue;
      }
      // in fast, out slow — a flash, not a pulse
      const env = k < 0.18 ? k / 0.18 : 1 - (k - 0.18) / 0.82;
      if (f.kind === 'glow') {
        const e = 1 - (1 - k) * (1 - k) * (1 - k);      // easeOutCubic
        p.scale.setScalar(f.from + (f.to - f.from) * e);
        p.material.opacity = f.peak * env * env;
      } else {
        const arr = p.geometry.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] += f.vel[i] * dt;
          arr[i + 1] += (f.vel[i + 1] - 2.4 * f.t) * dt;
          arr[i + 2] += f.vel[i + 2] * dt;
        }
        p.geometry.attributes.position.needsUpdate = true;
        p.material.opacity = f.peak * (1 - k) * (1 - k);
      }
    }
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
    if (!meta || !meta.box) return null;
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

  /** Place every live poster for the CURRENT camera. The stored box is in
   *  world units off the mech's feet, so this projects it through whatever
   *  framing the stage is using — which is what makes one reference render
   *  serve 1, 2, 3 and 4 pickers, each standing on its own mark. Runs every
   *  frame: the camera re-aims and the canvas resizes whenever it likes. */
  layoutPosters() {
    if (!this.posters.length) return;
    const cv = this.engine.renderer?.domElement;
    const cam = this.engine.camera;
    if (!cv || !cam) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    cam.updateMatrixWorld();
    for (const p of this.posters) {
      const meta = this.posterFor(p.userData.poster.id);
      if (!meta?.box) continue;
      const x = p.userData.poster.x;
      // project the mech's own feet, and one world unit each way from them
      const A = _pv.set(x, 0, 0).project(cam).clone();
      const perX = _pv.set(x + 1, 0, 0).project(cam).x - A.x;
      const perY = _pv.set(x, 1, 0).project(cam).y - A.y;
      const b = meta.box;
      const nx0 = A.x + b.u0 * perX, nx1 = A.x + b.u1 * perX;
      const ny0 = A.y + b.v0 * perY, ny1 = A.y + b.v1 * perY;
      const left = ((nx0 + 1) / 2) * w, right = ((nx1 + 1) / 2) * w;
      const top = ((1 - ny1) / 2) * h, bottom = ((1 - ny0) / 2) * h;  // NDC y is up
      p.img.style.left = `${left.toFixed(1)}px`;
      p.img.style.top = `${top.toFixed(1)}px`;
      p.img.style.width = `${Math.max(0, right - left).toFixed(1)}px`;
      p.img.style.height = `${Math.max(0, bottom - top).toFixed(1)}px`;
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
      { slotIdx: p.entry.slotIdx, stageX: p.x, yawOffset: 0, fx: null,
        _sig: `${p.entry.id}:${p.entry.variant || 0}` });
    this._built.add(p.entry.id);
    this.dropPoster(mesh);
  }

  dropPoster(mesh) {
    mesh.img?.remove();
    this.posters = this.posters.filter((m) => m !== mesh);
  }

  /** Lock-in can't wait out the settle timer — but it only speeds up the
   *  slot that locked. With four pickers, one player confirming must not
   *  yank the other three's posters out from under them. */
  promoteSlot(slotIdx) {
    for (const m of this.posters.slice()) {
      if (m.userData.poster.entry.slotIdx === slotIdx) this.promotePoster(m);
    }
  }

  promoteAll() {
    for (const m of this.posters.slice()) this.promotePoster(m);
  }

  // spawn one display unit at pos with base yaw rotY. In ?debug=3d with a GLB
  // available, shows a spinner and swaps the GLB in when it loads (never the
  // procedural stand-in); otherwise builds the procedural mech immediately.
  /** A NEW MODEL JOINS THE SWAY, IT DOES NOT RESTART IT.
   *
   *  The sway used to be measured from the last handover, so every model that
   *  finished loading yanked the phase back to zero — with two or more pickers,
   *  one player flipping a robot visibly snapped the OTHER players' mechs back
   *  to their start yaw. The mechs that were already standing there are the
   *  scene; the arrival is the guest.
   *
   *  So an arriving model waits at POSTER_YAW — the exact yaw its poster was
   *  rendered at, so the handover is still frame-perfect — until the running
   *  wave next passes through POSTER_YAW (a zero crossing of the sine, at most
   *  half a period away), and joins there. From that instant it IS the shared
   *  wave, in step with its neighbours forever after.
   *
   *  With nobody else on stage there is no one to stay in step with, so the
   *  wave is simply restarted under the newcomer and it drifts off at once. */
  armSway(slot) {
    if (this.mechs.some((m) => m.slotIdx !== slot)) this._swayHold.add(slot);
    else { this._swayT0 = this.t; this._swayHold.delete(slot); }
  }

  spawnUnit(def, pos, rotY = 0, meta = null) {
    const gen = this._gen;
    // hold/join is decided HERE, before the unit is pushed, and keyed by SLOT
    // rather than stored on the unit — the GLB swap below replaces the object.
    if (this.previewId && meta) this.armSway(meta.slotIdx);
    const tag = (u) => (meta ? Object.assign(u, meta) : u);
    if (is3dMode() && manifestHasGlb(def.id)) {
      // A PLACEHOLDER ONLY IF THE WAIT IS REAL. The GLB is usually already in
      // the loader's cache — recolouring, or coming back to a mech you have
      // already seen — and a spinner that flashes for two frames on every
      // paint change reads as breakage, not as loading. So the unit starts
      // EMPTY and the spinner is only mounted if the model has not arrived
      // within SPINNER_DELAY.
      const holder = new THREE.Group();
      const unit = tag({ group: holder, isSpinner: true, loading: true });
      this.group.add(holder);
      this.mechs.push(unit);
      const timer = setTimeout(() => {
        if (this._gen !== gen || !unit.loading) return;
        const spin = makeSpinner(def.colors?.glow ?? 0x8fd8ff);
        spin.position.set(0, 4.2, 0);
        holder.add(spin);
        unit.spinner = spin;
      }, SPINNER_DELAY);
      holder.position.copy(pos);
      createMech(def).then((glb) => {
        clearTimeout(timer);
        unit.loading = false;
        if (this._gen !== gen || !glb.isGLB) return;
        const idx = this.mechs.indexOf(unit);
        if (idx < 0) return;
        glb.animator = glb.premadeAnimator;
        glb.group.position.copy(pos);
        glb.group.rotation.y = rotY;
        this.group.remove(holder);
        if (unit.spinner) disposeSpinner(unit.spinner);
        this.group.add(glb.group);
        // the placeholder may have been spun / locked while the GLB loaded —
        // carry that state over, or the flourish vanishes on swap
        this.mechs[idx] = Object.assign(tag(glb), {
          yawOffset: unit.yawOffset || 0, fx: unit.fx || null,
        });
        this.onUnitReady?.(this.mechs[idx]);
      });
      return unit;
    }
    const mech = tag(buildMech(def));
    mech.animator = new Animator(mech);
    mech.group.position.copy(pos);
    mech.group.rotation.y = rotY;
    this.group.add(mech.group);
    this.mechs.push(mech);
    this.onUnitReady?.(mech);
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
    const n = entries.length;
    const cx = n === 1 ? 6.5 : 2.5;
    const spacing = 6.5;
    // The stage RE-FRAMES with the number of pickers (camera pulls back, marks
    // spread), so a change in that count invalidates every placement. Within a
    // fixed count, though, only the slots that actually CHANGED are torn down:
    // with four players, one of them flipping used to rebuild the other three's
    // bodies on every keypress, which is the exact cost this whole poster
    // mechanism exists to avoid.
    const reframed = this._previewN !== n;
    this._previewN = n;
    this._previewKey = key;
    this.previewId = key;
    const want = new Map(entries.map((e, i) => [e.slotIdx, {
      e, i, x: cx + (i - (n - 1) / 2) * spacing,
      sig: `${e.id}:${e.variant || 0}`,
    }]));
    if (reframed) this.clearMechs();
    else {
      // drop only what no longer matches its slot
      for (const m of this.mechs.slice()) {
        const w = want.get(m.slotIdx);
        // matching sig keeps the unit — including one still loading, or the
        // change would restart a download that is already in flight
        if (w && w.sig === m._sig) { m.group.position.x = w.x; m.stageX = w.x; continue; }
        this.group.remove(m.group);
        if (m.spinner) disposeSpinner(m.spinner);
        this.mechs = this.mechs.filter((o) => o !== m);
      }
      for (const p of this.posters.slice()) {
        const w = want.get(p.userData.poster.entry.slotIdx);
        if (w && w.sig === `${p.userData.poster.id}:${p.userData.poster.entry.variant || 0}`) {
          p.userData.poster.x = w.x;                 // same mech, maybe a new mark
          continue;
        }
        this.dropPoster(p);
      }
      for (const r of this.rings) {
        this.group.remove(r);
        r.geometry.dispose(); r.material.map?.dispose(); r.material.dispose();
      }
      this.rings = [];
      for (const sp of this.extras || []) {
        this.group.remove(sp);
        sp.material.map?.dispose(); sp.material.dispose();
      }
      this.extras = [];
    }
    for (const { e, x, sig } of want.values()) {
      const held = this.mechs.some((m) => m.slotIdx === e.slotIdx) ||
                   this.posters.some((p) => p.userData.poster.entry.slotIdx === e.slotIdx);
      // FLOURISH ON EVERY CHANGE OF ROBOT. `held` means this slot already has
      // the right body standing on it, so it fires exactly when the robot on
      // this mark becomes a different one — a new pick, or the same pick in a
      // new paint scheme. It is an indicator first and cover second: the frame
      // in which the pixels swap happens under the flash.
      // RANDOM IS NOT A ROBOT. Flipping onto or off the mystery "?" mark isn't
      // a robot change, so it gets no flourish either way — beaming in a
      // question mark reads as a bug.
      const wasRandom = this._lastId?.get(e.slotIdx) === 'random';
      if (!held && e.id !== 'random' && !wasRandom) {
        this.sparkleAt(x, e.slotIdx, 7 * (ROSTER_BY_ID[e.id]?.body?.scale || 1));
      }
      if (e.id === 'random') {
        // mystery unit: a hovering "?" instead of a mech
        const spr = this.questionSprite(e.variant || 0);
        spr.position.set(x, 4.8, 0);
        this.group.add(spr);
        this.extras = this.extras || [];
        this.extras.push(spr);
      } else if (!held && this.posterFor(e.id) && !this._built.has(e.id)) {
        // FLIPPING: show the pre-rendered picture and build nothing. The real
        // body is created once this choice has sat still for SETTLE_MS (see
        // update), or immediately when this player locks in — and a mech
        // already built never comes back here.
        this.showPoster(e, x);
      } else if (!held) {
        // spawnUnit shows the procedural body, or (in ?debug=3d) a spinner
        // that swaps to the GLB when it loads — the exact body the battle uses
        const def = applyColorScheme(ROSTER_BY_ID[e.id], e.variant || 0);
        // `_sig` rides in the META so it survives the spinner->GLB swap.
        // Set on the returned object instead, it was lost the moment the
        // real body replaced the placeholder, and every later refresh then
        // saw an unrecognised unit and rebuilt it — which is why, with two
        // players, moving ONE cursor put BOTH mechs back into loading.
        this.spawnUnit(def, new THREE.Vector3(x, 0, 0), POSTER_YAW,
          { slotIdx: e.slotIdx, stageX: x, yawOffset: 0, fx: null, _sig: sig });
        this._built.add(e.id);
      }
      if (n > 1) {
        const ring = ringMesh(this.engine.renderer, 2.7, 0.5, PLAYER_COLORS[e.slotIdx % 4], 0.85);
        ring.position.set(x, 0.06, 0);
        this.group.add(ring);
        this.rings.push(ring);
      }
    }
    // what each mark is showing NOW, so the next refresh can tell a robot
    // change from a flip on or off the RANDOM "?" (which gets no flourish)
    this._lastId = new Map(entries.map((e) => [e.slotIdx, e.id]));
    aimPreviewCamera(this.engine.camera, n, cx);
  }

  unitFor(slotIdx) { return this.mechs.find((m) => m.slotIdx === slotIdx) || null; }

  // LOCK-IN FLOURISH: the mech whips around twice while a glow blooms behind
  // it, so a lock reads instantly across a four-player table.
  lockFx(slotIdx) {
    this.promoteSlot(slotIdx);   // this player's body now, not in 0.7s
    const m = this.unitFor(slotIdx);
    if (!m) return;
    m.fx = { t: 0, dur: 0.72, base: m.group.rotation.y };
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
    this._swayHold.clear(); // nothing left to stay in step with
    for (const mesh of this.posters.slice()) this.dropPoster(mesh);
    for (const m of this.mechs) {
      this.group.remove(m.group);
      if (m.spinner) disposeSpinner(m.spinner);
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
    this.updateSparkles(dt);
    // a poster that has stood still long enough earns its real body
    this.layoutPosters();
    for (const mesh of this.posters.slice()) {
      const p = mesh.userData.poster;
      p.settle -= dt;
      if (p.settle <= 0) this.promotePoster(mesh);
    }
    // THE SHARED SWAY (see armSway). Waiting models are let in as the wave
    // passes through their parked yaw — sin() = 0, i.e. a whole multiple of PI
    // of phase — which is the one instant joining it is invisible.
    const sway = (this.t - this._swayT0) * SWAY_RATE;
    if (this._swayHold.size &&
        Math.floor(sway / Math.PI) !== Math.floor((sway - dt * SWAY_RATE) / Math.PI)) {
      this._swayHold.clear();
    }
    for (const m of this.mechs) {
      if (m.isSpinner) {
        const s = m.spinner?.userData.spin;
        if (!s) continue;               // waiting, but not showing anything yet
        s.t += dt;
        s.r1.rotation.z += dt * 2.4; s.r1.rotation.x += dt * 1.2;
        s.r2.rotation.y += dt * 3.2;
        s.core.scale.setScalar(0.85 + Math.sin(s.t * 4) * 0.15);
        continue;
      }
      // WHERE THIS MECH STANDS WHEN NOTHING IS HAPPENING TO IT. The lock-in
      // spin below has to land on this exact value, and it is a MOVING target
      // — the idle sway does not stop for the flourish — so it is read fresh
      // every frame rather than sampled when the spin starts.
      const rest = m.yawOffset ? m.yawOffset
        : this.previewId
          ? (this._swayHold.has(m.slotIdx) ? POSTER_YAW : Math.sin(sway) * SWAY_AMP + POSTER_YAW)
          // off the select screen there is no sway; hold the yaw it had when
          // the spin began (reading rotation.y live would feed back on itself)
          : (m.fx ? m.fx.base : m.group.rotation.y);
      if (m.fx) {
        // two fast turns, easing out; the glow blooms and fades with them.
        // Counted BACKWARDS from where it must end up: the spin used to add
        // 4PI to yawOffset and stop there, ignoring the sway, so the frame it
        // finished the mech visibly snapped across to the swaying yaw.
        m.fx.t += dt;
        const p = Math.min(1, m.fx.t / m.fx.dur);
        const e = 1 - (1 - p) * (1 - p) * (1 - p);
        m.group.rotation.y = rest - (1 - e) * Math.PI * 4;
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
      } else if (m.yawOffset || this.previewId) {
        m.group.rotation.y = rest;   // steered, parked, or riding the sway
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
