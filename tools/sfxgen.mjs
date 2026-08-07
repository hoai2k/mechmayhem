// ============================================================================
// sfxgen.mjs — generate the recorded sound-FX set from docs/SOUND_PROMPTS.md.
//
// The DOCUMENT IS THE INPUT. Every prompt, take count and duration is parsed
// out of it, so there is no second copy of the prompts to drift: edit the doc,
// re-run this, and what changes is what you changed.
//
//   node tools/sfxgen.mjs --dry-run            # what it would generate, no calls
//   node tools/sfxgen.mjs --tier P0            # just the core combat loop
//   node tools/sfxgen.mjs --only hit,hitHeavy  # named entries
//   node tools/sfxgen.mjs                      # everything still missing
//
// It never re-generates a file that already exists (use --force for that), so
// a run is resumable and costs nothing for what is already on disk.
//
// WHY PCM AND NOT MP3: the API will hand back either, but a repeated sound
// ships as ONE file holding several takes (core/audio.js slices it on silence
// and plays a different take each trigger — see loadSliced/playSlice), and
// stitching, trimming and cross-fading are sample operations. So every take is
// fetched as raw PCM, edited here, and written as a WAV.
//
// ELEVENLABS_API_KEY must be in the environment. Nothing here writes it
// anywhere, and no generated file records it.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const DOC = path.resolve('docs/SOUND_PROMPTS.md');
const OUT = path.resolve('public/sfx');
const API = 'https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_44100';
const SR = 44100;          // what pcm_44100 hands back (16-bit STEREO, downmixed here)
const GAP = 0.3;           // seconds of silence between takes in a multi-take file
const CONCURRENCY = 3;
const MAX_DUR = 30;        // the API's ceiling
const MIN_DUR = 0.5;       // …and its floor, which is why short one-shots are trimmed

// Which mixer category each sound belongs to. The tier gives the default; a
// handful of entries sit in a different group than their neighbours.
const TIER_CATEGORY = {
  P0: 'impact', P1: 'weapon', P2: 'ui', P3: 'ambience', P4: 'surface', P5: 'character',
};
const CATEGORY = {
  jump: 'movement', dash: 'movement', land: 'movement', servo: 'movement',
  footstep: 'movement', footstepRun: 'movement', bodyfall: 'impact',
  explosion: 'destruction', explosionBig: 'destruction', crumble: 'destruction',
  crumbleBig: 'destruction', glassBreak: 'destruction', metalWreck: 'destruction',
  burn_loop: 'loop', shock_loop: 'loop', booster_loop: 'loop',
};

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? null : argv[i + 1]; };
const DRY = flag('dry-run');
const FORCE = flag('force');
const WAV = flag('wav');            // keep the uncompressed intermediate instead
const ONLY = val('only')?.split(',').map((s) => s.trim());
const TIER = val('tier')?.toUpperCase();

// ------------------------------------------------------------------ the doc

/** Pull `{key, title, tier, prompt, takes, dur, loop}` out of SOUND_PROMPTS.md. */
function parseDoc() {
  const md = fs.readFileSync(DOC, 'utf8');
  const lines = md.split('\n');
  const out = [];
  let tier = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].match(/^# (P\d) —/);
    if (t) { tier = t[1]; continue; }
    const h = lines[i].match(/^### \d+\.\s*(.+?)\s*—\s*`file:\s*([A-Za-z0-9_]+)`/);
    if (!h) continue;
    // the prompt is the next fenced block
    const start = lines.indexOf('```', i + 1);
    if (start < 0) continue;
    const end = lines.indexOf('```', start + 1);
    const prompt = lines.slice(start + 1, end).join(' ').replace(/\s+/g, ' ').trim();
    out.push({ key: h[2], title: h[1], tier, prompt, text: promptText(prompt), ...spec(prompt, h[2]) });
    i = end;
  }
  return out;
}

/**
 * What is actually SENT to the model. The doc's prompts carry their delivery
 * spec in prose ("Deliver 8 variations in ONE file… Mono, 48 kHz WAV, peaks
 * near -3 dBFS") because a human reading the doc needs it — but that is an
 * instruction to THIS SCRIPT, not a description of a sound, and the API caps
 * the text at 450 characters. So the logistics sentences are dropped and only
 * the description of the sound itself goes over the wire.
 */
function promptText(prompt) {
  const drop = /^(Deliver \d|One shot,|Mono,|Stereo,|Must loop|Trimmed|Peak)|48 kHz|dBFS|variations in ONE file|separated by about|seconds of silence|audible seam/i;
  const kept = prompt
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !drop.test(s.trim()))
    .join(' ')
    .trim();
  return kept.length > 450 ? `${kept.slice(0, 447).replace(/\s+\S*$/, '')}…` : kept;
}

/**
 * How many takes and how long, read out of the prompt's own wording — the doc
 * states both in prose ("Deliver 8 variations… each 120-200 ms"), and that
 * prose is what the generator is asked to satisfy, so it is also the spec.
 */
