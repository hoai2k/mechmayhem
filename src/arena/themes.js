// The 12 arena themes. Pure data + prop placement lists, consumed by arena.js.
// Layout fields:
//   sky {top,bottom,stars}, fog {color,near,far}, sun/hemi/rim lights,
//   ground {color, road(bool), accent}, buildings {count,tints,styles,hRange,
//   massing?: [[normal styles],[landmark styles]] — silhouette families from
//   src/arena/massing.js; every theme has a default in THEME_MASSING there,
//   facadeTex?/roofTex?: this theme's OWN building material (texture-pack
//   name — see docs/ASSET_REQUESTS_ARENA_DESIGN.md); gated on the texture
//   existing, so naming one before its images land changes nothing},
//   props [{name, ring:[rMin,rMax], count, opts}], ambient (particle style),
//   bounds (half-size of square play area), pylonMat (boundary glow color)
//
// Prop spec extras (arena.js):
//   clump {n:[min,max], spread} — each placement seeds a NEST of the same
//        prop (groves, container yards): dense pockets instead of sprinkle
//   on: 'water'|'ice'|... — place INSIDE a terrain patch of that kind
//        (trawlers on the harbor basins); skipped if the seed made none
//
// layout {} drives the terrain layer (src/arena/terrain.js):
//   clearing — radius of the building/hazard-free spawn plaza (spawns at 34)
//   plaza    — paint spawn-ring markings at the center
//   lanes    — painted cell-crossing roads/streams: {kind, style?, count,
//              width, color?, dash?, glow?}. kinds: road, lava (burns),
//              water/canal (bogs down), oil (bogs harder), ice, crystal,
//              sand, stripe. Lanes tile: centerlines are periodic in the
//              wrap cell, so a lane exiting one edge re-enters opposite.
//   patches  — circular ground features: {kind, count, r:[min,max], ring?,
//              glow?, color?, organic?}. kinds: water/lake, lava, acid, oil,
//              mud, ice (low grip), sand, ash, grass, pave, void (the drop —
//              fall in, respawn at a cost), lowgrav (floaty jumps on and over
//              it). Painted at all 9 wrap offsets (tiling-safe); hazard kinds
//              are live like hazard lanes. Lakes! Lawns! Slag!
//   viaduct  — ONE endless raised highway/monorail loop following its own
//              periodic centerline around the whole cell: {h?, w?, edge?,
//              color?, amp?}. Walk under it, ride it via two ground-level
//              ramp dips, blow out deck segments, topple its piers.
//   bridges  — {count, color, edge?, h?} destructible causeways over streams
//   hills    — {count, color, hMax?, style?:'deck', edge?} walkable mounds
//   clusters — {count, size:[min,max]} building groups (city blocks,
//              factory compounds...) with streets between
//
// Layout philosophy (2026-07 redesign): every arena keeps a SPARSE center
// plaza (the spawn stage — all fighters meet with clean sight lines), a
// mid ring of scattered cover, and a DENSE outer band with one hero
// landmark for orientation. Prop rings are in pre-scale units (×1.85 in
// world); clearing/spawns are unscaled world units.
//
// Art direction: each theme keeps one or two saturated accent hues ("anime
// pops") against a readable mid-tone stage. Fighters live at y=0..10 within
// ~±bounds of origin — hemi/sun are balanced so they never sink into murk.
import { applyArenaText } from '../core/text.js';

