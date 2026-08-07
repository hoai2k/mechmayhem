// PICTURES OF AN ULT. Fires a mech's ultimate in a live battle and renders the
// frames it asks for, driving the world by hand so a 20x-slow SwiftShader
// renderer still lands on the moment you asked for.
//   node tools/scratch/ultshot.mjs <mech> <out-prefix> <t0,t1,t2...> [arena]
import { chromium } from 'playwright-core';

const [mech = 'fenrir', out = '/tmp/ult', times = '0.7,1.2,2,3', arena = 'neon'] = process.argv.slice(2);
const TS = times.split(',').map(Number);
const url = `http://localhost:5173/?battle=${arena}&p1=${mech}&p2=titanus&auto=1&diff=ace`;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(28000);

await page.evaluate(async () => {
  const w = window.__world;
  const f = w.fighters[0];
  const { prewarmSummons } = await import('/src/combat/specials.js');
  for (let i = 0; i < 6; i++) prewarmSummons(f, 1);
  window.__engine.paused = true;      // the harness owns the clock from here
  f.ult = 1; f.ultCharges = 1;
  f.doUlt();
  window.__ultT = 0;
  window.__ultPos = f.pos.clone();   // frame WHERE IT WAS CAST — the caster walks away from his own effect
});

let at = 0;
for (const t of TS) {
  const adv = t - at; at = t;
  await page.evaluate((adv) => {
    const w = window.__world, dt = 1 / 60;
    for (let i = 0; i < Math.round(adv * 60); i++) { w.update(dt); window.__ultT += dt; }
    window.__engine.step(0);          // render the frame we stopped on
  }, adv);
  const file = `${out}-${String(t).replace('.', 'p')}.png`;
  // frame the CASTER, not the arena: at 960x540 an effect round a mech twenty
  // metres off is forty pixels of it
  const box = await page.evaluate(() => {
    const w = window.__world;
    const cam = window.__engine?.camera || w.cameraSys?.cam;
    const v = window.__ultPos.clone().setY(window.__ultPos.y + 3).project(cam);
    const P = w.effects.smoke, a = (P.geo || P.points.geometry).attributes.aColor.array;
    let lit = 0; for (let i = 3; i < a.length; i += 4) if (a[i] > 0.02) lit++;
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, lit, vis: P.points.visible };
  });
  const vp = page.viewportSize();
  const K = Number(process.env.RW_CLIP || 0.38);   // RW_CLIP=1 for the whole arena
  const cw = Math.round(vp.width * K), chh = Math.round(vp.height * Math.min(1, K * 1.45));
  await page.screenshot({ path: file, clip: {
    x: Math.max(0, Math.min(vp.width - cw, box.x * vp.width - cw / 2)),
    y: Math.max(0, Math.min(vp.height - chh, box.y * vp.height - chh / 2)),
    width: cw, height: chh } });
  console.log(file, JSON.stringify({ lit: box.lit, vis: box.vis, x: +box.x.toFixed(2), y: +box.y.toFixed(2) }));
}
await browser.close();
