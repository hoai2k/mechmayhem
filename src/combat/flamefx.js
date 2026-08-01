// FlameFX — shader-card fire, the standard real-time recipe (RealtimeVFX /
// fire-shader breakdowns): fire is NOT particles fading out. Each flame is a
// cylindrically-billboarded quad running the classic procedural fire shader:
// a teardrop silhouette domain-distorted by two scrolling noise samples,
// alpha-ERODED harder with height (and with card age) so the tips tear into
// licking tongues, colored through a gradient map — white heart -> yellow ->
// orange -> deep red. Particles only add the garnish: embers and smoke.
// A FlameFX instance is a persistent burning source (ground fire, campfire,
// nozzle burst): a steady core card + transient tongue cards that are born,
// lick upward, and burn out bottom-up as their erosion rises.
import * as THREE from 'three';
import { streamNoiseTexture } from '../core/textures.js';
import { rand, clamp01 } from '../core/utils.js';
import { fireTintOf } from '../mechs/colorscheme.js';

const FLAME_VERT = /* glsl */`
  uniform float uW;
  uniform float uH;
  uniform vec3 uUp;       // flame axis (up for fires, ~dir for nozzle bursts)
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // cylindrical billboard around the flame axis: the card always faces
    // the camera but the flame keeps pointing along uUp
    vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 toCam = cameraPosition - c;
    vec3 right = normalize(cross(uUp, toCam)); // order matters: keeps the
    // face normal toward the camera (the other winding gets backface-culled)
    vec3 wp = c + right * position.x * uW + uUp * (position.y + 0.5) * uH;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const FLAME_FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uSeed;
  uniform float uAge;       // 0 newborn -> 1 burned out
  uniform float uIntensity;
  uniform vec3 uG0, uG1, uG2, uG3;   // the flame's gradient, dark -> white heart
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    // two octaves of noise racing UP the card at different rates — the
    // domain distortion is what makes the silhouette LICK instead of fade
    float n1 = texture2D(uTex, vec2(uv.x * 1.6 + uSeed, uv.y * 2.0 - uTime * 1.7)).r;
    float n2 = texture2D(uTex, vec2(uv.x * 3.2 + uSeed * 1.7 + 0.41, uv.y * 4.1 - uTime * 3.1)).r;
    float n = n1 * 0.65 + n2 * 0.35;
    // teardrop silhouette: wide at the base, pinched and wobbling higher up.
    // The heavy noise-driven x-shear is what makes tongues WRITHE — keep it
    // strong or the flame reads as a smooth candle cone
    float sway = (texture2D(uTex, vec2(uSeed, uv.y * 0.7 - uTime * 0.9)).r - 0.5) * 0.55 * uv.y;
    float cx = (uv.x - 0.5 + sway) * (1.0 + uv.y * 1.7 + (n - 0.5) * 2.6 * uv.y);
    float body = 1.0 - smoothstep(0.02, 0.46, abs(cx));
    body *= smoothstep(0.0, 0.12, uv.y); // seat into the fuel bed
    // erosion: subtract noise, harder with height and with card age — the
    // tongue tears apart at the tip and burns out bottom-up as it dies
    float fire = body * (1.2 - uv.y * 0.5)
               - (1.0 - n) * (0.42 + uv.y * 0.9 + uAge * 1.1)
               - uAge * 0.55;
    fire = clamp(fire * 1.45, 0.0, 1.0);
    // gradient map: deep red skirt -> orange body -> yellow -> small white
    // heart (keep the heart RARE — a wide white core reads as a blowtorch).
    // THE RAMP IS A UNIFORM, not a constant: an alternate paint job burns in
    // its own colour (colorscheme.js schemeFire), and the blue gas flame TIDE
    // always had is just that formula at hue 0.58. Defaults below are the
    // ordinary fire, so anything that does not pass a tint is unchanged.
    vec3 col = mix(uG0, uG1, smoothstep(0.04, 0.38, fire));
    col = mix(col, uG2, smoothstep(0.38, 0.72, fire));
    col = mix(col, uG3, smoothstep(0.88, 0.99, fire));
    float a = smoothstep(0.03, 0.25, fire) * uIntensity;
    gl_FragColor = vec4(col, a);
    if (a < 0.015) discard;
  }
`;

