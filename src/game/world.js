// World: binds engine, arena, fighters, projectiles, FX, audio. Owns the
// scheduler, ranged-fire dispatch, explosions and area effects.
import * as THREE from 'three';
import { Finisher } from './finisher.js';
import { Effects } from '../combat/effects.js';
import { FlameFX, fireCool } from '../combat/flamefx.js';
import { ProjectileSystem } from '../combat/projectiles.js';
import { FleaSystem } from '../combat/fleas.js';
import { rand, clamp } from '../core/utils.js';

const _v = new THREE.Vector3();

class Emitter {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, []);
    this.map.get(name).push(fn);
    return () => {
      const arr = this.map.get(name);
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  }
  emit(name, data) {
    const arr = this.map.get(name);
    if (arr) for (const fn of [...arr]) fn(data);
  }
}

export class World {
  constructor(engine, audio) {
    this.engine = engine;
    this.scene = engine.scene;
    this.audio = audio;
    this.effects = new Effects(this.scene);
    this.projectiles = new ProjectileSystem(this.scene, this);
    this.fleas = new FleaSystem(this.scene, this); // JERRY's living ammo
    this.events = new Emitter();
    this.fighters = [];
    this.arena = null;
    this.input = null;
    this.tasks = [];        // {t, fn}
    // flamethrower jets are RETRIGGERED every fire tick, so they need a
    // lookup index (playerIndex / 'fin') on top of their sticky updater —
    // all other environmental fx live purely in this.updaters now
    this.flameJets = new Map(); // key -> {nozzle, impact, ttl} FlameFX pairs
    this.debris = [];       // finisher wreckage (frozen rubble): cleared each round
    this.pickups = [];      // ammo crates {mesh, pos, active, respawnT}
    // per-frame ultimate entities (orbit swarms, tornadoes, giant forms...):
    // {tick(dt) -> false when done, end()} — end() ALWAYS runs (natural
    // finish, finisher interrupt, or round sweep), so cleanup lives there
    this.updaters = [];
    // summoned AI fighters (SAURION's raptors): {f, ai, t, linger}
    this.minions = [];
    this.time = 0;
    // toroidal arena: coordinates wrap at ±wrapHalf on X and Z (0 = off).
    // Set from the arena in bind(); all combat queries use nearest-image
    // deltas so opponents are "close" straight through the seam.
    this.wrapHalf = 0;
  }

  // shortest signed delta on a wrapped axis (nearest image)
  wrapDelta(d) {
    const W = this.wrapHalf;
    if (!W) return d;
    const P = W * 2;
    let x = (d + W) % P;
    if (x < 0) x += P;
    return x - W;
  }

  // fold a coordinate into [-wrapHalf, wrapHalf)
  wrapCoord(v) {
    const W = this.wrapHalf;
    if (!W) return v;
    return this.wrapDelta(v);
  }

  // nearest-image position of `pos` as seen from `ref` (fresh Vector3)
  nearestImage(pos, ref) {
    return new THREE.Vector3(
      ref.x + this.wrapDelta(pos.x - ref.x),
      pos.y,
      ref.z + this.wrapDelta(pos.z - ref.z)
    );
  }

  // ---- per-view render wrapping ----
  // Before each viewport renders, shift every dynamic entity to its nearest
  // image relative to that view's camera, so opponents/projectiles are seen
  // straight across the wrap seam (the static world is ghost-tiled).
  // Restored immediately after the render — physics never sees the shift.
  applyViewWrap(camera) {
    // per-view building see-through: stamp THIS view's fade values so a
    // building only ghosts on the screen of the player it actually hides
    this.arena?.applyViewFade?.(camera);
    if (!this.wrapHalf) return;
    const cx = camera.position.x, cz = camera.position.z;
    this._viewShifted = this._viewShifted || [];
    const shift = (obj) => {
      const dx = this.wrapDelta(obj.position.x - cx) - (obj.position.x - cx);
      const dz = this.wrapDelta(obj.position.z - cz) - (obj.position.z - cz);
      if (dx || dz) {
        obj.position.x += dx;
        obj.position.z += dz;
        this._viewShifted.push(obj, dx, dz);
      }
    };
    for (const f of this.fighters) shift(f.group);
    for (const p of this.projectiles.active) shift(p.mesh);
    for (const fl of this.fleas.active) shift(fl.mesh);
    for (const p of this.pickups) shift(p.mesh);
  }

  clearViewWrap() {
    const s = this._viewShifted;
    if (!s || !s.length) return;
    for (let i = 0; i < s.length; i += 3) {
      s[i].position.x -= s[i + 1];
      s[i].position.z -= s[i + 2];
    }
    s.length = 0;
  }

  schedule(delay, fn) {
    this.tasks.push({ t: this.time + delay, fn });
  }

  // register a per-frame driver for a live combat entity. tick(dt) returns
  // false when the entity is finished; end() is the cleanup (scene removal,
  // material restore) and is guaranteed to run exactly once.
  //
  // sticky: survives the startFinisher endUpdaters() sweep. Ult entities
  // (default) are killed when a finisher starts so nothing keeps hitting
  // the two actors; environmental fx (fire patches, geysers, waves...)
  // stay through the cinematic — finisher scripts even spawn their own —
  // and die at their natural end or the round's clearTransient.
  addUpdater(tick, end = null, { sticky = false } = {}) {
    this.updaters.push({ tick, end, sticky });
  }

