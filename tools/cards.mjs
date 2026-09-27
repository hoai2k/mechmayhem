// THE HERO CARDS, SHIPPED SIZE. docs/cards/<id>.jpg are the delivered
// paintings (docs/image-requests.md) — 2048x2560, ~1.8 MB each, which is right
// for a source and wrong for seventeen files the title screen shows at once.
// This writes what the game downloads: public/cards/<id>.jpg at CARD_H tall,
// quality CARD_Q (~120-200 KB), plus public/cards/index.json, the list of ids
// that HAVE a card (ui/cards.js reads it rather than probing for 404s).
// Run it after a card is added or repainted; the game reads only public/cards/.
//
//   node tools/cards.mjs            every card in docs/cards/
//   node tools/cards.mjs viper      one (the index is still rebuilt in full)
import sharp from 'sharp';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';

const CARD_H = 1000, CARD_Q = 80;
const src = 'docs/cards', dst = 'public/cards';
mkdirSync(dst, { recursive: true });
const only = new Set(process.argv.slice(2));
const ids = [];
for (const f of readdirSync(src).sort()) {
  const m = /^([a-z]+)\.jpg$/.exec(f);
  if (!m) continue;
  ids.push(m[1]);
  if (only.size && !only.has(m[1])) continue;
  const out = `${dst}/${m[1]}.jpg`;
  const info = await sharp(`${src}/${f}`)
    .resize({ height: CARD_H, withoutEnlargement: true, kernel: 'lanczos3' })
    .jpeg({ quality: CARD_Q, mozjpeg: true })
    .toFile(out);
  console.log(`${out}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}
if (!ids.length) { console.error('no cards in docs/cards/'); process.exit(1); }
writeFileSync(`${dst}/index.json`, JSON.stringify(ids) + '\n');
console.log(`${dst}/index.json  ${ids.length} cards`);
