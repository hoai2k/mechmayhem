// PROP GAP — is a surfaced mech actually TOUCHING the prop he is standing on?
//
//   node tools/propgap.mjs [--arena foundry] [--mech konga] [--prop gear]
//                          [--all] [--frames 240]
//
// A prop's gameplay collider is ONE VERTICAL CYLINDER measured off its ground
// band (arena.js addProp), which is a fine approximation for a smokestack and a
// lie for anything that is not round: a GEAR is a thin disc standing on edge,
// and its cylinder is a fat solid pillar as wide as the disc and as tall as the
// top of it. The surface walker climbs the collider, the player sees the model,
// and the difference is a mech hanging in mid-air beside the thing.
//
// So this measures both, on the same body, in the same frame:
//
//   collider   distance from the body / each limb tip to the prop's COLLIDER
//   visible    the same distance to the prop's own MESHES (their world boxes) —
//              what the player actually sees him touching, or not
//
// He is driven at the prop until he settles, then held for a second. A settled
// body should read ~0 on `visible` at a hand or a foot. Anything else is the
// float.
//
// Needs the dev server (npm run dev) on :5173.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const has = (n) => args.includes('--' + n);
const arena = flag('arena', 'foundry');
const mech = flag('mech', 'konga');
const want = flag('prop', 'gear');
const frames = +flag('frames', 240);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?battle=${arena}&p1=${mech}&p2=viper&auto=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

