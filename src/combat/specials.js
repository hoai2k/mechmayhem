// Per-mech special & ultimate implementations, dispatched by id from roster.
import * as THREE from 'three';
import { rand, clamp, clamp01, angleDiff, TAU } from '../core/utils.js';
import { GeyserFX } from './geyserfx.js';
import { FireTornadoFX } from './nadofx.js';
import { fireCool } from './flamefx.js';
import { TidalWaveFX } from './wavefx.js';
// deliberate cycle with fighter.js (and a reach into game/ai.js): both are
// only touched at runtime, for SAURION's summoned raptor pack
import { Fighter } from './fighter.js';
import { AIController } from '../game/ai.js';
import { cloneMech } from '../mechs/factory.js';
import { stillCasting, cast, eachEnemy, volley, timedUpdater } from './movekit.js';

const _v = new THREE.Vector3();

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

// ============================= SPECIALS =============================

export const SPECIALS = {
  // TITANUS: seismic ground slam
  groundPound(f, sp) {
    cast(f, 'groundPound', {
      stateT: (dur) => dur * 0.92,
      onEvent: (t, a) => {
        if (t === 'fire') {
          const w = f.world;
          w.groundShockwave(f, f.pos, sp.radius, sp.dmg * f.dmgMult(), sp.knock, 0xffb43c);
          w.audio?.play('slam');
        } else if (t === 'shake') f.world.effects.addShake(a);
      },
    });
  },

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
      f.world.audio?.play('missile');
    });
  },

  // AEGIS: Bulwark Bash — the tower shield goes UP over his head face-up
  // and WHIRLS like a rotor (same showmanship as the spear heavy), then
  // comes down and RAMS forward, swelling into a bot-tall wall of steel
  // as it strikes
  shieldBash(f, sp) {
    const w = f.world;
    const RAISE = 0.95;
    cast(f, 'shieldWhirlHold', { stateT: RAISE + 0.9 });
    // the shield itself tips FLAT — decorated face to the sky — and spins
    // about its own face normal like an umbrella/top balanced on the raised
    // fist (set overrides the rest-carry, z is the face axis once tipped)
    f._spinFx = { joint: 'shield', axis: 'z', rate: 26, dur: RAISE, set: [Math.PI / 2, 0, 0], t: 0, acc: 0 };
    w.audio?.play('whooshBig');
    // whirl tell: tightening rings overhead
    volley(w, f, 3, 0.3, () => {
      w.effects.rings.spawn(f.pos, { from: 3.4, to: 1, dur: 0.28, color: 0x49b7ff, y: f.height * 0.95 });
    }, { guard: (f) => stillCasting(f) });
    w.schedule(RAISE, () => {
      if (!f.alive || f.state !== 'special') return;
      f.faceNearestEnemyIfClose(14);
      cast(f, 'aegisShieldSmash', {
        stateT: (dur) => dur * 0.95,
        onEvent: (t) => {
          if (t === 'hit') {
            f.onAttackEvent('hit', 0, {
              dmg: sp.dmg * f.dmgMult(), knock: sp.knock, range: 6.4 * f.scale, heavy: true,
            });
            w.effects.rings.spawn(f.pos, { from: 1, to: 6, dur: 0.4, color: 0x9fd8ff, y: 1 });
          }
        },
      });
      // the wall: the shield GROWS to a full mech's height through the
      // strike, then eases back to carry size
      f._scaleFx = { joint: 'shield', t: 0, grow: 0.2, hold: 0.5, back: 0.3, max: 1.75 };
      // and the smash CARRIES — a driving shield-rush through the strike
      // window instead of a standing shove
      volley(w, f, 9, 0.045, () => {
        f.vel.x = Math.sin(f.yaw) * 25;
        f.vel.z = Math.cos(f.yaw) * 25;
      }, { start: 0.045, guard: (f) => stillCasting(f) });
    });
    f.status.guard = { f: 0.6, t: sp.guard };
    f.world.effects.rings.spawn(f.pos, { from: 1, to: 5, dur: 0.5, color: 0x49b7ff, y: 1 });
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
    w.audio?.play('dash');
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
        eachEnemy(w, f, f.pos, 3.6 * f.scale, (e) => {
          if ((hitAt.get(e) ?? -1) <= t - 0.22) {
            hitAt.set(e, t);
            e.takeHit(sp.dmg * f.dmgMult(), f, { knock: 5, srcPos: f.pos });
            w.audio?.play('slash');
            w.engine.addHitStop(0.03);
          }
        });
      });
    }
  },

  // NOVA: three homing star orbs
  starfall(f, sp) {
    cast(f, 'castRaise', {
      stateT: (dur) => dur * 0.8,
      onFire: () => {
        const target = f.nearestEnemy();
        volley(f.world, f, sp.count, 0.14, () => {
          const origin = muzzle(f).add(new THREE.Vector3(rand(-1, 1), rand(1, 2.5), rand(-1, 1)));
          const g = f.animator?.novaGlow || 0;
          f.world.projectiles.spawn('plasma', f, origin, new THREE.Vector3(0, 1, 0), {
            dmg: sp.dmg * f.dmgMult(), speed: 22, splash: 2.6 * (1 + 0.4 * g), color: 0xff5ce8,
            homing: target, retarget: true, turnRate: 4.0, life: 4.5,
            size: 1 + 0.7 * g,
          });
          f.world.audio?.play('plasma');
        });
      },
    });
  },

  // RHINO: bull rush — gallops forward on all fours as long as B is HELD,
  // up to 5s. The run ENDS the moment it connects with someone (one clean
  // launch), or when the button is released.
  bullRush(f, sp) {
    cast(f, 'chargeLean', { stateT: 5.2 }); // held-charge ceiling; ended early on release
    f.world.audio?.play('charge');
    f._chargeT = 0;
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
      for (const e of f.world.fighters) {
        if (e === f || !e.alive) continue;
        const dx = f.world.wrapDelta(e.pos.x - f.pos.x), dz = f.world.wrapDelta(e.pos.z - f.pos.z);
        if (Math.hypot(dx, dz) < 3.6 * f.scale) {
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
        // storm placed well AHEAD of tempest — it's a zoning tool, not a
        // self-centered burst
        const center = fwd(f, sp.radius * 0.95);
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
        w.audio?.play('thunder');
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
            w.audio?.play('zap');
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
    f.world.audio?.play('howl');
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
      if (f.grounded) {
        landed = true;
        // the pounce is Saurion's block-breaker: only THIS hit carries his
        // guardBreak chance (normal swings block like anyone else's)
        f.world.groundShockwave(f, f.pos, 5.5 * f.scale, sp.dmg * f.dmgMult(), 16, 0x6cd8ff, false,
          false, { guardBreak: f.def.stats.guardBreak || 0 });
        f.world.audio?.play('slam');
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
    w.audio?.play('servo');
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
          w.audio?.play('whooshBig');
          w.effects.addShake(0.6);
          w.engine.addHitStop(0.1);
        }
        w.schedule(0.5, () => { if (f.state === 'special') f.setState('normal'); });
      });
    });
  },

  // COLOSSUS (legacy): artillery barrage on target area
  barrage(f, sp) {
    const fallback = fwd(f, 24);
    cast(f, 'brace', {
      stateT: (dur) => dur * 0.85,
      onEvent: (t, a) => {
        if (t === 'shake') { f.world.effects.addShake(a); return; }
        if (t !== 'fire') return;
        volley(f.world, f, sp.count, 0.22, (i) => {
          const from = muzzle(f, i % 2 ? 'muzzleL' : 'muzzleR');
          // re-aim EACH shell at launch, led by its own flight time —
          // one stale aim point misses everything by the last shell
          const arcTime = rand(1.1, 1.5);
          const e = f.nearestEnemy();
          const target = e ? leadPos(f, e, arcTime * 0.85) : fallback;
          const to = target.clone().add(new THREE.Vector3(rand(-sp.radius, sp.radius) * 0.45, 0, rand(-sp.radius, sp.radius) * 0.45));
          f.world.projectiles.spawn('mortar', f, from, new THREE.Vector3(0, 1, 0), {
            dmg: sp.dmg * f.dmgMult(), splash: 4, color: 0xffd23c, arcTo: to, arcTime,
          });
          f.world.audio?.play('mortar');
          f.animator.addImpulse('torso', [-0.12, 0, 0], 30, 10);
        });
      },
    });
  },

  // WRAITH: cloak (legacy — Ghost Protocol now uses ghostWalk below)
  cloak(f, sp) {
    f.status.cloak = { t: sp.duration, spd: sp.speedBoost };
    f.setOpacity(0.16);
    f.world.audio?.play('cloak');
    f.world.effects.rings.spawn(f.pos, { from: 3, to: 0.5, dur: 0.4, color: 0xff3838, y: f.height * 0.5 });
  },

  // WRAITH: Ghost Protocol — projects a white spectre of his body that
  // glides forward hurting everything it passes through for as long as B is
  // HELD (the robot stands locked); on release he teleports INTO the ghost:
  // his player sees a zip forward, everyone else sees the spectre solidify
  ghostWalk(f, sp) {
    const w = f.world;
    cast(f, 'aim', { stateT: (sp.duration || 5) + 0.4, speed: 0.5 });
    w.audio?.play('cloak');

    // build the spectre: bake the current pose into a throwaway shell whose
    // meshes carry the live world matrices, then glide the shell forward
    const gmat = new THREE.MeshBasicMaterial({
      color: 0xdfefff, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ghost = new THREE.Group();
    f.mech.group.updateWorldMatrix(true, true);
    f.mech.group.traverse((o) => {
      if (!o.isMesh || o.visible === false) return;
      if (o.isSkinnedMesh) {
        // a static shell can't reuse a SkinnedMesh's matrixWorld — rendered
        // skinned verts follow the BONES and cancel the mesh node's own
        // transform (Tripo's Armature offset), so the naive bake floats the
        // spectre meters above the ground. Bake the posed skin instead.
        o.skeleton.update();
        const src = o.geometry.attributes.position;
        const arr = new Float32Array(src.count * 3);
        const v = new THREE.Vector3();
        for (let i = 0; i < src.count; i++) {
          o.getVertexPosition(i, v);   // skin-aware
          o.localToWorld(v);
          arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        if (o.geometry.index) geo.setIndex(o.geometry.index);
        const m = new THREE.Mesh(geo, gmat);
        m.matrixAutoUpdate = false;
        m.userData.bakedGeo = true; // owned by the ghost — dispose with it
        ghost.add(m);
        return;
      }
      const m = new THREE.Mesh(o.geometry, gmat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(o.matrixWorld);
      ghost.add(m);
    });
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

    const dropGhost = () => {
      w.scene.remove(ghost);
      gmat.dispose();
      for (const m of ghost.children) if (m.userData.bakedGeo) m.geometry.dispose();
    };

    const finish = () => {
      f._charging = false;
      // the spectre solidifies — the robot zips into its position
      const tx = gx(), tz = gz();
      w.effects.dashTrail(f.pos, 0xbfe8ff, f.scale * 1.6);
      f.pos.x = tx;
      f.pos.z = tz;
      w.effects.dashTrail(f.pos, 0xbfe8ff, f.scale * 1.6);
      w.effects.rings.spawn(f.pos, { from: 0.5, to: 4, dur: 0.35, color: 0xbfe8ff, y: 1 });
      w.audio?.play('dash');
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
          w.audio?.play('slash');
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
      f.world.audio?.play('flame');
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
        w.audio?.play('cast');
        // the sim owns telegraph + eruption + collapse visuals; total show
        // length = warn + sustain + ~0.95s collapse = sp.duration. The
        // scald opts arm the world's damage tick: anyone in the column
        // keeps taking hits for the whole eruption
        w.spawnGeyser(
          new GeyserFX(w.scene, w.effects, target, {
            height: 22, radius: 1.5, warn: WARN,
            sustain: (sp.duration || 6) - WARN - 0.95,
            boilRadius: sp.radius * 0.4,
          }),
          { owner: f, dmg: sp.dmg, radius: sp.radius, launch: sp.launch });
        // damage: one big hit at the blowout moment, same as always
        w.schedule(WARN, () => {
          w.audio?.play('wave');
          w.audio?.play('explosionBig');
          eachEnemy(w, f, target, sp.radius, (v) => {
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
    w.audio?.play('jump');
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
      w.audio?.play('slash');
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
      // three fast pecking strikes while riding
      for (const bt of [0.2, 0.42, 0.62]) {
        w.schedule(bt, () => {
          if (!f.alive || !prey.alive) return;
          prey.takeHit(sp.dmg * 0.22 * f.dmgMult(), f, { knock: 1, srcPos: f.pos });
          w.audio?.play('slash');
          w.effects.impactSparks(prey.center(), 0xff3826, 10, 8);
          f.animator.addImpulse('head', [0.4, 0, 0], 26, 9);
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
        w.audio?.play('land');
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
      f.world.audio?.play('plasma');
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
    w.audio?.play('zap');
    w.audio?.play('dash');
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
      if (i % 3 === 0) f.world.audio?.play('freeze');
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

export const ULTS = {
  // TITANUS: he reaches to the sky and a METEOR SHOWER hammers a broad zone
  // in front of him — burning rocks screaming down, each one a fire blast
  // that leaves the ground burning where it lands
  meteorBreaker(f, u) {
    const w = f.world;
    cast(f, 'castRaise', {
      state: 'ult',
      onFire: () => {
        w.audio?.play('powerup');
        w.audio?.play('thunder');
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
          w.audio?.play('whoosh');
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

  // VULCAN: both gatling arms fling out high and wide, then his upper body
  // spins up from a standstill and hoses out a hundred rounds that DON'T fly
  // away — they leave his outstretched hands, spiral out and fall into orbit
  // around him, a whirlwind of lead that rides along as he moves, until
  // someone strays close: then the whole storm folds onto them.
  //
  // The build-up is the move, in four beats: reach → hard spin-up → a long run
  // at full whirl (the rounds pour out through it) → the guns fall silent and
  // the whirl coasts to a stop while the storm keeps circling on its own.
  // Rounds inherit the body's angular velocity AT THE MOMENT THEY LEAVE, so
  // the first ones drift lazily while the last are flung off at full speed.
  bulletHurricane(f, u) {
    const w = f.world;
    const N = u.count || 100;
    const SPIN = 6.2;           // rad/s at full whirl
    const REACH = 0.36;         // arms flung out before anything turns
    const RAMP = 0.5;           // hard acceleration up to full whirl
    const BRAKE = 0.55;         // eased back down to a standstill
    // He completes WHOLE TURNS, so the whirl coasts to a stop facing front
    // instead of unwinding backwards into place: the ramp covers SPIN*RAMP/2
    // and the smoothstep brake covers SPIN*BRAKE*2/3 (that's a deceleration
    // from full speed with no jump at the hand-off), and the full-speed hold
    // is however long it takes to make up the difference.
    const TURNS = 2;
    const HOLD = (TURNS * TAU - SPIN * RAMP / 2 - SPIN * BRAKE * 2 / 3) / SPIN;
    const FIRE0 = REACH + RAMP * 0.5;          // guns open at half whirl speed
    const FIRE1 = REACH + RAMP + HOLD * 0.75;  // ...and fall silent before he slows
    const SPUN = REACH + RAMP + HOLD + BRAKE;
    cast(f, 'hurricaneSpin', { state: 'ult', stateT: SPUN });
    // NEGATIVE rate: a +y torso spin sweeps +X toward -Z, while the rounds
    // orbit +X toward +Z (their angle drives cos/sin) — so the body has to
    // turn the other way to run WITH the storm it just threw.
    f._spinFx = { joint: 'torso', axis: 'y', rate: -SPIN, delay: REACH, ramp: RAMP,
      brake: BRAKE, dur: SPUN, t: 0, acc: 0 };
    // hurricaneSpin HOLDS its last key (arms out for the whole whirl), so it
    // has to be released by hand once he stops turning — the storm lives on
    // without him from here.
    w.schedule(SPUN, () => { if (f.animator.isPlaying('hurricaneSpin')) f.animator.stop(0.3); });
    w.audio?.play('powerup');
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
      if (Math.random() < 0.35) w.audio?.play('gatling');
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
          w.audio?.play('charge');
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
              w.audio?.play('gatling');
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

  // AEGIS: the spear goes up, ten shafts of light climb into the heavens,
  // and the court speaks: JUDGEMENT... then a coin-flip verdict. GUILTY is
  // a death sentence — a pillar of light takes the condemned away entirely
  // (no finisher; they are simply gone). INNOCENT and the defendant walks.
  judgment(f, u) {
    const w = f.world;
    cast(f, 'castRaise', { state: 'ult', stateT: 4.6, speed: 0.55 });
    w.audio?.play('cast');
    w.effects.rings.spawn(f.pos, { from: 1, to: 9, dur: 0.8, color: 0xf6ecc2, y: 0.6 });
    volley(w, f, 10, 0.09, (i) => {
      const from = muzzle(f);
      const top = from.clone().add(new THREE.Vector3(rand(-8, 8), 78, rand(-8, 8)));
      w.effects.beams.spawn(from, top, { radius: rand(0.22, 0.42), dur: 1.5, color: 0xf6ecc2 });
      if (i % 3 === 0) w.audio?.play('beam');
    }, { start: 0.2 });
    const say = (text, color = null, hold = true) => w.events.emit('banner', { text, hold, color });
    w.schedule(1.0, () => f.alive && say('JUDGEMENT'));
    w.schedule(1.5, () => f.alive && say('JUDGEMENT .'));
    w.schedule(2.0, () => f.alive && say('JUDGEMENT . .'));
    w.schedule(2.5, () => f.alive && say('JUDGEMENT . . .'));
    w.schedule(3.2, () => {
      if (!f.alive) { say('', null, false); return; }
      // the court tries the nearest REAL defendant (summons don't count)
      let v = null, best = Infinity;
      for (const e of w.fighters) {
        if (e === f || !e.alive || f.isAllyOf(e) || e.isMinion) continue;
        const dx = w.wrapDelta(e.pos.x - f.pos.x), dz = w.wrapDelta(e.pos.z - f.pos.z);
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; v = e; }
      }
      if (!v) { say('CASE DISMISSED', '#9fd8ff', false); return; }
      if (Math.random() < 0.5) {
        say("INNOCENT: YOU'RE FREE TO GO", '#7dff9a', false);
        w.effects.rings.spawn(v.pos, { from: 4, to: 0.5, dur: 0.6, color: 0x7dff9a, y: 0.5 });
        w.audio?.play('uiConfirm');
        return;
      }
      say('GUILTY: DEATH PENALTY', '#ff4d5e', false);
      // heaven's pillar comes down on the condemned and TAKES them
      const gp = v.pos.clone();
      const top = gp.clone();
      top.y += 85;
      w.effects.beams.spawn(top, gp, { radius: u.radius || 3.4, dur: 1.6, color: 0xfff3c8 });
      w.effects.beams.spawn(top, gp, { radius: (u.radius || 3.4) * 0.4, dur: 1.6, color: 0xffffff });
      w.effects.rings.spawn(gp, { from: 1, to: 10, dur: 0.6, color: 0xfff3c8, y: 0.4 });
      w.audio?.play('beam');
      w.audio?.play('thunder');
      w.effects.addShake(1.0);
      v.setState('launched', 4);
      v.iframes = 2.5; // nothing interrupts an execution
      let lift = 0;
      w.addUpdater((dt) => {
        if (!v.alive) { v.setOpacity(1); return false; }
        lift += dt;
        v.pos.x = gp.x;
        v.pos.z = gp.z;
        v.pos.y = lift * lift * 24; // accelerating ascension
        v.vel.set(0, 0, 0);
        v.grounded = false;
        v.setOpacity(Math.max(0.05, 1 - lift / 1.05));
        w.effects.glows.emit(gp.x + rand(-1.2, 1.2), v.pos.y + rand(0, v.height), gp.z + rand(-1.2, 1.2),
          0, 5, 0, { life: 0.4, size: 1.6, color: 0xfff3c8, alpha: 0.9 });
        if (lift < 1.15) return true;
        v.setOpacity(1);        // restored for the next round's body
        v.die(null);            // no attacker credited: no finisher cinematic
        v.group.visible = false; // taken — the sky keeps them
        return false;
      });
    });
  },

  // VIPER: coils to the ground, springs skyward — and SIXTY vipers leap out
  // in every direction, slithering down whoever they find. The first fang
  // pins the victim in place; the rest of the brood piles on.
  serpentStorm(f, u) {
    const w = f.world;
    const N = u.count || 60;
    f.setState('ult', 1.5);
    f.duckT = 1;
    w.audio?.play('cast');
    w.schedule(0.35, () => {
      if (!f.alive) return;
      f.vel.y = 16;
      f.grounded = false;
      f.animator.play('launched');
      w.audio?.play('jump');
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
              if (Math.random() < 0.25) w.audio?.play('dart');
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
                if (Math.random() < 0.35) w.audio?.play('slash');
                if (!pinUntil.has(prey)) {
                  pinUntil.set(prey, t + (u.paralyze || 2.4));
                  w.audio?.play('dart');
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

  // NOVA: a blinding flash, then a newborn SUN swells off her frame to twice
  // her height, collapses hard to half her size — and detonates across the
  // whole neighborhood. She alone stands in the quiet center.
  supernova(f, u) {
    const w = f.world;
    const GROW = 1.3, SHRINK = 0.45;
    cast(f, 'burst', { state: 'ult', stateT: GROW + SHRINK + 0.5, speed: 0.7 });
    f.iframes = GROW + SHRINK + 0.6;
    w.audio?.play('charge');
    // the flash
    w.effects.glows.emit(f.pos.x, f.pos.y + f.height * 0.6, f.pos.z, 0, 0, 0,
      { life: 0.28, size: 30, color: 0xffffff, alpha: 1 });
    const geo = new THREE.SphereGeometry(1, 28, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff6ea, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sun = new THREE.Mesh(geo, mat);
    w.scene.add(sun);
    // "twice her height" is the sphere's SIZE (diameter), not its radius
    const rMax = f.height * 1.05, rMin = f.height * 0.27;
    let t = 0;
    w.addUpdater((dt) => {
      if (!f.alive) return false;
      t += dt;
      sun.position.set(f.pos.x, f.pos.y + f.height * 0.55, f.pos.z);
      // the newborn star has GRAVITY: everyone else is dragged toward the
      // core the whole time it swells — and harder as it collapses
      const pull = t < GROW ? 22 : 52;
      for (const e of w.fighters) {
        if (e === f || !e.alive || f.isAllyOf(e)) continue;
        const dx = w.wrapDelta(f.pos.x - e.pos.x), dz = w.wrapDelta(f.pos.z - e.pos.z);
        const d = Math.hypot(dx, dz) || 1;
        if (d < u.radius * 2.6 && d > 2) {
          const g = pull * clamp01(1.5 - d / (u.radius * 2)) * dt;
          e.vel.x += (dx / d) * g;
          e.vel.z += (dz / d) * g;
          // infall streaks sell the drag
          if (Math.random() < dt * 8) {
            w.effects.glows.emit(e.pos.x, e.pos.y + rand(1, e.height), e.pos.z,
              (dx / d) * 8, 0.5, (dz / d) * 8,
              { life: 0.3, size: 0.9, color: 0xfff0d8, alpha: 0.7, drag: 0.5 });
          }
        }
      }
      let r;
      if (t < GROW) {
        r = 0.2 + (rMax - 0.2) * ss(clamp01(t / GROW));
        mat.opacity = 0.85;
      } else if (t < GROW + SHRINK) {
        r = rMax + (rMin - rMax) * ss(clamp01((t - GROW) / SHRINK));
        mat.opacity = 0.98; // densening core
      } else {
        // DETONATION — the collapse doubles the reach of the blast
        w.explode(f.pos, u.radius * 2, u.dmg * f.dmgMult(), { unblockable: true,
          owner: f, knock: 22, launch: 12, color: 0xfff0d8,
        });
        w.effects.explosion(sun.position, u.radius * 1.2, { color: 0xffffff, smoke: false });
        w.effects.rings.spawn(f.pos, { from: 2, to: u.radius * 4.2, dur: 0.7, color: 0xfff0d8, y: 0.6 });
        w.effects.rings.spawn(f.pos, { from: 1, to: u.radius * 2.6, dur: 0.5, color: 0xff5ce8, y: 1.4 });
        w.effects.addShake(1.6);
        w.engine.addHitStop(0.12);
        return false;
      }
      sun.scale.setScalar(Math.max(0.01, r));
      // boiling rim
      const a = rand(TAU);
      w.effects.glows.emit(
        sun.position.x + Math.cos(a) * r, sun.position.y + rand(-r, r) * 0.6, sun.position.z + Math.sin(a) * r,
        Math.cos(a) * 2, rand(1, 3), Math.sin(a) * 2,
        { life: 0.25, size: rand(0.8, 1.6), color: 0xfff0d8, alpha: 0.9 });
      return true;
    }, () => { w.scene.remove(sun); geo.dispose(); mat.dispose(); });
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
    w.audio?.play('powerup');
    w.audio?.play('charge');
    const dirX = Math.sin(f.yaw), dirZ = Math.cos(f.yaw);
    const hitAt = new Map(); // herd-wide: nobody gets trampled twice in a beat
    let t = 0;
    const trample = (px, pz) => {
      for (const e of w.fighters) {
        if (e === f || !e.alive || f.isAllyOf(e)) continue;
        if (t - (hitAt.get(e) ?? -9) < 0.45) continue;
        const dx = w.wrapDelta(e.pos.x - px), dz = w.wrapDelta(e.pos.z - pz);
        if (Math.hypot(dx, dz) < 3.4 * f.scale) {
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
      w.audio?.play('cast');
      w.addUpdater((dt) => {
        t += dt;
        // the real Rhino gallops point
        if (f.alive && f.state === 'ult') {
          f.vel.x = dirX * spd;
          f.vel.z = dirZ * spd;
          trample(f.pos.x, f.pos.z);
          if (Math.random() < 0.6) w.effects.dustPuff(f.pos, 2, 0x9a9088);
        }
        for (const s of shells) {
          s.g.position.x += dirX * spd * dt;
          s.g.position.z += dirZ * spd * dt;
          s.g.position.y = Math.abs(Math.sin(t * 11 + s.ph)) * 0.45;
          s.g.rotation.x = 0.1 + Math.sin(t * 11 + s.ph) * 0.05;
          if (Math.random() < 0.4) w.effects.dustPuff(s.g.position, 1, 0x9a9088);
          trample(s.g.position.x, s.g.position.z);
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
        w.audio?.play('thunder');
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
          if (Math.random() < 0.45) w.audio?.play('zap');
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

  // FENRIR: one howl at the sky — and a PACK of twenty low-running Fenrirs
  // floods the block, tearing through everything they brush past
  wildHunt(f, u) {
    const w = f.world;
    cast(f, 'castRaise', { state: 'ult', stateT: 1.2, speed: 1.1 });
    w.audio?.play('howl');
    w.effects.rings.spawn(f.pos, { from: 0.5, to: u.radius, dur: 0.9, color: 0x6cd8ff, y: 0.8 });
    // drop into the hunting crouch right before the pack bakes off him
    w.schedule(0.45, () => { if (f.alive) f.animator.play('lunge', { speed: 0.6 }); });
    w.schedule(0.62, () => {
      if (!f.alive) return;
      const N = u.count || 20;
      const wolves = [];
      // the rift tears open under the alpha — the pack pours up out of it
      summonPortal(w, f.pos.x, f.pos.z, { radius: 4.2, color: 0x6cd8ff, life: 1.9 });
      w.audio?.play('cast');
      for (let i = 0; i < N; i++) {
        const g = bakeShell(f);
        g.rotation.x = 0.5; // pitched down onto all fours
        g.scale.setScalar(0.92);
        const a = (i / N) * TAU + rand(-0.2, 0.2);
        g.position.set(f.pos.x + Math.cos(a) * rand(1, 3), 0.2, f.pos.z + Math.sin(a) * rand(1, 3));
        g.visible = false; // still on the far side of the rift
        w.scene.add(g);
        wolves.push({
          g, yaw: rand(TAU), turnT: rand(0, 0.2), spd: rand(16, 22), ph: rand(TAU),
          delay: 0.04 + i * 0.045, rise: 0,
        });
      }
      f.animator.stop(0.2);
      const hitAt = new Map(); // pack-wide bite cadence per victim
      let t = 0;
      w.addUpdater((dt) => {
        t += dt;
        for (const wl of wolves) {
          // staggered emergence: each wolf leaps out of the portal in turn
          if (wl.delay > 0) {
            wl.delay -= dt;
            if (wl.delay > 0) continue;
            wl.g.visible = true;
            summonFlash(w, wl.g, 0x9be8ff, 0.4);
            w.effects.impactSparks(wl.g.position, 0x6cd8ff, 8, 7);
            if (Math.random() < 0.3) w.audio?.play('howl', { vol: 0.2, pitch: rand(1.1, 1.5) });
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
          wl.turnT -= dt;
          const px = wl.g.position.x, pz = wl.g.position.z;
          if (wl.turnT <= 0) {
            wl.turnT = rand(0.3, 0.7);
            const homeDx = w.wrapDelta(f.pos.x - px), homeDz = w.wrapDelta(f.pos.z - pz);
            const prey = Math.random() < 0.55 ? nearestEnemyTo(f, px, pz, u.radius * 1.3) : null;
            if (Math.hypot(homeDx, homeDz) > u.radius) {
              wl.yaw = Math.atan2(homeDx, homeDz) + rand(-0.6, 0.6); // stay with the hunt
            } else if (prey) {
              wl.yaw = Math.atan2(w.wrapDelta(prey.pos.x - px), w.wrapDelta(prey.pos.z - pz)) + rand(-0.4, 0.4);
            } else {
              wl.yaw = rand(TAU); // every which way
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
            if (Math.hypot(dx, dz) < e.hitRadius + 1.2) {
              hitAt.set(e, t);
              e.takeHit(u.dmg * f.dmgMult(), f, { knock: 3, srcPos: wl.g.position, soft: Math.random() < 0.7 });
              w.effects.impactSparks(e.center(), 0x6cd8ff, 6, 6);
              if (Math.random() < 0.25) w.audio?.play('slash');
            }
          }
        }
        if (Math.random() < 0.02) w.audio?.play('howl', { vol: 0.3, pitch: rand(0.9, 1.3) });
        return t <= (u.duration || 4.5) && f.alive;
      }, () => {
        for (const wl of wolves) w.scene.remove(wl.g);
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
    w.audio?.play('powerup');
    w.effects.rings.spawn(f.pos, { from: 1, to: 12, dur: 0.7, color: 0xffd23c, y: 0.5 });
    const base = { scale: f.scale, h: f.baseHeight, hr: f.baseHitRadius, r: f.radius };
    const S = u.scale || 4;
    const GROW = 1.3, DUR = u.duration || 9;
    f.status.buff = { spd: 1.3, dmg: 1.4, t: DUR };
    let t = 0, crushT = 0, stompT = 0;
    const apply = (s) => {
      f.group.scale.setScalar(s);
      f.scale = base.scale * s;
      f.baseHeight = base.h * s;
      f.baseHitRadius = base.hr * s;
      f.radius = base.r * s;
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
        // thundering footfalls
        stompT -= dt;
        if (stompT <= 0 && Math.hypot(f.vel.x, f.vel.z) > 3 && f.grounded) {
          stompT = 0.38;
          w.effects.dustPuff(f.pos, 6, 0x9a9088);
          w.effects.addShake(0.3 * k);
          w.audio?.play('slam', { vol: 0.35 });
        }
      }
      return t <= DUR;
    }, () => {
      apply(1);
      f._giantK = false;
    });
  },

  // WRAITH: DEATH SWARM — the cloak tears apart into a shrieking flock of
  // a hundred and fifty bats that wheel around him in a black gyre and take
  // turns DIVE-BOMBING everything he hates, then pour back into the dark
  deathSwarm(f, u) {
    const w = f.world;
    const N = u.count || 150;
    cast(f, 'burst', { state: 'ult', stateT: 1.0, speed: 0.8 });
    w.audio?.play('howl');
    w.audio?.play('cloak');
    // the eye flares, then the flock erupts off the cloak
    const eye = f.mech.anchors.eye?.getWorldPosition(new THREE.Vector3()) || f.center();
    w.effects.glows.emit(eye.x, eye.y, eye.z, 0, 0, 0,
      { life: 0.4, size: 4, color: 0xff2030, alpha: 0.95 });
    w.effects.rings.spawn(f.pos, { from: 0.5, to: 9, dur: 0.6, color: 0x8a2030, y: f.height * 0.7 });
    // bat: a flat two-triangle W silhouette, flapped via wingspan scale
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.1, 0, 0, -0.12, -0.6, 0.06, -0.34,   // left wing
      0, 0, 0.1, 0.6, 0.06, -0.34, 0, 0, -0.12,    // right wing
    ], 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x201018, side: THREE.DoubleSide, transparent: true, opacity: 0.96,
    });
    const im = new THREE.InstancedMesh(geo, mat, N);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    w.scene.add(im);
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const E = new THREE.Euler();
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
      });
    }
    const hitAt = new Map(); // swarm-wide bite cadence per victim
    const DUR = u.duration || 7;
    let t = 0;
    w.addUpdater((dt) => {
      t += dt;
      const winding = t > DUR; // time up: the flock spirals up and thins out
      mat.opacity = winding ? Math.max(0, 0.96 * (1 - (t - DUR) / 1.1)) : 0.96;
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
                if (Math.random() < 0.12) w.audio?.play('howl', { vol: 0.2, pitch: rand(1.7, 2.2) });
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
        // flap: wingspan pulses; a diving bat folds tighter and drops flatter
        const flap = 0.55 + Math.abs(Math.sin(t * 15 + b.ph)) * 0.65;
        const pitch = b.state === 'dive' ? 0.6 : Math.sin(t * 4 + b.ph) * 0.15;
        Q.setFromEuler(E.set(pitch, yaw, Math.sin(t * 7 + b.ph) * 0.25));
        M.compose(P.set(b.x, b.y, b.z), Q, S.set(flap * b.sc, b.sc, b.sc));
        im.setMatrixAt(i, M);
      }
      im.instanceMatrix.needsUpdate = true;
      if (Math.random() < 0.05) w.audio?.play('howl', { vol: 0.14, pitch: rand(1.5, 2.0) });
      return t <= DUR + 1.1 && f.alive;
    }, () => { w.scene.remove(im); geo.dispose(); mat.dispose(); });
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
        w.audio?.play('flame');
        w.audio?.play('whooshBig');
        let t = 0, r = 1.6, swept = null, sweptT = 0, fpT = 0.4;
        // the funnel itself is a FireTornadoFX (helical shader shells +
        // ember spiral + burning base); spawnTornado owns its lifecycle,
        // this updater steers it and runs the hunt/sweep gameplay
        const fx = new FireTornadoFX(w.scene, w.effects, pos, {
          height: f.height * 3, radius: 1.0, wander: 0, cool: fireCool(f.def),
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
                color: fireCool(f.def)
                  ? (h < H * 0.45 ? 0x3f9cff : 0x1f5cff)
                  : (h < H * 0.45 ? 0xff7a20 : 0xff4210), alpha: 0.92, drag: 0.4 });
          }
          // it BELCHES: gouts of flame spat out of the wall, burning ground
          if (Math.random() < 0.12) {
            const a = rand(TAU);
            w.effects.fire(new THREE.Vector3(pos.x, rand(1, 4), pos.z),
              new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)), 24, 0.4, !!fireCool(f.def));
          }
          fpT -= dt;
          if (fpT <= 0) {
            fpT = 1.2;
            w.addFirePatch(f, new THREE.Vector3(pos.x + rand(-r, r) * 0.5, 0, pos.z + rand(-r, r) * 0.5), 2.0, 2.2, 8);
            if (Math.random() < 0.6) w.audio?.play('flame');
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
                w.audio?.play('explosionBig');
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
        w.audio?.play('freezeBig');
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
                w.audio?.play('freeze');
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
    w.audio?.play('cast');
    const dirX = Math.sin(f.yaw), dirZ = Math.cos(f.yaw);
    const perpX = dirZ, perpZ = -dirX;
    const ox = f.pos.x, oz = f.pos.z;
    const W = u.width || 30, R = u.range || 48, H = 9, SPD = 17;
    w.schedule(0.45, () => {
      if (!f.alive) return;
      w.audio?.play('wave');
      w.audio?.play('explosionBig');
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
        if (Math.random() < 0.3) w.audio?.play('wave', { vol: 0.35 });
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

  // SAURION: calls the pack — three full raptor clones drop in and fight
  // alongside him with everything he has (specials, pounces, quills), each
  // with a fraction of his plating and a timer on the visit
  raptorPack(f, u) {
    const w = f.world;
    cast(f, 'taunt', { state: 'ult', stateT: 1.1, speed: 1.3 });
    w.audio?.play('howl');
    w.audio?.play('powerup');
    volley(w, f, u.count || 3, 0.22, (i) => {
      const a = f.yaw + Math.PI + (i - 1) * 0.85 + rand(-0.15, 0.15);
      const pos = new THREE.Vector3(
        f.pos.x + Math.sin(a) * 3.6, 0, f.pos.z + Math.cos(a) * 3.6);
      // cloneMech shares the boss's geometry/textures — spawning is
      // near-free instead of a triple buildMech frame-stall
      const clone = new Fighter(w, f.def, {
        pos, yaw: f.yaw, playerIndex: f.playerIndex, isAI: true,
        mech: cloneMech(f.mech),
      });
      clone.isMinion = true;
      clone.allyOf = f;
      clone.maxHp = clone.hp = Math.round(f.maxHp * (u.hpFrac || 0.35));
      // runts of the litter: a shade smaller, darker plumage
      clone.group.scale.setScalar(0.85);
      clone.scale *= 0.85;
      clone.baseHeight *= 0.85;
      clone.height *= 0.85;
      clone.baseHitRadius *= 0.85;
      clone.hitRadius *= 0.85;
      clone.radius *= 0.85;
      for (const m of Object.values(clone.mech.materials)) {
        if (m && m.color) m.color.multiplyScalar(0.7);
      }
      w.addMinion(clone, new AIController(clone, 'ace'), u.duration || 18);
      // dragged across from another dimension: white-hot flash burning off
      summonFlash(w, clone.mech.group, 0xff8a5a, 0.55);
      w.effects.rings.spawn(pos, { from: 3.5, to: 0.5, dur: 0.4, color: 0xff3826, y: 1 });
      w.effects.impactSparks(clone.center(), 0xff3826, 12, 8);
      w.audio?.play('cast');
    }, { start: 0.25 });
  },

  // FROGGER: jaw drops open and a CROAK comes out — a resonant blast wave
  // that sets every nearby bot shuddering, locks their servos solid, and
  // then lets the stored resonance tear loose all at once
  sonicCroak(f, u) {
    const w = f.world;
    cast(f, 'burst', { state: 'ult', stateT: 1.4, speed: 0.8 });
    f.duckT = 1;
    w.audio?.play('howl', { pitch: 0.42, vol: 1 });
    w.audio?.play('wave', { pitch: 0.6 });
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
        if (Math.hypot(w.wrapDelta(e.pos.x - f.pos.x), w.wrapDelta(e.pos.z - f.pos.z)) < u.radius) {
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
          w.audio?.play('explosionBig');
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
    w.audio?.play('powerup');
    w.schedule(0.25, () => {
      if (!f.alive) return;
      f.vel.y = 14;
      f.grounded = false;
      w.audio?.play('jump');
      const N = u.count || 20;
      const clones = [];
      // the colony arrives through a rift in the floor, springing straight up
      summonPortal(w, f.pos.x, f.pos.z, { radius: 2.6, color: 0xff9a3c, life: 1.4 });
      w.audio?.play('cast');
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
            if (Math.random() < 0.1) w.audio?.play('jump', { vol: 0.25, pitch: rand(1.2, 1.8) });
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
        w.audio?.play('explosionBig');
        w.audio?.play('zap');
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
            if (Math.random() < 0.2) w.audio?.play('zap', { vol: 0.3 });
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
                w.audio?.play('zap');
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
};
