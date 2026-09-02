// PROP SHELL AUDIT — how far does each prop's COLLIDER float off its own model?
//
//   node tools/propshell.mjs [--theme foundry] [--worst 20] [--all]
//
// Every prop the twelve arenas place is built and measured twice:
//
//   cylinder   the round collider Arena._regProp derives from its ground band
//   shell      the boxes of its own meshes (src/arena/propshell.js), which is
//              what the fighter is pushed out of and what the climber reads
//
// The metric is the PHANTOM SKIN: points sampled over the collider's own
// surface, each measured to the nearest of the prop's real meshes. That is
// literally how far a body held against the collider sits off the thing it
// looks like it is touching — the gear hover as a number, before anyone has to
// walk into one.
//
// `mean` is what a body meets on an average approach and `max` is the worst
// direction (a thin prop's flat face). Anything the shell cannot improve is
// already round, which is most of them and exactly the point.
//
// Props whose builder names its own multi-part colliders (`userData.bodies` —
// gates, arches, cave mouths) are measured against THOSE, and reported as
// `authored`: they are hand-placed and get no derived shell.
//
// Needs the dev server (npm run dev) on :5173.
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const has = (n) => args.includes('--' + n);

const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?rigtest', { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async ({ onlyTheme }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { PROPS } = await import('/src/arena/props.js');
  const { THEMES, themePropNames } = await import('/src/arena/themes.js');
  const { propShell, propSkins, propCloud } = await import('/src/arena/propshell.js');

  // which arenas place which prop
  const users = new Map();
  for (const t of THEMES) {
    if (onlyTheme && t.id !== onlyTheme) continue;
    for (const n of themePropNames(t)) {
      if (!users.has(n)) users.set(n, []);
      users.get(n).push(t.id);
    }
  }

  const meshBoxes = (g) => {
    const out = [];
    g.updateWorldMatrix(true, true);
    g.traverse((o) => {
      if (!o.isMesh || o.userData.noCollide) return;
      const b = new THREE.Box3().setFromObject(o);
      if (!b.isEmpty()) out.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
    });
    return out;
  };
  // measured against the MODEL's own points, exactly as propshell.js does
  const vertDist = (cloud, x, y, z) => {
    let best = Infinity;
    for (let i = 0; i < cloud.length; i += 3) {
      const dx = x - cloud[i], dy = y - cloud[i + 1], dz = z - cloud[i + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  // the same cylinder Arena._regProp measures (prop at the origin, gy 0)
  const cylinderOf = (g) => {
    const bb = new THREE.Box3().setFromObject(g);
    const rx = (bb.max.x - bb.min.x) / 2, rz = (bb.max.z - bb.min.z) / 2;
    const h = bb.max.y;
    const bbLow = new THREE.Box3();
    const mb = new THREE.Box3();
    g.updateWorldMatrix(true, true);
    g.traverse((o) => { if (!o.isMesh) return; mb.setFromObject(o); if (mb.min.y < 3.2) bbLow.union(mb); });
    let rl = Math.max(rx, rz);
    if (!bbLow.isEmpty()) {
      rl = Math.max(Math.abs(bbLow.max.x), Math.abs(bbLow.min.x), Math.abs(bbLow.max.z), Math.abs(bbLow.min.z));
    }
    const r = Math.min(rl * 0.72, 7);
    const solid = h > 1.7 && r > 0.4 && r < 7.5 && h / Math.max(rx, rz) > 0.35;
    return { r, h, solid };
  };
  // points over a standing cylinder's side + top rim
  const cylPoints = (c, cx = 0, cz = 0) => {
    const pts = [];
    for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      for (let k = 1; k <= 6; k++) pts.push([cx + Math.cos(th) * c.r, (k / 7) * c.h, cz + Math.sin(th) * c.r]);
      pts.push([cx + Math.cos(th) * c.r * 0.6, c.h, cz + Math.sin(th) * c.r * 0.6]);
    }
    return pts;
  };
  // ...and over a box's six faces
  const boxPoints = (b) => {
    const pts = [];
    const lerp = (a, z, t) => a + (z - a) * t;
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) {
      const u = i / 3, v = j / 3;
      pts.push([b[0], lerp(b[1], b[4], u), lerp(b[2], b[5], v)]);
      pts.push([b[3], lerp(b[1], b[4], u), lerp(b[2], b[5], v)]);
      pts.push([lerp(b[0], b[3], u), b[1], lerp(b[2], b[5], v)]);
      pts.push([lerp(b[0], b[3], u), b[4], lerp(b[2], b[5], v)]);
      pts.push([lerp(b[0], b[3], u), lerp(b[1], b[4], v), b[2]]);
      pts.push([lerp(b[0], b[3], u), lerp(b[1], b[4], v), b[5]]);
    }
    return pts;
  };
  const score = (pts, cloud) => {
    let sum = 0, max = 0;
    for (const [x, y, z] of pts) {
      const d = vertDist(cloud, x, y, z);
      sum += d; if (d > max) max = d;
    }
    return { mean: sum / Math.max(1, pts.length), max };
  };

  const rows = [];
  for (const [name, themes] of users) {
    const build = PROPS[name];
    if (typeof build !== 'function') continue;
    let g;
    try { g = build({ seed: 7 }); } catch (e) { continue; }
    g.updateMatrixWorld(true);
    const meshes = meshBoxes(g);
    if (!meshes.length) continue;
    const cloud = propCloud(g);
    const bodies = g.userData.bodies;
    if (bodies) {
      // authored multi-part colliders: measured as they are
      let pts = [];
      for (const b of bodies) pts = pts.concat(cylPoints({ r: b.r, h: b.h }, b.dx || 0, b.dz || 0));
      const s = score(pts, cloud);
      rows.push({ name, themes, kind: 'authored', bodies: bodies.length,
        cyl: s, shell: null, meshes: meshes.length });
      continue;
    }
    // the same gate Arena._regProp uses: dressing and hazards get no collider
    if (g.userData.noCollide || g.userData.spikes || g.userData.campfire) {
      rows.push({ name, themes, kind: 'walk-over', meshes: meshes.length });
      continue;
    }
    const c = cylinderOf(g);
    if (!c.solid) { rows.push({ name, themes, kind: 'walk-over', meshes: meshes.length }); continue; }
    // both candidates, measured by the SAME code the game chooses with
    const sk = propSkins(g, { r: c.r, h: c.h, x: 0, z: 0 });
    const chosen = propShell(g, { r: c.r, h: c.h, x: 0, z: 0 });
    rows.push({ name, themes, kind: 'shell', r: c.r, h: c.h, boxes: sk.boxes, meshes: meshes.length,
      cyl: sk.cyl, shell: sk.shell, uses: chosen ? 'shell' : 'cylinder' });
  }
  return { rows, themes: [...new Set([...users.values()].flat())].length };
}, { onlyTheme: flag('theme', null) });

