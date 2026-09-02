// Arena bake round-trip check: node tools/arenabake.mjs [theme …] [--seed 7]
//
// The arena editor (?edit=level) opens a SHIPPED arena by building it and
// reading `arena.recipe` back as a level (src/arena/bake.js). That is only
// honest if feeding the level back through `themeFromLevel` builds the same
// city — so this does exactly that, in a real browser, and diffs the two
// arenas by what combat can touch: destructible chunks, prop colliders,
// hazards, and every terrain feature.
//
// Prints one line per arena and exits non-zero on any drift.
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
let seed = 7;
const si = args.indexOf('--seed');
if (si >= 0) { seed = Number(args[si + 1]) || 7; args.splice(si, 2); }
// --design <mode>: which design system generates the baked arena (the page
// reads the same stored pref the game does; default = the shipped default)
let design = null;
const di = args.indexOf('--design');
if (di >= 0) { design = args[di + 1]; args.splice(di, 2); }
const themes = args.length ? args : null;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
if (design) {
  await page.addInitScript((d) => {
    try { localStorage.setItem('rw.arenaDesign', d); } catch (e) { /* ok */ }
  }, design);
}
await page.goto('http://localhost:5173/workbench/?edit=level&arena=neon', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__leveleditor, null, { timeout: 30000 });

const results = await page.evaluate(async ({ seed, themes }) => {
  const [{ Arena }, { THEMES }, { themeFromLevel }, { levelFromArena }] = await Promise.all([
    import('/src/arena/arena.js'), import('/src/arena/themes.js'),
    import('/src/arena/level.js'), import('/src/arena/bake.js'),
  ]);
  const engine = window.__leveleditor.engine || null;
  // the editor's engine isn't exported; grab one off the live canvas instead
  const eng = engine || window.__rwEngine;
  const out = [];
  const list = themes || THEMES.map((t) => t.id);
  // What a match can actually touch — if these match, the arena matches.
  // `propBodies` is deliberately NOT in here: a prop's solid collider is
  // measured off its built bounding box, and props swap in a generated GLB
  // model the moment one finishes streaming (props.js propGlbSwap), so the
  // SAME theme at the SAME seed built twice in a row already disagrees by a
  // body or two. Counting it would report the game's own async as bake drift.
  // EVERY destructible system: buildings live in `destructo`, and a theme's
  // large STRUCTURES (crystal, basalt, ice — arena/structures.js) live in one
  // more system per material, so a fingerprint reading only the first would
  // call a lost crystal field a clean round trip.
  const fingerprint = (a) => ({
    chunks: (a.destructoAll || [a.destructo]).reduce((n, d) => n + d.mesh.count, 0),
    buildings: (a.destructoAll || [a.destructo]).reduce((n, d) => n + d.buildings.length, 0),
    systems: (a.destructoAll || [a.destructo]).length,
    props: a.propGroup.children.length,
    explosives: a.explosives.length,
    spikes: a.spikes.length,
    campfires: a.campfires.length,
    lanes: a.terrain.lanes.length,
    hills: a.terrain.hills.length,
    bridges: a.terrain.bridges.length,
    patches: a.terrain.patches.length,
    viaduct: a.terrain.viaduct ? a.terrain.viaduct.nSeg : 0,
    piers: a.terrain.pylonSpots.length,
    bounds: a.bounds,
  });
  for (const id of list) {
    const base = JSON.parse(JSON.stringify(THEMES.find((t) => t.id === id)));
    base.recordRecipe = true;   // Arena only writes the placement list when asked
    const a1 = new Arena(eng, base, seed);
    const f1 = fingerprint(a1);
    const level = levelFromArena(a1, { name: id });
    a1.dispose();
    const a2 = new Arena(eng, themeFromLevel(level), seed);
    const f2 = fingerprint(a2);
    a2.dispose();
    const diff = Object.keys(f1).filter((k) => f1[k] !== f2[k]).map((k) => `${k} ${f1[k]}→${f2[k]}`);
    out.push({ id, objects: level.objects.length, ok: !diff.length, diff, f1 });
  }
  return out;
}, { seed, themes });

let bad = 0;
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(11)} ${String(r.objects).padStart(4)} objects  ` +
    `${r.f1.chunks} chunks · ${r.f1.props} props · ${r.f1.lanes}L/${r.f1.hills}H/${r.f1.bridges}B/${r.f1.patches}P` +
    (r.ok ? '' : `   DRIFT: ${r.diff.join(', ')}`));
  if (!r.ok) bad++;
}
if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); bad++; }
await browser.close();
console.log(bad ? `\n${bad} arena(s) did not survive the round trip.` : '\nAll arenas bake and rebuild identically.');
process.exit(bad ? 1 : 0);
