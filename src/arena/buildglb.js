// GLB building donors: Tripo (or any) massing models voxelized into the
// destructible chunk grid. The model contributes its SILHOUETTE and its
// COLORS — the building that gets built is ordinary chunks (fully
// destructible, support cascade, rubble), arranged and tinted like the
// donor. See docs/ARENA_ASSET_PROMPTS.md §4 for the generation workflow.
//
// public/models/buildings/manifest.json:
//   { "decoTower": { "file": "decoTower.glb", "floors": 9,
//       "themes": ["neon", "uptown"] } }
// `floors` = building height in CELLS (one cell ≈ one storey ≈ 3.3m);
// `themes` = which arenas may draw this donor (omit = all).
//
// Voxelization: triangles are rasterized into the grid (surface cells,
// accumulating a texture-sampled color per cell), the outside is flood-
// filled, and everything not reachable from outside is solid. Runs once per
// donor at preload, off the critical path.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const donors = new Map();     // name -> {cells:[{gx,gy,gz,tint}], nx,ny,nz, themes}
let loadPromise = null;

const MAX_XZ = 7;             // footprint cap (chunk-budget guard)
const MAX_Y = 14;

// read a texture's pixels once so cells can sample it
function texPixels(tex) {
  const img = tex?.image;
  if (!img || !img.width) return null;
  const cv = document.createElement('canvas');
  const w = (cv.width = Math.min(img.width, 256));
  const h = (cv.height = Math.min(img.height, 256));
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  } catch { return null; }
}

function voxelize(scene, floors) {
  scene.updateWorldMatrix(true, true);
  const bb = new THREE.Box3().setFromObject(scene);
  if (bb.isEmpty()) return null;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const ny = Math.max(2, Math.min(floors || 8, MAX_Y));
  const cell = size.y / ny;
  const nx = Math.max(1, Math.min(Math.round(size.x / cell), MAX_XZ));
  const nz = Math.max(1, Math.min(Math.round(size.z / cell), MAX_XZ));
  const cx = size.x / nx, cz = size.z / nz;   // per-axis cell size in model units

  const idx = (x, y, z) => (y * nz + z) * nx + x;
  const surf = new Uint8Array(nx * ny * nz);
  const colR = new Float32Array(nx * ny * nz);
  const colG = new Float32Array(nx * ny * nz);
  const colB = new Float32Array(nx * ny * nz);
  const colN = new Float32Array(nx * ny * nz);

  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  const uvA = new THREE.Vector2(), uvB = new THREE.Vector2(), uvC = new THREE.Vector2();
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    const uv = o.geometry.attributes.uv;
    const index = o.geometry.index;
    const triCount = (index ? index.count : pos.count) / 3;
    const pix = texPixels(o.material?.map);
    const baseC = o.material?.color || new THREE.Color(0xffffff);
    const readV = (t, v) => {
      const i = index ? index.getX(t) : t;
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      return i;
    };
    for (let t = 0; t < triCount; t++) {
      const iA = readV(t * 3, vA), iB = readV(t * 3 + 1, vB), iC = readV(t * 3 + 2, vC);
      // sample color at the tri centroid
      let r = baseC.r, g = baseC.g, b2 = baseC.b;
      if (pix && uv) {
        uvA.fromBufferAttribute(uv, iA); uvB.fromBufferAttribute(uv, iB); uvC.fromBufferAttribute(uv, iC);
        const u = ((uvA.x + uvB.x + uvC.x) / 3) % 1, v2 = ((uvA.y + uvB.y + uvC.y) / 3) % 1;
        const px = Math.min(pix.w - 1, Math.max(0, Math.floor((u < 0 ? u + 1 : u) * pix.w)));
        const py = Math.min(pix.h - 1, Math.max(0, Math.floor((1 - (v2 < 0 ? v2 + 1 : v2)) * pix.h)));
        const o4 = (py * pix.w + px) * 4;
        r *= pix.data[o4] / 255; g *= pix.data[o4 + 1] / 255; b2 *= pix.data[o4 + 2] / 255;
      }
      // rasterize the tri's AABB into the grid (tris are small vs cells)
      const x0 = Math.max(0, Math.floor((Math.min(vA.x, vB.x, vC.x) - bb.min.x) / cx));
      const x1 = Math.min(nx - 1, Math.floor((Math.max(vA.x, vB.x, vC.x) - bb.min.x) / cx));
      const y0 = Math.max(0, Math.floor((Math.min(vA.y, vB.y, vC.y) - bb.min.y) / cell));
      const y1 = Math.min(ny - 1, Math.floor((Math.max(vA.y, vB.y, vC.y) - bb.min.y) / cell));
      const z0 = Math.max(0, Math.floor((Math.min(vA.z, vB.z, vC.z) - bb.min.z) / cz));
      const z1 = Math.min(nz - 1, Math.floor((Math.max(vA.z, vB.z, vC.z) - bb.min.z) / cz));
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const ii = idx(x, y, z);
            surf[ii] = 1;
            colR[ii] += r; colG[ii] += g; colB[ii] += b2; colN[ii]++;
          }
        }
      }
    }
  });

  // flood-fill the OUTSIDE across empty cells (6-connected, from the border)
  const outside = new Uint8Array(nx * ny * nz);
  const stack = [];
  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        if ((x === 0 || x === nx - 1 || y === 0 || y === ny - 1 || z === 0 || z === nz - 1) &&
            !surf[idx(x, y, z)]) {
          stack.push(x, y, z);
        }
      }
    }
  }
  while (stack.length) {
    const z = stack.pop(), y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
    const ii = idx(x, y, z);
    if (outside[ii] || surf[ii]) continue;
    outside[ii] = 1;
    stack.push(x + 1, y, z, x - 1, y, z, x, y + 1, z, x, y - 1, z, x, y, z + 1, x, y, z - 1);
  }

  // solid = surface + enclosed interior; keep only shell cells
  const solid = (x, y, z) =>
    x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz &&
    !outside[idx(x, y, z)];
  const cells = [];
  const c = new THREE.Color();
  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        if (!solid(x, y, z)) continue;
        const buried = y !== 0 &&
          solid(x - 1, y, z) && solid(x + 1, y, z) &&
          solid(x, y, z - 1) && solid(x, y, z + 1) &&
          solid(x, y - 1, z) && solid(x, y + 1, z);
        if (buried) continue;
        const ii = idx(x, y, z);
        const cellObj = { gx: x, gy: y, gz: z };
        if (colN[ii]) {
          // brighten toward mid-tones: chunk tints multiply the facade map
          c.setRGB(colR[ii] / colN[ii], colG[ii] / colN[ii], colB[ii] / colN[ii]);
          cellObj.tint = c.clone().lerp(new THREE.Color(0xffffff), 0.35).getHex();
        }
        cells.push(cellObj);
      }
    }
  }
  // orphan guard: drop floating cells with no support path (strict column
  // check is overkill — the in-game cascade handles marginal cases; only
  // cells with NOTHING within a 1-cell reach below are culled)
  const cellSet = new Set(cells.map((cc) => `${cc.gx},${cc.gy},${cc.gz}`));
  const supported = (cc) => cc.gy === 0 ||
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) =>
      cellSet.has(`${cc.gx + dx},${cc.gy - 1},${cc.gz + dz}`));
  const kept = cells.filter(supported);
  return kept.length >= 4 ? { cells: kept, nx, ny, nz } : null;
}

