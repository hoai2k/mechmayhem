// AI opponent controller: writes an intent into its fighter each frame.
// Behavior: range management per archetype, strafing, combos, blocking,
// dodging, special/ult usage. Three difficulty tiers.
import { rand, clamp, angleDiff } from '../core/utils.js';
import { CONFIG } from '../core/config.js';
import { TUNING } from '../core/tuning.js';

// blockP/dodgeP are PER-SECOND reaction rates (they used to be rolled per
// FRAME, which made even a veteran block/dodge nearly everything — the #1
// "why does the AI feel unbeatable" culprit). aimErr is yaw error in
// radians applied to every AI aim snap (humans aim by camera; a perfect
// snap was the #2 culprit). pace scales the gaps between attack beats.
// useUlt:false means the tier never fires its ultimate at all — ROOKIE is
// the tier you learn the game on, and eating a STAMPEDE there teaches
// nothing. It still builds meter like everyone else; it just never spends it.
export const DIFFICULTY = {
  rookie: { react: 0.6, aggression: 0.4, blockP: 0.5, dodgeP: 0.4, ultDelay: 2.8, useUlt: false, err: 0.5, aimErr: 0.3, pace: 1.7 },
  veteran: { react: 0.34, aggression: 0.65, blockP: 1.4, dodgeP: 1.0, ultDelay: 1.3, useUlt: true, err: 0.28, aimErr: 0.16, pace: 1.15 },
  ace: { react: 0.16, aggression: 0.88, blockP: 3.2, dodgeP: 2.2, ultDelay: 0.5, useUlt: true, err: 0.1, aimErr: 0.05, pace: 0.75 },
  // TRAINING DUMMY (game/training.js). Not a tier you can pick at mech select
  // — every CPU slot in a training session becomes one. `passive` is the whole
  // of it: it never attacks, blocks, dodges or ults, it turns to face the
  // nearest person, and if it gets knocked more than DUMMY_LEASH from its pad
  // it walks back so the practice target is always where you left it.
  dummy: { react: 0.5, aggression: 0, blockP: 0, dodgeP: 0, ultDelay: 99, useUlt: false, err: 1, aimErr: 0, pace: 1, passive: true },
};
const DUMMY_LEASH = 15;     // units off its pad before a dummy walks home
const DUMMY_HOME = 2;       // ...and how close counts as home again

// preferred fighting range by ranged-weapon type
function preferredRange(def) {
  const t = def.moves.ranged.type;
  if (t === 'railgun' || t === 'mortar') return 26;
  if (t === 'gatling' || t === 'plasma' || t === 'shell' || t === 'lightning' || t === 'bats') return 16;
  if (t === 'shard' || t === 'slime' || t === 'flea' || t === 'glitch') return 14;
  if (t === 'goo') return 18; // JERRY's bilge spit outranges a slime gun
  if (t === 'fist' || t === 'spikes') return 13; // boomerang fist / spine volley
  if (t === 'flame' || t === 'hose') return 9;
  if (t === 'groundpound') return 4; // stand IN their face and slam
  return 5; // brawlers (dart, wave, rocket, feather)
}

// A BRAWLER IS A MECH, NOT A WEAPON. `preferredRange` says where a GUN wants
// to stand, and for a long while it was also who the CPU thought it was: a
// rocket fist reads 13, a shoulder cannon 16, so CPU TITANUS held thirteen
// units, backed away whenever you got inside eight and never threw a punch —
// eleven of the seventeen played as the same kiting zoner. These weapons are
// what a brawler carries for the walk in; the roster may also say so outright
// with `aiRole: 'brawler' | 'zoner'`.
const BRAWLER_WEAPONS = new Set(['fist', 'shell', 'shard', 'glitch', 'salvo', 'siege', 'blade', 'wave', 'dart', 'rocket', 'feather']);
function isBrawler(def, rangedPref) {
  if (def.aiRole) return def.aiRole === 'brawler';
  return rangedPref <= 6 || BRAWLER_WEAPONS.has(def.moves.ranged.type);
}

