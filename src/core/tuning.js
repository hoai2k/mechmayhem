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

  // ---- WALL CLIMB ----------------------------------------------------------
  // The gecko route up a building, for the mechs whose roster def carries a
  // `climb` block (JERRY, who trades the hover jets for it). Shared feel
  // lives here; per-mech reach/speed/step live on the def.
  //
  // THERE IS NO CLIMBING MODE (combat/climb.js): a body built to climb is
  // always climbing. Walk into anything too tall to step over and he takes it;
  // jump at it and he lands on it, contact alone. The way off is the JUMP —
  // with a direction it is a leap that way, with nothing held he lets go and
  // drops straight down.
  climb: {
    // walking INTO a face rather than along it — the only gate left on a
    // grounded grab, and it is a fact rather than a gate (you cannot walk up a
    // wall you are walking beside). Airborne, contact alone is enough.
    grabDot: 0.35,
    tiltRate: 6.5,         // how fast the body damps between ground and wall
    topSeconds: 0.55,      // the haul over the lip, in seconds
    // a drop this many body-heights ahead is a face to wrap over and climb
    // down; anything shallower he just walks off
    wrapDrop: 0.75,
    // THE JUMP OFF A WALL, with a direction held: leap speed x the mech's walk,
    // the rise x his own jump, and the outward speed guaranteed to be away from
    // the face however the stick is aimed (without it, a stick pointed back
    // into the wall re-latches a frame later instead of jumping).
    leapMult: 1.15,
    leapRise: 0.8,
    leapOut: 5,
    // How hard the hands/feet are pulled onto the surface they are crossing,
    // and how near an extremity has to be (x body height) before that pull
    // reaches it at all. 1 = planted exactly on the face.
    conform: 1,
    conformRange: 0.42,
    // …and the floor under that pull for the HANDS specifically (see
    // conformClimbLimbs): a climber's claws are on the wall whether or not the
    // swing happened to bring them near it.
    handPlant: 0.7,
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
