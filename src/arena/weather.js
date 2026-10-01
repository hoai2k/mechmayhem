// WEATHER — rain, snow, ash and blowing dust over the arenas that have a
// climate (arena/climate.js says which, and why; docs/WEATHER.md is the
// write-up). What a player sees, from near to far:
//
//  1. PRECIPITATION as GPU geometry, never point sprites. Each layer is one
//     instanced quad per drop/flake/grain whose position is a pure function of
//     a per-instance seed and ONE integrated offset (∫ velocity dt, so a gust
//     that changes the wind never makes anything jump), wrapped into a box that
//     follows whichever camera is drawing — so it works in every split view,
//     the finisher cameras, the loading card, with no per-frame CPU work but a
//     handful of uniforms. Rain is a MOTION-BLURRED STREAK: head-to-tail along
//     the drop's own velocity over a camera exposure, screen-aligned, never
//     thinner than a pixel (and fainter in proportion when the real drop is,
//     which is what stops a field of thin lines aliasing into noise). Snow and
//     ash are camera-facing flakes that flutter, ash tumbles edge-on, and fast
//     wind stretches either into streaks. Two layers per kind — a dense near
//     box and a sparse wide one — give the depth a single box cannot.
//     Intensity changes the NUMBER of live instances (each has a rank, live if
//     rank < density), so a drizzle thickening into a storm adds drops rather
//     than brightening them; moving SHEETS (wind-advected noise) make the
//     density uneven, which is what gusting rain actually looks like.
//  2. SPLASHES (rain): a crown of droplets and a ripple ring on the ground,
//     placed on the relief (sampled from a texture of the same grid physics
//     reads), plus the ground shader's WETNESS — darker, glossier ground,
//     puddles in the low spots with rain rings in them — which builds while it
//     rains and dries slowly after.
//  3. THE WEATHER VOLUME, in the distance-haze pass (core/hazeblur.js): a short
//     raymarch through wind-advected noise up to the scene depth, so rain
//     sheets, dust clouds, a whiteout or an ash haze roll THROUGH the arena and
//     hide what is behind them, occluded correctly by everything in front.
//  4. THE SKY: fog pulled in and tinted toward the storm, a camera-centred VEIL
//     over the painted backdrop (a sandstorm has no blue sky), the sun dimmed,
//     and in a heavy rainstorm LIGHTNING — a bolt in the distance, the whole
//     scene flashing, thunder a few seconds later.
//  5. SOUND: synthesized rain and gusting wind that follow the same numbers
//     (core/audio.js weatherSound), over the arena's recorded bed.
//
// Nothing here touches gameplay: no visibility rule, no AI, no physics reads
// any of it.
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { clamp01, lerp, makeRng } from '../core/utils.js';
import { Climate, climateProfile } from './climate.js';

const _dir = new THREE.Vector3();
const _vp = new THREE.Vector4();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

