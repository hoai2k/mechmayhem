// What each mech ANCHOR actually drives in combat — the reference the
// ?debug=models anchor editor shows, so you can see which attacks you are
// about to move before you move them.
//
// Derived by reading the real call sites, not from memory:
//   • src/game/world.js  WEAPONS[...]       — every roster `ranged` type. They
//     all spawn from the shared `from`, which fireRanged reads off muzzleR;
//     mortar/hose alternate to muzzleL.
//   • src/combat/specials.js SPECIALS/ULTS  — muzzle(f) is muzzleR;
//     muzzle(f,'x') falls back to muzzleR when x is missing.
//   • src/combat/fighter.js                 — def.heavyFx signature FX, and
//     the AEGIS passive-shield hit test (a gameplay read, not an FX origin).
// Keep in sync when a weapon/special starts reading a new anchor.

// Each entry: anchors the action reads, and what happens when one is absent.
// `fallback` is what the code ACTUALLY does — it differs per call site.
const RANGED = {
  gatling: {}, flame: {}, rocket: {}, fist: {}, plasma: {}, dart: {}, blade: {},
  spear: {}, wave: {}, shell: {}, lightning: {}, railgun: {}, shard: {},
  glitch: {}, bats: {}, groundpound: {}, spikes: {}, flea: {}, slime: {},
  // alternate sides shot to shot; muzzleL absent -> both barrels use muzzleR
  mortar: { alt: 'muzzleL' }, hose: { alt: 'muzzleL' },
};
const SPECIAL = {
  missileVolley: { primary: 'podL', fallback: 'muzzleR' },
  barrage: { alt: 'muzzleL' },
  fleaSwarm: { alt: 'muzzleL' },
  slimeBarrage: { alt: 'muzzleL' },
  freezeBeam: {},
  starfall: {},
  shieldBash: { none: true },   // spins the shield JOINT; reads no anchor
};
const ULT = {
  bulletHurricane: {},
  judgment: {},
  deathSwarm: { primary: 'eye', fallback: 'the mech centre' },
};
const HEAVY = {
  starSmash: {},
  wingLasers: { tips: ['wing0', 'wing1', 'wing2', 'wing3', 'wing4', 'wing5'] },
};

const ROLE = {
  muzzleR: 'Primary spawn point: fireRanged reads it for EVERY ranged type, and muzzle() falls back to it whenever a named anchor is missing.',
  muzzleL: 'Second barrel — only the alternating-side weapons and volleys read it. When absent those shots all come from muzzleR.',
  core: 'Chest glow mount: carries the mech\'s core PointLight. Visual only.',
  overhead: 'Marker above the head. Created by both factories; no runtime consumer found.',
  scope: 'Procedural-route anchor (wraith contract). No runtime consumer found.',
  podL: 'Vulcan\'s left shoulder missile pod — missileVolley\'s launch origin.',
  podR: 'Decorative twin of podL. No code reads it.',
  shield: 'AEGIS passive cover: the live geometric test for attacks arriving THROUGH the tower shield. Gameplay, not FX — moving it changes what gets blocked.',
  eye: 'Wraith\'s eye — DEATH SWARM flare origin.',
};
const WING_ROLE = 'Wraith wing-tip laser emitter — one of six beams fired by the wingLasers heavy FX. Missing tips are simply skipped.';

// Every action on THIS mech that reads `name`. `available` (a Set of anchor
// names the built mech actually has) lets the panel report the real fallback
// behaviour — e.g. wraith's GLB has no `eye`, so DEATH SWARM flares from the
// mech centre instead.
export function anchorUses(def, name, available) {
  const uses = [];
  const has = (a) => !available || available.has(a);
  const add = (kind, label, detail) => uses.push({ kind, label, detail: detail || '' });

  // one action -> which of its slots land on `name`
  const consider = (kind, label, spec) => {
    if (!spec || spec.none) return;
    if (spec.tips) {                      // per-tip emitters, no fallback
      if (spec.tips.includes(name)) add(kind, label, 'one of ' + spec.tips.length + ' emitters');
      return;
    }
    const primary = spec.primary || 'muzzleR';
    if (name === primary && has(primary)) {
      add(kind, label, spec.alt && has(spec.alt) ? 'alternates with ' + spec.alt : '');
      return;
    }
    // primary missing -> the call site's documented fallback
    if (!has(primary) && spec.fallback === 'muzzleR' && name === 'muzzleR') {
      add(kind, label, `fallback — this build has no ${primary}`);
      return;
    }
    if (spec.alt) {
      if (name === spec.alt && has(spec.alt)) { add(kind, label, 'alternating side'); return; }
      // alt missing and we ARE the primary: both sides collapse onto muzzleR
      if (name === primary && !has(spec.alt)) add(kind, label, `both sides — this build has no ${spec.alt}`);
    }
  };

  const mv = def?.moves || {};
  if (mv.ranged?.type) consider('ranged', `Ranged — ${mv.ranged.name || mv.ranged.type}`, RANGED[mv.ranged.type]);
  if (mv.special?.id) consider('special', `Special — ${mv.special.name || mv.special.id}`, SPECIAL[mv.special.id]);
  if (mv.ult?.id) consider('ult', `Ult — ${mv.ult.name || mv.ult.id}`, ULT[mv.ult.id]);
  // signature heavy FX lives at the DEF level (roster `heavyFx`), read by
  // fighter.heavyChargeFx as def.heavyFx — not under moves.
  if (def?.heavyFx) consider('heavy', `Heavy — ${def.heavyFx}`, HEAVY[def.heavyFx]);
  // AEGIS passive shield cover is a def flag, not a move
  if (name === 'shield' && def?.passiveShield) add('defense', 'Passive shield cover', 'blocks attacks arriving through it');

  // notes about anchors this build is MISSING that would otherwise be used
  const notes = [];
  if (name === 'shield' && def?.passiveShield && !has('shield')) {
    notes.push('This build has no shield anchor, so passive cover is inactive on it.');
  }
  if (name === 'eye' && def?.moves?.ult?.id === 'deathSwarm' && !has('eye')) {
    notes.push('This build has no eye anchor, so the flare comes off the mech centre.');
  }
  const role = ROLE[name] || (/^wing[0-5]$/.test(name) ? WING_ROLE : '');
  return { role, uses, notes, unused: uses.length === 0 };
}
