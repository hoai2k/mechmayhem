// THE CROSSHAIR, MEASURED (combat/aim.js + the sniper camera).
//
// Drives one human's aim exactly as boot.js routes the right stick into it,
// steps the real world, and reports what a player would see:
//   · unled, the crosshair sits on the locked target's head (the old behaviour)
//   · pushed, it LEADS — reported as screen movement and as world angle, with
//     the camera following it so the lead stays in frame
//   · a shot fired while leading flies at the crosshair, not at the body
//   · sniper mode ramps smoothly in and out (worst single-frame step) and the
//     FOV/zoom actually change
//   · unlocked, the sniper ray lands ON something (ground or body)
//
// Runs it in BOTH view modes — the combined solo camera and a split viewport —
// because the scope and the lock orbit are implemented once but applied in two
// places, and a split viewport has its own camera, its own fov and its own
// framing.
//
// usage: node tools/crosshair.mjs [single|split|both] [waitMs]
import { launch } from './lib/browser.mjs';

const [which = 'both', waitMs = '30000'] = process.argv.slice(2);
const modes = which === 'both' ? ['single', 'split'] : [which];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });

for (const mode of modes) {
const url = 'http://localhost:5173/?battle=neon&p1=titanus&p2=viper'
  + (mode === 'split' ? '&forcesplit=1' : '');
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, cam = window.__cam, F = window.__fighters;
  const THREE = window.__THREE;
  const [p, t] = F;
  const dt = 1 / 60;
  // in the split view BOTH fighters are humans (the harness's &forcesplit=1),
  // and the aim under test is player 1's own viewport
  const humans = window.__cam.mode === 'split' ? F.slice(0, 2) : [p];
  // a still fight: park the target in front of the player and take the AI off
  const place = () => {
    p.pos.set(0, 0, 0); p.yaw = 0; p.vel.set(0, 0, 0);
    t.pos.set(0, 0, 26); t.yaw = Math.PI; t.vel.set(0, 0, 0);
    t.controlsLocked = true;
    window.__ais.length = 0;
    // a still target: the AI's last intent would otherwise keep walking him,
    // and a crosshair correctly TRACKING a moving mech reads here as error
    for (const f of [p, t]) { f.intent.moveX = f.intent.moveZ = 0; f.intent.lightHeld = false; }
  };
  const step = (n, fn) => {
    for (let i = 0; i < n; i++) { fn?.(i); w.update(dt); cam.update(dt, F, humans); }
  };
  // where the crosshair is ON SCREEN, in NDC (x: -1 left .. +1 right)
  const ndc = () => {
    const v = new THREE.Vector3().copy(p._lockAim).project(cam.cameraFor(0));
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3) };
  };
  const headDist = () => {
    const h = new THREE.Vector3(t.pos.x, t.pos.y + t.height * 0.88, t.pos.z);
    return +h.distanceTo(p._lockAim).toFixed(2);
  };
  const aimIn = (x, y) => { p.aimIn = p.aimIn || { x: 0, y: 0 }; p.aimIn.x = x; p.aimIn.y = y; };
  const R = {};

  // ---- 1. LOCKED, stick untouched: the old servo, unchanged ----
  place();
  p.intent.lockOn = true; p.intent.sniper = false;
  aimIn(0, 0);
  step(90);
  R.restOnHead = headDist();
  R.restNdc = ndc();

  // ---- 2. LOCKED + stick right: the crosshair leads, the camera follows ----
  const before = ndc();
  step(40, () => aimIn(1, 0));
  const led = ndc();
  R.leadNdcDx = +(led.x - before.x).toFixed(3);
  R.leadAngleDeg = +(Math.atan2(
    w.wrapDelta(p._lockAim.x - p.pos.x), w.wrapDelta(p._lockAim.z - p.pos.z)
  ) * 180 / Math.PI - Math.atan2(
    w.wrapDelta(t.pos.x - p.pos.x), w.wrapDelta(t.pos.z - p.pos.z)
  ) * 180 / Math.PI).toFixed(1);
  R.leadOnScreen = Math.abs(led.x) < 0.9 && Math.abs(led.y) < 0.9;
  R.facesAimDeg = +(((p.targetYaw - p.aimYaw) * 180 / Math.PI + 540) % 360 - 180).toFixed(1);

  // ---- 3. the SHOT goes where the crosshair is ----
  const aimP = p._lockAim.clone();
  w.projectiles.active.length = 0;
  p.rangedCd = 0; p.ammo = 99;
  p.doRanged();
  step(30, () => aimIn(1, 0));      // keep leading while the clip fires
  const shot = w.projectiles.active[0];
  if (shot) {
    const want = aimP.clone().sub(shot.mesh.position).normalize();
    const got = shot.vel.clone().normalize();
    R.shotErrDeg = +(Math.acos(Math.max(-1, Math.min(1, want.dot(got)))) * 180 / Math.PI).toFixed(1);
    const toBody = t.center().sub(shot.mesh.position).normalize();
    R.shotVsBodyDeg = +(Math.acos(Math.max(-1, Math.min(1, toBody.dot(got)))) * 180 / Math.PI).toFixed(1);
  } else R.shotErrDeg = 'no projectile';

  // ---- 4. the aim re-settles onto the target once the stick is let go ----
  step(120, () => aimIn(0, 0));
  R.settledOnHead = headDist();

  // ---- 4b. UP/DOWN IS THE CAMERA'S WHILE TARGETING ----
  // (boot.js routes it, so drive the fighter the way boot does: aim gets X
  // only, the camera gets Y)
  place();
  p.intent.lockOn = true; p.intent.sniper = false;
  const camElBefore = cam.lookElOffset ?? 0;
  const pitchBefore = p.aimPitch;
  step(40, () => { aimIn(0, 0); cam.applyStick(0, -1, dt, false); });
  R.targetingPitch = {
    cameraMoved: Math.abs((cam.lookElOffset ?? 0) - camElBefore) > 0.05,
    aimPitchHeld: Math.abs(p.aimPitch - pitchBefore) < 0.05,
    stillOnHead: headDist() < 1.2,
  };

  // ---- 4c. SNIPER: the stick pitches the AIM instead ----
  place();
  p.intent.lockOn = true; p.intent.sniper = true;
  step(40, () => aimIn(0, 0));
  const sniperPitch0 = p.aimPitch;
  step(30, () => aimIn(0, -1));
  R.sniperPitch = { aimPitchMoved: Math.abs(p.aimPitch - sniperPitch0) > 0.05 };

  // ---- 4d. SNIPER FRAMING: his own head, low in frame ----
  step(90, () => aimIn(0, 0));
  const headPt = new THREE.Vector3(p.pos.x, p.pos.y + p.height * 0.92, p.pos.z);
  const hv = headPt.clone().project(cam.cameraFor(0));
  R.scopeFraming = {
    headNdcY: +hv.y.toFixed(2), headNdcX: +hv.x.toFixed(2),
    headOnScreen: Math.abs(hv.x) < 1 && hv.y > -1.15 && hv.y < 0,
    crosshairNdc: ndc(),
    eyeToHead: +cam.cameraFor(0).position.distanceTo(headPt).toFixed(1),
  };

  // ---- 4e. SNIPER: a shove switches targets, and a prop is only held while
  // the stick is over ----
  place();
  // put a second enemy off to one side, further away than the first
  const foe2 = F[1];
  R.switching = 'no second target';
  if (foe2) {
    const first = p.aimTarget;
    step(20, () => aimIn(0, 0));
    step(12, () => aimIn(1, 0));
    R.switching = { switchedAway: p.aimTarget !== first, target: p.aimTarget?.prop ? 'prop' : (p.aimTarget?.def?.id || null),
      props: (w.arena?.propBodies || []).filter((q) => q.alive).length,
      inArc: (w.arena?.propBodies || []).filter((q) => {
        if (!q.alive) return false;
        const dx = q.x - p.pos.x, dz = q.z - p.pos.z;
        if (Math.hypot(dx, dz) > 110) return false;
        let d = (Math.atan2(dx, dz) - p.aimYaw) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        return Math.abs(d) < 1.15;
      }).length };
    // …and letting go of a prop hands the aim back to a robot
    step(90, () => aimIn(0, 0));
    R.afterRelease = p.aimTarget?.prop ? 'still a prop' : (p.aimTarget?.def?.id || 'none');
  }
  p.intent.sniper = false;
  step(30, () => aimIn(0, 0));

  // ---- 4f. THE LEFT STICK MOVES THE ROBOT, NOT THE AIM ----
  place();
  p.intent.lockOn = true; p.intent.sniper = false;
  step(40, () => aimIn(0, 0));
  const beforeMove = { onHead: headDist(), target: p.aimTarget };
  step(90, (i) => {
    aimIn(0, 0);
    p.intent.moveX = Math.sin(i / 15); p.intent.moveZ = 1;   // running about
  });
  R.leftStick = {
    movedRobot: +Math.hypot(p.pos.x, p.pos.z).toFixed(1) > 2,
    stillOnHead: headDist() < 1.5,
    sameTarget: p.aimTarget === beforeMove.target,
  };
  p.intent.moveX = p.intent.moveZ = 0;

  // ---- 5. SNIPER MODE: smooth in, smooth out ----
  place();
  p.intent.lockOn = true;
  const ks = [], fovs = [];
  step(60, () => { p.intent.sniper = true; aimIn(0, 0); ks.push(p.sniperK); fovs.push(cam.cameraFor(0).fov); });
  R.zoomIn = { k: +p.sniperK.toFixed(3), fov: +cam.cameraFor(0).fov.toFixed(1), base: cam.baseFov };
  const stepsIn = ks.map((v, i) => (i ? v - ks[i - 1] : v));
  R.worstZoomStep = +Math.max(...stepsIn).toFixed(4);
  R.zoomedNdc = ndc();               // the crosshair must stay in frame, zoomed
  step(90, () => { p.intent.sniper = false; aimIn(0, 0); ks.push(p.sniperK); });
  R.zoomOut = +p.sniperK.toFixed(4);
  R.fovBack = +cam.cameraFor(0).fov.toFixed(1);

  // ---- 6. SNIPER with NOTHING locked: the ray lands on the world ----
  place();
  p.intent.lockOn = false; p.lockTarget = null; p.intent.sniper = true;
  p.intent.aimYaw = 0;                 // camera heading = down +z, at the target
  step(60, () => { p.intent.aimYaw = 0; aimIn(0, 0); });
  R.unlockedAim = p._lockAim ? {
    onBody: +p._lockAim.distanceTo(t.center()).toFixed(2),
    y: +p._lockAim.y.toFixed(2),
  } : 'none';
  // ...and pitched down at the floor, it lands ON the floor
  step(60, () => { p.intent.aimYaw = Math.PI; aimIn(0, 1); });   // away from him, aiming down
  R.groundAim = { y: +p._lockAim.y.toFixed(2), pitchDeg: +(p.aimPitch * 180 / Math.PI).toFixed(1) };
  p.intent.sniper = false;
  step(30, () => aimIn(0, 0));
  R.crosshairGone = p._lockAim === null && p.aiming === false;
  R.viewMode = cam.mode;
  return R;
});
console.log(`---- ${mode} (${out.viewMode}) ----`);
console.log(JSON.stringify(out, null, 2));
}
await browser.close();
