// Shared chrome for the workbench side panels (?debug=skin, ?debug=models,
// ?debug=pose, ?debug=collider, ?rigedit, the pose sandbox).
//
// Things every one of them wants and none of them had:
//
//  · A TITLE, IN THE TOOL'S OWN COLOUR — eight workbenches share one dark
//    panel in one corner, and at a glance (or in a screenshot) they look
//    identical. Each now names itself at the top in a colour that is its
//    own: pose green, skin orange, skin-debug pink, animation purple, rig
//    blue, collider cyan, gait amber. The subtitle line carries the live
//    "what am I looking at" (mech id · ALT), so the header answers both
//    questions at once.
//
//  · SCROLLBARS THAT BELONG — the browser default is a bright system bar
//    stapled onto a dark panel, and on the nested lists (ops, bones, clips)
//    there are several of them at once. Styled here for both engines:
//    ::-webkit-scrollbar for Chromium/Safari, and — only where that isn't
//    supported (Firefox) — the standard scrollbar-width/color, since setting
//    those in Chromium makes it ignore the nicer pseudo-element styling.
//    Anything inside a `.dev-panel` inherits it, including the inner
//    max-height lists, so a tool gets the whole set from one call.
//
//  · A DRAG HANDLE ON THE OUTER EDGE — bone names, op lines and status text
//    are monospace and long; at a fixed 260-300px they ellipsize. Grab the
//    edge and pull. The width is remembered per tool in localStorage, and a
//    double-click on the handle snaps back to the tool's default.
//
// Usage (once, right after the panel is built + appended):
//    import { setupDevPanel } from './panelui.js';
//    const ui = setupDevPanel(panel, { key: 'skin', workbench: 'skin' });
//    ui.setSubtitle(`${id} · ALT`);
const STYLE_ID = 'rw-dev-panel-style';
const MIN_W = 200;
const MAX_W = 900;   // also clamped to the viewport at drag time

// Who's who. One entry per workbench; `key` in setupDevPanel is the width
// store, `workbench` here is the identity. Colours are deliberately far apart
// in hue so peripheral vision alone tells you which tool has focus.
//
// `tool` is the ?edit= id, which is NOT always the identity key — these keys
// predate the workbench page and two of them still carry their old names
// (models = animation, rigedit = rig). Keeping the url id here rather than in
// a second table is what lets the title-bar switcher below navigate without
// anyone having to remember which name a tool answers to.
export const WORKBENCHES = {
  pose: { tool: 'pose', title: 'Pose Workbench', color: '#4fdc8b' },
  skin: { tool: 'skin', title: 'Skin Workbench', color: '#f5a33c' },
  skindebug: { tool: 'skindebug', title: 'Skin Debug', color: '#ff6b8a' },
  models: { tool: 'animation', title: 'Animation Workbench', color: '#b98cff' },
  rigedit: { tool: 'rig', title: 'Rig Editor', color: '#4aa8ff' },
  collider: { tool: 'collider', title: 'Hurtbox Workbench', color: '#7fd8ff' },
  props: { tool: 'props', title: 'Props Workbench', color: '#ffd23c' },
  gait: { tool: 'gait', title: 'Gait Workbench', color: '#ff9f43' },
};

// Order the switcher offers them in: the order you actually move through a
// model — shape it, rig it, weight it, pose it, then check what it hits.
const SWITCH_ORDER = ['models', 'rig', 'skin', 'skindebug', 'pose', 'gait', 'collider', 'props']
  .map((k) => (WORKBENCHES[k] ? k : 'rigedit'));

/**
 * Open another workbench on the SAME subject. Only the params that describe
 * the subject travel: the mech and which of its builds is staged. Everything
 * else on a workbench url is tool-private (`clip`, `key`, `at`, `dummy`, …)
 * and would either be ignored or mean something different next door.
 */
function gotoWorkbench(tool) {
  const cur = new URLSearchParams(location.search);
  const next = new URLSearchParams();
  next.set('edit', tool);
  for (const k of ['mech', 'variant', 'alt', 'prop']) if (cur.has(k)) next.set(k, cur.get(k));
  // the tools all live on the workbench page; keep whatever directory that is
  const dir = location.pathname.includes('/workbench/')
    ? location.pathname
    : location.pathname.replace(/[^/]*$/, '') + 'workbench/';
  location.href = `${dir}?${next.toString()}`;
}

