// TRAVERSING-CANNON PROBE — does TRITONE's ranged attack actually aim?
//
//   node tools/cannonprobe.mjs [battle url]
//
// The claim in combat/cannonaim.js is four-part, and each part is a number:
//
//   miss°   how far each barrel's LIVE axis sits off the line from its own
//           muzzle to the lead point when the volley leaves. Small for a gun
//           with a legal solution; large — and DELIBERATELY so — for the gun
//           whose target is inboard across the hull, which is the whole
//           two-different-angles design.
//   in°     the angle between the barrel and its own INWARD axis. The rule is
//           that this may never drop below 80°: a cannon that has gone below
//           it is firing through Tritone.
//   elev°   where the blocked gun put the leftover angle. Up-and-over means
//           the shot that could not go across the body goes over it.
//   t       seconds from trigger to volley. Bounded above by the move's
//           `aimWindup` (it always fires) and expected to come in UNDER it
//           whenever the solution is reachable.
//   step°   the worst single-frame traverse. A servo with a rate cap cannot
//           exceed it; a snap would show up here as tens of degrees.
//
// The enemy is parked at a bearing (dead ahead, out to each side, behind) and
// the sim is stepped through world.update with the AI off, so every run is
// repeatable.
import { launch } from './lib/browser.mjs';

const url = process.argv[2] ||
  'http://localhost:5173/?battle=neon&p1=tritone&p2=viper&auto=1';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