const out = await page.evaluate(async ({ want, frames, all, only, isolate }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const w = window.__world;
  window.__ais.length = 0;
  w.engine.paused = true;
  const f = window.__fighters[0];
  f.isAI = false;
  const other = window.__fighters[1];
  if (other) other.controlsLocked = true;

  // ---- every prop this arena placed, with its collider and its real meshes ----
  const props = [];
  for (const p of w.arena.propBodies) {
    if (!p.alive) continue;
    const name = p.group?.userData?.propName || p.group?.name || '?';
    const boxes = [];
    p.group.updateWorldMatrix(true, true);
    p.group.traverse((o) => {
      if (!o.isMesh) return;
      const b = new THREE.Box3().setFromObject(o);
      boxes.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
    });
    props.push({ name, p, boxes });
  }
  let list = props.filter((q) => (all ? true : q.name === want || q.name === "prop:" + want));
  if (only >= 0) list = list.slice(only, only + 1);
  if (!list.length) return { error: `no prop named "${want}" placed`, placed: [...new Set(props.map((q) => q.name))] };

  // EVERY VISIBLE SOLID NEAR THE ARENA CENTRE, as world boxes: each prop's own
  // meshes (what the player sees, not the collider) plus every live building
  // chunk. The question "is he touching anything" has to be asked of all of
  // them — a body that has drifted off the gear onto a wall is not floating.
  const world = [];
  for (const q of props) for (const b of q.boxes) world.push(b);
  for (const b of w.arena.destructo.buildings) {
    if (b.alive <= 0) continue;
    for (const c of b.grid.values()) {
      if (!c.alive) continue;
      world.push([c.x - c.w / 2, c.y - c.h / 2, c.z - c.d / 2, c.x + c.w / 2, c.y + c.h / 2, c.z + c.d / 2]);
    }
  }
  // …and the ground itself, which is a surface like any other
  const groundGap = (x, y, z) => Math.max(0, y - (w.arena.terrainHeightAt?.(x, z) ?? 0));

  // distance from a point to the nearest of a set of world boxes
  const boxDist = (bs, x, y, z) => {
    let best = Infinity;
    for (const b of bs) {
      const cx = Math.max(b[0], Math.min(x, b[3]));
      const cy = Math.max(b[1], Math.min(y, b[4]));
      const cz = Math.max(b[2], Math.min(z, b[5]));
      const d = Math.hypot(x - cx, y - cy, z - cz);
      if (d < best) best = d;
    }
    return best;
  };
  const cylDist = (p, x, y, z) => {
    const rad = Math.hypot(x - p.x, z - p.z);
    const dr = rad - p.r;
    const dy = y > p.h ? y - p.h : 0;
    return Math.hypot(Math.max(0, dr), dy);
  };
  const tips = () => {
    const map = {};
    for (const j of ['handL', 'handR', 'ankleL', 'ankleR']) {
      const part = (f.mech.boneMap && f.mech.boneMap[j]) || f.mech.joints?.[j];
      if (!part) continue;
      map[j] = part.getWorldPosition(new THREE.Vector3());
    }
    return map;
  };

  // ISOLATE: take everything else away, so what he is standing on can only be
  // this prop. Nothing else in the arena is near enough to explain a hover.
  if (isolate) {
    for (const q of props) {
      if (list.includes(q)) continue;
      q.p.alive = false;
      if (q.p.group) q.p.group.visible = false;
    }
    for (const b of w.arena.destructo.buildings) {
      const a = b.aabb;
      const cx = (a.minX + a.maxX) / 2, cz = (a.minZ + a.maxZ) / 2;
      if (Math.hypot(cx - list[0].p.x, cz - list[0].p.z) > 90) continue;
      b.alive = 0;
      for (const c of b.grid.values()) c.alive = false;
      if (b.mesh) b.mesh.visible = false;
      if (b.group) b.group.visible = false;
    }
  }

  const rows = [];
  for (const q of list) {
    // stand him a body-length off the prop, facing it, and hold the stick
    // toward it: that is exactly how a player arrives at one
    const ang = Math.random() * 0; // deterministic: approach from +x
    const dist = q.p.r + f.radius + 1.5;
    f.resetForRound(f.pos.clone().set(q.p.x + dist, 0, q.p.z), 0);
    f.pos.set(q.p.x + dist, 0, q.p.z);
    f.vel.set(0, 0, 0);
    f._climbRelease = false;
    if (other) other.pos.set(q.p.x + dist + 40, 0, q.p.z + 40);
    const trace = [];
    for (let i = 0; i < frames; i++) {
      Object.assign(f.intent, {
        moveX: -1, moveZ: 0, jump: false, jumpHeld: false, light: false, lightHeld: false,
        heavy: false, ranged: false, special: false, ult: false, block: false, dash: false,
        chargeDash: false, duck: false, taunt: false, lockOn: false,
      });
      w.update(1 / 60);
      if (i % 20 === 19 || i === frames - 1) {
        const t = tips();
        const body = { c: cylDist(q.p, f.pos.x, f.pos.y + f.height * 0.5, f.pos.z),
          v: boxDist(world, f.pos.x, f.pos.y + f.height * 0.5, f.pos.z) };
        const per = {};
        for (const [k, v] of Object.entries(t)) {
          per[k] = { c: cylDist(q.p, v.x, v.y, v.z),
            v: Math.min(boxDist(world, v.x, v.y, v.z), groundGap(v.x, v.y, v.z)) };
        }
        // WHAT IS HOLDING HIM: the body's own shell against visible geometry
        // (the same sphere stack climb.js pushes out), and each limb's state
        const shell = [0.22, 0.48, 0.74, 0.95].map((k) => {
          const u = f.climbUp || { x: 0, y: 1, z: 0 };
          return Math.min(
            boxDist(world, f.pos.x + u.x * f.height * k, f.pos.y + u.y * f.height * k, f.pos.z + u.z * f.height * k),
            groundGap(f.pos.x + u.x * f.height * k, f.pos.y + u.y * f.height * k, f.pos.z + u.z * f.height * k));
        });
        trace.push({
          shell: +Math.min(...shell).toFixed(2),
          i, y: +f.pos.y.toFixed(2), grounded: !!f.grounded, surfaced: !!f.climb,
          vel: +Math.hypot(f.vel.x, f.vel.y, f.vel.z).toFixed(2),
          upY: f.climbUp ? +f.climbUp.y.toFixed(2) : 1,
          limbs: [0, 1, 2, 3].map((k) => { const st = f._steps?.[k]; return !st ? '-' : st.air ? 'A' : st.sw >= 0 ? 'S' : 'P'; }).join(''),
          body, per,
        });
      }
    }
    // keep the last body around so the caller can photograph it
    window.__propGapShot = { x: q.p.x, z: q.p.z, h: q.p.h, r: q.p.r };
    const last = trace[trace.length - 1];
    const minTipV = Math.min(...Object.values(last.per).map((v) => v.v));
    const minTipC = Math.min(...Object.values(last.per).map((v) => v.c));
    rows.push({
      prop: q.name, r: q.p.r, h: q.p.h,
      meshes: q.boxes.length,
      y: last.y, grounded: last.grounded, surfaced: last.surfaced, limbs: last.limbs,
      trail: trace.map((t) => `${t.i}:y${t.y}${t.grounded ? 'G' : t.surfaced ? 'S' : 'A'}${t.limbs}`
        + `/tip${Math.min(...Object.values(t.per).map((v) => v.v)).toFixed(1)}/shell${t.shell}`).join(' '),
      bodyV: last.body.v, bodyC: last.body.c, minTipV, minTipC,
      trace: trace.slice(-4),
    });
  }
  return { arena: w.arena.theme.id, mech: f.def.id, rows };
}, { want, frames, all: has('all'), only: +flag('index', -1), isolate: has('isolate') });

