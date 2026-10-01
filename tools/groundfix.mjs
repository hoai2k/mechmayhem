// GROUND ART REPAIR — fixes three defects measured in the ground pack
// delivered 2026-10-01 (docs/ground-material-generation.json), in place.
//
//   node tools/groundfix.mjs [--check] [name …]
//
// --check measures and prints, writes nothing. Each pass is idempotent: run
// twice, the second run finds nothing to do.
//
// 1. THE WRAP SEAM. The art was generated at 1254² and Lanczos-resized to
//    2048² with the image EDGE CLAMPED rather than wrapped, so the outer one or
//    two texels were filtered against a copy of themselves instead of against
//    the opposite edge. Everything two texels in matches across the wrap (the
//    source WAS seamless), but the step across the border itself measured 1.7-
//    4.6x a typical step inside the image, on every map of every material — a
//    faint ruled line along every tile edge, visible up close. Repaired per row
//    (and per column): the mismatch beyond the local gradient is closed half
//    from each side, ramped out over BAND texels, so the texture's own detail
//    in the strip survives and only the EXCESS step goes (what is left is the
//    size of every other step in the image, not zero — see healSeam).
// 2. NORMAL BIAS. A flat floor's average normal is straight up; several maps
//    averaged 5-8/255 off in R or G, which lights the WHOLE ground as if it
//    were tilted 3-4°. Recentred (mean R, G -> 128).
// 3. ROUGHNESS LEVEL. The roughness maps came back systematically smoother
//    than their own prompts asked for (volcano basalt "matte 210-240" measured
//    122, jungle stone/moss "185-245" 138, dirt "220-245" 158) — which is what
//    put a wet glare on moss and ash. Where a material's median is below the
//    requested range of its DOMINANT material it is shifted so the median
//    lands on that range's middle; the map's own contrast is kept. Materials
//    with no recorded target, or already in range, are left alone.
import sharp from 'sharp';
import fs from 'node:fs';

const DIR = 'src/textures/ground';
const BAND = 8;
const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.filter((a) => !a.startsWith('--'));

// median roughness (0-255, green) asked for by each prompt's dominant material
const ROUGH_TARGET = {
  ground_uptown_paving: 215, ground_uptown_paving_b: 207,
  ground_harbor_concrete: 212,
  ground_skyterrace_roofpanel: 202, ground_skyterrace_roofpanel_b: 200,
  ground_scrapyard_dirt: 232, ground_scrapyard_dirt_b: 150,
  ground_quarry_rock: 217, ground_quarry_rock_b: 225,
  ground_volcano_basalt: 225, ground_volcano_basalt_b: 235,
  ground_frozen_snowice: 222, ground_frozen_snowice_b: 100,   // the companion is glazed ICE
  ground_ruins_sandstone: 217, ground_ruins_sandstone_b: 235,
  ground_jungle_mossstone: 205, ground_jungle_mossstone_b: 180,
  ground_orbital_deck_b: 177,
};
// only correct a median that is off by more than this (levels)
const ROUGH_TOL = 12;

async function load(f) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { px: Float32Array.from(data), W: info.width, H: info.height, C: info.channels };
}
async function save(f, { px, W, H, C }) {
  const out = Buffer.alloc(px.length);
  for (let i = 0; i < px.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(px[i])));
  await sharp(out, { raw: { width: W, height: H, channels: C } }).png({ compressionLevel: 9 }).toFile(f + '.tmp');
  fs.renameSync(f + '.tmp', f);
}

// mean |step| across the wrap edge vs across interior column/row boundaries
function seamRatio({ px, W, H, C }) {
  const at = (x, y) => px[(((y + H) % H) * W + ((x + W) % W)) * C + 1];
  const col = (x) => { let s = 0; for (let y = 0; y < H; y += 2) s += Math.abs(at(x, y) - at(x + 1, y)); return s; };
  const row = (y) => { let s = 0; for (let x = 0; x < W; x += 2) s += Math.abs(at(x, y) - at(x, y + 1)); return s; };
  let ic = 0, ir = 0, k = 0;
  for (let i = 100; i < W - 100; i += 37) { ic += col(i); ir += row(i); k++; }
  return [col(W - 1) / (ic / k), row(H - 1) / (ir / k)];
}

