// Battle camera. One human (or spectator): a single combined cinematic view.
// Two or more humans: ALWAYS split into per-player chase viewports — no
// mid-fight flipping between full and split. The 2-player split can be
// side-by-side or stacked, toggled at runtime (pause menu / F9).
import * as THREE from 'three';
import { clamp, lerp, damp, angleDamp } from '../core/utils.js';
import { CONFIG } from '../core/config.js';
import { TUNING } from '../core/tuning.js';

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
// Roll-stable fighter positions (Fighter.focusPos): the air somersault holds
// the BALL's centre still by sliding the group every frame, so a tumbling
// fighter's raw `pos` orbits at the spin rate — every framing read below goes
// through focusPos so the camera tracks the smooth falling base instead.
const _fpA = new THREE.Vector3();
const _scopeF = new THREE.Vector3();  // sniper scope scratch
const _scopeR = new THREE.Vector3();
const _scopeHead = new THREE.Vector3();
const _scopeEye = new THREE.Vector3();
const _scopeLook = new THREE.Vector3();
const _scopeSide = new THREE.Vector3();
const _scopeUp = new THREE.Vector3(0, 1, 0);
// ---------------------------------------------------------------------------
// THE CLIMB CAMERA (surface walking, combat/climb.js).
//
// The one rule learned from every gravity game since Mario Galaxy: a camera
// must never take its orientation FROM a surface — surfaces are discontinuous
// and cameras must be continuous, so the camera INTEGRATES. It keeps its own
// persistent orbit direction (mech -> eye, unit) and each frame turns it a
// bounded number of degrees along a great circle toward a GOAL direction
// blended from three things:
//     his own up  (smoothed AGAIN here, slower than the body follows it)
//   + world up    (the horizon bias: you watch him from above-and-outside,
//                  and the screen never rolls)
//   - his travel  (the camera trails him, so going over a roof reads as one
//                  crane move up the near face, over the top, down the far)
// A deadband keeps block seams from twitching it, and the rate cap makes a
// FLIP impossible by construction: there is no path from "behind the near
// face" to "behind the far face" except the smooth arc over the building.
// The result is blended in and out by an engage factor, so taking a wall and
// stepping off it are camera moves, not camera cuts — and while it is engaged
// the ordinary azimuth is kept synced underneath, so the hand-back lands on
// the view the player is already looking at.
const CLIMB_CAM = {
  rate: 1.5,       // max orbit sweep, rad/s — the crane speed
  dead: 0.09,      // rad of goal error the orbit simply ignores (seam jitter)
  upBias: 1.05,    // world-up weight in the goal
  normBias: 1.0,   // his-own-up weight (the "outside the wall" pull)
  trail: 0.5,      // opposite-of-travel weight (stay behind him)
  upRate: 2.2,     // how fast the camera's copy of his up follows the body's
  engage: 2.8,     // blend in/out rate
  // THE POLE CLAMP. On a rooftop every term of the goal points straight up,
  // and a spherical orbit AT the pole is degenerate: yaw spins in place and
  // pitch has no defined direction to move in — exactly the "stick does
  // nothing" report. So the goal's POLAR angle (off his up) is clamped away
  // from both poles, its azimuth falls back to wherever the camera already
  // is when the goal itself is vertical, and the PLAYER'S pitch stick slides
  // a persistent polar offset — the camera can always be pulled down to a
  // near-horizontal view of him, from anywhere, and it stays where it is put.
  polarMin: 0.24,  // never nearer the overhead pole than this (rad)
  polarMax: 1.52,  // ...nor past near-horizontal
  pitchRate: 2.0,  // player pitch authority, rad/s at full stick
  yawRate: 2.8,    // player yaw authority, rad/s at full stick
};
const _ccGoal = new THREE.Vector3();
const _ccAxis = new THREE.Vector3();
const _ccQ = new THREE.Quaternion();
const _ccPos = new THREE.Vector3();
const _ccTgt = new THREE.Vector3();
const _ccUp = new THREE.Vector3(0, 1, 0);

