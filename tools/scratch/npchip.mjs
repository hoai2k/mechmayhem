// THE NOW-PLAYING CHIP'S TRANSPORT, driven with a real mouse.
//
//   node tools/scratch/npchip.mjs [http://localhost:5173] [out.png]
//
// The soundtrack needs real audio files to have anything to skip between, so
// the checks that need a rotation are skipped (loudly) when src/music/ is
// empty — the layout and the hover animation are still asserted.
import { launch } from '../lib/browser.mjs';

const BASE = process.argv[2] || 'http://localhost:5173';
const SHOT = process.argv[3] || '/tmp/npchip.png';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 200)));

let fails = 0, skips = 0;
const ok = (label, cond, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};
const skip = (label, why) => { console.log(`  skip ${label}  (${why})`); skips++; };

// The chip belongs to the REAL game page (boot.js), not the ?battle= harness
// — that route builds a fight without a soundtrack — so this loads the title.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.music, null, { timeout: 180000 });
await page.waitForSelector('#now-playing', { state: 'attached', timeout: 60000 });

// The chip hides itself while the music layer has no songs; force it on so
// the LAYOUT is always testable, and report whether a rotation exists.
const hasSongs = await page.evaluate(() => {
  const np = document.getElementById('now-playing');
  np.style.display = '';
  return !!window.__game.music?.available;
});
console.log(`  (rotation available: ${hasSongs})`);

// Read the layout AND the hover state in one evaluate. The chip hides itself
// off-battle, so this test forces it on — and a read that raced that had the
// cursor land on a display:none chip and report the transport shut.
const geom = () => page.evaluate(() => {
  const np = document.getElementById('now-playing');
  np.style.display = '';
  const r = (sel) => {
    const e = np.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: Math.round(b.left), w: Math.round(b.width), cx: Math.round(b.left + b.width / 2) };
  };
  const b = np.getBoundingClientRect();
  return { chip: { x: Math.round(b.left), w: Math.round(b.width), cx: Math.round(b.left + b.width / 2) },
    icon: r('.np-icon'), prev: r('.np-btn'), label: r('.np-label'),
    next: r('.np-btn:last-child'), hovered: np.matches(':hover'), cls: np.className };
});

// Hover the chip and wait until the browser agrees it is hovered, rather than
// sleeping and hoping — the chip is force-shown here, so a race is real.
async function hover() {
  for (let i = 0; i < 20; i++) {
    const b = await page.evaluate(() => {
      const np = document.getElementById('now-playing');
      np.style.display = '';
      const r = np.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(b.x, b.y);
    await page.waitForTimeout(300);
    const g = await geom();
    if (g.hovered && g.prev.w > 0) return g;
  }
  return geom();
}

// ---- at rest: no transport ----
await page.mouse.move(10, 10);
await page.waitForTimeout(450);
const rest = await geom();
ok('at rest the transport is closed', rest.prev.w === 0 && rest.next.w === 0,
  `prev=${rest.prev.w}px next=${rest.next.w}px`);

// ---- hovered: the buttons open and the title sits between them ----
const hov = await hover();
ok('hover opens both buttons', hov.prev.w > 8 && hov.next.w > 8,
  `prev=${hov.prev.w}px next=${hov.next.w}px hovered=${hov.hovered}`);
ok('prev is LEFT of the title', hov.prev.cx < hov.label.x,
  `prev cx=${hov.prev.cx} label x=${hov.label.x}`);
ok('next is RIGHT of the title', hov.next.x >= hov.label.x + hov.label.w - 1,
  `next x=${hov.next.x} label ends=${hov.label.x + hov.label.w}`);
ok('the title ends up between them', hov.label.cx > hov.prev.cx && hov.label.cx < hov.next.cx);
ok('the title moved from where it rested', Math.abs(hov.label.cx - rest.label.cx) > 4,
  `${rest.label.cx} -> ${hov.label.cx}`);
ok('the chip is still on screen', hov.chip.x > 0);
await page.screenshot({ path: SHOT, clip: { x: 1100 - 460, y: 620 - 90, width: 455, height: 85 } });

// ---- the buttons must not toggle the music ----
if (!hasSongs) skip('clicking a button does not mute', 'no songs');
else {
  const r = await page.evaluate(async () => {
    const m = window.__game.music;
    const before = m.enabled;
    document.querySelector('#now-playing .np-btn:last-child').click();
    await new Promise((s) => setTimeout(s, 60));
    return { before, after: m.enabled };
  });
  ok('NEXT does not toggle the music', r.before === r.after, JSON.stringify(r));
}

// ---- BACK: first press rewinds, a second goes to the previous song ----
if (!hasSongs) skip('back rewinds then steps back', 'no songs');
else {
  const r = await page.evaluate(async () => {
    const m = window.__game.music;
    m.setEnabled(true); m.start();
    await new Promise((s) => setTimeout(s, 120));
    m.skip(); m.skip();                       // build some history
    const song0 = m.nowPlaying, hist = m._history.length;
    try { m.el.currentTime = 30; } catch (e) { /* ok */ }
    const a = m.back();                       // press 1
    const song1 = m.nowPlaying;
    const b = m.back();                       // press 2
    return { hist, a, b, song0, song1, song2: m.nowPlaying, hadPrev: hist > 0 };
  });
  ok('the first press REWINDS, not skips', r.a === 'restart' && r.song1 === r.song0,
    JSON.stringify({ a: r.a }));
  ok('a second press steps to the previous song',
    !r.hadPrev || (r.b === 'prev' && r.song2 !== r.song1), JSON.stringify({ b: r.b }));
}

// ---- paused: the transport auditions quietly, and unpausing restores it ----
if (!hasSongs) skip('a paused press auditions quietly', 'no songs');
else {
  const r = await page.evaluate(async () => {
    const m = window.__game.music;
    m.setEnabled(true); m.start();
    await new Promise((s) => setTimeout(s, 80));
    const full = m.el.volume;
    m.pause();                                 // the pause menu
    const paused = { playing: m.playing, vol: m.el.volume };
    m.setPreview(true); m.skip();              // a nav press while paused
    const preview = { playing: m.playing, vol: m.el.volume, preview: m._preview };
    m.resume();                                // unpause
    const after = { vol: m.el.volume, preview: m._preview };
    return { full, paused, preview, after };
  });
  ok('pausing stops the soundtrack', r.paused.playing === false);
  ok('a nav press while paused starts it', r.preview.playing === true);
  ok('…and it plays QUIETLY', r.preview.vol > 0 && r.preview.vol < r.full * 0.9,
    `preview=${r.preview.vol.toFixed(3)} full=${r.full.toFixed(3)}`);
  ok('unpausing restores full volume', Math.abs(r.after.vol - r.full) < 1e-6 && !r.after.preview,
    `${r.preview.vol.toFixed(3)} -> ${r.after.vol.toFixed(3)}`);
}

// ---- and a hidden tab still stops it, audition or not ----
if (!hasSongs) skip('a hidden tab stops an audition', 'no songs');
else {
  const r = await page.evaluate(async () => {
    const m = window.__game.music;
    m.setEnabled(true); m.start(); m.pause(); m.setPreview(true); m.skip();
    const before = m.playing;
    m.pause();                                 // what visibilitychange does
    return { before, after: m.playing, elPaused: m.el.paused };
  });
  ok('a hidden tab stops an audition', r.before === true && r.after === false && r.elPaused);
}

await browser.close();
console.log(fails ? `\n${fails} FAILED (${skips} skipped)` : `\nall checks passed (${skips} skipped)`);
process.exit(fails ? 1 : 0);
