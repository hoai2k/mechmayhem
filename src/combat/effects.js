// VFX: pooled GPU point-particles with texture ATLASES (flipbook fire,
// multi-cell smoke/goop), per-particle rotation/spin, fade-in curves and
// color ramps — plus shockwave rings, beams, thick lightning, lingering
// static, and an optional sprite-override intake (with chromakey) that
// falls back to the procedural textures when no sprites are installed.
import * as THREE from 'three';
import {
  softCircleTexture, sparkTexture, smokeCellsTexture, flameAtlasTexture,
  dropletTexture, goopCellsTexture, iceTexture, ringTexture, streamNoiseTexture,
  glitchCellsTexture, glitchNoiseTexture,
} from '../core/textures.js';

// NULLBOT's corruption palette: hard neon channels + white, cycled at
// random so glitched surfaces strobe like a dying GPU
export const GLITCH_COLORS = [
  0xff2038, 0x27f6ff, 0xff2df2, 0x3cff6e, 0x3350ff, 0xffe23c, 0xffffff,
];
export const glitchColor = () => GLITCH_COLORS[(Math.random() * GLITCH_COLORS.length) | 0];
// whole-shell material tints stick to the harsh digital channels — warm
// hues at high weight read as gold paint, not corruption
export const GLITCH_TINTS = [0xff2038, 0x27f6ff, 0xff2df2, 0x3350ff];
export const glitchTint = () => GLITCH_TINTS[(Math.random() * GLITCH_TINTS.length) | 0];
import { rand, clamp01 } from '../core/utils.js';

const _emitCol = new THREE.Color();
const _emitCol2 = new THREE.Color();

// ---------- coherent substance streams (hose water, flamethrower) ----------
// A jet is a ONE-PIECE tube mesh following the ballistic arc, skinned with
// two layers of scrolling fractal noise — it reads as continuous pressurized
// MATTER; billboard particles only add breakup spray around it.
const STREAM_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STREAM_FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform float uTime;
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform vec3 uFoam;     // aerated whitewater color (geyser tech)
  uniform float uFoamAmt; // 0 = no aeration (fire), ~1 = churned water
  uniform float uAlpha;
  uniform float uBreak;   // how quickly the jet rags apart downstream
  varying vec2 vUv;
  void main() {
    float n1 = texture2D(uTex, vec2(vUv.x * 1.3 - uTime * 2.1, vUv.y + uTime * 0.11)).r;
    float n2 = texture2D(uTex, vec2(vUv.x * 0.7 - uTime * 3.4 + 0.37, vUv.y * 2.1 - uTime * 0.23)).r;
    float n = n1 * 0.62 + n2 * 0.38;
    // solid at the nozzle, ragged tongues downstream
    float mask = smoothstep(uBreak * vUv.x, uBreak * vUv.x + 0.4, n + 0.3 * (1.0 - vUv.x));
    float a = uAlpha * mask * (1.0 - vUv.x * 0.5);
    vec3 col = mix(uEdge, uCore, clamp(n * n * 1.7, 0.0, 1.0));
    // aeration ramp (same trick as the geyser column): pressurized water
    // churns WHITE the further it flies and the harder the noise breaks it
    float foam = clamp(vUv.x * 1.3 - 0.15 + (n - 0.5) * 1.1, 0.0, 1.0) * uFoamAmt;
    col = mix(col, uFoam, foam * foam);
    gl_FragColor = vec4(col, a);
    if (a < 0.02) discard;
  }
