// THE GAMEPLAY DIALS: everything derived off TUNING must come out a real,
// positive number, or a bar drains to NaN and the stamina system goes quiet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING, STAMINA_TANK, STAMINA_REGEN, SPRINT_DRAIN, BLOCK_DRAIN } from '../src/core/tuning.js';
import { CONFIG, ROUND_MIN, ROUND_MAX, ROUND_DEFAULT, OUTPUT_TRIM, MUSIC_VOL_CEIL } from '../src/core/config.js';

const positive = (v, name) => assert.ok(Number.isFinite(v) && v > 0, `${name} = ${v} (want finite > 0)`);

test('derived stamina rates are finite and positive', () => {
  positive(STAMINA_TANK, 'STAMINA_TANK');
  positive(STAMINA_REGEN, 'STAMINA_REGEN');
  positive(SPRINT_DRAIN, 'SPRINT_DRAIN');
  positive(BLOCK_DRAIN, 'BLOCK_DRAIN');
  positive(TUNING.stamina.sprintSeconds, 'stamina.sprintSeconds');
  positive(TUNING.stamina.blockSeconds, 'stamina.blockSeconds');
  positive(TUNING.stamina.refillSeconds, 'stamina.refillSeconds');
});

test('guardRelock is a fraction of the bar, strictly inside (0, 1)', () => {
  const v = TUNING.stamina.guardRelock;
  assert.ok(v > 0 && v < 1, `stamina.guardRelock = ${v}`);
});

test('every numeric leaf of TUNING is finite', () => {
  (function walk(o, path) {
    for (const [k, v] of Object.entries(o)) {
      const p = `${path}.${k}`;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p);
      else if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'number') assert.ok(Number.isFinite(x), `${p}[${i}]`); });
      else if (typeof v === 'number') assert.ok(Number.isFinite(v), `${p} = ${v}`);
    }
  })(TUNING, 'TUNING');
});

test('config round-time band and volume ceilings are sane', () => {
  assert.ok(ROUND_MIN < ROUND_DEFAULT && ROUND_DEFAULT <= ROUND_MAX, 'ROUND_MIN < ROUND_DEFAULT <= ROUND_MAX');
  assert.ok(Number.isFinite(OUTPUT_TRIM) && OUTPUT_TRIM > 0, `OUTPUT_TRIM = ${OUTPUT_TRIM}`); // a measured gain, may exceed 1
  assert.ok(Number.isFinite(MUSIC_VOL_CEIL) && MUSIC_VOL_CEIL > 0, `MUSIC_VOL_CEIL = ${MUSIC_VOL_CEIL}`); // derived: 1 / OUTPUT_TRIM
  assert.ok(CONFIG && typeof CONFIG === 'object');
});
