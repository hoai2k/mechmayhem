// Which animation clips can a given mech actually play?
//
// Used by the ?debug=skin wiggle picker so its dropdown offers only this
// mech's animations instead of the whole 74-clip registry.
//
// Derived by reading the real play sites, not from memory:
//   • src/combat/fighter.js  — literal animator.play() names, plus the
//     def-driven ones (lightClips / heavyClip / heavyReleaseClip /
//     rangedClip / channelClip) and the ranged fallback chain by move type.
//   • src/combat/specials.js — cast(f,'<clip>') inside each SPECIALS / ULTS
//     entry, keyed by the roster move id.
//   • src/game/finisher/<id>.js — the per-mech finisher cinematics.
//   • src/game/{match,boot,warmup}.js — intro / victory.
// Names that aren't real clips (finisher files also play SOUNDS through the
// same-looking call) drop out because the result is intersected with the
// clip registry. Keep in sync when a new clip gets played somewhere.
import { CLIPS } from '../../src/mechs/animations.js';

// Played for every mech regardless of loadout. 'heavy' is here on purpose even
// for mechs with their own heavyClip: an AIRBORNE heavy is the generic ground
// smash (fighter.doHeavy plays 'heavy' at 1.5x when plunging), and 'groundPound'
// is the landing of that plunge. 'hangGrab' is the ledge catch.
const UNIVERSAL = ['intro', 'victory', 'taunt', 'block', 'hitFlinch',
  'launched', 'knockdown', 'getup', 'dead', 'heavy', 'groundPound', 'hangGrab'];
// channel weapons hold one looping clip instead of a per-shot one
const CHANNEL_TYPES = new Set(['gatling', 'flame', 'hose']);

// roster moves.special.id -> clips that special casts
const SPECIAL_CLIPS = {
  groundPound: ['groundPound'], missileVolley: ['shoot'],
  shieldBash: ['shieldWhirlHold', 'aegisShieldSmash'], bladeCyclone: ['viperWhirl'],
  starfall: ['castRaise'], bullRush: ['chargeLean'], staticField: ['burst'],
  pounce: ['lunge'], grabThrow: ['grabReach', 'liftHold', 'throwHeave'],
  barrage: ['brace'], ghostWalk: ['aim'], napalm: ['shoot'], geyser: ['castRaise'],
  sickleRush: ['pounceLeap', 'biteLatch'], slimeBarrage: ['spray'],
  fleaSwarm: ['shoot'], segfault: ['lunge'],
  // freezeBeam channels through the mech's OWN hold-and-pour clip, so it is
  // resolved from def.channelClip below rather than named here
  freezeBeam: null,
  cloak: [],
};
// roster moves.ult.id -> clips that ult casts
const ULT_CLIPS = {
  meteorBreaker: ['castRaise'], bulletHurricane: ['hurricaneSpin'], judgment: ['castRaise'],
  supernova: ['burst'], stampede: ['chargeLean'], thunderfall: ['castRaise'],
  wildHunt: ['castRaise'], colossalForm: ['burst'], deathSwarm: ['burst'],
  fireTornado: ['burst'], absoluteZero: ['burst'], tsunami: ['castRaise'],
  raptorPack: ['taunt'], sonicCroak: ['burst'], systemCrash: ['burst'],
  serpentStorm: [], fleaCircus: [],
};
// per-mech finisher cinematics (sound names already filtered out)
const FINISHER_CLIPS = {
  aegis: ['castRaise'], colossus: ['grabReach', 'liftHold', 'throwHeave'],
  cranky: ['clawSnap', 'castRaise', 'launched'], fenrir: ['lunge', 'flurry', 'launched'],
  frogger: ['spray', 'pounceLeap'], glacier: ['shootLoopL', 'frozenSurrender', 'daintyTap'],
  inferno: ['shootLoop'], jerry: ['shootLoop'], nova: ['castRaise'],
  nullbot: ['grabReach', 'light2'], rhino: ['chargeLean', 'launched'],
  saurion: ['pounceLeap', 'biteLatch'], tempest: ['burst'],
  titanus: ['grabReach', 'liftHold', 'throwHeave', 'pounceLeap'],
  viper: ['viperHeavy', 'launched'], vulcan: ['vulcanSpray'],
  wraith: ['castRaise', 'aim'],
};
// fighter.js doRanged: def.rangedClip wins, else this chain by move type
const RANGED_BY_TYPE = { mortar: ['brace', 'braceL'], railgun: ['aim'], groundpound: ['groundPound'] };

