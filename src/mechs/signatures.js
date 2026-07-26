// Per-mech SIGNATURE motion — the personality layer the animator runs
// every frame on top of clips/locomotion: vulcan's gatling spin, nova's
// halo, fenrir/saurion tails, jerry's nervous twitches, nullbot's failing
// display... One entry per mech id, dispatched by Animator.signature()
// (same registry idiom as SPECIALS/ULTS in combat/specials.js). Entries
// are (anim, dt, ctx, tgt): anim is the Animator (per-instance scratch
// state lives on it, e.g. anim._nerveT), ctx the fighter's frame context,
// tgt the pose target — write tgt for anything the pose smoother owns
// (hips/torso/head), drive extra joints (anim.J) directly.
//
// Mechs whose hand hardware needs the wrist counter-pitch don't add an
// entry for it — set `levelHands: true` in roster.js instead (the
// dispatcher applies it, procedural bodies only).
import * as THREE from 'three';
import { lerp, clamp, clamp01 } from '../core/utils.js';
import { PRONE_CLIPS } from './animations.js';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
// AEGIS shield carriage targets (see the aegis entry)
const SHIELD_REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.1, 0));
const SHIELD_BRACE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0));

// wrist counter-pitch for mechs whose hand hardware (gatling pods, torch
// bells, pincers) extends along the hand's +Z: as the arm chain raises, the
// hardware would pitch skyward, so the wrist rolls back by the raise amount
// — capped near 90° so fully-raised arms read as hardware STRETCHED along
// the arm line rather than a broken wrist. At rest (arms down) it's a no-op.
// PROCEDURAL-ONLY: a GLB's hand hardware is authored aligned to the forearm
// in its own bind pose, so this counter-pitch (built for the procedural
// models' +Z hand hardware) just TWISTS the GLB's wrists off the weapon line
// — Vulcan's gatlings bent downward, Inferno's torches upward. The
// dispatcher skips it for isGLB.
export function levelHands(tgt) {
  for (const side of ['L', 'R']) {
    const raise = -(tgt['shoulder' + side][0] + tgt['elbow' + side][0] * 0.5);
    if (raise > 0.05) {
      tgt['hand' + side][0] += Math.min(1.62, raise);
    }
  }
}

