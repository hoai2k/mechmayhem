// ============================================================================
// mutetab.mjs — MUTE, SWITCH TABS, COME BACK, UNMUTE. The reported bug: the
// music never returns. Hiding the tab pauses every player (playing = false);
// coming back only restored them when NOT muted, so a muted return left the
// menu theme stopped, and unmuting later could not revive it — `playing` was
// false, so neither setMuted nor retry() had anything to start.
//
// A headless page is never really backgrounded, so document.hidden is driven
// here directly: it is the only thing boot.js' handler reads.
//
//   node tools/scratch/mutetab.mjs [url]
// ============================================================================
import { launch } from '../lib/browser.mjs';
const url = process.argv[2] || 'http://localhost:5173/';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
const fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${m}`); if (!c) fails.push(m); };
await page.addInitScript(() => {
  let away = false;
  Object.defineProperty(document, 'hidden', { get: () => away });
  Object.defineProperty(document, 'visibilityState', { get: () => (away ? 'hidden' : 'visible') });
  window.__away = (v) => { away = !!v; document.dispatchEvent(new Event('visibilitychange')); };
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

const snap = () => page.evaluate(() => { const g = window.__game, m = g.menuMusic;
  return { playing: m.playing, paused: m.el.paused, vol: m.el.volume, t: m.el.currentTime, actx: g.audio.ctx?.state }; });
const line = async (l) => { const s = await snap();
  console.log(`  ${l.padEnd(30)} playing=${String(s.playing).padEnd(5)} el=${s.paused ? 'PAUSED' : 'playing'} vol=${s.vol.toFixed(3)} ctx=${s.actx}`); return s; };
const away = (v) => page.evaluate((v) => window.__away(v), v);

await page.click('#mute-btn'); await page.click('#mute-btn');   // a gesture; sound ON
await page.waitForTimeout(1200);
let s = await line('title, sound on');
ok(!s.paused, 'the menu theme is playing');

await page.click('#mute-btn'); await page.waitForTimeout(500);
await line('🔇 muted');

await away(true);  await page.waitForTimeout(1200); await line('tab hidden');
await away(false); await page.waitForTimeout(1200);
s = await line('tab visible again (still muted)');
ok(s.playing, 'the player still means to be playing (it is only silent)');

await page.keyboard.press('Enter'); await page.waitForTimeout(2500);   // -> mech select
await line('mech select');
await page.click('#mute-btn'); await page.waitForTimeout(1500);
s = await line('🔊 unmuted');
ok(!s.paused, 'the music is playing again');
ok(s.vol > 0, `and audible (${s.vol.toFixed(3)})`);
ok(s.actx === 'running', 'the audio context is running, so SFX work too');
const t0 = s.t; await page.waitForTimeout(1200);
ok((await snap()).t > t0, 'the song is actually running');

// and the same thing hidden while ALREADY muted, unmuted while still away
await page.click('#mute-btn'); await away(true); await page.waitForTimeout(800);
await page.click('#mute-btn').catch(() => {});          // unmute while hidden
await away(false); await page.waitForTimeout(1500);
s = await line('unmuted while hidden, back');
ok(!s.paused && s.vol > 0, 'coming back visible plays again');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
