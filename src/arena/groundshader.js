// THE GROUND'S SHADER: breaking the tile.
//
// The arena floor is one 2048² material repeated ~10 times across a cell —
// every ~15 units, against a mech ~7 tall — and every one of the twelve
// ground textures is a FOUR-WAY MIRROR (measured by tools/groundaudit.mjs:
// left/right and top/bottom halves identical to the pixel), so each tile
// carries a kaleidoscope X that the eye finds instantly and then finds again
// 15 units further on. New art is requested (docs/image-requests.md), but four
// things can be done to the texture we have, in the shader, today:
//
//  1. ANTI-TILING (Inigo Quilez's "texture repetition", technique 3). A slow
//     periodic noise picks, per region of ground, one of eight virtual uv
//     OFFSETS; neighbouring regions blend across a narrow band. Every sample
//     is still the real texture at full resolution — only WHERE in the tile
//     it is read from changes — so the grid of repeats stops lining up. All
//     maps (colour, normal, roughness, metal, emissive) share the same
//     offsets, so the lighting and the colour never disagree. textureGrad
//     with the UNshifted derivatives keeps the mip choice continuous across
//     an offset change (no seam lines at region borders).
//  2. MACRO VARIATION. Two octaves of world-scale noise lighten/darken and
//     hue-shift the ground over tens of units — the large blotches real
//     ground has (wet patches, dust, repairs, sun-bleach) that a 15-unit tile
//     cannot hold.
//  3. SHAPE SHADING, read off the relief (arena/relief.js): low ground takes
//     a theme's LOW tint (damp, ash-filled, shadowed), rises take its HIGH
//     tint (wind-scoured, sun-bleached), steep faces a SLOPE tint (exposed
//     rock). This is what makes the relief read from a chase camera even
//     where it is only a few tenths of a unit.
//  4. THE FOLD GROOVES, cancelled (tools/groundfolds.mjs measures them into
//     groundfolds.json): the mirroring left a soft dark groove — in the
//     colour AND the normal map — along the edges and middle of every tile.
//     Only the AVERAGE profile across each fold is removed, so the texture's
//     own detail crossing it survives. The correction is box-filtered over
//     the pixel's footprint, so it holds at every distance.
//  5. A SECOND MATERIAL (`ground_<theme>_b`, if one has been delivered) mixed
//     in through a world-space mask — patched asphalt in the asphalt, scree in
//     the rock. Gated on the pack: no file, no sampler, no cost.
//
// EVERY NOISE HERE IS PERIODIC IN THE CELL (lattices wrap mod L, read in
// world xz / P), because the floor is drawn as 3×3 tiles of one cell and a
// player who wraps across the seam must not see the ground change under him.
import * as THREE from 'three';

