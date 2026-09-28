// The FROZEN arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { M, texMat, machinePaint, box, cyl } from './kit.js';

export const base = {
  // ---- frozen ----
  radarDome(o = {}) {
    // Arctic radome station: white sphere on a bunker base.
    const g = new THREE.Group();
    g.add(box(M.steel, 4.6, 1.6, 4.6, 0, 0.8, 0));
    g.add(box(M.whitePaint, 3.8, 0.5, 3.8, 0, 1.85, 0));
    const domeMat = new THREE.MeshStandardMaterial({ color: 0xe8f0f6, roughness: 0.45, metalness: 0.1 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 12), domeMat);
    dome.position.y = 3.6;
    dome.castShadow = true;
    g.add(dome);
    g.add(box(M.darkSteel, 1.1, 1.2, 0.3, 0, 0.7, 2.35));
    g.add(cyl(M.darkSteel, 0.06, 0.06, 2.6, 1.9, 3.2, 1.9, 5));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), M.glowCyan);
    lamp.position.set(1.9, 4.6, 1.9);
    g.add(lamp);
    return g;
  },
  aurora(o = {}) {
    // Cheap aurora: additive curtains hung in a wide ring around the arena,
    // so some part of it is on screen from any camera azimuth. Place once,
    // near the origin (ring [0, 6]).
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const cols = [0x46ffa0, 0x38e8c8, 0x9a6bff, 0x46ffa0, 0x38e8c8];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: cols[i], emissiveIntensity: 1.5,
        transparent: true, opacity: 0.2 + (i % 3) * 0.04, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const a = (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const r = rng.range(95, 130);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(80, 120), rng.range(20, 30)), mat);
      p.position.set(Math.cos(a) * r, rng.range(36, 50), Math.sin(a) * r);
      p.rotation.set(rng.range(-0.1, 0.1), -a + Math.PI / 2 + rng.range(-0.3, 0.3), rng.range(-0.08, 0.08));
      g.add(p);
    }
    // IT IS LIGHT, NOT SCENERY. Every standing prop is measured for a solid
    // collider off its GROUND BAND, and this one has no ground band at all —
    // five transparent curtains hung 36-50 units up. With nothing low to
    // measure, the rule fell back to the whole bounding box (a 130-unit ring),
    // capped the radius at 7 and gave the frozen arena an invisible pillar in
    // the middle of it, 65 units tall. Found by `node tools/propshell.mjs`,
    // which ranked its collider 109 units away from anything you can see.
    g.userData.noCollide = true;
    return g;
  },
};

