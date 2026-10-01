// TRAINING PARTNER, end to end through the real menus: lock a robot (the lone
// player gets a stand-in CPU), click its tag's ◀ down from ROOKIE to TRAINING
// PARTNER, pick an arena and fight. Asserts the match is a TRAINING SESSION
// (no clock, the trainer running), that the partner never moves on its own,
// and that destroying it somewhere OFF its pad brings it back THERE.
//   node tools/scratch/partner.mjs [baseUrl] [out.png]
import { launch } from '../lib/browser.mjs';
const base = process.argv[2] || 'http://localhost:5173';
const shot = process.argv[3] || null;
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => {
  window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [{ connected: true, index: 0, id: 'virtual', mapping: 'standard', axes: window.__pad.axes, buttons: window.__pad.buttons }, null, null, null];
  window.__press = (i, on) => { window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
});
await p.goto(`${base}/?music=0`, { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
const tapA = async () => {
  await p.evaluate(() => window.__press(0, true)); await p.waitForTimeout(700);
  await p.evaluate(() => window.__press(0, false)); await p.waitForTimeout(1400);
};
const mode = () => p.evaluate(() => window.__game?.S?.mode);
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

// title -> select, then lock (the lone locked player gets the stand-in CPU)
for (let i = 0; i < 4 && (await mode()) !== 'mechselect'; i++) await tapA();
await tapA();
// the CPU's tag: ◀ from ROOKIE is TRAINING PARTNER
const tagText = async () => p.evaluate(() => [...document.querySelectorAll('.sel-side.cpu .sd-tag')].map((e) => e.textContent).join('|'));
check(/ROOKIE/.test(await tagText()), `stand-in CPU starts on ROOKIE (${await tagText()})`);
await p.click('.sel-side.cpu .pc-diff[data-dir="-1"]');
await p.waitForTimeout(800);
check(/TRAINING PARTNER/.test(await tagText()), `◀ takes it to TRAINING PARTNER (${await tagText()})`);
if (shot) await p.screenshot({ path: shot });
// … and ◀ again wraps round to ACE, ▶ comes back (the ladder is DIFF_ORDER)
await p.click('.sel-side.cpu .pc-diff[data-dir="-1"]'); await p.waitForTimeout(600);
check(/ACE/.test(await tagText()), `◀ below the bottom wraps to ACE (${await tagText()})`);
await p.click('.sel-side.cpu .pc-diff[data-dir="1"]'); await p.waitForTimeout(600);
check(/TRAINING PARTNER/.test(await tagText()), `▶ from ACE wraps back (${await tagText()})`);
// arena select has no TRAINING card any more
for (let i = 0; i < 3 && (await mode()) !== 'arenaselect'; i++) await tapA();
const cards = await p.evaluate(() => [...document.querySelectorAll('.arena-card')].map((c) => c.textContent));
check(!cards.some((c) => /TRAINING/i.test(c)), `arena select carries no TRAINING card (${cards.length} cards)`);
for (let i = 0; i < 3 && (await mode()) !== 'battle'; i++) await tapA();
await p.waitForFunction(() => window.__game?.S?.battle && !window.__game.S.battle.loading, null, { timeout: 300000 });

const r = await p.evaluate(async () => {
  const G = window.__game, B = G.S.battle, eng = G.engine;
  eng._running = false;   // step it by hand from here: deterministic and fast
  const step = (s) => { for (let i = 0; i < s * 60; i++) G.tick(1 / 60); };
  const partner = B.fighters.find((f) => f.isAI), human = B.fighters.find((f) => !f.isAI);
  step(3.2);   // through the intro to FIGHT
  const out = { training: !!B.training, matchTraining: B.match.training, partnerFlag: !!partner.partner,
    diff: B.ais[0]?.diffName, state: B.match.state };
  // carry him off his pad, then leave him: he must stay put
  partner.pos.set(partner.pos.x + 18, 0, partner.pos.z - 9);
  const at = { x: partner.pos.x, z: partner.pos.z };
  step(2);
  out.drift = Math.hypot(partner.pos.x - at.x, partner.pos.z - at.z);
  out.intent = Math.hypot(partner.intent.moveX, partner.intent.moveZ);
  // destroy him there
  const deathAt = { x: partner.pos.x, z: partner.pos.z };
  partner.takeHit(partner.maxHp * 5, human, { knock: 0 });
  out.died = !partner.alive;
  step(3);
  out.back = partner.alive;
  out.hp = partner.hp / partner.maxHp;
  out.respawnOff = Math.hypot(partner.pos.x - deathAt.x, partner.pos.z - deathAt.z);
  out.timer = document.querySelector('.hud-timer, #hud-timer, .timer')?.textContent || null;
  return out;
});
check(r.training && r.matchTraining, `the match is a TRAINING SESSION (trainer ${r.training}, match.training ${r.matchTraining})`);
check(r.partnerFlag && r.diff === 'dummy', `the CPU is a partner (diff ${r.diff})`);
check(r.drift < 0.05 && r.intent === 0, `left alone off its pad it does not move (drift ${r.drift.toFixed(3)}, intent ${r.intent})`);
check(r.died && r.back && r.hp === 1, `destroyed, it comes back at full hp (died ${r.died}, back ${r.back}, hp ${r.hp})`);
check(r.respawnOff < 0.5, `…WHERE IT WENT DOWN (${r.respawnOff.toFixed(2)} units from the death spot)`);
if (errs.length) { console.log('PAGE ERRORS:', errs.join('\n')); fails++; }
console.log(fails ? `\n${fails} FAILURES` : '\nTRAINING PARTNER ✓');
await b.close();
process.exit(fails ? 1 : 0);
