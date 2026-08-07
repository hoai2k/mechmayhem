import * as THREE from 'three';
import { rand } from '../../core/utils.js';
import { smooth } from './shared.js';
import { PERCH_BEATS } from '../../mechs/animations.js';

// SAURION: leaps straight onto the THROAT, rides them down flat — the
// body topples pivoting under his neck-grip — and jackhammer-bites the
// collar, then springs off, looks around, grooms
export function saurion(F) {
  const { win, vic, w } = F;
  F.approach(0.2, 0.85, 7);
  F.camShot(0, 1.5, { dist: 11.5, h: 4 });
  F.at(0.95, () => { win.animator.play('pounceLeap'); w.audio?.play('jump'); });
  const NECK = vic.height * 0.78; // collar line up the victim's body
  F.hold(0.95, 1.4, (k) => {
    const e = k;
    win.pos.x = F.center.x - Math.sin(F.axis) * 7 * (1 - e);
    win.pos.z = F.center.z - Math.cos(F.axis) * 7 * (1 - e);
    win.pos.y = Math.sin(e * Math.PI) * 5.5 + e * NECK;
  });
  const LATCH_SPEED = 0.9;   // the loop's own four beats, slow enough to read
  F.at(1.4, () => {
    F.beat('slash', 0.7, 0.09);
    win.animator.play('biteLatch', { speed: LATCH_SPEED });
    F.vicFlinch();
  });
  // rides them down with the jaws LOCKED at the throat: the neck stays
  // pinned under him at stage center and the body swings down beneath it
  const neckOff = new THREE.Vector3();
  const rideDown = (e, bob = 0) => {
    neckOff.set(0, NECK, 0).applyEuler(vic.group.rotation);
    vic.pos.x = F.center.x - neckOff.x;
    vic.pos.z = F.center.z - neckOff.z;
    vic.pos.y = 0;
    win.pos.x = F.center.x;
    win.pos.z = F.center.z;
    win.pos.y = Math.max(0.82, neckOff.y * (1 - e) + 0.55 * e) + bob;
    win.yaw = win.targetYaw = F.axis;
  };
  F.hold(1.4, 2.6, (k) => {
    const e = smooth(k);
    vic.group.rotation.x = -1.5 * e;
    rideDown(e);
  });
  // stays glued on the throat, bobbing with each bite
  F.hold(2.6, 4.15, (k) => rideDown(1, Math.abs(Math.sin(k * 26)) * 0.22));
  // low front shot: saurion's dipping head and the pinned collar fill
  // the frame instead of his tail
  F.camShot(1.4, 4.1, { dist: 7.5, h: 2.2, az0: 0.55, az1: -0.15, lookH: 1.2 });
  // JAWS AND CLAWS. biteLatch is a four-beat loop — hammer, right sickle,
  // hammer, left sickle — and the flurry is generated FROM those beats rather
  // than on a rhythm of its own, so every spark burst is a limb actually
  // arriving: a BITE lands on the throat right under his head, a RAKE tears
  // down the chest off to that hand's side and shoves the body that way. He is
  // not pecking a corpse, he is opening it up.
  const RAKE = new THREE.Vector3();
  const strike = (claw) => {
    const y = Math.max(0.9, win.pos.y + 0.25);
    if (!claw) {
      // kept modest — the low lens sits right on top of them
      w.effects.impactSparks(new THREE.Vector3(F.center.x, y, F.center.z), 0xff3826, 6, 6);
      w.audio?.play('slash');
      vic.animator.addImpulse('torso', [rand(-0.3, 0.3), 0, rand(-0.2, 0.2)], 30, 11);
      return;
    }
    const side = claw === 'R' ? 1 : -1;
    RAKE.set(F.center.x + Math.cos(F.axis) * side * 1.1, y - 0.5,
      F.center.z - Math.sin(F.axis) * side * 1.1);
    w.effects.impactSparks(RAKE, 0xff5a2a, 8, 7);
    w.audio?.play('slash', { vol: 0.5, pitch: rand(1.15, 1.35) });
    win.animator.addImpulse('shoulder' + claw, [0.5, 0, -0.35 * side], 22, 8);
    win.animator.addImpulse('elbow' + claw, [0.4, 0, 0], 22, 8);
    vic.animator.addImpulse('torso', [0, 0, -0.3 * side], 30, 11);
  };
  const BEATS = [[PERCH_BEATS.bite1, null], [PERCH_BEATS.rakeR, 'R'],
    [PERCH_BEATS.bite2, null], [PERCH_BEATS.rakeL, 'L']];
  for (let c = 0; ; c++) {
    const c0 = 1.4 + (c * PERCH_BEATS.loop) / LATCH_SPEED;
    if (c0 > 4.1) break;
    for (const [bt, claw] of BEATS) {
      const t = c0 + bt / LATCH_SPEED;
      if (t > 1.55 && t < 4.1) F.at(t, () => strike(claw));
    }
  }
  F.at(4.15, () => { win.animator.stop(0.1); w.audio?.play('jump'); });
  F.hold(4.15, 4.6, (k) => { // springs off the carcass
    win.pos.x = F.center.x - Math.sin(F.axis) * 4 * k;
    win.pos.z = F.center.z - Math.cos(F.axis) * 4 * k;
    win.pos.y = Math.sin(k * Math.PI) * 2.6;
  });
  // looks around, then the grooming head-dip — as close to licking his
  // lips as a mech gets
  F.at(4.8, () => win.animator.addImpulse('head', [0, 0.7, 0], 4.5, 2));
  F.at(5.6, () => { win.animator.addImpulse('head', [0.4, -0.55, 0], 7, 3); w.audio?.play('servo'); });
  F.triumph(6.1, 'taunt', 'howl');
}