const GLSL_NOISE = /* glsl */`
float wHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 wHash2(vec2 p) {
  float a = wHash(p);
  return vec2(a, wHash(p + a * 17.13 + 3.1));
}
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x),
             mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// ---------------------------------------------------------------- particles
const PRECIP_VERT = /* glsl */`
attribute vec4 aSeed;   // xyz: position in the box (0..1), w: density rank
attribute vec4 aRnd;    // x: speed, y: size, z: phase, w: tint pick
uniform vec3 uBox, uCenter, uOffset, uVel;
uniform float uTime, uDensity, uSheet, uExposure, uAlpha, uPix, uMinW, uFadeNear, uFadeFar;
uniform vec2 uSize, uSpeed, uFlutter, uSheetOff;
uniform vec3 uColor, uTint0, uTint1, uTint2;
uniform float uTintAmt;
varying vec2 vC;
varying float vA;
varying vec3 vCol;
varying float vR;
${GLSL_NOISE}
void main() {
  float s = mix(uSpeed.x, uSpeed.y, aRnd.x);
  vec3 p = aSeed.xyz * uBox + uOffset * s;
#ifdef FLUTTER
  float ph = aRnd.z * 40.0;
  p.x += sin(uTime * uFlutter.x * (0.6 + aRnd.z) + ph) * uFlutter.y;
  p.z += cos(uTime * uFlutter.x * (0.5 + aRnd.y) + ph * 1.3) * uFlutter.y;
  p.y += sin(uTime * uFlutter.x * 0.7 + ph * 0.7) * uFlutter.y * 0.3;
#endif
  vec3 rel = p - uCenter;
  rel = (fract(rel / uBox + 0.5) - 0.5) * uBox;
  vec3 wp = uCenter + rel;
  float dens = uDensity;
  if (uSheet > 0.0) {
    // sheets of heavier fall, advected by the wind
    float n = wNoise((wp.xz - uSheetOff) * 0.028) * 0.65 + wNoise((wp.xz - uSheetOff * 1.3) * 0.075) * 0.35;
    dens *= clamp(1.0 + uSheet * (n * 2.0 - 1.0), 0.0, 2.0);
  }
  vec3 q = abs(rel / uBox) * 2.0;
  float edge = (1.0 - smoothstep(0.72, 1.0, max(q.x, q.z))) * (1.0 - smoothstep(0.8, 1.0, q.y));
  float dist = distance(wp, cameraPosition);
  float fade = smoothstep(uFadeNear, uFadeNear * 2.0 + 0.6, dist) * (1.0 - smoothstep(uFadeFar * 0.55, uFadeFar, dist));
  vA = uAlpha * edge * fade * step(aSeed.w, dens);
  vR = aRnd.w;
  vCol = uColor;
  if (uTintAmt > 0.0) {
    vec3 tc = aRnd.w < 0.12 ? uTint0 : aRnd.w < 0.24 ? uTint1 : aRnd.w < 0.3 ? uTint2 : uColor;
    vCol = mix(uColor, tc, uTintAmt);
  }
  if (vA < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vC = vec2(0.0); return; }
#ifdef STREAK
  vec3 v = uVel * s;
  v.xz += (aRnd.yz - 0.5) * 0.5 * (length(v.xz) + 1.0);
  float len = max(length(v) * uExposure, 0.04);
  vec3 dir = normalize(v);
  vec4 vh = viewMatrix * vec4(wp, 1.0);
  vec4 vt = viewMatrix * vec4(wp - dir * len, 1.0);
  float along = position.y * 0.5 + 0.5;
  vec4 vp = mix(vt, vh, along);
  vec2 d = vh.xy / max(-vh.z, 0.05) - vt.xy / max(-vt.z, 0.05);
  float dl = length(d);
  vec2 perp = dl > 1e-6 ? vec2(-d.y, d.x) / dl : vec2(1.0, 0.0);
  float depth = max(-vp.z, 0.05);
  float wW = uSize.x * mix(0.7, 1.3, aRnd.y);
  float w = max(wW, uPix * depth * uMinW);
  vA *= wW / w;          // a sub-pixel streak is a faint one, not a fat one
  vA *= mix(0.5, 1.0, aRnd.x);   // drops are not all lit alike
  // a drop is a teardrop smeared by the exposure: full width at the head,
  // tapering away up the tail
  vp.xy += perp * w * mix(0.35, 1.0, along) * position.x;
  vC = vec2(position.x, along);
  gl_Position = projectionMatrix * vp;
#else
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  float depth = max(-vp.z, 0.05);
  float sz = mix(uSize.x, uSize.y, aRnd.y);
  float S = max(sz, uPix * depth * uMinW);
  vA *= (sz * sz) / (S * S);
  vec2 c = position.xy;
#ifdef TUMBLE
  float ang = uTime * (0.8 + aRnd.z * 2.2) + aRnd.w * 20.0;
  float tum = abs(cos(uTime * (0.7 + aRnd.x * 1.9) + aRnd.z * 10.0));
  c = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * vec2(c.x * max(tum, 0.18), c.y);
  vA *= 0.55 + 0.45 * tum;   // edge-on flakes catch less light
#endif
  // fast wind smears a flake into a streak along its screen motion
  vec3 vv = (viewMatrix * vec4(uVel * s, 0.0)).xyz;
  vec2 mv = vv.xy * uExposure;
  float ml = length(mv);
  vec2 ax = ml > 1e-5 ? mv / ml : vec2(0.0, 1.0);
  vec2 px2 = vec2(-ax.y, ax.x);
  float L = S + ml * 0.5;
  vp.xy += px2 * c.x * S + ax * c.y * L;
  vA *= S / L;
  vC = position.xy;
  gl_Position = projectionMatrix * vp;
#endif
}
`;

const PRECIP_FRAG = /* glsl */`
varying vec2 vC;
varying float vA;
varying vec3 vCol;
varying float vR;
${GLSL_NOISE}
void main() {
#ifdef STREAK
  float a = 1.0 - vC.x * vC.x;
  a *= smoothstep(0.0, 0.7, vC.y) * (1.0 - 0.35 * smoothstep(0.85, 1.0, vC.y));
#elif defined(ASH)
  vec2 cc = vC + (wHash2(floor((vC + 1.0) * 2.5) + vR * 31.0) - 0.5) * 0.35;
  float a = 1.0 - smoothstep(0.55, 0.95, length(cc));
#elif defined(EMBER)
  float r2 = dot(vC, vC);
  float a = exp(-r2 * 5.0);
#else
  float a = 1.0 - smoothstep(0.25, 1.0, length(vC));
#endif
  if (a * vA < 0.003) discard;
#ifdef EMBER
  gl_FragColor = vec4(vCol * (1.0 + 2.0 * exp(-dot(vC, vC) * 18.0)), a * vA);
#else
  gl_FragColor = vec4(vCol, a * vA);
#endif
}
`;

// ---------------------------------------------------------------- splashes
const SPLASH_VERT = /* glsl */`
attribute vec4 aSeed;
uniform float uTime, uRate, uRadius, uP, uN, uAlpha, uPix;
uniform vec3 uCenter;
uniform sampler2D uRelief;
varying vec2 vC;
varying float vA;
varying float vU;
varying float vR;
${GLSL_NOISE}
void main() {
  float T = mix(0.42, 0.8, aSeed.x);
  float tt = uTime / T + aSeed.y;
  float cyc = floor(tt);
  float u = fract(tt);
  vec2 seedXZ = wHash2(vec2(cyc * 1.37 + aSeed.z * 113.0, aSeed.w * 71.0)) * 2.0 * uRadius;
  vec2 rel = (fract((seedXZ - uCenter.xz) / (2.0 * uRadius) + 0.5) - 0.5) * 2.0 * uRadius;
  vec2 xz = uCenter.xz + rel;
  float edge = 1.0 - smoothstep(0.7, 1.0, length(rel) / uRadius);
  float live = step(wHash(vec2(cyc * 0.77, aSeed.w * 917.0)), uRate);
  vA = uAlpha * live * edge;
  vU = u;
  vR = aSeed.z;
  // ground under it, off the same grid the physics reads (texel centres)
  vec2 ruv = (xz + uP * 0.5) / uP + 0.5 / uN;
  float gy = texture2D(uRelief, ruv).r;
  if (vA < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vC = vec2(0.0); return; }
#ifdef RING
  float R = mix(0.04, 0.28, sqrt(u)) * mix(0.75, 1.25, aSeed.x);
  vec3 wp = vec3(xz.x + position.x * R, gy + 0.035, xz.y + position.y * R);
  vA *= (1.0 - u);
  vC = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
#else
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float W = 0.34 * mix(0.8, 1.2, aSeed.x), H = 0.3 * mix(0.8, 1.2, aSeed.z);
  vec3 wp = vec3(xz.x, gy, xz.y) + right * position.x * W + vec3(0.0, (position.y * 0.5 + 0.5) * H, 0.0);
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  // never smaller than a few pixels — a splash you cannot see is no splash
  float depth = max(-vp.z, 0.05);
  float k = max(1.0, uPix * depth * 5.0 / W);
  vA /= k;
  vC = vec2(position.x, position.y * 0.5 + 0.5);
  gl_Position = projectionMatrix * vp;
#endif
}
`;

const SPLASH_FRAG = /* glsl */`
uniform vec3 uColor;
varying vec2 vC;
varying float vA;
varying float vU;
varying float vR;
void main() {
#ifdef RING
  float r = length(vC);
  float a = smoothstep(0.8, 0.93, r) * (1.0 - smoothstep(0.93, 1.0, r));
#else
  // a crown: droplets thrown out on parabolas from the impact, and a brief
  // sheet of spray at the base
  float u = vU;
  float a = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ang = (fi / 5.0 - 0.5) * 2.3 + (fract(sin(fi * 12.9 + vR * 78.2) * 437.5) - 0.5) * 0.35;
    float sp = 0.75 + 0.5 * fract(sin(fi * 4.1 + vR * 19.7) * 917.3);
    vec2 pos = vec2(sin(ang) * sp * u * 0.95, (cos(ang) * 1.5 * sp) * u - 1.9 * u * u);
    a += 1.0 - smoothstep(0.035, 0.075, distance(vC, vec2(pos.x, max(pos.y, 0.0))));
  }
  float sheet = (1.0 - smoothstep(0.0, 0.3, u)) * (1.0 - smoothstep(0.1, 0.35, vC.y))
              * (1.0 - smoothstep(0.25 + u, 0.45 + u, abs(vC.x)));
  a = clamp(a, 0.0, 1.0) * (1.0 - u) + sheet * 0.5;
