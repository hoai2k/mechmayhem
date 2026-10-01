// GROUND TEXTURE AUDIT — is this ground art going to read as TILED?
//
//   node tools/groundaudit.mjs [sheet.jpg] [--strict]
//
// Every ground material in src/textures/ground/ (including the optional
// `<name>_b` variants the ground shader mixes in), measured three ways:
//
//   mirror   |img - flip(img)| / |img - shifted(img)|, horizontally and
//            vertically. ~0 means the texture was made tileable by MIRRORING a
//            quarter four ways — a kaleidoscope the eye finds at once and then
//            finds again every tile. Honest art reads ~1. The whole shipped
//            set measured 0.00 / 0.00 when this tool was written.
//   folds    the worst groove along the mirror lines (x/y = 0 and 0.5), as a
//            fraction of the ground's brightness either side — the dark cross
//            a mirror leaves in every tile (groundfolds.mjs measures the
//            profile the shader then cancels).
//   blotch   standard deviation of an 8x8 thumbnail: large light/dark shapes
//            that repeat with the tile. The shader adds its own world-scale
//            variation, so a texture wants to be EVEN at this scale (< ~12).
//
// Verdict per texture: OK, or what is wrong with it. --strict exits 1 on any
// failure — the acceptance check for the replacement art requested in
// docs/image-requests.md. With a path it also writes a contact sheet of every
// texture tiled 2x2, which is the honest way to look at one: a single tile
// never shows its own repetition.
import sharp from 'sharp';
import fs from 'node:fs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const sheet = args.find((a) => !a.startsWith('--'));
const dir = 'src/textures/ground';
const names = fs.readdirSync(dir).filter((n) => n.startsWith('ground_')
  && fs.existsSync(`${dir}/${n}/${n}_albedo.png`)).sort();

const LIN = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

let bad = 0;
const tiles = [];
for (const n of names) {
  const f = `${dir}/${n}/${n}_albedo.png`;
  const S = 256;
  const { data } = await sharp(f).resize(S, S).greyscale().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => data[y * S + x];
  let mh = 0, mv = 0, ref = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    mh += Math.abs(px(x, y) - px(S - 1 - x, y));
    mv += Math.abs(px(x, y) - px(x, S - 1 - y));
    ref += Math.abs(px(x, y) - px((x + S / 3) % S | 0, (y + S / 3) % S | 0));
  }
  const mirH = mh / ref, mirV = mv / ref;
  // fold grooves, at full resolution in linear light (what the shader sees)
  const { data: full, info } = await sharp(f).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const col = (x) => { x = ((x % W) + W) % W; let s = 0; for (let y = 0; y < H; y += 4) s += LIN[full[y * W + x]]; return s; };
  const row = (y) => { y = ((y % H) + H) % H; let s = 0; for (let x = 0; x < W; x += 4) s += LIN[full[y * W + x]]; return s; };
  const groove = (mean, c) => {
    const base = (mean(c - 16) + mean(c - 15) + mean(c + 15) + mean(c + 16)) / 4;
    let m = Infinity;
    for (let d = -3; d <= 3; d++) m = Math.min(m, mean(c + d));
    return Math.max(0, 1 - m / base);
  };
  const fold = Math.max(groove(col, 0), groove(col, W / 2), groove(row, 0), groove(row, H / 2));
  const { data: lo } = await sharp(f).resize(8, 8).greyscale().raw().toBuffer({ resolveWithObject: true });
  const lm = lo.reduce((a, b) => a + b, 0) / 64;
  const blotch = Math.sqrt(lo.reduce((a, b) => a + (b - lm) ** 2, 0) / 64);
  const why = [];
  const mirror = Math.min(mirH, mirV) < 0.3;
  if (mirror) why.push('MIRRORED');
  if (fold > 0.15 && mirror) why.push('FOLD GROOVES');
  if (blotch > 12) why.push('BLOTCHY');
  if (W < 2048) why.push(`${W}px (want 2048)`);
  // a line along the tile edge/middle in HONEST art is a warning only: a
  // paver or deck panel may legitimately have a joint there
  const warn = !mirror && fold > 0.15 ? '  (warn: a line on the tile grid — fine only for a joint/panel seam)' : '';
  if (why.length) bad++;
  console.log(`${n.padEnd(32)} mirror ${mirH.toFixed(2)}/${mirV.toFixed(2)}  folds ${(fold * 100).toFixed(0).padStart(3)}%` +
    `  blotch ${blotch.toFixed(1).padStart(4)}  ${why.length ? why.join(', ') : 'OK'}${warn}`);
  if (sheet) {
    const t = await sharp(f).resize(200, 200).toBuffer();
    tiles.push({ name: n, input: await sharp({ create: { width: 400, height: 400, channels: 3, background: '#000' } })
      .composite([0, 1, 2, 3].map((k) => ({ input: t, left: (k % 2) * 200, top: (k >> 1) * 200 }))).png().toBuffer() });
  }
}
if (sheet) {
  const cols = 4, rows = Math.ceil(tiles.length / cols);
  const W = cols * 410, H = rows * 430;
  const comp = tiles.map((t, i) => ({ input: t.input, left: (i % cols) * 410, top: Math.floor(i / cols) * 430 + 25 }));
  const labels = tiles.map((t, i) => `<text x="${(i % cols) * 410 + 4}" y="${Math.floor(i / cols) * 430 + 18}" font-size="16" fill="white" font-family="sans-serif">${t.name}</text>`).join('');
  comp.push({ input: Buffer.from(`<svg width="${W}" height="${H}">${labels}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 80 }).toFile(sheet);
  console.log('wrote', sheet);
}
console.log(bad ? `${bad} of ${names.length} would read as tiled` : `all ${names.length} OK`);
if (strict && bad) process.exit(1);
