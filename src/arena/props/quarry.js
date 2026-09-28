// The QUARRY arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { rand, makeRng } from '../../core/utils.js';
import { M, texMat, machinePaint, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
