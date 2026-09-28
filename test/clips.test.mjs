// WHICH CLIPS A MECH CAN PLAY is a hand-kept table (workbench/adapters/
// mechclips.js), and it feeds everything that audits or exports a mech per
// clip — skin debug, the bake check, groundprobe, armaudit, the export. A clip
// missing from it is a clip no audit ever looks at, silently: konga's whole
// ult and two finishers went unaudited that way. So the table is checked
// against the SOURCE here — every clip a handler or finisher names literally
// must be in its row, and every row must name a live handler / roster mech.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ROSTER } from '../src/mechs/roster.js';
import { CLIPS, GLB_CLIP_VARIANTS } from '../src/mechs/animations.js';
import { SPECIAL_CLIPS, ULT_CLIPS, FINISHER_CLIPS } from '../workbench/adapters/mechclips.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const isClip = (n) => n in CLIPS || n in GLB_CLIP_VARIANTS;
const specialsSrc = read('src/combat/specials.js');

// each top-level handler of `export const <table> = {` with its body text
function handlers(table) {
  const start = specialsSrc.indexOf(`export const ${table} = {`);
  assert.ok(start >= 0, `specials.js declares ${table}`);
  const body = specialsSrc.slice(start, specialsSrc.indexOf('\n};', start));
  const heads = [...body.matchAll(/^  ([A-Za-z_$][\w$]*)\s*(?:\(|:)/gm)];
  return new Map(heads.map((m, i) => [m[1], body.slice(m.index, heads[i + 1]?.index)]));
}
// every literal inside a call's argument list that names a clip, so a
// ternary (`play(s === 'L' ? 'kongaPoundL' : 'kongaPound')`) counts too
const clipsIn = (src, call) => {
  const out = new Set();
  for (const m of src.matchAll(call)) for (const s of m[1].matchAll(/'(\w+)'/g)) if (isClip(s[1])) out.add(s[1]);
  return out;
};
// clips the CASTER plays: cast(f, …) and f.animator(?).play(…) — the prey's
// reaction clips are the prey's, not this mech's
const casterClips = (src) => new Set([
  ...clipsIn(src, /\bcast\(\s*f\s*,([^)]*)\)/g),
  ...clipsIn(src, /\bf\.animator\??\.play\(([^)]*)\)/g),
]);

for (const [table, rows, used] of [
  ['SPECIALS', SPECIAL_CLIPS, (d) => d.moves.special.id],
  ['ULTS', ULT_CLIPS, (d) => d.moves.ult.id],
]) {
  const hs = handlers(table);
  const live = new Set(ROSTER.map(used));
  test(`mechclips ${table} rows name only live handlers`, () => {
    for (const id of Object.keys(rows)) {
      assert.ok(hs.has(id) && live.has(id), `mechclips row '${id}' is not a ${table} handler any roster mech uses`);
    }
  });
  test(`every ${table} handler a mech uses has a mechclips row listing its clips`, () => {
    for (const id of live) {
      assert.ok(id in rows, `${table}.${id} has no mechclips row`);
      if (rows[id] === null) continue;              // resolved from the def (freezeBeam)
      for (const c of casterClips(hs.get(id))) {
        assert.ok(rows[id].includes(c), `${table}.${id} plays '${c}', missing from its mechclips row`);
      }
    }
  });
}

test('every finisher file\'s clips are in its FINISHER_CLIPS row', () => {
  for (const d of ROSTER) {
    const p = `src/game/finisher/${d.id}.js`;
    if (!existsSync(new URL(`../${p}`, import.meta.url))) continue;
    // a finisher plays both bodies AND sounds through play(); any literal
    // inside a play(...) that names a clip counts
    for (const c of clipsIn(read(p), /\.play\(([^)]*)\)/g)) {
      assert.ok(FINISHER_CLIPS[d.id]?.includes(c), `finisher/${d.id}.js plays '${c}', missing from FINISHER_CLIPS.${d.id}`);
    }
  }
  const ids = new Set(ROSTER.map((d) => d.id));
  for (const id of Object.keys(FINISHER_CLIPS)) assert.ok(ids.has(id), `FINISHER_CLIPS.${id} is not a roster mech`);
});
