// MEASURE THE FOLD GROOVES IN THE GROUND TEXTURES.
//
//   node tools/groundfolds.mjs            # prints the dip of every fold
//   node tools/groundfolds.mjs --write    # writes src/arena/groundfolds.json
//
// Every ground texture in the pack was made tileable by MIRRORING one quarter
// four ways (tools/groundaudit.mjs measures it: left/right and top/bottom
// halves identical to the pixel), and the generator left a soft dark GROOVE
// along each fold — ~14 texels wide, up to half as bright as the ground round
// it, with a matching V in the normal map — at the tile edges AND through the
// middle of every tile. On screen that is a dark cross every ~7 units, the
// single strongest "this floor is tiled" cue.
//
// Rewriting 48 PNGs would put ~100 MB more into a repository whose ground art
// is being replaced anyway (docs/image-requests.md), so the groove is
// cancelled in the SHADER instead (groundshader.js): this tool measures each
// fold's average profile — the mean of every texel column (or row) within
// ±K of the fold, against a straight-line baseline between the columns just
// outside it — and stores, per map:
//   albedo  a LINEAR luminance GAIN per tap (the groove is a darkening)
//   normal  an ADDITIVE delta per tap  (x for vertical folds, y for horizontal)
//   rough   an ADDITIVE delta per tap  (green channel, which three reads)
// Only the AVERAGE across the fold is removed, so the texture's own detail
// running across it survives.
//
// WHEN NEW ART LANDS (docs/image-requests.md asks for non-mirrored grounds):
// re-run with --write. A texture that is not a mirror is left out of the file
// and so gets no correction; `npm test` fails until you do, because each entry
// carries the byte size of the albedo it was measured on.
import sharp from 'sharp';
import fs from 'node:fs';

const K = 12;
const LIN = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});           // taps either side of a fold
const OUT = 'src/arena/groundfolds.json';
const dir = 'src/textures/ground';
const write = process.argv.includes('--write');
const names = fs.readdirSync(dir).filter((n) => n.startsWith('ground_')).sort();

async function profiles(file, ch, mode) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const v = (x, y) => {
    if (mode === 'lum' && C >= 3) {
      const k = (y * W + x) * C;
      // in LINEAR light: the shader reads the albedo sRGB-decoded, so a
      // groove half as bright in the file is ~5x darker where the gain is
      // applied (measuring it in sRGB left two thirds of every groove behind)
      return 255 * (0.2126 * LIN[data[k]] + 0.7152 * LIN[data[k + 1]] + 0.0722 * LIN[data[k + 2]]);
    }
    return data[(y * W + x) * C + ch];
  };
  const colMean = (x) => { x = ((x % W) + W) % W; let s = 0; for (let y = 0; y < H; y += 2) s += v(x, y); return s / (H / 2); };
  const rowMean = (y) => { y = ((y % H) + H) % H; let s = 0; for (let x = 0; x < W; x += 2) s += v(x, y); return s / (W / 2); };
  const fold = (mean, c) => {
    const left = (mean(c - K - 3) + mean(c - K - 2) + mean(c - K - 1)) / 3;
    const right = (mean(c + K + 1) + mean(c + K + 2) + mean(c + K + 3)) / 3;
    const taps = [];
    let dip = 0;
    for (let d = -K; d <= K; d++) {
      const base = left + (right - left) * (d + K + 2) / (2 * K + 4);
      const m = mean(c + d);
      dip = Math.max(dip, Math.abs(base - m) / Math.max(1, base));
      taps.push(mode === 'lum' ? +(base / Math.max(1, m)).toFixed(4) : +((base - m) / 255).toFixed(4));
    }
    return { taps, dip };
  };
  return {
    W, H,
    x0: fold(colMean, 0), xh: fold(colMean, W / 2),
    y0: fold(rowMean, 0), yh: fold(rowMean, H / 2),
  };
}

const out = { K, textures: {} };
// is this texture a four-way mirror at all? |img - flip(img)| against
// |img - shifted(img)|: ~0 for a mirror, ~1 for honest art. A texture that is
// not mirrored has no folds, and must get no correction (it would carve a
// bright cross into the new art), so it is left out of the file.
async function mirrored(file) {
  const S = 256;
  const { data } = await sharp(file).resize(S, S).greyscale().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => data[y * S + x];
  let mh = 0, mv = 0, ref = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    mh += Math.abs(px(x, y) - px(S - 1 - x, y));
    mv += Math.abs(px(x, y) - px(x, S - 1 - y));
    ref += Math.abs(px(x, y) - px((x + S / 3) % S | 0, (y + S / 3) % S | 0));
  }
  return Math.max(mh, mv) / Math.max(1, ref) < 0.25;
}

for (const n of names) {
  const base = `${dir}/${n}/${n}`;
  if (!fs.existsSync(`${base}_albedo.png`)) continue;
  if (!(await mirrored(`${base}_albedo.png`))) { console.log(`${n.padEnd(30)} not mirrored — no correction`); continue; }
  // the FINGERPRINT the correction was measured on: test/ground.test.mjs
  // fails if the albedo on disk is no longer this file, because a correction
  // applied to art it was not measured on is a new artifact, not a fix
  const rec = { bytes: fs.statSync(`${base}_albedo.png`).size };
  const a = await profiles(`${base}_albedo.png`, 0, 'lum');
  rec.W = a.W;
  rec.albedo = [a.x0.taps, a.xh.taps, a.y0.taps, a.yh.taps];
  let line = `${n.padEnd(30)} albedo dip ${[a.x0, a.xh, a.y0, a.yh].map((f) => (f.dip * 100).toFixed(0) + '%').join(' ')}`;
  if (fs.existsSync(`${base}_normal.png`)) {
    const nx = await profiles(`${base}_normal.png`, 0, 'add');
    const ny = await profiles(`${base}_normal.png`, 1, 'add');
    // vertical folds tilt x (R), horizontal folds tilt y (G)
    rec.normal = [nx.x0.taps, nx.xh.taps, ny.y0.taps, ny.yh.taps];
    line += `  normal dip ${[nx.x0, nx.xh, ny.y0, ny.yh].map((f) => (f.dip * 100).toFixed(0) + '%').join(' ')}`;
  }
  if (fs.existsSync(`${base}_rough.png`)) {
    const r = await profiles(`${base}_rough.png`, 1, 'add');
    rec.rough = [r.x0.taps, r.xh.taps, r.y0.taps, r.yh.taps];
  }
  out.textures[n] = rec;
  console.log(line);
}
if (write) {
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(1), 'KB');
}
