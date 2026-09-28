// The VOLCANO arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { M, texMat, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
