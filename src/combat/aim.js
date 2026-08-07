// THE CROSSHAIR IS THE RANGED TARGET.
//
// A ranged shot fired under a target lock flies at the crosshair's world point,
// height included (world.js `aimP`), and until now that point was pinned to the
// locked enemy's head: a servo you could watch but not touch. Against anything
// that strafes, "aim at where he is" is the one place he will not be by the
// time the shot arrives, so every shot missed and there was no control that
// could fix it.
//
// So the AIM is a thing the player owns, and the camera stick is what moves it:
// two angles (yaw + pitch) carried per human, offset from a BASE direction —
// the locked enemy's head, or the camera's own heading when nothing is locked.
// Push the stick and the crosshair leads; the camera follows it (camera.js aims
// the lock orbit at the aim POINT rather than at the target), so the two move
// together and the thing you are aiming at stays on screen. Let go and the aim
// eases back onto the target after `hold` seconds — the old behaviour, arrived
// at rather than enforced.
//
// SNIPER MODE (LB HELD — see input.js: a TAP is still the lock toggle) is the
// same aim with the view zoomed in around it. It needs no lock and no target:
// unlocked, the base direction is the camera's, so the stick swings both
// together and the aim ray is TRACED into the world (enemies first, then the
// ground) — which is what lets a lobbed shell land where the crosshair is drawn
// rather than at a fixed range.
import * as THREE from 'three';
import { clamp, damp } from '../core/utils.js';
import { CONFIG } from '../core/config.js';
import { TUNING } from '../core/tuning.js';
import { bodyHitSegment } from './hurtbox.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _t = new THREE.Vector3();

// WHICH WAY IS UP, for the aim. camera.js owns the same question for the view
// (its own `pitchY`) and the two must agree, or a player who inverted the
// camera would aim up while the view goes down. Stick DOWN (y > 0) drops the
// aim, which is what the camera's default does too.
const pitchIn = (v) => (CONFIG.reverseCameraY ? -v : v);

// Where the ray starts: eye height on the body, not the muzzle. A muzzle swings
// through the whole firing animation, and an aim that swung with it would be
// unusable; the shot itself still leaves the real barrel (world.js ranges the
// projectile from the muzzle to this point).
export function aimOrigin(f, out = _o) {
  return out.set(f.pos.x, f.pos.y + f.height * 0.8, f.pos.z);
}

// Direction to the point a locked enemy is aimed AT — the head, so headshots
// feel like aiming (this is the point the old servo damped onto, unchanged).
function lockPoint(f, T, out = _t) {
  const w = f.world;
  return out.set(
    f.pos.x + w.wrapDelta(T.pos.x - f.pos.x),
    T.pos.y + T.height * 0.88,
    f.pos.z + w.wrapDelta(T.pos.z - f.pos.z)
  );
}

// yaw/pitch of a direction in the game's own convention (yaw = atan2(x, z),
// the same as Fighter.yawTo, so an aim yaw can be handed straight to targetYaw)
function yawOf(dx, dz) { return Math.atan2(dx, dz); }
function pitchOf(dx, dy, dz) { return Math.atan2(dy, Math.hypot(dx, dz) || 1e-6); }

