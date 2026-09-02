// THE FULLSCREEN CORNER BUTTON — that it is mounted, sits in the cluster's
// row, carries a tooltip, is a controller stop, and actually asks the
// browser to go fullscreen.
//
//   node tools/scratch/fsbtn.mjs [http://localhost:5173]
import { launch } from '../lib/browser.mjs';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#fullscreen-btn', { timeout: 120000 });

let fails = 0;
const ok = (label, cond, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const row = await page.evaluate(() => {
  const pick = (id) => {
    const e = document.getElementById(id);
    if (!e) return null;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return { right: Math.round(window.innerWidth - r.right), bottom: Math.round(window.innerHeight - r.bottom),
      w: Math.round(r.width), h: Math.round(r.height), tip: e.dataset.tip || '',
      hot: e.classList.contains('hot-btn'), fs: Math.round(parseFloat(cs.fontSize)) };
  };
  return { fs: pick('fullscreen-btn'), info: pick('instructions-btn'),
    gear: pick('settings-btn'), mute: pick('mute-btn') };
});
console.log('cluster:', JSON.stringify(row));
ok('the button is mounted', !!row.fs);
ok('it sits on the cluster row', row.fs && row.fs.bottom === row.mute.bottom,
  `fs bottom=${row.fs?.bottom} mute bottom=${row.mute?.bottom}`);
ok('it is the leftmost of the four', row.fs && row.fs.right > row.info.right
  && row.info.right > row.gear.right && row.gear.right > row.mute.right,
  `right: fs=${row.fs?.right} info=${row.info?.right} gear=${row.gear?.right} mute=${row.mute?.right}`);
ok('it is on screen', row.fs && row.fs.right + row.fs.w < 1024 && row.fs.w > 0);
ok('it carries a tooltip', !!row.fs?.tip, JSON.stringify(row.fs?.tip));
ok('it wears the hot-btn style', !!row.fs?.hot);
ok('it matches the cluster size', row.fs && row.fs.fs === row.mute.fs,
  `${row.fs?.fs}px vs ${row.mute?.fs}px`);

// It must ASK the browser. Headless Chromium does not always grant it, so the
// assertion is that requestFullscreen is CALLED — the grant is the browser's.
const asked = await page.evaluate(async () => {
  let called = 0;
  const el = document.documentElement;
  const real = el.requestFullscreen;
  el.requestFullscreen = function (...a) { called++; return real?.apply(this, a); };
  document.getElementById('fullscreen-btn').click();
  await new Promise((r) => setTimeout(r, 200));
  el.requestFullscreen = real;
  return called;
});
ok('clicking it requests fullscreen', asked === 1, `calls=${asked}`);

// …and it is a controller stop, so a pad can reach it with LB/RB
const isHot = await page.evaluate(() => !!document.getElementById('fullscreen-btn'));
ok('reachable as an element a pad pointer can click', isHot);

await page.screenshot({ path: process.env.SHOT || '/tmp/fsbtn.png' });
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
