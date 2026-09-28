// Combat furniture: cover, hazards and gimmicks that read the same in any
// arena (see the note on the first builder). Part of PROPS in ../props.js.
import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { M, box, cyl } from './kit.js';

export const FURNITURE = {
  // combat furniture: cover, hazards and gimmicks that read the same in any
  // arena. Each reuses an existing arena gameplay hook (userData.explosive /
  // .spikes / .campfire / .spin / .noCollide) so it is functional in a real
  // match, not just dressing.
  // ==================================================================

  // Low destructible cover wall — hunker behind it, then blast through it.
  // Solid + breakable via the arena's automatic cylinder collider.
  barricade(o = {}) {
    const g = new THREE.Group();
    const w = o.w || 6, h = o.h || 2.6, t = o.t || 0.9;
    const body = box(M.concrete, w, h, t, 0, h / 2, 0);
    g.add(body);
    // hazard chevrons + rebar caps so it reads as a barrier
    for (let i = -1; i <= 1; i++) {
      g.add(box(M.yellowPaint, w / 3.4, h * 0.32, t + 0.04, i * (w / 3), h * 0.7, 0));
    }
    for (const sx of [-1, 1]) g.add(box(M.darkSteel, 0.5, h + 0.5, t + 0.3, sx * (w / 2 - 0.25), (h + 0.5) / 2, 0));
    return g;
  },

  // Squat metal pillar / bollard cluster — hard sight-line breaker.
  pillar(o = {}) {
    const g = new THREE.Group();
    const h = o.h || 7, r = o.r || 1.3;
    const mat = o.stone ? M.concrete : M.steel;
    g.add(cyl(mat, r * 0.9, r, h, 0, h / 2, 0, 12));
    g.add(cyl(M.darkSteel, r + 0.3, r + 0.4, 0.7, 0, 0.35, 0, 12));
    g.add(cyl(M.darkSteel, r + 0.2, r + 0.2, 0.6, 0, h - 0.3, 0, 12));
    return g;
  },

  // Decommissioned sentry turret — solid dome + barrel, slowly sweeping.
  sentryTurret(o = {}) {
    const g = new THREE.Group();
    g.add(cyl(M.darkSteel, 1.7, 2.1, 1.2, 0, 0.6, 0, 10));
    const head = new THREE.Group();
    head.position.y = 1.7;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.steel);
    dome.castShadow = true;
    head.add(dome);
    head.add(box(M.redPaint, 0.5, 0.5, 2.6, 0, 0.5, 1.4));
    const barrel = cyl(M.darkSteel, 0.2, 0.2, 2.4, 0.35, 0.5, 0, 6);
    barrel.rotation.x = Math.PI / 2;  // lay the barrel along +Z
    barrel.position.z = 1.4;
    head.add(barrel);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.glowRed);
    eye.position.set(0, 0.55, 1.45);
    head.add(eye);
    head.name = 'spinPart';
    g.add(head);
    g.userData.spin = o.spin ?? 0.4;    // head sweeps horizontally
    g.userData.spinName = 'spinPart';   // resolved by name (JSON-safe for ghost clones)
    g.userData.spinAxis = 'y';
    return g;
  },

  // Energy barrier — a translucent glowing wall between two emitter posts.
  // Solid (auto collider) and unmistakably an obstacle.
  forceWall(o = {}) {
    const g = new THREE.Group();
    const w = o.w || 8, h = o.h || 5;
    const col = o.color || 0x53e8ff;
    const fieldMat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 1.1,
      transparent: true, opacity: 0.28, roughness: 0.3, side: THREE.DoubleSide,
    });
    const field = box(fieldMat, w - 0.8, h, 0.3, 0, h / 2 + 0.6, 0);
    field.castShadow = false; field.receiveShadow = false;
    g.add(field);
    // horizontal scan bars
    for (let i = 1; i <= 3; i++) {
      const bar = box(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 }),
        w - 0.8, 0.08, 0.34, 0, (h / 4) * i + 0.6, 0);
      g.add(bar);
    }
    for (const sx of [-1, 1]) {
      g.add(cyl(M.darkSteel, 0.5, 0.7, h + 1.2, sx * (w / 2 - 0.4), (h + 1.2) / 2, 0, 8));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
      cap.position.set(sx * (w / 2 - 0.4), h + 1.2, 0);
      g.add(cap);
    }
    return g;
  },

  // Proximity mine — small volatile charge. Uses the arena EXPLOSIVE hook, so
  // it genuinely cooks off on contact/damage like a fuel tank, but smaller.
  mine(o = {}) {
    const g = new THREE.Group();
    const r = o.r || 1.1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), M.darkSteel);
    body.position.y = r * 0.15;
    body.castShadow = true;
    g.add(body);
    g.add(cyl(M.rust, r * 1.1, r * 1.2, 0.3, 0, 0.15, 0, 12));
    // spikes/pressure horns
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const horn = cyl(M.steel, 0.06, 0.12, 0.7, Math.cos(a) * r * 0.7, r * 0.55, Math.sin(a) * r * 0.7, 5);
      horn.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(horn);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M.glowRed);
    led.position.y = r * 0.7;
    g.add(led);
    g.userData.explosive = { r: 7 + r * 2, bodyR: r + 0.4, hp: 12, top: r * 1.2 };
    g.userData.noCollide = true; // walk onto it to trigger — no invisible wall
    return g;
  },

  // Ground spike strip — flat retractable-look hazard. Uses the SPIKES hook:
  // stepping across it cuts and shoves, same as obsidian spikes.
  spikeStrip(o = {}) {
    const g = new THREE.Group();
    const w = o.w || 6;
    g.add(box(M.darkSteel, w, 0.25, 2.2, 0, 0.12, 0));
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    for (let i = 0; i < Math.round(w * 1.4); i++) {
      const x = -w / 2 + 0.5 + i * (w / (Math.round(w * 1.4)));
      const bh = rng.range(0.7, 1.3);
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.22, bh, 4), M.steel);
      s.position.set(x, 0.25 + bh / 2, rng.range(-0.7, 0.7));
      s.castShadow = true;
      g.add(s);
    }
    g.userData.spikes = { r: Math.max(2.4, w / 2) };
    return g;
  },

  // Bounce / launch pad — glowing pad ringed with arrows. Walk-over (noCollide)
  // so movement isn't blocked; reads as a mobility gimmick.
  jumpPad(o = {}) {
    const g = new THREE.Group();
    const r = o.r || 2.6;
    const col = o.color || 0x62ff9a;
    const glowMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.2 });
    g.add(cyl(M.darkSteel, r + 0.3, r + 0.5, 0.5, 0, 0.25, 0, 20));
    g.add(cyl(glowMat, r, r, 0.14, 0, 0.55, 0, 20));
    // chevrons pointing up-and-in
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (0.4 + i * 0.22), 0.09, 6, 20),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 - i * 0.2 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.6 + i * 0.02;
      g.add(ring);
    }
    g.userData.noCollide = true;
    return g;
  },

  // Teleporter pad — a hovering ring over a base disc, gently lit. Walk-over.
  teleporter(o = {}) {
    const g = new THREE.Group();
    const r = o.r || 2.4;
    const col = o.color || 0xff4dd8;
    g.add(cyl(M.darkSteel, r, r + 0.4, 0.4, 0, 0.2, 0, 18));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r - 0.2, 24),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4, transparent: true, opacity: 0.7 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.42;
    g.add(disc);
    const ringMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.3, 0.16, 8, 24), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.2;
    g.add(ring);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(cyl(M.darkSteel, 0.12, 0.12, 3.2, Math.cos(a) * (r - 0.3), 1.7, Math.sin(a) * (r - 0.3), 6));
    }
    g.userData.noCollide = true;
    return g;
  },

  // Rotating hazard beacon — warning light on a pole. Solid pole; the lamp
  // sweeps (spin hook).
  beacon(o = {}) {
    const g = new THREE.Group();
    const h = o.h || 5.5;
    const col = o.color || 0xffb020;
    g.add(cyl(M.darkSteel, 0.24, 0.34, h, 0, h / 2, 0, 8));
    const cage = new THREE.Group();
    cage.position.y = h;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 3 }));
    cage.add(lamp);
    // one-sided reflector so the sweep reads while spinning
    cage.add(box(M.darkSteel, 0.1, 1.2, 1.2, 0.7, 0, 0));
    cage.name = 'spinPart';
    g.add(cage);
    g.userData.spin = o.spin ?? 1.4;
    g.userData.spinName = 'spinPart';
    g.userData.spinAxis = 'y';
    return g;
  },

  // Blast crater — scorched ground ring with a debris lip. Flat walk-over
  // set-dressing that makes a battlefield feel fought-over.
  crater(o = {}) {
    const g = new THREE.Group();
    const r = o.r || 4;
    const rng = makeRng(o.seed || (Math.random() * 1e6) | 0);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(r, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 1, metalness: 0 }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.04;
    g.add(scorch);
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.95 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const cr = r * rng.range(0.86, 1.02);
      const chunk = box(lipMat, rng.range(0.6, 1.4), rng.range(0.3, 0.8), rng.range(0.6, 1.2),
        Math.cos(a) * cr, 0.2, Math.sin(a) * cr, rng.range(0, 3));
      g.add(chunk);
    }
    g.userData.noCollide = true;
    return g;
  },
};
