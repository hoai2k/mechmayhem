// Per-mech special & ultimate implementations, dispatched by id from roster.
import * as THREE from 'three';
import { rand, clamp, clamp01, angleDiff, TAU } from '../core/utils.js';
import { t } from '../core/text.js';
import { GeyserFX } from './geyserfx.js';
import { FireTornadoFX } from './nadofx.js';
import { fireTint } from './flamefx.js';
import { TidalWaveFX } from './wavefx.js';
import { bakePoseShell } from './poseshell.js';
import { batTexture } from '../core/textures.js';
import { PERCH_BEATS } from '../mechs/animations.js';
// deliberate cycle with fighter.js (and a reach into game/ai.js): both are
// only touched at runtime, for SAURION's summoned raptor pack
import { Fighter } from './fighter.js';
import { AIController } from '../game/ai.js';
import { cloneMech } from '../mechs/factory.js';
import { warmEggAssets } from './eggs.js';
import { stillCasting, cast, eachEnemy, volley, timedUpdater, overlapsY } from './movekit.js';
// A HIT REACTION HAS TAKEN THE BODY: the states a blow puts a fighter into.
// A scheduled beat of an airborne move checks this rather than stillCasting,
// because the move's own cast window can legitimately expire before the body
// lands — what must cancel it is being hit, not the clock.
const HIT_STATES = new Set(['hitstun', 'launched', 'knockdown', 'getup', 'frozen', 'glitched', 'dead']);
function hitReacting(f) { return HIT_STATES.has(f.state); }
import { driveCannons } from './cannonaim.js';
import { faceRoar } from '../mechs/face.js';

const _v = new THREE.Vector3();
// scratch for bull-rush footfalls (consumed immediately, never retained)
const _rushFoot = new THREE.Vector3();

// ---- TRITONE's held gore charge (see goreCharge) ----
const GORE_DRAIN = 0.285;      // stamina/sec — a full bar buys ~3.5s of charging
const GORE_MAX = 8;            // hard ceiling, so an infinite tank still ends
const GORE_TURN = 1.5;         // rad/s of steering — a third of the walking servo
const GORE_DASH_COST = 0.12;   // stamina a mid-charge dash costs (a plain dash is 0.09)
const GORE_SURGE = 0.42;       // speed added per dash, as a fraction of the base run
const GORE_SURGE_MAX = 0.85;   // ...and the most that can be stacked at once
const GORE_SURGE_FADE = 1.1;   // seconds for one dash's worth of surge to bleed off

// Position helpers allocate a fresh Vector3 by default (safe to retain).
// Hot per-frame callers (inside addUpdater/schedule ticks) can pass `out`
// to reuse a scratch vector — ONLY when the result is consumed immediately
// and never stored across frames.
function fwd(f, dist = 1, y = 0, out = new THREE.Vector3()) {
  return out.set(
    f.pos.x + Math.sin(f.yaw) * dist,
    f.pos.y + y,
    f.pos.z + Math.cos(f.yaw) * dist
  );
}
// A special's spawn point. With no name it is the mech's PRIMARY barrel —
// muzzleR for almost everyone, or whatever roster `primaryMuzzle` names for a
// mech that carries its weapon in the other hand (GLACIER's ice lance), so a
// special leaves the same hardware the ranged attack does. Callers that pass a
// name are asking for that specific barrel (the alternating-side volleys) and
// still fall back to muzzleR when the build hasn't got it.
function muzzle(f, name, out = new THREE.Vector3()) {
  const a = f.mech.anchors[name || f.def.primaryMuzzle || 'muzzleR'] || f.mech.anchors.muzzleR;
  return a.getWorldPosition(out);
}
// ground aim point led by the victim's current velocity, for slow drops
// (artillery arcs, delayed pillars) that otherwise land where they WERE.
// Uses the victim's nearest image so artillery works across the arena seam.
function leadPos(f, e, t) {
  return new THREE.Vector3(
    f.pos.x + f.world.wrapDelta(e.pos.x - f.pos.x) + e.vel.x * t,
    0,
    f.pos.z + f.world.wrapDelta(e.pos.z - f.pos.z) + e.vel.z * t
  );
}

function aimDir(f, pitch = 0) {
  const e = f.nearestEnemy();
  // AI seeks its target; HUMANS shoot where they're pointing, with only a
  // vertical assist when a target is basically down the barrel
  if (e && f.isAI) {
    const m = muzzle(f);
    const c = e.center();
    return new THREE.Vector3(
      f.world.wrapDelta(c.x - m.x), c.y - m.y, f.world.wrapDelta(c.z - m.z)
    ).normalize();
  }
  const dir = new THREE.Vector3(Math.sin(f.yaw), pitch, Math.cos(f.yaw));
  if (e) {
    const m = muzzle(f);
    const c = e.center();
    const dxw = f.world.wrapDelta(c.x - m.x), dzw = f.world.wrapDelta(c.z - m.z);
    if (Math.abs(angleDiff(f.yaw, Math.atan2(dxw, dzw))) < 0.26) {
      dir.y = (c.y - m.y) / (Math.hypot(dxw, dzw) || 1);
    }
  }
  return dir.normalize();
}

// A SHOCKWAVE THAT TRAVELS (KONGA's APEX POUND). world.groundShockwave is an
// instant sphere — right for a slam whose whole radius lands on one frame,
// wrong for a wave you are supposed to be able to JUMP. This one is a real
// expanding front: a radius growing at `speed`, catching each victim exactly
// as it reaches them, once. Two gates make it a thing in the FLOOR rather
// than a sphere with a delay — the victim must be GROUNDED at the moment the
// front arrives (so a jump is a genuine dodge, and someone already airborne is
// simply missed) and must be on roughly the same level as the fist that made
// it (so a wave rolling past a building does not sweep a mech off its roof).
function poundWave(w, f, origin, { radius, speed = 30, dmg, knock = 12, color = 0xffa432 }) {
  const at = origin.clone();
  w.effects.rings.spawn(at, { from: 1.2, to: radius * 2, dur: radius / speed, color, y: 0.35 });
  const hit = new Set();
  let r = 0, puff = 0;
  w.addUpdater((dt) => {
    r = Math.min(radius, r + speed * dt);
    // dust kicked up along the front itself, so the wave is visibly SOMEWHERE
    puff -= dt;
    if (puff <= 0 && r < radius) {
      puff = 0.05;
      const a = rand(TAU);
      w.effects.dustPuff(_v.set(at.x + Math.cos(a) * r, at.y + 0.1, at.z + Math.sin(a) * r), 4);
    }
    eachEnemy(w, f, at, r, (e, d) => {
      if (hit.has(e)) return;
      hit.add(e);                    // reached: this wave is done with them
      if (!e.grounded || Math.abs(e.pos.y - at.y) > 3) return;   // jumped it
      const falloff = 1 - 0.5 * (d / radius);
      e.takeHit(dmg * falloff, f, {
        // LAUNCH is the point: it puts them on their back, which is what the
        // next fist is for (see rule 3 in apexPound).
        knock: knock * falloff, launch: 4, srcPos: at, heavy: true,
      });
      w.effects.impactSparks(e.center(), color, 10, 8);
    }, (e) => e.hitRadius * 0.5);
    return r < radius;
  });
}

// ============================= SPECIALS =============================

