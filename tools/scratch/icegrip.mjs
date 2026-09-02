// ICE IS A RULE, measured: the same robot run across a sheet of ice and
// across pavement, and what the low grip costs him — stopping distance once
// the stick is released, how long a right-angle turn takes to come round,
// and how far a dash carries. node tools/scratch/icegrip.mjs [mech]
//
// The ice is SYNTHETIC (one patch pushed onto the live terrain at the origin),
// so the numbers do not depend on where the seed put frozen's lakes; the
// rule under test is terrain.updateHazards -> Fighter._grip, exactly as the
// real lakes drive it.
import { launch } from '../lib/browser.mjs';

const mech = process.argv[2] || 'titanus';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto(`http://localhost:5173/?battle=frozen&p1=${mech}&p2=viper&auto=0`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, null, { timeout: 120000 });
await p.waitForTimeout(3000);

const rows = await p.evaluate(() => {
  const w = window.__world, f = w.fighters[0], o = w.fighters[1];
  const terra = w.arena.terrain;
  o.isAI = false; o.pos.set(200, 0, 200); o.intent.moveX = 0; o.intent.moveZ = 0;
  const DT = 1 / 60;
  const step = (n, fn) => { for (let i = 0; i < n; i++) { fn?.(i); w.update(DT); } };
  const speed = () => Math.hypot(f.vel.x, f.vel.z);
  const park = () => {
    f.resetForRound(f.pos.clone().set(0, 0, 0), 0);
    f.controlsLocked = false; f.intent.moveX = 0; f.intent.moveZ = 0;
    f.vel.set(0, 0, 0);
    step(30);
  };
  const run = (label) => {
    const out = { label };
    // run +x to full speed, let go, measure the slide
    park();
    f.intent.moveX = 1; f.intent.moveZ = 0;
    step(180);
    out.top = +speed().toFixed(2);
    out.grip = +(f._grip ?? 1).toFixed(2);
    const x0 = f.pos.x;
    f.intent.moveX = 0;
    let n = 0;
    while (speed() > 0.5 && n < 600) { w.update(DT); n++; }
    out.stopDist = +(f.pos.x - x0).toFixed(2);
    out.stopT = +(n * DT).toFixed(2);
    // right-angle turn: running +x, ask for +z, how long until the velocity
    // heading is within 10 degrees of the new direction
    park();
    f.intent.moveX = 1;
    step(180);
    f.intent.moveX = 0; f.intent.moveZ = 1;
    n = 0;
    while (n < 600) {
      w.update(DT); n++;
      const ang = Math.atan2(f.vel.x, f.vel.z) * 180 / Math.PI;   // 0 = +z
      if (speed() > 1 && Math.abs(ang) < 10) break;
    }
    out.turnT = +(n * DT).toFixed(2);
    // dash: press once from a standstill, measure the ground covered until
    // he is back under the walk cap
    park();
    f.yaw = Math.PI / 2;   // facing +x
    f.intent.moveX = 1;
    step(6);
    const dx0 = f.pos.x;
    f.dashCd = 0;
    f.intent.dash = true;
    w.update(DT);
    f.intent.dash = false;
    f.intent.moveX = 0;   // a tap, not a held run: what the dash itself carries
    n = 0;
    while (n < 600 && (f.state === 'dash' || speed() > 0.5)) { w.update(DT); n++; }
    out.dashDist = +(f.pos.x - dx0).toFixed(2);
    return out;
  };
  // ISOLATED: a 3s run covers 60 units, which on frozen crosses the river,
  // so the shipped lanes and lakes come out from under both runs
  const lanes = terra.lanes, patches = terra.patches;
  terra.lanes = []; terra.patches = [];
  const pave = run('pavement');
  // now the same, on ice: one big sheet under the whole test
  terra.patches = [{ kind: 'ice', x: 0, z: 0, r: 120, hazard: 'ice', lobes: [{ dx: 0, dz: 0, s: 1 }] }];
  const ice = run('ice');
  terra.lanes = lanes; terra.patches = patches;
  return { pave, ice, walk: +f.moveSpeed().toFixed(2) };
});
await b.close();
console.log(`${mech} — walk cap ${rows.walk}`);
console.log('surface    top   grip  stopDist  stopT  turnT  dashDist');
for (const r of [rows.pave, rows.ice]) {
  console.log(`${r.label.padEnd(9)} ${String(r.top).padStart(5)}  ${String(r.grip).padStart(4)}  ${String(r.stopDist).padStart(8)}  ${String(r.stopT).padStart(5)}  ${String(r.turnT).padStart(5)}  ${String(r.dashDist).padStart(8)}`);
}
const ok = rows.ice.stopDist > rows.pave.stopDist * 2 && rows.ice.turnT > rows.pave.turnT && rows.ice.grip < 0.5;
console.log(ok ? 'ice slides: OK' : 'ice does not slide: FAIL');
process.exit(ok ? 0 : 1);