// self-centered AoE moves only connect up close — gate them by their radius
// instead of the weapon's preferred range
const SELF_AOE_SPECIALS = new Set(['groundPound', 'staticField', 'grabThrow']);
const SELF_AOE_ULTS = new Set(['wildHunt', 'sonicCroak', 'thunderfall', 'absoluteZero', 'fleaCircus']);

export class AIController {
  constructor(fighter, difficulty = 'veteran') {
    this.f = fighter;
    this.d = DIFFICULTY[difficulty] || DIFFICULTY.veteran;
    this.target = null;
    this.decideT = 0;
    this.mode = 'approach';   // approach | strafe | retreat | engage
    this.strafeDir = 1;
    this.jumpT = rand(2, 5);
    this.rangedPref = preferredRange(fighter.def);
    this.brawler = isBrawler(fighter.def, this.rangedPref);
    this.hold = null;   // {key, t}: a charge attack being held (see below)
    this.thinkNoise = rand(100);
    // a dummy's pad: where it was stood at the start (and re-stood on respawn)
    this.home = fighter.pos.clone();
    this.returning = false;
  }

  // ---- the training dummy: stand there, face whoever is nearest, and walk
  // back to the pad if a blow carried you off it. No intent but movement is
  // ever set, so it cannot attack, block, dodge or ult by construction.
  updateDummy() {
    const f = this.f;
    const I = f.intent;
    const w = f.world;
    let best = null, bestD = Infinity;
    for (const o of w.fighters) {
      if (o === f || o.isAI || !o.alive) continue;
      const d = Math.hypot(w.wrapDelta(o.pos.x - f.pos.x), w.wrapDelta(o.pos.z - f.pos.z));
      if (d < bestD) { best = o; bestD = d; }
    }
    const hx = w.wrapDelta(this.home.x - f.pos.x), hz = w.wrapDelta(this.home.z - f.pos.z);
    const hd = Math.hypot(hx, hz);
    // a LATCH, not a comparison: past the leash it commits to walking home
    // and lets go only once it is there, or it would stop on the leash line
    if (hd > DUMMY_LEASH) this.returning = true;
    else if (hd < DUMMY_HOME) this.returning = false;
    if (this.returning && hd > 0.01) {
      I.moveX = hx / hd; I.moveZ = hz / hd;
    } else {
      I.moveX = I.moveZ = 0;
      if (best && f.state === 'normal' && f.grounded) f.targetYaw = f.yawTo(best);
    }
  }

  nearestCrate() {
    const f = this.f;
    let box = null, boxD = Infinity;
    for (const p of f.world.pickups) {
      if (!p.active) continue;
      const bx = f.world.wrapDelta(p.pos.x - f.pos.x), bz = f.world.wrapDelta(p.pos.z - f.pos.z);
      const d = Math.hypot(bx, bz);
      if (d < boxD) { box = { bx, bz, d }; boxD = d; }
    }
    return box;
  }