function spec(prompt, key) {
  const takes = Number(prompt.match(/Deliver (\d+) variations/i)?.[1] || 1);
  let lo = null; let hi = null;
  let m = prompt.match(/(?:each|One shot,)\s*([\d.]+)-([\d.]+)\s*ms/i);
  if (m) { lo = +m[1] / 1000; hi = +m[2] / 1000; }
  if (!lo) {
    m = prompt.match(/(?:each|One shot,|total)\s*([\d.]+)-([\d.]+)\s*s\b/i)
      || prompt.match(/\b([\d.]+)-([\d.]+)\s*seconds/i);
    if (m) { lo = +m[1]; hi = +m[2]; }
  }
  const want = lo ? (lo + hi) / 2 : 1.0;
  const loop = /Seamless looping/i.test(prompt) || key.startsWith('amb_') || key.endsWith('_loop');
  // A one-shot shorter than the API floor is REQUESTED at the floor and
  // trimmed back here — asking for 0.15s returns an error, not a short sound.
  const dur = Math.min(MAX_DUR, Math.max(MIN_DUR, loop ? Math.min(MAX_DUR, hi || 30) : want));
  return { takes, loop, dur, want, trim: !loop };
}

// --------------------------------------------------------------- the samples

/** s16le stereo bytes -> mono Float32 in -1..1. */
function toMono(buf) {
  const n = Math.floor(buf.length / 4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = buf.readInt16LE(i * 4);
    const r = buf.readInt16LE(i * 4 + 2);
    out[i] = (l + r) / 65536;
  }
  return out;
}

/** Cut leading/trailing near-silence, keeping a few ms of head so no click. */
function trimSilence(x, thresh = 0.004, headMs = 4) {
  let a = 0; let b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < thresh) a++;
  while (b > a && Math.abs(x[b]) < thresh) b--;
  if (a >= b) return x;
  a = Math.max(0, a - Math.round((headMs / 1000) * SR));
  return x.slice(a, Math.min(x.length, b + Math.round(0.02 * SR)));
}

/** Peak-normalize to `peak` (linear), leaving anything already quieter alone. */
function normalize(x, peak = 0.7) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m < 1e-6) return x;
  const g = peak / m;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/** Short fade in/out so a cut take never clicks. */
function fadeEnds(x, ms = 4) {
  const n = Math.min(Math.round((ms / 1000) * SR), x.length >> 1);
  for (let i = 0; i < n; i++) { x[i] *= i / n; x[x.length - 1 - i] *= i / n; }
  return x;
}

/** Takes + silence -> one buffer the audio engine can slice back apart. */
function stitch(takes) {
  const gap = Math.round(GAP * SR);
  const total = takes.reduce((n, t) => n + t.length, 0) + gap * (takes.length - 1);
  const out = new Float32Array(total);
  let o = 0;
  for (let i = 0; i < takes.length; i++) {
    out.set(takes[i], o);
    o += takes[i].length + gap;
  }
  return out;
}

/**
 * Turn a one-off recording into a seamless loop: take the last `xf` seconds,
 * cross-fade them (equal power) over the first `xf`, and drop the tail. The
 * result joins to itself with no seam — which the model does not give you and
 * every ambient bed needs.
 */
function loopify(x, xf = 2.0) {
  const n = Math.round(xf * SR);
  if (x.length < n * 3) return x;
  const out = x.slice(0, x.length - n);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const a = Math.cos(k * Math.PI / 2);      // outgoing head
    const b = Math.sin(k * Math.PI / 2);      // incoming tail
    out[i] = out[i] * b + x[x.length - n + i] * a;
  }
  return out;
}

/** Cheap integer-factor downsample (box filter) — plenty for an ambient bed. */
function downsample(x, factor) {
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += x[i * factor + k];
    out[i] = s / factor;
  }
  return out;
}

/**
 * WAV -> MP3, because the set is 40MB as WAV and a tenth of that as MP3, and
 * every one of these files is fetched over the wire by a browser. Mono, and
 * modest bitrates: these are half-second impacts, not music.
 *
 * The gaps between takes survive encoding — the slicer's floor is the RMS
 * MEDIAN of the file times three, so codec noise thousands of times quieter
 * than a hit never reads as an event.
 */
async function toMp3(x, rate, kbps) {
  const { Mp3Encoder } = (await import('@breezystack/lamejs')).default;
  const enc = new Mp3Encoder(1, rate, kbps);
  const pcm = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, x[i])) * 32767)));
  }
  const out = [];
  const BLOCK = 1152 * 8;
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const buf = enc.encodeBuffer(pcm.subarray(i, Math.min(i + BLOCK, pcm.length)));
    if (buf.length) out.push(Buffer.from(buf));
  }
  const end = enc.flush();
  if (end.length) out.push(Buffer.from(end));
  return Buffer.concat(out);
}

/** Read one of our own WAVs back (mono 16-bit) — the transcode path. */
function readWavFile(file) {
  const b = fs.readFileSync(file);
  let off = 12; let rate = SR; let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(off + 12);
    if (id === 'data') { data = b.subarray(off + 8, off + 8 + size); break; }
    off += 8 + size + (size & 1);
  }
  const n = Math.floor(data.length / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  return { x, rate };
}

