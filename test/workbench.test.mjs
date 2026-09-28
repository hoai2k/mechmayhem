// THE WORKBENCH REGISTRY (workbench/registry.js) is the one list of tools the
// router, the front door and every panel's title bar read. What it cannot
// derive — each tool's module, the name its panel calls itself by, its
// screenshot, and the game page's legacy ?debug= redirects — is held to it
// here, so a renamed tool fails a test instead of a click.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { WORKBENCHES, WORKBENCH_BY_ID, WORKBENCH_ALIASES } from '../workbench/registry.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const exists = (p) => existsSync(new URL(`../${p}`, import.meta.url));

test('ids are unique and every tool has its fields', () => {
  assert.equal(new Set(WORKBENCHES.map((w) => w.id)).size, WORKBENCHES.length);
  for (const w of WORKBENCHES) {
    for (const k of ['id', 'module', 'run', 'title', 'color', 'tag', 'desc']) assert.ok(w[k], `${w.id}.${k}`);
  }
});

test('every tool module exists, exports its run function, and names itself by its id', () => {
  for (const w of WORKBENCHES) {
    const p = `workbench/tools/${w.module}.js`;
    assert.ok(exists(p), `${w.id}: ${p} missing`);
    const src = read(p);
    assert.match(src, new RegExp(`export (async )?function ${w.run}\\b`), `${p} does not export ${w.run}`);
    const named = [...src.matchAll(/setupDevPanel\([^)]*workbench:\s*'([^']+)'/g)].map((m) => m[1]);
    for (const n of named) assert.ok(WORKBENCH_BY_ID[n], `${p}: setupDevPanel({workbench:'${n}'}) is not a registry id`);
  }
});

test('every tool has a front-door screenshot', () => {
  for (const w of WORKBENCHES) assert.ok(exists(`workbench/thumbs/${w.id}.jpg`), `workbench/thumbs/${w.id}.jpg missing`);
});

test("aliases and the game page's legacy redirects land on real tools", () => {
  for (const [from, to] of Object.entries(WORKBENCH_ALIASES)) assert.ok(WORKBENCH_BY_ID[to], `alias ${from} -> ${to}`);
  // src/dev/index.js is read as source: the game must not import the workbench tree
  const src = read('src/dev/index.js');
  const block = src.slice(src.indexOf('const WORKBENCH_REDIRECTS = {'), src.indexOf('};', src.indexOf('const WORKBENCH_REDIRECTS = {')));
  const targets = [...block.matchAll(/:\s*'([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(targets.length >= 5, 'found the redirect table');
  for (const t of targets) assert.ok(WORKBENCH_BY_ID[t], `src/dev/index.js redirects to '${t}', not a registry id`);
});
