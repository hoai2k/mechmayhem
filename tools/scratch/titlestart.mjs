// Does the title screen's PRESS START do what it says?
//
// Four routes, and they must not agree about fullscreen: a CLICK goes to the
// select screen and leaves the display alone, while ENTER / SPACE (and, where
// the browser allows it, the pad) take fullscreen with them. Fullscreen itself
// cannot be observed in headless Chromium, so what is checked is that the
// request was MADE — requestFullscreen is wrapped before the page boots.
import { launch } from '../lib/browser.mjs';

const PORT = process.env.PORT || '5175';
const browser = await launch();

// A real gamepad, as far as the game can tell: the input layer polls
// navigator.getGamepads every frame, so a fake one exercises the ACTUAL pad
// path (padPressed -> menuEvents -> TitleScreen.update) rather than a stub.
const FAKE_PAD = () => {
  window.__padBtn = null;
  const pad = (btn) => ({
    connected: true, index: 0, id: 'fake', mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === btn, touched: false, value: i === btn ? 1 : 0 })),
  });
  navigator.getGamepads = () => [pad(window.__padBtn), null, null, null];
};

async function run(label, act, withPad = false) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
  // count the fullscreen asks, and never actually go fullscreen (it throws
  // headless and the rejection is noise)
  await page.addInitScript(() => {
    window.__fs = 0;
    const proto = Element.prototype;
    proto.requestFullscreen = function () { window.__fs++; return Promise.resolve(); };
  });
  if (withPad) await page.addInitScript(FAKE_PAD);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.press-start', { timeout: 30000 });
  const promptText = (await page.textContent('.press-start')).trim();
  const items = await page.$$eval('.menu-item', (n) => n.length);

  await act(page);
  await page.waitForTimeout(4000);   // ~4s: menus need it under SwiftShader

  const onSelect = await page.$('.roster-grid') !== null;
  const fs = await page.evaluate(() => window.__fs);
  await page.close();
  return { label, promptText, items, onSelect, fs };
}

const rows = [];
rows.push(await run('mouse click', (p) => p.click('.press-start')));
rows.push(await run('Enter key', (p) => p.keyboard.press('Enter')));
rows.push(await run('Space key', (p) => p.keyboard.press('Space')));
// the pad routes, through the real polling path. Held for a few frames, then
// released, so `padPressed`'s edge test sees a genuine press.
const tap = (btn) => async (p) => {
  await p.evaluate((b) => { window.__padBtn = b; }, btn);
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__padBtn = null; });
};
rows.push(await run('pad START', tap(9), true));
rows.push(await run('pad A', tap(0), true));
// …and the one that must do NOTHING. Escape sets ev.pause exactly as pad START
// does, so a title screen that starts on `pause` launches a match on Escape.
rows.push(await run('Escape key (must NOT start)', (p) => p.keyboard.press('Escape')));

await browser.close();

console.log('\nroute                     prompt         .menu-item  -> select  fullscreen asked');
let bad = 0;
for (const r of rows) {
  const inert = r.label.startsWith('Escape');
  const wantFs = !inert && r.label !== 'mouse click';
  const ok = r.items === 0 && (inert
    ? (!r.onSelect && r.fs === 0)                       // stayed on the title
    : (r.onSelect && (wantFs ? r.fs > 0 : r.fs === 0)));
  if (!ok) bad++;
  console.log(`${r.label.padEnd(24)}  ${JSON.stringify(r.promptText).padEnd(14)} ${String(r.items).padStart(9)}`
    + `  ${String(r.onSelect).padStart(8)}  ${String(r.fs).padStart(15)}   ${ok ? 'ok' : 'MISMATCH'}`);
}
console.log(bad ? `\n${bad} route(s) wrong.` : '\nclick stays windowed, keys go fullscreen, every route reaches select.');
process.exit(bad ? 1 : 0);
