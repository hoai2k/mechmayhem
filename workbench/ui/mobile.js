// MOBILE CHROME for the workbenches — the same tools, on a phone.
//
// A workbench on a desktop is a 3D view with a tall panel of dials pinned to
// one corner. On a 390px screen that panel IS the screen: the mech is a strip
// beside it, and the one thing you came to look at is the thing there is no
// room for. So on a small touch screen the layout inverts:
//
//   · THE VIEWPORT IS THE PAGE. Nothing overlays the model but a slim bar.
//   · THAT BAR carries only what you change constantly — the SUBJECT
//     (which mech) plus the ONE control that tool is about (the action to
//     trigger, the speed to run at) — and a ⚙ button.
//   · ⚙ RAISES THE WHOLE PANEL as a bottom sheet: every control the desktop
//     tool has, unchanged, scrollable, dismissed with Done / the scrim / Esc.
//     Nothing is removed on mobile; it is only out of the way until asked for.
//   · CAMERA GESTURES are the standard OrbitControls ones — one finger
//     rotates, two fingers pan and pinch-zoom — which is what they already
//     were; this module just makes sure pan/zoom are enabled and that the
//     page itself can't scroll or rubber-band under the drag.
//
// DESKTOP IS UNTOUCHED. `isMobileLayout()` has to say yes first, and it wants
// BOTH a coarse pointer and a small viewport, so a touchscreen laptop and a
// narrow desktop window both keep the normal panel. `?mobile=1` forces the
// layout on for testing from a desktop browser, `?mobile=0` forces it off.
//
// Usage (after the tool has built its panel and called setupDevPanel):
//   const mob = setupMobileChrome(panel, {
//     primary: [mechSel],            // row 1, left of the ⚙
//     secondary: [speedField],       // row 2 (optional)
//     orbit,                         // the tool's OrbitControls
//   });
//   if (mob.active) { /* tool-specific tweaks */ }

const STYLE_ID = 'rw-wb-mobile-style';
// Widest viewport still treated as a phone/small tablet. Deliberately generous:
// the gate is `coarse pointer AND this`, so a desktop window dragged narrow
// never trips it.
const MOBILE_MAX_W = 860;

let _override = null;

/**
 * Is this a small touch screen — i.e. should a workbench invert its layout?
 * `?mobile=1` / `?mobile=0` override (the second also spelled `?desktop`).
 */
