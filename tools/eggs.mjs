// SAURION'S CLUTCH, measured (combat/eggs.js + the raptorPack ult).
//
//   · the cast lays eggs rather than dropping robots, and costs nothing
//   · an egg is 75% of his height and ROLLS when it is shoved
//   · HIS OWN hit shoves it and does no damage; ANOTHER robot's hit wounds it —
//     one MELEE blow (or a blast) breaks a shell outright, a BULLET takes two —
//     and a broken shell hatches nothing
//   · hatching is staggered — at most one every couple of seconds — and waits
//     for the body to be built
//   · the hatchling arrives curled and unfolds to full size
//
// usage: node tools/eggs.mjs [waitMs]
import { chromium } from 'playwright-core';

const [waitMs = '30000'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/?battle=neon&p1=saurion&p2=titanus', { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, F = window.__fighters;
  const [s, foe] = F;
  const dt = 1 / 60;
  window.__ais.length = 0;
  foe.controlsLocked = true;
  const R = {};
  const step = (n) => { for (let i = 0; i < n; i++) w.update(dt); };
  const reset = () => {
    w.eggs.clear();
    w.minions.length = 0;
    for (const f of w.fighters.slice(2)) w.scene.remove(f.group);
    w.fighters.length = 2;
    s.pos.set(0, 0, 0); s.yaw = s.targetYaw = 0; s.vel.set(0, 0, 0);
    foe.pos.set(0, 0, 26); foe.vel.set(0, 0, 0);
    s.intent.moveX = s.intent.moveZ = 0;
  };

  // ---- 1. THE CAST: eggs, not robots, and no stall ----
  // a real round warms the shell assets and the bodies during the intro
  // (match.js prewarmSummons) — do the same, or this measures the warm-up
  const { prewarmSummons } = await import('/src/combat/specials.js');
  for (let i = 0; i < 6; i++) prewarmSummons(s, 1);
  reset();
  s.ult = 1; s.ultCharges = 1;
  const t0 = performance.now();
  s.doUlt();
  const castMs = +(performance.now() - t0).toFixed(2);
  const peaks = [];
  for (let i = 0; i < 90; i++) { const a = performance.now(); w.update(dt); peaks.push(performance.now() - a); }
  peaks.sort((a, b) => b - a);
  R.cast = {
    castMs, worstFrameMs: +peaks[0].toFixed(2),
    eggs: w.eggs.eggs.length, minionsYet: w.minions.length,
    sizeVsSaurion: +(w.eggs.eggs[0] ? (w.eggs.eggs[0].L * 2) / s.baseHeight : 0).toFixed(2),
  };

  // ---- 2. HIS OWN HIT SHOVES IT (no damage) ----
  const e0 = w.eggs.eggs[0];
  const before = { hp: e0.hp, x: e0.pos.x, z: e0.pos.z };
  w.eggs.hit(e0, s, { x: 1, y: 0, z: 0 }, 1);
  step(45);
  R.ownerShove = {
    hpBefore: before.hp, hpAfter: e0.hp,
    rolled: +Math.hypot(e0.pos.x - before.x, e0.pos.z - before.z).toFixed(1),
    spinning: Math.abs(e0.roll) > 0.5,
  };

  // ---- 3. AN ENEMY'S SHOT WOUNDS IT; THE SECOND DESTROYS IT ----
  const { EGG_DMG_SHOT, EGG_DMG_MELEE } = await import('/src/combat/eggs.js');
  const e1 = w.eggs.eggs[1];
  const p1 = { x: e1.pos.x, z: e1.pos.z };
  w.eggs.hit(e1, foe, { x: 1, y: 0, z: 0 }, 1, EGG_DMG_SHOT);
  const afterOne = { hp: e1.hp, flashing: e1.flash > 0, alive: e1.state !== 'dead' };
  step(20);
  const rolledByEnemy = +Math.hypot(e1.pos.x - p1.x, e1.pos.z - p1.z).toFixed(1);
  w.eggs.hit(e1, foe, { x: 1, y: 0, z: 0 }, 1, EGG_DMG_SHOT);
  step(5);
  R.enemyShots = {
    afterOne, rolledByEnemy,
    afterTwo: { gone: !w.eggs.eggs.includes(e1) || e1.state === 'dead' },
    minionsFromIt: w.minions.length,
  };

  // ---- 3b. ONE MELEE BLOW IS THE WHOLE SHELL ----
  // measured through the REAL swing, not the damage call: foe walks onto the
  // last egg and throws a light, which is what a player actually does
  const e2 = w.eggs.eggs.find((e) => e.state !== 'dead');
  let meleeOneShot = 'no egg left';
  if (e2) {
    const hpBefore = e2.hp;
    w.eggs.hit(e2, foe, { x: 1, y: 0, z: 0 }, 1, EGG_DMG_MELEE);
    step(5);
    meleeOneShot = {
      hpBefore, gone: !w.eggs.eggs.includes(e2) || e2.state === 'dead',
      hatchedAnything: w.minions.length,
    };
  }
  // …and SAURION's own melee still only shoves, at full damage
  reset();
  s.ult = 1; s.ultCharges = 1; s.doUlt();
  step(45);
  const mine = w.eggs.eggs[0];
  const hpMine = mine.hp;
  w.eggs.hit(mine, s, { x: 1, y: 0, z: 0 }, 1, EGG_DMG_MELEE);
  step(30);
  R.melee = {
    enemyOneShot: meleeOneShot,
    ownerMeleeUnhurt: { hp: mine.hp, wasHp: hpMine, alive: mine.state !== 'dead' },
  };

  // ---- 4. HATCHING: staggered, and only when the body is ready ----
  reset();
  s.ult = 1; s.ultCharges = 1; s.doUlt();
  const hatchTimes = [];
  let seen = 0;
  for (let i = 0; i < 60 * 16; i++) {
    w.update(dt);
    if (w.minions.length > seen) { seen = w.minions.length; hatchTimes.push(+(i / 60).toFixed(2)); }
  }
  R.hatching = {
    hatched: w.minions.length,
    atSeconds: hatchTimes,
    gaps: hatchTimes.slice(1).map((t, i) => +(t - hatchTimes[i]).toFixed(2)),
    eggsLeft: w.eggs.eggs.length,
  };
  const cub = w.minions[0]?.f || w.fighters[2];
  R.hatchling = cub ? {
    alive: cub.alive, isMinion: !!cub.isMinion, ally: cub.allyOf === s,
    hp: cub.hp, scale: +cub.group.scale.x.toFixed(2), controls: !cub.controlsLocked,
  } : 'none';
  return R;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
