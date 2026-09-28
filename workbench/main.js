// Workbench entry — /workbench/?edit=<tool>&mech=<id>
//
// One page, one router, the tools listed in registry.js. Everything game-specific arrives through
// the adapter (workbench/adapters/mechmayhem), which fills the contract in
// workbench/config/contract.js; the tools themselves import no game code.
//
//   /workbench/?edit=animation&mech=colossus     GLB vs procedural, actions, anchors
//   /workbench/?edit=pose&mech=colossus          pose + keyframe a clip
//   /workbench/?edit=skin&mech=colossus          bone-island skin repair
//   /workbench/?edit=skindebug&mech=jerry        audit every clip for torn skin
//   /workbench/?edit=rig&mech=colossus           hand-place a skeleton
//   /workbench/?edit=collider&mech=colossus      what combat actually hits
//   /workbench/?edit=gait&mech=viper             tune the walk/run cycle itself
//   /workbench/?edit=props&prop=toriiGate        arena props: original vs optimized
//   /workbench/?edit=level&arena=neon            the ARENA editor: bake a shipped
//                                                arena and move what is in it
import '../src/style.css';

import { WORKBENCH_BY_ID, WORKBENCH_ALIASES } from './registry.js';

// every tool module, lazily — the registry says which one a tool id is and
// what it exports, so adding a tool is an entry there and a file here
const MODULES = import.meta.glob('./tools/*.js');
const loadTool = (w) => MODULES[`./tools/${w.module}.js`]().then((m) => m[w.run]);

const params = new URLSearchParams(location.search);
const asked = (params.get('edit') || '').toLowerCase();
const which = WORKBENCH_ALIASES[asked] || asked;

if (!WORKBENCH_BY_ID[which]) {
  // no tool asked for (bare /workbench/), or a name that doesn't exist:
  // both land on the front door — a card per workbench, click to open.
  // Static on purpose, so it never waits on the adapter or a WebGL context.
  import('./landing.js').then(({ runLanding }) => runLanding(asked || null));
} else {
  // wrapped rather than top-level await: the build targets es2020, where TLA
  // isn't available
  (async () => {
    const { loadMechMayhemConfig } = await import('./adapters/mechmayhem/index.js');
    const config = await loadMechMayhemConfig();
    const run = await loadTool(WORKBENCH_BY_ID[which]);
    await run(config, params);
  })();
}
