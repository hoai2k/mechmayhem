// The workbench FRONT DOOR — /workbench/ with no ?edit=.
//
// Nine tools share this page, and the URL used to be the only map of them:
// land here bare and you were silently dropped into the animation workbench,
// mistype a tool id and you got a terse error. Both now come here instead — a
// card per workbench, its real screenshot, what it is for, click to open.
// Deep links (?edit=<tool>) are untouched; this renders only when no tool
// (or an unknown one) was asked for.
//
// Deliberately free of the adapter: the game config takes a moment to load
// and needs a WebGL context, and a menu needs neither. Everything here is
// static — the card colours mirror workbench/ui/panel.js (WORKBENCHES), the
// screenshots live in workbench/thumbs/ (re-shot by tools/wbthumbs.mjs when
// a tool's look changes).

// bundled by Vite; a missing file fails the build rather than a 404 at runtime
const thumb = (name) => new URL(`./thumbs/${name}.jpg`, import.meta.url).href;

const TOOLS = [
  {
    id: 'animation', title: 'Animation Workbench', color: '#b98cff',
    tag: 'actions · anchors',
    desc: 'The GLB build and the procedural body side by side. Trigger any move '
      + 'on both at once, slow it down, and drag the muzzle/anchor points '
      + 'combat fires from.',
  },
  {
    id: 'rig', title: 'Rig Editor', color: '#4aa8ff',
    tag: 'skeletons',
    desc: 'Hand-place a skeleton inside a raw GLB: drag bones, re-skin, test a '
      + 'swing, and save the rig file the game loads.',
  },
  {
    id: 'skin', title: 'Skin Workbench', color: '#f5a33c',
    tag: 'weights · islands',
    desc: 'Bone-island skin repair. Click the geometry that deforms wrongly, '
      + 'hand it to the right bone, paint with brushes and lassos, save to the '
      + 'manifest.',
  },
  {
    id: 'skindebug', title: 'Skin Debug', color: '#ff6b8a',
    tag: 'audit · stretched skin',
    desc: 'Plays every clip a mech has and lists the places the skin tears, '
      + 'stretches or collapses — walk the findings, watch each one deform, '
      + 'and jump to the tool that fixes it.',
  },
  {
    id: 'pose', title: 'Pose Workbench', color: '#4fdc8b',
    tag: 'clips · keyframes',
    desc: 'Pose a mech joint by joint and edit the clip itself: scrub keys, '
      + 'move them in time, add and delete them, and export the key list for '
      + 'animations.js.',
  },
  {
    id: 'gait', title: 'Gait Workbench', color: '#ff9f43',
    tag: 'walk · run cycles',
    desc: 'Locomotion as numbers. Run a mech on the spot at any throttle, game '
      + 'speed or slow-motion, drag a limb to tune the dial behind it, and see '
      + 'the same shared gait on every mech that runs it.',
  },
  {
    id: 'collider', title: 'Hurtbox Workbench', color: '#7fd8ff',
    tag: 'combat volumes',
    desc: 'What combat actually hits: the measured hurtbox capsules, the legacy '
      + 'hit ball, and the swept strike at a clip’s impact frame, against a '
      + 'dummy at range.',
  },
  {
    id: 'props', title: 'Props Workbench', color: '#ffd23c',
    tag: 'arena models',
    desc: 'The imported arena props, original beside optimized in twin '
      + 'viewports with one shared camera — judge the model diet, catch any '
      + 'size drift.',
  },
  {
    id: 'level', title: 'Arena Editor', color: '#62ff9a',
    tag: 'arenas · levels',
    desc: 'Open one of the 12 shipped arenas and change it. Every tower, prop, '
      + 'lane and hill it generated becomes something you can drag, turn, copy '
      + 'or delete — then play it, or export it as a level.',
  },
];

