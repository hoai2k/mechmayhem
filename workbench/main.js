// Workbench entry — /workbench/?edit=<tool>&mech=<id>
//
// One page, one router, five tools. Everything game-specific arrives through
// the adapter (workbench/adapters/robotworld), which fills the contract in
// workbench/config/contract.js; the tools themselves import no game code.
//
//   /workbench/?edit=animation&mech=colossus     GLB vs procedural, actions, anchors
//   /workbench/?edit=pose&mech=colossus          pose + keyframe a clip
//   /workbench/?edit=skin&mech=colossus          bone-island skin repair
//   /workbench/?edit=rig&mech=colossus           hand-place a skeleton
//   /workbench/?edit=collider&mech=colossus      what combat actually hits
//   /workbench/?edit=props&prop=toriiGate        arena props: original vs optimized
//
// `&variant=alt|proc` picks which build a tool opens; the legacy `&alt=1` is
// still accepted (see workbench/ui/variantpick.js).
import '../src/style.css';

const TOOLS = {
  animation: () => import('./tools/animation.js').then((m) => m.runAnimationWorkbench),
  pose: () => import('./tools/pose.js').then((m) => m.runPoseWorkbench),
  skin: () => import('./tools/skin.js').then((m) => m.runSkinWorkbench),
  rig: () => import('./tools/rig.js').then((m) => m.runRigWorkbench),
  collider: () => import('./tools/collider.js').then((m) => m.runColliderWorkbench),
  props: () => import('./tools/props.js').then((m) => m.runPropsWorkbench),
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
    const { loadRobotworldConfig } = await import('./adapters/robotworld/index.js');
    const config = await loadRobotworldConfig();
    const run = await TOOLS[which]();
    await run(config, params);
  })();
}
