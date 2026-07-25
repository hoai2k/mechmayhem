// Verlet-particle ragdoll for finisher victims. Twelve particles (pelvis
// pair, neck, head, elbows, hands, knees, feet) joined by distance
// constraints — the pelvis/neck triangle is rigid and carries the torso —
// integrate under gravity, collide with the ground (restitution + friction,
// so bodies REBOUND instead of clipping through), and are mapped back onto
// the mech's joint rig every frame: hips takes the torso frame, limbs aim
// at their particles. Scripts stay in control two ways: moving f.pos drags
// the whole ragdoll with it (velocity flows into the sim), and pin() nails
// chosen particles to a live world-space target (Colossus' ankle grip).
import * as THREE from 'three';
import { rand } from '../core/utils.js';

const H = 1 / 90;          // fixed substep
const ITER = 5;            // constraint iterations per substep
const GRAV = 32;
const DAMP = 0.5;          // /s velocity damping
const REST = 0.35;         // ground bounce restitution
const FRICTION = 0.75;     // tangential velocity kept on ground contact

// particle indices
const PL = 0, PR = 1, NK = 2, HD = 3, EL = 4, ER = 5, HL = 6, HR = 7,
  KL = 8, KR = 9, FL = 10, FR = 11;
export const FEET = [FL, FR];
export const HEAD = [HD];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _up = new THREE.Vector3(), _right = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class RagdollSim {
  // opts: { vel: THREE.Vector3 initial velocity, scatter: per-particle jitter,
  //         onImpact(pos, speed): ground-hit callback (rate-limit inside) }
  constructor(fighter, opts = {}) {
    this.f = fighter;
    this.onImpact = opts.onImpact || null;
    const J = fighter.mech.joints;
    this.J = J;
    fighter.group.updateWorldMatrix(true, true);

    const wp = (j) => J[j].getWorldPosition(new THREE.Vector3());
    const pelvisL = wp('thighL'), pelvisR = wp('thighR'), neck = wp('head');
    const center = pelvisL.clone().add(pelvisR).multiplyScalar(0.5);
    const upDir = neck.clone().sub(center).normalize();
    const headP = neck.clone().addScaledVector(upDir, fighter.mech.dims.headSize * 1.1);

    this.p = [pelvisL, pelvisR, neck, headP,
      wp('elbowL'), wp('elbowR'), wp('handL'), wp('handR'),
      wp('kneeL'), wp('kneeR'), wp('ankleL'), wp('ankleR')];
    const v0 = opts.vel || _a.set(0, 0, 0);
    const sc = opts.scatter ?? 0.6;
    this.prev = this.p.map((p) => p.clone().addScaledVector(v0, -H)
      .add(new THREE.Vector3(rand(-sc, sc) * H, rand(-sc, sc) * H, rand(-sc, sc) * H)));

    const s = fighter.scale;
    this.r = [0.5 * s, 0.5 * s, 0.45 * s, 0.5 * s,
      0.28 * s, 0.28 * s, 0.3 * s, 0.3 * s, 0.3 * s, 0.3 * s, 0.34 * s, 0.34 * s];
    // heavier torso: constraint corrections favor moving the limbs
    this.invMass = [0.5, 0.5, 0.55, 0.9, 1, 1, 1.1, 1.1, 0.9, 0.9, 1, 1];

    // distance constraints (measured, so any mech/retarget works)
    const link = (i, j) => ({ i, j, len: this.p[i].distanceTo(this.p[j]) });
    this.links = [
      link(PL, PR), link(PL, NK), link(PR, NK),    // rigid torso triangle
      link(NK, HD),
      link(PL, KL), link(KL, FL), link(PR, KR), link(KR, FR),
      // soft whole-body spacers so the wad can't fold through itself
      { ...link(HD, PL), soft: 0.25, min: true }, { ...link(HD, PR), soft: 0.25, min: true },
    ];
    // arms hang from shoulder sockets that ride the torso frame
    this.armLen = {
      upperL: this.p[EL].distanceTo(wp('shoulderL')),
      upperR: this.p[ER].distanceTo(wp('shoulderR')),
      foreL: this.p[HL].distanceTo(this.p[EL]),
      foreR: this.p[HR].distanceTo(this.p[ER]),
    };

    // torso-local frames: basis measured from the particles at init, then
    // sockets/quaternions expressed in it (robust to digitigrade rests)
    this.basis(_right, _up, _fwd, _c);
    const toLocal = (w) => new THREE.Vector3(
      _a.copy(w).sub(_c).dot(_right), _a.dot(_up), _a.dot(_fwd));
    this.sockL = toLocal(wp('shoulderL'));
    this.sockR = toLocal(wp('shoulderR'));
    _m.makeBasis(_right, _up, _fwd);
    const qBasis0 = new THREE.Quaternion().setFromRotationMatrix(_m);
    this.qHipsOff = qBasis0.clone().invert()
      .multiply(J.hips.getWorldQuaternion(new THREE.Quaternion()));

    // rest child-offset directions (local, constant) for the limb joints
    this.restDir = {};
    for (const [jn, child] of [['shoulderL', 'elbowL'], ['shoulderR', 'elbowR'],
      ['elbowL', 'handL'], ['elbowR', 'handR'],
      ['thighL', 'kneeL'], ['thighR', 'kneeR'], ['kneeL', 'ankleL'], ['kneeR', 'ankleR']]) {
      this.restDir[jn] = J[child].position.clone().normalize();
    }

    this.pins = null;      // { idx: [..], target: (out, i) => void }
    this.acc = 0;
    this.lastPos = fighter.pos.clone(); // for script-drag delta pickup
    this.impactCd = 0;
  }

  // torso frame from the pelvis/neck triangle
  basis(right, up, fwd, center) {
    center.copy(this.p[PL]).add(this.p[PR]).multiplyScalar(0.5);
    up.copy(this.p[NK]).sub(center).normalize();
    right.copy(this.p[PR]).sub(this.p[PL]);
    right.addScaledVector(up, -right.dot(up)).normalize();
    fwd.crossVectors(right, up);
  }

  // nail particles to a live world target (e.g. feet into a fist);
  // target(outVec3, k) fills the position for the k-th pinned particle.
  // Keyed, so several pins coexist (feet gripped + head steered).
  pin(key, indices, target) {
    this.pins = this.pins || new Map();
    this.pins.set(key, { idx: indices, target });
  }
  unpin(key) { this.pins?.delete(key); }
  clearPins() { this.pins = null; }

  // hurl: kick every particle (velocity change), light per-particle scatter
  impulse(v, scatter = 2) {
    for (const pr of this.prev) {
      pr.addScaledVector(v, -H);
      pr.x += rand(-scatter, scatter) * H;
      pr.y += rand(-scatter, scatter) * H;
      pr.z += rand(-scatter, scatter) * H;
    }
  }

  step() {
    const p = this.p, prev = this.prev;
    // integrate
    const keep = Math.max(0, 1 - DAMP * H);
    for (let i = 0; i < p.length; i++) {
      const px = p[i].x, py = p[i].y, pz = p[i].z;
      p[i].x += (px - prev[i].x) * keep;
      p[i].y += (py - prev[i].y) * keep - GRAV * H * H;
      p[i].z += (pz - prev[i].z) * keep;
      prev[i].set(px, py, pz);
    }
    // constraints
    for (let it = 0; it < ITER; it++) {
      for (const L of this.links) {
        const a = p[L.i], b = p[L.j];
        _a.copy(b).sub(a);
        const d = _a.length() || 1e-5;
        if (L.min && d >= L.len) continue;  // spacer: only pushes apart
        const wA = this.invMass[L.i], wB = this.invMass[L.j];
        const corr = (d - L.len) / d / (wA + wB) * (L.soft ?? 1);
        a.addScaledVector(_a, corr * wA);
        b.addScaledVector(_a, -corr * wB);
      }
      // arms: sockets are rigid points on the live torso frame
      this.basis(_right, _up, _fwd, _c);
      for (const [sock, el, hd, up, fo] of [
        [this.sockL, EL, HL, this.armLen.upperL, this.armLen.foreL],
        [this.sockR, ER, HR, this.armLen.upperR, this.armLen.foreR]]) {
        _b.copy(_c).addScaledVector(_right, sock.x)
          .addScaledVector(_up, sock.y).addScaledVector(_fwd, sock.z);
        _a.copy(p[el]).sub(_b);
        const d = _a.length() || 1e-5;
        p[el].addScaledVector(_a, -(d - up) / d);      // socket doesn't move
        _a.copy(p[hd]).sub(p[el]);
        const d2 = _a.length() || 1e-5;
        const corr = (d2 - fo) / d2 * 0.5;
        p[el].addScaledVector(_a, corr);
        p[hd].addScaledVector(_a, -corr);
      }
      // pins win over everything
      if (this.pins) {
        for (const P of this.pins.values()) {
          P.idx.forEach((idx, k) => P.target(p[idx], k));
        }
      }
      // ground: clamp + bounce (reflect via prev) + friction
      for (let i = 0; i < p.length; i++) {
        const r = this.r[i];
        if (p[i].y < r) {
          const vy = p[i].y - prev[i].y;
          if (vy < -0.09 && this.onImpact && this.impactCd <= 0) {
            this.impactCd = 0.12;
            this.onImpact(p[i], -vy / H);
          }
          p[i].y = r;
          prev[i].y = p[i].y + vy * REST;
          prev[i].x = p[i].x - (p[i].x - prev[i].x) * FRICTION;
          prev[i].z = p[i].z - (p[i].z - prev[i].z) * FRICTION;
        }
      }
    }
  }

  update(dt) {
    const f = this.f;
    // scripts that shove/drag/launch the body write f.pos — carry the whole
    // particle wad with them (pos only, so the motion becomes velocity)
    _a.copy(f.pos).sub(this.lastPos);
    if (_a.lengthSq() > 1e-8) for (const pt of this.p) pt.add(_a);
    this.impactCd -= dt;
    this.acc = Math.min(this.acc + dt, H * 6);
    while (this.acc >= H) { this.acc -= H; this.step(); }
    this.apply();
    this.lastPos.copy(f.pos);
  }

  // map particles back onto the rig
  apply() {
    const f = this.f, J = this.J, p = this.p;
    this.basis(_right, _up, _fwd, _c);

    // re-root the fighter under the torso so pos/center() track the body
    f.pos.x = _c.x;
    f.pos.z = _c.z;
    f.pos.y = Math.max(0, _c.y - f.height * 0.55);
    f.group.rotation.set(0, f.yaw, 0);
    f.group.updateWorldMatrix(true, false);

    _m.makeBasis(_right, _up, _fwd);
    const qHipsW = _q.setFromRotationMatrix(_m).multiply(this.qHipsOff);
    J.hips.quaternion.copy(
      _q2.copy(f.group.quaternion).invert().multiply(qHipsW));
    J.hips.position.copy(f.group.worldToLocal(_a.copy(_c)));
    const rest = f.animator.rest;
    J.torso.rotation.set(rest.torso[0], rest.torso[1], rest.torso[2]);

    // limbs: aim each joint's child at its particle
    const aim = (jn, parent, targetP) => {
      J[parent].updateWorldMatrix(true, false);
      J[parent].matrixWorld.decompose(_a, _q2, _b);
      J[jn].getWorldPosition(_c2 || (_c2 = new THREE.Vector3()));
      _a.copy(targetP).sub(_c2).normalize().applyQuaternion(_q2.invert());
      // _q2 is parent world rot; joint world = parent * jointLocal, and the
      // child offset lives in joint space — align restDir onto the local aim
      J[jn].quaternion.setFromUnitVectors(this.restDir[jn], _a);
    };
    let _c2 = null;
    aim('shoulderL', 'torso', p[EL]);
    aim('shoulderR', 'torso', p[ER]);
    aim('elbowL', 'shoulderL', p[HL]);
    aim('elbowR', 'shoulderR', p[HR]);
    aim('thighL', 'hips', p[KL]);
    aim('thighR', 'hips', p[KR]);
    aim('kneeL', 'thighL', p[FL]);
    aim('kneeR', 'thighR', p[FR]);
    // head follows its particle off the neck — unless this build has no neck
    // to follow it with (roster `rigidShell` on a GLB: skull fused into the
    // torso block), in which case it stays welded and rides the torso down
    if (f.def.rigidShell && f.mech.isGLB) return;
    J.torso.updateWorldMatrix(true, false);
    J.torso.matrixWorld.decompose(_a, _q2, _b);
    J.head.getWorldPosition(_c2);
    _a.copy(p[HD]).sub(_c2).normalize().applyQuaternion(_q2.invert());
    J.head.quaternion.setFromUnitVectors(_b.set(0, 1, 0), _a);
  }
}
