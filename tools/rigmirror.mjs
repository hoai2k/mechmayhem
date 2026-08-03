#!/usr/bin/env node
// RIGMIRROR — is this GLB's L/R bone mapping MIRRORED?
//
//   node tools/rigmirror.mjs [<mechId> …]   (no args = every mapped mech)
//   node tools/rigmirror.mjs <mechId> --all  (dump every bone, sorted by z)
//
// A manifest `boneOverrides` block names which GLB bone each of the game's 15
// joints drives. Nothing in the pipeline checks that `shoulderL` is actually
// the LEFT shoulder — an auto-rig's bone names are opaque (`bone_28`), the
// mapping is proposed spatially by tools/rigmap.mjs and then hand-fixed, and a
// whole-body mirror is the one error that LOOKS almost right: the walk cycle
// is symmetric, the anchors get compensated by hand, and the only tell is that
// dragging `shoulderL` in the pose workbench moves the right arm. Saurion
// shipped that way — every one of his twelve limb joints on the wrong side.
//
// The check is arithmetic and needs no renderer. A bone's BIND world position
// comes straight off the glTF node hierarchy; the manifest's `yawOffset` is
// the container rotation that turns the model into the GAME FRAME (faces +z,
// LEFT at -x, gltf.js:620). So rotate each mapped bone's bind position by the
// yaw and read the sign of x. Every `*L` joint must land at -x and every `*R`
// at +x; anything else is a mapping that says one thing and drives another.
//
// Facing is reported too (front-most vs rear-most bone), since a yawOffset a
// half-turn out would flip every side while looking like this bug.
//
// WHAT THE FIX IS: swap the L/R bone names in `boneOverrides` — and swap the
// joint names in `muzzles` with them, so each anchor stays on the same
// PHYSICAL bone (a mirrored rig always has hand-compensated anchors: saurion's
// muzzle "R" hung off "handL"). Renaming both halves keeps every anchor's
// rest-pose world transform bit-identical.
import fs from 'node:fs';

const argv = process.argv.slice(2);
const dumpAll = argv.includes('--all');
const wanted = argv.filter((a) => !a.startsWith('--'));

const man = JSON.parse(fs.readFileSync('public/models/manifest.json', 'utf8'));
const ids = wanted.length ? wanted
  : Object.keys(man).filter((k) => man[k] && typeof man[k] === 'object' && man[k].boneOverrides);

const SIDED = ['thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR'];

// bind world position of every skin joint, straight out of the glTF nodes
function boneWorlds(url) {
  const buf = fs.readFileSync('public/' + url);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  const nodes = gltf.nodes;
  const trs = (n) => {
    const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const [x, y, z, w] = q;
    return [
      (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
      (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
      (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
      t[0], t[1], t[2], 1];
  };
  const mul = (a, b) => {
    const r = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++)
      for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k];
    return r;
  };
  const world = new Array(nodes.length), parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const compute = (i) => {
    if (world[i]) return world[i];
    const l = trs(nodes[i]);
    world[i] = parent[i] === -1 ? l : mul(compute(parent[i]), l);
    return world[i];
  };
  nodes.forEach((_, i) => compute(i));
  const out = new Map();
  for (const ni of (gltf.skins?.[0]?.joints || [])) {
    const m = world[ni];
    // three.js sanitizes '::' out of node names when it loads them
    out.set((nodes[ni].name || `n${ni}`).replace(/::/g, ''), [m[12], m[13], m[14]]);
  }
  return out;
}

let failed = 0;
for (const id of ids) {
  const entry = man[id];
  if (!entry?.boneOverrides) { console.log(`${id}: no boneOverrides`); continue; }
  const bones = boneWorlds(entry.url);
  const yaw = (entry.yawOffset || 0) * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const toGame = (p) => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];

  // facing sanity: the front-most and rear-most bones of the whole skeleton
  const all = [...bones.entries()].map(([n, p]) => ({ n, p: toGame(p) }));
  all.sort((a, b) => a.p[2] - b.p[2]);
  const rear = all[0], front = all[all.length - 1];

  const rows = [], bad = [];
  for (const joint of SIDED) {
    const bone = entry.boneOverrides[joint];
    if (!bone) continue;
    const p = bones.get(bone);
    if (!p) { rows.push([joint, bone, null, 'MISSING']); bad.push(joint); continue; }
    const g = toGame(p);
    const side = g[0] < 0 ? 'LEFT' : 'RIGHT';
    const want = joint.endsWith('L') ? 'LEFT' : 'RIGHT';
    if (side !== want) bad.push(joint);
    rows.push([joint, bone, g, side === want ? '' : `<-- on the ${side}`]);
  }

  const verdict = !bad.length ? 'ok'
    : bad.length === rows.length ? `MIRRORED — all ${bad.length} limb joints are on the wrong side`
      : `${bad.length}/${rows.length} limb joints on the wrong side`;
  console.log(`\n${id}  yawOffset ${entry.yawOffset || 0}  ·  facing +z: rearmost ${rear.n} z=${rear.p[2].toFixed(2)}, frontmost ${front.n} z=${front.p[2].toFixed(2)}  ·  ${verdict}`);
  if (bad.length || dumpAll || wanted.length) {
    for (const [joint, bone, g, note] of rows) {
      console.log('  ', joint.padEnd(10), bone.padEnd(24),
        g ? g.map((v) => v.toFixed(3).padStart(7)).join(' ') : '  (no such bone)', ' ', note);
    }
  }
  if (dumpAll) {
    console.log('   -- every bone, game frame, sorted by z --');
    for (const b of all) console.log('  ', b.n.padEnd(26), b.p.map((v) => v.toFixed(3).padStart(7)).join(' '));
  }
  if (bad.length) failed++;
}

if (failed) { console.log(`\n${failed} mech(s) with a side-mapping fault`); process.exit(1); }
console.log('\nevery mapped L/R joint is on its own side');
