// LARGE STRUCTURES THAT ARE NOT BUILDINGS.
//
// A big destructible mass has a gameplay job — it blocks sight, it gives
// cover, you climb it, you knock it down — and until now every one of them
// was a BUILDING: chunk shells wearing a facade texture. That is right for a
// city and wrong for a caldera, a mine and an ice station, where the things
// worth hiding behind are geology.
//
// A STRUCTURE KIND keeps the gameplay identical and changes what it is made
// of: the same destructible chunks (so it collapses, cascades, takes damage,
// carries fountains and can be climbed exactly like a tower), a silhouette
// from the LANDFORM family in massing.js, its own cell scale, its own
// palette, and — the part a building cannot do — ITS OWN MATERIAL. Crystal
// glows, ice is translucent, basalt is matte black rock. That needs a
// separate InstancedMesh, so each kind names a `mat` and the arena builds one
// DestructibleSystem per material actually used (arena.js `structoFor`).
//
// TEXTURES SLOT IN: every kind names the texture-pack material it WANTS
// (`tex`), and gets it the moment those images exist (`hasTex` gate,
// docs/ASSET_REQUESTS_STRUCTURES.md carries the prompts). Until then the
// procedural colour below is what ships, and it is meant to look right on
// its own — a missing texture must never be the difference between a
// finished arena and a broken one.
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { hasTex, pbrMaterial } from '../core/texload.js';
import { torusDist } from './designs/util.js';
import { generateMassing } from './massing.js';

/**
 * kind: {
 *   style      massing.js silhouette (the LANDFORM family)
 *   mat        which MATERIAL family it belongs to — kinds sharing one
 *              share a DestructibleSystem, so keep this coarse
 *   tex        texture-pack name to use when the images are there
 *   tints      per-structure base colours (varied colour is the point on
 *              crystal); a cell may still carry its own accent tint
 *   accent     {color, chance} — the odd chunk lit differently: ember in
 *              basalt, a bright facet in a crystal
 *   cell       [minSize, maxSize] chunk size; landforms are chunkier than
 *              buildings, crystal is finer
 *   hRange     floors, before the silhouette's own rules
 *   climbable  advisory only — everything here is solid and climbable
 * }
 */
export const STRUCTURE_KINDS = {
  // ---- volcanic ----
  volcanicMound: {
    style: 'mound', mat: 'basalt', tex: 'struct_basalt_rock',
    tints: [0x3c312a, 0x463830, 0x342a25, 0x4e3d33],
    accent: { color: 0xff5a10, chance: 0.09, emissive: true },
    cell: [5.0, 6.6], hRange: [3, 5],
  },
  basaltCliff: {
    style: 'columns', mat: 'basalt', tex: 'struct_basalt_rock',
    tints: [0x372d28, 0x40332c, 0x4a3b31],
    accent: { color: 0xff5a10, chance: 0.07, emissive: true },
    cell: [4.4, 5.6], hRange: [4, 7],
  },
  // ---- crystal ----
  crystalSpire: {
    style: 'spires', mat: 'crystal', tex: 'struct_crystal_facet',
    // VARIED COLOURS: a quarry lit by resonant crystal should not be one hue
    tints: [0xb46bff, 0x7a5cff, 0xff6bd8, 0x53e8ff, 0x9affd8, 0xffa8f0],
    accent: { color: 0xffffff, chance: 0.07, emissive: true },
    cell: [3.6, 4.6], hRange: [5, 8],
  },
  crystalMassif: {
    style: 'columns', mat: 'crystal', tex: 'struct_crystal_facet',
    tints: [0x8f6bff, 0xb46bff, 0x6b8fff],
    accent: { color: 0xe8d8ff, chance: 0.1, emissive: true },
    cell: [4.2, 5.2], hRange: [4, 7],
  },
  // ---- frozen ----
  iceberg: {
    style: 'berg', mat: 'iceRock', tex: 'struct_ice_glacier',
    tints: [0xbcd8e8, 0xa8cadd, 0xcfe4f0],
    accent: { color: 0x9be8ff, chance: 0.08 },
    cell: [4.8, 6.0], hRange: [4, 6],
  },
  iceWorks: {
    // the human-made ones: cut blocks, semi-transparent, still destructible
    style: 'iceWall', mat: 'iceGlass', tex: 'struct_ice_cut',
    tints: [0x9fd8ee, 0xb8e6f6, 0x8ecde6],
    accent: { color: 0x53c8ff, chance: 0.14, emissive: true },
    cell: [4.2, 5.2], hRange: [3, 4],
  },
  snowDrift: {
    // wind-packed snow: low, wide and smooth. It is the one structure here
    // that should read as SOFT, which is entirely the chunk shape's doing —
    // same mound silhouette as a rock outcrop, drawn as overlapping rounded
    // lumps rather than boulders or shards
    style: 'drift', mat: 'snow', tex: 'struct_snow_pack',
    tints: [0xe8f2fa, 0xdcebf6, 0xf2f8ff],
    // A DRIFT IS WIDE AND LOW. At the 2-3 floors the other landforms use it
    // came out a two-storey wall of snow, which is a bank, not a pile — the
    // shape was right and the proportion was not.
    cell: [6.0, 7.6], hRange: [1, 2],
  },
  iceTower: {
    style: 'habitat', mat: 'iceGlass', tex: 'struct_ice_cut',
    tints: [0xa8dcf0, 0xc4e8f8],
    accent: { color: 0x53c8ff, chance: 0.12, emissive: true },
    cell: [3.8, 4.8], hRange: [4, 6],
  },
  // ---- shared rock (quarry benches, scrap country) ----
  rockOutcrop: {
    style: 'mound', mat: 'stone', tex: 'struct_rock_grey',
    tints: [0x6a5f80, 0x585070, 0x74688c],
    cell: [4.6, 5.8], hRange: [3, 5],
  },
};

