// SURFACE WALK PROBE — drive a surface-walking mech at real arena geometry and
// measure whether the result is CONTINUOUS, which is the whole design claim.
//
//   node tools/climbprobe.mjs [battle url]
//
// The AI is taken off P1 and its intent is written directly; the sim is stepped
// through world.update (no draw — SwiftShader renders at a tenth of real time).
// EVERY frame is measured, and each scenario reports the worst single-frame
// discontinuity as well as a sampled trace:
//
//   up-turn   the body's up vector turning, in degrees per frame. This is the
//             number the previous implementation failed: swapping which plane
//             it was attached to flipped the body ~90 degrees in one frame. A
//             damp cannot exceed a few degrees per frame, so anything large
//             here is a snap a player would see.
//   move      how far the body moved in one frame BEYOND what its own speed
//             explains — i.e. a teleport. The arena step-over used to show up
//             here as a ~2.8-unit hop onto the first block.
//   tips      each foot's and hand's distance to the nearest solid (0 = planted).
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

const setup = await page.evaluate(() => {
  const w = window.__world;
  window.__ais.length = 0;
  w.engine.paused = true;
  const f = window.__fighters[0];
  f.isAI = false;
  let best = null;
  for (const b of w.arena.destructo.buildings) {
    if (b.alive <= 0) continue;
    if (!best || b.aabb.maxY > best.maxY) best = b.aabb;
  }
  if (!best) return { ok: false, why: 'no buildings' };
  const x = (best.minX + best.maxX) / 2;
  window.__park = (dist = 6) => {
    const z = best.minZ - f.radius - dist;
    f.resetForRound(f.pos.clone().set(x, 0, z), 0);
    f.pos.set(x, 0, z);
    f.vel.set(0, 0, 0);
  };
  window.__park();
  // distance from a point to the nearest solid, so the trace can say where the
  // hands and feet actually ARE rather than where the code believes they are
  window.__nearest = (px, py, pz) => {
    const w2 = window.__world;
    let best2 = Math.abs(py - (w2.arena.terrainHeightAt?.(px, pz) ?? 0));
    for (const b of w2.arena.destructo.buildings) {
      if (b.alive <= 0) continue;
      const a = b.aabb;
      if (px < a.minX - 14 || px > a.maxX + 14 || pz < a.minZ - 14 || pz > a.maxZ + 14) continue;
      for (const c of b.grid.values()) {
        if (!c.alive) continue;
        const cx = Math.max(c.x - c.w / 2, Math.min(px, c.x + c.w / 2));
        const cy = Math.max(c.y - c.h / 2, Math.min(py, c.y + c.h / 2));
        const cz = Math.max(c.z - c.d / 2, Math.min(pz, c.z + c.d / 2));
        const d = Math.hypot(px - cx, py - cy, pz - cz);
        if (d < best2) best2 = d;
      }
    }
    return best2;
  };
  return { ok: true, top: +best.maxY.toFixed(2), height: +f.height.toFixed(2) };
});
if (!setup.ok) { console.log('SETUP FAILED:', setup.why); await browser.close(); process.exit(1); }
console.log('setup', JSON.stringify(setup));

async function run(script, frames, dist) {
  return page.evaluate(({ script, frames, dist }) => {
    const w = window.__world;
    const f = window.__fighters[0];
    const V = window.__THREE.Vector3;
    window.__park(dist);
    const fn = new Function('t', 'f', `return (${script});`);
    const trace = [];
    let worstUp = 0, worstUpT = 0, worstPos = 0, worstPosT = 0;
    const prevUp = new V(0, 1, 0);
    const prevPos = f.pos.clone();
    for (let i = 0; i < frames; i++) {
      const t = i / 60;
      Object.assign(f.intent, {
        moveX: 0, moveZ: 0, jump: false, jumpHeld: false, light: false, lightHeld: false,
        heavy: false, ranged: false, special: false, ult: false, block: false, dash: false,
        chargeDash: false, duck: false, taunt: false,
      }, fn(t, f));
      w.update(1 / 60);
      const up = f.climbUp || new V(0, 1, 0);
      const dUp = Math.acos(Math.max(-1, Math.min(1, up.dot(prevUp)))) * 180 / Math.PI;
      // the toroidal wrap folds the body across the cell (a ~300-unit
      // coordinate change that is not motion at all) — never a discontinuity
      const wrapped = !!f._wrap;
      const moved = wrapped ? 0 : f.pos.distanceTo(prevPos);
      // what his own speed can account for in one frame, plus slack for the
      // stick pull and gravity
      const explained = Math.max(f.vel.length(), 30) / 60 + 0.35;
      const dPos = Math.max(0, moved - explained);
      if (i > 4 && dUp > worstUp) { worstUp = dUp; worstUpT = t; }
      if (i > 4 && dPos > worstPos) { worstPos = dPos; worstPosT = t; }
      prevUp.copy(up);
      prevPos.copy(f.pos);
      if (i % 15 === 0 || i === frames - 1) {
        const tip = (n) => {
          const j = (f.mech.boneMap && f.mech.boneMap[n]) || f.mech.joints[n];
          if (!j) return null;
          const p = j.getWorldPosition(new V());
          return +(window.__nearest(p.x, p.y, p.z)).toFixed(2);
        };
        trace.push({
          t: +t.toFixed(2),
          y: +f.pos.y.toFixed(1), z: +f.pos.z.toFixed(1),
          upY: +up.y.toFixed(2), tilt: +(f._climbTilt || 0).toFixed(2),
          on: f.climb ? 'surf' : (f.grounded ? 'grnd' : 'air '),
          tips: [tip('ankleL'), tip('ankleR'), tip('handL'), tip('handR')],
        });
      }
    }
    return { trace, worstUp: +worstUp.toFixed(1), worstUpT: +worstUpT.toFixed(2),
      worstPos: +worstPos.toFixed(2), worstPosT: +worstPosT.toFixed(2) };
  }, { script, frames, dist });
}

