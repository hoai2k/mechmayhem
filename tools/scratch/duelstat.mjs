// INSTRUMENTED AI DUELS — the balance measurement behind the gameplay audit.
//   node tools/scratch/duelstat.mjs "a:b,a:c,..." [arena] [diff]
// Each pairing is loaded once (?battle harness, no Match wrapper, so the
// first KO decides it) and stepped SYNCHRONOUSLY like tools/soak.mjs — but
// with none of soak's free-ult forcing, because this measures the game as
// played, not the code paths. Per duel it reports: winner, how (ko/hp),
// duration, and per side damage dealt, casts of special/ult, and the share
// of damage landed while the attacker was in a melee attack state.
// One JSON line per duel, so a driver can fan pairings over processes.
import { launch } from '../lib/browser.mjs';

const [pairsArg, arena = 'neon', diff = 'ace'] = process.argv.slice(2);
const pairs = pairsArg.split(',').map((s) => s.split(':'));
const CAP = 150 * 60;           // 150s of game time at 60 steps/s

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).slice(0, 200)));

for (const [a, b] of pairs) {
  await page.goto(
    `http://localhost:5173/?battle=${arena}&p1=${a}&p2=${b}&auto=1&diff=${diff}`,
    { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForFunction(() => window.__world && window.__ais && window.__fighters,
    null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  const out = await page.evaluate((CAP) => {
    const w = window.__world, ais = window.__ais, F = window.__fighters;
    const stat = F.map((f) => ({
      id: f.def.id, dealt: 0, meleeDealt: 0, specials: 0, ults: 0, koBy: null,
    }));
    const byF = new Map(F.map((f, i) => [f, stat[i]]));
    w.events.on('damage', ({ attacker, dmg }) => {
      const s = attacker && byF.get(attacker);
      if (!s) return;
      s.dealt += dmg;
      if (attacker.state === 'attack') s.meleeDealt += dmg;
    });
    w.events.on('special', ({ fighter }) => { const s = byF.get(fighter); if (s) s.specials++; });
    w.events.on('ult', ({ fighter }) => { const s = byF.get(fighter); if (s) s.ults++; });
    let ko = null;
    w.events.on('ko', ({ fighter, attacker }) => {
      if (ko) return;
      const s = byF.get(fighter);
      if (s) s.koBy = attacker?.def?.id || 'world';
      ko = { down: fighter.def.id, t: null };
    });
    let i = 0;
    try {
      for (; i < CAP && !ko; i++) {
        for (const ai of ais) ai.update(1 / 60);
        w.update(1 / 60);
      }
    } catch (e) {
      return { crash: String(e.stack || e).slice(0, 400) };
    }
    const t = i / 60;
    return {
      t: +t.toFixed(1),
      ko: ko ? ko.down : null,
      hp: F.map((f) => [f.def.id, Math.max(0, Math.round(f.hp)), f.maxHp]),
      stats: stat.map((s) => ({
        ...s,
        dealt: Math.round(s.dealt),
        meleeDealt: Math.round(s.meleeDealt),
        dps: +(s.dealt / t).toFixed(2),
      })),
    };
  }, CAP);
  console.log(JSON.stringify({ a, b, arena, ...out }));
}
await browser.close();
