// RB AUTO-AIM (combat/autoaim.js), measured on the real weapons. For each mech
// the enemy stands OFF the shooter's facing and the real World.fireRanged is
// called; every round it spawns (bursts and barrages included — the world is
// stepped until they are all out) is read back as a flight BEARING and
// compared with the bearing to the target. Three cases:
//   in cone  — enemy 35° off the facing, 22 units: the rounds must go AT it
//   off cone — enemy 110° off: nothing to auto-aim, rounds fly along the facing
//   CPU      — same 35° placement fired by a CPU: its aim is its own (facing)
//
// usage: node tools/scratch/autoaim.mjs [mech …]
import { launch } from '../lib/browser.mjs';
const all = ['fenrir', 'viper', 'rhino', 'nullbot', 'frogger', 'titanus', 'saurion', 'glacier', 'jerry', 'colossus', 'konga', 'vulcan', 'wraith'];
// The two CONTROL cases prove auto-aim did not fire, which only works where
// the handler has no aim of its own. Two do, and always did:
//   goo  — jerry's handler steers the burst at any enemy within ~60° by itself,
//          CPU or not, and fired without its clip the idle pod rests splayed
//   bats — wraith's swarm HOMES on whoever is ahead of it
const OWN_AIM = new Set(['goo', 'bats']);
const mechs = process.argv.length > 2 ? process.argv.slice(2) : all;
const b = await launch();
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
let bad = 0;
console.log('mech      type     in-cone err°   off-cone vs facing°   CPU vs facing°   rounds');
for (const id of mechs) {
  await p.goto(`http://localhost:5173/?battle=neon&p1=${id}&p2=titanus&music=0&postfx=0`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__fighters?.length >= 2 && window.__world, null, { timeout: 180000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const w = window.__world, [f, t] = window.__fighters;
    for (const ai of window.__ais || []) ai.update = () => {};
    const place = (o, x, z, yaw) => {
      o.pos.set(x, 0, z); o.vel?.set(0, 0, 0);
      o.yaw = o.targetYaw = o.torsoYaw = yaw; o.group.rotation.y = yaw;
      o.controlsLocked = true; o.group.updateMatrixWorld(true);
    };
    const deg = (a) => a * 180 / Math.PI;
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const mv = f.def.moves.ranged;
    // every round's LAUNCH direction, recorded as it is spawned — reading the
    // live list afterwards misses exactly the rounds that HIT (a hit removes
    // the round), and a returning fist reads its flight home
    const launched = [];
    const spawn0 = w.projectiles.spawn.bind(w.projectiles);
    w.projectiles.spawn = (type, owner, origin, dir, spec) => {
      // a LOB carries its aim as a landing point, not a launch vector
      if (owner === f) {
        const d = spec?.arcTo ? { x: spec.arcTo.x - origin.x, z: spec.arcTo.z - origin.z } : { x: dir.x, z: dir.z };
        launched.push({ x: d.x, z: d.z, ox: origin.x, oz: origin.z });
      }
      return spawn0(type, owner, origin, dir, spec);
    };
    const shot = async (bearingDeg, asAI) => {
      launched.length = 0;
      place(f, 0, 0, 0);
      const br = bearingDeg * Math.PI / 180;
      place(t, Math.sin(br) * 22, Math.cos(br) * 22, Math.PI);
      f.isAI = asAI; f._aimPoint = null; f._lockAim = null; f.ammo = 99;
      f._shotSide = false; f._altSide = false;
      w.fireRanged(f, mv);
      // bursts / barrages leave over time: step the world a little
      for (let i = 0; i < 90; i++) { place(t, Math.sin(br) * 22, Math.cos(br) * 22, Math.PI); w.update(1 / 60); }
      f.isAI = false;
      const got = launched.slice();
      if (!got.length) return null;
      // mean horizontal launch bearing of the rounds, vs the target's
      // …each measured against the bearing FROM ITS OWN MUZZLE to the target,
      // since a barrel a unit off the centreline must aim a little inward
      let sx = 0, sz = 0, err = 0;
      const tx = Math.sin(br) * 22, tz = Math.cos(br) * 22;
      for (const v of got) {
        const n = Math.hypot(v.x, v.z) || 1; sx += v.x / n; sz += v.z / n;
        err += wrapA(Math.atan2(v.x, v.z) - Math.atan2(tx - v.ox, tz - v.oz));
      }
      const fly = Math.atan2(sx, sz);
      return { fly: deg(fly), toTarget: deg(err / got.length), n: got.length };
    };
    const inCone = await shot(35, false);
    const offCone = await shot(110, false);
    const cpu = await shot(35, true);
    return { type: mv.type, inCone, offCone, cpu };
  });
  const fmt = (x) => (x == null ? '  —  ' : x.toFixed(1).padStart(6));
  const inErr = r.inCone ? Math.abs(r.inCone.toTarget) : null;
  const offF = r.offCone ? Math.abs(r.offCone.fly) : null;
  const cpuF = r.cpu ? Math.abs(r.cpu.fly) : null;
  // a fan (spikes/shard) spreads, so its MEAN bearing is what is judged
  const ctlOk = OWN_AIM.has(r.type) || ((offF == null || offF < 8) && (cpuF == null || cpuF < 8));
  const ok = inErr != null && inErr < 6 && ctlOk;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(9)} ${r.type.padEnd(8)} ${fmt(inErr)}           ${fmt(offF)}              ${fmt(cpuF)}        ${r.inCone?.n ?? 0}`);
}
console.log('page errors:', errs.length ? errs.slice(0, 4) : 'none');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
