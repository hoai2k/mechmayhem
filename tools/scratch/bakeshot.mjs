// bakeshot — the same mech, same camera, before and after a bake. Applies the
// bake to the tree, shoots it, restores, shoots again. Scratch A/B for
// tools/bake-glb.mjs, because the numbers can only say "different", not "how".
//
//   node tools/scratch/bakeshot.mjs <mech> [outPrefix]
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || '5175';
const ROOT = process.cwd();
const id = process.argv[2] || 'saurion';
const out = process.argv[3] || `/tmp/claude-0/-home-user-robotworld/27a6bc4b-932a-5b1a-a1d9-b717cc420b05/scratchpad/${id}`;
const MANIFEST = path.join(ROOT, 'public/models/manifest.json');
// must mirror BAKED_FIELDS in tools/bake-glb.mjs
const BAKED = ['rig', 'skinOps', 'seamCuts', 'reparent', 'stretch', 'bonePos', 'alt',
  'dropGeo', 'dropBones', 'boneOverrides'];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });

async function waitGlobal(page, name, ms = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate((n) => !!window[n], name)) return;
    await page.waitForTimeout(300);
  }
  throw new Error('timeout ' + name);
}

async function shot(file) {
  const p = await browser.newPage({ viewport: { width: 700, height: 700 } });
  await p.goto(`http://127.0.0.1:${PORT}/?showcase=${id}&anim=none`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(22000);
  await p.screenshot({ path: file });
  await p.close();
  console.log('  ->', file);
}

try {
  console.log('shooting PRE-bake…');
  await shot(`${out}-pre.png`);

  const orig = fs.readFileSync(MANIFEST, 'utf8');
  const entry = JSON.parse(orig)[id];
  const p = await browser.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/?bake=${id}`, { waitUntil: 'networkidle' });
  await waitGlobal(p, '__bakeReady');
  const res = await p.evaluate(() => ({ err: window.__bakeErr, base64: window.__bakeGlb?.base64,
    report: window.__bakeGlb?.report }));
  await p.close();
  if (res.err) throw new Error(res.err);
  fs.writeFileSync(path.join(ROOT, 'public', entry.url), Buffer.from(res.base64, 'base64'));
  const m = JSON.parse(orig);
  const clean = {};
  for (const [k, v] of Object.entries(m[id])) if (!BAKED.includes(k)) clean[k] = v;
  m[id] = clean;
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
  const rigPath = path.join(ROOT, `src/mechs/rigs/${id}.rig.js`);
  if (fs.existsSync(rigPath)) {
    fs.rmSync(rigPath);
    const idx = path.join(ROOT, 'src/mechs/rigs/index.js');
    const CONST = `${id.toUpperCase()}_RIG`;
    fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').split('\n')
      .filter((l) => !(l.includes(CONST))).join('\n'));
  }
  console.log('shooting POST-bake…');
  await shot(`${out}-post.png`);
} finally {
  execSync('git checkout -- public/models src/mechs/rigs', { cwd: ROOT });
  console.log('(tree restored)');
  await browser.close();
}
