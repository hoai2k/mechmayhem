// bake-glb — finalize a mech's GLB: bake every geometry/skeleton/skin edit
// (custom rig, skinOps, reparent, rig posts, stretch, bonePos) into the .glb,
// strip the now-redundant manifest fields, and (custom-rig) remove the mech's
// rig file. Produces ONE reversible changelist: `git revert`/`checkout` restores
// the exact prior state (the shared bake/rig engine is never removed).
//
//   node tools/bake-glb.mjs <mechId>            # DRY RUN (default)
//   node tools/bake-glb.mjs <mechId> --apply    # write the changes
//
// Dry run bakes to public/models/mech_<id>.baked.glb, prints the fidelity report
// + proposed manifest diff, and touches no committed file. --apply overwrites
// mech_<id>.glb, rewrites the manifest entry, and removes the rig file/registry.
// Both run a FIDELITY CHECK: build the mech pre-bake (current files) and
// post-bake (baked glb via the stock load path) and compare joint world
// positions across poses — it aborts/warns if they drift.
//
// THE SOURCE IS KEPT. --apply first copies the untouched asset to
// public/models/source/mech_<id>.glb (once — a second bake never overwrites the
// true original) and writes public/models/source/<id>.edits.json: every manifest
// field that was folded in, with its values, plus the custom rig file's text.
// So the baked model stays explainable and re-derivable without digging through
// git history, and a re-bake from source is one copy away.
//
// THE FIDELITY CHECK ONLY SEES JOINTS. It compares the 15 game joints across
// three poses, which catches a broken skeleton and nothing else — it cannot see
// skinning, and it cannot see a glbanim profile hook that stopped firing. Baking
// jerry silently stopped his cannon pods aiming (the hook bails when
// mech.rigBones is empty, which used to be the case for every stock skeleton)
// and this check passed at 0.0001. So after a bake, also run:
//     node tools/skindebug.mjs <id>     — same findings, same severities?
//     node tools/weldmap.mjs <id> --list — same welds?
//     node tools/postercheck.mjs <id>   — and regenerate the poster
//
// Requires the dev server running on :5175 (npm run dev).
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || '5175';
const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'public/models/manifest.json');
const JOINTS = ['hips', 'torso', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR',
  'elbowR', 'handR', 'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR'];
// Deterministic test poses (degrees per joint), applied DIRECTLY to the virtual
// joints then retargeted — no animation/smoothing, so the pre-bake and post-bake
// builds are compared apples-to-apples (idle sway would otherwise desync them).
const TEST_POSES = {
  rest: {},
  arms: { shoulderL: [-80, -10, 20], elbowL: [-70, 0, 0], shoulderR: [-80, 10, -20], elbowR: [-70, 0, 0], torso: [10, 15, 0] },
  legs: { thighL: [-40, 0, 5], kneeL: [60, 0, 0], thighR: [30, 0, -5], kneeR: [20, 0, 0], hipsRot: [0, 20, 0] },
};
const POSES = Object.keys(TEST_POSES);
const FID_EPS = 0.01; // world-unit tolerance (mech ~7u tall)

const id = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!id) { console.error('usage: node tools/bake-glb.mjs <mechId> [--apply]'); process.exit(1); }

// ---- manifest entry cleaning (surgical, preserves the file's formatting) ----
const BAKED_FIELDS = ['rig', 'skinOps', 'seamCuts', 'reparent', 'stretch', 'bonePos', 'alt'];
function cleanEntry(text, mechId, customRig) {
  const m = JSON.parse(text);
  const entry = m[mechId];
  if (!entry) throw new Error(`no manifest entry "${mechId}"`);
  const removed = [];
  const clean = {};
  for (const [k, v] of Object.entries(entry)) {
    if (BAKED_FIELDS.includes(k)) { removed.push(k); continue; }
    if (k === 'boneOverrides' && customRig) { removed.push(k); continue; } // bones now named as joints
    clean[k] = v;
  }
  // locate the entry's line block and splice in the pretty-printed clean entry
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => l.trimStart().startsWith(`"${mechId}":`));
  if (startIdx < 0) throw new Error(`could not locate "${mechId}" block`);
  let depth = 0, endIdx = -1;
  for (let i = startIdx; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (i > startIdx && depth === 0) { endIdx = i; break; }
  }
  const trailingComma = lines[endIdx].trimEnd().endsWith(',');
  const body = JSON.stringify({ [mechId]: clean }, null, 2)
    .split('\n').slice(1, -1)          // drop the outer { }
    .map((l) => '  ' + l).join('\n');  // re-indent to top-level entry depth
  const replaced = body + (trailingComma ? ',' : '');
  const out = [...lines.slice(0, startIdx), replaced, ...lines.slice(endIdx + 1)].join('\n');
  return { out, removed, clean };
}