export const SPECIALS = {

  // VULCAN: homing micro-missile volley
  missileVolley(f, sp) {
    cast(f, 'shoot', { stateT: (dur) => dur * 0.7 });
    const target = f.nearestEnemy();
    let side = 0;
    volley(f.world, f, sp.count, 0.08, () => {
      // ripple-fire ALTERNATING shoulder pods (both routes carry podL/podR)
      // so the salvo reads as a twin-rack launch, not one pod doing all the
      // work; a model with only one pod keeps firing from it.
      const pod = f.mech.anchors[side++ % 2 ? 'podR' : 'podL'] || f.mech.anchors.podL;
      const origin = pod
        ? pod.getWorldPosition(new THREE.Vector3())
        : muzzle(f);
      const d = new THREE.Vector3(rand(-0.35, 0.35), rand(0.7, 1), rand(-0.35, 0.35)).normalize();
      f.world.projectiles.spawn('missile', f, origin, d, {
        dmg: sp.dmg * f.dmgMult(), speed: 30, splash: 2.8, color: 0xff7040,
        homing: target, retarget: true, turnRate: 4.8, life: 4,
      });
      f.sfx('missile');
    });
  },


  // VIPER: BLADE CYCLONE — IG-11 doctrine: the legs keep WALKING straight
  // ahead while everything above the waist spins free, both swords thrown
  // out level — a striding whirlwind that saws repeatedly through anything
  // it overlaps
  bladeCyclone(f, sp) {
    const w = f.world;
    const DUR = 1.35;
    cast(f, 'viperWhirl', { stateT: DUR + 0.15 });
    // post-pose torso spin: the waist is a free bearing — head and blades
    // whirl while the gait below stays forward
    f._spinFx = { joint: 'torso', axis: 'y', rate: 21, dur: DUR, t: 0, acc: 0 };
    f.sfx('dash');
    const hitAt = new Map(); // per-victim saw cadence: re-hit every 0.22s
    const ticks = Math.floor(DUR / 0.05);
    for (let i = 1; i <= ticks; i++) {
      w.schedule(i * 0.05, () => {
        if (!f.alive || f.state !== 'special') return;
        const t = i * 0.05;
        const spd = f.def.stats.speed * 1.7;
        f.vel.x = Math.sin(f.yaw) * spd;
        f.vel.z = Math.cos(f.yaw) * spd;
        // the spinning edges shed a green shimmer ring
        for (const bn of ['bladeL', 'bladeR']) {
          const a = f.mech.anchors[bn];
          if (a && i % 2 === 0) {
            a.getWorldPosition(_v);
            w.effects.glows.emit(_v.x, _v.y, _v.z, 0, 0, 0,
              { life: 0.16, size: 0.7 * f.scale, color: 0x5aff2e, alpha: 0.85, grow: -1 });
          }
        }
        // the swords are thrown out LEVEL at his own body height — jumping
        // clear of the saw is a real read, not something the radius ignores
        eachEnemy(w, f, f.pos, 3.6 * f.scale, (e) => {
          if ((hitAt.get(e) ?? -1) <= t - 0.22 && overlapsY(e, f.pos.y, f.height)) {
            hitAt.set(e, t);
            e.takeHit(sp.dmg * f.dmgMult(), f, { knock: 5, srcPos: f.pos });
            f.sfx('slash');
            w.engine.addHitStop(0.03);
          }
        });
      });
    }
  },


  // RHINO: bull rush — gallops forward on all fours as long as B is HELD,
  // up to 5s. The run ENDS the moment it connects with someone (one clean
  // launch), or when the button is released.
  bullRush(f, sp) {
    cast(f, 'chargeLean', { stateT: 5.2 }); // held-charge ceiling; ended early on release
    f.sfx('charge');
    f._chargeT = 0;
    f._rushStep = undefined;   // first tick only records the gait phase
    const endRush = (recovery) => {
      f._charging = false;
      f.animator.stop();
      f.setState('attack', recovery);
    };
    const tick = () => {
      if (!f.alive || f.state !== 'special') { f._charging = false; return; }
      const dt = 0.05;
      f._chargeT += dt;
      // always commit to at least a short lunge (a tap still connects), then
      // keep charging as long as B is HELD (specialHeld, not the one-frame
      // edge), to a 5s cap
      const holding = (f.intent.specialHeld || f._chargeT < 0.85) && f._chargeT < 5;
      const spd = f.def.stats.speed * 3.1;
      f.vel.x = Math.sin(f.yaw) * spd;
      f.vel.z = Math.cos(f.yaw) * spd;
      // gentle steer toward a nearby enemy (AI only — players aim the run)
      if (f.isAI) {
        const e0 = f.nearestEnemy();
        if (e0 && f.pos.distanceTo(e0.pos) < 40) {
          f.targetYaw = f.yawTo(e0);
          f.yaw += clamp(angleDiff(f.yaw, f.targetYaw), -0.05, 0.05);
        }
      }
      f.world.effects.dustPuff(f.pos, 2, 0x9a9088);
      // FOOTFALLS. The legs under the charge are the animator's speed-matched
      // run cycle, so its gait phase says exactly when a foot plants (every
      // half cycle). Hang the stomp off that instead of a timer and the dust,
      // the thud and the shake land ON the step at any charge speed.
      const ph = f.animator.phase || 0;
      const step = Math.floor(ph / Math.PI);
      if (f._rushStep !== undefined && step !== f._rushStep) {
        const foot = f.mech.joints[step % 2 ? 'ankleL' : 'ankleR'];
        const at = foot ? foot.getWorldPosition(_rushFoot) : f.pos;
        f.world.effects.dustPuff(at, 7, 0x9a9088);
        f.world.effects.addShake(0.12);
        f.sfx('land');
      }
      f._rushStep = step;
      for (const e of f.world.fighters) {
        if (e === f || !e.alive) continue;
        const dx = f.world.wrapDelta(e.pos.x - f.pos.x), dz = f.world.wrapDelta(e.pos.z - f.pos.z);
        // the horn rides at HIS body height and no higher — jump the charge
        // and it passes under you
        if (Math.hypot(dx, dz) < 3.6 * f.scale && overlapsY(e, f.pos.y, f.height)) {
          e.takeHit(sp.dmg * f.dmgMult(), f, { knock: sp.knock, launch: 8, srcPos: f.pos, heavy: true });
          f.world.engine.addHitStop(0.08);
          f.world.effects.addShake(0.5);
          endRush(0.45); // impact ends the run
          return;
        }
      }
      if (holding) f.world.schedule(dt, tick);
      else endRush(0.3); // released / timed out
    };
    f._charging = true;
    f.world.schedule(0.05, tick);
  },

  // TEMPEST: summons a crackling storm cell a short way in front of him —
  // a dark cloud gathers overhead, then lightning hammers DOWN out of it at
  // the ground and at anyone caught underneath
  staticField(f, sp) {
    cast(f, 'burst', {
      stateT: (dur) => dur * 0.85,
      onFire: () => {
        const w = f.world;
        // THE STORM IS THROWN FORWARD, BUT NOT A WHOLE RADIUS FORWARD. It is a
        // zoning tool and should land in front of him rather than on his own
        // head — but at `radius * 0.95` the disc's trailing edge sat 0.4 units
        // BEHIND the caster, which means it covered a forward cone and nothing
        // else. Mapped at radius 8 with the victim pinned on a grid
        // (tools/scratch/specialmap.mjs): hits out to 12 dead ahead, 8 at 60
        // degrees off, and NOTHING at 90, 135 or 180 — not even at two units,
        // standing on his toes. A fight is mostly circling at melee range, so
        // most casts were geometrically incapable of connecting.
        // At `lead` 0.45 the same disc covers 4.4 behind him to 11.6 ahead and
        // reaches 7 units to either side of where he stands. Same area, same
        // damage, placed where the fight is; roster can override per mech.
        const center = fwd(f, sp.radius * (sp.lead ?? 0.45));
        center.y = 0;
        const cloudY = 13;
        // the storm cloud: a heavy slab of churning dark smoke hanging over
        // the area — emitted in two waves so it lingers through the strikes
        for (const delay of [0, 0.45]) {
          w.schedule(delay, () => {
            if (!f.alive) return;
            for (let i = 0; i < 34; i++) {
              const a = rand(Math.PI * 2), r = Math.sqrt(Math.random()) * sp.radius * 0.9;
              w.effects.smoke.emit(center.x + Math.cos(a) * r, cloudY + rand(-1.4, 1.8), center.z + Math.sin(a) * r,
                rand(-1.4, 1.4), rand(-0.3, 0.5), rand(-1.4, 1.4),
                { life: rand(1.5, 2.3), size: rand(5, 8.5), color: 0x10141d, alpha: 0.95, grow: 1.3 });
            }
            // static shimmer inside the cloud
            for (let i = 0; i < 10; i++) {
              const a = rand(Math.PI * 2), r = rand(0, sp.radius * 0.7);
              w.effects.glows.emit(center.x + Math.cos(a) * r, cloudY + rand(-1, 1), center.z + Math.sin(a) * r,
                0, 0, 0, { life: rand(0.2, 0.45), size: rand(1.5, 3), color: 0x9fdcff, alpha: 0.9 });
            }
          });
        }
        w.effects.rings.spawn(center, { from: 1, to: sp.radius * 2, dur: 0.55, color: 0x53e8ff, y: 0.5 });
        f.sfx('thunder');
        // coil show on the caster
        for (const cn of ['coilL', 'coilR']) {
          if (f.mech.anchors[cn]) {
            const p = f.mech.anchors[cn].getWorldPosition(new THREE.Vector3());
            w.effects.lightning.spawn(p, p.clone().add(new THREE.Vector3(rand(-4, 4), rand(2, 5), rand(-4, 4))), { color: 0x8fe8ff });
          }
        }
        // bolts hammer down over ~0.5s: every caught bot eats a strike from
        // the cloud, plus scattered ground strikes to sell the storm
        const bolts = [];
        eachEnemy(w, f, center, sp.radius, (e) => bolts.push({ victim: e }));
        for (let i = 0; i < 7; i++) {
          const a = rand(Math.PI * 2), r = rand(1.5, sp.radius * 0.9);
          bolts.push({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r });
        }
        bolts.forEach((b, i) => {
          w.schedule(0.05 + i * 0.08, () => {
            if (!f.alive) return;
            const gx = b.victim ? b.victim.pos.x : b.x;
            const gz = b.victim ? b.victim.pos.z : b.z;
            const top = new THREE.Vector3(gx + rand(-1, 1), cloudY, gz + rand(-1, 1));
            const ground = new THREE.Vector3(gx, 0.1, gz);
            // a hot beam core wrapped in two jagged arcs reads as a REAL bolt
            w.effects.lightning.spawn(top, ground, { color: 0xeaffff, dur: 0.22, jag: 3.2, thick: 0.24 });
            w.effects.lightning.spawn(top, ground, { color: 0x9fdcff, dur: 0.26, jag: 2.2, thick: 0.12 });
            w.effects.glows.emit(gx, 1, gz, 0, 0, 0, { life: 0.25, size: 6, color: 0xbfefff, alpha: 1 });
            w.effects.rings.spawn(ground, { from: 0.4, to: 4.2, dur: 0.3, color: 0x9fdcff, y: 0.25 });
            f.sfx('zap');
            w.effects.addShake(0.3);
            if (b.victim && b.victim.alive) {
              b.victim.takeHit(sp.dmg * f.dmgMult(), f, { knock: 14, srcPos: center, status: { slow: 0.6, slowT: 1.6 } });
              // ELECTRIFIED: the jolt locks their servos for a beat — a real
              // stun on top of the slow, with the charge crackling off them
              if (b.victim.alive && b.victim.state !== 'launched' && b.victim.state !== 'frozen') {
                b.victim.setState('hitstun', 0.85);
                b.victim.animator.addImpulse('torso', [rand(-0.3, 0.3), 0, rand(-0.3, 0.3)], 46, 8);
              }
              w.effects.staticCling(b.victim, 1.6); // charge crackles off them
            }
          });
        });
      },
    });
  },

  // FENRIR: lunar pounce
  pounce(f, sp) {
    cast(f, 'lunge', { stateT: 0.75 });
    f.sfx('howl');
    const e = f.nearestEnemy();
    if (e && f.isAI) {
      // AI leads the landing point — the leap is airborne ~0.7s.
      // Humans leap where THEY aim (doSpecial already applied aimYaw).
      const px = e.pos.x + e.vel.x * 0.5, pz = e.pos.z + e.vel.z * 0.5;
      f.yaw = f.targetYaw = Math.atan2(px - f.pos.x, pz - f.pos.z);
    }
    // range-clamp onto a target that's already down the aim line
    const onLine = e && Math.abs(angleDiff(f.yaw, f.yawTo(e))) < 0.45;
    const dist = onLine ? Math.min(sp.leap, f.pos.distanceTo(e.pos)) : sp.leap;
    f.vel.x = Math.sin(f.yaw) * dist * 1.6;
    f.vel.z = Math.cos(f.yaw) * dist * 1.6;
    f.vel.y = 12;
    f.grounded = false;
    let landed = false;
    const check = () => {
      if (landed || !f.alive) return;
      // KNOCKED OUT OF THE AIR IS THE END OF IT: a launcher mid-pounce used to
      // put him down and then, the moment he touched the ground, fire the full
      // shockwave off the knockdown and setState('normal') over it — the
      // getup and its iframes erased, the punish turned into a buff. (Not
      // stillCasting: the 0.75s cast can expire before a 0.7s airtime lands.)
      if (hitReacting(f)) { landed = true; return; }
      if (f.grounded) {
        landed = true;
        // the pounce is Saurion's block-breaker: only THIS hit carries his
        // guardBreak chance (normal swings block like anyone else's)
        f.world.groundShockwave(f, f.pos, 5.5 * f.scale, sp.dmg * f.dmgMult(), 16, 0x6cd8ff, false,
          false, { guardBreak: f.def.stats.guardBreak || 0 });
        f.sfx('slam');
        f.setState('normal');
      } else {
        f.world.schedule(0.05, check);
      }
    };
    f.world.schedule(0.25, check);
  },

  // COLOSSUS: seize the nearest bot in front of him, hoist them clean over
  // his head, and HURL them across the arena
  grabThrow(f, sp) {
    const w = f.world;
    // COLOSSAL FORM: at giant size the grab is ONE-handed (the palm alone
    // dwarfs the victim) and the hurl carries proportionally farther
    const gf = Math.max(1, f.scale / (f.def.body.scale || 1));
    if (gf > 1.4) f._oneArmLift = true;
    cast(f, 'grabReach', { stateT: 1.6 });
    f.sfx('servo');
    w.schedule(0.2, () => {
      if (!f.alive || f.state !== 'special') return;
      // whoever's in the hands: close, in the front cone, near ground level
      let prey = null, best = Infinity;
      for (const v of w.fighters) {
        if (v === f || !v.alive || v.iframes > 0) continue;
        const dx = w.wrapDelta(v.pos.x - f.pos.x), dz = w.wrapDelta(v.pos.z - f.pos.z);
        const d = Math.hypot(dx, dz);
        if (d > (sp.range || 4.5) * f.scale + v.hitRadius) continue;
        if (Math.abs(angleDiff(f.yaw, Math.atan2(dx, dz))) > 0.85) continue;
        if (Math.abs(v.pos.y - f.pos.y) > 4) continue;
        if (d < best) { prey = v; best = d; }
      }
      if (!prey) {
        // grabbed a fistful of air — recover, and the slam isn't SPENT:
        // a whiffed grab keeps only a token cooldown, not the full one
        f.animator.stop();
        f.setState('attack', 0.35);
        f.specialCd = Math.min(f.specialCd, 0.75);
        return;
      }
      // GOT ONE — hoist them overhead. The victim's own update pins them
      // every FRAME via the carried state (smoothstep rise — the old
      // 0.05s schedule-tick pinning let gravity sag between ticks: jiggle)
      const LIFT = 0.55;
      f.animator.play('liftHold');
      w.engine.addHitStop(0.06);
      prey.takeHit(sp.dmg * 0.3 * f.dmgMult(), f, { knock: 0, srcPos: f.pos, heavy: true, silent: true });
      prey.setState('launched', 3);
      prey.animator.play('launched');
      prey.iframes = LIFT + 0.2; // the cargo can't be sniped mid-lift
      prey.grounded = false;
      prey._carry = {
        by: f, t: LIFT + 0.4,
        x0: prey.pos.x, y0: prey.pos.y, z0: prey.pos.z, riseT: 0,
      };
      // THE THROW — far and flat
      w.schedule(LIFT + 0.02, () => {
        if (!f.alive || f.state !== 'special') {
          prey._carry = null;
          prey.group.rotation.x = 0; // lift broken: unwind the slam roll
          prey.group.rotation.z = 0;
          return;
        }
        f.animator.play('throwHeave');
        f.setState('special', 0.5);
        if (prey.alive) {
          prey._carry = null;
          f.carryPoint(prey, prey.pos); // launched straight out of the palms
          prey.grounded = false;
          prey.iframes = 0; // the throw itself always lands
          prey.takeHit(sp.dmg * 0.7 * f.dmgMult(), f, { knock: 0, srcPos: f.pos, heavy: true });
          prey.setState('launched', 3);
          prey.animator.play('launched');
          const tvx = Math.sin(f.yaw) * (sp.throw || 36) * gf;
          const tvz = Math.cos(f.yaw) * (sp.throw || 36) * gf;
          prey.vel.x = tvx;
          prey.vel.z = tvz;
          prey.vel.y = 13 * Math.sqrt(gf);
          prey.grounded = false;
          // hold the throw momentum through the flight — air-control drag
          // would otherwise dump them a few steps away instead of FAR.
          // The flat body-slam roll unwinds when the flight ends.
          let flyT = 0;
          const fly = () => {
            if (!prey.alive || prey.grounded || flyT > 1.3 * Math.sqrt(gf)) {
              prey.group.rotation.x = 0;
              prey.group.rotation.z = 0;
              return;
            }
            flyT += 0.05;
            prey.vel.x = tvx;
            prey.vel.z = tvz;
            w.schedule(0.05, fly);
          };
          w.schedule(0.05, fly);
          f.sfx('whooshBig');
          w.effects.addShake(0.6);
          w.engine.addHitStop(0.1);
        }
        w.schedule(0.5, () => { if (f.state === 'special') f.setState('normal'); });
      });
    });
  },

  // KONGA: HEAD SLAM. Not a throw — a PIKEDRIVER. He takes whoever is in
  // front of him by the skull with the nearer fist, lifts them clean off the
  // floor upside down, and drives them head-first into the ground.
  //
  // The size of the victim picks the grip, which is the only branch in it:
  //   ONE HAND, BY THE HEAD — anything he can palm. The fist closes on the
  //     crown and the body hangs from it inverted (Fighter._carryHead), so
  //     the head is the lowest point of the arc and the head is what lands.
  //   BOTH HANDS, BODY SLAM — a victim as big as he is cannot be held by the
  //     skull, so he takes them across both palms exactly as colossus does
  //     (the flat roll, the same carry) and then, instead of hurling them
  //     downrange, drives the whole body straight down.
  // Either way they finish ON THEIR BACK: the landing is a real launch into
  // the floor with `_onBack` set, so the ordinary rollover takes over — the
  // long knockdown, not the quick one.
  headSlam(f, sp) {
    const w = f.world;
    const LIFT = 0.55, DRIVE = 0.16;
    cast(f, 'grabReach', { stateT: 2.0 });
    f.sfx('servo');
    w.schedule(0.2, () => {
      if (!f.alive || f.state !== 'special') return;
      let prey = null, best = Infinity;
      for (const v of w.fighters) {
        if (v === f || !v.alive || v.iframes > 0 || f.isAllyOf(v)) continue;
        const dx = w.wrapDelta(v.pos.x - f.pos.x), dz = w.wrapDelta(v.pos.z - f.pos.z);
        const d = Math.hypot(dx, dz);
        if (d > (sp.range || 4.2) * f.scale + v.hitRadius) continue;
        if (Math.abs(angleDiff(f.yaw, Math.atan2(dx, dz))) > 0.85) continue;
        if (Math.abs(v.pos.y - f.pos.y) > 4) continue;
        if (d < best) { prey = v; best = d; }
      }
      if (!prey) {
        f.animator.stop();
        f.setState('attack', 0.35);
        f.specialCd = Math.min(f.specialCd, 0.75);  // a whiff is not a spent slam
        return;
      }
      // BIG ENOUGH TO NEED BOTH ARMS? Measured against his own frame rather
      // than a list of names, so a mech resized at runtime (colossus' ult)
      // is answered by what it IS at that moment.
      // "as big as he is", literally: anything shorter than him is palmed by
      // the skull. (0.85 of his height made a 6.0-unit viper 'large' against
      // a 6.6-unit ape, which is most of the roster — the two-hand slam is
      // meant to be the exception, not the default.)
      const twoHanded = prey.height > f.height || prey.hitRadius > f.hitRadius * 1.25;
      f._carryHead = !twoHanded;
      if (!twoHanded) {
        // WHICH FIST: the one already nearer the victim, in his own frame —
        // a cross-body grab with the far arm reads as a reach through himself
        const dx = w.wrapDelta(prey.pos.x - f.pos.x), dz = w.wrapDelta(prey.pos.z - f.pos.z);
        const side = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw);  // + = his right
        f._oneArmLift = side >= 0 ? 'R' : 'L';
      }
      f.animator.play('liftHold');
      w.engine.addHitStop(0.06);
      prey.takeHit(sp.dmg * 0.25 * f.dmgMult(), f, { knock: 0, srcPos: f.pos, heavy: true, silent: true });
      prey.setState('launched', 3.2);
      prey.animator.play('launched');
      prey.iframes = LIFT + 0.3;
      prey.grounded = false;
      prey._carry = {
        by: f, t: LIFT + 0.5, roll: twoHanded ? 1.45 : Math.PI,
        x0: prey.pos.x, y0: prey.pos.y, z0: prey.pos.z, riseT: 0,
      };
      f.sfx('hitHeavy');

      // THE DRIVE — straight down, at the floor in front of him
      w.schedule(LIFT + 0.02, () => {
        const clear = () => { f._carryHead = false; f._oneArmLift = false; };
        if (!f.alive || f.state !== 'special' || !prey.alive) {
          prey._carry = null;
          prey.group.rotation.x = 0;
          prey.group.rotation.z = 0;
          clear();
          return;
        }
        f.animator.play('kongaSlam');
        f.setState('special', DRIVE + 0.55);
        prey._carry = null;
        prey.iframes = 0;                       // the slam itself always lands
        const impact = fwd(f, 2.2 * f.scale);
        impact.y = 0;
        const from = prey.pos.clone();
        // ridden down over DRIVE seconds rather than teleported, so the arm
        // and the body arrive together and the eye can follow the arc
        let t = 0;
        const drive = () => {
          if (!prey.alive || !f.alive) { clear(); return; }
          t = Math.min(1, t + 0.05 / DRIVE);
          const k = t * t;                       // accelerating into the floor
          prey.pos.set(
            from.x + (impact.x - from.x) * k,
            from.y + (0 - from.y) * k,
            from.z + (impact.z - from.z) * k
          );
          prey.vel.set(0, 0, 0);
          prey.grounded = false;
          // held inverted all the way in — the head leads
          prey.group.rotation.z = twoHanded ? 1.45 : Math.PI;
          if (t < 1) { w.schedule(0.05, drive); return; }

          // IMPACT
          prey.group.rotation.x = 0;
          prey.group.rotation.z = 0;
          prey.takeHit(sp.dmg * 0.75 * f.dmgMult(), f, {
            knock: 0, srcPos: f.pos, heavy: true,
          });
          // …and they are left ON THEIR BACK: a short bounce with `_onBack`
          // set hands them to the rollover, which is the long stay on the
          // floor rather than the quick knockdown.
          prey._onBack = true;
          prey.vel.set(0, 2.5, 0);
          prey.grounded = false;
          prey.setState('launched', 1.2);
          prey.animator.play('launched');
          w.groundShockwave(f, impact, (sp.radius || 6) * f.scale,
            sp.dmg * 0.3 * f.dmgMult(), sp.knock || 14, f.def.colors.glow || 0xffa432);
          w.effects.explosion(impact, 2.4, { color: 0x9a8878, smoke: true, sparks: false });
          w.effects.dustPuff(impact, 22, 0x8c8266);
          w.effects.addShake(0.9);
          w.engine.addHitStop(0.12);
          f.sfx('slam');
          f.sfx('explosionBig');
          faceRoar(f, 0.6);
          clear();
          w.schedule(0.5, () => { if (f.state === 'special') f.setState('normal'); });
        };
        w.schedule(0.05, drive);
      });
    });
  },



  // WRAITH: Ghost Protocol — projects a white spectre of his body that
  // glides forward hurting everything it passes through for as long as B is
  // HELD (the robot stands locked); on release he teleports INTO the ghost:
  // his player sees a zip forward, everyone else sees the spectre solidify
  ghostWalk(f, sp) {
    const w = f.world;
    cast(f, 'aim', { stateT: (sp.duration || 5) + 0.4, speed: 0.5 });
    f.sfx('cloak');

    // build the spectre: bake the current pose into a throwaway shell (see
    // poseshell.js — the SkinnedMesh trap is documented there), then glide the
    // shell forward. One flat additive material for the whole body: this one
    // is meant to read as a projection, not as him.
    const gmat = new THREE.MeshBasicMaterial({
      color: 0xdfefff, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const shell = bakePoseShell(f.mech.group, { material: gmat, normals: false });
    const ghost = shell.group;
    w.scene.add(ghost);
    w.effects.rings.spawn(f.pos, { from: 3, to: 0.5, dur: 0.4, color: 0xbfe8ff, y: f.height * 0.5 });

    const dirX = Math.sin(f.yaw), dirZ = Math.cos(f.yaw);
    const ox = f.pos.x, oz = f.pos.z; // spectre walks from the CAST spot —
    // even if the body gets shoved mid-channel, he teleports to the ghost
    const speed = sp.speed || 17;
    let traveled = 0;
    let t = 0;
    const victims = new Set();
    f._charging = true; // reuses the AI hold-the-button behavior
    const gx = () => ox + dirX * traveled;
    const gz = () => oz + dirZ * traveled;

    const dropGhost = () => { shell.dispose(); gmat.dispose(); };

    const finish = () => {
      f._charging = false;
      // the spectre solidifies — the robot zips into its position
      const tx = gx(), tz = gz();
      w.effects.dashTrail(f.pos, 0xbfe8ff, f.scale * 1.6);
      f.pos.x = tx;
      f.pos.z = tz;
      w.effects.dashTrail(f.pos, 0xbfe8ff, f.scale * 1.6);
      w.effects.rings.spawn(f.pos, { from: 0.5, to: 4, dur: 0.35, color: 0xbfe8ff, y: 1 });
      f.sfx('dash');
      dropGhost();
      f.iframes = 0.35; // re-materialize grace
      f.animator.stop();
      f.setState('attack', 0.25);
    };

    const tick = () => {
      if (!f.alive || f.state !== 'special') {
        f._charging = false;
        dropGhost();
        return;
      }
      const dt = 0.05;
      t += dt;
      // min commit so a tap still projects a short walk; hold extends to cap
      const holding = (f.intent.specialHeld || t < 0.9) && t < (sp.duration || 5) && traveled < 58;
      f.vel.x = 0;
      f.vel.z = 0;
      traveled += speed * dt;
      ghost.position.set(dirX * traveled, 0, dirZ * traveled);
      // spectral wake
      w.effects.glows.emit(gx() + rand(-0.5, 0.5), f.pos.y + rand(1, f.height * 0.8), gz() + rand(-0.5, 0.5),
        0, 1.5, 0, { life: 0.35, size: rand(1, 1.8), color: 0xbfe8ff, alpha: 0.55 });
      // the spectre rips through anyone it overlaps
      for (const e2 of w.fighters) {
        if (e2 === f || !e2.alive || victims.has(e2)) continue;
        const dx = w.wrapDelta(e2.pos.x - gx()), dz = w.wrapDelta(e2.pos.z - gz());
        if (Math.hypot(dx, dz) < 3.4 * f.scale && Math.abs(e2.pos.y - f.pos.y) < 4) {
          victims.add(e2);
          e2.takeHit(sp.dmg * f.dmgMult(), f, { knock: 6, srcPos: new THREE.Vector3(gx(), e2.pos.y, gz()) });
          w.effects.impactSparks(e2.center(), 0xbfe8ff, 12, 8);
          f.sfx('slash');
        }
      }
      if (holding) w.schedule(dt, tick);
      else finish();
    };
    w.schedule(0.05, tick);
  },

  // INFERNO: napalm carpet
  napalm(f, sp) {
    cast(f, 'shoot', { stateT: (dur) => dur * 0.7 });
    volley(f.world, f, sp.patches, 0.12, (i) => {
      const pos = fwd(f, 6 + i * 4.5);
      pos.y = 0;
      f.world.addFirePatch(f, pos, 3, sp.duration, sp.dmg);
      f.sfx('flame');
    });
  },

  // CRANKY: water column erupts under the target — a bubbling warning patch
  // telegraphs the spot first (evadable), then a full layered water sim
  // (GeyserFX: shader column shells + droplet crown + mist + base surge)
  // roars for sp.duration seconds before draining back down
  geyser(f, sp) {
    const WARN = 0.85; // telegraph long enough to sidestep
    cast(f, 'castRaise', {
      stateT: (dur) => dur * 0.85,
      onFire: () => {
        const w = f.world;
        const e = f.nearestEnemy();
        const target = e ? leadPos(f, e, WARN + 0.45) : fwd(f, 14);
        target.y = 0;
        f.sfx('cast');
        // the sim owns telegraph + eruption + collapse visuals; total show
        // length = warn + sustain + ~0.95s collapse = sp.duration. The
        // scald opts arm the world's damage tick: anyone in the column
        // keeps taking hits for the whole eruption
        const COLUMN = 22;                 // the water's own height
        w.spawnGeyser(
          new GeyserFX(w.scene, w.effects, target, {
            height: COLUMN, radius: 1.5, warn: WARN,
            sustain: (sp.duration || 6) - WARN - 0.95,
            boilRadius: sp.radius * 0.4,
          }),
          { owner: f, dmg: sp.dmg, radius: sp.radius, launch: sp.launch });
        // damage: one big hit at the blowout moment, same as always
        w.schedule(WARN, () => {
          f.sfx('wave');
          f.sfx('explosionBig');
          eachEnemy(w, f, target, sp.radius, (v) => {
            // the blowout reaches as high as the water goes and no higher —
            // it's a tall column, so this only spares someone truly above it
            if (!overlapsY(v, target.y, COLUMN)) return;
            v.takeHit(sp.dmg * f.dmgMult(), f, { knock: 5, launch: sp.launch, srcPos: target, heavy: true });
            v.applySoak?.(2.4); // drenched: dripping frame, half speed
          }, (v) => v.hitRadius * 0.5);
        });
      },
    });
  },

  // SAURION: raptor pounce — a HIGH bird-of-prey kill-leap. The latch only
  // sticks if he comes down ON TOP of the victim (high on their body);
  // then he perches on them, feet clamped in, hammering down fast pecks.
  // Landing on dirt = just a crouch recovery, zero damage.
  sickleRush(f, sp) {
    const w = f.world;
    const e = f.nearestEnemy();
    cast(f, 'pounceLeap', { stateT: 2.2 });
    f.iframes = 0.4;
    f.sfx('jump');
    // tall ballistic pounce — high enough to drop onto a mech's shoulders
    const VY = 21;
    const T = (2 * VY) / 34; // ~1.24s airtime
    const maxLeap = sp.leap || 44;
    let dist = maxLeap;
    if (e && f.isAI) {
      // AI leads the victim; humans pounce along their own facing
      const lead = leadPos(f, e, T * 0.85);
      const dx = w.wrapDelta(lead.x - f.pos.x), dz = w.wrapDelta(lead.z - f.pos.z);
      f.yaw = f.targetYaw = Math.atan2(dx, dz);
      dist = Math.min(maxLeap, Math.hypot(dx, dz));
    } else if (e && Math.abs(angleDiff(f.yaw, f.yawTo(e))) < 0.45) {
      // aimed at them already: shorten the leap to come down ON the target
      const dx = w.wrapDelta(e.pos.x - f.pos.x), dz = w.wrapDelta(e.pos.z - f.pos.z);
      dist = Math.min(maxLeap, Math.hypot(dx, dz) + e.vel.length() * 0.3);
    }
    let vx0 = Math.sin(f.yaw) * dist / T;
    let vz0 = Math.cos(f.yaw) * dist / T;
    f.vel.x = vx0;
    f.vel.z = vz0;
    f.vel.y = VY;
    f.grounded = false;
    let done = false;

    const latch = (prey) => {
      // TALONS IN — he lands on their upper body and PERCHES there, feet
      // gripping high on the frame, tearing in with quick raptor pecks
      const RIDE = 0.72;
      cast(f, 'biteLatch', { stateT: RIDE + 0.3 });
      f.iframes = 0.5;
      f.sfx('slash');
      w.engine.addHitStop(0.09);
      prey.takeHit(sp.dmg * f.dmgMult(), f, { knock: 2, srcPos: f.pos, heavy: true });
      prey.applyStatus({ burn: sp.bleed, burnT: 2.4 });
      const ang = f.yaw; // rides facing his leap direction
      const perch = () => {
        f.pos.x = prey.pos.x - Math.sin(ang) * prey.hitRadius * 0.4;
        f.pos.z = prey.pos.z - Math.cos(ang) * prey.hitRadius * 0.4;
        // crouched into them with the jaws working the NECK: perch so the
        // head-strike arc (~his own head height minus the peck dip) lands
        // at the prey's collar — clamped so small prey don't read as
        // contortion and giants still get bitten somewhere honest
        f.pos.y = prey.pos.y + clamp(
          prey.height * 0.8 - f.height * 0.35,
          prey.height * 0.22, prey.height * 0.62);
        f.vel.set(0, 0, 0);
        f.grounded = false;
        f.yaw = f.targetYaw = ang;
      };
      perch();
      const ticks = Math.round(RIDE / 0.05);
      for (let i = 1; i <= ticks; i++) {
        w.schedule(i * 0.05, () => {
          if (!f.alive || !prey.alive || f.state !== 'special') return;
          perch(); // stay perched wherever the struggle carries them
        });
      }
      // JAWS AND CLAWS while he rides. The clip is a four-beat loop — hammer,
      // right sickle, hammer, left sickle (PERCH_BEATS, animations.js) — and
      // each blow is scheduled ON its beat, so the hit lands on the frame the
      // limb arrives rather than near it. The chip damage is the SAME total the
      // three pecks carried (3 x 0.22 = 0.66, now 4 x 0.165): he opens them up
      // with more of himself, he does not do more of it.
      const RIDE_HITS = [
        { t: PERCH_BEATS.bite1, claw: null },
        { t: PERCH_BEATS.rakeR, claw: 'R' },
        { t: PERCH_BEATS.bite2, claw: null },
        { t: PERCH_BEATS.rakeL, claw: 'L' },
      ];
      for (const h of RIDE_HITS) {
        w.schedule(h.t, () => {
          if (!f.alive || !prey.alive) return;
          prey.takeHit(sp.dmg * 0.165 * f.dmgMult(), f, { knock: 1, srcPos: f.pos });
          f.sfx('slash');
          if (h.claw) {
            // a rake tears DOWN the far side of the body it is dragged through:
            // sparks offset to that hand's side and low, and the arm carries
            // the follow-through the clip's key cannot (an impulse rides on
            // top of the pose, so the drag reads as effort)
            const side = h.claw === 'R' ? 1 : -1;
            const c = prey.center();
            w.effects.impactSparks(
              _v.set(c.x + Math.cos(ang) * side * prey.hitRadius * 0.5, c.y - prey.height * 0.12,
                c.z - Math.sin(ang) * side * prey.hitRadius * 0.5),
              0xff5a2a, 12, 9);
            f.animator.addImpulse('shoulder' + h.claw, [0.5, 0, -0.35 * side], 22, 8);
            f.animator.addImpulse('elbow' + h.claw, [0.4, 0, 0], 22, 8);
          } else {
            w.effects.impactSparks(prey.center(), 0xff3826, 10, 8);
            f.animator.addImpulse('head', [0.4, 0, 0], 26, 9);
          }
        });
      }
      // kick off the carcass and spring clear
      w.schedule(RIDE, () => {
        if (!f.alive) return;
        f.animator.stop();
        if (f.state === 'special') {
          f.vel.x = -Math.sin(f.yaw) * 8;
          f.vel.z = -Math.cos(f.yaw) * 8;
          f.vel.y = 9;
          f.grounded = false;
          f.setState('normal');
        }
      });
    };

    const hunt = () => {
      if (done || !f.alive) return;
      // hit out of the arc: the dive is over (see fenrir's pounce) — the
      // horizontal velocity used to be re-imposed every tick through a
      // hitstun or a launch, and the latch still taken on whoever he fell on
      if (hitReacting(f)) { done = true; return; }
      // once he's cresting/descending, look for a victim UNDER the claws —
      // the latch requires hitting them HIGH on the body, riding down on top
      if (f.vel.y < 4) {
        let dive = null, diveD = Infinity;
        for (const v of w.fighters) {
          if (v === f || !v.alive) continue;
          const dx = w.wrapDelta(v.pos.x - f.pos.x), dz = w.wrapDelta(v.pos.z - f.pos.z);
          const dh = Math.hypot(dx, dz);
          const relY = f.pos.y - v.pos.y;
          if (dh < v.hitRadius + 2.0 * f.scale &&
              relY > v.height * 0.35 && relY < v.height * 1.6) {
            done = true;
            latch(v);
            return;
          }
          // candidate for the dive correction below
          if (dh < 26 && dh < diveD &&
              Math.abs(angleDiff(Math.atan2(dx, dz), Math.atan2(vx0, vz0))) < 0.9) {
            dive = v;
            diveD = dh;
          }
        }
        // stooping-hawk correction: he curves the dive onto moving prey —
        // this is what makes the pounce actually CONNECT on a strafing bot
        if (dive) {
          const dx = w.wrapDelta(dive.pos.x - f.pos.x), dz = w.wrapDelta(dive.pos.z - f.pos.z);
          const drop = f.pos.y - (dive.pos.y + dive.height * 0.8);
          const tRem = Math.max(0.12, drop / Math.max(6, -f.vel.y));
          vx0 += (dx / tRem - vx0) * 0.22;
          vz0 += (dz / tRem - vz0) * 0.22;
          const sp2 = Math.hypot(vx0, vz0);
          if (sp2 > 40) { vx0 *= 40 / sp2; vz0 *= 40 / sp2; }
        }
      }
      if (f.grounded) {
        // came down on dirt: absorb the landing in a crouch, stand back up
        done = true;
        f.duckT = 1;
        w.effects.dustPuff(f.pos, 3, 0x9a8f80);
        f.sfx('land');
        f.animator.stop();
        f.setState('attack', 0.35);
        return;
      }
      // hold the ballistic arc — air-control damping would otherwise bleed
      // the horizontal velocity away and dump him far short of the prey
      f.vel.x = vx0;
      f.vel.z = vz0;
      w.schedule(0.04, hunt);
    };
    w.schedule(0.12, hunt);
  },

  // FROGGER: all four gunk guns lob a sticky mortar carpet
  slimeBarrage(f, sp) {
    // a rain of lumpy slime GLOBS — every wad that lands splats a puddle
    // and gunks blotches onto whoever it hits (the goop flag drives both)
    cast(f, 'spray', { speed: 1.4, stateT: (dur) => Math.min(dur, 1.0) });
    volley(f.world, f, sp.count, 0.09, (i) => {
      const from = muzzle(f, i % 2 ? 'muzzleL' : 'muzzleR');
      const arcTime = rand(0.7, 1.0);
      const e = f.nearestEnemy();
      const target = e ? leadPos(f, e, arcTime * 0.8) : fwd(f, 16);
      target.x += rand(-sp.radius, sp.radius) * 0.4;
      target.z += rand(-sp.radius, sp.radius) * 0.4;
      f.world.projectiles.spawn('glob', f, from, new THREE.Vector3(0, 1, 0), {
        dmg: sp.dmg * f.dmgMult(), splash: 2.6, color: 0x9ade2a, arcTo: target, arcTime,
        status: { slow: 0.6, slowT: 1.8 }, goop: true, size: rand(0.9, 1.4),
      });
      f.world.effects.slime(from, 3, 2);
      f.sfx('plasma');
    });
  },

  // JERRY: both cannons cough up a scattering burst of live robo-shrimp
  // fleas that hop off hunting on their own
  fleaSwarm(f, sp) {
    cast(f, 'shoot', { stateT: (dur) => Math.min(dur, 0.8) });
    volley(f.world, f, sp.count, 0.09, (i) => {
      const from = muzzle(f, i % 2 ? 'muzzleL' : 'muzzleR');
      const a = f.yaw + rand(-0.55, 0.55);
      f.world.fleas.spawn(f, from, new THREE.Vector3(Math.sin(a), 0.55, Math.cos(a)), {
        dmg: sp.dmg * f.dmgMult(),
      });
      f.world.effects.muzzleFlash(from);
    });
  },

  // NULLBOT: SEGFAULT — he de-rezzes into a smear of corrupted frames and
  // tears forward through everything on the line; whoever he passes
  // through gets a chunk of themselves converted (a glitch stack)
  segfault(f, sp) {
    const w = f.world;
    cast(f, 'lunge', { stateT: 0.48 });
    f.iframes = 0.42;
    const spd = f.def.stats.speed * 4.4;
    f.vel.x = Math.sin(f.yaw) * spd;
    f.vel.z = Math.cos(f.yaw) * spd;
    f.sfx('zap');
    f.sfx('dash');
    w.effects.glitchBurst(f.center(), 14, 8, f.scale);
    const victims = new Set();
    volley(w, f, 9, 0.045, () => {
      // after-images: corrupted frames left hanging along the tear line
      w.effects.glitchFleck(f.pos.x + rand(-0.6, 0.6), f.pos.y + rand(0.8, f.height * 0.9),
        f.pos.z + rand(-0.6, 0.6), 1.5 * f.scale);
      w.effects.dashTrail(f.pos, 0xff2df2, f.scale * 1.3);
      for (const e of w.fighters) {
        if (e === f || !e.alive || victims.has(e)) continue;
        if (e.pos.distanceTo(f.pos) < 3.4 * f.scale) {
          victims.add(e);
          e.takeHit(sp.dmg * f.dmgMult(), f, { knock: 10, srcPos: f.pos, status: { glitch: 1 } });
          w.effects.glitchBurst(e.center(), 12, 7, e.scale);
          w.engine.addHitStop(0.05);
        }
      }
    }, { start: 0.045 });
  },

  // GLACIER: cryo beam channel
  freezeBeam(f, sp) {
    // the beam pours out of the PRIMARY barrel (muzzle() below), so the raised
    // arm has to be the one holding it — `channelClip` is the mech's own
    // hold-and-pour clip, which for Glacier is the mirrored left-arm loop
    cast(f, f.def.channelClip || 'shootLoop', { stateT: sp.duration });
    const ticks = Math.floor(sp.duration / 0.12);
    volley(f.world, f, ticks, 0.12, (i) => {
      f.firing = true;
      f.faceNearestEnemyIfClose(40, true);
      const from = muzzle(f);
      const dir = aimDir(f);
      const end = from.clone().addScaledVector(dir, 24);
      f.world.effects.beams.spawn(from, end, { radius: 0.5, dur: 0.14, color: 0x9be8ff });
      f.world.effects.snowCone(from, dir);
      if (i % 3 === 0) f.sfx('freeze');
      for (const e of f.world.fighters) {
        if (e === f || !e.alive) continue;
        const c = e.center();
        const t = c.clone().sub(from).dot(dir);
        if (t > 0 && t < 26) {
          const closest = from.clone().addScaledVector(dir, t);
          if (closest.distanceTo(c) < e.hitRadius + 1.2) {
            // iced over: the whole body stays frost-WHITE for exactly as
            // long as the beam is on them (thaws right back after), while
            // the tick flinches shake them and the slow bogs them down
            e._beamWhiteT = 0.18;
            e.takeHit(sp.dmg * f.dmgMult(), f, {
              knock: 1, srcPos: from, silent: true, soft: true,
              status: { slow: sp.slow, slowT: 1.2 },
            });
          }
        }
      }
    }, { guard: (f) => stillCasting(f) });
    f.world.schedule(sp.duration + 0.05, () => { if (f.state === 'special') { f.animator.stop(); f.setState('normal'); } });
  },


  // TRITONE: GORE CHARGE. The move the whole body was built for — he drops his
  // head, plants the frill as a shield and RUNS, for as long as the trigger is
  // held and the tank lasts. Unlike rhino's bull rush this one does not merely
  // knock you down: the horns catch you, carry you the rest of the run, and
  // then throw.
  //
  // IT IS A HELD MOVE, AND YOU STILL DRIVE. Three things separate it from a
  // scripted rush:
  //
  //  • THE TANK PAYS FOR IT. Every second of charging drains the same stamina
  //    bar that funds sprinting and blocking (GORE_DRAIN — a full bar buys
  //    ~3.5s). Run it dry and the charge ends itself, so there is a real cost
  //    to holding the trigger down across the arena.
  //  • HE STEERS, BADLY. The stick still turns him, but at GORE_TURN rad/s —
  //    a fraction of the walking servo. Six tonnes at a gallop can be aimed;
  //    it cannot be threaded. Cornering is the skill.
  //  • A DASH INSIDE THE CHARGE IS THE PAYOFF. Tap B mid-run and instead of
  //    the ordinary dash (which would drop him out of the state) the CHARGE
  //    itself surges. Speed is not cosmetic here: the horns hit for what he
  //    ARRIVED at — `dmg x speed/base` — so a dash-fed impact lands around
  //    1.8x a standing one. Momentum is the damage.
  goreCharge(f, sp) {
    const w = f.world;
    cast(f, 'chargeLean', { stateT: 12 });
    f.sfx('charge');
    faceRoar(f, 0.7);
    f._chargeT = 0;
    f._goreStep = undefined;
    f._goreSurge = 0;
    f._gorePrevDash = true;   // the press that STARTED the move never surges
    const base = f.def.stats.speed * 3.0;
    const endRush = (recovery) => {
      f._charging = false;
      f._goreSurge = 0;
      f.animator.stop();
      f.setState('attack', recovery);
    };
    const tick = () => {
      if (!f.alive || f.state !== 'special') { f._charging = false; f._goreSurge = 0; return; }
      const dt = 0.05;
      f._chargeT += dt;
      // the tank: a hold he cannot afford ends on its own
      f.sprintEnergy = Math.max(0, f.sprintEnergy - GORE_DRAIN * dt);
      const holding = (f.intent.specialHeld || f._chargeT < 0.9)
        && f._chargeT < GORE_MAX && (f.sprintEnergy > 0 || f._chargeT < 0.9);
      // DASH-FED SURGE: B mid-charge buys a burst of speed out of the same
      // tank a normal dash spends, and the burst decays back to the base run.
      const dashEdge = !!f.intent.chargeDash && !f._gorePrevDash;
      f._gorePrevDash = !!f.intent.chargeDash;
      if (dashEdge && f.sprintEnergy > GORE_DASH_COST) {
        f.sprintEnergy -= GORE_DASH_COST;
        f._goreSurge = Math.min(GORE_SURGE_MAX, (f._goreSurge || 0) + GORE_SURGE);
        f.iframes = Math.max(f.iframes, 0.18);
        f.sfx('dash');
        w.effects.dashTrail(f.pos, f.def.colors.glow || 0xff8a24, f.scale * 1.5);
        w.effects.rings.spawn(f.pos, { from: 0.6, to: 5, dur: 0.3, color: f.def.colors.glow, y: 0.4 });
      }
      f._goreSurge = Math.max(0, (f._goreSurge || 0) - dt / GORE_SURGE_FADE * GORE_SURGE);
      const spd = base * (1 + f._goreSurge);
      f._goreSpeedK = spd / base;      // read by the impact below (and the HUD tell)
      f.vel.x = Math.sin(f.yaw) * spd;
      f.vel.z = Math.cos(f.yaw) * spd;
      // STEERING — loose. A player pushes the stick and he leans into it at
      // GORE_TURN; the CPU aims itself at whatever it was chasing, through the
      // same limit, so neither can corner harder than the body allows.
      let want = null;
      if (f.isAI) {
        const e0 = f.nearestEnemy();
        if (e0 && f.pos.distanceTo(e0.pos) < 40) want = f.yawTo(e0);
      } else if (Math.hypot(f.intent.moveX, f.intent.moveZ) > 0.25) {
        want = Math.atan2(f.intent.moveX, f.intent.moveZ);
      }
      if (want !== null) {
        f.targetYaw = want;
        f.yaw += clamp(angleDiff(f.yaw, want), -GORE_TURN * dt, GORE_TURN * dt);
        f.torsoYaw = f.yaw;
        f.group.rotation.y = f.yaw;
      }
      // four columnar feet throwing dirt, hung off the gait phase so the
      // stomps land with the legs instead of on a timer of their own
      f.world.effects.dustPuff(f.pos, 3, 0x8c8266);
      const ph = f.animator.phase || 0;
      const step = Math.floor(ph / Math.PI);
      if (f._goreStep !== undefined && step !== f._goreStep) {
        const foot = f.mech.joints[step % 2 ? 'ankleL' : 'ankleR'];
        const at = foot ? foot.getWorldPosition(_rushFoot) : f.pos;
        w.effects.dustPuff(at, 9, 0x8c8266);
        w.effects.addShake(0.16);
        f.sfx('land');
      }
      f._goreStep = step;
      for (const e of w.fighters) {
        if (e === f || !e.alive || f.isAllyOf(e)) continue;
        const dx = w.wrapDelta(e.pos.x - f.pos.x), dz = w.wrapDelta(e.pos.z - f.pos.z);
        // the horns ride at HIS height — jump it and the charge passes under
        if (Math.hypot(dx, dz) < 4.0 * f.scale && overlapsY(e, f.pos.y, f.height)) {
          // CAUGHT ON THE HORNS: hoisted and thrown, not merely bumped — and
          // MOMENTUM IS THE DAMAGE. Everything the impact spends (damage,
          // knock, the throw, the shake) scales with how fast he was actually
          // travelling, so a dash-fed charge is a categorically bigger hit
          // than one that merely arrived.
          const k = f._goreSpeedK || 1;
          e.takeHit(sp.dmg * k * f.dmgMult(), f, {
            knock: sp.knock * k, launch: (sp.launch || 12) * k, srcPos: f.pos, heavy: true,
          });
          e.vel.x = Math.sin(f.yaw) * 26 * k;
          e.vel.z = Math.cos(f.yaw) * 26 * k;
          e.vel.y = Math.max(e.vel.y, 15 * k);
          w.engine.addHitStop(0.10 * k);
          w.effects.addShake(0.7 * k);
          w.effects.impactSparks(e.center(), f.def.colors.glow, 20, 13);
          w.effects.explosion(e.center(), 2.2, { color: 0xc8b08a, smoke: true, sparks: false });
          f.sfx('hitHeavy');
          faceRoar(f, 0.5);
          endRush(0.5);
          return;
        }
      }
      if (holding) w.schedule(dt, tick);
      else endRush(0.35);
    };
    f._charging = true;
    w.schedule(0.05, tick);
  },
};

// ============================= ULTIMATES =============================
// Every ultimate is a big AREA statement. Live entities (swarms, tornadoes,
// giant forms, corrupted arenas) run on world.addUpdater(tick, end): tick
// each frame until it returns false, end() guaranteed for cleanup even when
// a finisher or round sweep interrupts mid-show.

const ss = (x) => x * x * (3 - 2 * x); // smoothstep

// bake a movable one-piece copy of the fighter's CURRENT pose. Meshes share
// geometry+materials with the original (cheap); position/rotate the returned
// group freely; cleanup is just scene.remove — nothing owned to dispose.
function bakeShell(f) {
  const root = new THREE.Group();
  f.mech.group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(f.mech.group.matrixWorld).invert();
  f.mech.group.traverse((o) => {
    if (!o.isMesh || o.userData.chargeShell) return;
    const m = new THREE.Mesh(o.geometry, o.material);
    m.matrixAutoUpdate = false;
    m.matrix.copy(o.matrixWorld).premultiply(inv);
    root.add(m);
  });
  return root;
}

// SUMMON FLASH: a clone arriving from another dimension burns white-hot for
// a beat — every mesh in the group gets an additive overlay copy that fades
// out as the newcomer "materializes" into this reality
function summonFlash(w, group, color = 0x9be8ff, dur = 0.45) {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const targets = [];
  group.traverse((o) => { if (o.isMesh && !o.userData.summonFx) targets.push(o); });
  const overlays = [];
  for (const o of targets) {
    const m = new THREE.Mesh(o.geometry, mat);
    m.userData.summonFx = true;
    m.matrixAutoUpdate = false;
    m.matrix.makeScale(1.06, 1.06, 1.06);
    o.add(m);
    overlays.push(m);
  }
  timedUpdater(w, dur, (k, dt, t) => {
    mat.opacity = 0.95 * Math.pow(Math.max(0, 1 - t / dur), 1.5);
  }, () => {
    for (const m of overlays) m.parent?.remove(m);
    mat.dispose();
  });
}

// SUMMON PORTAL: a glowing rift disc laid open on the ground — the pack
// leaps up out of it into the arena. Spinning rim arcs + rising motes.
function summonPortal(w, x, z, { radius = 3.5, color = 0x6cd8ff, life = 1.6 } = {}) {
  const grp = new THREE.Group();
  const discMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.06;
  grp.add(disc);
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const spin = new THREE.Group(); // broken rim arcs so the spin actually reads
  const arcGeo = new THREE.TorusGeometry(radius * 0.96, 0.14, 6, 18, 1.6);
  for (let i = 0; i < 3; i++) {
    const arc = new THREE.Mesh(arcGeo, rimMat);
    arc.rotation.z = (i / 3) * TAU;
    spin.add(arc);
  }
  spin.rotation.x = -Math.PI / 2;
  spin.position.y = 0.12;
  grp.add(spin);
  grp.position.set(x, 0, z);
  w.scene.add(grp);
  timedUpdater(w, life, (_k, dt, t) => {
    const k = Math.min(t / 0.22, 1) * ss(clamp01((life - t) / 0.35));
    discMat.opacity = 0.35 * k;
    rimMat.opacity = 0.9 * k;
    grp.scale.setScalar(0.2 + 0.8 * Math.min(t / 0.22, 1));
    spin.rotation.z = t * 3.1;
    if (Math.random() < 0.6) {
      const a = rand(TAU), r = Math.sqrt(Math.random()) * radius * 0.9;
      w.effects.glows.emit(x + Math.cos(a) * r, 0.3, z + Math.sin(a) * r,
        0, rand(2.5, 6), 0, { life: 0.4, size: 0.55, color, alpha: 0.8 });
    }
  }, () => {
    w.scene.remove(grp);
    disc.geometry.dispose();
    arcGeo.dispose();
    discMat.dispose();
    rimMat.dispose();
  });
}

// DARK VORTEX: the other kind of arrival. A summonPortal is a clean rift with
// a lit rim; this is a churning black funnel — a smoke column dragged round a
// centre with a lightless disc under it — for a colony that does not so much
// step through as BOIL out of the floor (JERRY's flea circus).
//
// Two things make it read as a VORTEX rather than a puff of smoke. The
// emission ANGLE rotates (`swirl` rad/s), so successive puffs lie along a
// spiral arm instead of a ring, and each puff leaves with a TANGENTIAL
// velocity plus a little inward pull, so it is already travelling around the
// centre when it is born. Particles fly straight once emitted — the curve is
// in where and how they start, which is the only place a pooled sprite can
// carry one.
function darkVortex(w, x, z, { radius = 3.2, life = 1.3, color = 0x120e0c, rate = 42, swirl = 7.5 } = {}) {
  const grp = new THREE.Group();
  // the lightless hole itself: NORMAL-blended, because an additive black disc
  // is nothing at all (the same trap wraith's bats document)
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x05040a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  grp.add(disc);
  // a couple of dim arcs turning with the funnel, so the SPIN has an edge to
  // be read against once the smoke thins
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x6a5a52, transparent: true, opacity: 0, depthWrite: false,
  });
  const spin = new THREE.Group();
  const arcGeo = new THREE.TorusGeometry(radius * 0.92, 0.1, 6, 16, 2.1);
  for (let i = 0; i < 2; i++) {
    const arc = new THREE.Mesh(arcGeo, rimMat);
    arc.rotation.z = (i / 2) * TAU;
    spin.add(arc);
  }
  spin.rotation.x = -Math.PI / 2;
  spin.position.y = 0.1;
  grp.add(spin);
  grp.position.set(x, 0, z);
  w.scene.add(grp);
  let ang = rand(TAU), acc = 0;
  timedUpdater(w, life, (_k, dt, t) => {
    const k = Math.min(t / 0.18, 1) * ss(clamp01((life - t) / 0.4));
    discMat.opacity = 0.7 * k;
    rimMat.opacity = 0.5 * k;
    grp.scale.setScalar(0.35 + 0.65 * Math.min(t / 0.2, 1));
    spin.rotation.z = -t * swirl;
    ang -= swirl * dt;
    // the funnel wall: puffs launched along the current spiral arm, each
    // already moving AROUND the centre and drawn slightly into it
    acc += rate * dt;
    while (acc >= 1) {
      acc -= 1;
      const a = ang + rand(-0.5, 0.5);
      const r = radius * rand(0.35, 1.05);
      const tanX = -Math.sin(a), tanZ = Math.cos(a);   // around
      const inX = -Math.cos(a), inZ = -Math.sin(a);    // and in
      const sp = rand(5, 9) * k;
      const climb = rand(3, 8);
      // NOTE ON SIZE: a pool sprite covers roughly size/2 world units (see the
      // booster note in effects.js), so a funnel that reads at combat range
      // around a ~6-unit mech wants 4-8, not the 2-3 that looks right when you
      // read the number as units.
      w.effects.smoke.emit(
        x + Math.cos(a) * r, rand(0.1, 2.2), z + Math.sin(a) * r,
        tanX * sp + inX * sp * 0.35, climb, tanZ * sp + inZ * sp * 0.35,
        {
          life: rand(0.6, 1.3), size: rand(4, 7.5), color: 0x322c29, color2: color,
          alpha: rand(0.6, 0.9), drag: 1.1, grow: rand(2, 4), spin: rand(0.6, 2.2),
        });
    }
    // the odd ember dragged round with it, so the black has something to be
    // black against
    if (Math.random() < 0.5) {
      const a = ang + rand(-0.8, 0.8), r = radius * rand(0.5, 1);
      w.effects.sparks.emit(x + Math.cos(a) * r, rand(0.2, 1.6), z + Math.sin(a) * r,
        -Math.sin(a) * rand(6, 11), rand(1, 5), Math.cos(a) * rand(6, 11),
        { life: rand(0.25, 0.5), size: rand(0.4, 0.8), color: 0xff9a3c, drag: 1.6, gravity: 6 });
    }
  }, () => {
    w.scene.remove(grp);
    disc.geometry.dispose();
    arcGeo.dispose();
    discMat.dispose();
    rimMat.dispose();
  });
}

