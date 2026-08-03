// grid-sweep viper's shoulder/elbow for "blade tips touching behind the back".
// The tip is the REAL one: the farthest skinned vertex owned by the forearm/hand
// at bind, converted into the hand bone's local frame once, then carried by the
// bone through every candidate pose.
import { chromium } from 'playwright-core';
const mech = process.argv[2] || 'viper';
const grid = JSON.parse(process.argv[3] || 'null');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.error('ERR', String(e).slice(0, 200)));
await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 45000 });

const G = grid || { P: [0, 20, 40, 60, 80, 100], Y: [-80, -60, -40, -20, 0, 20, 40],
  R: [-60, -40, -20, 0, 20, 40, 60], E: [-20, -50, -80, -110, -140] };
const cands = [];
for (const P of G.P) for (const Y of G.Y) for (const R of G.R) for (const E of G.E) cands.push({ P, Y, R, E });

const rows = await page.evaluate(({ cands }) => {
  const m = window.__showcaseMechs[0], a = m.animator;
  window.__showcaseEngine.onUpdate = () => {};
  const ctx = { speed: 0, maxSpeed: 10, grounded: true, vy: 0, alwaysReady: true };
  const D2R = Math.PI / 180;
  let mesh = null; m.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const sk = mesh.skeleton, g = mesh.geometry, names = sk.bones.map((x) => x.name);
  const bi = g.attributes.skinIndex, bw = g.attributes.skinWeight, pos = g.attributes.position;
  const local = {};
  for (const side of ['L', 'R']) {
    const hb = m.boneMap['hand' + side], eb = m.boneMap['elbow' + side];
    const hi = names.indexOf(hb.name), ei = names.indexOf(eb.name);
    hb.updateWorldMatrix(true, false); eb.updateWorldMatrix(true, false);
    const he = hb.matrixWorld.elements, ee = eb.matrixWorld.elements;
    const hp = [he[12], he[13], he[14]], ep = [ee[12], ee[13], ee[14]];
    const d = [hp[0] - ep[0], hp[1] - ep[1], hp[2] - ep[2]];
    const L = Math.hypot(d[0], d[1], d[2]), u = d.map((v) => v / L);
    const mw = mesh.matrixWorld.elements;
    let best = -1e9, bp = null;
    for (let v = 0; v < pos.count; v++) {
      let own = -1, w = 0;
      for (let k = 0; k < 4; k++) { const ii = bi.getComponent(v, k), ww = bw.getComponent(v, k); if (ww > w) { w = ww; own = ii; } }
      if (own !== hi && own !== ei) continue;
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const p = [mw[0] * x + mw[4] * y + mw[8] * z + mw[12],
        mw[1] * x + mw[5] * y + mw[9] * z + mw[13],
        mw[2] * x + mw[6] * y + mw[10] * z + mw[14]];
      const t = (p[0] - ep[0]) * u[0] + (p[1] - ep[1]) * u[1] + (p[2] - ep[2]) * u[2];
      if (t > best) { best = t; bp = p; }
    }
    const inv = hb.matrixWorld.clone().invert().elements;
    local[side] = [inv[0] * bp[0] + inv[4] * bp[1] + inv[8] * bp[2] + inv[12],
      inv[1] * bp[0] + inv[5] * bp[1] + inv[9] * bp[2] + inv[13],
      inv[2] * bp[0] + inv[6] * bp[1] + inv[10] * bp[2] + inv[14]];
  }
  const tip = (side) => {
    const hb = m.boneMap['hand' + side]; hb.updateWorldMatrix(true, false);
    const e = hb.matrixWorld.elements, l = local[side];
    return [e[0] * l[0] + e[4] * l[1] + e[8] * l[2] + e[12],
      e[1] * l[0] + e[5] * l[1] + e[9] * l[2] + e[13],
      e[2] * l[0] + e[6] * l[1] + e[10] * l[2] + e[14]].map((v) => +v.toFixed(2));
  };
  const out = [];
  a.action = null;
  for (let i = 0; i < 40; i++) a.update(1 / 60, ctx);
  for (const c of cands) {
    const pose = { shoulderL: [c.P, -c.Y, -c.R], shoulderR: [c.P, c.Y, c.R],
      elbowL: [c.E, 0, 0], elbowR: [c.E, 0, 0] };
    for (let i = 0; i < 6; i++) {
      a.update(1 / 60, ctx);
      for (const [j, v] of Object.entries(pose)) {
        const t = a.cur[j]; if (t) { t[0] = v[0] * D2R; t[1] = v[1] * D2R; t[2] = v[2] * D2R; }
      }
      a.applyPose(a.cur); a.adapter?.sync?.();
    }
    out.push({ P: c.P, Y: c.Y, R: c.R, E: c.E, tL: tip('L'), tR: tip('R') });
  }
  const t = m.boneMap.torso; t.updateWorldMatrix(true, false);
  const te = t.matrixWorld.elements;
  return { out, torso: [te[12], te[13], te[14]].map((v) => +v.toFixed(2)) };
}, { cands });
await b.close();

const { out, torso } = rows;
console.log('torso', JSON.stringify(torso));
const score = (r) => {
  const [lx, ly, lz] = r.tL, [rx, ry, rz] = r.tR;
  const gap = Math.hypot(lx - rx, ly - ry, lz - rz);
  const mid = Math.abs((lx + rx) / 2 - torso[0]);
  const behind = Math.max(0, (lz + rz) / 2 - (torso[2] - 0.6)) * 3;
  const low = Math.max(0, torso[1] * 0.5 - (ly + ry) / 2);
  return gap + mid * 1.5 + behind + low;
};
out.sort((a, b) => score(a) - score(b));
for (const r of out.slice(0, 15))
  console.log(`P${r.P} Y${r.Y} R${r.R} E${r.E}  ${score(r).toFixed(2)}  L${JSON.stringify(r.tL)} R${JSON.stringify(r.tR)}`);
