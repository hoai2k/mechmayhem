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

/**
 * POST a manifest patch ({ "<mechId>": { … } }) to the dev server.
 * Resolves { ok, written[] } or { ok: false, error, offline? }.
 */
export async function saveManifestPatch(patch) {
  let res;
  try {
    res = await fetch('/__rw/manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (e) {
    return { ok: false, offline: true, error: 'no dev server (fetch failed)' };
  }
  // a static build answers 404/405 for the endpoint — that is "offline", not
  // a bad patch, and the message should say so rather than blaming the data
  if (res.status === 404 || res.status === 405) {
    return { ok: false, offline: true, error: `endpoint not available (HTTP ${res.status})` };
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON error page */ }
  if (!res.ok || !body?.ok) {
    return { ok: false, error: body?.error || `HTTP ${res.status}` };
  }
  return body;
}
