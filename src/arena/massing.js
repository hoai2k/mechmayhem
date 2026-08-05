// Building massing generator: theme-flavored silhouettes as occupancy-cell
// lists for DestructibleSystem.addBuildingCells. Buildings stop being plain
// rectangular shells — setback towers, ziggurats, warehouses with clerestory
// spines, offset module stacks — while staying EXACTLY as destructible,
// because the output is just a different arrangement of the same chunks.
//
// A massing is built as a stack of per-floor FOOTPRINTS (sets of gx,gz),
// then reduced to its shell (cells with at least one exposed face) so the
// chunk budget goes to surfaces a player can actually see and shoot.
// Overhangs are legal up to 1 cell (the support rule accepts a diagonal
// neighbour below); every style here respects that.
//
// generateMassing(style, rng, opts) -> { cells, nx, ny, nz }
//   opts: { hRange: [min,max] floors, tall: bool (landmark), accent?: tint }
// Styles: tower · slab · lshape · ziggurat · pagoda · warehouse ·
//         industrial · modules · bunker · terrace · court · ruin ·
//         dome · silo

// footprint helpers ---------------------------------------------------------
const key = (x, z) => `${x},${z}`;

function rect(fp, x0, z0, w, d) {
  for (let x = x0; x < x0 + w; x++) {
    for (let z = z0; z < z0 + d; z++) fp.add(key(x, z));
  }
}

// shrink a footprint by one ring (for ziggurat/setback tiers)
function shrink(fp) {
  const out = new Set();
  for (const k of fp) {
    const [x, z] = k.split(',').map(Number);
    if (fp.has(key(x - 1, z)) && fp.has(key(x + 1, z)) &&
        fp.has(key(x, z - 1)) && fp.has(key(x, z + 1))) out.add(k);
  }
  return out.size ? out : fp;
}

