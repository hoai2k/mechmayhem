// ============================================================================
// snapshot.js — a mech as a PICTURE, rendered exactly the way the posters are.
//
// The fighter-select screen and the VS loading card show every fighter as a
// still image, not a live body: public/posters/<id>.webp, pre-rendered from the
// GLB by tools/posters.mjs. A poster is the STOCK paint, though, and a player
// can repaint their robot eleven ways. So when the paint changes, the real
// model is built in the background, wearing that scheme, and photographed
// through the SAME pipeline the posters came out of — same camera, same light
// rig, same post chain, same crop — which is what lets the new picture drop
// into the panel without anything else about it changing.
//
// ONE IMPLEMENTATION, TWO CALLERS. `renderPoster` is the whole pipeline and
// dev/postershot.js (the poster generator) calls it too, so the shipped PNGs
// and the pictures made at runtime cannot drift apart: change the look in one
// place and both follow. What the pipeline is and why each part exists is
// documented there, at the top of postershot.js.
//
// IT ALSO WARMS THE FIGHT. Building a mech is the expensive part of starting
// a match — the GLB parse, the fit measurements (gltf.js fitCache) and the
// recoloured texture set (recolorglb.js caches it per source + scheme) — and
// all three are caches keyed on things the battle's own build uses. A body
// built here for a picture is therefore a body the match builds from warm
// caches a minute later. `warmMech` is that same build without the picture,
// for a pick in its stock paint (which needs no picture — it has a poster).
//
// THE RENDERER IS ITS OWN, like the generator's: an alpha-capable context,
// sized to the poster frame, never on screen. It is released when the menus
// hand over to a fight (`releaseSnapshots`), which frees its GPU copies
// without touching the textures themselves — disposing a texture would drop
// it from the GAME's context too, the one the fight is about to draw with.
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
import { applyColorScheme } from '../mechs/colorscheme.js';
import { createMech, is3dMode } from '../mechs/gltf.js';
import {
  POSTER_YAW, POSTER_PAD, POSTER_PX, POSTER_ASPECT, POSTER_FOV,
  posterMeta, posterUrl, loadPosterIndex,
} from '../ui/posters.js';
import { aimPreviewCamera, PREVIEW_X } from './menustage.js';

const W = Math.round(POSTER_PX * POSTER_ASPECT), H = POSTER_PX;

// ---------------------------------------------------------------- the rig
let rig = null;
let gen = 0;      // bumped by releaseSnapshots: a job from before it takes no picture

function getRig() {
  if (rig) return rig;
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // engine.js
  renderer.toneMappingExposure = 1.05;

  // the engine's scene lighting, value for value (core/engine.js)
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0x8fb4d8, 0x2a2620, 0.7));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x5f8fff, 0.85);
  rim.position.set(-50, 40, -60);
  scene.add(rim);

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

  rig = { renderer, scene, cam, composer, env };
  return rig;
}

/** Let the snapshot context go (its GPU copies with it). Safe to call any
 *  time; the next snapshot simply builds a fresh one. */
export function releaseSnapshots() {
  // anything still queued is for a screen that has gone; a job already
  // building finishes its BODY (which warms the match) but takes no picture
  gen++;
  for (const job of waiting.values()) job.resolvers.forEach((r) => r(null));
  waiting.clear();
  if (!rig) return;
  const r = rig;
  rig = null;
  try {
    r.composer.dispose?.();
    r.env.dispose();
    r.renderer.dispose();
    r.renderer.forceContextLoss();
  } catch (e) { /* a lost context is already released */ }
}

/**
 * Photograph a built mech the way a poster is photographed. Returns
 * `{ canvas, box, w, h }` — the cropped RGBA image, and the world-space box
 * (units off the feet) it spans — or `{ error }`.
 *
 * The mech is settled into the stage's combat-ready carriage first (the
 * animator eases, so a single frame would catch it mid-blend), stood on the
 * poster mark at POSTER_YAW, shot, and taken back out of the scene.
 */
