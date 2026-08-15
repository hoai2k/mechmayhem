import * as THREE from 'three';

// NOVA: the broken halo SPINS UP faster and faster, slams to apex and
// IGNITES — then starfire lances converge on the mark from every
// direction of the compass
export function nova(F) {
  const { win, vic, w } = F;
  F.approach(0.2, 0.9, 8);
  F.at(1.0, () => { win.animator.play('castRaise'); w.audio?.play('charge'); });
  // spin-up: her animator signature reads the ring angle and pulses the
  // glow as the crescents sweep alignment — accelerating = strobing
  F.hold(1.0, 2.4, (k, dt) => {
    const J = win.mech.joints;
    if (J.halo) J.halo.rotation.z += dt * (4 + 26 * k * k);
  });
  F.at(2.4, () => {
    F.beat('powerup', 0.5, 0.06);
    w.effects.rings.spawn(win.pos, { from: 0.4, to: 5.5, dur: 0.5, color: 0xff5ce8, y: win.height * 0.72 });
  });
  F.hold(2.4, F.dur, () => { // pinned at apex, blazing (signature maxes it)
    const J = win.mech.joints;
    if (J.halo) J.halo.rotation.z = 0;
  });
  // nine lances spiral around the compass, all converging on the victim
  for (let i = 0; i < 9; i++) {
    F.at(2.7 + i * 0.26, () => {
      const az = (i * 2.4) % (Math.PI * 2);
      const c = vic.center();
      const from = new THREE.Vector3(
        c.x + Math.sin(az) * 20, 4 + (i % 3) * 5, c.z + Math.cos(az) * 20);
      w.effects.beams.spawn(from, c, { radius: 0.5, dur: 0.3, color: 0xff5ce8 });
      w.effects.explosion(c, 2.4, { color: 0xff5ce8, smoke: false });
      F.beat('plasma', 0.5, 0.05);
      F.sparks(12, 9, 0xff5ce8);
      F.vicFlinch();
    });
  }
  F.vicBash(3.24, F.axis + 1.0, 1.5, 0.9, 0.8);
  F.vicBash(4.02, F.axis - 1.3, 1.5, 0.9, 0.8);
  F.trackCenter(2.7, 5.3, 4);
  // over-the-shoulder on the ring as it spins up, then wide convergence
  F.camShot(1.0, 2.6, { dist: 12, h: 3.4, az0: 3.35, az1: 3.15, lookH: 3 });
  F.camShot(2.6, 5.2, { dist: 13, h: 4.2, az0: 2.2, az1: 2.9, lookH: 3 });
  F.at(5.1, () => { F.vicDown(); F.finaleBurst(0xff5ce8); });
  F.triumph(5.5, 'burst', 'powerup');
}
