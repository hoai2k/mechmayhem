// The screen a player gets when the game cannot run — instead of a black
// rectangle, which is indistinguishable from "this page is broken".
//
// Three callers, all of them things that used to fail silently:
//   · no WebGL 2 at all (old machine, blocklisted driver, hardware
//     acceleration switched off) — thrown by Engine, caught in main.js
//   · the GPU dropped the context mid-session (webglcontextlost) — routine on
//     mobile and when a big VRAM footprint meets a tab switch
//   · anything else that escaped to window.onerror before the title screen
//
// Deliberately dependency-free and inline-styled: it has to work when the
// renderer is dead, and when whatever it is reporting broke the stylesheet.

let shown = false;

/**
 * Replace the page with a readable failure panel. First call wins — a dying
 * WebGL context tends to throw a burst of follow-on errors, and the first one
 * is the informative one.
 *
 * @param {object} o
 * @param {string} o.title  headline, e.g. "GRAPHICS UNAVAILABLE"
 * @param {string} o.body   one or two plain sentences of what to try
 * @param {string} [o.detail]  raw error text, folded away behind a summary
 * @param {boolean} [o.reload=false]  offer a reload button
 */
export function showFatal({ title, body, detail = '', reload = false }) {
  if (shown) return;
  shown = true;
  try { document.getElementById('boot-splash')?.remove(); } catch (e) { /* ok */ }

  const wrap = document.createElement('div');
  wrap.id = 'fatal-overlay';
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
    'background:#05070c;color:#cfe2f2;padding:24px;overflow:auto;' +
    "font-family:'Segoe UI',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;";

  const card = document.createElement('div');
  card.style.cssText = 'max-width:560px;text-align:center;';

  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText =
    'font-size:26px;font-weight:900;font-style:italic;letter-spacing:0.08em;' +
    'color:#ff6b57;text-shadow:0 2px 12px rgba(255,80,60,0.35);margin-bottom:14px;';

  const p = document.createElement('div');
  p.textContent = body;
  p.style.cssText = 'font-size:15px;line-height:1.65;color:#9fbdd4;';

  card.append(h, p);

  if (detail) {
    const det = document.createElement('details');
    det.style.cssText = 'margin-top:22px;text-align:left;';
    const sum = document.createElement('summary');
    sum.textContent = 'Technical details';
    sum.style.cssText = 'cursor:pointer;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5f7f96;';
    const pre = document.createElement('pre');
    pre.textContent = detail;
    pre.style.cssText =
      'margin-top:10px;padding:12px;background:#0b1018;border:1px solid #1b2836;border-radius:6px;' +
      'font-size:11px;line-height:1.5;color:#7c98ae;white-space:pre-wrap;word-break:break-word;max-height:30vh;overflow:auto;';
    det.append(sum, pre);
    card.appendChild(det);
  }

  if (reload) {
    const btn = document.createElement('button');
    btn.textContent = 'RELOAD';
    btn.style.cssText =
      'margin-top:24px;padding:11px 30px;font:inherit;font-weight:800;font-size:14px;letter-spacing:0.14em;' +
      'color:#05070c;background:#5fd0ff;border:0;border-radius:4px;cursor:pointer;';
    btn.addEventListener('click', () => window.location.reload());
    card.appendChild(btn);
  }

  wrap.appendChild(card);
  (document.body || document.documentElement).appendChild(wrap);
}

/** True once a fatal panel is up — callers can stop doing work. */
export function isFatal() { return shown; }

/** Marker for "this browser/GPU cannot give us a WebGL context at all". */
export class WebGLUnavailableError extends Error {
  constructor(cause) {
    super(cause?.message || 'WebGL context creation failed');
    this.name = 'WebGLUnavailableError';
    this.cause = cause;
  }
}

/** The copy for a lost GPU context. */
export function showContextLost() {
  showFatal({
    title: 'GRAPHICS CONTEXT LOST',
    body: 'The graphics driver dropped the game\'s render context. This usually means '
      + 'the GPU was reset or ran out of memory. Reloading will start a fresh session.',
    reload: true,
  });
}

/**
 * Has the game canvas' context died?
 *
 * Worth asking before reporting any error, because the ORDER is not what you
 * would expect: when the GPU drops the context, three's next draw throws
 * synchronously and reaches window.onerror, while `webglcontextlost` is
 * dispatched afterwards. Without this check the player gets a generic "something
 * went wrong" for what is actually a recoverable context loss.
 */
export function contextIsLost() {
  try {
    const c = document.getElementById('game-canvas');
    if (!c) return false;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return !!gl && gl.isContextLost();
  } catch (e) {
    return false;
  }
}

/** The copy for a missing-WebGL failure, shared by the game and the workbench. */
export function showNoWebGL(err) {
  showFatal({
    title: 'GRAPHICS UNAVAILABLE',
    body: 'ROBOTWORLD needs WebGL 2, and this browser could not provide it. '
      + 'Try Chrome, Edge or Firefox, and check that hardware acceleration is '
      + 'enabled in your browser settings.',
    detail: String(err?.message || err || ''),
  });
}