// One stylesheet for every workbench panel on the page.
function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @supports not selector(::-webkit-scrollbar) {
      .dev-panel, .dev-panel * { scrollbar-width: thin; scrollbar-color: #3a4a60 transparent; }
    }
    .dev-panel ::-webkit-scrollbar, .dev-panel::-webkit-scrollbar { width: 9px; height: 9px; }
    .dev-panel ::-webkit-scrollbar-track, .dev-panel::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.03); border-radius: 6px; }
    .dev-panel ::-webkit-scrollbar-thumb, .dev-panel::-webkit-scrollbar-thumb {
      background: #38485e; border-radius: 6px; border: 2px solid transparent; background-clip: content-box; }
    .dev-panel ::-webkit-scrollbar-thumb:hover, .dev-panel::-webkit-scrollbar-thumb:hover {
      background: #4e627e; }
    .dev-panel ::-webkit-scrollbar-corner, .dev-panel::-webkit-scrollbar-corner { background: transparent; }
    .dev-panel-grip {
      position: fixed; z-index: 60; width: 10px; cursor: col-resize;
      display: flex; align-items: center; justify-content: center;
      background: transparent; transition: background 0.12s;
    }
    .dev-panel-grip::before {
      content: ''; width: 2px; height: 26px; border-radius: 2px;
      background: #38485e; transition: background 0.12s, height 0.12s;
    }
    .dev-panel-grip:hover::before, .dev-panel-grip.dragging::before { background: #57c8e8; height: 46px; }
    .dev-panel-grip.dragging { background: rgba(87,200,232,0.10); }
    .dev-panel-head {
      display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap;
      margin: -2px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #26303f;
    }
    .dev-panel-head b {
      font: 600 13px/1.2 system-ui, sans-serif; letter-spacing: .01em;
    }
    .dev-panel-head span {
      font: 11px/1.2 ui-monospace, monospace; color: #8ba0b8; word-break: break-all;
    }
    .dev-panel-swap { display: inline-flex; margin-left: -3px; }
    .dev-panel-chev {
      background: none; border: 0; padding: 0 3px; cursor: pointer; line-height: 1;
      color: #7f95ad; font-size: 11px; border-radius: 3px;
    }
    .dev-panel-chev:hover { color: #dfe8f5; background: rgba(255,255,255,0.07); }
    /* FIXED, not absolute: the panel scrolls (overflow:auto), which clips any
       positioned descendant — an absolutely-positioned menu loses its right
       edge to the panel border. Fixed escapes every ancestor's overflow, at
       the cost of being placed from the chevron's rect on open. */
    .dev-panel-menu {
      display: none; position: fixed; z-index: 60;
      padding: 4px; min-width: 172px;
      background: #121924; border: 1px solid #2c3648; border-radius: 6px;
      box-shadow: 0 8px 22px rgba(0,0,0,0.55);
    }
    .dev-panel-menu.open { display: block; }
    .dev-panel-menu-item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      background: none; border: 0; border-radius: 4px; cursor: pointer;
      padding: 5px 7px; text-align: left;
      font: 12px/1.2 system-ui, sans-serif; color: #dfe8f5;
    }
    .dev-panel-menu-item i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .dev-panel-menu-item:hover { background: rgba(255,255,255,0.08); }
    .dev-panel-menu-item.is-current { color: #7f95ad; cursor: default; }
    .dev-panel-menu-item.is-current:hover { background: none; }
  `;
  document.head.appendChild(s);
}

const storeKey = (key) => `rw.devpanel.${key}.w`;

/**
 * Style a workbench panel's scrollbars and give it a drag-to-resize right edge.
 *   panel — the (position:fixed) panel element, already in the DOM
 *   key   — short tool id; the chosen width is remembered under it
 *   min/max — optional width clamp (defaults 200 / 900, also capped to the view)
 *   edge  — which side the handle sits on: 'right' for a left-anchored panel
 *           (the usual workbench), 'left' for one pinned to the right edge
 *   workbench — id in WORKBENCHES; adds the coloured title bar at the top
 *   subtitle  — initial subtitle text (later: api.setSubtitle)
 * Returns { setWidth, reset, setSubtitle, destroy }.
 */
export function setupDevPanel(panel, {
  key = 'panel', min = MIN_W, max = MAX_W, edge = 'right', workbench = null, subtitle = '',
} = {}) {
  installStyle();
  panel.classList.add('dev-panel');

  // ---- title bar ----
  // Inserted FIRST, so a tool can call setupDevPanel before or after it fills
  // the panel and the header still lands at the top.
  let subEl = null;
  const wb = workbench && WORKBENCHES[workbench];
  if (wb) {
    const head = document.createElement('div');
    head.className = 'dev-panel-head';
    const name = document.createElement('b');
    name.style.color = wb.color;
    name.textContent = wb.title;

    // ---- workbench switcher ----
    // The five tools are one page with one subject on it, and moving between
    // them used to mean hand-editing ?edit= in the url. The title already says
    // which tool this is, so the chevron hangs off the title: same place you
    // look to answer "where am I", now also "take me somewhere else", carrying
    // the mech with it.
    const swap = document.createElement('span');
    swap.className = 'dev-panel-swap';
    const chev = document.createElement('button');
    chev.type = 'button';
    chev.className = 'dev-panel-chev';
    chev.textContent = '▾';
    chev.title = 'switch workbench (same mech)';
    chev.setAttribute('aria-haspopup', 'true');
    chev.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'dev-panel-menu';
    for (const k of SWITCH_ORDER) {
      const w = WORKBENCHES[k];
      if (!w) continue;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dev-panel-menu-item' + (k === workbench ? ' is-current' : '');
      const dot = document.createElement('i');
      dot.style.background = w.color;
      const txt = document.createElement('span');
      txt.textContent = w.title;
      item.append(dot, txt);
      // the current tool stays listed (so the menu reads as a map of where you
      // are, not just where you aren't) but does nothing
      if (k !== workbench) item.onclick = () => gotoWorkbench(w.tool);
      menu.appendChild(item);
    }

    const closeMenu = () => {
      menu.classList.remove('open');
      chev.setAttribute('aria-expanded', 'false');
    };
    chev.onclick = (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('open');
      if (open) {
        // place it under the chevron, then pull it back inside the viewport —
        // panels can be pinned to either edge (`edge: 'left'`), so the menu
        // cannot assume it has room to its right.
        const r = chev.getBoundingClientRect();
        menu.style.top = `${Math.round(r.bottom + 4)}px`;
        menu.style.left = '0px';
        const w = menu.getBoundingClientRect().width;
        menu.style.left = `${Math.round(Math.max(6, Math.min(r.left - 4, window.innerWidth - w - 6)))}px`;
      }
      chev.setAttribute('aria-expanded', String(open));
    };
    // click-away and Esc, so it never strands itself over the panel controls
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    menu.addEventListener('click', (e) => e.stopPropagation());

    swap.append(chev, menu);
    subEl = document.createElement('span');
    subEl.textContent = subtitle;
    head.append(name, swap, subEl);
    panel.insertBefore(head, panel.firstChild);
  }
  const setSubtitle = (t) => { if (subEl) subEl.textContent = t || ''; };
  const defaultW = Math.round(panel.getBoundingClientRect().width) || 270;
  const cap = () => Math.min(max, Math.max(min, window.innerWidth - 40));
  const clamp = (w) => Math.max(min, Math.min(cap(), Math.round(w)));

  const grip = document.createElement('div');
  grip.className = 'dev-panel-grip';
  grip.title = 'drag to resize · double-click to reset';
  document.body.appendChild(grip);

  function setWidth(w, remember = true) {
    panel.style.width = clamp(w) + 'px';
    if (remember) { try { localStorage.setItem(storeKey(key), String(clamp(w))); } catch (e) { /* private mode */ } }
    placeGrip();
  }
  // the grip lives on <body> (not inside the panel) so it can't scroll away
  // with the panel's content; it just tracks the panel's box every frame it
  // changes size
  function placeGrip() {
    const r = panel.getBoundingClientRect();
    grip.style.left = (edge === 'right' ? r.right - 5 : r.left - 5) + 'px';
    grip.style.top = r.top + 'px';
    grip.style.height = r.height + 'px';
  }

  let saved = null;
  try { saved = localStorage.getItem(storeKey(key)); } catch (e) { /* private mode */ }
  if (saved) panel.style.width = clamp(+saved) + 'px';
  placeGrip();

  const ro = new ResizeObserver(placeGrip);
  ro.observe(panel);
  window.addEventListener('resize', placeGrip);
  window.addEventListener('scroll', placeGrip, true);

  // ---- drag ----
  // Every pointer event here is swallowed: the workbenches all sit under an
  // OrbitControls listening on window/canvas, and a resize drag must never
  // also spin the camera.
  let dragging = false;
  const onDown = (ev) => {
    if (ev.button !== 0) return;
    dragging = true;
    grip.classList.add('dragging');
    grip.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
    ev.stopPropagation();
  };
  const onMove = (ev) => {
    if (!dragging) return;
    const r = panel.getBoundingClientRect();
    setWidth(edge === 'right' ? ev.clientX - r.left + 5 : r.right - ev.clientX + 5);
    ev.preventDefault();
    ev.stopPropagation();
  };
  const onUp = (ev) => {
    if (!dragging) return;
    dragging = false;
    grip.classList.remove('dragging');
    grip.releasePointerCapture?.(ev.pointerId);
    ev.preventDefault();
    ev.stopPropagation();
  };
  grip.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  grip.addEventListener('dblclick', (ev) => { ev.preventDefault(); setWidth(defaultW); });
  // a wheel over the grip would otherwise dolly the camera behind it
  grip.addEventListener('wheel', (ev) => ev.stopPropagation());

  const api = {
    setWidth,
    setSubtitle,
    reset: () => setWidth(defaultW),
    destroy() {
      ro.disconnect();
      window.removeEventListener('resize', placeGrip);
      window.removeEventListener('scroll', placeGrip, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      grip.remove();
    },
  };
  (window.__devPanels ||= {})[key] = api;   // scripting / tests
  return api;
}
