// SAURION'S CLUTCH — the pack arrives as EGGS.
//
// The ult used to drop three finished raptors into the arena on a 0.22s volley,
// which is three bodies built inside a third of a second (the ult lag) and three
// robots that simply appear. Eggs fix both, and the second one is the point:
// something has to HAPPEN before a pack shows up.
//
// WHAT AN EGG IS
//   · A warp-in over `WARP` seconds — it fades and swells into being rather
//     than popping, because the whole move is a thing arriving from elsewhere.
//   · A real rolling body. Gravity, ground contact, restitution, rolling
//     friction, and a roll rate tied to its own short radius, so a shove sends
//     it across the plaza like a barrel and it comes to rest lying on its side.
//   · 75% of Saurion's own height along its long axis. He is not producing
//     something you can miss.
//   · A HATCH SLOT. At most one egg hatches every `GAP` seconds and only once
//     the body inside it has actually been built (combat/specials.js hands over
//     a prewarmed mech when there is one, otherwise the system builds it a
//     second ahead of the slot). The stagger is the pacing AND the budget: one
//     body per two seconds is a build nobody can feel.
//
// WHO HIT IT MATTERS, and this is the rule the whole damage model hangs off:
//   SAURION'S OWN BLOWS DO NOT HURT HIS CLUTCH. They SHOVE — a full physics
//     impulse, no damage, no flash. Kicking an egg is a way of saying "go over
//     there", so he can roll one behind cover, into a fight, or off a ledge.
//   ANYBODY ELSE'S BLOWS DAMAGE IT. It flashes red, takes a much smaller shunt
//     (a hit is a wound, not a delivery), and the SECOND one destroys it: the
//     shell comes apart and nothing hatches. An egg is two hits of the enemy's
//     time, and it is worth spending.
//
// THE HATCH ITSELF: the shell breaks into pieces that scatter and fade, and the
// raptor comes out CURLED — the `ball` clip — and unfolds into his stance as he
// scales up to full size. He is a real Fighter from the first frame; the ball is
// just how he is standing when he gets there.
import * as THREE from 'three';
import { rand, clamp01 } from '../core/utils.js';
import { hasTex, pbrMaterial } from '../core/texload.js';

const G = 58;              // gravity on a shell, units/s²
const BOUNCE = 0.26;       // how much of a landing it gives back
const ROLL_FRICTION = 0.55; // 1/s of speed a rolling egg loses to the ground
const SPIN_DAMP = 2.4;     // …and how fast the spin follows the travel
const WARP = 0.55;         // seconds of arriving
const CRACK = 0.7;         // seconds of shaking before the shell opens
const GAP = 2.0;           // seconds between hatches — the pacing and the budget
const BUILD_LEAD = 1.0;    // …and how far ahead of a slot the body is built
const OWNER_SHOVE = 15;    // units/s a kick from SAURION puts into an egg
const ENEMY_SHOVE = 5.5;   // …against what a hit from anyone else does
const FLASH_T = 0.35;      // seconds of red after a wound
const PIECES = 9;
const HP = 2;              // enemy hits an egg survives (the second one kills it)

const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _LONG = new THREE.Vector3(1, 0, 0);   // the egg's own long axis, local

// ---- the shell's look -------------------------------------------------------
// A real dino-egg texture is REQUESTED (docs/ASSET_REQUESTS_STRUCTURES.md,
// `prop_dino_egg`); until it lands this paints one: a warm bone-coloured shell,
// mottled in blotches, with fine speckle over the top. Same shape as every other
// procedural fallback in the game — if the pack has the entry, the pack wins.
let _eggMat = null;
/**
 * Build the shell material and geometry AHEAD of the fight (match.js warms this
 * during the round intro, beside the summon bodies). Painting the fallback
 * texture is a canvas full of speckle, and doing it on the frame the ult is cast
 * was measured as a 14ms spike — the one piece of the old ult lag that survived
 * moving the bodies off the cast.
 */
export function warmEggAssets() { eggGeometry(); eggMaterial(); }

