// Offline voxel bake for building donors: runs the game's own voxelizer
// (src/arena/buildglb.js) in a headless page against the dev server, then
// writes public/models/buildings/<name>.vox.json next to each GLB. At
// runtime the game prefers the .vox.json — no GLB download, no parse, no
// rasterization — and falls back to live voxelization only for a donor
// dropped in without re-running this bake.
//
// usage: npx vite --port 5173 &   then   node tools/voxbake.mjs
import { launch } from './lib/browser.mjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const base = process.argv[2] || 'http://localhost:5173';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '../public/models/buildings');

const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
await page.goto(base + '/?showcase', { waitUntil: 'domcontentloaded' });
const result = await page.evaluate(async () => {
  const mod = await import('/src/arena/buildglb.js');
  const t0 = performance.now();
  await mod.preloadBuildingModels({ forceGlb: true });
  const ms = Math.round(performance.now() - t0);
  return { ms, donors: mod.serializeDonors() };
});
await browser.close();

const names = Object.keys(result.donors);
if (!names.length) {
  console.error('no donors voxelized — is the dev server up and are the GLBs in public/models/buildings/?');
  process.exit(1);
}
console.log(`voxelized ${names.length} donors in ${result.ms}ms total`);
for (const [name, d] of Object.entries(result.donors)) {
  writeFileSync(join(outDir, `${name}.vox.json`), JSON.stringify(d));
  console.log(`  ${name}.vox.json  ${d.nx}x${d.ny}x${d.nz}  ${d.cells.length} cells`);
  // per-floor ASCII occupancy so a bad donor is visible at a glance
  for (let y = d.ny - 1; y >= 0; y--) {
    const rows = [];
    for (let z = 0; z < d.nz; z++) {
      let row = '';
      for (let x = 0; x < d.nx; x++) {
        row += d.cells.some((c) => c.gx === x && c.gy === y && c.gz === z) ? '#' : '.';
      }
      rows.push(row);
    }
    console.log(`    y${String(y).padStart(2)} | ${rows.join('  ')}`);
  }
}
