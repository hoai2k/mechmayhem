// WHAT THIS GAME LETS YOU PLACE IN AN ARENA — the arena editor's palette.
//
// Adapter data, not tool data: every entry names a mechmayhem prop, lane kind
// or terrain type, so it belongs beside the rest of the answers to "what does
// this game mean by …" rather than inside `workbench/tools/level.js`, which
// knows nothing about any particular game's scenery. The tool reads it as
// `config.arena.palette()`.
//
// Prop entries map straight onto PROPS[name] in src/arena/props.js; terrain
// entries (building / hill / bridge / lane / patch / viaduct) are handled
// specially by the editor. `color: true` surfaces a colour swatch in the
// inspector; the default opts seed the first placement.
//
// This list intentionally covers ALL arena props, so anything that can appear
// in a shipped arena can also be placed by hand.

import { STRUCTURE_KINDS } from '../../../src/arena/structures.js';

// shared accent swatches for colourable props/terrain
export const ARENA_SWATCHES = [
  0x53e8ff, 0xff4dd8, 0x62ff9a, 0xffb43c, 0xff5040,
  0xb46bff, 0xffd23c, 0x2ee6c8, 0x9bff3c, 0xffffff,
];

// THE LANDFORMS ARE DERIVED, NOT LISTED. STRUCTURE_KINDS is the declaration
// (src/arena/structures.js); adding a kind there puts it in the palette with
// no edit here, which is the same rule the rest of this adapter follows. A
// placed one carries no `cells` — it grows its kind's own silhouette from a
// seed pinned to where it stands, and the editor's stand-in and the match
// build the same rock from it.
const structureItems = Object.entries(STRUCTURE_KINDS).map(([id, def]) => ({
  id: `struct_${id}`,
  label: id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
  k: 'building',
  struct: id,
  hint: `Destructible ${def.mat} landform — ${def.style} silhouette`,
}));

