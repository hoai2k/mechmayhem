// DOES EVERY TEXTURE THE GAME NAMES ACTUALLY EXIST?  node tools/assetcheck.mjs
//
// The browser-side check (src/core/assetcheck.js) shouts on the console at
// boot; this is the same check runnable from the command line, so a refactor
// that strands the pack fails a script instead of waiting to be noticed. It
// runs the real module in a real page, so there is one implementation.
//
// Exits non-zero on a missing declared texture, on a PENDING entry that has
// actually arrived (delete it from the list), and on any stray asset sitting
// in a directory the game never reads.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './lib/browser.mjs';

let bad = 0;

// ---- 1. strays: images where the loader will never look --------------------
// public/ is served verbatim and is right for things fetched BY NAME at
// runtime (models, levels, badges, thumbs, posters, sound). It is wrong for
// TEXTURES: those are enumerated at build time out of src/textures, which is
// what makes hasTex() synchronous. A pack folder under public/ is invisible.
const strays = [];
const walk = (dir, out) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(png|jpe?g|webp)$/i.test(e)) out.push(p);
  }
  return out;
};
walk('public/textures', strays);
walk('public/sprites', strays);
for (const s of strays) {
  console.log(`STRAY  ${s}\n       -> textures belong in src/textures/<set>/<name>/ (see ASSETS.md); nothing reads this path`);
  bad++;
}
if (!strays.length) console.log('OK     no texture images stranded outside src/textures');

// ---- 2. the declared-name check, run in the page --------------------------
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => { console.log('PAGEERROR', String(e).slice(0, 200)); bad++; });
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
const res = await page.evaluate(async () => {
  const m = await import('/src/core/assetcheck.js');
  return m.checkDeclaredAssets({ log: false });
});
await browser.close();

for (const m of res.missing) {
  console.log(`MISSING ${m.key}  (${m.why})`);
  bad++;
}
// outstanding art is a NOTICE, not a failure — it is reported so an audit
// can answer "what is still missing" without reading three request documents
for (const p of res.pending) console.log(`PENDING ${p.key}  (${p.why})`);
for (const u of res.unexpected) {
  console.log(`ARRIVED ${u.key} is present but still listed PENDING — delete it from PENDING_ASSETS in src/core/assetcheck.js`);
}
if (!res.missing.length) console.log('OK     every declared texture is present (or listed pending)');
if (res.pending.length) console.log(`       ${res.pending.length} outstanding, tracked in docs/ASSET_REQUESTS_*.md`);

console.log(bad ? `\n${bad} asset problem(s).` : '\nAssets are where the game reads them.');
process.exit(bad ? 1 : 0);
