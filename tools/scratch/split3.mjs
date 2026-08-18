// THREE PLAYERS: THE L LAYOUT AND THE STATS PANEL. Three views leave a quadrant
// spare (camera.js LAYOUTS['3']) and every HUD plate moves into it
// (ui/hud.js positionPlates), so no plate sits on anybody's viewport.
//
// The ?battle harness has no real Hud — it draws a debug readout — so this one
// builds the game's own Hud over the harness' fighters, which is the same class
// the match uses with the same plates.
//
// usage: node tools/scratch/split3.mjs [out.png] [waitMs]
import { chromium } from 'playwright-core';
const [out = 'split3.png', waitMs = '30000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
await p.goto('http://localhost:5173/?battle=neon&p1=titanus&p2=viper&p3=vulcan&p4=konga&forcesplit=1&diff=ace', { waitUntil: 'networkidle' });
await p.waitForTimeout(Number(waitMs));

const report = await p.evaluate(async () => {
  const { Hud } = await import('/src/ui/hud.js');
  const w = window.__world, F = window.__fighters;
  const hud = new Hud(document.getElementById('ui-root'), w);
  // WORST CASE ON PURPOSE: three humans AND a CPU is four plates in a quarter
  // of the screen, which is the most the panel ever has to hold. The harness
  // gives forcesplit every fighter a viewport, so trim its views back to the
  // three the layout under test actually has.
  hud.buildPlates(F);
  hud.positionPlates('3', [0, 1, 2]);
  const eng = window.__engine || w.engine;
  if (eng?.views?.length === 4) eng.views = eng.views.slice(0, 3);
  hud.update(1 / 60, null, 97);
  const r = (el) => { const b2 = el.getBoundingClientRect(); return { x: Math.round(b2.x), y: Math.round(b2.y), w: Math.round(b2.width), h: Math.round(b2.height) }; };
  const W = window.innerWidth, H = window.innerHeight;
  const panel = r(document.getElementById('hud-stats'));
  // The panel IS the quadrant no 3-player view uses, so "no plate covers a
  // viewport" is exactly "every plate is inside the panel". Read the quadrant
  // from camera.js rather than restating it here, or the two can drift.
  const { STATS_PANEL_RECT: S } = await import('/src/game/camera.js');
  const quad = { x: S.x * W, y: H - (S.y + S.h) * H, w: S.w * W, h: S.h * H };
  const outside = [];
  for (const pl of hud.plates) {
    const q = r(pl.root);
    if (q.x < quad.x - 0.5 || q.y < quad.y - 0.5
        || q.x + q.w > quad.x + quad.w + 0.5 || q.y + q.h > quad.y + quad.h + 0.5) {
      outside.push(`${pl.f.def.id} ${JSON.stringify(q)}`);
    }
  }
  // …and switching AWAY puts everything back in the corners it came from, so
  // a 3-player layout is not a one-way door (the panel is the only layout that
  // re-parents plates at all).
  hud.positionPlates('4', [0, 1, 2, 3]);
  const restored = {
    panelHidden: document.getElementById('hud-stats').style.display === 'none',
    platesBackInHud: hud.plates.every((pl) => pl.root.parentNode.id === 'hud'),
    timerBackInHud: hud.timerEl.parentNode.id === 'hud',
    cornersAssigned: hud.plates.map((pl) => pl.root.style.cssText.split(';')[0]),
  };
  hud.positionPlates('3', [0, 1, 2]);

  return {
    screen: { W, H }, panel, quadrantFromCamera: quad, restored,
    panelIsTheSpareQuadrant: panel.x === Math.round(quad.x) && panel.y === Math.round(quad.y)
      && panel.w === Math.round(quad.w) && panel.h === Math.round(quad.h),
    platesInPanel: hud.plates.filter((pl) => pl.root.parentNode.id === 'hud-stats').length,
    plateCount: hud.plates.length,
    timerInPanel: document.querySelector('#hud-stats > .hud-timer') !== null,
    platesOutsideThePanel: outside,
    panelOverflowPx: document.getElementById('hud-stats').scrollHeight
      - document.getElementById('hud-stats').clientHeight,
  };
});
console.log(JSON.stringify(report, null, 2));
await p.screenshot({ path: out, timeout: 120000 });
console.log('shot ->', out);
await b.close();
