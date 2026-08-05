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
// Monumental (the themes that should own no rectangles):
//         pyramid · mastaba · desertTemple · jungleTemple ·
//         habitat · ringHab
// Landforms (same chunks, geology instead of architecture — the kinds in
// src/arena/structures.js dress these with rock / crystal / ice materials):
//         mound · columns · spires · iceWall · berg

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

// a filled disc of cells of radius r about (cx,cz) — the primitive behind
// every ROUND form here (domes, crystal spires, volcanic mounds, habitats).
// Voxelized at chunk scale a disc reads as genuinely round, which is what
// keeps a landform from looking like another box.
function disc(fp, cx, cz, r) {
  const n = Math.ceil(r) + 1;
  for (let x = Math.floor(cx - n); x <= Math.ceil(cx + n); x++) {
    for (let z = Math.floor(cz - n); z <= Math.ceil(cz + n); z++) {
      if (Math.hypot(x - cx, z - cz) <= r + 0.35) fp.add(key(x, z));
    }
  }
  return fp;
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
    // ---- MONUMENTAL: the shapes that replace rectangles in the ancient
    // and off-world themes. A theme whose whole story is "older than the
    // war" should not be fighting among office blocks.
    case 'pyramid': {
      // a true pyramid: square, shrinking a ring a floor, to a capstone.
      // Landmarks get the full height their footprint allows.
      let w = rng.int(7, 9);
      if (opts.tall) w += 2;
      if (w % 2 === 0) w++;                       // odd, so it tips to one cell
      let fp = F(w, w);
      const steps = (w - 1) / 2;
      for (let y = 0; y <= steps; y++) {
        floors.push(fp);
        fp = shrink(fp);
      }
      break;
    }
    case 'mastaba': {
      // flat-topped trapezoid tomb — the low, wide desert form that sits
      // between the pyramids, with a battered (sloping) wall
      const w = rng.int(6, 8), d = rng.int(4, 6);
      ny = Math.max(3, Math.min(ny, 5));
      let fp = F(w, d);
      for (let y = 0; y < ny; y++) {
        floors.push(fp);
        if (y % 2 === 1) fp = shrink(fp);
      }
      break;
    }
    case 'desertTemple': {
      // pylon-fronted hall: two thick gate towers, a colonnaded hall
      // running back between them, a raised sanctuary at the far end
      const hall = rng.int(4, 6), w = 5;
      const towerH = Math.max(4, Math.min(ny + 1, 7));
      const hallH = Math.max(2, towerH - 2);
      for (let y = 0; y < towerH; y++) {
        const fp = new Set();
        rect(fp, 0, 0, 2, 2);                     // pylon towers, either side
        rect(fp, w - 2, 0, 2, 2);
        if (y < hallH) {
          rect(fp, 0, 2, w, hall);                // the hall behind them
        } else if (y < hallH + 2) {
          rect(fp, 1, 2 + hall - 2, w - 2, 2);    // sanctuary over the rear
        }
        floors.push(fp);
      }
      break;
    }
    case 'jungleTemple': {
      // a stepped temple-pyramid with a STAIR spine down one face and a
      // shrine cell on the crown — the silhouette the theme is named for
      const w = rng.int(6, 8);
      const steps = Math.max(3, Math.min(Math.floor(w / 2), 4));
      let fp = F(w, w);
      const perStep = 2;
      for (let s = 0; s < steps; s++) {
        for (let k = 0; k < perStep; k++) floors.push(new Set(fp));
        fp = shrink(fp);
      }
      // the shrine, and a stair running the full height down the +z face
      const sw = Math.max(2, Math.floor(w / 3));
      const s0 = Math.floor((w - sw) / 2);
      for (let y = 0; y < 3; y++) floors.push(F(sw, sw, s0, s0));
      const stairX = Math.floor(w / 2);
      floors.forEach((fl, y) => {
        const reach = Math.max(0, w - 1 - Math.floor(y / perStep));
        for (let z = reach; z < w; z++) fl.add(key(stairX, z));
      });
      break;
    }
    case 'habitat': {
      // ROUNDED space-age: a circular tower that swells into an observation
      // crown — grown a ring at a time, so the overhang rule holds
      const r0 = rng.range(1.6, 2.4);
      ny = Math.max(5, Math.min(ny + 2, 9));
      const c = Math.ceil(r0) + 2;
      const crown = Math.floor(ny * rng.range(0.62, 0.75));
      for (let y = 0; y < ny; y++) {
        const t = y < crown ? r0 * 0.82
          : r0 * (1.0 + 0.5 * Math.min(1, (y - crown) / 1.5) - 0.35 * Math.max(0, (y - crown - 2) / 2));
        const fp = disc(new Set(), c, c, Math.max(0.9, t));
        floors.push(fp);
      }
      break;
    }
    case 'ringHab': {
      // ANGULAR space-age: a wide drum base carrying a stepped octagonal
      // block and a mast — a docking spine rather than an office tower
      const r = rng.range(2.4, 3.2);
      const c = Math.ceil(r) + 2;
      ny = Math.max(4, Math.min(ny, 7));
      for (let y = 0; y < ny; y++) {
        const fp = new Set();
        if (y < 2) disc(fp, c, c, r);                    // the drum
        else if (y < ny - 1) rect(fp, c - 2, c - 2, 4, 4); // the block
        else rect(fp, c - 1, c - 1, 2, 2);
        floors.push(fp);
      }
      for (let y = 0; y < 3; y++) floors.push(F(1, 1, c, c));   // the mast
      break;
    }

    // ---- LANDFORMS: not buildings at all. Same destructible chunks, but
    // the shapes are geology, and structures.js gives them their own
    // materials (basalt, crystal, ice) instead of a building facade.
    case 'mound': {
      // a volcanic mound / rubble hill: a wide irregular dome whose radius
      // wobbles per floor, so nothing about it reads as machined
      const r0 = rng.range(3.4, 5.2) * (opts.tall ? 1.25 : 1);
      const c = Math.ceil(r0) + 2;
      const layers = Math.max(4, Math.round(r0 * rng.range(1.25, 1.75)));
      for (let y = 0; y < layers; y++) {
        const t = 1 - y / layers;
        const r = r0 * (0.35 + 0.65 * t) * rng.range(0.86, 1.06);
        const fp = disc(new Set(), c + rng.range(-0.5, 0.5), c + rng.range(-0.5, 0.5),
          Math.max(0.8, r));
        floors.push(fp);
      }
      break;
    }
    case 'columns': {
      // basalt columns / a cliff face: a bundle of square shafts at
      // different heights, tallest along one edge — jointed rock, not a wall
      const w = rng.int(4, 6), d = rng.int(3, 5);
      const top = Math.max(5, ny + rng.int(1, 3));
      const hmap = [];
      const lean = rng.chance(0.5) ? 'x' : 'z';
      for (let x = 0; x < w; x++) {
        for (let z = 0; z < d; z++) {
          const along = lean === 'x' ? x / Math.max(1, w - 1) : z / Math.max(1, d - 1);
          const h = Math.max(1, Math.round(top * (0.35 + 0.65 * along) * rng.range(0.78, 1.12)));
          hmap.push({ x, z, h });
        }
      }
      const hi2 = Math.max(...hmap.map((c) => c.h));
      for (let y = 0; y < hi2; y++) {
        const fp = new Set();
        for (const c of hmap) if (y < c.h) fp.add(key(c.x, c.z));
        floors.push(fp);
      }
      break;
    }
    case 'spires': {
      // a crystal cluster: several tapering shafts of different heights
      // leaning out of one base — the jagged silhouette, in voxels
      const n = rng.int(3, 5);
      const span = rng.int(5, 7);
      const shafts = [];
      for (let i = 0; i < n; i++) {
        shafts.push({
          x: rng.int(1, span - 1), z: rng.int(1, span - 1),
          h: Math.max(3, Math.round((ny + rng.int(0, 4)) * (i === 0 ? 1.25 : rng.range(0.5, 0.95)))),
          dx: rng.chance(0.5) ? 1 : -1, dz: rng.chance(0.5) ? 1 : -1,
          lean: rng.range(0.1, 0.32),               // cells of drift per floor
        });
      }
      const top = Math.max(...shafts.map((s) => s.h));
      for (let y = 0; y < top; y++) {
        const fp = new Set();
        if (y < 1) disc(fp, span / 2, span / 2, span * 0.42);   // the bed
        for (const s of shafts) {
          if (y >= s.h) continue;
          // taper: a 2-wide shaft near the base, one cell at the tip
          const ox = Math.round(s.dx * s.lean * y), oz = Math.round(s.dz * s.lean * y);
          fp.add(key(s.x + ox, s.z + oz));
          if (y < s.h * 0.45) {
            fp.add(key(s.x + ox + 1, s.z + oz));
            fp.add(key(s.x + ox, s.z + oz + 1));
          }
        }
        floors.push(fp);
      }
      break;
    }
    case 'iceWall': {
      // HUMAN-MADE ice: a cut block wall with a gateway through it and a
      // stepped parapet — quarried, not grown
      const w = rng.int(6, 8);
      ny = Math.max(3, Math.min(ny, 5));
      const gate = Math.floor(w / 2);
      const d = 2;
      for (let y = 0; y < ny; y++) {
        const fp = new Set();
        for (let x = 0; x < w; x++) {
          // the gateway: two cells wide, open for the lower two floors
          if (y < 2 && (x === gate || x === gate - 1)) continue;
          for (let z = 0; z < d; z++) fp.add(key(x, z));
        }
        floors.push(fp);
      }
      // parapet: alternating merlons along the top
      const cap = new Set();
      for (let x = 0; x < w; x += 2) cap.add(key(x, 0));
      floors.push(cap);
      break;
    }
    case 'berg': {
      // an ice mountain: a steep irregular peak, shrinking fast, with one
      // shoulder — reads as a crag rather than a dome
      const r0 = rng.range(2.6, 3.8) * (opts.tall ? 1.3 : 1);
      const c = Math.ceil(r0) + 2;
      const layers = Math.max(5, Math.round(r0 * rng.range(1.6, 2.2)));
      const shx = rng.chance(0.5) ? 1 : -1;
      for (let y = 0; y < layers; y++) {
        const t = 1 - y / layers;
        const fp = disc(new Set(), c, c, Math.max(0.8, r0 * t * rng.range(0.9, 1.08)));
        if (y < layers * 0.45) {                    // the shoulder
          disc(fp, c + shx * r0 * 0.7, c + r0 * 0.2, Math.max(0.8, r0 * 0.45 * t));
        }
        floors.push(fp);
      }
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
  // NO RECTANGLES IN THE ANCIENT AND OFF-WORLD THEMES. What is left standing
  // in a dig site is a temple, not an office block; the jungle's kings built
  // stepped pyramids; a station deck carries drums and habitats. These three
  // draw only from the monumental family (massing.js), so a plain box cannot
  // turn up in them at all.
  ruins: [['desertTemple', 'mastaba', 'ziggurat', 'pyramid', 'ruin'], ['pyramid', 'ziggurat']],
  jungle: [['jungleTemple', 'ziggurat', 'pagoda', 'ruin'], ['jungleTemple']],
  orbital: [['habitat', 'ringHab', 'modules', 'dome'], ['habitat', 'ringHab']],
};