const NT_COMMON = /* glsl */`
uniform float uNtP;
varying vec2 vNtW;
varying float vNtRel;
varying float vNtNy;
float ntHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// value noise on an LxL lattice that wraps: w is cell-fraction * L
float ntNoise(vec2 w, float L) {
  vec2 i = floor(w), f = fract(w);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = ntHash(mod(i, L));
  float b = ntHash(mod(i + vec2(1.0, 0.0), L));
  float c = ntHash(mod(i + vec2(0.0, 1.0), L));
  float d = ntHash(mod(i + vec2(1.0, 1.0), L));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec2 ntOA; vec2 ntOB; float ntF;
vec4 ntTex(sampler2D s, vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec4 a = textureGrad(s, uv + ntOA, dx, dy);
  if (ntF < 0.001) return a;
  vec4 b = textureGrad(s, uv + ntOB, dx, dy);
  return mix(a, b, ntF);
}
#ifdef NT_FOLD
// THE MIRROR FOLDS (tools/groundfolds.mjs): each ground texture carries a
// groove along x = 0, x = 0.5, y = 0, y = 0.5 of every tile. What the shader
// holds is the RUNNING INTEGRAL of each fold's measured profile (26 knots,
// texels -12..+13; one vec4 per knot, the four folds x0 xh y0 yh in its
// components) — albedo as a darkening ratio minus 1, normal and roughness as
// deltas. A mip, and the screen pixel after it, BOX-FILTER the groove: it
// gets wider and fainter but its integral survives, which is why a 14-texel
// line is still a visible line 300 texels to the pixel. So the correction is
// the same filter applied to the profile — box averages (I(d+w/2) - I(d-w/2)) / w
// over the pixel's footprint w, shaped into the sampler's tent — so it holds
// at any distance, with no fade to tune.
uniform vec4 uNtFA[26];
uniform vec4 uNtFN[26];
uniform vec4 uNtFR[26];
uniform float uNtFW;
float ntFoldI(int map, int fold, float d) {
  float x = clamp(d + 12.0, 0.0, 25.0);   // tap i is texel i-12: [i-12, i-11)
  int i0 = int(floor(x)); int i1 = min(i0 + 1, 25); float f = x - float(i0);
  vec4 a, b;
  if (map == 0) { a = uNtFA[i0]; b = uNtFA[i1]; }
  else if (map == 1) { a = uNtFN[i0]; b = uNtFN[i1]; }
  else { a = uNtFR[i0]; b = uNtFR[i1]; }
  return mix(a[fold], b[fold], f);
}
// the profile averaged over [d - w/2, d + w/2] texels
float ntFoldBox(int map, int fold, float d, float w) {
  return (ntFoldI(map, fold, d + 0.5 * w) - ntFoldI(map, fold, d - 0.5 * w)) / w;
}
// …and seen through what the sampler really does: bilinear over a mip whose
// texel is w wide is a TENT 2w across, approximated as that box smeared by a
// [1 2 1] / 4 kernel
float ntFoldAvg(int map, int fold, float d, float w) {
  return 0.25 * ntFoldBox(map, fold, d - 0.5 * w, w) + 0.5 * ntFoldBox(map, fold, d, w)
       + 0.25 * ntFoldBox(map, fold, d + 0.5 * w, w);
}
// signed texel distance to the nearer of the two folds along one axis, and
// which of the two it is (0: the tile edge, 1: the tile middle)
vec2 ntFoldDist(float t) {
  float e = (t > 0.5 ? t - 1.0 : t);
  if (abs(t - 0.5) < abs(e)) return vec2((t - 0.5) * uNtFW, 1.0);
  return vec2(e * uNtFW, 0.0);
}
// map: 0 albedo (gain), 1 normal (delta: x folds -> R, y folds -> G), 2 rough
vec4 ntFoldFix(vec4 c, vec2 uv, int map) {
  vec2 tw = uv * uNtFW;
  vec2 gx = dFdx(tw), gy = dFdy(tw);
  // what the sampler blurs by: the mip's width (anisotropy 4 lets the major
  // axis run 4x past it), and never less than the pixel's own reach along
  // each texture axis
  float pM = max(length(gx), length(gy)), pm = min(length(gx), length(gy));
  float mip = max(1.0, max(pm, pM * 0.25));
  float wx = max(mip, max(abs(gx.x), abs(gy.x)));
  float wy = max(mip, max(abs(gx.y), abs(gy.y)));
  vec2 t = fract(uv);
  vec2 fx = ntFoldDist(t.x);
  vec2 fy = ntFoldDist(1.0 - t.y);                // texture rows run against v
  bool inX = abs(fx.x) < 13.0 + wx, inY = abs(fy.x) < 13.0 + wy;
  if (!inX && !inY) return c;
  if (map == 0) {
    float r = 1.0;
    if (inX) r *= 1.0 + ntFoldAvg(0, int(fx.y), fx.x, wx);
    if (inY) r *= 1.0 + ntFoldAvg(0, 2 + int(fy.y), fy.x, wy);
    c.rgb *= clamp(1.0 / max(r, 0.12), 0.5, 8.0);
  } else if (map == 1) {
    if (inX) c.r += ntFoldAvg(1, int(fx.y), fx.x, wx);
    if (inY) c.g += ntFoldAvg(1, 2 + int(fy.y), fy.x, wy);
  } else {
    float dd = 0.0;
    if (inX) dd += ntFoldAvg(2, int(fx.y), fx.x, wx);
    if (inY) dd += ntFoldAvg(2, 2 + int(fy.y), fy.x, wy);
    c.g += dd;
  }
  return c;
}
vec4 ntTexF(sampler2D s, vec2 uv, int map) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec4 a = ntFoldFix(textureGrad(s, uv + ntOA, dx, dy), uv + ntOA, map);
  if (ntF < 0.001) return a;
  vec4 b = ntFoldFix(textureGrad(s, uv + ntOB, dx, dy), uv + ntOB, map);
  return mix(a, b, ntF);
}
#else
#define ntTexF(s, uv, m) ntTex(s, uv)
#endif
`;

