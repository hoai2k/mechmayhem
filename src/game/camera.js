// Battle camera. One human (or spectator): a single combined cinematic view.
// Two or more humans: ALWAYS split into per-player chase viewports — no
// mid-fight flipping between full and split. The 2-player split can be
// side-by-side or stacked, toggled at runtime (pause menu / F9).
import * as THREE from 'three';
import { clamp, lerp, damp, angleDamp } from '../core/utils.js';
import { CONFIG } from '../core/config.js';

// WHICH WAY IS UP. Every pitch input — right stick, touch look-drag, combined
// view or split — goes through this, so the two view modes can't drift apart
// (they used to: the stick pitched the combined camera one way and a split
// viewport the other). Positive result = the camera RISES and you look DOWN
// on your mech, which is what pushing the stick down does by default;
// SETTINGS → REVERSE CAMERA Y flips it for anyone who wants the inversion.
const pitchY = (v) => (CONFIG.reverseCameraY ? -v : v);

const _v = new THREE.Vector3();
const _center = new THREE.Vector3();
const _ray = new THREE.Vector3();
const _lift = new THREE.Vector3();   // per-frame scratch (was allocated per fighter, per frame)

const LAYOUT_KEY = 'rw.splitLayout';
const ZOOM_KEY = 'rw.camZoom';
const ZOOM_MIN = 0.55, ZOOM_MAX = 1.9;
// How low a MANUALLY aimed camera may sit: 0 is level with the look target,
// which rides at the mech's head. The automatic framing still lives well above
// this — only a player pushing the stick down gets there.
const EL_MIN = 0;

function readZoom() {
  try {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(v) ? clamp(v, ZOOM_MIN, ZOOM_MAX) : 1;
  } catch (e) { return 1; }
}

// viewport rects are in engine coords: x/y from bottom-left, 0..1
const LAYOUTS = {
  lr: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
  tb: [{ x: 0, y: 0.5, w: 1, h: 0.5 }, { x: 0, y: 0, w: 1, h: 0.5 }], // P1 top
  3: [{ x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.25, y: 0, w: 0.5, h: 0.5 }],
  4: [{ x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }],
};

export class CameraSystem {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.mode = 'combined';
    this.azimuth = Math.PI;      // camera sits south of the action by default
    this.azInit = false;         // has the single-player behind-view locked on yet
    this.elevation = 0.42;
    this.shakeT = 0;

    // Manual look (touch drag): offsets layered on top of the auto framing,
    // held while the player drags, then eased back to the auto view.
    this.lookAzOffset = 0;
    this.lookElOffset = 0;
    this.lookCd = 0;             // seconds of "hold" left since the last drag
    // CAMERA ADJUST (left-stick click): a player-set zoom multiplier on the
    // auto framing, so everyone can sit where they like. Persisted — it is a
    // preference, not a per-match thing.
    this.zoomMul = readZoom();