function writeWav(file, x, rate) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return buf.length;
}

// ------------------------------------------------------------------- the api

async function generate(text, seconds, influence = 0.45) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: influence }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) {      // transient: back off
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`${res.status} ${body.slice(0, 200)}`);
  }
  throw new Error('gave up after retries');
}

// ---------------------------------------------------------------- the driver

async function build(entry) {
  const file = path.join(OUT, `${entry.key}.wav`);
  const out = WAV ? file : file.replace(/\.wav$/, '.mp3');
  if (!FORCE && fs.existsSync(out)) return { ...entry, skipped: true };

  const takes = [];
  for (let i = 0; i < entry.takes; i++) {
    const pcm = await generate(entry.text, entry.dur);
    let x = toMono(pcm);
    if (entry.trim) x = trimSilence(x);
    x = fadeEnds(normalize(x, entry.loop ? 0.5 : 0.7));
    takes.push(x);
  }

  let x = takes.length > 1 ? stitch(takes) : takes[0];
  let rate = SR;
  if (entry.loop) {
    x = loopify(x);
    x = downsample(x, 2);          // a bed does not need 44.1k; the file halves
    rate = SR / 2;
  }
  // MP3 unless --wav: same audio, a tenth of the bytes over the wire
  let bytes;
  let ext = 'wav';
  if (WAV) bytes = writeWav(file, x, rate);
  else {
    const mp3 = await toMp3(x, rate, entry.loop ? 64 : 96);
    fs.writeFileSync(file.replace(/\.wav$/, '.mp3'), mp3);
    bytes = mp3.length; ext = 'mp3';
  }
  return {
    ...entry, bytes, ext, seconds: +(x.length / rate).toFixed(2), sliced: entry.takes > 1,
  };
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx]); } catch (e) {
        out[idx] = { ...items[idx], error: String(e.message || e) };
      }
    }
  }));
  return out;
}

// --transcode: encode the WAVs already on disk and drop them. Separate from a
// generate run because the audio is the expensive part — a format change must
// never mean paying for the sounds again.
if (flag('transcode')) {
  let before = 0; let after = 0;
  for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.wav'))) {
    const wav = path.join(OUT, f);
    const { x, rate } = readWavFile(wav);
    const mp3 = await toMp3(x, rate, rate < 30000 ? 64 : 96);
    fs.writeFileSync(wav.replace(/\.wav$/, '.mp3'), mp3);
    before += fs.statSync(wav).size; after += mp3.length;
    fs.unlinkSync(wav);
    console.log(`  ${f.padEnd(22)} ${(fs.statSync(wav.replace(/\.wav$/, '.mp3')).size / 1024).toFixed(0).padStart(5)}KB`);
  }
  console.log(`\n${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB`);
}

const all = parseDoc();
let work = all;
if (TIER) work = work.filter((e) => e.tier === TIER);
if (ONLY) work = work.filter((e) => ONLY.includes(e.key));

const has = (k) => ['mp3', 'wav'].some((x) => fs.existsSync(path.join(OUT, `${k}.${x}`)));
const calls = work.reduce((n, e) => n + (FORCE || !has(e.key) ? e.takes : 0), 0);
console.log(`${all.length} entries in the doc · ${work.length} selected · ${calls} API calls`);
if (DRY) {
  for (const e of work) {
    console.log(`  ${e.tier} ${e.key.padEnd(16)} takes=${String(e.takes).padStart(2)} dur=${e.dur}s`
      + `${e.loop ? ' LOOP' : ''} chars=${String(e.text.length).padStart(3)}  ${e.title}`);
  }
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const done = await pool(work, CONCURRENCY, build);
let ok = 0; let failed = 0; let skipped = 0; let total = 0;
for (const r of done) {
  if (r.skipped) { skipped++; continue; }
  if (r.error) { failed++; console.log(`  FAIL ${r.key}: ${r.error}`); continue; }
  ok++; total += r.bytes;
  console.log(`  ok   ${r.key.padEnd(16)} ${String(r.seconds).padStart(6)}s `
    + `${(r.bytes / 1024).toFixed(0).padStart(5)}KB${r.sliced ? ` (${r.takes} takes)` : ''}`);
}
console.log(`\n${ok} written, ${skipped} already there, ${failed} failed, ${(total / 1048576).toFixed(1)}MB`);

// The MANIFEST is what the game reads: which sounds have a recording, whether
// the file holds several takes, and which mixer category each one is in.
// Written from the DOC + what is on disk, so it can never claim a missing file.
const manifest = {};
for (const e of all) {
  const ext = ['mp3', 'wav'].find((x) => fs.existsSync(path.join(OUT, `${e.key}.${x}`)));
  if (!ext) continue;
  manifest[e.key] = {
    file: `${e.key}.${ext}`,
    category: CATEGORY[e.key] || TIER_CATEGORY[e.tier] || 'impact',
    sliced: e.takes > 1,
    loop: e.loop,
  };
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`manifest: ${Object.keys(manifest).length} sounds`);
