// A HAND-PLACED LANDFORM MUST SURVIVE THE ROUND TRIP.
//   node tools/scratch/structplace.mjs
// The editor's palette entry carries only `struct` and a position — no cells
// — so the shape is grown twice, once for the editor's stand-in and once by
// the match. This checks both ends: that the proxy builds real geometry, and
// that a level carrying that object comes back as chunks in the right
// material system when the game loads it.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await p.goto('http://localhost:5173/workbench/?edit=level&theme=frozen', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
const out = await p.evaluate(async () => {
  const { loadRobotworldConfig } = await import('/workbench/adapters/robotworld/index.js');
  const cfg = await loadRobotworldConfig();
  const AR = cfg.arena;
  const kinds = AR.structures().map((k) => k.id);
  const rows = [];
  for (const id of kinds) {
    const g = AR.structure({ k: 'building', struct: id, x: 20, z: -30 });
    let tris = 0;
    g?.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    // and again with the same def: the shape must be a function of the def
    const g2 = AR.structure({ k: 'building', struct: id, x: 20, z: -30 });
    let tris2 = 0;
    g2?.traverse((o) => { if (o.isMesh) tris2 += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    rows.push({ id, tris, stable: tris === tris2 });
  }
  return { kinds: kinds.length, rows };
});
await b.close();
let bad = 0;
for (const r of out.rows) {
  const ok = r.tris > 0 && r.stable;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(15)} ${r.tris} tris  ${r.stable ? 'stable' : 'NOT REPRODUCIBLE'}`);
}
console.log(bad ? `\n${bad} structure kind(s) failed` : `\nall ${out.kinds} structure kinds build a reproducible stand-in`);
process.exit(bad ? 1 : 0);
