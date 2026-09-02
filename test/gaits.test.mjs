// GAITS ARE DATA and the schema is what the workbench, the tools and
// `applyGait` all derive from — a dial outside it is a number nothing reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAITS, GAIT_SCHEMA, DEFAULT_GAIT, effectiveGait, gallopBlend, gaitBaseOf, gaitHeirsOf, runGroupId,
} from '../src/mechs/gaits.js';

const GROUPS = new Map(GAIT_SCHEMA.map((g) => [g.id, new Set(g.params.map((p) => p.key))]));
const MORPH = ['legs', 'ankle', 'arms', 'body'];
// the descriptive keys a gait may carry beside its dial groups
const META = new Set(['name', 'note', 'keys']);

test('the default gait exists', () => assert.ok(GAITS[DEFAULT_GAIT]));

test('every key in every gait is in GAIT_SCHEMA', () => {
  for (const [id, gait] of Object.entries(GAITS)) {
    for (const [grp, table] of Object.entries(gait)) {
      if (META.has(grp)) continue;
      assert.ok(GROUPS.has(grp), `${id}: group '${grp}' is not in GAIT_SCHEMA`);
      for (const k of Object.keys(table)) {
        assert.ok(GROUPS.get(grp).has(k), `${id}.${grp}.${k} is not a schema dial`);
        assert.ok(Number.isFinite(table[k]), `${id}.${grp}.${k} is not a finite number`);
      }
    }
  }
});

test('every non-optional schema group is present on every gait', () => {
  for (const [id, gait] of Object.entries(GAITS)) {
    for (const g of GAIT_SCHEMA) {
      if (g.optional) continue;
      assert.ok(gait[g.id], `${id} lacks group '${g.id}'`);
    }
  }
});

test('base: chains resolve one level deep and heirs carry the base groups', () => {
  for (const id of Object.keys(GAITS)) {
    const base = gaitBaseOf(id);
    if (!base) continue;
    assert.ok(GAITS[base], `${id}: base '${base}' unknown`);
    assert.equal(gaitBaseOf(base), null, `${id}: base '${base}' has its own base (bases do not chain)`);
    assert.ok(gaitHeirsOf(base).includes(id));
    for (const grp of Object.keys(GAITS[base])) {
      if (META.has(grp)) continue;
      for (const k of Object.keys(GAITS[base][grp])) {
        assert.ok(k in GAITS[id][grp], `${id}.${grp}.${k} not inherited from ${base}`);
      }
    }
  }
});

test('effectiveGait(g, 0) is the walk table', () => {
  for (const [id, gait] of Object.entries(GAITS)) {
    assert.equal(effectiveGait(gait, 0, {}), gait, `${id} at ratio 0 must be the gait itself`);
  }
});

test('effectiveGait(g, 1) is the run table where one exists', () => {
  for (const [id, gait] of Object.entries(GAITS)) {
    const hasRun = MORPH.some((g) => gait[runGroupId(g)]);
    const out = effectiveGait(gait, 1, {}, 1);
    if (!hasRun) { assert.equal(out, gait, `${id}: no run table, must pass through`); continue; }
    assert.equal(gallopBlend(gait, 1), 1, `${id}: the speed ramp must be fully blended at ratio 1`);
    assert.notEqual(out, gait);
    for (const g of MORPH) {
      const from = gait[g], to = gait[runGroupId(g)];
      if (!from) continue;
      for (const k of Object.keys(from)) {
        const want = to && to[k] !== undefined ? to[k] : from[k];
        assert.ok(Math.abs(out[g][k] - want) < 1e-9, `${id}.${g}.${k} at ratio 1: ${out[g][k]} != ${want}`);
      }
    }
    for (const k of Object.keys(gait)) {
      if (!MORPH.includes(k)) assert.equal(out[k], gait[k], `${id}.${k} must pass through untouched`);
    }
  }
});
