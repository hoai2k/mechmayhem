// Dev-mode router. All debug-only entry points live here (and in the dev/*
// modules they lazy-load), so the game entry (main.js) stays clean of debug
// wiring. Each mode is still a separate lazy chunk — importing this router
// does NOT pull the dev modules into the main bundle.
//
// NOTE: ?debug=fallback (procedural roster instead of the GLB models, and the
// legacy ?debug=3d that now just means "default") is deliberately NOT handled
// here — choosing the model set is a real game toggle, routed through the
// normal boot path, not a dev mode.
// The five model workbenches moved to their own page (/workbench/), so the
// old URLs are now redirects. Every node tool, bookmark and doc link that says
// ?debug=skin keeps working, and lands on the same tool with the same mech.
const WORKBENCH_REDIRECTS = {
  'debug=models': 'animation',
  'debug=pose': 'pose',
  'debug=skin': 'skin',
  'debug=collider': 'collider',
  'rigedit': 'rig',
};

function workbenchRedirect(params) {
  const debug = params.get('debug');
  let tool = debug ? WORKBENCH_REDIRECTS['debug=' + debug] : null;
  if (!tool && params.has('rigedit')) tool = 'rig';
  if (!tool) return false;
  const next = new URLSearchParams();
  next.set('edit', tool);
  // the mech can arrive as ?mech=, ?id= or as the value of ?rigedit=
  const rig = params.get('rigedit');
  const mech = params.get('mech') || params.get('id')
    || (rig && rig !== '1' && rig !== 'true' ? rig : null);
  if (mech) next.set('mech', mech);
  // per-tool params that still mean the same thing on the other side
  for (const k of ['alt', 'variant', 'model', 'clip', 'left', 'at', 'dummy', 'ball']) {
    if (params.has(k)) next.set(k, params.get(k));
  }
  const base = location.pathname.replace(/[^/]*$/, '');
  location.replace(`${base}workbench/?${next.toString()}`);
  return true;
}

export function runDevMode(params) {
  if (workbenchRedirect(params)) return true;
  const debug = params.get('debug');
  if (params.get('edit') === 'level') {
    import('../editor/leveleditor.js').then(({ runLevelEditor }) => runLevelEditor(params));
  } else if (params.has('showcase')) {
    import('./showcase.js').then(({ runShowcase }) => runShowcase(params.get('showcase')));
  } else if (debug === 'actions') {
    import('./actiontest.js').then(({ runActionTest }) => runActionTest());
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
  } else if (params.has('bake')) {
    import('./bake.js').then(({ runBake }) => runBake(params.get('bake')));
  } else if (params.has('rigtest')) {
    import('./rigtest.js').then(({ runRigTest }) => runRigTest());
  } else {
    return false; // not a dev mode — boot the game
  }
  return true;
}
