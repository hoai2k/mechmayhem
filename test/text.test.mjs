// EVERY USER-FACING STRING lives in core/text.js under a dotted id. An id
// nothing declares renders AS ITSELF on screen ("hud.ko"), which is loud but
// only if someone happens to be looking — this is the someone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES, hasMessage, t } from '../src/core/text.js';
import { ROSTER } from '../src/mechs/roster.js';
import { THEMES } from '../src/arena/themes.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('every roster mech has its name text', () => {
  for (const d of ROSTER) {
    for (const k of ['name', 'title', 'blurb', 'quote.intro', 'quote.win', 'move.special', 'move.ult']) {
      assert.ok(hasMessage(`mech.${d.id}.${k}`), `mech.${d.id}.${k} missing`);
    }
    assert.equal(d.name, t(`mech.${d.id}.name`), `${d.id}: roster name is the text table's`);
  }
});

test('every arena theme has name + desc text', () => {
  for (const th of THEMES) {
    assert.ok(hasMessage(`arena.${th.id}.name`), `arena.${th.id}.name missing`);
    assert.ok(hasMessage(`arena.${th.id}.desc`), `arena.${th.id}.desc missing`);
    assert.equal(th.name, t(`arena.${th.id}.name`));
  }
});

test('every literal t(\'…\') id used in src/ + workbench/ resolves', () => {
  const files = [];
  for (const r of ['src', 'workbench']) {
    (function walk(dir) {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.js')) files.push(p);
      }
    })(join(root, r));
  }
  const used = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-z0-9.]+)'\s*[,)]/gi)) {
      if (!used.has(m[1])) used.set(m[1], f);
    }
  }
  assert.ok(used.size > 20, `found only ${used.size} t('…') call sites — the grep is broken`);
  for (const [id, f] of used) {
    assert.ok(hasMessage(id), `t('${id}') in ${f.slice(root.length)} has no message`);
    assert.notEqual(t(id), id, `t('${id}') returns its own id`);
  }
});

test('no message is empty and every {placeholder} is well-formed', () => {
  for (const [id, s] of Object.entries(MESSAGES)) {
    assert.equal(typeof s, 'string', `${id} is not a string`);
    assert.ok(s.length > 0, `${id} is empty`);
    assert.ok(!/\{\s*\}/.test(s), `${id} has an empty placeholder`);
  }
});

test('t() substitutes params and leaves unknown ones visible', () => {
  const id = Object.keys(MESSAGES).find((k) => /\{\w+\}/.test(MESSAGES[k]));
  assert.ok(id, 'some message carries a placeholder');
  const key = MESSAGES[id].match(/\{(\w+)\}/)[1];
  assert.ok(t(id, { [key]: 'XYZ' }).includes('XYZ'));
  assert.ok(t(id).includes(`{${key}}`));
});
