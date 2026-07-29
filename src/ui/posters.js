// ============================================================================
// posters.js — the pre-rendered robot images the mech-select screen flips
// through, and the contract that keeps them interchangeable with the models.
//
// WHY. Building a mech is not free: a GLB parse, a skinned-mesh upload and a
// hurtbox measurement all land on the main thread. Doing that on every press
// of LEFT is the jank in the select screen. So flipping shows a PICTURE, and
// the real body is only built once the player has settled on a choice
// (SETTLE_MS) or locked it in. A mech already built stays built — the image
// is never shown for it again.
//
// THE CORRELATION. A poster is not "an image of a robot", it is an image of a
// KNOWN SCREEN RECT. tools/posters.mjs renders each mech through the select
// stage's OWN camera (menustage.aimPreviewCamera, shared by both so they
// cannot drift), on the stage's own preview mark, and records the NDC rect the
// body lands in. The runtime lays the PNG over exactly that rect. Because the
// stage applies its framing offset in NDC, that rect is the same at every
// window aspect — one reference render covers all of them.
//
// NDC, not a world-space billboard: a flat quad cannot reproduce what a
// perspective camera does to a body with DEPTH. Measured, cranky's claws
// project 25% wider than a plane through his middle, so a billboard handover
// jumped by 113px. Through-the-camera rendering has the perspective already
// baked into the picture.
//
// The model then starts at the same yaw (POSTER_YAW) with its sway phase
// reset, so the handover is a recolour and nothing else.
//
// Regenerate after any change to a mech's model, rig, rest pose or scale:
//     node tools/posters.mjs
// ============================================================================

// The yaw every poster is rendered at, and the yaw the live model starts its
// idle sway from. Matches the sway's own centre (menustage: the sine term is
// zero at phase 0), so the model appears at the poster's angle and drifts off
// from there rather than snapping.
export const POSTER_YAW = 0.15;
// Margin around the measured body box, so glow and antialiasing never clip.
export const POSTER_PAD = 1.12;
// Reference render height in pixels, and the aspect it is rendered at. Big
// enough for a large stage without being a download worth worrying about.
export const POSTER_PX = 900;
export const POSTER_ASPECT = 16 / 9;
// The engine camera's vertical fov (core/engine.js). The generator builds its
// camera from this, so a change there is a regenerate, not a silent misfit.
export const POSTER_FOV = 46;
// How long a choice must sit still before its real model is built.
export const SETTLE_MS = 700;

// Where the generator writes, relative to the site root.
export const POSTER_DIR = 'posters';
export const POSTER_INDEX = `${POSTER_DIR}/posters.json`;

let indexPromise = null;
let index = null;

/** The generated index ({ id: {centerX, centerY, span, yaw} }), or {} if the
 *  posters were never generated — every caller degrades to "no poster". */
export function loadPosterIndex() {
  if (!indexPromise) {
    indexPromise = fetch(new URL(POSTER_INDEX, document.baseURI))
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((j) => { index = j && j.mechs ? j.mechs : {}; return index; });
  }
  return indexPromise;
}

/** Synchronous lookup — null until loadPosterIndex() has resolved. */
export function posterMeta(id) { return (index && index[id]) || null; }

export function posterUrl(id) {
  return new URL(`${POSTER_DIR}/${id}.png`, document.baseURI).href;
}