export function isMobileLayout() {
  if (_override === null) {
    const p = new URLSearchParams(location.search);
    const forced = p.get('mobile');
    if (forced === '1' || p.has('phone')) _override = true;
    else if (forced === '0' || p.has('desktop')) _override = false;
    else {
      const coarse = !!(window.matchMedia?.('(pointer: coarse)').matches
        && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window));
      _override = coarse && window.innerWidth <= MOBILE_MAX_W;
    }
  }
  return _override;
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    body.rw-wb-mobile { overflow: hidden; overscroll-behavior: none; }
    /* the resize grip is a mouse affordance and the panel is full-width here */
    body.rw-wb-mobile .dev-panel-grip { display: none !important; }

    /* THE PANEL BECOMES A SHEET. Every declaration the tools set inline
       (left/top/width/max-height) has to be beaten, hence !important. */
    body.rw-wb-mobile .dev-panel {
      position: fixed !important;
      left: 0 !important; right: 0 !important;
      top: auto !important; bottom: 0 !important;
      width: auto !important; max-width: none !important;
      max-height: min(74vh, 74dvh) !important;
      border-radius: 14px 14px 0 0 !important;
      border-bottom: 0 !important;
      padding: 10px 12px calc(14px + env(safe-area-inset-bottom, 0px)) !important;
      z-index: 210 !important;
      overscroll-behavior: contain;
      box-shadow: 0 -14px 40px rgba(0,0,0,0.6);
      transform: translateY(103%);
      transition: transform 0.22s ease;
      pointer-events: none;
      visibility: hidden;
    }
    body.rw-wb-mobile.rw-wb-sheet .dev-panel {
      transform: none; pointer-events: auto; visibility: visible;
    }
    @media (prefers-reduced-motion: reduce) {
      body.rw-wb-mobile .dev-panel { transition: none; }
    }
    /* touch targets inside the sheet: the desktop sizes are ~11px rows */
    body.rw-wb-mobile .dev-panel button,
    body.rw-wb-mobile .dev-panel select,
    body.rw-wb-mobile .dev-panel input[type=text],
    body.rw-wb-mobile .dev-panel input[type=number] { min-height: 30px; }
    body.rw-wb-mobile .dev-panel input[type=range] { height: 28px; }
    body.rw-wb-mobile .dev-panel input[type=checkbox] { width: 18px; height: 18px; }

    .rw-wb-scrim {
      position: fixed; inset: 0; z-index: 205; background: rgba(4,7,12,0.5);
      opacity: 0; pointer-events: none; transition: opacity 0.22s ease;
    }
    body.rw-wb-sheet .rw-wb-scrim { opacity: 1; pointer-events: auto; }

    .rw-wb-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 200;
      display: flex; flex-direction: column; gap: 6px;
      padding: calc(6px + env(safe-area-inset-top, 0px)) 8px 7px;
      background: rgba(13,19,27,0.94); border-bottom: 1px solid #2a3646;
      font: 13px/1.2 system-ui, sans-serif; color: #dbe6f5;
      -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px);
    }
    .rw-wb-bar-row { display: flex; gap: 7px; align-items: center; }
    .rw-wb-bar-row > * { min-width: 0; }
    .rw-wb-bar select {
      flex: 1 1 0; width: auto !important; margin: 0 !important; min-height: 34px;
      background: #0f151d; color: #dbe6f5; border: 1px solid #2f3c4e;
      border-radius: 7px; padding: 6px 7px; font: 13px system-ui, sans-serif;
    }
    .rw-wb-bar input[type=range] {
      flex: 1 1 0; width: auto !important; margin: 0 !important; height: 30px;
      accent-color: #ff9f43;
    }
    .rw-wb-field {
      display: flex; align-items: center; gap: 8px; flex: 1 1 0; min-width: 0;
    }
    .rw-wb-field > .rw-wb-field-name {
      flex: none; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: #8ba0b8;
    }
    .rw-wb-field > .rw-wb-field-val {
      flex: none; min-width: 3.2em; text-align: right;
      font: 12px ui-monospace, monospace; color: #dbe6f5;
    }
    .rw-wb-gear {
      flex: none; width: 42px; height: 34px; border-radius: 8px; cursor: pointer;
      background: #1a2433; color: #cfe0f5; border: 1px solid #2f3c4e; font-size: 16px;
    }
    .rw-wb-gear:active { background: #24344a; }
    .rw-wb-done {
      position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px;
      margin: -10px -12px 6px; padding: 8px 12px;
      background: inherit; border-bottom: 1px solid #26303f;
    }
    .rw-wb-done b { font: 600 12px system-ui, sans-serif; color: #9fb2c8;
      letter-spacing: .06em; text-transform: uppercase; }
    /* the sheet grabber — a sticky element is its own containing block, so this
       centres on the row whatever else is in it */
    .rw-wb-grab {
      position: absolute; left: 50%; top: 10px; transform: translateX(-50%);
      width: 38px; height: 4px; border-radius: 3px; background: #3a4a60;
    }
    .rw-wb-done button {
      margin-left: auto; padding: 6px 14px; border-radius: 7px; cursor: pointer;
      background: #1f7a4d; color: #fff; border: 1px solid #2c3648; font: 12px system-ui, sans-serif;
    }
  `;
  document.head.appendChild(s);
}

/**
 * A labelled control for the bar: `<name> [control] <value>`.
 * Returns the wrapper; the tool keeps the control and the value span.
 */
export function barField(name, control, { value = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'rw-wb-field';
  const n = document.createElement('span');
  n.className = 'rw-wb-field-name';
  n.textContent = name;
  wrap.append(n, control);
  if (value !== null) {
    const v = document.createElement('span');
    v.className = 'rw-wb-field-val';
    v.textContent = value;
    wrap.appendChild(v);
    wrap._value = v;
  }
  return wrap;
}

/**
 * Invert a workbench's layout for a small touch screen. A no-op (returning
 * `{ active: false }`) on anything else, so a tool can call it unconditionally.
 *
 *   panel      — the tool's side panel, already built and in the DOM
 *   primary    — elements for the bar's first row (the subject picker); they
 *                are MOVED out of the panel, so state stays shared
 *   secondary  — elements for a second bar row (the tool's one live control)
 *   orbit      — the tool's OrbitControls, so pan/zoom are known to be on
 *   title      — what the sheet header calls itself
 *   onOpen / onClose — optional hooks (e.g. re-fit the camera)
 *
 * Returns { active, bar, sheetOpen(), open(), close(), toggle(), destroy() }.
 */
export function setupMobileChrome(panel, {
  primary = [], secondary = [], orbit = null, title = 'Settings',
  onOpen = null, onClose = null,
} = {}) {
  if (!isMobileLayout()) return { active: false, open() {}, close() {}, toggle() {}, destroy() {} };
  installStyle();
  document.body.classList.add('rw-wb-mobile');

  // ---- camera gestures ----
  // One finger rotates, two fingers pan + pinch-zoom: OrbitControls' own
  // defaults. Asserted rather than assumed, since a tool is free to have
  // switched panning off for its own reasons on desktop.
  if (orbit) {
    orbit.enablePan = true;
    orbit.enableZoom = true;
    orbit.enableRotate = true;
    // a little inertia reads better under a finger than a hard stop
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.12;
  }

  // ---- the bar ----
  const bar = document.createElement('div');
  bar.className = 'rw-wb-bar';
  const row1 = document.createElement('div');
  row1.className = 'rw-wb-bar-row';
  bar.appendChild(row1);
  for (const e of primary.filter(Boolean)) row1.appendChild(e);   // appendChild MOVES it
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'rw-wb-gear';
  gear.textContent = '⚙';
  gear.title = 'all controls';
  gear.setAttribute('aria-label', 'settings');
  row1.appendChild(gear);
  if (secondary.filter(Boolean).length) {
    const row2 = document.createElement('div');
    row2.className = 'rw-wb-bar-row';
    for (const e of secondary.filter(Boolean)) row2.appendChild(e);
    bar.appendChild(row2);
  }
  document.body.appendChild(bar);

  // ---- the sheet ----
  const scrim = document.createElement('div');
  scrim.className = 'rw-wb-scrim';
  document.body.appendChild(scrim);

  const done = document.createElement('div');
  done.className = 'rw-wb-done';
  const grab = document.createElement('i');
  grab.className = 'rw-wb-grab';
  done.appendChild(grab);
  // The panel usually names itself already (setupDevPanel's coloured title bar,
  // which also carries the workbench switcher). Only title this row when there
  // is no such header to repeat.
  if (!panel.querySelector('.dev-panel-head')) {
    const dTitle = document.createElement('b');
    dTitle.textContent = title;
    done.appendChild(dTitle);
  }
  const dBtn = document.createElement('button');
  dBtn.type = 'button';
  dBtn.textContent = 'Done';
  done.appendChild(dBtn);
  panel.insertBefore(done, panel.firstChild);

  const isOpen = () => document.body.classList.contains('rw-wb-sheet');
  const open = () => {
    if (isOpen()) return;
    document.body.classList.add('rw-wb-sheet');
    gear.setAttribute('aria-expanded', 'true');
    onOpen?.();
  };
  const close = () => {
    if (!isOpen()) return;
    document.body.classList.remove('rw-wb-sheet');
    gear.setAttribute('aria-expanded', 'false');
    onClose?.();
  };
  const toggle = () => (isOpen() ? close() : open());
  gear.onclick = toggle;
  dBtn.onclick = close;
  scrim.onclick = close;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);

  return {
    active: true,
    bar,
    gear,
    sheetOpen: isOpen,
    open,
    close,
    toggle,
    /** height the bar occupies, for anything that wants to keep clear of it */
    barHeight: () => bar.getBoundingClientRect().height,
    destroy() {
      window.removeEventListener('keydown', onKey);
      bar.remove(); scrim.remove(); done.remove();
      document.body.classList.remove('rw-wb-mobile', 'rw-wb-sheet');
    },
  };
}
