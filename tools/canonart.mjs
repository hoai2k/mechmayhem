// THE LOADING SCREEN'S MECH ART. docs/canonical/mech_<id>.png is the painted
// concept art every mech was built from — 1100x1400 RGB, ~2.3 MB each, which
// is right for a reference and wrong for a file the game downloads before a
// fight. This writes the shipped copy: public/art/<roster id>.jpg, resized to
// ART_H tall, quality ART_Q — ~40-60 KB each, so seventeen of them cost less
// than one original. Run it after a canonical image changes; the game reads
// only public/art/.
//
//   node tools/canonart.mjs            every mech with a canonical image
//   node tools/canonart.mjs viper      one
import sharp from 'sharp';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';

const ART_H = 720, ART_Q = 78;
// the one place a canonical filename and a roster id disagree
const ALIAS = { null: 'nullbot' };
const src = 'docs/canonical', dst = 'public/art';
mkdirSync(dst, { recursive: true });
const only = new Set(process.argv.slice(2));
let n = 0;
for (const f of readdirSync(src)) {
  const m = /^mech_([a-z]+)\.png$/.exec(f);
  if (!m) continue;
  const id = ALIAS[m[1]] || m[1];
  if (only.size && !only.has(id)) continue;
  const out = `${dst}/${id}.jpg`;
  const info = await sharp(`${src}/${f}`)
    .resize({ height: ART_H, withoutEnlargement: true })
    .jpeg({ quality: ART_Q, mozjpeg: true })
    .toFile(out);
  console.log(`${out}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
  n++;
}
if (!n) { console.error('nothing matched'); process.exit(1); }
