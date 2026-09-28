// The SCRAPYARD arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { M, machinePaint, box, cyl } from './kit.js';

export const base = {
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
};

export const landmarks = {
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
};
