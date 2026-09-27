// RB AUTO-AIM — every ranged attack a PLAYER fires unlocked finds an enemy.
//
// Before this, an unlocked shot flew dead along the mech's facing and only its
// PITCH was assisted (world.js fireRanged, "no horizontal auto-aim"). The
// weapons that hunt on their own (wraith's bats) were fine; everything that
// flies straight — fenrir's rend wave, viper's daggers, rhino's shells,
// frogger's slime, nullbot's bolts, titanus' fist, the streams — missed
// anything that was not already dead ahead, which with a stick and a
// free camera is most of the time. A target LOCK already solved it (the shot
// flies at the crosshair); this is the same answer for the shot fired without
// one.
//
// THE PICK: the enemy best lined up with the mech's own facing, inside a
// forward CONE and inside the weapon's reach. A cone, not "nearest anywhere":
// the facing is still the player's steering, so a shot never turns round to
// hit someone behind you, and among enemies ahead the one you are pointing at
// wins over a closer one off to the side (angle first, distance as the tie).
// Range is the weapon's own `range` where it has one (the flamethrower and
// the hose are short on purpose) and a long default for projectiles.
//
// THE POINT: the target's chest, LED by the round's flight time (horizontal
// velocity only — leading a jump just throws the shot over the head), handed
// to fireRanged as the aim point. That is the path a target lock already
// takes, so every weapon handler that knows what "aimed" means (the mortar's
// landing spot, the dagger's flight, the bats' quarry, jerry's burst) reads it
// without an edit, and the second barrel converges on it as it does on the
// crosshair.
//
// PLAYERS ONLY. The CPU aims by snapping its facing at its target with a
// per-difficulty yaw ERROR (Fighter.faceNearestEnemyIfClose) — handing it a
// perfect auto-aim on top would quietly erase what the difficulty levels are.
// And never onto somebody who cannot be seen: a cloaked enemy, or a brawler
// lying gone between death and respawn.
import * as THREE from 'three';

// A MORTAR SHELL IS IN THE AIR FOR A FIXED TIME, whatever the range (it is
// solved as an arc to a landing point, world.js WEAPONS.mortar), so its lead
// is that time and not distance / speed. One number, read by both.
export const MORTAR_ARC_TIME = 1.8;

export const AUTO_AIM = {
  cone: THREE.MathUtils.degToRad(60),   // half-angle off the facing
  range: 120,                           // reach for a weapon with no `range`
  rangePad: 1.15,                       // a stream's `range` is where it dies, not where it stops mattering
  leadMax: 1.0,                         // seconds of lead at most
};

/** Is this fighter somebody an auto-aim may pick? */
function visibleEnemy(f, t) {
  if (t === f || !t.alive || f.isAllyOf(t)) return false;
  if (t.status?.cloak) return false;
  if (t.group && !t.group.visible) return false;
  if (t._carry && t._carry.by === f) return false;   // the one in your hands
  return true;
}

/**
 * The enemy a player's unlocked ranged shot should go for, or null (nobody in
 * the cone within reach — the shot then flies along the facing as before).
 */
export function pickAutoTarget(f, mv) {
  if (!f || f.isAI) return null;
  const w = f.world;
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
  const cosCone = Math.cos(AUTO_AIM.cone);
  const reach = mv?.range ? mv.range * AUTO_AIM.rangePad : AUTO_AIM.range;
  let best = null, bestS = Infinity;
  for (const t of w.fighters) {
    if (!visibleEnemy(f, t)) continue;
    const dx = w.wrapDelta(t.pos.x - f.pos.x);
    const dz = w.wrapDelta(t.pos.z - f.pos.z);
    const d = Math.hypot(dx, dz);
    if (d < 0.5 || d > reach) continue;
    const c = (dx * fx + dz * fz) / d;
    if (c < cosCone) continue;
    // angle first; distance only separates two enemies at much the same bearing
    const s = Math.acos(Math.min(1, c)) + 0.35 * (d / reach);
    if (s < bestS) { bestS = s; best = t; }
  }
  return best;
}

/**
 * Where to aim at `t` from `from`: its chest, led by the round's flight time
 * across the seam-wrapped offset. Returns a new Vector3 in world space.
 */
export function autoAimPoint(f, mv, t, from) {
  const w = f.world;
  const c = t.center();
  const to = new THREE.Vector3(w.wrapDelta(c.x - from.x), c.y - from.y, w.wrapDelta(c.z - from.z));
  const dist = to.length();
  const tt = mv?.type === 'mortar' ? MORTAR_ARC_TIME
    : mv?.speed ? Math.min(AUTO_AIM.leadMax, dist / mv.speed) : 0;
  if (tt > 0 && t.vel) { to.x += t.vel.x * tt; to.z += t.vel.z * tt; }
  return to.add(from);
}
