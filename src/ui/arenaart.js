// ============================================================================
// arenaart.js — which painting of an arena to show BIG.
//
// public/arenas/<id>.jpg are the arena-select CARDS: 512x288, which is all a
// card needs and all that was ever delivered. The arena-select backdrop and the
// VS loading card blow the painting up to the whole screen, where a 512 image
// is soft — so a full-size copy may be dropped in beside it at
// public/arenas/full/<id>.jpg (16:9, 2560x1440 or larger, JPG ~85) and LISTED
// here, and the big views use it. Declared rather than probed, for the reason
// the badge list is (ui/icons.js BADGES): a probe is a 404 in the console for
// every arena without one. An arena not listed simply shows its card, scaled.
// ============================================================================
export const ARENA_FULL = new Set([]);

export function arenaArtUrl(id) {
  return new URL(ARENA_FULL.has(id) ? `arenas/full/${id}.jpg` : `arenas/${id}.jpg`, document.baseURI).href;
}
