// The weather's SOUND (core/audio.js weatherSound), measured rather than
// listened to: a real AudioContext, an analyser tapped on the ambient bus, the
// level read back for each state — and the dead man's switch: stop refreshing
// it and it must fall silent by itself.
//   node tools/scratch/weatheraudio.mjs
import { launch } from '../lib/browser.mjs';
const browser = await launch({ gl: false, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?music=0', { waitUntil: 'load' });
const r = await page.evaluate(async () => {
  const { GameAudio } = await import('/src/core/audio.js');
  const a = new GameAudio();
  a.resume();
  await new Promise((res) => setTimeout(res, 300));
  const ctx = a.ctx;
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  a._ambBus.connect(an);
  const buf = new Float32Array(an.fftSize);
  const rms = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
  const hold = async (lv, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { a.weatherSound(lv); await new Promise((res) => setTimeout(res, 16)); }
    return rms();
  };
  const out = { state: ctx.state };
  out.silent = await hold({}, 600);
  out.drizzle = await hold({ rain: 0.15, wind: 0.2, gust: 0.1 }, 900);
  out.storm = await hold({ rain: 1, wind: 0.8, gust: 0.8 }, 900);
  out.sand = await hold({ sand: 1, wind: 0.9, gust: 0.7 }, 900);
  // stop refreshing: the dead man's switch
  await new Promise((res) => setTimeout(res, 1600));
  out.afterStop = rms();
  return out;
});
for (const [k, v] of Object.entries(r)) console.log(k.padEnd(9), typeof v === 'number' ? v.toFixed(4) : v);
const ok = r.state === 'running' && r.silent < 1e-4 && r.drizzle > 1e-3 && r.storm > r.drizzle * 1.5 && r.sand > 1e-3 && r.afterStop < r.storm * 0.05;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
