// BADGE PREP — turn a generated emblem on a chroma backdrop into the
// transparent, square, correctly-sized PNG the game wants.
//
//   node tools/badgekey.mjs <in.png> <mechId> [--tol 0.28] [--size 512] [--keep-bg]
//   node tools/badgekey.mjs in.png konga --dry        (report, write nothing)
//
// Image generators do not give you alpha; they give you the badge sitting on a
// flat magenta or green field, and the field bleeds a rim of its own colour
// into every edge pixel. Three things have to happen, in this order, and each
// of them is visible if you skip it:
//
//  1. KEY THE BACKDROP. The key colour is MEASURED, not named — the median of
//     the outer frame of the image — so magenta, green, blue or a grey card
//     all work with no flag. Alpha ramps between two distances from that
//     colour rather than switching at one, which is what stops a circular
//     badge from getting a staircase edge.
//  2. DESPILL. A pixel that was half backdrop keeps half its colour, so a
//     magenta-keyed badge wears a pink halo and a green-keyed one a lime
//     halo — obvious against the dark menu. The key's own direction is
//     subtracted from every partially-keyed pixel, and the edge is left the
//     colour the ART was, which is what makes it sit on any background.
//  3. TRIM AND SQUARE. A generator centres loosely and pads generously; the
//     UI then draws the result at 17-52px with rounded corners, so every
//     wasted pixel of margin is a badge that reads smaller than its
//     neighbours. Crop to what is actually opaque, re-pad to a square with a
//     small even margin, resize.
//
// The output goes to public/badges/<id>.png. Declaring the mech is still a
// separate, deliberate step — add the id to BADGES in src/ui/icons.js — so no
// tool can put art on screen by itself.
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf('--' + n);
  return i < 0 ? d : Number(args[i + 1]);
};
const has = (n) => args.includes('--' + n);
const [src, id] = args.filter((a) => !a.startsWith('--') && !/^[\d.]+$/.test(a));
if (!src || !id) {
  console.error('usage: node tools/badgekey.mjs <in.png> <mechId> [--tol 0.28] [--size 512] [--dry]');
  process.exit(2);
}
if (!existsSync(src)) { console.error(`no such file: ${src}`); process.exit(2); }

const SIZE = flag('size', 512);
const TOL = flag('tol', 0.28);        // distance at which a pixel is FULLY keyed
const SOFT = TOL * 1.9;               // ...and where it becomes fully opaque
const MARGIN = 0.03;                  // padding round the trimmed art, x size

const img = sharp(src).ensureAlpha();
const { width: W, height: H } = await img.metadata();
const { data } = await img.raw().toBuffer({ resolveWithObject: true });

// ---- 1. what IS the backdrop? the median of the outer frame ----------------
const frame = Math.max(2, Math.round(Math.min(W, H) * 0.01));
const rs = [], gs = [], bs = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (x >= frame && x < W - frame && y >= frame && y < H - frame) continue;
    const i = (y * W + x) * 4;
    rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
  }
}
const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
const key = [med(rs), med(gs), med(bs)];
// How uniform that frame is. A photo-like border means there is no chroma
// backdrop at all and keying it would eat the art.
const spread = Math.sqrt(
  rs.reduce((s, v, i) => s + (v - key[0]) ** 2 + (gs[i] - key[1]) ** 2 + (bs[i] - key[2]) ** 2, 0)
  / rs.length) / 255;
const keyLen = Math.hypot(key[0], key[1], key[2]) || 1;

// ---- 2. key + despill ------------------------------------------------------
const out = Buffer.alloc(W * H * 4);
let cut = 0, feather = 0;
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  const r = data[i], g = data[i + 1], b = data[i + 2], a0 = data[i + 3];
  const d = Math.hypot(r - key[0], g - key[1], b - key[2]) / 255;
  let a = d <= TOL ? 0 : d >= SOFT ? 1 : (d - TOL) / (SOFT - TOL);
  let rr = r, gg = g, bb = b;
  if (a > 0 && a < 1) {
    feather++;
    // DESPILL: what is left is (art x a) + (key x (1-a)) — so take the key's
    // contribution back out and renormalise, which recovers the art's own
    // colour instead of leaving a rim of backdrop round every edge.
    rr = Math.max(0, Math.min(255, (r - key[0] * (1 - a)) / a));
    gg = Math.max(0, Math.min(255, (g - key[1] * (1 - a)) / a));
    bb = Math.max(0, Math.min(255, (b - key[2] * (1 - a)) / a));
  } else if (a === 1) {
    // ...and a fully-opaque pixel can still be TINTED by the backdrop's
    // bloom. Only pull down a channel the key dominates, and only where the
    // pixel genuinely leans that way, so real art colour is untouched.
    const proj = (r * key[0] + g * key[1] + b * key[2]) / (keyLen * keyLen);
    if (proj > 0.92 && d < SOFT * 1.35) {
      const k = (SOFT * 1.35 - d) / (SOFT * 1.35) * 0.5;
      const grey = (r + g + b) / 3;
      rr = r + (grey - r) * k; gg = g + (grey - g) * k; bb = b + (grey - b) * k;
    }
  } else cut++;
  out[i] = rr; out[i + 1] = gg; out[i + 2] = bb;
  out[i + 3] = Math.round(a * a0);
}

