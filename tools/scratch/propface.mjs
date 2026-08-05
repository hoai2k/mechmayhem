// "Is this prop facing the fight?" — the picture behind traitprobe's numbers.
//   node tools/scratch/propface.mjs "<battle url>" <propName> <out.png>
// Frames the prop from the ARENA CENTRE side, above the street walls: a prop
// that faces the focal point shows you its FACE, one at a random yaw shows
// you its flank — the picture behind traitprobe's facing-deviation number.
//   node tools/scratch/propface.mjs "<url>" <prop> <out.png>  (__faceBack: dist)
import { chromium } from 'playwright-core';

const [url, propName, out] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world, null, { timeout: 90000 });
await page.waitForTimeout(3000);

const info = await page.evaluate((name) => {
  const w = window.__world, eng = w.engine;
  const hits = w.arena.propGroup.children
    .filter((g) => (g.name || '') === `prop:${name}`)
    .map((g) => ({ g, d: Math.hypot(g.position.x, g.position.z) }))
    .sort((a, b) => a.d - b.d);
  if (!hits.length) return null;
  const t = hits[0].g;
  // ON the line from the arena centre to the prop, `back` units short of it:
  // the sightline (and therefore the meaning) is the centre's, close enough
  // to read a face. Fighters are hidden — one standing in the way is exactly
  // what happens at the centre of a live arena.
  const d = Math.max(1, Math.hypot(t.position.x, t.position.z));
  const THREE = window.__THREE;
  const aim = new THREE.Vector3(t.position.x, 4.0, t.position.z);
  // A 3/4 AERIAL FROM THE CENTRE SIDE: on the line from the arena centre to
  // the prop, `back` units short of it and up above the street walls. Ground
  // level is the truer view but a designed city is full of walls, and a
  // camera wedged into a facade reports nothing about a statue's yaw. From
  // up here the facing still reads plainly — face toward you or flank across
  // you — and the prop's relationship to the road and the plaza reads too.
  const back = Number(window.__faceBack) || 22;
  const k = Math.max(0, (d - back) / d);
  const pos = new THREE.Vector3(t.position.x * k, 16, t.position.z * k);
  eng.camera.position.copy(pos);
  eng.camera.up.set(0, 1, 0);
  eng.camera.lookAt(aim);
  for (const f of w.fighters) f.group.visible = false;
  eng.scene.fog = null;
  // freeze it there: the chase cam would take the view back next frame
  eng.onRender = () => {};
  const yawToCentre = Math.atan2(-t.position.x, -t.position.z);
  const dev = Math.abs(((t.rotation.y - yawToCentre + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return {
    n: hits.length,
    at: [Math.round(t.position.x), Math.round(t.position.z)],
    dist: Math.round(hits[0].d),
    devDeg: +(dev * 180 / Math.PI).toFixed(1),
  };
}, propName);

if (!info) { console.log(`no ${propName} in this arena`); await browser.close(); process.exit(1); }
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
console.log(`${propName}: ${info.n} placed · nearest at ${info.at} (${info.dist} out) · ` +
  `facing deviation from the arena centre ${info.devDeg}°`);
await browser.close();
