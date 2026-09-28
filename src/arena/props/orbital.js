// The ORBITAL arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { M, texMat, box, cyl } from './kit.js';

export const base = {
  // ---- orbital ----
  landingPad(o = {}) {
    // Hex landing pad with running edge lights.
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 6.2, 6.6, 0.5, 0, 0.25, 0, 6));
    g.add(cyl(M.steel, 4.6, 4.6, 0.54, 0, 0.27, 0, 6));
    const ringMat = new THREE.MeshStandardMaterial({
      color: o.color || 0x53e8ff, emissive: o.color || 0x53e8ff, emissiveIntensity: 1.8, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.9, 6), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.rotation.z = Math.PI / 6;
    ring.position.y = 0.56;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      g.add(box(ringMat, 0.4, 0.34, 0.4, Math.cos(a) * 5.6, 0.55, Math.sin(a) * 5.6));
    }
    g.add(box(M.yellowPaint, 1.2, 0.9, 1.6, 5.8, 0.45, 0));
    return g;
  },
  dishArray(o = {}) {
    // Pair of deep-space dishes tracking something far away.
    const g = new THREE.Group();
    g.add(box(M.darkSteel, 6.5, 0.6, 3.4, 0, 0.3, 0));
    for (const sx of [-1.7, 1.7]) {
      g.add(cyl(M.steel, 0.3, 0.42, 3.2, sx, 2.2, 0, 8));
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), M.whitePaint);
      dish.position.set(sx, 4.0, 0);
      dish.scale.y = 0.55;
      dish.rotation.x = -2.4;
      dish.rotation.z = sx > 0 ? -0.25 : 0.25;
      dish.castShadow = true;
      g.add(dish);
      const feed = cyl(M.darkSteel, 0.05, 0.05, 1.7, sx, 4.4, 0.9, 5);
      feed.rotation.x = 0.7;
      g.add(feed);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M.glowRed);
      tip.position.set(sx, 4.75, 1.55);
      g.add(tip);
    }
    return g;
  },
  cargoPods(o = {}) {
    // Stacked pressurized cargo capsules with status stripes.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const mats = [M.whitePaint, M.bluePaint, M.yellowPaint];
    const glowMats = [M.glowCyan, M.glowGreen, M.glowWarm];
    const n = o.n || rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const y = 1.2 + (i > 1 ? 2.4 : 0);
      const xo = i === 1 ? 2.7 : 0, zo = i === 1 ? rng.range(-0.6, 0.6) : 0;
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.6, 4, 10), mats[rng.int(0, 2)]);
      pod.position.set(xo, y, zo);
      pod.rotation.set(0, rng.range(-0.3, 0.3), Math.PI / 2);
      pod.castShadow = true;
      g.add(pod);
      const band = cyl(glowMats[rng.int(0, 2)], 1.14, 1.14, 0.22, xo, y, zo, 12);
      band.rotation.z = Math.PI / 2;
      band.rotation.y = pod.rotation.y;
      g.add(band);
      g.add(box(M.darkSteel, 3.0, 0.25, 2.0, xo, y - 1.25, zo, pod.rotation.y));
    }
    return g;
  },
  conduit(o = {}) {
    // Glowing power conduit running along the deck plating.
    const g = new THREE.Group();
    const len = o.len || 16;
    const col = o.color || 0x53e8ff;
    const glowMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.7 });
    g.add(box(M.darkSteel, 0.9, 0.2, len, 0, 0.1, 0));
    g.add(box(glowMat, 0.34, 0.24, len - 0.5, 0, 0.12, 0));
    for (let zz = -len / 2 + 2; zz < len / 2; zz += 4) {
      g.add(cyl(M.steel, 0.7, 0.8, 0.3, 0, 0.15, zz, 10));
      g.add(cyl(glowMat, 0.3, 0.3, 0.34, 0, 0.17, zz, 10));
    }
    g.add(box(M.steel, 1.4, 1.1, 1.4, 0, 0.55, len / 2 + 0.7));
    g.add(box(glowMat, 0.5, 0.5, 0.1, 0, 0.62, len / 2 + 1.41));
    return g;
  },
};

