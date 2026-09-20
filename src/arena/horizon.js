// THE FOG IS THE COLOUR OF WHAT IS BEHIND IT.
//
// Distance fog lerps every fragment toward one flat colour, and at the fog
// wall a building IS that colour — so the only colour that makes a fogged
// tower dissolve into the distance is the colour of the backdrop standing
// behind the wall. The themes authored their fog by hand (a beige for the
// desert, a slate for the harbour) and the backdrops were painted later, so
// the two disagreed: RUINS put a grey-beige wall of fog in front of a
// horizon strip that is orange sand, and the eye read three bands —
// sandstone towers, then white haze, then sand again — instead of one city
// fading into its own distance.
//
// So the colour is MEASURED off the backdrop rather than authored. What
// stands behind the fog wall at eye level is, in order of what exists:
//   1. the HORIZON STRIP (src/textures/sky/horizon_<id>/) — a painted
//      scenery ring, unlit and unfogged, whose opaque bottom band is the
//      ground haze the strip was painted with;
//   2. else the SKY PANORAMA's own horizon row;
//   3. else the gradient dome's colour at the horizon, from the theme.
// The image is sampled once it has arrived (the loader is asynchronous and
// the texture object exists before its pixels do), averaged over the band
// that actually shows behind the wall, and handed back as a linear-space
// colour to be the fog. The theme's authored fog colour is the value until
// then and the fallback forever if the image never lands.
import * as THREE from 'three';

// the strip's bottom band: 0 is the strip's lowest row. The ring's alpha ramp
// (arena.js) is opaque up to 55% of its height, and the scenery line sits in
// the lower third of every strip, so the haze that shows between the fog
// wall and the mountains is these rows.
const STRIP_BAND = [0.04, 0.34];
// the panorama's rows just above the horizon (equirect v = 0.5 is level)
const PANO_BAND = [0.50, 0.535];

/** The gradient dome's colour at the horizon (makeSkyDome's own formula at
 *  vDir.y = 0: h = 0.18, mix(bottom, top, pow(h, 0.8))). */
export function horizonGradientColor(theme) {
  return new THREE.Color(theme.sky.bottom).lerp(new THREE.Color(theme.sky.top), Math.pow(0.18, 0.8));
}

// Average the opaque pixels of an image over a vertical band [v0, v1] of its
// height measured from the BOTTOM. Returns a linear THREE.Color, or null when
// nothing in the band is opaque. Averaged in sRGB, which is what the eye
// blends, then converted.
function bandAverage(img, band) {
  const w = Math.min(img.width, 512);      // no need for every column
  const h = img.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const y1 = Math.round(h * (1 - band[0])), y0 = Math.round(h * (1 - band[1]));
  const rows = Math.max(1, y1 - y0);
  const data = ctx.getImageData(0, y0, w, rows).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (!n) return null;
  return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

/**
 * Measure the backdrop colour behind the fog wall. `strip` / `pano` are the
 * THREE textures the arena built its skyline from (either may be null);
 * `onColor(color)` is called once, with a linear colour, when a measurement
 * lands. Returns a cancel function — the arena calls it on dispose so a
 * sample arriving for a stage that has been torn down writes nowhere.
 */
export function measureHorizonColor({ strip = null, pano = null }, onColor) {
  const src = strip ? { tex: strip, band: STRIP_BAND } : pano ? { tex: pano, band: PANO_BAND } : null;
  if (!src) return () => {};
  let live = true;
  const ready = (img) => !!img && (img.complete === undefined || img.complete) && img.width > 0;
  const tick = () => {
    if (!live) return;
    const img = src.tex.image;
    if (!ready(img)) { setTimeout(tick, 120); return; }
    let c = null;
    try { c = bandAverage(img, src.band); } catch (e) { /* tainted / unreadable: keep the authored colour */ }
    if (c && live) onColor(c);
    live = false;
  };
  tick();
  return () => { live = false; };
}
