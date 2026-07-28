#!/usr/bin/env node
// Tripo image→GLB pipeline for ARENA PROPS (no rig — static set pieces).
//
// Per prop: upload docs/tripo/<name>.png → image_to_model on the P1 line
// (enable_image_autofix, face_limit 20000 — cleaner watertight geometry, the
// project's "higher quality" route) → download the textured GLB to
// public/models/props/<name>.glb. The file name IS the binding: the loader
// reads public/models/props/manifest.json (already lists every prop with a
// `fit` height) and auto-scales/grounds the model. NO rigging: props don't
// animate, so we skip animate_prerigcheck / animate_rig entirely.
//
// Credits: P1 image_to_model textured = 50; no rig. Balance is checked before
// each prop and the exact per-task spend recorded from consumed_credit.
//
// Usage (needs the sandbox proxy env for outbound fetch):
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
//     TRIPO_API_KEY=... node tools/tripoprops.mjs <name> [name...]
//   ... node tools/tripoprops.mjs --all      # every docs/tripo/*.png
//   node tools/tripoprops.mjs --status       # print state table
//   ... node tools/tripoprops.mjs --redo <name>
//
// State: tools/tripo-props-state.json (committed) — task ids + spend per prop,
// so a later run resumes where this left off (done props are skipped). NOT
// parallel-safe: run one process at a time.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://api.tripo3d.ai/v2/openapi';
const KEY = process.env.TRIPO_API_KEY;
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

// --kind selects the asset preset. props (default): P1 line, 50cr, cleaner
// mesh for hero landmarks. buildings: H3 line, 30cr — these are VOXELIZED
// into the chunk grid at load, so mesh fidelity barely matters; cheaper is
// correct. Each preset has its own input dir / output dir / state file.
const rawArgs = process.argv.slice(2);
const kindIdx = rawArgs.indexOf('--kind');
const KIND = kindIdx >= 0 ? rawArgs[kindIdx + 1] : 'props';
if (kindIdx >= 0) rawArgs.splice(kindIdx, 2);
const PRESETS = {
  props: {
    imgDir: path.join(ROOT, 'docs', 'tripo'),
    outDir: path.join(ROOT, 'public', 'models', 'props'),
    outRel: 'public/models/props',
    state: path.join(ROOT, 'tools', 'tripo-props-state.json'),
    route: 'p1', cost: 50,
  },
  buildings: {
    imgDir: path.join(ROOT, 'docs', 'tripo', 'buildings'),
    outDir: path.join(ROOT, 'public', 'models', 'buildings'),
    outRel: 'public/models/buildings',
    state: path.join(ROOT, 'tools', 'tripo-buildings-state.json'),
    route: 'h3', cost: 30,
  },
};
const CFG = PRESETS[KIND];
if (!CFG) { console.error(`unknown --kind ${KIND} (props | buildings)`); process.exit(1); }
const IMG_DIR = CFG.imgDir, OUT_DIR = CFG.outDir, STATE_FILE = CFG.state;

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

const auth = { Authorization: `Bearer ${KEY}` };
async function api(method, ep, body) {
  const res = await fetch(BASE + ep, {
    method,
    headers: body ? { ...auth, 'Content-Type': 'application/json' } : auth,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.code !== 0) throw new Error(`${ep} -> HTTP ${res.status} ${JSON.stringify(j)}`);
  return j.data;
}

async function upload(imagePath) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(imagePath)], { type: 'image/png' }), path.basename(imagePath));
  const res = await fetch(`${BASE}/upload/sts`, { method: 'POST', headers: auth, body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.code !== 0) throw new Error(`upload -> HTTP ${res.status} ${JSON.stringify(j)}`);
  return j.data.image_token;
}

async function poll(taskId, label) {
  for (let i = 0; ; i++) {
    const d = await api('GET', `/task/${taskId}`);
    if (d.status === 'success') return d;
    if (['failed', 'banned', 'expired', 'cancelled', 'unknown'].includes(d.status)) {
      throw new Error(`${label} task ${taskId} ${d.status}`);
    }
    if (i % 6 === 0) console.log(`  ${label}: ${d.status} ${d.progress ?? 0}%` +
      (d.queuing_num > 0 ? ` (queue ${d.queuing_num})` : ''));
    await new Promise((r) => setTimeout(r, 10000));
  }
}