function eggMaterial() {
  if (_eggMat) return _eggMat;
  if (hasTex('prop', 'prop_dino_egg')) {
    _eggMat = pbrMaterial('prop', 'prop_dino_egg', { roughness: 0.82, metalness: 0.02 });
    if (_eggMat) return _eggMat;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#cdbb9a';
  g.fillRect(0, 0, 128, 128);
  // blotches: big soft patches of a darker, greener shell
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, r = rand(4, 15);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = rand(0.05, 0.16);
    grad.addColorStop(0, `rgba(120,104,72,${a})`);
    grad.addColorStop(1, 'rgba(120,104,72,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // speckle: the fine dark flecks that say EGG rather than STONE
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${70 + Math.random() * 40 | 0},${52 + Math.random() * 30 | 0},34,${rand(0.10, 0.45)})`;
    const s = rand(0.6, 1.6);
    g.fillRect(Math.random() * 128, Math.random() * 128, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _eggMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.03 });
  return _eggMat;
}

// one shared unit-egg geometry (a squashed sphere, long axis +X)
let _eggGeo = null;
function eggGeometry() {
  if (!_eggGeo) {
    _eggGeo = new THREE.SphereGeometry(1, 22, 16);
    // an egg is not an ellipsoid: taper one end so it reads as a BLUNT and a
    // POINTED pole rather than a rugby ball
    const p = _eggGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const taper = 1 - 0.22 * Math.max(0, x);
      p.setXYZ(i, x, y * taper, z * taper);
    }
    _eggGeo.computeVertexNormals();
  }
  return _eggGeo;
}

export class EggSystem {
  constructor(world) {
    this.world = world;
    this.eggs = [];
    this.nextHatch = 0;      // world time the next slot opens
  }

  /**
   * One egg, warping in at `pos`. `prepare` is called ~1s before it hatches and
   * must return the MECH to hatch (or null to fall back on the fighter's own
   * clone path) — combat/specials.js owns that, so the pool lives with the ult.
   */
  spawn(owner, pos, { height = 6, hatchIn = 2, prepare = null, onHatch = null } = {}) {
    const L = height * 0.75 * 0.5;         // half the long axis
    const r = L * 0.62;                    // short radius
    const mesh = new THREE.Mesh(eggGeometry(), eggMaterial().clone());
    mesh.scale.set(L, r, r);
    mesh.castShadow = true;
    mesh.position.copy(pos);
    mesh.position.y += r;
    this.world.scene.add(mesh);
    const egg = {
      owner, mesh, L, r,
      pos: mesh.position,
      vel: new THREE.Vector3(rand(-2, 2), 2.5, rand(-2, 2)),
      // the long axis lies across the direction of travel, like a barrel
      axis: new THREE.Vector3(0, 0, 1),
      spin: 0, roll: 0,
      hp: HP, flash: 0, t: 0, warp: 0,
      state: 'warp',
      hatchAt: hatchIn, body: null, prepare, onHatch,
      grounded: false,
    };
    mesh.material.transparent = true;
    mesh.material.opacity = 0;
    this.eggs.push(egg);
    const fx = this.world.effects;
    fx.rings.spawn(pos, { from: r * 4, to: r * 0.8, dur: 0.45, color: 0xff8a3c, y: r });
    fx.impactSparks(mesh.position, 0xffb060, 12, 7);
    this.world.audio?.play('cast');
    return egg;
  }

  clear() {
    for (const e of this.eggs) this.world.scene.remove(e.mesh);
    this.eggs.length = 0;
  }

  // ---- damage plumbing ------------------------------------------------------
  // Three call sites reach this: an explosion (world.explode), a projectile
  // (projectiles.js) and a melee sweep (fighter.js). Each one hands over WHO
  // did it, which is the only thing the rules here actually care about.

  /** Nearest egg whose shell the segment p0->p1 passes within `pad` of. */
  hitSegment(p0, p1, pad = 0.4) {
    let best = null, bestT = Infinity;
    for (const e of this.eggs) {
      if (e.state === 'dead' || e.state === 'hatching') continue;
      const t = segSphereT(p0, p1, e.pos, e.L + pad);
      if (t !== null && t < bestT) { best = e; bestT = t; }
    }
    return best;
  }

  /** Every live egg within `radius` of a point (explosions). */
  eggsNear(pos, radius) {
    const out = [];
    for (const e of this.eggs) {
      if (e.state === 'dead' || e.state === 'hatching') continue;
      const dx = this.world.wrapDelta(e.pos.x - pos.x);
      const dz = this.world.wrapDelta(e.pos.z - pos.z);
      if (dx * dx + (e.pos.y - pos.y) ** 2 + dz * dz < (radius + e.L) ** 2) out.push(e);
    }
    return out;
  }

  /**
   * A blow lands on an egg. THE ATTACKER IS THE RULE: its own parent shoves it,
   * anybody else wounds it. `dir` is the push direction (any length).
   */
  hit(egg, attacker, dir, power = 1) {
    if (!egg || egg.state === 'dead' || egg.state === 'hatching') return false;
    const own = attacker === egg.owner || (attacker && egg.owner && attacker.isAllyOf?.(egg.owner));
    _v.copy(dir); _v.y = 0;
    if (_v.lengthSq() < 1e-6) _v.set(rand(-1, 1), 0, rand(-1, 1));
    _v.normalize();
    const fx = this.world.effects;
    if (own) {
      // A KICK IS A DELIVERY. Full impulse, a puff of dust, nothing else.
      egg.vel.addScaledVector(_v, OWNER_SHOVE * power);
      egg.vel.y = Math.max(egg.vel.y, 3.4);
      fx.dustPuff(egg.pos, 7);
      this.world.audio?.play('hit', { vol: 0.5, pitch: 0.7 });
      return true;
    }
    // A HIT IS A WOUND. Small shunt, red flash, and the second one ends it.
    egg.vel.addScaledVector(_v, ENEMY_SHOVE * power);
    egg.vel.y = Math.max(egg.vel.y, 2);
    egg.flash = FLASH_T;
    egg.hp--;
    fx.impactSparks(egg.pos, 0xff5a4a, 10, 7);
    this.world.audio?.play(egg.hp > 0 ? 'hit' : 'explosion');
    if (egg.hp <= 0) this.destroy(egg, attacker);
    return true;
  }

  /** Shell off, nothing inside. */
  destroy(egg, by = null) {
    if (egg.state === 'dead') return;
    egg.state = 'dead';
    this.shatter(egg, 1.15);
    this.world.effects.explosion(egg.pos, egg.L * 1.1, { color: 0xffd7a8, smoke: true });
    this.world.events?.emit?.('eggLost', { egg, by });
  }

  // the shell coming apart: pieces that scatter, tumble and fade
  shatter(egg, force = 1) {
    const w = this.world;
    for (let i = 0; i < PIECES; i++) {
      const g = new THREE.Mesh(eggGeometry(), egg.mesh.material);
      const s = rand(0.22, 0.4);
      g.scale.set(egg.L * s, egg.r * s, egg.r * s);
      g.position.copy(egg.pos);
      g.quaternion.copy(egg.mesh.quaternion);
      w.scene.add(g);
      const dir = new THREE.Vector3(rand(-1, 1), rand(0.2, 1), rand(-1, 1)).normalize();
      w.debris.push(g);
      const vel = dir.multiplyScalar(rand(5, 12) * force);
      const spin = new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      let life = rand(1.1, 1.8);
      w.addUpdater((dt) => {
        life -= dt;
        vel.y -= G * dt;
        g.position.addScaledVector(vel, dt);
        if (g.position.y < 0.1) { g.position.y = 0.1; vel.y = Math.abs(vel.y) * 0.3; vel.multiplyScalar(0.6); }
        g.rotation.x += spin.x * dt; g.rotation.y += spin.y * dt; g.rotation.z += spin.z * dt;
        if (life < 0.5) {
          g.material = g.material.clone ? g.material : g.material;
          g.scale.multiplyScalar(1 - dt * 1.6);
        }
        return life > 0;
      }, () => {
        w.scene.remove(g);
        const i2 = w.debris.indexOf(g);
        if (i2 >= 0) w.debris.splice(i2, 1);
      });
    }
    w.effects.dustPuff(egg.pos, 12);
  }

  // ---- per frame ------------------------------------------------------------
  update(dt) {
    if (!this.eggs.length) return;
    const w = this.world;
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      e.t += dt;
      if (e.state === 'dead') { w.scene.remove(e.mesh); this.eggs.splice(i, 1); continue; }
      // arriving
      if (e.state === 'warp') {
        e.warp = Math.min(1, e.warp + dt / WARP);
        e.mesh.material.opacity = e.warp;
        if (e.warp >= 1) { e.state = 'idle'; e.mesh.material.transparent = false; }
      }
      this.step(e, dt);
      // the red of a wound
      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt);
        const k = e.flash / FLASH_T;
        e.mesh.material.emissive?.setRGB(0.9 * k, 0.06 * k, 0.04 * k);
      }
      // ---- the hatch queue ----
      if (e.state === 'idle' || e.state === 'cracking') {
        // build the body a beat before the slot it is going to use
        if (!e.body && e.prepare && e.t >= e.hatchAt - BUILD_LEAD) e.body = e.prepare() || null;
        const slotReady = w.time >= this.nextHatch;
        if (e.state === 'idle' && e.t >= e.hatchAt && slotReady && e.body) {
          e.state = 'cracking';
          e.crackT = CRACK;
          this.nextHatch = w.time + GAP;
          w.audio?.play('hitHeavy', { vol: 0.6, pitch: 1.4 });
        }
      }
      if (e.state === 'cracking') {
        e.crackT -= dt;
        // the shell shakes harder as it goes
        const k = 1 - clamp01(e.crackT / CRACK);
        e.mesh.position.x += Math.sin(e.t * 60) * 0.05 * k;
        e.mesh.position.z += Math.cos(e.t * 53) * 0.05 * k;
        if (e.crackT <= 0) this.hatch(e);
      }
    }
  }

  // gravity, ground, roll
  step(e, dt) {
    const w = this.world;
    e.vel.y -= G * dt;
    e.pos.addScaledVector(e.vel, dt);
    const gy = (w.arena?.terrainHeightAt?.(e.pos.x, e.pos.z) || 0) + e.r;
    if (e.pos.y <= gy) {
      e.pos.y = gy;
      if (e.vel.y < 0) e.vel.y = -e.vel.y * BOUNCE;
      if (Math.abs(e.vel.y) < 1.2) e.vel.y = 0;
      e.grounded = true;
      // rolling friction — a shell on stone gives up its speed slowly
      const k = Math.exp(-ROLL_FRICTION * dt);
      e.vel.x *= k; e.vel.z *= k;
      if (Math.hypot(e.vel.x, e.vel.z) < 0.25) { e.vel.x = 0; e.vel.z = 0; }
    } else e.grounded = false;
    // keep it on the board
    const B = (w.arena?.bounds || 120) * 1.4;
    e.pos.x = Math.max(-B, Math.min(B, e.pos.x));
    e.pos.z = Math.max(-B, Math.min(B, e.pos.z));
    // ---- ROLLING. The long axis lies ACROSS the travel (a barrel), the shell
    // turns about it at travel / short radius, and the axis follows a change of
    // direction rather than snapping to it, which is what gives the wobble.
    const spd = Math.hypot(e.vel.x, e.vel.z);
    if (spd > 0.05) {
      _axis.set(-e.vel.z / spd, 0, e.vel.x / spd);
      e.axis.lerp(_axis, 1 - Math.exp(-SPIN_DAMP * dt)).normalize();
      if (e.grounded) e.roll += (spd / Math.max(0.4, e.r)) * dt;
    }
    _q.setFromUnitVectors(_LONG, e.axis);
    _q2.setFromAxisAngle(e.axis, e.roll);
    e.mesh.quaternion.copy(_q2).multiply(_q);
  }

  // ---- the hatch ------------------------------------------------------------
  hatch(e) {
    e.state = 'hatching';
    this.shatter(e, 0.85);
    this.world.effects.rings.spawn(e.pos, { from: e.L * 0.6, to: e.L * 3, dur: 0.5, color: 0xff8a3c, y: 0.4 });
    this.world.audio?.play('explosion', { vol: 0.6, pitch: 1.5 });
    this.world.scene.remove(e.mesh);
    e.state = 'dead';
    e.onHatch?.(e);
  }
}

// distance-along parameter where a segment first pierces a sphere, or null
function segSphereT(p0, p1, c, r) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const fx = p0.x - c.x, fy = p0.y - c.y, fz = p0.z - c.z;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-9) return (fx * fx + fy * fy + fz * fz <= r * r) ? 0 : null;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const cc = fx * fx + fy * fy + fz * fz - r * r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return (t1 < 0 && t2 > 1) ? 0 : null;
}