const rows = out.rows;
const solid = rows.filter((r) => r.kind === 'shell');
solid.sort((a, b) => (b.cyl.max - b.shell.max) - (a.cyl.max - a.shell.max));
const lim = has('all') ? solid.length : +flag('worst', 20);
console.log(`\n=== ${rows.length} prop(s) across ${out.themes} arena(s) — how far the collider floats off the model ===`);
console.log('prop'.padEnd(18) + 'boxes'.padStart(6) + '   cylinder mean/max'.padEnd(22) + 'shell mean/max'.padEnd(20)
  + 'uses'.padEnd(10) + 'arenas');
for (const r of solid.slice(0, lim)) {
  console.log(r.name.padEnd(18) + String(r.boxes).padStart(6) + '   '
    + `${r.cyl.mean.toFixed(2)} / ${r.cyl.max.toFixed(2)}`.padEnd(19)
    + `${r.shell.mean.toFixed(2)} / ${r.shell.max.toFixed(2)}`.padEnd(20)
    + r.uses.padEnd(10)
    + r.themes.join(' '));
}
const kept = solid.filter((r) => r.uses === 'cylinder');
console.log(`\n${solid.length - kept.length} of ${solid.length} solid props take the SHELL; `
  + `${kept.length} keep the cylinder because it hugs them better (they are round): `
  + kept.map((r) => r.name).join(', '));
const auth = rows.filter((r) => r.kind === 'authored');
if (auth.length) {
  console.log(`\nHAND-AUTHORED colliders (userData.bodies — no derived shell), measured as they are:`);
  auth.sort((a, b) => b.cyl.max - a.cyl.max);
  for (const r of auth) {
    console.log('  ' + r.name.padEnd(16) + `${r.bodies} bodies   ` + `${r.cyl.mean.toFixed(2)} / ${r.cyl.max.toFixed(2)}`.padEnd(16) + r.themes.join(' '));
  }
}
const over = rows.filter((r) => r.kind === 'walk-over').map((r) => r.name);
if (over.length) console.log(`\nwalk-over dressing (no collider at all): ${over.join(', ')}`);
const pick = (r) => (r.uses === 'shell' ? r.shell : r.cyl);
const worstCyl = solid.reduce((a, b) => (a && a.cyl.max > b.cyl.max ? a : b), null);
const worstNow = solid.reduce((a, b) => (a && pick(a).max > pick(b).max ? a : b), null);
const meanBefore = solid.reduce((s2, r) => s2 + r.cyl.mean, 0) / solid.length;
const meanNow = solid.reduce((s2, r) => s2 + pick(r).mean, 0) / solid.length;
console.log(`\nworst phantom skin: was ${worstCyl?.cyl.max.toFixed(2)} (${worstCyl?.name})`
  + `  ->  now ${pick(worstNow).max.toFixed(2)} (${worstNow?.name})`);
console.log(`mean phantom skin over every solid prop: ${meanBefore.toFixed(2)} -> ${meanNow.toFixed(2)}`);
await browser.close();
