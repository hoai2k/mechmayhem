// Cinematic KO finishers: when a round ends with a kill, the winner and the
// corpse become camera puppets and a ~7s per-mech execution plays out on a
// locked-off cinematic camera before the normal round-end flow resumes.
//
// The system is a tiny timeline: at(t, fn) fires one-shot beats, and
// hold(t0, t1, fn) runs every frame across a span with a normalized k —
// used for approach glides, carries, topples and camera shots. Later holds
// win (they overwrite this.cam / positions each frame), so scripts layer
// close-ups over the default wide shot just by adding them.
import * as THREE from 'three';
import { rand, clamp01, lerp } from '../core/utils.js';
import { t } from '../core/text.js';
import { RagdollSim } from '../combat/ragdollphys.js';
// per-mech choreography lives in ./finisher/<id>.js (index assembles the
// map; shared engine/script helpers live in ./finisher/shared.js)
import { SCRIPTS } from './finisher/index.js';
import { smooth } from './finisher/shared.js';

export class Finisher {
  constructor(world, winner, victim, onDone) {
    this.w = world;
    this.win = winner;
    this.vic = victim;
    this.onDone = onDone;
    this.t = 0;
    this.dur = 7.2;
    this.acts = [];
    this.holds = [];
    this.cleanups = []; // script-registered teardown (DOM overlays etc.)
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

    winner.cinePuppet = victim.cinePuppet = true;
    winner.vel.set(0, 0, 0);
    victim.vel.set(0, 0, 0);
    victim.group.rotation.x = 0;
    victim.group.rotation.z = 0;
    victim.pos.y = Math.max(0, victim.pos.y);
    winner.pos.y = Math.max(0, winner.pos.y);

    // stage geometry: the action centers on where the victim fell
    const dx = world.wrapDelta(victim.pos.x - winner.pos.x);
    const dz = world.wrapDelta(victim.pos.z - winner.pos.z);
    this.axis = Math.atan2(dx, dz); // winner -> victim
    this.center = new THREE.Vector3(victim.pos.x, 0, victim.pos.z);
    this.startPos = winner.pos.clone();
    victim.yaw = victim.targetYaw = this.axis + Math.PI; // dazed, facing doom
    victim.group.rotation.y = victim.yaw;
    victim.animator.stop(0.15); // back on their feet for the last moment

    this.stageScale = Math.max(1, (winner.height + victim.height) / 11);
    // default wide establishing orbit — a front-side quarter (never square
    // behind the winner's back); scripts layer their shots over it
    this.camShot(0, this.dur, { dist: 15, h: 6, lookH: 3, az0: 2.15, az1: 2.6 });
    (SCRIPTS[winner.def.id] || SCRIPTS.default)(this);
  }

  at(t, fn) { this.acts.push({ t, fn, done: false }); }
  hold(t0, t1, fn) { this.holds.push({ t0, t1, fn }); }

  // winner strides from wherever they were to `dist` in front of the victim
  approach(t0, t1, dist) {
    const from = this.startPos;
    this.hold(t0, t1, (k, dt) => {
      const e = smooth(k);
      this.win.pos.x = lerp(from.x, this.center.x - Math.sin(this.axis) * dist, e);
      this.win.pos.z = lerp(from.z, this.center.z - Math.cos(this.axis) * dist, e);
      this.win.pos.y = Math.max(0, from.y * (1 - e));
      this.win.yaw = this.win.targetYaw = this.axis;
      // striding, not sliding — feeds the frame's animator ctx
      this.winCtx = { speed: k < 0.97 ? 8 : 0, maxSpeed: 10, grounded: true };
    });
  }

  // never a midsection close-up: if the taller combatant's head would fall
  // outside the ~46° lens at this framing, lift the look target until the
  // head fits back in frame (wide shots are untouched — only genuinely
  // tight shots get corrected)
  headSafe() {
    // a fighter standing much closer to the lens than the look point sits
    // angularly far higher than the look-point distance suggests, so clamp
    // against each fighter's own distance, not just the look point's
    const dLook = this.cam.pos.distanceTo(this.cam.look) || 1;
    for (const f of [this.win, this.vic]) {
      if (!f.group.visible) continue;
      const dF = Math.hypot(f.pos.x - this.cam.pos.x, f.pos.z - this.cam.pos.z);
      const maxUp = 0.36 * Math.min(dLook, Math.max(2.5, dF));
      const headY = f.pos.y + f.height;
      if (headY - this.cam.look.y > maxUp) this.cam.look.y = headY - maxUp;
    }
  }

