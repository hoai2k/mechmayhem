# Custom levels

Authored arenas built with the level editor (`/workbench/?edit=level`). Each `.json` here
is an explicit placement list layered over a base theme.

## Play a level

```
?battle=<theme>&level=<name>&p1=titanus&p2=viper
```

e.g. `?battle=neon&level=sample-arena&p1=titanus&p2=viper` plays
`sample-arena.json`. Add `&auto=1&diff=ace` to spectate an AI match.

## …or make one THE arena

A level listed in `src/arena/authored.js` (`theme id -> level basename`) is
what the GAME plays when that arena is picked off the select screen — the same
hand-built city every match, instead of a fresh roll of the theme's recipe. A
theme with no entry there has no authored version and stays procedural, which
is most of them.

```js
export const AUTHORED_ARENAS = { neon: 'neon-district' };
```

SETTINGS → **ARENA DESIGN** decides whether that table is consulted at all.
Only **AUTHORED** (the default) reads it; **CITY WARDS**, **GRAND AXIS**,
**COLOSSEUM** and **FALLBACK** each generate every arena with that design
system instead, which is how the generated cities stay reachable once an arena
has been authored. `?design=<mode>` is the same thing for one session (the old
`?procedural=1` still means `fallback`, and the retired on/off pref migrates),
and it works on `?battle=` too — a bare `?battle=neon` otherwise plays whatever
the menus would play, so a soak or a screenshot tests the real arena.

## Make one

1. Open `/workbench/?edit=level`.
2. Pick a theme, place buildings / props / terrain, drop spawn points.
3. **▶ Playtest** launches a live battle immediately, or **Export** downloads
   the JSON — save it here as `public/levels/<name>.json`.
4. Re-open it any time with `/workbench/?edit=level&load=<name>`, or pick it from the
   **📂 Open level…** dropdown in the editor's top bar.

To make a level show up in that dropdown, add its name to `manifest.json`
here (a plain JSON array of file basenames, e.g. `["sample-arena", "my-level"]`).
Your own **Save**d levels (stored in the browser) always appear in the dropdown
automatically.

## Format (version 1)

```jsonc
{
  "v": 1, "name": "My Level", "theme": "neon",
  "bounds": 104,          // effective play radius (the doubled in-game value)
  "clearing": 38,         // spawn-plaza radius
  "plaza": true,          // paint the centre spawn rings
  "objects": [
    { "k": "building", "x": 0, "z": 0, "nx": 3, "ny": 6, "nz": 3, "tint": 6976672 },
    { "k": "prop", "name": "billboard", "x": 20, "z": 0, "ry": 1.2, "s": 1, "opts": { "color": 5498879 } },
    { "k": "hill", "x": -30, "z": 10, "R": 14, "H": 5, "deck": false },
    { "k": "bridge", "x": 0, "z": -40, "axis": "x", "flat": 14, "H": 3.2 },
    { "k": "lane", "kind": "acid", "axis": "z", "at": -30, "amp": 8, "phase": 1.2, "width": 6 }
  ],
  "spawns": [ { "x": -30, "z": 0, "yaw": 1.5707 }, { "x": 30, "z": 0, "yaw": -1.5707 } ]
}
```

The game consumes this via `src/arena/level.js` (`themeFromLevel`), which fills
`theme.authored` (buildings + props placed verbatim), `theme.spawns`, and the
explicit terrain lists on `theme.layout`. Everything is toroidally tiled just
like a procedural arena.
