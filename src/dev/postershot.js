// ============================================================================
// postershot — the page tools/posters.mjs screenshots.
//
// Renders ONE mech alone on a transparent canvas, in the exact carriage,
// scale and yaw the mech-select stage shows it in, and reports the world-space
// box it occupies. The runtime draws the resulting PNG on a billboard sized to
// that same box (menustage.showPoster), so the swap from image to live model
// lands pixel-on-pixel.
//
//   /?poster=<id>[&variant=alt]
//
// It renders through the SELECT STAGE'S OWN CAMERA (menustage.aimPreviewCamera,
// shared by both so the two cannot drift), at a reference 16:9, with the mech
// standing on the stage's own preview mark. The picture therefore already
// contains the stage's perspective — the foreshortening, the slight profile,
// a crab's claws projecting wide — which a flat billboard of a world-space box
// can never reproduce. What gets recorded is the body's NDC rect, and the
// runtime lays the PNG over exactly that rect (menustage.showPoster).
//
// NDC is the right currency because the stage's framing offset is applied in
// NDC: a mech lands on the same part of the screen at any window aspect.
// ============================================================================
import * as THREE from 'three';
import { ROSTER_BY_ID } from '../mechs/roster.js';
import { Animator } from '../mechs/animator.js';
import { createMech, is3dMode, manifestHasGlb } from '../mechs/gltf.js';
import { buildMech } from '../mechs/factory.js';
import { POSTER_YAW, POSTER_PAD, POSTER_PX, POSTER_ASPECT, POSTER_FOV } from '../ui/posters.js';
import { aimPreviewCamera, PREVIEW_X } from '../game/menustage.js';

export async function startPosterShot(params) {
  const id = params.get('poster');
  const def = ROSTER_BY_ID[id];
  const out = (o) => { window.__poster = o; };
  if (!def) { out({ error: `unknown mech ${id}` }); return; }

  // preserveDrawingBuffer so the alpha scan can read the frame back
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const W = Math.round(POSTER_PX * POSTER_ASPECT), H = POSTER_PX;
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.id = 'poster-canvas';
  renderer.domElement.style.cssText =
    'position:absolute;left:0;top:0;image-rendering:auto;background:transparent';
  document.body.style.background = 'transparent';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Lighting that matches the menu stage's read closely enough that the swap
  // does not flicker in brightness. Colour is DEFAULT (no scheme applied) —
  // the live model recolours itself on load, which the brief allows.
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x20262e, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(4, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.75);
  rim.position.set(-5, 4, -6);
  scene.add(rim);

  // THE SAME BODY THE STAGE SHOWS. menustage.spawnUnit only reaches for the
  // GLB under is3dMode(); otherwise the menu displays the PROCEDURAL mech,
  // and the two are visibly different robots (cranky's GLB is a detailed
  // crab, his procedural body a blockier one). A poster of the wrong body is
  // not a stand-in for anything, so mirror the stage's choice exactly.
  const mech = (is3dMode() && manifestHasGlb(def.id)) ? await createMech(def) : buildMech(def);
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

  // WHERE THE BODY LANDS ON SCREEN, measured off the RENDERED PIXELS. Box3
  // over a skinned mesh reads the geometry's BIND-pose bounds — right for
  // most of the roster by luck and badly wrong for fenrir, whose bind pose
  // put the box on the floor and cropped his poster to a pair of legs. An
  // alpha scan is exact, assumes nothing about the rig, and costs one frame.
  // MUST match core/engine.js's camera exactly — a poster shot at fov 50
  // against the engine's 46 lands ~25% small on screen, uniformly, which is
  // the single biggest way this pipeline can look subtly wrong.
  const cam = new THREE.PerspectiveCamera(POSTER_FOV, POSTER_ASPECT, 0.5, 2200);
  aimPreviewCamera(cam, 1, PREVIEW_X);
  scene.add(cam);
  renderer.render(scene, cam);
  const gl = renderer.getContext();
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (px[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) { out({ error: 'nothing rendered' }); return; }
  // pad so glow and antialiasing never clip, then convert to NDC. readPixels
  // is bottom-up; NDC y is too.
  const padX = ((x1 - x0 + 1) * (POSTER_PAD - 1)) / 2;
  const padY = ((y1 - y0 + 1) * (POSTER_PAD - 1)) / 2;
  const l = Math.max(0, x0 - padX), r = Math.min(W, x1 + 1 + padX);
  const b = Math.max(0, y0 - padY), t = Math.min(H, y1 + 1 + padY);
  const ndc = {
    x0: (l / W) * 2 - 1, x1: (r / W) * 2 - 1,
    y0: (b / H) * 2 - 1, y1: (t / H) * 2 - 1,
  };
  // re-render cropped to that rect, so the PNG is all mech and no margin
  const cropW = Math.round(r - l), cropH = Math.round(t - b);
  renderer.setViewport(-l, -b, W, H);
  renderer.setScissor(0, 0, cropW, cropH);
  renderer.setScissorTest(true);
  renderer.setSize(cropW, cropH, false);
  renderer.domElement.style.width = `${cropW}px`;
  renderer.domElement.style.height = `${cropH}px`;
  renderer.setViewport(-l, -b, W, H);
  renderer.render(scene, cam);

  out({
    id, ok: true,
    // the NDC rect the runtime lays this PNG over, and the pixel size it was
    // rendered at (for a sanity check on the generated file)
    ndc: { x0: +ndc.x0.toFixed(5), x1: +ndc.x1.toFixed(5),
           y0: +ndc.y0.toFixed(5), y1: +ndc.y1.toFixed(5) },
    w: cropW, h: cropH, yaw: POSTER_YAW,
  });
}