#endif
  if (a * vA < 0.003) discard;
  gl_FragColor = vec4(uColor, a * vA);
}
`;

// ---------------------------------------------------------------- drift
// SAND (and snow) STREAMING ALONG THE GROUND: what blowing sand actually looks
// like up close is not grains — a single lit grain over sand-coloured ground has
// no contrast at all — but a low, moving layer of wispy streamers. Three
// stacked sheets draped over the relief (sampled from the same texture the
// splashes use), each carrying wind-aligned streaky noise that races along at
// wind speed; every mech and building occludes them like the ground does.
const DRIFT_VERT = /* glsl */`
attribute vec4 aL;      // instance: lift, alpha, noise scale, seed
uniform vec3 uCenter;
uniform float uP, uN, uR;
uniform sampler2D uRelief;
varying vec2 vXZ;
varying float vF;
varying vec4 vL;
void main() {
  vec2 xz = uCenter.xz + position.xy * uR;
  vec2 ruv = (xz + uP * 0.5) / uP + 0.5 / uN;
  float gy = texture2D(uRelief, ruv).r;
  vXZ = xz;
  vL = aL;
  vF = 1.0 - smoothstep(0.5, 0.98, length(position.xy));
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, gy + aL.x, xz.y, 1.0);
}
`;
const DRIFT_FRAG = /* glsl */`
uniform vec2 uWind;
uniform float uScroll, uAlpha;
uniform vec3 uColor;
varying vec2 vXZ;
varying float vF;
varying vec4 vL;
${GLSL_NOISE}
void main() {
  vec2 pd = vec2(-uWind.y, uWind.x);
  float along = dot(vXZ, uWind), across = dot(vXZ, pd);
  // streamers SNAKE: a slow lateral warp, so they braid instead of ruling lines
  across += (wNoise(vec2(along * 0.025 - uScroll * 0.15, across * 0.04 + vL.w * 7.0)) - 0.5) * 7.0;
  vec2 q = vec2(along * 0.06 * vL.z - uScroll * (0.85 + vL.w * 0.3), across * 0.85 * vL.z + vL.w * 13.0);
  float n = wNoise(q) * 0.55 + wNoise(q * vec2(2.3, 3.1) + 3.7) * 0.3 + wNoise(q * vec2(5.1, 7.3) - 1.3) * 0.15;
  // a slower, larger modulation: the streamers come in bands and gusts
  float band = wNoise(vec2(along * 0.012 - uScroll * 0.2, across * 0.03) + vL.w * 5.0);
  float a = smoothstep(0.42, 0.8, n) * (0.35 + 0.9 * band);
  float near = smoothstep(1.5, 6.0, distance(cameraPosition.xz, vXZ));
  a *= uAlpha * vL.y * vF * near;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}
