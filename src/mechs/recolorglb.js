// GLB recoloring for alternate paint schemes (colorscheme.js).
//
// Procedural mechs recolor cleanly: the scheme rewrites skin.primary.base/base2
// and pbrtex synthesizes fresh maps from those colors. GLB mechs can't — their
// albedo/emissive are baked textures shipped in the .glb. So a "blue Inferno"
// used to arrive still fire-red (only the core light shifted). This module
// repaints a GLB's baked materials to match a scheme, the same way the
// procedural path repaints only the PRIMARY armor:
//
//   • Albedo: pixels that read as painted primary armor (saturated, not near
//     black/white, and hued near the stock primary) are pushed to the scheme
//     hue while keeping their luminance — so weathering/panel detail survives.
//     Bare metal (low saturation), deep shadow gaps, decals and differently
//     hued accents are left alone, exactly like the procedural repaint leaves
//     metal/accent/glow untouched. MIDNIGHT darkens the paint instead.
//   • Emissive: for hue schemes the glowing vents are re-hued to the scheme
//     glow so the team color reads at range; MIDNIGHT just dims them.
//
// Materials/textures are cloned per build (the loader shares the cached gltf
// scene across clones); recolored textures are cached by source-uuid+variant so
// a second fighter on the same mech+scheme reuses the pixel work.
import * as THREE from 'three';

const D2 = (h) => ((h % 1) + 1) % 1;
function smoothstep(e0, e1, x) {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
// circular hue distance in [0, 0.5]
function hueDist(a, b) {
  const d = Math.abs(D2(a) - D2(b));
  return d > 0.5 ? 1 - d : d;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  h = D2(h);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return [f(0), f(8), f(4)];
}

// How strongly a painted pixel belongs to the primary armor (0 = leave it: bare
// metal / shadow / highlight / off-hue accent; 1 = full repaint).
function paintWeight(h, s, l, spec) {
  const satW = smoothstep(0.10, 0.28, s);
  if (satW <= 0) return 0;
  const lightW = smoothstep(0.04, 0.11, l) * (1 - smoothstep(0.90, 0.99, l));
  if (lightW <= 0) return 0;
  // vivid primaries: only the stock-primary hue family repaints (keeps two-tone
  // accents/decals). grey/tan primaries: repaint any saturated paint (their hue
  // is noise and there's no vivid primary to tell apart from accents).
  const hueW = spec.anyHue ? 1 : 1 - smoothstep(0.09, 0.20, hueDist(h, spec.stockHue));
  return satW * lightW * hueW;
}

// Recolor one albedo pixel [r,g,b] (sRGB 0-255) → [r,g,b].
function recolorAlbedo(r, g, b, spec) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const w = paintWeight(h, s, l, spec);
  if (w <= 0) return [r, g, b];
  let tr, tg, tb;
  if (spec.dark) {
    // MIDNIGHT blackout: keep hue, kill saturation + drop value
    [tr, tg, tb] = hslToRgb(h, s * 0.45, Math.max(0.05, l * 0.4));
  } else {
    // satMul/lumMul are what let a scheme be earthier or paler than a pure hue
    // swap (UMBER is a desaturated, darkened orange; BLOSSOM a pale pink) —
    // same math the procedural path's forceHue() runs.
    [tr, tg, tb] = hslToRgb(spec.hue,
      Math.min(1, Math.max(s, spec.minS) * (spec.satMul ?? 1)),
      Math.min(0.96, l * (spec.lumMul ?? 1)));
  }
  // lerp original -> target by paint weight (blends smoothly at metal borders)
  return [r + (tr - r) * w, g + (tg - g) * w, b + (tb - b) * w];
}

// Recolor one emissive pixel toward the scheme glow (hue schemes only).
function recolorEmissive(r, g, b, spec) {
  const v = Math.max(r, g, b) / 255;
  const gate = smoothstep(0.03, 0.12, v); // faint / black stays put
  if (gate <= 0) return [r, g, b];
  const [h, s, l] = rgbToHsl(r, g, b);
  const [tr, tg, tb] = hslToRgb(spec.glowHue, Math.max(s, 0.75), l);
  return [r + (tr - r) * gate, g + (tg - g) * gate, b + (tb - b) * gate];
}

const _texCache = new Map(); // `${srcTex.uuid}|${variant}|${kind}` -> THREE.Texture

// Build a recolored copy of a texture by running `fn(r,g,b)->[r,g,b]` over its
// pixels on a canvas, preserving all sampler params. Cached per source+variant.
function recolorTexture(srcTex, spec, kind, fn) {
  const key = `${srcTex.uuid}|${spec.variant}|${kind}`;
  const hit = _texCache.get(key);
  if (hit) return hit;
  const img = srcTex.image;
  const w = img?.width | 0, h = img?.height | 0;
  if (!w || !h) return srcTex; // nothing to read (data texture / not decoded)
  const cv = (typeof document !== 'undefined')
    ? Object.assign(document.createElement('canvas'), { width: w, height: h })
    : new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const px = id.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue; // fully transparent
    const out = fn(px[i], px[i + 1], px[i + 2], spec);
    px[i] = out[0]; px[i + 1] = out[1]; px[i + 2] = out[2];
  }
  ctx.putImageData(id, 0, 0);
  const out = new THREE.CanvasTexture(cv);
  out.colorSpace = srcTex.colorSpace;
  out.flipY = srcTex.flipY;
  out.wrapS = srcTex.wrapS; out.wrapT = srcTex.wrapT;
  out.magFilter = srcTex.magFilter; out.minFilter = srcTex.minFilter;
  out.generateMipmaps = srcTex.generateMipmaps;
  out.anisotropy = srcTex.anisotropy;
  out.offset.copy(srcTex.offset); out.repeat.copy(srcTex.repeat);
  out.center.copy(srcTex.center); out.rotation = srcTex.rotation;
  out.channel = srcTex.channel;
  out.needsUpdate = true;
  _texCache.set(key, out);
  return out;
}

// Repaint an already-owned (per-build cloned) material in place.
export function recolorMaterial(mat, spec) {
  if (!mat || !spec) return;
  if (mat.map) mat.map = recolorTexture(mat.map, spec, 'albedo', recolorAlbedo);
  // color multiplies the albedo map; for map-less parts it IS the paint. White
  // (the usual GLB value) has zero saturation, so recolorAlbedo is a no-op.
  if (mat.color) {
    const [r, g, b] = recolorAlbedo(mat.color.r * 255, mat.color.g * 255, mat.color.b * 255, spec);
    mat.color.setRGB(r / 255, g / 255, b / 255);
  }
  if (spec.dark) {
    // stealth: dim the glow rather than re-hue it
    if (mat.emissive && (mat.emissiveIntensity ?? 1) > 0) mat.emissiveIntensity *= 0.55;
  } else if (spec.glowHue != null) {
    if (mat.emissiveMap) {
      mat.emissiveMap = recolorTexture(mat.emissiveMap, spec, 'emissive', recolorEmissive);
    } else if (mat.emissive && (mat.emissive.r || mat.emissive.g || mat.emissive.b)) {
      const [r, g, b] = recolorEmissive(mat.emissive.r * 255, mat.emissive.g * 255, mat.emissive.b * 255, spec);
      mat.emissive.setRGB(r / 255, g / 255, b / 255);
    }
  }
  mat.needsUpdate = true;
}
