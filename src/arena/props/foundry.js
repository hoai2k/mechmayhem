// The FOUNDRY arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { rand } from '../../core/utils.js';
import { M, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
