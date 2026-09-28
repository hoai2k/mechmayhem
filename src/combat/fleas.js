// JERRY's living ammunition: tiny robo-shrimp "fleas" that arc out of his
// cannons, then hop around the arena in twitchy, erratic grasshopper leaps
// until they land on a victim — where they cling, bite for 3 seconds, and
// pop. Creepy is the design goal: irregular pause-then-spring hops, headings
// that only ROUGHLY track prey, squash-and-stretch bodies, and a nervous
// in-place twitch between jumps.
import * as THREE from 'three';
import { rand, clamp01 } from '../core/utils.js';
import { isFoe } from './movekit.js';

const GRAV = 40;
const _v = new THREE.Vector3();

function buildFleaMesh() {
  const g = new THREE.Group();
  const coral = new THREE.MeshStandardMaterial({ color: 0xc97a55, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.7, metalness: 0.5 });
  // arched shrimp body: two segments curling down toward a tail fan
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 3, 6), coral);
  body.rotation.x = Math.PI / 2 - 0.35;
  body.position.y = 0.22;
  g.add(body);
  const abd = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.24, 3, 6), coral);
  abd.rotation.x = Math.PI / 2 + 0.75;
  abd.position.set(0, 0.16, -0.26);
  g.add(abd);
  const fan = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 4), coral);
  fan.rotation.x = -0.9;
  fan.position.set(0, 0.08, -0.42);
  fan.scale.z = 0.35;
  g.add(fan);
  // bead eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2818, emissive: 0xff2818, emissiveIntensity: 1.6 });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), eyeMat);
    e.position.set(sx * 0.09, 0.28, 0.2);
    g.add(e);
  }
  // spindly legs: angled dark cones
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.22, 4), dark);
      leg.position.set(sx * 0.14, 0.1, 0.1 - i * 0.14);
      leg.rotation.z = sx * 2.4;
      leg.rotation.x = 0.4 - i * 0.35;
      g.add(leg);
    }
  }
  for (const m of g.children) { m.castShadow = true; }
  return g;
}

