// Fighter select with N fighters in the match (the 5-8 ROWS layout, and the
// duel/quad ones below it): node tools/scratch/select8.mjs <n> out.png
// Mounts MechSelectScreen straight onto the game page with a stub input, so
// no pad presses have to be scripted to fill the seats.
import { launch } from '../lib/browser.mjs';
const [n = '8', out = 'select8.png'] = process.argv.slice(2);
const browser = await launch({ gl: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173/?music=0', { waitUntil: 'load' });
await page.waitForTimeout(4000);
const info = await page.evaluate(async (n) => {
  const { MechSelectScreen } = await import('/src/ui/menus.js');
  const root = document.getElementById('ui-root');
  root.querySelectorAll('.screen').forEach((e) => e.remove());
  const input = {
    connectedPadCount: () => 0, padConnected: () => false, rumble() {},
    menuEventsFor: () => ({}), touchMenuEvent() {},
  };
  const slots = [];
  for (let i = 0; i < 8; i++) {
    slots.push(i >= n ? { kind: 'off' }
      : i < 2 ? { kind: 'human', device: i ? 'kb2' : 'kb1' } : { kind: 'ai', diff: 'veteran' });
  }
  const scr = new MechSelectScreen(root, { input, prev: slots, onDone() {}, onBack() {} });
  window.__sel = scr;
  const r = [...scr.el.querySelectorAll('.sel-side')].map((e) => {
    const b = e.getBoundingClientRect();
    return `${e.className.replace('sel-side ', '')} ${b.x | 0},${b.y | 0} ${b.width | 0}x${b.height | 0}`;
  });
  return r;
}, +n);
await page.waitForTimeout(3000);
await page.screenshot({ path: out, ...(/\.jpe?g$/.test(out) ? { type: 'jpeg', quality: 84 } : {}) });
console.log(info.join('\n'));
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
