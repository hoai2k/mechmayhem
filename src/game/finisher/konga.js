import * as THREE from 'three';
import { lerp, rand } from '../../core/utils.js';
import { smooth } from './shared.js';

// KONGA: stalks in on his knuckles, REARS UP to full height and drums the
// chest (chestBeat) — the roar, the shoulder pods dumping a salvo into the
// sky as punctuation — then comes down on them: alternating haymakers
// (bigPunch1/bigPunch2), knuckle-walking after the body between each one so
// every fist LANDS, and finishes with the two-fisted kongaSlam that drives
// the wreck into the dirt. Hero pose on a low camera, over the crater.
export function konga(F) {
  const { win, vic, w } = F;

  // ---- 0.2-1.2 the stalk: four-point walk right up to knuckle range ----
  F.approach(0.2, 1.15, 5.4);
  // ground-level lens, low enough to read the knuckle-walk
  F.camShot(0.15, 1.2, { dist: 11, h: 1.7, az0: 1.95, az1: 1.35, lookH: 1.5 });

  // ---- 1.2-2.55 the intimidation beat: rear up and DRUM ----
  // (chestBeat drums at 0.42/0.58/0.74 and flings the arms wide at 0.92)
  F.at(1.2, () => { win.animator.play('chestBeat'); w.audio?.play('servo'); });
  // front quarter on the WINNER, pushing in a touch as he comes up off his
  // hands — the drum only reads from the chest side
  F.hold(1.2, 2.55, (k) => {
    const S = F.stageScale;
    const az = F.axis + lerp(0.62, 0.22, smooth(k));
    const d = (12 - 2.2 * smooth(k)) * S;
    F.cam.pos.set(win.pos.x + Math.sin(az) * d, 3.4 * S, win.pos.z + Math.cos(az) * d);
    F.cam.look.set(win.pos.x, win.height * 0.74, win.pos.z);
    F.headSafe();
  });
  for (let i = 0; i < 3; i++) {
    F.at(1.62 + i * 0.16, () => {
      F.beat('hitHeavy', 0.34 + i * 0.06, 0);
      w.effects.dustPuff(win.pos, 4);
      // the victim just stands there and takes the noise
      vic.animator.addImpulse('head', [0.18, rand(-0.2, 0.2), 0], 16, 6);
    });
  }
  // the roar, arms flung wide
  F.at(2.12, () => {
    w.audio?.play('howl');
    w.effects.addShake(0.8);
    w.effects.rings.spawn(win.pos, { from: 1.2, to: 11, dur: 0.5, color: 0xffa432, y: 0.4 });
    w.effects.dustPuff(win.pos, 12);
  });

  // ---- 2.15-2.9 punctuation: a pod salvo streaking off over the arena ----
  // Flavor only — the FISTS do the killing. Launch origins are captured on
  // the frame each missile leaves the pod, never re-read from live state.
  const salvo = [];
  const podPos = (side, out) => {
    const a = win.mech.anchors['pod' + side] || win.mech.anchors['muzzle' + side];
    return a ? a.getWorldPosition(out) : out.copy(win.center());
  };
  F.at(2.15, () => {
    const from = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      podPos(i % 2 ? 'L' : 'R', from);
      const spread = F.axis + rand(-0.5, 0.5);
      salvo.push({
        x: from.x, y: from.y, z: from.z,
        vx: Math.sin(spread) * rand(12, 17),
        vy: rand(26, 34),
        vz: Math.cos(spread) * rand(12, 17),
      });
      w.effects.muzzleFlash(from, 0xffa432);
    }
    w.audio?.play('missile');
  });
  F.hold(2.15, 2.9, (k, dt) => {
    for (const m of salvo) {
      m.vy -= 12 * dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      w.effects.glows.emit(m.x, m.y, m.z, 0, 0, 0,
        { life: 0.16, size: 1.1, color: 0xffc27a, alpha: 0.9 });
    }
  });
  F.at(2.88, () => { // they crack off somewhere over the skyline
    for (const m of salvo) {
      w.effects.explosion(new THREE.Vector3(m.x, m.y, m.z), 2.2, { color: 0xffa432, smoke: false });
    }
    w.audio?.play('explosion');
    salvo.length = 0;
  });

  // ---- 2.55-4.35 the pummel: he WALKS the body down between fists ----
  // knuckle-walk follow — the stand-off tightens for the overhead slam
  F.hold(2.55, 5.0, (k, dt) => {
    const stand = F.t > 4.2 ? 2.9 : 3.6;
    const dx = w.wrapDelta(vic.pos.x - win.pos.x);
    const dz = w.wrapDelta(vic.pos.z - win.pos.z);
    const d = Math.hypot(dx, dz) || 1;
    const gap = d - stand;
    win.yaw = win.targetYaw = Math.atan2(dx, dz);
    if (Math.abs(gap) > 0.05) {
      const step = Math.min(Math.abs(gap), 9 * dt) * Math.sign(gap);
      win.pos.x += (dx / d) * step;
      win.pos.z += (dz / d) * step;
    }
    win.pos.y = 0;
    F.winCtx = { speed: Math.abs(gap) > 0.5 ? 8 : 0, maxSpeed: 10, grounded: true };
  });
  F.camAction(2.6, 4.35, { dist: 12, h: 3.6, lookH: 2.4 });
  F.trackCenter(2.6, 5.6, 5);
  // three haymakers, alternating fists (bigPunch1 connects at +0.34)
  const PUNCH = [2.72, 3.24, 3.76];
  PUNCH.forEach((t, i) => {
    F.at(t, () => win.animator.play(i % 2 ? 'bigPunch2' : 'bigPunch1', { speed: 1.05 }));
    F.at(t + 0.34, () => {
      F.beat('hitHeavy', 0.6 + i * 0.1, 0.07);
      F.sparks(16 + i * 4, 11);
      F.vicFlinch();
      w.effects.dustPuff(vic.pos, 4);
    });
    // each fist bashes them off the mark — and he walks after them.
    // The bash angle is taken off the fixed stage axis, never off win.yaw:
    // the argument is evaluated when the SCRIPT is built, so a live yaw here
    // would bake in the pre-approach facing.
    F.vicBash(t + 0.35, F.axis + (i % 2 ? 0.55 : -0.55), 2.4, 0.9, i % 2 ? -0.9 : 0.9);
  });

  // ---- 4.35-5.05 the kill: two-fisted overhead slam (hit at +0.60) ----
  F.at(4.35, () => { win.animator.play('kongaSlam'); w.audio?.play('whooshBig'); });
  F.camShot(4.35, 5.6, { dist: 9.5, h: 2.2, az0: 1.5, az1: 1.05, lookH: 1.6 });
  F.at(4.95, () => {
    F.beat('slam', 1.3, 0.13);
    F.sparks(30, 17);
    F.vicDown(); // fists come down, the body becomes wreckage
    w.effects.dustPuff(vic.pos, 16);
    w.effects.rings.spawn(vic.pos, { from: 0.8, to: 9, dur: 0.42, color: 0xffb43c, y: 0.3 });
    for (const j of ['torso', 'head', 'shoulderL', 'shoulderR']) {
      vic.animator.addImpulse(j, [rand(-0.6, 0.6), -0.5, rand(-0.6, 0.6)], 22, 7);
    }
  });
  // driven forward and DOWN into the dirt, not lofted
  F.vicBash(4.96, F.axis, 1.6, 0.3, 1.3);
  F.at(5.06, () => F.finaleBurst());
  // the aftershock rolling out of the crater
  F.at(5.3, () => {
    w.effects.addShake(0.45);
    w.effects.rings.spawn(vic.pos, { from: 2, to: 13, dur: 0.6, color: 0xffa432, y: 0.25 });
    w.effects.dustPuff(vic.pos, 8);
  });

  // ---- 5.55-7.2 hero pose, low camera, chest still heaving ----
  F.triumph(5.55, 'taunt', 'howl');
}
