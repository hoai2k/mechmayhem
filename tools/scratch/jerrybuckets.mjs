// WHY A CAPSULE IS MISSING. hurtbox.js drops a part whose bucket holds fewer
// than 6 sampled vertices, so "nothing lands on jerry" is answerable by
// counting what each of his bones actually owns.
//
//   node tools/scratch/jerrybuckets.mjs [mech …]
import { launch } from '../lib/browser.mjs';

const MECHS = process.argv.slice(2).filter((a) => !a.startsWith('http'));
const BASE = process.argv.slice(2).find((a) => a.startsWith('http')) || 'http://localhost:5173';
if (!MECHS.length) MECHS.push('jerry');

const browser = await launch();
for (const m of MECHS) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 200)));
  await page.goto(`${BASE}/?battle=uptown&p1=${m}&p2=titanus`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fighters?.length, null, { timeout: 180000 });
  const r = await page.evaluate(() => {
    const f = window.__fighters[0], mech = f.mech;
    // dominant-bone vertex census over every skinned mesh, keyed by the BONE
    // the model actually carries — then folded onto the game joint that names
    // it, which is the same walk hurtbox.js does.
    const bones = new Map();          // bone name -> vertex count
    for (const o of [] .concat(...[mech.group].map((g) => {
      const out = []; g.traverse((n) => { if (n.isSkinnedMesh && n.skeleton) out.push(n); }); return out;
    }))) {
      const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      if (!si || !sw) continue;
      for (let v = 0; v < si.count; v++) {
        let best = -1, bw = -1;
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(v, k);
          if (w > bw) { bw = w; best = si.getComponent(v, k); }
        }
        const b = o.skeleton.bones[best];
        if (!b) continue;
        bones.set(b.name, (bones.get(b.name) || 0) + 1);
      }
    }
    // which model bone each game joint drives
    const map = {};
    for (const [j, b] of Object.entries(mech.boneMap || {})) map[j] = b?.name || null;
    const hb = f.hurtbox;
    return {
      joints: map,
      counts: Object.fromEntries([...bones].sort((a, b) => b[1] - a[1])),
      have: hb ? hb.parts.map((p) => p.name) : [],
    };
  });
  console.log(`\n===== ${m}`);
  const want = ['pelvis', 'chest', 'head', 'thighL', 'thighR', 'shinL', 'shinR',
    'footL', 'footR', 'upperArmL', 'upperArmR', 'handL', 'handR'];
  for (const j of want) {
    const bone = r.joints[j];
    const n = bone ? (r.counts[bone] ?? 0) : '(unmapped)';
    const got = r.have.includes(j) ? 'capsule' : '** MISSING **';
    console.log(`  ${j.padEnd(10)} bone=${String(bone).padEnd(22)} verts=${String(n).padEnd(8)} ${got}`);
  }
  await page.close();
}
await browser.close();
