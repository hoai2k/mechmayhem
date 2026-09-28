// The HARBOR arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { rand, makeRng } from '../../core/utils.js';
import { M, texMat, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