// MATERIAL FAMILIES. One DestructibleSystem per family per arena, built on
// demand — a theme that names no structures builds none of this.
// PER-CHUNK COLOUR NEEDS `vertexColors: true` — see the note in
// destructible.js: without it three computes the instance colour and then
// throws it away in the fragment stage, and a whole palette does nothing.
//
// AND THE GLOW IS DIFFUSE, NOT EMISSIVE. `emissive` is a UNIFORM, so one
// material cannot glow in six crystal hues — and a uniform emissive over a
// near-black basalt tint washes the rock to white, which is exactly how the
// first build of these looked. What sells "lit from within" here is a
// saturated instance colour and the bloom pass finding it: the ember chunks
// in a basalt cliff and the facets of a crystal spire are BRIGHT DIFFUSE,
// and they bloom because they are bright, per chunk, in their own hue.
const MAT_FAMILIES = {
  // BASALT: matte black rock whose ACCENT chunks are still-hot cracks. The
  // emissive is driven by the instance colour, so the near-black rock tints
  // glow at essentially nothing while an ember chunk (0xff5a10) lights up —
  // one material, both readings, no second draw call.
  basalt: () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0.02, vertexColors: true,
  }),
  stone: () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0.03, vertexColors: true,
  }),
  // CRYSTAL: lit from within. The per-chunk instance colour drives the
  // emissive too (emissive white × vertex colour), so one material serves
  // every hue in `tints` — which is what makes "varied colours" free.
  crystal: () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.12, metalness: 0.0, vertexColors: true,
    flatShading: true,
  }),
  // ICE, natural: dense, barely translucent, faintly glowing at the edges
  iceRock: () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.28, metalness: 0.0, vertexColors: true,
    flatShading: true,
  }),
  // ICE, cut: the SEMI-TRANSPARENT one. Deliberately NOT
  // MeshPhysicalMaterial.transmission — that renders through a pass this
  // scene never runs (see the glacier taunt note in CLAUDE.md), so it would
  // be perfectly correct and completely invisible. Plain alpha blending with
  // depthWrite ON: chunks read as solid glass blocks and still sort sanely
  // against each other, which matters when a wall is 40 chunks deep.
  // SNOW: bright, flat, faintly blue in shadow — the least shiny thing in
  // the game, and deliberately smooth-shaded (no flatShading) so a drift
  // reads as one soft mass rather than a heap of facets
  snow: () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1.0, metalness: 0.0, vertexColors: true,
  }),
  iceGlass: () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.1, metalness: 0.0, vertexColors: true,
    transparent: true, opacity: 0.6, depthWrite: true,
  }),
};

