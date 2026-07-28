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
  // The tuck you can throw while falling with the hover tank empty.
  airRoll: {
    spinRate: 37.5,        // rad/s at full tilt (~6 turns a second)
    rampSeconds: 0.16,     // how quickly it reaches that rate
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

// Derived rates — the code wants per-second numbers, the file above states
// durations. Kept here so the two can never drift apart.
export const STAMINA_TANK = 1;
export const SPRINT_DRAIN = STAMINA_TANK / TUNING.stamina.sprintSeconds;
export const BLOCK_DRAIN = STAMINA_TANK / TUNING.stamina.blockSeconds;
export const STAMINA_REGEN = STAMINA_TANK / TUNING.stamina.refillSeconds;
