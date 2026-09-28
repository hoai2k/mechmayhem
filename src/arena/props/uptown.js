// The UPTOWN arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { M, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