export const landmarks = {
  // ---- orbital ----
  shuttle(o = {}) {
    // Cargo shuttle on its gear, wings swept, running lights on.
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 8.5, 6, 12), M.whitePaint);
    body.rotation.x = Math.PI / 2;
    body.position.y = 2.6;
    body.castShadow = true;
    g.add(body);
    g.add(box(M.darkSteel, 3.4, 0.5, 5.5, 0, 2.0, -0.5));
    for (const sx of [-1, 1]) {                                              // delta wings
      const wing = box(M.darkSteel, 3.6, 0.25, 4.6, sx * 2.6, 2.2, -2.2);
      wing.rotation.y = sx * 0.5;
      g.add(wing);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), sx > 0 ? M.glowGreen : M.glowRed);
      tip.position.set(sx * 4.3, 2.35, -3.9);
      g.add(tip);
    }
    const tail = box(M.whitePaint, 0.25, 2.4, 1.8, 0, 4.4, -4.6);
    tail.rotation.x = -0.2;
    g.add(tail);
    for (const sx of [-0.8, 0.8]) {
      const bell = cyl(M.darkSteel, 0.55, 0.8, 1.1, sx, 2.4, -5.6, 12);
      bell.rotation.x = Math.PI / 2;
      g.add(bell);
      const glowDisc = cyl(M.glowCyan, 0.4, 0.4, 0.1, sx, 2.4, -6.2, 10);
      glowDisc.rotation.x = Math.PI / 2;
      g.add(glowDisc);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.55, 12, 8), M.darkSteel);
    nose.position.set(0, 2.6, 4.6);
    nose.scale.z = 1.5;
    nose.castShadow = true;
    g.add(nose);
    for (const [gx, gz] of [[0, 4], [-1.6, -2.2], [1.6, -2.2]]) {           // landing gear
      g.add(cyl(M.steel, 0.14, 0.14, 1.6, gx, 0.8, gz, 6));
      g.add(box(M.rubber, 0.5, 0.55, 0.7, gx, 0.3, gz));
    }
    return g;
  },
  solarWing(o = {}) {
    // Station solar array on a slow sun-tracking mount.
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 1.2, 1.6, 1.2, 0, 0.6, 0, 12));
    g.add(cyl(M.steel, 0.4, 0.5, 3.2, 0, 2.6, 0, 10));
    const wing = new THREE.Group();
    wing.position.y = 4.4;
    const panelMat = texMat('prop_solar_panel', M.panelSolar, { repeat: 3 });
    for (const sx of [-1, 1]) {
      const p = box(panelMat, 7.5, 0.18, 3.2, sx * 4.4, 0, 0);
      wing.add(p);
      wing.add(box(M.steel, 7.6, 0.28, 0.28, sx * 4.4, 0, 0));
    }
    wing.add(box(M.darkSteel, 1.6, 0.9, 1.0, 0, 0, 0));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M.glowGreen);
    led.position.set(0, 0.6, 0);
    wing.add(led);
    wing.rotation.z = 0.35;
    wing.name = 'spinPart';
    g.add(wing);
    g.userData.spin = o.spin ?? 0.12;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'y';
    return g;
  },
  cryoTank(o = {}) {
    // Horizontal cryogenic tank, venting — do not shoot. (Shoot it.)
    const g = new THREE.Group();
    const r = o.r || 1.9, len = o.len || 7;
    for (const sz of [-len * 0.28, len * 0.28]) {
      g.add(box(M.darkSteel, 2.6, 1.0, 0.8, 0, 0.5, sz));
    }
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - r * 2, 6, 14), M.whitePaint);
    tank.rotation.x = Math.PI / 2;
    tank.position.y = r + 0.7;
    tank.castShadow = true;
    g.add(tank);
    const band = cyl(M.frost, r + 0.06, r + 0.06, len * 0.3, 0, r + 0.7, 0, 14);
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const glowStripe = new THREE.MeshStandardMaterial({ color: 0x53e8ff, emissive: 0x53e8ff, emissiveIntensity: 1.3 });
    g.add(box(glowStripe, 0.2, 0.2, len * 0.7, r * 0.9, r + 0.7, 0));
    g.add(cyl(M.copper, 0.16, 0.16, 1.4, 0, r * 2 + 0.9, len * 0.3, 8));
    const valve = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M.glowCyan);
    valve.position.set(0, r * 2 + 1.6, len * 0.3);
    g.add(valve);
    g.userData.explosive = { r: 9, bodyR: r + 0.6, hp: 30, top: r * 2 + 1 };
    g.userData.steamY = r * 2 + 1.8;
    return g;
  },
  roboticArm(o = {}) {
    // Deck manipulator arm frozen mid-task, slowly tracking.
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 1.5, 1.9, 0.9, 0, 0.45, 0, 12));
    const arm = new THREE.Group();
    arm.position.y = 0.9;
    arm.add(cyl(M.steel, 0.7, 0.9, 1.4, 0, 0.7, 0, 10));
    const seg1 = box(M.whitePaint, 0.8, 4.4, 0.8, 0, 3.2, 0);
    seg1.rotation.x = 0.5;
    seg1.position.z = 1.1;
    arm.add(seg1);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), M.darkSteel);
    elbow.position.set(0, 4.9, 2.2);
    arm.add(elbow);
    const seg2 = box(M.whitePaint, 0.65, 3.6, 0.65, 0, 6.1, 3.4);
    seg2.rotation.x = 1.15;
    arm.add(seg2);
    const wrist = new THREE.Group();
    wrist.position.set(0, 6.6, 5.0);
    for (const sx of [-0.3, 0.3]) {
      const claw = box(M.darkSteel, 0.2, 1.2, 0.5, sx, -0.5, 0.3);
      claw.rotation.x = 0.5;
      wrist.add(claw);
    }
    wrist.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), M.steel));
    arm.add(wrist);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M.glowWarm);
    lamp.position.set(0, 5.0, 2.2);
    arm.add(lamp);
    arm.name = 'spinPart';
    g.add(arm);
    g.userData.spin = o.spin ?? 0.18;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'y';
    return g;
  },
};
