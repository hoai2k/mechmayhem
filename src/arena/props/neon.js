// The NEON arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { M, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
