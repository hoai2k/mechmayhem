// ============================================================================
// THE ANIME ROSTER — SETTINGS → RENDERING: ANIME (CONFIG.rendering 'anime').
//
// A cel-shaded rendition of the same seventeen fighters, judged against the
// drawings in docs/canonical/anime/ (see docs/ANIME_PROCEDURAL_PLAN.md). It is
// the PROCEDURAL roster wearing different paint: the body is the exact
// parts-kit sculpt the fallback route builds — same 15-joint rig, same
// anchors, same animator, every gait and clip untouched — with every material
// swapped for a flat cel ramp and an INK OUTLINE grown around every part.
// That is deliberate: what makes the drawings read "anime" is the shading and
// the line, not different geometry, so one pass buys the whole roster and a
// mech is refined per-mech only where the shared sculpt misses its drawing.
//
// THREE PIECES:
//   - a shared 4-step GRADIENT MAP (the cel ramp — NearestFilter, or three
//     interpolates the steps away and it is just diffuse shading again)
//   - toonMaterials(def): the named material set buildMech expects, as
//     MeshToonMaterial (glows as UNLIT MeshBasicMaterial — flat bright colour
//     IS the anime glow; fighter.js guards every m.emissive touch, so a
//     material without one is skipped by the hit flash, which is right)
//   - inkOutlines(mech): an inverted-hull child per mesh — same geometry,
//     BackSide, vertices pushed out along their normals a hair. Grown as a
//     CHILD of the mesh it outlines so it inherits every transform, fades
//     with Fighter.setOpacity (it is a mesh in the group like any other) and
//     survives cloneMech. Skipped on glow meshes (a rim muddies a light slit)
//     and never grown on another outline.
//
// PALETTES: ANIME[id] is the hand-read palette from that mech's drawing;
// a mech without one derives its paint from def.colors through animeTone()
// (the drawings are brighter and cleaner than the battle-worn PBR bases).
// ANIME[id].design is the extension point for a per-mech GEOMETRY override
// (same signature as a DESIGNS entry) once a mech needs more than paint.
// ============================================================================
import * as THREE from 'three';
import { buildMech } from './factory.js';

// ---- the cel ramp -----------------------------------------------------------
let _gradientMap = null;
function gradientMap() {
  if (!_gradientMap) {
    // four steps: deep shade, shade, lit, highlight — classic two-tone-plus
    const data = new Uint8Array([90, 140, 220, 255]);
    _gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    _gradientMap.minFilter = THREE.NearestFilter;
    _gradientMap.magFilter = THREE.NearestFilter;
    _gradientMap.needsUpdate = true;
  }
  return _gradientMap;
}

const INK = 0x14151a;

// ---- per-mech palettes (read off docs/canonical/anime/mech_<id>.png) -------
export const ANIME = {
  titanus: {
    primary: 0xe0a721,   // the drawing's crane-yellow, brighter than the PBR base
    accent: 0x565b64,    // gunmetal panels
    frame: 0x3b3f47,
    dark: 0x1d1f24,
    glow: 0xffb340,
    ink: 0x181410,       // warm ink under all that yellow
    // the drawing's reactor is a LARGE amber lens with a bright heart, ringed
    // by the radial petals the shared sculpt already has — the sculpt's own
    // lens is a marble sized for the PBR chest light, so dress a real one on
    dress(mech) {
      const D = mech.dims, s = D.scale, W = D.torsoW;
      const z = W * 0.485 + 0.075 * s;
      const lens = (r, h, mat, dz) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), mat);
        m.rotation.x = Math.PI / 2;
        m.position.set(0, D.torsoH * 0.56, z + dz);
        mech.joints.torso.add(m);
        return m;
      };
      lens(0.40 * s, 0.05 * s, mech.materials.dark, 0);       // housing
      lens(0.34 * s, 0.05 * s, mech.materials.glowSoft, 0.02 * s); // corona
      lens(0.20 * s, 0.05 * s, mech.materials.glow, 0.045 * s);    // heart
    },
  },
};

// The drawings are vivid and clean where the PBR bases are battle-worn and
// dark; a mech with no hand-read palette gets its roster colours pushed
// toward that: saturation up a notch, lightness lifted into the midtones —
// but only proportionally, so a near-black mech (wraith) stays dark.
function animeTone(hex, lift = 1.3) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const s = Math.min(1, hsl.s * 1.25);
  const l = Math.min(0.68, Math.max(hsl.l * lift, Math.min(0.3, hsl.l + 0.05)));
  return new THREE.Color().setHSL(hsl.h, s, l);
}

function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}

