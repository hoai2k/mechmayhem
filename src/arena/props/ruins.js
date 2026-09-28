// The RUINS arena's props: `base` is its original dressing, `landmarks`
// its 2026-07 redesign set pieces. Both are spread into PROPS (../props.js) in
// the table's original order, so a prop keeps its place in every listing.
import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { M, texMat, box, cyl } from './kit.js';

export const base = {
  // ---- ruins ----
  brokenStatue(o = {}) {
    // Toppled colossus: torso still on the plinth, head fallen in the sand.
    const g = new THREE.Group();
    const mat = o.mat || M.sandstone;
    g.add(box(mat, 4.2, 0.8, 4.2, 0, 0.4, 0));
    g.add(box(mat, 3.2, 0.9, 3.2, 0, 1.2, 0));
    const torso = box(mat, 2.4, 3.2, 1.6, 0, 3.1, 0, 0.3);
    torso.rotation.z = 0.12;
    g.add(torso);
    const arm = box(mat, 0.85, 2.8, 0.85, -1.5, 5.0, 0.2);
    arm.rotation.z = 0.55;
    g.add(arm);
    g.add(box(mat, 1.15, 1.0, 1.0, 1.35, 4.35, 0, 0.2));
    const head = box(mat, 1.5, 1.7, 1.5, 3.4, 0.75, 1.8);
    head.rotation.set(0.9, 0.5, 0.35);
    g.add(head);
    g.add(box(mat, 1.0, 0.7, 0.9, 2.4, 0.3, -1.6, 0.7));
    return g;
  },
  obelisk(o = {}) {
    // Four-sided needle with softly glowing glyph channels.
    const g = new THREE.Group();
    const h = o.h || 10;
    const mat = o.mat || M.sandstone;
    g.add(box(mat, 3.0, 0.7, 3.0, 0, 0.35, 0));
    g.add(box(mat, 2.2, 0.6, 2.2, 0, 1.0, 0));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.05, h, 4), mat);
    shaft.position.y = h / 2 + 1.3;
    shaft.rotation.y = Math.PI / 4;
    shaft.castShadow = true;
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.2, 4), mat);
    tip.position.y = h + 1.85;
    tip.rotation.y = Math.PI / 4;
    tip.castShadow = true;
    g.add(tip);
    const glyphMat = new THREE.MeshStandardMaterial({ color: 0x2ee6c8, emissive: 0x2ee6c8, emissiveIntensity: 1.1 });
    g.add(box(glyphMat, 0.2, h * 0.62, 0.06, 0, h * 0.5 + 1.2, 0.86));
    g.add(box(glyphMat, 0.06, h * 0.5, 0.2, 0.8, h * 0.45 + 1.2, 0));
    return g;
  },
  sarcophagus(o = {}) {
    // Excavated stone coffin, lid shoved ajar.
    const g = new THREE.Group();
    const mat = o.mat || M.sandstone;
    g.add(box(mat, 2.6, 0.4, 4.6, 0, 0.2, 0));
    g.add(box(mat, 2.1, 1.3, 4.0, 0, 1.05, 0));
    const lid = box(mat, 2.2, 0.45, 4.1, 0.55, 1.85, -0.3, 0.14);
    lid.rotation.z = 0.1;
    g.add(lid);
    g.add(box(M.brass, 2.15, 0.18, 0.5, 0, 1.1, 1.1));
    return g;
  },
};

