// "Save" for the authoring workbenches — write straight to the repo file
// instead of downloading a patch and pasting it in by hand.
//
// The browser cannot touch the repo, but the Vite dev server on the other end
// of the socket is running in it, so it does the write (see the manifestWriter
// plugin in vite.config.js). This module is the client half: one POST, and a
// clear answer when there is nobody home — a built/deployed page has no dev
// server, and there Export is still the only route.
//
// What "saved" means, exactly: the file on THIS machine now holds the change,
// which is what the game and every workbench read on the next reload. It is
// not published — committing is still what carries it to the deployed build
// and to anyone else.

async function post(url, payload) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, offline: true, error: 'no dev server (fetch failed)' };
  }
  // a static build answers 404/405 for the endpoint — that is "offline", not
  // a bad payload, and the message should say so rather than blaming the data
  if (res.status === 404 || res.status === 405) {
    return { ok: false, offline: true, error: `endpoint not available (HTTP ${res.status})` };
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON error page */ }
  if (!res.ok || !body?.ok) return { ok: false, error: body?.error || `HTTP ${res.status}` };
  return body;
}

/**
 * POST a manifest patch ({ "<mechId>": { … } }) to the dev server.
 * Resolves { ok, written[] } or { ok: false, error, offline? }.
 */
export async function saveManifestPatch(patch) {
  return post('/__rw/manifest', patch);
}

/**
 * Write a rig's bone list into src/mechs/rigs/<id>.rig.js. Only the bone array
 * is replaced — the file's header and re-skin flags survive (tools/rigfmt.mjs).
 */
export async function saveRigBones(id, bones) {
  return post('/__rw/rig', { id, bones });
}

/**
 * What is saved locally but not committed. `stat` is the cheap form the Export
 * button polls to know whether it has anything to hand over.
 */
export async function getChanges({ stat = false } = {}) {
  try {
    const res = await fetch('/__rw/changes' + (stat ? '?stat=1' : ''));
    if (res.status === 404 || res.status === 405) return { ok: false, offline: true };
    const body = await res.json();
    return body?.ok ? body : { ok: false, error: body?.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, offline: true };
  }
}

/**
 * Wire an "Export uncommitted saves" button: it enables itself only when the
 * working tree actually has something, and on click downloads the whole batch
 * as ONE git patch (plus copies it to the clipboard) — the thing to hand to
 * whoever commits. Returns { refresh } so a tool can re-check after a save.
 */
export function wireExportChanges(btn, { setStatus = () => {} } = {}) {
  const label = btn.textContent;
  const setEnabled = (n) => {
    btn.disabled = !n;
    btn.style.opacity = n ? '1' : '0.45';
    btn.style.cursor = n ? 'pointer' : 'default';
    btn.textContent = n ? `${label} (${n})` : label;
  };
  setEnabled(0);
  const refresh = async () => {
    const r = await getChanges({ stat: true });
    setEnabled(r.ok ? r.count : 0);
    return r;
  };
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const r = await getChanges();
    if (!r.ok) {
      setStatus(r.offline ? 'No dev server — run `npm run dev` to export uncommitted saves.'
        : `Export failed: ${r.error}`);
      return;
    }
    if (!r.files.length) { setEnabled(0); setStatus('Nothing uncommitted — everything is already committed.'); return; }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const header = `# robotworld uncommitted saves\n# branch ${r.branch} @ ${r.head}\n`
      + r.files.map((f) => `#   ${f.status.padEnd(2)} ${f.path}`).join('\n') + '\n\n';
    const text = header + r.patch;
    navigator.clipboard?.writeText(text).catch(() => {});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `robotworld-uncommitted-${stamp}.patch`;
    a.click();
    setStatus(`Exported ${r.files.length} changed file(s) as one patch (downloaded + copied).` +
      `\n${r.files.map((f) => f.path).join('\n')}`);
  });
  refresh();
  return { refresh };
}

