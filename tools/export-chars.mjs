// export-chars — the part of a character that is not geometry: who they are,
// what they do, and what a new game has to build to make them work.
//
//   node tools/export-chars.mjs [--out public/models/export]
//
// Writes into the export directory, beside the models:
//
//   characters.json   machine-readable: identity, stats, every attack with its
//                     real numbers, colours, gait, and the CAPABILITIES that
//                     body needs from an engine.
//   characters.md     the same as a readable dossier per character.
//   art/<id>/         canonical.png (the concept art the model was built from),
//                     plus the badge, the mech-select poster and the thumbnail.
//
// GEOMETRY.md — what the engine has to BUILD per body, with Titanus' rocket
// fist as the worked example — is authored prose rather than generated, so it
// lives in tools/exportkit/ and tools/export-bundle.mjs copies it.
//
// Runs in node, off the roster itself, so it cannot drift from the game.
import fs from 'fs';
import path from 'path';
import { ROSTER } from '../src/mechs/roster.js';
import { TUNING } from '../src/core/tuning.js';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const OUT = path.resolve(ROOT, flag('out', 'public/models/export'));
const hex = (n) => (typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : n);

// ---- capabilities -----------------------------------------------------------
// A flag on a roster def is a promise the ENGINE has to keep. Each entry says
// what the flag means and what a new game would have to implement, because that
// is the half a model cannot carry.
const CAPS = {
  punchHold: ['Chargeable light attack', 'The light chain is replaced by a hold/release pair: the arm stays wound while the button is held and strikes with banked power on release.'],
  heavyHold: ['Chargeable heavy attack', 'The heavy is held at its raised keyframe and released, rather than played straight through.'],
  chargeGlow: ['Charge tell', 'The named body region flickers brighter as power banks — the readable warning that a charged blow is coming.'],
  climb: ['Surface walking', 'This body walks up walls and over roofs. The engine samples nearby geometry into an average outward normal and a nearest point, damps the body toward it, and steps the limbs onto real contact points. `upright` 0 means it becomes part of the wall; near 1 means it stays vertical and hauls itself up by the hands.'],
  stackFx: ['Live burner / spark emitters', 'The sculpted flames or sparks were DELETED from the model (see GEOMETRY.md) and are emitted at runtime from the named anchors. A chimney vents up in world space; a hand torch burns down its own barrel and swings with the arm.'],
  floorGuard: ['Floor guard', 'A body whose skull hangs off the front of a low chassis; shared clips authored for a humanoid drive it through the ground. The engine lifts the render container when the lowest rendered vertex goes too far under.'],
  tailFloor: ['Tail floor guard', 'No tail segment may point below the feet — otherwise a rear-up animation sweeps a long tail under the pavement and the body gets levitated by it.'],
  limpChains: ['Limp chains', 'Named bone chains go slack when the body is down: a quasi-static solve damps each segment toward straight down and toward the floor, so the chain flops flat instead of propping the corpse up on its tip.'],
  foreCarry: ['Forelimb carry band', 'The arms are weapons held in front, not a jogger`s counter-swing, so every shared clip`s shoulder and elbow pitch is clamped into a measured band.'],
  noHover: ['No hover jets', 'This body has no flight.'],
  gait: ['Gait table', 'Which walk/run cycle this body runs. Bodies SHARE gaits, so tuning one moves every mech that names it.'],
  recolor: ['Team-colour repaint', 'Its baked textures are re-synthesized toward a paint target rather than hue-shifted, so white/black/silver mechs actually change colour.'],
  strafeLegs: ['Counter-rotating waist', 'Under target lock the hips take the angle between facing and travel and the torso gives it back, so the legs walk where the body is going while the chest stays on the enemy.'],
  tauntGrow: ['Growing taunt', 'The taunt scales the body up and hands off to a frozen, still-growing shell that fades as the real body fades back in.'],
  tauntIce: ['Freezing taunt', 'Cross-fades into a solid ice block over half a second and thaws in a sixth of one.'],
  holoTaunt: ['Glitch taunt', 'The taunt breaks the RENDER — a stutter, not a fade.'],
  arcTaunt: ['Arc taunt', 'Live electricity crawls between named hot points, bowed out along the facing so the show is not entirely on its own back.'],
  comboStatus: ['Combo finisher status', 'The LAST blow of the light string applies a status effect, so it rewards landing the whole combo rather than a single poke.'],
  aimFlat: ['Hull-mounted barrel', 'A barrel bolted to the chassis aims in YAW only: its authored splay steers the shot, the pitch belongs to the aim, or the body`s own forward lean fires it into the pavement.'],
};

function capsOf(def) {
  const out = [];
  for (const [k, [title, why]] of Object.entries(CAPS)) {
    let v;
    if (k === 'comboStatus') v = def.light?.comboStatus;
    else if (k === 'aimFlat') v = undefined;         // per-muzzle, in the manifest
    else v = def[k] ?? def.stats?.[k];
    if (v === undefined || v === false || v === null) continue;
    out.push({ key: k, title, means: why, value: typeof v === 'object' ? v : String(v) });
  }
  return out;
}

const move = (m, kind) => (m ? { kind, ...m } : null);

