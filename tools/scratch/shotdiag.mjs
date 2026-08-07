// Where does a mech's ranged shot actually GO, and does his body sit on the
// floor while he walks? Two diagnostics, one harness.
//
// usage: node tools/scratch/shotdiag.mjs <mech> [target] [waitMs]
import { chromium } from 'playwright-core';

const [mech = 'nullbot', foe = 'titanus', waitMs = '30000'] = process.argv.slice(2);
const url = `http://localhost:5173/?battle=neon&p1=${mech}&p2=${foe}`;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, F = window.__fighters, THREE = window.__THREE;
  const [p, t] = F;
  const dt = 1 / 60;
  window.__ais.length = 0;
  t.controlsLocked = true;
  const deg = (r) => +(r * 180 / Math.PI).toFixed(1);
  const wrapAng = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const place = () => {
    p.pos.set(0, 0, 0); p.yaw = p.targetYaw = 0; p.vel.set(0, 0, 0);
    t.pos.set(0, 0, 22); t.yaw = Math.PI; t.vel.set(0, 0, 0);
    for (const f of [p, t]) { f.intent.moveX = f.intent.moveZ = 0; f.intent.lockOn = false; f.intent.sniper = false; }
  };
  const step = (n, fn) => { for (let i = 0; i < n; i++) { fn?.(i); w.update(dt); } };

  // ---- 1. SHOT DIRECTION, five shots ----
  const shots = [];
  place(); step(30);
  for (let s = 0; s < 5 && shots.length < 5; s++) {
    place();
    w.projectiles.active.length = 0;
    p.rangedCd = 0; p.ammo = 99; p._lockAim = null;
    p.doRanged();
    for (let i = 0; i < 90 && !w.projectiles.active.length; i++) { w.update(dt); }
    const pr = w.projectiles.active[0];
    if (!pr) { shots.push({ none: true }); continue; }
    const v = pr.vel.clone().normalize();
    const toT = t.center().sub(pr.mesh.position); toT.y = 0;
    shots.push({
      // yaw of the shot against the MECH'S FACING (what "flies off to the side"
      // measures) and against the direction to the enemy
      offFacingDeg: deg(wrapAng(Math.atan2(v.x, v.z) - p.yaw)),
      offTargetDeg: deg(wrapAng(Math.atan2(v.x, v.z) - Math.atan2(toT.x, toT.z))),
      pitchDeg: deg(Math.asin(Math.max(-1, Math.min(1, v.y)))),
      side: p._shotSide ?? null,
    });
    step(20);
  }

  // ---- 1a. THE SAME SHOT, FIRED ON THE MOVE ----
  // the report is "it flies off to the side", and a hand-mounted barrel rides
  // the arm — so what matters is where the arm is when the fire event lands
  const moving = [];
  for (const [label, drive] of [
    ['walking forward', () => { p.intent.moveZ = 1; }],
    ['strafing right (locked)', () => { p.intent.moveX = 1; p.intent.lockOn = true; }],
    ['walking backward', () => { p.intent.moveZ = -1; p.intent.lockOn = true; }],
    ['strafing right (no lock)', () => { p.intent.moveX = 1; p.intent.strafe = true; }],
  ]) {
    place();
    step(45, drive);            // get the gait going
    w.projectiles.active.length = 0;
    p.rangedCd = 0; p.ammo = 99;
    p.doRanged();
    for (let i = 0; i < 120 && !w.projectiles.active.length; i++) { drive(); w.update(dt); }
    const pr = w.projectiles.active[0];
    if (!pr) { moving.push({ label, none: true }); continue; }
    const v = pr.vel.clone().normalize();
    // …and where the BARREL was pointing when it left (the gun-aim servo's job)
    const a = p.mech.anchors[p.def.primaryMuzzle || 'muzzleR'] || p.mech.anchors.muzzleR;
    const q = a ? a.getWorldQuaternion(new THREE.Quaternion()) : null;
    const bf = q ? new THREE.Vector3(0, 0, 1).applyQuaternion(q) : null;
    moving.push({
      label,
      offFacingDeg: deg(wrapAng(Math.atan2(v.x, v.z) - p.yaw)),
      pitchDeg: deg(Math.asin(Math.max(-1, Math.min(1, v.y)))),
      barrelOffShotDeg: bf ? deg(Math.acos(Math.max(-1, Math.min(1, bf.dot(v))))) : null,
      aimErrDeg: deg(p._gunAimErr || 0),
    });
  }

  // ---- 1b. THE BARREL ITSELF, over a walk and over the shoot clip ----
  // A hand-mounted muzzle rides the ARM: whatever the animation does to the
  // hand, the barrel does to the shot (world.js barrelDeflect rotates the
  // finished aim from the mech's flat facing onto the anchor's own +Z).
  const barrelOff = (name) => {
    const a = p.mech.anchors[name];
    if (!a) return null;
    const q = a.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return {
      yaw: deg(wrapAng(Math.atan2(fwd.x, fwd.z) - p.yaw)),
      pitch: deg(Math.asin(Math.max(-1, Math.min(1, fwd.y)))),
    };
  };
  const sweep = (label, drive, n) => {
    const ys = [], ps = [];
    step(n, (i) => { drive(i); const b = barrelOff(p.def.primaryMuzzle || 'muzzleR') || barrelOff('muzzleR'); if (b) { ys.push(b.yaw); ps.push(b.pitch); } });
    return { label, yaw: [Math.min(...ys), Math.max(...ys)], pitch: [Math.min(...ps), Math.max(...ps)] };
  };
  place();
  const barrel = [];
  barrel.push(sweep('standing', () => {}, 60));
  place();
  barrel.push(sweep('walking', () => { p.intent.moveZ = 1; }, 120));
  place();
  barrel.push(sweep('strafing', () => { p.intent.moveX = 1; p.intent.lockOn = true; }, 120));
  place();
  p.rangedCd = 0; p.ammo = 99; p.doRanged();
  barrel.push(sweep('through the shoot clip', () => {}, 60));

  // ---- 2. DOES HE STAND ON THE FLOOR WHILE WALKING ----
  place();
  const lift = [], low = [];
  step(200, (i) => {
    p.intent.moveX = Math.sin(i / 40) * 0.8; p.intent.moveZ = 1;
    if (i > 40) {
      const c = p.mech.visual ? p.mech.visual.position.y : 0;
      lift.push(c);
      const l = p.mech.lowestRenderedY?.();
      if (typeof l === 'number') low.push(l + p.pos.y);
    }
  });
  const stat = (a) => a.length ? {
    min: +Math.min(...a).toFixed(3), max: +Math.max(...a).toFixed(3),
    mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3),
  } : null;
  return {
    mech: p.def.id, shots, moving, barrel,
    walkLift: stat(lift),          // the render container's own Y (floor guard)
    walkLowestY: stat(low),        // lowest rendered vertex, world Y
    height: +p.height.toFixed(2), guard: !!p.def.floorGuard,
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
