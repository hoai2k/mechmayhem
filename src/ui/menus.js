// Menu screens: Title → Setup → Mech Select → Arena Select → (battle) → Results.
// Each screen builds DOM into #ui-root and consumes aggregated menu events.
//
// One file per screen under src/ui/menus/; this module is the public surface,
// so every importer keeps importing from 'ui/menus.js'.
export { RANDOM_PICK, el, neonBuzzVol, playNeonBuzz } from './menus/common.js';
export { TitleScreen } from './menus/title.js';
export { MechSelectScreen } from './menus/select.js';
export { ArenaSelectScreen } from './menus/arena.js';
export { PauseScreen, SettingsScreen, ResultsScreen } from './menus/overlays.js';
