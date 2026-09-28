// The JUNGLE arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { rand, makeRng } from '../../core/utils.js';
import { M, texMat, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
