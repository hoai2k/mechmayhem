// THE CPU'S FLOOR SENSE, MEASURED (src/game/ai.js `steerClear`).
//   node tools/scratch/aifloor.mjs ["<battle url>"] [seconds] [repeats] [scatter]
// Drives a ?battle harness synchronously (like tools/soak.mjs — no Match
// wrapper) and, per CPU, counts the frames it spends standing ON a lava/acid
// lane or patch, the direct hazard ticks it eats (world damage: attacker
// null while on the hazard), the burn DOT that follows (status.burn drained
// per frame) and how many explosive props got set off. Health is refilled
// every 10 s so a KO cannot end the walk early — this measures where the
// CPU WALKS, not who wins. Run at HEAD, then with the ai.js change, and read
// the two side by side; the fight is random, so `repeats` (default 3) are
// summed and a small move is noise. A duel mostly stays in the spawn plaza,
// which the hazards keep out of, so `scatter` (default 1) also TELEPORTS one
// robot every 10 s to a clear standing spot 48-62 units out — past the lava
// ring — so the other has to cross the arena to reach it; 0 leaves the fight
// where it goes on its own.
import { launch } from '../lib/browser.mjs';

const [
  url = 'http://localhost:5173/?battle=volcano&p1=titanus&p2=viper&auto=1&diff=veteran',
  secondsArg = '60',
  repeatsArg = '3',
  scatterArg = '1',
] = process.argv.slice(2);
const SECS = Number(secondsArg), REPEATS = Number(repeatsArg), SCATTER = Number(scatterArg);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).slice(0, 300)));

const totals = {};
for (let run = 0; run < REPEATS; run++) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForFunction(() => window.__world && window.__ais && window.__fighters,
    null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  const out = await page.evaluate(([SECS, SCATTER]) => {
    const w = window.__world, ais = window.__ais, F = window.__fighters;
    const T = w.arena.terrain, A = w.arena;
    const hazAt = (x, z) => {
      const l = T.onLane(x, z, 0);
      if (l?.hazard) return l.hazard;
      return T.onPatch(x, z, 0)?.hazard || null;
    };
    const stat = F.map((f) => ({
      id: f.def.id, ai: !!f.isAI, frames: 0, lavaFrames: 0, lavaTicks: 0, lavaDmg: 0, burnDmg: 0, propBumps: 0,
    }));
    const byF = new Map(F.map((f, i) => [f, stat[i]]));
    w.events.on('damage', ({ fighter, attacker, dmg }) => {
      const s = byF.get(fighter);
      if (!s || attacker) return;
      const h = hazAt(fighter.pos.x, fighter.pos.z);
      if (h === 'lava' || h === 'acid') { s.lavaTicks++; s.lavaDmg += dmg; }
    });
    const dt = 1 / 60, N = Math.round(SECS * 60);
    const boomsBefore = A.explosives.filter((e) => e.dead).length;
    // a prop bump: standing inside the broad-phase cylinder plus a body radius
    const bumped = (f) => {
      for (const p of A.propBodies) {
        if (!p.alive) continue;
        if (Math.hypot(w.wrapDelta(p.x - f.pos.x), w.wrapDelta(p.z - f.pos.z)) < p.r + f.radius + 0.05) return true;
      }
      return false;
    };
    try {
      for (let i = 0; i < N; i++) {
        for (const ai of ais) ai.update(dt);
        w.update(dt);
        for (const f of F) {
          const s = byF.get(f);
          if (!f.alive) continue;
          s.frames++;
          const h = hazAt(f.pos.x, f.pos.z);
          if ((h === 'lava' || h === 'acid') && f.grounded && f.pos.y <= 0.5) s.lavaFrames++;
          if (f.status.burn) s.burnDmg += f.status.burn.dps * dt;
          if (bumped(f)) s.propBumps++;
        }
        if (i % 600 === 599) for (const f of F) if (f.alive) f.hp = f.maxHp;
        if (SCATTER && i % 600 === 0) {
          // one robot goes out past the hazard ring; the other must cross it
          const f = F[(i / 600) % F.length];
          for (let tries = 0; tries < 60; tries++) {
            const a = Math.random() * Math.PI * 2, r = 48 + Math.random() * 14;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            if (!A.padClear(x, z, 3)) continue;
            f.pos.set(x, T.heightAt(x, z), z); f.vel.set(0, 0, 0);
            break;
          }
        }
      }
    } catch (e) {
      return { crash: String(e.stack || e).slice(0, 500) };
    }
    return {
      booms: A.explosives.filter((e) => e.dead).length - boomsBefore,
      lanes: T.lanes.filter((l) => l.hazard).map((l) => l.hazard),
      patches: T.patches.filter((p) => p.hazard).map((p) => p.hazard),
      stats: stat,
    };
  }, [SECS, SCATTER]);
  if (out.crash) { console.log('CRASH', out.crash); process.exit(1); }
  if (run === 0) console.log(`arena hazards: lanes=${out.lanes.join(',') || '-'} patches=${out.patches.join(',') || '-'}`);
  console.log(`run ${run + 1}: booms=${out.booms} ` + out.stats.map((s) =>
    `${s.id}${s.ai ? '(cpu)' : ''} lava ${s.lavaFrames}f/${s.frames}f ticks ${s.lavaTicks} dmg ${s.lavaDmg} burn ${s.burnDmg.toFixed(0)} bumps ${s.propBumps}f`).join(' | '));
  for (const s of out.stats) {
    const t = totals[s.id] ||= { frames: 0, lavaFrames: 0, lavaTicks: 0, lavaDmg: 0, burnDmg: 0, propBumps: 0, booms: 0 };
    for (const k of ['frames', 'lavaFrames', 'lavaTicks', 'lavaDmg', 'burnDmg', 'propBumps']) t[k] += s[k];
  }
  (totals.__booms ||= { n: 0 }).n += out.booms;
}
console.log(`\nTOTAL over ${REPEATS} x ${SECS}s (booms ${totals.__booms.n}):`);
for (const [id, t] of Object.entries(totals)) {
  if (id === '__booms') continue;
  console.log(`  ${id.padEnd(9)} lava ${String(t.lavaFrames).padStart(5)}f of ${t.frames}f (${(100 * t.lavaFrames / t.frames).toFixed(1)}%)`
    + `  hazard ticks ${t.lavaTicks} = ${t.lavaDmg} dmg  burn DOT ${t.burnDmg.toFixed(0)}  prop-contact ${t.propBumps}f`);
}
await browser.close();