// close the step across x = W-1 | 0 on every row (axis 'x'), or y on every column
// `f` is the share of the step to remove: 1 - 1/ratio, so what is left is a
// step the SIZE of every other one in the image. Closing it fully leaves a
// line too smooth to match its neighbours (measured 0.45x), which is a seam
// the other way round.
function healSeam(img, axis, f) {
  const { px, W, H, C } = img;
  const n = axis === 'x' ? W : H, lines = axis === 'x' ? H : W;
  const idx = axis === 'x' ? (i, l) => (l * W + i) * C : (i, l) => (i * W + l) * C;
  for (let l = 0; l < lines; l++) {
    for (let c = 0; c < C; c++) {
      const v = (i) => px[idx(((i % n) + n) % n, l) + c];
      // the step beyond what the local gradient on either side predicts
      const slope = ((v(n - 1) - v(n - 3)) / 2 + (v(2) - v(0)) / 2) / 2;
      const s = f * (v(0) - v(n - 1) - slope);
      for (let k = 0; k < BAND; k++) {
        const w = 0.5 * (1 - k / BAND);
        px[idx(n - 1 - k, l) + c] += s * w;
        px[idx(k, l) + c] -= s * w;
      }
    }
  }
}

function channelMedian({ px, C }, c) {
  const h = new Uint32Array(256);
  for (let i = c; i < px.length; i += C) h[Math.max(0, Math.min(255, Math.round(px[i])))]++;
  let acc = 0; const half = px.length / C / 2;
  for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= half) return v; }
  return 255;
}
function channelMean({ px, C }, c) {
  let s = 0; for (let i = c; i < px.length; i += C) s += px[i];
  return s / (px.length / C);
}

const names = fs.readdirSync(DIR).filter((n) => n.startsWith('ground_')
  && (!only.length || only.includes(n))).sort();
for (const n of names) {
  const maps = fs.readdirSync(`${DIR}/${n}`).filter((f) => f.endsWith('.png')).sort();
  const notes = [];
  for (const file of maps) {
    const f = `${DIR}/${n}/${file}`;
    const map = file.slice(n.length + 1, -4);
    const img = await load(f);
    let dirty = false;
    const [sx, sy] = seamRatio(img);
    // an emissive map is nearly all black, so its ratio is a handful of lit
    // cracks crossing the border or not — noise, judged more loosely
    const tol = map === 'emissive' ? 1.6 : 1.3;
    if (sx > tol || sy > tol) {
      if (!check) {
        healSeam(img, 'x', Math.max(0, 1 - 1 / sx));
        healSeam(img, 'y', Math.max(0, 1 - 1 / sy));
        dirty = true;
      }
      const after = check ? '' : `→${seamRatio(img).map((v) => v.toFixed(2)).join('/')}`;
      notes.push(`${map} seam ${sx.toFixed(2)}/${sy.toFixed(2)}${after}`);
    }
    if (map === 'normal') {
      const dr = 128 - channelMean(img, 0), dg = 128 - channelMean(img, 1);
      if (Math.abs(dr) > 1.5 || Math.abs(dg) > 1.5) {
        notes.push(`normal bias ${(-dr).toFixed(1)},${(-dg).toFixed(1)}`);
        if (!check) {
          for (let i = 0; i < img.px.length; i += img.C) { img.px[i] += dr; img.px[i + 1] += dg; }
          dirty = true;
        }
      }
    }
    if (map === 'rough' && ROUGH_TARGET[n] != null) {
      const med = channelMedian(img, 1), d = ROUGH_TARGET[n] - med;
      if (Math.abs(d) > ROUGH_TOL) {
        notes.push(`rough median ${med}→${ROUGH_TARGET[n]}`);
        if (!check) { for (let i = 0; i < img.px.length; i++) img.px[i] += d; dirty = true; }
      }
    }
    if (dirty) await save(f, img);
  }
  console.log(`${n.padEnd(30)} ${notes.length ? notes.join(' · ') : 'clean'}`);
}
