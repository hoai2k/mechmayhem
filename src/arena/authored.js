// WHICH ARENAS ARE AUTHORED RATHER THAN GENERATED.
//
// An arena is normally a RECIPE plus a seed: themes.js says what a place is
// made of and where its ingredients scatter, and every match rolls a new city
// from it. An AUTHORED arena is the other thing — a level built by hand in the
// arena editor (/workbench/?edit=level), saved to public/levels/<name>.json,
// and played EXACTLY as it was laid out, every match the same.
//
// This table is the whole registry: theme id -> level file basename. A theme
// with no entry has no authored version and stays procedural, which is most of
// them today, so the two kinds live side by side with no flag per arena.
//
// SETTINGS -> PROCEDURAL ARENAS (CONFIG.proceduralArenas, off by default)
// ignores this table entirely and rolls every arena from its recipe, which is
// how the generated cities stay reachable once an arena has been authored.
import { CONFIG } from '../core/config.js';
import { loadLevel, themeFromLevel } from './level.js';

export const AUTHORED_ARENAS = {
  neon: 'neon-district',
};

// The level file for a theme, or null when it should be generated — either
// because nothing is authored for it or because the player asked for
// procedural arenas.
export function authoredLevelFor(themeId) {
  if (CONFIG.proceduralArenas) return null;
  return AUTHORED_ARENAS[themeId] || null;
}

// Resolve the theme a match should actually build. Hands back the base theme
// untouched whenever there is no authored level to use, or the file is missing
// or unreadable — a level that fails to load must cost the player a generated
// city, never a broken arena.
//
// The base theme's NAME and DESC are kept: the player picked NEON DISTRICT off
// the arena card and that is what the loading screen and the HUD should go on
// calling it, whatever the level file happens to be titled in the editor.
export async function resolveArenaTheme(theme) {
  const name = authoredLevelFor(theme?.id);
  if (!name) return theme;
  const level = await loadLevel(name);
  if (!level) return theme;
  const authored = themeFromLevel(level);
  authored.name = theme.name;
  authored.desc = theme.desc;
  return authored;
}
