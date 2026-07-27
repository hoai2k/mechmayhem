// Authored-level data model + loader.
//
// The game normally builds arenas procedurally from a theme + seed (themes.js).
// The level editor (?edit=level) instead produces an EXPLICIT placement list —
// exact buildings, props, hills, bridges, lanes and spawns. `themeFromLevel`
// converts that list into a theme object the Arena consumes as-is: it fills
// `theme.authored` (buildings + props placed verbatim), `theme.spawns`, and the
// explicit terrain lists on `theme.layout` (hills.list / bridges.list / lanes).
//
// A level keeps a base `theme` id so sky, fog, lights, ground texture, ambient
// and music still come from a shipped theme — the editor only authors the
// stuff you place.
//
// Level JSON schema (version 1):
//   {
//     v: 1, name, theme: 'neon',
//     bounds,               // effective play radius (the doubled in-game value)
//     clearing, plaza,      // spawn-plaza radius + painted rings
//     objects: [
//       { k:'building', x, z, nx, ny, nz, cw, ch, cd, tint },
//       { k:'prop', name, x, z, ry, s, opts:{ color, ... } },
//       { k:'hill', x, z, R, Rtop, H, deck, color, edge },
//       { k:'bridge', x, z, axis, flat, H, color, edge },
//       { k:'lane', kind, style, axis, at, amp, phase, width, glow, dash, color },
//       { k:'patch', kind, x, z, r, glow, color },   // lake / lava pool / lawn...
//     ],
//     spawns: [ { x, z, yaw } ],
//   }
import { THEMES_BY_ID, THEMES } from './themes.js';

export const LEVEL_VERSION = 1;
export const PLAYTEST_KEY = 'rw_playtest_level';

// Build a theme object from an authored level. The returned theme is a shallow
// override of the base theme — safe to hand straight to `new Arena(...)`.
export function themeFromLevel(level) {
  const base = THEMES_BY_ID[level.theme] || THEMES[0];
  const theme = JSON.parse(JSON.stringify(base)); // detach from the shared config
  theme.id = base.id;                              // keep texture pack / ground / music
  theme.name = level.name || base.name;
  theme.desc = level.desc || base.desc;

  // effective play radius: the editor works in the final (doubled) world
  // radius; the Arena doubles theme.bounds, so halve it back here.
  if (level.bounds) theme.bounds = level.bounds / 2;

  const objects = level.objects || [];
  // buildings + props are placed verbatim — the presence of `authored`
  // switches the Arena off procedural generation entirely.
  theme.authored = objects.filter((o) => o.k === 'building' || o.k === 'prop');

  const hills = objects.filter((o) => o.k === 'hill');
  const bridges = objects.filter((o) => o.k === 'bridge');
  const lanes = objects.filter((o) => o.k === 'lane');
  const patches = objects.filter((o) => o.k === 'patch');

  const bl = base.layout || {};
  const L = theme.layout = { ...bl };
  L.clearing = level.clearing ?? bl.clearing ?? 38;
  L.plaza = level.plaza ?? bl.plaza ?? false;
  L.clusters = { count: 0, size: [2, 3] };  // no procedural building clusters
  L.viaduct = null;   // authored levels are exact — no seeded loop

  L.lanes = lanes.map((o) => ({
    kind: o.kind, style: o.style || o.kind, axis: o.axis,
    at: o.at, amp: o.amp || 0, phase: o.phase || 0, width: o.width ?? 6,
    glow: o.glow || null, dash: o.dash || null, color: o.color || null,
  }));

  // patches place exactly where authored (one spec per patch, list of one);
  // a level with no patch objects gets none — not the base theme's random set
  L.patches = patches.map((o) => ({
    kind: o.kind, glow: o.glow || null, color: o.color || null,
    list: [{ x: o.x, z: o.z, r: o.r ?? 9 }],
  }));

  L.hills = hills.length ? {
    color: bl.hills?.color, style: bl.hills?.style, edge: bl.hills?.edge,
    list: hills.map((o) => ({
      x: o.x, z: o.z, R: o.R ?? 12, Rtop: o.Rtop,
      H: o.H ?? 3.5, deck: o.deck, color: o.color, edge: o.edge,
    })),
  } : null;

  L.bridges = bridges.length ? {
    color: bl.bridges?.color, edge: bl.bridges?.edge,
    list: bridges.map((o) => ({
      x: o.x, z: o.z, axis: o.axis || 'x', flat: o.flat ?? 12,
      H: o.H, color: o.color, edge: o.edge,
    })),
  } : null;

  if (level.spawns?.length) {
    theme.spawns = level.spawns.map((s) => ({ x: s.x, z: s.z, yaw: s.yaw }));
  }
  return theme;
}

// Resolve a level by name. `__edit` / `playtest` reads the editor's live
// sessionStorage stash (instant playtest); any other name fetches
// public/levels/<name>.json.
export async function loadLevel(name) {
  if (!name) return null;
  if (name === '__edit' || name === 'playtest') {
    try {
      const s = sessionStorage.getItem(PLAYTEST_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }
  try {
    const res = await fetch(`levels/${name}.json`);
    if (res.ok) return await res.json();
  } catch { /* not found — fall through */ }
  return null;
}

// Blank level for a given base theme, sized to the theme's default arena.
export function emptyLevel(themeId = 'neon') {
  const base = THEMES_BY_ID[themeId] || THEMES[0];
  return {
    v: LEVEL_VERSION,
    name: 'Untitled Level',
    theme: base.id,
    bounds: base.bounds * 2,               // effective (doubled) play radius
    clearing: base.layout?.clearing ?? 38,
    plaza: base.layout?.plaza ?? true,
    objects: [],
    spawns: [],
  };
}
