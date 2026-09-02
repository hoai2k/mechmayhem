// Prop placement-trait probe: build a battle headless and MEASURE that the
// trait rules (arena/designs/proptraits.js) actually hold on the placed
// props — the numbers behind "the sphinxes face the fight now".
//   node tools/scratch/traitprobe.mjs "<battle url>"
// Reports per rule: worst deviation and a PASS/FAIL line. Facing tolerance
// is ±10° (placements jitter, the rule shouldn't).
import { launch } from '../lib/browser.mjs';

const url = process.argv[2]
  || 'http://localhost:5173/?battle=ruins&p1=titanus&p2=viper&auto=1&design=wards';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world, null, { timeout: 90000 });
await page.waitForTimeout(2500);

const report = await page.evaluate(async () => {
  const { traitsFor } = await import('/src/arena/designs/proptraits.js');
  const w = window.__world, terra = w.arena.terrain;
  const TAU = Math.PI * 2;
  const norm = (a) => { let x = a % TAU; if (x < 0) x += TAU; return x; };
  // smallest angle between two yaws
  const dAng = (a, b) => {
    const d = Math.abs(norm(a) - norm(b));
    return Math.min(d, TAU - d) * 180 / Math.PI;
  };
  const props = [];
  for (const g of w.arena.propGroup.children) {
    const name = (g.name || '').replace('prop:', '');
    props.push({ name, x: g.position.x, z: g.position.z, ry: g.rotation.y });
  }
  const out = [];
  // a face-center prop faces its REGION's focal point: the battle circle, or
  // the pocket plaza (pave patch) it stands beside — accept whichever fits
  const paves = terra.patches.filter((pp) => pp.kind === 'pave');
  for (const p of props.filter((p) => traitsFor(p.name).face === 'center')) {
    let dev = dAng(p.ry, Math.atan2(-p.x, -p.z));
    let focal = 'centre';
    for (const pv of paves) {
      if (Math.hypot(p.x - pv.x, p.z - pv.z) > pv.r + 10) continue;
      const d = dAng(p.ry, Math.atan2(pv.x - p.x, pv.z - p.z));
      if (d < dev) { dev = d; focal = 'plaza'; }
    }
    out.push({
      rule: 'face-center', name: p.name, dev: +dev.toFixed(1), focal,
      at: [Math.round(p.x), Math.round(p.z)],
    });
  }
  for (const p of props.filter((p) => traitsFor(p.name).face === 'gate')) {
    const lane = terra.onLane(p.x, p.z, 2.5);
    out.push({
      rule: 'gate', name: p.name, onLane: !!lane, kind: lane?.kind || null,
      at: [Math.round(p.x), Math.round(p.z)],
      // a gate's passage may point either way along the path
      radialDev: +Math.min(
        dAng(p.ry, Math.atan2(p.x, p.z)), dAng(p.ry, Math.atan2(-p.x, -p.z))).toFixed(1),
    });
  }
  // pure grid props only: a face or lane trait deliberately outranks the grid
  for (const p of props.filter((p) => {
    const tr = traitsFor(p.name);
    return tr.grid && !tr.lane && !tr.face;
  })) {
    const q = norm(p.ry) % (Math.PI / 2);
    out.push({
      rule: 'grid', name: p.name,
      dev: +((Math.min(q, Math.PI / 2 - q)) * 180 / Math.PI).toFixed(1),
    });
  }
  const solos = props.filter((p) => traitsFor(p.name).solo);
  for (let i = 0; i < solos.length; i++) {
    let min = Infinity;
    for (let j = 0; j < solos.length; j++) {
      if (i === j || solos[i].name !== solos[j].name) continue;
      min = Math.min(min, Math.hypot(
        w.wrapDelta(solos[i].x - solos[j].x), w.wrapDelta(solos[i].z - solos[j].z)));
    }
    if (min < Infinity) out.push({ rule: 'solo-spacing', name: solos[i].name, nearest: +min.toFixed(1) });
  }
  return out;
});
await browser.close();

let bad = 0;
const rows = { 'face-center': [], gate: [], grid: [], 'solo-spacing': [] };
for (const r of report) rows[r.rule]?.push(r);
for (const r of rows['face-center']) {
  const ok = r.dev <= 10;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} face-center ${r.name.padEnd(16)} dev ${r.dev}° (${r.focal})  at ${r.at}`);
}
for (const r of rows.gate) {
  // on a path OR framing a radial approach — either satisfies the trait
  const ok = r.onLane || r.radialDev <= 12;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} gate        ${r.name.padEnd(16)} ` +
    `${r.onLane ? `ON ${r.kind} lane` : `radial dev ${r.radialDev}°`}  at ${r.at}`);
}
// a grid prop the planner found no room for falls back to the organic
// scatter (random yaw) by design — so judge the SHARE snapped, not the worst
const snapped = rows.grid.filter((r) => r.dev <= 1).length;
const gridOk = !rows.grid.length || snapped / rows.grid.length >= 0.6;
console.log(`${gridOk ? 'OK  ' : 'FAIL'} grid        ${snapped}/${rows.grid.length} props on the grid`);
if (!gridOk) bad++;
for (const r of rows['solo-spacing']) {
  const ok = r.nearest >= 24;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} solo        ${r.name.padEnd(16)} nearest sibling ${r.nearest}`);
}
console.log(bad ? `\n${bad} trait rule(s) violated.` : '\nAll placement traits hold.');
process.exit(bad ? 1 : 0);