    // 2-player split orientation preference (persisted)
    this.layout2p = 'lr';
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved === 'lr' || saved === 'tb') this.layout2p = saved;
    } catch (e) { /* storage unavailable — session default */ }

    // combined-cam smoothed state
    this.cPos = new THREE.Vector3(0, 24, 46);
    this.cTarget = new THREE.Vector3(0, 4, 0);
    this.dist = 46;

    // per-player chase cams — each orbits its own azimuth/elevation so the
    // view starts BEHIND that player and the right stick steers it
    this.chase = [];
    for (let i = 0; i < 4; i++) {
      this.chase.push({
        camera: new THREE.PerspectiveCamera(50, 1, 0.5, 2200),
        pos: new THREE.Vector3(),
        target: new THREE.Vector3(),
        init: false,
        azInit: false,
        az: Math.PI,
        el: 0.38,
        lookX: 0,   // right-stick input, set each frame via setLook()
        lookY: 0,
        adjust: false, // left-stick click held: lookY zooms instead of pitching
      });
    }

    // divider overlay
    this.dividerEl = document.createElement('div');
    this.dividerEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;display:none;';
    document.getElementById('ui-root').appendChild(this.dividerEl);
    this._dividerKind = null;

    // camera->fighter occlusion segments (reused each frame; buildings that
    // cross any of these ghost out — the camera NEVER collides with them)
    this._segs = [];
    for (let i = 0; i < 8; i++) {
      this._segs.push({
        from: new THREE.Vector3(),
        // whole-body samples: center, both flanks, head, feet — a building
        // must block ALL of them before it fades
        targets: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      });
    }
  }

  // 'single' | 'lr' | 'tb' | '3' | '4' for a given human count
  layoutKind(humanCount) {
    if (humanCount < 2) return 'single';
    if (humanCount === 2) return this.layout2p;
    return String(Math.min(humanCount, 4));
  }

  layoutRects(humanCount) {
    const kind = this.layoutKind(humanCount);
    return kind === 'single' ? null : LAYOUTS[kind];
  }

  // flip 2P split between side-by-side and stacked; returns the new kind
  toggleLayout2p() {
    this.layout2p = this.layout2p === 'lr' ? 'tb' : 'lr';
    try { localStorage.setItem(LAYOUT_KEY, this.layout2p); } catch (e) { /* ok */ }
    this._dividerKind = null; // force divider rebuild
    for (const ch of this.chase) ch.init = false; // snap cams to new framing
    this.world.audio?.play('uiMove');
    return this.layout2p;
  }

  // Right stick on the COMBINED view. `adjust` = left-stick click held, which
  // turns the vertical axis into a zoom (push forward to come in) instead of a
  // pitch. Horizontal always steers the orbit: the camera is the player's to
  // aim, and nothing auto-swings it while they are not locked on.
  applyStick(x, y, dt, adjust = false) {
    if (adjust) {
      if (y) this.setZoom(this.zoomMul + y * 0.5 * dt);   // forward (y<0) = in
      if (x) this.applyLook(x * 420 * dt, 0);
      this.lookCd = 3.0;
      return;
    }
    this.applyLook(x * 420 * dt, y * 380 * dt);
  }

  // The player's own zoom on the auto framing, remembered between matches.
  setZoom(v) {
    this.zoomMul = clamp(v, ZOOM_MIN, ZOOM_MAX);
    try { localStorage.setItem(ZOOM_KEY, this.zoomMul.toFixed(3)); } catch (e) { /* ok */ }
  }

  // Player dragged on the look region (touch). dx/dy are per-frame pixel
  // deltas; rotate the orbit and nudge the pitch, and hold the view briefly.
  applyLook(dx, dy) {
    this.lookAzOffset -= dx * 0.006;
    this.lookElOffset = clamp(this.lookElOffset + pitchY(dy) * 0.004, -0.40, 0.45);
    this.lookCd = 3.0;
    this.azInit = true; // ensure the auto base eases (never snaps) under us
  }

  // Same drag deltas, but aimed at one player's split viewport.
  applyLookFor(humanIdx, dx, dy) {
    const ch = this.chase[humanIdx];
    if (!ch) return;
    ch.az -= dx * 0.006;
    ch.el = clamp(ch.el + pitchY(dy) * 0.004, EL_MIN, 0.78);
    ch.lookCd = 3.0; // manual look holds; the lazy follow stays out of it
  }

  // Right-stick camera input for one player's split viewport; call every
  // frame (values are consumed by updateSplit and treated as a rate).
  setLook(humanIdx, x, y, adjust = false) {
    const ch = this.chase[humanIdx];
    if (!ch) return;
    ch.lookX = x;
    ch.lookY = adjust ? 0 : y;
    ch.zoomIn = adjust ? y : 0;   // camera-adjust mode: vertical is a zoom
    ch.adjust = adjust;
  }

  // ---- follow/lock/giant-zoom math shared by the combined and split cams ----

  // azimuth that puts the camera behind `f` looking straight at `other`
  // through the shortest wrapped path (target lock, and the solo
  // behind-the-player framing toward the nearest enemy)
  azimuthBehind(f, other) {
    return Math.atan2(
      -this.world.wrapDelta(other.pos.x - f.pos.x),
      -this.world.wrapDelta(other.pos.z - f.pos.z)
    );
  }

  // how far past its natural size a mech is grown (COLOSSAL FORM) — 1 in a
  // normal fight
  giantFactor(f) {
    return f.scale / (f.def.body.scale || 1);
  }

  // COLOSSAL-FORM zoom easing: while a giant is in frame (gf > 1.03) the
  // zoom eases slowly (1.5) so the size change lands FIRST and the camera
  // pulls out (grow) or back in (shrink) a clear beat later; otherwise each
  // mode's own normalRate applies (combined 3, split 12 ≈ near-instant).
  giantZoomDamp(cur, want, gf, normalRate, dt) {
    return damp(cur, want, gf > 1.03 ? 1.5 : normalRate, dt);
  }

  // spread a segment's occlusion samples across the fighter's whole body
  fillSegTargets(seg, camPos, f) {
    let dx = f.pos.x - camPos.x, dz = f.pos.z - camPos.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const rx = -dz, rz = dx;                 // view-perpendicular (XZ)
    const r = f.hitRadius * 0.85;
    const midY = f.pos.y + f.height * 0.55;
    seg.targets[0].set(f.pos.x, midY, f.pos.z);
    seg.targets[1].set(f.pos.x + rx * r, midY, f.pos.z + rz * r);
    seg.targets[2].set(f.pos.x - rx * r, midY, f.pos.z - rz * r);
    seg.targets[3].set(f.pos.x, f.pos.y + f.height, f.pos.z);
    seg.targets[4].set(f.pos.x, f.pos.y + 0.5, f.pos.z);
  }

  // fighters framed by the camera; humans get viewports when split
  update(dtReal, fighters, humans) {
    // cinematic finisher owns the whole SCREEN while it runs: drop any
    // split-screen viewports for one fullscreen cinematic view (dividers
    // hidden), then hand the split back the frame after it ends
    const fin = this.world.finisher;
    if (fin) {
      this.engine.views = null;
      this.dividerEl.style.display = 'none';
      this._dividerKind = null;
      const c = this.engine.camera;
      c.position.copy(fin.cam.pos);
      c.lookAt(fin.cam.look);
      return;
    }

    const alive = fighters.filter((f) => f.alive);
    const framed = alive.length ? alive : fighters;
    if (!framed.length) return;

    this.mode = humans.length >= 2 ? 'split' : 'combined';

    const shake = this.world.effects.shake;
    this.shakeT += dtReal * 30;
    const shakeX = shake > 0.01 ? Math.sin(this.shakeT * 1.3) * shake * 0.5 : 0;
    const shakeY = shake > 0.01 ? Math.cos(this.shakeT * 1.7) * shake * 0.35 : 0;

    if (this.mode === 'combined') {
      this.updateCombined(dtReal, framed, humans, shakeX, shakeY);
      this.engine.views = null;
      this.dividerEl.style.display = 'none';
      this._dividerKind = null;
    } else {
      this.updateSplit(dtReal, humans, shakeX, shakeY);
    }
  }

  updateCombined(dt, framed, humans, shakeX, shakeY) {
    // centroid + radius needed to frame everyone. On wrapped arenas frame
    // each fighter's NEAREST IMAGE relative to the solo player, so crossing
    // the seam never snaps the framing (the enemy "ahead through the seam"
    // is treated as genuinely ahead).
    const soloRef = humans.length === 1 && humans[0].alive ? humans[0] : null;
    const wd = (d) => this.world.wrapDelta(d);
    if (this._pts === undefined) {
      this._pts = [];
      for (let i = 0; i < 8; i++) this._pts.push(new THREE.Vector3());
    }
    const pts = [];
    let upperY = 0; // frame upper bodies, not waists
    for (let i = 0; i < framed.length && i < this._pts.length; i++) {
      const f = framed[i];
      upperY += f.height * 0.75;
      const p = this._pts[i];
      if (soloRef && f !== soloRef && this.world.wrapHalf) {
        p.set(
          soloRef.pos.x + wd(f.pos.x - soloRef.pos.x),
          f.pos.y,
          soloRef.pos.z + wd(f.pos.z - soloRef.pos.z)
        );
      } else {
        p.copy(f.pos);
      }
      pts.push(p);
    }
    _center.set(0, 0, 0);
    for (const p of pts) _center.add(p);
    _center.divideScalar(pts.length);
    // giant factor: how far past its natural size the biggest framed mech
    // is grown (COLOSSAL FORM). 1 in a normal fight — framing unchanged.
    // (upperY already tracks the giant's inflated height, so the center
    // rides up with him on its own.)
    let giantF = 1;
    for (const f of framed) {
      giantF = Math.max(giantF, this.giantFactor(f));
    }
    _center.y += upperY / pts.length;

    let radius = 10;
    for (let i = 0; i < pts.length; i++) {
      const gf = this.giantFactor(framed[i]);
      const headroom = gf > 1.05 ? framed[i].height * 0.8 : 0; // fit the whole giant
      radius = Math.max(radius, pts[i].distanceTo(_center) + 6 + headroom);
    }
    // Single human: bias framing toward them (Override-style). The orbit is
    // aimed once, behind the player, and is theirs to steer from then on —
    // only a held target lock takes it back.
    const solo = humans.length === 1 && humans[0].alive;
    if (solo && humans[0]._wrap) {
      // shift the solo cam with a wrapping player — seamless fold
      const wr = humans[0]._wrap;
      this.cPos.x += wr.dx; this.cPos.z += wr.dz;
      this.cTarget.x += wr.dx; this.cTarget.z += wr.dz;
      humans[0]._wrap = null;
    }
    if (solo) {
      const player = humans[0];
      // the camera frames ONLY the player's mech — dead-center, always.
      // Enemies never pull the frame; the orbit azimuth alone turns the
      // view so the current threat tends to sit ahead of you.
      _center.set(player.pos.x, player.pos.y + player.height * 0.75, player.pos.z);
      const lockT = player.lockTarget && player.lockTarget.alive ? player.lockTarget : null;
      if (lockT) {
        // TARGET LOCK (LB held): the camera swings behind the player and
        // aims straight down the line at the locked enemy — it owns the
        // view for as long as the lock is held
        const lockAz = this.azimuthBehind(player, lockT);
        this.azimuth = this.azInit ? angleDamp(this.azimuth, lockAz, 5, dt) : lockAz;
        this.azInit = true;
        this.lookAzOffset = damp(this.lookAzOffset, 0, 4, dt);
      } else if (!this.azInit) {
        // UNLOCKED, THE CAMERA IS THE PLAYER'S. It is aimed once — behind the
        // mech as the round opens — and after that only the right stick turns
        // it. Nothing auto-swings the orbit to the mech's back or toward the
        // nearest enemy any more: movement is camera-relative, so a camera
        // that chases the facing quietly steers the player, and every attempt
        // to run one way ends up curving. Pitch still eases home (below);
        // yaw does not.
        this.azimuth = player.yaw + Math.PI;
        this.azInit = true;
      }
    }

    const fovHalf = (this.engine.camera.fov * Math.PI / 360);
    let wantDist = clamp(radius / Math.tan(fovHalf) * 1.15, 26, 95 * giantF);
    // Solo: pull in close for an over-the-shoulder chase (the enemy stays
    // framed because the camera is directly behind the player, facing them).
    // Tight max — a distant enemy must not shrink YOUR mech into the void.
    // (A COLOSSAL-FORM giant in frame scales the whole envelope out.)
    if (solo) wantDist = clamp(wantDist * 0.58, 22 * giantF, 34 * giantF);
    wantDist *= this.zoomMul;   // the player's own camera-adjust zoom
    if (!this.init) this.dist = wantDist;
    // COLOSSAL FORM: while a giant is in frame, ease the ZOOM slowly so the
    // size change lands FIRST — the scale reads before the reframe. The
    // look target still rides up with him instantly, so he stays in shot.
    this.dist = this.giantZoomDamp(this.dist, wantDist, giantF, 3, dt);

    // Manual look offsets hold while dragging, then ease back to the auto view.
    // Manual PITCH eases back to the auto framing; manual YAW does not — an
    // unlocked orbit stays exactly where the player pointed it (under target
    // lock the branch above damps it home instead).
    if (this.lookCd > 0) this.lookCd -= dt;
    else this.lookElOffset = damp(this.lookElOffset, 0, 1.0, dt);

    const az = this.azimuth + this.lookAzOffset;
    const el = clamp((solo ? 0.34 : this.elevation) + this.lookElOffset, EL_MIN, 0.82);
    _v.set(
      Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)
    ).multiplyScalar(this.dist);
    const wantPos = _v.add(_center);

    if (!this.init) {
      this.init = true;
      this.cPos.copy(wantPos);
      this.cTarget.copy(_center);
    }
    this.cPos.x = damp(this.cPos.x, wantPos.x, 4, dt);
    this.cPos.y = damp(this.cPos.y, wantPos.y, 4, dt);
    this.cPos.z = damp(this.cPos.z, wantPos.z, 4, dt);
    this.cTarget.x = damp(this.cTarget.x, _center.x, 5, dt);
    this.cTarget.y = damp(this.cTarget.y, _center.y, 5, dt);
    this.cTarget.z = damp(this.cTarget.z, _center.z, 5, dt);

    const cam = this.engine.camera;
    cam.position.set(this.cPos.x + shakeX, this.cPos.y + shakeY, this.cPos.z);
    cam.lookAt(this.cTarget.x + shakeX * 0.6, this.cTarget.y + shakeY * 0.6, this.cTarget.z);

    // solo chase cam rides low — ghost buildings that hide the PLAYER's own
    // mech (enemies may still use cover; the camera never physically
    // reacts to buildings, it only fades the ones hiding your character)
    if (solo) {
      const seg = this._segs[0];
      seg.from.copy(this.cPos);
      this.fillSegTargets(seg, this.cPos, humans[0]);
      seg.cam = this.engine.camera; // fade applies only to this view's render
      this.world.arena?.setOccluders?.([seg]);
    } else {
      this.world.arena?.setOccluders?.([]);
    }
  }

  // world-space azimuth used to make controls camera-relative
  inputYawFor(fighter, humanIdx) {
    if (this.mode === 'combined' || humanIdx < 0) {
      const dx = this.cTarget.x - this.cPos.x, dz = this.cTarget.z - this.cPos.z;
      return Math.atan2(dx, dz);
    }
    const ch = this.chase[humanIdx];
    const dx = ch.target.x - ch.pos.x, dz = ch.target.z - ch.pos.z;
    return Math.atan2(dx, dz);
  }

  // the render camera covering a given human's view — the HUD projects the
  // lock-aim crosshair through this
  cameraFor(humanIdx) {
    if (this.mode === 'split' && this.chase[humanIdx]?.init) return this.chase[humanIdx].camera;
    return this.engine.camera;
  }

  // where a human's viewport sits on screen (0..1, origin bottom-left) —
  // the HUD centers that player's aim crosshair on it
  viewportRectFor(humanIdx) {
    if (this.mode !== 'split') return { x: 0, y: 0, w: 1, h: 1 };
    const n = Math.min(this.world.fighters.filter((f) => !f.isAI).length, 4);
    return LAYOUTS[this.layoutKind(n)][humanIdx] || { x: 0, y: 0, w: 1, h: 1 };
  }

  updateSplit(dt, humans, shakeX, shakeY) {
    const n = Math.min(humans.length, 4);
    const kind = this.layoutKind(n);
    const layout = LAYOUTS[kind];
    const views = [];
    const segsUsed = [];

    for (let i = 0; i < n; i++) {
      const f = humans[i];
      const ch = this.chase[i];
      const vp = layout[i];
      const cam = ch.camera;
      cam.aspect = (window.innerWidth * vp.w) / (window.innerHeight * vp.h);
      cam.updateProjectionMatrix();

      // toroidal wrap: when this player folds across the seam, shift their
      // camera by the same offset — relative geometry unchanged, no pop
      if (f._wrap) {
        ch.pos.x += f._wrap.dx; ch.pos.z += f._wrap.dz;
        ch.target.x += f._wrap.dx; ch.target.z += f._wrap.dz;
        f._wrap = null;
      }

      // each cam starts directly BEHIND its player (facing their spawn look
      // direction) and orbits with that player's right stick from there
      if (!ch.azInit) {
        ch.azInit = true;
        ch.az = f.yaw + Math.PI;
        ch.el = 0.38;
      }
      ch.az -= ch.lookX * 2.8 * dt;
      ch.el = clamp(ch.el + pitchY(ch.lookY) * 2.0 * dt, EL_MIN, 0.78);
      // CAMERA ADJUST (left-stick click): the vertical axis zooms instead
      if (ch.zoomIn) this.setZoom(this.zoomMul + ch.zoomIn * 0.5 * dt);

      const stickActive = Math.abs(ch.lookX) > 0.08 || Math.abs(ch.lookY) > 0.08 || !!ch.adjust;
      ch.lookCd = stickActive ? 0.6 : Math.max(0, (ch.lookCd || 0) - dt);
      const lockT = f.lockTarget && f.lockTarget.alive ? f.lockTarget : null;
      if (lockT && !stickActive) {
        // TARGET LOCK (LB held): this viewport swings behind its player and
        // keeps the locked enemy dead ahead (stick input still overrides).
        // Unlocked, nothing turns this orbit but the player's own stick —
        // see the note on the combined view: an orbit that chases the mech's
        // facing steers the player, because movement is camera-relative.
        ch.az = angleDamp(ch.az, this.azimuthBehind(f, lockT), 5, dt);
      }

      // stacked viewports are short — pull back a touch so mechs fit.
      // A COLOSSAL-FORM giant needs the whole chase envelope scaled out.
      const gf = Math.max(1, this.giantFactor(f));
      const baseDist = (vp.h < 0.75 && vp.w > 0.75 ? 25 : 22) * gf;
      // COLOSSAL FORM: ease the ZOOM behind the actual size change (grow →
      // pull out after; shrink → move in after) while the mech-follow stays
      // tight. Near-instant when not a giant, so normal framing is unchanged.
      if (ch.dist === undefined) ch.dist = baseDist;
      ch.dist = this.giantZoomDamp(ch.dist, baseDist * this.zoomMul, gf, 12, dt);
      const el = ch.el;
      _v.set(
        Math.sin(ch.az) * Math.cos(el), Math.sin(el), Math.cos(ch.az) * Math.cos(el)
      ).multiplyScalar(ch.dist);
      const wantPos = _v.add(f.pos).add(_lift.set(0, 2 * gf, 0));
      // the chase cam tracks ONLY its own mech — opponents never pull the
      // frame; use the right stick to look around
      const lookAhead = _center.copy(f.pos);
      // aim at the mech's upper body/head; riding on f.pos.y also keeps the
      // target with a flying mech, and f.height carries the COLOSSAL-FORM
      // giant's inflated size automatically
      lookAhead.y += f.height * 0.75;

      if (!ch.init) { ch.pos.copy(wantPos); ch.target.copy(lookAhead); ch.init = true; }
      ch.pos.x = damp(ch.pos.x, wantPos.x, 5, dt);
      ch.pos.y = damp(ch.pos.y, wantPos.y, 5, dt);
      ch.pos.z = damp(ch.pos.z, wantPos.z, 5, dt);
      ch.target.x = damp(ch.target.x, lookAhead.x, 6, dt);
      ch.target.y = damp(ch.target.y, lookAhead.y, 6, dt);
      ch.target.z = damp(ch.target.z, lookAhead.z, 6, dt);

      cam.position.set(ch.pos.x + shakeX, ch.pos.y + shakeY, ch.pos.z);
      cam.lookAt(ch.target.x, ch.target.y, ch.target.z);
      views.push({ camera: cam, ...vp });

      // ghost any building between this camera and its own mech — tagged
      // with THIS view's camera so the fade renders only in this viewport
      const seg = this._segs[i];
      seg.from.copy(ch.pos);
      this.fillSegTargets(seg, ch.pos, f);
      seg.cam = ch.camera;
      segsUsed.push(seg);
    }
    this.engine.views = views;
    this.world.arena?.setOccluders?.(segsUsed);
    this.renderDividers(kind);
  }

  renderDividers(kind) {
    this.dividerEl.style.display = 'block';
    if (this._dividerKind === kind) return;
    this._dividerKind = kind;
    const vLine = (leftPct, topPct, hPct) =>
      `<div style="position:absolute;left:calc(${leftPct}% - 2px);top:${topPct}%;width:4px;height:${hPct}%;background:rgba(56,232,255,0.55);box-shadow:0 0 14px rgba(56,232,255,0.9);"></div>`;
    const hLine = (topPct) =>
      `<div style="position:absolute;left:0;top:calc(${topPct}% - 2px);width:100%;height:4px;background:rgba(56,232,255,0.55);box-shadow:0 0 14px rgba(56,232,255,0.9);"></div>`;
    let html = '';
    if (kind === 'lr') html = vLine(50, 0, 100);
    else if (kind === 'tb') html = hLine(50);
    else if (kind === '3') html = hLine(50) + vLine(50, 0, 50); // vertical split only in the top half
    else html = vLine(50, 0, 100) + hLine(50);
    this.dividerEl.innerHTML = html;
  }
}
