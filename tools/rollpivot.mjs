// rollpivot — where does the air somersault actually pivot?
//
// Spins each mech through a full turn and tracks the WORLD path of the head
// and the feet. Rotation about the body's centre of mass sweeps both through
// circles of similar size on opposite sides; rotation about the feet leaves
// the feet nailed down while the head sweeps an arc twice the body's height.
//
//   headR/footR   radius of the circle each traces
//   comDrift      how far the body's mid-point wanders during the spin —
//                 0 means it tumbles in place, which is what a ball does
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
for (const mech of process.argv.slice(3)) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`${process.argv[2]}&p1=${mech}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const w = window.__world, [f, e] = window.__fighters;
    if (window.__ais) for (const a of window.__ais) a.update = () => {};
    const V = Object.getPrototypeOf(f.pos).constructor;
    e.pos.set(0, 0, 400);
    const clearI = () => { for (const k of Object.keys(f.intent)) if (typeof f.intent[k] === 'boolean') f.intent[k] = false; };
    // the tuck only triggers while DESCENDING with an empty tank
    f.setState('normal'); f.pos.set(0, 900, 0); f.vel.set(0, -6, 0);
    f.grounded = false; f.hovering = false; f.hoverFuel = 0;
    clearI(); f.intent.jump = true; f.intent.jumpHeld = true;
    w.update(1 / 60);
    if (!f._airRoll) return { mech: f.def.id, error: 'roll never started' };
    // On a GLB the VIRTUAL joints hang off their own root, not under the
    // rendered group — measure the real bones, which are what the player sees
    const nodeOf = (n) => (f.mech.isGLB ? (f.mech.boneMap?.[n] || f.mech.joints[n])
                                        : (f.mech.joints[n] || f.mech.boneMap?.[n])) || null;
    const head = nodeOf('head');
    const foot = nodeOf('ankleL') || nodeOf('footL') || nodeOf('ankleR');
    const hp = [], fp = [], cp = [];
    for (let i = 0; i < 120; i++) {
      clearI(); f.intent.jumpHeld = true;
      f.vel.y = -6;                               // keep it falling, never lands
      w.update(1 / 60);
      // measure in the FALLING BODY's own frame: the physics position, i.e.
      // pos with the roll's visual pivot nudge taken back off
      const base = f.pos.clone();
      if (f._rollOffset) base.sub(f._rollOffset);
      if (head) hp.push(head.getWorldPosition(new V()).sub(base));
      if (foot) fp.push(foot.getWorldPosition(new V()).sub(base));
      if (head && foot) {
        const a = hp[hp.length - 1], b = fp[fp.length - 1];
        cp.push(new V((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
      }
    }
    const spread = (ps) => {
      if (!ps.length) return 0;
      const mn = new V(Infinity, Infinity, Infinity), mx = new V(-Infinity, -Infinity, -Infinity);
      for (const p of ps) { mn.min(p); mx.max(p); }
      return Math.max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z) / 2;
    };
    return {
      mech: f.def.id, glb: !!f.mech.isGLB, h: +f.height.toFixed(2),
      spin: +(f._airRoll?.spin || 0).toFixed(1),
      headR: +spread(hp).toFixed(2), footR: +spread(fp).toFixed(2),
      comDrift: +(spread(cp) * 2).toFixed(2),
      hasHead: !!head, hasFoot: !!foot,
    };
  });
  r.errs = errs.slice(0, 1);
  console.log(JSON.stringify(r));
  await page.close();
}
await browser.close();
