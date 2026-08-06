// Arena: builds a themed battleground (sky, lights, ground, destructible
// buildings, props, ambient particles) and services combat queries.
import * as THREE from 'three';
import { DestructibleSystem } from './destructible.js';
import { Terrain } from './terrain.js';
import { generateMassing, THEME_MASSING } from './massing.js';
import {
  STRUCTURE_KINDS, structureMaterial, structureChunkShape, structureMassing,
  structSeed, assignStructures, themeStructureKinds,
} from './structures.js';
import { buildingDonors } from './buildglb.js';
import { PROPS, PROP_MATS, placeProp, mergePropMeshes } from './props.js';
import { roadTexture, chunkFacade, skyStarsTexture } from '../core/textures.js';
import { propShell } from './propshell.js';
import { arenaDesignSystem } from './designs/index.js';
import { traitsFor } from './designs/proptraits.js';
import { sunYawOf, frontClear, traitYaw } from './designs/util.js';
import { rand, makeRng, clamp } from '../core/utils.js';
import { CONFIG } from '../core/config.js';
import { pbrMaterial, hasTex, loadMap } from '../core/texload.js';

// texture-pack material names per arena / building style
export const GROUND_TEX = {
  neon: 'ground_neon_asphalt', foundry: 'ground_foundry_ironplate',
  uptown: 'ground_uptown_paving', harbor: 'ground_harbor_concrete',
  skyterrace: 'ground_skyterrace_roofpanel', scrapyard: 'ground_scrapyard_dirt',
  quarry: 'ground_quarry_rock', volcano: 'ground_volcano_basalt',
  frozen: 'ground_frozen_snowice', ruins: 'ground_ruins_sandstone',
  jungle: 'ground_jungle_mossstone', orbital: 'ground_orbital_deck',
};
export const FACADE_TEX = {
  0: 'bldg_concrete_panel', 1: 'bldg_brick_industrial',
  2: 'bldg_glass_office', 3: 'bldg_steampunk_metal',
};

/**
 * Every texture-pack entry an arena of this theme is going to ask for, as
 * [set, name] pairs — the sky panorama, the horizon strip, the ground, the
 * building facade and its roof. The idle prefetcher warms exactly this list
 * for the arena it expects to be played (see game/predict.js), which is why
 * the knowledge of WHICH textures a theme uses stays here, beside the code
 * that uses them, instead of being copied into the prefetcher.
 */
export function arenaTexEntries(theme) {
  const out = [];
  if (!theme) return out;
  out.push(['sky', `sky_${theme.id}`], ['sky', `horizon_${theme.id}`]);
  if (GROUND_TEX[theme.id]) out.push(['ground', GROUND_TEX[theme.id]]);
  const facade = facadeTexFor(theme);
  if (facade) {
    out.push(['building', facade],
      ['building', theme.buildings?.roofTex || 'bldg_roof_gravel']);
  }
  // …and the materials this theme's LARGE STRUCTURES want (rock, crystal,
  // ice). Listed whether or not the images exist yet — the filter below
  // drops the ones that don't, so the prefetcher warms them the day they
  // land and nothing changes until then.
  for (const kind of themeStructureKinds(theme)) {
    const tex = STRUCTURE_KINDS[kind]?.tex;
    if (tex) out.push(['struct', tex]);
  }
  return out.filter(([set, name]) => hasTex(set, name));
}

// The facade material a theme's buildings wear: a theme may name its OWN
// (`buildings.facadeTex` — the per-theme facades in docs/
// ASSET_REQUESTS_ARENA_DESIGN.md land here), gated on the texture actually
// existing so a named-but-not-yet-generated facade quietly keeps the shared
// per-style default. Same rule for `buildings.roofTex`.
function facadeTexFor(theme) {
  const own = theme.buildings?.facadeTex;
  if (own && hasTex('building', own)) return own;
  return FACADE_TEX[theme.buildings?.styles?.[0]] || null;
}

const _v = new THREE.Vector3();

// recipe numbers are read by a human in the level editor's export — a placement
// is not more accurate for carrying fifteen decimals
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 1000) / 1000;

