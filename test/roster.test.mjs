// ROSTER ↔ SPECIALS ↔ CLIPS ↔ CONTRACT — the cross-references a retired or
// renamed mech breaks silently. Everything here imports under plain node.
//
// specials.js itself does NOT (it pulls fighter.js → effects.js →
// `import.meta.glob`), so its two handler tables are read out of the SOURCE:
// every top-level `name(f, …) {` / `name:` entry between `export const
// SPECIALS = {` and the closing `};`. That is the shape the file has always
// had (dispatch is `SPECIALS[sp.id]`), and a handler written any other way
// shows up here as "no handler", which is the loud failure we want.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROSTER } from '../src/mechs/roster.js';
import { CLIPS, GLB_CLIP_VARIANTS } from '../src/mechs/animations.js';
import { CONTRACT } from '../src/mechs/contract.js';
import { GAITS, gaitIdFor } from '../src/mechs/gaits.js';

const specialsSrc = readFileSync(new URL('../src/combat/specials.js', import.meta.url), 'utf8');
function handlerKeys(table) {
  const start = specialsSrc.indexOf(`export const ${table} = {`);
  assert.ok(start >= 0, `specials.js declares ${table}`);
  const end = specialsSrc.indexOf('\n};', start);
  const body = specialsSrc.slice(start, end);
  return [...body.matchAll(/^  ([A-Za-z_$][\w$]*)\s*(?:\(|:)/gm)].map((m) => m[1]);
}
const SPECIALS = handlerKeys('SPECIALS');
const ULTS = handlerKeys('ULTS');
const ids = ROSTER.map((d) => d.id);

test('roster is 17 unique ids', () => {
  assert.equal(ids.length, 17);
  assert.equal(new Set(ids).size, ids.length);
});

test('every special.id / ult.id has a handler', () => {
  for (const d of ROSTER) {
    assert.ok(d.moves?.special?.id, `${d.id} names a special`);
    assert.ok(d.moves?.ult?.id, `${d.id} names an ult`);
    assert.ok(SPECIALS.includes(d.moves.special.id), `${d.id}: SPECIALS.${d.moves.special.id} missing`);
    assert.ok(ULTS.includes(d.moves.ult.id), `${d.id}: ULTS.${d.moves.ult.id} missing`);
  }
});

test('every special / ult handler is used by some mech (no retired-mech leftovers)', () => {
  const usedSp = new Set(ROSTER.map((d) => d.moves.special.id));
  const usedUlt = new Set(ROSTER.map((d) => d.moves.ult.id));
  assert.deepEqual(SPECIALS.filter((k) => !usedSp.has(k)), [], 'dead SPECIALS handlers');
  assert.deepEqual(ULTS.filter((k) => !usedUlt.has(k)), [], 'dead ULTS handlers');
});

test('every clip a roster def names exists in CLIPS or GLB_CLIP_VARIANTS', () => {
  const known = new Set([...Object.keys(CLIPS), ...Object.keys(GLB_CLIP_VARIANTS)]);
  const FIELDS = ['heavyClip', 'heavyReleaseClip', 'rangedClip', 'rangedClipL'];
  for (const d of ROSTER) {
    for (const c of d.lightClips || []) assert.ok(known.has(c), `${d.id}.lightClips: '${c}' is not a clip`);
    for (const k of FIELDS) {
      if (typeof d[k] === 'string') assert.ok(known.has(d[k]), `${d.id}.${k}: '${d[k]}' is not a clip`);
    }
  }
});

test('every roster def names a gait that exists', () => {
  for (const d of ROSTER) {
    const g = gaitIdFor(d);
    assert.ok(GAITS[g], `${d.id}: gait '${g}' unknown`);
  }
});

// validateMech() needs a BUILT mech (joints/anchors on a THREE scene graph),
// which needs the factories and therefore a browser; the static half of the
// contract is checked here — the table names only real mechs, and every GLB
// anchor it requires is actually reinstated by that mech's manifest entry.
test('CONTRACT names only roster mechs', () => {
  for (const id of Object.keys(CONTRACT)) assert.ok(ids.includes(id), `CONTRACT.${id} is not a roster mech`);
});

test('every contract glbAnchor is reinstated by the manifest muzzles block', () => {
  const man = JSON.parse(readFileSync(new URL('../public/models/manifest.json', import.meta.url), 'utf8'));
  for (const [id, c] of Object.entries(CONTRACT)) {
    const entry = man[id];
    if (!entry || !c.glbAnchors?.length) continue;
    for (const a of c.glbAnchors) {
      assert.ok(entry.muzzles?.[a], `${id}: manifest muzzles lacks '${a}' (CONTRACT.glbAnchors)`);
    }
  }
});