// THE FIRE A MECH BURNS. null for an ordinary flame; otherwise the four ramp
// stops of its paint job (colorscheme.js — saturated schemes only, so white,
// silver, black and brown keep normal fire). Thread it through every fire FX an
// owner spawns. TIDE used to be special-cased here as a blue boolean; it comes
// out of the scheme table now like every other colour.
export const fireTint = (def) => fireTintOf(def);
// what an ember / a point light should be for that tint
export const fireGlow = (tint) => (tint ? tint.stops[2] : 0xffc060);
export const fireDeep = (tint) => (tint ? tint.stops[0] : 0xff3808);

// the ordinary flame's four gradient stops, shared with the fire tornado so
// the two never drift apart
export const FIRE_RAMP = [0x6b0800, 0xf25708, 0xffb833, 0xfff2b8];

function makeCard(scene, tint = null) {
  const g = tint ? tint.stops : FIRE_RAMP;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: streamNoiseTexture() },
      uTime: { value: rand(0, 20) },
      uSeed: { value: rand(0, 10) },
      uAge: { value: 0 },
      uIntensity: { value: 1 },
      uG0: { value: new THREE.Color(g[0]) },
      uG1: { value: new THREE.Color(g[1]) },
      uG2: { value: new THREE.Color(g[2]) },
      uG3: { value: new THREE.Color(g[3]) },
      uW: { value: 1 },
      uH: { value: 1 },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    // NORMAL blending, not additive: additive fire vanishes against bright
    // daylight arenas (uptown concrete washed it to nothing). Alpha-blended
    // cards keep their body on any background; the saturated gradient +
    // bloom on the hot heart still make it read as light.
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, u: mat.uniforms, t: 0, life: 0, core: false };
}

export class FlameFX {
  // A burning source. opts:
  //   radius: fuel-bed radius the tongues wander over
  //   scale:  overall flame height multiplier
  //   dir:    flame axis (default straight up; tilt for nozzle bursts)
  //   cards:  transient tongue budget
  //   light:  add a flickering point light (one per fire, cheap and sells it)
  constructor(scene, effects, pos, { radius = 1.2, scale = 1, dir = null, cards = 7, light = true, tint = null } = {}) {
    this.scene = scene;
    this.fx = effects;
    this.pos = pos.clone();
    this.radius = radius;
    this.scale = scale;
    this.tint = tint;
    this.up = dir ? dir.clone().normalize() : new THREE.Vector3(0, 1, 0);
    this.alive = true;
    this._acc = { tongue: 0, ember: 0, smoke: 0 };
    this.cards = [];
    // the heart: two persistent core cards that never die, just flicker
    for (let i = 0; i < 2; i++) {
      const c = makeCard(scene, tint);
      c.core = true;
      c.mesh.visible = true;
      c.mesh.position.copy(pos).add(this.up.clone().multiplyScalar(i * 0.1));
      c.u.uW.value = radius * (2.6 - i * 0.7);
      c.u.uH.value = scale * (1.7 + i * 1.1);
      c.u.uAge.value = 0.14;
      c.u.uIntensity.value = 0.8;
      c.u.uUp.value.copy(this.up);
      this.cards.push(c);
    }
    for (let i = 0; i < cards; i++) this.cards.push(makeCard(scene, tint));
    this.light = null;
    if (light) {
      this.light = new THREE.PointLight(tint ? tint.stops[2] : 0xff7a22, 40 * scale, 18 * scale, 1.8);
      this.light.position.copy(pos).add(this.up.clone().multiplyScalar(1.2 * scale));
      scene.add(this.light);
    }
  }

  _tick(key, period, dt, fn) {
    this._acc[key] += dt;
    while (this._acc[key] >= period) { this._acc[key] -= period; fn(); }
  }

  // fade the fire out over `t` seconds, then update() returns false
  extinguish(t = 0.6) { this._dieT = t; this._die0 = t; }

  // cancel a pending extinguish (channel weapons re-trigger every tick)
  rekindle() { if (this.alive) { this._dieT = undefined; } }

