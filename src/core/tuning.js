// ============================================================================
// GAMEPLAY TUNING — the dials worth turning, in one editable place.
//
// EDIT THESE FREELY. Every value is read live by the game (fighter.js aliases
// them at module load), so changing a number here and reloading is the whole
// workflow — no other file needs touching. `npm run dev` hot-reloads it.
//
// Not to be confused with two neighbours:
//   • core/config.js — PLAYER settings (the settings menu: robot speed,
//     round time, music volume). Those are the player's to change at runtime;
//     these are the designer's defaults underneath them.
//   • mechs/roster.js — PER-MECH balance (hp, speed, damage, cooldowns).
//     Those describe individual robots; these are the rules all of them share.
//
// The stamina bar is normalised to 1.0 = a full tank, so its costs are
// written as DURATIONS ("how many seconds of this does a full bar buy") and
// FRACTIONS ("how much of a bar does one dash cost") rather than as raw rates.
// Say what you want and the code does the division.
// ============================================================================

export const TUNING = {

  // ---- STAMINA -------------------------------------------------------------
  // One bar (the HUD's thin under-bar) pays for sprinting, blocking and
  // dashing. Running out drops you back to a walk and forces the guard down
  // until it refills.
  stamina: {
    sprintSeconds: 12,     // seconds of continuous SPRINTING a full bar buys
    blockSeconds: 7,       // seconds of continuous BLOCKING a full bar buys
    dashCost: 0.09,        // fraction of a full bar spent per dash
    dashCostBlockMult: 2.2, // ...multiplied by this when the guard is also up
    refillSeconds: 5.3,    // seconds to refill from empty (guard down, not sprinting)
    // NOTE on sprinting from a standing start: you enter a sprint THROUGH a
    // dash, and that dash charges `dashCost` before the run begins. So a cold
    // start off a full bar runs for sprintSeconds x (1 - dashCost) — 10.9s at
    // the values above — while a sprint resumed on an already-moving mech
    // gets the full 12. Raise sprintSeconds to ~13.2 if you want a cold start
    // to measure a clean 12.
  },

  // ---- MOVEMENT ------------------------------------------------------------
  movement: {
    // Global pace over the roster's per-mech speeds. `speedBase` is what the
    // ROBOT SPEED setting's 100% means — raise it and 100% gets faster.
    walkMult: 1.2,
    speedBase: 2.4,
    sprintMult: 1.6,       // sprint speed, x the walk cap
    blockMoveMult: 0.5,    // walking speed while the guard is up, x the walk cap
    jumpMult: 1.18,        // global jump boost over roster stats
  },

  // ---- DASH ----------------------------------------------------------------
  dash: {
    speedMult: 4.2,        // dash burst speed = mech's stats.speed x this
    chargeBoost: 0.95,     // extra burst at a full crouch coil, as a fraction
    chargeMax: 3,          // seconds of crouch that fully winds a charged dash
    cooldown: 0.6,         // seconds before another uncharged dash is allowed
  },

  // ---- AIR SOMERSAULT ------------------------------------------------------
  // The ball tuck: free on an A-press while falling with the hover tank
  // empty, or bought any time airborne by pressing BLOCK in the air (that
  // one drains the stamina bar at the standard block rate).
  airRoll: {
    spinRate: 37.5,        // rad/s at full tilt (~6 turns a second)
    rampSeconds: 0.16,     // how quickly it reaches that rate
    // Above this stats.weight a mech is a LARGE bot to the somersault: it
    // still curls into the ball behind the all-around bubble, but it does
    // NOT spin — a five-storey chassis cartwheeling reads silly, a braced
    // cannonball drop reads right. The same 0.8 line applyPhysics uses for
    // the ground-cracking landing (titanus, colossus, rhino, glacier,
    // cranky tuck without tumbling). A roster def may also opt in directly
    // with `tuckOnly: true` — for a frame that is physically big without
    // fighting heavy (JERRY).
    tuckOnlyWeight: 0.8,
  },

  // ---- SURFACE WALKING -----------------------------------------------------
  // Walking on the WORLD rather than the floor, for the mechs whose roster def
  // carries a `climb` block (JERRY, who trades the hover jets for it). Shared
  // feel lives here; per-mech reach and pace live on the def.
  //
  // THERE IS NO MODE AND NO NAMED SURFACE (combat/climb.js). Every frame the
  // walker asks what is near his feet and averages it into one normal; his up
  // damps toward that, his stick is rotated by the same amount, and so walking
  // at a wall becomes walking up it with no event in between. The way off is
  // the JUMP — with a direction it is a leap that way, with nothing held he
  // lets go and drops.
  climb: {
    // FLAT IS NOT CLIMBING. While he is walking on open ground the field's
    // answer is straight up, and anything this close to vertical hands the body
    // back to the ordinary physics — so nothing but an actual slope or wall
    // takes the walker's path (cos ~8 degrees).
    flatCos: 0.99,
    // ...and how far from straight up counts as FULLY on a wall, for the
    // carriage, the limb pull and the camera (cos-space: 1 - n.y).
    tiltFull: 0.5,
    tiltRate: 7,           // how fast the body's up damps toward the field's
    faceRate: 8,           // ...and how fast his facing follows his travel
    // HOW THE FEET ARE HELD TO THE SURFACE, and it is deliberately TWO rules
    // either side of `stickGlide` — the error where "arriving at a surface"
    // stops and "walking on one" starts.
    //   BELOW it the correction is EXACT: while he is walking the surface, the
    //     constraint is not negotiable. A rate or a speed cap here can simply
    //     be OUTRUN — he covers ~0.5 units a frame at walking pace, so a cap of
    //     18/s (0.3 a frame) let him sail off the top of a 49-unit tower
    //     instead of tipping over its lip.
    //   ABOVE it the pull is capped to `stickMax` units/second, which is what
    //     makes first contact with a wall a GLIDE rather than a snap — that is
    //     the only place the error is ever large.
    stickGlide: 1,
    stickMax: 16,
    // THE JUMP OFF A WALL, with a direction held: leap speed x the mech's walk,
    // the rise x his own jump, and the outward speed guaranteed to be away from
    // the face however the stick is aimed (without it, a stick pointed back
    // into the wall re-latches a frame later instead of jumping).
    leapMult: 1.15,
    leapRise: 0.8,
    leapOut: 5,
    // BODY STABILITY. `normRate` pre-filters the field normal before the body
    // follows it at `tiltRate` — two stages of smoothing turn a block seam
    // from a flicker into a lean. And while the frame is still turning
    // (pending angle between his up and the filtered normal, rad), translation
    // is throttled: zero throttle at `turnSlow` rad of pending turn, never
    // below `turnFloor`. Stability over speed on complex territory.
    normRate: 11,
    turnSlow: 1.0,
    turnFloor: 0.3,
    // THE SPIDER STEP (conformClimbLimbs): the limb stepping system that owns
    // his hands and feet on structures — and the crab scuttle on open ground
    // under target lock past `scuttleDrift` rad of strafe/backpedal.
    scuttleDrift: 1.0,
    step: {
      rate: 6,        // activation ease in/out (1/s)
      // how far OUT along its splay a limb looks for a home first, x reach —
      // limbs prefer extending wide over pulling in (see SPLAY_LADDER)
      spread: 0.55,
      hang: 0.55,     // the home probe: this far below the limb root, x reach
      lead: 0.13,     // ...led along the travel by this many seconds
      len: 0.30,      // step when the plant is this far behind home, x reach
      time: 0.16,     // seconds per swing
      lift: 0.22,     // swing arc height, x reach
      airHold: 0.5,   // pull toward the hang point for a limb with no surface
    },
  },

  // ---- GUARD ---------------------------------------------------------------
  guard: {
    // Half-arc a raised guard covers, in RADIANS. Hits arriving inside it are
    // blocked; the shield bubble's visible dome is drawn to match, so what
    // looks covered is exactly what is covered.
    arc: 1.5,
    leakDefault: 0.12,     // damage fraction through a guard when a mech sets no blockMult
  },

  // ---- MELEE / HIT REACTIONS ----------------------------------------------
  melee: {
    punchHoldCap: 1.8,     // seconds to fully bank a held haymaker
    heavyHoldCap: 2.4,     // seconds to fully bank a held heavy
    chargeMinWindup: 0.15, // forced chamber time so even a tap telegraphs
    hitstunHeavy: 0.42,    // seconds of stun from a heavy hit
    hitstunLight: 0.24,
    softFlinchChance: 0.35, // odds per chip tick of a torso rock
    weightKnockResist: 0.45, // how much of stats.weight resists knockback/launch
  },
};

