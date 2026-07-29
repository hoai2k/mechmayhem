// menupose — the real menu stage, one mech, with the poster/model handover
// driven by hand. tools/postercheck.mjs uses it to prove the picture and the
// body occupy the same pixels.
//
//   /?menupose=<id>
//
// window.__menupose.showPoster()  — stage the poster billboard
// window.__menupose.promote()     — hand over to the real model now
import { Engine } from '../core/engine.js';
import { MenuStage } from '../game/menustage.js';
import { loadPosterIndex } from '../ui/posters.js';

export async function runMenuPose(id) {
  const engine = new Engine(document.getElementById('game-canvas'));
  const stage = new MenuStage(engine);
  // Hide the scenery the stage builds in its constructor (floor, ring, glow)
  // and blacken the backdrop: the check reads silhouettes off luminance, and
  // a lit floor is indistinguishable from a mech's shin.
  for (const c of stage.group.children.slice()) c.visible = false;
  engine.scene.background = new (engine.scene.background.constructor)(0x000000);
  engine.scene.fog = null;
  await loadPosterIndex();
  const entry = { id, slotIdx: 0, variant: 0 };
  window.__menupose = {
    stage,
    showPoster() {
      stage._built.delete(id);        // pretend it was never built
      stage._previewKey = null;
      stage.showPreviews([entry]);
      // freeze the settle timer: the check drives the handover itself
      for (const m of stage.posters) m.userData.poster.settle = 1e9;
      return stage.posters.length > 0;
    },
    promote() {
      stage.promoteAll();
      // Freeze the idle sway at the handover instant. The check screenshots
      // seconds later (SwiftShader), and the stage would have swung the body
      // ~30 degrees by then — which reads as poster/model drift when it is
      // just the mech breathing.
      const orig = stage.update.bind(stage);
      stage.update = (dt) => { orig(dt); stage.t = stage._swayT0; };
      return stage.mechs.length > 0;
    },
  };
  engine.onUpdate = (dt) => stage.update(dt);
  engine.start();
}
