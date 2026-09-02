// Measure the PEAK and RMS of every audio asset the game ships, by decoding
// each file in Chromium (the playwright ffmpeg build has no mp3 demuxer, and
// decodeAudioData is what the game itself will use anyway).
//
//   node tools/scratch/audiopeaks.mjs [--json out.json]
import { launch } from '../lib/browser.mjs';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.html': 'text/html' };

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>peaks</title>'); return; }
  try {
    const buf = await readFile(join(ROOT, p.replace(/^\/+/, '')));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const sfxDir = await readdir('public/sfx').catch(() => []);
const musicDir = await readdir('src/music').catch(() => []);
const arenaDir = await readdir('src/music/arenas').catch(() => []);
const files = [
  ...sfxDir.filter((f) => /\.(mp3|wav)$/.test(f)).map((f) => ({ group: f.startsWith('amb_') ? 'ambience' : 'sfx', url: `/public/sfx/${f}`, name: f })),
  ...musicDir.filter((f) => /\.mp3$/.test(f)).map((f) => ({ group: 'music', url: `/src/music/${f}`, name: f })),
  ...arenaDir.filter((f) => /\.mp3$/.test(f)).map((f) => ({ group: 'music', url: `/src/music/arenas/${f}`, name: f })),
  { group: 'menu', url: '/public/sound/Bohemian Cello Flame Hybrid Suite.mp3', name: 'menu theme' },
];

const browser = await launch({ gl: false });
const page = await browser.newPage();
await page.goto(base + '/');
const rows = await page.evaluate(async (list) => {
  const ctx = new OfflineAudioContext(1, 128, 44100);
  const out = [];
  for (const f of list) {
    try {
      const buf = await ctx.decodeAudioData(await (await fetch(f.url)).arrayBuffer());
      let peak = 0, sum = 0, n = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; }
      }
      out.push({ ...f, peak, rms: Math.sqrt(sum / n), secs: buf.duration });
    } catch (e) { out.push({ ...f, error: String(e) }); }
  }
  return out;
}, files);
await browser.close();
server.close();

const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
const groups = ['sfx', 'ambience', 'music', 'menu'];
const summary = {};
for (const g of groups) {
  const rs = rows.filter((r) => r.group === g && !r.error);
  if (!rs.length) continue;
  rs.sort((a, b) => b.peak - a.peak);
  const loudRms = [...rs].sort((a, b) => b.rms - a.rms)[0];
  summary[g] = { n: rs.length, peak: rs[0].peak, peakFile: rs[0].name, rms: loudRms.rms, rmsFile: loudRms.name };
  console.log(`${g.padEnd(9)} n=${String(rs.length).padStart(3)}  peak ${rs[0].peak.toFixed(3)} (${db(rs[0].peak)} dBFS) ${rs[0].name}`);
  console.log(`${''.padEnd(9)}          loudest rms ${loudRms.rms.toFixed(3)} (${db(loudRms.rms)} dBFS) ${loudRms.name}`);
}
const bad = rows.filter((r) => r.error);
if (bad.length) console.log(`\n${bad.length} failed to decode: ${bad.slice(0, 5).map((b) => b.name).join(', ')}`);
const jsonAt = process.argv.indexOf('--json');
if (jsonAt > -1) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(process.argv[jsonAt + 1], JSON.stringify({ summary, rows }, null, 1));
}