`;
const JET_SEG = 16, JET_SIDES = 7;
const JET_STYLES = {
  // kept well under bloom threshold: the jet must read as MATTER, not light
  water: { core: 0xb8d8ea, edge: 0x2f5f88, foam: 0xdceef6, foamAmt: 0.95, alpha: 0.68, brk: 0.55, blending: THREE.NormalBlending },
  // dense white heart running inside the water jet (geyser two-shell trick)
  watercore: { core: 0xeaf4fa, edge: 0x9cc8e4, foam: 0xf2f8fc, foamAmt: 0.6, alpha: 0.85, brk: 0.4, blending: THREE.NormalBlending },
  fire: { core: 0xffc878, edge: 0xb62a06, foam: 0xffc878, foamAmt: 0, alpha: 0.6, brk: 0.8, blending: THREE.AdditiveBlending },
  // TIDE-scheme flamethrower: the same roaring stream in gas-flame blue
  firecool: { core: 0x8fd4ff, edge: 0x0b3cb6, foam: 0x8fd4ff, foamAmt: 0, alpha: 0.6, brk: 0.8, blending: THREE.AdditiveBlending },
  // JERRY: black bilge. Cranky's pressurized tube in tar — near-black body
  // with a thin oily sheen for the highlight (a pure-black jet reads as a
  // hole in the world), and a LOW break-up so the burst stays one heavy
  // rope of goo instead of atomizing into spray like water does.
  tar: { core: 0x27231d, edge: 0x08080a, foam: 0x6a5a3e, foamAmt: 0.3, alpha: 0.86, brk: 0.34, blending: THREE.NormalBlending },
};

// Goo palettes. One tint object travels the whole life of a wad — trail
// drips in flight, the blotch stuck on whoever it hits, the puddle it leaves
// and the splat ring — so a new flavour of goo is one entry here rather than
// a colour argument threaded through five call sites.
export const GOO_TINTS = {
  // FROGGER: the acid-green gunk gun
  slime: { trail: 0x9fe23a, trail2: 0x3c7410, drip: 0x6cb022, drip2: 0x2c5210, blotch: 0x74bc24, puddle: 0x63a81e, ring: 0x6fae1e },
  // JERRY: black sticky bilge out of the cannon pods — same behaviour,
  // read as tar. Kept just off pure black so it still catches the light.
  bilge: { trail: 0x2b2820, trail2: 0x0c0c0e, drip: 0x1d1a15, drip2: 0x08080a, blotch: 0x14130f, puddle: 0x121110, ring: 0x2a2620 },
};
const _ja = new THREE.Vector3(), _jb = new THREE.Vector3(), _jt = new THREE.Vector3();

// ---------- shader point particle pool ----------
const VERT = /* glsl */`
  attribute float aSize;
  attribute vec4 aColor;   // rgb + alpha
  attribute vec2 aMisc;    // rotation angle, atlas cell index
  varying vec4 vColor;
  varying vec2 vMisc;
  void main() {
    vColor = aColor;
    vMisc = aMisc;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = -mv.z;
    // near-camera particles would explode into screen-filling sprites
    // (one droplet grazing the lens = a full white-out) — cull and cap
    gl_PointSize = d < 0.7 ? 0.0 : min(aSize * (240.0 / d), 240.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform vec2 uGrid;      // atlas columns, rows
  varying vec4 vColor;
  varying vec2 vMisc;
  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float cA = cos(vMisc.x), sA = sin(vMisc.x);
    pc = vec2(pc.x * cA - pc.y * sA, pc.x * sA + pc.y * cA);
    pc = clamp(pc + 0.5, 0.004, 0.996);
    vec2 cellXY = vec2(mod(vMisc.y, uGrid.x), floor(vMisc.y / uGrid.x));
    vec4 t = texture2D(uTex, (cellXY + pc) / uGrid);
    gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

class ParticlePool {
  constructor(scene, texture, { cap = 600, blending = THREE.AdditiveBlending, depthWrite = false, cols = 1, rows = 1 } = {}) {
    this.cap = cap;
    this.cols = cols;
    this.rows = rows;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.misc = new Float32Array(cap * 2); // angle, cell
    // particle sim state
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);     // remaining
    this.life0 = new Float32Array(cap);    // initial
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.baseCol = new Float32Array(cap * 3);
    this.endCol = new Float32Array(cap * 3); // color2: reached as life fades
    this.baseAlpha = new Float32Array(cap);
    this.baseSize = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.rot0 = new Float32Array(cap);
    this.spin = new Float32Array(cap);
    this.cell = new Float32Array(cap);     // base cell; -1 = flipbook anim
    this.fadeT = new Float32Array(cap);    // seconds of alpha ramp-in
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aMisc', new THREE.BufferAttribute(this.misc, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // skip culling

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: texture },
        uGrid: { value: new THREE.Vector2(cols, rows) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite,
      blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  // sprite-override intake: swap the texture (and atlas layout) in place
  setTexture(tex, cols = this.cols, rows = this.rows) {
    this.cols = cols;
    this.rows = rows;
    this.points.material.uniforms.uTex.value = tex;
    this.points.material.uniforms.uGrid.value.set(cols, rows);
  }

  emit(x, y, z, vx, vy, vz, {
    life = 1, size = 1, color = 0xffffff, color2 = null, alpha = 1,
    gravity = 0, drag = 0, grow = 0,
    cell = -2,        // -2 random cell, -1 flipbook anim over life, else fixed
    spin = 0,         // radians/sec (sign randomized here when nonzero)
    rot = null,       // start angle; default random
    fadeIn = 0.1,     // fraction of life spent ramping alpha IN (no popping)
  } = {}) {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.life0[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.grow[i] = grow;
    // emit() runs hundreds of times a frame during heavy fights — reuse two
    // module scratch Colors instead of allocating per particle
    const c = _emitCol.set(color);
    this.baseCol[i * 3] = c.r; this.baseCol[i * 3 + 1] = c.g; this.baseCol[i * 3 + 2] = c.b;
    const c2 = color2 === null ? c : _emitCol2.set(color2);
    this.endCol[i * 3] = c2.r; this.endCol[i * 3 + 1] = c2.g; this.endCol[i * 3 + 2] = c2.b;
    this.baseAlpha[i] = alpha;
    this.baseSize[i] = size;
    this.rot0[i] = rot === null ? rand(Math.PI * 2) : rot;
    this.spin[i] = spin ? spin * (Math.random() < 0.5 ? -1 : 1) : 0;
    const frames = this.cols * this.rows;
    this.cell[i] = cell === -2 ? (Math.random() * frames) | 0 : cell;
    this.fadeT[i] = Math.max(0.001, fadeIn * life);
  }

  update(dt) {
    const { cap, pos, vel, life, life0, grav, drag, col, size, misc,
      baseCol, endCol, baseAlpha, baseSize, grow, rot0, spin, cell, fadeT } = this;
    const frames = this.cols * this.rows;
    for (let i = 0; i < cap; i++) {
      if (life[i] <= 0) { col[i * 4 + 3] = 0; size[i] = 0; continue; }
      life[i] -= dt;
      const f = clamp01(life[i] / life0[i]);
      const age = life0[i] - life[i];
      vel[i * 3 + 1] -= grav[i] * dt;
      if (drag[i]) {
        const d = Math.max(0, 1 - drag[i] * dt);
        vel[i * 3] *= d; vel[i * 3 + 1] *= d; vel[i * 3 + 2] *= d;
      }
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const m = 1 - f; // 0 fresh -> 1 dying: ramp base color toward end color
      col[i * 4] = baseCol[i * 3] + (endCol[i * 3] - baseCol[i * 3]) * m;
      col[i * 4 + 1] = baseCol[i * 3 + 1] + (endCol[i * 3 + 1] - baseCol[i * 3 + 1]) * m;
      col[i * 4 + 2] = baseCol[i * 3 + 2] + (endCol[i * 3 + 2] - baseCol[i * 3 + 2]) * m;
      col[i * 4 + 3] = baseAlpha[i] * f * Math.min(1, age / fadeT[i]);
      size[i] = baseSize[i] * (1 + grow[i] * m);
      misc[i * 2] = rot0[i] + spin[i] * age;
      misc[i * 2 + 1] = cell[i] < 0
        ? Math.min(frames - 1, (m * frames) | 0)  // flipbook rides the lifetime
        : cell[i];
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aColor.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
    this.points.geometry.attributes.aMisc.needsUpdate = true;
  }
}

// ---------- sprite-override intake (chromakey capable) ----------
// public/sprites/manifest.json maps slots to files:
//   { "fire":    { "file": "fire_atlas.png",  "cols": 4, "rows": 4, "key": "luma" },
//     "smoke":   { "file": "smoke_atlas.png", "cols": 2, "rows": 2, "key": "#00ff00" },
//     "droplet": { "file": "droplet.png",     "key": "#00ff00" },
//     "goop":    { "file": "slime_atlas.png", "cols": 2, "rows": 2, "key": "#ff00ff" },
//     "ice":     { "file": "ice.png",         "key": "luma" } }
// key: "luma" (alpha from brightness — for additive sprites on black),
//      "#rrggbb" (chromakey that color with despill), or omit for real alpha.
async function loadKeyedTexture(url, cfg = {}) {
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const key = cfg.key || null;
  if (key) {
    const d = ctx.getImageData(0, 0, cv.width, cv.height);
    const p = d.data;
    if (key === 'luma') {
      for (let i = 0; i < p.length; i += 4) {
        p[i + 3] = Math.max(p[i], p[i + 1], p[i + 2]);
      }
    } else {
      const kr = parseInt(key.slice(1, 3), 16);
      const kg = parseInt(key.slice(3, 5), 16);
      const kb = parseInt(key.slice(5, 7), 16);
      const tol = (cfg.tolerance ?? 0.24) * 441;
      const soft = (cfg.softness ?? 0.22) * 441;
      for (let i = 0; i < p.length; i += 4) {
        const dr = p[i] - kr, dg = p[i + 1] - kg, db = p[i + 2] - kb;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        const a = clamp01((dist - tol) / soft);
        p[i + 3] = Math.min(p[i + 3], Math.round(a * 255));
        if (a < 1) { // despill: kill key-color fringing on soft edges
          if (kg >= kr && kg >= kb) p[i + 1] = Math.min(p[i + 1], Math.max(p[i], p[i + 2]));
          else if (kr >= kg && kr >= kb) p[i] = Math.min(p[i], Math.max(p[i + 1], p[i + 2]));
          else p[i + 2] = Math.min(p[i + 2], Math.max(p[i], p[i + 1]));
        }
      }
    }
    ctx.putImageData(d, 0, 0);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- expanding ring / beam / lightning pools ----------

class RingPool {
  constructor(scene, count = 12) {
    this.items = [];
    const tex = ringTexture();
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.items.push({ mesh, t: 0, dur: 0, from: 1, to: 10, color: 0xffffff });
    }
  }
  spawn(pos, { from = 1, to = 14, dur = 0.5, color = 0xffffff, y = 0.3, vertical = null } = {}) {
    const it = this.items.find((i) => !i.mesh.visible) || this.items[0];
    it.mesh.visible = true;
    it.mesh.position.copy(pos);
    it.mesh.position.y = pos.y + y;
    if (vertical) {
      it.mesh.rotation.set(0, Math.atan2(vertical.x, vertical.z), 0);
    } else {
      it.mesh.rotation.set(-Math.PI / 2, 0, 0);
    }
    it.mesh.material.color.set(color);
    it.t = 0; it.dur = dur; it.from = from; it.to = to;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.t += dt;
      const f = it.t / it.dur;
      if (f >= 1) { it.mesh.visible = false; continue; }
      const s = it.from + (it.to - it.from) * (1 - Math.pow(1 - f, 2.2));
      it.mesh.scale.set(s, s, s);
      it.mesh.material.opacity = 1 - f;
    }
  }
}

class BeamPool {
  constructor(scene, count = 10) {
    this.items = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1, 8, 1, true),
        new THREE.MeshBasicMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        })
      );
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.items.push({ mesh, t: 0, dur: 0, r: 1 });
    }
  }
  // beam between two points; radius shrinks & fades over dur
  spawn(from, to, { radius = 0.4, dur = 0.25, color = 0xffffff } = {}) {
    const it = this.items.find((i) => !i.mesh.visible) || this.items[0];
    const mesh = it.mesh;
    mesh.visible = true;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.scale.set(radius, len, radius);
    mesh.material.color.set(color);
    it.t = 0; it.dur = dur; it.r = radius;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.t += dt;
      const f = it.t / it.dur;
      if (f >= 1) { it.mesh.visible = false; continue; }
      it.mesh.material.opacity = 1 - f;
      it.mesh.scale.x = it.mesh.scale.z = it.r * (1 - f * 0.7);
    }
  }
}

