// ULT FOUNTAINS — the way ultimates are earned now. Golden fountains of
// light well up at random spots around the arena (rooftops, hilltops,
// bridge and viaduct decks, open ground — never the spawn plaza). Stand in
// one and the robot drinks it: a golden flare, a charge in the pouch (up to
// CONFIG.fountains.maxCharges), and the fountain is gone — to well up
// somewhere else later. One spawn attempt every CONFIG.fountains.interval
// seconds, board capped at live-robots × CONFIG.fountains.perRobot.
//
// Placement favors "interesting" ground: 40% building roofs (low ones, so
// every mech has a jumping chance), 25% terrain features, 35% open floor.
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { rand } from '../core/utils.js';

const GOLD = 0xffd23c, GOLD_HOT = 0xffe9a0, GOLD_DEEP = 0xffb020;
const _probe = new THREE.Vector3();
const COLLECT_R = 2.8;      // stand-in radius
const ROOF_MAX_Y = 20;      // roofs above this are unreachable enough to skip

function buildFountainMesh() {
  const g = new THREE.Group();
  // basin: a glowing gold disc set into the floor
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.7, 0.22, 20),
    new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD_DEEP, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.6 }));
  disc.position.y = 0.11;
  g.add(disc);
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.0, 0.26, 16),
    new THREE.MeshStandardMaterial({ color: GOLD_HOT, emissive: GOLD_HOT, emissiveIntensity: 2.6 }));
  core.position.y = 0.14;
  g.add(core);
  // column of light: two crossed additive planes read from every azimuth
  // and cost nothing next to a real volumetric
  const colMat = new THREE.MeshBasicMaterial({
    color: GOLD_HOT, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 4.6), colMat);
    p.position.y = 2.4;
    p.rotation.y = i * Math.PI / 2;
    p.name = 'beam';
    g.add(p);
  }
  // halo ring that breathes above the basin
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.09, 8, 24),
    new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.6;
  halo.name = 'halo';
  g.add(halo);
  return g;
}

export class UltFountains {
  constructor(world) {
    this.world = world;
    this.active = [];        // {mesh, x, y, z, t}
    this.bursts = [];        // collect flashes: {f, t} — sparkle the robot for ~1s
    this.spawnT = (CONFIG.fountains?.interval ?? 10) * 0.5;  // first one comes quickly
  }

  cap() {
    const robots = this.world.fighters.filter((f) => !f.isMinion).length;
    return Math.max(1, robots * (CONFIG.fountains?.perRobot ?? 2));
  }

  // ---- placement ----
  // roofs of LIVING buildings: any alive chunk with no alive chunk above it
  roofSpot(rng = Math.random) {
    // every destructible system: a fountain on top of a crystal spire or an
    // ice tower (arena/structures.js) is as good a prize as one on a roof
    const systems = (this.world.arena?.destructoAll || [this.world.arena?.destructo])
      .filter((s) => s?.buildings.length);
    if (!systems.length) return null;
    for (let tries = 0; tries < 6; tries++) {
      const d = systems[(rng() * systems.length) | 0];
      const b = d.buildings[(rng() * d.buildings.length) | 0];
      if (!b || b.alive <= 0) continue;
      const tops = [];
      for (const c of b.grid.values()) {
        if (!c.alive) continue;
        const above = b.grid.get(`${c.gx},${c.gy + 1},${c.gz}`);
        if (above && above.alive) continue;
        const y = c.y + c.h / 2;
        if (y <= ROOF_MAX_Y) tops.push({ x: c.x, y, z: c.z });
      }
      if (tops.length) return tops[(rng() * tops.length) | 0];
    }
    return null;
  }

