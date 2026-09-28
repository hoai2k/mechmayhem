// A MENU DIORAMA, SHOT IN THE ENGINE — how the Concept A mockups in
// docs/menu-concepts/ were made. Stages real mechs in a real arena, parks the
// camera, and (HIDE=1) hides the instanced chunk buildings so the arena's
// painted horizon shows through: the buildings are built to read in a fight
// and look like cardboard up close, while the props and skybox look great.
//
//   HIDE=1 node tools/scratch/menudiorama.mjs <arena> <out.png> \
//     <cam x,y,z> <look x,y,z> <fov> <mech:x,z,yawDeg>...
//   e.g. neon torii:  4,3.2,4  4,8.5,40  40  konga:11,30,195 viper:4,27,180 titanus:-3,30,165
//
// Camera looks +z, so screen-LEFT is +x. A paused engine never calls
// onRender and only renders every 8th frame, so the pose is set directly and
// _render() is called by hand. Prop positions: world.arena.propBodies.
import { launch } from '../lib/browser.mjs';
const [arena, out, camS, lookS, fovS, ...mechS] = process.argv.slice(2);
const cam = camS.split(',').map(Number), look = lookS.split(',').map(Number);
const mechs = mechS.map((m) => { const [id, rest] = m.split(':'); const [x, z, yaw] = rest.split(',').map(Number); return { id, x, z, yaw }; });
const q = mechs.map((m, i) => `p${i + 1}=${m.id}`).join('&') || 'p1=titanus&p2=viper';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 160)));
await p.goto(`http://localhost:5173/?battle=${arena}&${q}&music=0`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__engine && window.__fighters?.length, null, { timeout: 240000 });
await p.waitForTimeout(24000);               // GLBs, props, textures
const r = await p.evaluate(({ cam, look, fov, mechs, hide }) => {
  const process_env_hide = hide;
  const e = window.__engine;
  e.paused = true;
  const ui = document.getElementById('ui-root'); if (ui) ui.style.display = 'none';
  window.__fighters.forEach((f, i) => {
    const m = mechs[i];
    const g = f.mech?.group || f.group;
    if (!m) { g.visible = false; return; }
    g.visible = true;
    g.position.set(m.x, 0, m.z);
    g.rotation.y = m.yaw * Math.PI / 180;
  });
  // THE DIORAMA: hide the chunk buildings (instanced) so the painted horizon
  // shows through, and hide the plaza paint if asked
  let hidden = 0;
  if (process_env_hide) e.scene.traverse((o) => {
    if (o.isInstancedMesh && o.count > 60) { o.visible = false; hidden++; }
  });
  const c = e.camera;
  c.up.set(0, 1, 0); c.position.set(...cam); c.lookAt(...look);
  c.fov = fov; c.updateProjectionMatrix();
  e._render();
  return window.__fighters.map((f) => f.def.id);
}, { cam, look, fov: +fovS, mechs, hide: !!process.env.HIDE });
await p.waitForTimeout(800);
await p.evaluate(() => window.__engine._render());
await p.screenshot({ path: out });
console.log('ok', out, r.join(','));
await b.close();
