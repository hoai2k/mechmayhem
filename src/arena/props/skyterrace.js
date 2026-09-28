// The SKYTERRACE arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { M, texMat, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