  endUpdaters(includeSticky = true) {
    const keep = [];
    for (let i = this.updaters.length - 1; i >= 0; i--) {
      const u = this.updaters[i];
      if (!u || u.ended) continue;
      if (!includeSticky && u.sticky) { keep.push(u); continue; }
      u.ended = true;
      u.end?.();
    }
    keep.reverse(); // preserve registration order for the survivors
    this.updaters.length = 0;
    this.updaters.push(...keep);
  }

  // ---- summoned fighters (they join world.fighters but never the match
  // roster, so rounds/KO logic ignore them) ----
  addMinion(fighter, ai, life = 15) {
    this.fighters.push(fighter);
    this.minions.push({ f: fighter, ai, t: life, linger: 1.4 });
  }

  removeMinion(fighter, silent = false) {
    const i = this.minions.findIndex((m) => m.f === fighter);
    if (i >= 0) this.minions.splice(i, 1);
    const j = this.fighters.indexOf(fighter);
    if (j >= 0) this.fighters.splice(j, 1);
    this.scene.remove(fighter.group);
    if (!silent) {
      this.effects.rings.spawn(fighter.pos, { from: 3, to: 0.5, dur: 0.35, color: 0xff3826, y: 1 });
      this.effects.impactSparks(fighter.center(), 0xff3826, 10, 7);
      this.audio?.play('cloak');
    }
  }

  clearMinions(silent = true) {
    for (let i = this.minions.length - 1; i >= 0; i--) this.removeMinion(this.minions[i].f, silent);
  }