  update(dt) {
    const f = this.f;
    const I = f.intent;
    // clear one-shot intents
    I.jump = I.light = I.heavy = I.special = I.ult = I.dash = I.taunt = false;
    I.lightHeld = I.heavyHeld = false;
    I.ranged = false;
    I.block = false;
    I.duck = false;
    I.specialHeld = false;
    if (!f.alive || f.controlsLocked) { I.moveX = I.moveZ = 0; return; }
    if (this.d.passive) { this.updateDummy(); return; }

    // retarget occasionally — and IMMEDIATELY drop a target we've picked up
    // (colossus' grab): a carried victim rides directly over the carrier, so
    // steering at them is steering at your own head
    if (!this.target || !this.target.alive || this.target._carry?.by === f ||
        Math.random() < dt * 0.4) {
      this.target = f.nearestEnemy();
    }
    const t = this.target;
    if (!t) { I.moveX = I.moveZ = 0; return; }

    // downed? spring clear sometimes instead of eating the loop
    if (f.state === 'knockdown' && Math.random() < dt * (1.5 + this.d.aggression * 2)) {
      I.jump = true;
      return;
    }

    // nearest-image pursuit — chases straight through the arena seam
    const dx = f.world.wrapDelta(t.pos.x - f.pos.x), dz = f.world.wrapDelta(t.pos.z - f.pos.z);
    const dist = Math.hypot(dx, dz);
    const nx = dx / (dist || 1), nz = dz / (dist || 1);

    // periodic mode decisions
    this.decideT -= dt;
    if (this.decideT <= 0) {
      this.decideT = this.d.react + rand(0, this.d.react);
      const r = Math.random();
      const hurt = f.hp / f.maxHp < 0.3;
      if (hurt && r < 0.25) this.mode = 'retreat';
      else if (dist > this.rangedPref * 1.5) this.mode = 'approach';
      else if (r < this.d.aggression) this.mode = 'engage';
      else this.mode = 'strafe';
      if (Math.random() < 0.3) this.strafeDir *= -1;
    }

    // ---- movement ----
    let mx = 0, mz = 0;
    // a dry magazine with no crate to be had makes anybody a brawler for now:
    // the CPU used to keep its zoner spacing and attack with nothing
    const dry = f.ammoMax !== undefined && f.ammo <= 0;
    const crate = dry ? this.nearestCrate() : null;
    const melee = this.brawler || (dry && !crate);
    const wantDist = this.mode === 'engage' && melee ? 2.5 : this.rangedPref;
    if (this.mode === 'approach' || (this.mode === 'engage' && dist > wantDist + 1)) {
      mx = nx; mz = nz;
    } else if (this.mode === 'retreat') {
      mx = -nx; mz = -nz;
    } else if (this.mode === 'strafe') {
      mx = -nz * this.strafeDir + nx * 0.15;
      mz = nx * this.strafeDir + nz * 0.15;
    }
    // spacing: don't hug when ranged
    if (!melee && dist < wantDist * 0.6) { mx = -nx; mz = -nz; }

    // dry burst weapon: detour to the nearest ammo crate
    if (crate && crate.d > 2) { mx = crate.bx / crate.d; mz = crate.bz / crate.d; }
    // empty pouch and no enemy breathing down its neck: swing by a nearby
    // ult fountain (ground-level ones only — see fountains.nearestForAI)
    if (this.d.useUlt && f.ultCharges === 0 && dist > 16 && f.world.fountains) {
      const fn = f.world.fountains.nearestForAI(f);
      if (fn) {
        const bx = f.world.wrapDelta(fn.x - f.pos.x), bz = f.world.wrapDelta(fn.z - f.pos.z);
        const d = Math.hypot(bx, bz);
        if (d > 1.2) { mx = bx / d; mz = bz / d; }
      }
    }
    I.moveX = mx; I.moveZ = mz;

    // occasional hops
    this.jumpT -= dt;
    if (this.jumpT <= 0) {
      this.jumpT = rand(2.5, 6);
      if (Math.random() < 0.5) I.jump = true;
    }

    // ---- defense: react to attacking enemies (per-SECOND rates, so a
    // reaction is a humanlike read, not a guaranteed per-frame reflex) ----
    const threat = t.state === 'attack' || t.state === 'special' || t.state === 'ult';
    if (threat && dist < 8) {
      if (Math.random() < this.d.dodgeP * dt) I.dash = true;
      else if (Math.random() < this.d.blockP * dt) this._blockT = rand(0.35, 0.7);
    }
    // dodge incoming projectiles
    if (Math.random() < this.d.dodgeP * dt * 1.2) {
      for (const p of f.world.projectiles.active) {
        if (p.owner === f) continue;
        const toF = f.pos.distanceTo(p.mesh.position);
        if (toF < 12) { I.dash = true; break; }
      }
    }
    // a triggered block is HELD for a beat (one-frame blocks did nothing)
    if (this._blockT > 0) {
      this._blockT -= dt;
      I.block = true;
    }
    if (I.block) { I.moveX = I.moveZ = 0; }

    // Rhino's bull rush is a HELD charge — keep the button down once it's
    // rolling so it plows for its full duration (a few seconds, then let go)
    if (f.state === 'special' && f._charging) {
      this._holdCharge = (this._holdCharge || 0) + dt;
      if (this._holdCharge < 2.5 + Math.random() * 2) { I.special = true; I.specialHeld = true; }
      return;
    }
    this._holdCharge = 0;

    // if the target is turtling behind a facing block, crouch to slip the
    // next attack UNDER their high guard (guard break now lives only on
    // Saurion's pounce, so even he ducks for his normal swings)
    const targetBlocking = t.blocking && dist < 7;
    if (targetBlocking && Math.random() < 0.6) I.duck = true;

    // ---- offense: PACED beats instead of every-frame spam ----
    // aim error rides on the fighter's AI aim snap (fighter.js applies it)
    f._aimErr = this.d.aimErr;
    this._atkT = (this._atkT || 0) - dt;
    this._fireT = (this._fireT || 0) - dt;
    this._fireCd = (this._fireCd || 0) - dt;
    // A CHARGE ATTACK IS HELD, then let go. TITANUS' and COLOSSUS' haymakers
    // and heavies bank damage while the button stays down — and the CPU only
    // ever tapped, so the two hardest hitters on the roster threw every blow at
    // its 0.8x floor. Hold for the chosen wind-up, then release (the release
    // itself is fighter.js' job: it fires when the held flag drops).
    if (this.hold) {
      this.hold.t -= dt;
      if (this.hold.t > 0 && f.state === 'attack') { I[this.hold.key] = true; return; }
      this.hold = null;
    }
    if (f.canAct() && !I.block) {
      const uMv = f.def.moves.ult;
      const ultRange = SELF_AOE_ULTS.has(uMv.id) ? (uMv.radius || 12) - 2 : 24;
      const spMv = f.def.moves.special;
      const spRange = SELF_AOE_SPECIALS.has(spMv.id) ? (spMv.radius || 8) - 1 : this.rangedPref * 1.6;
      // NOTE: no CONFIG.debugUltimates here. INFINITE ULTIMATES is a PLAYER
      // cheat (fighter.js grants it to human-controlled fighters only), so
      // the CPU spends a real, earned meter whatever the setting says.
      if (this.d.useUlt && f.ult >= 1 && dist < ultRange && Math.random() < dt / this.d.ultDelay) {
        I.ult = true;
      } else if (!f.isMinion && f.specialCd <= 0 && dist < spRange && Math.random() < dt * 1.4) {
        // (a SUMMON throws no specials: three raptors with the full sickle
        // pounce were an ult inside an ult)
        I.special = true;
      } else if ((melee || dist < 6) && dist < f.def.moves.light.range * f.scale + 1.2) {
        if (this._atkT <= 0) {
          // a swing beat: sometimes the AI hesitates instead (its "whiff")
          this._atkT = (0.2 + this.d.react * rand(0.9, 1.8)) * this.d.pace;
          if (Math.random() >= this.d.err) {
            const heavy = Math.random() < 0.25;
            if (heavy) I.heavy = true; else I.light = true;
            const holds = heavy ? f.def.heavyHold : f.def.punchHold;
            if (holds) {
              const cap = heavy ? TUNING.melee.heavyHoldCap : TUNING.melee.punchHoldCap;
              // the harder tiers wind up further; a rookie mostly taps
              const k = rand(0.15, 0.35 + this.d.aggression * 0.6);
              this.hold = { key: heavy ? 'heavyHeld' : 'lightHeld', t: k * cap };
              I[this.hold.key] = true;
            }
          }
        }
      } else if (dist < this.rangedPref * 1.7 && !dry) {
        // …and a brawler outside arm's reach shoots on the way in, which is
        // what the rocket fist and the shoulder cannon are for
        // fire in human-length BURSTS with real pauses between them,
        // not a continuous max-rate hose
        if (this._fireT > 0) {
          I.ranged = true;
          I.duck = false; // can't fire mid-crouch reliably; stand to shoot
        } else if (this._fireCd <= 0 && Math.random() < dt * 3) {
          this._fireT = rand(0.5, 1.2);
          this._fireCd = this._fireT + (0.4 + this.d.react * rand(1, 2)) * this.d.pace;
        }
      }
    }
  }
}
