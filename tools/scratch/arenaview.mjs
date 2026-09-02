// A LOOK AT THE PLACE, from a mech's own eye line.
//   node tools/scratch/arenaview.mjs "<battle url>" <out.png> [yawDeg] [height] [dist]
// Parks the camera out on the spawn ring looking across the arena centre —
// the view a player actually fights in, which is the only honest way to judge
// whether the big structures read.
import { launch } from '../lib/browser.mjs';
// A 6th argument names a STRUCTURE SYSTEM to frame instead of the arena
// centre (`--sys 1`, index into arena.destructoAll — 0 is the buildings).
// Judging a crystal field from the middle of the plaza is judging a
// silhouette 90 units away and six pixels tall.
const [url, out, yawD = '35', hgt = '12', dist = '70', sysArg] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world, null, { timeout: 90000 });
await page.waitForTimeout(3500);
const info = await page.evaluate(({ yawD, hgt, dist, sysArg }) => {
  const w = window.__world, eng = w.engine;
  const a = (+yawD) * Math.PI / 180;
  // where to look: the arena centre, or the biggest mass of a named system
  let tx = 0, tz = 0, ty = 5;
  if (sysArg !== undefined && sysArg !== null) {
    const d = (w.arena.destructoAll || [])[+sysArg];
    const b = d?.buildings.slice().sort((p, q) => q.chunkCount - p.chunkCount)[0];
    if (b?.aabb) {
      tx = (b.aabb.minX + b.aabb.maxX) / 2;
      tz = (b.aabb.minZ + b.aabb.maxZ) / 2;
      ty = b.aabb.maxY * 0.45;
    }
  }
  // framing a structure means framing IT: fog off (these arenas are murky by
  // design and a silhouette judged through it is a judgement of the fog) and
  // the distance scaled to the mass, so the picture is the same size
  // whatever the thing happens to be
  if (sysArg !== undefined && sysArg !== null) {
    eng.scene.fog = null;
    // and only IT: props and the other systems in front of a landform are
    // the reason three attempts at this picture came back showing scenery
    (w.arena.destructoAll || []).forEach((d, i) => { d.mesh.visible = (i === +sysArg); });
    if (w.arena.propGroup) w.arena.propGroup.visible = false;
    if (dist === 'auto') dist = String(Math.max(40, ty * 3.4));
  }
  // HOLD THE CAMERA EVERY FRAME. Setting it once is not enough — the game's
  // own update runs after this and puts it back on the fighters, so the
  // screenshot taken a second later is of the match camera and the framing
  // computed here is invisible in the picture (three attempts at judging a
  // crystal field went that way).
  const place = () => {
    eng.camera.position.set(tx + Math.cos(a) * +dist, +hgt + ty, tz + Math.sin(a) * +dist);
    eng.camera.up.set(0, 1, 0);
    eng.camera.lookAt(tx, ty, tz);
    eng.camera.updateMatrixWorld(true);
  };
  place();
  const hold = () => { place(); requestAnimationFrame(hold); };
  requestAnimationFrame(hold);
  eng.onRender = () => {};
  for (const f of w.fighters) f.group.visible = false;
  const counts = {};
  for (const d of w.arena.destructoAll || []) counts[d.buildings.length] = (counts[d.buildings.length] || 0);
  return {
    // each system with the shape it draws and how big its masses are, so a
    // picture can be tied to the thing it is a picture of
    systems: (w.arena.destructoAll || []).map((d, i) => {
      const hs = d.buildings.map((b) => (b.aabb ? +(b.aabb.maxY).toFixed(1) : 0));
      const ws = d.buildings.map((b) => (b.aabb ? +(b.aabb.maxX - b.aabb.minX).toFixed(1) : 0));
      return `[${i}] ${d.buildings.length} masses / ${d.count} chunks · `
        + `h ${Math.min(...hs)}-${Math.max(...hs)} · w ${Math.min(...ws)}-${Math.max(...ws)}`;
    }),
    framed: { tx: +tx.toFixed(1), tz: +tz.toFixed(1), ty: +ty.toFixed(1) },
    // where the framed mass LANDS ON SCREEN, in pixels. Without this a
    // picture that shows nothing where the subject should be is unfalsifiable
    // — is the camera wrong, or is the thing small?
    onScreen: (() => {
      const d = (w.arena.destructoAll || [])[+sysArg];
      const bb = d?.buildings.slice().sort((p, q) => q.chunkCount - p.chunkCount)[0]?.aabb;
      if (!bb) return null;
      eng.camera.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const V = window.__THREE.Vector3;
      for (const cx of [bb.minX, bb.maxX]) {
        for (const cy of [bb.minY, bb.maxY]) {
          for (const cz of [bb.minZ, bb.maxZ]) {
            const v = new V(cx, cy, cz).project(eng.camera);
            x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
            y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
          }
        }
      }
      const W = eng.renderer.domElement.width, H = eng.renderer.domElement.height;
      return {
        px: [Math.round((x0 + 1) / 2 * W), Math.round((x1 + 1) / 2 * W)],
        py: [Math.round((1 - y1) / 2 * H), Math.round((1 - y0) / 2 * H)],
      };
    })(),
  };
}, { yawD, hgt, dist, sysArg: sysArg ?? null });
await page.waitForTimeout(1500);
// where the camera ACTUALLY is when the picture is taken — the tool set it,
// but the match camera runs too, and a framing that has been overwritten
// looks exactly like a subject that is not there
const cam = await page.evaluate(() => {
  const c = window.__world.engine.camera.position;
  return [c.x, c.y, c.z].map((v) => +v.toFixed(1));
});
await page.screenshot({ path: out, timeout: 120000 });
console.log(JSON.stringify({ ...info, camAtShot: cam }));
await browser.close();
