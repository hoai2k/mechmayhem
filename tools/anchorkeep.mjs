// ANCHOR KEEPER — a re-rig must never move a mech's anchors.
//
// Anchors (anchors.muzzleR / muzzleL / podL / core / overhead …) are THE
// CONTRACT between a model and combat: every projectile, beam, flame and FX
// origin comes from them, and the muzzle numbers in manifest.json were placed
// by hand, on the gun, by a human. Re-rigging a GLB — a new custom rig, moved
// bones, a new model file — changes the frames those anchors hang off, so the
// SAME manifest numbers can silently point somewhere else. This tool is how
// you prove they didn't, and how you fix them when the parent frame changes.
//
// THE CANDIDATE is the shipped manifest entry with a PATCH laid over it —
// `--with patch.json`, the same shape the workbenches export
// (`{"<id>": {"rig": …, "muzzles": …}}` or the bare entry fields). Nothing is
// written: the patch is an entryOverride on buildGlbForTool, so the re-rig is
// judged before it goes into manifest.json. (This used to compare against a
// staged `alt` sub-entry; that mechanism is gone, and a patch file is the
// same thing without living in the shipped manifest.)
//
//   node tools/anchorkeep.mjs <mechId> --with patch.json
//       Compare the SHIPPED build against the CANDIDATE: every anchor's world
//       position + aim axis, at rest AND stepped through real clips. Prints a
//       PASS/FAIL table.
//
//   node tools/anchorkeep.mjs <mechId> --with patch.json --remap R=cannonR,L=cannonL
//       Re-express the candidate's muzzles on CUSTOM-RIG BONES while keeping
//       their rest-pose world transform bit-identical to the shipped build's.
//       Prints the `muzzles` block to add to the patch — offsets in mech-scale
//       bone-local units, `rot` in degrees so the anchor's +Z still lies on the
//       mech's facing (combat's aim vector).
//
//   node tools/anchorkeep.mjs <mechId> --track
//       Distance from each muzzle to the barrel-tip GEOMETRY through a set of
//       clips. A bone-parented anchor holds a constant distance (it is welded
//       to the gun); a virtual-joint one drifts as the pose swings it about a
//       different pivot. This is what tells you the remap was worth doing.
//
// Needs `npm run dev` running (default http://localhost:5173).
import { launch } from './lib/browser.mjs';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const id = argv.find((a) => !a.startsWith('--')) || 'colossus';
const flag = (n) => argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const flagVal = (n) => { const f = flag(n); if (!f) return null; const i = argv.indexOf(f);
  return f.includes('=') ? f.split('=').slice(1).join('=') : (argv[i + 1] || ''); };
const base = flagVal('base') || 'http://localhost:5173';
const remapArg = flag('remap') ? flagVal('remap') : null;
const track = !!flag('track');
// the candidate: shipped entry + this patch (none = the entry against itself,
// which is what --track alone wants)
const withPath = flag('with') ? flagVal('with') : null;
let patch = null;
if (withPath) {
  const j = JSON.parse(readFileSync(withPath, 'utf8'));
  patch = j && typeof j === 'object' && j[id] && typeof j[id] === 'object' ? j[id] : j;
}

const CLIPS = ['walk', 'heavy', 'ranged', 'light1', 'victory', 'groundPound'];
const POS_TOL = 0.01;   // mech units — anything above this is a moved anchor
const AIM_TOL = 1.0;    // degrees

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 500, height: 400 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${base}/?showcase=${id}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction('window.__showcaseMechs && window.__showcaseMechs.length', null, { timeout: 90000 });