// ---- 2b. BLEED THE ART OUTWARD under the transparent rim -------------------
// Unpremultiplying recovers the art's colour well while there is enough of it
// left to divide by, and turns to noise as alpha approaches zero: measured on
// a magenta-keyed disc, the faintest rim pixels came back at rgb(231,46,185)
// under alpha 11 — invisible on its own, a pink halo the moment anything
// resizes the image and mixes those pixels into their neighbours. Which is
// exactly what the UI does: this file is drawn at 17-52px.
//
// So paint the colour of the ART into the transparent side of the edge. Each
// pass gives every thin pixel the alpha-weighted colour of its more solid
// neighbours; alpha itself is never touched, so the shape does not grow — only
// the colour hiding under it changes, from "whatever was left of the backdrop"
// to "the same colour as the pixel next door".
for (let pass = 0; pass < 4; pass++) {
  const prev = Buffer.from(out);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (prev[i + 3] >= 250) continue;
      let wr = 0, wg = 0, wb = 0, ww = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = (ny * W + nx) * 4;
          const w = prev[j + 3] / 255;
          if (w <= prev[i + 3] / 255) continue;   // only pull from SOLIDER neighbours
          wr += prev[j] * w; wg += prev[j + 1] * w; wb += prev[j + 2] * w; ww += w;
        }
      }
      if (ww < 1e-6) continue;
      // blend in proportion to how transparent this pixel is: a nearly solid
      // edge keeps its own recovered colour, a ghost takes its neighbour's
      const k = 1 - prev[i + 3] / 255;
      out[i] = prev[i] + (wr / ww - prev[i]) * k;
      out[i + 1] = prev[i + 1] + (wg / ww - prev[i + 1]) * k;
      out[i + 2] = prev[i + 2] + (wb / ww - prev[i + 2]) * k;
    }
  }
}

// ---- 2c. SOLVE THE REAL COVERAGE, now that the art colour is known ---------
// The alpha above is a ramp on DISTANCE FROM THE KEY, which is a guess: it says
// "this pixel is a bit like the backdrop", not "this pixel is 41% covered".
// Unpremultiplying with a guessed alpha leaves the difference behind as
// backdrop colour — measured, an edge pixel that should have come back olive
// came back rgb(215,39,159) at alpha 104, still visibly magenta.
//
// An edge pixel is a straight mix, P = F x a + K x (1 - a), and the bleed pass
// has just told us F (the art colour next door). So the coverage is not a
// guess at all — it is |P - K| / |F - K|, projected onto the line between
// them. Take the colour from F and the alpha from that ratio, and the edge is
// the art's own colour at its true opacity, with no backdrop left in it.
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  const a0 = out[i + 3];
  if (a0 === 0 || a0 >= 250) continue;
  const F = [out[i], out[i + 1], out[i + 2]];
  const fk = [F[0] - key[0], F[1] - key[1], F[2] - key[2]];
  const den = fk[0] * fk[0] + fk[1] * fk[1] + fk[2] * fk[2];
  if (den < 64) continue;                       // art indistinguishable from the key
  const pk = [data[i] - key[0], data[i + 1] - key[1], data[i + 2] - key[2]];
  const a = (pk[0] * fk[0] + pk[1] * fk[1] + pk[2] * fk[2]) / den;
  out[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
}

// ---- 3. trim to the art, square it, resize ---------------------------------
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (out[(y * W + x) * 4 + 3] < 8) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
}
if (x1 < 0) { console.error('everything was keyed away — is --tol too high?'); process.exit(1); }
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const side = Math.max(cw, ch);
const pad = Math.round(side * MARGIN);
const box = side + pad * 2;

const pct = (n) => `${(100 * n / (W * H)).toFixed(1)}%`;
console.log(`in      ${src}  ${W}x${H}`);
console.log(`key     rgb(${key.join(',')})  frame spread ${(spread * 100).toFixed(1)}%`);
console.log(`keyed   ${pct(cut)} cut, ${pct(feather)} feathered`);
console.log(`trim    ${cw}x${ch} at ${x0},${y0} -> ${box}x${box} -> ${SIZE}x${SIZE}`);
if (spread > 0.12) {
  console.log('WARNING: the border is not a flat colour — this may not be a chroma backdrop.');
}
if (cut / (W * H) < 0.02) {
  console.log('WARNING: almost nothing was keyed. Raise --tol, or the image already has alpha.');
}
if (has('dry')) { console.log('(dry run — nothing written)'); process.exit(0); }

mkdirSync('public/badges', { recursive: true });
const dest = `public/badges/${id}.png`;
// TWO PASSES, deliberately: sharp runs its operations in a FIXED order, and
// extend comes after resize whatever order they are chained in — so squaring
// and sizing in one pipeline pads the 512 up to 542 and the icon quietly
// stops being the size it says it is. Square it first, then size the square.
const squared = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: x0, top: y0, width: cw, height: ch })
  .extend({
    top: Math.round((box - ch) / 2), bottom: box - ch - Math.round((box - ch) / 2),
    left: Math.round((box - cw) / 2), right: box - cw - Math.round((box - cw) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();
await sharp(squared)
  .resize(SIZE, SIZE, { fit: 'fill', kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile(dest);
console.log(`wrote   ${dest}`);
console.log(`next    add '${id}' to BADGES in src/ui/icons.js, then: node tools/iconcheck.mjs`);
