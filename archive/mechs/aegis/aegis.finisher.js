import * as THREE from 'three';

// AEGIS: plants himself, reaches up to the heavens — and the sky ANSWERS:
// ten spears of light hammer down all over the mark until nothing stands
export function aegis(F) {
  const { win, vic, w } = F;
  F.approach(0.2, 1.0, 5.5);
  F.at(1.15, () => { win.animator.play('castRaise'); w.audio?.play('cast'); });
  F.at(1.5, () => {
    w.effects.rings.spawn(win.pos, { from: 0.5, to: 6, dur: 0.6, color: 0x49b7ff, y: 0.4 });
    w.audio?.play('charge');
  });
  // scattered azimuths, wandering in from the edges to dead-center
  const ring = [0.4, 2.4, 4.2, 1.1, 5.3, 3.3, 0.9, 2.0, 4.8, 0];
  for (let i = 0; i < 10; i++) {
    F.at(2.0 + i * 0.3, () => {
      const last = i >= 8; // the closing pair strikes square ON them
      const r = last ? 0.3 : 0.7 + (i % 3) * 1.2;
      const gx = vic.pos.x + Math.sin(ring[i]) * r;
      const gz = vic.pos.z + Math.cos(ring[i]) * r;
      const ground = new THREE.Vector3(gx, 0.1, gz);
      const top = new THREE.Vector3(gx, 55, gz);
      w.effects.beams.spawn(top, ground, { radius: last ? 1.7 : 0.8, dur: 0.5, color: 0xbfe8ff });
      w.effects.glows.emit(gx, 1.2, gz, 0, 0, 0, { life: 0.3, size: last ? 7 : 4.5, color: 0x9fd8ff, alpha: 1 });
      w.effects.explosion(new THREE.Vector3(gx, 0.8, gz), last ? 4 : 2.2, { color: 0x9fd8ff, smoke: false });
      F.beat('beam', last ? 1 : 0.5, last ? 0.1 : 0.04);
      F.vicFlinch();
    });
  }
  F.vicBash(2.92, F.axis + 1.2, 1.6, 0.9, 0.7);
  F.vicBash(3.82, F.axis - 1.4, 1.6, 0.9, 0.7);
  F.trackCenter(2.0, 5.2, 4);
  // arms-to-the-sky hero angle from the FRONT, low, looking up past the
  // victim's shoulder — then wide for the barrage
  F.camShot(1.05, 2.4, { dist: 11, h: 2.6, az0: 1.15, az1: 0.7, lookH: 4.5 });
  F.camShot(2.4, 5.1, { dist: 13, h: 4.5, az0: 2.7, az1: 2.25, lookH: 3.5 });
  F.at(5.0, () => { F.vicDown(); F.finaleBurst(0x9fd8ff); });
  F.triumph(5.4, 'victory', 'cast');
}
