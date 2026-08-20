// Workbench entry — /workbench/?edit=<tool>&mech=<id>
//
// One page, one router, nine tools. Everything game-specific arrives through
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
//
// `&variant=alt|proc` picks which build a tool opens; the legacy `&alt=1` is
// still accepted (see workbench/ui/variantpick.js).
import '../src/style.css';

const TOOLS = {
  animation: () => import('./tools/animation.js').then((m) => m.runAnimationWorkbench),
  pose: () => import('./tools/pose.js').then((m) => m.runPoseWorkbench),
  skin: () => import('./tools/skin.js').then((m) => m.runSkinWorkbench),
  skindebug: () => import('./tools/skindebug.js').then((m) => m.runSkinDebugWorkbench),
  rig: () => import('./tools/rig.js').then((m) => m.runRigWorkbench),
  collider: () => import('./tools/collider.js').then((m) => m.runColliderWorkbench),
  gait: () => import('./tools/gait.js').then((m) => m.runGaitWorkbench),
  props: () => import('./tools/props.js').then((m) => m.runPropsWorkbench),
  level: () => import('./tools/level.js').then((m) => m.runLevelWorkbench),
};

// Superseded tool ids, kept working the same way the ?debug= urls are: a
// bookmark or script written against the old name must not simply fail.
// Not listed in the TOOLS menu above — resolved, then forgotten.
const ALIASES = { hurtbox: 'collider' };

const params = new URLSearchParams(location.search);
const asked = (params.get('edit') || '').toLowerCase();
const which = ALIASES[asked] || asked;

if (!TOOLS[which]) {
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
    const run = await TOOLS[which]();
    await run(config, params);
  })();
}
