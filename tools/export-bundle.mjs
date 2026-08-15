// export-bundle — make the export directory SELF-SUFFICIENT: the models, plus
// the JavaScript needed to actually drive them, plus a runtime that needs
// nothing from this repo.
//
//   node tools/export-bundle.mjs [--out public/models/export]
//
// Run it after `node tools/export-mech.mjs --all`. It adds, alongside the
// per-mech .glb/.json that tool writes:
//
//   mechkit.js     a small runtime — load a mech, play its clips, reach its
//                  anchors and bones. Plain three, no build step, no imports
//                  of its own (you hand it THREE and GLTFLoader), so it drops
//                  into any three app as-is. This is the route that just works.
//   lib/           the REAL animation system, copied whole: the pose-blend
//                  animator, the 121-clip library, the gait engine, the
//                  signatures, the humanoid retarget and the hurtbox capsules.
//                  Computed as the transitive closure of a few entry modules,
//                  so it is whatever the code actually imports today rather
//                  than a list someone has to remember to update.
//   index.json     every mech with its clips and anchors, for picking at
//                  runtime without opening 17 files.
//   README.md      what the two routes are and which to use.
//
// THE CLOSURE ONLY EVER REACHES `three`. That is checked, not assumed — if a
// module ever pulls in something else the bundle stops being copy-and-go, and
// this fails rather than shipping a directory that will not resolve.
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const OUT = path.resolve(ROOT, flag('out', 'public/models/export'));

// What the receiving codebase might want to reach. Everything else comes along
// because one of these imports it.
const ENTRIES = [
  'src/mechs/gltf.js',        // build a mech from a GLB (rig, retarget, anchors)
  'src/mechs/roster.js',      // the defs: stats, palettes, moves
  'src/mechs/animator.js',    // the pose-blend engine + gait
  'src/mechs/animations.js',  // the clip library
  'src/mechs/gaits.js',       // the walk/run tables
  'src/combat/hurtbox.js',    // bone-bound capsules measured off the model
];

function closure(entries) {
  const seen = new Set();
  const external = new Set();
  const walk = (f) => {
    if (seen.has(f) || !fs.existsSync(f)) return;
    seen.add(f);
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec.startsWith('.')) walk(path.resolve(path.dirname(f), spec));
      else external.add(spec.startsWith('three') ? 'three' : spec);
    }
  };
  for (const e of entries) walk(path.join(ROOT, e));
  return { files: [...seen].sort(), external: [...external] };
}

const { files, external } = closure(ENTRIES);
const stray = external.filter((e) => e !== 'three');
if (stray.length) {
  console.error(`the animation system now imports ${stray.join(', ')} as well as three —`
    + ' the bundle would not resolve in a bare project. Add it to the README or vendor it.');
  process.exit(1);
}

// ---- copy the closure ------------------------------------------------------
const LIB = path.join(OUT, 'lib');
fs.rmSync(LIB, { recursive: true, force: true });
let bytes = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const dst = path.join(LIB, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(f, dst);
  bytes += fs.statSync(f).size;
}
// the manifest the deep route reads, for reference
fs.copyFileSync(path.join(ROOT, 'public/models/manifest.json'), path.join(LIB, 'manifest.json'));

// ---- index -----------------------------------------------------------------
const mechs = fs.readdirSync(OUT).filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => f.replace(/\.json$/, ''))
  .filter((id) => fs.existsSync(path.join(OUT, `${id}.glb`)))
  .sort();
const index = { mechs: {} };
for (const id of mechs) {
  const s = JSON.parse(fs.readFileSync(path.join(OUT, `${id}.json`), 'utf8'));
  index.mechs[id] = {
    glb: `${id}.glb`,
    heightUnits: null,
    anchors: s.anchors.map((a) => a.name),
    clips: s.clips.map((c) => c.name),
  };
}
index.note = 'Native units are game units; +z is forward; feet rest on y=0. '
  + 'Anchors are empty nodes named anchor_<name>. Every clip is a real glTF animation.';
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

console.log(`bundle -> ${path.relative(ROOT, OUT)}`);
console.log(`  lib/      ${files.length} modules, ${(bytes / 1024).toFixed(0)} KB, external deps: ${external.join(', ')}`);
console.log(`  index.json ${mechs.length} mechs: ${mechs.join(', ')}`);
console.log(`  (mechkit.js and README.md are checked in under tools/exportkit/ and copied next)`);

for (const f of ['mechkit.js', 'README.md', 'GEOMETRY.md']) {
  const src = path.join(ROOT, 'tools/exportkit', f);
  if (!fs.existsSync(src)) { console.error(`missing tools/exportkit/${f}`); process.exit(1); }
  fs.copyFileSync(src, path.join(OUT, f));
  console.log(`  ${f}`);
}
