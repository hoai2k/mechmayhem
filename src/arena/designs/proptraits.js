// PROP PLACEMENT TRAITS — how a prop wants to STAND, not where.
//
// The design systems classify a theme's prop specs by SHAPE (count / clump —
// designs/util.js classifyProps), which says how MANY and roughly how they
// group. Shape alone cannot know that a sphinx is a guardian and a substation
// is a yard fixture — that a random yaw reads as a mistake on one and as
// honest clutter on the other. This table is that knowledge: per prop NAME,
// the orientation and grouping PREFERENCES a human placer would apply.
// Reported from the field: Desert Ruins' sphinxes standing at odd angles —
// a sphinx is the one prop on the board everyone knows the right answer for.
//
// A prop absent from the table has no preferences (random yaw, shape-class
// grouping), so a brand-new theme still lands in sensible formations and
// nothing here is required — the table only ever REFINES.
//
// THE FACING CONVENTION IS +Z, measured off the builders in arena/props.js:
// the sphinx's head, the idol's eyes, the billboard's lit face, the bus
// stop's opening, the bandshell's mouth and the streetlight's arm all sit at
// +z, and every gate (torii / pylon / serpent / rock arch) passes through
// ALONG z. placeProp applies `opts.ry` about Y, so ry = atan2(dx, dz) aims
// +Z along (dx, dz). Imported prop GLBs are already aligned to the
// procedural frame (tools/propyaw.mjs), so the convention holds on both
// visual routes. `long: 'x'` marks the exceptions whose run lies along X
// (pipes), so lane-alignment can turn them a quarter further.
//
// Traits:
//   face: 'center' — sacred/monumental front: +Z aims at the region's focal
//         point (the battle circle, or the pocket plaza the prop stands in)
//   face: 'gate'   — a doorway: sits ON an approach to the focal point (a
//         road, or a radial) with +Z running along the path — framing the
//         way outward, walk-through by construction (multi-body colliders)
//   face: 'road'   — street furniture: +Z square-on to the nearest lane
//         (billboards read from it, streetlight arms reach over it); far
//         from any lane it faces the focal point instead
//   grid: true     — industrial: yaw snaps to the world grid
//   row: true      — reads best in a rank/row even at counts the shape
//         classifier would call "dressing" (pillars, colonnades, arrays)
//   lane: true     — a long run that lies ALONG the nearest lane when one is
//         close (rails, pipelines, parked vehicles)
//   solo: true     — stands alone: never grouped, pushed apart from
//         everything (campfires, bus stops, vents)
//   centerpiece: true — wants the middle of a designed square (fountains,
//         pads); falls back to hero treatment when no plaza exists
//   scatter: true  — never regimented: excluded from planning entirely so
//         the theme's organic ring scatter places it (ferns, loose crystal)
//   long: 'x'      — the prop's long/through axis when it is not Z

export const PROP_TRAITS = {
  // sacred and monumental — face the focal point
  sphinxStatue: { face: 'center' },
  stoneIdol: { face: 'center' },
  brokenStatue: { face: 'center' },
  crystalMonolith: { face: 'center' },
  buriedMechHand: { face: 'center' },
  bandshell: { face: 'center' },
  floodlightRig: { face: 'center' },     // the lights aim at the fight
  blastFurnace: { face: 'center' },
  obelisk: { face: 'center' },
  dishArray: { face: 'center' },

  // gates and arches — frame a path to/from the focal point
  toriiGate: { face: 'gate' },
  greatGate: { face: 'gate' },
  templeGate: { face: 'gate' },
  rockArch: { face: 'gate' },

  // street furniture — square-on to the road
  billboard: { face: 'road' },
  streetlight: { face: 'road' },
  busStop: { face: 'road', solo: true },
  foodTruck: { face: 'road' },

  // long runs that lie along a path
  mineCart: { lane: true },
  pipelineRun: { lane: true },
  conduit: { lane: true },
  snowcat: { lane: true },
  moltenChannel: { lane: true },
  railSegment: { lane: true },
  pipes: { lane: true, grid: true, long: 'x' },
  conveyor: { grid: true },

  // industrial yard fixtures — the world grid
  substation: { grid: true },
  containerStack: { grid: true },
  container: { grid: true },
  crushedStack: { grid: true },
  cargoPods: { grid: true },
  cryoTank: { grid: true },
  coolantVat: { grid: true },
  waterTank: { grid: true },
  hvacUnit: { grid: true },
  quonsetHut: { grid: true },
  radarDome: { grid: true },
  landingPad: { grid: true },
  chargeCrate: { grid: true },
  fuelTank: { grid: true },
  magnetCrane: { grid: true },
  gantryCrane: { grid: true },
  carCrusher: { grid: true },
  drillRig: { grid: true },
  monitorStation: { grid: true },
  roboticArm: { grid: true },
  headframe: { grid: true },
  sarcophagus: { grid: true },
  antennaTower: { grid: true },
  smokestack: { grid: true, row: true },

  // ranks and rows even at small counts
  holoPillar: { row: true },
  colonnade: { row: true, lane: true },
  ruinColumn: { row: true },
  glassRail: { row: true, lane: true },
  solarArray: { grid: true, row: true },
  solarWing: { grid: true, row: true },

  // isolated by nature
  campfire: { solo: true },
  geyserVent: { solo: true },
  fumarole: { solo: true },

  // centrepieces — want the middle of a designed square
  fountain: { centerpiece: true },
  helipad: { centerpiece: true },
  holoGlobe: { centerpiece: true },

  // never regimented — the organic scatter reads truer than any formation
  giantFern: { scatter: true },
  crystal: { scatter: true },
};

const NONE = {};
export const traitsFor = (name) => PROP_TRAITS[name] || NONE;