  // move the burning source (nozzle flames ride the mech's aim)
  setPose(pos, dir = null) {
    this.pos.copy(pos);
    if (dir) this.up.copy(dir).normalize();
    let i = 0;
    for (const c of this.cards) {
      if (!c.core) continue;
      c.mesh.position.copy(pos).addScaledVector(this.up, (i++) * 0.1);
      c.u.uUp.value.copy(this.up);
    }
  }

  update(dt) {
    if (!this.alive) return false;
    let dim = 1;
    if (this._dieT !== undefined) {
      this._dieT -= dt;
      dim = clamp01(this._dieT / this._die0);
      if (this._dieT <= 0) { this.alive = false; return false; }
    }
    const p = this.pos, fx = this.fx;

    for (const c of this.cards) {
      c.u.uTime.value += dt;
      if (c.core) {
        // incommensurate flicker so the heart never looks looped
        const t = c.u.uTime.value;
        c.u.uIntensity.value = dim * (0.72 + 0.1 * Math.sin(t * 11.3) + 0.07 * Math.sin(t * 23.7 + 2.1));
        continue;
      }
      if (!c.mesh.visible) continue;
      c.t += dt;
      const f = c.t / c.life;
      if (f >= 1) { c.mesh.visible = false; continue; }
      c.u.uAge.value = f;                       // erosion rises -> burns out
      c.u.uIntensity.value = dim * Math.min(1, f * 6); // snap in fast
      c.u.uH.value = c.h0 * (1 + f * 0.5);      // tongue stretches as it dies
    }

    // transient tongues shouldering out of the fuel bed
    this._tick('tongue', 0.065, dt, () => {
      const c = this.cards.find((k) => !k.core && !k.mesh.visible);
      if (!c) return;
      const a = rand(Math.PI * 2), r = Math.sqrt(Math.random()) * this.radius;
      c.mesh.position.set(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r);
      c.mesh.position.addScaledVector(this.up, rand(0, 0.3 * this.scale));
      c.t = 0;
      c.life = rand(0.45, 0.8);
      c.h0 = this.scale * rand(1.6, 3.2);
      c.u.uW.value = this.radius * rand(0.5, 1.0);
      c.u.uH.value = c.h0;
      c.u.uSeed.value = rand(0, 10);
      c.u.uUp.value.copy(this.up);
      c.mesh.visible = true;
    });

    // embers: tiny hot flecks spiraling up out of the flames
    this._tick('ember', 0.12, dt, () => {
      const a = rand(Math.PI * 2), r = rand(0, this.radius);
      fx.sparks.emit(p.x + Math.cos(a) * r, p.y + rand(0.5, 1.5) * this.scale, p.z + Math.sin(a) * r,
        rand(-1.2, 1.2), rand(3, 7) * this.scale, rand(-1.2, 1.2),
        { life: rand(0.6, 1.3), size: rand(0.25, 0.5),
          color: fireGlow(this.tint), color2: fireDeep(this.tint),
          gravity: -2, drag: 0.8, fadeIn: 0.02 });
    });

    // smoke shears off ABOVE the tongues and climbs (normal-blended matter)
    this._tick('smoke', 0.16, dt, () => {
      const a = rand(Math.PI * 2), r = rand(0, this.radius * 0.7);
      const top = 2.6 * this.scale;
      fx.smoke.emit(p.x + Math.cos(a) * r + this.up.x * top, p.y + this.up.y * top, p.z + Math.sin(a) * r + this.up.z * top,
        rand(-0.5, 0.5), rand(2, 4), rand(-0.5, 0.5),
        { life: rand(1, 1.8), size: rand(1.6, 2.8) * this.scale, color: 0x2a2624, color2: 0x141415,
          alpha: 0.5 * dim, drag: 1.2, grow: 2.4, spin: 0.7, fadeIn: 0.25 });
    });

    if (this.light) {
      const t = (this.cards[0]?.u.uTime.value || 0);
      this.light.intensity = (36 + 9 * Math.sin(t * 13.1) + 6 * Math.sin(t * 29.3 + 1.2)) * this.scale * dim;
    }
    return true;
  }

  dispose() {
    for (const c of this.cards) {
      this.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
    }
    if (this.light) this.scene.remove(this.light);
  }
}
