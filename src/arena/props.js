// Static arena props (non-destructible dressing placed around the fight zone).
// Each builder returns a THREE.Group. Kept chunky & readable from far away.
// A prop with a generated model in public/models/props/ (see propglb.js) has
// its visuals swapped for the GLB at placement — gameplay hooks stay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand, makeRng } from '../core/utils.js';
import { propGlbSwap } from './propglb.js';
import { pbrMaterial } from '../core/texload.js';
import { CONFIG } from '../core/config.js';

const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.85 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6, metalness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xa87c3c, roughness: 0.35, metalness: 0.9 }),
  copper: new THREE.MeshStandardMaterial({ color: 0x8c5230, roughness: 0.4, metalness: 0.85 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x6e4a30, roughness: 0.85, metalness: 0.4 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.9, metalness: 0.05 }),
  redPaint: new THREE.MeshStandardMaterial({ color: 0x9c3428, roughness: 0.55, metalness: 0.3 }),
  bluePaint: new THREE.MeshStandardMaterial({ color: 0x2e5e8c, roughness: 0.55, metalness: 0.3 }),
  yellowPaint: new THREE.MeshStandardMaterial({ color: 0xc8a028, roughness: 0.55, metalness: 0.3 }),
  glowWarm: new THREE.MeshStandardMaterial({ color: 0xffc060, emissive: 0xffc060, emissiveIntensity: 2 }),
  glowCyan: new THREE.MeshStandardMaterial({ color: 0x53e8ff, emissive: 0x53e8ff, emissiveIntensity: 2 }),
  glowRed: new THREE.MeshStandardMaterial({ color: 0xff4030, emissive: 0xff4030, emissiveIntensity: 2 }),
  glowLava: new THREE.MeshStandardMaterial({ color: 0xff6a20, emissive: 0xff5a10, emissiveIntensity: 2.4 }),
  ice: new THREE.MeshPhysicalMaterial({ color: 0xbfeaff, roughness: 0.15, metalness: 0, transmission: 0.4, transparent: true, opacity: 0.85 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0xb46bff, emissive: 0x8a3cff, emissiveIntensity: 0.9, roughness: 0.2 }),
  sandstone: new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 0.9, metalness: 0.02 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x3c6e38, roughness: 0.9, metalness: 0 }),
  foliageBright: new THREE.MeshStandardMaterial({ color: 0x5a9648, roughness: 0.9, metalness: 0 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6e5638, roughness: 0.85, metalness: 0 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.14, metalness: 1.0 }),
  whitePaint: new THREE.MeshStandardMaterial({ color: 0xe4e6e2, roughness: 0.5, metalness: 0.2 }),
  obsidian: new THREE.MeshStandardMaterial({ color: 0x181420, roughness: 0.12, metalness: 0.35 }),
  moss: new THREE.MeshStandardMaterial({ color: 0x4a7a3c, roughness: 0.95, metalness: 0 }),
  mossyStone: new THREE.MeshStandardMaterial({ color: 0x646c52, roughness: 0.95, metalness: 0.02 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.95, metalness: 0.05 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xa8d4e8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32 }),
  water: new THREE.MeshStandardMaterial({ color: 0x2e86b0, emissive: 0x0e3a55, emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85 }),
  glowMagenta: new THREE.MeshStandardMaterial({ color: 0xff4dd8, emissive: 0xff4dd8, emissiveIntensity: 2 }),
  glowGreen: new THREE.MeshStandardMaterial({ color: 0x62ff9a, emissive: 0x62ff9a, emissiveIntensity: 2 }),
  glowViolet: new THREE.MeshStandardMaterial({ color: 0xb46bff, emissive: 0xb46bff, emissiveIntensity: 2 }),
  glowTeal: new THREE.MeshStandardMaterial({ color: 0x2ee6c8, emissive: 0x2ee6c8, emissiveIntensity: 1.6 }),
  lavaCore: new THREE.MeshStandardMaterial({ color: 0xffd040, emissive: 0xffb020, emissiveIntensity: 3.2 }),
  lacquer: new THREE.MeshStandardMaterial({ color: 0x2c1418, roughness: 0.25, metalness: 0.4 }),
  canvas: new THREE.MeshStandardMaterial({ color: 0xc0b090, roughness: 0.95, metalness: 0 }),
  hullRed: new THREE.MeshStandardMaterial({ color: 0x8c2a1e, roughness: 0.6, metalness: 0.45 }),
  panelSolar: new THREE.MeshStandardMaterial({ color: 0x1c2c52, roughness: 0.25, metalness: 0.6 }),
  frost: new THREE.MeshStandardMaterial({ color: 0xdceef8, roughness: 0.55, metalness: 0.05 }),
  palmFrond: new THREE.MeshStandardMaterial({ color: 0x4a7a34, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  basalt: new THREE.MeshStandardMaterial({ color: 0x2e2a30, roughness: 0.85, metalness: 0.08 }),
};
export const PROP_MATS = M;

// pack-texture material for a prop surface, procedural fallback if the pack
// entry hasn't been generated yet (see docs/ARENA_ASSET_PROMPTS.md §1)
const _texMatCache = new Map();
function texMat(name, fallback, opts = {}) {
  if (!CONFIG.useTextures) return fallback;
  const key = `${name}|${opts.repeat || 1}|${opts.color ?? ''}`;
  if (!_texMatCache.has(key)) _texMatCache.set(key, pbrMaterial('prop', name, opts) || null);
  return _texMatCache.get(key) || fallback;
}
// riveted yellow machine plate, shared by the heavy plant (cranes, crusher,
// drill rig, snowcat) — falls back to flat yellow paint
const machinePaint = (repeat = 2) => texMat('prop_metal_painted', M.yellowPaint, { repeat });

function box(mat, w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(mat, rt, rb, h, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export const PROPS = {
  smokestack(o = {}) {
    const g = new THREE.Group();
    const h = o.h || rand(18, 30);
    g.add(cyl(M.rust, 1.4, 2.2, h, 0, h / 2, 0));
    g.add(cyl(M.darkSteel, 1.6, 1.6, 1.2, 0, h, 0));
    for (let i = 1; i < 4; i++) g.add(cyl(M.darkSteel, 2.24 - i * 0.2, 2.26 - i * 0.2, 0.5, 0, (h / 4) * i, 0));
    g.userData.steamY = h + 0.8; // arena emits steam from the top
    return g;
  },
  gear(o = {}) {
    const g = new THREE.Group();
    const r = o.r || rand(3, 5.5);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.8, 24), M.brass);
    core.rotation.x = Math.PI / 2;
    core.castShadow = true;
    g.add(core);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const tooth = box(M.brass, 0.8, 0.9, 1.1, Math.cos(a) * (r + 0.4), Math.sin(a) * (r + 0.4), 0);
      tooth.rotation.z = a;
      g.add(tooth);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.25, 1.1, 12), M.copper);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    g.userData.spin = o.spin ?? rand(0.1, 0.35) * (Math.random() < 0.5 ? -1 : 1);
    g.position.y = r + 0.6;
    return g;
  },
  crane(o = {}) {
    const g = new THREE.Group();
    const h = o.h || 22, arm = o.arm || 16;
    const paint = machinePaint(3);
    g.add(box(paint, 1.4, h, 1.4, 0, h / 2, 0));
    g.add(box(paint, 1.1, 1.1, arm, 0, h, arm / 2 - 2));
    g.add(box(paint, 1.1, 1.1, 6, 0, h, -4.4));
    g.add(box(M.darkSteel, 2.2, 2, 2.4, 0, h - 1.6, -3));
    const cable = cyl(M.darkSteel, 0.06, 0.06, 7, 0, h - 3.5, arm - 4);
    g.add(cable);
    g.add(box(M.darkSteel, 1.6, 1.2, 1.6, 0, h - 7.4, arm - 4));
    return g;
  },
  container(o = {}) {
    const g = new THREE.Group();
    const mats = [M.redPaint, M.bluePaint, M.yellowPaint, M.rust];
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const n = o.n || rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const c = box(mats[rng.int(0, 3)], 3.2, 2.9, 8, rng.range(-1.5, 1.5), 1.45 + i * 2.9, rng.range(-1, 1), rng.range(-0.2, 0.2));
      g.add(c);
    }
    return g;
  },
  streetlight(o = {}) {
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 0.12, 0.18, 9, 0, 4.5, 0, 8));
    g.add(box(M.darkSteel, 0.16, 0.16, 2.2, 0, 9, 1));
    const lamp = box(o.cold ? M.glowCyan : M.glowWarm, 0.5, 0.18, 1, 0, 8.9, 1.9);
    g.add(lamp);
    return g;
  },
  pipes(o = {}) {
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const len = o.len || 14;
    for (let i = 0; i < 3; i++) {
      const r = rng.range(0.3, 0.55);
      const p = cyl(i === 1 ? M.copper : M.steel, r, r, len, rng.range(-1, 1), 0.8 + i * 1.1, 0);
      p.rotation.z = Math.PI / 2;
      g.add(p);
      if (i === 1) {
        const valve = cyl(M.brass, 0.5, 0.5, 0.3, rng.range(-len / 3, len / 3), 0.8 + i * 1.1, 0.5, 10);
        valve.rotation.x = Math.PI / 2;
        g.add(valve);
      }
    }
    for (let x = -len / 2 + 2; x < len / 2; x += 4) {
      g.add(box(M.darkSteel, 0.4, 3.4, 0.4, x, 1.7, 0));
    }
    return g;
  },
  fuelTank(o = {}) {
    const g = new THREE.Group();
    const r = o.r || rand(2.2, 3.2);
    const t = cyl(M.steel, r, r, r * 2.1, 0, r * 1.05, 0, 18);
    g.add(t);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.steel);
    dome.position.y = r * 2.1;
    dome.castShadow = true;
    g.add(dome);
    g.add(box(M.rust, 0.6, r * 2.4, 0.6, r + 0.2, r * 1.2, 0));
    const stripe = cyl(M.redPaint, r + 0.02, r + 0.02, 0.5, 0, r * 1.5, 0, 18);
    g.add(stripe);
    // FLAMMABLE hazard chevron + a warning glow: this tank goes up when hit
    const hazMat = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff5010, emissiveIntensity: 0.7, roughness: 0.5 });
    g.add(box(hazMat, r * 0.9, r * 0.55, 0.06, 0, r * 1.05, r + 0.03));
    // register as an explosive: blast radius, physical body radius (touch
    // trigger), HP before it cooks off
    g.userData.explosive = { r: 8 + r * 2.5, bodyR: r + 0.5, hp: 34, top: r * 2.6 };
    return g;
  },
  crystal(o = {}) {
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const mat = o.mat || M.crystal;
    const n = o.n || rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const h = rng.range(2, o.maxH || 7);
      const c = new THREE.Mesh(new THREE.ConeGeometry(rng.range(0.5, 1.2), h, 5), mat);
      c.position.set(rng.range(-2, 2), h * 0.42, rng.range(-2, 2));
      c.rotation.set(rng.range(-0.35, 0.35), rng.range(0, 6), rng.range(-0.35, 0.35));
      c.castShadow = true;
      g.add(c);
    }
    return g;
  },
  rock(o = {}) {
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const mat = o.mat || (o.color
      ? new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.92, metalness: 0.04 })
      : M.concrete);
    const n = o.n || rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const r = rng.range(1, o.maxR || 3);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
      m.position.set(rng.range(-2.5, 2.5), r * 0.6, rng.range(-2.5, 2.5));
      m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      m.scale.y = rng.range(0.5, 0.85);
      m.castShadow = true;
      g.add(m);
    }
    return g;
  },
  antennaTower(o = {}) {
    const g = new THREE.Group();
    const h = o.h || 20;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(M.darkSteel, 0.15, 0.25, h, Math.cos(a) * 1.4, h / 2, Math.sin(a) * 1.4, 6);
      leg.rotation.z = Math.cos(a) * 0.12;
      leg.rotation.x = -Math.sin(a) * 0.12;
      g.add(leg);
    }
    g.add(cyl(M.steel, 0.1, 0.1, h * 0.5, 0, h + h * 0.25, 0, 6));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M.glowRed)).children.at(-1);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), M.glowRed);
    beacon.position.y = h * 1.5;
    g.add(beacon);
    return g;
  },
  billboard(o = {}) {
    const g = new THREE.Group();
    const w = o.w || 10, h = o.h || 5.5;
    g.add(box(M.darkSteel, 0.5, 12, 0.5, 0, 6, 0));
    const panel = box(M.darkSteel, w, h, 0.4, 0, 12 + h / 2 - 2, 0);
    g.add(panel);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.6, h - 0.6),
      new THREE.MeshStandardMaterial({
        color: o.color || 0x53e8ff, emissive: o.color || 0x53e8ff, emissiveIntensity: 1.5, side: THREE.DoubleSide,
      })
    );
    face.position.set(0, 12 + h / 2 - 2, 0.25);
    g.add(face);
    return g;
  },
  tree(o = {}) {
    const g = new THREE.Group();
    const h = o.h || rand(6, 9);
    g.add(cyl(M.wood, 0.25, 0.4, h, 0, h / 2, 0, 7));
    const mat = o.mat || M.foliage;
    for (let i = 0; i < 3; i++) {
      const r = (1.1 - i * 0.25) * (o.r || 2.4);
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.4, 8), mat);
      c.position.y = h * 0.62 + i * r * 0.85;
      c.castShadow = true;
      g.add(c);
    }
    return g;
  },
  ruinColumn(o = {}) {
    const g = new THREE.Group();
    const h = o.h || rand(4, 9);
    const mat = o.mat || M.sandstone;
    g.add(cyl(mat, 0.9, 1.1, h, 0, h / 2, 0, 10));
    g.add(box(mat, 2.6, 0.6, 2.6, 0, 0.3, 0));
    if (Math.random() < 0.6) g.add(box(mat, 2.4, 0.5, 2.4, 0, h + 0.25, 0));
    return g;
  },
  barrierPylon(o = {}) {
    const g = new THREE.Group();
    g.add(box(M.darkSteel, 1.2, 5.5, 1.2, 0, 2.75, 0));
    const glow = box(o.mat || M.glowCyan, 0.5, 4.5, 0.5, 0, 3, 0);
    g.add(glow);
    return g;
  },

  // ---- neon ----
  holoPillar(o = {}) {
    // Holographic ad column: crossed translucent emissive planes over a steel mast.
    const g = new THREE.Group();
    const col = new THREE.Color(o.color || 0x53e8ff);
    g.add(cyl(M.darkSteel, 1.0, 1.3, 1.2, 0, 0.6, 0, 10));
    g.add(cyl(M.steel, 0.28, 0.34, 11.5, 0, 6.3, 0, 8));
    const holoMat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 1.7,
      transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    });
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.2), holoMat);
      p.position.y = 7.4;
      p.rotation.y = i * Math.PI / 2;
      g.add(p);
    }
    const capMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.4 });
    g.add(cyl(capMat, 0.42, 0.42, 0.3, 0, 10.8, 0, 10));
    g.add(cyl(capMat, 0.42, 0.42, 0.3, 0, 4.0, 0, 10));
    return g;
  },
  noodleKiosk(o = {}) {
    // Late-night noodle stand: hut, tilted awning, glowing sign, paper lanterns.
    const g = new THREE.Group();
    g.add(box(M.wood, 3.6, 2.5, 2.8, 0, 1.25, 0));
    g.add(box(M.darkSteel, 3.8, 0.25, 3.0, 0, 2.6, 0));
    const awning = box(M.redPaint, 4.2, 0.16, 1.7, 0, 3.2, 1.9);
    awning.rotation.x = 0.32;
    g.add(awning);
    const signMat = new THREE.MeshStandardMaterial({
      color: o.color || 0xffb43c, emissive: o.color || 0xffb43c, emissiveIntensity: 1.7, side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), signMat);
    sign.position.set(0, 3.05, 1.52);
    g.add(sign);
    for (const sx of [-1.6, 1.6]) {
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), M.glowWarm);
      lan.position.set(sx, 2.25, 1.55);
      g.add(lan);
    }
    g.add(box(M.wood, 3.4, 0.18, 0.8, 0, 1.05, 1.7));
    for (const sx of [-1.1, 0, 1.1]) g.add(cyl(M.darkSteel, 0.28, 0.28, 0.75, sx, 0.38, 2.4, 8));
    g.userData.steamY = 2.9; // cooking steam
    return g;
  },
  railSegment(o = {}) {
    // Elevated monorail segment on concrete pylons with a glowing guide strip.
    const g = new THREE.Group();
    const len = o.len || 26;
    for (const zz of [-len * 0.32, len * 0.32]) {
      g.add(box(M.concrete, 1.6, 7.2, 1.6, 0, 3.6, zz));
      g.add(box(M.concrete, 2.4, 0.6, 2.4, 0, 7.4, zz));
    }
    g.add(box(M.concrete, 3.0, 1.1, len, 0, 8.25, 0));
    g.add(box(M.darkSteel, 0.9, 0.55, len, 0, 9.05, 0));
    for (const sx of [-1.25, 1.25]) g.add(box(M.steel, 0.16, 0.9, len, sx, 9.15, 0));
    const stripMat = new THREE.MeshStandardMaterial({
      color: o.color || 0x53e8ff, emissive: o.color || 0x53e8ff, emissiveIntensity: 1.8,
    });
    for (const sx of [-1.52, 1.52]) g.add(box(stripMat, 0.06, 0.22, len, sx, 8.35, 0));
    return g;
  },

  // ---- foundry ----
  moltenChannel(o = {}) {
    // Open trough carrying molten metal, on short legs, with a bright core strip.
    const g = new THREE.Group();
    const len = o.len || 15;
    g.add(box(M.darkSteel, 2.2, 0.35, len, 0, 0.9, 0));
    for (const sx of [-1.05, 1.05]) g.add(box(M.rust, 0.28, 1.0, len, sx, 1.35, 0));
    g.add(box(M.glowLava, 1.55, 0.3, len - 0.6, 0, 1.15, 0));
    g.add(box(M.lavaCore, 0.7, 0.32, len - 1.6, 0, 1.17, 0));
    for (let zz = -len / 2 + 1.5; zz < len / 2; zz += 4.5) {
      g.add(box(M.darkSteel, 1.8, 0.9, 0.4, 0, 0.45, zz));
    }
    const spout = box(M.rust, 1.2, 0.8, 1.6, 0, 0.9, len / 2 + 0.5);
    spout.rotation.x = 0.4;
    g.add(spout);
    return g;
  },
  pistonRig(o = {}) {
    // Giant piston assembly venting steam from its head.
    const g = new THREE.Group();
    g.add(box(M.darkSteel, 4.6, 1.1, 4.6, 0, 0.55, 0));
    g.add(cyl(M.steel, 1.8, 2.0, 5.2, 0, 3.7, 0, 14));
    g.add(cyl(M.rust, 2.1, 2.1, 0.7, 0, 6.3, 0, 14));
    g.add(cyl(M.brass, 0.55, 0.55, 3.6, 0, 8.1, 0, 10));
    g.add(box(M.darkSteel, 2.6, 1.3, 2.6, 0, 10.1, 0));
    const p1 = cyl(M.copper, 0.32, 0.32, 4.5, 2.4, 2.6, 0, 8);
    p1.rotation.z = 0.5;
    g.add(p1);
    const p2 = cyl(M.steel, 0.28, 0.28, 4.0, -2.3, 2.4, 0.6, 8);
    p2.rotation.z = -0.55;
    g.add(p2);
    g.add(box(M.glowLava, 0.5, 0.5, 0.1, 0, 2.2, 2.02));
    g.add(cyl(M.brass, 0.4, 0.4, 0.25, 1.4, 6.75, 1.4, 8));
    g.userData.steamY = 10.9;
    return g;
  },
  chainHoist(o = {}) {
    // A-frame gantry with chains and a swinging scrap cube.
    const g = new THREE.Group();
    const h = o.h || 9.5, span = o.span || 8;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const leg = box(M.rust, 0.55, h, 0.55, sx * span * 0.5, h / 2, sz * 1.9);
        leg.rotation.z = -sx * 0.16;
        g.add(leg);
      }
      g.add(box(M.rust, span * 0.62, 0.4, 0.4, 0, h * 0.45, sz * 1.9));
    }
    g.add(box(M.darkSteel, span * 0.9, 0.7, 4.4, 0, h + 0.2, 0));
    g.add(cyl(M.darkSteel, 0.09, 0.09, 3.4, -1.2, h - 1.8, 0, 6));
    g.add(cyl(M.darkSteel, 0.09, 0.09, 3.4, 1.2, h - 1.8, 0, 6));
    const cube = box(M.rust, 2.2, 2.0, 2.2, 0, h - 4.4, 0, 0.5);
    g.add(cube);
    g.add(box(M.darkSteel, 1.0, 0.5, 1.0, 0, h - 3.3, 0));
    return g;
  },

  // ---- harbor ----
  lighthouse(o = {}) {
    // Striped beacon tower with a glowing lamp room.
    const g = new THREE.Group();
    const h = o.h || 15;
    g.add(cyl(M.concrete, 2.6, 3.2, 1.2, 0, 0.6, 0, 14));
    g.add(cyl(M.whitePaint, 1.5, 2.3, h, 0, h / 2 + 1, 0, 14));
    g.add(cyl(M.redPaint, 2.06, 2.18, h * 0.18, 0, h * 0.3, 0, 14));
    g.add(cyl(M.redPaint, 1.7, 1.82, h * 0.18, 0, h * 0.72, 0, 14));
    g.add(cyl(M.darkSteel, 2.0, 2.0, 0.35, 0, h + 1.2, 0, 14));
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd870, emissive: 0xffc850, emissiveIntensity: 3.0 });
    g.add(cyl(lampMat, 1.05, 1.05, 1.5, 0, h + 2.1, 0, 12));
    g.add(cyl(M.darkSteel, 0.2, 1.3, 1.0, 0, h + 3.3, 0, 12));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M.glowRed);
    tip.position.set(0, h + 3.95, 0);
    g.add(tip);
    return g;
  },
  boatHull(o = {}) {
    // Beached / dry-docked fishing boat listing to one side.
    const g = new THREE.Group();
    const hull = box(M.bluePaint, 3.4, 2.6, 11, 0, 1.0, 0);
    hull.rotation.z = 0.24;
    g.add(hull);
    const keel = box(M.redPaint, 3.5, 0.9, 11.1, 0, 0.15, 0);
    keel.rotation.z = 0.24;
    g.add(keel);
    const bow = box(M.bluePaint, 2.5, 2.4, 2.5, 0.25, 1.15, 6.1, Math.PI / 4);
    bow.rotation.z = 0.24;
    g.add(bow);
    const cabin = box(M.whitePaint, 2.4, 1.7, 3.0, -0.35, 3.0, -2.4);
    cabin.rotation.z = 0.24;
    g.add(cabin);
    g.add(box(M.rust, 2.5, 0.5, 3.1, -0.5, 3.9, -2.4, 0.05));
    const mast = cyl(M.wood, 0.12, 0.16, 6.5, 0.6, 5.2, 1.8, 7);
    mast.rotation.z = 0.3;
    g.add(mast);
    return g;
  },
  buoy(o = {}) {
    const g = new THREE.Group();
    g.add(cyl(M.redPaint, 0.9, 1.25, 1.6, 0, 0.8, 0, 10));
    g.add(cyl(M.whitePaint, 0.55, 0.9, 1.0, 0, 2.05, 0, 10));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(cyl(M.darkSteel, 0.05, 0.05, 1.4, Math.cos(a) * 0.35, 3.15, Math.sin(a) * 0.35, 5));
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), M.glowRed);
    lamp.position.y = 3.95;
    g.add(lamp);
    g.userData.bob = { amp: 0.2, speed: 1.3, rock: 0.06 };
    return g;
  },

  // ---- skyterrace ----
  helipad(o = {}) {
    // Rooftop helipad disc with an H marking and corner lights.
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 6.6, 6.9, 0.35, 0, 0.18, 0, 24));
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.4, 6.1, 24),
      new THREE.MeshStandardMaterial({ color: 0xffb43c, emissive: 0xffb43c, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.37;
    g.add(ring);
    const hMat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, emissive: 0xd8e4f0, emissiveIntensity: 0.55 });
    g.add(box(hMat, 0.8, 0.06, 3.6, -1.2, 0.39, 0));
    g.add(box(hMat, 0.8, 0.06, 3.6, 1.2, 0.39, 0));
    g.add(box(hMat, 1.6, 0.06, 0.8, 0, 0.39, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(box(M.glowCyan, 0.35, 0.3, 0.35, Math.cos(a) * 6.3, 0.42, Math.sin(a) * 6.3));
    }
    return g;
  },
  hvacUnit(o = {}) {
    // Rooftop air handler cluster: big housing, twin fan drums, duct run.
    const g = new THREE.Group();
    g.add(box(M.steel, 4.4, 2.4, 3.2, 0, 1.2, 0));
    g.add(box(M.darkSteel, 4.5, 0.25, 3.3, 0, 2.5, 0));
    for (const sx of [-1.1, 1.1]) {
      g.add(cyl(M.darkSteel, 1.0, 1.0, 0.5, sx, 2.85, 0, 14));
      g.add(cyl(M.rubber, 0.82, 0.82, 0.54, sx, 2.88, 0, 14));
    }
    const duct = box(M.steel, 1.1, 1.1, 4.2, 2.9, 0.8, 0.4);
    g.add(duct);
    g.add(box(M.steel, 1.1, 1.6, 1.1, 2.9, 0.8, 2.5));
    g.add(box(M.yellowPaint, 0.5, 1.0, 0.14, -2.26, 1.0, 0));
    g.userData.steamY = 3.1;
    return g;
  },
  glassRail(o = {}) {
    // Run of rooftop glass balustrade panels.
    const g = new THREE.Group();
    const n = o.n || 4, w = 3.1;
    const len = n * (w + 0.25);
    g.add(box(M.concrete, len + 0.6, 0.45, 0.7, 0, 0.22, 0));
    for (let i = 0; i <= n; i++) {
      g.add(box(M.steel, 0.18, 2.0, 0.18, -len / 2 + i * (w + 0.25), 1.35, 0));
    }
    for (let i = 0; i < n; i++) {
      const p = box(M.glass, w, 1.6, 0.1, -len / 2 + (w + 0.25) * (i + 0.5), 1.35, 0);
      p.castShadow = false;
      g.add(p);
    }
    g.add(box(M.steel, len + 0.4, 0.14, 0.24, 0, 2.42, 0));
    return g;
  },

  // ---- scrapyard ----
  mechWreck(o = {}) {
    // Fallen mech torso half-buried in the dirt — one eye still faintly lit.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const chest = box(M.rust, 5.4, 3.6, 2.8, 0, 1.2, 0);
    chest.rotation.x = -0.55 + rng.range(-0.1, 0.1);
    g.add(chest);
    g.add(box(M.darkSteel, 3.4, 0.9, 0.5, 0, 2.1, 1.35, 0.06));
    const head = box(M.rust, 1.7, 1.4, 1.6, 0.3, 3.15, -0.9);
    head.rotation.set(-0.4, 0.3, 0.12);
    g.add(head);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff4030, emissive: 0xff3020, emissiveIntensity: 1.4 });
    const eye = box(eyeMat, 1.1, 0.22, 0.1, 0.32, 3.2, -0.12);
    eye.rotation.set(-0.4, 0.3, 0.12);
    g.add(eye);
    const pauldron = box(M.darkSteel, 2.0, 1.8, 2.4, -3.4, 2.0, -0.4);
    pauldron.rotation.z = 0.5;
    g.add(pauldron);
    const arm = box(M.rust, 1.2, 1.1, 4.6, 3.6, 0.55, 1.6, rng.range(0.3, 0.9));
    g.add(arm);
    const fist = box(M.darkSteel, 1.4, 1.0, 1.4, 5.1, 0.5, 3.2, 0.4);
    g.add(fist);
    for (let i = 0; i < 3; i++) {
      const r = rng.range(0.7, 1.4);
      const deb = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M.rust);
      deb.position.set(rng.range(-4, 4), r * 0.4, rng.range(-3, 3));
      deb.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
      deb.castShadow = true;
      g.add(deb);
    }
    return g;
  },
  junkPile(o = {}) {
    // Mound of scrap: crushed lumps, tires, a bent pipe, a leaking barrel.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < 4; i++) {
      const r = rng.range(0.9, 2.1);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rng.chance(0.5) ? M.rust : M.darkSteel);
      m.position.set(rng.range(-2.2, 2.2), r * 0.55, rng.range(-2.2, 2.2));
      m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      m.scale.y = rng.range(0.5, 0.8);
      m.castShadow = true;
      g.add(m);
    }
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.3, 7, 14), M.rubber);
      t.position.set(rng.range(-2.6, 2.6), rng.range(0.35, 1.6), rng.range(-2.6, 2.6));
      t.rotation.set(rng.range(0.8, 2.2), rng.range(0, 3), rng.range(0, 1));
      t.castShadow = true;
      g.add(t);
    }
    const pipe = cyl(M.rust, 0.3, 0.3, 5, 0, 1.6, 0, 8);
    pipe.rotation.set(0.4, 0.7, 1.2);
    g.add(pipe);
    const barrel = cyl(M.yellowPaint, 0.6, 0.6, 1.7, 1.8, 0.62, -1.6, 10);
    barrel.rotation.z = 1.35;
    g.add(barrel);
    return g;
  },
  magnetCrane(o = {}) {
    // Tracked scrapyard crane with a lifting magnet and dangling wreck cube.
    const g = new THREE.Group();
    for (const sx of [-1.5, 1.5]) g.add(box(M.rubber, 1.1, 1.1, 5.0, sx, 0.55, 0));
    g.add(box(M.darkSteel, 3.4, 0.5, 3.6, 0, 1.3, 0));
    g.add(box(machinePaint(), 2.6, 2.0, 3.4, 0, 2.55, -0.4));
    g.add(box(M.darkSteel, 1.4, 1.2, 1.2, 1.0, 2.4, 1.6));
    const boom = box(machinePaint(3), 0.8, 0.9, 11, 0, 5.8, 3.4);
    boom.rotation.x = -0.68;
    g.add(boom);
    g.add(cyl(M.darkSteel, 0.06, 0.06, 4.2, 0, 6.3, 6.9, 6));
    g.add(cyl(M.darkSteel, 1.5, 1.7, 0.7, 0, 4.0, 6.9, 14));
    const wreck = box(M.rust, 1.9, 1.6, 1.9, 0, 2.6, 6.9, 0.5);
    g.add(wreck);
    return g;
  },

  // ---- quarry ----
  mineCart(o = {}) {
    // Ore cart on a short run of rails, loaded with glowing crystal.
    const g = new THREE.Group();
    const len = o.len || 12;
    for (let zz = -len / 2 + 0.8; zz < len / 2; zz += 2.2) {
      g.add(box(M.wood, 2.0, 0.16, 0.5, 0, 0.08, zz));
    }
    for (const sx of [-0.72, 0.72]) g.add(box(M.steel, 0.16, 0.2, len, sx, 0.24, 0));
    g.add(box(M.rust, 2.0, 1.3, 2.9, 0, 1.35, 0));
    g.add(box(M.darkSteel, 2.2, 0.18, 3.1, 0, 0.78, 0));
    for (const [sx, sz] of [[-0.85, -1.0], [0.85, -1.0], [-0.85, 1.0], [0.85, 1.0]]) {
      const w = cyl(M.darkSteel, 0.36, 0.36, 0.2, sx, 0.44, sz, 10);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    const oreMat = o.mat || M.crystal;
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 5), oreMat);
      c.position.set((i - 1) * 0.55, 2.2, (i % 2) * 0.7 - 0.35);
      c.rotation.set(rand(-0.4, 0.4), rand(0, 6), rand(-0.4, 0.4));
      c.castShadow = true;
      g.add(c);
    }
    return g;
  },
  drillRig(o = {}) {
    // Four-legged derrick driving a drill shaft into the pit floor.
    const g = new THREE.Group();
    const h = o.h || 11;
    g.add(box(M.darkSteel, 4.6, 0.7, 4.6, 0, 0.35, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(M.steel, 0.42, h, 0.42, sx * 1.7, h / 2 + 0.3, sz * 1.7);
      leg.rotation.z = -sx * 0.15;
      leg.rotation.x = sz * 0.15;
      g.add(leg);
    }
    g.add(box(M.steel, 3.0, 0.5, 3.0, 0, h + 0.4, 0));
    g.add(box(machinePaint(), 1.6, 1.4, 1.8, 0, h + 1.3, 0));
    g.add(cyl(M.darkSteel, 0.32, 0.32, h, 0, h / 2 + 0.3, 0, 10));
    g.add(cyl(M.brass, 0.02, 0.62, 1.1, 0, 0.9, 0, 8));
    const lamp = box(M.glowViolet, 0.5, 0.3, 0.5, 0, h + 2.15, 0);
    g.add(lamp);
    return g;
  },

  // ---- volcano ----
  lavaPool(o = {}) {
    // Molten pool with a white-hot heart and a rim of scorched rock.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const r = o.r || rng.range(3.6, 5.2);
    g.add(cyl(M.glowLava, r, r * 1.05, 0.3, 0, 0.15, 0, 20));
    g.add(cyl(M.lavaCore, r * 0.45, r * 0.5, 0.34, r * 0.12, 0.16, -r * 0.08, 14));
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x33231c, roughness: 0.95, metalness: 0.05 });
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const rr = rng.range(0.8, 1.7);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 0), rockMat);
      m.position.set(Math.cos(a) * (r + rr * 0.5), rr * 0.45, Math.sin(a) * (r + rr * 0.5));
      m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      m.scale.y = rng.range(0.5, 0.8);
      m.castShadow = true;
      g.add(m);
    }
    g.userData.steamY = 0.6;
    return g;
  },
  obsidianSpikes(o = {}) {
    // Cluster of razor black glass shards with embers at their feet.
    // A HAZARD: walking into the cluster cuts and shoves bots back
    // (arena registers it via userData.spikes).
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const n = o.n || rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      const h = rng.range(3, 8.5);
      const c = new THREE.Mesh(new THREE.ConeGeometry(rng.range(0.5, 1.1), h, 5), M.obsidian);
      c.position.set(rng.range(-2.4, 2.4), h * 0.4, rng.range(-2.4, 2.4));
      c.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 6), rng.range(-0.4, 0.4));
      c.castShadow = true;
      g.add(c);
    }
    for (let i = 0; i < 2; i++) {
      g.add(box(M.glowLava, rng.range(0.4, 0.8), 0.16, rng.range(0.4, 0.8), rng.range(-2, 2), 0.08, rng.range(-2, 2), rng.range(0, 3)));
    }
    g.userData.spikes = { r: 3.4 };
    return g;
  },

  campfire(o = {}) {
    // Stone-ringed campfire: crossed logs over glowing embers. Attack it
    // and it flares into a burning ground patch (userData.campfire).
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng.range(-0.12, 0.12);
      const st = box(M.concrete, rng.range(0.5, 0.8), rng.range(0.4, 0.6), rng.range(0.5, 0.7),
        Math.cos(a) * 1.8, 0.22, Math.sin(a) * 1.8, rng.range(0, 3));
      g.add(st);
    }
    for (let i = 0; i < 4; i++) {
      const log = cyl(M.wood, 0.16, 0.2, 2.4, 0, 0.45, 0, 7);
      log.rotation.set(rng.range(-0.25, 0.25) + Math.PI / 2.4, (i / 4) * Math.PI * 2, 0);
      g.add(log);
    }
    g.add(cyl(M.glowLava, 0.85, 1.0, 0.24, 0, 0.12, 0, 12));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 7), M.glowWarm);
    flame.position.y = 0.9;
    g.add(flame);
    g.userData.campfire = { r: 2.2 };
    return g;
  },

  // ---- frozen ----
  radarDome(o = {}) {
    // Arctic radome station: white sphere on a bunker base.
    const g = new THREE.Group();
    g.add(box(M.steel, 4.6, 1.6, 4.6, 0, 0.8, 0));
    g.add(box(M.whitePaint, 3.8, 0.5, 3.8, 0, 1.85, 0));
    const domeMat = new THREE.MeshStandardMaterial({ color: 0xe8f0f6, roughness: 0.45, metalness: 0.1 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 12), domeMat);
    dome.position.y = 3.6;
    dome.castShadow = true;
    g.add(dome);
    g.add(box(M.darkSteel, 1.1, 1.2, 0.3, 0, 0.7, 2.35));
    g.add(cyl(M.darkSteel, 0.06, 0.06, 2.6, 1.9, 3.2, 1.9, 5));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), M.glowCyan);
    lamp.position.set(1.9, 4.6, 1.9);
    g.add(lamp);
    return g;
  },
  aurora(o = {}) {
    // Cheap aurora: additive curtains hung in a wide ring around the arena,
    // so some part of it is on screen from any camera azimuth. Place once,
    // near the origin (ring [0, 6]).
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const cols = [0x46ffa0, 0x38e8c8, 0x9a6bff, 0x46ffa0, 0x38e8c8];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: cols[i], emissiveIntensity: 1.5,
        transparent: true, opacity: 0.2 + (i % 3) * 0.04, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const a = (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const r = rng.range(95, 130);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(80, 120), rng.range(20, 30)), mat);
      p.position.set(Math.cos(a) * r, rng.range(36, 50), Math.sin(a) * r);
      p.rotation.set(rng.range(-0.1, 0.1), -a + Math.PI / 2 + rng.range(-0.3, 0.3), rng.range(-0.08, 0.08));
      g.add(p);
    }
    return g;
  },

  // ---- ruins ----
  brokenStatue(o = {}) {
    // Toppled colossus: torso still on the plinth, head fallen in the sand.
    const g = new THREE.Group();
    const mat = o.mat || M.sandstone;
    g.add(box(mat, 4.2, 0.8, 4.2, 0, 0.4, 0));
    g.add(box(mat, 3.2, 0.9, 3.2, 0, 1.2, 0));
    const torso = box(mat, 2.4, 3.2, 1.6, 0, 3.1, 0, 0.3);
    torso.rotation.z = 0.12;
    g.add(torso);
    const arm = box(mat, 0.85, 2.8, 0.85, -1.5, 5.0, 0.2);
    arm.rotation.z = 0.55;
    g.add(arm);
    g.add(box(mat, 1.15, 1.0, 1.0, 1.35, 4.35, 0, 0.2));
    const head = box(mat, 1.5, 1.7, 1.5, 3.4, 0.75, 1.8);
    head.rotation.set(0.9, 0.5, 0.35);
    g.add(head);
    g.add(box(mat, 1.0, 0.7, 0.9, 2.4, 0.3, -1.6, 0.7));
    return g;
  },
  obelisk(o = {}) {
    // Four-sided needle with softly glowing glyph channels.
    const g = new THREE.Group();
    const h = o.h || 10;
    const mat = o.mat || M.sandstone;
    g.add(box(mat, 3.0, 0.7, 3.0, 0, 0.35, 0));
    g.add(box(mat, 2.2, 0.6, 2.2, 0, 1.0, 0));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.05, h, 4), mat);
    shaft.position.y = h / 2 + 1.3;
    shaft.rotation.y = Math.PI / 4;
    shaft.castShadow = true;
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.2, 4), mat);
    tip.position.y = h + 1.85;
    tip.rotation.y = Math.PI / 4;
    tip.castShadow = true;
    g.add(tip);
    const glyphMat = new THREE.MeshStandardMaterial({ color: 0x2ee6c8, emissive: 0x2ee6c8, emissiveIntensity: 1.1 });
    g.add(box(glyphMat, 0.2, h * 0.62, 0.06, 0, h * 0.5 + 1.2, 0.86));
    g.add(box(glyphMat, 0.06, h * 0.5, 0.2, 0.8, h * 0.45 + 1.2, 0));
    return g;
  },
  sarcophagus(o = {}) {
    // Excavated stone coffin, lid shoved ajar.
    const g = new THREE.Group();
    const mat = o.mat || M.sandstone;
    g.add(box(mat, 2.6, 0.4, 4.6, 0, 0.2, 0));
    g.add(box(mat, 2.1, 1.3, 4.0, 0, 1.05, 0));
    const lid = box(mat, 2.2, 0.45, 4.1, 0.55, 1.85, -0.3, 0.14);
    lid.rotation.z = 0.1;
    g.add(lid);
    g.add(box(M.brass, 2.15, 0.18, 0.5, 0, 1.1, 1.1));
    return g;
  },

  // ---- jungle ----
  canopyTree(o = {}) {
    // Big broadleaf canopy tree — trunk leans, crown spreads wide.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const h = o.h || rng.range(10, 14);
    const trunk = cyl(M.wood, 0.55, 0.95, h, 0, h / 2, 0, 8);
    trunk.rotation.z = rng.range(-0.09, 0.09);
    g.add(trunk);
    for (let i = 0; i < 2; i++) {
      const root = cyl(M.wood, 0.2, 0.45, 2.2, rng.range(-1, 1), 0.7, rng.range(-1, 1), 6);
      root.rotation.z = rng.range(0.5, 0.9) * (i ? -1 : 1);
      g.add(root);
    }
    for (let i = 0; i < 5; i++) {
      const r = rng.range(2.2, 3.6);
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), rng.chance(0.5) ? M.foliage : M.foliageBright);
      blob.position.set(rng.range(-3.2, 3.2), h - rng.range(0, 2.4), rng.range(-3.2, 3.2));
      blob.scale.y = rng.range(0.5, 0.7);
      blob.castShadow = true;
      g.add(blob);
    }
    return g;
  },
  stoneIdol(o = {}) {
    // Half-sunken temple head with softly glowing eyes.
    const g = new THREE.Group();
    const head = box(M.mossyStone, 3.2, 3.8, 3.0, 0, 1.6, 0);
    head.rotation.set(-0.12, 0, 0.08);
    g.add(head);
    g.add(box(M.mossyStone, 3.3, 0.7, 1.0, 0, 2.6, 1.25, 0.02));
    g.add(box(M.mossyStone, 0.7, 1.3, 0.6, 0, 1.7, 1.55));
    g.add(box(M.darkSteel, 1.6, 0.35, 0.3, 0, 0.75, 1.5));
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x62ff9a, emissive: 0x62ff9a, emissiveIntensity: 1.6 });
    for (const sx of [-0.85, 0.85]) g.add(box(eyeMat, 0.6, 0.3, 0.12, sx, 2.35, 1.52));
    g.add(box(M.moss, 3.4, 0.5, 3.1, 0, 3.6, -0.1, 0.06));
    const rubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), M.mossyStone);
    rubble.position.set(2.4, 0.5, 1.3);
    rubble.castShadow = true;
    g.add(rubble);
    return g;
  },
  vineColumn(o = {}) {
    // Old stone column strangled by vines.
    const g = new THREE.Group();
    const h = o.h || rand(6, 9);
    g.add(cyl(M.mossyStone, 0.85, 1.05, h, 0, h / 2, 0, 10));
    g.add(box(M.mossyStone, 2.5, 0.55, 2.5, 0, 0.28, 0));
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.16, 6, 12), M.moss);
      v.position.y = h * (0.25 + i * 0.27);
      v.rotation.set(Math.PI / 2 + rand(-0.3, 0.3), 0, rand(0, 3));
      v.castShadow = true;
      g.add(v);
    }
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), M.foliage);
    crown.position.y = h + 0.5;
    crown.scale.y = 0.6;
    crown.castShadow = true;
    g.add(crown);
    return g;
  },

  // ---- orbital ----
  landingPad(o = {}) {
    // Hex landing pad with running edge lights.
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 6.2, 6.6, 0.5, 0, 0.25, 0, 6));
    g.add(cyl(M.steel, 4.6, 4.6, 0.54, 0, 0.27, 0, 6));
    const ringMat = new THREE.MeshStandardMaterial({
      color: o.color || 0x53e8ff, emissive: o.color || 0x53e8ff, emissiveIntensity: 1.8, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.9, 6), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.rotation.z = Math.PI / 6;
    ring.position.y = 0.56;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      g.add(box(ringMat, 0.4, 0.34, 0.4, Math.cos(a) * 5.6, 0.55, Math.sin(a) * 5.6));
    }
    g.add(box(M.yellowPaint, 1.2, 0.9, 1.6, 5.8, 0.45, 0));
    return g;
  },
  dishArray(o = {}) {
    // Pair of deep-space dishes tracking something far away.
    const g = new THREE.Group();
    g.add(box(M.darkSteel, 6.5, 0.6, 3.4, 0, 0.3, 0));
    for (const sx of [-1.7, 1.7]) {
      g.add(cyl(M.steel, 0.3, 0.42, 3.2, sx, 2.2, 0, 8));
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), M.whitePaint);
      dish.position.set(sx, 4.0, 0);
      dish.scale.y = 0.55;
      dish.rotation.x = -2.4;
      dish.rotation.z = sx > 0 ? -0.25 : 0.25;
      dish.castShadow = true;
      g.add(dish);
      const feed = cyl(M.darkSteel, 0.05, 0.05, 1.7, sx, 4.4, 0.9, 5);
      feed.rotation.x = 0.7;
      g.add(feed);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M.glowRed);
      tip.position.set(sx, 4.75, 1.55);
      g.add(tip);
    }
    return g;
  },
  cargoPods(o = {}) {
    // Stacked pressurized cargo capsules with status stripes.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const mats = [M.whitePaint, M.bluePaint, M.yellowPaint];
    const glowMats = [M.glowCyan, M.glowGreen, M.glowWarm];
    const n = o.n || rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const y = 1.2 + (i > 1 ? 2.4 : 0);
      const xo = i === 1 ? 2.7 : 0, zo = i === 1 ? rng.range(-0.6, 0.6) : 0;
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.6, 4, 10), mats[rng.int(0, 2)]);
      pod.position.set(xo, y, zo);
      pod.rotation.set(0, rng.range(-0.3, 0.3), Math.PI / 2);
      pod.castShadow = true;
      g.add(pod);
      const band = cyl(glowMats[rng.int(0, 2)], 1.14, 1.14, 0.22, xo, y, zo, 12);
      band.rotation.z = Math.PI / 2;
      band.rotation.y = pod.rotation.y;
      g.add(band);
      g.add(box(M.darkSteel, 3.0, 0.25, 2.0, xo, y - 1.25, zo, pod.rotation.y));
    }
    return g;
  },
  conduit(o = {}) {
    // Glowing power conduit running along the deck plating.
    const g = new THREE.Group();
    const len = o.len || 16;
    const col = o.color || 0x53e8ff;
    const glowMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.7 });
    g.add(box(M.darkSteel, 0.9, 0.2, len, 0, 0.1, 0));
    g.add(box(glowMat, 0.34, 0.24, len - 0.5, 0, 0.12, 0));
    for (let zz = -len / 2 + 2; zz < len / 2; zz += 4) {
      g.add(cyl(M.steel, 0.7, 0.8, 0.3, 0, 0.15, zz, 10));
      g.add(cyl(glowMat, 0.3, 0.3, 0.34, 0, 0.17, zz, 10));
    }
    g.add(box(M.steel, 1.4, 1.1, 1.4, 0, 0.55, len / 2 + 0.7));
    g.add(box(glowMat, 0.5, 0.5, 0.1, 0, 0.62, len / 2 + 1.41));
    return g;
  },

  // ---- uptown ----
  fountain(o = {}) {
    // Tiered plaza fountain with standing water.
    const g = new THREE.Group();
    g.add(cyl(M.concrete, 3.6, 3.9, 0.8, 0, 0.4, 0, 18));
    g.add(cyl(M.water, 3.3, 3.3, 0.15, 0, 0.72, 0, 18));
    g.add(cyl(M.concrete, 0.5, 0.65, 1.6, 0, 1.4, 0, 10));
    g.add(cyl(M.concrete, 1.9, 2.1, 0.45, 0, 2.3, 0, 14));
    g.add(cyl(M.water, 1.7, 1.7, 0.12, 0, 2.42, 0, 14));
    g.add(cyl(M.concrete, 0.3, 0.4, 1.0, 0, 2.9, 0, 8));
    g.add(cyl(M.water, 0.28, 0.18, 1.1, 0, 3.6, 0, 8));
    return g;
  },
  artSculpture(o = {}) {
    // Plaza art: chrome ring balanced on a plinth, mirror ball beside it.
    const g = new THREE.Group();
    g.add(box(M.concrete, 2.6, 0.9, 2.6, 0, 0.45, 0));
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.42, 10, 22), M.chrome);
    ringMesh.position.y = 3.1;
    ringMesh.rotation.y = 0.4;
    ringMesh.castShadow = true;
    g.add(ringMesh);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), M.chrome);
    ball.position.set(1.9, 0.85, 1.4);
    ball.castShadow = true;
    g.add(ball);
    return g;
  },

  // ==================================================================
  // 2026-07 ARENA REDESIGN — realistic set pieces. Landmarks are one-per-
  // arena orientation anchors; several use userData.bodies (multi-part
  // colliders) so mechs genuinely walk BETWEEN their legs, and shooting one
  // leg fells the whole structure.
  // ==================================================================

  // concrete pier holding up the viaduct deck (auto-placed from
  // terrain.pylonSpots; destroying one collapses its deck span)
  viaductPylon(o = {}) {
    const g = new THREE.Group();
    const h = o.h || 6.8;
    g.add(box(M.concrete, 2.6, 0.5, 2.6, 0, 0.25, 0));
    g.add(cyl(M.concrete, 0.95, 1.25, h - 1.2, 0, (h - 1.2) / 2, 0, 10));
    g.add(box(M.concrete, 7.0, 0.7, 1.6, 0, h - 1.35, 0));   // cap beam across the deck
    g.add(box(M.darkSteel, 0.9, 0.5, 1.0, 0, 1.0, 1.15));
    g.userData.pylon = true;
    return g;
  },

  // natural rock arch / cave mouth — walk (or shoot) straight through it
  rockArch(o = {}) {
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const span = o.span || 9, h = o.h || 7;
    const mat = o.mat || (o.color
      ? new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.92, metalness: 0.04 })
      : M.concrete);
    for (const sx of [-1, 1]) {
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const r = rng.range(1.5, 2.2) * (1 - i * 0.14);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
        m.position.set(sx * (span / 2 + rng.range(-0.4, 0.4)), y + r * 0.5, rng.range(-0.6, 0.6));
        m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
        m.castShadow = true;
        g.add(m);
        y += r * 0.95;
      }
    }
    const nTop = 4;
    for (let i = 0; i < nTop; i++) {
      const t = (i + 0.5) / nTop;
      const r = rng.range(1.3, 1.9);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
      m.position.set(-span / 2 + t * span, h + Math.sin(t * Math.PI) * 1.2, rng.range(-0.5, 0.5));
      m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      m.castShadow = true;
      g.add(m);
    }
    g.userData.bodies = [
      { dx: -span / 2, dz: 0, r: 2.1, h: h + 1.5 },
      { dx: span / 2, dz: 0, r: 2.1, h: h + 1.5 },
    ];
    return g;
  },

  // ---- neon ----
  toriiGate(o = {}) {
    // Neon-edged torii gate — the district's shrine to the old net.
    const g = new THREE.Group();
    const span = o.span || 11, h = o.h || 10.5;
    const col = new THREE.Color(o.color || 0xff4dd8);
    const neon = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.2 });
    for (const sx of [-1, 1]) {
      const post = cyl(M.lacquer, 0.62, 0.78, h, sx * span / 2, h / 2, 0, 12);
      post.rotation.z = -sx * 0.045;
      g.add(post);
      g.add(cyl(M.darkSteel, 0.95, 1.05, 0.6, sx * span / 2, 0.3, 0, 12));
    }
    const kasagi = box(M.lacquer, span + 3.4, 0.85, 1.1, 0, h + 0.1, 0);
    kasagi.rotation.z = 0.0;
    g.add(kasagi);
    const cap = box(M.lacquer, span + 4.2, 0.4, 1.3, 0, h + 0.72, 0);
    g.add(cap);
    g.add(box(M.lacquer, span - 1.6, 0.55, 0.8, 0, h - 1.7, 0));         // nuki tie beam
    g.add(box(M.lacquer, 0.5, 1.6, 0.55, 0, h - 0.75, 0));               // gakuzuka strut
    g.add(box(neon, span + 4.2, 0.09, 0.12, 0, h + 0.95, 0.62));          // neon edge strips
    g.add(box(neon, span + 4.2, 0.09, 0.12, 0, h + 0.95, -0.62));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4),
      new THREE.MeshStandardMaterial({
        color: 0x53e8ff, emissive: 0x53e8ff, emissiveIntensity: 1.6,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      }));
    sign.position.set(span / 2 - 1.4, h - 3.3, 0.42);
    g.add(sign);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), M.glowWarm);
    lantern.position.set(0, h - 2.5, 0);
    g.add(lantern);
    g.userData.bodies = [
      { dx: -span / 2, dz: 0, r: 1.1, h: h + 1 },
      { dx: span / 2, dz: 0, r: 1.1, h: h + 1 },
    ];
    return g;
  },
  substation(o = {}) {
    // Chain-fenced transformer yard: hit it and the grid bites back.
    const g = new THREE.Group();
    g.add(box(M.concrete, 7.5, 0.35, 6, 0, 0.18, 0));
    for (const dx of [-1.8, 1.8]) {
      const t = cyl(M.steel, 1.15, 1.25, 2.9, dx, 1.85, -0.6, 14);
      g.add(t);
      for (let i = 0; i < 4; i++) g.add(cyl(M.darkSteel, 1.3, 1.3, 0.1, dx, 0.9 + i * 0.62, -0.6, 14));
      for (let i = 0; i < 3; i++) {
        g.add(cyl(M.whitePaint, 0.09, 0.13, 0.9, dx - 0.6 + i * 0.6, 3.8, -0.6, 6));
      }
    }
    g.add(box(M.darkSteel, 2.2, 1.6, 1.4, 0, 1.15, 1.9));
    const buzz = new THREE.MeshStandardMaterial({ color: 0x53e8ff, emissive: 0x53e8ff, emissiveIntensity: 1.4 });
    g.add(box(buzz, 0.5, 0.28, 0.06, 0, 1.5, 2.62));
    g.add(box(M.yellowPaint, 0.9, 0.7, 0.06, 1.6, 1.1, 2.62));           // hazard sign
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(cyl(M.darkSteel, 0.05, 0.05, 2.4, Math.cos(a) * 3.6, 1.2, Math.sin(a) * 2.9, 5));
    }
    g.userData.explosive = { r: 9, bodyR: 3.2, hp: 30, top: 4 };
    return g;
  },
  holoGlobe(o = {}) {
    // Rotating holographic globe over a plaza pedestal.
    const g = new THREE.Group();
    const col = new THREE.Color(o.color || 0x53e8ff);
    g.add(cyl(M.darkSteel, 1.6, 2.1, 1.1, 0, 0.55, 0, 14));
    g.add(cyl(M.steel, 0.5, 0.7, 3.4, 0, 2.7, 0, 10));
    const holo = new THREE.Group();
    holo.position.y = 6.6;
    const sphereMat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.3, wireframe: true,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(2.5, 18, 12), sphereMat);
    s.castShadow = false;
    holo.add(s);
    const ringMat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 2.0, transparent: true, opacity: 0.75,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.08, 6, 32), ringMat);
    ring.rotation.x = Math.PI / 2.4;
    holo.add(ring);
    holo.name = 'spinPart';
    g.add(holo);
    g.userData.spin = o.spin ?? 0.35;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'y';
    return g;
  },
  vendCluster(o = {}) {
    // Glowing vending machines huddled under a tin roof — street cover.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const cols = [0xff5040, 0x53e8ff, 0xffb43c];
    const n = o.n || rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 1.7;
      g.add(box(M.darkSteel, 1.5, 3.1, 1.3, x, 1.55, rng.range(-0.12, 0.12)));
      const c = new THREE.Color(cols[i % 3]);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3 }));
      face.position.set(x, 1.8, 0.68);
      g.add(face);
    }
    g.add(box(M.rust, n * 1.7 + 0.6, 0.12, 2.0, 0, 3.4, 0.2, 0.03));
    return g;
  },

  // ---- foundry ----
  blastFurnace(o = {}) {
    // The works' beating heart: hearth, stack, downcomers, a glowing taphole.
    const g = new THREE.Group();
    const h = o.h || 21;
    g.add(cyl(M.rust, 3.6, 4.6, 5.5, 0, 2.75, 0, 16));                    // hearth
    g.add(cyl(M.darkSteel, 2.6, 3.6, h - 9, 0, 5.5 + (h - 9) / 2, 0, 16)); // bosh + stack
    g.add(cyl(M.rust, 2.8, 2.6, 2.4, 0, h - 2.2, 0, 16));                 // throat
    g.add(cyl(M.darkSteel, 3.1, 3.1, 0.5, 0, h - 0.8, 0, 16));
    for (let i = 0; i < 3; i++) {                                          // downcomer pipes
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const p = cyl(M.copper, 0.55, 0.55, h * 0.62, Math.cos(a) * 3.4, h * 0.5, Math.sin(a) * 3.4, 8);
      p.rotation.z = Math.cos(a) * 0.18;
      p.rotation.x = -Math.sin(a) * 0.18;
      g.add(p);
    }
    // catwalk ring + ladder
    g.add(cyl(M.darkSteel, 3.9, 3.9, 0.14, 0, h * 0.55, 0, 16));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(box(M.darkSteel, 0.08, 1.0, 0.08, Math.cos(a) * 3.85, h * 0.55 + 0.55, Math.sin(a) * 3.85));
    }
    g.add(box(M.darkSteel, 0.5, h * 0.5, 0.14, 4.15, h * 0.3, 0));
    const tap = cyl(M.lavaCore, 0.5, 0.66, 0.5, 0, 1.1, 4.35, 10);
    tap.rotation.x = Math.PI / 2.3;
    g.add(tap);
    g.add(box(M.glowLava, 1.3, 0.35, 2.6, 0, 0.2, 5.6));                   // runner of molten iron
    g.userData.steamY = h + 0.5;
    return g;
  },
  conveyor(o = {}) {
    // Elevated ore conveyor on A-frames — duck between the legs.
    const g = new THREE.Group();
    const len = o.len || 20, h = o.h || 5.2;
    for (const zz of [-len * 0.38, 0, len * 0.38]) {
      for (const sx of [-1, 1]) {
        const leg = box(M.rust, 0.4, h, 0.4, sx * 1.3, h / 2, zz);
        leg.rotation.z = -sx * 0.18;
        g.add(leg);
      }
    }
    g.add(box(M.darkSteel, 2.2, 0.35, len, 0, h, 0));
    g.add(box(M.rubber, 1.6, 0.16, len - 0.5, 0, h + 0.26, 0));
    for (let zz = -len / 2 + 1.2; zz < len / 2; zz += 2.4) {
      const roller = cyl(M.steel, 0.12, 0.12, 2.0, 0, h + 0.14, zz, 6);
      roller.rotation.z = Math.PI / 2;
      g.add(roller);
    }
    const drum = cyl(M.darkSteel, 0.55, 0.55, 2.0, 0, h + 0.1, len / 2 + 0.4, 10);
    drum.rotation.z = Math.PI / 2;
    drum.name = 'spinPart';
    g.add(drum);
    for (let i = 0; i < 4; i++) {                                          // ore lumps riding the belt
      const r = rand(0.35, 0.6);
      const ore = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M.rust);
      ore.position.set(rand(-0.4, 0.4), h + 0.45, rand(-len / 2 + 2, len / 2 - 2));
      g.add(ore);
    }
    g.userData.spin = o.spin ?? 1.2;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'z';
    g.userData.bodies = [
      { dx: 0, dz: -len * 0.38, r: 1.6, h: h },
      { dx: 0, dz: 0, r: 1.6, h: h },
      { dx: 0, dz: len * 0.38, r: 1.6, h: h },
    ];
    return g;
  },
  coolantVat(o = {}) {
    // Pressurized coolant vat — cracks open violently.
    const g = new THREE.Group();
    const r = o.r || 2.4;
    g.add(cyl(M.steel, r, r * 1.08, 3.4, 0, 1.7, 0, 16));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2), M.whitePaint);
    dome.position.y = 3.4;
    dome.castShadow = true;
    g.add(dome);
    g.add(cyl(M.copper, 0.28, 0.28, 2.6, r * 0.8, 4.2, 0, 8));
    g.add(box(M.bluePaint, r * 1.1, 0.5, 0.06, 0, 2.2, r + 0.04));
    const gauge = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.glowRed);
    gauge.position.set(0, 3.0, r + 0.1);
    g.add(gauge);
    g.userData.explosive = { r: 8.5, bodyR: r + 0.4, hp: 30, top: 4.5 };
    g.userData.steamY = 4.6;
    return g;
  },

  // ---- uptown ----
  foodTruck(o = {}) {
    // Street-food truck, hatch open, awning out.
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: o.color || 0x5abc9a, roughness: 0.45, metalness: 0.35 });
    g.add(box(paint, 2.5, 2.5, 6.4, 0, 1.85, 0));
    g.add(box(M.whitePaint, 2.5, 0.5, 1.6, 0, 1.0, 3.0));                  // cab nose
    g.add(box(M.glass, 2.3, 0.8, 0.1, 0, 2.6, 3.18));
    for (const [sx, sz] of [[-1.05, -2.1], [1.05, -2.1], [-1.05, 2.1], [1.05, 2.1]]) {
      const w = cyl(M.rubber, 0.55, 0.55, 0.4, sx, 0.55, sz, 12);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    const hatch = box(M.whitePaint, 0.1, 1.3, 3.2, 1.28, 3.6, -0.6);
    hatch.rotation.z = -1.25;
    g.add(hatch);
    g.add(box(M.wood, 0.5, 0.15, 3.4, 1.55, 1.9, -0.6));                   // serving counter
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xffe9c8, emissive: 0xffd9a0, emissiveIntensity: 0.7 }));
    menu.position.set(1.26, 2.6, -0.6);
    menu.rotation.y = Math.PI / 2;
    g.add(menu);
    g.userData.steamY = 3.3;
    return g;
  },
  bandshell(o = {}) {
    // Park bandshell — a quarter-dome stage that eats one lucky rocket.
    const g = new THREE.Group();
    g.add(cyl(M.concrete, 6.4, 6.8, 1.0, 0, 0.5, 0, 24));
    const shellMat = o.mat || M.whitePaint;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(5.6, 20, 12, Math.PI, Math.PI, 0, Math.PI / 2), shellMat);
    shell.position.y = 1.0;
    shell.castShadow = true;
    g.add(shell);
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(5.3, 20, 12, Math.PI, Math.PI, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc880, emissiveIntensity: 0.4, side: THREE.BackSide }));
    inner.position.y = 1.0;
    g.add(inner);
    g.add(cyl(M.wood, 4.6, 4.8, 0.3, 0, 1.12, 0.8, 24));                   // stage boards
    for (const sx of [-4.6, 4.6]) g.add(box(M.concrete, 0.8, 2.4, 0.8, sx, 1.6, 1.4));
    return g;
  },
  planterBench(o = {}) {
    // Concrete planter with shrubs, flanked by benches — park cover.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    g.add(box(M.concrete, 3.4, 1.0, 3.4, 0, 0.5, 0));
    for (let i = 0; i < 3; i++) {
      const r = rng.range(0.7, 1.2);
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), rng.chance(0.5) ? M.foliage : M.foliageBright);
      bush.position.set(rng.range(-0.9, 0.9), 1.0 + r * 0.5, rng.range(-0.9, 0.9));
      bush.scale.y = 0.75;
      bush.castShadow = true;
      g.add(bush);
    }
    for (const sz of [-1, 1]) {
      g.add(box(M.wood, 2.8, 0.12, 0.6, 0, 0.62, sz * 2.35));
      g.add(box(M.wood, 2.8, 0.5, 0.1, 0, 0.95, sz * 2.62));
      for (const sx of [-1.2, 1.2]) g.add(box(M.darkSteel, 0.12, 0.6, 0.55, sx, 0.32, sz * 2.35));
    }
    return g;
  },
  busStop(o = {}) {
    // Glass transit shelter with a lit route sign.
    const g = new THREE.Group();
    g.add(box(M.concrete, 4.6, 0.2, 1.9, 0, 0.1, 0));
    for (const sx of [-2.1, 2.1]) g.add(box(M.steel, 0.14, 2.6, 0.14, sx, 1.4, -0.75));
    g.add(box(M.steel, 4.6, 0.14, 2.0, 0, 2.72, -0.2, 0.02));
    const back = box(M.glass, 4.3, 2.2, 0.08, 0, 1.5, -0.82);
    back.castShadow = false;
    g.add(back);
    g.add(box(M.wood, 3.6, 0.1, 0.5, 0, 0.85, -0.45));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5),
      new THREE.MeshStandardMaterial({
        color: o.color || 0xffb43c, emissive: o.color || 0xffb43c, emissiveIntensity: 1.4, side: THREE.DoubleSide,
      }));
    sign.position.set(2.1, 3.2, -0.2);
    g.add(sign);
    g.add(cyl(M.steel, 0.06, 0.08, 3.6, 2.1, 1.8, -0.2, 6));
    return g;
  },

  // ---- harbor ----
  gantryCrane(o = {}) {
    // Ship-to-shore container gantry — a rolling steel cathedral. Mechs walk
    // between its four legs; each leg is its own collider.
    const g = new THREE.Group();
    const h = o.h || 19, spanX = 9, spanZ = 7;
    const paint = new THREE.MeshStandardMaterial({ color: o.color || 0x2e7a74, roughness: 0.55, metalness: 0.5 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(box(paint, 0.85, h, 0.85, sx * spanX / 2, h / 2, sz * spanZ / 2));
        g.add(box(M.darkSteel, 1.6, 0.8, 2.2, sx * spanX / 2, 0.4, sz * spanZ / 2)); // rail trucks
      }
      g.add(box(paint, 0.6, 0.6, spanZ, sx * spanX / 2, h * 0.55, 0));    // cross braces
    }
    g.add(box(paint, spanX + 1.2, 1.3, 1.6, 0, h + 0.4, spanZ / 2));       // portal beams
    g.add(box(paint, spanX + 1.2, 1.3, 1.6, 0, h + 0.4, -spanZ / 2));
    const boom = box(paint, 1.4, 1.1, o.boom || 26, 0, h + 1.6, 4);        // boom out over the "water"
    g.add(boom);
    g.add(box(M.darkSteel, 2.2, 2.0, 2.6, 1.2, h - 2.2, 2));               // operator cab
    g.add(box(M.glass, 1.6, 1.0, 0.1, 1.2, h - 1.9, 3.32));
    const drop = rand(6, h - 6);
    for (const cx of [-0.8, 0.8]) g.add(cyl(M.darkSteel, 0.05, 0.05, drop, cx, h + 1 - drop / 2, 9, 4));
    g.add(box(M.yellowPaint, 2.6, 0.5, 5.2, 0, h + 1 - drop, 9));          // spreader
    g.add(box(M.redPaint, 2.5, 2.4, 5.0, 0, h - drop - 0.5, 9));           // hanging container
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), M.glowRed);
    lamp.position.set(0, h + 2.6, 16);
    g.add(lamp);
    g.userData.bodies = [
      { dx: -spanX / 2, dz: -spanZ / 2, r: 1.2, h },
      { dx: spanX / 2, dz: -spanZ / 2, r: 1.2, h },
      { dx: -spanX / 2, dz: spanZ / 2, r: 1.2, h },
      { dx: spanX / 2, dz: spanZ / 2, r: 1.2, h },
    ];
    return g;
  },
  containerStack(o = {}) {
    // Proper corrugated container block — port canyon walls.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const tints = [0x9c3428, 0x2e5e8c, 0xc8a028, 0x3e7a4a, 0x8a8a88];
    const rows = o.rows || rng.int(1, 2), tiers = o.tiers || rng.int(2, 3);
    for (let r = 0; r < rows; r++) {
      for (let t = 0; t < tiers; t++) {
        if (t > 0 && rng.chance(0.25)) continue;   // ragged stack tops
        const tint = tints[rng.int(0, tints.length - 1)];
        const mat = texMat('prop_corrugated_steel', null, { repeat: 2, color: tint })
          || new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6, metalness: 0.55 });
        const c = box(mat, 3.2, 2.9, 8.2, r * 3.5 + rng.range(-0.12, 0.12),
          1.45 + t * 2.9, rng.range(-0.3, 0.3), rng.range(-0.03, 0.03));
        g.add(c);
        for (const sz of [-4.11, 4.11]) g.add(box(M.darkSteel, 3.0, 2.7, 0.08, r * 3.5, 1.45 + t * 2.9, sz));
      }
    }
    return g;
  },
  trawler(o = {}) {
    // Fishing trawler riding at anchor — floats on a harbor basin.
    const g = new THREE.Group();
    const hull = box(M.bluePaint, 3.2, 1.9, 10.5, 0, 1.3, 0);
    g.add(hull);
    g.add(box(M.hullRed, 3.3, 0.8, 10.6, 0, 0.4, 0));
    const bow = box(M.bluePaint, 2.3, 1.8, 2.3, 0, 1.35, 5.8, Math.PI / 4);
    g.add(bow);
    g.add(box(M.whitePaint, 2.4, 1.9, 3.4, 0, 3.15, -1.6));
    g.add(box(M.darkSteel, 2.5, 0.3, 3.5, 0, 4.2, -1.6));
    g.add(box(M.glass, 2.0, 0.8, 0.1, 0, 3.5, 0.16));
    g.add(cyl(M.wood, 0.09, 0.12, 5.5, 0.4, 6.0, 0.2, 6));
    const winch = cyl(M.rust, 0.5, 0.5, 1.8, 0, 2.5, -4.2, 8);
    winch.rotation.z = Math.PI / 2;
    g.add(winch);
    g.add(box(M.darkSteel, 0.2, 2.8, 0.2, -1.1, 3.6, -4.4, 0.4));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M.glowWarm);
    lamp.position.set(0.4, 8.6, 0.2);
    g.add(lamp);
    g.userData.bob = { amp: 0.28, speed: 0.9, rock: 0.035 };
    return g;
  },
  netPile(o = {}) {
    // Nets, floats, crates — low quay clutter (walk-over).
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const netMat = new THREE.MeshStandardMaterial({ color: 0x3a5548, roughness: 0.95, metalness: 0 });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(0.8, 1.4), 1), netMat);
      m.position.set(rng.range(-1.8, 1.8), 0.4, rng.range(-1.8, 1.8));
      m.scale.y = 0.45;
      m.castShadow = true;
      g.add(m);
    }
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), i % 2 ? M.redPaint : M.whitePaint);
      f.position.set(rng.range(-2, 2), 0.3, rng.range(-2, 2));
      g.add(f);
    }
    g.add(box(M.wood, 1.4, 0.9, 1.0, rng.range(-1.5, 1.5), 0.45, rng.range(-1.5, 1.5), rng.range(0, 1)));
    g.userData.noCollide = true;
    return g;
  },

  // ---- skyterrace ----
  solarArray(o = {}) {
    // Bank of tilted rooftop photovoltaic panels.
    const g = new THREE.Group();
    const n = o.n || 3;
    const panelMat = texMat('prop_solar_panel', M.panelSolar, { repeat: 2 });
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * 3.1;
      const p = box(panelMat, 6.4, 0.16, 2.6, 0, 1.7, z);
      p.rotation.x = -0.5;
      g.add(p);
      for (const sx of [-2.7, 2.7]) {
        g.add(box(M.steel, 0.14, 1.1, 0.14, sx, 0.55, z + 0.5));
        g.add(box(M.steel, 0.14, 2.0, 0.14, sx, 1.0, z - 0.7));
      }
    }
    g.add(box(M.darkSteel, 1.0, 1.2, 0.8, 3.6, 0.6, 0));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), M.glowGreen);
    led.position.set(3.6, 1.35, 0);
    g.add(led);
    return g;
  },
  gondolaRig(o = {}) {
    // Window-washer davit rig; the cradle sways in the high wind.
    const g = new THREE.Group();
    g.add(box(M.steel, 2.6, 0.7, 1.6, 0, 0.35, 0));
    g.add(box(M.darkSteel, 0.4, 0.4, 1.2, 0, 0.9, -0.2));
    for (const sx of [-0.9, 0.9]) {
      const arm = box(M.whitePaint, 0.28, 0.28, 4.6, sx, 4.6, 1.6);
      arm.rotation.x = 0.35;
      g.add(arm);
      g.add(box(M.whitePaint, 0.28, 4.4, 0.28, sx, 2.2, 0));
      g.add(cyl(M.darkSteel, 0.03, 0.03, 2.6, sx, 4.5, 3.35, 4));
    }
    const cradle = new THREE.Group();
    cradle.position.set(0, 3.2, 3.35);
    cradle.add(box(M.yellowPaint, 2.6, 0.25, 0.9, 0, 0, 0));
    for (const sx of [-1.25, 1.25]) cradle.add(box(M.steel, 0.1, 0.9, 0.9, sx, 0.5, 0));
    cradle.add(box(M.steel, 2.6, 0.1, 0.1, 0, 0.95, 0.4));
    cradle.add(box(M.steel, 2.6, 0.1, 0.1, 0, 0.95, -0.4));
    g.add(cradle);
    g.userData.bob = { amp: 0.16, speed: 1.5, rock: 0.05 };
    g.userData.bodies = [{ dx: 0, dz: 0, r: 1.5, h: 4.8 }];
    return g;
  },
  waterTank(o = {}) {
    // Classic rooftop water tower on stubby legs.
    const g = new THREE.Group();
    const h = o.h || 4.2, r = o.r || 2.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(box(M.darkSteel, 0.3, 2.6, 0.3, Math.cos(a) * r * 0.8, 1.3, Math.sin(a) * r * 0.8));
    }
    const wood = texMat('prop_wood_rough', M.wood, { repeat: 2 });
    g.add(cyl(wood, r * 0.92, r, h, 0, 2.6 + h / 2, 0, 16));
    for (const yy of [0.25, 0.5, 0.75]) g.add(cyl(M.darkSteel, r + 0.04, r + 0.04, 0.12, 0, 2.6 + h * yy, 0, 16));
    g.add(cyl(M.darkSteel, 0.3, r * 0.95, 1.4, 0, 2.6 + h + 0.6, 0, 16));
    g.add(cyl(M.steel, 0.1, 0.1, 1.4, 0, 2.6 + h + 1.8, 0, 6));
    return g;
  },

  // ---- scrapyard ----
  carCrusher(o = {}) {
    // Hydraulic press mid-crush, warning beacon sweeping.
    const g = new THREE.Group();
    g.add(box(M.darkSteel, 6.0, 1.0, 4.4, 0, 0.5, 0));
    const press = machinePaint(2);
    for (const sx of [-2.5, 2.5]) g.add(box(press, 0.9, 6.4, 1.2, sx, 3.2, -0.8));
    g.add(box(press, 6.0, 1.1, 1.6, 0, 6.4, -0.8));
    g.add(box(M.darkSteel, 4.0, 1.6, 3.4, 0, 4.4, -0.5));                   // press slab
    for (const sx of [-1.2, 1.2]) g.add(cyl(M.steel, 0.3, 0.3, 1.6, sx, 5.9, -0.5, 8));
    const car = box(M.rust, 3.6, 0.8, 2.2, 0, 1.4, -0.4);                   // the patient
    car.rotation.z = 0.04;
    g.add(car);
    g.add(box(M.bluePaint, 2.0, 0.4, 1.9, 0.2, 1.9, -0.4, 0.06));
    g.add(box(M.darkSteel, 1.8, 1.9, 1.6, 2.8, 0.95, 1.6));                 // control cab
    g.add(box(M.glass, 1.2, 0.8, 0.08, 2.8, 1.35, 2.42));
    const cage = new THREE.Group();
    cage.position.set(-2.5, 7.4, -0.8);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), M.glowWarm);
    cage.add(bulb);
    cage.add(box(M.darkSteel, 0.06, 0.5, 0.5, 0.3, 0, 0));
    cage.name = 'spinPart';
    g.add(cage);
    g.userData.spin = 2.2;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'y';
    return g;
  },
  crushedStack(o = {}) {
    // Tower of flattened cars — dense, breakable cover.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const tints = [0x6e4a30, 0x4a5468, 0x746032, 0x5c3a34, 0x4e5a46];
    const n = o.n || rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: tints[rng.int(0, tints.length - 1)], roughness: 0.8, metalness: 0.5,
      });
      const c = box(mat, 3.4 + rng.range(-0.3, 0.3), 0.8, 2.1 + rng.range(-0.2, 0.2),
        rng.range(-0.35, 0.35), 0.4 + i * 0.82, rng.range(-0.3, 0.3), rng.range(-0.14, 0.14));
      c.rotation.z = rng.range(-0.05, 0.05);
      g.add(c);
    }
    return g;
  },
  buriedMechHand(o = {}) {
    // A war grave: a colossal mech hand reaching out of the scrap.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const s = o.s || 1;
    const palm = box(M.rust, 4.6 * s, 5.2 * s, 1.9 * s, 0, 2.2 * s, 0);
    palm.rotation.x = -0.5;
    palm.rotation.z = rng.range(-0.15, 0.15);
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const x = (-1.65 + i * 1.1) * s;
      const f1 = box(M.darkSteel, 0.85 * s, 3.4 * s, 0.95 * s, x, 5.6 * s, -0.9 * s);
      f1.rotation.x = -0.85 + rng.range(-0.12, 0.12);
      g.add(f1);
      const f2 = box(M.rust, 0.75 * s, 2.1 * s, 0.85 * s, x, 7.2 * s, -2.6 * s);
      f2.rotation.x = -1.5 + rng.range(-0.15, 0.15);
      g.add(f2);
    }
    const thumb = box(M.darkSteel, 0.95 * s, 3.0 * s, 1.0 * s, 2.9 * s, 3.4 * s, 0.6 * s);
    thumb.rotation.set(-0.2, 0, -0.8);
    g.add(thumb);
    const wrist = cyl(M.rust, 1.7 * s, 2.1 * s, 2.6 * s, 0, 0.6 * s, 1.6 * s, 12);
    wrist.rotation.x = 1.1;
    g.add(wrist);
    for (let i = 0; i < 3; i++) {                                            // torn cables
      const c = cyl(M.darkSteel, 0.09, 0.09, rng.range(1.2, 2.2), rng.range(-1.5, 1.5) * s, 0.7, 2.6 * s, 5);
      c.rotation.x = rng.range(0.8, 1.4);
      g.add(c);
    }
    for (let i = 0; i < 4; i++) {
      const r = rng.range(0.6, 1.3) * s;
      const deb = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M.rust);
      deb.position.set(rng.range(-3.5, 3.5) * s, r * 0.4, rng.range(-2.5, 2.5) * s);
      deb.castShadow = true;
      g.add(deb);
    }
    return g;
  },
  tireMound(o = {}) {
    // Heap of mech-scale tires.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const n = o.n || 8;
    for (let i = 0; i < n; i++) {
      const R = rng.range(0.8, 1.5);
      const t = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.42, 8, 16), M.rubber);
      t.position.set(rng.range(-2.6, 2.6), rng.range(0.4, 2.6), rng.range(-2.6, 2.6));
      t.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      t.castShadow = true;
      g.add(t);
    }
    return g;
  },

  // ---- quarry ----
  headframe(o = {}) {
    // Mine hoist headframe over the old shaft.
    const g = new THREE.Group();
    const h = o.h || 17;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(M.rust, 0.5, h, 0.5, sx * 2.4, h / 2, sz * 1.9);
      leg.rotation.z = -sx * 0.12;
      leg.rotation.x = sz * 0.09;
      g.add(leg);
    }
    for (let yy = 0.3; yy < 0.95; yy += 0.22) {
      g.add(box(M.darkSteel, 4.6 * (1 - yy * 0.25), 0.3, 0.3, 0, h * yy, 1.9 * (1 - yy * 0.3)));
      g.add(box(M.darkSteel, 4.6 * (1 - yy * 0.25), 0.3, 0.3, 0, h * yy, -1.9 * (1 - yy * 0.3)));
    }
    g.add(box(M.darkSteel, 3.6, 1.6, 2.8, 0, h + 0.6, 0));
    for (const sx of [-0.9, 0.9]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.16, 8, 20), M.steel);
      wheel.position.set(sx, h + 2.2, 0);
      wheel.castShadow = true;
      g.add(wheel);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        const spoke = box(M.steel, 0.08, 2.1, 0.08, sx, h + 2.2, 0);
        spoke.rotation.x = a;
        g.add(spoke);
      }
    }
    const shed = texMat('prop_corrugated_steel', M.rust, { repeat: 2 });
    g.add(box(shed, 4.4, 3.2, 3.6, 3.9, 1.6, 0));
    g.add(box(M.darkSteel, 4.6, 0.3, 3.8, 3.9, 3.3, 0, 0.06));
    g.add(cyl(M.darkSteel, 0.05, 0.05, h - 2, 0, (h - 2) / 2 + 1, 0, 4));   // hoist cable
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), M.glowViolet);
    lamp.position.set(0, h + 3.6, 0);
    g.add(lamp);
    g.userData.bodies = [
      { dx: -2.4, dz: -1.9, r: 0.9, h }, { dx: 2.4, dz: -1.9, r: 0.9, h },
      { dx: -2.4, dz: 1.9, r: 0.9, h }, { dx: 2.4, dz: 1.9, r: 0.9, h },
      { dx: 3.9, dz: 0, r: 2.4, h: 3.4 },
    ];
    return g;
  },
  crystalMonolith(o = {}) {
    // One giant resonant crystal, half-excavated, humming with light.
    const g = new THREE.Group();
    const h = o.h || 11;
    const mat = o.mat || new THREE.MeshStandardMaterial({
      color: 0xb46bff, emissive: 0x8a3cff, emissiveIntensity: 1.3,
      roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92,
    });
    const main = new THREE.Mesh(new THREE.ConeGeometry(2.2, h, 6), mat);
    main.position.y = h * 0.42;
    main.rotation.set(0.16, 0.4, -0.1);
    main.castShadow = true;
    g.add(main);
    const side = new THREE.Mesh(new THREE.ConeGeometry(1.1, h * 0.5, 5), mat);
    side.position.set(1.9, h * 0.2, 0.8);
    side.rotation.set(-0.1, 0, 0.5);
    side.castShadow = true;
    g.add(side);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4060, roughness: 0.95 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = rand(0.8, 1.5);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
      m.position.set(Math.cos(a) * 2.6, r * 0.4, Math.sin(a) * 2.6);
      m.castShadow = true;
      g.add(m);
    }
    return g;
  },
  chargeCrate(o = {}) {
    // Blasting charges staged for the next bench cut. Volatile, obviously.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < 3; i++) {
      g.add(box(M.wood, 1.7, 0.9, 1.2, rng.range(-0.8, 0.8), 0.45 + (i > 1 ? 0.9 : 0), rng.range(-0.6, 0.6), rng.range(-0.2, 0.2)));
    }
    g.add(box(M.redPaint, 1.0, 0.5, 0.7, 0.2, 1.9, 0));
    const det = cyl(M.darkSteel, 0.04, 0.04, 3.4, 1.4, 0.1, 1.2, 4);
    det.rotation.z = Math.PI / 2;
    g.add(det);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff4030, emissive: 0xff4030, emissiveIntensity: 0.8, side: THREE.DoubleSide }));
    flag.position.set(-1.0, 2.2, 0);
    g.add(flag);
    g.add(cyl(M.steel, 0.04, 0.05, 2.4, -1.0, 1.2, 0, 5));
    g.userData.explosive = { r: 9.5, bodyR: 1.6, hp: 16, top: 2.4 };
    return g;
  },
  floodlightRig(o = {}) {
    // Pit floodlights on a mast — night-shift mining never stopped.
    const g = new THREE.Group();
    const h = o.h || 9;
    g.add(box(M.darkSteel, 1.8, 0.5, 1.8, 0, 0.25, 0));
    g.add(cyl(M.steel, 0.16, 0.26, h, 0, h / 2, 0, 8));
    const head = new THREE.Group();
    head.position.y = h;
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.75;
      head.add(box(M.darkSteel, 0.62, 0.62, 0.5, x, 0.3, 0));
      const lens = box(new THREE.MeshStandardMaterial({
        color: 0xfff2cc, emissive: 0xffe9b0, emissiveIntensity: 2.6,
      }), 0.5, 0.5, 0.08, x, 0.3, 0.28);
      head.add(lens);
    }
    head.rotation.x = 0.5;
    g.add(head);
    return g;
  },

  // ---- volcano ----
  basaltColumns(o = {}) {
    // Columnar basalt outcrop — hex prisms stepped like Giant's Causeway.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const mat = texMat('prop_basalt', M.basalt, { repeat: 2 });
    const n = o.n || rng.int(6, 9);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), rr = rng.range(0, 2.6);
      const h = rng.range(2.5, o.maxH || 8.5);
      const c = cyl(mat, rng.range(0.75, 1.05), rng.range(0.8, 1.1), h,
        Math.cos(a) * rr, h / 2, Math.sin(a) * rr, 6);
      c.rotation.y = rng.range(0, 1);
      g.add(c);
      if (rng.chance(0.4)) {
        const glow = cyl(M.glowLava, 0.2, 0.3, 0.2, Math.cos(a) * rr + rng.range(-0.5, 0.5), 0.1, Math.sin(a) * rr + rng.range(-0.5, 0.5), 6);
        g.add(glow);
      }
    }
    return g;
  },
  geyserVent(o = {}) {
    // Fumarole cone hissing steam — low, walk-around dressing.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3c2c24, roughness: 0.95 });
    g.add(cyl(rockMat, 0.7, 2.2, 1.4, 0, 0.7, 0, 10));
    g.add(cyl(M.glowLava, 0.45, 0.55, 0.2, 0, 1.42, 0, 10));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const r = rng.range(0.5, 1.0);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
      m.position.set(Math.cos(a) * 2.0, r * 0.4, Math.sin(a) * 2.0);
      m.castShadow = true;
      g.add(m);
    }
    g.userData.steamY = 1.6;
    g.userData.noCollide = true;
    return g;
  },
  monitorStation(o = {}) {
    // Seismic monitoring post — instruments, mast, volatile gas bottles.
    const g = new THREE.Group();
    g.add(box(M.whitePaint, 2.4, 1.6, 1.8, 0, 0.9, 0));
    g.add(box(M.darkSteel, 2.6, 0.2, 2.0, 0, 1.8, 0, 0.04));
    g.add(cyl(M.steel, 0.08, 0.12, 5.5, 0.8, 2.75, -0.5, 6));
    g.add(box(M.darkSteel, 0.7, 0.5, 0.4, 0.8, 5.4, -0.5));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x62ff9a, emissive: 0x62ff9a, emissiveIntensity: 1.2 }));
    screen.position.set(0, 1.15, 0.92);
    g.add(screen);
    for (const dx of [-1.6, -2.1]) {
      g.add(cyl(M.redPaint, 0.32, 0.32, 1.5, dx, 0.75, 0.5, 10));
      g.add(cyl(M.steel, 0.1, 0.1, 0.3, dx, 1.6, 0.5, 8));
    }
    g.userData.explosive = { r: 7.5, bodyR: 1.9, hp: 24, top: 2.2 };
    return g;
  },

  // ---- frozen ----
  icebreakerShip(o = {}) {
    // Icebreaker locked in the floe since the station went dark.
    const g = new THREE.Group();
    const s = o.s || 1;
    const hull = box(M.hullRed, 5.2 * s, 3.4 * s, 17 * s, 0, 1.9 * s, 0);
    hull.rotation.z = 0.07;
    g.add(hull);
    const bow = box(M.hullRed, 3.6 * s, 3.2 * s, 3.6 * s, 0, 2.0 * s, 9.4 * s, Math.PI / 4);
    bow.rotation.z = 0.07;
    g.add(bow);
    g.add(box(M.darkSteel, 5.3 * s, 0.5 * s, 17.2 * s, 0, 3.75 * s, 0, 0));
    const sup = box(M.whitePaint, 4.2 * s, 3.0 * s, 5.5 * s, 0.1 * s, 5.4 * s, -3.5 * s);
    g.add(sup);
    g.add(box(M.glass, 3.6 * s, 0.8 * s, 0.1, 0.1 * s, 6.4 * s, -0.72 * s));
    g.add(cyl(M.yellowPaint, 0.75 * s, 0.9 * s, 2.4 * s, 0.1 * s, 8.0 * s, -5.0 * s, 12));
    g.add(cyl(M.darkSteel, 0.1, 0.12, 4.5 * s, 0.1 * s, 9.5 * s, -2.2 * s, 6));
    g.add(box(M.darkSteel, 0.8 * s, 0.5 * s, 0.5 * s, 0.1 * s, 11.6 * s, -2.2 * s));
    // ice collar
    const ice = texMat('prop_ice_glacial', M.frost, { repeat: 2 });
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(1.0, 2.0) * s, 0), ice);
      m.position.set(Math.cos(a) * 3.4 * s, 0.4, Math.sin(a) * 8.4 * s);
      m.scale.y = 0.5;
      m.castShadow = true;
      g.add(m);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), M.glowRed);
    lamp.position.set(0.1 * s, 12.0 * s, -2.2 * s);
    g.add(lamp);
    g.userData.bodies = [
      { dx: 0, dz: 5.5 * s, r: 2.9 * s, h: 4.5 * s },
      { dx: 0, dz: 0, r: 3.0 * s, h: 4.5 * s },
      { dx: 0, dz: -4.5 * s, r: 2.9 * s, h: 8.5 * s },
    ];
    return g;
  },
  quonsetHut(o = {}) {
    // Half-cylinder expedition shelter, snow on the roof.
    const g = new THREE.Group();
    const len = o.len || 7;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, len, 14, 1, false, 0, Math.PI),
      texMat('prop_corrugated_steel', M.steel, { repeat: 2 }));
    shell.rotation.z = Math.PI / 2;
    shell.rotation.y = Math.PI / 2;
    shell.position.y = 0.9;
    shell.castShadow = true;
    g.add(shell);
    g.add(box(M.steel, 4.8, 1.0, len, 0, 0.5, 0));
    const snow = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, len * 0.85, 14, 1, false, 0.5, Math.PI - 1),
      M.frost);
    snow.rotation.z = Math.PI / 2;
    snow.rotation.y = Math.PI / 2;
    snow.position.y = 1.0;
    g.add(snow);
    g.add(box(M.darkSteel, 1.6, 2.2, 0.3, 0, 1.1, len / 2 + 0.05));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc880, emissiveIntensity: 1.2 }));
    win.position.set(1.2, 1.6, len / 2 + 0.06);
    g.add(win);
    g.add(cyl(M.darkSteel, 0.12, 0.12, 1.6, -1.2, 3.4, -1.5, 6));
    g.userData.steamY = 4.3;
    return g;
  },
  snowcat(o = {}) {
    // Tracked utility snowcat, blade down, frost on the glass.
    const g = new THREE.Group();
    for (const sx of [-1.35, 1.35]) {
      g.add(box(M.rubber, 0.9, 1.0, 4.6, sx, 0.55, 0));
      g.add(box(M.darkSteel, 0.7, 0.4, 4.2, sx, 1.1, 0));
    }
    const cab = machinePaint();
    g.add(box(cab, 2.4, 1.1, 3.8, 0, 1.6, -0.2));
    g.add(box(cab, 2.2, 1.4, 1.8, 0, 2.85, 0.7));
    g.add(box(M.glass, 1.9, 0.9, 0.1, 0, 3.0, 1.64));
    g.add(box(M.frost, 2.25, 0.14, 1.85, 0, 3.6, 0.7));
    const blade = box(M.steel, 3.4, 1.1, 0.3, 0, 0.7, 2.7);
    blade.rotation.x = -0.2;
    g.add(blade);
    for (const sx of [-1, 1]) g.add(box(M.darkSteel, 0.2, 0.2, 1.4, sx, 0.9, 2.0, -0.3));
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M.glowWarm);
    beacon.position.set(0.8, 3.75, 0.7);
    g.add(beacon);
    return g;
  },
  pipelineRun(o = {}) {
    // Heated fuel pipeline on sleepers, valve tower mid-run.
    const g = new THREE.Group();
    const len = o.len || 16;
    const p = cyl(M.steel, 0.75, 0.75, len, 0, 1.3, 0, 12);
    p.rotation.x = Math.PI / 2;
    g.add(p);
    const lag = cyl(M.frost, 0.85, 0.85, len * 0.4, 0, 1.3, len * 0.2, 12);
    lag.rotation.x = Math.PI / 2;
    g.add(lag);
    for (let zz = -len / 2 + 1.5; zz < len / 2; zz += 4) {
      g.add(box(M.darkSteel, 2.0, 0.5, 0.5, 0, 0.25, zz));
      g.add(box(M.darkSteel, 0.4, 1.1, 0.4, 0, 0.7, zz));
    }
    g.add(cyl(M.brass, 0.5, 0.5, 0.4, 0, 2.35, 0, 10));
    g.add(cyl(M.redPaint, 0.55, 0.55, 0.18, 0, 2.7, 0, 10));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), M.glowCyan);
    lamp.position.set(0, 3.0, 0);
    g.add(lamp);
    g.userData.bodies = [
      { dx: 0, dz: -len * 0.3, r: 1.1, h: 2.2 },
      { dx: 0, dz: 0, r: 1.1, h: 2.2 },
      { dx: 0, dz: len * 0.3, r: 1.1, h: 2.2 },
    ];
    return g;
  },

  // ---- ruins ----
  palmTree(o = {}) {
    // Oasis date palm — curved trunk, fan of fronds.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const h = o.h || rng.range(8, 12);
    const lean = rng.range(0.06, 0.22) * (rng.chance(0.5) ? 1 : -1);
    let x = 0;
    for (let i = 0; i < 5; i++) {
      const segH = h / 5;
      const seg = cyl(M.wood, 0.28 - i * 0.03, 0.34 - i * 0.03, segH + 0.2, x, segH * (i + 0.5), 0, 7);
      seg.rotation.z = lean * (i + 1) * 0.4;
      g.add(seg);
      x += Math.sin(lean * (i + 1) * 0.4) * segH;
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.6, 1, 3), M.palmFrond);
      frond.position.set(x + Math.cos(a) * 1.5, h + 0.3, Math.sin(a) * 1.5);
      frond.rotation.set(Math.PI / 2 - 0.85, 0, -a + Math.PI / 2);
      frond.castShadow = true;
      g.add(frond);
    }
    const dates = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), M.rust);
    dates.position.set(x, h - 0.3, 0);
    g.add(dates);
    return g;
  },
  greatGate(o = {}) {
    // Monumental temple pylon gate — twin tapering towers, a doorway between
    // them, glyphs lit. The stone ABOVE the doorway matters: with the lintel
    // slung across two bare towers and open sky over it, the whole thing reads
    // as an H — or, as it was reported from the Desert Ruins, an upside-down
    // bridge. Filling that span (and running one cornice across both towers)
    // is what makes it read as a gate you walk through.
    const g = new THREE.Group();
    const stone = texMat('prop_stone_carved', M.sandstone, { repeat: 3 });
    const h = o.h || 15, gap = o.gap || 7.5;
    const towerX = gap / 2 + 3;
    for (const sx of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(6, h, 4.2), stone);
      tower.position.set(sx * towerX, h / 2, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      g.add(tower);
      const glyphMat = new THREE.MeshStandardMaterial({
        color: 0x2ee6c8, emissive: 0x2ee6c8, emissiveIntensity: 1.0,
      });
      g.add(box(glyphMat, 0.24, h * 0.45, 0.08, sx * towerX - 1.2, h * 0.34, 2.15));
      g.add(box(glyphMat, 0.24, h * 0.36, 0.08, sx * towerX + 1.2, h * 0.3, 2.15));
    }
    // doorway lintel, and the masonry that carries the gate up to the towers
    const doorH = h * 0.62;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(gap + 5, 2.2, 4.0), stone);
    lintel.position.y = doorH + 1.1;
    lintel.castShadow = true;
    g.add(lintel);
    const span = new THREE.Mesh(new THREE.BoxGeometry(gap + 1.2, h - doorH - 2.2, 3.8), stone);
    span.position.y = (h + doorH + 2.2) / 2;
    span.castShadow = true;
    span.receiveShadow = true;
    g.add(span);
    // one cornice across the whole crown, rather than a cap per tower
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(2 * towerX + 6.6, 1.1, 4.8), stone);
    cornice.position.y = h + 0.55;
    cornice.castShadow = true;
    g.add(cornice);
    // winged sun disc over the doorway — what a pylon gate wears
    const discMat = new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffb43c, emissiveIntensity: 1.4 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 20), discMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, doorH + 3.4, 2.0);
    g.add(disc);
    for (const sx of [-1, 1]) {
      g.add(box(discMat, 2.6, 0.34, 0.12, sx * 2.4, doorH + 3.4, 1.98));
      g.add(box(discMat, 1.8, 0.26, 0.12, sx * 3.1, doorH + 2.85, 1.98));
    }
    g.userData.bodies = [
      { dx: -towerX, dz: 0, r: 3.1, h },
      { dx: towerX, dz: 0, r: 3.1, h },
    ];
    return g;
  },
  colonnade(o = {}) {
    // Processional colonnade — four columns, half the architrave gone.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const stone = texMat('prop_stone_carved', M.sandstone, { repeat: 2 });
    const n = o.n || 4, pitch = 4.2, h = o.h || 8;
    const bodies = [];
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * pitch;
      const broken = rng.chance(0.3);
      const ch = broken ? h * rng.range(0.35, 0.6) : h;
      g.add(cyl(stone, 0.85, 1.05, ch, 0, ch / 2, z, 12));
      g.add(box(stone, 2.4, 0.5, 2.4, 0, 0.25, z));
      if (!broken) g.add(box(stone, 2.2, 0.5, 2.2, 0, ch + 0.25, z));
      bodies.push({ dx: 0, dz: z, r: 1.15, h: ch + 0.6 });
    }
    for (let i = 0; i < n - 1; i++) {
      if (rng.chance(0.45)) continue;   // collapsed spans
      const z = (i - (n - 2) / 2) * pitch;
      g.add(box(stone, 1.8, 0.9, pitch + 0.4, 0, h + 0.95, z));
    }
    g.userData.bodies = bodies;
    return g;
  },
  sphinxStatue(o = {}) {
    // Guardian sphinx on a plinth — lion body, watchful head.
    const g = new THREE.Group();
    const stone = texMat('prop_stone_carved', M.sandstone, { repeat: 2 });
    g.add(box(stone, 4.2, 1.2, 8.2, 0, 0.6, 0));
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 5.6), stone);
    body.position.set(0, 2.4, -0.6);
    body.castShadow = true;
    g.add(body);
    for (const sx of [-1.05, 1.05]) {                                       // forepaws
      g.add(box(stone, 0.85, 1.1, 2.6, sx, 1.75, 2.6));
    }
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 1.8), stone);
    chest.position.set(0, 3.4, 1.7);
    chest.castShadow = true;
    g.add(chest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.0, 1.6), stone);
    head.position.set(0, 5.3, 1.9);
    head.castShadow = true;
    g.add(head);
    g.add(box(stone, 2.6, 1.1, 0.5, 0, 5.3, 1.2, 0.02));                    // headdress wings
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2ee6c8, emissive: 0x2ee6c8, emissiveIntensity: 1.5 });
    for (const sx of [-0.45, 0.45]) g.add(box(eyeMat, 0.34, 0.14, 0.08, sx, 5.5, 2.72));
    const tail = cyl(stone, 0.22, 0.3, 3.4, 1.2, 2.2, -3.2, 8);
    tail.rotation.x = 1.1;
    g.add(tail);
    return g;
  },
  digCamp(o = {}) {
    // Archaeologists' tents and crates (they left in a hurry).
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < 2; i++) {
      const x = i * 4.2 - 2, z = rng.range(-1, 1);
      const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 2.3, 2.6, 4), M.canvas);
      tent.position.set(x, 1.3, z);
      tent.rotation.y = Math.PI / 4 + rng.range(-0.2, 0.2);
      tent.castShadow = true;
      g.add(tent);
    }
    for (let i = 0; i < 3; i++) {
      g.add(box(M.wood, 1.2, 0.8, 0.9, rng.range(-3, 3), 0.4, rng.range(1.8, 3), rng.range(0, 1)));
    }
    g.add(cyl(M.steel, 0.05, 0.07, 1.8, 2.6, 0.9, 2.2, 5));                 // shovel
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M.glowWarm);
    lamp.position.set(-2, 2.8, 0);
    g.add(lamp);
    return g;
  },

  // ---- jungle ----
  templeGate(o = {}) {
    // Overgrown serpent gate into the temple precinct.
    const g = new THREE.Group();
    const stone = texMat('prop_stone_mossy', M.mossyStone, { repeat: 2 });
    const h = o.h || 11, gap = o.gap || 6.5;
    for (const sx of [-1, 1]) {
      const x = sx * (gap / 2 + 1.6);
      g.add(box(stone, 3.2, h, 3.2, x, h / 2, 0));
      g.add(box(stone, 3.8, 1.0, 3.8, x, 0.5, 0));
      // moss drape + vines
      g.add(box(M.moss, 3.3, 0.7, 3.3, x, h - 0.35, 0, 0.04));
      for (let i = 0; i < 2; i++) {
        const v = cyl(M.moss, 0.09, 0.12, h * 0.55, x + rand(-1.2, 1.2), h - h * 0.28, 1.7, 5);
        g.add(v);
      }
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(gap + 6.5, 2.4, 3.4), stone);
    lintel.position.y = h + 1.2;
    lintel.castShadow = true;
    g.add(lintel);
    g.add(box(M.moss, gap + 6.7, 0.6, 3.5, 0, h + 2.5, 0, 0.03));
    // serpent heads at the lintel ends
    for (const sx of [-1, 1]) {
      const head = box(stone, 1.3, 1.2, 1.6, sx * (gap / 2 + 2.6), h + 1.1, 2.2);
      head.rotation.x = 0.3;
      g.add(head);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.65),
      new THREE.MeshStandardMaterial({ color: 0x62ff9a, emissive: 0x62ff9a, emissiveIntensity: 2.2 }));
    gem.position.y = h + 1.2;
    gem.position.z = 1.8;
    g.add(gem);
    g.userData.bodies = [
      { dx: -(gap / 2 + 1.6), dz: 0, r: 1.9, h },
      { dx: gap / 2 + 1.6, dz: 0, r: 1.9, h },
    ];
    return g;
  },
  hangingVines(o = {}) {
    // Curtain of lianas between two jungle hardwoods — pure canopy dressing.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const span = o.span || 8, h = o.h || 9;
    for (const sx of [-1, 1]) {
      const trunk = cyl(M.wood, 0.4, 0.6, h, sx * span / 2, h / 2, 0, 7);
      trunk.rotation.z = -sx * 0.06;
      g.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), M.foliage);
      crown.position.set(sx * span / 2, h + 0.8, 0);
      crown.scale.y = 0.6;
      crown.castShadow = true;
      g.add(crown);
    }
    const branch = cyl(M.wood, 0.18, 0.22, span - 1, 0, h - 0.6, 0, 6);
    branch.rotation.z = Math.PI / 2;
    g.add(branch);
    for (let i = 0; i < 7; i++) {
      const x = -span / 2 + 1 + i * ((span - 2) / 6);
      const len = rng.range(2.5, h - 2.5);
      const v = cyl(M.moss, 0.06, 0.1, len, x, h - 0.6 - len / 2, rng.range(-0.3, 0.3), 5);
      v.rotation.x = rng.range(-0.08, 0.08);
      g.add(v);
      if (rng.chance(0.4)) {
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5),
          new THREE.MeshStandardMaterial({ color: 0xff7ab0, emissive: 0xff5090, emissiveIntensity: 0.9 }));
        bloom.position.set(x, h - 0.6 - len, rng.range(-0.3, 0.3));
        g.add(bloom);
      }
    }
    g.userData.bodies = [
      { dx: -span / 2, dz: 0, r: 0.8, h },
      { dx: span / 2, dz: 0, r: 0.8, h },
    ];
    return g;
  },
  giantFern(o = {}) {
    // Mech-scale fern clump — soft concealment, no collision.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const n = o.n || 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const len = rng.range(2.6, 4.2);
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len, 1, 3), M.palmFrond);
      frond.position.set(Math.cos(a) * 0.8, len * 0.38, Math.sin(a) * 0.8);
      frond.rotation.set(-0.9, -a + Math.PI / 2, 0, 'YXZ');
      frond.castShadow = true;
      g.add(frond);
    }
    g.userData.noCollide = true;
    return g;
  },

  // ---- orbital ----
  shuttle(o = {}) {
    // Cargo shuttle on its gear, wings swept, running lights on.
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 8.5, 6, 12), M.whitePaint);
    body.rotation.x = Math.PI / 2;
    body.position.y = 2.6;
    body.castShadow = true;
    g.add(body);
    g.add(box(M.darkSteel, 3.4, 0.5, 5.5, 0, 2.0, -0.5));
    for (const sx of [-1, 1]) {                                              // delta wings
      const wing = box(M.darkSteel, 3.6, 0.25, 4.6, sx * 2.6, 2.2, -2.2);
      wing.rotation.y = sx * 0.5;
      g.add(wing);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), sx > 0 ? M.glowGreen : M.glowRed);
      tip.position.set(sx * 4.3, 2.35, -3.9);
      g.add(tip);
    }
    const tail = box(M.whitePaint, 0.25, 2.4, 1.8, 0, 4.4, -4.6);
    tail.rotation.x = -0.2;
    g.add(tail);
    for (const sx of [-0.8, 0.8]) {
      const bell = cyl(M.darkSteel, 0.55, 0.8, 1.1, sx, 2.4, -5.6, 12);
      bell.rotation.x = Math.PI / 2;
      g.add(bell);
      const glowDisc = cyl(M.glowCyan, 0.4, 0.4, 0.1, sx, 2.4, -6.2, 10);
      glowDisc.rotation.x = Math.PI / 2;
      g.add(glowDisc);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.55, 12, 8), M.darkSteel);
    nose.position.set(0, 2.6, 4.6);
    nose.scale.z = 1.5;
    nose.castShadow = true;
    g.add(nose);
    for (const [gx, gz] of [[0, 4], [-1.6, -2.2], [1.6, -2.2]]) {           // landing gear
      g.add(cyl(M.steel, 0.14, 0.14, 1.6, gx, 0.8, gz, 6));
      g.add(box(M.rubber, 0.5, 0.55, 0.7, gx, 0.3, gz));
    }
    return g;
  },
  solarWing(o = {}) {
    // Station solar array on a slow sun-tracking mount.
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 1.2, 1.6, 1.2, 0, 0.6, 0, 12));
    g.add(cyl(M.steel, 0.4, 0.5, 3.2, 0, 2.6, 0, 10));
    const wing = new THREE.Group();
    wing.position.y = 4.4;
    const panelMat = texMat('prop_solar_panel', M.panelSolar, { repeat: 3 });
    for (const sx of [-1, 1]) {
      const p = box(panelMat, 7.5, 0.18, 3.2, sx * 4.4, 0, 0);
      wing.add(p);
      wing.add(box(M.steel, 7.6, 0.28, 0.28, sx * 4.4, 0, 0));
    }
    wing.add(box(M.darkSteel, 1.6, 0.9, 1.0, 0, 0, 0));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M.glowGreen);
    led.position.set(0, 0.6, 0);
    wing.add(led);
    wing.rotation.z = 0.35;
    wing.name = 'spinPart';
    g.add(wing);
    g.userData.spin = o.spin ?? 0.12;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'y';
    return g;
  },
  cryoTank(o = {}) {
    // Horizontal cryogenic tank, venting — do not shoot. (Shoot it.)
    const g = new THREE.Group();
    const r = o.r || 1.9, len = o.len || 7;
    for (const sz of [-len * 0.28, len * 0.28]) {
      g.add(box(M.darkSteel, 2.6, 1.0, 0.8, 0, 0.5, sz));
    }
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - r * 2, 6, 14), M.whitePaint);
    tank.rotation.x = Math.PI / 2;
    tank.position.y = r + 0.7;
    tank.castShadow = true;
    g.add(tank);
    const band = cyl(M.frost, r + 0.06, r + 0.06, len * 0.3, 0, r + 0.7, 0, 14);
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const glowStripe = new THREE.MeshStandardMaterial({ color: 0x53e8ff, emissive: 0x53e8ff, emissiveIntensity: 1.3 });
    g.add(box(glowStripe, 0.2, 0.2, len * 0.7, r * 0.9, r + 0.7, 0));
    g.add(cyl(M.copper, 0.16, 0.16, 1.4, 0, r * 2 + 0.9, len * 0.3, 8));
    const valve = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M.glowCyan);
    valve.position.set(0, r * 2 + 1.6, len * 0.3);
    g.add(valve);
    g.userData.explosive = { r: 9, bodyR: r + 0.6, hp: 30, top: r * 2 + 1 };
    g.userData.steamY = r * 2 + 1.8;
    return g;
  },
  roboticArm(o = {}) {
    // Deck manipulator arm frozen mid-task, slowly tracking.
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 1.5, 1.9, 0.9, 0, 0.45, 0, 12));
    const arm = new THREE.Group();
    arm.position.y = 0.9;
    arm.add(cyl(M.steel, 0.7, 0.9, 1.4, 0, 0.7, 0, 10));
    const seg1 = box(M.whitePaint, 0.8, 4.4, 0.8, 0, 3.2, 0);
    seg1.rotation.x = 0.5;
    seg1.position.z = 1.1;
    arm.add(seg1);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), M.darkSteel);
    elbow.position.set(0, 4.9, 2.2);
    arm.add(elbow);
    const seg2 = box(M.whitePaint, 0.65, 3.6, 0.65, 0, 6.1, 3.4);
    seg2.rotation.x = 1.15;
    arm.add(seg2);
    const wrist = new THREE.Group();
    wrist.position.set(0, 6.6, 5.0);
    for (const sx of [-0.3, 0.3]) {
      const claw = box(M.darkSteel, 0.2, 1.2, 0.5, sx, -0.5, 0.3);
      claw.rotation.x = 0.5;
      wrist.add(claw);
    }
    wrist.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), M.steel));
    arm.add(wrist);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M.glowWarm);
    lamp.position.set(0, 5.0, 2.2);
    arm.add(lamp);
    arm.name = 'spinPart';
    g.add(arm);
    g.userData.spin = o.spin ?? 0.18;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'y';
    return g;
  },

  // combat furniture: cover, hazards and gimmicks that read the same in any
  // arena. Each reuses an existing arena gameplay hook (userData.explosive /
  // .spikes / .campfire / .spin / .noCollide) so it is functional in a real
  // match, not just dressing.
  // ==================================================================

  // Low destructible cover wall — hunker behind it, then blast through it.
  // Solid + breakable via the arena's automatic cylinder collider.
  barricade(o = {}) {
    const g = new THREE.Group();
    const w = o.w || 6, h = o.h || 2.6, t = o.t || 0.9;
    const body = box(M.concrete, w, h, t, 0, h / 2, 0);
    g.add(body);
    // hazard chevrons + rebar caps so it reads as a barrier
    for (let i = -1; i <= 1; i++) {
      g.add(box(M.yellowPaint, w / 3.4, h * 0.32, t + 0.04, i * (w / 3), h * 0.7, 0));
    }
    for (const sx of [-1, 1]) g.add(box(M.darkSteel, 0.5, h + 0.5, t + 0.3, sx * (w / 2 - 0.25), (h + 0.5) / 2, 0));
    return g;
  },

  // Squat metal pillar / bollard cluster — hard sight-line breaker.
  pillar(o = {}) {
    const g = new THREE.Group();
    const h = o.h || 7, r = o.r || 1.3;
    const mat = o.stone ? M.concrete : M.steel;
    g.add(cyl(mat, r * 0.9, r, h, 0, h / 2, 0, 12));
    g.add(cyl(M.darkSteel, r + 0.3, r + 0.4, 0.7, 0, 0.35, 0, 12));
    g.add(cyl(M.darkSteel, r + 0.2, r + 0.2, 0.6, 0, h - 0.3, 0, 12));
    return g;
  },

  // Decommissioned sentry turret — solid dome + barrel, slowly sweeping.
  sentryTurret(o = {}) {
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 1.7, 2.1, 1.2, 0, 0.6, 0, 10));
    const head = new THREE.Group();
    head.position.y = 1.7;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.steel);
    dome.castShadow = true;
    head.add(dome);
    head.add(box(M.redPaint, 0.5, 0.5, 2.6, 0, 0.5, 1.4));
    const barrel = cyl(M.darkSteel, 0.2, 0.2, 2.4, 0.35, 0.5, 0, 6);
    barrel.rotation.x = Math.PI / 2;  // lay the barrel along +Z
    barrel.position.z = 1.4;
    head.add(barrel);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.glowRed);
    eye.position.set(0, 0.55, 1.45);
    head.add(eye);
    head.name = 'spinPart';
    g.add(head);
    g.userData.spin = o.spin ?? 0.4;    // head sweeps horizontally
    g.userData.spinName = 'spinPart';   // resolved by name (JSON-safe for ghost clones)
    g.userData.spinAxis = 'y';
    return g;
  },

  // Energy barrier — a translucent glowing wall between two emitter posts.
  // Solid (auto collider) and unmistakably an obstacle.
  forceWall(o = {}) {
    const g = new THREE.Group();
    const w = o.w || 8, h = o.h || 5;
    const col = o.color || 0x53e8ff;
    const fieldMat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 1.1,
      transparent: true, opacity: 0.28, roughness: 0.3, side: THREE.DoubleSide,
    });
    const field = box(fieldMat, w - 0.8, h, 0.3, 0, h / 2 + 0.6, 0);
    field.castShadow = false; field.receiveShadow = false;
    g.add(field);
    // horizontal scan bars
    for (let i = 1; i <= 3; i++) {
      const bar = box(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 }),
        w - 0.8, 0.08, 0.34, 0, (h / 4) * i + 0.6, 0);
      g.add(bar);
    }
    for (const sx of [-1, 1]) {
      g.add(cyl(M.darkSteel, 0.5, 0.7, h + 1.2, sx * (w / 2 - 0.4), (h + 1.2) / 2, 0, 8));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
      cap.position.set(sx * (w / 2 - 0.4), h + 1.2, 0);
      g.add(cap);
    }
    return g;
  },

  // Proximity mine — small volatile charge. Uses the arena EXPLOSIVE hook, so
  // it genuinely cooks off on contact/damage like a fuel tank, but smaller.
  mine(o = {}) {
    const g = new THREE.Group();
    const r = o.r || 1.1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), M.darkSteel);
    body.position.y = r * 0.15;
    body.castShadow = true;
    g.add(body);
    g.add(cyl(M.rust, r * 1.1, r * 1.2, 0.3, 0, 0.15, 0, 12));
    // spikes/pressure horns
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const horn = cyl(M.steel, 0.06, 0.12, 0.7, Math.cos(a) * r * 0.7, r * 0.55, Math.sin(a) * r * 0.7, 5);
      horn.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(horn);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M.glowRed);
    led.position.y = r * 0.7;
    g.add(led);
    g.userData.explosive = { r: 7 + r * 2, bodyR: r + 0.4, hp: 12, top: r * 1.2 };
    g.userData.noCollide = true; // walk onto it to trigger — no invisible wall
    return g;
  },

  // Ground spike strip — flat retractable-look hazard. Uses the SPIKES hook:
  // stepping across it cuts and shoves, same as obsidian spikes.
  spikeStrip(o = {}) {
    const g = new THREE.Group();
    const w = o.w || 6;
    g.add(box(M.darkSteel, w, 0.25, 2.2, 0, 0.12, 0));
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < Math.round(w * 1.4); i++) {
      const x = -w / 2 + 0.5 + i * (w / (Math.round(w * 1.4)));
      const bh = rng.range(0.7, 1.3);
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.22, bh, 4), M.steel);
      s.position.set(x, 0.25 + bh / 2, rng.range(-0.7, 0.7));
      s.castShadow = true;
      g.add(s);
    }
    g.userData.spikes = { r: Math.max(2.4, w / 2) };
    return g;
  },

  // Bounce / launch pad — glowing pad ringed with arrows. Walk-over (noCollide)
  // so movement isn't blocked; reads as a mobility gimmick.
  jumpPad(o = {}) {
    const g = new THREE.Group();
    const r = o.r || 2.6;
    const col = o.color || 0x62ff9a;
    const glowMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.2 });
    g.add(cyl(M.darkSteel, r + 0.3, r + 0.5, 0.5, 0, 0.25, 0, 20));
    g.add(cyl(glowMat, r, r, 0.14, 0, 0.55, 0, 20));
    // chevrons pointing up-and-in
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (0.4 + i * 0.22), 0.09, 6, 20),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 - i * 0.2 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.6 + i * 0.02;
      g.add(ring);
    }
    g.userData.noCollide = true;
    return g;
  },

  // Teleporter pad — a hovering ring over a base disc, gently lit. Walk-over.
  teleporter(o = {}) {
    const g = new THREE.Group();
    const r = o.r || 2.4;
    const col = o.color || 0xff4dd8;
    g.add(cyl(M.darkSteel, r, r + 0.4, 0.4, 0, 0.2, 0, 18));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r - 0.2, 24),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4, transparent: true, opacity: 0.7 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.42;
    g.add(disc);
    const ringMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.3, 0.16, 8, 24), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.2;
    g.add(ring);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(cyl(M.darkSteel, 0.12, 0.12, 3.2, Math.cos(a) * (r - 0.3), 1.7, Math.sin(a) * (r - 0.3), 6));
    }
    g.userData.noCollide = true;
    return g;
  },

  // Rotating hazard beacon — warning light on a pole. Solid pole; the lamp
  // sweeps (spin hook).
  beacon(o = {}) {
    const g = new THREE.Group();
    const h = o.h || 5.5;
    const col = o.color || 0xffb020;
    g.add(cyl(M.darkSteel, 0.24, 0.34, h, 0, h / 2, 0, 8));
    const cage = new THREE.Group();
    cage.position.y = h;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 3 }));
    cage.add(lamp);
    // one-sided reflector so the sweep reads while spinning
    cage.add(box(M.darkSteel, 0.1, 1.2, 1.2, 0.7, 0, 0));
    cage.name = 'spinPart';
    g.add(cage);
    g.userData.spin = o.spin ?? 1.4;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'y';
    return g;
  },

  // Blast crater — scorched ground ring with a debris lip. Flat walk-over
  // set-dressing that makes a battlefield feel fought-over.
  crater(o = {}) {
    const g = new THREE.Group();
    const r = o.r || 4;
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(r, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 1, metalness: 0 }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.04;
    g.add(scorch);
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.95 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const cr = r * rng.range(0.86, 1.02);
      const chunk = box(lipMat, rng.range(0.6, 1.4), rng.range(0.3, 0.8), rng.range(0.6, 1.2),
        Math.cos(a) * cr, 0.2, Math.sin(a) * cr, rng.range(0, 3));
      g.add(chunk);
    }
    g.userData.noCollide = true;
    return g;
  },
};

