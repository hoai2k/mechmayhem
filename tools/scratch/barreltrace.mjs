// Does the gun-aim servo actually get the barrel onto the aim? Per-frame angle
// between the firing muzzle's +Z and the direction it should be shooting, for
// the whole firing window, while STRAFING (the case that broke).
//
// usage: node tools/scratch/barreltrace.mjs <mech> [waitMs]
import { launch } from '../lib/browser.mjs';

const [mech = 'nullbot', waitMs = '30000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=titanus`, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, F = window.__fighters, THREE = window.__THREE;
  const { firingMuzzle } = await import('/src/combat/gunaim.js');
  const [p, t] = F;
  const dt = 1 / 60;
  window.__ais.length = 0; t.controlsLocked = true;
  const deg = (r) => +(r * 180 / Math.PI).toFixed(1);
  const rows = [];
  const run = (label, drive, locked) => {
    p.pos.set(0, 0, 0); p.yaw = p.targetYaw = 0; p.vel.set(0, 0, 0);
    t.pos.set(0, 0, 22); t.vel.set(0, 0, 0);
    for (const f of [p, t]) { f.intent.moveX = f.intent.moveZ = 0; f.intent.lockOn = false; }
    for (let i = 0; i < 45; i++) { drive(); w.update(dt); }
    w.projectiles.active.length = 0;
    p.rangedCd = 0; p.ammo = 99;
    p.doRanged();
    const trace = [];
    let shotAt = -1;
    for (let i = 0; i < 50; i++) {
      drive();
      w.update(dt);
      const m = firingMuzzle(p);
      if (!m) continue;
      const q = m.anchor.getWorldQuaternion(new THREE.Quaternion());
      const bar = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
      const mp = m.anchor.getWorldPosition(new THREE.Vector3());
      const want = (p._lockAim ? p._lockAim.clone() : mp.clone().add(
        new THREE.Vector3(Math.sin(p.yaw), 0.02, Math.cos(p.yaw)).multiplyScalar(30))).sub(mp).normalize();
      trace.push(deg(Math.acos(Math.max(-1, Math.min(1, bar.dot(want))))));
      if (shotAt < 0 && w.projectiles.active.length) shotAt = i;
    }
    rows.push({ label, locked, shotFrame: shotAt, barrelOffAim: trace.filter((_, i) => i % 5 === 0), atShot: trace[shotAt] ?? null });
  };
  run('strafing, locked', () => { p.intent.moveX = 1; p.intent.lockOn = true; }, true);
  run('strafing, free', () => { p.intent.moveX = 1; p.intent.strafe = true; }, false);
  run('standing, free', () => {}, false);
  return { mech: p.def.id, rows };
});
console.log(out.mech);
for (const r of out.rows) {
  console.log(` ${r.label.padEnd(18)} shot on frame ${String(r.shotFrame).padStart(2)} · barrel off aim at the shot: `
    + `${r.atShot}°`);
  console.log(`   every 5th frame: ${r.barrelOffAim.join(', ')}`);
}
await browser.close();
