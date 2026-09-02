// Enclave audit: find + fix small patches of geometry bound to a DIFFERENT
// bone than everything around them ("a spot of the wrong color in a solid
// region" in ?debug=skin) — a hip plate on a hand bone, a knuckle on a thigh.
// The fix mirrors what a human does in the workbench: rebind each patch to
// the bone owning its surroundings. See skinops.enclaveScan.
//
//   node tools/enclaveaudit.mjs [baseUrl] [mechId,...] [--apply]
//
// Without --apply: report per mech. With --apply: append the generated ops
// to each mech's manifest skinOps (they compose — the scan runs on the
// SHIPPED state, post existing ops, and selects pristine island ids exactly
// like the runtime applier).
import { launch } from './lib/browser.mjs';
import fs from 'fs';

const args = process.argv.slice(2).filter((a) => a !== '--apply');
const APPLY = process.argv.includes('--apply');
const base = args[0] || 'http://127.0.0.1:5175';
const only = args[1] ? args[1].split(',') : null;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 200)));

await page.goto(`${base}/?rigtest`, { waitUntil: 'networkidle' });
const ids = await page.evaluate(async (only) => {
  const { fetchRawManifest } = await import('/src/mechs/gltf.js');
  const m = await fetchRawManifest();
  return Object.keys(m).filter((k) => m[k]?.url && (!only || only.includes(k)));
}, only);

const allOps = {};
for (const id of ids) {
  await page.goto(`${base}/?debug=skin&id=${id}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__skinTool?.mesh, null, { timeout: 60000 }).catch(() => {});
  const res = await page.evaluate(async () => {
    const t = window.__skinTool;
    if (!t?.mesh) return { error: 'not ready' };
    const { enclaveScan } = await import('/src/mechs/skinops.js');
    // t.analysis = pristine partition, boneNames updated by the committed
    // ops the workbench applied at load — the exact contract enclaveScan needs
    return enclaveScan(t.mesh, t.analysis);
  });
  if (res.error) { console.log(`${id}: ERROR ${res.error}`); continue; }
  console.log(`${id}: ${res.ops.length} enclaves`);
  for (const r of res.report.slice(0, 12)) {
    console.log(`   #${r.island} ${r.from} (${r.count}v, ${Math.round(r.surround * 100)}% surrounded) -> ${r.to}${r.round ? ` [round ${r.round}]` : ''}`);
  }
  if (res.report.length > 12) console.log(`   ... +${res.report.length - 12} more`);
  if (res.ops.length) allOps[id] = res.ops;
}
await browser.close();

if (APPLY && Object.keys(allOps).length) {
  const path = 'public/models/manifest.json';
  const m = JSON.parse(fs.readFileSync(path, 'utf8'));
  let total = 0;
  for (const [id, ops] of Object.entries(allOps)) {
    if (!m[id]) continue;
    m[id].skinOps = [...(m[id].skinOps || []), ...ops];
    total += ops.length;
  }
  fs.writeFileSync(path, JSON.stringify(m, null, 2) + '\n');
  console.log(`\napplied ${total} enclave ops to ${path}`);
} else if (Object.keys(allOps).length) {
  console.log('\n(re-run with --apply to append these ops to the manifest)');
}