// The named material set buildMech hands every design. Same keys as
// factory.makeMaterials, so the sculpts bucket onto them unchanged.
function toonMaterials(def) {
  const p = ANIME[def.id] || {};
  const c = def.colors;
  const primary = p.primary != null ? new THREE.Color(p.primary) : animeTone(c.primary);
  const accent = p.accent != null ? new THREE.Color(p.accent) : animeTone(c.accent);
  const glow = new THREE.Color(p.glow != null ? p.glow : c.glow);
  const mats = {
    primary: toon(primary),
    accent: toon(accent),
    frame: toon(p.frame != null ? p.frame : 0x40444d),
    metal: toon(p.metal != null ? p.metal : 0x9099a4),
    brass: toon(p.brass != null ? p.brass : 0xb38d43),
    dark: toon(p.dark != null ? p.dark : 0x1a1c21),
    // a glow reads FLAT in a drawing, and emissive is exactly that — unlit,
    // uniform. Kept on a real emissive material (not MeshBasicMaterial)
    // because signatures write mats.glow*.emissive/emissiveIntensity live
    // (nullbot's flicker) and the hit flash lerps it.
    // intensity stays under ~1.3: past that the bloom pass saturates an amber
    // slit to white, and the drawings' glows are saturated colour, not white
    glow: toon(glow, { emissive: glow, emissiveIntensity: 1.25 }),
    glowSoft: toon(glow, { emissive: glow, emissiveIntensity: 0.65 }),
  };
  if (c.glow2) {
    mats.glow2 = toon(c.glow2, { emissive: c.glow2, emissiveIntensity: 1.25 });
  }
  for (const k of ['glow', 'glowSoft', 'glow2']) {
    if (mats[k]) mats[k].userData.rwGlow = true; // no ink rim around a light
  }
  return mats;
}

// A design's inline A.custom() materials (decal plates, hazard chevrons) are
// PBR one-offs this module never sees by name — convert each to a toon
// material that keeps its map, so the decals survive with cel shading over
// them. Cached per source material: buckets share instances.
function toonify(material) {
  if (material.isMeshToonMaterial || material.isMeshBasicMaterial) return material;
  const m = new THREE.MeshToonMaterial({
    color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
    map: material.map || null,
    gradientMap: gradientMap(),
  });
  if (material.emissive && (material.emissive.r || material.emissive.g || material.emissive.b)) {
    m.emissive = material.emissive.clone();
    m.emissiveIntensity = material.emissiveIntensity ?? 1;
  }
  return m;
}

// ---- the ink line -----------------------------------------------------------
// One MeshBasicMaterial with the vertices pushed out along their normals —
// BackSide, so what survives the depth test is a rim of ink around the part.
// Built on the stock material (not a ShaderMaterial) so .opacity keeps
// working: Fighter.setOpacity fades the line with the body it is drawn on.
function inkMaterial(width, color = INK) {
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

function inkOutlines(mech, def) {
  const p = ANIME[def.id] || {};
  // line weight scales with the body so a scout and a siege chassis carry
  // the same apparent stroke
  const width = 0.028 * mech.dims.scale;
  const mat = inkMaterial(width, p.ink != null ? p.ink : INK);
  const targets = [];
  mech.group.traverse((o) => {
    if (!o.isMesh || o.userData.rwInk) return;
    // no rim around a light: it reads as a dead pixel border on a glow slit
    if (o.material?.userData?.rwGlow) return;
    targets.push(o);
  });
  for (const o of targets) {
    const line = new THREE.Mesh(o.geometry, mat);
    line.userData.rwInk = true;
    line.castShadow = false;
    line.receiveShadow = false;
    o.add(line); // child: inherits the part's transform, fade and clone
  }
  // NOT registered in mech.materials, twice deliberately: applyWhiteout
  // flashes every entry with a .color (a white-flashing outline is wrong),
  // and cloneMech clones entries — Material.clone() drops onBeforeCompile,
  // which would leave a summoned copy's outline un-displaced. Shared as the
  // one instance, a clone's outlines keep working.
}

// ---- entry ------------------------------------------------------------------
export function buildAnimeMech(def) {
  const mech = buildMech(def);
  // swap the named set: repaint the merged buckets in place
  const mats = toonMaterials(def);
  const byOld = new Map(Object.entries(mech.materials)
    .filter(([k, m]) => m && m.isMaterial && mats[k])
    .map(([k, m]) => [m, mats[k]]));
  mech.group.traverse((o) => {
    if (!o.isMesh) return;
    o.material = byOld.get(o.material) || toonify(o.material);
  });
  Object.assign(mech.materials, mats);
  // the core PointLight gives a PBR body presence; on a cel ramp it blows the
  // whole chest past the top step into one flat blaze — keep a trace of it
  mech.group.traverse((o) => { if (o.isLight) o.intensity *= 0.12; });
  // per-mech refinement: extra geometry the drawing has and the shared sculpt
  // lacks, added BEFORE the ink pass so it gets outlined like everything else
  ANIME[def.id]?.dress?.(mech, def);
  inkOutlines(mech, def);
  mech.isAnime = true;
  return mech;
}
