// Sightline probe: from a fighter's eye, march 36 azimuths outward and report
// the distance to the FIRST building hit (through the wrap ghosts), against
// where the fog band starts and ends. Answers "are the buildings I can see
// already fogged, and how big are the gaps between them?"
// usage: node tools/sightprobe.mjs "<battle url>" [waitMs]
import { launch } from './lib/browser.mjs';

const [url, waitMs = '28000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));
const out = await page.evaluate(() => {
  const w = window.__world;
  const d = w.arena.destructo;
  const fog = w.scene.fog;
  const P = w.wrapHalf * 2;
  const eye = w.fighters[0].pos;
  const boxes = [];
  for (const b of d.buildings) {
    if (b.alive <= 0) continue;
    boxes.push(b.aabb);
  }
  const offs = [];
  for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) offs.push([gx * P, gz * P]);
  const hits = [];
  for (let a = 0; a < 36; a++) {
    const ang = (a / 36) * Math.PI * 2;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    let first = null;
    for (let t = 4; t < 320 && first === null; t += 2) {
      const px = eye.x + dx * t, pz = eye.z + dz * t;
      for (const bb of boxes) {
        for (const [ox, oz] of offs) {
          if (px > bb.minX + ox && px < bb.maxX + ox && pz > bb.minZ + oz && pz < bb.maxZ + oz) {
            first = t; break;
          }
        }
        if (first !== null) break;
      }
    }
    hits.push(first === null ? -1 : Math.round(first));
  }
  const seen = hits.filter((h) => h > 0);
  const fogAt = (x) => Math.round(Math.min(1, Math.max(0, (x - fog.near) / (fog.far - fog.near))) * 100);
  seen.sort((a, b) => a - b);
  const pct = (p) => seen[Math.min(seen.length - 1, Math.floor(seen.length * p))] ?? -1;
  return {
    buildings: d.buildings.length, chunks: d.count,
    bounds: w.arena.bounds, period: Math.round(P),
    fogNear: Math.round(fog.near), fogFar: Math.round(fog.far),
    raysWithBuilding: seen.length, raysOpenToInfinity: hits.length - seen.length,
    firstBuilding: { min: seen[0], p25: pct(0.25), median: pct(0.5), p75: pct(0.75), max: seen[seen.length - 1] },
    fogPctAtFirstBuilding: {
      p25: fogAt(pct(0.25)), median: fogAt(pct(0.5)), p75: fogAt(pct(0.75)), max: fogAt(seen[seen.length - 1]),
    },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
