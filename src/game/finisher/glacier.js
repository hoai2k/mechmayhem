import * as THREE from 'three';
import { rand } from '../../core/utils.js';

// GLACIER: freezes them solid white, walks up, and SHATTERS the statue —
// the frozen husk goes skittering and spinning across the ice
// GLACIER: hoses them down until they freeze solid WHITE — hands thrown
// up in surrender — then strolls over, reaches out DAINTILY, taps them
// once... and the whole statue bursts into a pile of frozen rubble.
export function glacier(F) {
  const { win, vic, w } = F;
  // same hardware as the Cryo Beam special: the mech's own channel clip holds
  // up the arm that actually carries the emitter, and the hose pours out of
  // its primary barrel (Glacier's is the ice lance in his LEFT hand)
  const CHANNEL = win.def.channelClip || 'shootLoop';
  const BARREL = win.mech.anchors[win.def.primaryMuzzle] || win.mech.anchors.muzzleR;
  F.at(0.35, () => { win.animator.play(CHANNEL); w.audio?.play('freeze'); });
  // the ice takes hold mid-panic: hands go UP and stay up
  F.at(0.9, () => vic.animator.play('frozenSurrender'));
  F.hold(0.45, 2.3, (k, dt) => {
    const from = BARREL.getWorldPosition(new THREE.Vector3());
    w.effects.beams.spawn(from, vic.center(), { radius: 0.5, dur: 0.14, color: 0x9be8ff });
    if (Math.random() < dt * 12) w.effects.snowCone(from, _dirTo(win, vic));
    vic._beamWhiteT = 0.2; // stays white under the beam
    vic.applyWhiteout(Math.min(1, k * 1.6));
  });
  F.at(2.3, () => { vic.applyWhiteout(1); w.audio?.play('freezeBig'); });
  F.hold(2.3, F.dur, () => vic.applyWhiteout(1)); // frozen stays frozen
  F.approach(2.4, 3.35, 2.9);
  // the dainty tap
  F.at(3.55, () => win.animator.play('daintyTap'));
  // raised side angle: the reach, the fingertip tap, and the statue all
  // read in profile with the camera looking slightly down on the touch
  F.camShot(2.4, 3.95, { dist: 12.5, h: 6.5, az0: 1.35, az1: 1.7, lookH: 3.2 });
  F.at(3.98, () => {
    // ...tink. The statue shatters into a pile of white frozen rubble.
    F.beat('shatter', 1.1, 0.16);
    vic.group.visible = false; // comes back at the next round's reset
    F._rubble = [];
    const S = vic.scale;
    for (let i = 0; i < 18; i++) {
      const r = rand(0.22, 0.55) * S;
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 0),
        new THREE.MeshStandardMaterial({
          color: 0xeaf6ff, roughness: 0.32, metalness: 0.05,
          emissive: 0x9fd8ff, emissiveIntensity: 0.12,
        }));
      const a = rand(Math.PI * 2), rr = rand(0, vic.hitRadius * 0.7);
      m.position.set(vic.pos.x + Math.cos(a) * rr,
        rand(0.4, vic.height * 0.95), vic.pos.z + Math.sin(a) * rr);
      m.rotation.set(rand(Math.PI * 2), rand(Math.PI * 2), rand(Math.PI * 2));
      w.addDebris(m); // persists as set dressing; swept at next round
      F._rubble.push({
        m, r,
        vx: Math.cos(a) * rand(1, 3.5), vy: rand(-1, 2.5), vz: Math.sin(a) * rand(1, 3.5),
        wx: rand(-6, 6), wz: rand(-6, 6),
      });
    }
    w.effects.impactSparks(vic.center(), 0xbfeaff, 34, 16);
    for (let i = 0; i < 16; i++) {
      w.effects.glows.emit(vic.pos.x + rand(-1, 1), rand(1, vic.height), vic.pos.z + rand(-1, 1),
        rand(-6, 6), rand(4, 10), rand(-6, 6),
        { life: rand(0.5, 0.9), size: rand(0.8, 1.6), color: 0xd8f4ff, alpha: 0.95, gravity: 18 });
    }
  });
  // the chunks tumble down and settle into the pile
  F.hold(3.98, 6.4, (k, dt) => {
    if (!F._rubble) return;
    for (const c of F._rubble) {
      if (c.rest) continue;
      c.vy -= 22 * dt;
      c.m.position.x += c.vx * dt;
      c.m.position.y += c.vy * dt;
      c.m.position.z += c.vz * dt;
      c.m.rotation.x += c.wx * dt;
      c.m.rotation.z += c.wz * dt;
      if (c.m.position.y <= c.r * 0.8) {
        c.m.position.y = c.r * 0.8;
        if (Math.abs(c.vy) > 3) { // one soft bounce, then settle
          c.vy = Math.abs(c.vy) * 0.3;
          c.vx *= 0.5; c.vz *= 0.5;
        } else {
          c.rest = true;
        }
      }
    }
    if (Math.random() < dt * 10) { // cold mist off the fresh pile
      w.effects.glows.emit(vic.pos.x + rand(-1.2, 1.2), rand(0.2, 1.2), vic.pos.z + rand(-1.2, 1.2),
        rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5),
        { life: rand(0.5, 1), size: rand(0.5, 1), color: 0xd8f4ff, alpha: 0.5 });
    }
  });
  // keep panning the same raised side view through the shatter so the
  // burst and the settling rubble pile stay in frame (no jump cut)
  F.camShot(3.95, 5.4, { dist: 13, h: 5.6, az0: 1.65, az1: 2.0, lookH: 1.8 });
  F.triumph(5.2, 'victory', 'freezeBig');
}

function _dirTo(a, b) {
  return new THREE.Vector3(b.pos.x - a.pos.x, 0, b.pos.z - a.pos.z).normalize();
}
