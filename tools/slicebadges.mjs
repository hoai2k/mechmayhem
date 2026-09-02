// Slice the generated 4x4 badge sheet into public/thumbs/<id>.png (256px),
// roster order, using Chromium canvas (no native image deps needed).
import { launch } from './lib/browser.mjs';
import { readFileSync, writeFileSync } from 'fs';

const IDS = ['titanus', 'vulcan', 'viper', 'rhino',
  'tempest', 'fenrir', 'colossus', 'wraith', 'inferno', 'glacier',
  'cranky', 'saurion', 'frogger', 'jerry'];
const src = process.argv[2];
const b64 = readFileSync(src).toString('base64');
const mime = src.endsWith('.webp') ? 'image/webp' : 'image/png';

const browser = await launch({ gl: false });
const page = await browser.newPage();
const tiles = await page.evaluate(async ({ b64, mime }) => {
  const img = new Image();
  img.src = `data:${mime};base64,${b64}`;
  await img.decode();
  const W = img.width, H = img.height;
  const cw = W / 4, ch = H / 4;
  // full-sheet pixel read for tile-rim detection
  const full = document.createElement('canvas');
  full.width = W; full.height = H;
  const fctx = full.getContext('2d');
  fctx.drawImage(img, 0, 0);
  const px = fctx.getImageData(0, 0, W, H).data;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return px[i] * 0.4 + px[i + 1] * 0.4 + px[i + 2] * 0.2;
  };
  const out = [];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      // bounding box of bright pixels (the tile's glowing rim) in this cell
      const x0 = Math.floor(c * cw), y0 = Math.floor(r * ch);
      const x1 = Math.min(W, Math.ceil((c + 1) * cw)), y1 = Math.min(H, Math.ceil((r + 1) * ch));
      let bx0 = x1, by0 = y1, bx1 = x0, by1 = y0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          if (lum(x, y) > 42) {
            if (x < bx0) bx0 = x;
            if (x > bx1) bx1 = x;
            if (y < by0) by0 = y;
            if (y > by1) by1 = y;
          }
        }
      }
      // square it around the center, small pad of background
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      const s = Math.max(bx1 - bx0, by1 - by0) + 14;
      ctx.fillStyle = '#0a121c';
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s, 0, 0, 256, 256);
      out.push(cv.toDataURL('image/png').split(',')[1]);
    }
  }
  return { out, W, H };
}, { b64, mime });
console.log('sheet', tiles.W, 'x', tiles.H);
tiles.out.forEach((data, i) => {
  writeFileSync(`public/thumbs/${IDS[i]}.png`, Buffer.from(data, 'base64'));
  console.log('sliced:', IDS[i]);
});
await browser.close();
