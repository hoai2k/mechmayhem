// A NEW ARENA WITHOUT A NEW BATTLE (battle.js rebuildArena, used by boot's
// per-round arena change). Swaps the arena under a live world several times
// and checks that nothing from the old one is left standing: its scene objects,
// its ammo crates, its roof fountains — and that the world is still playable
// afterwards (spawn points, terrain, collision, a fighter that can walk).
//
// usage: node tools/scratch/arenaswap.mjs [waitMs]
import { chromium } from 'playwright-core';

const [waitMs = '30000'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.error('page error:', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/?battle=neon&p1=titanus&p2=viper&auto=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

const out = await page.evaluate(async () => {
  const w = window.__world, F = window.__fighters, eng = window.__engine;
  const { rebuildArena } = await import('/src/game/battle.js');
  const { THEMES } = await import('/src/arena/themes.js');
  const { resolveArenaTheme } = await import('/src/arena/authored.js');
  const dt = 1 / 60;
  const rows = [];
  const sceneCount = () => eng.scene.children.length;
  for (const id of ['foundry', 'volcano', 'frozen']) {
    const before = {
      scene: sceneCount(), pickups: w.pickups.length,
      fountains: w.fountains.active.length, arena: w.arena.theme.id,
      wrapHalf: +w.wrapHalf.toFixed(1),
    };
    // give the old arena something to leave behind
    w.fountains.spawn?.();
    const theme = await resolveArenaTheme(THEMES.find((t) => t.id === id));
    rebuildArena(eng, w, theme, 1234);
    // …and run it, the way a round does
    const spawns = w.arena.spawnPoints(F.length);
    F.forEach((f, i) => f.resetForRound(spawns[i].pos, spawns[i].yaw));
    for (let i = 0; i < 90; i++) { F[0].intent.moveZ = 1; w.update(dt); }
    rows.push({
      to: id,
      before,
      after: {
        scene: sceneCount(), pickups: w.pickups.length,
        fountains: w.fountains.active.length, arena: w.arena.theme.id,
        wrapHalf: +w.wrapHalf.toFixed(1),
      },
      // the world still works: he stands on the new terrain and can move
      walked: +Math.hypot(F[0].pos.x - spawns[0].pos.x, F[0].pos.z - spawns[0].pos.z).toFixed(1),
      grounded: F[0].grounded,
      onTerrain: +(F[0].pos.y - (w.arena.terrainHeightAt?.(F[0].pos.x, F[0].pos.z) || 0)).toFixed(2),
      chunksAlive: w.arena.destructo.buildings.length,
    });
  }
  return rows;
});
for (const r of out) {
  console.log(`-> ${r.to}: scene ${r.before.scene} -> ${r.after.scene} · crates ${r.before.pickups} -> `
    + `${r.after.pickups} · fountains ${r.before.fountains} -> ${r.after.fountains} · `
    + `wrapHalf ${r.before.wrapHalf} -> ${r.after.wrapHalf} · buildings ${r.chunksAlive}`);
  console.log(`   walked ${r.walked} · grounded ${r.grounded} · height over terrain ${r.onTerrain}`);
}
await browser.close();
