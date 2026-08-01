// BAKING A SHIPPED ARENA INTO AN EDITABLE LEVEL.
//
// The 12 arenas in themes.js are recipes, not places: a theme plus a seed goes
// through Terrain + massing + the prop scatter and comes out as one particular
// city. The level editor edits PLACES, so to edit an arena you first have to
// pin one down.
//
// `levelFromArena` does exactly that, and it does it by READING A BUILT ARENA
// rather than re-running the generator: Arena writes every building and prop it
// places into `arena.recipe` as it places them, and Terrain already keeps its
// lanes / hills / bridges / patches / viaduct as plain data. So what comes back
// here is what the game built, not a second implementation of the rules that
// would drift the first time someone tunes the scatter.
//
// Round-trip: bake -> themeFromLevel -> Arena reproduces the same city, because
// every field the authored path reads is written here (buildings keep their
// massing `cells`, props keep their yaw + seed + opts, the viaduct keeps its
// ramp offset).
import { LEVEL_VERSION } from './level.js';

export function levelFromArena(arena, { name } = {}) {
  const theme = arena.theme;
  const terra = arena.terrain;
  const L = theme.layout || {};
  const objects = [];

  // buildings + props, exactly as placed
  for (const b of arena.recipe.buildings) objects.push(b);
  for (const p of arena.recipe.props) objects.push(p);

  // hills: `deck` is a per-hill flag in a level but a whole-group style in a
  // theme, so it is resolved here or a baked platform arena comes back as mounds
  const deckStyle = L.hills?.style === 'deck';
  for (const h of terra.hills) {
    objects.push({
      k: 'hill', x: r1(h.x), z: r1(h.z), R: r2(h.R), Rtop: r2(h.Rtop), H: r2(h.H),
      deck: h.deck ?? deckStyle,
      color: h.color ?? L.hills?.color, edge: h.edge ?? L.hills?.edge,
    });
  }
  for (const b of terra.bridges) {
    objects.push({
      k: 'bridge', x: r1(b.x), z: r1(b.z), axis: b.axis,
      flat: r2(b.flat), H: r2(b.H), color: b.color, edge: b.edge,
    });
  }
  for (const l of terra.lanes) {
    objects.push({
      k: 'lane', kind: l.kind, style: l.style, axis: l.axis, at: r1(l.at),
      amp: r2(l.amp || 0), phase: r2(l.phase || 0), width: r2(l.half * 2),
      glow: l.glow || null, dash: l.dash || null, color: l.color || null,
    });
  }
  for (const p of terra.patches) {
    objects.push({
      k: 'patch', kind: p.kind, x: r1(p.x), z: r1(p.z), r: r2(p.r),
      glow: p.glow || null, color: p.color || null,
    });
  }

  const v = terra.viaduct;
  const viaduct = v ? {
    axis: v.lane.axis, at: r1(v.lane.at), amp: r2(v.lane.amp), phase: r2(v.lane.phase),
    h: r2(v.H), w: r2(v.w), rampL: r2(v.rampL), r0: r1(v.ramps[0]),
    pylonEvery: L.viaduct?.pylonEvery ?? 3, color: v.color, edge: v.edge,
  } : null;

  return {
    v: LEVEL_VERSION,
    name: name || theme.name || theme.id,
    theme: theme.id,
    bounds: arena.bounds,            // already the doubled play radius
    clearing: terra.clearing,
    plaza: L.plaza ?? false,
    objects,
    viaduct,
    // a procedural theme spawns fighters on a radial ring it works out at match
    // time; baking one must not freeze four particular points into the level
    spawns: (theme.spawns || []).map((s) => ({ x: r1(s.x), z: r1(s.z), yaw: r2(s.yaw ?? 0) })),
  };
}

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 1000) / 1000;