// nearest living opponent of `f` to an arbitrary world point
function nearestEnemyTo(f, x, z, maxD = Infinity) {
  const w = f.world;
  let best = null, bestD = maxD * maxD;
  for (const e of w.fighters) {
    if (e === f || !e.alive || f.isAllyOf(e)) continue;
    const dx = w.wrapDelta(e.pos.x - x), dz = w.wrapDelta(e.pos.z - z);
    const d = dx * dx + dz * dz;
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}


// ---- SUMMON PREWARM ---------------------------------------------------------
//
// The only ult that builds BODIES mid-fight is SAURION's raptor pack (the flea
// circus throws frozen shells, which are cheap). Even with every measurement a
// GLB build makes now cached per manifest entry (gltf.js fitCache), a body is
// still a scene-graph clone plus a rig plus an animator — ~5ms — and three of
// them 0.22s apart is three separate hitches at the loudest moment of the
// match. That is the ult lag, in its second and smaller form.
//
// So the bodies are built when a hitch costs nothing: during the ROUND INTRO,
// while the announcement is up and nobody is being controlled. The pool refills
// the same way after a cast — one body at a time, spaced out through the
// world's own scheduler — so a second cast in the same round is warm too.
//
// A spare is a MECH, not a Fighter: it holds no world state and is not in the
// scene, so keeping one costs a scene graph that was going to be built anyway.
// Nothing else has to know: `takeSpare` returns null when the pool is empty and
// raptorPack falls back to cloning on the spot, exactly as it used to.

// The egg shell's texture and geometry, painted once and shared — warmed here
// so the ult's own frame never pays for it (see eggs.js warmEggAssets).
function warmEggs(f) {
  if (f._eggsWarm || summonCount(f) === 0) return false;
  f._eggsWarm = true;
  warmEggAssets();
  return true;
}

// How many bodies this fighter's ult will want, or 0 if it summons none.
function summonCount(f) {
  const u = f?.def?.moves?.ult;
  return u && u.id === 'raptorPack' ? (u.count || 3) : 0;
}

export function takeSpare(f) {
  const m = f._ultSpares?.pop() || null;
  if (m) scheduleRefill(f);
  return m;
}

// Build one body now if the pool is short. Called from the round intro (all of
// them, over successive frames) and from the refill schedule after a cast.
export function prewarmSummons(f, budget = 1) {
  const want = summonCount(f);
  if (!want || !f.alive || !f.mech) return false;
  if (warmEggs(f)) return true;   // one intro frame for the shell's own assets
  const pool = f._ultSpares || (f._ultSpares = []);
  let built = 0;
  while (pool.length < want && built < budget) {
    try { pool.push(cloneMech(f.mech)); } catch (e) { return false; }
    built++;
  }
  return built > 0;
}

// Drop the pool (a round ending, a mech swap — a spare built from a body that
// is no longer his would spawn the wrong raptor).
export function clearSpares(f) {
  if (f._ultSpares) f._ultSpares.length = 0;
  f._ultRefill = false;
}

function scheduleRefill(f) {
  if (f._ultRefill) return;
  f._ultRefill = true;
  const w = f.world;
  const tick = () => {
    f._ultRefill = false;
    if (!f.alive || !w.fighters.includes(f)) return;
    if (prewarmSummons(f, 1)) scheduleRefill(f);
  };
  // 1.5s apart: the cast is over, the pack is on the floor fighting, and one
  // body every second and a half is invisible next to that
  w.schedule(1.5, tick);
}

// ONE RAPTOR, OUT OF ONE EGG. Everything the old volley did to a clone, plus
// the birth: he comes out CURLED (the `ball` clip, which is the air-tuck pose
// and reads exactly like a hatchling) at half size, and unfolds into his stance
// as he grows to full over `BIRTH`. The Fighter is real from the first frame —
// the ball is just the shape he is in when he arrives.
const BIRTH = 0.55;
function hatchRaptor(f, u, egg) {
  const w = f.world;
  if (!f.alive || !w.fighters.includes(f)) return;
  const mech = egg.body || takeSpare(f) || cloneMech(f.mech);
  const pos = new THREE.Vector3(egg.pos.x, 0, egg.pos.z);
  const clone = new Fighter(w, f.def, {
    pos, yaw: f.yaw, playerIndex: f.playerIndex, isAI: true, mech,
  });
  clone.isMinion = true;
  clone.allyOf = f;
  clone.maxHp = clone.hp = Math.round(f.maxHp * (u.hpFrac || 0.35));
  // runts of the litter: a shade smaller, darker plumage
  const SIZE = 0.85;
  clone.group.scale.setScalar(SIZE);
  clone.scale *= SIZE;
  clone.baseHeight *= SIZE;
  clone.height *= SIZE;
  clone.baseHitRadius *= SIZE;
  clone.hitRadius *= SIZE;
  clone.radius *= SIZE;
  for (const m of Object.values(clone.mech.materials)) {
    if (m && m.color) m.color.multiplyScalar(0.7);
  }
  w.addMinion(clone, new AIController(clone, 'ace'), u.duration || 18);
  // ---- the birth: curled and small, unfolding as he stands up ----
  clone.animator.play('ball');
  clone.controlsLocked = true;
  let t = 0;
  w.addUpdater((dt) => {
    t += dt;
    const k = Math.min(1, t / BIRTH);
    const e = k * k * (3 - 2 * k);
    clone.group.scale.setScalar(SIZE * (0.45 + 0.55 * e));
    if (k >= 1) {
      clone.group.scale.setScalar(SIZE);
      clone.animator.stop(0.18);      // out of the ball, into his stance
      clone.controlsLocked = false;
      return false;
    }
    return clone.alive;
  }, () => { clone.controlsLocked = false; clone.group.scale.setScalar(SIZE); });
  summonFlash(w, clone.mech.group, 0xff8a5a, 0.55);
  w.effects.impactSparks(clone.center(), 0xff3826, 14, 8);
  f.sfx('cast');
}

export const ULTS = {
  // TITANUS: he reaches to the sky and a METEOR SHOWER hammers a broad zone
  // in front of him — burning rocks screaming down, each one a fire blast
  // that leaves the ground burning where it lands
  meteorBreaker(f, u) {
    const w = f.world;
    cast(f, 'castRaise', {
      state: 'ult',
      onFire: () => {
        f.sfx('powerup');
        f.sfx('thunder');
        const center = fwd(f, u.radius * 0.85);
        center.y = 0;
        // the weather comes in from ONE quarter of the sky — every rock
        // rides the same slanted wind, so the volley reads as a STORM
        const stormA = rand(TAU);
        w.effects.rings.spawn(center, { from: 1, to: u.radius * 2, dur: 0.8, color: 0xff8030, y: 0.4 });
        const rockGeo = new THREE.DodecahedronGeometry(1, 0);
        const rockMat = new THREE.MeshStandardMaterial({
          color: 0x4a3a30, roughness: 0.95, metalness: 0.05,
          emissive: 0xff5a10, emissiveIntensity: 0.9,
        });
        volley(w, f, u.count, 0.17, (i) => {
          // half the rocks hunt whoever is standing in the zone, the rest
          // carpet it at random
          let gx, gz;
          const prey = i % 2 === 0 ? nearestEnemyTo(f, center.x, center.z, u.radius * 1.2) : null;
          if (prey) {
            const p = leadPos(f, prey, 0.8);
            gx = p.x + rand(-2.5, 2.5);
            gz = p.z + rand(-2.5, 2.5);
          } else {
            const a = rand(TAU), r = Math.sqrt(Math.random()) * u.radius;
            gx = center.x + Math.cos(a) * r;
            gz = center.z + Math.sin(a) * r;
          }
          const s = rand(1.0, 1.7);
          const rock = new THREE.Mesh(rockGeo, rockMat);
          rock.scale.setScalar(s);
          const FALL = 0.8;
          // slanted entry: offset well to the storm side so the descent
          // comes down at a real angle (~30°), not a vertical plummet
          const slant = rand(24, 34);
          const ox = Math.cos(stormA) * slant + rand(-4, 4);
          const oz = Math.sin(stormA) * slant + rand(-4, 4);
          rock.position.set(gx + ox, 48, gz + oz);
          w.scene.add(rock);
          const vel = new THREE.Vector3(-ox / FALL, -48 / FALL, -oz / FALL);
          const spin = rand(-7, 7);
          f.sfx('whoosh');
          w.addUpdater((dt) => {
            rock.position.addScaledVector(vel, dt);
            rock.rotation.x += spin * dt;
            rock.rotation.z += spin * 0.6 * dt;
            // burning tail
            w.effects.glows.emit(
              rock.position.x + rand(-0.4, 0.4), rock.position.y + rand(0, 1), rock.position.z + rand(-0.4, 0.4),
              rand(-1, 1), rand(3, 7), rand(-1, 1),
              { life: 0.3, size: rand(1.1, 2) * s, color: 0xff7a20, alpha: 0.9 });
            w.effects.smoke.emit(rock.position.x, rock.position.y + 1.2, rock.position.z,
              rand(-1, 1), rand(2, 4), rand(-1, 1),
              { life: 0.6, size: 1.6 * s, color: 0x30241c, alpha: 0.4, grow: 1.6 });
            if (rock.position.y > 0.5 * s) return true;
            // IMPACT: fire blast + burning crater
            const hit = new THREE.Vector3(gx, 0, gz);
            w.explode(hit, 4.6, u.dmg * f.dmgMult(), { unblockable: true,
              owner: f, knock: u.knock, launch: 8, color: 0xff7a30,
              status: { burn: 6, burnT: 2 },
            });
            w.addFirePatch(f, hit, 2.4, 2.8, 9);
            w.effects.addShake(0.5);
            return false;
          }, () => { w.scene.remove(rock); });
        }, { start: 0.15 });
      },
    });
  },

  // VULCAN: both gatling arms fling out high and wide while his upper body is
  // ALREADY winding up, and he hoses out a hundred rounds that DON'T fly away —
  // they leave his outstretched hands, spiral out and fall into orbit around
  // him, a whirlwind of lead that rides along as he moves, until someone strays
  // close: then the whole storm folds onto them.
  //
  // The build-up is the move, in three beats: a hard spin-up under the arms as
  // they come out → a long run at full whirl (the rounds pour out through it) →
  // the guns fall silent and the whirl coasts to a stop while the storm keeps
  // circling on its own. Rounds inherit the body's angular velocity AT THE
  // MOMENT THEY LEAVE, so the first ones drift lazily while the last are flung
  // off at full speed.
  bulletHurricane(f, u) {
    const w = f.world;
    const N = u.count || 100;
    const SPIN = 18.6;          // rad/s at full whirl — ~3 turns a second
    const RAMP = 0.333;         // hard acceleration up to full whirl...
    const BRAKE = RAMP;         // ...and the SAME deceleration back down, so the
    // spin-up and the spin-down are mirror images (fighter.js eases the brake
    // out at a constant rate, matching the ramp's constant acceleration).
    // The whirl starts on frame ONE: the arms fling out (hurricaneSpin's own
    // 0.34s reach) while the torso is already turning under them, instead of
    // the body waiting for the pose to finish.
    const DELAY = 0;
    // He completes WHOLE TURNS, so the whirl stops facing front instead of
    // unwinding backwards into place. Ramp and brake are triangles of the same
    // area (SPIN*RAMP/2 each), so the hold is whatever makes the total a whole
    // number of turns. TURNS is what keeps the move's LENGTH steady as SPIN
    // changes — six of them at this rate is the same flat-out run two were at a
    // third of the speed.
    const TURNS = 6;
    const HOLD = (TURNS * TAU - SPIN * RAMP) / SPIN;
    const FIRE0 = DELAY + RAMP * 0.5;          // guns open at half whirl speed
    const FIRE1 = DELAY + RAMP + HOLD * 0.75;  // ...and fall silent before he slows
    const SPUN = DELAY + RAMP + HOLD + BRAKE;
    cast(f, 'hurricaneSpin', { state: 'ult', stateT: SPUN });
    // NEGATIVE rate: a +y torso spin sweeps +X toward -Z, while the rounds
    // orbit +X toward +Z (their angle drives cos/sin) — so the body has to
    // turn the other way to run WITH the storm it just threw.
    f._spinFx = { joint: 'torso', axis: 'y', rate: -SPIN, delay: DELAY, ramp: RAMP,
      brake: BRAKE, dur: SPUN, t: 0, acc: 0 };
    // hurricaneSpin HOLDS its last key (arms out for the whole whirl), so it
    // has to be released by hand once he stops turning — the storm lives on
    // without him from here.
    w.schedule(SPUN, () => { if (f.animator.isPlaying('hurricaneSpin')) f.animator.stop(0.3); });
    f.sfx('powerup');
    const geo = new THREE.SphereGeometry(0.24, 6, 5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd080, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const im = new THREE.InstancedMesh(geo, mat, N);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    w.scene.add(im);
    const M = new THREE.Matrix4();
    const bullets = [];
    for (let i = 0; i < N; i++) {
      bullets.push({
        born: FIRE0 + (FIRE1 - FIRE0) * (i / N), // streamed out over the whirl
        side: i % 2 ? 'muzzleL' : 'muzzleR',     // alternating hands
        live: false,                  // set on birth, from the hand's own position
        a: 0, r: 0, y: 0, spd: 0,
        rMax: rand(8, 16.5), // a WIDE storm — the ring owns the whole street
        vr: rand(9, 17),              // how fast it flies clear of the hand
        vy: rand(-0.7, 0.7),
        dive: rand(0, 0.5),           // stagger of the final strike
        hit: false,
        px: 0, py: 0, pz: 0,
      });
    }
    // A round takes off from the hand that fired it: its orbit angle/radius are
    // simply WHERE THAT HAND IS, and its angular speed is the body's angular
    // speed right then (plus a little scatter), so it keeps travelling the way
    // the hand was already swinging it.
    const launch = (b) => {
      const m = f.mech.anchors[b.side] || f.mech.anchors.muzzleR;
      m.getWorldPosition(_v);
      const dx = _v.x - f.pos.x, dz = _v.z - f.pos.z;
      b.a = Math.atan2(dz, dx);
      b.r = Math.max(0.8, Math.hypot(dx, dz));
      b.y = Math.max(0.9, _v.y - f.pos.y);
      b.spd = -(f._spinFx?.vel || SPIN) * rand(0.9, 1.12);
      b.live = true;
      w.effects.muzzleFlash(_v);
      if (Math.random() < 0.35) f.sfx('gatling');
    };
    let t = 0, mode = 'orbit', target = null, strikeT = 0, landed = 0;
    w.addUpdater((dt) => {
      t += dt;
      if (!f.alive) return false;
      if (mode === 'orbit') {
        // the storm has to finish GATHERING before it can be spent — an enemy
        // stood next to him at cast time doesn't get to skip the wind-up
        const e = t < FIRE1 ? null : f.nearestEnemy();
        if (e && Math.hypot(w.wrapDelta(e.pos.x - f.pos.x), w.wrapDelta(e.pos.z - f.pos.z)) < 17.5) {
          mode = 'strike';
          target = e;
          strikeT = 0;
          f.sfx('charge');
        } else if (t > (u.duration || 9)) {
          return false; // storm spun itself out un-spent
        }
      } else {
        strikeT += dt;
        if (!target.alive) return false;
      }
      let flying = 0;
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (b.hit) { M.makeScale(0, 0, 0); im.setMatrixAt(i, M); continue; }
        if (!b.live) {
          // not fired yet: hidden, and it takes off from the hand's live spot
          if (t < b.born) { M.makeScale(0, 0, 0); im.setMatrixAt(i, M); flying++; continue; }
          launch(b);
        }
        flying++;
        b.a += b.spd * dt;
        b.r = Math.min(b.rMax, b.r + b.vr * dt);   // spirals clear of the hand
        b.y = Math.max(0.9, b.y + b.vy * dt);
        let x = f.pos.x + Math.cos(b.a) * b.r;
        let y = f.pos.y + b.y;
        let z = f.pos.z + Math.sin(b.a) * b.r;
        if (mode === 'strike') {
          // each round finishes its current lap while sliding onto the mark
          const k = ss(clamp01((strikeT - b.dive) / 0.45));
          const c = target.center();
          x += (c.x + rand(-0.3, 0.3) - x) * k;
          y += (c.y + rand(-0.3, 0.3) - y) * k;
          z += (c.z + rand(-0.3, 0.3) - z) * k;
          if (k >= 1) {
            b.hit = true;
            landed++;
            target.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true,
              knock: 1.2, srcPos: f.pos, soft: landed % 8 !== 0,
            });
            if (landed % 6 === 0) {
              w.effects.impactSparks(target.center(), 0xffd080, 6, 7);
              f.sfx('gatling');
            }
          }
        }
        b.px = x; b.py = y; b.pz = z;
        M.makeTranslation(x, y, z);
        im.setMatrixAt(i, M);
      }
      im.instanceMatrix.needsUpdate = true;
      if (mode === 'strike' && flying === 0) {
        // the last round lands the exclamation point
        if (target.alive) {
          target.takeHit(u.dmg * 6 * f.dmgMult(), f, { unblockable: true,
            knock: 14, launch: 8, srcPos: f.pos, heavy: true,
          });
        }
        w.effects.explosion(target.center(), 3.5, { color: 0xffd080 });
        return false;
      }
      return true;
    }, () => { w.scene.remove(im); geo.dispose(); mat.dispose(); });
  },


  // VIPER: coils to the ground, springs skyward — and SIXTY vipers leap out
  // in every direction, slithering down whoever they find. The first fang
  // pins the victim in place; the rest of the brood piles on.
  serpentStorm(f, u) {
    const w = f.world;
    const N = u.count || 60;
    f.setState('ult', 1.5);
    f.duckT = 1;
    f.sfx('cast');
    w.schedule(0.35, () => {
      if (!f.alive) return;
      f.vel.y = 16;
      f.grounded = false;
      f.animator.play('launched');
      f.sfx('jump');
      w.effects.rings.spawn(f.pos, { from: 0.5, to: 8, dur: 0.5, color: 0x5aff2e, y: 0.5 });
      // each snake is a chain of tapered ball segments — head down to tail
      // tip — that undulates as it moves; reads as a SNAKE, not a plank
      const SEG = 7;
      const SEG_R = [0.3, 0.27, 0.25, 0.22, 0.19, 0.15, 0.11];
      const SEG_SP = 0.4; // spacing along the spine (~2.8u nose to tail)
      const geo = new THREE.SphereGeometry(1, 8, 6);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.55, emissive: 0x143f08, emissiveIntensity: 0.5,
      });
      const im = new THREE.InstancedMesh(geo, mat, N * SEG);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      // banded scales: dark head, then alternating two greens down the body
      const CB = new THREE.Color();
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < SEG; j++) {
          im.setColorAt(i * SEG + j, CB.setHex(j === 0 ? 0x2c7a10 : j % 2 ? 0x46b81e : 0x5fd22e));
        }
      }
      w.scene.add(im);
      const M = new THREE.Matrix4();
      const Q = new THREE.Quaternion();
      const P = new THREE.Vector3();
      const E2 = new THREE.Vector3(); // per-segment scale
      const snakes = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + rand(-0.12, 0.12);
        snakes.push({
          x: f.pos.x, y: f.pos.y + 1.2, z: f.pos.z,
          a, vy: rand(5, 11), spd: rand(8, 12), ph: rand(TAU),
          turnT: rand(0.2, 0.7),  // wander re-heading timer
          state: 'fly', done: false,
          // lunge bookkeeping
          lx: 0, ly: 0, lz: 0, lt: 0, prey: null,
          // latch bookkeeping: where on the body the fangs are planted
          attachA: 0, attachY: 0, latchT: rand(2.4, 3.8),
        });
      }
      // brood lifecycle: fly out -> WANDER (spreading) for the first couple
      // of seconds -> HUNT the nearest enemy -> LEAP at the face/upper body
      // -> stay LATCHED, fangs in, until the snake expires. The brood never
      // times out on its own — it prowls until everyone has found a target,
      // no target exists, or the round sweeps it (60s failsafe).
      const SPREAD = 2.0;
      const pinUntil = new Map(); // victim -> venom-pin deadline (first latch)
      // ONE PIN PER VICTIM PER CAST. The deadline used to be deleted when it
      // expired, so every later latch pinned again: sixty snakes prowling for
      // up to a minute could hold a 1v1 victim far past the stated 2.4 s.
      const pinned = new Set();
      let t = 0;
      w.addUpdater((dt) => {
        t += dt;
        let prowling = 0;
        for (let i = 0; i < N; i++) {
          const s = snakes[i];
          if (s.done) {
            M.makeScale(0, 0, 0);
            for (let j = 0; j < SEG; j++) im.setMatrixAt(i * SEG + j, M);
            continue;
          }
          let heading = s.a, pitch = 0;
          if (s.state === 'fly') {
            prowling++;
            s.x += Math.sin(s.a) * s.spd * dt;
            s.z += Math.cos(s.a) * s.spd * dt;
            s.vy -= 30 * dt;
            s.y += s.vy * dt;
            if (s.y <= 0.12) { s.y = 0.12; s.state = 'slither'; }
          } else if (s.state === 'slither') {
            prowling++;
            const prey = nearestEnemyTo(f, s.x, s.z);
            const pd = prey
              ? Math.hypot(w.wrapDelta(prey.pos.x - s.x), w.wrapDelta(prey.pos.z - s.z)) : Infinity;
            if (prey && pd < 3.6 + prey.hitRadius) {
              // close enough: LEAP at the face
              s.state = 'lunge';
              s.prey = prey;
              s.lt = 0;
              if (Math.random() < 0.25) f.sfx('dart');
            } else if (t > SPREAD && prey) {
              // hunting: fast, tight pursuit (turn rate high enough to
              // actually close on a strafing mech, no more orbiting)
              const want = Math.atan2(w.wrapDelta(prey.pos.x - s.x), w.wrapDelta(prey.pos.z - s.z));
              // angleDiff(from, to): the delta that turns FROM onto TO
              s.a += clamp(angleDiff(s.a, want), -9 * dt, 9 * dt);
              s.spd = Math.min(15, s.spd + dt * 6);
            } else {
              // spreading out: loose random prowl
              s.turnT -= dt;
              if (s.turnT <= 0) {
                s.turnT = rand(0.35, 0.9);
                s.a += rand(-1.2, 1.2);
              }
              s.spd = Math.max(8, s.spd - dt * 4);
            }
            heading = s.a + Math.sin(t * 11 + s.ph) * 0.5; // the slither
            s.x += Math.sin(heading) * s.spd * dt;
            s.z += Math.cos(heading) * s.spd * dt;
            s.x = w.wrapCoord(s.x);
            s.z = w.wrapCoord(s.z);
            s.y = 0.12;
          } else if (s.state === 'lunge') {
            prowling++;
            const prey = s.prey;
            if (!prey || !prey.alive) { s.state = 'slither'; s.prey = null; }
            else {
              // airborne strike arcing up at the head — tracks the target
              s.lt += dt;
              const k = Math.min(1, s.lt / 0.3);
              const face = P.set(
                s.x + w.wrapDelta(prey.pos.x - s.x),
                prey.pos.y + prey.height * rand(0.72, 0.88),
                s.z + w.wrapDelta(prey.pos.z - s.z));
              s.x += (face.x - s.x) * Math.min(1, dt * (4 + 26 * k));
              s.z += (face.z - s.z) * Math.min(1, dt * (4 + 26 * k));
              s.y += (face.y + Math.sin(k * Math.PI) * 1.6 - s.y) * Math.min(1, dt * 14);
              heading = s.a = Math.atan2(w.wrapDelta(prey.pos.x - s.x) || 0.01, w.wrapDelta(prey.pos.z - s.z) || 0.01);
              pitch = -0.5 * k; // nose-down onto the mark
              const dx = w.wrapDelta(prey.pos.x - s.x), dz = w.wrapDelta(prey.pos.z - s.z);
              if (Math.hypot(dx, dz) < prey.hitRadius * 0.9 && Math.abs(s.y - face.y) < 1.6) {
                // FANGS IN — bite damage + venom, and the snake STAYS
                s.state = 'latched';
                s.attachA = Math.atan2(-dx || 0.01, -dz || 0.01); // side it struck from
                s.attachY = clamp((s.y - prey.pos.y) / prey.height, 0.55, 0.9);
                prey.takeHit(u.dmg * f.dmgMult(), f, { 
                  knock: 0.6, srcPos: P.set(s.x, s.y, s.z), soft: true,
                  status: { poison: (u.poison || 8) * f.dmgMult(), poisonT: u.poisonT || 3 },
                });
                w.effects.impactSparks(P.set(s.x, s.y, s.z), 0x5aff2e, 6, 5);
                if (Math.random() < 0.35) f.sfx('slash');
                if (!pinned.has(prey)) {
                  pinned.add(prey);
                  pinUntil.set(prey, t + (u.paralyze || 2.4));
                  f.sfx('dart');
                }
              } else if (s.lt > 0.7) {
                s.state = 'slither'; // whiffed the leap — back to the hunt
                s.y = 0.12;
              }
            }
          } else if (s.state === 'latched') {
            const prey = s.prey;
            s.latchT -= dt;
            if (!prey || !prey.alive || s.latchT <= 0) {
              // spent: the snake dissolves off the body
              s.done = true;
              w.effects.glows.emit(s.x, s.y, s.z, 0, 1.5, 0,
                { life: 0.3, size: 0.9, color: 0x5aff2e, alpha: 0.8, grow: -1 });
              continue;
            }
            // ride the victim, fangs planted in the upper body, tail thrashing
            const r = prey.hitRadius * 0.7;
            s.x = prey.pos.x + Math.sin(s.attachA) * r;
            s.z = prey.pos.z + Math.cos(s.attachA) * r;
            s.y = prey.pos.y + prey.height * s.attachY;
            heading = s.attachA + Math.PI + Math.sin(t * 9 + s.ph) * 0.3; // head buried inward
            pitch = -0.35;
          }
          // lay the body out segment by segment behind the head — a
          // travelling sine wave down the spine is the slither itself
          const hx = Math.sin(heading), hz = Math.cos(heading);
          const wig = s.state === 'latched' ? 0.1 : 0.3; // coiled bodies hold still
          for (let j = 0; j < SEG; j++) {
            const sr = SEG_R[j];
            let px, py, pz;
            if (s.state === 'latched') {
              // coiled AROUND the victim: segments wrap along the body arc
              const prey = s.prey;
              const aa = s.attachA + j * 0.42 + Math.sin(t * 6 + s.ph) * 0.06;
              const r = prey.hitRadius * 0.72;
              px = prey.pos.x + Math.sin(aa) * r;
              pz = prey.pos.z + Math.cos(aa) * r;
              py = prey.pos.y + prey.height * s.attachY - j * 0.16;
            } else {
              const lat = j === 0 ? 0 : Math.sin(t * 10 + s.ph - j * 1.05) * wig;
              px = s.x - hx * SEG_SP * j + hz * lat;
              pz = s.z - hz * SEG_SP * j - hx * lat;
              py = s.state === 'slither' ? 0.02 + sr
                : Math.max(0.02 + sr, s.y - j * 0.14 * (1 + pitch * -2));
            }
            M.compose(P.set(px, py, pz), Q.identity(), E2.set(sr * 1.15, sr * 0.85, sr * 1.45));
            im.setMatrixAt(i * SEG + j, M);
          }
        }
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        // venom pin: a freshly-bitten victim seizes up while the brood piles on
        for (const [v, until] of pinUntil) {
          if (t > until || !v.alive) { pinUntil.delete(v); continue; }
          if (v.state !== 'launched' && v.state !== 'frozen') {
            v.setState('hitstun', 0.3);
            v.vel.x *= 0.6;
            v.vel.z *= 0.6;
            if (Math.random() < 0.5) {
              v.animator.addImpulse('torso', [rand(-0.2, 0.2), 0, rand(-0.2, 0.2)], 44, 9);
            }
          }
        }
        const anyAlive = snakes.some((s) => !s.done);
        // the brood outlives Viper; it only stands down when spent, when
        // nobody is left to hunt, or at the 60s failsafe
        if (!anyAlive || t > 60) return false;
        if (prowling > 0 && !f.nearestEnemy()) return false;
        return true;
      }, () => { w.scene.remove(im); geo.dispose(); mat.dispose(); });
    });
  },


  // RHINO: he becomes a CROWD — ten of him shoulder to shoulder, and the
  // whole herd thunders forward flattening everything on the line
  stampede(f, u) {
    const w = f.world;
    const COPIES = (u.copies || 10) - 1; // he leads the charge himself
    f.faceNearestEnemyIfClose(90, true);
    const spd = f.def.stats.speed * 3.6;
    const DUR = (u.range || 46) / spd;
    cast(f, 'chargeLean', { state: 'ult', stateT: DUR + 0.25 });
    f.iframes = 0.5;
    f.sfx('powerup');
    f.sfx('charge');
    const dirX = Math.sin(f.yaw), dirZ = Math.cos(f.yaw);
    const hitAt = new Map(); // herd-wide: nobody gets trampled twice in a beat
    let t = 0;
    // py = the trampler's own foot height: the herd runs along the FLOOR, so
    // anyone above the horns (mid-jump, hovering) is overflown, not hit
    const trample = (px, pz, py) => {
      for (const e of w.fighters) {
        if (e === f || !e.alive || f.isAllyOf(e)) continue;
        if (t - (hitAt.get(e) ?? -9) < 0.45) continue;
        const dx = w.wrapDelta(e.pos.x - px), dz = w.wrapDelta(e.pos.z - pz);
        if (Math.hypot(dx, dz) < 3.4 * f.scale && overlapsY(e, py, f.height)) {
          hitAt.set(e, t);
          e.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true,
            knock: u.knock, launch: 9, srcPos: P2.set(px, 0, pz), heavy: true,
          });
          w.engine.addHitStop(0.06);
          w.effects.addShake(0.5);
        }
      }
    };
    const P2 = new THREE.Vector3();
    // bake the herd a beat in, once the charge lean has taken the pose
    w.schedule(0.18, () => {
      if (!f.alive) return;
      const shells = [];
      for (let i = 0; i < COPIES; i++) {
        const g = bakeShell(f);
        const lane = (i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2); // ±1 ±1 ±2 ±2...
        const off = lane * 3.3 + rand(-0.4, 0.4);
        g.position.set(
          f.pos.x + dirZ * off - dirX * rand(0.5, 4),
          0,
          f.pos.z - dirX * off - dirZ * rand(0.5, 4)
        );
        g.rotation.y = f.yaw;
        w.scene.add(g);
        // each one arrives from elsewhere — a hot flash as it materializes
        summonFlash(w, g, 0xffd9a0, 0.5);
        w.effects.impactSparks(
          _v.set(g.position.x, 2.2, g.position.z), 0xffd23c, 10, 7);
        shells.push({ g, ph: rand(TAU) });
      }
      f.sfx('cast');
      w.addUpdater((dt) => {
        t += dt;
        // the real Rhino gallops point
        if (f.alive && f.state === 'ult') {
          f.vel.x = dirX * spd;
          f.vel.z = dirZ * spd;
          // same carriage as the bull rush, so the same legs: `_charging` is
          // what tells the animator this rooted state is still travelling
          // under its own power, so the run cycle drives the lower body while
          // chargeLean holds the horn down. Without it he skates.
          f._charging = true;
          trample(f.pos.x, f.pos.z, f.pos.y);
          if (Math.random() < 0.6) w.effects.dustPuff(f.pos, 2, 0x9a9088);
        }
        for (const s of shells) {
          s.g.position.x += dirX * spd * dt;
          s.g.position.z += dirZ * spd * dt;
          s.g.position.y = Math.abs(Math.sin(t * 11 + s.ph)) * 0.45;
          s.g.rotation.x = 0.1 + Math.sin(t * 11 + s.ph) * 0.05;
          if (Math.random() < 0.4) w.effects.dustPuff(s.g.position, 1, 0x9a9088);
          trample(s.g.position.x, s.g.position.z, s.g.position.y);
          // the herd wrecks facades too
          if (Math.random() < 0.25) {
            _v.set(s.g.position.x + dirX * 2, 2, s.g.position.z + dirZ * 2);
            w.arena?.damageSphere(_v, 3, 40, null, true);
          }
        }
        if (t > DUR || !f.alive) return false;
        return true;
      }, () => {
        for (const s of shells) w.scene.remove(s.g);
        f._charging = false;              // the gallop is over — legs back to normal
      });
    });
  },

  // TEMPEST: a WALL of weather — a solid deck of black cloud lumps rolls in
  // over a huge circle, the whole scene DARKENS beneath it, and bolts
  // hammer down out of the deck onto everyone caught in the gloom
  thunderfall(f, u) {
    const w = f.world;
    cast(f, 'castRaise', {
      state: 'ult',
      onFire: () => {
        const center = f.pos.clone();
        center.y = 0;
        const R = u.radius, DECK = 20;
        f.sfx('thunder');
        w.effects.rings.spawn(center, { from: 1, to: R * 2, dur: 0.9, color: 0x53e8ff, y: 0.4 });
        // THE DECK: real meshes, not particles — a churning lid of black
        // cloud lumps that genuinely blots out the sky over the zone
        const deck = new THREE.Group();
        const cmat = new THREE.MeshStandardMaterial({
          color: 0x121620, roughness: 1, metalness: 0,
          transparent: true, opacity: 0, flatShading: true,
        });
        const cgeo = new THREE.SphereGeometry(1, 9, 6);
        const lumps = [];
        for (let i = 0; i < 34; i++) {
          const m = new THREE.Mesh(cgeo, cmat);
          const a = rand(TAU), r = Math.sqrt(Math.random()) * R * 0.95;
          m.position.set(Math.cos(a) * r, DECK + rand(-1.6, 1.6), Math.sin(a) * r);
          m.scale.set(rand(7, 13), rand(2.4, 3.6), rand(7, 13));
          m.rotation.y = rand(TAU);
          deck.add(m);
          lumps.push({ m, dx: rand(-0.7, 0.7), dz: rand(-0.7, 0.7) });
        }
        deck.position.set(center.x, 0, center.z);
        w.scene.add(deck);
        // the whole scene goes STORM-DARK underneath (refcounted so two
        // overlapping storms restore the lights exactly once)
        const eng = w.engine;
        if (!w._stormDim) {
          w._stormDim = 0;
          w._stormLight = { sun: eng.sun.intensity, hemi: eng.hemi.intensity, rim: eng.rim.intensity };
        }
        w._stormDim++;
        const bolt = (gx, gz, victim) => {
          const top = new THREE.Vector3(gx + rand(-2.5, 2.5), DECK - 1.2, gz + rand(-2.5, 2.5));
          const ground = new THREE.Vector3(gx, 0.1, gz);
          // the cloud BASE flashes first — the bolt visibly comes from the sky
          w.effects.glows.emit(top.x, top.y - 0.5, top.z, 0, 0, 0,
            { life: 0.18, size: rand(8, 12), color: 0xdff2ff, alpha: 0.95 });
          w.effects.lightning.spawn(top, ground, { color: 0xeaffff, dur: 0.17, jag: 4, thick: 0.32 });
          w.effects.lightning.spawn(top, ground, { color: 0x9fdcff, dur: 0.22, jag: 2.6, thick: 0.15 });
          w.effects.glows.emit(gx, 1.2, gz, 0, 0, 0, { life: 0.2, size: 5.5, color: 0xbfefff, alpha: 1 });
          w.effects.rings.spawn(ground, { from: 0.4, to: 4.5, dur: 0.3, color: 0x9fdcff, y: 0.25 });
          if (victim && victim.alive) {
            victim.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true,
              knock: 2, srcPos: center, soft: true, status: { slow: 0.7, slowT: 0.8 },
            });
            w.effects.staticCling(victim, 0.8);
          }
          if (Math.random() < 0.45) f.sfx('zap');
        };
        const DURN = u.duration || 3.4;
        let t = 0, tick = 0.25;
        w.addUpdater((dt) => {
          t += dt;
          // deck rolls in, holds, then breaks up after the last bolt
          const k = clamp01(t / 0.7) * clamp01((DURN + 1.1 - t) / 0.8);
          cmat.opacity = 0.97 * k;
          const dim = 1 - 0.66 * k;
          eng.sun.intensity = w._stormLight.sun * dim;
          eng.hemi.intensity = w._stormLight.hemi * dim;
          eng.rim.intensity = w._stormLight.rim * dim;
          for (const L of lumps) {
            L.m.position.x += L.dx * dt;
            L.m.position.z += L.dz * dt;
          }
          deck.rotation.y += dt * 0.05;
          // sheet flicker INSIDE the deck between strikes
          if (Math.random() < 0.3 * k) {
            const a = rand(TAU), r = rand(0, R * 0.85);
            w.effects.glows.emit(center.x + Math.cos(a) * r, DECK - 2.4, center.z + Math.sin(a) * r,
              0, 0, 0, { life: 0.15, size: rand(4, 9), color: 0xbfdcff, alpha: 0.5 });
          }
          tick -= dt;
          if (tick <= 0 && t < DURN) {
            tick = 0.2; // 5 strikes a second on everyone in the gloom
            for (const e of w.fighters) {
              if (e === f || !e.alive || f.isAllyOf(e)) continue;
              const dx = w.wrapDelta(e.pos.x - center.x), dz = w.wrapDelta(e.pos.z - center.z);
              if (Math.hypot(dx, dz) > R) continue;
              bolt(e.pos.x + rand(-0.7, 0.7), e.pos.z + rand(-0.7, 0.7), e);
            }
            // stray groundfire sells the storm
            if (Math.random() < 0.75) {
              const a = rand(TAU), r = rand(3, R);
              bolt(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, null);
            }
          }
          return t <= DURN + 1.2;
        }, () => {
          w.scene.remove(deck);
          cgeo.dispose();
          cmat.dispose();
          if (--w._stormDim <= 0) {
            w._stormDim = 0;
            eng.sun.intensity = w._stormLight.sun;
            eng.hemi.intensity = w._stormLight.hemi;
            eng.rim.intensity = w._stormLight.rim;
          }
        });
      },
    });
  },

  // FENRIR: one howl at the sky — and the PACK answers from EVERYWHERE. Twenty
  // rifts tear open at random points across the whole arena, a low-running
  // Fenrir comes up out of each one, and every one of them runs down the
  // nearest enemy it can find.
  //
  // THE PACK IS NOT A SHOCKWAVE, IT IS A HUNT, and that is what the two
  // lifetimes are for. A wolf that has drawn blood has done its job and leaves
  // at `duration`; one that has NOT keeps hunting up to `huntMax` (10s), so a
  // wolf that spawned on the far side of the block still arrives instead of
  // evaporating halfway there. Landing the first bite past `duration` therefore
  // ends that wolf on the spot, which is exactly "it stays until it gets an
  // attack in".
  wildHunt(f, u) {
    const w = f.world;
    cast(f, 'castRaise', { state: 'ult', stateT: 1.2, speed: 1.1 });
    f.sfx('howl');
    w.effects.rings.spawn(f.pos, { from: 0.5, to: u.radius, dur: 0.9, color: 0x6cd8ff, y: 0.8 });
    // drop into the hunting crouch right before the pack bakes off him
    w.schedule(0.45, () => { if (f.alive) f.animator.play('lunge', { speed: 0.6 }); });
    w.schedule(0.62, () => {
      if (!f.alive) return;
      const N = u.count || 20;
      const DUR = u.duration || 4.5;      // a wolf that has bitten leaves here
      const HUNT = Math.max(DUR, u.huntMax || 10); // one that has not, here
      const wolves = [];
      // WHERE THE PACK COMES FROM: the whole cell, not the alpha's feet. The
      // spread is the arena's own extent (the toroidal half-period is the
      // outer bound), and each rift keeps clear of Fenrir himself so the
      // pack reads as converging on the fight rather than pouring off him.
      const R = u.spread || Math.min(w.wrapHalf ? w.wrapHalf * 0.8 : 40, (w.arena?.bounds || 40) * 0.95);
      f.sfx('cast');
      for (let i = 0; i < N; i++) {
        const g = bakeShell(f);
        g.userData.wildHunt = true;   // the pack is inspectable (tools/scratch/hunt.mjs)
        g.rotation.x = 0.5; // pitched down onto all fours
        g.scale.setScalar(0.92);
        // scattered over the disc — sqrt keeps them evenly spread by AREA
        // instead of piling up in the middle
        const a = (i / N) * TAU + rand(-0.35, 0.35);
        const r = R * (0.28 + 0.72 * Math.sqrt(Math.random()));
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        g.position.set(x, 0.2, z);
        g.visible = false; // still on the far side of the rift
        w.scene.add(g);
        // face the hunt from the moment it lands
        const prey = nearestEnemyTo(f, x, z);
        const yaw = prey
          ? Math.atan2(w.wrapDelta(prey.pos.x - x), w.wrapDelta(prey.pos.z - z))
          : Math.atan2(w.wrapDelta(f.pos.x - x), w.wrapDelta(f.pos.z - z));
        wolves.push({
          g, yaw, turnT: 0, spd: rand(16, 22), ph: rand(TAU), fed: false,
          rift: 0.05 + i * 0.06,   // its own rift opens here…
          delay: 0.35 + i * 0.06,  // …and it comes up out of it here
          rise: 0, out: 0, gone: false,
        });
      }
      f.animator.stop(0.2);
      const hitAt = new Map(); // pack-wide bite cadence per victim
      let t = 0;
      w.addUpdater((dt) => {
        t += dt;
        let live = 0;
        for (const wl of wolves) {
          if (wl.gone) continue;
          live++;
          // every wolf tears its OWN rift, wherever it happens to be standing
          if (wl.rift > 0) {
            wl.rift -= dt;
            if (wl.rift <= 0) {
              summonPortal(w, wl.g.position.x, wl.g.position.z,
                { radius: 2.4, color: 0x6cd8ff, life: 1.5 });
            }
          }
          // staggered emergence: each wolf leaps up out of its own rift
          if (wl.delay > 0) {
            wl.delay -= dt;
            if (wl.delay > 0) continue;
            wl.g.visible = true;
            summonFlash(w, wl.g, 0x9be8ff, 0.4);
            w.effects.impactSparks(wl.g.position, 0x6cd8ff, 8, 7);
            if (Math.random() < 0.3) f.sfx('howl', { vol: 0.2, pitch: rand(1.1, 1.5) });
          }
          if (wl.rise < 1) {
            wl.rise = Math.min(1, wl.rise + dt / 0.24);
            const k = ss(wl.rise);
            wl.g.position.y = -1.8 + 2.3 * k;
            wl.g.position.x += Math.sin(wl.yaw) * wl.spd * dt * k;
            wl.g.position.z += Math.cos(wl.yaw) * wl.spd * dt * k;
            wl.g.rotation.y = wl.yaw;
            wl.g.rotation.x = 0.5 - (1 - k) * 0.4; // nose-up as it clears the rift
            continue;
          }
          // ---- its time is up: sink back into the ground it came out of ----
          if (wl.out > 0 || t >= (wl.fed ? DUR : HUNT)) {
            if (wl.out === 0) w.effects.impactSparks(wl.g.position, 0x6cd8ff, 8, 6);
            wl.out += dt / 0.3;
            const k = ss(clamp01(wl.out));
            wl.g.position.x += Math.sin(wl.yaw) * wl.spd * dt * (1 - k);
            wl.g.position.z += Math.cos(wl.yaw) * wl.spd * dt * (1 - k);
            wl.g.position.y = 0.15 - 2.4 * k;
            wl.g.scale.setScalar(0.92 * (1 - 0.25 * k));
            if (wl.out >= 1) { wl.gone = true; w.scene.remove(wl.g); live--; }
            continue;
          }
          wl.turnT -= dt;
          const px = wl.g.position.x, pz = wl.g.position.z;
          if (wl.turnT <= 0) {
            // RUN AT THE NEAREST ENEMY. Not a wander with a bias — a hunt: the
            // wolf re-picks whoever is closest to IT (not to the alpha) and
            // takes the line to them, with just enough jitter that twenty of
            // them do not travel as one arrow.
            wl.turnT = rand(0.2, 0.4);
            const prey = nearestEnemyTo(f, px, pz);
            if (prey) {
              wl.yaw = Math.atan2(w.wrapDelta(prey.pos.x - px), w.wrapDelta(prey.pos.z - pz)) + rand(-0.25, 0.25);
            } else {
              const homeDx = w.wrapDelta(f.pos.x - px), homeDz = w.wrapDelta(f.pos.z - pz);
              wl.yaw = Math.hypot(homeDx, homeDz) > u.radius
                ? Math.atan2(homeDx, homeDz) + rand(-0.6, 0.6) // circle back to the hunt
                : rand(TAU);
            }
          }
          wl.g.position.x += Math.sin(wl.yaw) * wl.spd * dt;
          wl.g.position.z += Math.cos(wl.yaw) * wl.spd * dt;
          wl.g.position.y = 0.15 + Math.abs(Math.sin(t * 13 + wl.ph)) * 0.5; // the gallop
          wl.g.rotation.y = wl.yaw;
          wl.g.rotation.x = 0.5 + Math.sin(t * 13 + wl.ph) * 0.09;
          // bites and claws on the way through
          for (const e of w.fighters) {
            if (e === f || !e.alive || f.isAllyOf(e)) continue;
            if (t - (hitAt.get(e) ?? -9) < 0.25) continue;
            const dx = w.wrapDelta(e.pos.x - wl.g.position.x), dz = w.wrapDelta(e.pos.z - wl.g.position.z);
            // they run on all fours, so their bite tops out well below a
            // standing mech's full height — no snapping at an airborne target
            if (Math.hypot(dx, dz) < e.hitRadius + 1.2 &&
                overlapsY(e, wl.g.position.y, f.height * 0.7)) {
              hitAt.set(e, t);
              wl.fed = true; // it has had its bite — it may leave at DUR now
              e.takeHit(u.dmg * f.dmgMult(), f, { knock: 3, srcPos: wl.g.position, soft: Math.random() < 0.7 });
              w.effects.impactSparks(e.center(), 0x6cd8ff, 6, 6);
              if (Math.random() < 0.25) f.sfx('slash');
            }
          }
        }
        if (Math.random() < 0.02) f.sfx('howl', { vol: 0.3, pitch: rand(0.9, 1.3) });
        return live > 0 && t <= HUNT + 1 && f.alive;
      }, () => {
        for (const wl of wolves) if (!wl.gone) w.scene.remove(wl.g);
      });
    });
  },

  // COLOSSUS: no shell this time — HE is the ordnance. He grows to four
  // times his height and simply walks through the fight, flattening
  // whatever he steps on or shoulders into.
  colossalForm(f, u) {
    if (f._giantK) return; // already grown
    const w = f.world;
    f._giantK = true;
    cast(f, 'burst', { state: 'ult', stateT: 1.3 });
    f.sfx('powerup');
    w.effects.rings.spawn(f.pos, { from: 1, to: 12, dur: 0.7, color: 0xffd23c, y: 0.5 });
    const base = { scale: f.scale, h: f.baseHeight, hr: f.baseHitRadius, r: f.radius };
    const S = u.scale || 4;
    const GROW = 1.3, DUR = u.duration || 9;
    f.status.buff = { spd: 1.3, dmg: 1.4, t: DUR };
    let t = 0, crushT = 0, lastStep = null;
    const apply = (s) => {
      f.group.scale.setScalar(s);
      f.scale = base.scale * s;
      f.baseHeight = base.h * s;
      f.baseHitRadius = base.hr * s;
      f.radius = base.r * s;
      // Tell the animation layer how big he is right now. Without it the walk
      // keeps its small-body cadence — four strides for one stride's worth of
      // ground, feet skating — and every clip's leg swing covers four times
      // the distance in the same instant. See Animator.sizeMul.
      if (f.animator) f.animator.sizeMul = s;
    };
    w.addUpdater((dt) => {
      t += dt;
      let k;
      if (t < GROW) k = ss(t / GROW);
      else if (t < DUR - 1.1) k = 1;
      else k = ss(clamp01((DUR - t) / 1.1));
      if (!f.alive) k = Math.min(k, Math.max(0, 1 - (t - DUR) )); // dead: just end
      apply(1 + (S - 1) * k);
      if (f.alive && k > 0.25) {
        // everything underfoot is a casualty
        crushT -= dt;
        if (crushT <= 0) {
          crushT = 0.28;
          for (const e of w.fighters) {
            if (e === f || !e.alive || f.isAllyOf(e)) continue;
            const d = Math.hypot(w.wrapDelta(e.pos.x - f.pos.x), w.wrapDelta(e.pos.z - f.pos.z));
            if (d < f.radius + e.radius + 1 && e.pos.y < f.height * 0.55) {
              e.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true, knock: 20, launch: 8, srcPos: f.pos, heavy: true });
              w.effects.dustPuff(e.pos, 6);
            }
          }
          _v.set(f.pos.x, f.pos.y + 1.5, f.pos.z);
          w.arena?.damageSphere(_v, f.radius * 1.9, 55 * k, null, true);
        }
        // THUNDERING FOOTFALLS, ON THE ACTUAL FOOTFALLS. This used to be a
        // fixed 0.38s metronome, which was roughly a walking mech's cadence —
        // but a giant's stride is now several times longer (Animator.sizeMul),
        // so a timer drums out steps he isn't taking. Ride the gait phase
        // instead: one plant per half cycle, whenever that happens to be.
        if (f.grounded && Math.hypot(f.vel.x, f.vel.z) > 3) {
          const step = Math.floor((f.animator?.phase || 0) / Math.PI);
          if (lastStep === null) lastStep = step;
          else if (step !== lastStep) {
            lastStep = step;
            w.effects.dustPuff(f.pos, 6, 0x9a9088);
            w.effects.addShake(0.3 * k);
            f.sfx('slam', { vol: 0.35 });
          }
        } else {
          lastStep = null;   // re-seed on the next step so a stop doesn't fire one
        }
      }
      return t <= DUR;
    }, () => {
      apply(1);
      f._giantK = false;
    });
  },

  // WRAITH: DEATH SWARM — THE LOOM, AND THEN THE FLOCK MEANS IT.
  //
  // This is his TAUNT, cashed in. The taunt is the whole apparition act — he
  // draws himself up half-transparent to `tauntGrow` his own height, wisps
  // coming off him and single bats peeling away the entire time, and then the
  // giant is peeled off as a frozen shell that keeps growing as it fades while
  // he walks out of it at his own size, coming apart into a burst of bats
  // (Fighter.growTaunt / disperseGiant). Every bit of that is driven off the
  // clip NAME, so the ult gets it by playing his taunt clip and then letting go
  // of it — one implementation, not two, and a change to the taunt moves both.
  //
  // THE DIFFERENCE IS WHAT THE BATS DO. The taunt's flock is particles that
  // climb away and thin out; this one is a real gyre that wheels around him
  // and takes turns STOOPING on whatever he hates. Same bat, though — the
  // flock is drawn with the taunt's own bat atlas as camera-facing sprites
  // (see BAT_VERT), so the swarm that arrives is visibly the swarm he just
  // came apart into.
  deathSwarm(f, u) {
    const w = f.world;
    const N = u.count || 150;
    const LOOM = u.loom || 1.5;   // how long he stands there as the apparition
    f.setState('ult', LOOM + 0.35);
    f.sfx('howl');
    f.sfx('cloak');
    // the eye flares as he swells
    const eye = f.mech.anchors.eye?.getWorldPosition(new THREE.Vector3()) || f.center();
    w.effects.glows.emit(eye.x, eye.y, eye.z, 0, 0, 0,
      { life: 0.4, size: 4, color: 0xff2030, alpha: 0.95 });
    w.effects.rings.spawn(f.pos, { from: 0.5, to: 9, dur: 0.6, color: 0x8a2030, y: f.height * 0.7 });
    // THE LOOM. growTaunt/iceTaunt/arcTaunt all key on the clip being named
    // `taunt`, which is exactly what makes "a hit interrupts it" free here too:
    // a hit swaps the clip for the flinch and the giant hands itself over on
    // its own next frame, with disperseGiant's minK guard covering a loom that
    // never really got going.
    f.animator?.play('taunt');
    w.schedule(LOOM, () => {
      if (!f.alive) return;
      // let go of the taunt clip — the apparition comes apart into bats by
      // itself (growTaunt sees `taunting()` go false and disperses)
      if (f.taunting()) f.animator.stop(0.12);
      deathFlock(f, u, N);
    });
  },


  // INFERNO: he conjures a FIRE TORNADO that wanders after his enemies,
  // belching flame and smoke, growing as it goes — and whoever it finally
  // catches gets ripped into the sky inside the funnel
  fireTornado(f, u) {
    const w = f.world;
    cast(f, 'burst', {
      state: 'ult',
      onFire: () => {
        const pos = fwd(f, 5);
        pos.y = 0;
        f.sfx('flame');
        f.sfx('whooshBig');
        let t = 0, r = 1.6, swept = null, sweptT = 0, fpT = 0.4;
        // the funnel itself is a FireTornadoFX (helical shader shells +
        // ember spiral + burning base); spawnTornado owns its lifecycle,
        // this updater steers it and runs the hunt/sweep gameplay
        const tornadoTint = fireTint(f.def);
        const fx = new FireTornadoFX(w.scene, w.effects, pos, {
          height: f.height * 3, radius: 1.0, wander: 0, tint: fireTint(f.def),
        });
        w.spawnTornado(fx);
        w.addUpdater((dt) => {
          t += dt;
          r = Math.min(u.radius || 4.5, r + dt * 0.5); // growing larger and larger
          const H = Math.min(f.height * 3, 7 + r * 2.8); // caps at 3x his height
          fx.setPose(pos);
          fx.height = H;
          fx.radius = 0.35 + r * 0.38; // waist widens as the funnel grows
          // it hunts (until it has swallowed someone)
          if (!swept) {
            const prey = nearestEnemyTo(f, pos.x, pos.z);
            if (prey) {
              const dx = w.wrapDelta(prey.pos.x - pos.x), dz = w.wrapDelta(prey.pos.z - pos.z);
              const d = Math.hypot(dx, dz) || 1;
              pos.x += (dx / d) * 6.5 * dt;
              pos.z += (dz / d) * 6.5 * dt;
            }
          }
          // extra spiraling ribbons riding the shader funnel (the shells,
          // embers, base fire and smoke crown come from the FX itself)
          for (let i = 0; i < 2; i++) {
            const a = rand(TAU), h = Math.random() ** 1.3 * H;
            const rr = (0.3 + 0.7 * (h / H)) * r * rand(0.75, 1.05);
            const tang = a + Math.PI / 2;
            w.effects.glows.emit(pos.x + Math.cos(a) * rr, h, pos.z + Math.sin(a) * rr,
              Math.cos(tang) * rand(10, 16), rand(2, 6), Math.sin(tang) * rand(10, 16),
              { life: rand(0.22, 0.45), size: rand(0.9, 1.9),
                color: tornadoTint
                  ? tornadoTint.stops[h < H * 0.45 ? 2 : 1]
                  : (h < H * 0.45 ? 0xff7a20 : 0xff4210), alpha: 0.92, drag: 0.4 });
          }
          // it BELCHES: gouts of flame spat out of the wall, burning ground
          if (Math.random() < 0.12) {
            const a = rand(TAU);
            w.effects.fire(new THREE.Vector3(pos.x, rand(1, 4), pos.z),
              new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)), 24, 0.4, tornadoTint);
          }
          fpT -= dt;
          if (fpT <= 0) {
            fpT = 1.2;
            w.addFirePatch(f, new THREE.Vector3(pos.x + rand(-r, r) * 0.5, 0, pos.z + rand(-r, r) * 0.5), 2.0, 2.2, 8);
            if (Math.random() < 0.6) f.sfx('flame');
          }
          w.arena?.damageSphere(_v.set(pos.x, 2, pos.z), r * 1.2, 26 * dt * 8, null, true);
          if (!swept) {
            // the catch
            for (const e of w.fighters) {
              if (e === f || !e.alive || f.isAllyOf(e)) continue;
              const dx = w.wrapDelta(e.pos.x - pos.x), dz = w.wrapDelta(e.pos.z - pos.z);
              if (Math.hypot(dx, dz) < r + e.hitRadius * 0.5 && e.pos.y < H) {
                swept = e;
                sweptT = 0;
                e.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true,
                  knock: 3, launch: 14, srcPos: pos, heavy: true, status: { burn: 10, burnT: 3 },
                });
                f.sfx('explosionBig');
                w.effects.addShake(0.8);
                break;
              }
            }
          } else {
            // swept UP into the sky, riding the funnel wall
            sweptT += dt;
            if (swept.alive && sweptT < 1.3) {
              const a = sweptT * 8.5;
              swept.pos.x = pos.x + Math.cos(a) * r * 0.55;
              swept.pos.z = pos.z + Math.sin(a) * r * 0.55;
              swept.pos.y = Math.min(swept.pos.y + 15 * dt, H + 5);
              swept.vel.set(0, 2, 0);
              swept.grounded = false;
              swept.setState('launched', 3);
              if (Math.random() < 0.6) {
                w.effects.glows.emit(swept.pos.x, swept.pos.y + rand(0, swept.height), swept.pos.z,
                  0, 3, 0, { life: 0.3, size: 1.4, color: 0xff7a20, alpha: 0.9 });
              }
            } else {
              // hurled clear at the top; the tornado gutters out
              if (swept.alive) {
                const a = rand(TAU);
                swept.vel.set(Math.cos(a) * 9, 5, Math.sin(a) * 9);
              }
              fx.extinguish(0.9);
              return false;
            }
          }
          if (t > (u.duration || 7)) { fx.extinguish(0.9); return false; }
          return true;
        }, () => fx.extinguish(0.3)); // round sweep: gutter out, world disposes
      },
    });
  },

  // GLACIER: flash-freezes a huge round sheet of ground ahead — everything
  // inside turns white. Anyone else on the sheet frosts over, takes cold
  // damage, and skates helplessly on the glass
  absoluteZero(f, u) {
    const w = f.world;
    const dur = cast(f, 'burst', {
      state: 'ult',
      onFire: () => {
        const center = fwd(f, u.radius * 0.75);
        center.y = w.arena?.terrainHeightAt?.(center.x, center.z) || 0;
        f.sfx('freezeBig');
        const geo = new THREE.CircleGeometry(u.radius, 44);
        const mat = new THREE.MeshStandardMaterial({
          color: 0xdceefc, roughness: 0.14, metalness: 0.05,
          transparent: true, opacity: 0, emissive: 0x9fc8e8, emissiveIntensity: 0.07,
        });
        const sheet = new THREE.Mesh(geo, mat);
        sheet.rotation.x = -Math.PI / 2;
        sheet.position.set(center.x, center.y + 0.08, center.z);
        w.scene.add(sheet);
        w.effects.rings.spawn(center, { from: 1, to: u.radius * 2, dur: 0.7, color: 0x9be8ff, y: 0.4 });
        for (let i = 0; i < 26; i++) {
          const a = rand(TAU), r = rand(1, u.radius);
          w.effects.glows.emit(center.x + Math.cos(a) * r, 0.4, center.z + Math.sin(a) * r,
            0, rand(1, 3), 0, { life: rand(0.4, 0.9), size: rand(1, 2.2), color: 0xd8f4ff, alpha: 0.85 });
        }
        // the sheet is PERMANENT: it stays down until the round-end sweep
        // (or a finisher) runs the cleanup below — even if Glacier falls
        let t = 0, tick = 0;
        const iced = new Map(); // victim -> {phase, t, vx, vz, cd}
        w.addUpdater((dt) => {
          t += dt;
          mat.opacity = 0.62 * clamp01(t / 0.3);
          // ambient frost shimmer
          if (Math.random() < 0.4) {
            const a = rand(TAU), r = rand(0, u.radius);
            w.effects.glows.emit(center.x + Math.cos(a) * r, 0.3, center.z + Math.sin(a) * r,
              0, rand(0.5, 1.5), 0, { life: 0.5, size: rand(0.5, 1.2), color: 0xeaf8ff, alpha: 0.7 });
          }
          // stepping ON the ice: flash-frozen for a beat while the body
          // whites out — then the thaw releases them INTO the slide, still
          // carrying whatever momentum they walked on with (glass underfoot)
          for (const e of w.fighters) {
            if (e === f || !e.alive || f.isAllyOf(e)) continue;
            const d = Math.hypot(w.wrapDelta(e.pos.x - center.x), w.wrapDelta(e.pos.z - center.z));
            const onIce = d < u.radius && (e.grounded || e.pos.y < 1.5);
            let st = iced.get(e);
            if (onIce) {
              if (!st) {
                st = { phase: 'frozen', t: 0.65, vx: e.vel.x, vz: e.vel.z, cd: 0 };
                iced.set(e, st);
                if (e.state !== 'launched' && e.state !== 'frozen') {
                  e.setState('frozen', st.t); // the whiteout rides this state
                  e.vel.x = 0;
                  e.vel.z = 0;
                }
                f.sfx('freeze');
                w.effects.impactSparks(e.center(), 0x9be8ff, 10, 6);
              } else if (st.phase === 'frozen') {
                st.t -= dt;
                if (st.t <= 0 || e.state !== 'frozen') {
                  st.phase = 'slipping';
                  if (e.state === 'frozen') e.setState('normal');
                  e.vel.x = st.vx; // entry momentum carries onto the glass
                  e.vel.z = st.vz;
                }
              }
              st.cd = 0;
              e._beamWhiteT = 0.35;         // frosted white while on the sheet
              e.status.slip = { t: 0.6 };   // near-zero traction underfoot
            } else if (st) {
              // stepped off: a short grace before re-entry freezes them again
              if (st.phase === 'frozen') st.phase = 'slipping';
              st.cd += dt;
              if (st.cd > 2.2) iced.delete(e);
            }
          }
          // cold bites while standing on it
          tick -= dt;
          if (tick <= 0) {
            tick = 0.4;
            for (const e of w.fighters) {
              if (e === f || !e.alive || f.isAllyOf(e)) continue;
              if (!e.grounded && e.pos.y > 1.5) continue;
              const d = Math.hypot(w.wrapDelta(e.pos.x - center.x), w.wrapDelta(e.pos.z - center.z));
              if (d < u.radius) {
                e.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true,
                  knock: 0.5, srcPos: center, soft: true, status: { slow: 0.85, slowT: 0.5 },
                });
              }
            }
          }
          return true; // permanent — ends only via the cleanup sweep
        }, () => { w.scene.remove(sheet); geo.dispose(); mat.dispose(); });
      },
    });
    f.iframes = dur;
  },

  // CRANKY: the sea answers — a TSUNAMI rises behind him and rolls forward
  // across the whole arena front, smashing everything in its path
  tsunami(f, u) {
    const w = f.world;
    cast(f, 'castRaise', { state: 'ult', stateT: 1.5 });
    f.sfx('cast');
    const dirX = Math.sin(f.yaw), dirZ = Math.cos(f.yaw);
    const perpX = dirZ, perpZ = -dirX;
    const ox = f.pos.x, oz = f.pos.z;
    const W = u.width || 30, R = u.range || 48, H = 9, SPD = 17;
    w.schedule(0.45, () => {
      if (!f.alive) return;
      f.sfx('wave');
      f.sfx('explosionBig');
      // the wall is a real TidalWaveFX in tsunami mode: breaking-wave
      // profile, foam-by-steepness, crest spray, and a flood rectangle
      // dragged behind the front. spawnWave owns its lifecycle; this
      // updater runs the gameplay against the same travel integration.
      const fx = new TidalWaveFX(w.scene, w.effects, new THREE.Vector3(ox, 0, oz), {
        height: H, r0: -3, r1: R + 9, speed: SPD,
        dir: new THREE.Vector3(dirX, 0, dirZ), width: W,
      });
      w.spawnWave(fx);
      let travel = -3;
      const victims = new Set();
      const P = new THREE.Vector3();
      w.addUpdater((dt) => {
        travel += SPD * dt;
        if (Math.random() < 0.3) f.sfx('wave', { vol: 0.35 });
        for (const e of w.fighters) {
          if (e === f || !e.alive || f.isAllyOf(e)) continue;
          const rx = w.wrapDelta(e.pos.x - ox), rz = w.wrapDelta(e.pos.z - oz);
          const along = rx * dirX + rz * dirZ;
          const lat = rx * perpX + rz * perpZ;
          if (Math.abs(lat) > W / 2) continue;
          if (!victims.has(e) && Math.abs(along - travel) < 2.4 && e.pos.y < H) {
            // the front hits ONCE, hard, and CARRIES them downrange
            victims.add(e);
            e.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true,
              knock: u.knock, launch: 10, srcPos: P.set(e.pos.x - dirX * 3, 0, e.pos.z - dirZ * 3), heavy: true,
            });
            e.vel.x += dirX * 20;
            e.vel.z += dirZ * 20;
            e.applySoak?.(2.6);
            w.effects.splash(e.center(), 14, 9, 1.4);
            w.effects.addShake(0.7);
          } else if (along > 0 && along < travel - 2 && e.grounded) {
            // wading in the trailing floodwater: dripping wet, half speed
            e.applySoak?.(2.2);
          }
        }
        // it wrecks the street furniture too
        if (Math.random() < 0.5) {
          const lat = rand(-W / 2, W / 2);
          _v.set(ox + dirX * (travel + 1.5) + perpX * lat, 2, oz + dirZ * (travel + 1.5) + perpZ * lat);
          w.arena?.damageSphere(_v, 3.4, 70, new THREE.Vector3(dirX, 0.25, dirZ), true);
        }
        if (travel >= R) {
          // collapses into foam at the end of its run
          for (let i = 0; i < 10; i++) {
            const lat = rand(-W / 2, W / 2);
            w.effects.splash(P.set(ox + dirX * travel + perpX * lat, 0.3, oz + dirZ * travel + perpZ * lat), 5, 6, 1);
          }
          return false;
        }
        return true;
      });
    });
  },

  // SAURION: LAYS A CLUTCH. The pack does not arrive, it HATCHES — three
  // dinosaur eggs warp in around him, roll like the heavy shells they are, and
  // open one at a time (combat/eggs.js owns the egg; this owns the ult).
  //
  // WHY EGGS. Three finished raptors appearing inside a third of a second is
  // both a frame-time problem (three bodies built at once — the reported ult
  // lag) and a staging problem: the biggest move in his kit had no moment to
  // it. An egg gives the fight something to react to — the enemy can go and
  // BREAK one, and SAURION can kick one out of their way — and it gives the
  // build a two-second window per body, which is a build nobody can feel.
  //
  // The bodies come from the same pool the old version used (takeSpare), so a
  // warmed one hatches instantly and a cold one is built a second before its
  // slot rather than at the cast.
  raptorPack(f, u) {
    const w = f.world;
    cast(f, 'taunt', { state: 'ult', stateT: 1.1, speed: 1.3 });
    f.sfx('howl');
    f.sfx('powerup');
    const n = u.count || 3;
    // the clutch is laid in an arc BEHIND him, out of his own way
    volley(w, f, n, 0.3, (i) => {
      const a = f.yaw + Math.PI + (i - (n - 1) / 2) * 0.85 + rand(-0.15, 0.15);
      const pos = new THREE.Vector3(
        f.pos.x + Math.sin(a) * 4.2, 0, f.pos.z + Math.cos(a) * 4.2);
      w.eggs.spawn(f, pos, {
        height: f.baseHeight,
        // one every couple of seconds, and the queue in eggs.js keeps them
        // from bunching up if one is knocked about and lands late
        hatchIn: 2 + i * 0.4,
        prepare: () => takeSpare(f) || cloneMech(f.mech),
        onHatch: (egg) => hatchRaptor(f, u, egg),
      });
    }, { start: 0.25 });
  },

  // FROGGER: jaw drops open and a CROAK comes out — a resonant blast wave
  // that sets every nearby bot shuddering, locks their servos solid, and
  // then lets the stored resonance tear loose all at once
  sonicCroak(f, u) {
    const w = f.world;
    cast(f, 'burst', { state: 'ult', stateT: 1.4, speed: 0.8 });
    f.duckT = 1;
    f.sfx('howl', { pitch: 0.42, vol: 1 });
    f.sfx('wave', { pitch: 0.6 });
    // ribbiting shock rings pour outward at throat height
    volley(w, f, 6, 0.12, (i) => {
      w.effects.rings.spawn(f.pos, {
        from: 1, to: u.radius * 2, dur: 0.55, color: 0x9ade2a, y: 0.8 + i * 0.6,
      });
    });
    w.schedule(0.25, () => {
      if (!f.alive) return;
      w.effects.addShake(0.8);
      const caught = [];
      for (const e of w.fighters) {
        if (e === f || !e.alive || f.isAllyOf(e)) continue;
        // the croak propagates as a SPHERE, not an infinite column: measured
        // to the victim's mid-body in all three axes, so it still washes over
        // anyone jumping nearby (30 is a wide radius) but doesn't reach a bot
        // hovering far overhead the way a flat x/z radius did
        const c = e.center();
        if (Math.hypot(w.wrapDelta(c.x - f.pos.x), c.y - (f.pos.y + f.height * 0.5),
                       w.wrapDelta(c.z - f.pos.z)) < u.radius) {
          caught.push(e);
          w.effects.impactSparks(e.center(), 0x9ade2a, 8, 6);
        }
      }
      const P = u.paralyze || 2.2;
      let t = 0;
      w.addUpdater((dt) => {
        t += dt;
        if (t < P) {
          for (const e of caught) {
            if (!e.alive || e.state === 'launched' || e.state === 'frozen') continue;
            e.setState('hitstun', 0.3); // re-pinned every frame: paralyzed
            e.vel.x = 0;
            e.vel.z = 0;
            // the whole frame VIBRATES with the resonance
            if (Math.random() < 0.8) {
              e.animator.addImpulse('torso', [rand(-0.28, 0.28), rand(-0.1, 0.1), rand(-0.28, 0.28)], 52, 9);
            }
            if (Math.random() < 0.15) {
              w.effects.glows.emit(e.pos.x + rand(-1, 1), e.pos.y + rand(1, e.height), e.pos.z + rand(-1, 1),
                0, 1, 0, { life: 0.2, size: 0.8, color: 0x9ade2a, alpha: 0.8 });
            }
          }
          return true;
        }
        // release: the banked resonance detonates in every seized frame
        for (const e of caught) {
          if (!e.alive) continue;
          e.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true,
            knock: 16, launch: 9, srcPos: f.pos, heavy: true,
          });
          w.effects.explosion(e.center(), 2.6, { color: 0x9ade2a, smoke: false });
        }
        if (caught.length) {
          f.sfx('explosionBig');
          w.effects.addShake(1.0);
        }
        return false;
      });
    });
  },

  // JERRY: the colony stops pretending — twenty of him spring off in every
  // direction and ricochet around like fleas, biting whatever they land on
  fleaCircus(f, u) {
    const w = f.world;
    f.setState('ult', 1.0);
    f.duckT = 1; // the spring-crouch tell
    f.sfx('powerup');
    // THE VORTEX OPENS FIRST, under the crouch — the funnel is the ANNOUNCEMENT
    // and the colony is what comes out of it, so it has to be turning before
    // the first flea springs (they start 0.25s from here and are all out by
    // ~0.95s, which is what the life covers).
    darkVortex(w, f.pos.x, f.pos.z, { radius: 3.4, life: 1.9, swirl: 8.5 });
    w.effects.rings.spawn(f.pos, { from: 0.4, to: 6, dur: 0.5, color: 0x2a2320, y: 0.2 });
    w.schedule(0.25, () => {
      if (!f.alive) return;
      f.vel.y = 14;
      f.grounded = false;
      f.sfx('jump');
      const N = u.count || 20;
      const clones = [];
      // THE COLONY BOILS OUT OF THE VORTEX opened above — no clean rift, a
      // churning funnel of black cloud turning over the floor with a few
      // embers dragged round in it, and every flea springs from inside it.
      f.sfx('cast');
      for (let i = 0; i < N; i++) {
        const g = bakeShell(f);
        g.scale.setScalar(rand(0.55, 0.8));
        g.position.set(f.pos.x + rand(-1.5, 1.5), 0, f.pos.z + rand(-1.5, 1.5));
        g.visible = false; // waiting on the far side of the rift
        const yaw = rand(TAU);
        const sp = rand(6, 14);
        w.scene.add(g);
        clones.push({
          g, yaw, vx: Math.sin(yaw) * sp, vz: Math.cos(yaw) * sp, vy: rand(11, 17),
          delay: 0.03 + i * 0.032,
        });
      }
      const hitAt = new Map(); // circus-wide bite cadence per victim
      let t = 0;
      w.addUpdater((dt) => {
        t += dt;
        for (const c of clones) {
          // pop out of the portal one after another
          if (c.delay > 0) {
            c.delay -= dt;
            if (c.delay > 0) continue;
            c.g.visible = true;
            c.g.position.y = 0.1;
            summonFlash(w, c.g, 0xffb36b, 0.35);
            w.effects.impactSparks(c.g.position, 0xff9a3c, 6, 6);
            // each one drags a wisp of the funnel out with it
            for (let s = 0; s < 3; s++) {
              const a = rand(TAU);
              w.effects.smoke.emit(c.g.position.x, rand(0.2, 1), c.g.position.z,
                Math.cos(a) * rand(1, 4), rand(2, 5), Math.sin(a) * rand(1, 4),
                { life: rand(0.4, 0.9), size: rand(3, 5.5), color: 0x1a1614, color2: 0x120e0c,
                  alpha: 0.75, drag: 1.3, grow: 2.4 });
            }
          }
          c.vy -= 34 * dt;
          c.g.position.x += c.vx * dt;
          c.g.position.y += c.vy * dt;
          c.g.position.z += c.vz * dt;
          c.g.rotation.y = c.yaw;
          c.g.rotation.x = clamp(-c.vy * 0.018, -0.35, 0.5); // pitches with the hop
          if (c.g.position.y <= 0) {
            // touch down, re-aim (biased at the nearest victim), spring again
            c.g.position.y = 0;
            const prey = nearestEnemyTo(f, c.g.position.x, c.g.position.z);
            c.yaw = prey
              ? Math.atan2(w.wrapDelta(prey.pos.x - c.g.position.x), w.wrapDelta(prey.pos.z - c.g.position.z)) + rand(-0.7, 0.7)
              : rand(TAU);
            const sp = rand(7, 15);
            c.vx = Math.sin(c.yaw) * sp;
            c.vz = Math.cos(c.yaw) * sp;
            c.vy = rand(9, 17);
            if (Math.random() < 0.35) w.effects.dustPuff(c.g.position, 1, 0x9a8f80);
            if (Math.random() < 0.1) f.sfx('jump', { vol: 0.25, pitch: rand(1.2, 1.8) });
          }
          // a body to bump is a body to bite
          for (const e of w.fighters) {
            if (e === f || !e.alive || f.isAllyOf(e)) continue;
            if (t - (hitAt.get(e) ?? -9) < 0.22) continue;
            const dx = w.wrapDelta(e.pos.x - c.g.position.x), dz = w.wrapDelta(e.pos.z - c.g.position.z);
            if (dx * dx + dz * dz < (e.hitRadius + 1.1) ** 2 &&
                c.g.position.y < e.pos.y + e.height && c.g.position.y + 2 > e.pos.y) {
              hitAt.set(e, t);
              e.takeHit(u.dmg * f.dmgMult(), f, { 
                knock: 6, srcPos: c.g.position, soft: Math.random() < 0.6,
              });
              w.effects.impactSparks(e.center(), 0xc86a4a, 7, 7);
            }
          }
        }
        return t <= (u.duration || 6) && f.alive;
      }, () => {
        for (const c of clones) w.scene.remove(c.g);
      });
    });
  },

  // NULLBOT: SYSTEM CRASH — the ARENA ITSELF stops rendering right. Ground,
  // buildings, sky: everything re-decodes in blocky streaks of wrong color,
  // and every so often the floor simply fails under an opponent — they drop
  // through the world and re-enter from the sky, hard.
  systemCrash(f, u) {
    const w = f.world;
    const dur = cast(f, 'burst', {
      state: 'ult',
      onFire: () => {
        f.sfx('explosionBig');
        f.sfx('zap');
        w.effects.glitchBurst(f.center(), 40, 16, 1.4 * f.scale);
        w.effects.addShake(1.2);
        // corrupt the renderer: harvest every arena material we can reach
        const mats = new Map(); // mat -> original {color, emissive, ei}
        const roots = [...(w.arena?.objects || [])];
        if (w.arena?.propGroup) roots.push(w.arena.propGroup);
        if (w.arena?.destructo?.mesh) roots.push(w.arena.destructo.mesh);
        for (const root of roots) {
          root.traverse?.((o) => {
            if (!o.isMesh) return;
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
              if (m && m.color && !mats.has(m)) {
                mats.set(m, {
                  color: m.color.clone(),
                  emissive: m.emissive ? m.emissive.clone() : null,
                  ei: m.emissiveIntensity,
                });
              }
            }
          });
        }
        const GLITCH_COLORS = [0xff2df2, 0x27f6ff, 0xffe93c, 0x39ff5a, 0xff2038, 0x2438ff, 0xffffff, 0x101010];
        const DUR = u.duration || 7;
        const falls = []; // {v, t, phase}
        let t = 0, scramT = 0, fallT = 0.7;
        w.addUpdater((dt) => {
          t += dt;
          // the whole world re-decodes wrong, over and over
          scramT -= dt;
          if (scramT <= 0) {
            scramT = rand(0.09, 0.22);
            for (const [m, base] of mats) {
              if (Math.random() < 0.45) {
                m.color.setHex(GLITCH_COLORS[(Math.random() * GLITCH_COLORS.length) | 0]);
                if (m.emissive) {
                  m.emissive.setHex(GLITCH_COLORS[(Math.random() * GLITCH_COLORS.length) | 0]);
                  m.emissiveIntensity = rand(0.15, 0.8);
                }
              } else {
                m.color.copy(base.color);
                if (m.emissive && base.emissive) {
                  m.emissive.copy(base.emissive);
                  m.emissiveIntensity = base.ei;
                }
              }
            }
            // square data-tears strobing all over the block
            for (let k = 0; k < 4; k++) {
              w.effects.glitchFleck(
                f.pos.x + rand(-40, 40), rand(0.5, 14), f.pos.z + rand(-40, 40), rand(1.2, 2.6));
            }
            if (Math.random() < 0.2) f.sfx('zap', { vol: 0.3 });
          }
          // floor de-rez: a corrupted TILE arms under an opponent and waits.
          // The moment they MOVE they trip the bug — and visibly SINK down
          // through the floor plane before the sky spits them back out.
          fallT -= dt;
          if (fallT <= 0 && t < DUR - 2) {
            fallT = rand(1.0, 1.8);
            const pool = w.fighters.filter((e) =>
              e !== f && e.alive && !f.isAllyOf(e) && e.grounded && !falls.some((fl) => fl.v === e));
            if (pool.length) {
              const v = pool[(Math.random() * pool.length) | 0];
              falls.push({ v, t: 0, phase: 'armed', x0: v.pos.x, z0: v.pos.z });
              w.effects.glitchBurst(_v.set(v.pos.x, 0.3, v.pos.z), 8, 4, v.scale);
            }
          }
          for (let i = falls.length - 1; i >= 0; i--) {
            const fl = falls[i];
            const v = fl.v;
            fl.t += dt;
            if (!v.alive) {
              v.group.visible = true;
              falls.splice(i, 1);
              continue;
            }
            if (fl.phase === 'armed') {
              // the corrupted tile flickers under their feet, waiting
              if (Math.random() < 0.4) {
                w.effects.glitchFleck(v.pos.x + rand(-1.1, 1.1), 0.15, v.pos.z + rand(-1.1, 1.1), 1.1);
              }
              const moved = Math.hypot(w.wrapDelta(v.pos.x - fl.x0), w.wrapDelta(v.pos.z - fl.z0)) > 0.7 ||
                Math.hypot(v.vel.x, v.vel.z) > 3;
              if (moved && v.grounded) {
                fl.phase = 'sink'; // TRIPPED
                fl.t = 0;
                v.iframes = 1.0;
                w.effects.glitchBurst(_v.set(v.pos.x, 0.5, v.pos.z), 16, 8, v.scale);
                f.sfx('zap');
              } else if (fl.t > 5 || !v.grounded) {
                falls.splice(i, 1); // trap expired (or they jumped clear of it)
              }
            } else if (fl.phase === 'sink') {
              // VISIBLY sinking: post-physics pos.y override drops the body
              // through the floor plane while control stays seized (hitstun
              // re-armed per frame — never the knockdown/land transitions)
              if (v.state !== 'frozen') v.setState('hitstun', 0.4);
              v.vel.set(0, 0, 0);
              v.pos.y = -(fl.t / 0.55) * v.height * 1.25;
              if (Math.random() < 0.7) {
                const a = rand(TAU);
                w.effects.glitchFleck(v.pos.x + Math.cos(a) * v.hitRadius, 0.2,
                  v.pos.z + Math.sin(a) * v.hitRadius, 0.9 * v.scale);
              }
              if (fl.t > 0.55) {
                fl.phase = 'under';
                fl.t = 0;
                v.group.visible = false; // fully below the world for a beat
              }
            } else if (fl.phase === 'under') {
              v.vel.set(0, 0, 0);
              v.pos.y = -v.height * 1.3;
              if (fl.t > 0.28) {
                // ...and the sky spits them back out
                fl.phase = 'sky';
                v.group.visible = true;
                v.pos.y = 40;
                v.vel.set(rand(-3, 3), 0, rand(-3, 3));
                v.grounded = false;
                v.setState('launched', 4);
                w.effects.glitchBurst(v.center(), 14, 8, v.scale);
              }
            } else if (v.grounded) {
              v.takeHit(u.dmg * f.dmgMult(), f, { unblockable: true,
                knock: 4, srcPos: _v.set(v.pos.x, -2, v.pos.z), status: { glitch: 1 },
              });
              w.effects.glitchBurst(v.center(), 12, 7, v.scale);
              w.effects.addShake(0.5);
              falls.splice(i, 1);
            }
          }
          return t <= DUR || falls.length > 0;
        }, () => {
          for (const [m, base] of mats) {
            m.color.copy(base.color);
            if (m.emissive && base.emissive) {
              m.emissive.copy(base.emissive);
              m.emissiveIntensity = base.ei;
            }
          }
          for (const fl of falls) fl.v.group.visible = true;
        });
      },
    });
    f.iframes = dur;
  },

  // KONGA: APEX POUND. The ordnance is bolted on TOP of the animal, and the
  // ult is the animal. He drops onto his knuckles and starts DRUMMING THE
  // ROAD, one fist then the other, and every blow sends a shockwave running
  // out across the ground.
  //
  // Three rules, and the third is the whole move:
  //
  //  1. A SHOCKWAVE IS A THING IN THE FLOOR. It travels — a real expanding
  //     front at a real speed, not an instant sphere — and it only touches
  //     what the floor touches. Someone STANDING gets swept off their feet;
  //     someone in the air at that moment is simply missed, and that is the
  //     counterplay: jump the wave.
  //
  //  2. HE WALKS WHILE HE DRUMS (`_ultMove`). Every other ult roots you; this
  //     one hands the legs back, because the pounding is how he ADVANCES. The
  //     clip is upper-body only, so the locomotion layer keeps his knuckle
  //     walk running underneath the beat, and it runs for a LONG time (ten
  //     seconds) — long enough to knock someone down at one end of a street
  //     and walk the whole way to them before they are up.
  //     ON THE FLOOR ONLY. He does not go up walls with this: surface walking
  //     needs `state === 'normal'` (climb.js `bodyFree`), so the ult refuses to
  //     engage the walker and drops him off a face he was already on, the same
  //     frame. The legs he gets back are the arena's, not the architecture's.
  //
  //  3. THE FLOOR IS WHERE HE FINISHES IT. A fist landing on someone already
  //     DOWN does not knock them down again — it does `slamDmg`, which is
  //     several times a shockwave's worth. So the wave is not the damage, it
  //     is the SETUP: knock them over, close the distance, stand over them and
  //     land the next beat on their chest. Running away from an ape with long
  //     arms only works while you are on your feet.
  apexPound(f, u) {
    const w = f.world;
    const DUR = u.duration || 6;
    const BEAT = u.beat || 0.58;            // seconds between fists
    const R = u.radius || 13;               // how far one wave reaches
    const WAVE_SPEED = u.waveSpeed || 30;   // ...and how fast the front travels
    const col = f.def.colors.glow || 0xffa432;

    f.setState('ult', DUR);
    f._ultMove = true;                      // rule 2 — the legs stay his
    f.sfx('ultReady');
    faceRoar(f, 1.4);
    w.effects.rings.spawn(f.pos, { from: 1.5, to: 9, dur: 0.4, color: col, y: 0.4 });
    f.sfx('howl');

    // ONE BEAT: gather the fist, drive it into the road, and pay out both
    // kinds of damage from where it actually lands.
    let side = 0;
    const pound = () => {
      if (!f.alive || f.state !== 'ult') return;
      const s = side++ % 2 ? 'L' : 'R';
      f.animator.play(s === 'L' ? 'kongaPoundL' : 'kongaPound', {
        onEvent: (t, a) => {
          if (t === 'shake') w.effects.addShake(a);
          if (t !== 'fire') return;
          if (!f.alive || f.state !== 'ult') return;
          // WHERE THE FIST IS, not where he is: he is walking, and the blow
          // lands under the arm that threw it. Bone first (the GLB's real
          // knuckle), virtual joint otherwise, his own feet as a last resort.
          const hand = f.mech.rigBones?.['hand' + s] || f.mech.joints?.['hand' + s];
          const at = hand ? hand.getWorldPosition(new THREE.Vector3()) : f.pos.clone();
          at.y = f.pos.y;                   // the impact is on the FLOOR he stands on
          f.sfx('slam');
          w.effects.dustPuff(at, 18);
          w.arena?.damageSphere(_v.set(at.x, at.y + 1, at.z), 4.5 * f.scale,
            u.dmg * 1.4, null, true);

          // ---- rule 3: anyone already DOWN under this fist wears all of it
          const FIST_R = (u.fistRange || 3.6) * f.scale;
          let crushed = false;
          eachEnemy(w, f, at, FIST_R, (e) => {
            // DOWN means down. 'getup' is deliberately NOT on this list: a
            // mech that has started standing back up has escaped, and counting
            // it would make the crush inescapable rather than merely brutal.
            const down = e.state === 'knockdown' || e.state === 'launched' || e._onBack;
            if (!down || !overlapsY(e, f.pos.y - 1, 4)) return;
            crushed = true;
            e.takeHit((u.slamDmg || u.dmg * 5) * f.dmgMult(), f, {
              // NO launch: a body driven into the road stays in the road.
              knock: 3, srcPos: at, heavy: true, unblockable: true,
            });
            // NOTE it deliberately does NOT re-pin them. Re-stamping the
            // knockdown on every crush (which the first build did) is a true
            // loop: the beat is shorter than the pin, so a body that goes down
            // once never gets up again and the ult reads as an execution. They
            // stay down for exactly as long as the knockdown they already have.
            w.effects.impactSparks(e.center(), col, 16, 12);
            w.effects.explosion(at, 3.2, { color: col, smoke: true, ring: true });
          }, (e) => e.hitRadius * 0.6);
          w.effects.addShake(crushed ? 0.9 : 0.5);
          if (crushed) f.sfx('hitHeavy');

          // ---- rule 1: the wave goes out whether or not the fist found anyone
          poundWave(w, f, at, {
            radius: R, speed: WAVE_SPEED, dmg: u.dmg * f.dmgMult(),
            knock: u.knock || 12, color: col,
          });
        },
      });
    };
    pound();
    // NOTE the arity: world.addUpdater calls its tick with `dt` ONLY (world.js
    // `u.tick(dt)`). A `(dt, t) => ... return t <= DUR` updater therefore reads
    // `undefined <= DUR`, which is false, and the whole move ends on its first
    // frame — so the elapsed clock is kept here.
    let beatT = BEAT, el = 0;
    w.addUpdater((dt) => {
      if (!f.alive || f.state !== 'ult') return false;
      el += dt;
      beatT -= dt;
      if (beatT <= 0) { beatT = BEAT; pound(); }
      return el <= DUR;
    }, () => {
      f._ultMove = false;
      if (f.state === 'ult') { f.animator.stop(); f.setState('normal'); }
    });
  },

  // TRITONE: SIEGE PROTOCOL. He stops being a charger and becomes what the
  // engineers actually built: he plants all four legs, the frill crown opens,
  // and both flank cannons come off their aim solver entirely and start
  // HOSING THE SKY.
  //
  // THE MOUNTS SWEEP, THEY DO NOT AIM. For the length of the protocol the
  // guns are choreography, not artillery: each one turns through a full 180°
  // — level, up, over the back and down again — and the two run in OPPOSITE
  // PHASE, so one is always climbing while the other falls. Nothing is aimed
  // at anybody. The barrels are moving while they fire, so the stream leaves
  // in a fan that changes direction faster than a target can read it, which
  // is what makes the spray look like a spray rather than a hose. The aim
  // servo (cannonaim.js) is handed the bones back the moment it ends.
  //
  // AND THEN IT COMES DOWN. Every particle flies dumb and ballistic for
  // `seekTime` seconds — long enough to get properly high — and then wakes up
  // and goes looking for the nearest living enemy (projectiles.js seekDelay +
  // retarget, which re-acquires whenever its mark dies, so a cloud fired at
  // nobody in particular converges on whoever is left). So the move is two
  // beats you can watch: a fountain, and a rain of it.
  //
  // Deliberately the opposite of his special: rooted instead of mobile, area
  // instead of single-target, so his two big buttons never want the same range.
  siegeProtocol(f, u) {
    const w = f.world;
    const DUR = u.duration || 6.5;
    const N = u.count || 88;              // particles over the whole protocol...
    const GAP = DUR / Math.max(1, N / 2); // ...fired in pairs, one per cannon
    const SEEK = u.seekTime || 0.62;      // dumb ballistic flight before it hunts
    const SWEEP = u.sweep || 1.5;         // seconds for one 180° out-and-back
    const col = f.def.colors.glow || 0xff8a24;
    cast(f, 'tritoneBrace', { state: 'ult', stateT: DUR });
    f.sfx('ultReady');
    faceRoar(f, 0.9);
    // planted: he does not move while the protocol runs
    const anchorX = f.pos.x, anchorZ = f.pos.z;
    w.effects.rings.spawn(f.pos, { from: 6, to: 1.4, dur: 0.5, color: col, y: 0.3 });

    // THE SWEEP. `driveCannons` pitches each barrel nose-up from its own rest
    // line by this many radians, so 0 is level-forward and PI is straight back
    // over the spine, through vertical on the way. cos gives an out-and-back
    // that EASES at both ends — a linear sweep snaps at the turnaround — and
    // the half-cycle offset between the two is the opposite phase.
    let swp = 0;
    const angleAt = (ph) => Math.PI * 0.5 * (1 - Math.cos(ph));
    f._cannonDrive = (dt) => {
      swp += dt;
      const ph = swp * TAU / SWEEP;
      driveCannons(f, angleAt(ph), angleAt(ph + Math.PI));
    };

    // `el`, not a second updater parameter: world.addUpdater passes its tick
    // `dt` and nothing else (see the note in apexPound above).
    let emitT = 0, el = 0;
    w.addUpdater((dt) => {
      if (!f.alive || f.state !== 'ult') return false;
      el += dt;
      // rooted — recoil rocks him but he does not travel
      f.vel.x = 0; f.vel.z = 0;
      f.pos.x = anchorX; f.pos.z = anchorZ;
      emitT -= dt;
      if (emitT <= 0) {
        emitT = GAP;
        for (const key of ['muzzleR', 'muzzleL']) {
          const a = f.mech.anchors[key];
          if (!a) continue;
          const from = a.getWorldPosition(new THREE.Vector3());
          // down the barrel WHEREVER THE SWEEP HAS PUT IT, then biased toward
          // the sky: the mount is what scatters the stream, the bias is what
          // keeps the whole fountain going up instead of half of it into the
          // road behind him. A little jitter on top so no two leave alike.
          const d = new THREE.Vector3(0, 0, 1)
            .applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion()));
          if (d.lengthSq() < 1e-8) d.set(0, 1, 0);
          d.normalize().lerp(_v.set(0, 1, 0), 0.5);
          d.x += rand(-0.18, 0.18); d.z += rand(-0.18, 0.18); d.y += rand(-0.05, 0.2);
          w.projectiles.spawn('plasma', f, from, d.normalize(), {
            dmg: u.dmg * f.dmgMult(), speed: (u.speed || 38) * rand(0.85, 1.15),
            splash: u.radius || 2.4, knock: 5, color: col, size: 0.75,
            trail: 'comet', seekDelay: SEEK * rand(0.85, 1.2), turnRate: 3.4, life: 7,
          });
          w.effects.muzzleFlash?.(from, col);
        }
        f.sfx('plasma', { vol: 0.35 });
        f.animator.addImpulse?.('torso', [-0.05, 0, 0], 30, 10);
      }
      return el <= DUR;
    }, () => {
      f._cannonDrive = null;              // the aim servo gets its guns back
      if (f.state === 'ult') { f.animator.stop(); f.setState('normal'); }
    });
  },
};


