// Move kit — the shared choreography vocabulary for SPECIALS/ULTS.
//
// Every move in specials.js used to re-implement the same four beats
// inline: play-anim-and-set-state, "am I still casting?" guards inside
// scheduled callbacks, the wrap-aware AoE enemy sweep, and n-shot volley
// loops. These helpers are those beats, verbatim — a move body should read
// as choreography (what fires when, where), not iteration plumbing.
//
// Ground rules for using the kit:
//   • helpers take the SAME numbers the inline code took — migrating a
//     move onto the kit must not change any tuning value
//   • anything a helper can't express exactly stays inline; don't bend a
//     move to fit the kit

/** Liveness guard for scheduled/deferred move beats: still alive and still
 *  in the state the move set. A hit that staggers the caster out of
 *  'special'/'ult' cancels every pending beat that checks this. */
export function stillCasting(f, state = 'special') {
  return f.alive && f.state === state;
}

/** Play a cast animation and enter its combat state in one call.
 *  stateT: seconds, or (dur) => seconds, or omitted for the clip's length.
 *  onFire fires on the clip's 'fire' event (the near-universal case);
 *  onEvent receives every event when a move needs more than 'fire'. */
export function cast(f, clip, { state = 'special', stateT, speed, onFire, onEvent } = {}) {
  const dur = f.animator.play(clip, {
    ...(speed !== undefined ? { speed } : {}),
    ...(onFire || onEvent
      ? { onEvent: (t, a) => { if (onFire && t === 'fire') onFire(a); onEvent?.(t, a); } }
      : {}),
  });
  f.setState(state, typeof stateT === 'function' ? stateT(dur) : (stateT ?? dur));
  return dur;
}

/** Wrap-aware AoE sweep: cb(victim, dist, dx, dz) for every OTHER living
 *  fighter within radius (+pad) of center. pad is a number or (v)=>number —
 *  most sweeps pad by some fraction of the victim's hitRadius. The
 *  caster's own minions ARE hit unless the caller filters in cb (that
 *  matches the inline loops this replaces). */
export function eachEnemy(w, owner, center, radius, cb, pad = 0) {
  for (const v of w.fighters) {
    if (v === owner || !v.alive) continue;
    const dx = w.wrapDelta(v.pos.x - center.x), dz = w.wrapDelta(v.pos.z - center.z);
    const d = Math.hypot(dx, dz);
    if (d < radius + (typeof pad === 'function' ? pad(v) : pad)) cb(v, d, dx, dz);
  }
}

/** Vertical gate for a GROUND-BOUND sweep — a charge, a trampling herd, a
 *  wolf pack. Those loops test a HORIZONTAL radius, which on its own says a
 *  bull galloping along the floor clips someone at the top of their jump.
 *  The effect really occupies a slab from `baseY` up to `baseY + reach`
 *  (`reach` = how high the thing swings: a body's height for a shoulder
 *  ram, less for something on all fours), and a victim only counts if their
 *  own body — feet at pos.y, head at pos.y + height — overlaps that slab.
 *  Air-to-ground and ground-to-air moves that SHOULD reach across the gap
 *  (mortars, AoE bursts, launchers) simply don't call this. */
export function overlapsY(v, baseY, reach) {
  return v.pos.y < baseY + reach && v.pos.y + v.height > baseY;
}

/** Schedule n beats at start, start+interval, ... Each beat is dropped if
 *  guard fails at fire time (default: caster died). Pass
 *  guard: (f) => stillCasting(f) for beats a stagger should cancel. */
export function volley(w, f, n, interval, fire, { start = 0, guard = null } = {}) {
  for (let i = 0; i < n; i++) {
    w.schedule(start + interval * i, () => {
      if (guard ? !guard(f) : !f.alive) return;
      fire(i);
    });
  }
}

/** Fixed-duration updater: onTick(k, dt, t) with k = t/dur clamped to 0..1.
 *  Ends when time runs out, or early if onTick returns false. onEnd always
 *  runs exactly once (world.addUpdater's guarantee) — cleanup lives there.
 *  The classic fade: timedUpdater(w, dur, (k) => { mat.opacity = 1 - k; },
 *  () => scene.remove(mesh)). */
export function timedUpdater(w, dur, onTick, onEnd = null) {
  let t = 0;
  w.addUpdater((dt) => {
    t += dt;
    if (onTick(Math.min(1, t / dur), dt, t) === false) return false;
    return t < dur;
  }, onEnd);
}
