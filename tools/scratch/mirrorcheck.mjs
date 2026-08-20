// Does the pose workbench now write the track that moves the joint you dragged?
//
// Loads the pose workbench on a mirrorArms mech (wraith) and on an ordinary one,
// and asks the adapter's trackFor() what it maps — then proves the mapping is
// the one the ANIMATOR actually applies, by posing a clip track and reading
// which joint moved.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 640, height: 480 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

for (const mech of ['wraith', 'titanus']) {
  await p.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__showcaseMechs?.[0], null, { timeout: 150000 });
  const r = await p.evaluate(() => {
    const m = window.__showcaseMechs[0], a = m.animator;
    const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
    const D2R = Math.PI / 180;
    // a one-key clip that drives ONLY the handL track
    const clip = { name: 'probe', dur: 0.4, upper: true, tracks: {
      handL: [{ t: 0, v: [0, 0, 0], ease: 'linear' }, { t: 0.4, v: [0, 60 * D2R, 0], ease: 'linear' }],
    }, events: [] };
    const read = () => ({ L: m.joints.handL.rotation.y, R: m.joints.handR.rotation.y });
    a.action = null;
    for (let i = 0; i < 40; i++) a.update(1 / 60, ctx);
    const before = read();
    // re-seat the action every step: the animator clears it when the clip ends,
    // and what we want is the pose HELD at the last key
    for (let i = 0; i < 40; i++) {
      a.action = { clip, t: 0.4 - 1 / 60, speed: 1, weight: 1, fadeIn: 1e-6, fadingOut: false, onEvent: null, lastT: -1 };
      a.update(1 / 60, ctx);
    }
    const after = read();
    return { mirrorArms: !!m.animProfile?.mirrorArms,
      dL: +((after.L - before.L) * 180 / Math.PI).toFixed(1),
      dR: +((after.R - before.R) * 180 / Math.PI).toFixed(1) };
  });
  const moved = Math.abs(r.dL) > Math.abs(r.dR) ? 'handL' : 'handR';
  console.log(`${mech.padEnd(8)} mirrorArms=${String(r.mirrorArms).padEnd(5)}  a clip track "handL" moves joint ${moved}  (dL ${r.dL}, dR ${r.dR})`);
}
// …and the workbench's own mapping, from the adapter
await p.goto('http://localhost:5173/workbench/?edit=pose&mech=wraith', { waitUntil: 'networkidle' });
await p.waitForTimeout(9000);
const map = await p.evaluate(async () => {
  const mod = await import('/workbench/adapters/mechmayhem/index.js');
  const cfg = await mod.loadMechMayhemConfig();
  const tf = cfg?.anim?.trackFor;
  if (!tf) return { err: 'no trackFor on the config' };
  return { wraithHandL: tf('handL', null, 'wraith'), titanusHandL: tf('handL', null, 'titanus') };
});
console.log('adapter trackFor:', JSON.stringify(map));
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.slice(0, 6).join('\n') : 'workbench loaded clean');
await b.close();
