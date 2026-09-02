// Fit a hand-made image into the roster-thumb look: square 340×340 (what
// tools/thumbs.mjs captures for every rendered mech portrait) with a
// radial vignette falling to the showcase backdrop colour, so a painted
// badge's edges sit in the grid exactly like a rendered one.
//
//   node tools/thumbfx.mjs <in.png> <out.png> [size]
//
// The backdrop colour is sampled from the real thumbs: their corners are a
// near-black navy, rgb(0,7,21), lifting slightly toward the middle of each
// edge. Matching it is what makes the cell borders line up visually.
import { launch } from './lib/browser.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';

const [src, out, sizeArg] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node tools/thumbfx.mjs <in.png> <out.png> [size]');
  process.exit(1);
}
const SIZE = Number(sizeArg) || 340;
const BACKDROP = [0, 7, 21];

const dataUrl = 'data:image/png;base64,' + readFileSync(src).toString('base64');
const browser = await launch({ gl: false });
const page = await browser.newPage();
const png = await page.evaluate(async ({ dataUrl, SIZE, BACKDROP }) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  // backdrop first, so any transparency in the source lands on it
  const [r, g, b] = BACKDROP;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // cover-fit the source (crop the long side, never letterbox)
  const s = Math.max(SIZE / img.width, SIZE / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);

  // vignette: clear through the middle, full backdrop by the corners, so
  // the frame edge reads as the same void the rendered portraits sit in
  // (the ramp is measured against the frame: the middle of an edge sits at
  // r = 0.5·SIZE and must already be backdrop, or the cell borders clash)
  const grd = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.20, SIZE / 2, SIZE / 2, SIZE * 0.50);
  for (const [stop, a] of [[0, 0], [0.25, 0.2], [0.5, 0.64], [0.75, 0.93], [1, 1]]) {
    grd.addColorStop(stop, `rgba(${r},${g},${b},${a})`);
  }
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, SIZE, SIZE);

  return cv.toDataURL('image/png').split(',')[1];
}, { dataUrl, SIZE, BACKDROP });
await browser.close();

writeFileSync(out, Buffer.from(png, 'base64'));
console.log(`${basename(out)}: ${SIZE}×${SIZE}, ${(Buffer.from(png, 'base64').length / 1024).toFixed(1)} kB`);