  // ---- ammo crates: every mech's ranged weapon runs on ammo now ----
  spawnAmmoBoxes(count = 6, radius = 60) {
    for (let i = 0; i < count; i++) {
      // keep crates out of lava streams / off bridges; hills are fine —
      // the crate sits (and bobs) on the terrain surface
      let x = 0, z = 0, tries = 0;
      do {
        const a = (i / count) * Math.PI * 2 + rand(-0.4, 0.4);
        const r = radius * rand(0.45, 1);
        x = Math.cos(a) * r; z = Math.sin(a) * r;
      } while (this.arena?.badPickupSpot?.(x, z) && ++tries < 12);
      const gy = this.arena?.terrainHeightAt?.(x, z) || 0;
      const pos = new THREE.Vector3(x, gy, z);
      const grp = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.1, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.6, metalness: 0.4 })
      );
      box.position.y = 0.8;
      box.castShadow = true;
      grp.add(box);
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.24, 1.16),
        new THREE.MeshBasicMaterial({ color: 0xffd23c })
      );
      band.position.y = 0.8;
      grp.add(band);
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(1.3, 1.6, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.05;
      grp.add(glow);
      grp.position.copy(pos);
      this.scene.add(grp);
      this.pickups.push({ mesh: grp, pos, baseY: pos.y, active: true, respawnT: 0, t: rand(0, 6) });
    }
  }

  updatePickups(dt) {
    for (const p of this.pickups) {
      p.t += dt;
      if (!p.active) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          p.active = true;
          p.mesh.visible = true;
          this.effects.rings.spawn(p.pos, { from: 0.4, to: 2.6, dur: 0.4, color: 0xffd23c, y: 0.3 });
        }
        continue;
      }
      p.mesh.rotation.y = p.t * 1.4;
      p.mesh.position.y = (p.baseY || 0) + Math.sin(p.t * 2.2) * 0.18 + 0.05;
      for (const f of this.fighters) {
        if (!f.alive || f.ammoMax === undefined) continue;
        if (f.ammo >= f.ammoMax) continue;
        const dx = this.wrapDelta(f.pos.x - p.pos.x), dz = this.wrapDelta(f.pos.z - p.pos.z);
        if (dx * dx + dz * dz < 10.5 && Math.abs(f.pos.y - (p.baseY || 0)) < 4) {
          f.ammo = f.ammoMax;
          p.active = false;
          p.mesh.visible = false;
          p.respawnT = 10;
          this.audio?.play('powerup');
          this.effects.rings.spawn(p.pos, { from: 2.2, to: 0.4, dur: 0.35, color: 0xffd23c, y: 0.6 });
          this.events.emit('ammo', { fighter: f });
          break;
        }
      }
    }
  }

  update(dt) {
    this.time += dt;
    if (this.finisher) this.finisher.update(dt);
    // scheduler
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (this.tasks[i].t <= this.time) {
        const { fn } = this.tasks[i];
        this.tasks.splice(i, 1);
        fn();
      }
    }
    // summoned minions think first (their bodies move in the fighters pass)
    for (let i = this.minions.length - 1; i >= 0; i--) {
      const m = this.minions[i];
      if (!m) continue; // a KO handler may sweep the list mid-walk
      if (m.f.alive && m.t > 0) {
        m.t -= dt;
        m.ai.update(dt);
        if (m.t <= 0) this.removeMinion(m.f); // time's up: de-rez
      } else if (!m.f.alive) {
        m.linger -= dt; // dead: let the wreck sit a beat, then sweep it
        if (m.linger <= 0) this.removeMinion(m.f);
      }
    }

    for (const f of this.fighters) f.update(dt);
    this.projectiles.update(dt);
    this.fleas.update(dt);
    this.effects.update(dt);
    this.arena?.update(dt);
    this.updatePickups(dt);

    // live ultimate entities (post-physics so they see settled positions).
    // A tick can cascade into clearTransient (a KO handler resetting the
    // round), which empties this list mid-walk — hence the guards.
    for (let i = this.updaters.length - 1; i >= 0; i--) {
      const u = this.updaters[i];
      if (!u || u.ended) continue;
      if (u.tick(dt) === false) {
        const j = this.updaters.indexOf(u);
        if (j >= 0) this.updaters.splice(j, 1);
        if (!u.ended) { u.ended = true; u.end?.(); }
      }
    }

  }
  // (geysers / waves / tornados / flame jets / fire patches / ice blocks
  // used to have bespoke update loops here — they now run as sticky
  // updaters registered by their spawn* APIs below)

  // area explosion: damages fighters w/ falloff + wrecks buildings + FX
  explode(pos, radius, dmg, { owner = null, knock = 12, color = 0xffa040, launch = 0, status = null, silentFx = false, unblockable = false } = {}) {
    if (!silentFx) {
      this.effects.explosion(pos, radius, { color });
      this.audio?.play(radius > 7 ? 'explosionBig' : 'explosion');
      this.effects.addShake(Math.min(1.2, radius * 0.09));
    }
    for (const f of this.fighters) {
      if (f === owner || !f.alive) continue;
      const c = f.center();
      const dx = this.wrapDelta(c.x - pos.x), dz = this.wrapDelta(c.z - pos.z);
      const d = Math.sqrt(dx * dx + (c.y - pos.y) ** 2 + dz * dz);
      if (d < radius + f.hitRadius) {
        const falloff = 1 - Math.max(0, (d - radius * 0.3)) / (radius + f.hitRadius);
        f.takeHit(dmg * Math.max(0.25, falloff), owner, {
          knock: knock * Math.max(0.4, falloff), launch, srcPos: pos, heavy: dmg > 60, status, unblockable,
        });
      }
    }
    this.arena?.damageSphere(pos, radius * 0.85, dmg * 2.2, null, true);
    this.arena?.hitExplosives?.(pos, radius);   // blasts cook off nearby tanks
  }

  // expanding ground ring that hits grounded fighters (slams)
  groundShockwave(owner, pos, radius, dmg, knock, color, launchAll = false, unblockable = false, hitOpts = null) {
    this.effects.rings.spawn(pos, { from: 1, to: radius * 2.2, dur: 0.55, color, y: 0.4 });
    this.effects.dustPuff(pos, 16);
    this.effects.explosion(pos, radius * 0.4, { color, smoke: false, ring: false });
    this.arena?.damageSphere(_v.set(pos.x, pos.y + 1, pos.z), radius * 0.7, dmg * 1.6, null, true);
    for (const f of this.fighters) {
      if (f === owner || !f.alive) continue;
      const dxs = this.wrapDelta(f.pos.x - pos.x), dzs = this.wrapDelta(f.pos.z - pos.z);
      const d = Math.hypot(dxs, dzs);
      // height check is RELATIVE so slams landed on a rooftop still connect
      if (d < radius && Math.abs(f.pos.y - pos.y) < 3) {
        const falloff = 1 - d / radius;
        f.takeHit(dmg * Math.max(0.35, falloff), owner, {
          knock: knock * falloff, launch: launchAll ? 11 : 8 * falloff, srcPos: pos, heavy: true, unblockable,
          ...hitOpts,
        });
      }
    }
  }

  // persistent set-dressing wreckage (e.g. GLACIER's shattered-victim
  // rubble): stays through the round-end beat, swept by clearTransient
  addDebris(mesh) {
    this.debris.push(mesh);
    this.scene.add(mesh);
    return mesh;
  }

  addFirePatch(owner, pos, radius, duration, dps) {
    // each patch is a real burning source: shader-card tongues + embers +
    // smoke (FlameFX), no per-frame flipbook blobs. Lights stay off in
    // combat — light-count changes force material recompiles mid-match.
    const flame = new FlameFX(this.scene, this.effects, pos, {
      radius: radius * 0.8, scale: 1.0 + radius * 0.35, cards: 6, light: false,
      cool: fireCool(owner?.def),
    });
    const at = pos.clone();
    let t = duration, tick = 0, dying = false;
    this.addUpdater((dt) => {
      t -= dt;
      if (t <= 0 && !dying) { dying = true; flame.extinguish(0.5); }
      if (!flame.update(dt)) return false;
      if (dying) return true; // burning out — no more damage ticks
      tick -= dt;
      if (tick <= 0) {
        tick = 0.4;
        for (const f of this.fighters) {
          if (f === owner || !f.alive) continue;
          if (f.grounded && f.pos.distanceTo(at) < radius + f.radius) {
            f.takeHit(dps, owner, { knock: 1, srcPos: at, status: { burn: 6, burnT: 1.5 }, soft: true });
          }
        }
      }
      return true;
    }, () => flame.dispose(), { sticky: true });
  }

  // GEYSER (CRANKY's special + finisher set-dressing): the fx runs its own
  // telegraph -> erupt -> collapse show. Passing scald = {owner, dmg,
  // radius, launch} arms the combat tick: anyone standing in the COLUMN
  // (not the full blast radius — matches the visual) keeps taking hits for
  // as long as the water is up. No scald = fx-only (finisher cinematics).
  spawnGeyser(fx, scald = null) {
    let tick = 0;
    this.addUpdater((dt) => {
      if (!fx.update(dt)) return false;
      if (!scald || fx.phase !== 'erupt') return true;
      tick -= dt;
      if (tick > 0) return true;
      tick = 0.4;
      for (const v of this.fighters) {
        if (v === scald.owner || !v.alive) continue;
        const dx = this.wrapDelta(v.pos.x - fx.pos.x), dz = this.wrapDelta(v.pos.z - fx.pos.z);
        if (Math.hypot(dx, dz) < scald.radius * 0.55 + v.hitRadius * 0.5) {
          v.takeHit(scald.dmg * 0.2 * scald.owner.dmgMult(), scald.owner,
            { knock: 3, launch: scald.launch * 0.55, srcPos: fx.pos, soft: true });
          v.applySoak?.(2.4); // drenched: dripping frame, half speed
          this.effects.splash(v.center(), 6, 5, 1);
        }
      }
      return true;
    }, () => fx.dispose(), { sticky: true });
  }

  // tidal wave wall: rolls until it collapses into foam at the end of the
  // run. Lifecycle only — the casting special drives its own gameplay
  // updater against the same travel integration.
  spawnWave(fx) {
    this.addUpdater((dt) => !!fx.update(dt), () => fx.dispose(), { sticky: true });
  }

  // fire tornado funnel: lifecycle only, same split as spawnWave (the
  // inferno ult steers the funnel and runs the hunt/sweep gameplay in its
  // own updater).
  spawnTornado(fx) {
    this.addUpdater((dt) => !!fx.update(dt), () => fx.dispose(), { sticky: true });
  }

  // flamethrower card-flame pair (nozzle + impact). Registered under a key
  // (playerIndex, or 'fin' for the finisher) so the per-tick fire code can
  // find and RETRIGGER the live jet instead of stacking new ones; the jet
  // dies shortly after the trigger releases (ttl stops being refreshed).
  spawnFlameJet(key, fj) {
    this.flameJets.set(key, fj);
    this.addUpdater((dt) => {
      if (fj.dead) return false; // replaced by its owner (see fireRanged)
      fj.ttl -= dt;
      if (fj.ttl <= 0 && fj.nozzle.alive && fj.nozzle._dieT === undefined) {
        fj.nozzle.extinguish(0.22);
        fj.impact.extinguish(0.35);
      }
      const nozzleLive = fj.nozzle.update(dt);
      const impactLive = fj.impact.update(dt);
      return nozzleLive || impactLive;
    }, () => {
      fj.nozzle.dispose();
      fj.impact.dispose();
      // don't unindex a newer jet that already took over this key
      if (this.flameJets.get(key) === fj) this.flameJets.delete(key);
    }, { sticky: true });
  }

  freezeOverlay(fighter, duration) {
    const geo = new THREE.IcosahedronGeometry(fighter.hitRadius * 1.15, 1);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xbfeaff, transparent: true, opacity: 0.45, roughness: 0.1,
      metalness: 0, transmission: 0.5, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.y = 1.4;
    this.scene.add(mesh);
    let t = duration;
    this.addUpdater((dt) => {
      t -= dt;
      mesh.position.copy(fighter.pos);
      mesh.position.y += fighter.height * 0.5;
      if (t <= 0 || !fighter.alive) {
        // shatter flourish only on a natural thaw — a round sweep just removes
        this.effects.impactSparks(fighter.center(), 0x9be8ff, 14, 8);
        this.audio?.play('shatter');
        return false;
      }
      return true;
    }, () => {
      this.scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    }, { sticky: true });
  }

  // ranged attack dispatch (single shots and channel ticks)
  fireRanged(f, mv) {
    const anchors = f.mech.anchors;
    // THE PRIMARY BARREL. Almost every mech shoots from the right hand, so
    // muzzleR is the default. A mech that carries its weapon in the OTHER hand
    // (GLACIER's ice lance) names its barrel with roster `rangedMuzzle` and
    // pairs it with the mirrored clip (`rangedClip: 'shootL'`) — otherwise the
    // shot would leave an empty fist while the armed arm hangs at his side.
    const muzzle = anchors[f.def.rangedMuzzle] || anchors.muzzleR;
    const from = muzzle.getWorldPosition(new THREE.Vector3());
    const e = f.nearestEnemy();
    // AIMED shot (human held RB): fly straight at the crosshair's world
    // point — full manual control, including pitch. No assist.
    const aimP = f._aimPoint || null;
    f._aimPoint = null;
    // Otherwise aim strictly along the mech's facing — no horizontal
    // auto-aim. Only VERTICAL assist remains: when an enemy is roughly down
    // the barrel, the shot pitches to their height so airborne/short
    // targets aren't unhittable with yaw-only controls.
    const dir = new THREE.Vector3(Math.sin(f.yaw), 0.02, Math.cos(f.yaw));
    // How squarely the real enemy sits down the barrel, and how far off they
    // are. Stays enemy-only (-1 / 0 with nobody around): handlers read these as
    // "there is a live target down the barrel", and a phantom must not fake it.
    let barrelDot = -1, flatDist = 0;
    const toTarget = (t) => {
      const to = t.center().sub(from);
      to.x = this.wrapDelta(to.x);   // aim through the arena seam
      to.z = this.wrapDelta(to.z);
      return to;
    };
    if (e) {
      const to = toTarget(e);
      flatDist = Math.hypot(to.x, to.z) || 1;
      barrelDot = (to.x / flatDist) * dir.x + (to.z / flatDist) * dir.z;
    }
    // THE DEFAULT TRAJECTORY. With no enemy at all — or one who isn't down the
    // barrel, so nothing is effectively targeted — the pitch ranges onto a
    // PHANTOM instead: an opponent of our own build standing dead ahead at the
    // move's working distance (Fighter.aimPhantom / idealAimDist, the same
    // stand-in the melee strike tracker swings at — close for a fist, far for a
    // gun). Every unaimed shot then leaves the barrel on the trajectory it
    // would take against a real target, instead of sailing dead flat out of a
    // muzzle that sits well above head height. This is the game's own
    // no-target behaviour; ?debug=models previews it rather than parking
    // stand-in bodies on the stage.
    if (!aimP) {
      const onTarget = barrelDot > 0.86;
      const to = onTarget ? toTarget(e) : toTarget(f.aimPhantom(f.idealAimDist(mv)));
      const d = Math.hypot(to.x, to.z) || 1;
      dir.y = clamp(to.y / d, -0.7, 0.7);
      dir.normalize();
    }
    if (aimP) dir.copy(aimP).sub(from).normalize();
    // The barrel has the last word: a muzzle authored with an explicit `rot`
    // deflects the finished aim along its own +Z, so a cannon modelled splayed
    // outward actually fires outward. No-rot muzzles leave the aim untouched.
    // `dirFrom` gives any OTHER barrel its own deflection off the same base
    // aim, so a twin-cannon mech's two sides splay independently.
    const baseDir = dir.clone();
    const dirFrom = (a, out = new THREE.Vector3()) =>
      out.copy(baseDir).applyQuaternion(barrelDeflect(f, a, _bOff)).normalize();
    dirFrom(muzzle, dir);

    // per-weapon behavior lives in the WEAPONS table below — same
    // aiming context for every handler
    WEAPONS[mv.type]?.(this, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors, dirFrom, muzzle });
  }


  startFinisher(winner, victim, onDone) {
    // the cinematic owns the stage: sweep live ult entities and summons so
    // nothing keeps hitting (or upstaging) the two actors — but sticky
    // environmental fx (fire patches, geysers...) stay for the cinematic
    this.endUpdaters(false);
    this.clearMinions();
    this.finisher = new Finisher(this, winner, victim, onDone);
  }

  clearTransient() {
    this.tasks.length = 0;
    // sticky included: fire patches / geysers / waves / tornados / flame
    // jets / ice blocks are all sticky updaters whose end() disposes them
    // (flame jets also unindex themselves from this.flameJets)
    this.endUpdaters();
    this.clearMinions();
    for (const p of this.projectiles.active) p.mesh.visible = false;
    this.projectiles.active.length = 0;
    this.projectiles.clearStuck();
    for (const d of this.debris) {
      this.scene.remove(d);
      d.geometry?.dispose?.();
      d.material?.dispose?.();
    }
    this.debris.length = 0;
    this.fleas.clear();
  }
}

