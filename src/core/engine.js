// Renderer, scene, camera, lighting rig, post-processing, game loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { HazeRenderPass } from './hazeblur.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp } from './utils.js';
import { CONFIG } from './config.js';

const _bufSize = new THREE.Vector2();
import { showContextLost, WebGLUnavailableError } from './fatal.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    // A machine with no WebGL 2 throws here, and used to leave the player
    // staring at an empty canvas. Tag it so the entry point can say so.
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      throw new WebGLUnavailableError(e);
    }

    // The GPU can take the context away at any time — a driver reset, VRAM
    // pressure, a phone backgrounding the tab. Without preventDefault() the
    // context never comes back at all; with it, three CAN restore, but every
    // procedurally generated texture, render target and baked mesh in this
    // game would have to be regenerated to match. A reload is the honest
    // recovery, so say so rather than freezing.
    this._onContextLost = (ev) => {
      ev.preventDefault();
      this._running = false;   // stop the loop even if an error panel got here first
      showContextLost();
    };
    canvas.addEventListener('webglcontextlost', this._onContextLost, false);

    this.renderer.setPixelRatio(clamp(window.devicePixelRatio, 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 2200);
    this.camera.position.set(0, 14, 42);

    // Environment reflections for PBR metals.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // ---- lighting rig (arena setups override colors/positions) ----
    this.hemi = new THREE.HemisphereLight(0x8fb4d8, 0x2a2620, 0.7);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
    this.sun.position.set(60, 90, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 320;
    const ext = 135; // covers the doubled arenas corner to corner
    this.sun.shadow.camera.left = -ext;
    this.sun.shadow.camera.right = ext;
    this.sun.shadow.camera.top = ext;
    this.sun.shadow.camera.bottom = -ext;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.rim = new THREE.DirectionalLight(0x5f8fff, 0.85);
    this.rim.position.set(-50, 40, -60);
    this.scene.add(this.rim);

    // ---- post-processing ----
    // The scene render and the DISTANCE HAZE BLUR are one pass
    // (core/hazeblur.js): fog that softens silhouettes instead of only
    // greying them. It runs before bloom, so bloom sees the hazed image.
    const main = this._makePostChain(this.camera);
    this.composer = main.composer;
    this.haze = main.haze;
    this.bloom = main.bloom;
    this.fxaa = main.fxaa;
    this.renderPass = main.haze;   // the haze pass IS the scene render
    // SPLIT-SCREEN: one chain per viewport, built on demand and sized to
    // THAT viewport. A single shared full-canvas chain can't work — the
    // scene would be rendered at the full aspect and squeezed into a half
    // rect, and bloom would bleed across the split line, since a bloom pass
    // treats its whole buffer as one image.
    this._viewChains = [];

    // ---- loop state ----
    this.views = null;         // split-screen: [{camera, x, y, w, h}] (0..1)
    this.backdrop = null;      // camera-locked skyline group (re-centered per view)
    this.onBeforeView = null;  // (camera) => {} pre-render per view (wrap shifting)
    this.onAfterView = null;   // () => {} post-render per view
    this.timeScale = 1;
    this.hazeStrength = 1;     // distance-haze blur multiplier (0 = off)
    this.hitStop = 0;          // seconds of near-freeze remaining
    this.elapsed = 0;
    this.onUpdate = null;      // (dt) => {} game-time step
    this.onRender = null;      // (dtReal) => {} real-time (camera, UI)
    this._last = performance.now();
    this._running = false;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // one post chain: haze/scene render → bloom → output → FXAA
  _makePostChain(camera) {
    const composer = new EffectComposer(this.renderer);
    const haze = new HazeRenderPass(this.scene, camera);
    composer.addPass(haze);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const fxaa = new ShaderPass(FXAAShader);
    composer.addPass(fxaa);
    return { composer, haze, bloom, fxaa };
  }

  // per-view chain, (re)sized to the viewport it draws — CSS pixels in, the
  // composer applies the pixel ratio itself
  _viewChain(i, camera, cssW, cssH) {
    let c = this._viewChains[i];
    if (!c) {
      c = this._makePostChain(camera);
      c.w = c.h = 0;
      this._viewChains[i] = c;
    }
    c.haze.camera = camera;
    if (c.w !== cssW || c.h !== cssH) {
      c.w = cssW; c.h = cssH;
      c.composer.setSize(cssW, cssH);
      const pr = this.renderer.getPixelRatio();
      c.fxaa.material.uniforms.resolution.value.set(1 / (cssW * pr), 1 / (cssH * pr));
    }
    return c;
  }

  // fog band + resolution-scaled blur radius for one chain's haze pass
  _syncHaze(chain, camera) {
    const u = chain.haze.uniforms;
    u.uCamNear.value = camera.near;
    u.uCamFar.value = camera.far;
    const fog = this.scene.fog;
    u.uFogNear.value = fog ? fog.near : 1e9;
    u.uFogFar.value = fog ? fog.far : 1e9;
    const px = chain.h ? chain.h * this.renderer.getPixelRatio()
      : this.renderer.getDrawingBufferSize(_bufSize).y;
    u.uRadius.value = fog ? clamp(px * 0.009, 2.5, 12) * this.hazeStrength : 0;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    this.haze.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
    // split chains re-size themselves on the next frame (their rects change
    // with the window), so just forget the cached sizes
    for (const c of this._viewChains) { if (c) c.w = c.h = 0; }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    const tick = (now) => {
      if (!this._running) return;
      requestAnimationFrame(tick);
      let dtReal = (now - this._last) / 1000;
      this._last = now;
      dtReal = clamp(dtReal, 0, 1 / 20);

      if (this.paused) {
        // capture: sim advances via step(); render just often enough to
        // keep the compositor fed (step() renders every real frame)
        this._pausedSkip = ((this._pausedSkip || 0) + 1) % 8;
        if (this._pausedSkip === 0) this._render();
        return;
      }

      let dt = dtReal * this.timeScale;
      if (this.hitStop > 0) {
        this.hitStop -= dtReal;
        dt *= 0.05; // near-freeze for impact punch
      }
      this.elapsed += dt;

      if (this.onUpdate) this.onUpdate(dt);
      if (this.onRender) this.onRender(dtReal);

      this._render();
    };
    requestAnimationFrame(tick);
  }

  _render() {
    {
      if (this.views && this.views.length > 1) {
        // SPLIT-SCREEN: every viewport gets the same post chain the single
        // view does (haze blur, bloom, FXAA), each through its own composer
        // sized to that rect. The final pass writes to the canvas, and
        // setRenderTarget(null) restores the viewport/scissor set here — so
        // each chain lands in its own corner of the screen.
        const W = window.innerWidth, H = window.innerHeight;
        this.renderer.setScissorTest(true);
        this.views.forEach((v, i) => {
          if (this.backdrop) this.backdrop.position.set(v.camera.position.x, 0, v.camera.position.z);
          this.onBeforeView?.(v.camera);
          const x = v.x * W, y = v.y * H, w = v.w * W, h = v.h * H;
          this.renderer.setViewport(x, y, w, h);
          this.renderer.setScissor(x, y, w, h);
          if (CONFIG.splitPostFx) {
            const chain = this._viewChain(i, v.camera, w, h);
            this._syncHaze(chain, v.camera);
            chain.composer.render();
          } else {
            this.renderer.render(this.scene, v.camera);   // ?postfx=single
          }
          this.onAfterView?.();
        });
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, W, H);
      } else {
        if (this.backdrop) this.backdrop.position.set(this.camera.position.x, 0, this.camera.position.z);
        this.onBeforeView?.(this.camera);
        // the haze band tracks whatever fog the current arena installed
        this._syncHaze({ haze: this.haze, h: 0 }, this.camera);
        this.composer.render();
        this.onAfterView?.();
      }
    }
  }

  addHitStop(seconds) {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  // capture mode: RAF keeps presenting frames (so screenshots don't stall)
  // but the sim only advances through step()
  step(dtReal = 1 / 30) {
    const n = Math.max(1, Math.ceil(dtReal / (1 / 30)));
    for (let i = 0; i < n; i++) {
      let dt = (dtReal / n) * this.timeScale;
      if (this.hitStop > 0) {
        this.hitStop -= dtReal / n;
        dt *= 0.05;
      }
      this.elapsed += dt;
      if (this.onUpdate) this.onUpdate(dt);
      if (this.onRender) this.onRender(dtReal / n);
    }
    this._render();
  }
}