// ---- browser helpers ----
async function waitGlobal(page, name, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate((n) => !!window[n], name)) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`timed out waiting for window.${name}`);
}

async function getBakedGlb(browser) {
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/?bake=${id}`, { waitUntil: 'networkidle' });
  await waitGlobal(page, '__bakeReady');
  const res = await page.evaluate(() => ({ err: window.__bakeErr, base64: window.__bakeGlb?.base64,
    byteLength: window.__bakeGlb?.byteLength, report: window.__bakeGlb?.report }));
  await page.close();
  if (res.err) throw new Error('bake failed: ' + res.err);
  if (errs.length) console.warn('  (page errors during bake:', errs.slice(0, 2), ')');
  return { buffer: Buffer.from(res.base64, 'base64'), report: res.report };
}

// Build the mech (current on-disk files) and read joint world positions across
// a few deterministic poses. Uses the real ?debug=3d load path.
async function capturePoses(browser, tag) {
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/?battle=neon&p1=${id}&p2=titanus&debug=3d`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(9000);
  const data = await page.evaluate(({ TEST_POSES, JOINTS }) => {
    const F = window.__fighters, f = F[0];
    if (!f?.mech?.isGLB) return { err: 'mech is not GLB (fell back to procedural?)' };
    F[1].controlsLocked = true; f.controlsLocked = true;
    f.yaw = f.targetYaw = 0; f.group.rotation.y = 0;
    const V = f.pos.constructor, R = (d) => d * Math.PI / 180;
    const J = f.mech.joints, bm = f.mech.boneMap;
    const read = () => { const o = {}; for (const j of JOINTS) { const b = bm[j]; o[j] = b
      ? [+b.getWorldPosition(new V()).x.toFixed(4), +b.getWorldPosition(new V()).y.toFixed(4), +b.getWorldPosition(new V()).z.toFixed(4)] : null; } return o; };
    const out = {};
    for (const [pose, def] of Object.entries(TEST_POSES)) {
      // reset all virtual joints, then apply the fixed pose, then retarget
      for (const jn of JOINTS) J[jn]?.rotation.set(0, 0, 0);
      if (J.hips) J.hips.rotation.set(0, 0, 0);
      for (const [jn, e] of Object.entries(def)) {
        if (jn === 'hipsRot') { J.hips?.rotation.set(R(e[0]), R(e[1]), R(e[2])); continue; }
        J[jn]?.rotation.set(R(e[0]), R(e[1]), R(e[2]));
      }
      f.mech.postAnimate();
      out[pose] = read();
    }
    const hy = bm.head ? +bm.head.getWorldPosition(new V()).y.toFixed(4) : null;
    return { poses: out, mapped: Object.keys(bm).length, scale: +(f.scale || 0).toFixed(5), headY: hy };
  }, { TEST_POSES, JOINTS });
  await page.close();
  if (data.err) throw new Error(`${tag}: ${data.err}`);
  if (errs.length) console.warn(`  (${tag} page errors:`, errs.slice(0, 2), ')');
  return data;
}

// SHAPE fidelity: compare each joint RELATIVE TO HIPS, so a benign uniform
// grounding offset (the whole mech sitting a hair higher/lower — it re-grounds
// to the arena floor at runtime anyway) doesn't mask or inflate the number.
// A real skeleton/skin error shows up as a non-uniform relative deviation.
// `groundOffset` reports that global shift separately, for information.
function fidelity(a, b) {
  let max = 0, worst = null, ground = 0;
  for (const pose of POSES) {
    const ha = a.poses[pose]?.hips, hb = b.poses[pose]?.hips;
    if (ha && hb) ground = Math.max(ground, Math.hypot(ha[0] - hb[0], ha[1] - hb[1], ha[2] - hb[2]));
    for (const j of JOINTS) {
      const pa = a.poses[pose]?.[j], pb = b.poses[pose]?.[j];
      if (!pa || !pb || !ha || !hb) continue;
      // position relative to hips (translation-invariant)
      const d = Math.hypot((pa[0] - ha[0]) - (pb[0] - hb[0]),
        (pa[1] - ha[1]) - (pb[1] - hb[1]), (pa[2] - ha[2]) - (pb[2] - hb[2]));
      if (d > max) { max = d; worst = `${pose}/${j}`; }
    }
  }
  return { max: +max.toFixed(5), worst, ground: +ground.toFixed(4) };
}