const SCENARIOS = [
  ['hold forward from open ground: floor -> wall -> roof -> far lip -> down',
    '{ moveZ: 1 }', 480, 6],
  ['walk at it, then stop dead halfway up: he holds where he is',
    't < 1.4 ? { moveZ: 1 } : {}', 200, 6],
  ['up the wall, then sideways across the facade',
    't < 1.0 ? { moveZ: 1 } : { moveX: 1 }', 240, 6],
  ['up the wall, then pull back: he walks back DOWN it',
    't < 1.2 ? { moveZ: 1 } : { moveZ: -1 }', 240, 6],
  ['jump with no direction while on the wall: lets go and drops',
    't < 1.0 ? { moveZ: 1 } : { jump: t > 0.999 && t < 1.001 }', 200, 6],
];
for (const [label, script, frames, dist] of SCENARIOS) {
  const r = await run(script, frames, dist);
  console.log(`\n== ${label}`);
  console.log(`   WORST per-frame: up-turn ${r.worstUp} deg (t=${r.worstUpT}), ` +
    `unexplained move ${r.worstPos} (t=${r.worstPosT})`);
  for (const s of r.trace) {
    console.log(` t=${String(s.t).padStart(5)} ${s.on} upY=${String(s.upY).padStart(5)} ` +
      `tilt=${String(s.tilt).padStart(4)} y=${String(s.y).padStart(6)} z=${String(s.z).padStart(7)} ` +
      `tips=[${s.tips.join(', ')}]`);
  }
}

// ---------------------------------------------------------------------------
// A RENDERED SPLIT-SCREEN PASS. Everything above runs world.update only — no
// draw — which is what makes it fast enough to be worth running, and also what
// makes it BLIND to anything on the render path. That blindness shipped a
// crash: the surface walker pushes a null into the per-view occluder list (a
// climbing player's building must not be ghosted), and the fade pass walked
// that list dereferencing every entry — a TypeError in applyViewFade, on a
// SPLIT view only, since the solo camera passes an empty list instead. So the
// tool now ends by actually DRAWING some frames, in split screen, with the mech
// on a wall, and fails on any page error.
console.log('\n== rendered split-screen pass (the render path the sim skips)');
await page.goto(url + '&forcesplit=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
errors.length = 0;
const split = await page.evaluate(async () => {
  const w = window.__world;
  window.__ais.length = 0;
  const f = window.__fighters[0];
  f.isAI = false;
  let best = null;
  for (const b of w.arena.destructo.buildings) {
    if (b.alive <= 0) continue;
    if (!best || b.aabb.maxY > best.maxY) best = b.aabb;
  }
  if (!best) return { ok: false };
  f.pos.set((best.minX + best.maxX) / 2, 0, best.minZ - f.radius - 5);
  f.yaw = f.targetYaw = f.torsoYaw = 0;
  w.engine.paused = true;
  for (let i = 0; i < 90; i++) {
    Object.assign(f.intent, { moveX: 0, moveZ: 1, jump: false, jumpHeld: false });
    w.update(1 / 60);
    if (i % 3 === 0) w.engine.step(1 / 60);   // …and DRAW, which is the point
  }
  return { ok: true, y: +f.pos.y.toFixed(1), tilt: +(f._climbTilt || 0).toFixed(2),
    climbing: !!f.climb };
});
console.log(`   drew split frames with him at y=${split.y} tilt=${split.tilt} ` +
  `climbing=${split.climbing}: ${errors.length ? 'PAGE ERRORS' : 'no page errors'}`);

if (errors.length) console.log('\nPAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
process.exit(errors.length ? 1 : 0);
