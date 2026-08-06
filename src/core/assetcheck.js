// DOES EVERY TEXTURE THE GAME NAMES ACTUALLY EXIST?
//
// The texture pack is deliberately optional: `hasTex` gates every lookup and
// anything missing falls back to a procedural material, which is what lets an
// arena ship before its art does. That tolerance has a cost — a texture that
// goes MISSING (a move, a rename, a folder landing in the wrong place) looks
// exactly like a texture that has not been made yet, and the game keeps
// running while quietly rendering the fallback. That is how ten delivered
// facades sat in `public/textures/` doing nothing.
//
// So the names the game declares are checked once, at boot, and reported:
//
//   MISSING  a name the data asks for with no images behind it -> a WARNING
//            naming the file and the path it should be at.
//   PENDING  requested but not delivered yet (docs/ASSET_REQUESTS_*.md) ->
//            logged at INFO. Quiet on purpose: art still being made is not a
//            fault, but it should never be INVISIBLE either, or "what is
//            still outstanding" becomes a question nobody can answer from the
//            running game. If one of these turns UP that is reported too, so
//            the list cannot rot into crying wolf — delete the entry when the
//            art lands and the check starts guarding it for you.
//
// NOTHING HERE IS AN ERROR. A missing texture costs a procedural fallback,
// not a broken game, so the check informs an audit rather than shouting over
// everything else in the console.
//
// Derived from the data, never a second copy of it: themes name their own
// facades, structure kinds name their materials, the sprite manifest names
// its files. Add a theme or a structure kind and this covers it unedited.
import { hasTex } from './texload.js';
import { CONFIG } from './config.js';
import { THEMES } from '../arena/themes.js';
import { STRUCTURE_KINDS } from '../arena/structures.js';
import SPRITE_MANIFEST from '../textures/sprite/manifest.json';

// texture-pack names for the per-theme grounds and the shared facades, kept
// in step with arena.js by importing them rather than restating them
import { GROUND_TEX, FACADE_TEX } from '../arena/arena.js';

/**
 * REQUESTED BUT NOT YET DELIVERED. Each entry is `set/name`, and each should
 * cite the request document that asked for it. Remove an entry the moment the
 * images land — the check reports a present-but-pending name so this list
 * cannot quietly go stale.
 */
export const PENDING_ASSETS = new Set([
  // Empty: every texture the game declares is present. Add a name here the
  // moment something is DECLARED but not yet delivered, so the audit reports
  // it quietly (INFO) instead of shouting about a gap somebody already knows
  // about — and take it out again when the art lands, which the check itself
  // will tell you to do (ARRIVED).
]);

/** Every [set, name, why] the game's own data declares. */
export function declaredAssets() {
  const out = [];
  for (const t of THEMES) {
    out.push(['sky', `sky_${t.id}`, `${t.id} sky panorama`]);
    out.push(['sky', `horizon_${t.id}`, `${t.id} horizon strip`]);
    if (GROUND_TEX[t.id]) out.push(['ground', GROUND_TEX[t.id], `${t.id} ground`]);
    // a theme's OWN facade/roof, and the shared one its style falls back to
    if (t.buildings?.facadeTex) {
      out.push(['building', t.buildings.facadeTex, `${t.id} facade`]);
    }
    if (t.buildings?.roofTex) {
      out.push(['building', t.buildings.roofTex, `${t.id} roof`]);
    }
    const shared = FACADE_TEX[t.buildings?.styles?.[0]];
    if (shared) out.push(['building', shared, `${t.id} fallback facade`]);
    for (const s of t.structures || []) {
      const tex = STRUCTURE_KINDS[s.kind]?.tex;
      if (tex) out.push(['struct', tex, `${t.id} ${s.kind}`]);
    }
  }
  out.push(['building', 'bldg_roof_gravel', 'shared roof']);
  // the VFX sprite overrides are bundled, so a missing file is a build-time
  // fact rather than a 404 — effects.js reports it per slot too
  for (const [slot, cfg] of Object.entries(SPRITE_MANIFEST)) {
    if (cfg?.file) out.push(['sprite-file', cfg.file, `${slot} sprite`]);
  }
  return out;
}

const SPRITE_FILES = import.meta.glob('../textures/sprite/*.png', {
  eager: true, query: '?url', import: 'default',
});

const present = (set, name) => (set === 'sprite-file'
  ? !!SPRITE_FILES[`../textures/sprite/${name}`]
  : hasTex(set, name));

/**
 * Check every declared name. Returns {missing, unexpected} and — the point of
 * the exercise — SAYS SO on the console, so a refactor that strands the pack
 * announces itself instead of silently falling back to procedural.
 */
export function checkDeclaredAssets({ log = true } = {}) {
  const missing = [];
  const pending = [];
  const unexpected = [];
  const seen = new Set();
  for (const [set, name, why] of declaredAssets()) {
    const key = `${set}/${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const there = present(set, name);
    const known = PENDING_ASSETS.has(key);
    if (!there && !known) missing.push({ key, why });
    if (!there && known) pending.push({ key, why });
    if (there && known) unexpected.push({ key, why });
  }
  if (log && missing.length) {
    console.warn(
      `[rw] ${missing.length} declared texture(s) MISSING — rendering the ` +
      'procedural fallback for them. Textures live in ' +
      'src/textures/<set>/<name>/<name>_albedo.png (see ASSETS.md); images ' +
      'under public/textures/ are never read.\n' +
      missing.map((m) => `        ${m.key}  (${m.why})`).join('\n'));
  }
  if (log && pending.length) {
    // quiet, but never silent: this is the list an audit reads
    console.info(
      `[rw] ${pending.length} texture(s) still outstanding (see ` +
      'docs/ASSET_REQUESTS_*.md); procedural until they land:\n' +
      pending.map((m) => `        ${m.key}  (${m.why})`).join('\n'));
  }
  if (log && unexpected.length) {
    console.info(
      `[rw] ${unexpected.length} texture(s) listed as PENDING have arrived — ` +
      'delete them from PENDING_ASSETS in src/core/assetcheck.js so they are ' +
      'guarded from now on:\n' +
      unexpected.map((m) => `        ${m.key}`).join('\n'));
  }
  return { missing, pending, unexpected };
}

let ran = false;
/** Run once per session; a no-op when the texture pack is switched off. */
export function checkDeclaredAssetsOnce() {
  if (ran || !CONFIG.useTextures) return null;
  ran = true;
  return checkDeclaredAssets();
}