// ---- rig-file removal (custom rig) ----
function removeRigFile(mechId) {
  const rigPath = path.join(ROOT, `src/mechs/rigs/${mechId}.rig.js`);
  const idxPath = path.join(ROOT, 'src/mechs/rigs/index.js');
  const changed = [];
  if (fs.existsSync(rigPath)) { fs.rmSync(rigPath); changed.push(rigPath); }
  if (fs.existsSync(idxPath)) {
    const CONST = `${mechId.toUpperCase()}_RIG`;
    const kept = fs.readFileSync(idxPath, 'utf8').split('\n').filter((l) => {
      const t = l.trim();
      if (t.startsWith('import') && t.includes(CONST)) return false;      // import line
      if (t.startsWith(`${mechId}:`) && t.includes(CONST)) return false;  // registry line
      return true;
    }).join('\n');
    fs.writeFileSync(idxPath, kept); changed.push(idxPath);
  }
  return changed;
}

// ---- keep the source + the edit list ----
// A baked asset has swallowed its own recipe: the manifest fields are gone and
// the rig file is deleted, so "what is actually in this model?" would only be
// answerable from git. Archive both next to the model instead — the untouched
// GLB, and a JSON listing exactly what was folded into it.
function archiveSource(entry, removedFields, manifestText) {
  const dir = path.join(ROOT, 'public/models/source');
  fs.mkdirSync(dir, { recursive: true });
  // NAMED BY THE FILE, not by the mech: an entry's url is not always
  // mech_<id>.glb (jerry's primary model is mech_jerry_alt.glb, with the plain
  // name belonging to his staged alternate).
  const base = path.basename(entry.url);
  const src = path.join(dir, base);
  const glbPath = path.join(ROOT, 'public', entry.url);
  // ONCE: a second bake must not overwrite the true original with an already
  // baked one. The first archive is the pristine service asset, forever.
  const firstTime = !fs.existsSync(src);
  if (firstTime) fs.copyFileSync(glbPath, src);

  const before = JSON.parse(manifestText)[id];
  const edits = {};
  for (const f of removedFields) if (before[f] !== undefined) edits[f] = before[f];
  const rigPath = path.join(ROOT, `src/mechs/rigs/${id}.rig.js`);
  const sidecar = {
    mech: id,
    bakedAt: new Date().toISOString(),
    note: `These edits were folded into public/${entry.url} by tools/bake-glb.mjs. `
      + `The untouched service asset is ${base} in this directory. To start over: `
      + 'copy it back, restore these manifest fields and the rig file below.',
    sourceGlb: `public/models/source/${base}${firstTime ? '' : ' (kept from an earlier bake)'}`,
    manifestFieldsFolded: edits,
    rigFile: fs.existsSync(rigPath)
      ? { path: `src/mechs/rigs/${id}.rig.js`, text: fs.readFileSync(rigPath, 'utf8') }
      : null,
  };
  fs.writeFileSync(path.join(dir, `${id}.edits.json`), JSON.stringify(sidecar, null, 2) + '\n');
  console.log(`     archived source${firstTime ? '' : ' (already present)'} + edit list -> public/models/source/`);
}