export function renderPoster(mech) {
  const { renderer, scene, cam, composer } = getRig();
  mech.animator = mech.animator || mech.premadeAnimator || new Animator(mech);
  mech.group.position.set(PREVIEW_X, 0, 0);
  mech.group.rotation.y = POSTER_YAW;
  scene.add(mech.group);
  for (let i = 0; i < 90; i++) {
    mech.animator.update(1 / 60, { speed: 0, grounded: true, alwaysReady: true });
  }
  mech.group.updateWorldMatrix(true, true);

  const gl = renderer.getContext();
  const read = () => {
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  // COLOUR from the whole post chain, ALPHA from a separate plain render —
  // the chain's OutputPass writes opaque pixels (see dev/postershot.js)
  composer.render();
  const colour = read();
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(scene, cam);
  const mask = read();
  scene.remove(mech.group);

  // bounds off the MASK: alpha is exact, while bloom smears the colour pass
  // well past the silhouette
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (mask[row + x * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { error: 'nothing rendered' };
  const padX = ((x1 - x0 + 1) * (POSTER_PAD - 1)) / 2;
  const padY = ((y1 - y0 + 1) * (POSTER_PAD - 1)) / 2;
  const l = Math.round(Math.max(0, x0 - padX)), r = Math.round(Math.min(W, x1 + 1 + padX));
  const b = Math.round(Math.max(0, y0 - padY)), t = Math.round(Math.min(H, y1 + 1 + padY));

  // NDC only means anything at the framing it was shot in; world units off
  // the mech's feet are a property of the BODY
  const ndc = { x0: (l / W) * 2 - 1, x1: (r / W) * 2 - 1, y0: (b / H) * 2 - 1, y1: (t / H) * 2 - 1 };
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
  return { canvas: cv, box, w: cw, h: ch };
}

// ------------------------------------------------------ the runtime cache
//
// `${id}|${variant}` -> { url, promise }. A stock-paint pick in MODELS mode
// never lands here: it has a poster, and shotUrl answers with that directly.

const shots = new Map();
const MAX_SHOTS = 60;         // blob URLs kept before the oldest are let go
const warmed = new Set();     // `${id}|${variant}` bodies already built once

const key = (id, v) => `${id}|${v || 0}`;

/** Does this pick need a runtime picture at all? A stock-paint GLB has the
 *  shipped poster; anything else (a repaint, or a non-MODELS roster whose
 *  bodies the GLB posters do not depict) is rendered here. */
function hasPoster(id, v) { return !(v || 0) && is3dMode() && !!posterMeta(id); }

/**
 * The picture for a pick, synchronously, or null when it has not been made
 * yet (ask with `requestShot`). The stock paint answers with the poster.
 */
export function shotUrl(id, v = 0) {
  if (!ROSTER_BY_ID[id]) return null;
  if (hasPoster(id, v)) return posterUrl(id);
  return shots.get(key(id, v))?.url || null;
}

// THE QUEUE. One render at a time, and a CHANNEL (the player's slot) holds at
// most one waiting job — a player cycling through eleven paint schemes wants
// the one they stopped on, not a backlog of the ten they passed. A job that
// has started always finishes; what it made is cached either way.
const waiting = new Map();    // channel -> { id, v, resolvers[] }
let running = false;

/**
 * Ask for a pick's picture. Resolves with its URL (or null if the body could
 * not be built). `channel` is who is asking: a newer request on the same
 * channel replaces an older one that has not started.
 */
export function requestShot(id, v = 0, channel = 'any') {
  const now = shotUrl(id, v);
  if (now) return Promise.resolve(now);
  const k = key(id, v);
  const inflight = shots.get(k)?.promise;
  if (inflight) return inflight;
  return new Promise((resolve) => {
    const prev = waiting.get(channel);
    if (prev && key(prev.id, prev.v) === k) { prev.resolvers.push(resolve); return; }
    // the job being replaced resolves to null: its asker has moved on
    prev?.resolvers.forEach((r) => r(null));
    waiting.set(channel, { id, v, resolvers: [resolve] });
    pump();
  });
}

async function pump() {
  if (running) return;
  const next = waiting.entries().next();
  if (next.done) return;
  const [channel, job] = next.value;
  waiting.delete(channel);
  running = true;
  const k = key(job.id, job.v);
  let url = shotUrl(job.id, job.v);
  if (!url) {
    const promise = make(job.id, job.v);
    shots.set(k, { url: null, promise });
    url = await promise;
  }
  job.resolvers.forEach((r) => r(url));
  running = false;
  pump();
}

async function make(id, v) {
  const g = gen;
  try {
    await loadPosterIndex();
    const def = applyColorScheme(ROSTER_BY_ID[id], v);
    const mech = await createMech(def);
    warmed.add(key(id, v));
    if (g !== gen) { shots.delete(key(id, v)); return null; }
    const shot = renderPoster(mech);
    if (shot.error) throw new Error(shot.error);
    // WebP with alpha, like the shipped posters: at this size a PNG encode is
    // the slow part of a snapshot (a browser without a WebP encoder hands
    // back a PNG, which works just the same)
    const blob = await new Promise((res) => shot.canvas.toBlob(res, 'image/webp', 0.92));
    const url = URL.createObjectURL(blob);
    shots.set(key(id, v), { url, promise: null });
    trim();
    return url;
  } catch (e) {
    console.warn(`snapshot ${id} scheme ${v} failed: ${e.message}`);
    shots.delete(key(id, v));
    return null;
  }
}

function trim() {
  if (shots.size <= MAX_SHOTS) return;
  for (const [k, s] of shots) {
    if (shots.size <= MAX_SHOTS) break;
    if (!s.url) continue;
    URL.revokeObjectURL(s.url);
    shots.delete(k);
  }
}

/**
 * Build a pick's body once, in its paint, and throw it away — the build is
 * the point: it leaves the GLB, its fit measurements and its recoloured
 * textures cached for the match. A pick that has been photographed has
 * already been built.
 */
export async function warmMech(id, v = 0) {
  const k = key(id, v);
  if (warmed.has(k) || !ROSTER_BY_ID[id]) return;
  warmed.add(k);
  try {
    await createMech(applyColorScheme(ROSTER_BY_ID[id], v));
  } catch (e) { warmed.delete(k); }
}
