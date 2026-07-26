// "Edit Alternate GLB" — the shared control for the workbenches that operate
// on ONE raw GLB (?debug=skin, ?rigedit).
//
// A mech's manifest entry may carry a complete standalone `alt` sub-entry: a
// second model (aegis, jerry) or the same model wearing a different rig
// (rhino, vulcan, inferno). It is the staging area — how a re-rig gets judged
// against what it replaces before being promoted (MECH_ART_GUIDE §Route A+).
// Until now the workbenches only reached it through a hand-typed `&alt=1`, so
// in practice nobody looked.
//
// The rule the RIG EDITOR adds on top: a mech whose PRIMARY entry has no
// custom rig, but whose ALT does, has exactly one editable build — the alt.
// Rather than refuse to open (the editor used to bail with "no custom rig to
// edit" while a perfectly good rig sat in `alt`), it opens the alt and shows
// the checkbox already ticked and disabled, so the state is visible and
// obviously not a choice.

/**
 * Resolve which build a workbench should open for `id`.
 *   manifest  raw manifest object (fetchRawManifest)
 *   urlAlt    whether ?alt=1 is set
 *   forceRule 'rig' — apply the rig-editor rule above; omit for a plain toggle
 * Returns { hasAlt, useAlt, forced, entry }.
 */
export function altChoice(manifest, id, urlAlt, forceRule) {
  const entry = manifest?.[id] || null;
  const alt = entry?.alt || null;
  const hasAlt = !!alt?.url;
  const forced = forceRule === 'rig' && hasAlt && !entry.rig && !!alt.rig;
  const useAlt = forced || (hasAlt && !!urlAlt);
  return { hasAlt, useAlt, forced, entry: useAlt ? alt : entry };
}

/**
 * The checkbox itself. Returns null when this mech has no alt — callers
 * append the result unconditionally, so "no alt, no control".
 *   onChange(next)  called with the requested state; not called when forced
 */
export function altCheckbox({ hasAlt, useAlt, forced }, onChange) {
  if (!hasAlt) return null;
  const row = document.createElement('label');
  row.style.cssText = `display:flex;gap:6px;align-items:center;margin:0 0 6px;font-size:11px;
    cursor:${forced ? 'default' : 'pointer'};color:${forced ? '#8ba0b8' : '#dfe8f5'}`;
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = useAlt;
  chk.disabled = !!forced;
  chk.onchange = () => onChange(chk.checked);
  row.append(chk, document.createTextNode(' Edit Alternate GLB'));
  row.title = forced
    ? 'This mech\'s custom rig lives on its ALTERNATE entry — the primary GLB has '
      + 'no rig to edit, so the alternate is the only editable build and this cannot be turned off.'
    : 'Load the manifest\'s `alt` entry instead of the primary — the staging '
      + 'copy a re-rig or a second model is judged in before being promoted.';
  if (forced) {
    const note = document.createElement('span');
    note.style.cssText = 'color:#e0a13c;font-size:10px';
    note.textContent = '(only build with a rig)';
    row.appendChild(note);
  }
  return row;
}

/** Set/clear ?alt=1 and reload — both workbenches build one model at load. */
export function reloadWithVariant(next) {
  const u = new URL(location.href);
  if (next) u.searchParams.set('alt', '1'); else u.searchParams.delete('alt');
  location.href = u.toString();
}

// back-compat alias (the tools called this reloadWithAlt before the workbench
// split; both names work while the old ?rigedit= URLs still redirect here)
export const reloadWithAlt = reloadWithVariant;
