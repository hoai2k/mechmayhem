// Dev battle test: full combat loop without menus.
//   ?battle=foundry&p1=titanus&p2=viper&p3=vulcan&auto=1
// auto=1 makes P1 an AI too (spectator soak test).
import { Engine } from '../core/engine.js';
import { THEMES_BY_ID, THEMES } from '../arena/themes.js';
import { ROSTER_BY_ID, ROSTER } from '../mechs/roster.js';
import { applyColorScheme } from '../mechs/colorscheme.js';
import { Fighter } from '../combat/fighter.js';
import { AIController } from '../game/ai.js';
import { Input } from '../game/input.js';
import { createBattle } from '../game/battle.js';
import { pick } from '../core/utils.js';
import { CONFIG } from '../core/config.js';
import { createMech } from '../mechs/gltf.js';
import { preloadPropModels } from '../arena/propglb.js';
import { preloadBuildingModels } from '../arena/buildglb.js';
import { loadLevel, themeFromLevel } from '../arena/level.js';

export async function runBattleTest() {
  const params = new URLSearchParams(location.search);
  const themeId = params.get('battle') || 'neon';
  let theme = THEMES_BY_ID[themeId] || THEMES[0];
  const auto = params.get('auto') === '1';

  // ?level=<name> plays an authored level from the editor (public/levels/<name>.json,
  // or the live editor stash when name is __edit / playtest)
  const levelName = params.get('level');
  if (levelName) {
    const lvl = await loadLevel(levelName);
    if (lvl) theme = themeFromLevel(lvl);
  }

  // the real match preloads prop GLBs + building donors before the arena
  // builds (boot.js) — the harness must too, or every ?battle screenshot
  // and soak silently exercises the procedural fallbacks instead of what
  // actually ships (same reason mechs go through createMech below)
  await Promise.all([preloadPropModels(), preloadBuildingModels()]);

  const engine = new Engine(document.getElementById('game-canvas'));
  const input = new Input();
  // shared wiring with the real match (src/game/battle.js) — no audio, and
  // no seed so the Arena keeps its deterministic dev-harness default
  const { world, arena, cameraSys } = createBattle(engine, { theme, input });

  const ids = [];
  for (let i = 1; i <= 4; i++) {
    const p = params.get('p' + i);
    if (p) ids.push(p === 'random' ? pick(ROSTER).id : p);
  }
  if (ids.length === 0) ids.push('titanus', 'viper');

  const spawns = arena.spawnPoints(ids.length);
  const fighters = [];
  const ais = [];
  // &c1..c4 pick a color scheme (0-3) per fighter for testing
  const defs = ids.map((id, i) => applyColorScheme(
    ROSTER_BY_ID[id] || pick(ROSTER), +params.get('c' + (i + 1)) || 0));
  // Build through createMech so ?debug=3d exercises the SAME GLB models the
  // real match ships (createMech falls back to procedural off-3d or on load
  // failure), letting the soak/screenshot harness reproduce GLB-only bugs.
  const builtMechs = await Promise.all(defs.map((def) => createMech(def)));
  defs.forEach((def, i) => {
    const f = new Fighter(world, def, {
      pos: spawns[i].pos, yaw: spawns[i].yaw, playerIndex: i, isAI: auto || i > 0,
      mech: builtMechs[i] || undefined,
    });
    fighters.push(f);
    world.fighters.push(f);
    if (auto || i > 0) ais.push(new AIController(f, params.get('diff') || 'veteran'));
  });

  let humans = auto ? [] : [fighters[0]];
  if (params.get('forcesplit') === '1') {
    humans = fighters.slice(0, Math.min(4, fighters.length));
    fighters.forEach((f, i) => f.pos.set((i % 2) * 90 - 45, 0, (i >> 1) * 60 - 30));
  }
  const layoutParam = params.get('layout'); // lr | tb (2-human split preview)
  if (layoutParam === 'lr' || layoutParam === 'tb') cameraSys.layout2p = layoutParam;

  // simple debug HUD
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;top:10px;left:10px;color:#8fe8ff;font:13px monospace;z-index:20;white-space:pre;text-shadow:0 1px 2px #000';
  document.getElementById('ui-root').appendChild(hud);

  // finishers fire here too (the real Match wires its own) — and
  // ?finisherdemo=1 (alias ?debug=finisher) turns the page into a looping
  // finisher preview: P1 executes P2 over and over so each mech's scene
  // can be judged with the p1/p2/battle params
  const demo = params.get('finisherdemo') === '1' || params.get('debug') === 'finisher';
  let demoT = demo ? 1.6 : 0;
  if (demo) {
    // tiny chooser: pick winner / victim / arena, reload straight into that
    // finisher configuration
    const bar = document.createElement('div');
    // #ui-root swallows clicks (pointer-events:none) — opt this bar back in
    bar.style.cssText = 'position:absolute;top:10px;right:10px;z-index:30;display:flex;gap:6px;align-items:center;font:12px monospace;color:#8fe8ff;text-shadow:0 1px 2px #000;pointer-events:auto';
    const mkSel = (label, opts, cur) => {
      const sel = document.createElement('select');
      sel.style.cssText = 'background:#0b1420;color:#8fe8ff;border:1px solid #2a4a60;border-radius:4px;font:12px monospace;padding:2px 4px';
      for (const o of opts) {
        const el = document.createElement('option');
        el.value = o.id;
        el.textContent = `${label} ${o.name || o.id}`;
        if (o.id === cur) el.selected = true;
        sel.appendChild(el);
      }
      bar.appendChild(sel);
      return sel;
    };
    const s1 = mkSel('WIN:', ROSTER, ids[0]);
    const s2 = mkSel('VIC:', ROSTER, ids[1] || 'aegis');
    const sa = mkSel('MAP:', THEMES, themeId);
    const go = () => {
      const q = new URLSearchParams(location.search);
      q.set('p1', s1.value);
      q.set('p2', s2.value);
      q.set('battle', sa.value);
      q.set('finisherdemo', '1');
      location.search = q.toString();
    };
    for (const s of [s1, s2, sa]) s.addEventListener('change', go);
    document.getElementById('ui-root').appendChild(bar);
  }
  world.events.on('ko', ({ fighter, attacker }) => {
    const alive = fighters.filter((f) => f.alive);
    if (world.finisher || !attacker || !attacker.alive) return;
    if (!CONFIG.enable_finishers && !demo) return;
    if (!demo && alive.length > 1) return; // real KO finisher: last kill only
    for (const f of fighters) f.controlsLocked = true;
    world.startFinisher(attacker, fighter, () => {
      if (demo) demoT = 2.2; // stay locked; breathe, then run it again
      else for (const f of fighters) f.controlsLocked = false;
    });
  });

  engine.onUpdate = (dt) => {
    input.poll();
    if (!auto && fighters[0].alive) {
      const yawIn = cameraSys.inputYawFor(fighters[0], 0);
      input.readIntent('kb1', fighters[0].intent, yawIn);
    }
    if (demo && !world.finisher) {
      demoT -= dt;
      if (demoT <= 0) {
        demoT = 999;
        const [a, v] = fighters;
        const sp = arena.spawnPoints(2);
        a.resetForRound(sp[0].pos, sp[0].yaw);
        v.resetForRound(sp[1].pos, sp[1].yaw);
        // stand them a stage-width apart, then P1 lands the killing blow
        v.pos.set(a.pos.x + Math.sin(a.yaw) * 9, 0, a.pos.z + Math.cos(a.yaw) * 9);
        a.controlsLocked = v.controlsLocked = true; // pure stage, no AI brawl
        v.hp = 1;
        v.iframes = 0;
        v.blocking = false;
        v.takeHit(9999, a, { srcPos: a.pos });
      }
    }
    for (const ai of ais) ai.update(dt);
    world.update(dt);
    input.endFrame();

    hud.textContent = fighters.map((f) =>
      `${f.def.name.padEnd(9)} hp:${Math.max(0, f.hp | 0).toString().padStart(4)} ult:${(f.ult * 100) | 0}% ${f.state}`
    ).join('\n') + `\ncam:${cameraSys.mode} draws:${engine.renderer.info.render.calls}`;
  };
  engine.onRender = (dtReal) => {
    cameraSys.update(dtReal, fighters, humans);
  };
  engine.start();
  window.__world = world; // debug hooks
  window.__ais = ais;
  window.__cam = cameraSys;
  window.__fighters = fighters;
  return engine;
}
