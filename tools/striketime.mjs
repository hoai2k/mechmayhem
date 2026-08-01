// STRIKE TIMING — is the weapon actually THERE when the blow resolves?
//
//   node tools/striketime.mjs <mech> [clip,clip,…]
//   node tools/striketime.mjs jerry jerryRakeR,jerryBarrage
//
// A clip's `hit` event is usually authored on the same keyframe as the strike
// pose, which quietly assumes the body arrives the instant the key does. It
// does not: the animator SMOOTHS toward each target, so the rendered pose lags
// the clip by a fixed wall-clock amount. A gentle swing hides that; a fast one
// does not. Jerry's claw rake travels 114 degrees in 0.12s, and firing on the
// key resolved the blow while the claw was still up over his own back — every
// light attack whiffed over the target and nothing in the hit test could tell,
// because the test was perfectly correct about a claw that was in the air
// behind him.
//
// So: play the clip on the real fighter, sample the striking extremity every
// frame in the MECH'S OWN FRAME (forward / up, as fractions of body height),
// and print the trace with each `hit` event marked. A healthy strike has the
// tip well forward and inside the victim band at the marked row. A sick one
// has it behind or overhead, with the forward peak a few frames LATER — and
// the gap between those two rows is how much to move the event by.
import { chromium } from 'playwright-core';

const mech = process.argv[2] || 'jerry';
const want = process.argv[3] ? process.argv[3].split(',') : null;
const base = process.env.RW_URL || 'http://localhost:5173';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 300 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${base}/workbench/?edit=animation&mech=${mech}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.__poseDebug?.glbF', null, { timeout: 120000 });
await page.waitForTimeout(2500);

const out = await page.evaluate(async ({ want }) => {
  const { glbF } = window.__poseDebug;
  const m = glbF.mech, anim = glbF.animator;
  const V3 = m.group.position.constructor;
  const h = m.dims.hipHeight + m.dims.torsoH + m.dims.headSize * 2;
  const def = glbF.def;
  const names = want || [
    ...(def.lightClips || ['light1', 'light2', 'light3']),
    def.heavyClip || 'heavy',
  ];
  const res = [];
  for (const name of names) {
    anim.play(name);
    if (!anim.action) { res.push({ name, missing: true }); continue; }
    const clip = anim.action.clip;
    const hits = (clip.events || []).filter((e) => e.type === 'hit').map((e) => e.t);
    const rows = [];
    for (let i = 0; i < 140; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const act = anim.action;
      if (!act || act.clip.name !== name) break;
      m.group.updateWorldMatrix(true, true);
      const fx = Math.sin(glbF.yaw), fz = Math.cos(glbF.yaw);
      const at = (j) => {
        const o = m.joints[j] || m.rigBones?.[j];
        if (!o) return null;
        const p = o.getWorldPosition(new V3());
        return {
          f: +(((p.x - m.group.position.x) * fx + (p.z - m.group.position.z) * fz) / h).toFixed(2),
          u: +((p.y - m.group.position.y) / h).toFixed(2),
        };
      };
      rows.push({ t: +act.t.toFixed(3), L: at('handL'), R: at('handR') });
      if (act.t >= clip.dur) break;
    }
    // for each hit event: the sampled row nearest it, and the row where the
    // striking side reaches its forward peak (where the blow SHOULD resolve)
    const marks = hits.map((ht) => {
      let near = rows[0], nd = Infinity;
      for (const r of rows) { const d = Math.abs(r.t - ht); if (d < nd) { nd = d; near = r; } }
      let peak = rows[0];
      for (const r of rows) {
        const rf = Math.max(r.L ? r.L.f : -9, r.R ? r.R.f : -9);
        const pf = Math.max(peak.L ? peak.L.f : -9, peak.R ? peak.R.f : -9);
        if (Math.abs(r.t - ht) < 0.25 && rf > pf) peak = r;
      }
      return { ht, near, peak };
    });
    res.push({ name, dur: clip.dur, hits, marks, rows });
  }
  return { h: +h.toFixed(2), res };
}, { want });

if (errs.length) console.error(errs.join('\n'));
console.log(`${mech}: body height ${out.h}. Positions are the MECH'S OWN frame,`
  + ' as fractions of body height (f = forward, u = up).\n');
for (const c of out.res) {
  if (c.missing) { console.log(`== ${c.name}: no such clip on this mech\n`); continue; }
  console.log(`== ${c.name}  (dur ${c.dur}, ${c.hits.length} hit event${c.hits.length === 1 ? '' : 's'})`);
  for (const mk of c.marks) {
    const s = (o) => (o ? `f${String(o.f).padStart(6)} u${String(o.u).padStart(6)}` : '     --      ');
    const lag = +(mk.peak.t - mk.ht).toFixed(3);
    console.log(`   hit t=${String(mk.ht).padEnd(5)} -> handL ${s(mk.near.L)}  handR ${s(mk.near.R)}`);
    console.log(`   forward peak t=${String(mk.peak.t).padEnd(5)} handL ${s(mk.peak.L)}  handR ${s(mk.peak.R)}`
      + `   ${Math.abs(lag) <= 0.02 ? 'ON TIME' : `PEAK IS ${lag > 0 ? lag + 's LATER — move the hit' : -lag + 's EARLIER'}`}`);
  }
  console.log('');
}
await browser.close();
