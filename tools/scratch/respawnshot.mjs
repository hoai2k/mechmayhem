// The brawl death: a wreck fading out on the floor, then the body back.
// usage: node tools/scratch/respawnshot.mjs <outPrefix> [waitMs]
import { launch } from '../lib/browser.mjs';
const [out = 'respawn', waitMs = '30000'] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 200)));
await p.goto('http://localhost:5173/?battle=neon&p1=titanus&p2=viper&p3=vulcan&p4=wraith&auto=1', { waitUntil: 'networkidle' });
await p.waitForTimeout(Number(waitMs));
await p.evaluate(async () => {
  const w = window.__world, F = window.__fighters;
  const { Match } = await import('/src/game/match.js');
  window.__ais.length = 0;
  for (const f of F) f.controlsLocked = true;
  const hud = { announce() {}, callout() {}, setDeaths() {}, update() {} };
  const m = new Match({ engine: window.__engine, world: w, fighters: F, hud, onEnd() {} });
  m.begin();
  for (let i = 0; i < 200 && m.state !== 'fight'; i++) { w.update(1/60); m.update(1/60); }
  // stand the victim in front of the camera and put him down
  F[1].pos.set(F[0].pos.x + Math.sin(F[0].yaw) * 12, 0, F[0].pos.z + Math.cos(F[0].yaw) * 12);
  w.update(1/60); m.update(1/60);
  F[1].takeHit(99999, F[0], { srcPos: F[0].pos });
  window.__m = m;
  window.__engine.paused = true;
});
const shot = async (name, frames) => {
  await p.evaluate((n) => {
    const w = window.__world, m = window.__m, eng = window.__engine;
    for (let i = 0; i < n; i++) { w.update(1/60); m.update(1/60); }
    eng._render();
  }, frames);
  await p.screenshot({ path: `${out}-${name}.png`, timeout: 120000 });
};
await shot('down', 12);      // just dropped
await shot('fading', 60);    // ~1.2s in
await shot('gone', 60);      // faded out
await shot('back', 60);      // respawned
await b.close();
console.log('wrote', out + '-{down,fading,gone,back}.png');
