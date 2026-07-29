// menupose — the real menu stage with the poster/model handover driven by
// hand, for tools/postercheck.mjs. Takes one mech or a comma-separated list,
// so the multi-picker framings (which move the camera AND spread the marks)
// are checked the same way the single one is.
//
//   /?menupose=viper                 one picker
//   /?menupose=viper,rhino,cranky    three pickers, slots 0..2
//
// window.__menupose:
//   stage()            — (re)show every slot as a poster
//   promote(slot)      — hand that slot over to the real model now
//   solo(slot)         — hide every other slot, so a screenshot of the canvas
//                        is one subject's silhouette and nothing else
//   all()              — show everything again
import { Engine } from '../core/engine.js';
import { MenuStage } from '../game/menustage.js';
import { loadPosterIndex } from '../ui/posters.js';
import { loadManifest } from '../mechs/gltf.js';

export async function runMenuPose(arg) {
  const ids = String(arg || '').split(',').filter(Boolean);
  const engine = new Engine(document.getElementById('game-canvas'));
  const stage = new MenuStage(engine);
  // Hide the scenery the stage builds in its constructor (floor, ring, glow)
  // and blacken the backdrop: the check reads silhouettes off luminance, and
  // a lit floor is indistinguishable from a mech's shin.
  const scenery = stage.group.children.slice();
  for (const c of scenery) c.visible = false;
  engine.scene.background = new (engine.scene.background.constructor)(0x000000);
  engine.scene.fog = null;
  // AWAIT THE MANIFEST FIRST. menustage.spawnUnit gates its GLB path on
  // manifestHasGlb(), which answers false until the manifest has resolved —
  // so a harness that skips this silently compares posters against the
  // PROCEDURAL body and reports nonsense. The real boot flow awaits it before
  // building any screen; so must this.
  await loadManifest();
  await loadPosterIndex();
  const entries = ids.map((id, i) => ({ id, slotIdx: i, variant: 0 }));

  const visible = (slot, on) => {
    for (const m of stage.mechs) if (m.slotIdx === slot) m.group.visible = on;
    for (const p of stage.posters) {
      if (p.userData.poster.entry.slotIdx === slot) p.img.style.display = on ? '' : 'none';
    }
    for (const r of stage.rings) r.visible = false;   // rings are not subjects
  };
  window.__menupose = {
    stage() {
      for (const id of ids) stage._built.delete(id);
      stage._previewKey = null;
      stage._previewN = 0;
      stage.showPreviews(entries);
      // freeze the settle timers: the check drives each handover itself
      for (const m of stage.posters) m.userData.poster.settle = 1e9;
      return stage.posters.length;
    },
    promote(slot) {
      stage.promoteSlot(slot);
      // Freeze the idle sway at the handover instant. The check screenshots
      // seconds later (SwiftShader), and the stage would have swung the body
      // ~30 degrees by then — which reads as poster/model drift when it is
      // just the mech breathing.
      if (!stage._frozen) {
        stage._frozen = true;
        const orig = stage.update.bind(stage);
        stage.update = (dt) => { orig(dt); stage.t = stage._swayT0; };
      }
      return stage.mechs.length;
    },
    solo(slot) { for (let i = 0; i < ids.length; i++) visible(i, i === slot); },
    all() { for (let i = 0; i < ids.length; i++) visible(i, true); },
    count: ids.length,
    // for the incremental-rebuild check: show a different roster and report
    // which slots kept their existing unit object
    reshow(newIds) {
      const before = new Map(stage.mechs.map((m) => [m.slotIdx, m]));
      stage.showPreviews(newIds.map((id, i) => ({ id, slotIdx: i, variant: 0 })));
      const after = new Map(stage.mechs.map((m) => [m.slotIdx, m]));
      const kept = [];
      for (const [slot, m] of after) if (before.get(slot) === m) kept.push(slot);
      return { kept, units: stage.mechs.length, posters: stage.posters.length };
    },
    stageObj: stage,
    // every promoted slot has its GLB in place (spawnUnit swaps it in async
    // behind a spinner) — the check waits on this before screenshotting
    glbReady() {
      return stage.mechs.length > 0 && stage.mechs.every((m) => !m.isSpinner && m.isGLB);
    },
  };
  engine.onUpdate = (dt) => stage.update(dt);
  engine.start();
}
