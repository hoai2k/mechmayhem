// "Which subject am I on?" — the dropdown every workbench needs, in one place.
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
// Either way the URL always names the subject on screen, so a reload, a
// screenshot or a pasted link lands back on the same thing.
//
// The list itself comes from the CONFIG (config.catalogue.list()), so this
// file knows nothing about mechs — a port's characters flow through unchanged.

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
export function subjectSelect({ config, ids, value, label, note, css = SEL_CSS, onPick } = {}) {
  const sel = document.createElement('select');
  sel.style.cssText = css;
  const entries = config?.catalogue.list() || [];
  const list = ids || entries.map((r) => r.id);
  const byId = Object.fromEntries(entries.map((r) => [r.id, r]));

  // ORDER: alphabetical, with the work-in-progress subjects below a rule at
  // the end. The catalogue hands these over in the game's own roster order,
  // which is a design order — fine for a line-up, useless for finding "jerry"
  // in a list of seventeen. Hidden mechs stay reachable (a workbench exists to
  // work on the unfinished ones) but stop sitting between two shipped mechs.
  const rows = list.map((id) => {
    const def = byId[id] || null;
    return {
      id,
      def,
      hidden: !!def?.hidden,
      text: (label ? label(id, def) : (def?.name || id)) + (note ? note(id, def) : ''),
    };
  });
  const byText = (a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
  const shown = rows.filter((r) => !r.hidden).sort(byText);
  const wip = rows.filter((r) => r.hidden).sort(byText);

  const addOption = (r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.text;
    sel.appendChild(o);
  };
  shown.forEach(addOption);
  if (wip.length) {
    // A disabled option, not <hr>: native <hr> inside <select> is Chromium-only
    // and this has to read the same everywhere.
    const rule = document.createElement('option');
    rule.disabled = true;
    rule.textContent = '──────────';
    sel.appendChild(rule);
    wip.forEach(addOption);
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
export function gotoSubject(id, drop = ['alt', 'variant']) {
  const u = new URL(location.href);
  u.searchParams.set('mech', id);
  for (const d of drop) u.searchParams.delete(d);
  location.href = u.toString();
}

// back-compat aliases while both URL schemes are alive
export const mechSelect = subjectSelect;
export const gotoMech = (_param, id, drop) => gotoSubject(id, drop);