function makeSkyDome(theme) {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  // generated sky panorama (src/textures/sky/sky_<id>/) — equirect, sampled
  // analytically from the view direction; falls back to the gradient dome
  const pano = CONFIG.useTextures && hasTex('sky', `sky_${theme.id}`)
    ? loadMap('sky', `sky_${theme.id}`, 'albedo', { srgb: true }) : null;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(theme.sky.top) },
      uBottom: { value: new THREE.Color(theme.sky.bottom) },
      uStars: { value: theme.sky.stars ? skyStarsTexture() : null },
      uHasStars: { value: theme.sky.stars && !pano ? 1 : 0 },
      uPano: { value: pano },
      uHasPano: { value: pano ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      varying vec2 vUv;
      void main() {
        vDir = normalize(position);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uBottom;
      uniform sampler2D uStars; uniform float uHasStars;
      uniform sampler2D uPano; uniform float uHasPano;
      varying vec3 vDir; varying vec2 vUv;
      void main() {
        float h = clamp(vDir.y * 1.4 + 0.18, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(h, 0.8));
        if (uHasPano > 0.5) {
          vec2 uv = vec2(atan(vDir.z, vDir.x) / 6.2831853 + 0.5,
                         asin(clamp(vDir.y, -1.0, 1.0)) / 3.1415926 + 0.5);
          vec3 p = texture2D(uPano, uv).rgb;
          // gradient keeps the very horizon (fog band) — pano owns the sky
          col = mix(col, p, smoothstep(-0.02, 0.14, vDir.y));
        }
        if (uHasStars > 0.5 && vDir.y > 0.02) {
          vec3 s = texture2D(uStars, vUv * vec2(3.0, 2.0)).rgb;
          col += s * smoothstep(0.02, 0.3, vDir.y);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return mesh;
}

export class Arena {
  constructor(engine, theme, seed = 7) {
    this.engine = engine;
    this.scene = engine.scene;
    this.theme = theme;
    this.bounds = theme.bounds * 2;   // arenas doubled — more city to wreck
    this.world = null;
    this.objects = [];   // everything we added (for dispose)
    this.spinners = [];  // props with userData.spin
    this.bobbers = [];   // props with userData.bob (boats, buoys, gondolas)
    this.t = 0;
    this.steamSpots = [];
    this.explosives = []; // fuel tanks etc. that cook off when hit
    this.spikes = [];      // ground spike clusters: contact damage + shove
    this.campfires = [];   // attack one and it flares into a fire patch
    this.propBodies = [];  // solid, destructible structures (cylinder colliders)
    this.ghostPropGroups = []; // the 8 toroidal clones (mirror destruction)
    this.ambientT = 0;
    // RECIPE: every building / prop this arena placed, written down in the
    // level editor's own authored format as it is placed. A procedural arena
    // is a seeded one-off — the arena editor turns one into an editable level
    // by building it and reading this back (src/arena/bake.js), so there is no
    // second copy of the generation rules to drift out of sync.
    //
    // OFF unless asked for (`theme.recordRecipe`, set by the workbench adapter
    // and by nothing else). A match has no use for the list and the game does
    // not ship the tool that reads it, so it should not be building it either.
    this.recipe = theme.recordRecipe ? { buildings: [], props: [] } : null;
    const rng = makeRng(seed * 31 + theme.id.length * 77);

    // Toroidal cell: coordinates wrap at ±wrapHalf (world.bind reads this).
    // Computed up front — the fog band, ground extent and backdrop distance
    // are all derived from the cell period P below.
    const B = this.bounds;
    this.wrapHalf = B * 1.35;
    const P = this.wrapHalf * 2;

    // ---- environment ----
    this.sky = makeSkyDome(theme);
    this.scene.add(this.sky);
    this.objects.push(this.sky);
    // LONG SIGHT LINES: the world is ghost-tiled ±1 cell in every direction
    // (corners included), and fighters are never cloned — so the view can
    // legally run almost a full cell period before the scene would repeat
    // through your own position. Fog opens at the theme's near distance and
    // closes just short of P; everything past the ghost ring (>1.5P) sits
    // beyond full fog, so there is no pop-out to hide.
    // (0.92P, not 1.0P: a chase camera sits a little outside its fighter's
    // folded position, so the ghost ring must still cover the far edge)
    //
    // The band starts at 0.45–0.62P — far enough out that the WHOLE play
    // area (radius B = 0.37P) is crisp, so haze only ever eats the wrap
    // ring and the tile beyond it. The theme's own near distance still
    // steers where in that window it lands, keeping murky arenas murky.
    // Silhouettes inside the band are softened by core/hazeblur.js.
    this.scene.fog = new THREE.Fog(theme.fog.color,
      clamp(theme.fog.near * 1.5, P * 0.45, P * 0.62), P * 0.92);
    this.scene.background = null;

    const { sun, hemi, rim } = engine;
    sun.color.set(theme.sun.color);
    sun.intensity = theme.sun.intensity;
    sun.position.set(...theme.sun.pos);
    hemi.color.set(theme.hemi.sky);
    hemi.groundColor.set(theme.hemi.ground);
    hemi.intensity = theme.hemi.intensity;
    rim.color.set(theme.rim.color);
    rim.intensity = theme.rim.intensity;
    if (theme.rim.pos) rim.position.set(...theme.rim.pos);
    engine.renderer.toneMappingExposure = theme.exposure ?? 1.0;

    // ---- ground ----
    // texture repeats are per-700-units of plane, so widening the ground for
    // the long view keeps its texel density instead of stretching
    const texScale = (P * 3) / 700;
    let gmat = null;
    if (CONFIG.useTextures && GROUND_TEX[theme.id]) {
      // pack texture, lightly tinted toward the theme's ground color so
      // arena mood grading survives
      gmat = pbrMaterial('ground', GROUND_TEX[theme.id], {
        repeat: Math.round(44 * texScale),
        color: new THREE.Color(theme.ground.color).lerp(new THREE.Color(0xffffff), 0.55),
      });
    }
    if (!gmat) {
      gmat = new THREE.MeshStandardMaterial({
        color: theme.ground.color, roughness: 0.88, metalness: 0.08,
      });
      if (theme.ground.road) {
        gmat.map = roadTexture();
        gmat.map.repeat.set(7 * texScale, 7 * texScale);
        gmat.color.set(0xffffff);
      }
    }
    // ground reaches past the fog wall (±1.5 cells) so no matter how far the
    // view runs, the floor never ends inside the visible range
    this.groundSpan = P * 3;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.groundSpan, this.groundSpan), gmat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.objects.push(ground);

    // No walls anymore: the arena wraps toroidally at ±wrapHalf (set on the
    // world in bind), out in the foggy empty ring where the seam is subtle.

    // ---- skyline backdrop (cheap, far, unlit boxes) ----
    // camera-locked: the engine re-centers it on each view camera before
    // rendering, so it reads as an infinitely distant city and never gets
    // crossed or wrapped (this is what used to look like "grey buildings"
    // popping at the seam).
    // pushed out past the visible tiling (was a fixed 230–340, which now sits
    // INSIDE the long view and read as a wall through the real city): the
    // silhouette belongs at the fog wall, scaled up so it keeps its
    // apparent size from the middle of the arena
    const skyline = new THREE.Group();
    const hasHorizonTex = CONFIG.useTextures && hasTex('sky', `horizon_${theme.id}`);
    // The generated horizon strip (below) IS the distant scenery when it
    // exists — the box silhouettes would only stand in front of it as flat
    // fog-coloured slabs, so they are the FALLBACK, not an extra layer.
    if (!hasHorizonTex) {
      const bdR0 = P * 0.88, bdR1 = P * 1.08;
      const bdScale = bdR0 / 230;
      const skyMatDark = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.fog.color).multiplyScalar(0.55) });
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + rng.range(-0.05, 0.05);
        const r = rng.range(bdR0, bdR1);
        const w = rng.range(14, 34) * bdScale, h = rng.range(24, 100) * bdScale, d = rng.range(14, 34) * bdScale;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skyMatDark);
        m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
        m.rotation.y = rng.range(0, Math.PI);
        skyline.add(m);
      }
    }
    // generated distant-horizon strip (src/textures/sky/horizon_<id>/):
    // mountains / skyline silhouette on a far ring, camera-locked with the
    // boxes so it never crosses the wrap seam. Unlit + fog-free — the strip
    // bakes its own haze.
    if (hasHorizonTex) {
      const tex = loadMap('sky', `horizon_${theme.id}`, 'albedo', { srgb: true });
      tex.repeat.set(3, 1);   // ~8:1 strip tiled 3× around the ring
      // vertical CLAMP, no mips: repeat-wrapping T let the strip's opaque
      // ground-haze bottom row bleed into its transparent top row, drawing a
      // faint dotted line across the sky at the ring's rim
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      const ringR = Math.max(620, P * 1.6);   // always outside the skyline boxes
      const ringH = ringR * 0.28;
      // vertical alpha ramp (opaque at the scenery line, clear at the rim):
      // a strip whose baked sky haze isn't perfectly transparent would
      // otherwise show its top edge as a straight line across the sky
      const ringGeo = new THREE.CylinderGeometry(ringR, ringR, ringH, 48, 8, true);
      const pos = ringGeo.attributes.position;
      const col = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) + ringH / 2) / ringH;          // 0 bottom → 1 top
        col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
        col[i * 4 + 3] = 1 - clamp((t - 0.55) / 0.45, 0, 1);
      }
      ringGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, side: THREE.BackSide,
          vertexColors: true, depthWrite: false, fog: false,
        })
      );
      ring.position.y = ringH / 2 - ringH * 0.08;
      ring.renderOrder = -9;
      skyline.add(ring);
    }
    this.scene.add(skyline);
    this.objects.push(skyline);
    engine.backdrop = skyline;

    // ---- destructible buildings ----
    const styleIdx = theme.buildings.styles[0];
    const facadeTex = facadeTexFor(theme);
    let sideMat = null, roofMat = null;
    if (CONFIG.useTextures && facadeTex) {
      // pack facade: one tile ≈ one floor band, per-chunk face UVs are 0..1
      sideMat = pbrMaterial('building', facadeTex, {
        repeat: 1, emissiveIntensity: theme.buildings.glow ? 0.6 : 0.0,
      });
      const roofName = theme.buildings.roofTex && hasTex('building', theme.buildings.roofTex)
        ? theme.buildings.roofTex : 'bldg_roof_gravel';
      roofMat = pbrMaterial('building', roofName, { repeat: 1 });
    }
    if (!sideMat) {
      const facade = chunkFacade(styleIdx, seed);
      sideMat = new THREE.MeshStandardMaterial({
        map: facade.map, roughness: 0.82, metalness: 0.15,
      });
      if (theme.buildings.glow) {
        sideMat.emissiveMap = facade.emissiveMap;
        sideMat.emissive = new THREE.Color(0xffffff);
        sideMat.emissiveIntensity = 0.6;
      }
    }
    if (!roofMat) {
      roofMat = new THREE.MeshStandardMaterial({
        color: 0xb0aca4, roughness: 0.9, metalness: 0.1,
      });
    }
    // PER-CHUNK TINT IS ON for buildings too. `setColorAt` has always been
    // called with the theme's tint (and with the colours a voxelized GLB
    // donor sampled from its own texture), but without `vertexColors` three
    // drops the instance colour in the fragment stage — so every one of those
    // was computed and thrown away, and a donor's sampled palette rendered as
    // plain facade. See the geometry note in destructible.js for the other
    // half of the fix.
    sideMat.vertexColors = true;
    roofMat.vertexColors = true;
    // box face order: px, nx, py (top), ny, pz, nz
    const chunkMats = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
    this.destructo = new DestructibleSystem(this.scene, chunkMats);
    this.objects.push(this.destructo.mesh, this.destructo.debris.mesh);
    // NOT EVERY LARGE STRUCTURE IS A BUILDING (src/arena/structures.js). A
    // structure kind is the same destructible chunks with its own SHAPE and
    // its own MATERIAL — basalt, crystal, ice — and a material means its own
    // InstancedMesh, so one DestructibleSystem is built per material family
    // the theme actually uses. `destructoAll` is what every combat query
    // walks; `destructo` stays the buildings' one, which is what the tools,
    // the recipe and specials.js already reach for.
    this.structos = new Map();          // material family -> DestructibleSystem
    this.destructoAll = [this.destructo];

    // ---- design system: WHERE the generated pieces stand ----
    // A generated arena's placement is planned by the selected design system
    // (src/arena/designs/) and executed by the code below; a null plan means
    // the FALLBACK — this file's original scatter, untouched. Authored levels
    // (and the level editor's empty stage) place exactly and plan nothing.
    const design = theme.authored ? null : arenaDesignSystem();
    const plan = design
      ? design.plan({
        theme, rng, B: this.bounds, P,
        clearing: theme.layout?.clearing ?? 38,
      })
      : null;

    // ---- terrain: painted roads/streams, hills, bridges, hazard lanes ----
    // (built before buildings/props so both can respect its layout; a design
    // system may hand it a reworked layout — boulevards, paved plazas)
    this.terrain = new Terrain(this, theme, rng, plan?.layout || null);

    // building layout: clusters (mini city blocks / compounds) separated by
    // the painted road grid, plus scattered solo cover — the terrain keeps
    // every site off lanes/hills/bridges and out of the spawn clearing, so
    // fighters always start in an open plaza with clear sight lines
    // tint helper shared by procedural + authored placement (pack facades
    // carry their own color, so only a whisper of tint survives)
    const tintFor = (t) => (CONFIG.useTextures && facadeTex)
      ? new THREE.Color(t).lerp(new THREE.Color(0xffffff), 0.68).getHex() : t;
    let placedSites = [];   // building sites, for the prop planner to keep off
    if (theme.authored) {
      // authored levels place exact towers from the editor
      for (const o of theme.authored) {
        if (o.k !== 'building') continue;
        const cw = o.cw || 3.5, ch = o.ch || 3.3, cd = o.cd || 3.5;
        // an authored STRUCTURE keeps its own material system and the exact
        // cells it was baked with — a baked crystal field must come back as
        // crystal, not as a tower wearing a facade
        if (o.struct && STRUCTURE_KINDS[o.struct]) {
          const sys = this.structoFor(o.struct);
          if (sys) {
            // A BAKED structure carries the exact cells it was built with. A
            // HAND-PLACED one (dropped from the editor's palette) carries
            // none, and an empty cell list is an invisible structure — so it
            // grows its kind's own silhouette from a seed pinned to where it
            // stands, which is what the editor drew its stand-in from.
            if (o.cells?.length) {
              sys.addBuildingCells(o.x, o.z, o.cells, cw, ch, cd,
                { tint: o.tint ?? 0xffffff, rng });
            } else {
              const m = structureMassing(o.struct, makeRng(structSeed(o)));
              if (m) {
                sys.addBuildingCells(o.x, o.z, m.cells, o.cw || m.cw,
                  o.ch || m.ch, o.cd || m.cd, { tint: o.tint ?? m.tint, rng });
              }
            }
            continue;
          }
        }
        const tint = tintFor(o.tint ?? theme.buildings.tints[0]);
        // `cells` is a massed silhouette (setback tower, ziggurat, warehouse…)
        // carried verbatim out of a baked arena; without it the tower is the
        // plain nx·ny·nz box the palette places.
        if (o.cells?.length) this.destructo.addBuildingCells(o.x, o.z, o.cells, cw, ch, cd, { tint, rng });
        else this.destructo.addBuilding(o.x, o.z, o.nx || 2, o.ny || 4, o.nz || 2, cw, ch, cd, { tint, rng });
      }
    } else {
      // buildings are MASSED, not boxed: each site draws a theme-flavored
      // silhouette (setback tower, ziggurat, warehouse, module stack...) or —
      // when the owner has dropped voxelized GLB donors into
      // public/models/buildings/ — a donor shape with its sampled colors.
      // Either way the result is ordinary destructible chunks.
      // DENSITY: 18 towers over a 300m cell left half of every sightline
      // running clear to the wrap seam, so what a player saw down those
      // corridors was the NEXT TILE's buildings — correctly fogged, but
      // reading as "the fog is eating things right in front of me". More
      // buildings, and (in buildingSites) placement that reaches into the
      // seam ring, gives the near-field something to occlude with.
      const count = Math.min(theme.buildings.count * 2 + 12, 30);
      const [mNormal, mLandmark] = theme.buildings.massing
        || THEME_MASSING[theme.id]
        || [['tower', 'slab', 'lshape'], ['tower']];
      const donorPool = buildingDonors(theme.id);
      // sites come from the design system's plan, or from the fallback's own
      // cluster-and-scatter when no plan is running
      const sites = plan?.buildings
        ? plan.buildings({ terrain: this.terrain, rng, count })
        : this.terrain.buildingSites(count, rng);
      placedSites = sites;
      // …and then some of them stop being buildings. Whole GROUPS convert to
      // the theme's declared structure kinds (crystal fields, basalt
      // country, ice works) — never single sites interleaved among towers,
      // which reads as a mistake rather than as a place. Runs here, after
      // the sites are chosen, so every design system AND the fallback
      // scatter get it from one place.
      assignStructures(sites, theme, rng, P);
      for (const site of sites) {
        // A STRUCTURE, NOT A BUILDING: its own silhouette family, its own
        // cell scale, its own palette, and its own material system — but
        // the same chunks, so it collapses, damages, occludes and can be
        // climbed exactly like a tower.
        if (site.struct && STRUCTURE_KINDS[site.struct]) {
          this.addStructure(site.struct, site.x, site.z, rng, site.tall);
          continue;
        }
        // a designed site may pin its own floor band (a low market shed, the
        // tower court's high-rise ring); everything else keeps the theme's
        const hRange = site.hRange ? [...site.hRange] : [...theme.buildings.hRange];
        if (!site.hRange && site.cluster >= 0 && !site.tall && rng.chance(0.5)) {
          hRange[1] = Math.max(hRange[0], hRange[1] - 1);
        }
        const cw = rng.range(3.2, 3.9), ch = rng.range(3.1, 3.6), cd = rng.range(3.2, 3.9);
        const rawTint = theme.buildings.tints[rng.int(0, theme.buildings.tints.length - 1)];
        const tint = tintFor(rawTint);
        let m = null;
        if (donorPool.length && rng.chance(site.tall ? 0.65 : 0.35)) {
          m = donorPool[rng.int(0, donorPool.length - 1)];
        } else {
          const styles = site.tall ? mLandmark : mNormal;
          m = generateMassing(styles[rng.int(0, styles.length - 1)], rng,
            { hRange, tall: site.tall });
        }
        // wide silhouettes shrink their cells instead of swallowing streets
        const cwE = Math.min(cw, 19 / m.nx), cdE = Math.min(cd, 19 / m.nz);
        const at = this.clearOfPlaza(site.x, site.z, (m.nx * cwE) / 2, (m.nz * cdE) / 2);
        this.destructo.addBuildingCells(at.x, at.z, m.cells, cwE, ch, cdE, { tint, rng });
        // recorded with the RAW tint: the authored path runs tintFor again
        this.recipe?.buildings.push({
          k: 'building', x: round1(at.x), z: round1(at.z),
          cells: m.cells, nx: m.nx, ny: m.ny, nz: m.nz,
          cw: round2(cwE), ch: round2(ch), cd: round2(cdE), tint: rawTint,
        });
      }
    }

    // ---- props ----
    // all props live in one group so the toroidal tiling below can clone
    // them into the 8 neighbor cells
    this.propGroup = new THREE.Group();
    this.scene.add(this.propGroup);
    this.objects.push(this.propGroup);
    // props that register ground-level gameplay (hazards, explosives) stay
    // on flat ground; everything else may ride a hillside — its Y is lifted
    // to the terrain surface so nothing floats or sinks
    const FLAT_PROPS = new Set(['fuelTank', 'obsidianSpikes', 'campfire', 'lavaPool',
      'moltenChannel', 'railSegment', 'fountain', 'helipad', 'landingPad', 'mineCart', 'conduit',
      'mine', 'spikeStrip', 'jumpPad', 'teleporter', 'crater', 'geyserVent', 'fumarole',
      'parkPath', 'netPile']);
    const propSpotOk = (x, z, needFlat) => {
      if (Math.hypot(x, z) < 16) return false;                    // keep plaza center open
      if (this.terrain.onLane(x, z, 1.2)) return false;           // nothing parked on a road/stream
      if (this.terrain.nearBridge(x, z, 2.5)) return false;
      // nothing standing in a lake/lava pool (sand / lawn / ash are fine),
      // and nothing under the raised highway's footprint
      const patch = this.terrain.onPatch(x, z, 1);
      if (patch && (patch.hazard || patch.kind === 'ice')) return false;
      if (this.terrain.viaduct &&
          Math.abs(this.terrain.vLocal(x, z).perp) < this.terrain.viaduct.w / 2 + 1.5) return false;
      if (needFlat && this.terrain.heightAt(x, z) > 0.15) return false;
      return true;
    };
    // viaduct piers first: solid destructible columns holding up the loop.
    // Derived from the deck, not placed by hand, so an authored level that
    // carries a viaduct gets its piers too — and they are never recorded into
    // the recipe, or baking one arena would leave a second set behind.
    for (const spot of this.terrain.pylonSpots) {
      const g = placeProp(this.propGroup, this.objects, 'viaductPylon', spot.x, spot.z,
        { h: spot.h, ry: spot.axis === 'x' ? Math.PI / 2 : 0, seed: rng.int(1, 99999) });
      if (g) this._regProp(g, spot.x, spot.z, 0);
    }
    if (theme.authored) {
      // authored levels place exact props from the editor (deterministic yaw,
      // seed and optional uniform scale)
      let aseed = 1;
      for (const o of theme.authored) {
        if (o.k !== 'prop') continue;
        const opts = { ...(o.opts || {}), seed: o.opts?.seed ?? (aseed++ * 131 + 7), ry: o.ry ?? 0 };
        if (opts.mat === 'ice') opts.mat = PROP_MATS.ice;
        const flat = FLAT_PROPS.has(o.name);
        const gy = flat ? 0 : this.terrain.heightAt(o.x, o.z);
        const g = placeProp(this.propGroup, this.objects, o.name, o.x, o.z, opts);
        if (!g) continue;
        if (o.s && o.s !== 1) g.scale.multiplyScalar(o.s);
        if (gy > 0.01) g.position.y += gy;
        this._regProp(g, o.x, o.z, gy);
      }
    } else {
      const buildAt = (spec, x, z, i, skyAnchored = false, ry) => {
        let opts = Array.isArray(spec.opts) ? spec.opts[i % spec.opts.length] : { ...(spec.opts || {}) };
        // a placement trait may carry build options of its own: a solar mount
        // that has been AIMED at the sun stops sweeping past it
        // (designs/proptraits.js `opts`)
        opts = { ...opts, ...(traitsFor(spec.name).opts || {}), seed: rng.int(1, 99999) };
        const recOpts = { ...opts };            // before the ice-material swap
        // a designed placement may aim the prop (a row faces its street);
        // scattered props keep placeProp's random yaw. Set after recOpts —
        // the recipe already records the final yaw at the placement level.
        if (ry !== undefined) opts.ry = ry;
        if (opts.mat === 'ice') opts.mat = PROP_MATS.ice;
        const gy = skyAnchored ? 0 : this.terrain.heightAt(x, z);
        const g = placeProp(this.propGroup, this.objects, spec.name, x, z, opts);
        if (g && gy > 0.01) g.position.y += gy; // seat the prop on the terrain surface
        if (g) this._regProp(g, x, z, gy);
        if (g && this.recipe) {
          this.recipe.props.push({
            k: 'prop', name: spec.name, x: round1(x), z: round1(z),
            ry: round2(g.rotation.y), s: 1, opts: recOpts,
          });
        }
        return g;
      };
      // a generated sky panorama paints its own aurora — the procedural
      // curtains (flat additive quads hung round the arena) would only stack
      // as bright rectangles over it. They stay for the no-texture fallback.
      const skipSkyProps = CONFIG.useTextures && hasTex('sky', `sky_${theme.id}`);
      // the design system's prop plan: exact spots (and often yaws) per spec.
      // Only ground props are plannable — `on:` specs live inside patches and
      // sky-anchored specs (ring ≤ 6) hang their visuals far away.
      // WHAT THE BUILDINGS ACTUALLY OCCUPY, not where their sites were: a
      // massed silhouette is up to 20 units across, so a planner keeping a
      // fixed radius from the site COORDINATE puts props inside towers. The
      // buildings are already built by here, so hand over their real boxes.
      const footprints = this.destructoAll
        .flatMap((d) => d.buildings.map((b) => b.aabb)).filter(Boolean);
      const sunYaw = sunYawOf(theme);   // one azimuth, shared by every collector
      const propPlan = plan?.props
        ? plan.props({
          rng, terrain: this.terrain, sites: placedSites, footprints,
          specs: (theme.props || []).filter((s) => !s.on && s.ring && s.ring[1] > 6),
          propOk: (x, z, name) => propSpotOk(x, z, FLAT_PROPS.has(name)),
        })
        : null;
      for (const spec of theme.props || []) {
        if (skipSkyProps && spec.name === 'aurora') continue;
        // `on: 'water'` (or any patch kind): the prop lives INSIDE a patch —
        // boats on the harbor basins, buoys on the lake. Skipped when the
        // seeded layout produced no such patch.
        if (spec.on) {
          const pool = this.terrain.patches.filter((p) =>
            p.kind === spec.on || (spec.on === 'water' && p.kind === 'lake'));
          if (!pool.length) continue;
          for (let i = 0; i < spec.count; i++) {
            const p = pool[rng.int(0, pool.length - 1)];
            const a = rng.range(0, Math.PI * 2), rr = rng.range(0, Math.max(0, p.r - 3.5));
            buildAt(spec, p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr, i);
          }
          continue;
        }
        // designed placement: the plan already expanded rows, rings, nests
        // and gates for this spec; a spec the plan is silent about (or found
        // no room for) falls through to the ring scatter below
        const planned = propPlan?.get(spec);
        if (planned?.length) {
          planned.forEach((pp, i) => buildAt(spec, pp.x, pp.z, i, false, pp.ry));
          continue;
        }
        // A PROP'S ORIENTATION PREFERENCE HOLDS WHEREVER IT IS PLACED. The
        // design systems aim props through traitYaw, but a spec they found no
        // room for — and every prop under the `fallback` design — falls
        // through to this scatter, and it used to fall through to a RANDOM
        // yaw: measured on circuit/ruins, both sarcophagi (grid-trait) landed
        // off-grid because the planner had no room and the scatter forgot the
        // trait. So the rule lives at the PLACEMENT level: the sun rule
        // first (one yaw for the whole arena + `clearFront` re-rolls a spot
        // with a tower in the way), else the general traitYaw — grid props
        // snap, sacred props face the fight, street furniture addresses the
        // nearest lane — and a prop with no preference keeps placeProp's
        // random yaw exactly as before. Positions are untouched.
        const tr = traitsFor(spec.name);
        const sunRy = tr.face === 'sun' ? sunYaw - (tr.faceOffset || 0) : undefined;
        const yawAt = (px, pz) => (sunRy !== undefined ? sunRy
          : traitYaw(tr, this.terrain, rng, px, pz, { sunYaw }));
        for (let i = 0; i < spec.count; i++) {
          const skyAnchored = spec.ring[1] <= 6; // aurora-style props place their visuals far away
          let a, r, x, z, tries = 0;
          do {
            a = rng.range(0, Math.PI * 2);
            r = rng.range(spec.ring[0], spec.ring[1]) * 1.85; // rings scaled with arena
            x = Math.cos(a) * r; z = Math.sin(a) * r;
          } while (!skyAnchored
            && (!propSpotOk(x, z, FLAT_PROPS.has(spec.name))
              || !frontClear(tr, footprints, x, z, sunRy))
            && ++tries < 14);
          const ry = yawAt(x, z);
          buildAt(spec, x, z, i, skyAnchored, ry);
          // `clump`: this placement is a NEST — scatter n-1 more of the same
          // prop around it (groves, container yards, boulder fields), giving
          // arenas real dense-vs-open texture instead of even sprinkle
          if (spec.clump) {
            const extra = rng.int(spec.clump.n[0], spec.clump.n[1]) - 1;
            for (let k = 0; k < extra; k++) {
              for (let t2 = 0; t2 < 8; t2++) {
                const ca = rng.range(0, Math.PI * 2);
                const cr = rng.range(3, spec.clump.spread ?? 9);
                const cx = x + Math.cos(ca) * cr, cz = z + Math.sin(ca) * cr;
                if (!propSpotOk(cx, cz, FLAT_PROPS.has(spec.name))) continue;
                if (!frontClear(tr, footprints, cx, cz, sunRy)) continue;
                // a grid nest is a YARD — every member shares the seed's
                // snapped yaw (emitClump's rule); anything else re-answers
                // from its own spot (each statue faces the fight itself)
                buildAt(spec, cx, cz, i + k + 1, false, tr.grid ? ry : yawAt(cx, cz));
                break;
              }
            }
          }
        }
      }
    }
    // Bake each prop's sub-meshes together by material. AFTER the placement
    // loops above, because every collider, hazard radius and steam anchor is
    // measured off the individual meshes, and BEFORE the ghost clones below,
    // so all nine copies of the arena get the cheap version.
    if (CONFIG.mergeProps) {
      for (const g of this.propGroup.children) mergePropMeshes(g);
    }
    // ghost copies of the props in the 8 neighbor cells (static)
    {
      const P = this.wrapHalf * 2;
      for (let gx = -1; gx <= 1; gx++) {
        for (let gz = -1; gz <= 1; gz++) {
          if (!gx && !gz) continue;
          const ghost = this.propGroup.clone();
          ghost.position.set(gx * P, 0, gz * P);
          this.scene.add(ghost);
          this.objects.push(ghost);
          this.ghostPropGroups.push(ghost); // destruction mirrors into these
        }
      }
    }
    // extra steam vents at ground level for industrial themes
    for (let i = 0; i < (theme.steamVents || 0); i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(14, B * 0.8);
      this.steamSpots.push(new THREE.Vector3(Math.cos(a) * r, 0.3, Math.sin(a) * r));
    }
  }

  bind(world) {
    this.world = world;
    world.wrapHalf = this.wrapHalf;
    for (const d of this.destructoAll) {
      d.world = world;
      d.setWrapPeriod(this.wrapHalf * 2);
    }
  }

  // ---- structures (src/arena/structures.js) ----
  // The DestructibleSystem for a kind's LOOK, built the first time that look
  // is asked for. The key is material + texture + chunk shape — NOT the kind
  // — so kinds that genuinely share a look (the two cut-ice ones) still
  // share a system, while two kinds on one material family with different
  // dressings get their own. That case is the basalt pair: the mounds wear
  // the cracked rock and the cliffs the columnar texture, and keyed on the
  // family alone whichever was built FIRST decided the texture for both.
  structoFor(kind) {
    const def = STRUCTURE_KINDS[kind];
    if (!def) return null;
    const shape = structureChunkShape(def);
    const lookKey = `${def.mat}|${def.tex || ''}|${shape}`;
    let sys = this.structos.get(lookKey);
    if (!sys) {
      const mat = structureMaterial(def.mat, def.tex);
      // one material for all six faces: a landform has no roof — and one
      // CHUNK SHAPE for the family too (shards for crystal, boulders for
      // rock, drifts for snow), which is what stops a landform reading as
      // the pile of cubes it is made of. See chunkgeo.js.
      // CAPACITY IS MEASURED, NOT INHERITED: a system pre-allocates its whole
      // instance budget ×9 wrap ghosts up front, and no structure family
      // needs the buildings' 3600 — the worst over a 15-roll sweep of the
      // three structure arenas (`&seed=` on a battle URL sweeps layouts) was
      // 2094 chunks, so 2800 is a third's headroom. If a theme ever outgrows
      // it, the truncation warn in addBuildingCells says so out loud.
      sys = new DestructibleSystem(this.scene, [mat, mat, mat, mat, mat, mat], 2800,
        shape);
      sys.world = this.world;
      if (this.wrapHalf) sys.setWrapPeriod(this.wrapHalf * 2);
      this.structos.set(lookKey, sys);
      this.destructoAll.push(sys);
      this.objects.push(sys.mesh, sys.debris.mesh);
    }
    return sys;
  }

  /**
   * A SITE IS A CENTRE AND A SILHOUETTE IS WIDE. Every site validator keeps
   * the CENTRE off the spawn clearing, but the massing drawn on it can be 46
   * units across, and a footprint nobody re-checked reached 16 units into
   * the plaza (frozen/avenues — an iceberg edge 22 from the origin against a
   * 38-unit stage). So the built BOX is checked here, at the one place both
   * generated paths pass through, and a site whose box would cut into the
   * stage slides OUT along its own radial until it clears — same bearing,
   * same cluster, the fight keeps its floor. Authored placements never come
   * through this (an author's exact coordinates are the author's).
   */
  clearOfPlaza(x, z, hx, hz) {
    const C = (this.theme.layout?.clearing ?? 38) + 2;
    const edge = (px, pz) =>
      Math.hypot(Math.max(0, Math.abs(px) - hx), Math.max(0, Math.abs(pz) - hz));
    if (edge(x, z) >= C) return { x, z };
    const d = Math.hypot(x, z) || 1;
    const ux = x / d, uz = z / d;
    let nx = x, nz = z, guard = 0;
    while (edge(nx, nz) < C && guard++ < 40) { nx += ux * 2; nz += uz * 2; }
    // never push through the cell margin — a shaved plaza beats a mass
    // straddling the seam, where the ghost tiling would double-draw it
    const lim = this.wrapHalf ? this.wrapHalf - 10 : Infinity;
    if (Math.abs(nx) > lim || Math.abs(nz) > lim) return { x, z };
    return { x: nx, z: nz };
  }

  /** Build one structure of `kind` at (x,z). Returns its cells for the recipe. */
  addStructure(kind, x, z, rng, tall = false) {
    const sys = this.structoFor(kind);
    if (!sys) return null;
    const m = structureMassing(kind, rng, tall);
    if (!m) return null;
    const at = this.clearOfPlaza(x, z, (m.nx * m.cw) / 2, (m.nz * m.cd) / 2);
    sys.addBuildingCells(at.x, at.z, m.cells, m.cw, m.ch, m.cd, { tint: m.tint, rng });
    this.recipe?.buildings.push({
      k: 'building', struct: kind, x: round1(at.x), z: round1(at.z),
      cells: m.cells, nx: m.nx, ny: m.ny, nz: m.nz,
      cw: round2(m.cw), ch: round2(m.ch), cd: round2(m.cd), tint: m.tint,
    });
    return m.cells;
  }

  // ---- combat services ----
  // Both are no-ops in the warm-up SANDBOX (see collideFighter): a punch
  // thrown on the grey stage must not shatter a building that has not been
  // revealed, and there is nothing out there to hang off yet.
  grabProbe(px, py, pz) {
    if (this.world?.sandbox) return null;
    for (const d of this.destructoAll) {
      const hit = d.grabProbe(px, py, pz);
      if (hit) return hit;
    }
    return null;
  }

  damageSphere(pos, radius, dmg, dir = null, structural = false) {
    if (this.world?.sandbox) return 0;
    this.igniteCampfires(pos, radius + 1.2);
    const terra = this.terrain.damageSphere(pos, radius, dmg);
    const props = this.damageProps(pos, radius, dmg * (structural ? 1.4 : 0.8), dir);
    let hits = 0;
    for (const d of this.destructoAll) hits += d.damageSphere(pos, radius, dmg, dir, structural);
    return hits + props + terra;
  }

  // ground height contributed by terrain features (hills, live bridge decks)
  terrainHeightAt(x, z) { return this.terrain.heightAt(x, z); }

  // spots where an ammo crate would be unreachable or silly
  badPickupSpot(x, z) {
    const lane = this.terrain.onLane(x, z, 1);
    if (lane && (lane.hazard === 'lava' || lane.hazard === 'acid')) return true;
    const patch = this.terrain.onPatch(x, z, 1);
    if (patch && (patch.hazard === 'lava' || patch.hazard === 'acid' || patch.hazard === 'water')) return true;
    return !!this.terrain.nearBridge(x, z, 1);
  }

  // ---- solid destructible props ----
  // cylinder test: is this point inside a living prop body?
  propAt(pos) {
    const w = this.world;
    for (const p of this.propBodies) {
      if (!p.alive) continue;
      if (pos.y > p.h || pos.y < -0.5) continue;
      const dx = w ? w.wrapDelta(pos.x - p.x) : pos.x - p.x;
      const dz = w ? w.wrapDelta(pos.z - p.z) : pos.z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) return p;
    }
    return null;
  }

  damageProps(pos, radius, dmg, dir = null) {
    const w = this.world;
    let hits = 0;
    for (const p of this.propBodies) {
      if (!p.alive) continue;
      if (pos.y > p.h + radius) continue;
      const dx = w ? w.wrapDelta(p.x - pos.x) : p.x - pos.x;
      const dz = w ? w.wrapDelta(p.z - pos.z) : p.z - pos.z;
      if (Math.hypot(dx, dz) > radius + p.r) continue;
      hits++;
      if (p.group.userData.explosive) {
        // fuel tanks don't crumble — they COOK OFF
        this.hitExplosives(pos, radius);
        continue;
      }
      p.hp -= dmg;
      if (p.hp <= 0) this.destroyProp(p, dir);
      else if (w) {
        w.effects.impactSparks(
          new THREE.Vector3(p.x, Math.min(Math.max(pos.y, 0.6), p.h * 0.8), p.z),
          0xcfc8ba, 6, 6);
      }
    }
    return hits;
  }

  // the structure comes apart: real tumbling rubble blocks (solid, standable
  // once settled), debris sparks, dust — and the toroidal clones vanish too
  destroyProp(p, dir = null) {
    if (!p.alive) return;
    p.alive = false;
    // linked multi-body structure: felling one leg brings the whole thing down
    if (p.link) for (const s of p.link) s.alive = false;
    this.hideProp(p);
    const w = this.world;
    if (!w) return;
    // a downed viaduct pier takes its deck span with it
    if (p.group.userData.pylon && this.terrain.viaduct) {
      this.terrain.damageSphere(
        new THREE.Vector3(p.x, this.terrain.viaduct.H, p.z), 4.5, 400);
    }
    const n = Math.min(6, 2 + Math.round(p.r * p.h * 0.14));
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), rr = rand(0, p.r * 0.7);
      const s = Math.min(2.6, Math.max(0.9, p.r * rand(0.5, 0.9)));
      this.destructo.spawnRubble(
        p.x + Math.cos(a) * rr, rand(1, Math.min(p.h, 10)), p.z + Math.sin(a) * rr,
        s, s * rand(0.6, 1.2), s,
        (dir ? dir.x * 6 : 0) + rand(-3, 3), rand(2, 6), (dir ? dir.z * 6 : 0) + rand(-3, 3),
        new THREE.Color(p.tint)
      );
    }
    const c = new THREE.Vector3(p.x, Math.min(2.5, p.h * 0.4), p.z);
    w.effects.impactSparks(c, 0xd8cfc0, 14, 11);
    w.effects.dustPuff(new THREE.Vector3(p.x, 0.4, p.z), 12, 0x99917f);
    w.effects.rings.spawn(new THREE.Vector3(p.x, 0, p.z),
      { from: 0.5, to: p.r * 3, dur: 0.4, color: 0xcabf9f, y: 0.25 });
    w.audio?.play(p.h > 10 ? 'crumbleBig' : 'crumble');
    w.effects.addShake(Math.min(0.6, 0.2 + p.h * 0.02));
  }

  hideProp(p) {
    p.group.visible = false;
    if (p.idx < 0) return;
    for (const gg of this.ghostPropGroups) {
      const child = gg.children[p.idx];
      if (child) child.visible = false;
    }
  }

  // ---- campfires: any strike near one flares it into a burning patch ----
  igniteCampfires(pos, radius) {
    const w = this.world;
    if (!w || !this.campfires.length) return;
    for (const cf of this.campfires) {
      if (cf.litT > 0) continue;
      const dx = w.wrapDelta(pos.x - cf.x), dz = w.wrapDelta(pos.z - cf.z);
      if (Math.hypot(dx, dz) > radius + cf.r) continue;
      cf.litT = 7.5;
      w.addFirePatch(null, new THREE.Vector3(cf.x, 0, cf.z), 3.4, 7, 13);
      // flare-up show
      for (let i = 0; i < 14; i++) {
        const a = rand(Math.PI * 2), rr = rand(0, 1.6);
        w.effects.glows.emit(cf.x + Math.cos(a) * rr, rand(0.3, 1.5), cf.z + Math.sin(a) * rr,
          Math.cos(a) * rand(1, 3), rand(6, 13), Math.sin(a) * rand(1, 3),
          { life: rand(0.4, 0.8), size: rand(1.2, 2.2), color: i % 3 ? 0xff7a20 : 0xffd23c, alpha: 0.95, drag: 0.8 });
      }
      w.effects.rings.spawn(new THREE.Vector3(cf.x, 0, cf.z), { from: 0.5, to: 5, dur: 0.4, color: 0xff7a20, y: 0.3 });
      w.audio?.play('flame');
    }
  }
  pointHits(pos) {
    for (const d of this.destructoAll) {
      const hit = d.pointHits(pos);
      if (hit) return hit;
    }
    return this.terrain.pointHits(pos);
  }
  raySolid(origin, dir, range) {
    for (const d of this.destructoAll) {
      const hit = d.raySolid(origin, dir, range);
      if (hit) return hit;
    }
    return null;
  }
  setOccluders(segments) { for (const d of this.destructoAll) d.setOccluders(segments); }
  applyViewFade(cam) { for (const d of this.destructoAll) d.applyViewFade(cam); }

  collideFighter(f) {
    // no boundary clamp — space wraps; buildings, settled rubble and SOLID
    // PROPS push back, and terrain (hills / bridge decks) carries fighters
    // on its surface
    //
    // SANDBOX (the warm-up): the arena is BUILT but hidden while its textures
    // stream, and the fighters romping on the grey stage are not on the board
    // yet. Everything solid is therefore skipped — running into a building
    // nobody can see reads as an invisible wall — but TERRAIN still carries
    // them, because that is the ground under their feet, not scenery.
    if (!this.world?.sandbox) for (const d of this.destructoAll) d.collideFighter(f);
    this.terrain.collideFighter(f);
    if (this.world?.sandbox) return;
    const w = this.world;
    for (const p of this.propBodies) {
      if (!p.alive) continue;
      if (f.pos.y > p.h) continue; // cleared it airborne
      const dx = w ? w.wrapDelta(f.pos.x - p.x) : f.pos.x - p.x;
      const dz = w ? w.wrapDelta(f.pos.z - p.z) : f.pos.z - p.z;
      if (Math.hypot(dx, dz) > p.r + f.radius) continue;   // broad phase, always round
      if (p.shell) {
        // THE SHELL, not the cylinder (see propshell.js): a mech stops where the
        // model is. Boxes are world-space and the prop may be the toroidal
        // image next to us, so they are read at the same offset the broad
        // phase just measured.
        const ox = f.pos.x - dx - p.x, oz = f.pos.z - dz - p.z;
        const top = f.pos.y + f.height * 0.9;
        for (const b of p.shell) {
          if (b[4] + 0 < f.pos.y || b[1] > top) continue;   // clears it over or under
          const cx = Math.min(Math.max(f.pos.x, b[0] + ox), b[3] + ox);
          const cz = Math.min(Math.max(f.pos.z, b[2] + oz), b[5] + oz);
          const ex = f.pos.x - cx, ez = f.pos.z - cz;
          const d2b = ex * ex + ez * ez;
          if (d2b >= f.radius * f.radius) continue;
          if (d2b < 1e-6) {                         // dead centre: leave the short way
            const push = Math.min((b[3] - b[0]) / 2, (b[5] - b[2]) / 2) + f.radius;
            f.pos.x += (f.pos.x > (b[0] + b[3]) / 2 + ox ? 1 : -1) * push;
            continue;
          }
          const d = Math.sqrt(d2b);
          f.pos.x += (ex / d) * (f.radius - d);
          f.pos.z += (ez / d) * (f.radius - d);
          f.vel.x *= 0.5;
          f.vel.z *= 0.5;
        }
        continue;
      }
      const rr = p.r + f.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      f.pos.x += (dx / d) * (rr - d);
      f.pos.z += (dz / d) * (rr - d);
      f.vel.x *= 0.5;
      f.vel.z *= 0.5;
    }
  }

  // ---- explosive props (fuel tanks): cook off into a fiery inferno ----
  // Detonate any live explosive whose blast radius is reached by an impact
  // at `pos` (melee/projectile/other explosion). Returns how many went up.
  hitExplosives(pos, radius = 0) {
    let n = 0;
    for (const e of this.explosives) {
      if (e.dead) continue;
      const dx = this.world ? this.world.wrapDelta(e.x - pos.x) : e.x - pos.x;
      const dz = this.world ? this.world.wrapDelta(e.z - pos.z) : e.z - pos.z;
      if (dx * dx + dz * dz < (radius + e.bodyR + 1) ** 2) { this.detonateExplosive(e); n++; }
    }
    return n;
  }

  detonateExplosive(e) {
    if (e.dead || !this.world) return;
    e.dead = true;
    const w = this.world;
    const pos = new THREE.Vector3(e.x, Math.min(3, e.top * 0.5), e.z);
    w.audio?.play('explosionBig');
    // MASSIVE staged fireball: ground burst, rising core, mushroom crown
    w.effects.explosion(pos, e.r * 1.35, { color: 0xff7020 });
    w.effects.explosion(pos.clone().setY(pos.y + 3), e.r * 0.85, { color: 0xffd050, smoke: false });
    w.schedule(0.14, () => {
      w.effects.explosion(new THREE.Vector3(e.x, e.top + 4, e.z), e.r * 0.7, { color: 0xff9030 });
      w.effects.addShake(0.5);
    });
    w.effects.rings.spawn(new THREE.Vector3(e.x, 0, e.z),
      { from: 1.5, to: e.r * 2.4, dur: 0.6, color: 0xffa040, y: 0.5 });
    w.effects.addShake(1.3);
    w.engine.addHitStop(0.09);
    // rolling fire column: dense glows climbing well above the tank
    for (let i = 0; i < 30; i++) {
      const a = rand(Math.PI * 2), rr = rand(0, e.r * 0.8);
      w.effects.glows.emit(e.x + Math.cos(a) * rr, rand(0.5, e.top + 6), e.z + Math.sin(a) * rr,
        rand(-4, 4), rand(4, 13), rand(-4, 4),
        { life: rand(0.6, 1.5), size: rand(2.2, 4.5), color: i % 3 ? 0xff7a20 : 0xffd050, alpha: 0.95 });
      w.effects.smoke.emit(e.x + Math.cos(a) * rr * 0.7, rand(2, e.top + 4), e.z + Math.sin(a) * rr * 0.7,
        rand(-1.5, 1.5), rand(3, 7), rand(-1.5, 1.5),
        { life: rand(1.2, 2.4), size: rand(2.5, 4.5), color: 0x2c2620, alpha: 0.5, grow: 2 });
    }
    // AoE: scorch every fighter caught in the (much wider) blast
    for (const f of w.fighters) {
      if (!f.alive) continue;
      const dx = w.wrapDelta(f.pos.x - e.x), dz = w.wrapDelta(f.pos.z - e.z);
      const d = Math.hypot(dx, dz);
      if (d < e.r && Math.abs(f.pos.y - pos.y) < e.top + 6) {
        const fall = 1 - d / e.r;
        f.takeHit(95 * Math.max(0.3, fall), null, {
          knock: 24 * fall, launch: 11 * fall, srcPos: pos, heavy: true,
          status: { burn: 13, burnT: 3.8 },
        });
      }
    }
    // wreck nearby building chunks and leave a big burning crater
    this.damageSphere(pos, e.r * 0.85, 200, null, true);
    w.addFirePatch(null, new THREE.Vector3(e.x, 0, e.z), e.r * 0.6, 6.5, 16);
    e.group.visible = false;
    // chain-react other tanks in range a beat later
    for (const o of this.explosives) {
      if (o.dead || o === e) continue;
      const dx = o.x - e.x, dz = o.z - e.z;
      if (Math.hypot(dx, dz) < e.r * 1.1) w.schedule(rand(0.08, 0.2), () => this.detonateExplosive(o));
    }
  }

  // per-frame: a fighter running into a tank, or a projectile striking it,
  // sets it off
  updateExplosives() {
    // barrels do not go off in the warm-up sandbox (see collideFighter)
    if (!this.world || this.world.sandbox || !this.explosives.length) return;
    for (const e of this.explosives) {
      if (e.dead) continue;
      const contact = e.bodyR;
      let boom = false;
      for (const f of this.world.fighters) {
        if (!f.alive) continue;
        const dx = this.world.wrapDelta(f.pos.x - e.x), dz = this.world.wrapDelta(f.pos.z - e.z);
        if (dx * dx + dz * dz < (contact + f.radius) ** 2 && f.pos.y < e.top + 2) { boom = true; break; }
      }
      if (!boom) {
        for (const p of this.world.projectiles.active) {
          const dx = this.world.wrapDelta(p.mesh.position.x - e.x), dz = this.world.wrapDelta(p.mesh.position.z - e.z);
          if (dx * dx + dz * dz < (contact + 1.3) ** 2 && p.mesh.position.y < e.top + 1.5) { boom = true; break; }
        }
      }
      if (boom) this.detonateExplosive(e);
    }
  }

  // ---- ground hazards ----
  // spike clusters cut and SHOVE anyone who walks into them; campfire lit
  // timers burn down so a fire can be re-lit after it dies out
  updateHazards(dt) {
    const w = this.world;
    if (!w || w.sandbox) return;   // no spikes underfoot in the warm-up
    for (const cf of this.campfires) {
      if (cf.litT > 0) cf.litT -= dt;
    }
    if (!this.spikes.length) return;
    for (const f of w.fighters) {
      if (!f.alive || f.pos.y > 2.5) continue;
      if (f._spikeCd > 0) { f._spikeCd -= dt; continue; }
      for (const sp of this.spikes) {
        const dx = w.wrapDelta(f.pos.x - sp.x), dz = w.wrapDelta(f.pos.z - sp.z);
        const d = Math.hypot(dx, dz);
        if (d >= sp.r + f.radius * 0.5) continue;
        f._spikeCd = 0.8;
        // shove OUT of the cluster, away from its center
        const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
        f.takeHit(14, null, {
          knock: 20, launch: 5,
          srcPos: new THREE.Vector3(sp.x, 0, sp.z),
        });
        f.vel.x += nx * 10;
        f.vel.z += nz * 10;
        w.effects.impactSparks(f.center(), 0xff5030, 10, 8);
        w.audio?.play('slash');
        break;
      }
    }
  }

  // register a built prop's gameplay hooks + measure its solid collider.
  // shared by procedural placement and authored (level-editor) placement.
  _regProp(g, x, z, gy = 0) {
    if (g.userData.spin) this.spinners.push(g);
    if (g.userData.bob) {
      const b = g.userData.bob;
      this.bobbers.push({
        g, baseY: g.position.y,
        amp: b.amp ?? 0.22, speed: b.speed ?? 1.1, ph: rand(Math.PI * 2),
        rock: b.rock ?? 0.03,
      });
    }
    if (g.userData.steamY !== undefined) {
      this.steamSpots.push(new THREE.Vector3(x, g.userData.steamY + gy, z));
    }
    if (g.userData.explosive) {
      const e = g.userData.explosive;
      this.explosives.push({
        group: g, x, z, r: e.r, bodyR: e.bodyR || e.r * 0.32,
        hp: e.hp, top: e.top || 6, dead: false,
      });
    }
    if (g.userData.spikes) this.spikes.push({ x, z, r: g.userData.spikes.r });
    if (g.userData.campfire) {
      this.campfires.push({ group: g, x, z, r: g.userData.campfire.r, litT: 0 });
    }
    // multi-body props (gates, arches, cave mouths): the builder names its
    // own colliders — walk BETWEEN the legs; killing one leg fells the whole
    // structure (bodies are linked)
    if (g.userData.bodies) {
      const cos = Math.cos(g.rotation.y), sin = Math.sin(g.rotation.y);
      const link = [];
      for (const b of g.userData.bodies) {
        const pb = {
          group: g, idx: this.propGroup.children.indexOf(g),
          x: x + b.dx * cos + b.dz * sin,
          z: z - b.dx * sin + b.dz * cos,
          r: b.r, h: b.h + gy,
          hp: b.hp ?? 26 + b.r * Math.min(b.h, 16) * 7,
          alive: true, tint: b.tint ?? 0x8f887c, link,
        };
        link.push(pb);
        this.propBodies.push(pb);
      }
      return;
    }
    // every standing structure is SOLID and BREAKABLE: measure a cylinder
    // collider off the built prop (ground hazards and flat dressing — pads,
    // channels, rails — stay walk-over)
    if (!g.userData.spikes && !g.userData.campfire && !g.userData.noCollide) {
      const bb = new THREE.Box3().setFromObject(g);
      const rx = (bb.max.x - bb.min.x) / 2, rz = (bb.max.z - bb.min.z) / 2;
      const h = bb.max.y;
      // collider radius from the GROUND BAND only — what a walking mech can
      // actually bump into (boxing the whole prop gave thin-pole/big-panel
      // props a fat invisible cylinder at street level).
      const bbLow = new THREE.Box3();
      const mb = new THREE.Box3();
      g.updateWorldMatrix(true, true);
      g.traverse((o) => {
        if (!o.isMesh) return;
        mb.setFromObject(o);
        if (mb.min.y < 3.2) bbLow.union(mb);
      });
      let rl = Math.max(rx, rz);
      if (!bbLow.isEmpty()) {
        rl = Math.max(
          Math.abs(bbLow.max.x - x), Math.abs(bbLow.min.x - x),
          Math.abs(bbLow.max.z - z), Math.abs(bbLow.min.z - z));
      }
      const r = Math.min(rl * 0.72, 7);
      if (h > 1.7 && r > 0.4 && r < 7.5 && h / Math.max(rx, rz) > 0.35) {
        this.propBodies.push({
          group: g, idx: this.propGroup.children.indexOf(g),
          x, z, r, h,
          // what he actually touches (see propshell.js); the cylinder above is
          // still what everything else asks about
          shell: propShell(g, { r, h, x: 0, z: 0 }),
          hp: 26 + r * Math.min(h, 16) * 7,
          alive: true,
          tint: g.userData.explosive ? 0x8a4030 : 0x8f887c,
        });
      }
    }
  }

  spawnPoints(n) {
    const pts = [];
    // authored levels can pin exact spawn points; cycle if fewer than n
    const sp = this.theme.spawns;
    if (sp && sp.length) {
      for (let i = 0; i < n; i++) {
        const s = sp[i % sp.length];
        const yaw = s.yaw ?? Math.atan2(-s.x, -s.z);
        pts.push({ pos: new THREE.Vector3(s.x, 0, s.z), yaw });
      }
      return pts;
    }
    const r = Math.min(this.bounds * 0.4, 34);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      pts.push({
        pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
        yaw: Math.atan2(-Math.cos(a), -Math.sin(a)),
      });
    }
    return pts;
  }

  update(dt) {
    this.t += dt;
    for (const d of this.destructoAll) d.update(dt);
    this.terrain.update(dt);
    this.updateExplosives();
    this.updateHazards(dt);
    for (const g of this.spinners) {
      const t = g.userData.spinName ? (g.getObjectByName(g.userData.spinName) || g) : g;
      t.rotation[g.userData.spinAxis || 'z'] += g.userData.spin * dt;
    }
    // floating props ride a gentle swell (boats, buoys, hanging gondolas)
    for (const b of this.bobbers) {
      b.g.position.y = b.baseY + Math.sin(this.t * b.speed + b.ph) * b.amp;
      if (b.rock) b.g.rotation.x = Math.sin(this.t * b.speed * 0.8 + b.ph * 1.7) * b.rock;
    }

    // ambient particles
    const fx = this.world?.effects;
    if (!fx) return;
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = 0.06;
      const B = this.bounds;
      switch (this.theme.ambient) {
        case 'embers':
          fx.glows.emit(rand(-B, B), rand(0.5, 3), rand(-B, B), rand(-1, 1), rand(2, 5), rand(-1, 1),
            { life: rand(1.5, 3), size: rand(0.3, 0.7), color: 0xff7a30, alpha: 0.8, drag: 0.4 });
          break;
        case 'snow':
          for (let i = 0; i < 3; i++) {
            fx.glows.emit(rand(-B, B), rand(18, 30), rand(-B, B), rand(-1.5, 1.5), rand(-5, -3), rand(-1.5, 1.5),
              { life: rand(4, 7), size: rand(0.25, 0.5), color: 0xe8f8ff, alpha: 0.7 });
          }
          break;
        case 'sand':
          fx.smoke.emit(rand(-B, B), rand(0.3, 2), rand(-B, B), rand(3, 7), rand(0.2, 0.8), rand(-1, 1),
            { life: rand(1.5, 3), size: rand(2, 4), color: 0xc8a878, alpha: 0.1, grow: 1.5 });
          break;
        case 'motes':
          fx.glows.emit(rand(-B, B), rand(1, 14), rand(-B, B), rand(-0.4, 0.4), rand(0.2, 0.8), rand(-0.4, 0.4),
            { life: rand(2, 4), size: rand(0.2, 0.45), color: this.theme.ground.accent || 0x53e8ff, alpha: 0.6 });
          break;
        case 'leaves':
          fx.glows.emit(rand(-B, B), rand(8, 16), rand(-B, B), rand(-2, 2), rand(-2.5, -1), rand(-2, 2),
            { life: rand(3, 5), size: rand(0.25, 0.45), color: 0x8adf70, alpha: 0.55 });
          break;
        case 'clouds':
          if (Math.random() < 0.25) {
            const a = rand(Math.PI * 2), r = rand(B * 1.2, B * 2.2);
            fx.smoke.emit(Math.cos(a) * r, rand(-6, -2), Math.sin(a) * r, rand(1, 3), 0.1, rand(1, 3),
              { life: rand(4, 8), size: rand(10, 20), color: 0xe8f0f8, alpha: 0.25, grow: 0.4 });
          }
          break;
      }
      // steam vents
      for (const s of this.steamSpots) {
        if (Math.random() < 0.35) fx.steamVent(s);
      }
    }
  }

  dispose() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.traverse?.((c) => {
        if (c.isMesh) {
          c.geometry?.dispose();
        }
      });
    }
    for (const d of this.destructoAll) d.dispose();
    this.objects.length = 0;
  }
}