// ---------------------------------------------------------------------------
// MESH MERGE — the props' draw-call diet.
//
// A prop is authored as a pile of small boxes and cylinders (a substation is
// 28 of them) because that is how you sculpt readable shapes in code. The
// renderer sees 28 objects and issues 28 draw calls, and then the arena's
// toroidal wrap clones the whole prop group into the 8 neighbour cells, so
// every one of those meshes is submitted NINE times. Measured on `neon`:
// 2,439 prop meshes, ~720 of the frame's 1,590 draw calls — for 3% of its
// triangles. Props were never a triangle problem; they were an object-count
// problem.
//
// So once a prop is built, placed and MEASURED (its collider, hazards and
// hitboxes all come off the individual meshes — see Arena._regProp), the
// meshes that share a material are baked into one geometry. Same triangles,
// same pixels, a handful of objects instead of dozens.
//
// What is deliberately left alone:
//   · a named moving part (`userData.spinName` — the crusher beacon, the
//     conveyor drum, the sentry head): merging it into the body would weld
//     the animation shut, so that subtree is skipped whole
//   · a prop whose visuals came from a GLB — one mesh already
//   · anything with a single mesh, or a lone mesh per material
// Nothing about position, rotation, userData or the group's identity in
// propGroup.children changes, which is what the destruction path indexes.
export function mergePropMeshes(group) {
  if (!group || group.userData.merged) return 0;
  const keep = group.userData.spinName
    ? group.getObjectByName(group.userData.spinName)
    : null;
  group.updateMatrixWorld(true);
  // the body, then the moving part on its own: a spin part must stay a
  // separate object (it turns), but its own handful of meshes can still be
  // baked together inside it
  let saved = mergeUnder(group, keep);
  if (keep && keep.isObject3D && !keep.isMesh) saved += mergeUnder(keep, null);
  group.userData.merged = true;
  return saved;
}

