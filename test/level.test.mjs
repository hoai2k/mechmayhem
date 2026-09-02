// AUTHORED LEVELS: every level shipped in public/levels/ parses, names a real
// theme and converts through themeFromLevel into a theme the Arena can take.
//
// The OTHER half of the round trip — bake.js' levelFromArena, which reads a
// BUILT Arena's recipe back into a level — needs the arena built (THREE
// scene graph, instanced chunk meshes, prop GLBs) and therefore a browser;
// that leg is covered by `node tools/arenabake.mjs`, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVEL_VERSION, themeFromLevel, emptyLevel } from '../src/arena/level.js';
import { THEMES, THEMES_BY_ID } from '../src/arena/themes.js';
import { AUTHORED_ARENAS } from '../src/arena/authored.js';

const url = (p) => new URL(`../public/levels/${p}`, import.meta.url);
const names = JSON.parse(readFileSync(url('manifest.json'), 'utf8'));
const KINDS = new Set(['building', 'prop', 'hill', 'bridge', 'lane', 'patch']);

test('levels/manifest.json lists real files', () => {
  assert.ok(Array.isArray(names) && names.length > 0);
  for (const n of names) assert.doesNotThrow(() => readFileSync(url(`${n}.json`)), `${n}.json missing`);
});

test('every authored arena registered in AUTHORED_ARENAS is a shipped level on a real theme', () => {
  for (const [theme, level] of Object.entries(AUTHORED_ARENAS)) {
    assert.ok(THEMES_BY_ID[theme], `AUTHORED_ARENAS.${theme}: no such theme`);
    assert.ok(names.includes(level), `AUTHORED_ARENAS.${theme} -> '${level}' is not in levels/manifest.json`);
  }
});

for (const n of names) {
  test(`${n}.json converts through themeFromLevel`, () => {
    const L = JSON.parse(readFileSync(url(`${n}.json`), 'utf8'));
    assert.equal(L.v, LEVEL_VERSION);
    assert.ok(THEMES_BY_ID[L.theme], `${n}: theme '${L.theme}' unknown`);
    for (const o of L.objects) assert.ok(KINDS.has(o.k), `${n}: object kind '${o.k}'`);
    const theme = themeFromLevel(L);
    assert.equal(theme.id, L.theme);
    assert.equal(theme.name, L.name);
    const placed = L.objects.filter((o) => o.k === 'building' || o.k === 'prop');
    assert.equal(theme.authored.length, placed.length, 'buildings + props are placed verbatim');
    assert.equal(theme.layout.lanes.length, L.objects.filter((o) => o.k === 'lane').length);
    assert.equal(theme.layout.patches.length, L.objects.filter((o) => o.k === 'patch').length);
    assert.equal((theme.layout.hills?.list || []).length, L.objects.filter((o) => o.k === 'hill').length);
    assert.equal((theme.layout.bridges?.list || []).length, L.objects.filter((o) => o.k === 'bridge').length);
    assert.equal(theme.layout.clusters.count, 0, 'no procedural clusters on an authored level');
    if (L.bounds) assert.equal(theme.bounds * 2, L.bounds, 'editor bounds are the doubled world radius');
    if (L.spawns?.length) assert.equal(theme.spawns.length, L.spawns.length);
    assert.equal(theme.layout.viaduct, L.viaduct || null);
    // the base theme itself must not have been written to
    assert.notEqual(theme, THEMES_BY_ID[L.theme]);
    assert.equal(THEMES_BY_ID[L.theme].authored, undefined);
  });
}

test('emptyLevel(theme) round-trips for every theme', () => {
  for (const th of THEMES) {
    const L = emptyLevel(th.id);
    assert.equal(L.v, LEVEL_VERSION);
    assert.equal(L.theme, th.id);
    const theme = themeFromLevel(L);
    assert.equal(theme.id, th.id);
    assert.equal(theme.bounds, th.bounds);
    assert.deepEqual(theme.authored, []);
    assert.equal(theme.layout.clearing, L.clearing);
  }
});