export const landmarks = {
  // ---- ruins ----
  palmTree(o = {}) {
    // Oasis date palm — curved trunk, fan of fronds.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const h = o.h || rng.range(8, 12);
    const lean = rng.range(0.06, 0.22) * (rng.chance(0.5) ? 1 : -1);
    let x = 0;
    for (let i = 0; i < 5; i++) {
      const segH = h / 5;
      const seg = cyl(M.wood, 0.28 - i * 0.03, 0.34 - i * 0.03, segH + 0.2, x, segH * (i + 0.5), 0, 7);
      seg.rotation.z = lean * (i + 1) * 0.4;
      g.add(seg);
      x += Math.sin(lean * (i + 1) * 0.4) * segH;
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.6, 1, 3), M.palmFrond);
      frond.position.set(x + Math.cos(a) * 1.5, h + 0.3, Math.sin(a) * 1.5);
      frond.rotation.set(Math.PI / 2 - 0.85, 0, -a + Math.PI / 2);
      frond.castShadow = true;
      g.add(frond);
    }
    const dates = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), M.rust);
    dates.position.set(x, h - 0.3, 0);
    g.add(dates);
    return g;
  },
  greatGate(o = {}) {
    // Monumental temple pylon gate — twin tapering towers, a doorway between
    // them, glyphs lit. The stone ABOVE the doorway matters: with the lintel
    // slung across two bare towers and open sky over it, the whole thing reads
    // as an H — or, as it was reported from the Desert Ruins, an upside-down
    // bridge. Filling that span (and running one cornice across both towers)
    // is what makes it read as a gate you walk through.
    const g = new THREE.Group();
    const stone = texMat('prop_stone_carved', M.sandstone, { repeat: 3 });
    const h = o.h || 15, gap = o.gap || 7.5;
    const towerX = gap / 2 + 3;
    for (const sx of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(6, h, 4.2), stone);
      tower.position.set(sx * towerX, h / 2, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      g.add(tower);
      const glyphMat = new THREE.MeshStandardMaterial({
        color: 0x2ee6c8, emissive: 0x2ee6c8, emissiveIntensity: 1.0,
      });
      g.add(box(glyphMat, 0.24, h * 0.45, 0.08, sx * towerX - 1.2, h * 0.34, 2.15));
      g.add(box(glyphMat, 0.24, h * 0.36, 0.08, sx * towerX + 1.2, h * 0.3, 2.15));
    }
    // doorway lintel, and the masonry that carries the gate up to the towers
    const doorH = h * 0.62;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(gap + 5, 2.2, 4.0), stone);
    lintel.position.y = doorH + 1.1;
    lintel.castShadow = true;
    g.add(lintel);
    const span = new THREE.Mesh(new THREE.BoxGeometry(gap + 1.2, h - doorH - 2.2, 3.8), stone);
    span.position.y = (h + doorH + 2.2) / 2;
    span.castShadow = true;
    span.receiveShadow = true;
    g.add(span);
    // one cornice across the whole crown, rather than a cap per tower
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(2 * towerX + 6.6, 1.1, 4.8), stone);
    cornice.position.y = h + 0.55;
    cornice.castShadow = true;
    g.add(cornice);
    // winged sun disc over the doorway — what a pylon gate wears
    const discMat = new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffb43c, emissiveIntensity: 1.4 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 20), discMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, doorH + 3.4, 2.0);
    g.add(disc);
    for (const sx of [-1, 1]) {
      g.add(box(discMat, 2.6, 0.34, 0.12, sx * 2.4, doorH + 3.4, 1.98));
      g.add(box(discMat, 1.8, 0.26, 0.12, sx * 3.1, doorH + 2.85, 1.98));
    }
    g.userData.bodies = [
      { dx: -towerX, dz: 0, r: 3.1, h },
      { dx: towerX, dz: 0, r: 3.1, h },
    ];
    return g;
  },
  colonnade(o = {}) {
    // Processional colonnade — four columns, half the architrave gone.
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const stone = texMat('prop_stone_carved', M.sandstone, { repeat: 2 });
    const n = o.n || 4, pitch = 4.2, h = o.h || 8;
    const bodies = [];
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * pitch;
      const broken = rng.chance(0.3);
      const ch = broken ? h * rng.range(0.35, 0.6) : h;
      g.add(cyl(stone, 0.85, 1.05, ch, 0, ch / 2, z, 12));
      g.add(box(stone, 2.4, 0.5, 2.4, 0, 0.25, z));
      if (!broken) g.add(box(stone, 2.2, 0.5, 2.2, 0, ch + 0.25, z));
      bodies.push({ dx: 0, dz: z, r: 1.15, h: ch + 0.6 });
    }
    for (let i = 0; i < n - 1; i++) {
      if (rng.chance(0.45)) continue;   // collapsed spans
      const z = (i - (n - 2) / 2) * pitch;
      g.add(box(stone, 1.8, 0.9, pitch + 0.4, 0, h + 0.95, z));
    }
    g.userData.bodies = bodies;
    return g;
  },
  sphinxStatue(o = {}) {
    // Guardian sphinx on a plinth — lion body, watchful head.
    const g = new THREE.Group();
    const stone = texMat('prop_stone_carved', M.sandstone, { repeat: 2 });
    g.add(box(stone, 4.2, 1.2, 8.2, 0, 0.6, 0));
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 5.6), stone);
    body.position.set(0, 2.4, -0.6);
    body.castShadow = true;
    g.add(body);
    for (const sx of [-1.05, 1.05]) {                                       // forepaws
      g.add(box(stone, 0.85, 1.1, 2.6, sx, 1.75, 2.6));
    }
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 1.8), stone);
    chest.position.set(0, 3.4, 1.7);
    chest.castShadow = true;
    g.add(chest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.0, 1.6), stone);
    head.position.set(0, 5.3, 1.9);
    head.castShadow = true;
    g.add(head);
    g.add(box(stone, 2.6, 1.1, 0.5, 0, 5.3, 1.2, 0.02));                    // headdress wings
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2ee6c8, emissive: 0x2ee6c8, emissiveIntensity: 1.5 });
    for (const sx of [-0.45, 0.45]) g.add(box(eyeMat, 0.34, 0.14, 0.08, sx, 5.5, 2.72));
    const tail = cyl(stone, 0.22, 0.3, 3.4, 1.2, 2.2, -3.2, 8);
    tail.rotation.x = 1.1;
    g.add(tail);
    return g;
  },
  digCamp(o = {}) {
    // Archaeologists' tents and crates (they left in a hurry).
    const g = new THREE.Group();
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < 2; i++) {
      const x = i * 4.2 - 2, z = rng.range(-1, 1);
      const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 2.3, 2.6, 4), M.canvas);
      tent.position.set(x, 1.3, z);
      tent.rotation.y = Math.PI / 4 + rng.range(-0.2, 0.2);
      tent.castShadow = true;
      g.add(tent);
    }
    for (let i = 0; i < 3; i++) {
      g.add(box(M.wood, 1.2, 0.8, 0.9, rng.range(-3, 3), 0.4, rng.range(1.8, 3), rng.range(0, 1)));
    }
    g.add(cyl(M.steel, 0.05, 0.07, 1.8, 2.6, 0.9, 2.2, 5));                 // shovel
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M.glowWarm);
    lamp.position.set(-2, 2.8, 0);
    g.add(lamp);
    return g;
  },
};
