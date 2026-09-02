// ============================================================================
// musicoff.mjs — MUSIC TURNED OFF MUST COME BACK ON. The settings MUSIC
// VOLUME slider is the only music on/off control there is, and it silences an
// <audio> element by pausing it; nothing used to start it again, so the music
// only returned when a stray click or keypress happened to run retry() —
// which a GAMEPAD never produces. Driven with no gesture between the two
// slider moves, which is exactly the pad case.
//
//   node tools/scratch/musicoff.mjs [url]
// ============================================================================
import { launch } from '../lib/browser.mjs';
const url = process.argv[2] || 'http://localhost:5173/';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${m}`); if (!c) fails.push(m); };
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.click('#mute-btn'); await page.click('#mute-btn');   // one gesture: past autoplay policy
await page.waitForTimeout(1200);

const snap = () => page.evaluate(() => {
  const g = window.__game, m = g.menuMusic;
  return { mode: g.S.mode, playing: m.playing, track: !!m.track, paused: m.el.paused, vol: m.el.volume, t: m.el.currentTime };
});
const line = (l, s) => console.log(`  ${l.padEnd(34)} el=${s.paused ? 'PAUSED' : 'playing'} vol=${s.vol.toFixed(3)} t=${s.t.toFixed(2)}`);
// the exact calls the MUSIC VOLUME row makes
const slide = (v) => page.evaluate((v) => { window.__game.music.setVolume(v); window.__game.menuMusic.setVolume(v); }, v);

let s = await snap(); line('title, music on', s);
ok(!s.paused, 'the menu theme is playing to start with');

await slide(0); await page.waitForTimeout(600);
s = await snap(); line('music volume dragged to 0', s);
ok(s.paused && s.vol === 0, 'silenced: the element is paused at 0');

// NO click and NO keypress from here on: every gesture runs resumeAudio ->
// retry(), which un-pauses the element by itself and hides the bug. A pad
// produces neither, which is how a controller player meets it.
await page.waitForTimeout(2000);
s = await snap(); line('…2s later, still off', s);
ok(s.paused, 'it stays paused while it is silent');
const before = s.t;
await slide(0.32); await page.waitForTimeout(1500);
s = await snap(); line('volume back up', s);
ok(!s.paused, 'the element is playing again');
ok(s.vol > 0, `it is audible (${s.vol.toFixed(3)})`);
ok(s.t > before, `and the song is actually running (${before.toFixed(2)} -> ${s.t.toFixed(2)})`);

// the 🔊 button, same rule
await page.click('#mute-btn'); await page.waitForTimeout(500);
s = await snap(); line('🔊 off', s);
ok(s.paused, 'SOUND OFF pauses it');
await page.click('#mute-btn'); await page.waitForTimeout(1200);
s = await snap(); line('🔊 on', s);
ok(!s.paused && s.vol > 0, 'SOUND ON brings it back');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