if (out.error) { console.error(out.error, out.placed ? `— placed: ${out.placed.join(', ')}` : ''); await browser.close(); process.exit(1); }
console.log(`\nbody radius ${out.rows[0].radius} · height ${out.rows[0].height} — the shell reaches radius*0.9 = ${(out.rows[0].radius * 0.9).toFixed(2)}`);
console.log(`\n=== ${out.mech} in ${out.arena} — after ${frames} frames walking into each prop ===`);
console.log('prop'.padEnd(16) + 'colR'.padStart(6) + 'colH'.padStart(6) + 'y'.padStart(7)
  + 'body→col'.padStart(10) + 'body→mesh'.padStart(10) + 'tip→col'.padStart(9) + 'tip→mesh'.padStart(9) + '  state');
for (const r of out.rows) {
  console.log(r.prop.padEnd(16) + r.r.toFixed(1).padStart(6) + r.h.toFixed(1).padStart(6)
    + r.y.toFixed(2).padStart(7)
    + r.bodyC.toFixed(2).padStart(10) + r.bodyV.toFixed(2).padStart(10)
    + r.minTipC.toFixed(2).padStart(9) + r.minTipV.toFixed(2).padStart(9)
    + '  ' + (r.grounded ? 'grounded' : r.surfaced ? 'surfaced' : 'AIRBORNE') + ' ' + r.limbs);
  if (has('trace')) console.log('   ' + r.trail);
}
console.log('\ntip→mesh is the distance from the nearest hand/foot to the nearest VISIBLE solid');
console.log('(any prop mesh, any live building chunk, or the ground). A settled body should read ~0.');
if (has('shot')) {
  // THE PICTURE. The camera system owns the view, so take it off him rather
  // than fight it: `world.cameraSys.update` is replaced with one that parks the
  // camera side-on to the prop and looks at the body. Everything else keeps
  // running, so this is the live frame, not a pose.
  await page.evaluate(({ dist }) => {
    const w = window.__world;
    const f = window.__fighters[0];
    const s = window.__propGapShot;
    w.engine.paused = false;
    const cam = w.engine.camera;
    w.cameraSys.update = () => {
      cam.position.set(f.pos.x + dist, f.pos.y + f.height * 0.9, f.pos.z + dist);
      cam.lookAt(f.pos.x, f.pos.y + f.height * 0.45, f.pos.z);
      cam.updateProjectionMatrix();
    };
    window.__hold = () => { Object.assign(f.intent, { moveX: -1, moveZ: 0, jump: false }); };
  }, { dist: +flag('dist', 18) });
  for (let i = 0; i < 40; i++) { await page.evaluate(() => window.__hold()); await page.waitForTimeout(30); }
  await page.screenshot({ path: flag('shot', 'propgap.png') });
  console.log('shot ->', flag('shot', 'propgap.png'));
}
if (errors.length) console.log('page errors:', errors.slice(0, 3));
await browser.close();
