// THE ARENA EDITOR'S POINTER CONTRACT, asserted.
//
// The editor and OrbitControls share one mouse, and the rule is that a press
// belongs to exactly one of them from the moment it lands. What this checks is
// the half nobody notices until it is broken: that the CAMERA still answers
// after a drag ends badly. A press that OrbitControls had already begun
// tracking, stolen mid-gesture by disabling the controls, left it holding a
// pointer it never finished — and a drag interrupted by a pointercancel (the
// trackpad deciding your press was a scroll) or released outside the window
// left the view dead for the rest of the session, with `orbit.enabled` still
// reading true. It got worse with every interrupted drag, which is what "over
// time I lose the ability to move around" is.
//
//   node tools/editorpointer.mjs [url]
//
// Exits non-zero on any failure.
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(`${base}/workbench/?edit=level&arena=neon`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__leveleditor?.items().length > 0, null, { timeout: 120000 });
await page.waitForTimeout(2500);

const E = (fn, ...a) => page.evaluate(fn, ...a);
const cam = () => E(() => window.__leveleditor.camera.position.toArray().map((n) => +n.toFixed(3)));
const orbitOn = () => E(() => window.__leveleditor.orbitEnabled());
// where a placed object sits on screen, so a press lands on a real thing
const target = () => E(() => {
  const ed = window.__leveleditor, r = document.querySelector('canvas').getBoundingClientRect();
  for (const it of ed.items()) {
    if (it.def.k !== 'building' && it.def.k !== 'prop') continue;
    const v = it.obj3d.position.clone().project(ed.camera);
    const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
    if (v.z < 1 && x > 150 && x < r.right - 150 && y > 150 && y < r.bottom - 150) {
      return { id: it.def.id, x, y, ox: it.def.x, oz: it.def.z };
    }
  }
  return null;
});
const posOf = (id) => E((i) => {
  const it = window.__leveleditor.items().find((o) => o.def.id === i);
  return it ? [+it.def.x.toFixed(2), +it.def.z.toFixed(2)] : null;
}, id);

// A POINT ON THE CANVAS AND NOTHING ELSE: not over a panel or a button (the
// editor's chrome sits on top of the view), not over a placed object, and not
// near the selection where the transform gizmo's rings reach. Fixed screen
// coordinates quietly stop meaning "empty ground" the moment the camera moves.
const emptySpot = () => E(() => {
  const ed = window.__leveleditor, cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  const busy = [];
  for (const it of ed.items()) {
    const v = it.obj3d.position.clone().project(ed.camera);
    if (v.z < 1) busy.push([r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height]);
  }
  const sel = ed.selection();
  const gz = ed.gizmo?.object ? ed.gizmo.object.position.clone().project(ed.camera) : null;
  const gp = gz && gz.z < 1 ? [r.left + ((gz.x + 1) / 2) * r.width, r.top + ((1 - gz.y) / 2) * r.height] : null;
  for (let y = r.top + 60; y < r.bottom - 60; y += 20) {
    for (let x = r.left + 60; x < r.right - 60; x += 20) {
      if (document.elementFromPoint(x, y) !== cv) continue;
      if (busy.some(([bx, by]) => Math.hypot(bx - x, by - y) < 90)) continue;
      if (gp && Math.hypot(gp[0] - x, gp[1] - y) < 220) continue;   // gizmo rings reach far
      return { x, y, sel: sel.length };
    }
  }
  return null;
});

const canPan = async () => {
  const p = await emptySpot();
  if (!p) { console.log('   (no empty screen point found)'); return false; }
  const before = await cam();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(p.x - 90, p.y + 70, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(250);
  return JSON.stringify(before) !== JSON.stringify(await cam());
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`);
};

check('camera pans on a fresh editor', await canPan());

const t = await target();
if (!t) { console.log('no object on screen to press on'); process.exit(1); }

// --- an ordinary drag still moves the thing, and does NOT move the camera ---
{
  const camBefore = await cam();
  await page.mouse.move(t.x, t.y);
  await page.mouse.down();
  await page.mouse.move(t.x + 70, t.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const moved = JSON.stringify(await posOf(t.id)) !== JSON.stringify([+t.ox.toFixed(2), +t.oz.toFixed(2)]);
  check('drag moves the object', moved);
  check('drag does not move the camera', JSON.stringify(camBefore) === JSON.stringify(await cam()));
  check('camera pans after a normal drag', await canPan());
}

// --- a drag the browser cancels mid-gesture ---
{
  const t2 = await target();
  const before = await posOf(t2.id);
  await page.mouse.move(t2.x, t2.y);
  await page.mouse.down();
  await page.mouse.move(t2.x + 60, t2.y + 30, { steps: 6 });
  await E(() => document.querySelector('canvas')
    .dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
  await page.mouse.up();
  await page.waitForTimeout(500);
  check('cancelled drag puts the object back', JSON.stringify(before) === JSON.stringify(await posOf(t2.id)),
    `${JSON.stringify(before)} -> ${JSON.stringify(await posOf(t2.id))}`);
  check('orbit re-enabled after a cancelled drag', await orbitOn());
  check('CAMERA PANS AFTER A CANCELLED DRAG', await canPan());
}

// --- a drag released outside the window (no pointerup ever arrives) ---
{
  const t3 = await target();
  await page.mouse.move(t3.x, t3.y);
  await page.mouse.down();
  await page.mouse.move(t3.x + 80, t3.y + 20, { steps: 6 });
  await E(() => {
    document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerId: 1 }));
    window.dispatchEvent(new Event('blur'));
  });
  await page.mouse.up();   // the release the page never heard about
  await page.waitForTimeout(400);
  check('orbit re-enabled after an off-window release', await orbitOn());
  check('CAMERA PANS AFTER AN OFF-WINDOW RELEASE', await canPan());
}

// --- and a plain click still selects / deselects ---
{
  const t4 = await target();
  await page.mouse.click(t4.x, t4.y);
  await page.waitForTimeout(300);
  check('click selects', (await E(() => window.__leveleditor.selection().length)) === 1);
  const empty = await emptySpot();
  await page.mouse.click(empty.x, empty.y);
  await page.waitForTimeout(300);
  check('click on empty ground deselects', (await E(() => window.__leveleditor.selection().length)) === 0);
  check('camera pans at the end of the session', await canPan());
}

await browser.close();
if (pageErrors.length) console.log(`\npage errors:\n${pageErrors.slice(0, 5).join('\n')}`);
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
