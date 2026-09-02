// finishaudit — run every mech's finisher headlessly and measure the things
// a scripted scene must not do:
//
//   floatEnd   victim's feet above ground when the scene ENDS (should rest)
//   sink       either body driven BELOW the floor
//   popVic/Win biggest single-frame teleport of a body, in world units — a
//              scripted scene should move bodies continuously, so a big jump
//              is a body snapping to/from an attachment point
//   nan        any non-finite position (a scene that lost its subject)
//   ended      the script ran to completion
//
// NOT measured: camera framing and "is the victim held", both of which read
// as failures on perfectly good scenes — a hero shot deliberately frames the
// winner alone, and a script that writes vic.pos directly leaves vic.vel at
// zero, which no held/thrown test can tell from hovering.
//
// Usage: node tools/finishaudit.mjs "<battletest url>" [mech ...]
import { launch } from './lib/browser.mjs';

const URL = process.argv[2];
const MECHS = process.argv.slice(3);
const browser = await launch();
const rows = [];
for (const mech of MECHS) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`${URL}&p1=${mech}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(async () => {
    const w = window.__world, [win, vic] = window.__fighters;
    const cam = window.__cam;
    // drive the finisher directly, stepping the world by hand
    for (const f of window.__fighters) f.controlsLocked = true;
    vic.hp = 1;
    let done = false;
    w.startFinisher(win, vic, () => { done = true; });
    const THREE = window.__THREE;
    const samples = [];
    // wrap-aware per-frame deltas: the arena is toroidal, so a raw position
    // difference across the seam reads as a jump the width of the world
    let pv = null, pw = null;
    const step = (a, b) => (a === null ? 0 : Math.hypot(
      w.wrapDelta(b.x - a.x), b.y - a.y, w.wrapDelta(b.z - a.z)));
    for (let i = 0; i < 60 * 12 && !done; i++) {
      w.update(1 / 60);

      const dv = step(pv, vic.pos), dw = step(pw, win.pos);
      pv = vic.pos.clone(); pw = win.pos.clone();
      samples.push({
        t: +(i / 60).toFixed(2),
        vy: vic.pos.y, wy: win.pos.y, dv, dw,
        d: Math.hypot(w.wrapDelta(vic.pos.x - win.pos.x), w.wrapDelta(vic.pos.z - win.pos.z)),
        bad: !Number.isFinite(vic.pos.x) || !Number.isFinite(vic.pos.y) ||
             !Number.isFinite(win.pos.x) || !Number.isFinite(win.pos.y),
      });
    }
    return { mech: win.def.id, vic: vic.def.id, done, samples,
             vicH: vic.height, winH: win.height };
  });
  // ---- analysis in node, so the page stays a dumb recorder ----
  const s = r.samples;
  const last = s.slice(-18);
  const floatEnd = last.length ? Math.max(...last.map((x) => x.vy)) : 0;
  // POP: biggest single-frame move. A scripted scene eases bodies around; a
  // frame that jumps a body several units is it snapping onto or off an
  // attachment point.
  const pick = (k) => s.slice(2).reduce((a, x) => (x[k] > a[k] ? x : a), s[2] || { [k]: 0, t: 0 });
  const bv = pick('dv'), bw = pick('dw');
  const popVic = bv.dv || 0, popWin = bw.dw || 0;
  const sink = Math.min(0, ...s.map((x) => Math.min(x.vy, x.wy)));
  rows.push({
    mech: r.mech, frames: s.length, ended: r.done,
    floatEnd: +floatEnd.toFixed(2),
    popVic: +popVic.toFixed(2), popVicT: bv.t,
    popWin: +popWin.toFixed(2), popWinT: bw.t,
    sink: +sink.toFixed(2),
    nan: s.some((x) => x.bad),
    maxVy: +Math.max(...s.map((x) => x.vy)).toFixed(1),
    errs: errs.slice(0, 1),
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
  await page.close();
}
console.log('\n--- flagged ---');
for (const r of rows) {
  const f = [];
  if (r.nan) f.push('NaN position');
  if (!r.ended) f.push('never ended');
  if (r.floatEnd > 0.6) f.push(`ends floating ${r.floatEnd}`);
  if (r.popVic > 3.5) f.push(`victim pops ${r.popVic} at t=${r.popVicT}s`);
  if (r.popWin > 3.5) f.push(`winner pops ${r.popWin} at t=${r.popWinT}s`);
  if (r.sink < -0.25) f.push(`sinks to ${r.sink}`);
  if (r.errs.length) f.push(`pageerror: ${r.errs[0]}`);
  if (f.length) console.log(`  ${r.mech}: ${f.join(' · ')}`);
}
await browser.close();
