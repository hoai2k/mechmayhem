// THE 3+ ROBOT BRAWL, and the per-round arena change — the two match rules
// that only exist above two players.
//
// It drives the REAL match (dev harness world + a real Match), kills fighters
// on demand and checks what the rules do:
//   · a KO with 3+ in the fight is a RESPAWN, not the end of the round
//   · the wreck fades out where it fell before the body comes back
//   · the round ends the moment one robot is the only one with a clean sheet
//   · at the bell it is fewest DEATHS, not most health
//   · a duel is untouched: one KO still ends the round
//   · ONE person against three CPUs is a gauntlet, not a brawl — no respawns
//
// usage: node tools/brawl.mjs [waitMs]
import { launch } from './lib/browser.mjs';

const [waitMs = '30000'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/?battle=neon&p1=titanus&p2=viper&p3=vulcan&p4=wraith&auto=1',
  { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, F = window.__fighters;
  const { Match } = await import('/src/game/match.js');
  const dt = 1 / 60;
  const R = {};
  // a HUD stand-in: the match only ever calls these three
  const hud = { announce() {}, callout() {}, setDeaths() {}, update() {} };
  const mk = (fighters, humans = fighters.length) => new Match({
    engine: window.__engine, world: w, fighters, hud, humans,
    onEnd: () => { R.ended = true; },
  });
  const step = (n, m) => { for (let i = 0; i < n; i++) { w.update(dt); m.update(dt); } };
  const toFight = (m) => { m.begin(); for (let i = 0; i < 200 && m.state !== 'fight'; i++) { w.update(dt); m.update(dt); } };
  window.__ais.length = 0;
  for (const f of F) f.controlsLocked = true;

  // ---- 1. FOUR ROBOTS: a KO is a respawn ----
  let m = mk(F);
  toFight(m);
  R.brawl = m.brawl;
  R.stateAtStart = m.state;
  F[1].takeHit(99999, F[0], { srcPos: F[0].pos });
  step(2, m);
  R.afterOneKO = { state: m.state, deaths: F[1].deaths, respawning: m.respawns.length };
  // the wreck fades where it fell...
  step(60, m);
  R.midFade = { opacityish: +(F[1].mech.group.children[0]?.visible !== false), fading: m.respawns.length };
  const downPos = F[1].pos.clone();
  step(180, m);
  R.afterRespawn = {
    alive: F[1].alive, hp: F[1].hp === F[1].maxHp, visible: F[1].group.visible,
    moved: +downPos.distanceTo(F[1].pos).toFixed(1) > 1, iframes: F[1].iframes > 0,
    state: m.state, respawning: m.respawns.length,
  };

  // ---- 2. the last CLEAN SHEET wins it outright ----
  F[2].takeHit(99999, F[0], { srcPos: F[0].pos });
  step(2, m);
  R.afterTwoDown = { state: m.state, winner: null };
  F[3].takeHit(99999, F[0], { srcPos: F[0].pos });
  step(2, m);
  R.afterThreeDown = { state: m.state, winner: m.pendingWinner?.def.id || null };

  // ---- 3. TIMEOUT is decided on deaths, not health ----
  m.destroy();
  m = mk(F);
  toFight(m);
  F.forEach((f) => { f.deaths = 0; f.hp = f.maxHp; });
  F[0].deaths = 2; F[1].deaths = 1; F[2].deaths = 3;
  F[3].deaths = 1; F[3].hp = F[3].maxHp * 0.2;   // fewest deaths, WORST health
  F[1].hp = F[1].maxHp * 0.9;
  m.timeLeft = 0.001;
  step(3, m);
  R.timeout = { state: m.state, winner: m.pendingWinner?.def.id || null, expect: 'viper (1 death, 90% hp)' };
  m.destroy();

  // ---- 3b. ONE PERSON vs THREE CPUs IS A GAUNTLET, NOT A BRAWL ----
  for (const f of F) { f.hp = f.maxHp; f.alive = true; f.deaths = 0; }
  m = mk(F, 1);
  toFight(m);
  R.soloVsCpus = { brawl: m.brawl };
  F[1].takeHit(99999, F[0], { srcPos: F[0].pos });
  step(3, m);
  R.soloVsCpusAfterKO = { state: m.state, respawning: m.respawns.length };
  m.destroy();

  // ---- 4. A DUEL IS UNTOUCHED ----
  const two = F.slice(0, 2);
  for (const f of two) { f.hp = f.maxHp; f.alive = true; f.deaths = 0; }
  m = mk(two);
  toFight(m);
  R.duelBrawl = m.brawl;
  two[1].takeHit(99999, two[0], { srcPos: two[0].pos });
  step(3, m);
  R.duelAfterKO = { state: m.state, ended: m.state !== 'fight' };
  m.destroy();
  return R;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
