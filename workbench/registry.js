// THE WORKBENCHES — one list, and everything that names a tool reads it: the
// router (workbench/main.js) loads a tool by it, the front door
// (workbench/landing.js) draws its cards from it, and every panel's coloured
// title bar and workbench switcher (workbench/ui/panel.js) come off it. It
// used to be four hand-kept lists, two of them still using keys that predate
// the page (`models` for animation, `rigedit` for rig).
//
// Pure data, no imports: the landing page renders without the adapter or a
// WebGL context, and a list that pulled in a tool would pull in all of them.
//
//   id       the ?edit= id, and the tool's identity everywhere
//   module   workbench/tools/<module>.js, loaded lazily
//   run      the function that module exports: run(config, params)
//   title / color / tag / desc   what the title bar and the card show
//
// ORDER IS THE SWITCHER'S AND THE FRONT DOOR'S: the order you actually move
// through a model — shape it, rig it, weight it, pose it, check what it hits.
// Adding a tool is one entry here plus its module; the game-side legacy URL
// redirects (src/dev/index.js) are held to this list by test/workbench.test.mjs.
export const WORKBENCHES = [
  {
    id: 'animation', module: 'animation', run: 'runAnimationWorkbench',
    title: 'Animation Workbench', color: '#b98cff', tag: 'actions · anchors',
    desc: 'The GLB build and the procedural body side by side. Trigger any move '
      + 'on both at once, slow it down, and drag the muzzle/anchor points '
      + 'combat fires from.',
  },
  {
    id: 'rig', module: 'rig', run: 'runRigWorkbench',
    title: 'Rig Editor', color: '#4aa8ff', tag: 'skeletons',
    desc: 'Hand-place a skeleton inside a raw GLB: drag bones, re-skin, test a '
      + 'swing, and export the rig file the game loads.',
  },
  {
    id: 'skin', module: 'skin', run: 'runSkinWorkbench',
    title: 'Skin Workbench', color: '#f5a33c', tag: 'weights · islands',
    desc: 'Bone-island skin repair. Click the geometry that deforms wrongly, '
      + 'hand it to the right bone, paint with brushes and lassos, export the '
      + 'ops for the manifest.',
  },
  {
    id: 'skindebug', module: 'skindebug', run: 'runSkinDebugWorkbench',
    title: 'Skin Debug', color: '#ff6b8a', tag: 'audit · stretched skin',
    desc: 'Plays every clip a mech has and lists the places the skin tears, '
      + 'stretches or collapses — walk the findings, watch each one deform, '
      + 'and jump to the tool that fixes it.',
  },
  {
    id: 'pose', module: 'pose', run: 'runPoseWorkbench',
    title: 'Pose Workbench', color: '#4fdc8b', tag: 'clips · keyframes',
    desc: 'Pose a mech joint by joint and edit the clip itself: scrub keys, '
      + 'move them in time, add and delete them, and export the key list for '
      + 'animations.js.',
  },
  {
    id: 'gait', module: 'gait', run: 'runGaitWorkbench',
    title: 'Gait Workbench', color: '#ff9f43', tag: 'walk · run cycles',
    desc: 'Locomotion as numbers. Run a mech on the spot at any throttle, game '
      + 'speed or slow-motion, drag a limb to tune the dial behind it, and see '
      + 'the same shared gait on every mech that runs it.',
  },
  {
    id: 'collider', module: 'collider', run: 'runColliderWorkbench',
    title: 'Hurtbox Workbench', color: '#7fd8ff', tag: 'combat volumes',
    desc: 'What combat actually hits: the measured hurtbox capsules, the legacy '
      + 'hit ball, and the swept strike at a clip’s impact frame, against a '
      + 'dummy at range.',
  },
  {
    id: 'props', module: 'props', run: 'runPropsWorkbench',
    title: 'Props Workbench', color: '#ffd23c', tag: 'arena models',
    desc: 'The imported arena props, original beside optimized in twin '
      + 'viewports with one shared camera — judge the model diet, catch any '
      + 'size drift.',
  },
  {
    id: 'level', module: 'level', run: 'runLevelWorkbench',
    title: 'Arena Editor', color: '#62ff9a', tag: 'arenas · levels',
    desc: 'Open one of the 12 shipped arenas and change it. Every tower, prop, '
      + 'lane and hill it generated becomes something you can drag, turn, copy '
      + 'or delete — then play it, or export it as a level.',
  },
];

export const WORKBENCH_BY_ID = Object.fromEntries(WORKBENCHES.map((w) => [w.id, w]));

// Superseded ?edit= ids, kept working the way the old ?debug= urls are: a
// bookmark or script written against the old name must not simply fail.
export const WORKBENCH_ALIASES = { hurtbox: 'collider' };