export const SIGNATURES = {
  vulcan(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    anim.spinVel = ctx.firing ? Math.min(anim.spinVel + dt * 40, 28) : Math.max(anim.spinVel - dt * 18, 0);
    if (J.gatlingR) J.gatlingR.rotation.z += anim.spinVel * dt;
    if (J.gatlingL) J.gatlingL.rotation.z -= anim.spinVel * dt;
  },

  nova(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // the broken halo spins; its glow SWELLS as the crescents sweep
    // toward apex alignment and dims past it. While lit, her whole glow
    // kit brightens and her shots grow (novaGlow is read by fireRanged).
    if (J.halo) {
      J.halo.rotation.z += dt * (0.9 + (ctx.firing ? 4 : 0));
      const g = 0.5 + 0.5 * Math.cos(2 * J.halo.rotation.z);
      anim.novaGlow = g;
      // UNMISTAKABLE power tell: the whole glow kit blazes toward apex —
      // way past its dim floor — and the halo physically swells with it
      const mats = anim.mech.materials;
      if (mats?.glowSoft) mats.glowSoft.emissiveIntensity = 0.25 + 6.5 * g * g;
      if (mats?.glow2) mats.glow2.emissiveIntensity = 2.4 * (0.4 + 2.0 * g);
      if (mats?.glow) mats.glow.emissiveIntensity = 1.6 + 2.6 * g * g;
      const hs = 1 + 0.12 * g * g;
      J.halo.scale.set(hs, hs, hs);
    }
  },

  rhino(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // BULL RUSH: stays on two legs but the whole frame pitches HARD
    // over the horn — a linebacker sprint, fists pumping, head up the
    // runway. (Written into tgt — direct writes get clobbered.)
    if (ctx.charging) {
      const g = anim.phase * 2.2;         // driving sprint cycle
      const fL = Math.sin(g), fR = Math.sin(g + Math.PI);
      tgt.hipsRot = [0.5, 0, 0];          // heavy forward lean...
      tgt.hipsPos = [0, -anim.D.hipHeight * 0.22, 0];
      tgt.torso = [0.55, 0, 0];           // ...chest down over the horn
      tgt.head = [-0.8, 0, 0];            // eyes forward
      // arms tucked and PUMPING with the stride
      tgt.shoulderL = [-0.4 + fL * 0.9, 0, -0.14];
      tgt.shoulderR = [-0.4 + fR * 0.9, 0, 0.14];
      tgt.elbowL = [-1.2, 0, 0];
      tgt.elbowR = [-1.2, 0, 0];
      tgt.handL = [0.2, 0, 0];
      tgt.handR = [0.2, 0, 0];
      // legs drive on the opposite phase, long and low
      tgt.thighL = [-0.5 + fR * 0.85, 0, 0];
      tgt.thighR = [-0.5 + fL * 0.85, 0, 0];
      tgt.kneeL = [0.6 + Math.max(0, -fR) * 0.8, 0, 0];
      tgt.kneeR = [0.6 + Math.max(0, -fL) * 0.8, 0, 0];
      tgt.ankleL = [-0.3, 0, 0];
      tgt.ankleR = [-0.3, 0, 0];
    }
  },

  fenrir(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    const wag = 0.25 + (ctx.speed > 1 ? 0.5 : 0);
    for (let i = 0; i < 3; i++) {
      const tj = J['tail' + i];
      if (tj) {
        tj.rotation.y = Math.sin(t * (2.2 + wag * 2) + i * 0.9) * (0.18 + wag * 0.14);
        tj.rotation.x = Math.sin(t * 1.4 + i * 0.7) * 0.08 - 0.06;
      }
    }
  },

  colossus(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    if (J.mortars) J.mortars.rotation.x = ctx.firing ? -0.25 : Math.sin(t * 0.4) * 0.03;
  },

  aegis(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // The tower shield rides the left forearm. While BLOCKING, cancel the
    // whole arm chain's rotation so the face presents square to the
    // front (never upside-down/backward); otherwise it settles back to
    // the natural forearm carry.
    const sh = J.shield;
    if (!sh) return;
    // the shield presents square to the front whenever AEGIS is in
    // control of it — idling, marching, blocking, and through every
    // aegis attack form. Only clips that wrench the shield away from
    // guard duty (the bulwark whirl) or take control of the body from
    // him (flinches, launches, intro, victory) let it ride the forearm.
    const act = anim.action && !anim.action.fadingOut ? anim.action.clip.name : '';
    const blocking = !act || act === 'block' || act.startsWith('aegis');
    if (blocking) {
      sh.parent.updateWorldMatrix(true, false);
      sh.parent.getWorldQuaternion(_qa).invert();          // undo arm chain
      anim.J.root.getWorldQuaternion(_qb).multiply(SHIELD_BRACE); // face mech-forward
      _qa.multiply(_qb);
      sh.quaternion.slerp(_qa, 1 - Math.exp(-18 * dt));
    } else {
      sh.quaternion.slerp(SHIELD_REST, 1 - Math.exp(-10 * dt));
    }
  },

  saurion(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // RAPTOR LOCOMOTION (researched theropod gait): the tail is a
    // travelling S-wave that wags side-to-side in time with the stride
    // to control angular momentum — raised at rest, whipping and
    // leveling out with speed — while the head counter-rotates to stay
    // stable on the prey as the body bobs and yaws.
    const run = clamp01((ctx.speed || 0) / (ctx.maxSpeed || 10));
    const ph = anim.phase;
    // predator dynamics: mid-strike the tail LASHES (fast heavy whip for
    // balance); in a dash it stiffens straight back as a counterweight;
    // otherwise stride-synced wave when moving, gentle sway at idle.
    const lashing = anim.action && !anim.action.fadingOut && !anim.action.clip.loop;
    const dashing = (ctx.dashT || 0) > 0;
    const wavePh = lashing ? t * 9 : run > 0.05 ? ph * 2 : t * 1.5;
    const amp = lashing ? 0.5 : dashing ? 0.06 : 0.1 + run * 0.3;
    for (let i = 0; i < 3; i++) {
      const tj = J['tail' + i];
      if (!tj) continue;
      // each segment lags the one before → an S-curve that runs down the tail
      tj.rotation.y = Math.sin(wavePh - i * 0.8) * amp;
      tj.rotation.x = (dashing ? 0.02 : 0.15 - run * 0.18) + Math.sin(wavePh * 0.5 - i * 0.5) * 0.05;
      tj.rotation.z = Math.cos(wavePh - i * 0.8) * amp * 0.3; // slight roll on the whip
    }
    // head stabilization: cancel the body's yaw sway + vertical bob so the
    // gaze holds level (real predators keep the head eerily still)
    if (J.head) {
      J.head.rotation.y -= Math.sin(ph) * 0.09 * run;
      J.head.rotation.x += Math.abs(Math.sin(ph)) * 0.06 * run - 0.03 * run;
    }
    // RAPTOR CARRIAGE (written into tgt — direct writes get clobbered):
    if (run > 0.05 && ctx.grounded !== false) {
      // running: the body levels out and stretches, head spearing
      // forward eyes-level — and the arms hold the classic tucked
      // half-raised carry instead of pumping like a jogger's.
      // (rest pitch 27° + locomotion lean already stack up: keep the
      // extra drop SMALL or the run reads nose-down)
      tgt.hipsRot[0] += 0.08 * run;
      tgt.hipsPos[1] -= 0.06 * run * anim.s;
      tgt.head[0] += -0.22 * run;
      const carryBob = Math.sin(ph * 2) * 0.05 * run;
      tgt.shoulderL[0] = lerp(tgt.shoulderL[0], -0.62 + carryBob, run);
      tgt.shoulderR[0] = lerp(tgt.shoulderR[0], -0.62 + carryBob, run);
      tgt.shoulderL[2] = lerp(tgt.shoulderL[2], -0.1, run);
      tgt.shoulderR[2] = lerp(tgt.shoulderR[2], 0.1, run);
      tgt.elbowL[0] = lerp(tgt.elbowL[0], -1.15, run);
      tgt.elbowR[0] = lerp(tgt.elbowR[0], -1.15, run);
      tgt.handL[0] = lerp(tgt.handL[0], 0.5, run);
      tgt.handR[0] = lerp(tgt.handR[0], 0.5, run);
      // longer, springier strides than the humanoid cycle gives
      tgt.thighL[0] += -Math.sin(ph) * 0.2 * run;
      tgt.thighR[0] += -Math.sin(ph + Math.PI) * 0.2 * run;
      tgt.kneeL[0] += Math.max(0, Math.sin(ph + 1.05)) * 0.24 * run;
      tgt.kneeR[0] += Math.max(0, Math.sin(ph + Math.PI + 1.05)) * 0.24 * run;
    } else if (run <= 0.05 && ctx.grounded !== false) {
      // idle: coiled and ALERT — weight rocking between the staggered
      // feet, claws flexing, head ticking in sharp little scans
      tgt.hipsRot[2] += Math.sin(t * 0.9) * 0.02;
      tgt.handL[0] += Math.sin(t * 1.4) * 0.08;
      tgt.handR[0] += Math.sin(t * 1.4 + 1.1) * 0.08;
      tgt.head[1] += Math.sin(t * 0.47) > 0.93 ? 0.22 : Math.sin(t * 0.31) * 0.1;
    }
  },

  frogger(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // FOUR ARMS as one creature: the upper cannon-pair pump in
    // ALTERNATION with the lower pair (counter-swing), like a galloping
    // four-limbed body, plus an idle bob so they never read as dead props.
    const c = anim.cur;
    const run = clamp01((ctx.speed || 0) / (ctx.maxSpeed || 10));
    const attacking = anim.action && !anim.action.fadingOut && !anim.action.clip.loop;
    // FROG LEAP: airborne, the cannon arms act like a diving frog's legs —
    // swept hard back while rising, splayed wide to brace for the landing.
    if (ctx.grounded === false) {
      const rise = clamp((ctx.vy || 0) / 12, -1, 1);
      const tuck = Math.max(0, rise), fall = Math.max(0, -rise);
      for (const sd of ['L', 'R']) {
        const sj = J['shoulder' + sd + '2'], ej = J['elbow' + sd + '2'];
        if (!sj || !ej) continue;
        const sx = sd === 'L' ? -1 : 1;
        sj.rotation.set(0.55 * tuck - 0.65 * fall, 0, sx * (0.18 * tuck - 0.38 * fall));
        ej.rotation.set(0.35 * tuck - 0.4 * fall, 0, 0);
      }
      return;
    }
    for (const sd of ['L', 'R']) {
      const sj = J['shoulder' + sd + '2'], ej = J['elbow' + sd + '2'];
      if (!sj || !ej || !c['shoulder' + sd]) continue;
      const sr = c['shoulder' + sd], er = c['elbow' + sd];
      const sx = sd === 'L' ? -1 : 1;
      // counter-swing the lower arm's pitch → the 4 limbs alternate
      const counter = -sr[0] * 0.7;
      const idle = Math.sin(t * 1.9 + (sd === 'L' ? 0 : Math.PI)) * 0.09 * (1 - run);
      // on an attack, the cannons rear back then punch forward with the arms
      const thrust = attacking ? sr[0] * 0.5 : 0;
      sj.rotation.set(counter * 0.7 + idle + thrust - 0.08, sr[1] * 0.4, sr[2] * 0.5 - sx * 0.06);
      ej.rotation.set(er[0] * 0.6 - 0.16 - run * 0.18, er[1] * 0.4, er[2] * 0.4);
    }
  },

  cranky(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    const act = anim.action;
    // crab menace: the pincers gape WIDE through a strike's wind-up, then
    // SNAP shut at the clamp (synced to the shared clip's own timing via
    // act.t/dur), easing back open after — otherwise breathe at rest.
    // ...but a rollover clip is a one-shot too, and a mech on its back is not
    // striking anything — the pincers just keep breathing while he's stranded
    const striking = act && !act.fadingOut && !act.clip.loop && !PRONE_CLIPS.has(act.clip.name);
    let gape;
    if (striking) {
      const ph = Math.min(1, act.t / act.clip.dur);
      gape = ph < 0.30 ? lerp(0.34, 0.55, ph / 0.30)
        : ph < 0.50 ? lerp(0.55, 0.02, (ph - 0.30) / 0.20)
          : lerp(0.02, 0.34, Math.min(1, (ph - 0.50) / 0.5));
    } else {
      gape = 0.34 + Math.sin(t * 1.4) * 0.14;
    }
    for (const sd of ['L', 'R']) {
      const jw = J['jaw' + sd];
      if (jw) jw.rotation.x = lerp(jw.rotation.x, -gape, dt * (striking ? 22 : 8));
    }
    // clawSnap is a straight-ahead CLAP: the clip reaches the arms outstretched
    // wide, then drives them together at the centerline. Keep the body square
    // through it (no boxer twist) so the read is "stretch out, smash in the
    // middle" and never a cross-body sweep. Overlapping pincers at the peak are
    // fine — the sideways travel IS the move.
    if (striking && act.clip.name === 'clawSnap') {
      tgt.hipsRot[1] *= 0.15;
      tgt.torso[1] *= 0.15;
    }
    // crab SCUTTLE: stride-synced shell roll + waddle yaw so the walk
    // reads sideways-crabby (via tgt — the smoother owns hips/torso)
    const scut = clamp01((ctx.speed || 0) / (ctx.maxSpeed || 10));
    if (scut > 0.05) {
      tgt.hipsRot[2] += Math.sin(anim.phase) * 0.11 * scut;
      tgt.hipsRot[1] += Math.cos(anim.phase) * 0.08 * scut;
      tgt.torso[2] -= Math.sin(anim.phase) * 0.06 * scut;
    }
    // hydro recoil: the whole shell kicks back while the cannons fire
    anim._crankyRecoil = lerp(anim._crankyRecoil || 0, ctx.firing ? 0.12 : 0, dt * (ctx.firing ? 18 : 6));
    tgt.torso[0] -= anim._crankyRecoil;
    // raised arms STRETCH the pincers out along the arm line instead
    // of leaving them at the resting 90° wrist crook
  },

  jerry(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // NERVOUS CRUSTACEAN. Nothing about Jerry moves smoothly:
    // • antennae hold dead still, then SNAP to a new angle (randomized
    //   timer) like a startled insect re-aiming its sensors
    // • the little claw-arm nest ripples in a wave down the segments,
    //   and flares wide open while the cannons fire
    // • the head cocks in sharp little tilts on the same nerve timer
    // • the rear strut-legs creep in counter-phase with the stride
    anim._nerveT = (anim._nerveT ?? 0) - dt;
    if (anim._nerveT <= 0) {
      anim._nerveT = 0.4 + Math.random() * 1.5;
      anim._antL = { x: -0.7 + Math.random() * 1.0, z: 0.15 + Math.random() * 0.65 };
      anim._antR = { x: -0.7 + Math.random() * 1.0, z: -0.15 - Math.random() * 0.65 };
      anim._cock = (Math.random() - 0.5) * 0.34;
    }
    const snap = 1 - Math.exp(-24 * dt); // fast ease = twitch, not sway
    if (J.antL && anim._antL) {
      J.antL.rotation.x += (anim._antL.x - J.antL.rotation.x) * snap;
      J.antL.rotation.z += (anim._antL.z - J.antL.rotation.z) * snap;
    }
    if (J.antR && anim._antR) {
      J.antR.rotation.x += (anim._antR.x - J.antR.rotation.x) * snap;
      J.antR.rotation.z += (anim._antR.z - J.antR.rotation.z) * snap;
    }
    tgt.head[2] += anim._cock ?? 0;
    // arm-nest ripple
    const flare = ctx.firing ? 0.55 : 0;
    for (let i = 0; i < 3; i++) {
      for (const sd of ['L', 'R']) {
        const aj = J['armS' + i + sd];
        if (!aj) continue;
        const sx = sd === 'L' ? -1 : 1;
        aj.rotation.x = -0.25 + Math.sin(t * 3.4 - i * 1.15 + (sx > 0 ? 0.7 : 0)) * 0.3;
        aj.rotation.z = sx * (-0.3 - flare) + Math.cos(t * 2.7 - i * 0.9) * 0.14 * sx;
      }
    }
    // rear struts creep against the stride; twitchy scrabble in the air
    const mov = clamp01((ctx.speed || 0) / (ctx.maxSpeed || 10));
    for (const sd of ['L', 'R']) {
      const dj = J['legD' + sd];
      if (!dj) continue;
      if (!ctx.grounded) dj.rotation.x = Math.sin(t * 14 + (sd === 'L' ? 0 : 2)) * 0.2;
      else dj.rotation.x = Math.sin(anim.phase + (sd === 'L' ? Math.PI : 0)) * 0.16 * mov;
    }
  },

  nullbot(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // the corruption shards bolted over the shell strobe like a failing
    // display — dead dark, then a hard flash, sometimes in the WRONG
    // color — and the head snaps in unsettling micro-ticks between
    // long dead stillness (nothing about it should read as alive)
    const mats = anim.mech.materials;
    anim._nbT = (anim._nbT ?? 0) - dt;
    if (anim._nbT <= 0) {
      anim._nbT = 0.05 + Math.random() * 0.16;
      const on = Math.random() < 0.72;
      if (mats?.glow2) {
        mats.glow2.emissiveIntensity = on ? 1.8 + Math.random() * 2.8 : 0.12;
        if (on && Math.random() < 0.35) {
          const c = [0x27f6ff, 0xff2df2, 0xff2038, 0x8a2dff][(Math.random() * 4) | 0];
          mats.glow2.color.setHex(c);
          mats.glow2.emissive.setHex(c);
        }
      }
    }
    if (anim._nbTwitch > 0) anim._nbTwitch -= dt;
    else if (Math.random() < dt * 0.7) {
      anim._nbTwitch = 0.5;
      anim.addImpulse('head', [0.06, (Math.random() < 0.5 ? -1 : 1) * 0.5, 0.1], 36, 15);
    }
  },

  viper(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    if (J.bladeL && J.bladeR) {
      const flare = ctx.firing || (anim.action && !anim.action.fadingOut) ? 0.0 : 0.35;
      J.bladeL.rotation.x = lerp(J.bladeL.rotation.x, flare, dt * 6);
      J.bladeR.rotation.x = lerp(J.bladeR.rotation.x, flare, dt * 6);
    }
  },
};
