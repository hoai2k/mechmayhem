import { chromium } from 'playwright-core';
const [mech='viper'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', (e) => console.error('page error:', String(e).slice(0,200)));
await p.goto(`http://localhost:5173/?battle=neon&p1=${mech}&p2=titanus`, { waitUntil: 'networkidle' });
await p.waitForTimeout(30000);
console.log(await p.evaluate(async () => {
  const w = window.__world, F = window.__fighters, THREE = window.__THREE;
  const f = F[0];
  window.__ais.length = 0;
  for (let i = 0; i < 30; i++) w.update(1/60);
  const out = {};
  for (const name of ['muzzleR','muzzleL']) {
    const a = f.mech.anchors[name];
    if (!a) { out[name] = 'none'; continue; }
    const side = name.slice(-1);
    const J = f.mech.joints['shoulder'+side];
    const dir = () => { a.updateWorldMatrix(true,false); const q=a.getWorldQuaternion(new THREE.Quaternion()); return new THREE.Vector3(0,0,1).applyQuaternion(q); };
    const d0 = dir();
    // is the anchor a DESCENDANT of the virtual shoulder / of anything?
    let par = [], o = a.parent, n = 0;
    while (o && n++ < 6) { par.push(o.name || o.type); o = o.parent; }
    // apply the SOLVE's own kind of correction: an exact world-space rotation
    // at the shoulder, and see whether the barrel follows it 1:1
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0).normalize(), 0.35);
    const want = d0.clone().applyQuaternion(q);
    const save = J.quaternion.clone();
    const qW = J.getWorldQuaternion(new THREE.Quaternion());
    const qP = J.parent.getWorldQuaternion(new THREE.Quaternion());
    J.quaternion.copy(qP.invert()).multiply(qW.premultiply(q));
    J.updateWorldMatrix(false, true);
    const dVirtual = dir();
    f.mech.postAnimate?.();
    const dAfterSync = dir();
    // …and again, the way a servo would on the next frame
    f.mech.postAnimate?.();
    const dSettled = dir();
    J.quaternion.copy(save);
    out[name] = {
      parents: par.join(' < '),
      askedFor: 0.35,
      inFrame: +d0.angleTo(dVirtual).toFixed(3),
      afterSync: +d0.angleTo(dAfterSync).toFixed(3),
      errVsWanted: +want.angleTo(dAfterSync).toFixed(3),
      settledErr: +want.angleTo(dSettled).toFixed(3),
    };
  }
  return JSON.stringify(out, null, 1);
}));
await b.close();
