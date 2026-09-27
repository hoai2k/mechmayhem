// ============================================================================
// cards.js — the painted HERO CARDS (docs/image-requests.md): one full-bleed
// 4:5 portrait per mech, the fighter in a battle pose in the world it came
// from. The title screen's film strip wears one where it exists and falls
// back to the mech's poster on a glow wash where it does not, so the cards
// land one mech at a time with nothing else to change.
//
// WHICH MECHS HAVE ONE IS DECLARED, NOT PROBED. `public/cards/index.json` is
// the list, written by `node tools/cards.mjs` when it sizes a delivered
// painting down for the web. Probing seventeen URLs instead would put a 404
// in the console for every card not painted yet — the same reason the badge
// list exists (icons.js BADGES).
// ============================================================================

const DIR = 'cards';
let indexPromise = null;
let have = new Set();

/** Resolves once the index is in (an absent or broken index = no cards). */
export function loadCardIndex() {
  if (!indexPromise) {
    indexPromise = fetch(new URL(`${DIR}/index.json`, document.baseURI))
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((j) => { have = new Set(Array.isArray(j) ? j : j?.cards || []); return have; });
  }
  return indexPromise;
}

/** Synchronous: false until loadCardIndex() has resolved. */
export function hasCard(id) { return have.has(id); }

export function cardUrl(id) { return new URL(`${DIR}/${id}.jpg`, document.baseURI).href; }