// shortest signed difference a -> b, wrapped to (-PI, PI]
function angDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// WHERE THE RAY LANDS, with nothing locked: the nearest enemy body it passes
// through, else the ground under it, else the end of its reach. The crosshair
// then sits ON something, which is what a lobbed shot needs — an aimed shell
// is dropped exactly on the aim point, so a point hanging in space at a fixed
// range would land every mortar short.
function traceAim(f, origin, dir, reach, out) {
  const w = f.world;
  _p0.copy(origin);
  _p1.copy(dir).multiplyScalar(reach).add(origin);
  let best = reach;
  for (const e of w.fighters) {
    if (e === f || !e.alive || f.isAllyOf(e)) continue;
    // Test the enemy's NEAREST wrapped image, the way every other query reaches
    // through the arena seam — by sliding the RAY into his frame rather than
    // him into ours, since his hurtbox capsules are built where he stands.
    const sx = f.pos.x + w.wrapDelta(e.pos.x - f.pos.x) - e.pos.x;
    const sz = f.pos.z + w.wrapDelta(e.pos.z - f.pos.z) - e.pos.z;
    _p0.set(origin.x - sx, origin.y, origin.z - sz);
    _p1.set(_p0.x + dir.x * reach, _p0.y + dir.y * reach, _p0.z + dir.z * reach);
    const hit = bodyHitSegment(e, _p0, _p1, 0.6);
    if (hit && hit.t * reach < best) best = Math.max(1, hit.t * reach);
  }
  if (dir.y < -0.02) {
    // the ground, at the terrain's own height under the crossing point
    let d = best;
    for (let i = 0; i < 3; i++) {   // two refinements: terrain is not a plane
      const x = origin.x + dir.x * d, z = origin.z + dir.z * d;
      const gy = w.arena?.terrain?.heightAt?.(x, z) ?? 0;
      const hit = (origin.y - gy) / -dir.y;
      if (!(hit > 0)) break;
      d = Math.min(best, hit);
    }
    best = d;
  }
  return out.copy(dir).multiplyScalar(best).add(origin);
}

/**
 * One human's aim, run every frame from Fighter.update.
 *
 * Owns: `f.aiming` (is the crosshair live), `f.aimYaw` / `f.aimPitch` (the aim
 * itself, world angles), `f.sniperK` (0..1 zoom blend — camera.js reads it) and
 * `f._lockAim`, the world point everything downstream already consumed.
 *
 * `f.aimIn` is the stick, written by boot.js: {x, y} in -1..1. X is only the
 * player's while a target is locked — unlocked, the same stick is turning the
 * camera and the aim's base heading comes FROM the camera, so taking it here
 * too would move the crosshair twice.
 */