`;
const DRIFT = {
  dust: { sheets: [[0.12, 0.6, 1, 0.1], [0.45, 0.38, 0.8, 0.5], [1.1, 0.22, 0.6, 0.9]] },
  snow: { sheets: [[0.08, 0.55, 1.1, 0.2], [0.3, 0.35, 0.85, 0.6], [0.75, 0.2, 0.65, 0.95]] },
};

// ---------------------------------------------------------------- sky veil
const VEIL_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + position, 1.0);
}
`;
const VEIL_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha, uTop, uFlash;
uniform vec2 uScroll;
varying vec3 vDir;
${GLSL_NOISE}
void main() {
  float h = vDir.y;
  float a = uAlpha * mix(1.0, uTop, smoothstep(0.02, 0.55, h));
  // a ceiling of storm cloud, streaming with the wind
  vec2 p = vDir.xz / max(h + 0.25, 0.1) * 2.2 + uScroll;
  float n = wNoise(p) * 0.6 + wNoise(p * 2.7 + 5.0) * 0.4;
  vec3 col = uColor * (0.85 + 0.3 * n) + vec3(uFlash) * (0.5 + 0.5 * n);
  gl_FragColor = vec4(col, clamp(a * (0.85 + 0.3 * n), 0.0, 1.0));
}
`;

// ---------------------------------------------------------------- lightning
const BOLT_VERT = /* glsl */`
attribute float aSide;
varying float vS;
void main() {
  vS = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
const BOLT_FRAG = /* glsl */`
uniform float uI;
varying float vS;
void main() {
  float x = abs(vS);
  float core = 1.0 - smoothstep(0.08, 0.2, x);
  float glow = exp(-x * x * 6.0) * 0.45;
  gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * (core * 2.5 + glow), (core + glow) * uI);
}
`;

// quad corners shared by every instanced layer
function quadGeometry(count, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, arr] of Object.entries(attrs)) g.setAttribute(name, new THREE.InstancedBufferAttribute(arr, 4));
  g.instanceCount = count;
  return g;
}

// ---- per kind: the layers and how intensity drives them ----
// box [w, h, w] world units; `ahead` pushes the box forward of the camera so
// most of it is in view; speed [min, max] multiplies the layer velocity
const LAYERS = {
  rain: [
    { name: 'near', shape: 'STREAK', count: 7500, box: [36, 28, 36], ahead: 0.3, speed: [0.82, 1.12],
      size: [0.014, 0], minW: 0.9, exposure: 0.022, fade: [2.4, 26], alpha: 0.42, sheet: 0.6 },
    { name: 'far', shape: 'STREAK', count: 13000, box: [120, 60, 120], ahead: 0.36, speed: [0.85, 1.1],
      size: [0.02, 0], minW: 0.75, exposure: 0.026, fade: [12, 88], alpha: 0.28, sheet: 0.85 },
  ],
  snow: [
    { name: 'near', shape: 'FLAKE', count: 5200, box: [32, 22, 32], ahead: 0.28, speed: [0.65, 1.3],
      size: [0.05, 0.11], minW: 1.4, exposure: 0.035, fade: [0.8, 22], alpha: 0.9, flutter: [1.3, 0.35], sheet: 0.5 },
    { name: 'far', shape: 'FLAKE', count: 9000, box: [110, 50, 110], ahead: 0.35, speed: [0.7, 1.25],
      size: [0.09, 0.16], minW: 1.1, exposure: 0.035, fade: [10, 80], alpha: 0.6, flutter: [0.9, 0.5], sheet: 0.8 },
  ],
  ash: [
    { name: 'near', shape: 'ASH', count: 3600, box: [34, 24, 34], ahead: 0.28, speed: [0.6, 1.35],
      size: [0.045, 0.11], minW: 1.4, exposure: 0.03, fade: [0.8, 24], alpha: 0.85, flutter: [0.8, 0.5], tumble: true, sheet: 0.5 },
    { name: 'far', shape: 'ASH', count: 7000, box: [110, 50, 110], ahead: 0.35, speed: [0.6, 1.3],
      size: [0.08, 0.15], minW: 1.1, exposure: 0.03, fade: [10, 80], alpha: 0.5, flutter: [0.6, 0.6], tumble: true, sheet: 0.7 },
  ],
  dust: [
    // sand streaming low over the ground — the "sand snakes" that run even in
    // calm air, and the body of a storm
    { name: 'ground', shape: 'STREAK', count: 7000, box: [40, 3.6, 40], ahead: 0.3, speed: [0.7, 1.25], ground: 1.35,
      size: [0.022, 0], minW: 1.0, exposure: 0.07, fade: [1.0, 30], alpha: 0.55, sheet: 0.9 },
    { name: 'air', shape: 'STREAK', count: 7000, box: [70, 26, 70], ahead: 0.34, speed: [0.7, 1.2],
      size: [0.024, 0], minW: 0.9, exposure: 0.05, fade: [2.0, 55], alpha: 0.3, sheet: 1 },
  ],
};
const EMBER_LAYER = { name: 'embers', shape: 'EMBER', count: 320, box: [44, 22, 44], ahead: 0.3, speed: [0.6, 1.4],
  size: [0.035, 0.07], minW: 1.6, exposure: 0.0, fade: [1, 38], alpha: 1, flutter: [1.7, 0.6], sheet: 0, additive: true };

// how the weather volume (haze pass) reads for each kind
const VOLUME = {
  rain: { scale: 0.011, height: 40, detail: 2.2, sun: 0.15, curve: 1.5 },
  snow: { scale: 0.016, height: 26, detail: 1.9, sun: 0.35, curve: 2 },
  ash: { scale: 0.014, height: 30, detail: 1.7, sun: 0.3, curve: 1.3 },
  dust: { scale: 0.034, height: 8, detail: 3.2, sun: 0.7, curve: 1.6 },
};