export const landmarks = {
  // ---- frozen ----
  icebreakerShip(o = {}) {
    // Icebreaker locked in the floe since the station went dark.
    const g = new THREE.Group();
    const s = o.s || 1;
    const hull = box(M.hullRed, 5.2 * s, 3.4 * s, 17 * s, 0, 1.9 * s, 0);
    hull.rotation.z = 0.07;
    g.add(hull);
    const bow = box(M.hullRed, 3.6 * s, 3.2 * s, 3.6 * s, 0, 2.0 * s, 9.4 * s, Math.PI / 4);
    bow.rotation.z = 0.07;
    g.add(bow);
    g.add(box(M.darkSteel, 5.3 * s, 0.5 * s, 17.2 * s, 0, 3.75 * s, 0, 0));
    const sup = box(M.whitePaint, 4.2 * s, 3.0 * s, 5.5 * s, 0.1 * s, 5.4 * s, -3.5 * s);
    g.add(sup);
    g.add(box(M.glass, 3.6 * s, 0.8 * s, 0.1, 0.1 * s, 6.4 * s, -0.72 * s));
    g.add(cyl(M.yellowPaint, 0.75 * s, 0.9 * s, 2.4 * s, 0.1 * s, 8.0 * s, -5.0 * s, 12));
    g.add(cyl(M.darkSteel, 0.1, 0.12, 4.5 * s, 0.1 * s, 9.5 * s, -2.2 * s, 6));
    g.add(box(M.darkSteel, 0.8 * s, 0.5 * s, 0.5 * s, 0.1 * s, 11.6 * s, -2.2 * s));
    // ice collar
    const ice = texMat('prop_ice_glacial', M.frost, { repeat: 2 });
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rng.range(1.0, 2.0) * s, 0), ice);
      m.position.set(Math.cos(a) * 3.4 * s, 0.4, Math.sin(a) * 8.4 * s);
      m.scale.y = 0.5;
      m.castShadow = true;
      g.add(m);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), M.glowRed);
    lamp.position.set(0.1 * s, 12.0 * s, -2.2 * s);
    g.add(lamp);
    g.userData.bodies = [
      { dx: 0, dz: 5.5 * s, r: 2.9 * s, h: 4.5 * s },
      { dx: 0, dz: 0, r: 3.0 * s, h: 4.5 * s },
      { dx: 0, dz: -4.5 * s, r: 2.9 * s, h: 8.5 * s },
    ];
    return g;
  },
  quonsetHut(o = {}) {
    // Half-cylinder expedition shelter, snow on the roof.
    const g = new THREE.Group();
    const len = o.len || 7;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, len, 14, 1, false, 0, Math.PI),
      texMat('prop_corrugated_steel', M.steel, { repeat: 2 }));
    shell.rotation.z = Math.PI / 2;
    shell.rotation.y = Math.PI / 2;
    shell.position.y = 0.9;
    shell.castShadow = true;
    g.add(shell);
    g.add(box(M.steel, 4.8, 1.0, len, 0, 0.5, 0));
    const snow = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, len * 0.85, 14, 1, false, 0.5, Math.PI - 1),
      M.frost);
    snow.rotation.z = Math.PI / 2;
    snow.rotation.y = Math.PI / 2;
    snow.position.y = 1.0;
    g.add(snow);
    g.add(box(M.darkSteel, 1.6, 2.2, 0.3, 0, 1.1, len / 2 + 0.05));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc880, emissiveIntensity: 1.2 }));
    win.position.set(1.2, 1.6, len / 2 + 0.06);
    g.add(win);
    g.add(cyl(M.darkSteel, 0.12, 0.12, 1.6, -1.2, 3.4, -1.5, 6));
    g.userData.steamY = 4.3;
    return g;
  },
  snowcat(o = {}) {
    // Tracked utility snowcat, blade down, frost on the glass.
    const g = new THREE.Group();
    for (const sx of [-1.35, 1.35]) {
      g.add(box(M.rubber, 0.9, 1.0, 4.6, sx, 0.55, 0));
      g.add(box(M.darkSteel, 0.7, 0.4, 4.2, sx, 1.1, 0));
    }
    const cab = machinePaint();
    g.add(box(cab, 2.4, 1.1, 3.8, 0, 1.6, -0.2));
    g.add(box(cab, 2.2, 1.4, 1.8, 0, 2.85, 0.7));
    g.add(box(M.glass, 1.9, 0.9, 0.1, 0, 3.0, 1.64));
    g.add(box(M.frost, 2.25, 0.14, 1.85, 0, 3.6, 0.7));
    const blade = box(M.steel, 3.4, 1.1, 0.3, 0, 0.7, 2.7);
    blade.rotation.x = -0.2;
    g.add(blade);
    for (const sx of [-1, 1]) g.add(box(M.darkSteel, 0.2, 0.2, 1.4, sx, 0.9, 2.0, -0.3));
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M.glowWarm);
    beacon.position.set(0.8, 3.75, 0.7);
    g.add(beacon);
    return g;
  },
  pipelineRun(o = {}) {
    // Heated fuel pipeline on sleepers, valve tower mid-run.
    const g = new THREE.Group();
    const len = o.len || 16;
    const p = cyl(M.steel, 0.75, 0.75, len, 0, 1.3, 0, 12);
    p.rotation.x = Math.PI / 2;
    g.add(p);
    const lag = cyl(M.frost, 0.85, 0.85, len * 0.4, 0, 1.3, len * 0.2, 12);
    lag.rotation.x = Math.PI / 2;
    g.add(lag);
    for (let zz = -len / 2 + 1.5; zz < len / 2; zz += 4) {
      g.add(box(M.darkSteel, 2.0, 0.5, 0.5, 0, 0.25, zz));
      g.add(box(M.darkSteel, 0.4, 1.1, 0.4, 0, 0.7, zz));
    }
    g.add(cyl(M.brass, 0.5, 0.5, 0.4, 0, 2.35, 0, 10));
    g.add(cyl(M.redPaint, 0.55, 0.55, 0.18, 0, 2.7, 0, 10));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), M.glowCyan);
    lamp.position.set(0, 3.0, 0);
    g.add(lamp);
    g.userData.bodies = [
      { dx: 0, dz: -len * 0.3, r: 1.1, h: 2.2 },
      { dx: 0, dz: 0, r: 1.1, h: 2.2 },
      { dx: 0, dz: len * 0.3, r: 1.1, h: 2.2 },
    ];
    return g;
  },
};