const out = await page.evaluate(async ([id, remapArg, track, CLIPS, patch]) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ROSTER_BY_ID } = await import('/src/mechs/roster.js');
  const { buildGlbForTool, fetchRawManifest, skinnedBox } = await import('/src/mechs/gltf.js');
  const { Animator } = await import('/src/mechs/animator.js');
  const manifest = await fetchRawManifest();
  const def = ROSTER_BY_ID[id];

  const build = async (override) => {
    const { mech, entry } = await buildGlbForTool(def, override);
    if (!entry) return null;
    const scene = new THREE.Scene();
    scene.add(mech.group);
    mech.group.position.set(0, 0, 0);
    mech.group.rotation.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    const an = mech.premadeAnimator || new Animator(mech, def);
    let sk = null;
    mech.group.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
    return { mech, an, scene, sk };
  };
  const primary = await build(null);
  const alt = await build(patch);          // the CANDIDATE (named alt below)
  if (!primary || !alt) return { error: `${id} has no GLB entry` };

  const step = (b, clip, t) => {
    b.an.play(clip, { speed: 1 });
    b.an.update(0.0001);
    for (let i = 0; i < Math.round(t / 0.016); i++) b.an.update(0.016);
    b.scene.updateMatrixWorld(true);
  };
  const read = (b) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const o = {};
    for (const [k, a] of Object.entries(b.mech.anchors)) {
      if (!a?.isObject3D) continue;
      a.matrixWorld.decompose(p, q, s);
      const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      o[k] = { p: [p.x, p.y, p.z], z: [z.x, z.y, z.z], parent: a.parent?.name || '(joint)' };
    }
    return o;
  };
  const diff = (a, b) => {
    const rows = [];
    for (const k of Object.keys(a)) {
      if (!b[k]) { rows.push({ anchor: k, missing: true }); continue; }
      const dPos = Math.max(...a[k].p.map((v, i) => Math.abs(v - b[k].p[i])));
      const dot = Math.min(1, Math.max(-1, a[k].z.reduce((s, v, i) => s + v * b[k].z[i], 0)));
      rows.push({ anchor: k, dPos: +dPos.toFixed(4), dAim: +(Math.acos(dot) * 180 / Math.PI).toFixed(2),
        parent: b[k].parent });
    }
    return rows;
  };

  // Is a comparison meaningful at all? Two guards, both learned the hard way:
  //  • a different GLB has anchors authored per MODEL, so "they moved" is
  //    not a defect;
  //  • two builds of the same file at different sizes (a candidate that forgot
  //    to pin `modelScale`) are not the same mech, and every position differs.
  const sizeDrift = (() => {
    const bp = skinnedBox(primary.mech.group), ba = skinnedBox(alt.mech.group);
    return +bp.getSize(new THREE.Vector3())
      .distanceTo(ba.getSize(new THREE.Vector3())).toFixed(4);
  })();
  const context = {
    sameFile: !patch?.url || patch.url === manifest[id].url,
    sizeDrift,
    patched: !!patch,
  };
  const res = { context, rest: diff(read(primary), read(alt)), posed: [] };
  for (const clip of CLIPS) {
    for (const t of [0.1, 0.35, 0.7]) {
      try {
        step(primary, clip, t); const A = read(primary);
        step(alt, clip, t); const B = read(alt);
        res.posed.push({ clip, t, rows: diff(A, B) });
      } catch (e) { /* clip this mech can't play */ }
    }
  }

  // ---- --remap: bone-local numbers that preserve the primary's world pose ----
  if (remapArg) {
    // rebuild at rest so the transforms are the bind ones
    const P = await build(null), A = await build(patch);
    res.remap = { units: A.mech.muzzleUnits, sides: {} };
    for (const pair of remapArg.split(',')) {
      const [side, boneName] = pair.split('=').map((x) => x.trim());
      const src = P.mech.anchors['muzzle' + side] || P.mech.anchors[side];
      const bone = A.mech.rigBones?.[boneName];
      if (!src || !bone) { res.remap.sides[side] = { error: src ? `no rig bone "${boneName}"` : `no anchor for "${side}"` }; continue; }
      const local = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(src.matrixWorld);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      local.decompose(p, q, s);
      const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      const k = A.mech.muzzleUnits.bone;
      res.remap.sides[side] = { bone: boneName,
        offset: [p.x / k, p.y / k, p.z / k].map((v) => +v.toFixed(4)),
        rot: [e.x, e.y, e.z].map((v) => +(v * 180 / Math.PI).toFixed(2)) };
    }
  }

  // ---- --track: is the muzzle welded to the gun geometry? ----
  if (track) {
    const tipsOf = (b) => {
      const pos = b.sk.geometry.attributes.position;
      let maxY = -1e9;
      for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
      const R = [], L = [];
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < maxY - 0.035) continue;      // the top 3.5% of the model
        (pos.getZ(i) < 0 ? R : L).push(i);
      }
      return { R, L };
    };
    const centroid = (b, list) => {
      const v = new THREE.Vector3(), acc = new THREE.Vector3();
      for (const i of list) { b.sk.getVertexPosition(i, v); acc.add(v.applyMatrix4(b.sk.matrixWorld)); }
      return acc.multiplyScalar(1 / Math.max(1, list.length));
    };
    const tp = tipsOf(primary), ta = tipsOf(alt);
    res.track = [];
    for (const clip of CLIPS) {
      for (const t of [0.1, 0.35, 0.7]) {
        const row = { clip, t };
        for (const [tag, b, tips] of [['primary', primary, tp], ['alt', alt, ta]]) {   // alt = the candidate
          try {
            step(b, clip, t);
            row[tag] = ['R', 'L'].map((side) => +b.mech.anchors['muzzle' + side]
              .getWorldPosition(new THREE.Vector3()).distanceTo(centroid(b, tips[side])).toFixed(3));
          } catch (e) { row[tag] = null; }
        }
        res.track.push(row);
      }
    }
  }
  return res;
}, [id, remapArg, track, CLIPS, patch]);

