// ============================================================================
// volsliders.mjs — drive the REAL settings screen and assert what the volume
// sliders now say: 100% is the balanced default, the range runs past it to the
// source's own ceiling, and a saved level from an older build is clamped in.
//
//   node tools/scratch/volsliders.mjs [url]
// ============================================================================
import { chromium } from 'playwright-core';
import { MUSIC_VOL_DEFAULT, MUSIC_VOL_CEIL, SFX_VOL_DEFAULT, SFX_VOL_CEIL, VOL_STEP_FRAC } from '../../src/core/config.js';

const url = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? '  ok  ' : ' FAIL '} ${msg}`); if (!cond) fails.push(msg); };

// A level saved by an older build, above what the new range allows.
await page.addInitScript(() => {
  localStorage.setItem('rw.musicVol', '0.99');
  localStorage.setItem('rw.sfxVol.samples', '5');
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const cfg = async () => page.evaluate(() => ({ music: window.rw?.config?.musicVolume, sfx: window.rw?.config?.sfxVolume }));
const stored = await cfg();
console.log('CLAMPED ON LOAD (saved music 0.99, sfx 5)');
ok(Math.abs(stored.music - MUSIC_VOL_CEIL) < 1e-6, `musicVolume ${stored.music?.toFixed(4)} == ceiling ${MUSIC_VOL_CEIL.toFixed(4)}`);
ok(Math.abs(stored.sfx.samples - SFX_VOL_CEIL) < 1e-6, `sfxVolume.samples ${stored.sfx?.samples} == ceiling ${SFX_VOL_CEIL}`);

// back to the shipped levels, then read the settings screen
await page.evaluate(({ m, s }) => { window.rw.set('musicVolume', m); window.rw.set('sfxVolume.samples', s); },
  { m: MUSIC_VOL_DEFAULT, s: SFX_VOL_DEFAULT.samples });
await page.click('#settings-btn');
await page.waitForTimeout(600);
const rowText = async (re) => (await page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  return [...document.querySelectorAll('div,li')].map((e) => e.textContent || '').filter((t) => rx.test(t) && t.length < 80).pop() || '';
}, re.source));

const music0 = await rowText(/music volume/);
const sfx0 = await rowText(/sfx volume|sound fx volume|effects volume/);
console.log(`\nAT THE SHIPPED LEVELS\n  ${music0.trim()}\n  ${sfx0.trim()}`);
ok(/\b100\s*%/.test(music0), 'music reads 100% at MUSIC_VOL_DEFAULT');
ok(/\b100\s*%/.test(sfx0), 'sfx reads 100% at SFX_VOL_DEFAULT');
await page.screenshot({ path: process.env.RW_SHOT || 'settings-volumes.png' });

// walk the music slider to its top with the key the menu listens for
// walk the cursor down to the MUSIC VOLUME row, whichever row that is
const rowState = () => page.evaluate(() => {
  const items = [...document.querySelectorAll('.menu-item')];
  return { rows: items.map((e) => e.textContent || ''), sel: items.findIndex((e) => e.classList.contains('selected')) };
});
let st = await rowState();
const want = st.rows.findIndex((r) => /music volume/i.test(r));
if (want < 0) { console.log('  rows:', st.rows); throw new Error('no MUSIC VOLUME row'); }
for (let i = 0; i < 20 && (await rowState()).sel !== want; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(90); }
st = await rowState();
ok(st.sel === want, `cursor is on the music row (${st.sel} of ${st.rows.length})`);
// The menu reads a key EDGE once per game frame, and SwiftShader runs the
// title screen at a couple of frames a second — so each press waits for the
// value to actually move rather than being fired on a fixed clock. Two
// presses that change nothing means the slider has hit its top.
const press = async (key) => {
  const before = (await cfg()).music;
  for (let t = 0; t < 20; t++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
    const now = (await cfg()).music;
    if (now !== before) return now;
  }
  return before;
};
for (let i = 0, still = 0; i < 80 && still < 2; i++) {
  const before = (await cfg()).music;
  still = (await press('ArrowRight')) === before ? still + 1 : 0;
}
await page.waitForTimeout(300);
const top = await cfg();
const topText = await rowText(/music volume/);
console.log(`\nDRAGGED TO THE TOP\n  ${topText.trim()}   (musicVolume ${top.music?.toFixed(4)})`);
ok(top.music > MUSIC_VOL_DEFAULT * 1.5, 'the music slider goes well past 100%');
ok(top.music <= MUSIC_VOL_CEIL + 1e-9, `and stops at the ceiling ${MUSIC_VOL_CEIL.toFixed(4)}`);
ok(/\b3\d\d\s*%/.test(topText), 'the readout says ~319%');

// One press is 5% OF THE DEFAULT, measured from the default itself — the very
// top is the ceiling rather than a step, so the first press back off it only
// returns to the grid.
const step = MUSIC_VOL_DEFAULT * VOL_STEP_FRAC;
await page.evaluate((m) => window.rw.set('musicVolume', m), MUSIC_VOL_DEFAULT);
const up = await press('ArrowRight');
ok(Math.abs((up - MUSIC_VOL_DEFAULT) - step) < 1e-6,
  `one press off 100% moves 5% of the default (${step.toFixed(4)}, got ${(up - MUSIC_VOL_DEFAULT).toFixed(4)})`);
const back = await press('ArrowLeft');
ok(Math.abs(back - MUSIC_VOL_DEFAULT) < 1e-6, 'and the press back lands exactly on 100%');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall assertions passed');
process.exit(fails.length ? 1 : 0);