const records = ROSTER.map((d) => ({
  id: d.id,
  name: d.name,
  title: d.title,
  emoji: d.icon,
  personality: {
    blurb: d.blurb,
    quotes: d.quotes || {},
  },
  look: {
    primary: hex(d.colors?.primary), accent: hex(d.colors?.accent),
    glow: hex(d.colors?.glow), stripes: !!d.colors?.stripes,
  },
  build: d.body || null,
  stats: d.stats || null,
  cardStats: d.ui || null,          // the 0-10 power/speed/defense the select screen shows
  moves: {
    light: move(d.moves?.light, 'light'),
    heavy: move(d.moves?.heavy, 'heavy'),
    ranged: move(d.moves?.ranged, 'ranged'),
    special: move(d.moves?.special, 'special'),
    ult: move(d.moves?.ult, 'ult'),
  },
  clips: {
    light: d.lightClips || null, heavy: d.heavyClip || null,
    heavyRelease: d.heavyReleaseClip || null, ranged: d.rangedClip || null,
    rangedAlt: d.rangedClipL || null, channel: d.channelClip || null,
  },
  gait: d.gait || 'standard',
  capabilities: capsOf(d),
  art: {
    canonical: `art/${d.id}/canonical.png`,   // the concept the model was built from
    badge: `art/${d.id}/badge.png`,
    poster: `art/${d.id}/poster.png`,
    thumbnail: `art/${d.id}/thumb.png`,
    turnaround: `art/${d.id}/turnaround-*.png`,
  },
}));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'characters.json'), JSON.stringify({
  note: 'MECH MAYHEM roster. Damage/knock/range are in game units; the models in '
    + 'this directory are in the same units, so a `range: 3.4` reaches 3.4 of them. '
    + '`cardStats` are the 0-10 bars the mech-select screen shows, not the real numbers.',
  shared: {
    stamina: TUNING.stamina || null,
    movement: TUNING.movement || null,
    melee: TUNING.melee || null,
  },
  characters: records,
}, null, 2) + '\n');

// ---- art ---------------------------------------------------------------
let copied = 0;
for (const d of ROSTER) {
  const dir = path.join(OUT, 'art', d.id);
  fs.mkdirSync(dir, { recursive: true });
  // The CANONICAL image is the concept the model was built from — the one
  // picture that says what this character is supposed to look like, as opposed
  // to what this build of the model happens to render. It is the reference a
  // new game should judge its own work against. `nullbot`'s is filed under its
  // old short name.
  const canon = d.id === 'nullbot' ? 'mech_null.png' : `mech_${d.id}.png`;
  for (const [src, dst] of [
    [`docs/canonical/${canon}`, 'canonical.png'],
    [`public/badges/${d.id}.png`, 'badge.png'],
    [`public/posters/${d.id}.png`, 'poster.png'],
    [`public/thumbs/${d.id}.png`, 'thumb.png'],
  ]) {
    const s = path.join(ROOT, src);
    if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(dir, dst)); copied++; }
  }
}

// ---- the readable dossier --------------------------------------------------
const L = [];
L.push('# MECH MAYHEM — the roster\n');
L.push('Who each mech is, what they can do, and the numbers behind it. The models');
L.push('in this directory are these characters; `characters.json` is this file in a');
L.push('form you can read at runtime, and `GEOMETRY.md` covers what the ENGINE has');
L.push('to build for each body.\n');
L.push('Damage, knockback and range are in game units, and the models are in the');
L.push('same units — a `range: 3.4` reaches 3.4 of them.\n');
for (const r of records) {
  L.push(`\n---\n\n## ${r.name} — ${r.title}  ${r.emoji}\n`);
  L.push(`> ${r.personality.blurb}\n`);
  if (r.personality.quotes.intro) L.push(`**Entering:** ${r.personality.quotes.intro}  `);
  if (r.personality.quotes.win) L.push(`**Winning:** ${r.personality.quotes.win}\n`);
  const s = r.stats || {};
  L.push(`\n**Frame** — hp ${s.hp} · speed ${s.speed} · jump ${s.jump} · armor ${s.armor}`
    + ` · weight ${s.weight} · gait \`${r.gait}\``);
  if (r.cardStats) L.push(`**On the card** — power ${r.cardStats.power}/10 · speed ${r.cardStats.speed}/10 · defense ${r.cardStats.defense}/10`);
  L.push(`**Paint** — primary ${r.look.primary}, accent ${r.look.accent}, glow ${r.look.glow}\n`);
  L.push('\n| move | name | damage | reach | notes |');
  L.push('|---|---|---|---|---|');
  for (const [k, m] of Object.entries(r.moves)) {
    if (!m) continue;
    const dmg = Array.isArray(m.dmg) ? m.dmg.join(' / ') : (m.dmg ?? '—');
    const extra = Object.entries(m).filter(([kk]) =>
      !['kind', 'dmg', 'range', 'name', 'id'].includes(kk))
      .map(([kk, vv]) => `${kk} ${Array.isArray(vv) ? vv.join('/') : vv}`).join(', ');
    L.push(`| ${k} | ${m.name || m.id || '—'} | ${dmg} | ${m.range ?? '—'} | ${extra || ''} |`);
  }
  if (r.capabilities.length) {
    L.push('\n**What this body needs from the engine**\n');
    for (const c of r.capabilities) {
      L.push(`- **${c.title}** (\`${c.key}\`) — ${c.means}`);
    }
  }
  L.push(`\n<img src="art/${r.id}/poster.png" height="220" alt="${r.name}">\n`);
}
fs.writeFileSync(path.join(OUT, 'characters.md'), L.join('\n') + '\n');

const specs = path.join(ROOT, 'docs/canonical/SPECS.md');
if (fs.existsSync(specs)) {
  fs.copyFileSync(specs, path.join(OUT, 'art', 'CANONICAL-SPECS.md'));
  console.log('  art/CANONICAL-SPECS.md (the concept sheet the canonical images belong to)');
}
console.log(`characters.json + characters.md -> ${path.relative(ROOT, OUT)}`);
console.log(`  ${records.length} characters · ${copied} art files copied into art/<id>/`);
console.log(`  capabilities flagged: ${[...new Set(records.flatMap((r) => r.capabilities.map((c) => c.key)))].join(', ')}`);