// grow by one ring — pagoda tiers overhang their support by one cell (legal)
function grow(fp) {
  const out = new Set(fp);
  for (const k of fp) {
    const [x, z] = k.split(',').map(Number);
    out.add(key(x - 1, z)); out.add(key(x + 1, z));
    out.add(key(x, z - 1)); out.add(key(x, z + 1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// stack the floors, then emit only shell cells
function emit(floors, accent = null, accentEvery = 0) {
  const solid = new Set();
  floors.forEach((fp, gy) => { for (const k of fp) solid.add(`${k},${gy}`); });
  const has = (x, z, y) => solid.has(`${x},${z},${y}`);
  const cells = [];
  let maxX = 0, maxZ = 0;
  floors.forEach((fp, gy) => {
    for (const k of fp) {
      const [x, z] = k.split(',').map(Number);
      maxX = Math.max(maxX, x); maxZ = Math.max(maxZ, z);
      const below = gy === 0 || has(x, z, gy - 1);   // ground seals the underside
      const buried = has(x - 1, z, gy) && has(x + 1, z, gy) &&
        has(x, z - 1, gy) && has(x, z + 1, gy) &&
        below && has(x, z, gy + 1);
      if (buried && gy !== 0) continue;   // keep the ground floor intact for collapse checks
      const cell = { gx: x, gy, gz: z };
      if (accent && accentEvery && gy % accentEvery === accentEvery - 1) cell.tint = accent;
      cells.push(cell);
    }
  });
  return { cells, nx: maxX + 1, ny: floors.length, nz: maxZ + 1 };
}

// roof clutter: 1-cell blocks (water tank / AC / stair head) on the top tier
function roofBits(floors, rng, n = 2) {
  const top = floors[floors.length - 1];
  if (!top || top.size < 4) return;
  const spots = [...top];
  const bits = new Set();
  for (let i = 0; i < n; i++) {
    const k = spots[rng.int(0, spots.length - 1)];
    bits.add(k);
  }
  if (bits.size) floors.push(bits);
}

// ---------------------------------------------------------------------------
export function generateMassing(style, rng, opts = {}) {
  const [h0, h1] = opts.hRange || [4, 8];
  let ny = rng.int(h0, h1);
  if (opts.tall) ny = h1 + rng.int(1, 3);
  const floors = [];
  const F = (w, d, x0 = 0, z0 = 0) => {
    const fp = new Set();
    rect(fp, x0, z0, w, d);
    return fp;
  };

  switch (style) {
    case 'slab': {
      // thin tall slab with a service fin on one face
      const w = rng.int(4, 5), d = 2;
      const finX = rng.int(1, w - 2);
      for (let y = 0; y < ny; y++) {
        const fp = F(w, d);
        if (y < ny - 1) rect(fp, finX, d, 1, 1);   // fin runs almost full height
        floors.push(fp);
      }
      roofBits(floors, rng, 1);
      break;
    }
    case 'lshape': {
      // L footprint, one wing taller than the other
      const w = rng.int(4, 5), d = rng.int(3, 4);
      const wingH = Math.max(2, Math.round(ny * rng.range(0.4, 0.6)));
      for (let y = 0; y < ny; y++) {
        const fp = new Set();
        rect(fp, 0, 0, 2, d);                       // tall wing
        if (y < wingH) rect(fp, 2, 0, w - 2, 2);    // low wing
        floors.push(fp);
      }
      roofBits(floors, rng, 2);
      break;
    }
    case 'ziggurat': {
      // stepped pyramid — ruins/jungle temples (2 floors per step)
      const w = rng.int(5, 6);
      ny = Math.max(4, Math.min(ny, 7));
      let fp = F(w, w);
      for (let y = 0; y < ny; y++) {
        floors.push(fp);
        if (y % 2 === 1) fp = shrink(fp);
      }
      break;
    }
    case 'pagoda': {
      // alternating tiers with 1-cell eave overhangs
      const w = rng.int(3, 4);
      ny = Math.max(5, Math.min(ny + 1, 9));
      let fp = F(w, w, 1, 1);
      for (let y = 0; y < ny; y++) {
        const eave = y % 3 === 2;
        floors.push(eave ? grow(fp) : fp);
        if (eave && w > 2 && y > ny * 0.4) fp = shrink(fp);
      }
      floors.push(F(1, 1, Math.ceil(w / 2), Math.ceil(w / 2)));   // finial
      break;
    }
    case 'warehouse': {
      // long low shed with a clerestory spine — ports, works floors
      const w = rng.int(5, 7), d = rng.int(3, 4);
      ny = rng.int(2, 3);
      for (let y = 0; y < ny; y++) floors.push(F(w, d));
      const spine = new Set();
      rect(spine, 1, Math.floor(d / 2) - 0, w - 2, 1);
      floors.push(spine);
      break;
    }
    case 'industrial': {
      // works hall + attached boiler tower
      const w = rng.int(4, 6), d = 3;
      const hallH = rng.int(2, 3);
      const towerH = Math.max(hallH + 2, ny);
      for (let y = 0; y < towerH; y++) {
        const fp = new Set();
        if (y < hallH) rect(fp, 0, 0, w, d);
        rect(fp, w - 2, 0, 2, 2);                   // tower on the corner
        floors.push(fp);
      }
      roofBits(floors, rng, 1);
      break;
    }
    case 'modules': {
      // offset stacked modules — station habitats
      const w = rng.int(3, 4);
      ny = Math.max(4, ny);
      let x0 = 1, z0 = 1;
      const stepEvery = rng.int(2, 3);
      for (let y = 0; y < ny; y++) {
        floors.push(F(w, w, x0, z0));
        if (y % stepEvery === stepEvery - 1) {
          x0 = Math.max(0, Math.min(2, x0 + rng.int(-1, 1)));
          z0 = Math.max(0, Math.min(2, z0 + rng.int(-1, 1)));
        }
      }
      break;
    }
    case 'bunker': {
      // low hardened block with a small tower cube
      const w = rng.int(4, 6), d = rng.int(3, 4);
      ny = rng.int(2, 3);
      for (let y = 0; y < ny; y++) floors.push(F(w, d));
      const tx = rng.int(0, w - 2), tz = rng.int(0, d - 2);
      floors.push(F(2, 2, tx, tz));
      floors.push(F(1, 1, tx, tz));
      break;
    }
    case 'court': {
      // three wings round an open courtyard, the back one taller — palace
      // blocks, city courts, temple precincts
      const w = rng.int(5, 6), d = rng.int(4, 5);
      ny = Math.max(3, Math.min(ny, 6));
      const wingH = Math.max(2, ny - rng.int(1, 2));
      for (let y = 0; y < ny; y++) {
        const fp = new Set();
        rect(fp, 0, 0, w, 2);                        // back wing
        if (y < wingH) {
          rect(fp, 0, 2, 2, d - 2);                  // side wings
          rect(fp, w - 2, 2, 2, d - 2);
        }
        floors.push(fp);
      }
      roofBits(floors, rng, 1);
      break;
    }
    case 'ruin': {
      // a broken shell: every column keeps its own ragged height, with one
      // wall line surviving at full height — a ruin, not a rubble pile
      const w = rng.int(4, 6), d = rng.int(3, 5);
      ny = Math.max(3, ny);
      const wallX = rng.chance(0.5) ? 0 : w - 1;     // the standing facade
      const hmap = [];
      for (let x = 0; x < w; x++) {
        for (let z = 0; z < d; z++) {
          const facade = x === wallX;
          const h = facade
            ? Math.max(2, ny - rng.int(0, 1))
            : Math.max(1, Math.round(ny * rng.range(0.2, 0.65)));
          hmap.push({ x, z, h });
        }
      }
      const top = Math.max(...hmap.map((c) => c.h));
      for (let y = 0; y < top; y++) {
        const fp = new Set();
        for (const c of hmap) if (y < c.h) fp.add(key(c.x, c.z));
        floors.push(fp);
      }
      break;
    }
    case 'dome': {
      // stepped dome — radar shells, habitats, kilns. Circular profile, so
      // every tier shrinks and the support rule is safe by construction.
      const R = rng.int(2, 3) + 0.5;
      ny = Math.max(3, Math.min(ny, Math.round(R * 2) + 1));
      for (let y = 0; y < ny; y++) {
        const fp = new Set();
        const rr = R * Math.sqrt(Math.max(0, 1 - ((y + 0.5) / ny) ** 2));
        const n = Math.ceil(R * 2);
        for (let x = 0; x <= n; x++) {
          for (let z = 0; z <= n; z++) {
            if (Math.hypot(x - R, z - R) <= rr + 0.45) fp.add(key(x, z));
          }
        }
        if (!fp.size) break;
        floors.push(fp);
      }
      break;
    }
    case 'silo': {
      // a tank battery: two or three 2×2 towers off one shared low base —
      // refineries, grain silos, cryo farms. Reads at a glance as INDUSTRY.
      const kT = rng.int(2, 3);
      const pitch = 3;                               // 2 cells + 1 alley
      const w = kT * pitch - 1, d = rng.int(3, 4);
      ny = Math.max(4, ny);
      const z0 = Math.max(0, Math.floor((d - 2) / 2));
      const hs = Array.from({ length: kT }, (_, t) => ny - (t % 2 ? rng.int(0, 1) : 0));
      for (let y = 0; y < ny; y++) {
        const fp = new Set();
        if (y < 1) rect(fp, 0, 0, w, d);             // the shared base slab
        for (let t = 0; t < kT; t++) {
          if (y < hs[t]) rect(fp, t * pitch, z0, 2, 2);
        }
        if (!fp.size) break;
        floors.push(fp);
      }
      break;
    }
    case 'terrace': {
      // benches climbing sideways — quarry/hillside blocks
      const w = rng.int(5, 6), d = rng.int(3, 4);
      ny = Math.max(4, Math.min(ny, 7));
      for (let y = 0; y < ny; y++) {
        const cut = Math.min(w - 2, Math.floor((y / ny) * w));
        floors.push(F(w - cut, d, cut, 0));
      }
      break;
    }
    case 'tower':
    default: {
      // setback tower: tiers shrink on the way up; landmarks grow a spire
      let w = rng.int(4, 5), d = rng.int(3, 4);
      let fp = F(w, d);
      const tierEvery = rng.int(2, 4);
      for (let y = 0; y < ny; y++) {
        floors.push(fp);
        if (y % tierEvery === tierEvery - 1 && y < ny - 1 && fp.size > 6) {
          fp = shrink(fp);
        }
      }
      if (opts.tall) {
        // spire: 2-3 single cells over the roof's center of mass
        let sx = 0, sz = 0, n = 0;
        for (const k of floors[floors.length - 1]) {
          const [x, z] = k.split(',').map(Number);
          sx += x; sz += z; n++;
        }
        sx = Math.round(sx / n); sz = Math.round(sz / n);
        const spireH = rng.int(2, 3);
        for (let s = 0; s < spireH; s++) floors.push(F(1, 1, sx, sz));
      } else {
        roofBits(floors, rng, rng.int(1, 2));
      }
      break;
    }
  }
  return emit(floors);
}

// per-theme massing palettes (used by arena.js when a theme doesn't name its
// own): each entry is [styles for normal blocks, styles for the landmark]
// Audited against all 12 themes (2026-08): every theme draws from at least
// four silhouette families so a ward of its buildings never reads as one
// shape repeated, and each theme's list carries its own signature — courts
// for the civic cities, ruins for the fallen ones, domes for the sealed
// habitats, silo batteries for the works.
export const THEME_MASSING = {
  neon: [['tower', 'slab', 'lshape', 'pagoda', 'court'], ['tower']],
  foundry: [['industrial', 'warehouse', 'slab', 'silo'], ['industrial', 'silo']],
  uptown: [['tower', 'slab', 'lshape', 'court'], ['tower']],
  harbor: [['warehouse', 'industrial', 'lshape', 'silo'], ['warehouse']],
  skyterrace: [['tower', 'slab', 'modules', 'court'], ['tower']],
  scrapyard: [['warehouse', 'industrial', 'bunker', 'ruin', 'silo'], ['industrial']],
  quarry: [['terrace', 'industrial', 'bunker', 'dome'], ['industrial']],
  volcano: [['bunker', 'industrial', 'terrace', 'ruin'], ['industrial']],
  frozen: [['bunker', 'warehouse', 'modules', 'dome'], ['modules', 'dome']],
  ruins: [['ziggurat', 'terrace', 'bunker', 'ruin', 'court'], ['ziggurat']],
  jungle: [['ziggurat', 'pagoda', 'bunker', 'ruin'], ['ziggurat']],
  orbital: [['modules', 'slab', 'tower', 'dome'], ['modules']],
};
