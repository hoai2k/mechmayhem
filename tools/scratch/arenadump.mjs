// What a built arena actually contains: node tools/scratch/arenadump.mjs <theme> [seed]
// patches / lanes / hills / bridges, buildings per system, chunk counts.
import { launch } from '../lib/browser.mjs';
const theme = process.argv[2] || 'frozen';
const b = await launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
p.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 300)));
await p.goto(`http://localhost:5173/?battle=${theme}&p1=titanus&p2=viper&auto=0`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__world?.fighters?.length >= 2, null, { timeout: 120000 });
const r = await p.evaluate(() => {
  const a = window.__world.arena, t = a.terrain;
  const sys = (a.destructoAll || [a.destructo]).map((d) => ({
    buildings: d.buildings?.length, chunks: d.mesh?.count, mat: d.mat?.name || d.family || '?',
  }));
  return {
    B: a.bounds, clearing: t.clearing,
    patches: t.patches.map((q) => `${q.kind}@${Math.hypot(q.x, q.z).toFixed(0)} r${q.r.toFixed(0)}`),
    lanes: t.lanes.map((l) => `${l.kind} ${l.axis}@${l.at.toFixed(0)} hz=${l.hazard}`),
    hills: t.hills.length, bridges: t.bridges.length, sys,
    spans: t.bridges.map((br) => {
      const over = t.patches.find((q) => Math.hypot(t.wrapD(q.x - br.x), t.wrapD(q.z - br.z)) < 2);
      return `${br.axis} flat${br.flat.toFixed(0)} ${over ? 'OVER ' + over.kind : 'freestanding'}`;
    }),
    chunks: (a.destructoAll || [a.destructo]).reduce((n, d) => n + d.mesh.count, 0),
    props: a.propBodies?.length,
  };
});
await b.close();
console.log(JSON.stringify(r, null, 1));