export function updateAim(f, dt) {
  const A = TUNING.aim;
  const I = f.intent;
  const sniping = !!I.sniper && f.alive && !f.isAI;
  const locked = !!(I.lockOn && f.lockTarget?.alive);
  const engaged = f.alive && !f.isAI && (locked || sniping);

  // THE ZOOM IS A BLEND, NOT A STATE: damped both ways at one rate, so
  // entering and leaving the scope are the same move played in reverse and
  // neither can snap. Everything the scope changes (FOV, distance, the
  // over-the-shoulder slide, stick sensitivity) rides this one number.
  f.sniperK = damp(f.sniperK || 0, sniping ? 1 : 0, A.zoomRate, dt);
  if (f.sniperK < 0.001) f.sniperK = 0;

  if (!engaged) {
    f.aiming = false;
    f._lockAim = null;
    f._aimHold = 0;
    if (f.aimIn) { f.aimIn.x = 0; f.aimIn.y = 0; }
    return;
  }

  const origin = aimOrigin(f);
  const T = locked ? f.lockTarget : null;
  // ---- the BASE direction: what the aim is measured against ----
  let baseYaw, basePitch, baseDist = 0;
  if (T) {
    const p = lockPoint(f, T);
    _d.copy(p).sub(origin);
    baseDist = _d.length() || 1;
    baseYaw = yawOf(_d.x, _d.z);
    basePitch = pitchOf(_d.x, _d.y, _d.z);
  } else {
    // nothing locked: the camera's heading IS the base, so the stick steers
    // the view and the crosshair as one thing
    baseYaw = I.aimYaw ?? f.yaw;
    basePitch = null;   // pitch stays entirely the player's
  }

  if (!f.aiming) {
    // seed on engage, so raising the scope never swings the aim
    f.aiming = true;
    f.aimYaw = baseYaw;
    f.aimPitch = basePitch ?? 0;
    f._aimHold = 0;
  }

  // ---- the stick ----
  const inp = f.aimIn || (f.aimIn = { x: 0, y: 0 });
  // zoomed in, the same stick deflection is a finer angle — the magnified view
  // would otherwise make the crosshair twice as twitchy as it looks
  const sens = 1 - (1 - A.zoomSens) * f.sniperK;
  const ax = T ? inp.x : 0;          // see the note on f.aimIn above
  const ay = pitchIn(inp.y);
  const live = Math.abs(ax) > 0.08 || Math.abs(ay) > 0.08;
  if (live) f._aimHold = A.hold;
  else f._aimHold = Math.max(0, (f._aimHold || 0) - dt);

  if (T) {
    // ---- THE LEASH: friction + magnetism, the standard soft-lock ----
    //
    // The console-shooter answer to "aim with a thumbstick" is not to hand the
    // player a free-flying reticle; it is to tie the reticle to the target and
    // let them pull against it. Two forces, both of them standard:
    //
    //   FRICTION (reticle slowdown) — the stick's authority FALLS OFF as the
    //     aim leaves the target, so the first degrees are free and the last
    //     ones are heavy. `1 - k²` where k is the fraction of the leash used.
    //   MAGNETISM — a restoring pull toward the target that never switches
    //     off, only weakens while the stick is live. Let go and the crosshair
    //     comes home; hold, and it settles where push and pull balance.
    //
    // The lead you can hold is therefore an EQUILIBRIUM rather than a limit,
    // which is what makes it feel elastic rather than clamped, and it is small
    // on purpose: at the shipped numbers full stick holds ~15°, which is a
    // couple of body widths at fighting range — enough to lead a strafing
    // target, not enough to lose them. It was 40° of free travel before, which
    // is a crosshair that happens to start on the enemy.
    const off = angDelta(baseYaw, f.aimYaw);
    const k = Math.min(1, Math.abs(off) / A.maxLead);
    const friction = 1 - k * k;
    f.aimYaw -= ax * A.yawRate * sens * friction * dt;
    const pOff = f.aimPitch - basePitch;
    const pk = Math.min(1, Math.abs(pOff) / A.maxLead);
    f.aimPitch -= ay * A.pitchRate * sens * (1 - pk * pk) * dt;
    // magnetism — weak under the thumb, firm the moment it lets go
    const pull = 1 - Math.exp(-(live ? A.magnet : A.settle) * dt);
    f.aimYaw += angDelta(f.aimYaw, baseYaw) * pull;
    f.aimPitch += (basePitch - f.aimPitch) * pull;
    // ...and a hard stop behind all of it, so a dropped frame or a target
    // teleporting (a dash, a wrap) can never leave the crosshair adrift
    const lead = angDelta(baseYaw, f.aimYaw);
    if (Math.abs(lead) > A.maxLead) f.aimYaw = baseYaw + Math.sign(lead) * A.maxLead;
    f.aimPitch = clamp(f.aimPitch, basePitch - A.maxLead, basePitch + A.maxLead);
  } else {
    // NOTHING LOCKED: no target to be tied to, so the aim is free — the base
    // heading follows the camera and the pitch is the player's outright.
    f.aimPitch = clamp(f.aimPitch - ay * A.pitchRate * sens * dt, -A.maxPitch, A.maxPitch);
    f.aimYaw = baseYaw;
  }

  // ---- the point itself ----
  const cy = Math.cos(f.aimPitch);
  _d.set(Math.sin(f.aimYaw) * cy, Math.sin(f.aimPitch), Math.cos(f.aimYaw) * cy);
  if (!f._lockAim) f._lockAim = new THREE.Vector3();
  if (T) {
    // keep the target's RANGE, so an unled aim is exactly the old head point
    f._lockAim.copy(_d).multiplyScalar(baseDist).add(origin);
  } else {
    traceAim(f, origin, _d, A.reach, f._lockAim);
  }
}