async function download(url, outPath) {
  const res = await fetch(url); // model URLs expire ~5 min — call right after poll
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return fs.statSync(outPath).size;
}

async function balance() { return (await api('GET', '/user/balance')).balance; }

async function runProp(name) {
  const rec = (state[name] ||= {});
  if (rec.done) { console.log(`${name}: already done (${rec.glb}) — skip`); return; }
  const img = path.join(IMG_DIR, `${name}.png`);
  if (!fs.existsSync(img)) throw new Error(`${name}: no image at ${img}`);

  const bal = await balance();
  console.log(`\n=== ${name} [${KIND}/${CFG.route}] (balance ${bal})`);
  if (bal < CFG.cost + 10) throw new Error(`balance ${bal} too low for another (~${CFG.cost} needed) — stopping`);

  // model generation only — no rig. (reuse a prior task on resume)
  if (!rec.modelTask || rec.modelFailed) {
    const token = await upload(img);
    // P1: cleaner watertight mesh + autofix (hero props). H3: v3.x line at a
    // high face budget, cheaper — right for buildings that get voxelized.
    const payload = CFG.route === 'p1'
      ? { model_version: 'P1-20260311', enable_image_autofix: true, face_limit: 20000 }
      : { model_version: 'v3.1-20260211', face_limit: 150000 };
    const t = await api('POST', '/task', {
      type: 'image_to_model',
      file: { type: 'png', file_token: token },
      ...payload,
    });
    rec.modelTask = t.task_id; rec.modelFailed = false; save();
  }
  let modelDone;
  try { modelDone = await poll(rec.modelTask, `${name} model`); }
  catch (e) { rec.modelFailed = true; save(); throw e; }
  rec.modelCredits = modelDone.consumed_credit; save();

  // download immediately (urls expire in ~5 minutes)
  const url = modelDone.output?.pbr_model ?? modelDone.output?.model;
  if (!url) throw new Error(`${name}: model task has no url: ${JSON.stringify(modelDone.output)}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const glb = `${CFG.outRel}/${name}.glb`;
  const size = await download(url, path.join(ROOT, glb));
  const preview = modelDone.output?.rendered_image;
  if (preview) await download(preview, path.join(ROOT, 'tools', `tripo-${KIND}-${name}.png`)).catch(() => {});
  rec.glb = glb; rec.bytes = size; rec.done = true; save();
  console.log(`  DONE ${glb} (${(size / 1e6).toFixed(1)} MB, ${rec.modelCredits ?? '?'} credits)`);
}

const allNames = () => fs.readdirSync(IMG_DIR).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();

const args = rawArgs;   // --kind already stripped
if (args[0] === '--status') {
  let spent = 0, done = 0;
  for (const [name, r] of Object.entries(state)) {
    spent += r.modelCredits ?? 0; if (r.done) done++;
    console.log(`${name.padEnd(18)} done=${r.done ? 'Y' : 'n'} ` +
      `${r.bytes ? (r.bytes / 1e6).toFixed(1) + 'MB' : '-'} credits=${r.modelCredits ?? '-'}`);
  }
  console.log(`\n${done} done, ${spent} credits spent`);
  process.exit(0);
}

if (!KEY) { console.error('TRIPO_API_KEY not set'); process.exit(1); }

let names;
if (args[0] === '--all') names = allNames();
else if (args[0] === '--redo') { names = args.slice(1); for (const n of names) delete state[n]; save(); }
else names = args;
if (!names.length) { console.error('usage: tripoprops.mjs <name...> | --all | --redo <name> | --status'); process.exit(1); }

let ok = 0, fail = 0;
for (const name of names) {
  try { await runProp(name); ok++; }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); fail++; }
}
console.log(`\n=== ${ok} ok, ${fail} failed. Final balance: ${await balance().catch(() => '?')}`);
