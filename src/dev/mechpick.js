// "Which mech am I on?" — the dropdown every workbench needs, in one place.
//
// The tools split into two shapes and both are served here:
//
//  · the ones that can rebuild in place (?debug=pose, ?debug=skin,
//    ?debug=models, ?debug=collider) hand `onPick` a loader and keep the page
//    alive, patching the URL as they go;
//  · the RIG EDITOR builds its whole world — raw GLB, hand-authored skeleton,
//    re-skin, undo stack — around one id at start-up, so switching mech there
//    is a navigation: `gotoMech` rewrites the URL and reloads.
//
// Either way the URL always names the mech on screen, so a reload, a
// screenshot or a pasted link lands back on the same thing.
import { ROSTER } from '../mechs/roster.js';

const SEL_CSS = `width:100%;background:#0e131b;color:#dfe8f5;border:1px solid #2c3648;
  padding:4px;border-radius:4px;font:12px system-ui,sans-serif`;

/**
 * A <select> over the roster.
 *   ids     — ids to offer (default: the whole ROSTER, workbenches see hidden
 *             mechs too — that is the point of a workbench)
 *   value   — currently selected id
 *   label   — (id, def) => option text; default is the mech's display name
 *   note    — (id, def) => extra muted text appended to the label, or ''
 *   css     — style override for the element
 *   onPick  — (id) => void
 */
export function mechSelect({ ids, value, label, note, css = SEL_CSS, onPick } = {}) {
  const sel = document.createElement('select');
  sel.style.cssText = css;
  const list = ids || ROSTER.map((r) => r.id);
  const byId = Object.fromEntries(ROSTER.map((r) => [r.id, r]));
  for (const id of list) {
    const def = byId[id] || null;
    const o = document.createElement('option');
    o.value = id;
    o.textContent = (label ? label(id, def) : (def?.name || id)) + (note ? note(id, def) : '');
    sel.appendChild(o);
  }
  if (value) sel.value = value;
  sel.onchange = () => onPick?.(sel.value);
  return sel;
}

/**
 * Navigate a load-time-only workbench to another mech: set `param` to `id`,
 * drop the params that were about the OLD mech (`alt` is per-mech staging —
 * carrying it over would silently open a different build than the one asked
 * for), and reload.
 */
export function gotoMech(param, id, drop = ['alt']) {
  const u = new URL(location.href);
  u.searchParams.set(param, id);
  for (const d of drop) u.searchParams.delete(d);
  location.href = u.toString();
}
