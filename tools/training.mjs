// TRAINING MODE (src/game/training.js) — the rules and the checklist, driven
// through the real input path on the dev harness.
//
// Opens ?battle=uptown&p1=titanus&p2=viper&training=1 (P1 on keyboard 1, P2 a
// DUMMY), pauses the engine so the sim advances only when asked, then presses
// P1's actual keys step by step and asserts:
//   · the round clock is hidden — its slot reads TRAINING, no digits
//   · the checklist ticks IN ORDER, one step per thing actually done
//   · a KO respawns the body on its own pad at full hp
//   · the ult pouch never runs dry, and a second ult fires after the first
//   · ammo refills a second after a magazine empties, hp regenerates after
//     four quiet seconds
//   · the DUMMY never attacks, blocks or dashes over 20 s of being hit, and
//     walks back to its pad after being knocked off it
// Then a SECOND load with two human seats (&forcesplit=1, P3 the dummy) for
// the picture: the split HUD with a checklist under each plate.
//
// usage: node tools/training.mjs [out.png]
import { launch } from './lib/browser.mjs';

const out = process.argv[2] || 'training.png';
const BASE = 'http://localhost:5173/?battle=uptown&p1=titanus&p2=viper&training=1';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`;
  results.push(line);
  console.log(line);
  if (!ok) failed++;
};

async function open(url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__training && window.__fighters?.length, null, { timeout: 120000 });
  // capture mode: the sim advances only through sim(), so a slow renderer
  // cannot put the fight wherever it likes between two reads
  await page.evaluate(() => {
    const e = window.__engine;
    e.paused = true;
    // step() renders every call, which under SwiftShader is the whole cost;
    // this is step() without the draw
    window.__sim = (n) => {
      for (let i = 0; i < n; i++) {
        let dt = (1 / 60) * e.timeScale;
        if (e.hitStop > 0) { e.hitStop -= 1 / 60; dt *= 0.05; }
        e.elapsed += dt;
        e.onUpdate(dt);
        e.onRender?.(1 / 60);
      }
    };
  });
}
const sim = (n) => page.evaluate((n) => window.__sim(n), n);
const prog = () => page.evaluate(() => window.__training.progress(window.__fighters[0]));
const tap = async (code, hold = 2) => { await page.keyboard.down(code); await sim(hold); await page.keyboard.up(code); };

// ---------------------------------------------------------------- the rules
await open(BASE);
await sim(30);

// 1. the clock
const timer = await page.evaluate(() => {
  const el = document.querySelector('.hud-timer');
  return { text: el?.textContent || '', shown: !!el && getComputedStyle(el).display !== 'none' };
});
check('timer slot reads TRAINING, no count', timer.shown && timer.text === 'TRAINING' && !/\d/.test(timer.text), JSON.stringify(timer));
check('P1 has a checklist on its plate', await page.evaluate(() =>
  !!document.querySelector('.hud-plate .hud-train') && document.querySelectorAll('.hud-train').length === 1));

// 2. the checklist, in order, through P1's own keys (input.js KB1)
const expect = ['move', 'jump', 'hover', 'light', 'heavy', 'block', 'dash', 'ranged', 'special', 'ult', 'taunt'];
const order = [];
const after = async (name, fn) => {
  const before = (await prog()).done.length;
  await fn();
  const p = await prog();
  const gained = p.done.slice(before);
  order.push(...gained);
  check(`step ${name} ticked`, gained.length === 1 && gained[0] === name, `done=${p.done.join(',')}`);
};
let p0 = await prog();
check('checklist starts at MOVE', p0.step === 0 && p0.done.length === 0);
await after('move', async () => { await page.keyboard.down('KeyW'); await sim(90); await page.keyboard.up('KeyW'); await sim(30); });
await after('jump', async () => { await tap('Space'); await sim(8); });
await after('hover', async () => { await page.keyboard.down('Space'); await sim(30); await page.keyboard.up('Space'); await sim(120); });
await after('light', async () => { await tap('KeyF', 6); await sim(80); });
await after('heavy', async () => { await tap('KeyG', 8); await sim(120); });
await after('block', async () => { await tap('KeyH', 12); await sim(30); });
await after('dash', async () => {
  // the coil: hold the dash key standing, then push a direction
  await page.keyboard.down('ShiftLeft'); await sim(20);
  await page.keyboard.down('KeyW'); await sim(12);
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); await sim(60);
});
await after('ranged', async () => { await tap('KeyR', 10); await sim(90); });
await after('special', async () => { await tap('KeyT', 4); await sim(150); });
const ultBefore = await page.evaluate(() => window.__fighters[0].ultCharges);
await after('ult', async () => { await tap('KeyY', 4); await sim(300); });
await after('taunt', async () => { await tap('KeyB', 4); await sim(40); });
check('checklist ticked in order', order.join(',') === expect.join(','), order.join(','));
const fin = await prog();
check('FREE PLAY after the last step', fin.free && await page.evaluate(() =>
  document.querySelector('.hud-train').classList.contains('free') &&
  document.querySelector('.hud-train .train-title').textContent.includes('FREE PLAY')));

// 3. ult charges never run out: a second ult fires after the first
await sim(60);
const ultAgain = await page.evaluate(async () => {
  const f = window.__fighters[0];
  const charges = f.ultCharges;
  return { charges, state: f.state };
});
check('ult pouch refilled after the ult', ultBefore >= 1 && ultAgain.charges >= 1, JSON.stringify({ ultBefore, ...ultAgain }));
await tap('KeyY', 4);
const ult2 = await page.evaluate(() => window.__fighters[0].state);
check('a second ult fires', ult2 === 'ult', ult2);
await sim(300);

// 4. a KO is a respawn on your own pad at full hp
const ko = await page.evaluate(async () => {
  const F = window.__fighters, w = window.__world;
  const pad = w.arena.spawnPoints(F.length)[0].pos;
  F[0].iframes = 0;
  F[0].takeHit(99999, F[1], { srcPos: F[1].pos });
  window.__sim(3);
  const down = { alive: F[0].alive, hp: F[0].hp };
  window.__sim(60);
  const gone = { alive: F[0].alive, visible: F[0].group.visible };
  window.__sim(60);
  const back = {
    alive: F[0].alive, hp: F[0].hp, max: F[0].maxHp,
    fromPad: +Math.hypot(F[0].pos.x - pad.x, F[0].pos.z - pad.z).toFixed(2), iframes: F[0].iframes > 0,
  };
  return { down, gone, back };
});
check('KO puts the body down', !ko.down.alive);
check('...it fades out where it fell', !ko.gone.alive);
check('...and respawns at full hp on its pad', ko.back.alive && ko.back.hp === ko.back.max && ko.back.fromPad < 1 && ko.back.iframes, JSON.stringify(ko.back));

// 5. hp regenerates (ammo is checked on the second load, where vulcan has a magazine)
const regen = await page.evaluate(() => {
  const f = window.__fighters[0];
  f.hp = f.maxHp * 0.5;
  window.__sim(180);           // 3 s: still waiting
  const at3 = f.hp / f.maxHp;
  window.__sim(120);           // 5 s: climbing
  const at5 = f.hp / f.maxHp;
  window.__sim(120);           // 7 s: full
  return { at3: +at3.toFixed(2), at5: +at5.toFixed(2), at7: +(f.hp / f.maxHp).toFixed(2) };
});
check('hp regenerates after 4 quiet seconds', regen.at3 <= 0.5 && regen.at5 > 0.5 && regen.at7 === 1, JSON.stringify(regen));

// 6. the dummy: 20 s of being hit, never a swing back; knocked off its pad,
//    it walks home
const dummy = await page.evaluate(() => {
  const F = window.__fighters, w = window.__world;
  const d = F[1], me = F[0];
  const home = w.arena.spawnPoints(F.length)[1].pos;
  me.iframes = 0;
  // stand P1 in its face
  me.pos.set(home.x + Math.sin(home.z > 0 ? 0 : Math.PI) * 4, 0, home.z + 4);
  const bad = new Set(['attack', 'special', 'ult', 'dash', 'channel']);
  let offences = 0, blocks = 0, hitsLanded = 0, hpMin = d.maxHp, facedFrames = 0, normalFrames = 0;
  for (let i = 0; i < 1200; i++) {
    // a hit every second, straight from P1
    if (i % 60 === 0 && d.alive) { const h = d.hp; d.iframes = 0; d.takeHit(6, me, { srcPos: me.pos }); if (d.hp < h) hitsLanded++; }
    window.__sim(1);
    if (bad.has(d.state)) offences++;
    if (d.blocking) blocks++;
    hpMin = Math.min(hpMin, d.hp);
    if (d.alive && d.state === 'normal') {
      normalFrames++;
      const want = Math.atan2(w.wrapDelta(me.pos.x - d.pos.x), w.wrapDelta(me.pos.z - d.pos.z));
      let dy = Math.abs(d.yaw - want) % (Math.PI * 2);
      if (dy > Math.PI) dy = Math.PI * 2 - dy;
      if (dy < 0.35) facedFrames++;
    }
  }
  // shove it off its pad
  d.pos.set(home.x + 24, 0, home.z);
  let dist0 = 24, t0 = -1;
  for (let i = 0; i < 600; i++) {
    window.__sim(1);
    const dd = Math.hypot(w.wrapDelta(d.pos.x - home.x), w.wrapDelta(d.pos.z - home.z));
    if (dd < 3 && t0 < 0) t0 = i / 60;
    dist0 = dd;
  }
  return { offences, blocks, hitsLanded, hpMin: +hpMin.toFixed(0), facedShare: +(facedFrames / Math.max(1, normalFrames)).toFixed(2), walkedHomeAt: t0, endDist: +dist0.toFixed(1) };
});
check('dummy never attacks / dashes over 20 s', dummy.offences === 0, JSON.stringify(dummy));
check('dummy never blocks', dummy.blocks === 0);
check('dummy took the hits', dummy.hitsLanded >= 15);
check('dummy faces the nearest human', dummy.facedShare > 0.6, `faced ${dummy.facedShare}`);
check('dummy walks back to its pad', dummy.walkedHomeAt >= 0 && dummy.endDist < 3, `home at ${dummy.walkedHomeAt}s, ends ${dummy.endDist}`);

// ---------------------------------------------------------------- the picture
// two human seats (P1, P2) and a dummy (P3, vulcan): a checklist under each plate
await open(BASE.replace('p2=viper', 'p2=viper&p3=vulcan') + '&forcesplit=1');
await sim(30);
const ammo = await page.evaluate(() => {
  const F = window.__fighters;
  const f = F.find((x) => x.ammoMax !== undefined);
  if (!f) return null;
  f.ammo = 0;
  window.__sim(30);
  const half = f.ammo;
  window.__sim(45);
  return { mech: f.def.id, half, after: f.ammo, max: f.ammoMax };
});
check('ammo refills a second after it empties', !!ammo && ammo.half === 0 && ammo.after === ammo.max, JSON.stringify(ammo));
check('the dummy is the last slot, the rest are seats', await page.evaluate(() =>
  window.__fighters.map((f) => f.isAI).join(',') === 'false,false,true'));
// give P1 a couple of ticks so the chips show
await page.keyboard.down('KeyW'); await sim(90); await page.keyboard.up('KeyW'); await sim(20);
await tap('Space'); await sim(8);
await page.keyboard.down('Space'); await sim(30); await page.keyboard.up('Space'); await sim(60);
await page.evaluate(() => { window.__engine.step(1 / 60); window.__engine.step(1 / 60); });
const layout = await page.evaluate(() => {
  const W = innerWidth, H = innerHeight;
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const plates = [...document.querySelectorAll('.hud-plate')].map(r);
  const lists = [...document.querySelectorAll('.hud-train')].map((el) => ({ ...r(el), text: el.textContent.trim().slice(0, 60) }));
  const overlap = (a, b) => !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);
  let overlaps = 0;
  for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) if (overlap(plates[i], plates[j])) overlaps++;
  const inside = plates.every((p) => p.x >= 0 && p.y >= 0 && p.r <= W && p.b <= H);
  return { plates: plates.length, lists: lists.length, overlaps, inside, listText: lists.map((l) => l.text) };
});
check('two-seat HUD: a checklist per human, plates do not overlap and stay on screen',
  layout.lists === 2 && layout.overlaps === 0 && layout.inside, JSON.stringify(layout));
// let RAF present frames again for the capture (SwiftShader is slow enough
// that a paused engine's every-8th-frame render can starve the screenshot)
await page.evaluate(() => { window.__engine.paused = false; });
await page.screenshot({ path: out, timeout: 180000 });
console.log(`screenshot: ${out}`);

// ---------------------------------------------------------------- three seats
// the 3-player layout puts every plate in the top-right STATS PANEL, so the
// three checklists have to fit in there with the dummy's plate — one line each.
// (Judged at the panel's own reference size, tools/scratch/split3.mjs' 1280x720:
// four bare plates already outgrow a 540-tall panel with no checklist at all.)
await page.setViewportSize({ width: 1280, height: 720 });
await open(BASE.replace('p2=viper', 'p2=viper&p3=vulcan&p4=wraith') + '&forcesplit=1');
await sim(30);
await page.evaluate(() => { window.__engine.step(1 / 60); });
const panel = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; };
  const P = r(document.getElementById('hud-stats'));
  const plates = [...document.querySelectorAll('.hud-plate')].map(r);
  const overlap = (a, b) => !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);
  let overlaps = 0;
  for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) if (overlap(plates[i], plates[j])) overlaps++;
  const inPanel = plates.every((p) => p.x >= P.x - 1 && p.y >= P.y - 1 && p.r <= P.r + 1 && p.b <= P.b + 1);
  return { plates: plates.length, lists: document.querySelectorAll('.hud-train').length, overlaps, inPanel, panel: P, last: plates[plates.length - 1] };
});
check('three-seat HUD: every plate (checklist included) fits the stats panel',
  panel.plates === 4 && panel.lists === 3 && panel.overlaps === 0 && panel.inPanel, JSON.stringify(panel));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
