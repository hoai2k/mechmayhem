// DISTANCE HAZE BLUR — the post pass that makes fog behave like air.
//
// three's fog only LERPS a fragment toward the fog colour, so a tower at the
// limit of vision goes grey but keeps a razor-sharp silhouette, which reads
// as a cardboard cut-out rather than distance. This pass samples the depth
// buffer and blurs each fragment by how deep into the fog band it sits, so
// far geometry loses its edges the way real aerial perspective does.
//
// Blur ramps in over the same near..far band the scene fog uses, then ramps
// back OUT beyond it: the sky dome and the distant horizon strip live past
// the fog wall and must stay crisp (they are painted backdrops — blurring
// them just smears the clouds).
//
// Every view runs it: single-screen through the main composer, and each
// split-screen viewport through its own (engine.js keeps a small pool).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const _size = new THREE.Vector2();

export const HazeBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uCamNear: { value: 0.5 },
    uCamFar: { value: 2200 },
    uFogNear: { value: 100 },
    uFogFar: { value: 300 },
    uRadius: { value: 3.2 },     // max blur radius, pixels
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uCamNear, uCamFar, uFogNear, uFogFar, uRadius;
    varying vec2 vUv;

    // perspective depth [0,1] -> positive view-space distance
    float viewDist(float d) {
      float z = d * 2.0 - 1.0;
      return (2.0 * uCamNear * uCamFar) / (uCamFar + uCamNear - z * (uCamFar - uCamNear));
    }

    void main() {
      float dist = viewDist(texture2D(tDepth, vUv).x);
      // how far into the fog band this fragment sits...
      float band = smoothstep(uFogNear, uFogFar, dist);
      // ...but the painted backdrop (sky dome, horizon ring) sits BEYOND the
      // fog wall and stays sharp
      float backdrop = 1.0 - smoothstep(uFogFar * 1.3, uFogFar * 1.9, dist);
      float amt = pow(band, 0.75) * backdrop;
      vec4 base = texture2D(tDiffuse, vUv);
      if (amt < 0.02) { gl_FragColor = base; return; }

      float r = uRadius * amt;
      vec2 o = uTexel * r;
      // 12 taps: two rings, rotated against each other
      vec4 sum = base * 2.0;
      float wsum = 2.0;
      const int N = 6;
      for (int i = 0; i < N; i++) {
        float a = float(i) * 1.0471976;             // 60° apart
        vec2 d1 = vec2(cos(a), sin(a));
        vec2 d2 = vec2(cos(a + 0.5236), sin(a + 0.5236)) * 0.55;
        sum += texture2D(tDiffuse, vUv + d1 * o);
        sum += texture2D(tDiffuse, vUv + d2 * o);
        wsum += 2.0;
      }
      gl_FragColor = mix(base, sum / wsum, amt);
    }
  `,
};

/**
 * Replaces the composer's RenderPass: renders the scene into a target that
 * carries its OWN depth texture, then blurs from it into the composer's
 * buffer. Rendering and sampling must not share a depth attachment — hanging
 * the depth texture on the composer's own ping-pong targets makes the GPU
 * see a framebuffer feedback loop and drop the draw (a black screen).
 */
export class HazeRenderPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;   // writes into readBuffer, exactly like RenderPass
    this.target = null;       // built on first render (see _ensureTarget)
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(HazeBlurShader.uniforms),
      vertexShader: HazeBlurShader.vertexShader,
      fragmentShader: HazeBlurShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.uniforms = this.material.uniforms;
    this.fsQuad = new FullScreenQuad(this.material);
  }

  // the composer reports its target size in DEVICE pixels; a split view's
  // composer is sized to that viewport, not the whole canvas
  setSize(w, h) {
    this._w = w;
    this._h = h;
  }

  // Resizing a render target that owns a depth texture leaves the depth
  // attachment stale (it samples as 1.0 — "everything is at the far plane",
  // so nothing ever blurs); building a fresh target + depth texture on a
  // size change avoids the whole question.
  _ensureTarget(renderer) {
    let w = this._w, h = this._h;
    if (!w || !h) {
      const size = renderer.getDrawingBufferSize(_size);
      w = size.x; h = size.y;
    }
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (this.target && this.target.width === w && this.target.height === h) return;
    this.target?.dispose();
    this.target?.depthTexture?.dispose();
    this.target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(w, h),
    });
    this.uniforms.tDepth.value = this.target.depthTexture;
    this.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    this._ensureTarget(renderer);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    this.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.target?.dispose();
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
