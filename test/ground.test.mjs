// THE ARENA FLOOR (arena/relief.js, arena/groundshader.js — docs/GROUND_RELIEF.md).
//
// Two promises that nothing on screen would flag until a player tripped over
// them: the relief field TILES (the arena is a torus — a step at the wrap seam
// is a ledge nobody authored) and stays GENTLE (it is walked over, never
// climbed), and the shader's fold correction is only applied to the very
// texture it was measured on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, existsSync, readFileSync } from 'node:fs';
import { RELIEF, Relief } from '../src/arena/relief.js';
import { THEMES } from '../src/arena/themes.js';

const P = 150;
// the smallest Terrain the field reads: no lanes, patches, hills or bridges,
// so what is measured is each arena's own base character
const stubTerrain = (id) => ({
  P, theme: { id }, lanes: [], patches: [], hills: [], bridges: [], viaduct: null,
  clearing: 38,
  wrapD: (d) => d - P * Math.round(d / P),
  laneCenter: () => 0,
});

test('every arena has a relief profile', () => {
  for (const th of THEMES) assert.ok(RELIEF[th.id], `RELIEF.${th.id}`);
});

test('the relief field tiles across the wrap seam and stays walkable', () => {
  for (const id of Object.keys(RELIEF)) {
    const r = new Relief(stubTerrain(id), RELIEF[id], { res: 128 });
    const { N, grid: g, cell } = r;
    let inner = 0, seam = 0, lo = Infinity, hi = -Infinity;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = g[j * N + i];
        lo = Math.min(lo, h); hi = Math.max(hi, h);
        const ex = Math.abs(g[j * N + ((i + 1) % N)] - h);
        const ez = Math.abs(g[((j + 1) % N) * N + i] - h);
        if (i < N - 1) inner = Math.max(inner, ex); else seam = Math.max(seam, ex);
        if (j < N - 1) inner = Math.max(inner, ez); else seam = Math.max(seam, ez);
      }
    }
    // the seam step is just another step: no bigger than the worst inside
    assert.ok(seam <= inner * 1.05 + 1e-6, `${id}: seam step ${seam.toFixed(3)} vs interior ${inner.toFixed(3)}`);
    // gentle: no base slope a mech would read as a wall, nothing near his knee
    const deg = Math.atan(inner / cell) * 180 / Math.PI;
    assert.ok(deg < 40, `${id}: worst base slope ${deg.toFixed(1)}°`);
    assert.ok(hi - lo < 4, `${id}: relief range ${(hi - lo).toFixed(2)}`);
  }
});

test('fold corrections match the ground art they were measured on', () => {
  const folds = JSON.parse(readFileSync(new URL('../src/arena/groundfolds.json', import.meta.url), 'utf8'));
  for (const [name, rec] of Object.entries(folds.textures)) {
    const f = new URL(`../src/textures/ground/${name}/${name}_albedo.png`, import.meta.url);
    assert.ok(existsSync(f), `${name}: albedo is gone — re-run node tools/groundfolds.mjs --write`);
    assert.equal(statSync(f).size, rec.bytes,
      `${name}: the albedo changed since its folds were measured — re-run node tools/groundfolds.mjs --write`);
  }
});