/**
 * ONE STRUCTURE'S SHAPE — silhouette, chunk size, tint, accents — as plain
 * data, without building anything. The arena runs it to place a structure,
 * the arena's AUTHORED path runs it for a hand-placed one that carries no
 * baked cells, and the level editor runs it to draw its stand-in. Three
 * callers, one answer: an editor that computed its own silhouette would be
 * showing you a different rock from the one that ships.
 *
 * Same `rng` in, same structure out — so a seeded arena rebuilds chunk for
 * chunk, and the editor's proxy matches the game's build when both seed off
 * the placement.
 */
/**
 * The seed a HAND-PLACED structure grows from: its own position, rounded, so
 * the rock the editor drew is the rock the match builds and moving it gives
 * you a different one (which is the honest behaviour — it is a new rock).
 */
export const structSeed = (o) => (Math.round(o.x * 7) * 73856093
  ^ Math.round(o.z * 7) * 19349663 ^ (o.seed || 0)) >>> 0;

export function structureMassing(kind, rng, tall = false) {
  const def = STRUCTURE_KINDS[kind];
  if (!def) return null;
  const m = generateMassing(def.style, rng, { hRange: def.hRange, tall });
  const [c0, c1] = def.cell;
  const cw = rng.range(c0, c1), cd = rng.range(c0, c1);
  const ch = rng.range(c0, c1) * 1.15;
  const tint = def.tints[rng.int(0, def.tints.length - 1)];
  // the odd chunk lit differently — ember in the basalt, a bright facet in a
  // crystal. Per-CELL tint, which addBuildingCells already honours.
  const cells = def.accent
    ? m.cells.map((c) => (rng.chance(def.accent.chance)
      ? { ...c, tint: def.accent.color } : c))
    : m.cells;
  // A LANDFORM IS ALLOWED TO BE BIG. The building path clamps a wide
  // silhouette to 19/nx so a tower never swallows the street — apply that to
  // a mound eleven cells across and it comes out with 2.2-unit chunks, which
  // is a pile of gravel where a hill was meant to be. A mound SHOULD be forty
  // units across; the clamp here only stops the extreme.
  return {
    cells, nx: m.nx, ny: m.ny, nz: m.nz, tint,
    cw: Math.min(cw, 58 / m.nx), ch, cd: Math.min(cd, 58 / m.nz),
  };
}

/**
 * WHAT ONE CHUNK OF EACH FAMILY IS SHAPED LIKE (chunkgeo.js CHUNK_SHAPES).
 *
 * A structure's material said what it is MADE of; this says what it is
 * shaped like, and without it every one of these read as exactly what it is
 * built from — a stack of cubes on a lattice. Crystal grows in shards, rock
 * weathers into rounded lumps, a berg fractures, a drift packs smooth, and
 * cut ice is sawn slabs standing on end (the one man-made family here, so
 * the one that keeps a regular look).
 *
 * The shape rides the DestructibleSystem, so it is per FAMILY — the same
 * grouping the materials already use, and the same reason: one instanced
 * mesh per look.
 */
const FAMILY_SHAPE = {
  basalt: 'boulder',
  stone: 'boulder',
  crystal: 'crystal',
  iceRock: 'icefall',
  iceGlass: 'iceSlab',
  snow: 'snow',
};
export const structureChunkShape = (family) => FAMILY_SHAPE[family] || 'box';

/**
 * The material array a DestructibleSystem wants (box face order: px, nx, py,
 * ny, pz, nz — the building path passes [side, side, roof, roof, side, side];
 * a landform has no roof, so one material serves every face).
 *
 * `tex` is used when the pack has it. Structures are lit by their own colour
 * per chunk, so a texture is tinted by the instance colour exactly as a
 * facade is — the images can land later with no code change.
 */
