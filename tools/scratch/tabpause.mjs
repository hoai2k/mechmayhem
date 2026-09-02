// A backgrounded tab must still pause the FIGHT and must not auto-resume it.
import { launch } from '../lib/browser.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
const fails = []; const ok = (c, m) => { console.log(`${c?'  ok  ':' FAIL '} ${m}`); if (!c) fails.push(m); };
await page.addInitScript(() => { let away = false;
  Object.defineProperty(document, 'hidden', { get: () => away });
  Object.defineProperty(document, 'visibilityState', { get: () => (away ? 'hidden' : 'visible') });
  window.__away = (v) => { away = !!v; document.dispatchEvent(new Event('visibilitychange')); }; });
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.click('#mute-btn'); await page.click('#mute-btn'); await page.waitForTimeout(800);
// stand in for a running fight: the battle player started, as startBattle does
await page.evaluate(() => { window.__game.music.start(); window.__game.S.mode = 'battle'; });
await page.waitForTimeout(2000);
const snap = () => page.evaluate(() => ({ bp: window.__game.music.playing, bpaused: window.__game.music.el.paused,
  mp: window.__game.menuMusic.playing, ctx: window.__game.audio.ctx?.state }));
const away = (v) => page.evaluate((v) => window.__away(v), v);
let s = await snap(); ok(s.bp && !s.bpaused, 'battle music playing');
await away(true); await page.waitForTimeout(1000); s = await snap();
ok(!s.bp && s.bpaused, 'hidden: the soundtrack stops');
ok(s.ctx === 'suspended', 'hidden: the audio context suspends');
await away(false); await page.waitForTimeout(1200); s = await snap();
ok(!s.bp, 'visible again: a PAUSED fight does NOT auto-resume its music');
ok(!s.mp, 'visible again: no menu theme over a battle');
// and with the match left running (results screen / warm-up), it does come
// back. Hidden with paused:true so the stand-in never reaches pauseBattle,
// which wants a real battle; the flag is cleared while away.
await page.evaluate(() => { window.__game.S.battle = { paused: true }; });
await away(true); await page.waitForTimeout(800);
await page.evaluate(() => { window.__game.S.battle.paused = false; });
await away(false); await page.waitForTimeout(1200);
s = await snap(); ok(s.bp && !s.bpaused, 'a match left running gets its soundtrack back');
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
