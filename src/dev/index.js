// Dev-mode router. All debug-only entry points live here (and in the dev/*
// modules they lazy-load), so the game entry (main.js) stays clean of debug
// wiring. Each mode is still a separate lazy chunk — importing this router
// does NOT pull the dev modules into the main bundle.
//
// NOTE: ?debug=fallback (procedural roster instead of the GLB models, and the
// legacy ?debug=3d that now just means "default") is deliberately NOT handled
// here — choosing the model set is a real game toggle, routed through the
// normal boot path, not a dev mode.
export function runDevMode(params) {
  const debug = params.get('debug');
  if (params.get('edit') === 'level') {
    import('../editor/leveleditor.js').then(({ runLevelEditor }) => runLevelEditor(params));
  } else if (params.has('showcase')) {
    import('./showcase.js').then(({ runShowcase }) => runShowcase(params.get('showcase')));
  } else if (debug === 'actions') {
    import('./actiontest.js').then(({ runActionTest }) => runActionTest());
  } else if (debug === 'models') {
    import('./posetool.js').then(({ runPoseTool }) => runPoseTool(params.get('mech') || params.get('id')));
  } else if (debug === 'pose') {
    import('./posework.js').then(({ runPoseWork }) => runPoseWork(params.get('mech') || params.get('id')));
  } else if (debug === 'skin') {
    import('./skintool.js').then(({ runSkinTool }) => runSkinTool(params.get('mech') || params.get('id')));
  } else if (params.has('battle') || debug === 'finisher' || params.get('finisherdemo') === '1') {
    import('./battletest.js').then(({ runBattleTest }) => runBattleTest());
  } else if (params.has('ultfx')) {
    import('./ultfxtest.js').then(({ runUltFxTest }) => runUltFxTest(params.get('ultfx')));
  } else if (params.has('fire')) {
    import('./firetest.js').then(({ runFireTest }) => runFireTest());
  } else if (params.has('geyser')) {
    import('./geysertest.js').then(({ runGeyserTest }) => runGeyserTest());
  } else if (params.has('glbview')) {
    import('./glbview.js').then(({ runGlbView }) => runGlbView(params.get('glbview')));
  } else if (params.has('rigedit')) {
    import('./rigedit.js').then(({ runRigEdit }) => runRigEdit(params.get('rigedit')));
  } else if (params.has('bake')) {
    import('./bake.js').then(({ runBake }) => runBake(params.get('bake')));
  } else if (params.has('rigtest')) {
    import('./rigtest.js').then(({ runRigTest }) => runRigTest());
  } else {
    return false; // not a dev mode — boot the game
  }
  return true;
}
