#!/usr/bin/env node
// GIZMOHIDE — does holding Shift actually get the transform handles out of the
// way, and hand them back unchanged?
//
//   node tools/gizmohide.mjs            (needs `npm run dev`)
//
// workbench/ui/gizmo.js has six moving parts and five of them are invisible, so
// a change that looks right on screen can quietly break the one that makes the
// click land. Each is asserted here against the live pose workbench:
//
//   1  a stale hover axis is cleared          — every tool guards its pick with
//                                               `if (gizmo.axis) return`
//   2  hidden means visible AND enabled off   — the picker meshes are invisible
//                                               by construction, so hiding
//                                               alone still eats the drag
//   3  an attach while Shift is held stays hidden — shift-clicking a joint IS
//                                               an attach, and attach() sets
//                                               visible = true itself
//   4  release restores, still attached, same joint
//   5  Shift pressed mid-drag changes nothing — a ring in hand keeps its ring
//   6  Shift typed into a panel field changes nothing, and releasing it there
//      still hands the gizmo back
import { chromium } from 'playwright-core';

const base = process.env.RW_URL || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${base}/workbench/?edit=pose&mech=titanus`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__poseWork, { timeout: 60000 });
await page.waitForTimeout(3000);

const steps = await page.evaluate(() => {
  const w = window.__poseWork, g = w.gizmo, out = [];
  const snap = (label) => out.push([label, { vis: g.visible, en: g.enabled, axis: g.axis, sel: w.sel }]);
  const key = (type, opts) => {
    const e = new KeyboardEvent(type, { key: opts.key, shiftKey: opts.shift, bubbles: true });
    if (opts.target) Object.defineProperty(e, 'target', { value: opts.target });
    window.dispatchEvent(e);
  };
  const field = document.querySelector('input, select') || document.createElement('input');
  w.select('shoulderL');
  g.axis = 'Y';                                        // what letting go of a ring leaves
  snap('selected, stale axis');
  key('keydown', { key: 'Shift', shift: true });       snap('shift down');
  w.select('kneeR');                                   // the shift-click pick = an attach()
  snap('picked another joint while held');
  key('keyup', { key: 'Shift', shift: false });        snap('shift up');
  g.dragging = true;
  key('keydown', { key: 'Shift', shift: true });       snap('shift down mid-drag');
  key('keyup', { key: 'Shift', shift: false });
  g.dragging = false;
  key('keydown', { key: 'A', shift: true, target: field }); snap('shift-typing in a field');
  key('keyup', { key: 'Shift', shift: false, target: field }); snap('shift up from a field');
  return out;
});

const want = {
  'selected, stale axis': { vis: true, en: true, axis: 'Y', sel: 'shoulderL' },
  'shift down': { vis: false, en: false, axis: null, sel: 'shoulderL' },
  'picked another joint while held': { vis: false, en: false, axis: null, sel: 'kneeR' },
  'shift up': { vis: true, en: true, axis: null, sel: 'kneeR' },
  'shift down mid-drag': { vis: true, en: true, axis: null, sel: 'kneeR' },
  'shift-typing in a field': { vis: true, en: true, axis: null, sel: 'kneeR' },
  'shift up from a field': { vis: true, en: true, axis: null, sel: 'kneeR' },
};
let bad = 0;
for (const [label, got] of steps) {
  const exp = want[label];
  const ok = exp && Object.keys(exp).every((k) => got[k] === exp[k]);
  if (!ok) bad++;
  console.log(ok ? ' ok  ' : 'FAIL ', label.padEnd(32), JSON.stringify(got),
    ok ? '' : ` expected ${JSON.stringify(exp)}`);
}
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 3).join('\n'));
await browser.close();
if (bad) { console.log(`\n${bad} assertion(s) failed`); process.exit(1); }
console.log('\nshift-hide holds on all seven');
