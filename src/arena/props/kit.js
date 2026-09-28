// The prop builders' shared kit: the material palette (M, also exported from
// ../props.js as PROP_MATS), the pack-texture material with its procedural
// fallback, and the two primitives nearly every builder is made of.
import * as THREE from 'three';
import { pbrMaterial } from '../../core/texload.js';
import { CONFIG } from '../../core/config.js';

export const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.85 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6, metalness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xa87c3c, roughness: 0.35, metalness: 0.9 }),
  copper: new THREE.MeshStandardMaterial({ color: 0x8c5230, roughness: 0.4, metalness: 0.85 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x6e4a30, roughness: 0.85, metalness: 0.4 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.9, metalness: 0.05 }),
  redPaint: new THREE.MeshStandardMaterial({ color: 0x9c3428, roughness: 0.55, metalness: 0.3 }),
  bluePaint: new THREE.MeshStandardMaterial({ color: 0x2e5e8c, roughness: 0.55, metalness: 0.3 }),
  yellowPaint: new THREE.MeshStandardMaterial({ color: 0xc8a028, roughness: 0.55, metalness: 0.3 }),
  glowWarm: new THREE.MeshStandardMaterial({ color: 0xffc060, emissive: 0xffc060, emissiveIntensity: 2 }),
  glowCyan: new THREE.MeshStandardMaterial({ color: 0x53e8ff, emissive: 0x53e8ff, emissiveIntensity: 2 }),
  glowRed: new THREE.MeshStandardMaterial({ color: 0xff4030, emissive: 0xff4030, emissiveIntensity: 2 }),
  glowLava: new THREE.MeshStandardMaterial({ color: 0xff6a20, emissive: 0xff5a10, emissiveIntensity: 2.4 }),
  ice: new THREE.MeshPhysicalMaterial({ color: 0xbfeaff, roughness: 0.15, metalness: 0, transmission: 0.4, transparent: true, opacity: 0.85 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0xb46bff, emissive: 0x8a3cff, emissiveIntensity: 0.9, roughness: 0.2 }),
  sandstone: new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 0.9, metalness: 0.02 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x3c6e38, roughness: 0.9, metalness: 0 }),
  foliageBright: new THREE.MeshStandardMaterial({ color: 0x5a9648, roughness: 0.9, metalness: 0 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6e5638, roughness: 0.85, metalness: 0 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.14, metalness: 1.0 }),
  whitePaint: new THREE.MeshStandardMaterial({ color: 0xe4e6e2, roughness: 0.5, metalness: 0.2 }),
  obsidian: new THREE.MeshStandardMaterial({ color: 0x181420, roughness: 0.12, metalness: 0.35 }),
  moss: new THREE.MeshStandardMaterial({ color: 0x4a7a3c, roughness: 0.95, metalness: 0 }),
  mossyStone: new THREE.MeshStandardMaterial({ color: 0x646c52, roughness: 0.95, metalness: 0.02 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.95, metalness: 0.05 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xa8d4e8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32 }),
  water: new THREE.MeshStandardMaterial({ color: 0x2e86b0, emissive: 0x0e3a55, emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85 }),
  glowMagenta: new THREE.MeshStandardMaterial({ color: 0xff4dd8, emissive: 0xff4dd8, emissiveIntensity: 2 }),
  glowGreen: new THREE.MeshStandardMaterial({ color: 0x62ff9a, emissive: 0x62ff9a, emissiveIntensity: 2 }),
  glowViolet: new THREE.MeshStandardMaterial({ color: 0xb46bff, emissive: 0xb46bff, emissiveIntensity: 2 }),
  glowTeal: new THREE.MeshStandardMaterial({ color: 0x2ee6c8, emissive: 0x2ee6c8, emissiveIntensity: 1.6 }),
  lavaCore: new THREE.MeshStandardMaterial({ color: 0xffd040, emissive: 0xffb020, emissiveIntensity: 3.2 }),
  lacquer: new THREE.MeshStandardMaterial({ color: 0x2c1418, roughness: 0.25, metalness: 0.4 }),
  canvas: new THREE.MeshStandardMaterial({ color: 0xc0b090, roughness: 0.95, metalness: 0 }),
  hullRed: new THREE.MeshStandardMaterial({ color: 0x8c2a1e, roughness: 0.6, metalness: 0.45 }),
  panelSolar: new THREE.MeshStandardMaterial({ color: 0x1c2c52, roughness: 0.25, metalness: 0.6 }),
  frost: new THREE.MeshStandardMaterial({ color: 0xdceef8, roughness: 0.55, metalness: 0.05 }),
  palmFrond: new THREE.MeshStandardMaterial({ color: 0x4a7a34, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  basalt: new THREE.MeshStandardMaterial({ color: 0x2e2a30, roughness: 0.85, metalness: 0.08 }),
};

// pack-texture material for a prop surface, procedural fallback if the pack
// entry hasn't been generated yet (see docs/ARENA_ASSET_PROMPTS.md §1)
const _texMatCache = new Map();
export function texMat(name, fallback, opts = {}) {
  if (!CONFIG.useTextures) return fallback;
  const key = `${name}|${opts.repeat || 1}|${opts.color ?? ''}`;
  if (!_texMatCache.has(key)) _texMatCache.set(key, pbrMaterial('prop', name, opts) || null);
  return _texMatCache.get(key) || fallback;
}
// riveted yellow machine plate, shared by the heavy plant (cranes, crusher,
// drill rig, snowcat) — falls back to flat yellow paint
export const machinePaint = (repeat = 2) => texMat('prop_metal_painted', M.yellowPaint, { repeat });

export function box(mat, w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function cyl(mat, rt, rb, h, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
