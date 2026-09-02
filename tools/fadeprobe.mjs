// Occlusion-fade probe: does a building ghost out when it ISN'T actually
// hiding the mech? Places the fighter at a ring of positions around the
// biggest building (beside it, at its corners, and directly behind it from
// the camera) and reports what fraction of the body each building copy
// blocks, plus whether it faded.
// usage: node tools/fadeprobe.mjs "<battle url>" [waitMs]
import { launch } from './lib/browser.mjs';

const [url, waitMs = '30000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(() => {
  const w = window.__world;
  const d = w.arena.destructo;
  const cam = w.cameraSys;
  const f = w.fighters[0];
  let b = d.buildings.reduce((best, x) => (!best || x.alive > best.alive ? x : best), null);
  if (!b) return { err: 'no buildings' };
  const a = b.aabb;
  const cx = (a.minX + a.maxX) / 2, cz = (a.minZ + a.maxZ) / 2;
  const halfX = (a.maxX - a.minX) / 2, halfZ = (a.maxZ - a.minZ) / 2;
  const R = Math.max(halfX, halfZ);

  // how much of the body does this building actually block, from `camPos`?
  const coverage = (camPos) => {
    const seg = cam._segs[0];
    seg.from.copy(camPos);
    cam.fillSegTargets(seg, camPos, f);
    let blocked = 0, boxBlocked = 0;
    for (const pt of seg.targets) {
      if (d._chunksBlock(seg.from, pt, b, 0, 0)) blocked++;
      // what the OLD test saw: the building's whole bounding box, holes and
      // overhangs and dead chunks included
      const A = b.aabb;
      const lo = [A.minX - 0.3, A.minY - 0.3, A.minZ - 0.3];
      const hi = [A.maxX + 0.3, A.maxY + 0.3, A.maxZ + 0.3];
      const fr = [seg.from.x, seg.from.y, seg.from.z];
      const dd = [pt.x - seg.from.x, pt.y - seg.from.y, pt.z - seg.from.z];
      let tMin = 0, tMax = 1, ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(dd[i]) < 1e-8) { if (fr[i] < lo[i] || fr[i] > hi[i]) { ok = false; break; } continue; }
        let t1 = (lo[i] - fr[i]) / dd[i], t2 = (hi[i] - fr[i]) / dd[i];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1); tMax = Math.min(tMax, t2);
        if (tMin > tMax) { ok = false; break; }
      }
      if (ok) boxBlocked++;
    }
    return { blocked, boxBlocked, of: seg.targets.length };
  };

  const cases = [];
  const test = (label, fx, fz, camDX, camDZ, camY = 9, fy = 0) => {
    f.pos.set(fx, fy, fz);
    const camPos = { x: fx + camDX, y: camY, z: fz + camDZ };
    const cov = coverage(camPos);
    // run the real decision path and read the resulting fade target
    const segs = [{ from: camPos, targets: cam._segs[0].targets, cam: null }];
    d.setOccluders(segs);
    cases.push({
      label,
      chunksBlocked: `${cov.blocked}/${cov.of}`,
      boxBlocked_oldTest: `${cov.boxBlocked}/${cov.of}`,
      fadedNow: b.fadeTargetV[0] < 1,
      wouldFadeBefore: cov.boxBlocked === cov.of,   // old rule: ALL samples hit the box
    });
  };

  // 1. mech BESIDE the building, camera out in the open behind it: the
  //    building is off to one side and hides nothing
  test('beside (building to the side)', cx + R + 6, cz, 0, 22);
  // 2. mech at a corner, camera diagonal — a classic false positive
  test('at a corner, camera diagonal', cx + R + 4, cz + R + 4, 14, 14);
  // 3. mech hard against the wall, camera on the SAME side (open sightline)
  test('against the wall, camera same side', cx, cz + R + 3, 0, 20);
  // 4. mech genuinely BEHIND the building from the camera
  test('fully behind the building', cx, cz - R - 4, 0, R * 2 + 30);
  // 5. behind, but the building is gutted (every chunk dead)
  const alive = [...b.grid.values()].filter((c) => c.alive);
  alive.forEach((c) => { c.alive = false; });
  test('behind a DEAD building (all chunks gone)', cx, cz - R - 4, 0, R * 2 + 30);
  alive.forEach((c) => { c.alive = true; });
  // 5b. ON THE ROOF of the building — the mech is inside the bounding box
  //     horizontally, so EVERY camera→body segment ends inside the box and
  //     trivially "hits" it, while the mech stands in full view on top.
  test('ON ITS ROOF (camera behind, same height)',
    cx, cz, 0, R + 16, a.maxY + 7, a.maxY);
  // 5c. on the roof with the camera lower and further back
  test('ON ITS ROOF (camera low and back)',
    cx, cz, 0, R + 22, a.maxY - 2, a.maxY);

  // 6. THE REPORTED CASE: standing in a notch of the building's own
  //    footprint — an L-shape's inner corner, a setback, a gap where chunks
  //    were destroyed. The mech is INSIDE the bounding box but in open air,
  //    so every camera→body segment trivially "hits the box" while the mech
  //    is in plain sight.
  {
    // scan EVERY building for a real overhang: a column with open air at
    // standing height but mass above it (pagoda eaves, setbacks, an
    // L-shape's inner corner, a blown-out ground floor)
    let found = null;
    for (const bb of d.buildings) {
      const low = new Set(), high = new Set();
      let sample = null;
      for (const c of bb.grid.values()) {
        if (!c.alive) continue;
        sample = sample || c;
        (c.gy <= 1 ? low : high).add(`${c.gx},${c.gz}`);
      }
      for (const k of high) {
        if (!low.has(k)) { found = { b: bb, k, sample }; break; }
      }
      if (found) break;
    }
    if (found) {
      const [gx, gz] = found.k.split(',').map(Number);
      const s = found.sample;
      const nx = s.x + (gx - s.gx) * s.w, nz = s.z + (gz - s.gz) * s.d;
      const A = found.b.aabb;
      const bx = (A.minX + A.maxX) / 2, bz = (A.minZ + A.maxZ) / 2;
      const outX = nx - bx, outZ = nz - bz;
      const L = Math.hypot(outX, outZ) || 1;
      // swap the probe onto that building for this case
      const prev = b;
      b = found.b;
      test('UNDER AN OVERHANG (open air below mass)',
        nx, nz, (outX / L) * 24, (outZ / L) * 24, 8);
      b = prev;
    } else {
      cases.push({ label: 'no overhang column found in this arena' });
    }
  }
  // 7. behind, with the near face blown open (a hole to see through)
  const nearFace = alive.filter((c) => c.z > cz + halfZ - 4);
  nearFace.forEach((c) => { c.alive = false; });
  test(`behind, near face blown open (${nearFace.length} chunks gone)`, cx, cz - R - 4, 0, R * 2 + 30);
  nearFace.forEach((c) => { c.alive = true; });

  return { building: { chunks: b.chunkCount, alive: b.alive, R: +R.toFixed(1) }, cases };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
