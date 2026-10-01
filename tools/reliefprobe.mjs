// GROUND RELIEF PROBE — does the arena floor's new shape (arena/relief.js)
// stay something a mech walks OVER rather than something that gets in his way?
//
//   node tools/reliefprobe.mjs [theme,…|all] [mech] [--flat]
//
// For each arena it reports the field itself (lowest/highest point, worst and
// mean slope) and then RUNS a mech across it: P1's AI is taken off, his stick
// is held in a straight line for a few seconds in each of four directions, and
// the sim is stepped through world.update with no drawing. Every frame is
// measured:
//
//   air      frames spent off the ground while running on flat-intent ground —
//            the "every crest is a tiny jump" failure the downhill snap exists
//            to prevent. Must be ~0 (a run that crosses a bridge ramp or a
//            hill edge may contribute a frame or two).
//   dy       the largest single-frame vertical step of his feet. A curb or a
//            channel bank is a fraction of a unit; anything near 1 is a ledge.
//   speed    MEDIAN ground speed over open-ground frames, against the same run
//            on --flat (relief off) — the walk must not slow down.
//   off      how far his feet end up from the floor under them at the end of
//            each frame (should be 0 whenever he is grounded on open ground).
//
// --flat runs the same thing with ?relief=0 for the baseline.
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flat = args.includes('--flat');
const pos = args.filter((a) => !a.startsWith('--'));
const ALL = ['neon', 'foundry', 'uptown', 'harbor', 'skyterrace', 'scrapyard',
  'quarry', 'volcano', 'frozen', 'ruins', 'jungle', 'orbital'];
const themes = !pos[0] || pos[0] === 'all' ? ALL : pos[0].split(',');
const mech = pos[1] || 'titanus';

const browser = await launch({ gl: false });
for (const theme of themes) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  const url = `http://localhost:5173/?battle=${theme}&p1=${mech}&p2=viper&auto=1&music=0&seed=3${flat ? '&relief=0' : ''}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__world && window.__fighters?.length >= 2, null, { timeout: 180000 });
  const r = await page.evaluate(() => {
    const w = window.__world;
    window.__ais.length = 0;
    w.engine.paused = true;
    const f = window.__fighters[0];
    const foe = window.__fighters[1];
    f.isAI = false;
    foe.pos.set(9999, 0, 9999);          // out of the way
    const rel = w.arena.terrain.relief;
    const st = rel.stats();
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    let air = 0, frames = 0, maxDy = 0, maxOff = 0;
    const speeds = [];
    for (const [dx, dz] of dirs) {
      f.resetForRound(f.pos.clone().set(0, 0, 0), 0);
      for (let i = 0; i < 30; i++) w.update(1 / 60);       // settle
      let prevY = f.pos.y;
      const p0x = f.pos.x, p0z = f.pos.z;
      let travelled = 0, px = f.pos.x, pz = f.pos.z;
      for (let i = 0; i < 300; i++) {
        Object.assign(f.intent, { moveX: dx, moveZ: dz, jump: false, dash: false, block: false });
        w.update(1 / 60);
        if (i < 20) { prevY = f.pos.y; px = f.pos.x; pz = f.pos.z; continue; }   // spin-up
        frames++;
        // only open ground counts: on a hill, a deck, a roof the floor is not
        // the relief and the question is a different one
        const g = rel.at(f.pos.x, f.pos.z);
        const surf = w.arena.terrain.heightAt(f.pos.x, f.pos.z);
        const open = Math.abs(surf - g) < 1e-6 && f.pos.y < g + 1.5;
        if (open && !f.grounded) air++;
        if (open && f.grounded) maxOff = Math.max(maxOff, Math.abs(f.pos.y - g));
        if (!f._wrap) {
          maxDy = Math.max(maxDy, Math.abs(f.pos.y - prevY));
          const d = Math.hypot(f.pos.x - px, f.pos.z - pz);
          travelled += d;
          if (open && i > 60) speeds.push(d * 60);
        }
        f._wrap = null;
        prevY = f.pos.y; px = f.pos.x; pz = f.pos.z;
      }
      void p0x; void p0z; void travelled;
    }
    return {
      min: st.min, max: st.max, slope: st.maxSlopeDeg, mean: st.meanSlopeDeg,
      air, frames, maxDy, maxOff,
      // MEDIAN running speed over open ground: a straight line from the plaza
      // runs into buildings, and the frames spent pressed against one are
      // not a measurement of the ground
      speed: speeds.sort((a, b) => a - b)[speeds.length >> 1] || 0,
    };
  });
  const p = (v, d = 2) => (v >= 0 ? ' ' : '') + v.toFixed(d);
  console.log(`${theme.padEnd(11)} h ${p(r.min)}..${p(r.max)}  slope max ${r.slope.toFixed(1)}° mean ${r.mean.toFixed(1)}°` +
    `  | air ${r.air}/${r.frames}  dy ${r.maxDy.toFixed(3)}  off ${r.maxOff.toFixed(3)}  speed ${r.speed.toFixed(1)}` +
    (errors.length ? `  ERR ${errors[0]}` : ''));
  await page.close();
}
await browser.close();