// REAL bolts, not static: each bolt is a chain of glowing cylinder segments
// through jagged waypoints (thick, visible from any distance) with a hot
// white core, plus an optional thinner side-branch forking off a kink.
const SEGS = 7;
const _lv = new THREE.Vector3();
const _lup = new THREE.Vector3(0, 1, 0);
class LightningPool {
  constructor(scene, count = 14) {
    this.items = [];
    const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const core = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const segs = [];
      for (let s = 0; s < SEGS; s++) {
        const outer = new THREE.Mesh(geo, mat);
        const inner = new THREE.Mesh(geo, core);
        outer.renderOrder = 7;
        inner.renderOrder = 8;
        group.add(outer);
        group.add(inner);
        segs.push({ outer, inner });
      }
      group.visible = false;
      scene.add(group);
      this.items.push({ group, mat, core, segs, t: 0, dur: 0 });
    }
  }
  spawn(from, to, { color = 0x9fdcff, dur = 0.22, jag = 1.2, thick = 0.16, branch = true } = {}) {
    const it = this.items.find((i) => !i.group.visible) || this.items[0];
    it.group.visible = true;
    it.mat.color.set(color);
    it.t = 0; it.dur = dur;
    // jagged waypoints, offset mostly perpendicular to the strike line
    const dir = _lv.subVectors(to, from);
    const pts = [];
    for (let i = 0; i <= SEGS; i++) {
      const f = i / SEGS;
      const p = new THREE.Vector3().copy(from).addScaledVector(dir, f);
      if (i > 0 && i < SEGS) {
        p.x += rand(-jag, jag);
        p.y += rand(-jag * 0.5, jag * 0.5);
        p.z += rand(-jag, jag);
      }
      pts.push(p);
    }
    for (let s = 0; s < SEGS; s++) {
      const a = pts[s], b = pts[s + 1];
      const seg = it.segs[s];
      const d = new THREE.Vector3().subVectors(b, a);
      const len = d.length() || 0.001;
      for (const [mesh, r] of [[seg.outer, thick], [seg.inner, thick * 0.38]]) {
        mesh.position.copy(a).addScaledVector(d, 0.5);
        mesh.quaternion.setFromUnitVectors(_lup, d.clone().normalize());
        mesh.scale.set(r, len, r);
      }
    }
    // one thinner fork off a random kink sells the "real lightning" read
    if (branch && jag > 0.5) {
      const k = pts[1 + ((Math.random() * (SEGS - 2)) | 0)];
      const end = k.clone().add(new THREE.Vector3(rand(-jag, jag) * 2.2, -Math.abs(rand(jag, jag * 2.5)), rand(-jag, jag) * 2.2));
      this.spawn(k, end, { color: it.mat.color.getHex(), dur: dur * 0.8, jag: jag * 0.45, thick: thick * 0.55, branch: false });
    }
    return it;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.group.visible) continue;
      it.t += dt;
      if (it.t >= it.dur) { it.group.visible = false; continue; }
      const o = 1 - it.t / it.dur;
      it.mat.opacity = o * 0.85;
      it.core.opacity = o;
    }
  }
}

