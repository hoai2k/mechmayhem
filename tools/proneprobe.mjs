// PRONE PROBE — when he is knocked down, is he actually ON THE GROUND?
//
//   node tools/proneprobe.mjs [mech …] [--frames 10] [--stride 7]
//
// THE BUG IT EXISTS FOR. A downed body is floor-clamped (gltf.js groundClamp,
// called by Fighter.update for knockdown/getup): the whole model is shifted
// vertically until its LOWEST RENDERED POINT rests on y=0. That is the right
// rule for a body lying flat — and the wrong one the moment anything THIN hangs
// below it, because a tail tip, a horn or a shoulder spike then takes the
// clamp's weight and holds the torso in the air. Fenrir on his back propped up
// on his own blade-tail is the visible version; a mech resting on a chimney is
// the subtle one nobody can name but everybody sees.
//
// So this reports two heights, not one:
//   floor    the lowest rendered vertex — 0 by construction, and the part that
//            owns it, which is WHAT HE IS RESTING ON. That name is the whole
//            diagnosis.
//   body     the lowest vertex of the CORE (hips/torso/chest/head geometry —
//            the parts of him that are supposed to be touching). How far this
//            sits above the floor IS the float, measured in body heights so
//            mechs of different sizes compare.
//
// A body lying on its back does not put its spine on the concrete — armour,
// shoulder blades and backpack hold it up — so a few percent is correct and
// only a real gap is a fault. The limit is `--lift` (default 0.10 of body
// height), which is about the thickness of a mech's back plate.
//
// Needs `npm run dev`.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : Number(args[i + 1]); };
const FRAMES = flag('frames', 10);
const STRIDE = flag('stride', 7);
const LIFT = flag('lift', 0.10);
const ids = args.filter((a) => !a.startsWith('--') && !/^[\d.]+$/.test(a));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

const roster = ids.length ? ids : await (async () => {
  await page.goto('http://localhost:5173/?showcase=titanus&anim=none', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 120000 });
  return page.evaluate(async () => (await import('/src/mechs/roster.js')).ROSTER.map((d) => d.id));
})();

console.log(`prone float, ${roster.length} mech(s) — "resting on" is the part the clamp is standing the body on`);
console.log('mech        clip          rest-on              body float   verdict');

let bad = 0;
for (const mech of roster) {
  await page.goto(`http://localhost:5173/?showcase=${mech}&anim=none`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__showcaseMechs?.[0], { timeout: 120000 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(async ({ FRAMES, STRIDE }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { CLIPS } = await import('/src/mechs/animations.js');
    const mech = window.__showcaseMechs?.[0];
    if (!mech) return { err: 'no showcase mech' };
    const anim = mech.animator;
    let skin = null;
    mech.group.traverse((o) => { if (o.isSkinnedMesh && !skin) skin = o; });
    if (!skin) return { err: 'procedural build — nothing to clamp' };
    const pos = skin.geometry.attributes.position;
    const si = skin.geometry.attributes.skinIndex, sw = skin.geometry.attributes.skinWeight;
    const names = skin.skeleton.bones.map((b) => b.name);
    // WHICH BONES ARE "THE BODY". Named through the mech's own boneMap, which
    // is the only thing that knows what this rig calls its spine — a raw name
    // match would miss `tripo0_Right_Limb_1` and every other auto-rig noun.
    const core = new Set();
    for (const j of ['hips', 'torso', 'head']) {
      const b = mech.boneMap?.[j];
      if (b) core.add(b.name);
    }
    const isCore = names.map((n) => core.has(n));
    const v = new THREE.Vector3();
    const owner = (i) => {
      let best = -1, bi = 0;
      for (let c = 0; c < 4; c++) {
        const w = sw.getComponent(i, c);
        if (w > best) { best = w; bi = si.getComponent(i, c); }
      }
      return bi;
    };
    const scan = () => {
      mech.group.updateMatrixWorld(true);
      let lo = Infinity, at = -1, coreLo = Infinity;
      for (let i = 0; i < pos.count; i += STRIDE) {
        v.fromBufferAttribute(pos, i);
        skin.applyBoneTransform(i, v);
        skin.localToWorld(v);
        const bi = owner(i);
        if (v.y < lo) { lo = v.y; at = bi; }
        if (isCore[bi] && v.y < coreLo) coreLo = v.y;
      }
      return { lo, coreLo, bone: names[at] || '?' };
    };
    const step = (dt, down) => {
      anim.update(dt, { speed: 0, maxSpeed: 10, grounded: true, vy: 0, state: down ? 'knockdown' : 'normal' });
      mech.groundClamp?.(down);
    };
    // the mech's own height, so a float is reported as a fraction of him
    mech.group.updateMatrixWorld(true);
    const H = new THREE.Box3().setFromObject(mech.group).max.y || 1;
    const rows = [];
    // The two poses a body actually SETTLES in: the knockdown loop, and the
    // death ragdoll. (`proneBack` is the ROLLOVER loop and only ever arrives
    // through `flipOver`, whose last key it starts from — played cold from a
    // standing rest it is not a pose the game ever shows.)
    for (const name of ['knockdown', 'ragdoll']) {
      if (!CLIPS[name]) continue;
      anim.stop(0);
      for (let i = 0; i < 20; i++) step(1 / 60, false);
      anim.play(name, { fade: 0 });
      // RUN IT OUT AND LET IT SETTLE. A knockdown clip STARTS standing, so
      // sampling across the whole thing measures the fall, not the landing —
      // "prone" is the held end of the clip plus enough frames for the pose
      // smoother to arrive there.
      const dur = CLIPS[name].dur || 1;
      let guard = 0;
      while ((anim.action?.t ?? dur) < dur && guard++ < 1200) step(1 / 120, true);
      let worst = null;
      for (let k = 0; k <= FRAMES; k++) {
        for (let i = 0; i < 6; i++) step(1 / 60, true);
        const s = scan();
        if (!worst || s.coreLo > worst.coreLo) worst = s;
      }
      rows.push({ name, ...worst });
    }
    return { rows, H, core: [...core] };
  }, { FRAMES, STRIDE });

  if (out.err) { console.log(`${mech.padEnd(11)} ${out.err}`); continue; }
  for (const r of out.rows) {
    const float = r.coreLo / out.H;
    const over = float > LIFT;
    if (over) bad++;
    console.log(`${mech.padEnd(11)} ${r.name.padEnd(13)} ${r.bone.padEnd(20)} `
      + `${(float * 100).toFixed(1).padStart(6)}%     ${over ? 'FLOATING' : 'ok'}`
      + (Math.abs(r.lo) > 0.02 * out.H ? `   (floor off by ${(r.lo / out.H * 100).toFixed(1)}%)` : ''));
  }
}
console.log(`\n${bad} clip(s) leave the body more than ${(LIFT * 100).toFixed(0)}% of its height off the ground.`);
if (errors.length) console.log('page errors:', errors.slice(0, 3));
await browser.close();
process.exit(bad ? 1 : 0);
