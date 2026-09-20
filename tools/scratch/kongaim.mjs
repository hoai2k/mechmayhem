// "IN TARGET MODE MY BULLETS SOMETIMES WENT TOTALLY TO THE SIDE" — konga.
//
//   node tools/scratch/kongaim.mjs [http://localhost:5173] [mech] [arena]
//
// Konga's Shoulder Salvo leaves down the POD BARRELS (world.js `salvo` ->
// `dirFrom` -> `barrelDeflect`), not down the aim, so what this measures is
// the angle between each rocket's launch direction and the straight line from
// the muzzle it left to the locked target's centre. A few degrees is the
// authored splay and the per-round scatter; tens of degrees is the bug.
//
// Target lock is a PAD button (LB) with no keyboard binding, so `lockOn` is
// pinned on the intent with a no-op setter — input.js rewrites the intent
// every frame and would clear a plain assignment.
import { launch } from '../lib/browser.mjs';

const BASE = process.argv[2] || 'http://localhost:5173';
const MECH = process.argv[3] || 'konga';
const ARENA = process.argv[4] || 'uptown';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 200)));
await page.goto(`${BASE}/?battle=${ARENA}&p1=${MECH}&p2=titanus&diff=rookie`,
  { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__fighters?.length && window.__world, null, { timeout: 180000 });

await page.evaluate(() => {
  const e = window.__engine;
  e.paused = true;
  window.__sim = (n) => { for (let i = 0; i < n; i++) {
    let dt = (1 / 60) * e.timeScale;
    if (e.hitStop > 0) { e.hitStop -= 1 / 60; dt *= 0.05; }
    e.elapsed += dt; e.onUpdate(dt);
  } };
  const [f, g] = window.__fighters;
  f.controlsLocked = false;
  g.controlsLocked = true;                // the victim stands still to be shot at
  // hold TARGET LOCK forever
  Object.defineProperty(f.intent, 'lockOn', {
    get: () => true, set: () => {}, configurable: true,
  });
  // record every rocket as it is born, with the angle off the true line
  const w = window.__world;
  window.__shots = [];
  const spawn = w.projectiles.spawn.bind(w.projectiles);
  w.projectiles.spawn = (kind, owner, p, d, opts) => {
    if (owner === f) {
      const t = window.__fighters[1].center();
      const to = { x: t.x - p.x, y: t.y - p.y, z: t.z - p.z };
      const ln = Math.hypot(to.x, to.y, to.z) || 1;
      const dot = (to.x / ln) * d.x + (to.y / ln) * d.y + (to.z / ln) * d.z;
      const deg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      // the same angle in the HORIZONTAL plane — "off to the side" is a yaw
      // complaint, and a lobbed arc is legitimately off in pitch
      const yawT = Math.atan2(to.x, to.z), yawD = Math.atan2(d.x, d.z);
      let dy = (yawD - yawT + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      window.__shots.push({ deg: +deg.toFixed(1), yaw: +(dy * 180 / Math.PI).toFixed(1),
        err: +(f._gunAimErr ?? -1).toFixed(3),
        // which pod it left: the muzzle's offset across konga's own facing
        side: ((p.x - f.pos.x) * Math.cos(f.yaw) - (p.z - f.pos.z) * Math.sin(f.yaw)) > 0 ? 'R' : 'L' });
    }
    return spawn(kind, owner, p, d, opts);
  };
});
const sim = (n) => page.evaluate((n) => window.__sim(n), n);
await sim(260);

// Fire from a spread of ranges and relative bearings. The bearing is the
// victim's position around konga, so the salvo is thrown while his body is
// mid-turn onto the lock — which is where an animated pod points somewhere
// its owner does not.
const rows = [];
for (const dist of [8, 14, 22, 30]) {
  for (const bearingDeg of [0, 45, 90, 135, 180, -90]) {
    const r = await page.evaluate(async ({ dist, bearingDeg, }) => {
      const [f, g] = window.__fighters;
      const a = bearingDeg * Math.PI / 180;
      f.setState('normal'); f.pos.set(0, 0, 0); f.vel.set(0, 0, 0); f.yaw = 0;
      g.setState('normal'); g.vel.set(0, 0, 0);
      g.pos.set(Math.sin(a) * dist, 0, Math.cos(a) * dist);
      f.rangedCd = 0; f.ammo = f.ammoMax ?? 99;
      // LET THE LOCK SETTLE FIRST. Firing six frames after the victim is
      // moved measures a body still turning onto him, which is a different
      // (and legitimate) error — what is wanted here is the steady state.
      for (let i = 0; i < 150; i++) window.__sim(1);
      f.rangedCd = 0; f.ammo = f.ammoMax ?? 99;
      window.__shots.length = 0;
      f.doRanged();
      // a CHANNEL weapon (cranky's hose, vulcan's gatlings) pours while the
      // trigger is held; doRanged only opens it, so hold it open here
      for (let i = 0; i < 150; i++) {
        if (f.state === 'channel') { f.stateT = 0.2; f.firing = true; }
        window.__sim(1);
      }
      const s = window.__shots;
      const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0);
      const R = s.filter((x) => x.side === 'R').map((x) => x.yaw);
      const L = s.filter((x) => x.side === 'L').map((x) => x.yaw);
      return {
        n: s.length,
        worst: s.length ? Math.max(...s.map((x) => Math.abs(x.yaw))) : 0,
        med: s.length ? s.map((x) => Math.abs(x.yaw)).sort((p, q) => p - q)[s.length >> 1] : 0,
        R: mean(R), L: mean(L),
        err: s.length ? s[0].err : -1,
      };
    }, { dist, bearingDeg });
    rows.push([`d=${String(dist).padStart(2)} bearing=${String(bearingDeg).padStart(4)}`, r]);
  }
}

console.log(`\n=== ${MECH} on ${ARENA}: ranged shots under target lock — yaw off the true line`);
let worst = 0;
for (const [label, r] of rows) {
  worst = Math.max(worst, r.worst);
  const flag = r.worst > 20 ? '   <<< WIDE' : '';
  console.log(`  ${label}  n=${String(r.n).padStart(2)} median=${String(r.med).padStart(5)}°  worst=${String(r.worst).padStart(6)}°  podR=${String(r.R).padStart(6)}° podL=${String(r.L).padStart(6)}°  err=${r.err}${flag}`);
}
console.log(`\n  worst across every shot: ${worst.toFixed(1)}°`);
await browser.close();