const out = await page.evaluate(async () => {
  const w = window.__world;
  window.__ais.length = 0;
  w.engine.paused = true;
  const f = window.__fighters[0];
  const e = window.__fighters[1];
  f.isAI = false;
  e.isAI = false;
  e.controlsLocked = true;
  // the AI is off but its LAST intent is still on the fighter, and movement
  // would quietly steer him out of the bearing under test — so the stick is
  // held at zero for every stepped frame.
  let park = null;
  const zero = () => {
    for (const g of [f, e]) {
      const I = g.intent;
      I.moveX = 0; I.moveZ = 0; I.lockOn = false; I.chargeDash = false;
      I.ranged = false; I.rangedHeld = false; I.special = false; I.specialHeld = false;
    }
    // The target is a POST, not an opponent: held exactly where the scenario
    // put it, every frame. Left to walk, it is a moving target and the guns
    // correctly lead it — which is a different measurement from this one.
    if (park) { e.pos.set(park.x, park.y, park.z); e.vel.set(0, 0, 0); }
  };

  // read a barrel's live world axis + the geometry the rule is stated in.
  // The anchor's +Z IS the barrel (world.js barrelDeflect / the siege
  // handler), and its world matrix carries both that axis and the muzzle
  // position — so read them straight off it rather than importing THREE.
  const readSide = (shot, side, aimAt) => {
    if (!shot) return null;
    const dl = Math.hypot(shot.dir.x, shot.dir.y, shot.dir.z) || 1;
    const d = { x: shot.dir.x / dl, y: shot.dir.y / dl, z: shot.dir.z / dl };
    const p = shot.from;
    // the line the shot SHOULD take, from this muzzle to the lead point
    const wx = w.wrapDelta(aimAt.x - p.x), wz = w.wrapDelta(aimAt.z - p.z), wy = aimAt.y - p.y;
    const wl = Math.hypot(wx, wy, wz) || 1;
    const miss = Math.acos(Math.max(-1, Math.min(1, d.x * wx / wl + d.y * wy / wl + d.z * wz / wl)));
    // THE INBOARD RULE IS STATED IN THE BODY'S FRAME, so measure it there:
    // take the shot back into the TORSO bone's own axes (the cannons' parent,
    // which is what "through the hull" is relative to) and compare it with
    // this gun's lateral offset. A world-frame version of this reads a few
    // degrees off whenever the brace clip pitches him.
    const torso = f.mech.rigBones?.torso || f.mech.joints?.torso;
    torso.updateWorldMatrix(true, false);
    const tm = torso.matrixWorld.elements;
    const col = (i) => {
      const l = Math.hypot(tm[i], tm[i + 1], tm[i + 2]) || 1;
      return [tm[i] / l, tm[i + 1] / l, tm[i + 2] / l];
    };
    const [ax, ay, az] = [col(0), col(4), col(8)];
    const local = {
      x: d.x * ax[0] + d.y * ax[1] + d.z * ax[2],
      y: d.x * ay[0] + d.y * ay[1] + d.z * ay[2],
      z: d.x * az[0] + d.y * az[1] + d.z * az[2],
    };
    // inward = across the hull, i.e. against this gun's own offset from the
    // spine (read off the bone, so nothing here assumes a model orientation)
    const cb = f.mech.rigBones?.['cannon' + side] || f.mech.joints?.['cannon' + side];
    const sgn = Math.sign(cb.position.z) || (side === 'L' ? 1 : -1);
    const inAng = Math.acos(Math.max(-1, Math.min(1, -local.z * sgn)));
    return {
      miss: miss * 180 / Math.PI,
      in: inAng * 180 / Math.PI,
      elev: Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI,
      dir: d,
    };
  };

  // The shot itself is what matters, and it leaves BEFORE the recoil kick —
  // so capture the direction each blast is actually spawned with rather than
  // reading the barrel back afterwards (which is 10° of buck out of date).
  const shots = [];
  const spawn = w.projectiles.spawn.bind(w.projectiles);
  w.projectiles.spawn = (kind, owner, from, dir, opts) => {
    if (owner === f) shots.push({
      from: { x: from.x, y: from.y, z: from.z },
      dir: { x: dir.x, y: dir.y, z: dir.z },
    });
    return spawn(kind, owner, from, dir, opts);
  };

  // At yaw 0 he faces +z and his LEFT is -x (the game frame), so a target at
  // +x is out to his right.
  const scenarios = [
    ['ahead', 0], ['right', Math.PI / 2], ['left', -Math.PI / 2],
    ['behind', Math.PI], ['half-right', Math.PI / 4],
  ];
  const rows = [];
  for (const [name, bearing] of scenarios) {
    f.resetForRound(f.pos.clone().set(0, 0, 0), 0);
    f.pos.set(0, 0, 0); f.vel.set(0, 0, 0); f.yaw = f.targetYaw = 0;
    // NOTE: the mount is deliberately NOT re-measured between scenarios.
    // cannonaim measures the rest pose once, off a body at rest; forcing a
    // re-measure here would take it off barrels still swung from the last
    // shot and quietly invent a different rig for every row.
    f.rangedCd = 0; f._volley = null;
    const D = 30;
    park = { x: Math.sin(bearing) * D, y: 0, z: Math.cos(bearing) * D };
    e.pos.set(park.x, park.y, park.z);
    e.vel.set(0, 0, 0);
    // let the guns settle home first
    for (let i = 0; i < 30; i++) { zero(); w.update(1 / 60); }
    f.yaw = f.targetYaw = f.torsoYaw = 0; f.group.rotation.y = 0;
    f.rangedCd = 0;
    shots.length = 0;
    const mv = f.def.moves.ranged;
    f.doRanged();
    let t = 0, step = 0, fired = null;
    const prev = {};
    for (let i = 0; i < 200 && !fired; i++) {
      for (const s of ['L', 'R']) {
        const b = f.mech.rigBones?.['cannon' + s] || f.mech.joints?.['cannon' + s];
        prev[s] = b ? b.quaternion.clone() : null;
      }
      const had = !!f._volley;
      zero();
      w.update(1 / 60);
      t += 1 / 60;
      for (const s of ['L', 'R']) {
        const b = f.mech.rigBones?.['cannon' + s] || f.mech.joints?.['cannon' + s];
        if (b && prev[s]) step = Math.max(step, b.quaternion.angleTo(prev[s]) * 180 / Math.PI);
      }
      if (had && !f._volley) {
        const aim = { x: e.center().x, y: e.center().y, z: e.center().z };
        // the siege handler fires R first, then L
        fired = { t, R: readSide(shots[0], 'R', aim), L: readSide(shots[1], 'L', aim) };
      }
    }
    rows.push({ name, windup: mv.aimWindup, step, yaw: f.yaw * 180 / Math.PI, ...(fired || { t: null }) });
  }
  return { rows };
});

console.log('scenario   yaw°  t(s)  step°   | LEFT  miss°   in°  elev° | RIGHT miss°   in°  elev°');
for (const r of out.rows) {
  const c = (s) => s
    ? `${s.miss.toFixed(1).padStart(7)}${s.in.toFixed(1).padStart(6)}${s.elev.toFixed(1).padStart(7)}`
    : '      -     -      -';
  console.log(
    `${r.name.padEnd(9)}${r.yaw.toFixed(0).padStart(5)}${(r.t ?? NaN).toFixed(2).padStart(6)}${r.step.toFixed(1).padStart(7)}   |${c(r.L)} |${c(r.R)}`
  );
}
// The 80° rule binds the SOLUTION. What is measured here is the barrel, which
// is allowed to be within the servo's own firing tolerance of it (ON_TARGET,
// 2.9°) and is read in a torso the brace clip is pitching — so the bar is the
// rule minus that slack. A genuine violation is not marginal: an unclamped gun
// aimed across the hull reads in the single digits.
const bad = out.rows.filter((r) => (r.L && r.L.in < 76) || (r.R && r.R.in < 76));
console.log(bad.length ? `FAIL: ${bad.length} shot(s) fired through the body` : 'no barrel entered its inboard cone');
if (errors.length) console.log('page errors:', errors.slice(0, 3));
await browser.close();
