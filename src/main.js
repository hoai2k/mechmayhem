import './style.css';
import { runDevMode } from './dev/index.js';
import {
  showFatal, showNoWebGL, showContextLost, contextIsLost, isFatal, WebGLUnavailableError,
} from './core/fatal.js';

// Anything that escapes to the top before the game is up gets a readable panel
// instead of the boot splash spinning forever. Registered first, so it covers
// the dev router and the dynamic import as well as boot itself.
function reportFatal(err) {
  if (isFatal()) return;
  if (err instanceof WebGLUnavailableError) { showNoWebGL(err); return; }
  // a dead context throws through three before webglcontextlost is dispatched,
  // so ask the canvas rather than trusting which handler fired first
  if (contextIsLost()) { showContextLost(); return; }
  console.error(err);
  showFatal({
    title: 'SOMETHING WENT WRONG',
    body: 'ROBOTWORLD hit an error while starting up and could not continue.',
    detail: String(err?.stack || err?.message || err || ''),
    reload: true,
  });
}
window.addEventListener('error', (e) => reportFatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportFatal(e.reason));

// Debug-only modes live in src/dev/*; the router handles their dispatch so this
// entry stays minimal. Anything that isn't a dev mode boots the real game.
//
// __RW_DIST__ is a compile-time constant (vite.config.js). In a distribution
// build it is true, the branch below folds to a plain boot, and the whole dev
// router — with ?showcase, ?battle=, the fx tests and the level editor behind
// it — is dead code that never reaches the bundle. In every other build it is
// false and nothing changes.
const params = new URLSearchParams(location.search);
if (__RW_DIST__ || !runDevMode(params)) {
  import('./game/boot.js').then(({ bootGame }) => bootGame()).catch(reportFatal);
}
