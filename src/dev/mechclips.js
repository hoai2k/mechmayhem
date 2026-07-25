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
import { CLIPS } from '../mechs/animations.js';

// played for every mech regardless of loadout
const UNIVERSAL = ['intro', 'victory', 'taunt', 'block', 'hitFlinch',
  'launched', 'knockdown', 'getup', 'dead', 'heavy'];

// roster moves.special.id -> clips that special casts
const SPECIAL_CLIPS = {
  groundPound: ['groundPound'], missileVolley: ['shoot'],
  shieldBash: ['shieldWhirlHold', 'aegisShieldSmash'], bladeCyclone: ['viperWhirl'],
  starfall: ['castRaise'], bullRush: ['chargeLean'], staticField: ['burst'],
  pounce: ['lunge'], grabThrow: ['grabReach', 'liftHold', 'throwHeave'],
  barrage: ['brace'], ghostWalk: ['aim'], napalm: ['shoot'], geyser: ['castRaise'],
  sickleRush: ['pounceLeap', 'biteLatch'], slimeBarrage: ['spray'],
  fleaSwarm: ['shoot'], segfault: ['lunge'], freezeBeam: ['shootLoop'],
  cloak: [],
};
// roster moves.ult.id -> clips that ult casts
const ULT_CLIPS = {
  meteorBreaker: ['castRaise'], bulletHurricane: ['spinFire'], judgment: ['castRaise'],
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
  frogger: ['spray', 'pounceLeap'], glacier: ['shootLoop', 'frozenSurrender', 'daintyTap'],
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
export function mechClips(def, profile) {
  if (!def) return [];
  const out = new Set(UNIVERSAL);
  const add = (list) => { for (const c of list || []) if (c) out.add(c); };

  add(profile?.lightClips || def.lightClips || ['light1', 'light2', 'light3']);
  add([def.heavyClip, def.heavyReleaseClip, def.channelClip || 'shootLoop']);

  const mv = def.moves || {};
  if (mv.ranged) {
    if (def.rangedClip) add([def.rangedClip]);
    else add(RANGED_BY_TYPE[mv.ranged.type] || ['shoot']);
  }
  add(SPECIAL_CLIPS[mv.special?.id]);
  add(ULT_CLIPS[mv.ult?.id]);
  add(FINISHER_CLIPS[def.id]);

  // only names that resolve to a real clip (or a profile override of one)
  const over = profile?.clipOverrides || {};
  return [...out].filter((n) => CLIPS[n] || over[n]).sort();
}
