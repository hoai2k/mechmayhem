// FireTornadoFX — a fire whirl, the standard vortex recipe (RealtimeVFX /
// tornado breakdowns): nested tapered cylinder shells whose noise pans
// HELICALLY (sideways twist + upward rise at once, inner shell counter-set)
// so the column visibly rotates; vertex wobble + a swaying axis keep it
// alive; erosion tears the rim and the top into streamers; the FlameFX
// gradient map colors it. Garnish: embers spiraling on tangential
// velocities, a burning FlameFX base, and a smoke crown shearing off the
// top. NORMAL blending — the daylight-arena lesson from FlameFX.
import * as THREE from 'three';
import { streamNoiseTexture } from '../core/textures.js';
import { FlameFX, FIRE_RAMP, fireGlow, fireDeep } from './flamefx.js';
import { rand, clamp01 } from '../core/utils.js';
import { GLSL_VNOISE } from './fxglsl.js';

const NADO_VERT = /* glsl */`
  uniform float uTime;
  uniform float uH;
  uniform float uR;        // base radius of this shell
  uniform float uSway;     // axis wander amplitude
  varying vec2 vUv;
  varying float vDisp;
  ${GLSL_VNOISE}
  void main() {
    vUv = uv;
    float h = uv.y;
    vec2 ring = vec2(position.x, position.z);
    // funnel: tight waist low, flaring wide at the top
    float prof = 1.0 + 2.6 * h * h + 0.5 * h;
    float n = vnoise(vec2(ring.x * 2.2 + ring.y * 1.6, h * 4.0 - uTime * 2.6));
    float disp = (n - 0.5) * (0.4 + 1.1 * h);
    vDisp = disp;
    float r = uR * prof * (1.0 + disp * 0.35);
    // the whole funnel SWAYS: axis wanders in a slow figure-eight
    vec2 sway = vec2(sin(uTime * 0.9 + h * 2.4), cos(uTime * 0.7 + h * 1.9)) * uSway * h;
    vec3 wp = vec3(ring.x * r + sway.x, h * uH, ring.y * r + sway.y);
    // modelViewMatrix, NOT viewMatrix — wp is local to the funnel's base;
    // without the model transform the funnel renders at the world origin
    gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
  }
`;

const NADO_FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uSpin;     // helical pan rate (inner shell runs faster)
  uniform vec3 uG0, uG1, uG2, uG3;   // the flame's gradient, dark -> white heart
  varying vec2 vUv;
  varying float vDisp;
  void main() {
    float h = vUv.y;
    // HELICAL pan: u shifts with time (rotation) while v scrolls down
    // (flames rising) — two octaves at different twists sell the vortex
    float n1 = texture2D(uTex, vec2(vUv.x * 2.0 + h * 1.8 - uTime * uSpin, h * 1.6 - uTime * 1.9)).r;
    float n2 = texture2D(uTex, vec2(vUv.x * 3.4 - h * 2.6 - uTime * uSpin * 1.7 + 0.37, h * 3.1 - uTime * 3.2)).r;
    float n = n1 * 0.62 + n2 * 0.38;
    // erosion: strong bite even at the waist (a solid subtraction floor
    // keeps the base ORANGE with white streaks, not a blown white tube)
    float fire = (0.92 - h * 0.36) - (1.0 - n) * (0.74 + h * 0.72) + vDisp * 0.25;
    fire = clamp(fire * 1.45, 0.0, 1.0);
    // FlameFX gradient map: red skirt -> orange -> yellow -> rare white
    // the ramp is a uniform, same as FlameFX: an alternate paint job burns in
    // its own colour (colorscheme.js schemeFire)
    vec3 gA = uG0, gB = uG1, gC = uG2, gD = uG3;
    vec3 col = mix(gA, gB, smoothstep(0.04, 0.38, fire));
    col = mix(col, gC, smoothstep(0.38, 0.72, fire));
    col = mix(col, gD, smoothstep(0.88, 0.99, fire));
    float a = smoothstep(0.03, 0.24, fire) * uAlpha * smoothstep(0.0, 0.05, h) * (1.0 - h * 0.42);
    gl_FragColor = vec4(col, a);
    if (a < 0.015) discard;
  }