// Bake every mesh under `root` (skipping `exclude`'s subtree) into one mesh
// per material, expressed in root's own local space. Returns meshes removed.
function mergeUnder(root, exclude) {
  const isProtected = (o) => {
    if (!exclude) return false;
    for (let p = exclude; p; p = p.parent) if (p === o) return true;
    return false;
  };

  const byMat = new Map();   // material -> the meshes wearing it
  let scanned = 0;
  for (const child of [...root.children]) {
    if (isProtected(child)) continue;
    child.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || !o.geometry?.attributes?.position) return;
      scanned++;
      const bucket = byMat.get(o.material) || [];
      bucket.push(o);
      byMat.set(o.material, bucket);
    });
  }
  if (scanned < 2) return 0;

  const rootInv = root.matrixWorld.clone().invert();
  const merged = [];
  let removed = 0;
  for (const [mat, meshes] of byMat) {
    if (meshes.length < 2) continue;
    const geos = [];
    let cast = false, receive = false;
    for (const m of meshes) {
      const g2 = m.geometry.clone();
      // into ROOT's local space: the group's own transform (where the prop
      // stands in the arena, its yaw) must stay on the group, not be baked in
      g2.applyMatrix4(rootInv.clone().multiply(m.matrixWorld));
      // merging needs identical attribute sets; the sculpting vocabulary only
      // ever produces position/normal/uv, but a stray extra would break it
      for (const key of Object.keys(g2.attributes)) {
        if (key !== 'position' && key !== 'normal' && key !== 'uv') g2.deleteAttribute(key);
      }
      if (!g2.attributes.normal) g2.computeVertexNormals();
      if (!g2.attributes.uv) {
        const n = g2.attributes.position.count;
        g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      geos.push(g2);
      cast = cast || m.castShadow;
      receive = receive || m.receiveShadow;
    }
    // mergeGeometries needs one answer for the whole batch: keep the indices
    // when every part has them (the sculpting primitives all do, and dropping
    // them would inflate a 24-vertex box into 36), otherwise flatten
    const parts = geos.every((g2) => g2.index) ? geos : geos.map((g2) => {
      if (!g2.index) return g2;
      const flat = g2.toNonIndexed();
      g2.dispose();
      return flat;
    });
    const combined = mergeGeometries(parts, false);
    parts.forEach((g2) => g2.dispose());
    if (!combined) continue;
    const mesh = new THREE.Mesh(combined, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    merged.push(mesh);
    for (const m of meshes) {
      m.removeFromParent();
      m.geometry.dispose();
      removed++;
    }
  }
  // empty husks left behind by the meshes that moved into a merged buffer
  for (const child of [...root.children]) {
    if (isProtected(child) || child.isMesh) continue;
    if (!child.children.length) child.removeFromParent();
  }
  merged.forEach((m) => root.add(m));
  return removed - merged.length;
}

// place a prop group at a position with rotation
export function placeProp(scene, list, name, x, z, opts = {}) {
  const builder = PROPS[name];
  if (!builder) return null;
  const g = builder(opts);
  g.name = `prop:${name}`;   // findable in the scene graph from dev tools
  propGlbSwap(name, g);   // generated model available? swap visuals, keep hooks
  g.position.x = x;
  g.position.z = z;
  if (opts.ry !== undefined) g.rotation.y = opts.ry;
  else g.rotation.y = rand(Math.PI * 2);
  scene.add(g);
  list.push(g);
  return g;
}