  // orbiting camera around the action center (angles relative to the axis).
  // All distances/heights scale with the combatants' stature so a 9-unit
  // colossus gets the same framing as a lean viper.
  camShot(t0, t1, { az0 = 2.7, az1 = 3.1, dist = 12, h = 4.5, lookH = 2.6, dolly = 0 } = {}) {
    const S = this.stageScale;
    this.hold(t0, t1, (k) => {
      const az = this.axis + lerp(az0, az1, k);
      const d = (dist + dolly * smooth(k)) * S;
      this.cam.pos.set(this.center.x + Math.sin(az) * d, h * S, this.center.z + Math.cos(az) * d);
      this.cam.look.set(this.center.x, lookH * S, this.center.z);
      this.headSafe();
    });
  }

  // action cam: rides perpendicular to the LIVE winner<->victim line so the
  // combatants stay in profile and the winner can never wander between the
  // lens and the kill — for phases where the fight chases around the arena
  camAction(t0, t1, { dist = 12, h = 3.8, lookH = 2.3, side = 1, bias = 0.6, rate = 3 } = {}) {
    const S = this.stageScale;
    let az, mx, mz;
    this.hold(t0, t1, (k, dt) => {
      const dx = this.w.wrapDelta(this.vic.pos.x - this.win.pos.x);
      const dz = this.w.wrapDelta(this.vic.pos.z - this.win.pos.z);
      const tx = lerp(this.win.pos.x, this.vic.pos.x, bias);
      const tz = lerp(this.win.pos.z, this.vic.pos.z, bias);
      if (az === undefined) { az = this.axis + side * Math.PI / 2; mx = tx; mz = tz; }
      if (Math.hypot(dx, dz) > 0.6) { // coincident bodies: keep last azimuth
        const want = Math.atan2(dx, dz) + side * Math.PI / 2;
        az += Math.atan2(Math.sin(want - az), Math.cos(want - az)) * Math.min(1, dt * rate);
      }
      const a = Math.min(1, dt * 5);
      mx += (tx - mx) * a;
      mz += (tz - mz) * a;
      this.cam.pos.set(mx + Math.sin(az) * dist * S, h * S, mz + Math.cos(az) * dist * S);
      this.cam.look.set(mx, lookH * S, mz);
      this.headSafe();
    });
  }

  // softly glue the action center (and thus every camShot) to wherever the
  // victim gets bashed to, so the camera follows the carnage
  trackCenter(t0, t1, rate = 4) {
    this.hold(t0, t1, (k, dt) => {
      const a = Math.min(1, dt * rate);
      this.center.x += this.w.wrapDelta(this.vic.pos.x - this.center.x) * a;
      this.center.z += this.w.wrapDelta(this.vic.pos.z - this.center.z) * a;
    });
  }

  sparks(n = 14, power = 10, color = 0xffcf7a) {
    this.w.effects.impactSparks(this.vic.center(), color, n, power);
  }
  beat(sfx = 'hitHeavy', shake = 0.55, stop = 0.07) {
    this.w.audio?.play(sfx);
    this.w.effects.addShake(shake);
    if (stop) this.w.engine.addHitStop(stop);
  }
  vicFlinch() {
    this.vic.animator.play('hitFlinch', { speed: 1.3 });
    this.vic.animator.addImpulse('torso', [-0.35, 0, 0], 30, 10);
  }
  // fallen or carried victims go LIMP: a looping ragdoll pose plus
  // acceleration-driven flailing (see update) — the pose never fades back
  // to standing, so a stomped wreck stays a wreck
  ragdoll(f, clip = 'ragdollAir') {
    f.animator.play(clip);
    this._rag = this._rag || new Map();
    if (!this._rag.has(f)) {
      this._rag.set(f, { px: f.pos.x, py: f.pos.y, pz: f.pos.z, vx: 0, vy: 0, vz: 0, cd: 0 });
    }
  }

