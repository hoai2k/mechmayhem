// ============================================================================
// THE ANIME ROSTER — SETTINGS → RENDERING: ANIME (CONFIG.rendering 'anime').
//
// A cel-shaded rendition of the same seventeen fighters, judged against the
// drawings in docs/canonical/anime/ (see docs/ANIME_PROCEDURAL_PLAN.md). Two
// tiers of fidelity, decided per mech by the ANIME table below:
//
//   - a mech WITH a `design` entry gets a DEDICATED ANIME SCULPT
//     (src/mechs/animedesigns/<id>.js): its own part decomposition and its
//     own measured proportions (`dims` transforms computeDims), authored
//     part-by-part against that mech's drawing. Same 15-joint rig, same
//     anchors contract, same animator — only the geometry is its own.
//   - a mech WITHOUT one is the shared parts-kit sculpt wearing anime paint:
//     every named material swapped for a cel ramp, decal customs converted
//     in place, ink outlines grown around every part.
//
// Shared pieces (src/mechs/animeshade.js): the 4-step gradient map, toon(),
// the ink material. Glows stay REAL EMISSIVE materials — signatures write
// mats.glow*.emissive live (nullbot's flicker) — at intensity ~1.25, under
// where the bloom pass whites an amber slit out. The chest PointLight is cut
// to 12%: on a cel ramp it blazes the whole torso past the top step.
// ============================================================================
import * as THREE from 'three';
import { buildMech } from './factory.js';
import { toon, inkMaterial, INK } from './animeshade.js';
import { animeTitanus, animeTitanusDims } from './animedesigns/titanus.js';
import { animeGlacier, animeGlacierDims } from './animedesigns/glacier.js';

// ---- per-mech entries (palettes read off docs/canonical/anime/<id>.png) ----
//   primary/accent/frame/dark/metal/brass/glow — the named material colours
//   ink            — outline colour (default near-black INK)
//   design, dims   — dedicated sculpt + measured proportions (see above)
//   dress(mech)    — small extra geometry over the SHARED sculpt (for mechs
//                    that stay on it); a dedicated design never needs it
export const ANIME = {
  titanus: {
    primary: 0xe0a721,   // the drawing's crane-yellow, brighter than the PBR base
    accent: 0x51555e,    // mid gunmetal panels
    frame: 0x3a3e46,     // dark gunmetal structure
    dark: 0x212329,      // near-black trim
    metal: 0x8f97a2,
    glow: 0xffb028,
    ink: 0x181410,       // warm ink under all that yellow
    design: animeTitanus,
    dims: animeTitanusDims,
  },
  glacier: {
    primary: 0x9cb2c6,   // the roster's ice blue — pale but with real shade
    accent: 0x7d93a8,
    frame: 0x525b67,
    dark: 0x2e333c,
    metal: 0x99a4b1,
    glow: 0x54d4ff,      // the cyan visor/core
    ink: 0x121620,
    design: animeGlacier,
    dims: animeGlacierDims,
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

// The named material set buildMech hands every design. Same keys as
// factory.makeMaterials, so both the shared sculpts and the dedicated anime
// designs bucket onto them unchanged.
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
    // a glow reads FLAT in a drawing, and emissive is exactly that — kept on
    // a real emissive material (never MeshBasicMaterial) because signatures
    // write mats.glow*.emissive/emissiveIntensity live and the hit flash
    // lerps it. Intensity stays under ~1.3: past that the bloom pass
    // saturates an amber slit to white.
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
// them. A material that is already toon/basic (a dedicated anime design's
// own customs) passes through untouched.
function toonify(material) {
  if (material.isMeshToonMaterial || material.isMeshBasicMaterial) return material;
  const m = toon(material.color ? material.color.clone() : new THREE.Color(0xffffff), {
    map: material.map || null,
  });
  if (material.emissive && (material.emissive.r || material.emissive.g || material.emissive.b)) {
    m.emissive = material.emissive.clone();
    m.emissiveIntensity = material.emissiveIntensity ?? 1;
  }
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
  const entry = ANIME[def.id] || {};
  const mats = toonMaterials(def);
  let mech;
  if (entry.design) {
    // dedicated anime sculpt: its own parts, its own measured proportions,
    // built straight onto the toon set — nothing to convert afterwards
    mech = buildMech(def, { design: entry.design, materials: mats, dims: entry.dims });
  } else {
    // shared sculpt wearing anime paint: repaint the merged buckets in place
    mech = buildMech(def);
    const byOld = new Map(Object.entries(mech.materials)
      .filter(([k, m]) => m && m.isMaterial && mats[k])
      .map(([k, m]) => [m, mats[k]]));
    mech.group.traverse((o) => {
      if (!o.isMesh) return;
      o.material = byOld.get(o.material) || toonify(o.material);
    });
    Object.assign(mech.materials, mats);
  }
  // the core PointLight gives a PBR body presence; on a cel ramp it blows the
  // whole chest past the top step into one flat blaze — keep a trace of it
  mech.group.traverse((o) => { if (o.isLight) o.intensity *= 0.12; });
  // per-mech refinement over the SHARED sculpt: extra geometry the drawing
  // has and it lacks, added BEFORE the ink pass so it gets outlined too
  if (!entry.design) entry.dress?.(mech, def);
  inkOutlines(mech, def);
  mech.isAnime = true;
  return mech;
}
