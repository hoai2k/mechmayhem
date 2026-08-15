// bake-all — run tools/bake-glb.mjs over every GLB-backed mech.
//
//   node tools/bake-all.mjs            # DRY RUN every mech, report the table
//   node tools/bake-all.mjs --apply    # bake the ones that PASS, skip the rest
//   node tools/bake-all.mjs --apply <id> [...]   # just these
//
// bake-glb refuses to --apply a mech whose check failed (and puts the tree
// back), so this can be left to run: a mech that regresses is skipped and
// reported rather than landing quietly in the middle of a batch.
//
// Requires the dev server on :5175.
import { spawn } from 'node:child_process';
import fs from 'fs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const only = args.filter((a) => !a.startsWith('--'));
const manifest = JSON.parse(fs.readFileSync('public/models/manifest.json', 'utf8'));
const ids = (only.length ? only
  : Object.entries(manifest).filter(([, e]) => e && typeof e === 'object' && e.url).map(([k]) => k));

const run = (id) => new Promise((resolve) => {
  const a = ['tools/bake-glb.mjs', id];
  if (APPLY) a.push('--apply');
  const p = spawn(process.execPath, a, { env: { ...process.env, PORT: process.env.PORT || '5175' } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ code, out }));
});

const grab = (out, re) => (out.match(re) || [])[1];
const rows = [];
for (const id of ids) {
  process.stdout.write(`\n=== ${id} …`);
  const { code, out } = await run(id);
  const pass = /PASS ✓/.test(out);
  const row = {
    id, pass, code,
    shape: grab(out, /shape deviation \(joints rel\. hips\): ([\d.]+)/),
    skin: grab(out, /worst ([\d.]+)% of height/),
    size: grab(out, /rendered size: ([\d.]+)%/),
    anchor: grab(out, /worst rest offset ([\d.]+) world-units/),
    why: grab(out, /FAIL ✗ ([^—]+) over tolerance/),
    removed: grab(out, /---- manifest entry: fields removed ----\n\s+(.+)/),
    verts: /vertex count: unchanged/.test(out) ? 'same' : 'CHANGED',
  };
  rows.push(row);
  process.stdout.write(` ${pass ? 'PASS' : 'FAIL'}${row.why ? ' (' + row.why.trim() + ')' : ''}`
    + `  skin ${row.skin}%  size ${row.size}%\n`);
  if (!pass) fs.writeFileSync(`/tmp/bake-${id}.log`, out);
}

console.log('\n\n mech        pass  skin%   size%   shape    anchor   verts   fields removed');
for (const r of rows) {
  console.log(` ${r.id.padEnd(11)} ${(r.pass ? ' ok ' : 'FAIL').padEnd(5)} `
    + `${String(r.skin ?? '-').padStart(6)} ${String(r.size ?? '-').padStart(7)} `
    + `${String(r.shape ?? '-').padStart(8)} ${String(r.anchor ?? '-').padStart(8)} `
    + `${(r.verts || '-').padStart(7)}   ${r.removed || ''}`);
}
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} pass.`
  + (bad.length ? `  failed: ${bad.map((r) => r.id).join(', ')}  (logs in /tmp/bake-<id>.log)` : ''));
if (APPLY) console.log(bad.length ? 'The failures were NOT applied — the tree is as they left it.' : 'All applied.');