  // TRUE physics ragdoll (verlet particles on the rig): the body tumbles,
  // rebounds off the ground, and rides any script-driven shoves/drags.
  // The 'ragdoll' clip still plays underneath purely as a signal (fleas
  // etc. read the clip name); the sim overwrites the joints every frame.
  ragdollPhys(f, opts = {}) {
    this._sims = this._sims || new Map();
    let sim = this._sims.get(f);
    if (sim) return sim;
    f.animator.play(opts.clip || 'ragdoll');
    sim = new RagdollSim(f, {
      onImpact: (pos, speed) => {
        if (speed < 5) return;
        const k = Math.min(1, speed / 22);
        this.w.effects.dustPuff(pos, 3 + 8 * k);
        if (speed > 9) {
          this.beat(k > 0.55 ? 'slam' : 'bodyfall', 0.5 * k, 0);
          this.w.effects.impactSparks(pos, 0xffc23c, (6 + 10 * k) | 0, 8 * k);
        }
      },
      ...opts,
    });
    this._sims.set(f, sim);
    return sim;
  }

  vicDown() { this.ragdollPhys(this.vic); }
  finaleBurst(color = 0xffa040) {
    const c = this.vic.center();
    this.w.effects.explosion(c, 4.5, { color });
    this.w.effects.addShake(1);
    this.w.audio?.play('explosionBig');
  }
  // winner hero pose + a low front camera pushing in for the last beats
  triumph(t, clip = 'victory', sfx = 'powerup') {
    this.at(t, () => {
      this.win.animator.play(clip);
      this.w.audio?.play(sfx);
    });
    const S = this.stageScale;
    this.hold(t, this.dur, (k) => {
      const az = this.win.yaw + lerp(-0.35, 0.15, k);
      const d = (10.5 - 3 * smooth(k)) * S;
      this.cam.pos.set(this.win.pos.x + Math.sin(az) * d, (2 + 1.6 * smooth(k)) * S, this.win.pos.z + Math.cos(az) * d);
      this.cam.look.set(this.win.pos.x, this.win.height * 0.7, this.win.pos.z);
      this.headSafe();
    });
  }

  // shove the corpse around: a short bounce arc + slide + spin so big hits
  // visibly BASH the body instead of leaving it parked
  vicBash(t, ang, dist = 2.2, up = 1.4, spin = 0.8) {
    let sx, sz, sy;
    this.hold(t, t + 0.34, (k) => {
      if (sx === undefined) { sx = this.vic.pos.x; sz = this.vic.pos.z; sy = this.vic.group.rotation.y; }
      const e = smooth(k);
      this.vic.pos.x = sx + Math.sin(ang) * dist * e;
      this.vic.pos.z = sz + Math.cos(ang) * dist * e;
      this.vic.pos.y = Math.sin(Math.min(1, k) * Math.PI) * up;
      this.vic.group.rotation.y = sy + spin * e;
    });
  }

