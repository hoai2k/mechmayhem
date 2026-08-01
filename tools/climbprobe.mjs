// WALL CLIMB PROBE — drive a climbing mech into a real arena building and
// report what the climb actually does, frame by frame.
//
//   node tools/climbprobe.mjs [battle url] [--shots out-prefix]
//
// The page is put in capture mode (engine.paused + step), the AI is taken off
// P1 and its intent is written directly, so the run is deterministic and does
// not wait on SwiftShader's ~20x-slow real-time loop. Reports, per phase: the
// body's tilt onto the wall (0 = upright, 1 = flat on the face), height gained,
// which surface he is on, and where his hands and feet are relative to it —
// the last one being the thing no screenshot alone can prove.
import { chromium } from 'playwright-core';

const url = process.argv[2] ||
  'http://localhost:5173/?battle=neon&p1=jerry&p2=viper&auto=1';
const shotIdx = process.argv.indexOf('--shots');
const shots = shotIdx > 0 ? process.argv[shotIdx + 1] : null;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

// ---- park jerry in front of the tallest building face in the arena ----
const setup = await page.evaluate(() => {
  const w = window.__world;
  window.__ais.length = 0;                 // nobody else drives P1
  w.engine.paused = true;
  const f = window.__fighters[0];
  f.isAI = false;
  const d = w.arena.destructo;
  let best = null;
  for (const b of d.buildings) {
    if (b.alive <= 0) continue;
    const h = b.aabb.maxY;
    if (!best || h > best.h) best = { h, a: b.aabb };
  }
  if (!best) return { ok: false, why: 'no buildings' };
  const a = best.a;
  // stand off the -Z face, a couple of body-widths out, looking at it
  const x = (a.minX + a.maxX) / 2;
  const z = a.minZ - f.radius - 3.5;
  f.resetForRound(new (w.fighters[0].pos.constructor)(x, 0, z), 0);
  f.pos.set(x, 0, z);
  window.__probe = { face: { x, z: a.minZ }, top: best.h };
  return { ok: true, top: +best.h.toFixed(2), height: +f.height.toFixed(2),
    stepUp: +f.stepUp.toFixed(2), dimsScale: +f.mech.dims.scale.toFixed(3),
    hipHeight: +f.mech.dims.hipHeight.toFixed(2) };
});
if (!setup.ok) { console.log('SETUP FAILED:', setup.why); await browser.close(); process.exit(1); }
console.log('setup', JSON.stringify(setup));

// Let the RENDERER catch up: world.update() never draws and never moves the
// chase camera (that rides engine.onRender), so a screenshot taken straight
// off a sim-only run frames the spawn point. engine.step does both.
async function settleCamera(frames = 34) {
  await page.evaluate((n) => {
    const w = window.__world;
    for (let i = 0; i < n; i++) w.engine.step(1 / 60);
  }, frames);
}

// ---- run a scripted stick: forward into the wall, then hold ----
async function run(script, frames) {
  return page.evaluate(({ script, frames }) => {
    const w = window.__world;
    const f = window.__fighters[0];
    const trace = [];
    const fn = new Function('t', 'f', `return (${script});`);
    for (let i = 0; i < frames; i++) {
      const t = i / 60;
      const s = fn(t, f);
      Object.assign(f.intent, {
        moveX: 0, moveZ: 0, jump: false, jumpHeld: false, light: false, heavy: false,
        ranged: false, special: false, ult: false, block: false, dash: false,
        chargeDash: false, duck: false, taunt: false,
      }, s);
      w.update(1 / 60);   // sim only: engine.step would re-render every frame,
                          // and SwiftShader makes that hours instead of seconds
      if (i % 6 === 0 || i === frames - 1) {
        const c = f.climb;
        // signed distance from a hand/foot to the surface it is crossing —
        // 0 = planted on it, positive = out in the air. On the ground the same
        // number is just the extremity's height, which is the check that the
        // measurement means what it says.
        const tip = (n) => {
          const j = (f.mech.boneMap && f.mech.boneMap[n]) || f.mech.joints[n];
          if (!j) return null;
          const p = j.getWorldPosition(new window.__THREE.Vector3());
          if (!c || c.phase !== 'wall') return +p.y.toFixed(2);
          const s = c.surf;
          if (s.kind === 'cylinder') return +(Math.hypot(p.x - s.cx, p.z - s.cz) - s.r).toFixed(2);
          return +((p.x - s.x) * s.nx + (p.z - s.z) * s.nz).toFixed(2);
        };
        trace.push({
          t: +t.toFixed(2), state: f.state,
          y: +f.pos.y.toFixed(2), z: +f.pos.z.toFixed(2),
          tilt: +(f._climbTilt || 0).toFixed(2),
          phase: c ? c.phase : (f._climbEdge ? 'edge' : '-'),
          grounded: f.grounded,
          press: +((f._climbPress || 0)).toFixed(2),
          stam: +f.sprintEnergy.toFixed(2),
          lock: +((f._climbEdgeLock || 0)).toFixed(2),
          tips: [tip('ankleL'), tip('ankleR'), tip('handL'), tip('handR')],
        });
      }
    }
    return { trace, err: null };
  }, { script, frames });
}

const phases = [
  ['walk into the face (holding forward)', '{ moveZ: 1 }', 240],
];
for (const [label, script, frames] of phases) {
  const r = await run(script, frames);
  console.log('\n== ' + label);
  for (const s of r.trace) {
    console.log(` t=${String(s.t).padStart(5)} ${s.phase.padEnd(5)} tilt=${String(s.tilt).padStart(4)} ` +
      `y=${String(s.y).padStart(6)} z=${String(s.z).padStart(7)} grnd=${s.grounded ? 'Y' : 'n'} ` +
      `press=${s.press} lock=${s.lock} tips=[${s.tips.join(', ')}]`);
  }
  if (shots) await page.screenshot({ path: `${shots}-climb.png` });
}

// ---- and off the top: walk to the far edge and see the crouch ----
const edge = await run('{ moveZ: 1 }', 300);
console.log('\n== keep going (top-out, then the far edge)');
for (const s of edge.trace) {
  console.log(` t=${String(s.t).padStart(5)} ${s.phase.padEnd(5)} tilt=${String(s.tilt).padStart(4)} ` +
    `y=${String(s.y).padStart(6)} z=${String(s.z).padStart(7)} grnd=${s.grounded ? 'Y' : 'n'} lock=${s.lock} tips=[${s.tips.join(', ')}]`);
}
if (shots) await page.screenshot({ path: `${shots}-edge.png` });

// ---- and the pictures: catch him ON the wall, and again crouched at a lip ----
if (shots) {
  for (const [name, want] of [['wall', 'f.climb && f._climbTilt > 0.92'],
                              ['edge', 'f._climbEdge']]) {
    const got = await page.evaluate((cond) => {
      const w = window.__world, f = window.__fighters[0];
      const test = new Function('f', `return !!(${cond});`);
      for (let i = 0; i < 1200; i++) {
        Object.assign(f.intent, { moveX: 0, moveZ: 1, jump: false, jumpHeld: false });
        w.update(1 / 60);
        if (test(f)) return { ok: true, y: +f.pos.y.toFixed(1) };
      }
      return { ok: false };
    }, want);
    if (!got.ok) { console.log(`no ${name} frame found`); continue; }
    await settleCamera();
    await page.screenshot({ path: `${shots}-${name}.png` });
    console.log(`shot ${shots}-${name}.png  (y=${got.y})`);
  }
}

if (errors.length) console.log('\nPAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