export function runLanding(unknownTool = null) {
  document.getElementById('boot-splash')?.remove();
  document.title = 'ROBOTWORLD — Workbenches';
  const root = document.createElement('div');
  root.innerHTML = `
  <style>
    .wb-land { position: fixed; inset: 0; overflow: auto; background:
      radial-gradient(1200px 500px at 70% -10%, #1c2634 0%, #0b0f16 55%);
      color: #dfe8f5; font: 14px/1.5 system-ui, sans-serif; }
    .wb-wrap { max-width: 1060px; margin: 0 auto; padding: 44px 24px 60px; }
    .wb-head h1 { margin: 0; font-size: 26px; letter-spacing: .14em; }
    .wb-head h1 b { color: #8fd8ff; }
    .wb-head p { margin: 8px 0 0; color: #8ba0b8; max-width: 640px; }
    .wb-warn { margin: 18px 0 0; padding: 8px 14px; border: 1px solid #5a4a2a;
      background: #241d10; border-radius: 8px; color: #ffcc66; display: inline-block; }
    .wb-grid { margin-top: 30px; display: grid; gap: 18px;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
    .wb-card { display: block; text-decoration: none; color: inherit;
      background: #131a24; border: 1px solid #232f40; border-radius: 12px;
      overflow: hidden; transition: transform .12s ease, border-color .12s ease,
      box-shadow .12s ease; }
    .wb-card:hover { transform: translateY(-3px); border-color: var(--c);
      box-shadow: 0 10px 30px #0009; }
    .wb-shot { position: relative; aspect-ratio: 16 / 9; background: #0d1219; }
    .wb-shot img { width: 100%; height: 100%; object-fit: cover; display: block;
      filter: saturate(.92); }
    .wb-card:hover .wb-shot img { filter: none; }
    .wb-shot::after { content: ''; position: absolute; inset: 0;
      background: linear-gradient(180deg, transparent 62%, #131a24 100%); }
    .wb-body { padding: 12px 14px 14px; border-top: 2px solid var(--c); }
    .wb-title { display: flex; align-items: baseline; gap: 8px; }
    .wb-title b { color: var(--c); font-size: 15px; letter-spacing: .02em; }
    .wb-title span { color: #5d6b7d; font-size: 11px; letter-spacing: .08em;
      text-transform: uppercase; }
    .wb-desc { margin-top: 6px; color: #9fb2c8; font-size: 12.5px; }
    .wb-url { margin-top: 8px; color: #56657a; font-size: 11px;
      font-family: ui-monospace, monospace; }
    .wb-foot { margin-top: 34px; color: #56657a; font-size: 12px; }
    .wb-foot a { color: #7fb4e8; text-decoration: none; }
    .wb-foot a:hover { text-decoration: underline; }
  </style>
  <div class="wb-land"><div class="wb-wrap">
    <div class="wb-head">
      <h1>ROBOTWORLD <b>WORKBENCHES</b></h1>
      <p>The authoring tools — models, and the arenas they fight in — on their
      own page. Every tool opens on a subject and keeps it in the URL, so a link
      or a screenshot always lands back on the same thing; the chevron in a
      tool’s title bar hops between them without losing your place. None of this
      ships with the game.</p>
      ${unknownTool ? `<div class="wb-warn">No workbench called
        “${String(unknownTool).replace(/[<>&"]/g, '')}” — pick one below.</div>` : ''}
    </div>
    <div class="wb-grid">
      ${TOOLS.map((t) => `
        <a class="wb-card" style="--c:${t.color}" href="?edit=${t.id}">
          <div class="wb-shot"><img src="${thumb(t.id)}" alt="${t.title}"></div>
          <div class="wb-body">
            <div class="wb-title"><b>${t.title}</b><span>${t.tag}</span></div>
            <div class="wb-desc">${t.desc}</div>
            <div class="wb-url">?edit=${t.id}</div>
          </div>
        </a>`).join('')}
    </div>
    <div class="wb-foot">
      Also lives on the game page: the <a href="../?showcase">mech showcase</a>
      (<code>?showcase</code>). Back to <a href="../">the game</a>.
    </div>
  </div></div>`;
  document.body.appendChild(root);
}
