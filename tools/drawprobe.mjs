// Draw-call probe: what does ONE rendered frame actually cost the GPU?
// Renders the scene directly (info.reset first, so the numbers are that
// render's alone) and reports draw calls / triangles, then re-measures with
// shadows off, with props merged vs raw, and per split view.
// usage: node tools/drawprobe.mjs "<battle url>" [waitMs]
import { launch } from './lib/browser.mjs';

const [url, waitMs = '30000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(() => {
  const w = window.__world;
  const e = w.engine;
  const r = e.renderer;
  r.info.autoReset = false;
  const measure = (label, fn) => {
    r.info.reset();
    fn();
    return { [label]: { calls: r.info.render.calls, tris: r.info.render.triangles } };
  };
  const cam = e.camera;
  const res = {};
  Object.assign(res, measure('sceneRender', () => r.render(e.scene, cam)));
  // shadows off
  const shadowWas = r.shadowMap.enabled;
  r.shadowMap.enabled = false;
  e.scene.traverse((o) => { if (o.isLight) o.castShadow = false; });
  Object.assign(res, measure('noShadows', () => r.render(e.scene, cam)));
  r.shadowMap.enabled = shadowWas;
  e.sun.castShadow = true;
  // ghost prop groups hidden (the 8 toroidal clones)
  const ghosts = w.arena.ghostPropGroups;
  ghosts.forEach((g) => { g.visible = false; });
  Object.assign(res, measure('noPropGhosts', () => r.render(e.scene, cam)));
  ghosts.forEach((g) => { g.visible = true; });
  // props gone entirely
  w.arena.propGroup.visible = false;
  Object.assign(res, measure('noPropsAtAll', () => r.render(e.scene, cam)));
  w.arena.propGroup.visible = true;
  // buildings gone
  w.arena.destructo.mesh.visible = false;
  Object.assign(res, measure('noBuildings', () => r.render(e.scene, cam)));
  w.arena.destructo.mesh.visible = true;

  // mesh census by owner
  const census = { props: 0, propGhosts: 0, terrain: 0, other: 0 };
  const count = (root, key) => root?.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) census[key]++; });
  count(w.arena.propGroup, 'props');
  for (const g of ghosts) count(g, 'propGhosts');
  count(w.arena.terrain.group, 'terrain');
  e.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) census.other++; });
  census.other -= census.props + census.propGhosts + census.terrain;
  r.info.autoReset = true;
  return { frames: res, meshCensus: census, mergeProps: !location.search.includes('props=raw') };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