// ---------- main FX facade ----------

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new ParticlePool(scene, sparkTexture(), { cap: 900 });
    this.glows = new ParticlePool(scene, softCircleTexture(), { cap: 500 });
    this.smoke = new ParticlePool(scene, smokeCellsTexture(), {
      cap: 450, blending: THREE.NormalBlending, cols: 2, rows: 2,
    });
    // liquids: normally-blended so water/slime read as MATTER, with baked
    // specular shine (additive glows always read as light)
    this.drops = new ParticlePool(scene, dropletTexture(), {
      cap: 700, blending: THREE.NormalBlending,
    });
    this.goop = new ParticlePool(scene, goopCellsTexture(), {
      cap: 300, blending: THREE.NormalBlending, cols: 2, rows: 2,
    });
    // fire: 16-frame looping turbulence flipbook — flames LICK, not fade
    this.flames = new ParticlePool(scene, flameAtlasTexture(), {
      cap: 400, cols: 4, rows: 4,
    });
    this.ice = new ParticlePool(scene, iceTexture(), { cap: 200 });
    // digital corruption fragments (NULLBOT): hard square pixel clusters
    this.pixels = new ParticlePool(scene, glitchCellsTexture(), {
      cap: 600, cols: 2, rows: 2,
    });
    this.rings = new RingPool(scene);
    this.beams = new BeamPool(scene);
    this.lightning = new LightningPool(scene);
    this.streams = new Map(); // key -> live jet tube (hose, flamethrower)
    this.puddles = [];        // ground decals: slime splats, wet patches
    this.blotches = [];       // goo splats STUCK to fighters
    this.glitchPatches = [];  // 2D corruption patches pinned to hit body parts
    this._glitchPatchPool = [];
    this._puddlePool = [];
    this._blotchPool = [];
    this.statics = []; // {f, t, tick} — crackle lingering on shocked bots
    this.shake = 0;         // camera shake accumulator (read by camera)
    this.flash = null;      // {color, t} full-screen flash (read by hud)
    this._loadSpriteOverrides();
  }

  // optional hand-made sprites drop in via public/sprites/manifest.json;
  // absent or broken -> the procedural textures above simply stay.
  // Per-slot outcomes land in this.spriteStatus for debugging.
  async _loadSpriteOverrides() {
    this.spriteStatus = {};
    try {
      const res = await fetch('/sprites/manifest.json');
      if (!res.ok) { this.spriteStatus._manifest = 'http ' + res.status; return; }
      const man = await res.json();
      const slots = {
        fire: this.flames, smoke: this.smoke, droplet: this.drops,
        goop: this.goop, ice: this.ice, spark: this.sparks, glow: this.glows,
      };
      for (const [slot, cfg] of Object.entries(man)) {
        const pool = slots[slot];
        if (!pool || !cfg?.file) continue;
        try {
          const tex = await loadKeyedTexture('/sprites/' + cfg.file, cfg);
          pool.setTexture(tex, cfg.cols || 1, cfg.rows || 1);
          this.spriteStatus[slot] = 'ok';
        } catch (e) {
          this.spriteStatus[slot] = String(e).slice(0, 120); // keep procedural
        }
      }
    } catch (e) {
      this.spriteStatus._manifest = String(e).slice(0, 120); // fully procedural
    }
  }

  addShake(amount) { this.shake = Math.min(2.2, this.shake + amount); }

  // ---- composite effects ----
  impactSparks(pos, color = 0xffcf7a, n = 14, power = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), b = rand(-0.6, 1.2);
      const sp = rand(0.3, 1) * power;
      this.sparks.emit(pos.x, pos.y, pos.z,
        Math.cos(a) * sp, b * sp * 0.7, Math.sin(a) * sp,
        { life: rand(0.2, 0.5), size: rand(0.5, 1.1), color, gravity: 22, drag: 1.5, fadeIn: 0.02 });
    }
  }

  blockSpark(pos, color = 0x6cc8ff) {
    this.impactSparks(pos, color, 10, 7);
    this.rings.spawn(pos, { from: 0.5, to: 4, dur: 0.3, color, y: pos.y, vertical: null });
  }

  muzzleFlash(pos, color = 0xffd27a) {
    this.glows.emit(pos.x, pos.y, pos.z, 0, 0, 0,
      { life: 0.08, size: rand(2.2, 3.2), color, alpha: 0.9, fadeIn: 0.02 });
  }

  explosion(pos, radius = 5, { color = 0xffa040, smoke = true, sparks = true, ring = true, flash = true } = {}) {
    if (flash) {
      this.glows.emit(pos.x, pos.y + 0.5, pos.z, 0, 0, 0,
        { life: 0.14, size: radius * 2.2, color: 0xfff2d0, alpha: 1, fadeIn: 0.02 });
      // rolling FIREBALL: licking flipbook cells shouldering out of the flash
      for (let i = 0; i < Math.min(6, 2 + radius); i++) {
        const a = rand(Math.PI * 2), r = rand(0.2, radius * 0.35);
        this.flames.emit(pos.x + Math.cos(a) * r, pos.y + rand(0.3, 1.2), pos.z + Math.sin(a) * r,
          Math.cos(a) * rand(2, 5), rand(2.5, 6), Math.sin(a) * rand(2, 5),
          { life: rand(0.35, 0.6), size: radius * rand(0.55, 0.9), color: 0xffd9a0, color2: 0x8a1f06,
            alpha: 0.95, cell: -1, spin: 1.4, grow: 2, drag: 1.8, gravity: -4, fadeIn: 0.05 });
      }
    }
    if (sparks) {
      const n = Math.min(40, 10 + radius * 4);
      for (let i = 0; i < n; i++) {
        const a = rand(Math.PI * 2), e = rand(0.1, 1.3);
        const sp = rand(0.4, 1) * radius * 3.2;
        this.sparks.emit(pos.x, pos.y + 0.5, pos.z,
          Math.cos(a) * sp * Math.cos(e), Math.sin(e) * sp, Math.sin(a) * sp * Math.cos(e),
          { life: rand(0.3, 0.8), size: rand(0.6, 1.4), color: 0xffc060, gravity: 26, drag: 1.2, fadeIn: 0.02 });
      }
    }
    if (smoke) {
      const n = Math.min(22, 6 + radius * 2.5);
      for (let i = 0; i < n; i++) {
        const a = rand(Math.PI * 2), r = rand(0.2, radius * 0.5);
        this.smoke.emit(pos.x + Math.cos(a) * r, pos.y + rand(0.2, 1.5), pos.z + Math.sin(a) * r,
          Math.cos(a) * rand(1, 4), rand(2, 6), Math.sin(a) * rand(1, 4),
          { life: rand(0.8, 1.8), size: rand(2.5, 4.5), color: 0x35302e, color2: 0x181819,
            alpha: 0.6, drag: 1.4, grow: 2.2, spin: 0.7, fadeIn: 0.2 });
      }
    }
    if (ring) this.rings.spawn(pos, { from: radius * 0.25, to: radius * 2.1, dur: 0.45, color: 0xffd9a0 });
  }

  dustPuff(pos, n = 8, color = 0x8a8378) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2);
      this.smoke.emit(pos.x + Math.cos(a) * rand(0.5), pos.y + 0.3, pos.z + Math.sin(a) * rand(0.5),
        Math.cos(a) * rand(1.5, 4), rand(0.5, 2), Math.sin(a) * rand(1.5, 4),
        { life: rand(0.5, 1.1), size: rand(1.6, 3), color, alpha: 0.45, drag: 2, grow: 1.6, spin: 0.9, fadeIn: 0.15 });
    }
  }

  jetTrail(pos, vel, color) {
    this.glows.emit(pos.x, pos.y, pos.z, -vel.x * 0.1, -vel.y * 0.1, -vel.z * 0.1,
      { life: 0.25, size: rand(0.8, 1.4), color, alpha: 0.8, drag: 2, fadeIn: 0.05 });
  }

  dashTrail(pos, color, scale = 1) {
    this.glows.emit(pos.x + rand(-0.5, 0.5), pos.y + rand(0.5, 3) * scale, pos.z + rand(-0.5, 0.5),
      0, 0, 0, { life: 0.3, size: rand(1.5, 2.6) * scale, color, alpha: 0.5, fadeIn: 0.05 });
  }

  // one tick of REAL flame: flipbook tongues that LICK through their loop
  // as they cool white->orange->deep red, embers, and smoke off the tip
  fire(origin, dir, speed = 26, spread = 0.3, cool = false) {
    // core: hot, brief, fast frames
    const c = dir.clone();
    c.x += rand(-spread * 0.5, spread * 0.5);
    c.y += rand(-spread * 0.3, spread * 0.3);
    c.z += rand(-spread * 0.5, spread * 0.5);
    c.normalize().multiplyScalar(speed * rand(0.85, 1.05));
    this.flames.emit(origin.x, origin.y, origin.z, c.x, c.y, c.z,
      { life: rand(0.22, 0.34), size: rand(1.4, 2.1),
        color: cool ? 0xd8f2ff : 0xffefc0, color2: cool ? 0x2f8cff : 0xff7a14,
        alpha: 0.95, cell: -1, spin: 1.2, drag: 2, grow: 2, gravity: -5, fadeIn: 0.08 });
    // body: bigger licking tongues, buoyant, swelling as they cool
    for (let i = 0; i < 2; i++) {
      const d = dir.clone();
      d.x += rand(-spread, spread); d.y += rand(-spread * 0.6, spread * 0.6); d.z += rand(-spread, spread);
      d.normalize().multiplyScalar(speed * rand(0.55, 0.95));
      this.flames.emit(origin.x, origin.y, origin.z, d.x, d.y, d.z,
        { life: rand(0.38, 0.68), size: rand(1.9, 3.1),
          color: cool ? 0x64b4ff : 0xffab3c, color2: cool ? 0x0a2470 : 0x6e1804,
          alpha: 0.88, cell: -1, spin: 1.6, drag: 2.4, grow: 3.2, gravity: -7, fadeIn: 0.1 });
    }
    // embers: tiny hot flecks tumbling out of the stream
    if (Math.random() < 0.35) {
      this.sparks.emit(origin.x, origin.y, origin.z,
        dir.x * speed * 0.7 + rand(-3, 3), dir.y * speed * 0.7 + rand(0, 4), dir.z * speed * 0.7 + rand(-3, 3),
        { life: rand(0.4, 0.8), size: rand(0.3, 0.6),
          color: cool ? 0x9fdcff : 0xffb060, color2: cool ? 0x1f78ff : 0xff4010, gravity: 9, drag: 1, fadeIn: 0.02 });
    }
    // smoke shears off past the flame tip and climbs, tumbling
    if (Math.random() < 0.7) {
      const reach = rand(3, 5);
      this.smoke.emit(origin.x + dir.x * reach, origin.y + dir.y * reach + rand(0.3, 1), origin.z + dir.z * reach,
        dir.x * 7 + rand(-1, 1), 3.5 + rand(0, 2.5), dir.z * 7 + rand(-1, 1),
        { life: rand(0.9, 1.6), size: rand(1.8, 3), color: 0x232120, color2: 0x121213,
          alpha: 0.55, drag: 1.6, grow: 3, spin: 0.8, fadeIn: 0.3 });
    }
  }

  flameCone(origin, dir, color = 0xff7a20, spread = 0.3, speed = 26) {
    this.fire(origin, dir, speed, spread);
  }

  snowCone(origin, dir, speed = 30) {
    // crystalline sparkles riding the beam + frosty vapor
    for (let i = 0; i < 2; i++) {
      const d = dir.clone();
      d.x += rand(-0.18, 0.18); d.y += rand(-0.12, 0.12); d.z += rand(-0.18, 0.18);
      d.normalize().multiplyScalar(speed * rand(0.7, 1));
      this.ice.emit(origin.x, origin.y, origin.z, d.x, d.y, d.z,
        { life: rand(0.25, 0.5), size: rand(0.8, 1.5), color: 0xcfeeff, alpha: 0.9,
          spin: 3, drag: 1.8, fadeIn: 0.05 });
    }
    if (Math.random() < 0.5) {
      this.smoke.emit(origin.x + dir.x * 2, origin.y + dir.y * 2, origin.z + dir.z * 2,
        dir.x * speed * 0.5, dir.y * speed * 0.5, dir.z * speed * 0.5,
        { life: rand(0.3, 0.55), size: rand(1.2, 2), color: 0xdff2ff, alpha: 0.22,
          drag: 2.2, grow: 2.2, spin: 1, fadeIn: 0.2 });
    }
  }

  firePatch(pos, radius = 2.2) {
    // one tick of ground-fire visuals; caller re-invokes while patch lives
    for (let i = 0; i < 2; i++) {
      const a = rand(Math.PI * 2), r = rand(0, radius);
      this.flames.emit(pos.x + Math.cos(a) * r, pos.y + 0.15, pos.z + Math.sin(a) * r,
        rand(-0.5, 0.5), rand(2.5, 5), rand(-0.5, 0.5),
        { life: rand(0.35, 0.6), size: rand(1.1, 2), color: 0xffd070, color2: 0x8a2408,
          alpha: 0.9, cell: -1, spin: 1, drag: 1, grow: 2, fadeIn: 0.1 });
    }
    if (Math.random() < 0.4) {
      const a = rand(Math.PI * 2), r = rand(0, radius * 0.8);
      this.smoke.emit(pos.x + Math.cos(a) * r, pos.y + 1.2, pos.z + Math.sin(a) * r,
        rand(-0.6, 0.6), rand(2.5, 4.5), rand(-0.6, 0.6),
        { life: rand(0.9, 1.6), size: rand(1.4, 2.4), color: 0x1d1c1b, alpha: 0.42,
          drag: 1.2, grow: 2.6, spin: 0.7, fadeIn: 0.3 });
    }
    if (Math.random() < 0.25) {
      this.sparks.emit(pos.x + rand(-radius, radius), pos.y + 0.4, pos.z + rand(-radius, radius),
        rand(-2, 2), rand(4, 8), rand(-2, 2),
        { life: rand(0.4, 0.8), size: rand(0.3, 0.5), color: 0xffb060, color2: 0xff4010, gravity: 10, drag: 0.8, fadeIn: 0.02 });
    }
  }

  // one tick of pressurized WATER: glinting beads riding the jet with foam
  // sparkle and fine mist
  waterJet(origin, dir, speed = 38) {
    for (let i = 0; i < 6; i++) {
      const s = speed * rand(0.85, 1.15);
      this.drops.emit(origin.x, origin.y, origin.z,
        (dir.x + rand(-0.06, 0.06)) * s, (dir.y + rand(-0.04, 0.06)) * s + 1.5, (dir.z + rand(-0.06, 0.06)) * s,
        { life: rand(0.45, 0.7), size: rand(0.45, 1.05), color: 0xffffff, color2: 0x9cc4ec,
          alpha: 0.95, gravity: 26, drag: 0.25, spin: 2, fadeIn: 0.04 });
    }
    // foam: soft flecks give the stream its wet sparkle (kept dim — foam
    // brightness is what blows the bloom out)
    this.glows.emit(origin.x + dir.x * rand(1, 3), origin.y + dir.y * rand(1, 3), origin.z + dir.z * rand(1, 3),
      dir.x * speed * 0.8, dir.y * speed * 0.8 + 1, dir.z * speed * 0.8,
      { life: rand(0.2, 0.35), size: rand(0.25, 0.5), color: 0xcfe4f0, alpha: 0.3, gravity: 20, fadeIn: 0.02 });
    if (Math.random() < 0.35) {
      this.smoke.emit(origin.x + dir.x * 4, origin.y + dir.y * 4 + rand(0.5), origin.z + dir.z * 4,
        dir.x * 9, 1.5 + rand(1.5), dir.z * 9,
        { life: rand(0.4, 0.7), size: rand(1.2, 2), color: 0xe4f2fc, alpha: 0.15,
          drag: 1.2, grow: 2.2, spin: 1, fadeIn: 0.25 });
    }
  }

  // water burst: crown of glinting droplets + foam + a breath of mist
  splash(pos, n = 10, power = 8, up = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), sp = rand(0.4, 1) * power;
      this.drops.emit(pos.x, pos.y, pos.z,
        Math.cos(a) * sp, rand(0.6, 1.4) * power * up, Math.sin(a) * sp,
        { life: rand(0.4, 0.8), size: rand(0.45, 1.05), color: 0xffffff, color2: 0x9cc4ec,
          alpha: 0.95, gravity: 28, drag: 0.3, spin: 2.5, fadeIn: 0.04 });
    }
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      const a = rand(Math.PI * 2);
      this.glows.emit(pos.x, pos.y + 0.2, pos.z,
        Math.cos(a) * power * 0.5, rand(0.8, 1.3) * power * up, Math.sin(a) * power * 0.5,
        { life: rand(0.2, 0.4), size: rand(0.25, 0.5), color: 0xcfe4f0, alpha: 0.3, gravity: 26, fadeIn: 0.02 });
    }
    this.smoke.emit(pos.x, pos.y + 0.4, pos.z, 0, power * 0.35, 0,
      { life: rand(0.4, 0.7), size: rand(1.4, 2.2), color: 0xe4f2fc, alpha: 0.14,
        drag: 1.5, grow: 2.4, spin: 1, fadeIn: 0.25 });
  }

  // thick GOOP: lumpy glossy globs tumbling slow and heavy, stringy drips,
  // and a splat ring when it lands hard. `tint` picks the flavour (green
  // slime by default, JERRY's black bilge with GOO_TINTS.bilge).
  slime(pos, n = 8, power = 6, dir = null, tint = GOO_TINTS.slime) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), sp = rand(0.3, 1) * power;
      const vx = dir ? dir.x * power + Math.cos(a) * sp * 0.4 : Math.cos(a) * sp;
      const vz = dir ? dir.z * power + Math.sin(a) * sp * 0.4 : Math.sin(a) * sp;
      this.goop.emit(pos.x, pos.y, pos.z,
        vx, rand(0.2, 1) * power * 0.8 + (dir ? dir.y * power : 0), vz,
        { life: rand(0.6, 1), size: rand(1.4, 2.6), color: tint.trail, color2: tint.trail2,
          alpha: 0.96, gravity: 18, drag: 0.6, grow: 0.5, spin: 1.2, fadeIn: 0.06 });
    }
    // stringy drips falling out of the mass
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      this.goop.emit(pos.x + rand(-0.6, 0.6), pos.y + rand(-0.3, 0.3), pos.z + rand(-0.6, 0.6),
        rand(-1, 1), rand(-2, 0), rand(-1, 1),
        { life: rand(0.5, 0.8), size: rand(0.5, 0.9), color: tint.drip, color2: tint.drip2,
          alpha: 0.96, gravity: 22, spin: 0.8, fadeIn: 0.05 });
    }
    if (power >= 6) {
      this.rings.spawn(pos.clone().setY(Math.max(0.02, pos.y - 1)), { from: 0.3, to: power * 0.45, dur: 0.35, color: tint.ring, y: 0.08 });
    }
  }

  steamVent(pos, dir = null) {
    const d = dir || { x: 0, y: 1, z: 0 };
    this.smoke.emit(pos.x, pos.y, pos.z,
      d.x * rand(2, 4) + rand(-0.4, 0.4), d.y * rand(3, 6), d.z * rand(2, 4) + rand(-0.4, 0.4),
      { life: rand(1, 2), size: rand(1.4, 2.4), color: 0xcfd4da, alpha: 0.22,
        drag: 1.2, grow: 2.8, spin: 0.6, fadeIn: 0.3 });
  }

  healGlow(pos, color) {
    this.glows.emit(pos.x + rand(-1, 1), pos.y + rand(0, 4), pos.z + rand(-1, 1),
      0, 3, 0, { life: 0.5, size: 1.2, color, alpha: 0.8, drag: 1, fadeIn: 0.15 });
  }

  // ---- coherent jets: call every weapon tick; the tube persists and
  // rebuilds along the live ballistic arc, dying ~0.15s after the last
  // call. Returns the arc's end point (for splashes/puddles at landing).
  jet(key, from, dir, { type = 'water', speed = 42, range = 20, gravity = 28, r0 = 0.15, r1 = 0.6 } = {}) {
    let e = this.streams.get(key);
    if (!e) {
      const style = JET_STYLES[type];
      const geo = new THREE.BufferGeometry();
      const verts = new Float32Array((JET_SEG + 1) * JET_SIDES * 3);
      const uvs = new Float32Array((JET_SEG + 1) * JET_SIDES * 2);
      const idx = [];
      for (let i = 0; i < JET_SEG; i++) {
        for (let s = 0; s < JET_SIDES; s++) {
          const a = i * JET_SIDES + s, b = i * JET_SIDES + ((s + 1) % JET_SIDES);
          const c = (i + 1) * JET_SIDES + s, d = (i + 1) * JET_SIDES + ((s + 1) % JET_SIDES);
          idx.push(a, c, b, b, c, d);
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: streamNoiseTexture() },
          uTime: { value: rand(0, 10) },
          uCore: { value: new THREE.Color(style.core) },
          uEdge: { value: new THREE.Color(style.edge) },
          uFoam: { value: new THREE.Color(style.foam ?? style.core) },
          uFoamAmt: { value: style.foamAmt ?? 0 },
          uAlpha: { value: style.alpha },
          uBreak: { value: style.brk },
        },
        vertexShader: STREAM_VERT,
        fragmentShader: STREAM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: style.blending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      e = { mesh, mat, ttl: 0, alpha: style.alpha };
      this.streams.set(key, e);
    }
    e.ttl = 0.16;
    e.mesh.visible = true;
    // ballistic arc: fly until range is spent or the stream meets the dirt
    const vx = dir.x * speed, vy0 = dir.y * speed, vz = dir.z * speed;
    let tEnd = range / speed;
    if (gravity > 0) {
      const tGround = (vy0 + Math.sqrt(Math.max(0, vy0 * vy0 + 2 * gravity * from.y))) / gravity;
      tEnd = Math.min(tEnd, Math.max(0.08, tGround));
    }
    const pos = e.mesh.geometry.attributes.position.array;
    const uv = e.mesh.geometry.attributes.uv.array;
    let end = null;
    for (let i = 0; i <= JET_SEG; i++) {
      const u = i / JET_SEG, t = tEnd * u;
      _ja.set(from.x + vx * t, Math.max(0.05, from.y + vy0 * t - 0.5 * gravity * t * t), from.z + vz * t);
      if (i === JET_SEG) end = _ja.clone();
      // frame: tangent + two perpendiculars
      _jt.set(vx, vy0 - gravity * t, vz).normalize();
      _jb.set(-_jt.z, 0, _jt.x).normalize();
      const upx = _jt.y * _jb.z - _jt.z * _jb.y,
        upy = _jt.z * _jb.x - _jt.x * _jb.z,
        upz = _jt.x * _jb.y - _jt.y * _jb.x;
      const r = r0 + (r1 - r0) * u;
      for (let s = 0; s < JET_SIDES; s++) {
        const a = (s / JET_SIDES) * Math.PI * 2;
        const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        const vi = (i * JET_SIDES + s) * 3;
        pos[vi] = _ja.x + _jb.x * ca + upx * sa;
        pos[vi + 1] = _ja.y + _jb.y * ca + upy * sa;
        pos[vi + 2] = _ja.z + _jb.z * ca + upz * sa;
        const ui = (i * JET_SIDES + s) * 2;
        uv[ui] = u;
        uv[ui + 1] = s / JET_SIDES;
      }
    }
    e.mesh.geometry.attributes.position.needsUpdate = true;
    e.mesh.geometry.attributes.uv.needsUpdate = true;
    return end;
  }

  // ---- ground decals: slime puddles and wet splash patches ----
  // `color` overrides the puddle tint (a black bilge splat uses the same
  // goop-cell decal as green slime, just in tar) — see GOO_TINTS.
  puddle(pos, { slime = false, size = null, life = null, color = null } = {}) {
    let m = this._puddlePool.pop();
    if (!m) {
      m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      this.scene.add(m);
    }
    const tex = slime ? goopCellsTexture().clone() : softCircleTexture().clone();
    if (slime) {
      tex.repeat.set(0.5, 0.5);
      tex.offset.set(Math.random() < 0.5 ? 0 : 0.5, Math.random() < 0.5 ? 0 : 0.5);
      tex.flipY = false;
    }
    tex.needsUpdate = true;
    m.material.map = tex;
    m.material.color.set(color ?? (slime ? 0x63a81e : 0x39638c));
    m.material.opacity = slime ? 0.88 : 0.42;
    m.material.needsUpdate = true;
    const s = size || (slime ? rand(2.2, 3.6) : rand(2.6, 3.6));
    m.scale.set(s, s * rand(0.75, 1), 1);
    m.rotation.z = rand(Math.PI * 2);
    m.position.set(pos.x, 0.05 + rand(0, 0.02), pos.z);
    m.visible = true;
    this.puddles.push({ mesh: m, t: 0, life: life || (slime ? 9 : 3.5), o0: m.material.opacity });
    return m;
  }

  // ---- goo blotches SPLATTED onto a fighter's body; drip while they ride ----
  // opts: joint (default torso), y0/y1 local height band, size mult, life
  blotchOn(fighter, color = 0x74bc24, { joint = 'torso', y0 = 0.2, y1 = 1.4, size = 1, life = null, r = null } = {}) {
    const bone = fighter.mech?.joints?.[joint];
    if (!bone) return;
    let m = this._blotchPool.pop();
    if (!m) {
      m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.renderOrder = 3;
    }
    const tex = goopCellsTexture().clone();
    tex.repeat.set(0.5, 0.5);
    tex.offset.set(Math.random() < 0.5 ? 0 : 0.5, Math.random() < 0.5 ? 0 : 0.5);
    tex.flipY = false;
    tex.needsUpdate = true;
    m.material.map = tex;
    m.material.color.set(color);
    m.material.opacity = 0.95;
    m.material.needsUpdate = true;
    const s = fighter.scale * rand(1.1, 1.9) * size;
    m.scale.set(s, s, 1);
    // slap it on the shell at a random spot, facing outward-ish
    const a = rand(Math.PI * 2);
    const rr = r ?? fighter.hitRadius * 0.55;
    m.position.set(Math.sin(a) * rr, rand(y0, y1) * fighter.scale, Math.cos(a) * rr);
    m.rotation.set(0, a, rand(Math.PI * 2));
    bone.add(m);
    m.visible = true;
    this.blotches.push({ mesh: m, f: fighter, t: 0, life: life ?? rand(5, 7) });
  }

  // bury a fighter under gunk: blotches slapped over EVERY major body part
  // (torso, head, both arms, both legs) until nothing clean shows — used by
  // FROGGER's finisher to fully mummify the mark before the stomp
  slimeCoat(fighter, color = 0x74bc24, life = 9) {
    const R = fighter.hitRadius;
    const spots = [
      { joint: 'torso', n: 5, y0: 0.1, y1: 2.0, r: R * 0.55, size: 1.5 },
      { joint: 'torso', n: 3, y0: 1.4, y1: 2.4, r: R * 0.45, size: 1.2 },
      { joint: 'head', n: 2, y0: -0.1, y1: 0.5, r: R * 0.3, size: 0.9 },
      { joint: 'shoulderL', n: 2, y0: -1.2, y1: 0, r: R * 0.28, size: 0.9 },
      { joint: 'shoulderR', n: 2, y0: -1.2, y1: 0, r: R * 0.28, size: 0.9 },
      { joint: 'thighL', n: 2, y0: -1.4, y1: 0, r: R * 0.3, size: 1 },
      { joint: 'thighR', n: 2, y0: -1.4, y1: 0, r: R * 0.3, size: 1 },
    ];
    for (const sp of spots) {
      for (let i = 0; i < sp.n; i++) {
        this.blotchOn(fighter, color, {
          joint: sp.joint, y0: sp.y0, y1: sp.y1, r: sp.r,
          size: sp.size, life: life + rand(-1, 1.5),
        });
      }
    }
  }

  // ---- digital corruption (NULLBOT) ----
  // one flickering corruption fragment pinned near a surface: pops in
  // axis-aligned, barely drifts, dies in a frame or three — a body dressed
  // in a steady stream of these reads as PART GLITCH, not on fire
  glitchFleck(x, y, z, size = 1) {
    this.pixels.emit(x, y, z, rand(-0.5, 0.5), rand(-0.2, 0.7), rand(-0.5, 0.5), {
      life: rand(0.07, 0.2), size: size * rand(0.7, 1.5), color: glitchColor(),
      alpha: 0.95, fadeIn: 0.01, rot: Math.random() < 0.85 ? 0 : Math.PI / 2,
    });
  }

  // corruption burst: square data-shards tear OUT of the impact point in a
  // strobing cloud, plus a hard white core block — the "bit of them turned
  // into glitch" beat when a NULLBOT hit lands
  glitchBurst(pos, n = 12, power = 7, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), e = rand(-0.5, 1);
      const sp = rand(0.25, 1) * power;
      this.pixels.emit(pos.x, pos.y, pos.z,
        Math.cos(a) * sp, e * sp * 0.6, Math.sin(a) * sp,
        { life: rand(0.14, 0.38), size: size * rand(0.6, 1.6), color: glitchColor(),
          alpha: 0.95, drag: 2.2, fadeIn: 0.01, rot: Math.random() < 0.85 ? 0 : Math.PI / 2 });
    }
    this.pixels.emit(pos.x, pos.y, pos.z, 0, 0, 0,
      { life: 0.12, size: size * 2.2, color: 0xffffff, alpha: 0.95, fadeIn: 0.01, rot: 0 });
  }

  // ---- localized rendering failure: a patch of 2D corruption (JPEG
  // macroblocks / RGB channel-split bars / TV static) pinned to the EXACT
  // body part a NULLBOT hit landed on. Pure screen-space artifacts:
  // depth-test OFF, so they always draw ON TOP of the character — visible
  // from the back, through the mech's own plating, from any angle. Each
  // patch flickers on a hard duty cycle, jitters, stretches and re-tiles
  // a new sub-window of the noise sheet every few frames, and part of the
  // time it "decodes" in the colors of the armor it's obscuring (opts.
  // colors — the victim's palette), like smeared displaced texture data.
  // life=Infinity patches persist until clearGlitchOn(fighter). ----
  glitchOn(fighter, { joint = 'torso', x = 0, y = 0, z = 0, size = 1, life = Infinity, colors = null } = {}) {
    const bone = fighter.mech?.joints?.[joint];
    if (!bone) return null;
    let spr = this._glitchPatchPool.pop();
    if (!spr) {
      spr = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true, depthWrite: false, depthTest: false,
      }));
      spr.renderOrder = 9; // over the mech, the particles, everything
    }
    const tex = glitchNoiseTexture((Math.random() * 3) | 0).clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    spr.material.map = tex;
    spr.material.opacity = 1;
    spr.material.needsUpdate = true;
    bone.add(spr);
    spr.visible = true;
    const p = {
      spr, f: fighter, base: { x, y, z }, size: size * (fighter.scale || 1),
      t: 0, life, tick: 0,
      colors: colors || (fighter.def ? [fighter.def.colors.primary, fighter.def.colors.accent, fighter.def.colors.glow] : null),
      line: Math.random() < 0.4, // torn scanline strip vs macroblock patch
    };
    this._restyleGlitchPatch(p);
    this.glitchPatches.push(p);
    return p;
  }

  _restyleGlitchPatch(p) {
    const m = p.spr.material.map;
    if (p.line) { // a torn horizontal scanline: long, razor thin
      m.repeat.set(rand(0.5, 1), rand(0.05, 0.14));
      p.spr.scale.set(p.size * rand(1.1, 2.2), p.size * rand(0.07, 0.18), 1);
    } else { // block of compression noise
      m.repeat.set(rand(0.35, 0.85), rand(0.3, 0.75));
      p.spr.scale.set(p.size * rand(0.7, 1.35), p.size * rand(0.45, 1.0), 1);
    }
    m.offset.set(Math.random(), Math.random());
    p.spr.position.set(
      p.base.x + rand(-0.15, 0.15) * p.size,
      p.base.y + rand(-0.15, 0.15) * p.size,
      p.base.z + rand(-0.1, 0.1) * p.size);
    // decode modes: raw static, smeared BODY-color data, or one hard channel
    const r = Math.random();
    if (r < 0.45 || !p.colors) p.spr.material.color.setHex(0xffffff);
    else if (r < 0.78) p.spr.material.color.setHex(p.colors[(Math.random() * p.colors.length) | 0]);
    else p.spr.material.color.setHex(glitchColor());
  }

  _dropGlitchPatch(i) {
    const p = this.glitchPatches[i];
    p.spr.parent?.remove(p.spr);
    p.spr.material.map?.dispose();
    p.spr.material.map = null;
    p.spr.visible = false;
    this.glitchPatches.splice(i, 1);
    this._glitchPatchPool.push(p.spr);
  }

  clearGlitchOn(fighter) {
    for (let i = this.glitchPatches.length - 1; i >= 0; i--) {
      if (this.glitchPatches[i].f === fighter) this._dropGlitchPatch(i);
    }
  }

  // lingering electrical crackle on a shocked bot: small arcs snap between
  // random points on the body while the charge bleeds off
  staticCling(fighter, dur = 1.1) {
    const cur = this.statics.find((s) => s.f === fighter);
    if (cur) { cur.t = Math.max(cur.t, dur); return; }
    this.statics.push({ f: fighter, t: dur, tick: 0 });
  }

  update(dt) {
    this.sparks.update(dt);
    this.glows.update(dt);
    this.smoke.update(dt);
    this.drops.update(dt);
    this.goop.update(dt);
    this.flames.update(dt);
    this.ice.update(dt);
    this.pixels.update(dt);
    this.rings.update(dt);
    this.beams.update(dt);
    this.lightning.update(dt);
    for (const [key, e] of this.streams) {
      e.mat.uniforms.uTime.value += dt;
      e.ttl -= dt;
      // quick fade instead of a hard cut when the trigger releases
      e.mat.uniforms.uAlpha.value = e.alpha * clamp01(e.ttl / 0.08);
      if (e.ttl <= -0.1) {
        e.mesh.visible = false;
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mat.dispose();
        this.streams.delete(key);
      }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.t += dt;
      const f = p.t / p.life;
      if (f >= 1) {
        p.mesh.visible = false;
        this.puddles.splice(i, 1);
        this._puddlePool.push(p.mesh);
        continue;
      }
      p.mesh.material.opacity = p.o0 * (f < 0.8 ? 1 : 1 - (f - 0.8) / 0.2);
    }
    for (let i = this.blotches.length - 1; i >= 0; i--) {
      const b = this.blotches[i];
      b.t += dt;
      const gone = b.t >= b.life || !b.f.group?.visible || b.mesh.parent === null;
      if (gone) {
        b.mesh.parent?.remove(b.mesh);
        b.mesh.visible = false;
        this.blotches.splice(i, 1);
        this._blotchPool.push(b.mesh);
        continue;
      }
      const f = b.t / b.life;
      b.mesh.material.opacity = 0.95 * (f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3);
      if (Math.random() < dt * 1.6) { // the goo DRIPS off them
        b.mesh.getWorldPosition(_ja);
        this.goop.emit(_ja.x, _ja.y, _ja.z, rand(-0.4, 0.4), -0.5, rand(-0.4, 0.4),
          { life: rand(0.4, 0.7), size: rand(0.4, 0.7), color: 0x6cb022, color2: 0x2c5210,
            alpha: 0.95, gravity: 20, fadeIn: 0.05 });
      }
    }
    for (let i = this.glitchPatches.length - 1; i >= 0; i--) {
      const p = this.glitchPatches[i];
      p.t += dt;
      if (p.t >= p.life || !p.f.group?.visible || !p.spr.parent) {
        this._dropGlitchPatch(i);
        continue;
      }
      p.tick -= dt;
      if (p.tick <= 0) {
        p.tick = rand(0.03, 0.14);
        // hard duty cycle: dead-off beats sell the flicker
        p.spr.visible = Math.random() < 0.85;
        if (p.spr.visible) this._restyleGlitchPatch(p);
      }
    }
    for (let i = this.statics.length - 1; i >= 0; i--) {
      const s = this.statics[i];
      s.t -= dt;
      if (s.t <= 0 || !s.f.group?.visible) { this.statics.splice(i, 1); continue; }
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.07;
        const f = s.f, r = f.hitRadius * 0.8;
        const a1 = rand(Math.PI * 2), a2 = a1 + rand(1, Math.PI);
        const p1 = new THREE.Vector3(f.pos.x + Math.cos(a1) * r, f.pos.y + rand(0.2, f.height), f.pos.z + Math.sin(a1) * r);
        const p2 = new THREE.Vector3(f.pos.x + Math.cos(a2) * r, f.pos.y + rand(0.2, f.height), f.pos.z + Math.sin(a2) * r);
        this.lightning.spawn(p1, p2, { color: 0xcfefff, dur: 0.09, jag: 0.3, thick: 0.05, branch: false });
        if (Math.random() < 0.3) {
          this.sparks.emit(p1.x, p1.y, p1.z, rand(-2, 2), rand(1, 3), rand(-2, 2),
            { life: 0.25, size: 0.4, color: 0xcfefff, gravity: 10, fadeIn: 0.02 });
        }
      }
    }
    this.shake = Math.max(0, this.shake - dt * 3.2);
  }
}