export class Weather {
  /**
   * @param {object} arena  the Arena (scene, engine, terrain, fogBase, lightBase)
   * @param {object} prof   a climate profile (climate.js)
   * @param {number} seed
   */
  constructor(arena, prof, seed = 1) {
    this.arena = arena;
    this.scene = arena.scene;
    this.engine = arena.engine;
    this.prof = prof;
    this.kind = prof.kind;
    const pin = Number.isFinite(CONFIG.weatherPin) ? clamp01(CONFIG.weatherPin) : null;
    this.climate = new Climate(prof, seed * 7919 + 13, pin);
    this.rng = makeRng(seed * 104729 + 7);
    this.t = 0;
    this.objects = [];
    this.layers = [];
    this.wet = 0;
    this.flash = 0;
    this.flashes = [];        // pending flash pulses {t, a}
    this.thunder = [];        // pending thunder {t, vol}
    this.sheetOff = new THREE.Vector2();
    this.volOff = new THREE.Vector2();
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.veilScroll = new THREE.Vector2();
    this.storm = new THREE.Color(prof.storm);
    this.drop = new THREE.Color(prof.drop);

    for (const L of LAYERS[this.kind]) this._addLayer(L);
    if (prof.embers) this._addLayer(EMBER_LAYER);
    if (this.kind === 'rain') this._addSplashes();
    if (DRIFT[this.kind]) this._addDrift();
    this._addVeil();
    if (prof.lightning) this._addBolt();

    // rain that has been falling for a while has already wet the ground
    if (this.kind === 'rain') this.wet = clamp01(this.climate.k * 1.6);
    // what wetness does to the buildings: glossier, a touch darker
    this.wetMats = [];
    if (this.kind === 'rain') {
      const mats = new Set();
      const add = (m) => { if (m && m.isMeshStandardMaterial && !mats.has(m)) mats.add(m); };
      const ds = arena.destructo;
      if (ds?.mesh) [].concat(ds.mesh.material).forEach(add);
      if (arena.terrain?.overlayMat) add(arena.terrain.overlayMat);
      for (const m of mats) this.wetMats.push({ m, r: m.roughness, c: m.color.clone() });
    }
    this.update(0);
  }

  get active() { return CONFIG.weather !== false; }

