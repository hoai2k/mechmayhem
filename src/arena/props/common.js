// Arena props shared by every theme: the generic industrial/street kit, and
// the shared set pieces of the 2026-07 redesign (the viaduct's piers, the
// rock arch). Builders take an options object and return a THREE.Group; the
// full table is PROPS in ../props.js.
import * as THREE from 'three';
import { rand, makeRng } from '../../core/utils.js';
import { M, machinePaint, box, cyl } from './kit.js';

export const COMMON = {
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
};

export const SET_PIECES = {
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
};