export class FleaSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.pool = [];
    this.active = [];
  }

  obtain() {
    let mesh = this.pool.pop();
    if (!mesh) { mesh = buildFleaMesh(); this.scene.add(mesh); }
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    return mesh;
  }

  // dmg = TOTAL bite damage over the 3s attachment.
  // opts.clingTo: cosmetic mode — latch straight onto that fighter (works
  // on corpses, deals nothing, pops after opts.clingT) for swarm scenes.
  spawn(owner, origin, dir, { dmg = 30, life = 6.5, clingTo = null, clingT = 3, speed = 0 } = {}) {
    const mesh = this.obtain();
    mesh.position.copy(origin);
    const f = {
      owner, mesh, dmg,
      state: 'air',
      vel: new THREE.Vector3(dir.x, Math.max(dir.y, 0.08), dir.z).normalize()
        .multiplyScalar(speed || rand(22, 27)),
      life,
      pauseT: 0,
      twitchSeed: rand(100),
      victim: null,
      attachT: 0,
      biteTick: 0,
      offA: 0, offR: 0, offY: 0,
      cosmetic: false,
    };
    if (clingTo) {
      f.cosmetic = true;
      f.dmg = 0;
      f.state = 'attached';
      f.victim = clingTo;
      f.attachT = clingT;
      f.life = clingT + 2;
      f.offA = rand(Math.PI * 2);
      f.offR = clingTo.hitRadius * rand(0.4, 0.95);
      f.offY = clingTo.height * rand(0.05, 0.95);
      f.vel.set(0, 0, 0);
    }
    f.vel.y += 3; // slight pop out of the cannon — flat enough to hit direct
    this.active.push(f);
    this.world.audio?.play('dart');
    return f;
  }

  // erratic flea hop toward (roughly) the nearest enemy of the owner
  hop(f) {
    const w = this.world;
    let best = null, bestD = Infinity;
    for (const e of w.fighters) {
      // cinePuppet corpses (finisher victims) still count as prey — the
      // swarm scene IS them piling onto the fallen mech
      if (e.alive ? !isFoe(f.owner, e) : (!e.cinePuppet || e === f.owner)) continue;
      const dx = w.wrapDelta(e.pos.x - f.mesh.position.x);
      const dz = w.wrapDelta(e.pos.z - f.mesh.position.z);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = { e, dx, dz }; }
    }
    let heading = rand(Math.PI * 2);
    let power = rand(0.5, 1);
    if (best) {
      const d = Math.sqrt(bestD);
      // roughly at the prey, with big creepy scatter that tightens up close
      heading = Math.atan2(best.dx, best.dz) + rand(-1, 1) * (d > 14 ? 0.85 : 0.35);
      power = clamp01(d / 22) * rand(0.75, 1.1);
    }
    const vy = rand(14, 23); // 2x hop height — springy leaps that clear mech torsos
    const sp = 6 + 15 * power;
    f.vel.set(Math.sin(heading) * sp, vy, Math.cos(heading) * sp);
    f.state = 'air';
    f.mesh.rotation.y = heading;
    f.mesh.scale.set(1, 1.35, 1); // stretch off the ground
  }

  update(dt) {
    const w = this.world;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const f = this.active[i];
      // wander lifetime only burns while hunting — a latched flea always
      // gets its full 3 seconds of biting
      if (f.state !== 'attached') f.life -= dt;
      let dead = f.life <= 0;

      if (f.state === 'air') {
        f.vel.y -= GRAV * dt;
        f.mesh.position.addScaledVector(f.vel, dt);
        if (w.wrapHalf) {
          f.mesh.position.x = w.wrapCoord(f.mesh.position.x);
          f.mesh.position.z = w.wrapCoord(f.mesh.position.z);
        }
        // stretch along the arc, face travel
        f.mesh.rotation.y = Math.atan2(f.vel.x, f.vel.z);
        f.mesh.rotation.x = -clamp01(f.vel.y / 18) * 0.5;
        // latch onto any victim it touches (finisher corpses included)
        for (const e of w.fighters) {
          if (e.alive ? !isFoe(f.owner, e) : (!e.cinePuppet || e === f.owner)) continue;
          const c = e.center();
          const dx = w.wrapDelta(c.x - f.mesh.position.x);
          const dy = c.y - f.mesh.position.y;
          const dz = w.wrapDelta(c.z - f.mesh.position.z);
          if (dx * dx + dy * dy + dz * dz < (e.hitRadius + 0.4) ** 2) {
            f.state = 'attached';
            f.victim = e;
            f.attachT = 3.0;             // bites for 3 seconds, then pops
            f.biteTick = 0;
            f.offA = rand(Math.PI * 2);  // cling point on the victim
            f.offR = e.hitRadius * rand(0.55, 0.85);
            f.offY = e.height * rand(0.3, 0.75);
            e.uncloak?.();
            w.audio?.play('slash');
            w.effects.impactSparks(f.mesh.position, 0xff5040, 5, 4);
            break;
          }
        }
        if (f.state === 'air' && f.mesh.position.y <= 0.05) {
          f.mesh.position.y = 0.05;
          f.state = 'ground';
          f.pauseT = rand(0.12, 0.5);    // nervous beat before the next spring
          f.mesh.scale.set(1.25, 0.6, 1.25); // squash on landing
          f.mesh.rotation.x = 0;
        }
      } else if (f.state === 'ground') {
        f.pauseT -= dt;
        // in-place twitch: jittery little heading snaps — pure unease
        f.twitchSeed += dt * 60;
        if (Math.sin(f.twitchSeed * 1.7) > 0.93) f.mesh.rotation.y += rand(-0.9, 0.9);
        // recover from squash
        f.mesh.scale.lerp(_v.set(1, 1, 1), 1 - Math.exp(-12 * dt));
        if (f.pauseT <= 0) this.hop(f);
      } else if (f.state === 'attached') {
        const v = f.victim;
        if (!v || (!v.alive && !f.cosmetic && !v.cinePuppet)) { dead = true; }
        else {
          f.attachT -= dt;
          // ride the victim's body THROUGH its fall, wriggling. Falls come
          // two ways: group rotation (handled by the quaternion) and the
          // knockdown/dead POSE — for those, slide the cling point down
          // and along the now-horizontal body so the carpet lies with it.
          const clip = v.animator?.action?.clip?.name;
          const lying = clip === 'knockdown' || clip === 'dead' || clip === 'ragdoll';
          f.layT = clamp01((f.layT || 0) + (lying ? dt * 2.5 : -dt * 2.5));
          const lay = f.layT;
          _v.set(
            Math.sin(f.offA) * f.offR,
            f.offY * (1 - 0.85 * lay) + 0.3 * lay,
            Math.cos(f.offA) * f.offR - f.offY * 0.85 * lay
          ).applyQuaternion(v.group.quaternion);
          f.mesh.position.set(
            v.pos.x + _v.x,
            v.pos.y + _v.y + Math.sin(f.twitchSeed) * 0.06,
            v.pos.z + _v.z
          );
          f.twitchSeed += dt * 26;
          f.mesh.rotation.y += dt * Math.sin(f.twitchSeed * 0.7) * 3;
          const wig = 1 + Math.sin(f.twitchSeed * 2) * 0.12;
          f.mesh.scale.set(wig, 2 - wig, wig);
          // bite: steady drain (burn-style so it can't be iframe-shrugged)
          const dps = f.cosmetic ? 0 : f.dmg / 3.0;
          v.hp -= dps * dt;
          if (!f.cosmetic) v.lastAttacker = f.owner;
          if (f.owner) f.owner.ult = clamp01(f.owner.ult + (dps * dt) * 2 / (f.owner.maxHp * 2.6)); // x2: ult meter rate-up
          f.biteTick -= dt;
          if (f.biteTick <= 0) {
            f.biteTick = 0.5;
            w.effects.impactSparks(f.mesh.position, 0xff4030, 3, 3);
            if (Math.random() < 0.5) w.audio?.play('slash');
          }
          if (v.hp <= 0 && v.alive) v.die(f.owner);
          if (f.attachT <= 0) {
            // done feeding: pop and vanish
            w.effects.impactSparks(f.mesh.position, 0xffa060, 8, 6);
            dead = true;
          }
        }
      }

      if (dead) {
        f.mesh.visible = false;
        this.pool.push(f.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  clear() {
    for (const f of this.active) { f.mesh.visible = false; this.pool.push(f.mesh); }
    this.active.length = 0;
  }
}