// ---------------------------------------------------------------------------
// TRYING A NUMBER WITHOUT EDITING THIS FILE.
//
// Most values above are read ONCE, into a module-level const in fighter.js, the
// instant it loads. That is deliberate (they are on the hot path) but it means
// poking TUNING from the console after the fact changes nothing — a knob that
// silently ignores you, which is worse than no knob. So the override lands
// HERE, before anything has read a value:
//
//   ?tune=melee.hitstunLight:0.4,dash.cooldown:0.2      one session
//   rw.tune('melee.hitstunLight', 0.4)                  same thing, then reloads
//   rw.untune()                                         drop them all
//
// Overrides are session-scoped (sessionStorage) and never touch the file. When
// a number is worth keeping, type it into the block above.
// ---------------------------------------------------------------------------
export const TUNE_OVERRIDES = {};

function applyOverrides() {
  const spec = [];
  try {
    const q = new URLSearchParams(location.search).get('tune');
    if (q) spec.push(...q.split(','));
    const held = sessionStorage.getItem('rw.tune');
    if (held) spec.push(...JSON.parse(held).map(([k, v]) => `${k}:${v}`));
  } catch (e) { /* no location/storage: nothing to override */ }
  for (const item of spec) {
    const at = String(item).lastIndexOf(':');
    if (at < 1) continue;
    const path = item.slice(0, at).trim();
    const val = parseFloat(item.slice(at + 1));
    if (!Number.isFinite(val)) continue;
    const parts = path.split('.');
    let o = TUNING;
    for (let i = 0; i < parts.length - 1 && o; i++) o = o[parts[i]];
    const key = parts[parts.length - 1];
    if (!o || !(key in o) || typeof o[key] !== 'number') {
      console.warn(`[rw] ?tune: no such tuning value "${path}"`);
      continue;
    }
    TUNE_OVERRIDES[path] = { from: o[key], to: val };
    o[key] = val;
  }
  const n = Object.keys(TUNE_OVERRIDES).length;
  if (n) console.warn(`[rw] ${n} TUNING override(s) active:`, TUNE_OVERRIDES);
}
applyOverrides();

// Derived rates — the code wants per-second numbers, the file above states
// durations. Kept here so the two can never drift apart. Computed AFTER the
// overrides, so ?tune=stamina.sprintSeconds:4 moves the drain rate with it.
export const STAMINA_TANK = 1;
export const SPRINT_DRAIN = STAMINA_TANK / TUNING.stamina.sprintSeconds;
export const BLOCK_DRAIN = STAMINA_TANK / TUNING.stamina.blockSeconds;
export const STAMINA_REGEN = STAMINA_TANK / TUNING.stamina.refillSeconds;