const NT_UNIFORMS = /* glsl */`
uniform float uNtMacroAmp;
uniform vec3 uNtMacroTint;
uniform float uNtMacroTintAmt;
uniform vec3 uNtLow; uniform float uNtLowAmt;
uniform vec3 uNtHigh; uniform float uNtHighAmt;
uniform vec3 uNtSlope; uniform float uNtSlopeAmt;
uniform float uNtRange;
uniform float uNtAntiTile;
uniform float uNtWet, uNtRain, uNtTime;
#ifdef NT_B
uniform sampler2D uNtMapB;
uniform sampler2D uNtNormalB;
uniform sampler2D uNtRoughB;
#endif
`;

const col = (c, fallback) => new THREE.Color(c ?? fallback);

// Patch a MeshStandardMaterial in place. `profile` is the relief profile
// (relief.js RELIEF[theme]) — its `tint` and `macro` blocks; `P` the cell
// period; `b` an optional {map, normalMap, roughnessMap} second material.
export function patchGroundMaterial(mat, { P, profile = {}, b = null, folds = null } = {}) {
  const tint = profile.tint || {};
  const macro = profile.macro || {};
  const U = {
    uNtP: { value: P },
    uNtMacroAmp: { value: macro.amp ?? 0.12 },
    uNtMacroTint: { value: col(macro.tint, 0xffffff) },
    uNtMacroTintAmt: { value: macro.tintAmt ?? 0 },
    uNtLow: { value: col(tint.low, 0x000000) }, uNtLowAmt: { value: tint.lowAmt ?? 0 },
    uNtHigh: { value: col(tint.high, 0xffffff) }, uNtHighAmt: { value: tint.highAmt ?? 0 },
    uNtSlope: { value: col(tint.slope, 0x000000) }, uNtSlopeAmt: { value: tint.slopeAmt ?? 0 },
    uNtRange: { value: tint.range ?? 0.4 },
    uNtAntiTile: { value: 1 },
    // WETNESS (arena/weather.js drives these while it rains): 0 = dry
    uNtWet: { value: 0 },
    uNtRain: { value: 0 },
    uNtTime: { value: 0 },
  };
  if (b) {
    U.uNtMapB = { value: b.map };
    U.uNtNormalB = { value: b.normalMap || b.map };
    U.uNtRoughB = { value: b.roughnessMap || b.map };
  }
  // the fold grooves of THIS texture (groundfolds.json), if it was measured
  if (folds) {
    // running integral of each profile (26 knots per fold, the four folds
    // interleaved into one vec4 per knot). Albedo taps are stored as GAINS
    // (base / groove); the integral is of the darkening RATIO - 1, which is
    // what a box filter averages linearly.
    const integ = (arr, toDev) => {
      const out = Array.from({ length: 26 }, () => new THREE.Vector4());
      (arr || []).forEach((taps, f) => {
        let acc = 0;
        out[0].setComponent(f, 0);
        taps.forEach((v, i) => { acc += toDev(v); out[i + 1].setComponent(f, acc); });
      });
      return out;
    };
    U.uNtFA = { value: integ(folds.albedo, (g) => 1 / g - 1) };
    U.uNtFN = { value: integ(folds.normal, (v) => v) };
    U.uNtFR = { value: integ(folds.rough, (v) => v) };
    U.uNtFW = { value: folds.W || 2048 };
  }
  mat.userData.groundUniforms = U;
  mat.defines = { ...(mat.defines || {}), ...(b ? { NT_B: '' } : {}), ...(folds ? { NT_FOLD: '' } : {}) };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uNtP;
attribute float aRel;
varying vec2 vNtW;
varying float vNtRel;
varying float vNtNy;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vNtW = (modelMatrix * vec4(transformed, 1.0)).xz / uNtP;
vNtRel = aRel;
vNtNy = normal.y;`);
    let fs = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${NT_COMMON}
${NT_UNIFORMS}`);
    // the region offsets, once per fragment, before the first map is read
    fs = fs.replace('#include <map_fragment>', `
  {
    ntOA = vec2(0.0); ntOB = vec2(0.0); ntF = 0.0;
    if (uNtAntiTile > 0.5) {
      float k = ntNoise(vNtW * 7.0, 7.0) * 0.75 + ntNoise(vNtW * 17.0 + 3.0, 17.0) * 0.25;
      float l = k * 8.0;
      float ia = floor(l);
      ntOA = sin(vec2(3.0, 7.0) * ia);
      ntOB = sin(vec2(3.0, 7.0) * (ia + 1.0));
      ntF = smoothstep(0.35, 0.65, fract(l));
    }
  }
#ifdef USE_MAP
  vec4 sampledDiffuseColor = ntTexF(map, vMapUv, 0);
#ifdef NT_B
  float ntMaskB = smoothstep(0.46, 0.6, ntNoise(vNtW * 5.0 + 11.0, 5.0) * 0.7 + ntNoise(vNtW * 13.0, 13.0) * 0.3);
  sampledDiffuseColor = mix(sampledDiffuseColor, ntTex(uNtMapB, vMapUv), ntMaskB);
#endif
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
  {
    // MACRO: big soft blotches of light/dark and a hue drift
    float mc = ntNoise(vNtW * 3.0, 3.0) * 0.6 + ntNoise(vNtW * 9.0 + 5.0, 9.0) * 0.4;
    diffuseColor.rgb *= 1.0 + uNtMacroAmp * (mc - 0.5) * 2.0;
    float mt = smoothstep(0.35, 0.8, ntNoise(vNtW * 4.0 + 21.0, 4.0));
    float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(diffuseColor.rgb, luma * uNtMacroTint * 1.6, mt * uNtMacroTintAmt);
    // SHAPE: lows, rises and steep faces each take the theme's own tint
    float lowW = smoothstep(0.0, -uNtRange, vNtRel) * uNtLowAmt;
    float highW = smoothstep(0.0, uNtRange, vNtRel) * uNtHighAmt;
    float steep = (1.0 - smoothstep(0.86, 0.985, vNtNy)) * uNtSlopeAmt;
    diffuseColor.rgb = mix(diffuseColor.rgb, uNtLow, lowW);
    diffuseColor.rgb = mix(diffuseColor.rgb, uNtHigh, highW);
    diffuseColor.rgb = mix(diffuseColor.rgb, uNtSlope, steep);
  }
  // WET: water fills the pores (darker), the surface goes glossy, and once it
  // has rained a while PUDDLES stand in the low ground — mirror-smooth, flat,
  // with rain rings spreading in them while it is still coming down
  float ntPud = 0.0;
  vec2 ntRip = vec2(0.0);
  if (uNtWet > 0.001) {
    vec2 wxz = vNtW * uNtP;
    float pn = ntNoise(vNtW * 23.0 + 4.0, 23.0) * 0.6 + ntNoise(vNtW * 61.0, 61.0) * 0.4;
    float low = smoothstep(-0.02, -0.18, vNtRel);
    float lvl = 0.22 + 0.2 * uNtWet;
    ntPud = (1.0 - smoothstep(lvl - 0.05, lvl + 0.05, pn - low * 0.5)) * smoothstep(0.35, 0.85, uNtWet);
    diffuseColor.rgb *= mix(1.0, 0.64, uNtWet) * mix(1.0, 0.72, ntPud);
    if (ntPud > 0.01 && uNtRain > 0.02) {
      vec2 base = floor(wxz / 0.7);
      for (int i = 0; i < 9; i++) {
        vec2 c = base + vec2(float(i - (i / 3) * 3) - 1.0, float(i / 3) - 1.0);
        float h = ntHash(c * 1.13 + 0.7);
        float rate = 0.9 + h * 0.8;
        float cyc = uNtTime * rate + h * 7.0;
        if (ntHash(c * 2.7 + floor(cyc)) > uNtRain) continue;   // fewer drops in a drizzle
        float ph = fract(cyc);
        vec2 ctr = (c + 0.2 + 0.6 * vec2(h, ntHash(c + 5.3))) * 0.7;
        vec2 dv = wxz - ctr;
        float d = length(dv);
        float x = (d - ph * 0.45) * 28.0;
        float w = sin(x * 3.14159) * exp(-x * x * 0.5) * (1.0 - ph);
        ntRip += (d > 1e-4 ? dv / d : vec2(0.0)) * w;
      }
      ntRip *= ntPud * 0.5;
    }
  }
`);
    // the other maps are read inside CHUNKS, which onBeforeCompile sees still
    // as #include lines (three expands them afterwards) — so expand the four
    // that sample a map first, or the replacements below silently match
    // nothing and only the colour gets the offsets (a normal map still tiling
    // under an albedo that does not, which is exactly how this was found)
    for (const c of ['normal_fragment_maps', 'roughnessmap_fragment', 'metalnessmap_fragment', 'emissivemap_fragment']) {
      fs = fs.replace(`#include <${c}>`, THREE.ShaderChunk[c]);
    }
    // wet: glossier everywhere, a puddle nearly a mirror and flat (the water
    // hides the texture's relief), rain rings riding on it
    fs = fs.replace('roughnessFactor *= texelRoughness.g;', `roughnessFactor *= texelRoughness.g;
	roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.62, uNtWet);
	roughnessFactor = mix(roughnessFactor, 0.1, ntPud);`);
    // water fills the pores: the relief flattens as it wets, which is also
    // what keeps a glossy surface from glittering (specular aliasing)
    fs = fs.replace('mapN.xy *= normalScale;', `mapN.xy *= normalScale * (1.0 - 0.92 * ntPud) * (1.0 - 0.5 * uNtWet);
	mapN.xy += ntRip * vec2(1.0, -1.0);`);
    fs = fs.replace('texture2D( normalMap, vNormalMapUv )', `
#ifdef NT_B
      mix(ntTexF(normalMap, vNormalMapUv, 1), ntTex(uNtNormalB, vNormalMapUv), ntMaskB)
#else
      ntTexF(normalMap, vNormalMapUv, 1)
#endif
`);
    fs = fs.replace('texture2D( roughnessMap, vRoughnessMapUv )', `
#ifdef NT_B
      mix(ntTexF(roughnessMap, vRoughnessMapUv, 2), ntTex(uNtRoughB, vRoughnessMapUv), ntMaskB)
#else
      ntTexF(roughnessMap, vRoughnessMapUv, 2)
#endif
`);
    fs = fs.replace('texture2D( metalnessMap, vMetalnessMapUv )', 'ntTex(metalnessMap, vMetalnessMapUv)');
    fs = fs.replace('texture2D( emissiveMap, vEmissiveMapUv )', 'ntTex(emissiveMap, vEmissiveMapUv)');
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `ground-nt${b ? '-b' : ''}${folds ? '-f' : ''}`;
  mat.needsUpdate = true;
  return mat;
}