  _addLayer(L) {
    const rng = this.rng;
    const seed = new Float32Array(L.count * 4);
    const rnd = new Float32Array(L.count * 4);
    for (let i = 0; i < L.count; i++) {
      seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = rng();
      rnd[i * 4] = rng(); rnd[i * 4 + 1] = rng(); rnd[i * 4 + 2] = rng(); rnd[i * 4 + 3] = rng();
    }
    const geo = quadGeometry(L.count, { aSeed: seed, aRnd: rnd });
    const tints = (this.prof.tints || []).map((c) => new THREE.Color(c));
    while (tints.length < 3) tints.push(this.drop.clone());
    const uniforms = {
      uBox: { value: new THREE.Vector3(...L.box) },
      uCenter: { value: new THREE.Vector3() },
      uOffset: { value: new THREE.Vector3() },
      uVel: { value: new THREE.Vector3(0, -1, 0) },
      uTime: { value: 0 },
      uDensity: { value: 0 },
      uSheet: { value: L.sheet || 0 },
      uSheetOff: { value: this.sheetOff },
      uExposure: { value: L.exposure },
      uAlpha: { value: L.alpha },
      uPix: { value: 0.002 },
      uMinW: { value: L.minW },
      uFadeNear: { value: L.fade[0] },
      uFadeFar: { value: L.fade[1] },
      uSize: { value: new THREE.Vector2(L.size[0], L.size[1] || L.size[0]) },
      uSpeed: { value: new THREE.Vector2(...L.speed) },
      uFlutter: { value: new THREE.Vector2(...(L.flutter || [0, 0])) },
      uColor: { value: new THREE.Color() },
      uTint0: { value: tints[0] }, uTint1: { value: tints[1] }, uTint2: { value: tints[2] },
      uTintAmt: { value: L.shape === 'STREAK' && this.kind === 'rain' ? (this.prof.tintAmt || 0) : 0 },
    };
    const defines = { [L.shape]: '' };
    if (L.flutter) defines.FLUTTER = '';
    if (L.tumble) defines.TUMBLE = '';
    const mat = new THREE.ShaderMaterial({
      uniforms, defines, vertexShader: PRECIP_VERT, fragmentShader: PRECIP_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      // a falling streak runs tail -> head DOWN the screen, which flips the
      // quad's winding: single-sided, every drop is culled as a back face
      side: THREE.DoubleSide,
      blending: L.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.name = `weather-${this.kind}-${L.name}`;
    const terrain = this.arena.terrain;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      camera.getWorldDirection(_dir);
      _dir.y = 0;
      const l = _dir.length();
      if (l > 1e-4) _dir.multiplyScalar(1 / l);
      const cx = camera.position.x + _dir.x * L.box[0] * L.ahead;
      const cz = camera.position.z + _dir.z * L.box[2] * L.ahead;
      const cy = L.ground != null ? (terrain?.reliefAt?.(camera.position.x, camera.position.z) ?? 0) + L.ground : camera.position.y;
      uniforms.uCenter.value.set(cx, cy, cz);
      renderer.getCurrentViewport(_vp);
      uniforms.uPix.value = 2 * Math.tan((camera.fov || 50) * Math.PI / 360) / Math.max(1, _vp.w);
    };
    this.scene.add(mesh);
    this.objects.push(mesh);
    this.layers.push({ L, mesh, uniforms, offset: uniforms.uOffset.value });
  }

  // the ground's own grid as a texture, so what lands or streams over the
  // floor sits ON the relief physics reads
  _relief() {
    if (this.reliefTex) return this.reliefTex;
    const relief = this.arena.terrain?.relief;
    const N = relief?.N || 2;
    const P = relief?.P || this.arena.wrapHalf * 2;
    const data = new Uint16Array(N * N);
    for (let i = 0; i < N * N; i++) data[i] = THREE.DataUtils.toHalfFloat(relief?.enabled ? relief.grid[i] : 0);
    const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.reliefTex = tex;
    this.reliefN = N;
    this.reliefP = P;
    return tex;
  }

  _addDrift() {
    const D = DRIFT[this.kind];
    const tex = this._relief();
    const plane = new THREE.PlaneGeometry(2, 2, 64, 64);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', plane.getAttribute('position'));
    g.setIndex(plane.getIndex());
    g.setAttribute('aL', new THREE.InstancedBufferAttribute(new Float32Array(D.sheets.flat()), 4));
    g.instanceCount = D.sheets.length;
    this.driftU = {
      uCenter: { value: new THREE.Vector3() }, uP: { value: this.reliefP }, uN: { value: this.reliefN },
      uR: { value: 62 }, uRelief: { value: tex },
      uWind: { value: new THREE.Vector2(1, 0) }, uScroll: { value: 0 }, uAlpha: { value: 0 },
      uColor: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.driftU, vertexShader: DRIFT_VERT, fragmentShader: DRIFT_FRAG,
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.name = `weather-drift-${this.kind}`;
    const u = this.driftU;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      camera.getWorldDirection(_dir);
      _dir.y = 0;
      const l = _dir.length();
      if (l > 1e-4) _dir.multiplyScalar(1 / l);
      u.uCenter.value.set(camera.position.x + _dir.x * 22, 0, camera.position.z + _dir.z * 22);
    };
    this.drift = mesh;
    this.scene.add(mesh);
    this.objects.push(mesh);
  }

  _addSplashes() {
    const tex = this._relief();
    const N = this.reliefN, P = this.reliefP;
    const count = 1600;
    const rng = this.rng;
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seed[i] = rng();
    this.splashes = [];
    for (const shape of ['RING', 'CROWN']) {
      const geo = quadGeometry(count, { aSeed: seed });
      const uniforms = {
        uTime: { value: 0 }, uRate: { value: 0 }, uRadius: { value: 18 }, uP: { value: P }, uN: { value: N },
        uAlpha: { value: shape === 'RING' ? 0.2 : 0.5 }, uPix: { value: 0.002 },
        uCenter: { value: new THREE.Vector3() }, uRelief: { value: tex }, uColor: { value: new THREE.Color() },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms, defines: { [shape]: '' }, vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG,
        transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.name = `weather-splash-${shape}`;
      mesh.onBeforeRender = (renderer, scene, camera) => {
        camera.getWorldDirection(_dir);
        _dir.y = 0;
        const l = _dir.length();
        if (l > 1e-4) _dir.multiplyScalar(1 / l);
        uniforms.uCenter.value.set(camera.position.x + _dir.x * 9, 0, camera.position.z + _dir.z * 9);
        renderer.getCurrentViewport(_vp);
        uniforms.uPix.value = 2 * Math.tan((camera.fov || 50) * Math.PI / 360) / Math.max(1, _vp.w);
      };
      this.scene.add(mesh);
      this.objects.push(mesh);
      this.splashes.push(uniforms);
    }
  }

  _addVeil() {
    const geo = new THREE.SphereGeometry(420, 32, 16);
    this.veilU = {
      uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uTop: { value: 0.72 },
      uFlash: { value: 0 }, uScroll: { value: this.veilScroll },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.veilU, vertexShader: VEIL_VERT, fragmentShader: VEIL_FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide, fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -5;
    mesh.name = 'weather-veil';
    this.veil = mesh;
    this.scene.add(mesh);
    this.objects.push(mesh);
  }

  _addBolt() {
    this.boltU = { uI: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.boltU, vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.bolt.renderOrder = -4;
    this.scene.add(this.bolt);
    this.objects.push(this.bolt);
  }

  // A forked bolt somewhere out past the arena, as a ribbon facing the camera.
  _strike() {
    const rng = this.rng;
    const cam = this.engine.camera.position;
    const a = rng.range(0, Math.PI * 2), r = rng.range(230, 360);
    const bx = cam.x + Math.cos(a) * r, bz = cam.z + Math.sin(a) * r;
    const top = new THREE.Vector3(bx + rng.range(-40, 40), rng.range(170, 230), bz + rng.range(-40, 40));
    const bot = new THREE.Vector3(bx, 0, bz);
    const paths = [];
    const zig = (p0, p1, depth, rough) => {
      let pts = [p0, p1];
      for (let d = 0; d < depth; d++) {
        const next = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const m = pts[i - 1].clone().lerp(pts[i], 0.5);
          const len = pts[i - 1].distanceTo(pts[i]);
          m.x += rng.range(-1, 1) * len * rough;
          m.z += rng.range(-1, 1) * len * rough;
          m.y += rng.range(-0.3, 0.3) * len * rough;
          next.push(m, pts[i]);
        }
        pts = next;
      }
      return pts;
    };
    const main = zig(top, bot, 6, 0.28);
    paths.push({ pts: main, w: 1.3 });
    for (let b = 0; b < 3; b++) {
      const i0 = Math.floor(rng.range(0.15, 0.6) * main.length);
      const s = main[i0];
      const end = s.clone().add(new THREE.Vector3(rng.range(-60, 60), -rng.range(30, 80), rng.range(-60, 60)));
      paths.push({ pts: zig(s, end, 5, 0.3), w: 0.6 });
    }
    // ribbons, facing the camera
    const pos = [], side = [], idx = [];
    const view = new THREE.Vector3();
    for (const { pts, w } of paths) {
      const base = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[Math.min(i + 1, pts.length - 1)];
        const o = pts[Math.max(i - 1, 0)];
        const tan = q.clone().sub(o).normalize();
        view.copy(p).sub(cam).normalize();
        const n = tan.clone().cross(view).normalize().multiplyScalar(w * 4 * (1 - 0.6 * i / pts.length));
        pos.push(p.x + n.x, p.y + n.y, p.z + n.z, p.x - n.x, p.y - n.y, p.z - n.z);
        side.push(1, -1);
        if (i > 0) {
          const a0 = base + (i - 1) * 2;
          idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
        }
      }
    }
    const g = this.bolt.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    // the flash: two or three pulses, the bolt visible through them
    const n = rng.int(2, 3);
    let t = 0;
    for (let i = 0; i < n; i++) {
      this.flashes.push({ t: this.t + t, a: rng.range(0.6, 1) * (i === 0 ? 1 : 0.8) });
      t += rng.range(0.06, 0.16);
    }
    this.boltUntil = this.t + t + 0.08;
    // thunder: sound travels ~340 m/s; the scene is ~0.7 units a metre
    const delay = r / 0.7 / 340 * rng.range(0.7, 1.1);
    this.thunder.push({ t: this.t + delay, vol: lerp(1, 0.55, (r - 230) / 130) });
  }

  update(dt) {
    const on = this.active;
    const c = this.climate.step(dt);
    this.t += dt;
    const k = on ? c.kEff : 0;
    const prof = this.prof;
    const arena = this.arena;
    const eng = this.engine;
    for (const o of this.objects) if (o !== this.bolt) o.visible = on;
    const s = Math.pow(k, 1.4);

    // ---- sky: fog, veil, light ----
    const fog = this.scene.fog;
    const fb = arena.fogBase;
    if (fog && fb) {
      fog.near = fb.near * lerp(1, prof.fogNear, s);
      fog.far = fb.far * lerp(1, prof.fogFar, s);
      fog.color.copy(fb.color).lerp(this.storm, Math.min(1, s * 0.9));
    }
    // lightning pulses
    let flash = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      const age = this.t - f.t;
      if (age < 0) continue;
      if (age > 0.6) { this.flashes.splice(i, 1); continue; }
      flash = Math.max(flash, f.a * Math.exp(-age * 9));
    }
    this.flash = flash;
    for (let i = this.thunder.length - 1; i >= 0; i--) {
      if (this.thunder[i].t <= this.t) {
        if (on) arena.world?.audio?.play('thunder', { vol: this.thunder[i].vol });
        this.thunder.splice(i, 1);
      }
    }
    if (this.bolt) {
      const vis = on && this.boltUntil != null && this.t < this.boltUntil;
      this.bolt.visible = vis;
      this.boltU.uI.value = vis ? Math.min(1, 0.35 + flash) : 0;
      if (on && prof.lightning && k > 0.62 && dt > 0) {
        const rate = prof.lightning * (k - 0.62) / 0.38 * 0.09;
        if (this.rng() < rate * dt) this._strike();
      }
    }
    const lb = arena.lightBase;
    if (lb && eng) {
      eng.sun.intensity = lb.sun * (1 - prof.dim * s);
      eng.hemi.intensity = lb.hemi * (1 - prof.dim * 0.35 * s) + flash * 1.6;
    }
    const light = lb ? (eng.sun.intensity / Math.max(0.01, lb.sun)) * 0.55 + 0.45 : 1;

    this.veilScroll.x += c.windX * dt * 0.0035;
    this.veilScroll.y += c.windZ * dt * 0.0035;
    if (this.veilU) {
      this.veilU.uAlpha.value = prof.veil * smoothstep(0.05, 0.9, k);
      this.veilU.uColor.value.copy(fog ? fog.color : this.storm);
      this.veilU.uFlash.value = flash * 0.55;
    }

    // ---- precipitation ----
    const wx = c.windX, wz = c.windZ;
    this.sheetOff.x += wx * dt;
    this.sheetOff.y += wz * dt;
    _c.copy(this.drop).multiplyScalar(light * (1 + flash * 1.6));
    for (const ly of this.layers) {
      const { L, uniforms: u } = ly;
      let vx = wx, vy, vz = wz, dens;
      switch (this.kind) {
        case 'rain':
          // drizzle is fine drops falling slowly; a storm is big drops at
          // terminal velocity — so the streaks lengthen as it builds
          vx *= 0.9; vz *= 0.9; vy = -(14 + 18 * k);
          dens = k < 0.01 ? 0 : (L.name === 'near' ? 0.06 + 0.94 * Math.pow(k, 0.85) : 0.03 + 0.97 * Math.pow(k, 1.15));
          u.uSize.value.x = L.size[0] * (0.7 + 0.5 * k);
          break;
        case 'snow':
          vx *= 0.95; vz *= 0.95; vy = -(1.9 + 0.8 * k);
          dens = k < 0.01 ? 0 : 0.08 + 0.92 * Math.pow(k, 0.9);
          break;
        case 'ash':
          if (L.shape === 'EMBER') { vx *= 0.6; vz *= 0.6; vy = 1.1; dens = 0.3 + 0.7 * k; }
          else { vx *= 0.9; vz *= 0.9; vy = -(1.0 + 0.5 * k); dens = k < 0.01 ? 0 : 0.12 + 0.88 * k; }
          break;
        default: // dust
          if (L.name === 'ground') { vx *= 1.15; vz *= 1.15; vy = -0.35; dens = 0.22 + 0.78 * k; }
          else { vx *= 1.05; vz *= 1.05; vy = -0.25; dens = Math.pow(k, 1.3); }
      }
      ly.offset.x += vx * dt; ly.offset.y += vy * dt; ly.offset.z += vz * dt;
      u.uVel.value.set(vx, vy, vz);
      u.uDensity.value = on ? dens : 0;
      u.uTime.value = this.t;
      if (L.shape === 'EMBER') u.uColor.value.set(0xff7a30);
      else u.uColor.value.copy(_c);
      u.uAlpha.value = L.alpha * (this.kind === 'rain' ? 0.88 + 0.12 * k : 1) * (this.kind === 'dust' ? 0.75 + 0.25 * k : 1);
      ly.mesh.visible = on && dens > 0;
    }

    // ---- streamers along the ground (dust always; snow when it blows) ----
    if (this.drift) {
      const u = this.driftU;
      const ws = Math.hypot(wx, wz);
      if (ws > 1e-3) u.uWind.value.set(wx / ws, wz / ws);
      u.uScroll.value += ws * dt * 0.06 * 1.2;
      const wind01 = clamp01(ws / (prof.wind + prof.gust));
      u.uAlpha.value = !on ? 0 : this.kind === 'dust'
        ? Math.min(0.85, 0.3 + 0.55 * k + 0.2 * c.gust)
        : smoothstep(0.25, 0.85, wind01) * (0.4 + 0.6 * k);
      // airborne sand in sunlight reads PALER than the sand it crosses —
      // tinted like the ground it would vanish into it
      u.uColor.value.copy(_c).lerp(_c2.setRGB(1, 1, 1).multiplyScalar(light), prof.driftTone ?? 0.15);
      this.drift.visible = on && u.uAlpha.value > 0.01;
    }

    // ---- splashes + wet ground (rain) ----
    if (this.kind === 'rain') {
      const rate = on ? Math.pow(k, 0.9) : 0;
      for (const u of this.splashes) {
        u.uTime.value = this.t;
        u.uRate.value = rate;
        u.uColor.value.copy(_c).multiplyScalar(1.15);
      }
      if (dt > 0) {
        if (k > 0.06) this.wet = Math.min(1, this.wet + dt * (0.015 + 0.06 * k));
        else this.wet = Math.max(0, this.wet - dt / 80);
      }
      const wet = on ? this.wet : 0;
      const gu = arena.groundMat?.userData?.groundUniforms;
      if (gu?.uNtWet) {
        gu.uNtWet.value = wet;
        gu.uNtRain.value = on ? k : 0;
        gu.uNtTime.value = this.t;
      }
      for (const w of this.wetMats) {
        w.m.roughness = w.r * (1 - 0.35 * wet);
        w.m.color.copy(w.c).multiplyScalar(1 - 0.22 * wet);
      }
    }

    // ---- the weather volume (core/hazeblur.js) ----
    const V = VOLUME[this.kind];
    this.volOff.x += wx * dt;
    this.volOff.y += wz * dt;
    const vk = Math.pow(k, V.curve) * (1 + (this.kind === 'dust' || this.kind === 'snow' ? 0.6 : 0.25) * c.gust);
    _c2.copy(this.storm).multiplyScalar(0.55 + 0.45 * light).addScalar(flash * 0.25);
    const sunP = eng?.sun?.position;
    eng.weatherVolume = on && vk > 0.002 ? {
      on: true,
      color: _c2,
      density: prof.haze * vk,
      scale: V.scale, height: V.height, detail: V.detail,
      off: this.volOff, max: 190, ground: 0,
      sun: sunP ? this.sunDir.copy(sunP).normalize() : null, sunAmt: V.sun,
    } : null;

    // ---- sound ----
    const audio = arena.world?.audio;
    if (audio?.weatherSound && dt > 0) {
      const wMax = prof.wind + prof.gust;
      audio.weatherSound({
        rain: on && this.kind === 'rain' ? k : 0,
        sand: on && this.kind === 'dust' ? k : 0,
        wind: on ? clamp01(c.windSpeed / wMax) * (this.kind === 'rain' ? 0.6 : 1) : 0,
        gust: c.gust,
      });
    }
  }

  dispose() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
    this.objects.length = 0;
    this.reliefTex?.dispose();
    for (const w of this.wetMats) { w.m.roughness = w.r; w.m.color.copy(w.c); }
    if (this.engine) this.engine.weatherVolume = null;
  }
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** The weather for this arena, or null (no climate, a dry round, or off). */
export function createWeather(arena, seed = 1) {
  if (arena.theme.recordRecipe) return null;          // the level editor
  const rng = makeRng(seed * 2654435761 + 97);
  const prof = climateProfile(arena.theme, { force: CONFIG.weatherForce, rng });
  if (!prof) return null;
  return new Weather(arena, prof, seed);
}