  // bake a white spectre of the winner's current pose (wraith's ghost)
  makeSpectre() {
    const gmat = new THREE.MeshBasicMaterial({
      color: 0xdfefff, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ghost = new THREE.Group();
    this.win.mech.group.updateWorldMatrix(true, true);
    this.win.mech.group.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Mesh(o.geometry, gmat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(o.matrixWorld);
      ghost.add(m);
    });
    ghost.visible = false;
    this.w.scene.add(ghost);
    this._spectre = { ghost, gmat };
    return ghost;
  }
  dropSpectre() {
    if (!this._spectre) return;
    this.w.scene.remove(this._spectre.ghost);
    this._spectre.gmat.dispose();
    this._spectre = null;
  }

  // ---- skip: hold A (Space/Enter/jump) for 1s to cut straight to the end.
  // A green Ⓐ chip with a filling ring + SKIP label appears while held. ----
  updateSkip(dt) {
    const inp = this.w.input;
    if (!inp || this.ended) return;
    let held = inp.key?.('Space') || inp.key?.('Enter');
    for (let i = 0; i < 4 && !held; i++) if (inp.padHeld?.(i, 'A')) held = true;
    if (!held && inp.touch?.held?.has('jump')) held = true;
    if (held) {
      this.skipT = (this.skipT || 0) + dt;
      this.showSkipUI();
      if (this.skipT >= 1) { this.end(); return; }
    } else {
      this.skipT = Math.max(0, (this.skipT || 0) - dt * 3);
      if (this.skipT <= 0) this.hideSkipUI();
    }
    if (this._skipRing) {
      this._skipRing.style.background =
        `conic-gradient(#7be87b ${Math.min(1, this.skipT) * 360}deg, rgba(120,232,120,0.15) 0deg)`;
    }
  }

  showSkipUI() {
    if (this._skipUI) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;bottom:9%;left:50%;transform:translateX(-50%);' +
      'z-index:8;display:flex;align-items:center;gap:12px;pointer-events:none;' +
      'font:700 15px monospace;color:#cfeaff;text-shadow:0 1px 3px #000;';
    el.innerHTML = `
      <div style="position:relative;width:46px;height:46px;">
        <div class="skip-ring" style="position:absolute;inset:0;border-radius:50%;"></div>
        <div style="position:absolute;inset:4px;border-radius:50%;background:#0d1620;
          display:flex;align-items:center;justify-content:center;
          font:800 22px sans-serif;color:#7be87b;">A</div>
      </div>
      <span style="letter-spacing:0.25em">${t('nav.skip')}</span>`;
    document.getElementById('ui-root')?.appendChild(el);
    this._skipUI = el;
    this._skipRing = el.querySelector('.skip-ring');
  }

  hideSkipUI() {
    this._skipUI?.remove();
    this._skipUI = null;
    this._skipRing = null;
  }

  update(dt) {
    this.t += dt;
    this.updateSkip(dt);
    if (this.ended) return;
    for (const a of this.acts) {
      if (!a.done && this.t >= a.t) { a.done = true; a.fn(); }
    }
    for (const h of this.holds) {
      if (this.t >= h.t0 && this.t <= h.t1) {
        h.fn(clamp01((this.t - h.t0) / Math.max(1e-4, h.t1 - h.t0)), dt);
      } else if (this.t > h.t1 && !h.closed) {
        // frames land BETWEEN t1-eps and t1, so a span could end at k≈0.97
        // and freeze mid-arc (bodies left floating). Every hold gets one
        // guaranteed k=1 tick when its span passes.
        h.closed = true;
        h.fn(1, dt);
      }
    }
    // puppets animate outside the fighter state machine; a hold may have
    // staged a locomotion ctx for the winner this frame (approach, charge)
    this.win.animator.update(dt, this.winCtx || { speed: 0, grounded: true });
    this.winCtx = null;
    // ragdolling bodies FLAIL under acceleration: every sharp velocity
    // change jolts the limbs (additive impulses over the limp loop pose)
    if (this._rag && dt > 0) {
      for (const [f, st] of this._rag) {
        const vx = (f.pos.x - st.px) / dt, vy = (f.pos.y - st.py) / dt, vz = (f.pos.z - st.pz) / dt;
        const jolt = Math.hypot(vx - st.vx, vy - st.vy, vz - st.vz);
        st.cd -= dt;
        if (jolt > 5 && st.cd <= 0) {
          st.cd = 0.08;
          const k = Math.min(1.1, jolt / 30);
          for (const j of ['shoulderL', 'shoulderR', 'thighL', 'thighR', 'head']) {
            f.animator.addImpulse(j, [rand(-0.6, 0.6) * k, rand(-0.4, 0.4) * k, rand(-0.6, 0.6) * k], 16, 5);
          }
        }
        st.vx = vx; st.vy = vy; st.vz = vz;
        st.px = f.pos.x; st.py = f.pos.y; st.pz = f.pos.z;
      }
    }
    this.vic.animator.update(dt, { speed: 0, grounded: true });
    // physics ragdolls stamp over the animator pose (and pick up any pos
    // writes the scripts made this frame as drag velocity)
    if (this._sims) for (const sim of this._sims.values()) sim.update(dt);
    // carry spans stage a palm press: runs post-pose or it gets clobbered
    if (this._palmVic) {
      this.win.clampPalmsTo(this._palmVic);
      this._palmVic = null;
    } else {
      this.win._palmFix = 0;
    }
    this.win.group.rotation.y = this.win.yaw;
    if (this.t >= this.dur) this.end();
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    this._rag = null;
    this._sims = null;
    this.hideSkipUI();
    this.dropSpectre();
    for (const fn of this.cleanups) { try { fn(); } catch { /* teardown must never block the round */ } }
    this.cleanups.length = 0;
    this.win.setOpacity?.(1);
    this.win.cinePuppet = false;
    this.vic.cinePuppet = false;
    this.vic.group.rotation.x = 0;
    this.vic.group.rotation.z = 0;
    this.vic.group.scale.set(1, 1, 1);
    this.vic.pos.y = 0; // dead ON the dirt, never hovering over it
    if (this.win.pos.y < 1.2) this.win.pos.y = 0;
    this.vic.animator.play('dead'); // stays where the finisher left them
    this.w.finisher = null;
    this.onDone?.();
  }
}
