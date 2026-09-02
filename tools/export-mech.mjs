// export-mech — THE PORTABLE MECH: one self-contained .glb per mech, for use
// outside this game.
//
//   node tools/export-mech.mjs <mechId> [<mechId> …]   # named mechs
//   node tools/export-mech.mjs --all                   # every GLB-backed mech
//   node tools/export-mech.mjs --all --out <dir>       # default public/models/export
//
// WHAT MAKES IT DIFFERENT FROM A BAKE. tools/bake-glb.mjs finalizes a model FOR
// THIS GAME and deliberately leaves the runtime half in the manifest, because
// the game is still there to apply it. Nothing is there for an export, so this
// carries the lot — and three things the shipped asset has never contained:
//
//   · the TRANSFORM (yawOffset x modelScale x heightScale), on the `Armature`
//     node above the joints, so the model imports game-sized and facing the
//     game frame. It is NOT folded into the vertices: the mesh, the skeleton
//     and the clips all stay in one frame, which is the only arrangement in
//     which they cannot disagree. See src/dev/export.js installArmature.
//   · the ANCHORS, as empty nodes named `anchor_<name>` parented to the bone
//     they ride — muzzles, boosters, core, overhead. They are built at runtime
//     from the manifest today and exist in no file.
//   · the ANIMATION. Every shipped GLB has `animations: 0` — the library is
//     procedural — so every clip this mech can actually play is sampled at
//     30fps through the REAL animator and written as glTF keyframe tracks,
//     plus the gait as `walk` and `run` loops and the animator's own jump /
//     hover / crouch / idle LAYERS as held poses. Every clip states the whole
//     skeleton, so a plain AnimationMixer reproduces the game's pose.
//
// It WRITES NOTHING INTO THE GAME: the exports land in their own directory and
// no manifest, model or rig in the repo is touched. Run it whenever a mech's
// art changes; nothing depends on it being up to date.
//
// A sidecar `<id>.json` lists the anchors and clips (and anything that failed
// to sample) so the receiving engine has the index without opening the glb.
//
// Requires the dev server running on :5175 (npm run dev).
import { launch } from './lib/browser.mjs';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || '5175';
const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const OUT = path.resolve(ROOT, flag('out', 'public/models/export'));
const ALL = args.includes('--all');
let ids = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/models/manifest.json'), 'utf8'));
if (ALL) ids = Object.entries(manifest).filter(([, e]) => e && typeof e === 'object' && e.url).map(([k]) => k);
if (!ids.length) {
  console.error('usage: node tools/export-mech.mjs <mechId> […] | --all  [--out <dir>]');
  process.exit(1);
}

const browser = await launch();

async function waitGlobal(page, name, ms = 300000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate((n) => !!window[n], name)) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`timed out waiting for window.${name}`);
}

fs.mkdirSync(OUT, { recursive: true });
const summary = [];
try {
  for (const id of ids) {
    process.stdout.write(`\n== ${id} ==\n`);
    if (!manifest[id]?.url) { console.log('   no GLB entry — skipped'); continue; }
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    let res;
    try {
      await page.goto(`http://127.0.0.1:${PORT}/?export=${id}`, { waitUntil: 'networkidle' });
      await waitGlobal(page, '__exportReady');
      res = await page.evaluate(() => ({ err: window.__exportErr, base64: window.__exportGlb?.base64,
        byteLength: window.__exportGlb?.byteLength, report: window.__exportGlb?.report }));
    } finally { await page.close(); }
    if (res.err) { console.log('   FAILED:', res.err.slice(0, 400)); summary.push({ id, ok: false }); continue; }
    const r = res.report;
    const glb = path.join(OUT, `${id}.glb`);
    fs.writeFileSync(glb, Buffer.from(res.base64, 'base64'));
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({
      mech: id,
      note: 'Standalone export from MECH MAYHEM (tools/export-mech.mjs). WORLD units are '
        + 'game units and +z is forward; anchors are empty nodes named anchor_<name>; '
        + 'every animation is a real glTF clip and states the whole skeleton. Nothing '
        + 'here needs the game to load it.',
      // The yaw and scale ride the named NODE above the joints rather than
      // being folded into the vertices, so the mesh, the skeleton and the clips
      // share one frame. `scale` is therefore the factor between BONE-LOCAL and
      // WORLD units: divide by it before writing a world-measured correction
      // into a bone's local position.
      transform: { node: r.transformNode, yawOffset: r.yawOffset, scale: r.scale,
        appliedTo: 'the node above the joints, not folded into the data' },
      bones: r.bones, vertices: r.verts,
      anchors: r.anchors, clips: r.clips, failed: r.failed,
    }, null, 2) + '\n');
    console.log(`   ${(res.byteLength / 1e6).toFixed(2)} MB · ${r.bones} bones · ${r.verts} verts`);
    console.log(`   transform: yaw ${r.yawOffset}° · scale ${r.scale.toFixed(5)}`
      + `  (on the '${r.transformNode}' node, above the joints)`);
    console.log(`   anchors: ${r.anchors.length ? r.anchors.map((a) => a.name + '@' + a.bone).join(', ') : '(none)'}`);
    console.log(`   clips:   ${r.clips.length}  (${r.clips.slice(0, 8).map((c) => c.name).join(', ')}${r.clips.length > 8 ? ' …' : ''})`);
    if (r.failed.length) console.log(`   NOT SAMPLED (${r.failed.length}): ${r.failed.slice(0, 8).join(', ')}`);
    if (errs.length) console.log('   (page errors:', errs.slice(0, 2), ')');
    summary.push({ id, ok: true, mb: +(res.byteLength / 1e6).toFixed(2), clips: r.clips.length,
      anchors: r.anchors.length, failed: r.failed.length });
  }
} finally { await browser.close(); }

console.log(`\n---- exported to ${path.relative(ROOT, OUT)} ----`);
for (const s of summary) {
  console.log(`  ${s.id.padEnd(10)} ${s.ok ? `${String(s.mb).padStart(6)} MB · ${String(s.clips).padStart(3)} clips · `
    + `${s.anchors} anchors${s.failed ? ` · ${s.failed} not sampled` : ''}` : 'FAILED'}`);
}
const bad = summary.filter((s) => !s.ok).length;
if (bad) { console.log(`\n${bad} failed.`); process.exit(1); }
