import * as THREE from 'three';
import { rand } from '../../core/utils.js';
import { FlameFX, fireTint, fireGlow, fireDeep } from '../../combat/flamefx.js';
import { smooth } from './shared.js';

// INFERNO: walks them down behind a wall of flame — the victim STAGGERS
// backwards burning the whole way until they drop into their own pyre
export function inferno(F) {
  const { win, vic, w } = F;
  const tint = fireTint(win.def); // a repainted inferno torches in his own colour
  F.approach(0.2, 1.0, 6.5);
  F.at(1.1, () => { win.animator.play('shootLoop'); w.audio?.play('flame'); });
  // hose the victim HEAD TO TOE: the jet's aim point sweeps up and down
  // their body while the whole frame catches fire and chars black
  F.hold(1.2, 4.2, (k, dt) => {
    F.winCtx = { speed: 0, grounded: true, firing: true }; // torch level
    const from = win.mech.anchors.muzzleR.getWorldPosition(new THREE.Vector3());
    // sweep: three full bottom-to-top-and-back passes over the spray
    const sweepY = vic.pos.y + (0.5 + 0.45 * Math.sin(k * Math.PI * 6)) * vic.height;
    const dir = new THREE.Vector3(
      vic.pos.x - from.x, sweepY - from.y, vic.pos.z - from.z).normalize();
    w.effects.jet('flame:fin', from, dir, {
      type: 'fire', tint, speed: 30, range: 13, gravity: -4, r0: 0.32, r1: 2.2,
    });
    // shader-card flames ride the torch: tongues off the nozzle, and the
    // VICTIM becomes a growing FlameFX burning source as they char.
    // Registered via spawnFlameJet so its updater ticks/extinguishes/cleans it.
    let fj = w.flameJets.get('fin');
    if (!fj) {
      fj = {
        nozzle: new FlameFX(w.scene, w.effects, from, { radius: 0.55, scale: 1.05, dir, cards: 5, light: false, tint }),
        impact: new FlameFX(w.scene, w.effects, vic.pos, { radius: 1.0, scale: 0.9, cards: 7, light: false, tint }),
        ttl: 0,
      };
      w.spawnFlameJet('fin', fj);
    }
    fj.ttl = 0.16;
    fj.nozzle.rekindle();
    fj.impact.rekindle();
    fj.nozzle.setPose(from, dir);
    fj.impact.setPose(vic.pos);
    fj.impact.scale = 0.9 + k * 0.9;   // the blaze builds as the paint chars
    fj.impact.radius = 1.0 + k * 0.5;
    if (Math.random() < dt * 10) w.effects.fire(from, dir, 30, 0.24, tint); // embers
    if (Math.random() < dt * 7) w.audio?.play('flame');
    vic.applyCharring?.(Math.min(1, k * 1.2));
    if (Math.random() < dt * 10) {
      w.effects.glows.emit(vic.pos.x + rand(-1, 1), vic.pos.y + rand(0.5, vic.height), vic.pos.z + rand(-1, 1),
        0, 3.5, 0, { life: 0.5, size: rand(1.2, 2.2), color: tint ? tint.stops[2] : 0xff7a20, alpha: 0.9 });
    }
  });
  // driven back step by burning step; inferno stalks after them
  F.hold(1.7, 3.5, (k, dt) => {
    vic.pos.x += Math.sin(F.axis) * dt * 1.6;
    vic.pos.z += Math.cos(F.axis) * dt * 1.6;
    win.pos.x += Math.sin(F.axis) * dt * 1.3;
    win.pos.z += Math.cos(F.axis) * dt * 1.3;
  });
  F.trackCenter(1.7, 4.6, 5);
  F.camAction(1.2, 5.2, { dist: 12.5, h: 3.6, lookH: 2.2 });
  F.at(1.9, () => F.vicFlinch());
  F.at(2.5, () => F.vicFlinch());
  F.at(3.1, () => F.vicFlinch());
  // the CRUMBLE: the burnt-out shell folds and collapses to the ground,
  // settling into the dirt while the blaze keeps raging over it
  F.at(4.25, () => {
    F.vicDown();
    w.audio?.play('bodyfall');
    w.effects.dustPuff(vic.pos, 8);
    w.addFirePatch(win, vic.pos.clone().setY(0), 3.4, 8, 8);
  });
  F.hold(4.25, 5.2, (k) => {
    vic.applyCharring?.(1);
    vic.pos.y = -0.35 * smooth(k) * vic.scale; // sags INTO the ground
  });
  F.at(4.45, () => F.finaleBurst(tint ? tint.stops[1] : 0xff6a20));
  // the pyre burns under the whole victory pose (the fire patch dropped
  // at 4.25 is a full FlameFX burning source — just add extra smoke)
  F.hold(4.4, F.dur, (k, dt) => {
    if (Math.random() < dt * 6) {
      w.effects.smoke.emit(vic.pos.x + rand(-1, 1), 1.5, vic.pos.z + rand(-1, 1),
        rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4),
        { life: rand(0.8, 1.4), size: rand(1.4, 2.4), color: 0x26221e, alpha: 0.4, grow: 1.6 });
    }
  });
  F.triumph(5.3, 'burst', 'flame');
}