export const THEMES = [
  {
    id: 'neon', name: 'Neon District', desc: 'Downtown at midnight. The signs stay lit even while the towers come down.',
    sky: { top: 0x04060f, bottom: 0x261344, stars: true },
    fog: { color: 0x161030, near: 90, far: 300 },
    sun: { color: 0x9fb4ff, intensity: 1.0, pos: [40, 90, -30] },
    hemi: { sky: 0x4a5ab0, ground: 0x281440, intensity: 0.68 },
    rim: { color: 0xff4dd8, intensity: 1.4, pos: [-60, 30, 60] },
    exposure: 1.06,
    ground: { color: 0x1e2126, road: true, accent: 0xff3dd4 },
    buildings: { count: 15, tints: [0x6a74a0, 0x5a6488, 0x8a6a9c, 0x7a88b0, 0x94789a], styles: [2, 0], hRange: [4, 8], glow: true },
    // canal quarter under an endless monorail loop: torii gates mark the
    // plaza edge, kiosk alleys mid-ring, ad-tower forest in the outer band
    props: [
      { name: 'toriiGate', ring: [21, 27], count: 2, opts: [{ color: 0xff4dd8 }, { color: 0x53e8ff }] },
      { name: 'holoGlobe', ring: [23, 31], count: 1 },
      { name: 'noodleKiosk', ring: [24, 36], count: 3, opts: [{ color: 0xffb43c }, { color: 0xff5040 }, { color: 0x62ff9a }] },
      { name: 'vendCluster', ring: [26, 40], count: 3 },
      { name: 'holoPillar', ring: [28, 44], count: 4, opts: [{ color: 0x53e8ff }, { color: 0xff4dd8 }, { color: 0x62ff9a }, { color: 0xffb43c }] },
      { name: 'substation', ring: [34, 48], count: 2 },
      { name: 'billboard', ring: [42, 56], count: 6, opts: [{ color: 0x53e8ff }, { color: 0xff4dd8 }, { color: 0xffb43c }, { color: 0x62ff9a }, { color: 0xff5040 }] },
      { name: 'streetlight', ring: [24, 46], count: 8, opts: { cold: true } },
      { name: 'antennaTower', ring: [48, 58], count: 3 },
    ],
    ambient: 'motes',
    bounds: 56,
    music: 'battleNight',
    layout: {
      clearing: 38, plaza: true,
      lanes: [
        { kind: 'road', style: 'asphalt', count: 3, width: 7, dash: 0xff3dd4 },
        { kind: 'canal', count: 1, width: 5.5, glow: 0x53e8ff },
      ],
      viaduct: { h: 7, w: 7.5, color: 0x2c3036, edge: 0xff3dd4 },
      bridges: { count: 1, color: 0x2c3036, edge: 0x53e8ff },
      clusters: { count: 6, size: [2, 4] },
    },
  },
  {
    id: 'foundry', name: 'Ironworks Foundry', desc: 'Steam, brass and molten light. The old machine-heart of the city still beats.',
    sky: { top: 0x1c1008, bottom: 0x6a3210, stars: false },
    fog: { color: 0x331d0e, near: 78, far: 260 },
    sun: { color: 0xffab60, intensity: 1.7, pos: [-50, 70, 40] },
    hemi: { sky: 0x7a5232, ground: 0x3a1a08, intensity: 0.66 },
    rim: { color: 0xff6a20, intensity: 1.15, pos: [60, 25, -60] },
    exposure: 1.08,
    ground: { color: 0x322c26, road: false, accent: 0xff5a10 },
    buildings: { count: 12, tints: [0x7a6450, 0x6a5442, 0x82684e, 0x5e5248], styles: [1, 3], hRange: [4, 7], glow: true },
    // the blast furnace anchors the works; molten slag pools + lava runs
    // carve the floor, conveyors and hoists make the mid-field a machine hall
    props: [
      { name: 'blastFurnace', ring: [38, 48], count: 1 },
      { name: 'moltenChannel', ring: [26, 38], count: 3 },
      { name: 'conveyor', ring: [30, 46], count: 2 },
      { name: 'pistonRig', ring: [30, 44], count: 2 },
      { name: 'chainHoist', ring: [32, 44], count: 2 },
      { name: 'coolantVat', ring: [22, 36], count: 3 },
      { name: 'smokestack', ring: [44, 56], count: 4 },
      { name: 'gear', ring: [34, 48], count: 3 },
      { name: 'pipes', ring: [28, 42], count: 2 },
      { name: 'fuelTank', ring: [18, 32], count: 3 },
    ],
    ambient: 'embers',
    steamVents: 6,
    bounds: 52,
    music: 'battleIndustrial',
    layout: {
      clearing: 38, plaza: true,
      lanes: [
        { kind: 'road', style: 'plate', count: 1, width: 6 },
        { kind: 'lava', count: 2, width: 5 },
      ],
      patches: [{ kind: 'lava', count: 2, r: [7, 10] }],
      bridges: { count: 2, color: 0x3a3026, edge: 0xff5a10 },
      hills: { count: 2, color: 0x453a30, hMax: 5 },   // slag heaps
      clusters: { count: 4, size: [2, 3] },
    },
  },
  {
    id: 'uptown', name: 'Uptown Plaza', desc: 'Glass towers, blue skies, and a city block with excellent demolition insurance.',
    sky: { top: 0x2e6ec8, bottom: 0xcfe4f4, stars: false },
    fog: { color: 0xaacadf, near: 115, far: 350 },
    sun: { color: 0xfff3dc, intensity: 2.7, pos: [60, 100, 40] },
    hemi: { sky: 0xa8d0ec, ground: 0x66605a, intensity: 0.7 },
    rim: { color: 0xcfe4ff, intensity: 0.55, pos: [-50, 40, -60] },
    exposure: 1.02,
    ground: { color: 0x2a2d33, road: true, accent: 0xff6a3c },
    buildings: { count: 12, tints: [0x9ab0c4, 0xa8b8c8, 0x8aa4c0, 0xb8bcc0, 0x94b4a8], styles: [2, 0], hRange: [4, 8], glow: false },
    // a real city park ringed by glass towers: pond, lawns, groves and a
    // bandshell inside; food trucks and transit stops along the streets;
    // an elevated light-rail loop threads the whole block
    props: [
      { name: 'bandshell', ring: [24, 32], count: 1 },
      { name: 'fountain', ring: [20, 27], count: 1 },
      { name: 'foodTruck', ring: [22, 36], count: 3, opts: [{ color: 0x5abc9a }, { color: 0xd88c4a }, { color: 0x7a9ad8 }] },
      { name: 'planterBench', ring: [21, 38], count: 4 },
      { name: 'busStop', ring: [26, 42], count: 3 },
      { name: 'tree', ring: [22, 46], count: 7, clump: { n: [2, 4], spread: 7 } },
      { name: 'artSculpture', ring: [26, 38], count: 2 },
      { name: 'streetlight', ring: [26, 48], count: 8 },
    ],
    ambient: null,
    bounds: 58,
    music: 'battleDay',
    layout: {
      clearing: 38, plaza: true,
      lanes: [{ kind: 'road', style: 'asphalt', count: 3, width: 7.5, dash: 0xffd23c }],
      patches: [
        { kind: 'water', count: 1, r: [9, 13] },     // the park pond
        { kind: 'grass', count: 3, r: [8, 12] },     // lawns
      ],
      viaduct: { h: 6.8, w: 7, color: 0x8a95a5, edge: 0xff6a3c },
      bridges: { count: 1, color: 0x9aa8b8, edge: 0x53e8ff },   // pedestrian skywalk
      hills: { count: 1, color: 0x5e7a44 },                     // park knoll
      clusters: { count: 6, size: [2, 4] },
    },
  },
  {
    id: 'harbor', name: 'Harbor Docks', desc: 'Cranes, containers, salt air — and nowhere for a 40-ton mech to hide.',
    sky: { top: 0x2a1e54, bottom: 0xe66c28, stars: false },
    fog: { color: 0x5c3a4a, near: 92, far: 285 },
    sun: { color: 0xffa050, intensity: 1.85, pos: [-70, 35, 50] },
    hemi: { sky: 0x86608c, ground: 0x30231a, intensity: 0.6 },
    rim: { color: 0x5f8fff, intensity: 0.85, pos: [60, 40, -50] },
    exposure: 1.04,
    ground: { color: 0x363b40, road: false, accent: 0xffb43c },
    buildings: { count: 12, tints: [0x687480, 0x7a6450, 0x566470, 0x806e58], styles: [3, 1], hRange: [4, 6], glow: true, facadeTex: 'bldg_dock_corrugated', tintLerp: 0.4 },
    // working port: two open harbor basins with trawlers riding at anchor,
    // container canyons stacked between the plate roads, gantry cranes
    // towering over the outer band (walk between their legs)
    props: [
      { name: 'gantryCrane', ring: [38, 52], count: 2 },
      { name: 'containerStack', ring: [26, 50], count: 6, clump: { n: [3, 5], spread: 9 } },   // container yards
      { name: 'trawler', on: 'water', count: 2 },
      { name: 'buoy', on: 'water', count: 5 },
      { name: 'boatHull', ring: [30, 44], count: 1 },
      { name: 'lighthouse', ring: [44, 54], count: 1 },
      { name: 'crane', ring: [40, 52], count: 2 },
      { name: 'netPile', ring: [22, 40], count: 4 },
      { name: 'streetlight', ring: [26, 44], count: 4 },
      { name: 'fuelTank', ring: [18, 34], count: 3 },
    ],
    ambient: null,
    steamVents: 2,
    bounds: 60,
    music: 'battleNight',
    layout: {
      clearing: 38, plaza: true,
      lanes: [
        { kind: 'road', style: 'plate', count: 2, width: 6.5 },
      ],
      // ONE BIG BASIN instead of two stamped ponds: ragged like a real
      // shoreline, and ringed out far enough that its lobes (1.36r) clear the
      // spawn plaza — a waterfront the mid-ring's container yards back onto
      patches: [{ kind: 'water', count: 1, r: [20, 24], organic: 0.8, ring: [72, 100] }],
      bridges: { count: 1, color: 0x565e66, edge: 0xffb43c },
      clusters: { count: 4, size: [2, 3] },
    },
  },
  {
    id: 'skyterrace', name: 'Sky Terrace', desc: 'A rooftop arena above the cloud deck. Mind the drop. Actually — use the drop.',
    sky: { top: 0x1e58b8, bottom: 0xe8f2fc, stars: false },
    fog: { color: 0xd4e4f4, near: 75, far: 250 },
    sun: { color: 0xfff8e4, intensity: 2.6, pos: [40, 110, 60] },
    hemi: { sky: 0xc4dcf4, ground: 0x707880, intensity: 0.75 },
    rim: { color: 0xffffff, intensity: 0.55, pos: [-60, 50, -40] },
    exposure: 1.04,
    ground: { color: 0x585f66, road: false, accent: 0x53e8ff },
    buildings: { count: 6, tints: [0x9aa8b8, 0xaebecc, 0x8ea0b8], styles: [2], hRange: [3, 5], glow: false },
    // a working high-rise roof: helipad plaza, HVAC farms, solar banks,
    // water tanks, and a window-washer rig swaying over the edge — terraced
    // deck platforms + glass skybridges give three fighting storeys
    props: [
      { name: 'helipad', ring: [24, 32], count: 1 },
      { name: 'gondolaRig', ring: [26, 40], count: 2 },
      { name: 'solarArray', ring: [28, 44], count: 3 },
      { name: 'waterTank', ring: [30, 44], count: 2 },
      { name: 'hvacUnit', ring: [26, 44], count: 4, clump: { n: [2, 3], spread: 6 } },
      { name: 'glassRail', ring: [32, 48], count: 5 },
      { name: 'antennaTower', ring: [42, 52], count: 3 },
      { name: 'billboard', ring: [44, 52], count: 2, opts: { color: 0x53e8ff } },
      { name: 'pipes', ring: [32, 44], count: 2 },
    ],
    ambient: 'clouds',
    bounds: 46,
    music: 'battleDay',
    layout: {
      clearing: 36, plaza: true,
      lanes: [{ kind: 'stripe', count: 2, width: 4, glow: 0x53e8ff }],
      // THE DROP: holes in the roof deck between the platforms. Fall in and
      // you are back on the far spawn pad, lighter (terrain.js `void`); the
      // skybridges span them, so the bridge is the dry route
      patches: [{ kind: 'void', count: 3, r: [7, 10], glow: 0x53e8ff }],
      bridges: { count: 2, color: 0x8ea0b0, edge: 0x53e8ff },   // glass skybridges
      hills: { count: 4, color: 0x6a7480, style: 'deck', edge: 0x53e8ff, hMax: 3.6 },
      clusters: { count: 3, size: [2, 3] },
    },
  },
  {
    id: 'scrapyard', name: 'Scrapyard 7', desc: 'Where old mechs go to rest. Tonight, the scrap pile grows either way.',
    sky: { top: 0x52381e, bottom: 0xc08048, stars: false },
    fog: { color: 0x74532f, near: 78, far: 255 },
    sun: { color: 0xffc584, intensity: 1.75, pos: [70, 60, -30] },
    hemi: { sky: 0x967a54, ground: 0x3e2e1e, intensity: 0.62 },
    rim: { color: 0xff8c3c, intensity: 0.75, pos: [-60, 30, 50] },
    exposure: 1.02,
    ground: { color: 0x554636, road: false, accent: 0xffb43c },
    buildings: { count: 12, tints: [0x7a563a, 0x6e5844, 0x82603e, 0x60564a], styles: [1, 3], hRange: [3, 6], glow: false, facadeTex: 'bldg_rust_patchwork', tintLerp: 0.4 },
    // the mech graveyard: a colossal buried hand marks the boneyard, the
    // crusher still runs, crushed-car towers make scrap canyons, and the
    // ground itself leaks oil and mud
    props: [
      { name: 'buriedMechHand', ring: [30, 42], count: 1, opts: { s: 1.35 } },
      { name: 'carCrusher', ring: [32, 44], count: 1 },
      { name: 'mechWreck', ring: [26, 40], count: 2 },
      { name: 'crushedStack', ring: [24, 46], count: 5, clump: { n: [2, 3], spread: 7 } },
      { name: 'junkPile', ring: [24, 46], count: 4 },
      { name: 'tireMound', ring: [26, 44], count: 2 },
      { name: 'magnetCrane', ring: [42, 52], count: 2 },
      { name: 'container', ring: [30, 48], count: 3 },
      { name: 'rock', ring: [32, 48], count: 3, opts: { color: 0x6e5a44 } },
      { name: 'pipes', ring: [34, 46], count: 2 },
    ],
    ambient: 'sand',
    bounds: 54,
    music: 'battleIndustrial',
    layout: {
      clearing: 38, plaza: true,
      lanes: [
        { kind: 'road', style: 'dirt', count: 2, width: 6 },
        { kind: 'oil', count: 1, width: 4.5 },
      ],
      patches: [
        { kind: 'mud', count: 1, r: [8, 12] },
        { kind: 'oil', count: 1, r: [6, 9] },
      ],
      bridges: { count: 1, color: 0x6e4a30, edge: 0xffb43c },
      hills: { count: 3, color: 0x5e4c38, hMax: 5 },
      clusters: { count: 3, size: [2, 3] },
    },
  },
  {
    id: 'quarry', name: 'Crystal Quarry', desc: 'A mining pit lined with resonant crystal. Every impact rings like a bell.',
    sky: { top: 0x120e2e, bottom: 0x5a4488, stars: true },
    fog: { color: 0x302254, near: 88, far: 265 },
    sun: { color: 0xbaa2ff, intensity: 1.35, pos: [-40, 80, 50] },
    hemi: { sky: 0x7462ac, ground: 0x281f40, intensity: 0.66 },
    rim: { color: 0xc46bff, intensity: 1.25, pos: [60, 30, -50] },
    exposure: 1.08,
    ground: { color: 0x3d3452, road: false, accent: 0xb46bff },
    buildings: { count: 7, tints: [0x665f7c, 0x565068, 0x7a6f8e], styles: [3, 1], hRange: [3, 6], glow: true, facadeTex: 'bldg_rockcut_crystal' },
    // the pit at night: crystal thickets in glowing nests, the hoist
    // headframe on the rim, blasting charges staged mid-bench, a tailings
    // pond glowing faint violet
    props: [
      { name: 'headframe', ring: [38, 48], count: 1 },
      { name: 'crystalMonolith', ring: [24, 34], count: 1 },
      { name: 'crystal', ring: [26, 52], count: 7, clump: { n: [2, 3], spread: 6 } },
      { name: 'drillRig', ring: [32, 46], count: 2 },
      { name: 'mineCart', ring: [26, 44], count: 3 },
      { name: 'chargeCrate', ring: [24, 40], count: 3 },
      { name: 'floodlightRig', ring: [26, 46], count: 3 },
      { name: 'conveyor', ring: [34, 48], count: 1 },
      { name: 'rock', ring: [32, 50], count: 4, opts: { color: 0x6a5f80 } },
    ],
    ambient: 'motes',
    bounds: 54,
    music: 'battleNight',
    // the pit is lined with the stuff: whole massifs and jagged spire
    // clusters of resonant crystal, lit from within and every one a
    // different hue (structures.js crystalSpire tints)
    structures: [
      { kind: 'crystalSpire', share: 0.36 },
      { kind: 'crystalMassif', share: 0.16 },
      { kind: 'rockOutcrop', share: 0.1 },
    ],
    layout: {
      clearing: 38, plaza: true,
      lanes: [
        { kind: 'road', style: 'dirt', count: 1, width: 5.5, color: 0x2e2740 },
        { kind: 'crystal', count: 2, width: 3.2, glow: 0xb46bff },
      ],
      patches: [{ kind: 'water', count: 1, r: [9, 13], glow: 0xb46bff, organic: 0.8 }],  // tailings pond
      bridges: { count: 1, color: 0x4c4460, edge: 0xb46bff },
      hills: { count: 4, color: 0x4a4060, hMax: 6 },            // mining terraces
      clusters: { count: 3, size: [2, 3] },
    },
  },
  {
    id: 'volcano', name: 'Volcanic Forge', desc: 'Built on a live caldera. The floor is not lava — but it is adjacent.',
    sky: { top: 0x1c0d09, bottom: 0x8c2610, stars: false },
    fog: { color: 0x3d1408, near: 72, far: 235 },
    sun: { color: 0xff8850, intensity: 1.55, pos: [50, 60, 30] },
    hemi: { sky: 0x94482c, ground: 0x421006, intensity: 0.75 },
    rim: { color: 0xff5a10, intensity: 1.3, pos: [-60, 25, -50] },
    exposure: 1.1,
    ground: { color: 0x2b1d18, road: false, accent: 0xff5a10 },
    buildings: { count: 7, tints: [0x5c443a, 0x5a463c, 0x66504a], styles: [1, 3], hRange: [3, 6], glow: true, facadeTex: 'bldg_basalt_plate' },
    // a live caldera floor: lava lakes and ash fields between basalt column
    // outcrops, fumaroles hissing, natural rock arches to duck through,
    // and a doomed monitoring post still logging tremors
    props: [
      { name: 'basaltColumns', ring: [26, 48], count: 5, clump: { n: [2, 3], spread: 7 } },
      { name: 'rockArch', ring: [30, 44], count: 2, opts: { color: 0x322028 } },
      { name: 'lavaPool', ring: [26, 38], count: 2 },
      { name: 'obsidianSpikes', ring: [28, 46], count: 4 },
      { name: 'geyserVent', ring: [22, 42], count: 4 },
      { name: 'monitorStation', ring: [30, 42], count: 2 },
      { name: 'rock', ring: [34, 52], count: 4, opts: { color: 0x453229 } },
    ],
    ambient: 'embers',
    steamVents: 5,
    bounds: 52,
    music: 'battleIndustrial',
    // THE BIG THINGS HERE ARE GEOLOGY, NOT ARCHITECTURE (src/arena/
    // structures.js): mounds of cooled basalt and jointed column cliffs take
    // most of the sites, and what buildings remain read as the outpost that
    // was foolish enough to be built here.
    structures: [
      { kind: 'volcanicMound', share: 0.34 },
      { kind: 'basaltCliff', share: 0.28 },
    ],
    layout: {
      clearing: 36, plaza: true,
      lanes: [
        { kind: 'road', style: 'stone', count: 1, width: 5, color: 0x241a14 },
        { kind: 'lava', count: 3, width: 6.5 },
      ],
      // MORE LAVA, AND NOT CIRCULAR: `organic` gives a patch a ragged
      // many-lobed outline (terrain.js) instead of the three-blob circle, so
      // a lava lake reads as a flow that pooled rather than a stamped disc
      patches: [
        { kind: 'lava', count: 4, r: [11, 17], organic: 1.0 },   // lava lakes
        { kind: 'ash', count: 2, r: [8, 12], organic: 0.7 },
      ],
      bridges: { count: 3, color: 0x241c18, edge: 0xff5a10 },   // basalt causeways
      hills: { count: 3, color: 0x352520, hMax: 6 },
      clusters: { count: 2, size: [2, 3] },
    },
  },
  {
    id: 'frozen', name: 'Frozen Outpost', desc: 'Research station K-9. Ambient temperature: hostile. Combat temperature: worse.',
    sky: { top: 0x0c1c34, bottom: 0x6690b4, stars: true },
    fog: { color: 0x5a7c94, near: 70, far: 240 },
    sun: { color: 0xbcdcff, intensity: 1.4, pos: [50, 45, 60] },
    hemi: { sky: 0x88aed0, ground: 0x3c4c5e, intensity: 0.68 },
    rim: { color: 0x9be8ff, intensity: 1.1, pos: [-60, 35, -40] },
    exposure: 1.04,
    ground: { color: 0x93aec4, road: false, accent: 0x53c8ff },
    buildings: { count: 8, tints: [0x98a4b0, 0x8894a0, 0xa4b0bc], styles: [3, 2], hRange: [3, 6], glow: true, facadeTex: 'bldg_arctic_panel' },
    // station K-9 after the evacuation: an icebreaker locked in the floe,
    // quonset row half-buried, the heated pipeline still steaming, frozen
    // lakes glinting under the aurora
    props: [
      { name: 'icebreakerShip', ring: [34, 46], count: 1 },
      { name: 'quonsetHut', ring: [24, 40], count: 4, clump: { n: [2, 3], spread: 8 } },
      { name: 'radarDome', ring: [30, 42], count: 2 },
      { name: 'pipelineRun', ring: [28, 44], count: 2 },
      { name: 'snowcat', ring: [24, 40], count: 2 },
      { name: 'rockArch', ring: [30, 46], count: 1, opts: { mat: 'ice' } },
      { name: 'crystal', ring: [30, 50], count: 6, opts: { mat: 'ice', maxH: 5 } },
      { name: 'rock', ring: [34, 50], count: 3, opts: { color: 0xd4e2ec } },
      { name: 'antennaTower', ring: [44, 54], count: 2 },
      { name: 'fuelTank', ring: [18, 32], count: 3 },
      { name: 'campfire', ring: [14, 30], count: 3 },
      { name: 'aurora', ring: [0, 6], count: 1 },
    ],
    ambient: 'snow',
    bounds: 56,
    music: 'battleDay',
    // ice mountains and the station's own CUT-ICE works — semi-transparent
    // blocks, walls and towers that break exactly like everything else
    structures: [
      { kind: 'iceberg', share: 0.24 },
      { kind: 'snowDrift', share: 0.12 },
      { kind: 'iceWorks', share: 0.14 },
      { kind: 'iceTower', share: 0.1 },
    ],
    layout: {
      clearing: 38, plaza: true,
      lanes: [
        { kind: 'road', style: 'dirt', count: 1, width: 6, color: 0x5a6c7c },  // plowed track
        { kind: 'ice', count: 1, width: 8, glow: 0x9be8ff },                   // frozen river
      ],
      // frozen lakes — ICE IS A RULE (low grip), so like every hazard they
      // keep out of the spawn plaza now
      patches: [{ kind: 'ice', count: 2, r: [11, 16], glow: 0x9be8ff, organic: 0.9 }],
      bridges: { count: 1, color: 0x788a9a, edge: 0x53c8ff },
      hills: { count: 6, color: 0xc2d4e0, hMax: 6 },            // snow drifts
      clusters: { count: 3, size: [2, 3] },
    },
  },
  {
    id: 'ruins', name: 'Desert Ruins', desc: 'An excavation site older than the war. The columns held for 3,000 years. Held.',
    sky: { top: 0x5b80c4, bottom: 0xf4cd92, stars: false },
    fog: { color: 0xdcbc8c, near: 95, far: 290 },
    sun: { color: 0xfff0cc, intensity: 2.35, pos: [-60, 80, 30] },
    hemi: { sky: 0xdcc9a4, ground: 0x74593a, intensity: 0.78 },
    rim: { color: 0xffd8a0, intensity: 0.85, pos: [60, 40, -50] },
    exposure: 1.02,
    ground: { color: 0xb08f62, road: false, accent: 0x2ee6c8 },
    buildings: { count: 7, tints: [0xbf9d6c, 0xb08c5c, 0xc8a878, 0xa89268], styles: [1], hRange: [3, 6], glow: false, facadeTex: 'bldg_sandstone_ruin', roofTex: 'bldg_roof_sandstone' },
    // the dig site whole: a monumental pylon gate over the processional way,
    // sphinx guardians and colonnades half-swallowed by dunes, palms around
    // a real oasis, the archaeologists' camp abandoned mid-season
    props: [
      { name: 'greatGate', ring: [30, 40], count: 1 },
      { name: 'sphinxStatue', ring: [26, 38], count: 2 },
      { name: 'colonnade', ring: [24, 42], count: 3 },
      { name: 'palmTree', ring: [22, 40], count: 5, clump: { n: [2, 4], spread: 6 } },
      { name: 'brokenStatue', ring: [28, 40], count: 1 },
      { name: 'obelisk', ring: [28, 46], count: 3 },
      { name: 'sarcophagus', ring: [26, 42], count: 2 },
      { name: 'ruinColumn', ring: [24, 48], count: 5 },
      { name: 'digCamp', ring: [26, 40], count: 2 },
      { name: 'campfire', ring: [14, 30], count: 2 },
      { name: 'rock', ring: [32, 52], count: 4, opts: { color: 0xb59a70 } },
    ],
    ambient: 'sand',
    bounds: 56,
    music: 'battleDay',
    // every standing mass here is a temple, a mastaba or a pyramid — see
    // THEME_MASSING in massing.js; the dig site owns no rectangles
    layout: {
      clearing: 38, plaza: true,
      lanes: [
        { kind: 'road', style: 'stone', count: 1, width: 6, color: 0xc0a070 },  // processional way
        { kind: 'sand', count: 1, width: 8 },                                   // dry riverbed
      ],
      patches: [
        { kind: 'water', count: 1, r: [10, 14] },   // the oasis
        { kind: 'sand', count: 2, r: [8, 12] },     // excavation pits
      ],
      bridges: { count: 1, color: 0xa88c5c, edge: 0x2ee6c8 },
      hills: { count: 3, color: 0xb59a70, hMax: 4 },            // dunes
      clusters: { count: 3, size: [2, 3] },
    },
  },
  {
    id: 'jungle', name: 'Jungle Temple', desc: 'The canopy hides an arena the old kings built. The vines will grow back. Probably.',
    sky: { top: 0x1a4a3a, bottom: 0x93d098, stars: false },
    fog: { color: 0x416f52, near: 76, far: 235 },
    sun: { color: 0xeaffd2, intensity: 2.0, pos: [40, 90, -40] },
    hemi: { sky: 0x8cc8a0, ground: 0x2a3c20, intensity: 0.72 },
    rim: { color: 0x62ff9a, intensity: 0.7, pos: [-60, 30, 50] },
    exposure: 1.0,
    ground: { color: 0x53643a, road: false, accent: 0x62ff9a },
    buildings: { count: 6, tints: [0x93987c, 0x83886c, 0x8c9670], styles: [1], hRange: [3, 5], glow: false, facadeTex: 'bldg_temple_mossy', roofTex: 'bldg_roof_mossy' },
    // deep canopy: serpent gates guard the flagstone way, liana curtains and
    // fern thickets close the sight lines, swamp pools bog the unwary, and
    // real FOREST walls grow in clumped groves
    props: [
      { name: 'templeGate', ring: [26, 40], count: 2 },
      { name: 'stoneIdol', ring: [26, 40], count: 2 },
      { name: 'hangingVines', ring: [26, 44], count: 3 },
      { name: 'canopyTree', ring: [26, 52], count: 6, clump: { n: [2, 3], spread: 8 } },
      { name: 'tree', ring: [26, 48], count: 5, clump: { n: [2, 4], spread: 7 } },
      { name: 'giantFern', ring: [22, 44], count: 5 },
      { name: 'vineColumn', ring: [24, 44], count: 4 },
      { name: 'campfire', ring: [14, 28], count: 2 },
      { name: 'rock', ring: [32, 50], count: 3, opts: { color: 0x7d8668 } },
    ],
    ambient: 'leaves',
    bounds: 54,
    music: 'battleDay',
    layout: {
      clearing: 36, plaza: true,
      lanes: [
        { kind: 'road', style: 'stone', count: 1, width: 4.5, color: 0x6e7458 },  // overgrown flagstones
        { kind: 'water', count: 1, width: 7 },                                    // jungle river
      ],
      patches: [
        { kind: 'mud', count: 2, r: [9, 13], color: 0x2e3a1a },  // swamp pools
        { kind: 'water', count: 1, r: [8, 11] },
      ],
      bridges: { count: 1, color: 0x686e50, edge: 0x62ff9a },   // mossy causeway
      hills: { count: 3, color: 0x4c6038, hMax: 6 },
      clusters: { count: 2, size: [2, 3] },
    },
  },
  {
    id: 'orbital', name: 'Orbital Platform', desc: 'Station VALKYRIE\'s landing deck. Artificial gravity, genuine consequences.',
    sky: { top: 0x000308, bottom: 0x0c1830, stars: true },
    fog: { color: 0x070c18, near: 105, far: 330 },
    sun: { color: 0xeaf2ff, intensity: 2.3, pos: [80, 40, 60] },
    hemi: { sky: 0x2e3a58, ground: 0x0e1220, intensity: 0.56 },
    rim: { color: 0x53e8ff, intensity: 1.3, pos: [-70, 30, -50] },
    exposure: 1.08,
    ground: { color: 0x30343c, road: false, accent: 0x53e8ff },
    buildings: { count: 8, tints: [0x66738a, 0x76839a, 0x5a6880, 0x8892a4], styles: [2, 3], hRange: [3, 7], glow: true, facadeTex: 'bldg_station_hull' },
    // VALKYRIE's live flight deck: a shuttle on its pad, sun-tracking solar
    // wings, manipulator arms mid-task, cryo tanks venting — all threaded
    // by an elevated mag-track loop with glowing rails
    props: [
      { name: 'shuttle', ring: [28, 38], count: 1 },
      { name: 'landingPad', ring: [24, 36], count: 2 },
      { name: 'solarWing', ring: [28, 44], count: 3 },
      { name: 'roboticArm', ring: [24, 40], count: 2 },
      { name: 'cryoTank', ring: [22, 36], count: 3 },
      { name: 'cargoPods', ring: [28, 46], count: 3, clump: { n: [2, 3], spread: 6 } },
      { name: 'conduit', ring: [24, 42], count: 4 },
      { name: 'dishArray', ring: [40, 52], count: 2 },
      { name: 'antennaTower', ring: [44, 54], count: 2 },
      { name: 'billboard', ring: [46, 54], count: 2, opts: { color: 0x62ff9a } },
    ],
    ambient: 'motes',
    bounds: 52,
    music: 'battleNight',
    layout: {
      clearing: 38, plaza: true,
      lanes: [{ kind: 'stripe', count: 2, width: 5, glow: 0x53e8ff }],  // deck traffic lanes
      // GRAV PADS: the artificial gravity is off over these plates (terrain.js
      // `lowgrav`) — floaty jumps, long hang, for anyone on or over one
      patches: [{ kind: 'lowgrav', count: 3, r: [8, 11], glow: 0x62ff9a }],
      viaduct: { h: 7, w: 7, color: 0x3c4450, edge: 0x62ff9a },         // mag-track loop
      bridges: { count: 1, color: 0x3c4450, edge: 0x62ff9a },           // elevated walkway
      hills: { count: 2, color: 0x444c58, style: 'deck', edge: 0x53e8ff, hMax: 3.2 },
      clusters: { count: 3, size: [2, 4] },
    },
  },
];

// Arena names + descriptions come from the central text catalogue
// (src/core/text.js) — see the note in roster.js.
THEMES.forEach(applyArenaText);

export const THEMES_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/**
 * Every prop name this theme can place — its scatter list, plus the exact
 * placements of an authored level, plus the viaduct piers the terrain adds on
 * its own. This is what the prop-GLB preload asks for, so an arena downloads
 * the one to three models it actually shows instead of the whole set.
 */
export function themePropNames(theme) {
  const names = new Set(['viaductPylon']);
  for (const p of theme?.props || []) if (p?.name) names.add(p.name);
  for (const o of theme?.authored || []) if (o?.k === 'prop' && o.name) names.add(o.name);
  return [...names];
}
