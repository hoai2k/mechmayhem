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
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HazeRenderPass } from '../core/hazeblur.js';
import { ROSTER_BY_ID } from '../mechs/roster.js';
import { Animator } from '../mechs/animator.js';
import { POSTER_YAW, POSTER_PAD, POSTER_PX, POSTER_ASPECT, POSTER_FOV } from '../ui/posters.js';
import { aimPreviewCamera, PREVIEW_X, previewBody } from '../game/menustage.js';

export async function startPosterShot(params) {
  const id = params.get('poster');
  const def = ROSTER_BY_ID[id];
  const out = (o) => { window.__poster = o; };
  if (!def) { out({ error: `unknown mech ${id}` }); return; }

  const W = Math.round(POSTER_PX * POSTER_ASPECT), H = POSTER_PX;
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // engine.js
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.id = 'poster-canvas';
  document.body.appendChild(renderer.domElement);

  // ---- the engine's scene lighting, value for value (core/engine.js) ----
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0x8fb4d8, 0x2a2620, 0.7));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x5f8fff, 0.85);
  rim.position.set(-50, 40, -60);
  scene.add(rim);

  // THE SAME BODY THE STAGE SHOWS — through the stage's own helper, never a
  // re-derived copy of its logic. See previewBody for how getting this wrong
  // hides itself.
  const mech = await previewBody(def);
  mech.animator = mech.premadeAnimator || new Animator(mech);
  mech.group.position.set(PREVIEW_X, 0, 0);
  mech.group.rotation.y = POSTER_YAW;
  scene.add(mech.group);
  // settle the combat-ready carriage the stage shows (the animator eases, so
  // a single frame would catch it mid-blend)
  for (let i = 0; i < 90; i++) {
    mech.animator.update(1 / 60, { speed: 0, grounded: true, alwaysReady: true });
  }
  mech.group.updateWorldMatrix(true, true);

  // MUST match core/engine.js's camera — a poster shot at fov 50 against the
  // engine's 46 lands ~25% small on screen, uniformly.
  const cam = new THREE.PerspectiveCamera(POSTER_FOV, POSTER_ASPECT, 0.5, 2200);
  aimPreviewCamera(cam, 1, PREVIEW_X);
  scene.add(cam);

  const composer = new EffectComposer(renderer);
  composer.addPass(new HazeRenderPass(scene, cam));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.92));
  composer.addPass(new OutputPass());
  const fxaa = new ShaderPass(FXAAShader);
  fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H);
  composer.addPass(fxaa);
  composer.setSize(W, H);

  const gl = renderer.getContext();
  const read = () => {
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  composer.render();
  const colour = read();                 // what the stage looks like
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(scene, cam);
  const mask = read();                   // ...and where the robot actually is

  // Bounds off the MASK: alpha is exact, while bloom smears the colour pass
  // well past the silhouette.
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) { out({ error: 'nothing rendered' }); return; }
  const padX = ((x1 - x0 + 1) * (POSTER_PAD - 1)) / 2;
  const padY = ((y1 - y0 + 1) * (POSTER_PAD - 1)) / 2;
  const l = Math.round(Math.max(0, x0 - padX)), r = Math.round(Math.min(W, x1 + 1 + padX));
  const b = Math.round(Math.max(0, y0 - padY)), t = Math.round(Math.min(H, y1 + 1 + padY));
  const ndc = {
    x0: (l / W) * 2 - 1, x1: (r / W) * 2 - 1,
    y0: (b / H) * 2 - 1, y1: (t / H) * 2 - 1,
  };
  // NDC only means anything at the framing it was shot in; world units off the
  // mech's feet are a property of the BODY, so the runtime can re-project them
  // for any player count.
  const P = (x, y, z) => new THREE.Vector3(x, y, z).project(cam);
  const A = P(PREVIEW_X, 0, 0);
  const perX = P(PREVIEW_X + 1, 0, 0).x - A.x;
  const perY = P(PREVIEW_X, 1, 0).y - A.y;
  const box = {
    u0: (ndc.x0 - A.x) / perX, u1: (ndc.x1 - A.x) / perX,
    v0: (ndc.y0 - A.y) / perY, v1: (ndc.y1 - A.y) / perY,
  };

  // colour from the composed frame, alpha from the mask, cropped to the box.
  // readPixels is bottom-up; canvas ImageData is top-down.
  const cw = r - l, ch = t - b;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const src = ((b + (ch - 1 - y)) * W + (l + x)) * 4;
      const dst = (y * cw + x) * 4;
      img.data[dst] = colour[src];
      img.data[dst + 1] = colour[src + 1];
      img.data[dst + 2] = colour[src + 2];
      img.data[dst + 3] = mask[src + 3];
    }
  }
  ctx.putImageData(img, 0, 0);

  out({
    id, ok: true,
    png: cv.toDataURL('image/png'),
    box: { u0: +box.u0.toFixed(4), u1: +box.u1.toFixed(4),
           v0: +box.v0.toFixed(4), v1: +box.v1.toFixed(4) },
    w: cw, h: ch, yaw: POSTER_YAW,
    // the generator asserts on this: a poster of the wrong body is worse than
    // no poster, because it looks deliberate
    isGLB: !!mech.isGLB,
  });
}