// ---- main ----
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
let mutated = false;
try {
  const origManifest = fs.readFileSync(MANIFEST, 'utf8');
  const entry = JSON.parse(origManifest)[id];
  if (!entry?.url) throw new Error(`no GLB manifest entry for "${id}"`);
  // the file the ENTRY names — see archiveSource on why this is not mech_<id>.glb
  const glbPath = path.join(ROOT, 'public', entry.url);
  const bakedPath = glbPath.replace(/\.glb$/, '.baked.glb');
  console.log(`     asset: ${entry.url}`);
  const customRig = !!entry.rig;

  console.log(`\n== bake ${id} ${APPLY ? '(APPLY)' : '(dry run)'} ==`);
  console.log('1/5  capturing pre-bake joint positions…');
  const before = await capturePoses(browser, 'pre-bake');

  console.log('2/5  baking GLB…');
  const { buffer, report } = await getBakedGlb(browser);
  console.log(`     ${(buffer.length / 1e6).toFixed(2)} MB · ${report.bones} bones · ${report.mappedJoints}/15 joints mapped · customRig=${report.customRig}`);

  // compute the cleaned manifest before mutating anything (for the diff report)
  const { out: cleanManifest, removed } = cleanEntry(origManifest, id, customRig);

  console.log('3/5  writing baked GLB + cleaned manifest (temporarily) for fidelity check…');
  if (APPLY) archiveSource(entry, removed, origManifest);
  fs.writeFileSync(glbPath, buffer);                 // overwrite (restored below if dry run)
  fs.writeFileSync(MANIFEST, cleanManifest);
  const rigChanged = customRig ? removeRigFile(id) : [];

  mutated = true;    // from here on the tree is dirty; see the finally below

  console.log('4/5  capturing post-bake joint positions (stock load path)…');
  const after = await capturePoses(browser, 'post-bake');
  const fid = fidelity(before, after);

  console.log('\n---- fidelity (pre-bake custom-rig  vs  baked stock-path) ----');
  console.log(`     shape deviation (joints rel. hips): ${fid.max} world-units  (worst: ${fid.worst})  tolerance ${FID_EPS}`);
  console.log(`     ground offset (benign, re-grounds at runtime): ${fid.ground} world-units`);
  if (fid.max > FID_EPS) {
    const dev = JOINTS.map((j) => { const a = before.poses.rest[j], b = after.poses.rest[j], ha = before.poses.rest.hips, hb = after.poses.rest.hips;
      return a && b ? `${j}:${Math.hypot((a[0]-ha[0])-(b[0]-hb[0]),(a[1]-ha[1])-(b[1]-hb[1]),(a[2]-ha[2])-(b[2]-hb[2])).toFixed(3)}` : `${j}:—`; });
    console.log('     rest per-joint Δ (rel. hips): ' + dev.join('  '));
  }
  const ok = fid.max <= FID_EPS && after.mapped >= 10;
  console.log(`     ${ok ? 'PASS ✓ baked mech is faithful' : 'FAIL ✗ deviation over tolerance — DO NOT COMMIT'}`);

  console.log('\n---- manifest entry: fields removed ----');
  console.log(`     ${removed.length ? removed.join(', ') : '(none)'}${customRig ? '   + rig file: ' + rigChanged.map((p) => path.relative(ROOT, p)).join(', ') : ''}`);

  console.log('5/5  finalizing…');
  if (APPLY) {
    fs.writeFileSync(bakedPath, Buffer.alloc(0)); // no leftover
    fs.rmSync(bakedPath);
    console.log(`\nAPPLIED. Review 'git status' / 'git diff', then commit — that commit is the revertible changelist.`);
    console.log('NOW CHECK WHAT JOINTS CANNOT SHOW (see the header):');
    console.log(`  node tools/skindebug.mjs ${id}        (skinning: same findings + severities?)`);
    console.log(`  node tools/weldmap.mjs ${id} --list   (welds + seam cuts unchanged?)`);
    console.log(`  node tools/posters.mjs ${id}          (the asset moved: re-render the poster)`);
    console.log(`Suggested: git add -A && git commit -m "Bake ${id} GLB: fold rig/skinning into the asset"`);
  } else {
    // leave a .baked.glb for inspection; the finally below restores the tree
    fs.writeFileSync(bakedPath, buffer);
    console.log(`\nDRY RUN — repo restored. Inspect ${path.relative(ROOT, bakedPath)}.`);
    console.log(`Re-run with --apply to write the changes.`);
  }
} finally {
  // A DRY RUN LEAVES NOTHING BEHIND, even when a step throws. The baked GLB,
  // the cleaned manifest and the removed rig file all land on disk before the
  // fidelity check can run, so an exception in between used to leave the repo
  // half-baked and the next command working against it.
  if (!APPLY && mutated) {
    const { execSync } = await import('node:child_process');
    try {
      execSync('git checkout -- public/models src/mechs/rigs', { cwd: ROOT });
      console.log('(dry run: repo restored)');
    } catch (e) { console.error('COULD NOT RESTORE — check git status:', e.message); }
  }
  await browser.close();
}
