// ============================================================================
// headroom.mjs — HOW LOUD CAN THE GAME GO before it clips, and by how much
// may every level be raised WITHOUT changing a single ratio.
//
// It measures rather than reasons: each asset is decoded in Chromium, the
// loudest sounds are rendered through a REPLICA of core/audio.js' output
// chain (the same compressor into the same master gain), and the media
// elements the master never touches — the soundtrack and the arena bed — are
// added on top at their own gains, because the browser sums all of it into
// one device.
//
//   node tools/scratch/headroom.mjs [--peaks peaks.json] [--ceiling 1.0]
// ============================================================================
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { CONFIG, SOUND_MASTER, OUTPUT_TRIM } from '../../src/core/config.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const CEIL = Number(arg('--ceiling', '1.0'));
const peaks = JSON.parse(await readFile(arg('--peaks', 'peaks.json'), 'utf8'));
const bank = JSON.parse(await readFile('public/sfx/manifest.json', 'utf8'));

// name -> category, from the shipped manifest
const catOf = {};
for (const [name, e] of Object.entries(bank)) catOf[e.file] = e.category || 'impact';

const SAMPLES = CONFIG.sfxVolume.samples;
const gainOf = (file) => SAMPLES * (CONFIG.sfxMix[catOf[file]] ?? 1);

// Every sfx file, ranked by what it is worth AT THE BUS: file peak x its own
// mixer chain. That is the order a pile-up would be built from.
const sfx = peaks.rows
  .filter((r) => r.group === 'sfx' && !r.error && catOf[r.name])
  .map((r) => ({ ...r, gain: gainOf(r.name), busPeak: r.peak * gainOf(r.name) }))
  .sort((a, b) => b.busPeak - a.busPeak);

const music = peaks.rows.filter((r) => r.group === 'music' && !r.error).sort((a, b) => b.peak - a.peak)[0];
const amb = peaks.rows.filter((r) => r.group === 'ambience' && !r.error).sort((a, b) => b.peak - a.peak)[0];

const TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.html': 'text/html' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>headroom</title>'); return; }
  try {
    const buf = await readFile(join(process.cwd(), p.replace(/^\/+/, '')));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const STACKS = [1, 2, 3, 4, 6, 8, 12];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(base + '/');

// How far the SFX slider could physically be pushed: the multiplier on
// sfxVolume at which the LOUDEST SINGLE effect reaches full scale through the
// real chain. The compressor makes that anything but linear, so it is found by
// bisection rather than divided out.
const solo = await page.evaluate(async ({ one, trim, soundMaster }) => {
  const ctx0 = new OfflineAudioContext(1, 128, 44100);
  const buf = await ctx0.decodeAudioData(await (await fetch(one.url)).arrayBuffer());
  const render = async (gain) => {
    const ctx = new OfflineAudioContext(1, Math.ceil((buf.duration + 0.5) * 44100), 44100);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 14;
    comp.attack.value = 0.002; comp.release.value = 0.22;
    const master = ctx.createGain(); master.gain.value = 0.9 * trim;
    comp.connect(master); master.connect(ctx.destination);
    const bus = ctx.createGain(); bus.gain.value = soundMaster; bus.connect(comp);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(bus); src.start(0);
    const r = await ctx.startRendering();
    let p = 0; const d = r.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
    return p;
  };
  const at1 = await render(one.gain);
  let lo = 1, hi = 64, hiPeak = await render(one.gain * hi);
  if (hiPeak < 1) return { at1, mult: null, hiPeak };
  for (let i = 0; i < 20; i++) {
    const mid = Math.sqrt(lo * hi);
    if ((await render(one.gain * mid)) < 1) lo = mid; else hi = mid;
  }
  return { at1, mult: (lo + hi) / 2 };
}, { one: { url: '/public/sfx/' + sfx[0].name, gain: sfx[0].gain }, trim: OUTPUT_TRIM, soundMaster: SOUND_MASTER });

const busOut = await page.evaluate(async ({ list, stacks, trim, soundMaster }) => {
  const ctx0 = new OfflineAudioContext(1, 128, 44100);
  const bufs = [];
  for (const s of list) bufs.push({ ...s, buf: await ctx0.decodeAudioData(await (await fetch(s.url)).arrayBuffer()) });
  const out = [];
  for (const n of stacks) {
    const use = bufs.slice(0, n);
    const secs = Math.max(2, ...use.map((u) => u.buf.duration)) + 0.5;
    const ctx = new OfflineAudioContext(2, Math.ceil(secs * 44100), 44100);
    // --- replica of core/audio.js' output chain ---
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 14;
    comp.attack.value = 0.002; comp.release.value = 0.22;
    const master = ctx.createGain();
    master.gain.value = 0.9 * trim;
    comp.connect(master); master.connect(ctx.destination);
    const bus = ctx.createGain(); bus.gain.value = soundMaster; bus.connect(comp);
    for (const u of use) {
      const src = ctx.createBufferSource(); src.buffer = u.buf;
      const g = ctx.createGain(); g.gain.value = u.gain;
      src.connect(g); g.connect(bus); src.start(0);       // worst case: all at once
    }
    const r = await ctx.startRendering();
    let peak = 0;
    for (let c = 0; c < r.numberOfChannels; c++) {
      const d = r.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    }
    out.push({ n, peak, names: use.map((u) => u.name) });
  }
  return out;
}, { list: sfx.slice(0, Math.max(...STACKS)).map((s) => ({ url: '/public/sfx/' + s.name, name: s.name, gain: s.gain })), stacks: STACKS, trim: OUTPUT_TRIM, soundMaster: SOUND_MASTER });
await browser.close();
server.close();

const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
// both media elements carry the trim themselves (music.js / ambience.js), capped at 1
const musicOut = music.peak * Math.min(1, CONFIG.musicVolume * OUTPUT_TRIM);
const ambOut = amb.peak * Math.min(1, SOUND_MASTER * CONFIG.sfxVolume.samples * CONFIG.sfxMix.ambience * OUTPUT_TRIM);

console.log('LOUDEST SFX AT THE BUS (file peak x sfxVolume x category)');
for (const s of sfx.slice(0, 6)) console.log(`  ${s.name.padEnd(22)} ${catOf[s.name].padEnd(12)} file ${s.peak.toFixed(3)} -> bus ${s.busPeak.toFixed(3)}`);

console.log('\nSFX BUS THROUGH THE REAL CHAIN (compressor -> master 0.9)');
for (const r of busOut) console.log(`  ${String(r.n).padStart(2)} at once  peak ${r.peak.toFixed(3)} (${db(r.peak)} dBFS)`);

const sfxOut = busOut[busOut.length - 1].peak;
const sfx1 = busOut[0].peak;
console.log('\nWHAT REACHES THE DEVICE, TODAY');
console.log(`  soundtrack  ${musicOut.toFixed(3)} (${db(musicOut)} dBFS)   [${music.name} peak ${music.peak.toFixed(3)} x musicVolume ${CONFIG.musicVolume} x trim ${OUTPUT_TRIM}]`);
console.log(`  arena bed   ${ambOut.toFixed(3)} (${db(ambOut)} dBFS)   [${amb.name} peak ${amb.peak.toFixed(3)}]`);
console.log(`  sfx, one    ${sfx1.toFixed(3)} (${db(sfx1)} dBFS)`);
console.log(`  sfx, pile   ${sfxOut.toFixed(3)} (${db(sfxOut)} dBFS)   [${busOut[busOut.length - 1].n} of the loudest, simultaneous]`);

const total = musicOut + ambOut + sfxOut;
console.log(`  SUM         ${total.toFixed(3)} (${db(total)} dBFS)  <- the number the ceiling applies to`);

const kClip = CEIL / total;
const kMusic = 1 / (CONFIG.musicVolume * OUTPUT_TRIM);   // a media element's gain cannot exceed 1
const kAmb = 1 / (CONFIG.sfxVolume.samples * CONFIG.sfxMix.ambience * OUTPUT_TRIM);
const k = Math.min(kClip, kMusic, kAmb);
console.log('\nHOW FAR ONE SOURCE COULD BE PUSHED ALONE (the slider ranges)');
console.log(`  sfx    loudest single effect ${solo.at1.toFixed(3)} -> full scale at x${solo.mult ? solo.mult.toFixed(2) : '>64'} of sfxVolume`);
console.log(`  music  element gain 1.0 at x${(1 / (CONFIG.musicVolume * OUTPUT_TRIM)).toFixed(2)} of musicVolume`);

console.log('\nHOW MUCH ROOM IS LEFT (uniform, so every ratio is untouched)');
console.log(`  clipping at ${CEIL.toFixed(2)}   x${kClip.toFixed(3)}  (+${(20 * Math.log10(kClip)).toFixed(1)} dB)`);
console.log(`  soundtrack element hits 1.0   x${kMusic.toFixed(3)}  (+${(20 * Math.log10(kMusic)).toFixed(1)} dB)`);
console.log(`  arena-bed element hits 1.0    x${kAmb.toFixed(3)}`);
console.log(`  => k = ${k.toFixed(3)} (+${(20 * Math.log10(k)).toFixed(1)} dB), bound by ${k === kClip ? 'CLIPPING' : k === kMusic ? 'the soundtrack element' : 'the arena bed element'}`);
console.log(`\n  OUTPUT_TRIM  ${OUTPUT_TRIM} -> ${(OUTPUT_TRIM * k).toFixed(3)} to spend it exactly`);
console.log('  (k within a few % of 1.000 means the shipped numbers are already at the ceiling)');