export function structureMaterial(family, tex) {
  const base = (MAT_FAMILIES[family] || MAT_FAMILIES.stone)();
  if (CONFIG.useTextures && tex && hasTex('struct', tex)) {
    const packed = pbrMaterial('struct', tex, { repeat: 1 });
    if (packed) {
      // keep the family's own optical character (glow, translucency); take
      // the pack's surface detail
      packed.roughness = base.roughness;
      packed.metalness = base.metalness;
      packed.transparent = base.transparent;
      packed.opacity = base.opacity;
      packed.depthWrite = base.depthWrite;
      packed.vertexColors = true;
      packed.flatShading = base.flatShading;
      // THE GLOW IS A MAP NOW, AND IT IS TINTED PER CHUNK. The basalt and
      // crystal packs ship an emissive map — hot cracks in the rock, light
      // along the fracture lines in the crystal — and `emissive` is a
      // UNIFORM, so left alone it lights every chunk the same and washes a
      // near-black mound to white (which is exactly how the first build of
      // these looked, and why the intensity used to be pinned at 0). vColor
      // is the instance colour and it is already in this shader, so
      // multiplying the emissive by it gives the map its per-chunk hue for
      // free: an ember chunk's cracks burn orange, the rock around it
      // barely glows, and one crystal spire glows in six colours.
      if (packed.emissiveMap) {
        packed.emissiveIntensity = family === 'crystal' ? 0.85 : 1.1;
        packed.onBeforeCompile = (s) => {
          s.fragmentShader = s.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;'
          );
        };
        // a patched shader must not be handed a cached program compiled from
        // the unpatched source
        packed.customProgramCacheKey = () => 'structEmissiveByInstance';
      } else {
        packed.emissiveIntensity = 0;
      }
      base.dispose();
      return packed;
    }
  }
  return base;
}

/**
 * Turn a design's building sites into structure sites — IN GROUPS.
 *
 * The ask is "replace about 60% of the buildings, as clusters, never
 * interleaved", and the reason is legibility: a crystal spire standing
 * between two office blocks reads as a mistake, while a whole field of them
 * reads as a place. So this never converts a site on its own — it converts
 * whole GROUPS, and a group is either a design system's own cluster (which
 * is already a city block, a bastion, a ward's court) or, for the scattered
 * sites that have no cluster, a spatial nest built here by walking each
 * seed's nearest neighbours on the torus.
 *
 * `theme.structures` is the declaration: [{ kind, share }]. Shares are of
 * the WHOLE site budget, so 0.35 + 0.25 means 60% of the arena's large
 * structures stop being buildings.
 *
 * Mutates and returns `sites` (each converted one gets `.struct = kind`).
 */
export function assignStructures(sites, theme, rng, P) {
  const specs = theme.structures;
  if (!specs?.length || !sites.length) return sites;

  // ---- build the groups ----
  const groups = new Map();          // key -> [site …]
  const loose = [];
  for (const s of sites) {
    if (s.cluster >= 0) {
      const k = `c${s.cluster}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    } else loose.push(s);
  }
  // scattered sites: greedy nests of 2–4 nearest neighbours, so the loose
  // country converts in patches too rather than speckling
  let n = 0;
  const taken = new Set();
  for (const s of loose) {
    if (taken.has(s)) continue;
    const near = loose
      .filter((o) => o !== s && !taken.has(o))
      .map((o) => ({ o, d: torusDist(s.x, s.z, o.x, o.z, P) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, rng.int(1, 3))
      .filter((e) => e.d < 46)
      .map((e) => e.o);
    const g = [s, ...near];
    for (const m of g) taken.add(m);
    groups.set(`l${n++}`, g);
  }

  // ---- convert whole groups until each kind has its share ----
  const order = [...groups.values()];
  // biggest groups first: a structure field should be the thing you see,
  // and a 5-block ward of crystal reads better than five singles
  order.sort((a, b) => b.length - a.length);
  const total = sites.length;
  for (const spec of theme.structures) {
    let want = Math.round(total * (spec.share ?? 0.3));
    for (const g of order) {
      if (want <= 0) break;
      if (g._used) continue;
      // don't blow the budget wildly on one huge group
      if (g.length > want + 2 && want < total * 0.15) continue;
      g._used = true;
      for (const s of g) s.struct = spec.kind;
      want -= g.length;
    }
  }
  return sites;
}

/** Every structure kind a theme can place — what the arena preloads for. */
export function themeStructureKinds(theme) {
  return [...new Set((theme?.structures || []).map((s) => s.kind))]
    .filter((k) => STRUCTURE_KINDS[k]);
}
