// Shared chrome for the workbench side panels (?debug=skin, ?debug=models,
// ?debug=pose, ?debug=collider, ?rigedit, the pose sandbox).
//
// Things every one of them wants and none of them had:
//
//  · A TITLE, IN THE TOOL'S OWN COLOUR — five workbenches share one dark
//    panel in one corner, and at a glance (or in a screenshot) they look
//    identical. Each now names itself at the top in a colour that is its
//    own: pose green, skin orange, animation purple, rig blue, hurtbox
//    cyan. The subtitle line carries the live "what am I looking at"
//    (mech id · ALT), so the header answers both questions at once.
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
export const WORKBENCHES = {
  pose: { title: 'Pose Workbench', color: '#4fdc8b' },
  skin: { title: 'Skin Workbench', color: '#f5a33c' },
  models: { title: 'Animation Workbench', color: '#b98cff' },
  rigedit: { title: 'Rig Editor', color: '#4aa8ff' },
  collider: { title: 'Hurtbox Workbench', color: '#7fd8ff' },
};

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
    subEl = document.createElement('span');
    subEl.textContent = subtitle;
    head.append(name, subEl);
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