// Preload donors. Preference order per manifest entry:
//   1. <name>.vox.json — the OFFLINE BAKE (tools/voxbake.mjs): a few KB,
//      no GLB download, no parse, no rasterization at runtime
//   2. the GLB, voxelized live — so a freshly dropped donor still works
//      before anyone re-runs the bake
// opts.forceGlb makes the bake tool itself skip stale .vox.json files.
export function preloadBuildingModels(opts = {}) {
  if (loadPromise && !opts.forceGlb) return loadPromise;
  loadPromise = (async () => {
    let man = null;
    try {
      const res = await fetch('models/buildings/manifest.json');
      if (res.ok) man = await res.json();
    } catch { /* no donors — massing generator carries the look */ }
    if (!man) return;
    await Promise.all(Object.entries(man).map(async ([name, entry]) => {
      if (!entry || !entry.file) return;
      if (!opts.forceGlb) {
        try {
          const res = await fetch(`models/buildings/${name}.vox.json`);
          if (res.ok) {
            const baked = await res.json();
            if (baked?.cells?.length) {
              donors.set(name, { ...baked, themes: entry.themes || baked.themes || null });
              return;
            }
          }
        } catch { /* fall through to live voxelization */ }
      }
      try {
        const t0 = performance.now();
        const gltf = await loader.loadAsync(`models/buildings/${entry.file}`);
        const vox = voxelize(gltf.scene, entry.floors);
        if (vox) {
          donors.set(name, { ...vox, themes: entry.themes || null });
          console.info(`voxelized ${name} live in ${Math.round(performance.now() - t0)}ms — ` +
            'run `node tools/voxbake.mjs` to bake it offline');
        }
      } catch { /* missing/broken donor — skipped */ }
    }));
  })();
  return loadPromise;
}

// plain-JSON view of every voxelized donor (the bake tool writes these out)
export function serializeDonors() {
  const out = {};
  for (const [name, d] of donors) {
    out[name] = { cells: d.cells, nx: d.nx, ny: d.ny, nz: d.nz, themes: d.themes };
  }
  return out;
}

// donors available to a theme (empty array until the preload lands)
export function buildingDonors(themeId) {
  const out = [];
  for (const d of donors.values()) {
    if (!d.themes || d.themes.includes(themeId)) out.push(d);
  }
  return out;
}
