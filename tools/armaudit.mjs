// ARM AUDIT — DOES THIS MECH EVER CARRY ITS ARMS BEHIND ITSELF?
//
//   node tools/armaudit.mjs <mech> [--frames 18] [--all]
//
// A raptor's forelimbs are WEAPONS held in front of the chest: they reach, they
// rake, they do not swing back like a jogger's. But the shared clip library was
// authored for a humanoid brawler, where an arm thrown back is a windup, a
// balance counter or simply where a hand ends up in a knockdown — so a mech
// wearing those clips can spend a good part of the fight with its claws
// trailing behind it, which is invisible in the numbers and obvious on screen.
//
// So this measures the RENDERED arm, per clip, per frame: the hand and the
// elbow against their own shoulder in the BODY's own frame (+z forward), as a
// fraction of body height. Negative is BEHIND the shoulder.
//
//   hand   the worst (most negative) forward offset the hand reaches
//   elbow  the same for the elbow — an elbow behind the shoulder is the tell
//          for an arm rotated back at the shoulder rather than merely reaching
//   t      when in the clip it happens
//
// A clip is FLAGGED when either goes further back than `--tol` (default 0.02
// of body height, i.e. a hair). Windups are real — a claw is chambered before
// it rakes — so the report also prints how LONG the arm spends behind the
// shoulder: a couple of frames on the way into a strike is a windup, a third
// of the clip is a pose.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : Number(args[i + 1]); };
const MECH = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || 'saurion';
const FRAMES = flag('frames', 18);
const TOL = flag('tol', 0.02);
const ALL = args.includes('--all');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`http://localhost:5173/?showcase=${MECH}&anim=none`, { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);

const out = await page.evaluate(async ({ FRAMES, ALL }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { CLIPS } = await import('/src/mechs/animations.js');
  const { mechClipList } = await import('/workbench/adapters/mechclips.js');
  const mech = window.__showcaseMechs?.[0];
  if (!mech) return { err: 'no showcase mech' };
  const anim = mech.animator;
  const H = (mech.dims.hipHeight + mech.dims.torsoH + mech.dims.headSize * 2) || 1;
  const inv = new THREE.Matrix4();
  const p = new THREE.Vector3();
  // MEASURED IN THE CHEST'S OWN FRAME, not the body's. "In front" means in
  // front of the ribcage the arms hang off: a mech pitched forward 60° while
  // dying has every forward-carried arm reading as behind him in world terms,
  // and that is the body falling over, not the arm going back.
  const CHEST = 'torso';
  // the RENDERED joint — a GLB drives model bones through the retarget, so the
  // virtual joint is not what the player sees (rigBones is what does)
  const at = (name) => {
    const b = mech.rigBones?.[name] || mech.joints?.[name];
    if (!b) return null;
    b.updateWorldMatrix(true, false);
    p.setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv);
    return { x: p.x, y: p.y, z: p.z };
  };
  const measure = () => {
    mech.group.updateMatrixWorld(true);
    const chest = mech.rigBones?.[CHEST] || mech.joints?.[CHEST];
    if (chest) { chest.updateWorldMatrix(true, false); inv.copy(chest.matrixWorld).invert(); }
    else inv.copy(mech.group.matrixWorld).invert();
    let hand = Infinity, elbow = Infinity, side = '?';
    for (const s of ['L', 'R']) {
      const sh = at('shoulder' + s), hd = at('hand' + s), el = at('elbow' + s);
      if (sh && hd && (hd.z - sh.z) / H < hand) { hand = (hd.z - sh.z) / H; side = s; }
      if (sh && el) elbow = Math.min(elbow, (el.z - sh.z) / H);
    }
    return { hand, elbow, side };
  };
  const step = (dt) => anim.update(dt, { speed: 0, maxSpeed: 10, grounded: true, vy: 0, state: 'normal' });

  anim.stop(0);
  for (let i = 0; i < 40; i++) step(1 / 60);
  const rest = measure();

  const listed = mechClipList(mech.def, mech.animProfile || null);
  const names = ALL ? Object.keys(CLIPS) : listed.map((c) => c.name);
  const rows = [];
  for (const name of names) {
    const clip = CLIPS[name];
    if (!clip) continue;
    anim.stop(0);
    for (let i = 0; i < 20; i++) step(1 / 60);
    anim.play(name, { fade: 0 });
    const dur = clip.dur || 1;
    let worst = { hand: Infinity, elbow: Infinity, side: '?', t: 0 };
    let back = 0;
    for (let k = 0; k <= FRAMES; k++) {
      const target = (k / FRAMES) * dur;
      let guard = 0;
      while ((anim.action?.t ?? dur) < target && guard++ < 400) step(1 / 120);
      const m = measure();
      if (m.hand < worst.hand) worst = { ...m, t: +target.toFixed(2) };
      if (m.hand < 0) back++;
    }
    rows.push({ name, ...worst, back: +(back / (FRAMES + 1)).toFixed(2), dur });
  }
  return { rest, rows, H: +H.toFixed(2) };
}, { FRAMES, ALL });

if (out.err) { console.error(out.err); await browser.close(); process.exit(1); }
console.log(`${MECH}: body height ${out.H}, arms measured against their own shoulder (+ = in front)`);
console.log(`standing: hand ${out.rest.hand.toFixed(3)}  elbow ${out.rest.elbow.toFixed(3)}\n`);
const rows = out.rows.sort((a, b) => a.hand - b.hand);
console.log('clip                     hand    elbow   side  t     behind');
let bad = 0;
for (const r of rows) {
  const flagged = r.hand < -TOL || r.elbow < -TOL;
  if (flagged) bad++;
  console.log(`${flagged ? '!' : ' '} ${r.name.padEnd(22)} ${r.hand.toFixed(3).padStart(6)} ${r.elbow.toFixed(3).padStart(7)}   ${r.side}    ${String(r.t).padStart(4)}  ${(r.back * 100).toFixed(0)}%`);
}
console.log(`\n${bad} of ${rows.length} clips carry an arm behind the shoulder (tol ${TOL})`);
if (errors.length) console.log('page errors:', errors.slice(0, 3));
await browser.close();
