// WHICH WAY DOES A SOLAR PANEL FACE, and does it agree with the sun?
//   node tools/scratch/solarprobe.mjs "<battle url>"
//
// A panel's facing is its SKY-FACING NORMAL, not its bounding box: the prop
// is a mast and a couple of tilted slabs, and what "faces the sun" means is
// the direction that normal leans. So this measures it off the rendered
// geometry — area-weighted average of every upward triangle normal, in the
// PROP'S OWN frame — which gives the offset between the prop's +Z and the
// direction it actually collects from. That offset is what proptraits.js
// needs to aim a panel at the sun.
//
// Then it checks the two things the placement rule promises: every panel in
// the arena shares ONE yaw, and each collects toward the theme's sun.
import { launch } from '../lib/browser.mjs';

const url = process.argv[2]
  || 'http://localhost:5173/?battle=orbital&p1=titanus&p2=viper&auto=1&design=wards';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world, null, { timeout: 90000 });
// the imported GLB swaps in asynchronously and a tracking mount may still be
// sweeping, so wait for the models and MEASURE TWICE — an offset read off a
// prop that is still changing is a number that will not reproduce
await page.evaluate(async () => {
  const { preloadPropModels } = await import('/src/arena/propglb.js');
  await preloadPropModels(['solarWing', 'solarArray']).catch(() => {});
});
await page.waitForTimeout(3500);

const measure = () => page.evaluate(() => {
  const THREE = window.__THREE, w = window.__world;
  const theme = w.arena.theme;
  const sun = theme.sun?.pos || [0, 1, 0];
  const sunYaw = Math.atan2(sun[0], sun[2]) * 180 / Math.PI;
  const deg = (r) => ((r * 180 / Math.PI) % 360 + 360) % 360;

  const rows = [];
  for (const g of w.arena.propGroup.children) {
    const name = (g.name || '').replace('prop:', '');
    if (!/solar/i.test(name)) continue;
    g.updateWorldMatrix(true, true);
    // Accumulate the normal in WORLD space and take the prop's own yaw off
    // the answer at the end. A prop only ever rotates about Y here, so the
    // local offset is exactly (world azimuth - yaw) — no matrix needed, and
    // no chance of applying a rotation where its inverse was meant.
    const acc = new THREE.Vector3();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const geo = o.geometry;
      const pos = geo.attributes.position;
      const idx = geo.index;
      const tri = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < tri; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
        ab.subVectors(b, a); ac.subVectors(c, a);
        n.crossVectors(ab, ac);
        const area = n.length() / 2;
        if (area < 1e-4) continue;
        n.normalize();
        // sky-facing only, and not the flat roof of the mast: a collector
        // leans, so take normals with a real horizontal component
        if (n.y < 0.15 || n.y > 0.995) continue;
        acc.addScaledVector(n, area);
      }
    });
    const horiz = Math.hypot(acc.x, acc.z);
    const world = horiz > 1e-3 ? Math.atan2(acc.x, acc.z) : null;
    // …and is anything TALL standing in the way? Walk out along the collector
    // direction and report the nearest building/structure box it meets, which
    // is exactly what proptraits' `clearFront` is supposed to have prevented.
    let block = null;
    if (world !== null) {
      const boxes = (w.arena.destructoAll || [w.arena.destructo])
        .flatMap((d) => d.buildings.map((b) => b.aabb)).filter(Boolean);
      const dx = Math.sin(world), dz = Math.cos(world);
      for (let t = 2; t <= 44; t += 1.5) {
        const px = g.position.x + dx * t, pz = g.position.z + dz * t;
        if (boxes.some((b) => px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ)) {
          block = +t.toFixed(1); break;
        }
      }
    }
    rows.push({
      block,
      name,
      at: [Math.round(g.position.x), Math.round(g.position.z)],
      ry: +deg(g.rotation.y).toFixed(1),
      // where it collects in the world — this is what should match the sun
      worldFace: world === null ? null : +deg(world).toFixed(1),
      // …and the same thing in the prop's own frame (0 = its own +Z), which
      // is the faceOffset proptraits.js needs
      localFace: world === null ? null : +deg(world - g.rotation.y).toFixed(1),
    });
  }
  return { sunYaw: +((sunYaw % 360 + 360) % 360).toFixed(1), rows };
});

const out = await measure();
await page.waitForTimeout(2500);
const again = await measure();
await browser.close();

// stability: the same prop must report the same local facing both times
const drift = out.rows.map((r, i) => {
  const b = again.rows[i];
  if (!b || r.localFace === null || b.localFace === null) return 0;
  const d = Math.abs(r.localFace - b.localFace) % 360;
  return Math.min(d, 360 - d);
});
const worstDrift = Math.max(0, ...drift);

const { sunYaw, rows } = out;
console.log(`sun azimuth ${sunYaw}°  (theme.sun.pos)\n`);
if (!rows.length) { console.log('no solar props in this arena'); process.exit(0); }
for (const r of rows) {
  console.log(`  ${r.name.padEnd(11)} at ${String(r.at).padEnd(12)} yaw ${String(r.ry).padStart(6)}°  ` +
    `collects ${r.worldFace === null ? '(flat)' : String(r.worldFace).padStart(6) + '°'}  ` +
    `(local ${r.localFace === null ? '-' : r.localFace + '°'})` +
    `  front ${r.block === null ? 'clear' : 'BLOCKED at ' + r.block}`);
}
const blocked = rows.filter((r) => r.block !== null).length;
console.log(`${blocked ? 'FAIL' : 'OK  '} clear front: ${blocked}/${rows.length} panels aimed into a building`);
const yaws = [...new Set(rows.map((r) => r.ry))];
const faces = rows.map((r) => r.worldFace).filter((v) => v !== null);
const spread = faces.length
  ? Math.max(...faces.map((f) => {
    const d = Math.abs(f - sunYaw) % 360;
    return Math.min(d, 360 - d);
  })) : 0;
console.log(`\n${worstDrift < 1 ? 'OK  ' : 'FAIL'} steady between samples (worst drift ${worstDrift.toFixed(1)}° — a spinning mount or a model still loading shows up here)`);
console.log(`${yaws.length === 1 ? 'OK  ' : 'FAIL'} all panels share one yaw (${yaws.length} distinct: ${yaws.join(', ')})`);
console.log(`${spread <= 20 ? 'OK  ' : 'FAIL'} worst deviation from the sun: ${spread.toFixed(1)}°`);
if (rows[0]?.localFace !== null) {
  // a collector whose model points `localFace` off its own +Z must be yawed
  // to sunYaw - localFace, so localFace IS the faceOffset
  const need = (rows[0].localFace * Math.PI / 180).toFixed(3);
  console.log(`\n     faceOffset for ${rows[0].name}: ${need} rad (${rows[0].localFace}°)`);
}
process.exit(worstDrift < 1 && yaws.length === 1 && spread <= 20 && !blocked ? 0 : 1);
