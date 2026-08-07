// What does ONE summoned body cost, now that its mech is prewarmed?
// usage: node tools/scratch/spawncost.mjs [waitMs]
import { chromium } from 'playwright-core';
const [waitMs = '30000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await p.goto('http://localhost:5173/?battle=neon&p1=saurion&p2=titanus&auto=1&diff=ace', { waitUntil: 'networkidle' });
await p.waitForTimeout(Number(waitMs));
console.log(await p.evaluate(async () => {
  const w = window.__world, f = w.fighters[0];
  const { prewarmSummons, takeSpare } = await import('/src/combat/specials.js');
  const { cloneMech } = await import('/src/mechs/factory.js');
  const { Fighter } = await import('/src/combat/fighter.js');
  const { AIController } = await import('/src/game/ai.js');
  const T = (fn) => { const a = performance.now(); const r = fn(); return [+(performance.now() - a).toFixed(2), r]; };
  const out = { clone: [], spareBuild: [], fighter: [], ai: [], hurtbox: [] };
  for (let i = 0; i < 4; i++) out.spareBuild.push(T(() => prewarmSummons(f, 1))[0]);
  for (let i = 0; i < 3; i++) {
    const [tm, mech] = T(() => takeSpare(f) || cloneMech(f.mech));
    out.clone.push(tm);
    const [tf, cl] = T(() => new Fighter(w, f.def, { pos: f.pos.clone(), yaw: 0, playerIndex: 0, isAI: true, mech }));
    out.fighter.push(tf);
    out.ai.push(T(() => new AIController(cl, 'ace'))[0]);
    w.scene.remove(cl.group);
  }
  return JSON.stringify(out);
}));
await b.close();
