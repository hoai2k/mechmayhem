// Performance probe: where does a frame actually go?
//
// CPU side — steps the world N times with each subsystem timed (pure JS, so
// the numbers mean something even under SwiftShader, which only slows the
// GPU work). GPU side — reports draw calls / triangles for one rendered
// frame, in single view and (with &forcesplit=1) per split view.
//
// usage: node tools/perfprobe.mjs "<battle url>" [steps] [waitMs]
import { launch } from './lib/browser.mjs';

const [url, steps = '600', waitMs = '30000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate((N) => {
  const w = window.__world;
  const ais = window.__ais || [];
  const e = w.engine;
  const arena = w.arena;
  const dt = 1 / 60;
  const t = {};
  const time = (k, fn) => {
    const t0 = performance.now();
    fn();
    t[k] = (t[k] || 0) + (performance.now() - t0);
  };

  // one full world.update, decomposed by hand (mirrors world.update's order)
  const total0 = performance.now();
  for (let i = 0; i < N; i++) {
    time('ai', () => { for (const a of ais) a.update(dt); });
    time('fighters', () => { for (const f of w.fighters) f.update(dt); });
    time('projectiles', () => w.projectiles.update(dt));
    time('fleas', () => w.fleas.update(dt));
    time('effects', () => w.effects.update(dt));
    time('arena', () => arena.update(dt));
    time('pickups', () => w.updatePickups(dt));
    time('fountains', () => w.fountains?.update(dt));
  }
  const totalMs = performance.now() - total0;

  // arena internals, separately (arena.update calls into these)
  const sub = {};
  const subTime = (k, fn) => {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) fn();
    sub[k] = (performance.now() - t0) / N;
  };
  subTime('destructo.update', () => arena.destructo.update(dt));
  subTime('terrain.update', () => arena.terrain.update(dt));
  subTime('arena.updateExplosives', () => arena.updateExplosives());
  subTime('arena.updateHazards', () => arena.updateHazards(dt));
  subTime('destructo.setOccluders', () => {
    const segs = w.cameraSys?._segs?.slice(0, 4) || [];
    arena.destructo.setOccluders(segs);
  });
  subTime('destructo.collideFighter', () => {
    for (const f of w.fighters) arena.destructo.collideFighter(f);
  });
  subTime('arena.collideFighter', () => {
    for (const f of w.fighters) arena.collideFighter(f);
  });

  // scene / GPU shape
  const info = e.renderer.info;
  let meshes = 0, instanced = 0, groups = 0;
  e.scene.traverse((o) => {
    if (o.isInstancedMesh) instanced++;
    else if (o.isMesh) meshes++;
    else if (o.isGroup) groups++;
  });
  const d = arena.destructo;
  return {
    perUpdateMs: Object.fromEntries(Object.entries(t)
      .map(([k, v]) => [k, +(v / N).toFixed(4)])
      .sort((a, b) => b[1] - a[1])),
    totalPerUpdateMs: +(totalMs / N).toFixed(3),
    arenaInternalsMs: Object.fromEntries(Object.entries(sub)
      .map(([k, v]) => [k, +v.toFixed(4)]).sort((a, b) => b[1] - a[1])),
    scene: {
      meshes, instancedMeshes: instanced, groups,
      drawCalls: info.render.calls, triangles: info.render.triangles,
      programs: info.programs?.length, geometries: info.memory.geometries,
      textures: info.memory.textures,
    },
    world: {
      fighters: w.fighters.length, projectiles: w.projectiles.active.length,
      buildings: d.buildings.length, chunks: d.count,
      chunkInstancesDrawn: d.mesh.count,
      propBodies: arena.propBodies.length, propGroupChildren: arena.propGroup.children.length,
      ghostPropGroups: arena.ghostPropGroups.length,
      spinners: arena.spinners.length, bobbers: arena.bobbers.length,
      fountains: w.fountains?.active.length,
      updaters: w.updaters?.length, tasks: w.tasks?.length,
    },
  };
}, Number(steps));

console.log(JSON.stringify(out, null, 1));
await browser.close();
