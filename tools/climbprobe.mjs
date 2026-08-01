// WALL CLIMB PROBE — drive a climbing mech into a real arena building and
// report what the climb actually does, frame by frame.
//
//   node tools/climbprobe.mjs [battle url]
//
// The AI is taken off P1 and its intent is written directly, and the sim is
// stepped through world.update (no draw — SwiftShader renders at a tenth of
// real time, so a rendered run would take hours). Each scenario re-parks him
// in front of the arena's tallest building first, so they are independent.
// Reported per sample: the mode / attach phase, the body's tilt onto the wall
// (0 = upright, 1 = standing on the face), where his body forward points
// (fy: +1 climbing, -1 head-first down), height, and each hand/foot's signed
// distance to the surface it is crossing — the thing no screenshot can prove.
import { chromium } from 'playwright-core';

const url = process.argv[2] ||
  'http://localhost:5173/?battle=neon&p1=jerry&p2=viper&auto=1';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

// ---- find the tallest building, define the per-scenario park ----
const setup = await page.evaluate(() => {
  const w = window.__world;
  window.__ais.length = 0;                 // nobody else drives P1
  w.engine.paused = true;
  const f = window.__fighters[0];
  f.isAI = false;
  let best = null;
  for (const b of w.arena.destructo.buildings) {
    if (b.alive <= 0) continue;
    const h = b.aabb.maxY;
    if (!best || h > best.h) best = { h, a: b.aabb };
  }
  if (!best) return { ok: false, why: 'no buildings' };
  const a = best.a;
  const x = (a.minX + a.maxX) / 2;
  // park `dist` out from the -Z face, facing it
  window.__park = (dist = 3.5) => {
    const z = a.minZ - f.radius - dist;
    f.resetForRound(f.pos.clone().set(x, 0, z), 0);
    f.pos.set(x, 0, z);
    f.vel.set(0, 0, 0);
  };
  window.__park();
  return { ok: true, top: +best.h.toFixed(2), height: +f.height.toFixed(2), stepUp: +f.stepUp.toFixed(2) };
});
if (!setup.ok) { console.log('SETUP FAILED:', setup.why); await browser.close(); process.exit(1); }
console.log('setup', JSON.stringify(setup));

// ---- run a scripted stick against the freshly parked mech ----
async function run(script, frames, dist) {
  return page.evaluate(({ script, frames, dist }) => {
    const w = window.__world;
    const f = window.__fighters[0];
    window.__park(dist);
    const trace = [];
    const fn = new Function('t', 'f', `return (${script});`);
    for (let i = 0; i < frames; i++) {
      const t = i / 60;
      const s = fn(t, f);
      Object.assign(f.intent, {
        moveX: 0, moveZ: 0, jump: false, jumpHeld: false, light: false, lightHeld: false,
        heavy: false, ranged: false, special: false, ult: false, block: false, dash: false,
        chargeDash: false, duck: false, taunt: false,
      }, s);
      w.update(1 / 60);
      if (i % 9 === 0 || i === frames - 1) {
        const c = f.climb;
        // signed distance from a hand/foot to the surface it is crossing —
        // 0 = planted on it, positive = out in the air. Off the wall the same
        // number is just the extremity's height above the floor.
        const tip = (n) => {
          const j = (f.mech.boneMap && f.mech.boneMap[n]) || f.mech.joints[n];
          if (!j) return null;
          const p = j.getWorldPosition(new window.__THREE.Vector3());
          if (!c || c.phase !== 'wall') return +p.y.toFixed(2);
          const su = c.surf;
          if (su.kind === 'cylinder') return +(Math.hypot(p.x - su.cx, p.z - su.cz) - su.r).toFixed(2);
          return +((p.x - su.x) * su.nx + (p.z - su.z) * su.nz).toFixed(2);
        };
        trace.push({
          t: +t.toFixed(2), state: f.state,
          y: +f.pos.y.toFixed(2), z: +f.pos.z.toFixed(2),
          tilt: +(f._climbTilt || 0).toFixed(2),
          phase: c ? c.phase : (f.climbMode ? 'mode' : '-'),
          fy: c ? +c.fwd.y.toFixed(2) : 0,
          grounded: f.grounded,
          press: +((f._climbPress || 0)).toFixed(2),
          rest: +((f._climbRest || 0)).toFixed(2),
          tips: [tip('ankleL'), tip('ankleR'), tip('handL'), tip('handR')],
        });
      }
    }
    return trace;
  }, { script, frames, dist });
}

const SCENARIOS = [
  ['hold forward: little push, up, over, across, wrap down the far side, walk on',
    '{ moveZ: 1 }', 420, 3.5],
  ['climb, then rest the stick: mode ends, he falls off',
    't < 0.55 ? { moveZ: 1 } : {}', 160, 3.5],
  ['jump at the wall holding forward: latches on impact, mid-air',
    '{ moveZ: 1, jump: t < 0.05, jumpHeld: t < 0.4 }', 220, 12],
  ['climb, then LIGHT grip with the stick released: holds; release light: falls',
    't < 0.5 ? { moveZ: 1 } : t < 1.3 ? { lightHeld: true } : {}', 200, 3.5],
];
for (const [label, script, frames, dist] of SCENARIOS) {
  const trace = await run(script, frames, dist);
  console.log('\n== ' + label);
  for (const s of trace) {
    console.log(` t=${String(s.t).padStart(5)} ${s.phase.padEnd(5)} tilt=${String(s.tilt).padStart(4)} ` +
      `fy=${String(s.fy).padStart(5)} y=${String(s.y).padStart(6)} z=${String(s.z).padStart(7)} ` +
      `grnd=${s.grounded ? 'Y' : 'n'} press=${s.press} rest=${s.rest} tips=[${s.tips.join(', ')}]`);
  }
}

if (errors.length) console.log('\nPAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