// The set of clips `def` can play. `profile` is the mech's glbanim profile
// (its clipOverrides swap a clip's CONTENT under the same action name, and
// its lightClips replace the light-attack chain).
// [{ name, role }] for every clip `def` can play, sorted by name. `role` says
// what that clip IS for this mech ("Heavy", "Ranged", "Ult — TSUNAMI"), because
// the clip NAMES alone are misleading: picking the one called "heavy" on cranky
// gets you the generic airborne smash, while his actual heavy is "clawSnap".
// `profile` is the mech's glbanim profile (its clipOverrides swap a clip's
// CONTENT under the same action name; its lightClips replace the light chain).
export function mechClipList(def, profile) {
  if (!def) return [];
  const roles = new Map();   // name -> Set(role)
  const add = (list, role) => {
    for (const c of list || []) {
      if (!c) continue;
      if (!roles.has(c)) roles.set(c, new Set());
      if (role) roles.get(c).add(role);
    }
  };
  add(['intro', 'victory', 'taunt'], 'Emote');
  add(['block', 'hitFlinch', 'launched', 'knockdown', 'getup', 'dead'], 'Reaction');
  // an AIRBORNE heavy is the generic smash whatever the mech's own heavy is,
  // and groundPound is that plunge landing
  add(['heavy'], 'Heavy (airborne smash)');
  add(['groundPound'], 'Plunge landing');
  add(['hangGrab'], 'Ledge grab');

  // LIGHT: a punchHold mech (titanus/colossus) never plays its lightClips —
  // doLight swaps the whole chain for the charge/release pair.
  if (def.punchHold) {
    add(['punchHold1', 'punchHold2'], 'Light charge');
    add(['punchRelease1', 'punchRelease2'], 'Light release');
  } else {
    add(profile?.lightClips || def.lightClips || ['light1', 'light2', 'light3'], 'Light');
  }
  add([def.heavyClip], def.heavyHold ? 'Heavy charge' : 'Heavy');
  add([def.heavyReleaseClip], 'Heavy release');

  const mv = def.moves || {};
  if (mv.ranged) {
    // doRanged: a channel weapon loops ONE clip; everything else fires a
    // per-shot clip, and only one of these branches can ever run.
    if (CHANNEL_TYPES.has(mv.ranged.type)) add([def.channelClip || 'shootLoop', def.channelClipL], 'Ranged (channel)');
    else if (def.rangedClip) add([def.rangedClip], 'Ranged');
    else add(RANGED_BY_TYPE[mv.ranged.type] || ['shoot'], 'Ranged');
    if (mv.ranged.type === 'fist') add(['fistCatch'], 'Catch fist');
  }
  add(mv.special?.id === 'freezeBeam' ? [def.channelClip || 'shootLoop']
    : SPECIAL_CLIPS[mv.special?.id], `Special — ${mv.special?.name || mv.special?.id}`);
  add(ULT_CLIPS[mv.ult?.id], `Ult — ${mv.ult?.name || mv.ult?.id}`);
  add(FINISHER_CLIPS[def.id], 'Finisher');

  // only names that resolve to a real clip (or a profile override of one)
  const over = profile?.clipOverrides || {};
  return [...roles.entries()]
    .filter(([n]) => CLIPS[n] || over[n])
    .map(([name, r]) => ({ name, role: [...r].join(' · ') }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// names only — the filter the skin workbench matches bones against
export function mechClips(def, profile) {
  return mechClipList(def, profile).map((c) => c.name);
}
