import * as THREE from 'three';
import { lerp, rand } from '../../core/utils.js';
import { smooth } from './shared.js';

// TRITONE: backs off to open a runway, paws the dirt, then CHARGES — six
// tonnes on four columns arriving at the end of a line. The victim is caught
// ON THE HORNS at impact and CARRIED, still travelling, until the neck rips
// up (tritoneToss) and hurls them clear. Then he PLANTS (tritoneBrace) and
// puts both flank cannons into the wreck point-blank, three shells, before
// the finale burst and the hero pose.
export function tritone(F) {
  const { win, vic, w } = F;
  const V = new THREE.Vector3();

  // ---- 0.2-1.15 back up for the runway ----
  const RUN = 19;
  F.hold(0.2, 1.15, (k) => {
    const e = smooth(k);
    win.pos.x = lerp(F.startPos.x, F.center.x - Math.sin(F.axis) * RUN, e);
    win.pos.z = lerp(F.startPos.z, F.center.z - Math.cos(F.axis) * RUN, e);
    win.pos.y = Math.max(0, F.startPos.y * (1 - e));
    win.yaw = win.targetYaw = F.axis;
    F.winCtx = { speed: k < 0.96 ? 5 : 0, maxSpeed: 9, grounded: true };
  });
  // pawing the dirt at the top of the runway
  F.at(1.18, () => {
    win.animator.play('chargeLean');
    w.audio?.play('charge');
    w.effects.dustPuff(win.pos, 8);
  });
  F.at(1.3, () => { F.beat('slam', 0.35, 0); w.effects.dustPuff(win.pos, 6); });

  // ---- 1.4-2.3 THE CHARGE ----
  F.hold(1.4, 2.3, (k, dt) => {
    const along = lerp(RUN, 2.6, k); // stops with the horns on the mark
    win.pos.x = F.center.x - Math.sin(F.axis) * along;
    win.pos.z = F.center.z - Math.cos(F.axis) * along;
    win.pos.y = 0;
    win.yaw = win.targetYaw = F.axis;
    F.winCtx = { speed: 15, maxSpeed: 15, grounded: true, charging: true };
    if (Math.random() < dt * 24) w.effects.dustPuff(win.pos, 3, 0x9a9088);
  });
  // low, wide lens riding the line he picked
  F.camShot(1.35, 2.35, { dist: 11, h: 2.1, az0: 1.45, az1: 2.15, lookH: 2.2 });

  // ---- 2.3 CAUGHT ON THE HORNS ----
  F.at(2.3, () => {
    F.beat('hitHeavy', 1.25, 0.14);
    F.sparks(30, 18);
    F.ragdoll(vic); // limp from the moment the horns go in
    w.effects.dustPuff(vic.pos, 14);
    w.effects.rings.spawn(vic.pos, { from: 0.8, to: 8, dur: 0.4, color: 0xff8a24, y: 0.3 });
  });

  // ---- 2.3-3.15 the CARRY: still moving, the body up on the horns ----
  const hornPos = (out) => {
    const a = win.mech.anchors.hornNose || win.mech.joints?.head;
    return a ? a.getWorldPosition(out) : out.copy(win.center());
  };
  F.hold(2.3, 3.15, (k, dt) => {
    const e = smooth(k);
    const along = lerp(2.6, -6, e); // ploughs on THROUGH the mark
    win.pos.x = F.center.x - Math.sin(F.axis) * along;
    win.pos.z = F.center.z - Math.cos(F.axis) * along;
    win.pos.y = 0;
    win.yaw = win.targetYaw = F.axis;
    F.winCtx = { speed: lerp(15, 3, e), maxSpeed: 15, grounded: true, charging: k < 0.6 };
    // pinned just past the horn tips, folded back over the frill
    hornPos(V);
    vic.pos.x = V.x + Math.sin(F.axis) * 1.1;
    vic.pos.z = V.z + Math.cos(F.axis) * 1.1;
    vic.pos.y = Math.max(0.2, V.y - vic.height * 0.42);
    vic.yaw = vic.targetYaw = F.axis;
    vic.group.rotation.y = vic.yaw;
    vic.group.rotation.x = -0.85;
    if (Math.random() < dt * 26) w.effects.dustPuff(win.pos, 3, 0x9a9088);
    if (Math.random() < dt * 14) F.sparks(6, 7, 0xff8a24);
  });
  F.camAction(2.35, 3.7, { dist: 12, h: 3.2, lookH: 2.4, rate: 2.5 });

  // ---- 3.05-3.63 dig LOW, then RIP UP (tritoneToss rips at +0.58) ----
  F.at(3.05, () => win.animator.play('tritoneToss'));
  // the horns shovel down first — the body goes with them
  F.hold(3.15, 3.63, (k) => {
    hornPos(V);
    vic.pos.x = V.x + Math.sin(F.axis) * 1.1;
    vic.pos.z = V.z + Math.cos(F.axis) * 1.1;
    vic.pos.y = Math.max(0.15, V.y - vic.height * 0.42);
    vic.group.rotation.x = -0.85 - 0.5 * smooth(k);
    win.pos.x = F.center.x + Math.sin(F.axis) * 6;
    win.pos.z = F.center.z + Math.cos(F.axis) * 6;
    win.yaw = win.targetYaw = F.axis;
  });
  F.at(3.63, () => {
    F.beat('hitHeavy', 1.1, 0.12);
    w.audio?.play('whooshBig');
    F.sparks(24, 16);
    vic.animator.play('launched');
  });
  // the hurl: origin captured on the first frame of the flight so nothing
  // downstream (trackCenter, the landing re-centre) can move it mid-arc
  let lx, ly, lz;
  F.hold(3.63, 4.42, (k) => {
    if (lx === undefined) { lx = vic.pos.x; ly = vic.pos.y; lz = vic.pos.z; }
    const e = 1 - (1 - k) * (1 - k);
    vic.pos.x = lx + Math.sin(F.axis) * 7 * e;
    vic.pos.z = lz + Math.cos(F.axis) * 7 * e;
    vic.pos.y = Math.max(0, ly + Math.sin(Math.min(1, k) * Math.PI) * 6 - k * ly);
    vic.group.rotation.x = -1.35 - k * 5;
  });
  F.at(4.42, () => {
    vic.group.rotation.x = 0;
    vic.pos.set(lx + Math.sin(F.axis) * 7, 0, lz + Math.cos(F.axis) * 7);
    vic.vel.set(0, 0, 0);
    F.vicDown();
    F.beat('bodyfall', 0.9, 0.07);
    w.effects.dustPuff(vic.pos, 14);
    F.center.set(vic.pos.x, 0, vic.pos.z);
  });
  F.vicBash(4.45, F.axis, 1.5, 0.7, 0.6); // the bounce off the dirt
  F.trackCenter(4.42, 6.2, 5);

  // ---- 4.45-4.85 close the gap and PLANT for the shelling ----
  let px, pz;
  F.hold(4.45, 4.8, (k) => {
    if (px === undefined) { px = win.pos.x; pz = win.pos.z; }
    const e = smooth(k);
    win.pos.x = lerp(px, F.center.x - Math.sin(F.axis) * 6, e);
    win.pos.z = lerp(pz, F.center.z - Math.cos(F.axis) * 6, e);
    win.yaw = win.targetYaw = F.axis;
    F.winCtx = { speed: k < 0.95 ? 6 : 0, maxSpeed: 9, grounded: true };
  });
  F.at(4.6, () => { win.animator.play('tritoneBrace'); w.audio?.play('servo'); });
  F.hold(4.8, 6.2, () => { win.yaw = win.targetYaw = F.axis; win.pos.y = 0; });
  F.camShot(3.7, 6.2, { dist: 10, h: 2.6, az0: 1.7, az1: 1.2, lookH: 1.8 });

  // ---- 4.85-5.8 three shells, point-blank, alternating flanks ----
  const muzzle = (side, out) => {
    const a = win.mech.anchors['muzzle' + side];
    return a ? a.getWorldPosition(out) : out.copy(win.center());
  };
  const SHELL = [4.85, 5.3, 5.75];
  SHELL.forEach((t, i) => {
    F.at(t, () => {
      const side = i % 2 ? 'L' : 'R';
      muzzle(side, V);
      w.effects.muzzleFlash(V, 0xff8a24);
      w.audio?.play('mortar');
      // the whole platform rocks back into the recoil
      win.animator.addImpulse('torso', [-0.22, 0, 0], 26, 8);
      win.animator.addImpulse('head', [-0.18, 0, 0], 26, 8);
      w.effects.dustPuff(win.pos, 6, 0x9a9088);
      // ...and it lands on the body a frame later
      const hit = vic.center();
      w.effects.explosion(hit, 2.6 + i * 0.4, { color: 0xffa040 });
      F.beat('explosion', 0.7 + i * 0.15, 0.06);
      F.sparks(18 + i * 4, 12);
      for (const j of ['torso', 'head', 'thighL', 'thighR']) {
        vic.animator.addImpulse(j, [rand(-0.6, 0.6), rand(0, 0.6), rand(-0.6, 0.6)], 22, 7);
      }
    });
    // every shell shoves the wreck further down the line
    F.vicBash(t + 0.02, F.axis + rand(-0.35, 0.35), 2.0 + i * 0.5, 1.0 + i * 0.3, i % 2 ? -0.7 : 0.7);
  });

  // ---- 6.05 finale, 6.2 hero pose ----
  F.at(6.05, () => F.finaleBurst(0xff8a24));
  F.triumph(6.2, 'taunt', 'howl');
}
