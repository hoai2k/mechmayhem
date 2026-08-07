// Shared battle wiring used by BOTH the real match flow (boot.startBattle)
// and the dev harness (src/dev/battletest.js): world + arena construction,
// ammo crates, per-view seam rendering hooks, and the camera system.
// Fighter construction stays with each caller — the two paths genuinely
// differ (boot: slot/scheme handling + async GLB placeholder swaps;
// battletest: URL params + fully-awaited models).
import { World } from './world.js';
import { Arena } from '../arena/arena.js';
import { UltFountains } from '../combat/fountains.js';
import { CameraSystem } from './camera.js';

// Returns { world, arena, arenaObjs, cameraSys }.
// - audio: GameAudio for the real match, null for the silent dev harness
// - seed: Arena seed; omit (undefined) to keep the Arena default — the dev
//   harness relies on that deterministic default, boot passes a random one
// - arenaObjs: everything the world/arena added to the scene — boot hides
//   these behind the warm-up's neutral backdrop and reveals them fully
//   warmed later (harmless bookkeeping for the dev harness)
// A NEW ARENA WITHOUT A NEW BATTLE (the per-round arena change: match.js calls
// boot's onRoundStart, which calls this before the round's spawn points are
// read). Everything the world hung on the old arena goes with it — the crates
// it scattered, the fountains standing on its ROOFS, and every transient — and
// the new one is wired up exactly as createBattle wires the first.
//
// The fighters are not touched: startRound resets them onto the NEW arena's
// spawn points immediately after this returns.
export function rebuildArena(engine, world, theme, seed) {
  world.clearTransient();
  world.clearPickups();
  world.fountains?.clear();
  world.arena?.dispose();
  const preArena = engine.scene.children.slice();
  const arena = new Arena(engine, theme, seed);
  world.arena = arena;
  arena.bind(world);                 // …which is also what re-points world.wrapHalf
  world.spawnAmmoBoxes(6, arena.bounds * 0.6);
  world.fountains = new UltFountains(world);
  return { arena, arenaObjs: engine.scene.children.filter((o) => !preArena.includes(o)) };
}

export function createBattle(engine, { theme, audio = null, input, seed }) {
  // snapshot the scene so everything the arena adds can be identified
  const preArena = engine.scene.children.slice();
  const world = new World(engine, audio);
  const arena = new Arena(engine, theme, seed);
  world.arena = arena;
  arena.bind(world);
  world.input = input;
  world.spawnAmmoBoxes(6, arena.bounds * 0.6);
  world.fountains = new UltFountains(world);   // golden ult-charge fountains
  const arenaObjs = engine.scene.children.filter((o) => !preArena.includes(o));
  // per-view seam rendering: dynamic entities show their nearest image
  engine.onBeforeView = (cam) => world.applyViewWrap(cam);
  engine.onAfterView = () => world.clearViewWrap();

  const cameraSys = new CameraSystem(engine, world);
  world.cameraSys = cameraSys; // fighters + HUD reach the aim ray through this
  return { world, arena, arenaObjs, cameraSys };
}
