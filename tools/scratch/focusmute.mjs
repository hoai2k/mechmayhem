// ============================================================================
// focusmute.mjs — AN UNFOCUSED WINDOW IS SILENT (boot.js applyAway). The tab
// staying VISIBLE behind another window never fired visibilitychange, so the
// game kept playing. "Away" is now hidden OR unfocused, and it is a GATE: it
// silences every source without touching whether any of them means to play.
//
// A headless page never really loses focus, so the window's blur/focus events
// are dispatched here directly (they are all boot.js listens to), and
// document.hidden is stubbed the same way mutetab.mjs does it.
//
//   node tools/scratch/focusmute.mjs [url]
// ============================================================================
import { launch } from '../lib/browser.mjs';
const url = process.argv[2] || 'http://localhost:5173/';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
const fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${m}`); if (!c) fails.push(m); };
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.addInitScript(() => {
  let hidden = false;
  Object.defineProperty(document, 'hidden', { get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible') });
  window.__hide = (v) => { hidden = !!v; document.dispatchEvent(new Event('visibilitychange')); };
  window.__focus = (v) => window.dispatchEvent(new Event(v ? 'focus' : 'blur'));
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const snap = () => page.evaluate(() => { const g = window.__game;
  return { menuPlaying: g.menuMusic.playing, menuEl: !g.menuMusic.el.paused, menuVol: g.menuMusic.el.volume,
    bPlaying: g.music.playing, bEl: !g.music.el.paused,
    ambPlaying: g.ambience.playing, ambEl: g.ambience.el ? !g.ambience.el.paused : null,
    ctx: g.audio.ctx?.state }; });
const focus = (v) => page.evaluate((v) => window.__focus(v), v);
const hide = (v) => page.evaluate((v) => window.__hide(v), v);
const wait = (ms) => page.waitForTimeout(ms);

await page.click('#mute-btn'); await page.click('#mute-btn');   // a gesture; sound ON
await wait(1500);
let s = await snap();
ok(s.menuEl && s.ctx === 'running', `title: menu theme playing, audio running (${JSON.stringify(s)})`);

// ---- 1. blur on the title ------------------------------------------------
await focus(false); await wait(800); s = await snap();
ok(!s.menuEl, 'blurred: the menu theme is silent');
ok(s.menuPlaying, 'blurred: …but it still MEANS to play (nothing to restart later)');
ok(s.ctx === 'suspended', 'blurred: the audio context is suspended');
// a click/keypress path calling audio.resume() must not wake it while away
await page.evaluate(() => window.__game.audio.resume()); await wait(400); s = await snap();
ok(s.ctx === 'suspended', 'blurred: audio.resume() from elsewhere is refused');

await focus(true); await wait(1200); s = await snap();
ok(s.menuEl && s.menuVol > 0, 'focused again: the menu theme plays');
ok(s.ctx === 'running', 'focused again: the audio context runs');

// ---- 2. a fight: soundtrack + arena bed, and a bed STARTED while away --------
await page.evaluate(() => { const g = window.__game; g.menuMusic.stop(); g.music.start(); g.S.mode = 'battle'; });
await wait(1500);
await focus(false); await wait(600);
await page.evaluate(() => window.__game.ambience.setArena('neon'));   // begins while away
await wait(900); s = await snap();
ok(s.bPlaying && !s.bEl, 'fight blurred: soundtrack silent, still meant to play');
ok(s.ambPlaying && s.ambEl === false, 'a bed started while away waits silently');
ok(s.ctx === 'suspended', 'fight blurred: effects context suspended');
await focus(true); await wait(1500); s = await snap();
ok(s.bEl, 'focused: the soundtrack comes back on its own');
ok(s.ambEl === true, 'focused: the bed that started while away now plays');
ok(!s.menuPlaying, 'focused: no menu theme over the fight');

// ---- 3. muted stays muted through a blur/focus -----------------------------
await page.click('#mute-btn'); await wait(500);
await focus(false); await wait(400); await focus(true); await wait(900); s = await snap();
ok(!s.bEl, 'muted: focus does not bring the soundtrack back');
ok(s.ctx !== 'running', 'muted: focus does not wake the effects');
await page.click('#mute-btn'); await wait(1200); s = await snap();
ok(s.bEl && s.ctx === 'running', 'unmuted: everything back');

// ---- 4. hidden AND unfocused: visible alone is not enough -----------------
await focus(false); await hide(true); await wait(600);
await hide(false); await wait(900); s = await snap();
ok(!s.bEl && s.ctx === 'suspended', 'visible but still unfocused: still silent');
await focus(true); await wait(1500); s = await snap();
ok(s.ctx === 'running', 'focus after showing: the audio context runs again');

console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length || errs.length ? 1 : 0);