// A muzzle anchor authored with an explicit `rot` in the manifest carries its
// own BARREL DIRECTION: the anchor's +Z axis (the ?debug=models anchor editor
// draws that axis, and its exports are what set `rot`). This returns the
// rotation from the mech's flat facing to that barrel axis, so callers can
// deflect a finished aim along the barrel — auto-aim, the crosshair and the
// vertical assist still choose the base direction; the barrel only offsets it.
// EVERY muzzle in the manifest now carries a rot, so every mech aims by
// barrel: the straight-ahead ones have a baked rot putting their +Z on the
// mech's facing at rest, which makes this deflection identity there (same
// shots as before), while a deliberately-splayed gun — cranky's water cannons
// — throws along its own axis. A muzzle with NO rot still returns identity, so
// one added later behaves as it always did until its orientation is authored.
const _bQ = new THREE.Quaternion(), _bOff = new THREE.Quaternion();
const _bFwd = new THREE.Vector3(), _bFace = new THREE.Vector3();
function barrelDeflect(f, anchor, out = new THREE.Quaternion()) {
  out.identity();
  if (!anchor?.userData?.aimRot) return out;
  anchor.getWorldQuaternion(_bQ);
  _bFwd.set(0, 0, 1).applyQuaternion(_bQ);
  if (_bFwd.lengthSq() < 1e-9) return out;
  _bFace.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
  return out.setFromUnitVectors(_bFace, _bFwd.normalize());
}

