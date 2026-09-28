// MECH ICONS: a hand-made BADGE outranks the auto-captured THUMBNAIL only if
// its id is declared in BADGES, so the list and the folder must agree both
// ways — a declared badge with no file, or a file nothing declares, is the
// "why is that mech still showing its snapshot" state. This is the file-level
// half of tools/iconcheck.mjs (the <img> fallback ladder needs a browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { BADGES, badgeUrl, thumbUrl } from '../src/ui/icons.js';
import { ROSTER } from '../src/mechs/roster.js';

const pub = (p) => new URL(`../public/${p}`, import.meta.url);

test('every declared badge has its file, and every badge file is declared', () => {
  for (const id of BADGES) assert.ok(existsSync(pub(badgeUrl(id))), `BADGES has '${id}' but ${badgeUrl(id)} is missing`);
  const files = readdirSync(pub('badges')).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
  for (const id of files) assert.ok(BADGES.has(id), `badges/${id}.png exists but BADGES does not declare it`);
});

test('every roster mech has a thumbnail to fall back on', () => {
  for (const d of ROSTER) assert.ok(existsSync(pub(thumbUrl(d.id))), `${d.id}: ${thumbUrl(d.id)} missing`);
});