`;

function shell(radius, height, { alpha, spin, sway, sides = 26, segs = 30, tint = null }) {
  const g = tint ? tint.stops : FIRE_RAMP;
  const geo = new THREE.CylinderGeometry(1, 1, 1, sides, segs, true);
  geo.translate(0, 0.5, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: streamNoiseTexture() },
      uTime: { value: rand(0, 20) },
      uH: { value: height },
      uR: { value: radius },
      uSway: { value: sway },
      uAlpha: { value: alpha },
      uSpin: { value: spin },
      uG0: { value: new THREE.Color(g[0]) },
      uG1: { value: new THREE.Color(g[1]) },
      uG2: { value: new THREE.Color(g[2]) },
      uG3: { value: new THREE.Color(g[3]) },
    },
    vertexShader: NADO_VERT,
    fragmentShader: NADO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return { mesh, u: mat.uniforms };
}

export class FireTornadoFX {
  // opts: height, radius (waist), sway (axis wander), wander (whole-funnel
  // drift speed — the tornado ROAMS), life (secs; Infinity = until extinguish)
  constructor(scene, effects, pos, {
    height = 18, radius = 1.6, sway = 1.6, wander = 0, life = Infinity, tint = null,
  } = {}) {
    this.tint = tint;
    this.scene = scene;
    this.fx = effects;
    this.pos = pos.clone().setY(0);
    this.height = height;
    this.radius = radius;
    this.wander = wander;
    this.life = life;
    this.t = 0;
    this.alive = true;
    this.env = 0;
    this._acc = { ember: 0, crown: 0 };
    this._wa = rand(Math.PI * 2);
    this.shells = [
      shell(radius, height, { alpha: 0.7, spin: 2.2, sway, tint }),
      shell(radius * 0.62, height * 0.96, { alpha: 0.85, spin: 3.6, sway: sway * 0.8, sides: 20, segs: 24, tint }),
    ];
    this.shells[0].rf = 1;
    this.shells[1].rf = 0.62;
    for (const s of this.shells) {
      s.mesh.position.copy(this.pos);
      scene.add(s.mesh);
    }
    // the funnel stands in a burning patch — its fuel bed
    this.base = new FlameFX(scene, effects, this.pos, {
      radius: radius * 2.2, scale: 1.1, cards: 6, light: false, tint,
    });
  }

  _tick(key, period, dt, fn) {
    this._acc[key] += dt;
    while (this._acc[key] >= period) { this._acc[key] -= period; fn(); }
  }

  extinguish(t = 0.8) { if (this._dieT === undefined) { this._dieT = t; this._die0 = t; } }

  // external drivers (hunting ults) steer the funnel instead of wander
  setPose(pos) {
    this.pos.copy(pos).setY(0);
    this.base.setPose(this.pos);
  }

  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    if (this.t >= this.life) this.extinguish();
    let dim = 1;
    if (this._dieT !== undefined) {
      this._dieT -= dt;
      dim = clamp01(this._dieT / this._die0);
      if (this._dieT <= 0) { this.alive = false; this.base.extinguish(0.01); this.base.update(dt); return false; }
    }
    this.env = Math.min(1, this.env + dt * 2.2) * dim;
    // the tornado ROAMS: slow drunken drift of the whole funnel
    if (this.wander) {
      this._wa += rand(-1.2, 1.2) * dt;
      this.pos.x += Math.cos(this._wa) * this.wander * dt;
      this.pos.z += Math.sin(this._wa) * this.wander * dt;
      this.base.setPose(this.pos);
    }
    const p = this.pos, fx = this.fx, H = this.height * this.env;
    for (const s of this.shells) {
      s.u.uTime.value += dt;
      s.u.uH.value = H * (s === this.shells[1] ? 0.96 : 1);
      s.u.uR.value = this.radius * s.rf; // radius/height are LIVE-drivable
      s.u.uAlpha.value = (s === this.shells[0] ? 0.7 : 0.85) * this.env;
      s.mesh.position.copy(p);
      s.mesh.visible = this.env > 0.03;
    }
    this.base.radius = this.radius * 2.2;
    if (!this.base.update(dt)) { /* base died with us during extinguish */ }
    if (this.env < 0.05) return true;

    // embers on TANGENTIAL velocities — dense enough to read as spiraling
    this._tick('ember', 0.025, dt, () => {
      const a = rand(Math.PI * 2), h = rand(0.05, 0.9) * H;
      const r = this.radius * (1 + 2.6 * (h / H) * (h / H)) * rand(0.9, 1.25);
      const tang = rand(9, 15);
      fx.sparks.emit(p.x + Math.cos(a) * r, h, p.z + Math.sin(a) * r,
        -Math.sin(a) * tang, rand(3, 7), Math.cos(a) * tang,
        { life: rand(0.4, 0.8), size: rand(0.3, 0.6),
          color: fireGlow(this.tint), color2: fireDeep(this.tint),
          gravity: -2, drag: 1.1, fadeIn: 0.02 });
    });
    // smoke crown shearing off the flared top, flung outward by the spin
    this._tick('crown', 0.07, dt, () => {
      const a = rand(Math.PI * 2), r = this.radius * 3.4;
      fx.smoke.emit(p.x + Math.cos(a) * r, H * rand(0.95, 1.1), p.z + Math.sin(a) * r,
        -Math.sin(a) * rand(4, 8), rand(1.5, 4), Math.cos(a) * rand(4, 8),
        { life: rand(0.9, 1.6), size: rand(2.2, 3.6), color: 0x2a2624, color2: 0x131314,
          alpha: 0.5 * this.env, drag: 1.1, grow: 2.2, spin: 0.9, fadeIn: 0.25 });
    });
    return true;
  }

  dispose() {
    for (const s of this.shells) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    }
    this.base.dispose();
  }
}
