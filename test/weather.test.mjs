// THE CLIMATE (arena/climate.js) — the part of the weather that is arithmetic,
// run for whole matches in Node. What it promises: weather only on the arenas
// whose sky can carry it, intensity that stays inside each climate and
// actually MOVES (a drizzle that never becomes a storm is not "variable"),
// sandstorms that are occasional rather than constant, and wind that gusts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER, WEATHER_KINDS, Climate, climateProfile } from '../src/arena/climate.js';
import { THEMES } from '../src/arena/themes.js';
import { makeRng } from '../src/core/utils.js';

const run = (prof, seed, secs = 600, dt = 1 / 30) => {
  const c = new Climate(prof, seed);
  const ks = [], gusts = [], winds = [];
  for (let t = 0; t < secs; t += dt) {
    c.step(dt);
    ks.push(c.k); gusts.push(c.gust); winds.push(c.windSpeed);
  }
  return { ks, gusts, winds };
};
const frac = (arr, f) => arr.filter(f).length / arr.length;

test('weather only where it belongs', () => {
  const ids = new Set(THEMES.map((t) => t.id));
  for (const [id, p] of Object.entries(WEATHER)) {
    assert.ok(ids.has(id), `WEATHER.${id} is a real arena`);
    assert.ok(WEATHER_KINDS.includes(p.kind), `${id}: kind ${p.kind}`);
  }
  // clear skies, a sunset harbour, a starlit pit and a space station
  for (const id of ['uptown', 'skyterrace', 'harbor', 'quarry', 'orbital']) {
    assert.equal(WEATHER[id], undefined, `${id} has no weather`);
  }
});

test('intensity stays inside each climate and moves through it', () => {
  for (const [id, p] of Object.entries(WEATHER)) {
    for (const seed of [1, 2, 3]) {
      const { ks, gusts, winds } = run(p, seed);
      const lo = Math.min(...ks), hi = Math.max(...ks);
      assert.ok(lo >= 0 && hi <= 1, `${id}: k in 0..1`);
      assert.ok(lo >= p.range[0] - 0.06 && hi <= p.range[1] + 0.13, `${id}/${seed}: k ${lo.toFixed(2)}..${hi.toFixed(2)} vs ${p.range}`);
      // over ten minutes the weather must cover a real part of its range
      assert.ok(hi - lo > (p.range[1] - p.range[0]) * 0.4, `${id}/${seed}: only moved ${lo.toFixed(2)}..${hi.toFixed(2)}`);
      assert.ok(Math.min(...gusts) >= 0 && Math.max(...gusts) <= 1, `${id}: gust 0..1`);
      assert.ok(Math.max(...gusts) > 0.5, `${id}: it gusts`);
      assert.ok(Math.max(...winds) <= p.wind + p.gust + 1e-6, `${id}: wind bounded`);
    }
  }
});

test('sandstorms are occasional: mostly calm, and a real storm when one comes', () => {
  for (const id of ['ruins', 'scrapyard']) {
    const p = WEATHER[id];
    let storms = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { ks } = run(p, seed);
      assert.ok(frac(ks, (k) => k < 0.25) > 0.4, `${id}/${seed}: calm most of the time`);
      // no storm in the opening seconds of a round
      assert.ok(Math.max(...ks.slice(0, 30 * 6)) < 0.3, `${id}/${seed}: calm at the bell`);
      if (Math.max(...ks) > p.peak[0] * 0.85) storms++;
    }
    assert.ok(storms >= 3, `${id}: a storm in ${storms}/4 ten-minute runs`);
  }
});

test('tropical rain comes in bursts', () => {
  const { ks } = run(WEATHER.jungle, 5);
  assert.ok(frac(ks, (k) => k < 0.4) > 0.25, 'lulls');
  assert.ok(frac(ks, (k) => k > 0.6) > 0.15, 'downpours');
});

test('a climate is deterministic in its seed', () => {
  const a = run(WEATHER.neon, 42, 60).ks, b = run(WEATHER.neon, 42, 60).ks;
  assert.deepEqual(a, b);
});

test('?weather= switches', () => {
  const neon = THEMES.find((t) => t.id === 'neon');
  const uptown = THEMES.find((t) => t.id === 'uptown');
  assert.equal(climateProfile(neon, { force: 'off' }), null);
  assert.equal(climateProfile(neon, { force: 'force' }).kind, 'rain');
  assert.equal(climateProfile(uptown, { force: 'force' }), null);
  assert.equal(climateProfile(uptown, { force: 'snow' }).kind, 'snow');
  // the chance is a share of rounds
  const rng = makeRng(9);
  let n = 0;
  for (let i = 0; i < 2000; i++) if (climateProfile(neon, { rng })) n++;
  assert.ok(Math.abs(n / 2000 - WEATHER.neon.chance) < 0.04, `neon rains in ${(n / 20).toFixed(0)}% of rounds`);
});