export const ARENA_PALETTE = [
  {
    group: 'Structures', items: [
      { id: 'building', label: 'Tower', k: 'building', hint: 'Destructible chunk tower — footprint & height in the inspector' },
      ...structureItems,
    ],
  },
  {
    group: 'Terrain', items: [
      { id: 'hill', label: 'Hill', k: 'hill', deck: false, hint: 'Walkable mound' },
      { id: 'deck', label: 'Platform', k: 'hill', deck: true, color: true, hint: 'Flat-top deck with a glowing edge' },
      { id: 'bridge', label: 'Bridge', k: 'bridge', color: true, hint: 'Destructible causeway with ramps' },
      { id: 'viaduct', label: 'Elevated loop', k: 'viaduct', hint: 'One per arena — an endless raised highway on piers' },
    ],
  },
  {
    group: 'Lanes / streams', items: [
      { id: 'lane_road', label: 'Road', k: 'lane', kind: 'road', style: 'asphalt', dash: 0xffd23c },
      { id: 'lane_water', label: 'Water', k: 'lane', kind: 'water', hint: 'Bogs mechs down' },
      { id: 'lane_lava', label: 'Lava', k: 'lane', kind: 'lava', hint: 'Burns' },
      { id: 'lane_acid', label: 'Acid ✦new', k: 'lane', kind: 'acid', hint: 'Corrosive — burns like lava' },
      { id: 'lane_mud', label: 'Mud ✦new', k: 'lane', kind: 'mud', hint: 'Heavy drag' },
      { id: 'lane_oil', label: 'Oil', k: 'lane', kind: 'oil' },
      { id: 'lane_ice', label: 'Ice', k: 'lane', kind: 'ice', glow: 0x9be8ff },
      { id: 'lane_crystal', label: 'Crystal', k: 'lane', kind: 'crystal', glow: 0xb46bff },
      { id: 'lane_sand', label: 'Sand', k: 'lane', kind: 'sand' },
      { id: 'lane_canal', label: 'Canal', k: 'lane', kind: 'canal', glow: 0x53e8ff },
      { id: 'lane_stripe', label: 'Stripe', k: 'lane', kind: 'stripe', glow: 0x53e8ff },
    ],
  },
  {
    group: 'Ground patches', items: [
      { id: 'patch_lake', label: 'Lake', k: 'patch', kind: 'lake', hint: 'Standing water — bogs mechs down' },
      { id: 'patch_water', label: 'Water pool', k: 'patch', kind: 'water' },
      { id: 'patch_lava', label: 'Lava pool', k: 'patch', kind: 'lava', hint: 'Burns' },
      { id: 'patch_acid', label: 'Acid pool', k: 'patch', kind: 'acid', hint: 'Corrosive' },
      { id: 'patch_oil', label: 'Oil slick', k: 'patch', kind: 'oil' },
      { id: 'patch_mud', label: 'Mud', k: 'patch', kind: 'mud' },
      { id: 'patch_ice', label: 'Ice sheet', k: 'patch', kind: 'ice' },
      { id: 'patch_sand', label: 'Sand', k: 'patch', kind: 'sand' },
      { id: 'patch_grass', label: 'Lawn', k: 'patch', kind: 'grass' },
      { id: 'patch_ash', label: 'Ash', k: 'patch', kind: 'ash' },
      { id: 'patch_pave', label: 'Plaza paving ✦new', k: 'patch', kind: 'pave', hint: 'Paved pocket plaza — pure paint, no hazard' },
      { id: 'patch_void', label: 'Void ✦new', k: 'patch', kind: 'void', glow: 0x53e8ff, hint: 'The drop — a grounded mech over it falls and respawns at a cost' },
      { id: 'patch_lowgrav', label: 'Grav pad ✦new', k: 'patch', kind: 'lowgrav', glow: 0x62ff9a, hint: 'Low gravity: floaty jumps for anyone on or over it' },
    ],
  },
  {
    group: 'Obstacles ✦new', items: [
      { id: 'barricade', label: 'Barricade', k: 'prop', name: 'barricade', hint: 'Low destructible cover' },
      { id: 'pillar', label: 'Pillar', k: 'prop', name: 'pillar' },
      { id: 'sentryTurret', label: 'Sentry turret', k: 'prop', name: 'sentryTurret' },
      { id: 'forceWall', label: 'Force wall', k: 'prop', name: 'forceWall', color: true },
      { id: 'mine', label: 'Proximity mine', k: 'prop', name: 'mine', hint: 'Cooks off on contact' },
      { id: 'spikeStrip', label: 'Spike strip', k: 'prop', name: 'spikeStrip', hint: 'Cuts + shoves' },
      { id: 'jumpPad', label: 'Jump pad', k: 'prop', name: 'jumpPad', color: true },
      { id: 'teleporter', label: 'Teleporter', k: 'prop', name: 'teleporter', color: true },
      { id: 'beacon', label: 'Hazard beacon', k: 'prop', name: 'beacon', color: true },
      { id: 'crater', label: 'Blast crater', k: 'prop', name: 'crater' },
    ],
  },
  {
    group: 'Hazards', items: [
      { id: 'fuelTank', label: 'Fuel tank', k: 'prop', name: 'fuelTank', hint: 'Explosive' },
      { id: 'obsidianSpikes', label: 'Obsidian spikes', k: 'prop', name: 'obsidianSpikes' },
      { id: 'campfire', label: 'Campfire', k: 'prop', name: 'campfire' },
      { id: 'lavaPool', label: 'Lava pool', k: 'prop', name: 'lavaPool' },
      { id: 'moltenChannel', label: 'Molten channel', k: 'prop', name: 'moltenChannel' },
    ],
  },
  {
    group: 'Industrial', items: [
      { id: 'smokestack', label: 'Smokestack', k: 'prop', name: 'smokestack' },
      { id: 'gear', label: 'Gear', k: 'prop', name: 'gear' },
      { id: 'crane', label: 'Crane', k: 'prop', name: 'crane' },
      { id: 'magnetCrane', label: 'Magnet crane', k: 'prop', name: 'magnetCrane' },
      { id: 'container', label: 'Container', k: 'prop', name: 'container' },
      { id: 'pipes', label: 'Pipes', k: 'prop', name: 'pipes' },
      { id: 'pistonRig', label: 'Piston rig', k: 'prop', name: 'pistonRig' },
      { id: 'chainHoist', label: 'Chain hoist', k: 'prop', name: 'chainHoist' },
      { id: 'drillRig', label: 'Drill rig', k: 'prop', name: 'drillRig' },
      { id: 'mineCart', label: 'Mine cart', k: 'prop', name: 'mineCart' },
      { id: 'conduit', label: 'Conduit', k: 'prop', name: 'conduit' },
      { id: 'fuelTank2', label: 'Tank', k: 'prop', name: 'fuelTank' },
    ],
  },
  {
    group: 'City', items: [
      { id: 'billboard', label: 'Billboard', k: 'prop', name: 'billboard', color: true },
      { id: 'holoPillar', label: 'Holo pillar', k: 'prop', name: 'holoPillar', color: true },
      { id: 'noodleKiosk', label: 'Noodle kiosk', k: 'prop', name: 'noodleKiosk', color: true },
      { id: 'railSegment', label: 'Rail segment', k: 'prop', name: 'railSegment', color: true },
      { id: 'streetlight', label: 'Streetlight', k: 'prop', name: 'streetlight' },
      { id: 'antennaTower', label: 'Antenna tower', k: 'prop', name: 'antennaTower' },
      { id: 'fountain', label: 'Fountain', k: 'prop', name: 'fountain' },
      { id: 'artSculpture', label: 'Art sculpture', k: 'prop', name: 'artSculpture' },
      { id: 'hvacUnit', label: 'HVAC unit', k: 'prop', name: 'hvacUnit' },
      { id: 'glassRail', label: 'Glass rail', k: 'prop', name: 'glassRail' },
      { id: 'helipad', label: 'Helipad', k: 'prop', name: 'helipad' },
      { id: 'landingPad', label: 'Landing pad', k: 'prop', name: 'landingPad' },
      { id: 'dishArray', label: 'Dish array', k: 'prop', name: 'dishArray' },
      { id: 'cargoPods', label: 'Cargo pods', k: 'prop', name: 'cargoPods' },
      { id: 'radarDome', label: 'Radar dome', k: 'prop', name: 'radarDome' },
      { id: 'barrierPylon', label: 'Barrier pylon', k: 'prop', name: 'barrierPylon', color: true },
    ],
  },
  {
    group: 'Nature & ruins', items: [
      { id: 'tree', label: 'Tree', k: 'prop', name: 'tree' },
      { id: 'canopyTree', label: 'Canopy tree', k: 'prop', name: 'canopyTree' },
      { id: 'rock', label: 'Rock', k: 'prop', name: 'rock', color: true },
      { id: 'crystal', label: 'Crystal', k: 'prop', name: 'crystal', color: true },
      { id: 'ruinColumn', label: 'Ruin column', k: 'prop', name: 'ruinColumn' },
      { id: 'brokenStatue', label: 'Broken statue', k: 'prop', name: 'brokenStatue' },
      { id: 'obelisk', label: 'Obelisk', k: 'prop', name: 'obelisk' },
      { id: 'sarcophagus', label: 'Sarcophagus', k: 'prop', name: 'sarcophagus' },
      { id: 'stoneIdol', label: 'Stone idol', k: 'prop', name: 'stoneIdol' },
      { id: 'vineColumn', label: 'Vine column', k: 'prop', name: 'vineColumn' },
    ],
  },
  {
    group: 'Scrap & harbor', items: [
      { id: 'mechWreck', label: 'Mech wreck', k: 'prop', name: 'mechWreck' },
      { id: 'junkPile', label: 'Junk pile', k: 'prop', name: 'junkPile' },
      { id: 'lighthouse', label: 'Lighthouse', k: 'prop', name: 'lighthouse' },
      { id: 'boatHull', label: 'Boat hull', k: 'prop', name: 'boatHull' },
      { id: 'buoy', label: 'Buoy', k: 'prop', name: 'buoy', hint: 'Bobs gently' },
      { id: 'aurora', label: 'Aurora (ambient)', k: 'prop', name: 'aurora', hint: 'Sky curtain — position is ignored in game' },
    ],
  },
  {
    group: 'Landmarks ✦new', items: [
      { id: 'toriiGate', label: 'Torii gate', k: 'prop', name: 'toriiGate', color: true, hint: 'Walk between the posts' },
      { id: 'holoGlobe', label: 'Holo globe', k: 'prop', name: 'holoGlobe', color: true, hint: 'Spins' },
      { id: 'blastFurnace', label: 'Blast furnace', k: 'prop', name: 'blastFurnace' },
      { id: 'bandshell', label: 'Bandshell', k: 'prop', name: 'bandshell' },
      { id: 'gantryCrane', label: 'Gantry crane', k: 'prop', name: 'gantryCrane', hint: 'Walk between the legs' },
      { id: 'buriedMechHand', label: 'Buried mech hand', k: 'prop', name: 'buriedMechHand' },
      { id: 'headframe', label: 'Mine headframe', k: 'prop', name: 'headframe', hint: 'Walk between the legs' },
      { id: 'crystalMonolith', label: 'Crystal monolith', k: 'prop', name: 'crystalMonolith' },
      { id: 'icebreakerShip', label: 'Icebreaker', k: 'prop', name: 'icebreakerShip' },
      { id: 'greatGate', label: 'Great gate', k: 'prop', name: 'greatGate', hint: 'Walk through' },
      { id: 'templeGate', label: 'Temple gate', k: 'prop', name: 'templeGate', hint: 'Walk through' },
      { id: 'sphinxStatue', label: 'Sphinx', k: 'prop', name: 'sphinxStatue' },
      { id: 'shuttle', label: 'Shuttle', k: 'prop', name: 'shuttle' },
      { id: 'rockArch', label: 'Rock arch', k: 'prop', name: 'rockArch', color: true, hint: 'Cave mouth — walk through' },
    ],
  },
  {
    group: 'Set dressing ✦new', items: [
      { id: 'substation', label: 'Substation', k: 'prop', name: 'substation', hint: 'Explosive' },
      { id: 'vendCluster', label: 'Vending machines', k: 'prop', name: 'vendCluster' },
      { id: 'conveyor', label: 'Conveyor', k: 'prop', name: 'conveyor', hint: 'Head drum spins' },
      { id: 'coolantVat', label: 'Coolant vat', k: 'prop', name: 'coolantVat', hint: 'Explosive' },
      { id: 'foodTruck', label: 'Food truck', k: 'prop', name: 'foodTruck', color: true },
      { id: 'planterBench', label: 'Planter + benches', k: 'prop', name: 'planterBench' },
      { id: 'busStop', label: 'Bus stop', k: 'prop', name: 'busStop', color: true },
      { id: 'containerStack', label: 'Container stack', k: 'prop', name: 'containerStack' },
      { id: 'trawler', label: 'Trawler', k: 'prop', name: 'trawler', hint: 'Bobs — place on water' },
      { id: 'netPile', label: 'Net pile', k: 'prop', name: 'netPile' },
      { id: 'solarArray', label: 'Solar array', k: 'prop', name: 'solarArray' },
      { id: 'gondolaRig', label: 'Gondola rig', k: 'prop', name: 'gondolaRig', hint: 'Sways' },
      { id: 'waterTank', label: 'Water tank', k: 'prop', name: 'waterTank' },
      { id: 'carCrusher', label: 'Car crusher', k: 'prop', name: 'carCrusher' },
      { id: 'crushedStack', label: 'Crushed cars', k: 'prop', name: 'crushedStack' },
      { id: 'tireMound', label: 'Tire mound', k: 'prop', name: 'tireMound' },
      { id: 'chargeCrate', label: 'Blasting charges', k: 'prop', name: 'chargeCrate', hint: 'Explosive' },
      { id: 'floodlightRig', label: 'Floodlights', k: 'prop', name: 'floodlightRig' },
      { id: 'basaltColumns', label: 'Basalt columns', k: 'prop', name: 'basaltColumns' },
      { id: 'geyserVent', label: 'Fumarole', k: 'prop', name: 'geyserVent', hint: 'Steams' },
      { id: 'monitorStation', label: 'Monitor station', k: 'prop', name: 'monitorStation', hint: 'Explosive' },
      { id: 'quonsetHut', label: 'Quonset hut', k: 'prop', name: 'quonsetHut' },
      { id: 'pipelineRun', label: 'Pipeline', k: 'prop', name: 'pipelineRun' },
      { id: 'snowcat', label: 'Snowcat', k: 'prop', name: 'snowcat' },
      { id: 'palmTree', label: 'Palm tree', k: 'prop', name: 'palmTree' },
      { id: 'colonnade', label: 'Colonnade', k: 'prop', name: 'colonnade', hint: 'Walk between columns' },
      { id: 'digCamp', label: 'Dig camp', k: 'prop', name: 'digCamp' },
      { id: 'hangingVines', label: 'Hanging vines', k: 'prop', name: 'hangingVines' },
      { id: 'giantFern', label: 'Giant fern', k: 'prop', name: 'giantFern', hint: 'Soft cover' },
      { id: 'solarWing', label: 'Solar wing', k: 'prop', name: 'solarWing', hint: 'Tracks the sun' },
      { id: 'cryoTank', label: 'Cryo tank', k: 'prop', name: 'cryoTank', hint: 'Explosive' },
      { id: 'roboticArm', label: 'Robotic arm', k: 'prop', name: 'roboticArm', hint: 'Tracks slowly' },
      { id: 'viaductPylon', label: 'Viaduct pier', k: 'prop', name: 'viaductPylon' },
    ],
  },
];

// flat lookup by palette id
export const ARENA_PALETTE_BY_ID = {};
for (const g of ARENA_PALETTE) for (const it of g.items) ARENA_PALETTE_BY_ID[it.id] = it;