// ---- ranged weapon handlers -----------------------------------------------
// One entry per roster move `type`, called by World.fireRanged with the
// shared aiming context it computed: from (muzzle world pos), dir (aim,
// already vertical-assisted / crosshair-overridden), e (nearest enemy or
// null), aimP (manual crosshair point or null), barrelDot/flatDist (how
// squarely the target sits down the barrel + flat range to it — measured
// against the aim phantom when there is no enemy, so a blind shot still
// carries a real range instead of zero), anchors
// (the mech's anchor map). Handlers are (w, f, mv, ctx) — w is the World.
// Adding a weapon = adding an entry here + a `type` in roster.js.
const WEAPONS = {
  gatling(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    const d = dir.clone();
    d.x += rand(-mv.spread, mv.spread);
    d.y += rand(-mv.spread, mv.spread) * 0.6;
    d.z += rand(-mv.spread, mv.spread);
    w.projectiles.spawn('bullet', f, from, d, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, color: 0xffd080, knock: 2, life: 1.6, soft: true,
    });
    w.effects.muzzleFlash(from);
    w.audio?.play('gatling');
  },

  flame(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    // FLAMETHROWER: one roaring cone of burning fuel — a FAT stream
    // tube, plus shader-card flames (FlameFX) licking off the nozzle
    // along the aim and blooming up where the stream lands
    const cool = fireCool(f.def);
    const end = w.effects.jet('flame' + f.playerIndex, from, dir, {
      type: cool ? 'firecool' : 'fire', speed: 30, range: mv.range * 1.05, gravity: -4, r0: 0.32, r1: 2.2,
    });
    let fj = w.flameJets.get(f.playerIndex);
    if (fj && (!fj.nozzle.alive || !fj.impact.alive)) {
      fj.dead = true; // burnt out: its updater disposes it this frame
      fj = null;
    }
    if (!fj) {
      fj = {
        nozzle: new FlameFX(w.scene, w.effects, from, { radius: 0.55, scale: 1.05, dir, cards: 5, light: false, cool }),
        impact: new FlameFX(w.scene, w.effects, end || from, { radius: 1.5, scale: 1.0, cards: 6, light: false, cool }),
        ttl: 0,
      };
      w.spawnFlameJet(f.playerIndex, fj);
    }
    fj.ttl = 0.16;
    fj.nozzle.rekindle();
    fj.impact.rekindle();
    fj.nozzle.setPose(from, dir);
    if (end) fj.impact.setPose(end.setY(Math.max(0, end.y - 0.5)));
    if (Math.random() < 0.4) w.effects.fire(from, dir, 34, 0.24, !!cool); // embers riding the blast
    w.audio?.play('flame');
    // cone tick damage
    for (const t of w.fighters) {
      if (t === f || !t.alive) continue;
      const toT = t.center().sub(from);
      const d = toT.length();
      if (d < mv.range && toT.normalize().dot(dir) > 0.72) {
        t.takeHit(mv.dmg * f.dmgMult(), f, { knock: 0.5, srcPos: from, status: { burn: 5, burnT: 2 }, soft: true });
      }
    }
  },

  rocket(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    w.projectiles.spawn('rocket', f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, splash: mv.splash, color: 0xffb43c, knock: 14, launch: 6,
    });
    w.audio?.play('missile');
    w.effects.muzzleFlash(from);
  },

  fist(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) { // TITANUS: the fist itself is the round — it flies out
    // flat, swings around at range and comes home to the wrist,
    // clobbering on both legs of the trip (boomerang + pierce).
    // The projectile wears a CLONE of his real fist geometry (PBR
    // materials and all) so it reads as HIS fist, not a glow blob.
    // GLB mechs carry no geometry on the virtual handR joint (the fist is
    // in the one skinned mesh, driven by a bone), so cloning it yields an
    // EMPTY group — which still hides the projectile's own knuckle carrier
    // and leaves nothing visible. Skip the clone for GLBs and let the
    // built-in chunky-knuckle 'fist' mesh carry the throw instead.
    let skin = null;
    const hand = f.mech.joints.handR;
    if (hand && !f.mech.isGLB) {
      const c = hand.clone(true);
      const strip = [];
      c.traverse((o) => { if (o.userData.chargeShell) strip.push(o); });
      for (const o of strip) o.parent?.remove(o);
      c.position.set(0, 0, 0);
      c.rotation.set(0, 0, 0);
      c.scale.setScalar(1);
      c.updateMatrixWorld(true);
      const ctr = new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3());
      c.position.copy(ctr).negate(); // center the knuckle mass on the carrier
      skin = new THREE.Group();
      skin.add(c);
    }
    const p = w.projectiles.spawn('fist', f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, color: 0xffb43c,
      knock: mv.knock, launch: 5, pierce: true, boomerang: true,
      maxDist: mv.range, life: 6, skin,
    });
    p.onReturn = () => f.catchFist();
    f.launchFist();
    w.audio?.play('missile');
    w.effects.muzzleFlash(from);
  },

  plasma(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    // NOVA: shots fired while the halo glows at apex alignment come out
    // bigger and hotter (novaGlow 0..1 from the animator)
    const g = f.animator?.novaGlow || 0;
    w.projectiles.spawn('plasma', f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed,
      splash: mv.splash * (1 + 0.45 * g), color: 0xff5ce8, knock: 10 + 4 * g,
      size: 1 + 0.75 * g,
    });
    w.audio?.play('plasma');
    // apex shots detonate off the staff tip — the flash size tracks how
    // bright the halo is burning, so a 2X-power shot LOOKS 2X
    if (g > 0.4) {
      w.effects.glows.emit(from.x, from.y, from.z, 0, 0, 0,
        { life: 0.28, size: 2.5 + 4.5 * g, color: 0xff5ce8, alpha: 0.95 });
      w.effects.glows.emit(from.x, from.y, from.z, 0, 0, 0,
        { life: 0.18, size: 1.2 + 2.2 * g, color: 0xfff0ff, alpha: 0.95 });
      for (let i = 0; i < Math.round(6 * g); i++) {
        const a = rand(Math.PI * 2);
        w.effects.glows.emit(from.x, from.y, from.z,
          Math.cos(a) * rand(3, 7), rand(-2, 4), Math.sin(a) * rand(3, 7),
          { life: rand(0.25, 0.5), size: rand(0.5, 1.1), color: 0xff5ce8, alpha: 0.9, drag: 1.5 });
      }
    }
  },

  dart(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    w.projectiles.spawn('dart', f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, color: 0x6cff5c, knock: 4,
      status: { slow: 0.8, slowT: 1.2 },
    });
    w.audio?.play('dart');
  },

  blade(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) { // VIPER: hurls a forearm sword end-over-end — the blade
    // re-forges in her sheath a beat later (regrowWeapon)
    w.projectiles.spawn('blade', f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, color: 0x5aff2e, knock: 5,
      status: { slow: 0.85, slowT: 1 },
    });
    f.regrowWeapon?.('bladeR');
    w.audio?.play('slash');
  },

  spear(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) { // AEGIS: javelin throw — the lance reforges in his grip.
    // Launch from the throwing HAND: the far lance-tip anchor sits a
    // whole shaft-length away mid-whip (often across the body), which
    // read as the spear firing from the wrong arm.
    const grip = f.mech.joints.handR
      ? f.mech.joints.handR.getWorldPosition(new THREE.Vector3())
      : from;
    grip.addScaledVector(dir, 1.1); // just clear of the fingers
    w.projectiles.spawn('spear', f, grip, dir, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, color: 0x9fd8ff, knock: 12,
    });
    f.regrowWeapon?.('lance');
    w.effects.muzzleFlash(grip);
    w.audio?.play('whooshBig');
  },

  wave(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    // waves fly level, so cap the launch height at chest level — a
    // high lance/claw muzzle would skim over every target's head
    from.y = Math.min(from.y, f.pos.y + Math.min(f.height * 0.42, 3.6));
    w.projectiles.spawn('wave', f, from, new THREE.Vector3(dir.x, 0, dir.z).normalize(), {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, color: f.def.colors.glow, knock: 8, pierce: true, maxDist: 34,
    });
    w.audio?.play('wave');
  },

  shell(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    w.projectiles.spawn('shell', f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, splash: mv.splash, color: 0xff5040, knock: 10,
    });
    w.audio?.play('mortar');
    w.effects.muzzleFlash(from);
  },

  mortar(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    // lob along the facing; if an enemy is down the barrel, range the
    // arc to their distance (with velocity lead) — direction stays
    // manual. An AIMED lob drops the shell exactly on the crosshair.
    // COLOSSAL FORM: a giant's cannons throw giant ordnance — shells
    // scale up visually and hit harder/wider, and the default lob
    // ranges out with him
    const gf = Math.max(1, f.scale / (f.def.body.scale || 1));
    // his cannons ride high on his back, so a shell ranged onto a target
    // right on top of him drops almost straight down onto his own chest.
    // Floor the lob so the ordnance ALWAYS clears his footprint and lands
    // clearly out front — this is a siege gun, not a close-quarters lobber.
    const minLob = 11 * gf;
    const lobDist = Math.max(barrelDot > 0.8 ? flatDist : 25 * gf, minLob);
    const target = aimP
      ? new THREE.Vector3(aimP.x, 0, aimP.z)
      : new THREE.Vector3(
        f.pos.x + Math.sin(f.yaw) * lobDist, 0, f.pos.z + Math.cos(f.yaw) * lobDist
      ).add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2)));
    if (!aimP && e && barrelDot > 0.8) target.addScaledVector(e.vel, 1.15).setY(0);
    // twin cannons trade shots — doRanged toggled the side + mirrored clip
    const mFrom = f._altSide && anchors.muzzleL
      ? anchors.muzzleL.getWorldPosition(new THREE.Vector3()) : from;
    w.projectiles.spawn('mortar', f, mFrom, new THREE.Vector3(0, 1, 0), {
      dmg: mv.dmg * f.dmgMult() * (1 + (gf - 1) * 0.3),
      splash: mv.splash * (1 + (gf - 1) * 0.5),
      size: 1 + (gf - 1) * 0.55,
      // a tall, patient lob: the longer flight lifts the peak so it sails up
      // in a proper artillery arc instead of skimming off the high muzzle
      color: 0xffd23c, arcTo: target, arcTime: 1.8,
      knock: 14 * Math.sqrt(gf), launch: 7 * Math.sqrt(gf),
    });
    w.audio?.play('mortar', gf > 1.4 ? { pitch: 0.7, vol: 1 } : undefined);
  },

  lightning(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    w.projectiles.lightningZap(f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), chainRange: mv.chainRange, color: 0x8fe8ff,
    });
    w.audio?.play('zap');
  },

  railgun(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) {
    w.projectiles.railshot(f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), color: 0xff3838, knock: 12,
    });
    w.audio?.play('railgun');
    f.animator.addImpulse('shoulderR', [0.4, 0, 0], 30, 10);
  },

  shard(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors, muzzle }) { // GLACIER: a BARRAGE of icicles — a rapid scattered fan
    // of frozen spikes off the launcher instead of one lone shard
    const nIce = mv.count || 6;
    for (let i = 0; i < nIce; i++) {
      w.schedule(i * 0.055, () => {
        if (!f.alive) return;
        // re-read the live barrel each tick so the fan pours out of the lance
        // wherever the recoil/aim has carried it, not the t=0 snapshot
        const from2 = muzzle.getWorldPosition(new THREE.Vector3());
        const d2 = dir.clone();
        d2.x += rand(-0.055, 0.055);
        d2.y += rand(-0.015, 0.045);
        d2.z += rand(-0.055, 0.055);
        w.projectiles.spawn('shard', f, from2, d2.normalize(), {
          dmg: mv.dmg * f.dmgMult(), speed: mv.speed * rand(0.92, 1.1),
          color: 0x9be8ff, knock: 3,
          status: { slow: 0.85, slowT: 0.8 },
        });
        if (i % 2 === 0) w.audio?.play('shard');
      });
    }
  },

  hose(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors, dirFrom }) { // CRANKY: continuous high-pressure FIREHOSE stream —
    // ticks alternate cannons so BOTH water arms are visibly blasting
    f._hoseSide = !f._hoseSide;
    const side = f._hoseSide && anchors.muzzleL ? anchors.muzzleL : anchors.muzzleR;
    const hFrom = side.getWorldPosition(new THREE.Vector3());
    // each cannon sprays along ITS OWN barrel, so a splayed pair of water
    // guns throws two diverging streams instead of one doubled-up jet
    dir = dirFrom(side);
    // the jet is ONE coherent pressurized tube of water (scrolling-
    // noise stream mesh riding the ballistic arc); droplets and mist
    // are just the breakup spray around it
    // geyser two-shell tech: an aerated outer stream (foam ramp in the
    // shader) around a dense white heart running up the middle
    const jetEnd = w.effects.jet('hose' + f.playerIndex, hFrom, dir, {
      type: 'water', speed: 46, range: mv.range * 1.2, gravity: 30, r0: 0.26, r1: 1.0,
    });
    w.effects.jet('hosecore' + f.playerIndex, hFrom, dir, {
      type: 'watercore', speed: 46, range: mv.range * 1.15, gravity: 30, r0: 0.13, r1: 0.45,
    });
    w.effects.waterJet(hFrom, dir, 42);
    if (jetEnd && jetEnd.y <= 0.4) { // the stream hammers the dirt
      w.effects.splash(jetEnd, 4, 5, 0.9);
      if (Math.random() < 0.25) w.effects.puddle(jetEnd, { slime: false, life: 2.5 });
    }
    if (Math.random() < 0.35) w.audio?.play('wave');
    for (const t of w.fighters) {
      if (t === f || !t.alive) continue;
      const toT = t.center().sub(hFrom);
      const d = toT.length();
      if (d < mv.range && toT.normalize().dot(dir) > 0.8) {
        // the stream SHOVES as it soaks — splash where it lands
        t.takeHit(mv.dmg * f.dmgMult(), f, { knock: 3.4, srcPos: hFrom, soft: true });
        w.effects.splash(t.center(), 7, 7);
      }
    }
  },

  glitch(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) { // NULLBOT: a tumbling knot of corrupted voxels —
    // whatever it hits gets a piece of itself turned into glitch
    w.projectiles.spawn('glitch', f, from, dir, {
      dmg: mv.dmg * f.dmgMult(), speed: mv.speed, color: 0xff2df2, knock: 6,
      status: { glitch: 1 },
    });
    w.effects.glitchBurst(from, 6, 4, 0.7 * f.scale);
    w.audio?.play('zap');
  },

  bats(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) { // WRAITH: a swarm of hunting bats fans out and homes in
    const target = e && f.isAI ? e : (e && barrelDot > 0.6 ? e : null);
    for (let i = 0; i < (mv.count || 3); i++) {
      const a = f.yaw + (i - ((mv.count || 3) - 1) / 2) * 0.22;
      const bd = new THREE.Vector3(Math.sin(a), dir.y + 0.04, Math.cos(a));
      w.projectiles.spawn('bat', f, from, bd, {
        dmg: mv.dmg * f.dmgMult(), speed: (mv.speed || 24) * rand(0.9, 1.1),
        color: 0x8a2030, knock: 4, life: 3.2, wobble: 1.1,
        homing: target, retarget: !!target, turnRate: 2.4,
      });
    }
    w.audio?.play('howl', { vol: 0.4, pitch: 1.6 });
    w.effects.muzzleFlash(from);
  },

  groundpound(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) { // TITANUS: the RT is a point-blank seismic quake
    w.groundShockwave(f, f.pos, mv.radius, mv.dmg * f.dmgMult(), mv.knock, 0xffb43c);
    w.audio?.play('slam');
  },

  spikes(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) { // SAURION: a fan of BLACK quills thrown off both
    // hands/forearms (his own plumage — regrows, costs nothing)
    for (let i = 0; i < (mv.count || 3); i++) {
      const hand = i % 2 ? f.mech.joints.handL : f.mech.joints.handR;
      const armFrom = hand ? hand.getWorldPosition(new THREE.Vector3()) : from.clone();
      armFrom.y += 0.2;
      const d2 = dir.clone();
      d2.x += rand(-0.04, 0.04);
      d2.y += (i - 1) * 0.035 + rand(-0.01, 0.01);
      d2.z += rand(-0.04, 0.04);
      w.projectiles.spawn('quill', f, armFrom, d2, {
        dmg: mv.dmg * f.dmgMult(), speed: mv.speed * rand(0.95, 1.08),
        color: 0x16161c, trailColor: 0x8a2318, knock: 4,
      });
    }
    w.audio?.play('dart');
  },

  flea(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors }) { // JERRY: launches a live robo-shrimp flea that hunts on foot
    w.fleas.spawn(f, from, dir, { dmg: mv.dmg * f.dmgMult() });
    w.effects.muzzleFlash(from);
  },

  slime(w, f, mv, { from, dir, e, aimP, barrelDot, flatDist, anchors, dirFrom }) { // FROGGER: a sputtering STREAM of gel wads — a lead
    // glob followed by trailing spatter, all dripping goo in flight.
    // The four gunk guns trade shots — doRanged toggled the side + mirrored
    // clip; each cannon splays the aim along its OWN barrel axis (dirFrom).
    const a = f._altSide && anchors.muzzleL ? anchors.muzzleL : anchors.muzzleR;
    if (a !== anchors.muzzleR) {
      from = a.getWorldPosition(new THREE.Vector3());
      dir = dirFrom(a);
    }
    for (let i = 0; i < 3; i++) {
      const d2 = dir.clone();
      d2.x += rand(-0.045, 0.045); d2.y += rand(-0.015, 0.05); d2.z += rand(-0.045, 0.045);
      w.projectiles.spawn('glob', f, from, d2, {
        dmg: (i === 0 ? mv.dmg : mv.dmg * 0.12) * f.dmgMult(),
        speed: mv.speed * (1 - i * 0.13),
        splash: i === 0 ? mv.splash : 0,
        color: i === 0 ? 0x86d22e : 0x6cb022,
        knock: i === 0 ? 8 : 2,
        status: i === 0 ? { slow: 0.7, slowT: 1.4 } : null,
        size: 1 - i * 0.24,
        goop: true,
      });
    }
    w.effects.slime(from, 4, 4, dir); // muzzle splatter
    w.audio?.play('plasma');
  },
};