  terrainSpot() {
    const terra = this.world.arena?.terrain;
    if (!terra) return null;
    const picks = [];
    for (const hl of terra.hills) picks.push({ x: hl.x, y: hl.H, z: hl.z });
    for (const br of terra.bridges) {
      if (br.segs.some((s) => s.alive)) picks.push({ x: br.x, y: br.H, z: br.z });
    }
    if (terra.viaduct) {
      const v = terra.viaduct;
      const along = rand(-terra.P / 2, terra.P / 2);
      const h = terra.vSurface(along);
      if (h > v.H * 0.9) {
        const c = terra.laneCenter(v.lane, along);
        picks.push({
          x: v.lane.axis === 'z' ? c : along, y: h,
          z: v.lane.axis === 'z' ? along : c,
        });
      }
    }
    if (!picks.length) return null;
    return picks[(Math.random() * picks.length) | 0];
  }

  groundSpot() {
    const arena = this.world.arena;
    const terra = arena?.terrain;
    const clear = (terra?.clearing ?? 38) + 3;
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(Math.PI * 2);
      const r = rand(clear, arena.bounds);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (arena.badPickupSpot?.(x, z)) continue;
      const lane = terra?.onLane(x, z, 1);
      if (lane?.hazard) continue;
      const patch = terra?.onPatch(x, z, 1);
      if (patch?.hazard) continue;
      if (arena.propAt?.(new THREE.Vector3(x, 1, z))) continue;
      return { x, y: terra?.heightAt(x, z) ?? 0, z };
    }
    return null;
  }

  pickSpot() {
    const roll = Math.random();
    const spot = (roll < 0.4 ? this.roofSpot() : roll < 0.65 ? this.terrainSpot() : null)
      || this.groundSpot();
    if (!spot) return null;
    // never in the center circle, never on top of another fountain, and stay
    // inside the primary wrap cell (fountains are transient — not ghost-tiled)
    const clear = this.world.arena?.terrain?.clearing ?? 38;
    if (Math.hypot(spot.x, spot.z) < clear) return null;
    const W = this.world.wrapHalf;
    if (W && (Math.abs(spot.x) > W - 6 || Math.abs(spot.z) > W - 6)) return null;
    for (const f of this.active) {
      if (Math.hypot(f.x - spot.x, f.z - spot.z) < 14) return null;
    }
    return spot;
  }

  spawn() {
    const spot = this.pickSpot();
    if (!spot) return;
    const mesh = buildFountainMesh();
    mesh.position.set(spot.x, spot.y, spot.z);
    this.world.scene.add(mesh);
    this.active.push({ mesh, x: spot.x, y: spot.y, z: spot.z, t: rand(0, 6) });
    this.world.effects.rings.spawn(new THREE.Vector3(spot.x, spot.y, spot.z),
      { from: 0.4, to: 3.4, dur: 0.5, color: GOLD, y: spot.y + 0.25 });
  }

  collect(fn, f) {
    const max = CONFIG.fountains?.maxCharges ?? 2;
    f.ultCharges = Math.min(max, f.ultCharges + 1);
    f.ult = 1;
    this.world.scene.remove(fn.mesh);
    this.active.splice(this.active.indexOf(fn), 1);
    this.bursts.push({ f, t: 1.0 });
    const fx = this.world.effects;
    const pos = new THREE.Vector3(fn.x, fn.y, fn.z);
    // the fountain leaps up the robot: a golden geyser + rings
    for (let i = 0; i < 26; i++) {
      const a = rand(Math.PI * 2), rr = rand(0, 1.4);
      fx.glows.emit(fn.x + Math.cos(a) * rr, fn.y + rand(0, 1.5), fn.z + Math.sin(a) * rr,
        Math.cos(a) * rand(0.5, 2.5), rand(6, 14), Math.sin(a) * rand(0.5, 2.5),
        { life: rand(0.5, 1.1), size: rand(0.5, 1.1), color: i % 3 ? GOLD : GOLD_HOT, alpha: 0.95, drag: 0.6 });
    }
    fx.rings.spawn(pos, { from: 0.5, to: 5, dur: 0.5, color: GOLD, y: fn.y + 0.3 });
    fx.rings.spawn(pos, { from: 0.3, to: 3, dur: 0.35, color: GOLD_HOT, y: fn.y + 1.2 });
    this.world.audio?.play('powerup');
    this.world.events.emit('ultCharge', { fighter: f, charges: f.ultCharges });
  }

  update(dt) {
    const w = this.world;
    // spawner
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = CONFIG.fountains?.interval ?? 10;
      if (this.active.length < this.cap()) this.spawn();
    }
    const max = CONFIG.fountains?.maxCharges ?? 2;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fn = this.active[i];
      fn.t += dt;
      // a rooftop/deck fountain whose floor was blown out drains away
      // (the spawner will well it up somewhere else)
      if (fn.y > 2 && !w.arena.pointHits(_probe.set(fn.x, fn.y - 0.6, fn.z))) {
        w.effects.rings.spawn(_probe.clone().setY(fn.y), { from: 2.5, to: 0.3, dur: 0.4, color: GOLD, y: fn.y });
        w.scene.remove(fn.mesh);
        this.active.splice(i, 1);
        continue;
      }
      // breathe: halo rises and fades on a loop, beams shimmer
      const halo = fn.mesh.getObjectByName('halo');
      const k = (fn.t * 0.7) % 1;
      halo.position.y = 0.4 + k * 2.6;
      halo.material.opacity = 0.85 * (1 - k);
      halo.scale.setScalar(1 - k * 0.35);
      fn.mesh.rotation.y += dt * 0.6;
      // rising gold sparkles — the fountain itself
      if (Math.random() < dt * 22) {
        const a = rand(Math.PI * 2), rr = rand(0.2, 1.3);
        w.effects.glows.emit(fn.x + Math.cos(a) * rr, fn.y + 0.25, fn.z + Math.sin(a) * rr,
          Math.cos(a) * rand(0.2, 0.9), rand(3.5, 7), Math.sin(a) * rand(0.2, 0.9),
          { life: rand(0.7, 1.3), size: rand(0.3, 0.6), color: Math.random() < 0.3 ? GOLD_HOT : GOLD, alpha: 0.9, drag: 0.5 });
      }
      // collection: any living robot standing in it with pouch space
      for (const f of w.fighters) {
        if (!f.alive || f.isMinion || f.ultCharges >= max) continue;
        const dx = w.wrapDelta(f.pos.x - fn.x), dz = w.wrapDelta(f.pos.z - fn.z);
        if (dx * dx + dz * dz < COLLECT_R * COLLECT_R && Math.abs(f.pos.y - fn.y) < 2.5) {
          this.collect(fn, f);
          break;
        }
      }
    }
    // collect flashes: the robot sheds golden sparkles for a beat
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t -= dt;
      if (b.t <= 0 || !b.f.alive) { this.bursts.splice(i, 1); continue; }
      if (Math.random() < dt * 30) {
        const c = b.f.center();
        const a = rand(Math.PI * 2), rr = rand(0.5, b.f.radius + 1);
        w.effects.glows.emit(c.x + Math.cos(a) * rr, c.y + rand(-1.5, 2), c.z + Math.sin(a) * rr,
          Math.cos(a) * rand(0.5, 1.5), rand(2, 5), Math.sin(a) * rand(0.5, 1.5),
          { life: rand(0.4, 0.8), size: rand(0.4, 0.8), color: Math.random() < 0.4 ? GOLD_HOT : GOLD, alpha: 0.95, drag: 0.6 });
      }
    }
  }

  // nearest live fountain a charge-hungry AI could walk to (ground-level
  // reachability: skip rooftop spots — the AI doesn't parkour)
  nearestForAI(f, maxDist = 55) {
    let best = null, bestD = maxDist;
    for (const fn of this.active) {
      if (fn.y > 4) continue;
      const dx = this.world.wrapDelta(fn.x - f.pos.x), dz = this.world.wrapDelta(fn.z - f.pos.z);
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = fn; }
    }
    return best;
  }
}
