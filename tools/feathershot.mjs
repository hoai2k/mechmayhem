// feathershot: the SAME mech, the SAME frame, the SAME camera — once with a
// rigid bind and once feathered. The picture behind tools/featherprobe.mjs.
//
//   node tools/feathershot.mjs <mech> <out.png> [clip] [t] [--rot 30] [--zoom 1]
//
// Writes TWO files, `<out>-rigid.png` and `<out>-feather.png`. Two bodies
// standing side by side would be seen from two different angles, which is
// exactly the comparison that cannot be trusted; these stand in the same place
// and take turns being visible, so flipping between the images moves nothing
// but the skinning.
//
// Both are built through the game's own loader with the manifest's own ops —
// one with the `{feather:…}` op stripped out of them — and stepped to the same
// clip time with a fixed dt, so the poses are identical to the frame.
//
// A mech with no feather op in its manifest renders the same body twice, which
// is the correct (and visibly boring) answer. Needs the dev server on :5173.
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const pos = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const [mech, out, clip = 'heavy', t = '0.35'] = pos;
if (!mech || !out) { console.error('usage: node tools/feathershot.mjs <mech> <out.png> [clip] [t] [--rot deg] [--zoom k]'); process.exit(1); }

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none&debug=3d`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__showcaseMechs && window.__showcaseMechs[0], null, { timeout: 120000 });

const info = await page.evaluate(async ({ mech, clip, t, rot, zoom }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { buildGlbForTool, fetchRawManifest } = await import('/src/mechs/gltf.js');
  const { ROSTER } = await import('/src/mechs/roster.js');
  const engine = window.__showcaseEngine;
  const def = ROSTER.find((d) => d.id === mech);
  const entry = (await fetchRawManifest())[mech];
  const ops = entry.skinOps || [];
  const hasFeather = ops.some((o) => o.feather);

  // clear the showcase's own bodies out of the way
  for (const m of window.__showcaseMechs) m.group.visible = false;
  engine.onUpdate = () => {};

  const builds = [];
  for (const rigid of [true, false]) {
    const { mech: m } = await buildGlbForTool(def, {
      skinOps: rigid ? ops.filter((o) => !o.feather) : ops,
    });
    builds.push(m);
    engine.scene.add(m.group);
  }
  // both stand in the SAME place; the caller flips which one is visible
  for (const m of builds) m.group.rotation.y = rot * Math.PI / 180;
  window.__featherAB = builds;

  // step both to the same clip time with a fixed dt
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  let played = clip;
  for (const m of builds) {
    const an = m.premadeAnimator || m.animator;
    an.action = null;
    try { an.play(clip); } catch (e) { played = null; }
  }
  const steps = Math.max(1, Math.round(+t / (1 / 60)));
  for (let i = 0; i < steps; i++) for (const m of builds) (m.premadeAnimator || m.animator).update(1 / 60, ctx);
  engine.scene.updateMatrixWorld(true);

  // frame the body (they are identical in extent)
  const box = new THREE.Box3().expandByObject(builds[0].group);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const cam = engine.camera;
  const d = Math.max(size.x, size.y) * 1.15 / zoom;
  cam.position.set(c.x, c.y + size.y * 0.05, c.z + d);
  cam.lookAt(c.x, c.y, c.z);
  cam.updateProjectionMatrix();
  engine.render?.();
  return { hasFeather, played, ops: ops.length, steps };
}, { mech, clip, t, rot: +flag('rot', 0), zoom: +flag('zoom', 1) });

const base = out.replace(/\.png$/, '');
for (const [i, tag] of [[0, 'rigid'], [1, 'feather']]) {
  await page.evaluate((k) => window.__featherAB.forEach((m, j) => { m.group.visible = j === k; }), i);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${base}-${tag}.png` });
}
console.log(`${mech}: ${info.ops} op(s), feather ${info.hasFeather ? 'present' : 'ABSENT (both files identical)'} · `
  + `clip ${info.played || '(none — rest pose)'} at ${info.steps} frames → ${base}-rigid.png / ${base}-feather.png`);
await browser.close();