await browser.close();

if (out.error) { console.error(out.error); process.exit(2); }

// ---- report ----
let fails = 0;
console.log(`\n${id}: anchors, SHIPPED vs CANDIDATE${withPath ? ` (${withPath})` : ' (no --with: the entry against itself)'} (tolerance ${POS_TOL} units / ${AIM_TOL}°)\n`);
console.log('  REST');
for (const r of out.rest) {
  if (r.missing) { console.log(`    ${r.anchor.padEnd(10)} MISSING in the candidate`); fails++; continue; }
  const bad = r.dPos > POS_TOL || r.dAim > AIM_TOL;
  if (bad) fails++;
  console.log(`    ${r.anchor.padEnd(10)} Δpos ${String(r.dPos).padEnd(8)} Δaim ${String(r.dAim).padEnd(6)}° `
    + `parent=${(r.parent || '').padEnd(10)} ${bad ? 'MOVED' : 'ok'}`);
}
if (out.posed.length) {
  const worst = {};
  for (const s of out.posed) for (const r of s.rows) {
    if (r.missing) continue;
    const w = worst[r.anchor] || (worst[r.anchor] = { dPos: 0, dAim: 0, at: '' });
    if (r.dPos > w.dPos) { w.dPos = r.dPos; w.dAim = r.dAim; w.at = `${s.clip}@${s.t}`; }
  }
  console.log('\n  POSED (worst frame per anchor — a rig change legitimately alters these,');
  console.log('  since the anchor now swings about a different pivot; rest is the contract)');
  for (const [k, w] of Object.entries(worst)) {
    console.log(`    ${k.padEnd(10)} Δpos ${String(w.dPos).padEnd(8)} Δaim ${String(w.dAim).padEnd(6)}° at ${w.at}`);
  }
}
if (out.track) {
  console.log('\n  TRACK — distance muzzle → barrel-tip geometry (constant = welded to the gun)');
  console.log('    clip           t      shipped R/L        candidate R/L');
  for (const r of out.track) {
    const f = (v) => (v ? `${String(v[0]).padStart(6)}/${String(v[1]).padEnd(6)}` : '   —   ');
    console.log(`    ${r.clip.padEnd(13)} ${String(r.t).padEnd(6)} ${f(r.primary)}   ${f(r.alt)}`);
  }
}
if (out.remap) {
  console.log('\n  REMAP — add to the patch (rest-pose world transform preserved):');
  console.log('  "muzzles": {');
  const keys = Object.keys(out.remap.sides);
  keys.forEach((side, i) => {
    const s = out.remap.sides[side];
    if (s.error) { console.log(`    // ${side}: ${s.error}`); return; }
    console.log(`    "${side}": {"bone":"${s.bone}","offset":[${s.offset.join(',')}],"rot":[${s.rot.join(',')}]}${i < keys.length - 1 ? ',' : ''}`);
  });
  console.log('  }');
}
if (errs.length) console.log('\npage errors:\n' + errs.slice(0, 5).join('\n'));
// A verdict is only meaningful when the two builds are the same mech, and
// only binding on the side that is being staged (see `context` above).
const ctx = out.context || {};
const notes = [];
if (ctx.sameFile === false) {
  notes.push('the candidate is a DIFFERENT GLB — anchors are authored per model, so a difference here is not a defect');
} else if (ctx.sizeDrift > 0.05) {
  notes.push(`the two builds render at different sizes (Δ${ctx.sizeDrift}) — pin the same \`modelScale\`/`
    + '`heightScale` on both (gltf.js FROZEN MODEL SCALE) before reading anything below');
}
const advisory = notes.length > 0;
if (advisory) console.log('  NOTE: ' + notes.join('\n  NOTE: '));
console.log(`\n${!fails ? 'PASS — every anchor holds its rest world transform'
  : advisory ? `ADVISORY — ${fails} anchor(s) differ at rest, but see the NOTEs above`
    : `FAIL — ${fails} anchor(s) moved at rest`}\n`);
process.exit(fails && !advisory ? 1 : 0);