// THE HUNTING FLOCK (WRAITH's DEATH SWARM, spawned once the apparition has
// come apart). Bats wheel in a gyre around him and peel off to STOOP on
// whoever is nearest, then climb back into it.
//
// They are drawn as camera-facing sprites off the SAME bat atlas the taunt's
// particles use, so the flock that stays and the flock that blew away are one
// creature. A pooled particle cannot hunt — it is ballistic once emitted — so
// these are instanced quads with the pool's billboard and atlas maths lifted
// into their own shader: the CPU writes each bat's position, wingspan and
// roll, and the vertex stage turns that into a sprite facing the camera.
const BAT_VERT = /* glsl */`
  attribute float aCell;   // which atlas frame — the flap
  attribute float aRot;    // roll, in screen space
  varying vec2 vUv;
  varying float vCell;
  void main() {
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // wingspan and body length come off the instance matrix's own scale, so
    // the flap stays a plain scale write on the CPU side
    float sx = length(instanceMatrix[0].xyz);
    float sy = length(instanceMatrix[1].xyz);
    float c = cos(aRot), s = sin(aRot);
    vec2 p = vec2(position.x * sx, position.y * sy);
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    vUv = uv;
    vCell = aCell;
    gl_Position = projectionMatrix * vec4(mv.xy + p, mv.zw);
  }
`;
const BAT_FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vCell;
  void main() {
    // same cell maths as ParticlePool's FRAG, on a 2x2 atlas
    vec2 cellXY = vec2(mod(vCell, 2.0), floor(vCell / 2.0));
    vec4 t = texture2D(uTex, (cellXY + clamp(vUv, 0.004, 0.996)) * 0.5);
    gl_FragColor = vec4(uColor * t.rgb, t.a * uOpacity);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

function deathFlock(f, u, N) {
  const w = f.world;
  f.sfx('howl');
  const geo = new THREE.PlaneGeometry(1.3, 0.9);
  const cells = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  const rots = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  cells.setUsage(THREE.DynamicDrawUsage);
  rots.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCell', cells);
  geo.setAttribute('aRot', rots);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: batTexture() },
      uColor: { value: new THREE.Color(0x07070c) },  // the taunt bat's own black
      uOpacity: { value: 0.96 },
    },
    vertexShader: BAT_VERT,
    fragmentShader: BAT_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  w.scene.add(im);
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  const bats = [];
  for (let i = 0; i < N; i++) {
    bats.push({
      state: 'orbit',
      a: rand(TAU), r: rand(4, 15), h: rand(2.5, 11),
      spd: (Math.random() < 0.5 ? -1 : 1) * rand(1.6, 3.4),
      ph: rand(TAU), born: rand(0, 0.5),
      x: f.pos.x, y: f.pos.y + f.height * 0.7, z: f.pos.z,
      vx: 0, vy: 0, vz: 0, tgt: null, sc: rand(1.4, 2.1),
      flapR: rand(5, 8.5),
    });
  }
  const hitAt = new Map(); // swarm-wide bite cadence per victim
  const DUR = u.duration || 7;
  let t = 0;
  w.addUpdater((dt) => {
    t += dt;
    const winding = t > DUR; // time up: the flock spirals up and thins out
    mat.uniforms.uOpacity.value = winding ? Math.max(0, 0.96 * (1 - (t - DUR) / 1.1)) : 0.96;
    const cx = f.pos.x, cy = f.pos.y, cz = f.pos.z;
    for (let i = 0; i < N; i++) {
      const b = bats[i];
      const grow = clamp01((t - b.born) / 0.45); // pours out over the first beats
      let yaw;
      if (winding) {
        b.h += dt * 14; // up and away
        b.a += b.spd * dt;
        b.x = cx + Math.cos(b.a) * b.r;
        b.z = cz + Math.sin(b.a) * b.r;
        b.y = cy + b.h;
        yaw = b.a + (b.spd > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else if (b.state === 'orbit') {
        b.a += b.spd * dt;
        b.x = cx + Math.cos(b.a) * b.r * grow;
        b.z = cz + Math.sin(b.a) * b.r * grow;
        b.y = cy + (b.h + Math.sin(t * 2.2 + b.ph) * 0.9) * grow + 0.8;
        yaw = b.a + (b.spd > 0 ? Math.PI / 2 : -Math.PI / 2);
        // pick a mark and STOOP
        if (grow >= 1 && Math.random() < dt * 0.55) {
          const prey = nearestEnemyTo(f, b.x, b.z, 46);
          if (prey) { b.state = 'dive'; b.tgt = prey; }
        }
      } else if (b.state === 'dive') {
        const prey = b.tgt;
        if (!prey || !prey.alive) { b.state = 'orbit'; b.tgt = null; yaw = b.a; }
        else {
          const c = prey.center();
          const dx = w.wrapDelta(c.x - b.x), dy = c.y - b.y, dz = w.wrapDelta(c.z - b.z);
          const d = Math.hypot(dx, dy, dz) || 1;
          const sp = 30;
          b.x += (dx / d) * sp * dt;
          b.y += (dy / d) * sp * dt;
          b.z += (dz / d) * sp * dt;
          yaw = Math.atan2(dx, dz);
          if (d < prey.hitRadius + 0.9) {
            // the STRIKE — raking claws on the way through
            if (t - (hitAt.get(prey) ?? -9) > 0.1) {
              hitAt.set(prey, t);
              prey.takeHit(u.dmg * f.dmgMult(), f, { 
                knock: 1, srcPos: P.set(b.x, b.y, b.z), soft: true,
              });
              if (Math.random() < 0.3) w.effects.impactSparks(c, 0x8a2030, 4, 5);
              if (Math.random() < 0.12) f.sfx('howl', { vol: 0.2, pitch: rand(1.7, 2.2) });
            }
            b.state = 'climb';
            b.vy = rand(9, 14);
          }
        }
      } else { // climb back into the gyre
        b.y += b.vy * dt;
        b.vy -= 6 * dt;
        b.x += Math.sin(b.ph) * 4 * dt;
        b.z += Math.cos(b.ph) * 4 * dt;
        yaw = b.ph;
        if (b.vy <= 0 || b.y > cy + b.h + 3) {
          b.state = 'orbit';
          b.a = Math.atan2(b.z - cz, b.x - cx);
          b.r = clamp(Math.hypot(b.x - cx, b.z - cz), 4, 16);
        }
      }
      // THE FLAP IS THE ATLAS, the way the taunt's bats do it — the wingspan
      // pulse on top of it is what keeps a sprite-flap from reading as a
      // flicker at arena distance. A bat banks with its turn, harder in a dive.
      const flap = 0.55 + Math.abs(Math.sin(t * 15 + b.ph)) * 0.65;
      cells.array[i] = (t * b.flapR + b.ph) % 4 | 0;
      rots.array[i] = Math.sin(t * 7 + b.ph) * 0.22
        + Math.sin(yaw) * (b.state === 'dive' ? 0.45 : 0.15);
      M.compose(P.set(b.x, b.y, b.z), Q.identity(), S.set(flap * b.sc, b.sc, b.sc));
      im.setMatrixAt(i, M);
    }
    im.instanceMatrix.needsUpdate = true;
    cells.needsUpdate = true;
    rots.needsUpdate = true;
    if (Math.random() < 0.05) f.sfx('howl', { vol: 0.14, pitch: rand(1.5, 2.0) });
    return t <= DUR + 1.1 && f.alive;
  }, () => { w.scene.remove(im); geo.dispose(); mat.dispose(); });
}
