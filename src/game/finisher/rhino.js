import { lerp } from '../../core/utils.js';
import { smooth } from './shared.js';

// RHINO: backs off, gallops STRAIGHT THROUGH them, wheels around in a
// wide arc and tramples the wreck a SECOND time on the way back
export function rhino(F) {
  const { win, vic, w } = F;
  F.hold(0.2, 1.1, (k) => { // back up for the runway
    const e = smooth(k);
    win.pos.x = lerp(F.startPos.x, F.center.x - Math.sin(F.axis) * 17, e);
    win.pos.z = lerp(F.startPos.z, F.center.z - Math.cos(F.axis) * 17, e);
    win.yaw = win.targetYaw = F.axis;
  });
  F.at(1.2, () => { win.animator.play('chargeLean'); w.audio?.play('charge'); });
  F.hold(1.4, 2.5, (k, dt) => { // the charge (his signature gallops on ctx)
    win.pos.x = F.center.x - Math.sin(F.axis) * (17 - 24 * k);
    win.pos.z = F.center.z - Math.cos(F.axis) * (17 - 24 * k);
    F.winCtx = { speed: 14, maxSpeed: 14, grounded: true, charging: true };
    if (Math.random() < dt * 20) w.effects.dustPuff(win.pos, 2, 0x9a9088);
  });
  F.at(2.18, () => { // impact as he blows through the mark
    F.beat('hitHeavy', 1.1, 0.14);
    F.sparks(26, 16);
    vic.animator.play('launched');
  });
  // The cartwheel flies from a CAPTURED launch point, not from the live
  // F.center. The landing beat below re-centres the scene on the body, and
  // F.center is what this hold was measuring from — so on the frame those
  // two met, the corpse was re-placed 10 units past where it already was
  // and teleported ~20 units in one frame. The launch origin is now taken
  // once, on the first frame of the flight, and nothing downstream moves it.
  let lx, lz;
  F.hold(2.18, 3.2, (k) => {
    if (lx === undefined) { lx = F.center.x; lz = F.center.z; }
    vic.pos.x = lx + Math.sin(F.axis) * 10 * k;
    vic.pos.z = lz + Math.cos(F.axis) * 10 * k;
    vic.pos.y = Math.sin(Math.min(1, k) * Math.PI) * 5.5;
    vic.group.rotation.x = -k * 6;
  });
  F.at(3.2, () => {
    vic.group.rotation.x = 0;
    // land exactly where the flight ended, then hand over to the ragdoll —
    // no impulse to fling the body off the mark it just touched down on
    vic.pos.set(lx + Math.sin(F.axis) * 10, 0, lz + Math.cos(F.axis) * 10);
    vic.vel.set(0, 0, 0);
    F.vicDown();
    F.beat('bodyfall', 0.8, 0.06);
    w.effects.dustPuff(vic.pos, 12);
    F.center.set(vic.pos.x, 0, vic.pos.z);
  });
  F.camShot(1.4, 3.2, { dist: 10, h: 3, az0: 1.4, az1: 2.2, lookH: 2.6 });
  // wide banking turn beyond the body, wheeling round for the return run
  F.hold(3.25, 4.05, (k) => {
    const e = smooth(k);
    const along = lerp(-3, 11, e);
    const side = Math.sin(e * Math.PI) * 7;
    win.pos.x = F.center.x + Math.sin(F.axis) * along + Math.sin(F.axis + Math.PI / 2) * side;
    win.pos.z = F.center.z + Math.cos(F.axis) * along + Math.cos(F.axis + Math.PI / 2) * side;
    win.yaw = win.targetYaw = F.axis + Math.PI * e;
    F.winCtx = { speed: 10, maxSpeed: 14, grounded: true };
  });
  F.at(4.1, () => { win.animator.play('chargeLean'); w.audio?.play('charge'); });
  F.hold(4.25, 5.05, (k, dt) => { // return trample, right over the wreck
    const along = lerp(11, -7, k);
    win.pos.x = F.center.x + Math.sin(F.axis) * along;
    win.pos.z = F.center.z + Math.cos(F.axis) * along;
    win.yaw = win.targetYaw = F.axis + Math.PI;
    F.winCtx = { speed: 14, maxSpeed: 14, grounded: true, charging: true };
    if (Math.random() < dt * 20) w.effects.dustPuff(win.pos, 2, 0x9a9088);
  });
  F.at(4.74, () => { F.beat('hitHeavy', 1.0, 0.12); F.sparks(24, 15); });
  F.vicBash(4.74, F.axis + Math.PI - 0.5, 6.5, 2.4, 3.2);
  F.trackCenter(4.7, 5.6, 5);
  F.camShot(3.2, 5.3, { dist: 11, h: 3.2, az0: 1.9, az1: 1.1, lookH: 2.2 });
  F.at(5.3, () => F.finaleBurst());
  F.triumph(5.4, 'taunt', 'howl');
}
