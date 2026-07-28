// Strike-aim screenshot: stand two mechs a punch apart, throw one blow, and
// FREEZE THE IMPACT FRAME side-on, so you can see where the fist arrived on
// the other body. Renders the same swing twice — aim servo off, then on —
// into <out>-off.png / <out>-on.png.
//
//   node tools/aimshot.mjs <attacker> <victim> <out-prefix> [light|heavy] [dist]
//
// (Needs the dev server: it mutates MELEE.AIM_PITCH live.)
import { chromium } from 'playwright-core';

const [atkId, vicId, out, move = 'light', dist = '5'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tools/aimshot.mjs <attacker> <victim> <out-prefix> [light|heavy] [dist]');
  process.exit(1);
}
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

for (const pitch of [false, true]) {
  await page.goto(`http://localhost:5173/?battle=neon&p1=${atkId}&p2=${vicId}&auto=1`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const info = await page.evaluate(async ({ move, dist, pitch }) => {
    const hb = await import('/src/combat/hurtbox.js');
    if (window.__aimPitch0 === undefined) window.__aimPitch0 = hb.MELEE.AIM_PITCH;
    hb.MELEE.AIM_PITCH = pitch ? window.__aimPitch0 : 0;
    const w = window.__world, [atk, vic] = window.__fighters;
    window.__ais.length = 0;                  // hand-drive both
    const V = atk.pos.constructor;
    const clear = (f) => {
      const I = f.intent;
      I.moveX = I.moveZ = 0;
      I.jump = I.light = I.heavy = I.ranged = I.special = I.ult = I.block = I.dash = false;
      I.lightHeld = I.heavyHeld = false;
    };
    atk.resetForRound(new V(0, 0, 0), 0);
    vic.resetForRound(new V(0, 0, Number(dist)), Math.PI);
    clear(atk); clear(vic);
    w.clearTransient();
    for (let i = 0; i < 30; i++) w.update(1 / 60);   // settle onto the floor
    // fire ONE blow and stop the world on the frame it lands
    let hitAt = null, tipY = null;
    const proto = Object.getPrototypeOf(atk);
    const orig = proto.onAttackEvent;
    proto.onAttackEvent = function (type, arg, atkArg) {
      const r = orig.call(this, type, arg, atkArg);
      if (type === 'hit' && this === atk && hitAt === null) {
        const a = new V(), b = new V();
        this.strikeVolume(atkArg, a, b);
        tipY = (b.y - vic.pos.y) / vic.height;
        hitAt = w.time;
      }
      return r;
    };
    for (let i = 0; i < 180 && hitAt === null; i++) {
      atk.intent[move] = i < 3;
      w.update(1 / 60);
    }
    proto.onAttackEvent = orig;
    // side-on camera, framed on the pair
    const e = w.engine;
    e.onRender = null;
    const midY = Math.max(atk.height, vic.height) * 0.55;
    const gap = Math.abs(vic.pos.z - atk.pos.z);
    const d = Math.max(atk.height, vic.height) * 1.5 + gap * 0.8;
    e.camera.position.set(d, midY, gap * 0.5);
    e.camera.lookAt(0, midY, gap * 0.5);
    e.camera.updateProjectionMatrix();
    return {
      landed: hitAt !== null,
      tipFrac: tipY === null ? null : +tipY.toFixed(2),
      band: [hb.MELEE.AIM_LO, hb.MELEE.AIM_HI],
      pitch: +(atk._aimPitch || 0).toFixed(2), drv: atk._pitchDrv || '-',
      heights: [+atk.height.toFixed(1), +vic.height.toFixed(1)],
    };
  }, { move, dist, pitch });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}-${pitch ? 'on' : 'off'}.png` });
  console.log(`${pitch ? 'servo ON ' : 'servo OFF'}`, JSON.stringify(info));
}
if (errors.length) console.log('page errors:', errors.slice(0, 4));
await browser.close();