// One climb-orbit state per view (`st` lives on the chase entry / the combined
// camera). Returns the engage factor 0..1; when > 0, _ccPos/_ccTgt hold the
// climb camera's own want, to be lerped over the ordinary one BEFORE the
// ordinary position damps run — so both hand-offs inherit that smoothing.
function climbCam(st, f, dt, dist, seedPos, yawIn = 0, pitchIn = 0) {
  if (!st.dir) {
    st.dir = new THREE.Vector3(0, 0.5, -1).normalize();
    st.up = new THREE.Vector3(0, 1, 0);
    st.trail = new THREE.Vector3();
    st.k = 0;
    st.seeded = false;
  }
  const want = f.climb ? 1 : 0;
  st.k = damp(st.k, want, CLIMB_CAM.engage, dt);
  if (st.k < 0.01) { st.seeded = false; return 0; }
  const fp = f.focusPos(_fpB);
  if (!st.seeded) {
    // seed from where the camera ALREADY is, so engaging is not a cut
    st.seeded = true;
    _ccAxis.copy(seedPos).sub(fp);
    if (_ccAxis.lengthSq() > 1) st.dir.copy(_ccAxis.normalize());
  }
  st.up.lerp(f.climbUp || _ccUp, 1 - Math.exp(-CLIMB_CAM.upRate * dt)).normalize();
  const spd = f.vel.length();
  if (spd > 3) {
    _ccGoal.copy(f.vel).multiplyScalar(-1 / spd);
    st.trail.lerp(_ccGoal, 1 - Math.exp(-2.2 * dt));
  } else st.trail.multiplyScalar(1 - Math.min(1, 1.5 * dt));
  _ccGoal.set(0, CLIMB_CAM.upBias, 0)
    .addScaledVector(st.up, CLIMB_CAM.normBias)
    .addScaledVector(st.trail, CLIMB_CAM.trail)
    .normalize();
  // ---- the player's hands on the orbit ----
  // pitch slides a persistent polar offset (camera rises = smaller polar);
  // yaw turns the orbit direction about his up directly, same muscle memory
  // as the ordinary cameras
  if (st.polarOff === undefined) st.polarOff = 0;
  st.polarOff = clamp(st.polarOff - pitchIn * CLIMB_CAM.pitchRate * dt, -1.3, 1.3);
  if (yawIn) {
    _ccQ.setFromAxisAngle(st.up, -yawIn * CLIMB_CAM.yawRate * dt);
    st.dir.applyQuaternion(_ccQ).normalize();
  }
  // ---- rebuild the goal at a POLE-SAFE polar angle ----
  // polar = angle off his up; azimuth = the goal's own horizontal part, or —
  // when the goal is vertical (a rooftop: everything points up) — wherever
  // the camera already is, which is what keeps yaw meaningful up there
  const gUp = _ccGoal.dot(st.up);
  const p0 = Math.acos(clamp(gUp, -1, 1));
  _ccAxis.copy(_ccGoal).addScaledVector(st.up, -gUp);        // azimuthal part
  if (_ccAxis.lengthSq() < 0.0025) {
    _ccAxis.copy(st.dir).addScaledVector(st.up, -st.dir.dot(st.up));
    if (_ccAxis.lengthSq() < 1e-6) _ccAxis.set(st.up.y, st.up.z, -st.up.x)
      .addScaledVector(st.up, -st.up.dot(_ccAxis));
  }
  _ccAxis.normalize();
  const polar = clamp(p0 + st.polarOff, CLIMB_CAM.polarMin, CLIMB_CAM.polarMax);
  _ccGoal.copy(st.up).multiplyScalar(Math.cos(polar))
    .addScaledVector(_ccAxis, Math.sin(polar));
  const ang = st.dir.angleTo(_ccGoal);
  if (ang > CLIMB_CAM.dead) {
    _ccAxis.crossVectors(st.dir, _ccGoal);
    if (_ccAxis.lengthSq() > 1e-8) {
      _ccAxis.normalize();
      const step = Math.min(ang - CLIMB_CAM.dead * 0.5, CLIMB_CAM.rate * dt);
      _ccQ.setFromAxisAngle(_ccAxis, step);
      st.dir.applyQuaternion(_ccQ).normalize();
    }
  }
  _ccTgt.copy(fp).addScaledVector(st.up, f.height * 0.55);
  _ccPos.copy(_ccTgt).addScaledVector(st.dir, dist);
  return st.k;
}
const _fpB = new THREE.Vector3();
const _fpSeg = new THREE.Vector3();

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
        // whole-body samples: a 3-wide × 4-tall grid over the silhouette
        // (see fillSegTargets) — a building fades only when ~90% of them
        // are blocked by ACTUAL standing chunks
        targets: Array.from({ length: 12 }, () => new THREE.Vector3()),
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
    // raw per-frame pulses for the climb camera, which owns the orbit
    // directly while engaged and cannot read the blended-away offsets
    this._lookPX = (this._lookPX || 0) + dx * 0.006;
    this._lookPY = (this._lookPY || 0) + pitchY(dy) * 0.004;
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
  //
  // IT AIMS AT THE CROSSHAIR, NOT AT THE BODY. The lock's aim point is the
  // player's to steer (combat/aim.js) — leading a strafing target is the whole
  // reason it exists — so the orbit that "keeps the target in frame" has to
  // follow the AIM, or the view would sit still while the crosshair walked off
  // the side of it. With no lead the two are the same bearing, so an unsteered
  // lock frames exactly what it always did.
  azimuthBehind(f, other) {
    const a = f.focusPos(_fpA);
    const p = (f.aiming && f._lockAim) ? _fpB.copy(f._lockAim) : other.focusPos(_fpB);
    return Math.atan2(
      -this.world.wrapDelta(p.x - a.x),
      -this.world.wrapDelta(p.z - a.z)
    );
  }

  // ---- SNIPER MODE: ALMOST FIRST PERSON ------------------------------------
  //
  // Everything here rides ONE number, the fighter's own `sniperK` (0..1, damped
  // by aim.js), so raising and lowering the scope is one smooth move in both
  // directions and no part of it can arrive ahead of another.
  //
  // At full scope the eye is not on an orbit at all: it sits just BEHIND AND
  // ABOVE HIS OWN HEAD and looks straight down the aim, with the crown of his
  // head in frame at the bottom — you are sighting along the robot rather than
  // watching him from across the street. That is the only framing in which the
  // crosshair means what it says, and it is what makes target-switching legible:
  // the thing you are about to shoot fills the middle of the screen.
  //
  // The orbit view is still what it blends FROM, so the way in and the way out
  // are a camera move rather than a cut, and the ordinary chase framing is
  // untouched at k = 0.
  applyScope(f, pos, target) {
    const k = f?.sniperK || 0;
    if (k < 0.001) return 0;
    const A = TUNING.aim;
    if (f._lockAim) target.lerp(f._lockAim, A.leadPull * k);
    // where he is looking: the aim if he has one, else his own facing
    const fp = f.focusPos(_scopeF);
    const headY = fp.y + f.height * 0.92;
    _scopeHead.set(fp.x, headY, fp.z);
    if (f._lockAim) _scopeR.copy(f._lockAim).sub(_scopeHead);
    else _scopeR.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    if (_scopeR.lengthSq() < 1e-6) _scopeR.set(0, 0, 1);
    _scopeR.normalize();
    // the eye: back along the aim, up, and OVER THE SHOULDER — all three in
    // units of his own height, so it sits the same on a scout and on a siege
    // chassis. The sideways step is what keeps his own back and shoulder gear
    // out of the shot: without it a big mech sights down a channel between his
    // own exhaust towers.
    _scopeSide.set(-_scopeR.z, 0, _scopeR.x).normalize();
    _scopeEye.copy(_scopeHead)
      .addScaledVector(_scopeR, -A.headBack * f.height)
      .addScaledVector(_scopeUp, A.headUp * f.height)
      .addScaledVector(_scopeSide, A.headSide * f.height);
    pos.lerp(_scopeEye, k);
    // …looking a long way down the aim FROM THE HEAD rather than from the
    // shifted eye, so the crosshair's own line stays in the middle of the view
    // however far the shoulder step moved the camera sideways
    _scopeLook.copy(_scopeHead).addScaledVector(_scopeR, 60);
    target.lerp(_scopeLook, k);
    return k;
  }

  // FOV for a view whose player is (or is not) scoped in. The framing math
  // must never read this — it reasons in the BASE fov, or the zoom would feed
  // back into the distance it is zooming.
  scopeFov(f, baseFov) {
    const k = f?.sniperK || 0;
    return k < 0.001 ? baseFov : baseFov * lerp(1, TUNING.aim.zoomFov, k);
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

  // Spread a segment's occlusion samples across the fighter's whole
  // silhouette — a 3×4 grid of the body as the camera sees it (two flanks
  // and the centre line, at foot / hip / chest / head height). The
  // destructible layer fades a building only when nearly ALL of these are
  // blocked (see setOccluders), so the count and spread ARE the "how hidden
  // is he really" measurement: too few points and a corner clipping one
  // shoulder reads the same as being swallowed whole.
  fillSegTargets(seg, camPos, f) {
    const p = f.focusPos(_fpSeg);
    let dx = p.x - camPos.x, dz = p.z - camPos.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const rx = -dz, rz = dx;                 // view-perpendicular (XZ)
    const r = f.hitRadius * 0.85;
    const H = f.height;
    let i = 0;
    for (const yf of [0.08, 0.38, 0.68, 0.95]) {          // feet → head
      const y = p.y + H * yf;
      for (const side of [0, 1, -1]) {                    // centre, both flanks
        const t = seg.targets[i++];
        if (!t) return;
        t.set(p.x + rx * r * side, y, p.z + rz * r * side);
      }
    }
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
    const sref = soloRef ? soloRef.focusPos(_fpA) : null;
    const pts = [];
    let upperY = 0; // frame upper bodies, not waists
    for (let i = 0; i < framed.length && i < this._pts.length; i++) {
      const f = framed[i];
      upperY += f.height * 0.75;
      const p = f.focusPos(this._pts[i]);
      if (sref && f !== soloRef && this.world.wrapHalf) {
        p.set(
          sref.x + wd(p.x - sref.x),
          p.y,
          sref.z + wd(p.z - sref.z)
        );
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
      const pp = player.focusPos(_fpA);
      _center.set(pp.x, pp.y + player.height * 0.75, pp.z);
      const lockT = player.lockTarget && player.lockTarget.alive ? player.lockTarget : null;
      // NEVER let the lock steer the orbit while he is surface-walking: it
      // chases a bearing built from his yaw, and a wall-walker's yaw is
      // whatever the stick last said — the whirling camera was exactly that.
      if (lockT && !player.climb) {
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

    // BASE fov, never the live one: the scope narrows the camera's fov below,
    // and framing distance derived from a zoomed fov would zoom itself further
    // every frame.
    if (this.baseFov === undefined) this.baseFov = this.engine.camera.fov;
    const fovHalf = (this.baseFov * Math.PI / 360);
    let wantDist = clamp(radius / Math.tan(fovHalf) * 1.15, 26, 95 * giantF);
    // Solo: pull in close for an over-the-shoulder chase (the enemy stays
    // framed because the camera is directly behind the player, facing them).
    // Tight max — a distant enemy must not shrink YOUR mech into the void.
    // (A COLOSSAL-FORM giant in frame scales the whole envelope out.)
    if (solo) wantDist = clamp(wantDist * 0.58, 22 * giantF, 34 * giantF);
    wantDist *= this.zoomMul;   // the player's own camera-adjust zoom
    // sniper mode brings the eye in as it narrows the fov (see applyScope)
    const scoped = solo ? humans[0] : null;
    if (scoped?.sniperK) wantDist *= lerp(1, TUNING.aim.zoomDist, scoped.sniperK);
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

    // THE CLIMB CAMERA (see CLIMB_CAM above): while the solo player is on a
    // surface, a persistent rate-limited orbit takes over — out along his up,
    // above, trailing his travel — and the ordinary azimuth is synced under
    // it so the hand-back lands where the player is already looking.
    if (solo && humans[0].def?.climb) {
      const cst = this._climbCam || (this._climbCam = {});
      // consume the raw look pulses (already in radians-this-frame): divide by
      // dt to hand climbCam a rate, so touch-drag and stick feel the same
      const px = (this._lookPX || 0) / Math.max(dt, 1e-4) / CLIMB_CAM.yawRate;
      const py = (this._lookPY || 0) / Math.max(dt, 1e-4) / CLIMB_CAM.pitchRate;
      this._lookPX = 0; this._lookPY = 0;
      const ck = climbCam(cst, humans[0], dt, this.dist, this.cPos, px, py);
      if (ck > 0) {
        wantPos.lerp(_ccPos, ck);
        _center.lerp(_ccTgt, ck);
        if (ck > 0.5) {
          this.azimuth = Math.atan2(cst.dir.x, cst.dir.z);
          this.lookAzOffset *= 1 - Math.min(1, 3 * dt);
        }
      }
    }

    // SNIPER MODE: slide the whole view over the shoulder and pull the look
    // toward the crosshair. Applied to the WANT, so the damps below smooth the
    // slide exactly as they smooth every other camera move — raising the scope
    // is a camera move, not a cut.
    this.applyScope(scoped, wantPos, _center);

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
    const fov = this.scopeFov(scoped, this.baseFov);
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }

    // solo chase cam rides low — ghost buildings that hide the PLAYER's own
    // mech (enemies may still use cover; the camera never physically
    // reacts to buildings, it only fades the ones hiding your character)
    // A SURFACE WALKER'S BUILDING IS NEVER GHOSTED (see the note on the chase
    // cams below): the thing he is standing on must stay solid.
    if (solo && !humans[0]?.climb) {
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
      if (ch.baseFov === undefined) ch.baseFov = cam.fov;
      cam.aspect = (window.innerWidth * vp.w) / (window.innerHeight * vp.h);
      cam.fov = this.scopeFov(f, ch.baseFov);   // sniper mode (see applyScope)
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
      if (lockT && !stickActive && !f.climb) {
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
      const scopeDist = f.sniperK ? lerp(1, TUNING.aim.zoomDist, f.sniperK) : 1;
      ch.dist = this.giantZoomDamp(ch.dist, baseDist * this.zoomMul * scopeDist, gf, 12, dt);
      const el = ch.el;
      _v.set(
        Math.sin(ch.az) * Math.cos(el), Math.sin(el), Math.cos(ch.az) * Math.cos(el)
      ).multiplyScalar(ch.dist);
      const fp = f.focusPos(_fpA);
      const wantPos = _v.add(fp).add(_lift.set(0, 2 * gf, 0));
      // THE CLIMB CAMERA (see CLIMB_CAM above): while this player is on a
      // surface, a persistent rate-limited orbit takes over — out along his
      // up, above, trailing his travel — and ch.az stays synced under it so
      // stepping off the wall hands back to the view he is already in.
      let ck = 0;
      if (f.def?.climb) {
        const cst = ch.cc || (ch.cc = {});
        ck = climbCam(cst, f, dt, ch.dist, ch.pos, ch.lookX, pitchY(ch.lookY));
        if (ck > 0) {
          wantPos.lerp(_ccPos, ck);
          if (ck > 0.5) ch.az = Math.atan2(cst.dir.x, cst.dir.z);
        }
      }
      // the chase cam tracks ONLY its own mech — opponents never pull the
      // frame; use the right stick to look around
      const lookAhead = _center.copy(fp);
      // aim at the mech's upper body/head; riding on its y also keeps the
      // target with a flying mech, and f.height carries the COLOSSAL-FORM
      // giant's inflated size automatically
      lookAhead.y += f.height * 0.75;
      if (ck > 0) lookAhead.lerp(_ccTgt, ck);
      // sniper mode: over the shoulder, look pulled toward the crosshair —
      // on the WANT, so the damps below smooth it into place
      this.applyScope(f, wantPos, lookAhead);

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
      // with THIS view's camera so the fade renders only in this viewport.
      // NOT while he is surface-walking: the building he is on stays solid,
      // and the orbit above has already moved the eye somewhere it can see him.
      // The hole is a NULL rather than a missing entry, because both consumers
      // index by VIEW: setOccluders reads `segments[v]` and applyViewFade finds
      // its own camera's slot. Both skip a null (a camera with no segment of
      // its own leaves every building solid, which is the ask) — and getting
      // that wrong is what crashed the fade pass in split screen.
      const seg = this._segs[i];
      if (f.climb) { segsUsed.push(null); continue; }
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
