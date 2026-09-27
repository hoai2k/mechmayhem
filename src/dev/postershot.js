// ============================================================================
// postershot — builds ONE mech-select poster and hands it back as a PNG.
//
//   /?poster=<id>
//
// A poster stands in for THE GLB (see menustage.previewBody and ui/posters.js):
// the manifest models are the default body, they are what takes time to load,
// and they are therefore what the picture must depict.
//
// THREE THINGS HAVE TO MATCH THE MENU, or the handover shows:
//
//   FRAMING  rendered through the select stage's own camera
//            (menustage.aimPreviewCamera, shared with the stage so the two
//            cannot drift), on the stage's own preview mark, at the engine's
//            fov. The picture therefore already contains the stage's
//            perspective — foreshortening, the slight profile, a crab's claws
//            projecting wide — which no flat billboard could reproduce.
//   LOOK     the engine's WHOLE render pipeline, not a hand-made stand-in: its
//            light rig, its PMREM environment, its tone mapping and its post
//            chain (haze -> bloom -> output -> FXAA). A bespoke three-light
//            setup rendered the same robot at a THIRD of the stage's
//            brightness, so the swap flickered in exposure even when it lined
//            up perfectly in shape.
//   ALPHA    taken from a SEPARATE plain render, because the post chain's
//            OutputPass writes opaque pixels. Colour comes from the composed
//            frame, alpha from the plain one, and they are combined here into
//            the PNG — which also means no element screenshot, and so no
//            chance of the page's own background compositing in behind the
//            robot (that is how a set of fully opaque posters once shipped).
//
// Recorded alongside the image is the body's box in WORLD UNITS off its feet,
// so the runtime can project it through whatever framing is live — 1-4 pickers
// each re-frame the stage. See ui/posters.js.
// ============================================================================
import { ROSTER_BY_ID } from '../mechs/roster.js';
import { POSTER_YAW } from '../ui/posters.js';
import { previewBody } from '../game/menustage.js';
import { renderPoster } from '../game/snapshot.js';

// THE PIPELINE ITSELF LIVES IN game/snapshot.js (`renderPoster`), because the
// game runs it too: the select screen photographs a REPAINTED mech the same
// way, so the picture of a robot in AMETHYST drops into the panel the stock
// poster was in without anything else about it changing. Two copies of this
// would be two looks the first time one of them was touched.
export async function startPosterShot(params) {
  const id = params.get('poster');
  const def = ROSTER_BY_ID[id];
  const out = (o) => { window.__poster = o; };
  if (!def) { out({ error: `unknown mech ${id}` }); return; }

  // THE SAME BODY THE STAGE SHOWS — through the stage's own helper, never a
  // re-derived copy of its logic. See previewBody for how getting this wrong
  // hides itself.
  const mech = await previewBody(def);
  const shot = renderPoster(mech);
  if (shot.error) { out({ error: shot.error }); return; }
  const { box } = shot;
  out({
    id, ok: true,
    png: shot.canvas.toDataURL('image/png'),
    box: { u0: +box.u0.toFixed(4), u1: +box.u1.toFixed(4),
           v0: +box.v0.toFixed(4), v1: +box.v1.toFixed(4) },
    w: shot.w, h: shot.h, yaw: POSTER_YAW,
    // the generator asserts on this: a poster of the wrong body is worse than
    // no poster, because it looks deliberate
    isGLB: !!mech.isGLB,
  });
}
