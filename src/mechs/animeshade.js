// Cel-shading primitives shared by the anime route (src/mechs/anime.js) and
// its per-mech design files (src/mechs/animedesigns/) — a separate module so
// a design can make its own toon materials without importing anime.js back.
import * as THREE from 'three';

let _gradientMap = null;
export function gradientMap() {
  if (!_gradientMap) {
    // four steps: deep shade, shade, lit, highlight — classic two-tone-plus.
    // NearestFilter or three interpolates the steps away and it is just
    // diffuse shading again.
    const data = new Uint8Array([90, 140, 220, 255]);
    _gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    _gradientMap.minFilter = THREE.NearestFilter;
    _gradientMap.magFilter = THREE.NearestFilter;
    _gradientMap.needsUpdate = true;
  }
  return _gradientMap;
}

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}

export const INK = 0x14151a;

// One MeshBasicMaterial with the vertices pushed out along their normals —
// BackSide, so what survives the depth test is a rim of ink around the part.
// Built on the stock material (not a ShaderMaterial) so .opacity keeps
// working: Fighter.setOpacity fades the line with the body it is drawn on.
export function inkMaterial(width, color = INK) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uInk = { value: width };
    sh.vertexShader = ('uniform float uInk;\n' + sh.vertexShader).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\ttransformed += normalize(normal) * uInk;');
  };
  // the program is the same whatever the width (it is a uniform), so one
  // cache key for every mech — see the structureMaterial note in CLAUDE.md
  m.customProgramCacheKey = () => 'rw-ink';
  return m;
}

// Flat-shaded hazard chevrons (dark diagonals over paint) as a toon-lit
// canvas texture: the anime cousin of the PBR hazardMat in designs/titanus.js
// — clean fields, no chips, no grime.
export function hazardMaterial(paint = '#e0a721', dark = '#23252b') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = dark;
  for (let x = -128; x < 256; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 128); ctx.lineTo(x + 46, 0); ctx.lineTo(x + 68, 0); ctx.lineTo(x + 22, 128);
    ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshToonMaterial({ map: tex, gradientMap: gradientMap() });
}
