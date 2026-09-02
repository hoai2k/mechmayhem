// Freeze every GLB's rendered scale into the manifest as `modelScale`.
//
// WHY: a GLB's size must be a function of the FILE plus one manifest number —
// never of where its rig's bones sit. gltf.js used to auto-size a model by
// matching its rendered HEAD-REGION top to the procedural canonical head top,
// which reads both bone positions AND the skin weights. That made re-rigging a
// character silently resize it: giving TITANUS a correct skeleton moved his
// "head region" off the tall back exhaust towers and onto his actual head, and
// he came out 5.7% bigger. The head match is only a BOOTSTRAP for a brand-new
// GLB. This tool captures what it produced and pins it, after which gltf.js
// skips the match entirely and rig edits can never change height again.
//
//   node tools/pin-modelscale.mjs [baseUrl] [--check] [--repin] [ids]
//
//     --check   report only, exit 1 if anything is unpinned (CI-friendly)
//     --repin   RE-derive and overwrite existing pins. Only correct when you
//               deliberately want a new canonical size — the pinned number is
//               the size of record, and re-deriving it after a rig change is
//               exactly the silent resize this whole mechanism exists to stop.
//     ids       comma-separated mech ids (default: every manifest entry)
//
// Idempotent by default: an entry that already has `modelScale` is left alone.
import { readFileSync, writeFileSync } from 'fs';
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const rest = args.filter((a) => !a.startsWith('--'));
const base = rest.find((a) => a.startsWith('http')) || 'http://localhost:5173';
const only = rest.find((a) => !a.startsWith('http'))?.split(',') || null;
const checkOnly = flags.has('--check');
const repin = flags.has('--repin');

const PATH = new URL('../public/models/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(PATH, 'utf8'));

// every (id, alt?) slot that names a GLB
const slots = [];
for (const [id, e] of Object.entries(manifest)) {
  if (!e || typeof e !== 'object' || !e.url) continue;
  if (only && !only.includes(id)) continue;
  slots.push({ id, alt: false, pinned: e.modelScale ?? null });
  if (e.alt?.url) slots.push({ id, alt: true, pinned: e.alt.modelScale ?? null });
}
if (!slots.length) { console.error('no matching manifest entries'); process.exit(1); }

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 200)));
await page.goto(`${base}/?rigtest`, { waitUntil: 'networkidle' });

const results = [];
for (const s of slots) {
  // Leave existing pins alone: the pinned number IS the size of record.
  if (s.pinned != null && !repin) { results.push({ ...s, action: 'keep' }); continue; }
  const got = await page.evaluate(async ({ id, alt }) => {
    const { buildGlbForTool } = await import('/src/mechs/gltf.js');
    const { ROSTER_BY_ID } = await import('/src/mechs/roster.js');
    const def = ROSTER_BY_ID[id];
    if (!def) return { error: 'no roster def' };
    try {
      // modelScale:null forces gltf.js to DERIVE (bootstrap) rather than read a pin
      const { mech } = await buildGlbForTool(def, { modelScale: null }, { alt });
      if (!mech?.modelScaleInfo) return { error: 'no modelScaleInfo (procedural fallback?)' };
      return { base: mech.modelScaleInfo.base };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  }, { id: s.id, alt: s.alt });
  if (got.error) { results.push({ ...s, action: 'FAIL', error: got.error }); continue; }
  results.push({ ...s, derived: got.base, action: s.pinned != null ? 'repin' : 'pin' });
}
await browser.close();

const label = (s) => `${s.id}${s.alt ? '.alt' : ''}`;
for (const r of results) {
  const d = r.derived != null ? r.derived.toFixed(5) : '—';
  console.log(`  ${label(r).padEnd(16)} ${r.action.padEnd(6)} derived=${d.padStart(10)}`
    + (r.pinned != null ? `  pinned=${r.pinned}` : '') + (r.error ? `  ${r.error}` : ''));
}
const failed = results.filter((r) => r.action === 'FAIL');
const todo = results.filter((r) => r.action === 'pin' || r.action === 'repin');
if (failed.length) console.error(`\n${failed.length} entr${failed.length === 1 ? 'y' : 'ies'} could not be measured`);

if (checkOnly) {
  const unpinned = results.filter((r) => r.pinned == null);
  console.log(`\n--check: ${unpinned.length} unpinned of ${results.length}`);
  process.exit(unpinned.length || failed.length ? 1 : 0);
}
if (!todo.length) { console.log('\nnothing to do — every entry is already pinned'); process.exit(failed.length ? 1 : 0); }

// ---- write: targeted text edit, so the rest of manifest.json keeps its exact
// formatting (a full re-serialize reflows every mech's compact one-line blocks)
const src = readFileSync(PATH, 'utf8');
const lines = src.split('\n');
const want = new Map(todo.map((r) => [`${r.id}|${r.alt}`, r.derived]));
// entries being re-pinned: their EXISTING modelScale line must be dropped, not
// duplicated (the fresh value is inserted after the url line below)
const stale = new Set(todo.filter((r) => r.action === 'repin').map((r) => `${r.id}|${r.alt}`));
const out = [];
let curId = null;
for (const line of lines) {
  const idM = /^ {2}"([A-Za-z0-9_]+)": \{$/.exec(line);
  if (idM) curId = idM[1];
  // drop the superseded pin
  const oldM = /^( {4}| {6})"modelScale": /.exec(line);
  if (oldM && curId && stale.has(`${curId}|${oldM[1].length === 6}`)) continue;
  out.push(line);
  // a `"url"` line at 4 spaces belongs to the primary, at 6 spaces to its alt
  const urlM = /^( {4}| {6})"url": /.exec(line);
  if (!urlM || !curId) continue;
  const isAlt = urlM[1].length === 6;
  const key = `${curId}|${isAlt}`;
  if (!want.has(key)) continue;
  out.push(`${urlM[1]}"modelScale": ${+want.get(key).toFixed(5)},`);
  want.delete(key);
}
if (want.size) {
  console.error(`\nABORT: could not place modelScale for: ${[...want.keys()].join(', ')}`);
  process.exit(1);
}
const text = out.join('\n');
// validate before writing
const after = JSON.parse(text);
for (const r of todo) {
  const e = r.alt ? after[r.id].alt : after[r.id];
  if (Math.abs(e.modelScale - +r.derived.toFixed(5)) > 1e-9) {
    console.error(`ABORT: ${label(r)} did not take the pin`); process.exit(1);
  }
}
// nothing outside the touched entries may change semantically
const before = JSON.parse(src);
for (const id of Object.keys(before)) {
  const strip = (o) => {
    if (!o || typeof o !== 'object') return o;
    const { modelScale, alt, ...r } = o;
    return { ...r, ...(alt ? { alt: strip(alt) } : {}) };
  };
  if (JSON.stringify(strip(before[id])) !== JSON.stringify(strip(after[id]))) {
    console.error(`ABORT: entry ${id} changed beyond modelScale`); process.exit(1);
  }
}
writeFileSync(PATH, text);
console.log(`\npinned ${todo.length} entr${todo.length === 1 ? 'y' : 'ies'}; manifest.json updated`);
if (failed.length) process.exit(1);
