// bake-glb — finalize a mech's GLB: fold EVERYTHING THAT DESCRIBES THE MODEL
// into the .glb, strip the now-redundant manifest fields, and (custom-rig)
// remove the mech's rig file. Produces ONE reversible changelist:
// `git revert`/`checkout` restores the exact prior state (the shared bake/rig
// engine is never removed).
//
// WHAT GOES IN: custom rig, skinOps, reparent, rig posts, stretch, bonePos,
// seamCuts, dropGeo, dropBones, and the BONE NAMES — an auto-rig's `bone_28`
// becomes `shoulderR`, so `boneOverrides` goes with them and every baked mech
// carries one skeleton naming convention.
//
// WHAT STAYS: `muzzles` (hand-placed anchors combat spawns from), `bindPose`,
// `profileKey`, `limpChains`, `tailFloor`, `boneCorrections` — which no bake can
// absorb, because rebindRest plus the adapter's rest-offset capture cancel a
// bind rotation exactly, and viper's is a function of how far the joint swung —
// and the model's ORIENTATION AND SIZE (`yawOffset`, `modelScale`,
// `heightScale`). Those three describe the model and belong in a file, but the
// GAME reads live quantities off the runtime scale (RigAdapter.hipsScale,
// calibrateFeet, sizeMul), so folding them in leaves those reading 1 where they
// read 5.77 — measured on saurion, joints correct to 0.0002 and his head
// collapsed into his shoulders. They ARE folded by tools/export-mech.mjs, which
// has no runtime to disturb and is where a portable model wants them.
//
//   node tools/bake-glb.mjs <mechId>            # DRY RUN (default)
//   node tools/bake-glb.mjs <mechId> --apply    # write the changes
//   node tools/bake-glb.mjs <mechId> --restore [--apply]   # UN-bake (see below)
//
// Dry run bakes to public/models/mech_<id>.baked.glb, prints the fidelity report
// + proposed manifest diff, and touches no committed file. --apply overwrites
// mech_<id>.glb, rewrites the manifest entry, and removes the rig file/registry.
// Both run a FIDELITY CHECK: build the mech pre-bake (current files) and
// post-bake (baked glb via the stock load path) and compare joint world
// positions across poses — it aborts/warns if they drift.
//
// THE SOURCE IS KEPT. --apply first copies the untouched asset to
// public/models/source/mech_<id>.glb (once — a second bake never overwrites the
// true original) and writes public/models/source/<id>.edits.json: every manifest
// field that was folded in, with its values, plus the custom rig file's text.
// So the baked model stays explainable and re-derivable without digging through
// git history, and a re-bake from source is one copy away.
//
// A REFUSED BAKE LEAVES NO ARCHIVE. The sidecar and the source copy are written
// before the fidelity check can run (the check needs the baked file on disk),
// so a --apply the check then refused used to roll back the GLB, the manifest
// and the rig file and leave a <id>.edits.json behind saying the edits had been
// folded in — four mechs sat in that state, byte-identical to their "source"
// with the whole correction layer still in the manifest. The archive is now
// part of the undo record: a refused or crashed --apply puts the previous
// sidecar back (or removes the one it wrote) and deletes a source copy it made
// on this run, so a sidecar on disk always describes a bake that landed.
//
// --restore IS THE INVERSE, off that same sidecar: it copies the untouched asset
// back, merges the folded manifest fields into the entry, rewrites the rig file
// and re-registers it. Use it when a baked mech has to go back under the
// workbenches — ?edit=rig only edits a hand-authored rig file, so a baked mech
// reads as "no custom rig to edit" until its rig comes back. Edit, then bake
// again. No browser and no fidelity check: it is a file-for-file rollback of
// exactly what the bake folded in.
//
// RANDOMNESS IS A CONSTANT IN THE CAPTURES. Animator seeds its phase from
// Math.random() and several signatures twitch off it (nullbot's head ticks,
// jerry's nerves), so the captures replace Math.random. A SEEDED SEQUENCE was
// the first answer, and it only matches while both builds draw the same number
// of times — the custom-rig load path and the baked one do not, so the sequence
// slid and nullbot's head ticks landed on different frames: SKIN 1.73% worst on
// hitFlinch with a mean of 0.006%, on a bake that was faithful. Every draw now
// returns 0.5: no tick ever fires (`random() < dt * 0.7` is false), every phase
// is the same phase, and the comparison measures geometry rather than luck.
//
// THE FIDELITY CHECK ONLY SEES JOINTS. It compares the 15 game joints across
// three poses, which catches a broken skeleton and nothing else — it cannot see
// skinning, and it cannot see a glbanim profile hook that stopped firing. Baking
// jerry silently stopped his cannon pods aiming (the hook bails when
// mech.rigBones is empty, which used to be the case for every stock skeleton)
// and this check passed at 0.0001. So after a bake, also run:
//     node tools/skindebug.mjs <id>     — same findings, same severities?
//     node tools/weldmap.mjs <id> --list — same welds?
//     node tools/postercheck.mjs <id>   — and regenerate the poster
//
// Requires the dev server running on :5175 (npm run dev).
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'node:url';

const PORT = process.env.PORT || '5175';
const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'public/models/manifest.json');
const JOINTS = ['hips', 'torso', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR',
  'elbowR', 'handR', 'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR'];
// Deterministic test poses (degrees per joint), applied DIRECTLY to the virtual
// joints then retargeted — no animation/smoothing, so the pre-bake and post-bake
// builds are compared apples-to-apples (idle sway would otherwise desync them).
const TEST_POSES = {
  rest: {},
  arms: { shoulderL: [-80, -10, 20], elbowL: [-70, 0, 0], shoulderR: [-80, 10, -20], elbowR: [-70, 0, 0], torso: [10, 15, 0] },
  legs: { thighL: [-40, 0, 5], kneeL: [60, 0, 0], thighR: [30, 0, -5], kneeR: [20, 0, 0], hipsRot: [0, 20, 0] },
};
const POSES = Object.keys(TEST_POSES);
const FID_EPS = 0.01; // world-unit tolerance (mech ~7u tall)
// The two things the joint check is blind to (see capturePoses / extras).
const SIZE_EPS = 0.01;    // rendered extent, fraction — the file now carries the scale
// Anchor tolerances are set from MEASURED NOISE, not from zero: the two captures
// are separate page loads of a live match, so the animator has settled to
// slightly different places even with every joint zeroed. Saurion's virtual-rig
// anchors move 0.023 units / 0.64 deg between two runs of the SAME build. These
// are still tight enough for what they are for — a lost anchor is reported as
// missing, and an anchor left on a stale bone is a whole limb away.
const ANCHOR_EPS = 0.06;  // world units an anchor may move at rest (~1% of height)
const ANCHOR_DEG = 1.5;   // degrees an anchor's aim may turn at rest
const FACE_DEG = 0.5;     // degrees the body may turn (a yaw baked a quarter turn out)

const id = process.argv[2];
const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.includes('--restore');
// `--noise`: capture the UNBAKED build twice and report the skin deviation
// between the two. That is the floor the real comparison has to clear — the
// animator smooths toward its targets and two page loads do not settle
// identically, so a fast clip's extremity can differ by a visible amount with
// nothing whatever changed. A tolerance set below the floor reports every bake
// as broken; one set above it reports nothing.
const NOISE = process.argv.includes('--noise');
const FORCE = process.argv.includes('--force');
if (!id) { console.error('usage: node tools/bake-glb.mjs <mechId> [--apply] [--restore]'); process.exit(1); }

// ---- manifest entry cleaning (surgical, preserves the file's formatting) ----
// EVERYTHING THAT DESCRIBES THE MODEL comes out, because the model now says it:
// its skeleton and weights (rig/skinOps/seamCuts/reparent/stretch/bonePos), the
// geometry it does not have (dropGeo/dropBones), what its bones are called
// (boneOverrides).
//
// WHAT SURVIVES is what describes the GAME's use of it: `muzzles` (hand-placed
// anchors combat spawns from), `profileKey`, `bindPose`, `limpChains`,
// `tailFloor`, `boneCorrections` — which no bake can absorb, since a bind-pose
// rotation is cancelled exactly by rebindRest + the adapter's rest offset, and
// viper's is a function of how far the joint has swung anyway — and the
// orientation/size trio, which the export folds instead (see the header).
const BAKED_FIELDS = ['rig', 'skinOps', 'seamCuts', 'reparent', 'stretch', 'bonePos', 'alt',
  'dropGeo', 'dropBones', 'boneOverrides'];

// A BONE RENAME REACHES OUTSIDE THE SKELETON. `muzzles[*].bone` is the one that
// matters — the house rule is that re-rigging never loses an anchor, and an
// anchor naming `bone_36` after that bone became `handR` would silently fall
// back to a joint. `limpChains` names bone PREFIXES the same way.
function rewriteBoneNames(entry, renames) {
  if (!renames || !Object.keys(renames).length) return { entry, moved: [] };
  const moved = [];
  const out = { ...entry };
  if (out.muzzles) {
    out.muzzles = Object.fromEntries(Object.entries(out.muzzles).map(([k, spec]) => {
      if (spec?.bone && renames[spec.bone]) {
        moved.push(`muzzles.${k}: ${spec.bone} -> ${renames[spec.bone]}`);
        return [k, { ...spec, bone: renames[spec.bone] }];
      }
      return [k, spec];
    }));
  }
  if (Array.isArray(out.limpChains)) {
    out.limpChains = out.limpChains.map((c) => {
      if (renames[c]) { moved.push(`limpChains: ${c} -> ${renames[c]}`); return renames[c]; }
      return c;
    });
  }
  return { entry: out, moved };
}

function cleanEntry(text, mechId, opts = {}) {
  const { renames = {}, jointBones = {}, rigExtras = {} } = opts;
  const m = JSON.parse(text);
  const entry0 = m[mechId];
  if (!entry0) throw new Error(`no manifest entry "${mechId}"`);
  const { entry, moved } = rewriteBoneNames(entry0, renames);
  const removed = [];
  const clean = {};
  for (const [k, v] of Object.entries(entry)) {
    if (BAKED_FIELDS.includes(k)) { removed.push(k); continue; }
    clean[k] = v;
  }
  // A RIG FILE MAY CARRY GAME FIELDS TOO. `limpChains` and `tailFloor` are
  // read off the custom rig as well as the manifest (gltf.js resolves
  // entry.limpChains || customRig.limpChains), and the bake deletes the rig
  // file: wraith's `limpChains: ['cape0']` lived only there, so his baked
  // cloak stopped going limp and propped his corpse 25% of his height off
  // the road. Anything the rig declared and the entry does not is carried
  // over, so the game reads the same value from the manifest afterwards.
  for (const k of ['limpChains', 'tailFloor']) {
    if (rigExtras[k] !== undefined && clean[k] === undefined) {
      clean[k] = rigExtras[k];
      moved.push(`${k}: carried over from the rig file`);
    }
  }
  // Residual overrides: normally none (every bone answers to its joint name),
  // but a joint whose target name was already taken keeps its mapping.
  const residual = {};
  for (const [j, boneName] of Object.entries(jointBones)) {
    if (boneName && boneName !== j) residual[j] = boneName;
  }
  if (Object.keys(residual).length) clean.boneOverrides = residual;
  // locate the entry's line block and splice in the pretty-printed clean entry
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => l.trimStart().startsWith(`"${mechId}":`));
  if (startIdx < 0) throw new Error(`could not locate "${mechId}" block`);
  let depth = 0, endIdx = -1;
  for (let i = startIdx; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (i > startIdx && depth === 0) { endIdx = i; break; }
  }
  const trailingComma = lines[endIdx].trimEnd().endsWith(',');
  const body = JSON.stringify({ [mechId]: clean }, null, 2)
    .split('\n').slice(1, -1)          // drop the outer { }
    .map((l) => '  ' + l).join('\n');  // re-indent to top-level entry depth
  const replaced = body + (trailingComma ? ',' : '');
  const out = [...lines.slice(0, startIdx), replaced, ...lines.slice(endIdx + 1)].join('\n');
  return { out, removed, clean, moved };
}

// ---- browser helpers ----
async function waitGlobal(page, name, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate((n) => !!window[n], name)) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`timed out waiting for window.${name}`);
}

async function getBakedGlb(browser) {
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/?bake=${id}`, { waitUntil: 'networkidle' });
  await waitGlobal(page, '__bakeReady');
  const res = await page.evaluate(() => ({ err: window.__bakeErr, base64: window.__bakeGlb?.base64,
    byteLength: window.__bakeGlb?.byteLength, report: window.__bakeGlb?.report }));
  await page.close();
  if (res.err) throw new Error('bake failed: ' + res.err);
  if (errs.length) console.warn('  (page errors during bake:', errs.slice(0, 2), ')');
  return { buffer: Buffer.from(res.base64, 'base64'), report: res.report };
}

// Build the mech (current on-disk files) and read joint world positions across
// a few deterministic poses. Uses the real ?debug=3d load path.
const SEED_SCRIPT = `
  let _seed = 0x2f6e2b1;
  Math.random = () => {
    void _seed;   // see RANDOMNESS IS A CONSTANT in the header
    return 0.5;
  };`;

async function capturePoses(browser, tag) {
  const page = await browser.newPage();
  // BEFORE the page boots. Seeding inside page.evaluate is too late here — the
  // battle harness has already built both fighters and run a few seconds of
  // animation by the time the evaluate runs, so the random-seeded idles are
  // already diverged. konga's `overhead` anchor read 0.061 between two runs of
  // the same build with the late seed, and 0 with this one.
  await page.addInitScript(SEED_SCRIPT);
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/?battle=neon&p1=${id}&p2=titanus&debug=3d`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(9000);
  const data = await page.evaluate(({ TEST_POSES, JOINTS }) => {
    // Same seeding as captureSkin, and for the same reason: the anchors ride
    // joints the signatures twitch off Math.random(), so konga's worst anchor
    // read 0.070 between two runs of the SAME build and tripped a 0.06
    // tolerance that exists to catch an anchor left on a stale bone.
    let _seed = 0x2f6e2b1;
    Math.random = () => {
      void _seed;   // see RANDOMNESS IS A CONSTANT in the header
      return 0.5;
    };
    const F = window.__fighters, f = F[0];
    if (!f?.mech?.isGLB) return { err: 'mech is not GLB (fell back to procedural?)' };
    F[1].controlsLocked = true; f.controlsLocked = true;
    f.yaw = f.targetYaw = 0; f.group.rotation.y = 0;
    const V = f.pos.constructor, R = (d) => d * Math.PI / 180;
    const J = f.mech.joints, bm = f.mech.boneMap;
    const read = () => { const o = {}; for (const j of JOINTS) { const b = bm[j]; o[j] = b
      ? [+b.getWorldPosition(new V()).x.toFixed(4), +b.getWorldPosition(new V()).y.toFixed(4), +b.getWorldPosition(new V()).z.toFixed(4)] : null; } return o; };
    const out = {};
    for (const [pose, def] of Object.entries(TEST_POSES)) {
      // reset all virtual joints, then apply the fixed pose, then retarget
      for (const jn of JOINTS) J[jn]?.rotation.set(0, 0, 0);
      if (J.hips) J.hips.rotation.set(0, 0, 0);
      for (const [jn, e] of Object.entries(def)) {
        if (jn === 'hipsRot') { J.hips?.rotation.set(R(e[0]), R(e[1]), R(e[2])); continue; }
        J[jn]?.rotation.set(R(e[0]), R(e[1]), R(e[2]));
      }
      f.mech.postAnimate();
      out[pose] = read();
    }
    const hy = bm.head ? +bm.head.getWorldPosition(new V()).y.toFixed(4) : null;

    // ---- what the joint check cannot see ----------------------------------
    // Baking jerry once silently stopped his cannon pods aiming and the joint
    // deviation was 0.0001, so the check now also reads the two things a bake
    // is most likely to break without moving a joint:
    //
    //   SIZE — yawOffset/modelScale/heightScale now live in the file. If any of
    //     them fails to survive the export, every joint stays exactly where it
    //     is RELATIVE TO THE HIPS and the whole mech is the wrong size.
    //   ANCHORS — the house rule (MECH_ART_GUIDE §5) is that re-rigging never
    //     loses an anchor. A bone rename reaches muzzles, so every anchor's
    //     rest transform is measured, in the HIPS' frame so a benign grounding
    //     shift cannot inflate it.
    for (const jn of JOINTS) J[jn]?.rotation.set(0, 0, 0);
    if (J.hips) J.hips.rotation.set(0, 0, 0);
    f.mech.postAnimate();
    f.mech.group.updateMatrixWorld(true);
    const hips = bm.hips ? bm.hips.getWorldPosition(new V()) : new V();
    const anchors = {};
    for (const [name, a] of Object.entries(f.mech.anchors || {})) {
      if (!a) continue;
      const p = a.getWorldPosition(new V());
      const q = a.getWorldQuaternion(new (f.group.quaternion.constructor)());
      anchors[name] = [+(p.x - hips.x).toFixed(4), +(p.y - hips.y).toFixed(4), +(p.z - hips.z).toFixed(4),
        +q.x.toFixed(5), +q.y.toFixed(5), +q.z.toFixed(5), +q.w.toFixed(5)];
    }
    // Rendered extent, from REAL VERTICES rather than from the geometry's
    // bounding box. The box is axis-aligned in the model's own space, so
    // rotating its eight corners and re-boxing gives the AABB of an AABB —
    // which inflates with any yaw and, once the yaw is baked INTO the vertices,
    // stops inflating. That is a change in the measurement, not in the model,
    // and it read as a 51% size error. Sampling the positions measures the same
    // thing on both sides of the bake.
    let bx = null;
    try {
      const V3 = Object.getPrototypeOf(f.pos).constructor;
      const min = new V3(Infinity, Infinity, Infinity), max = new V3(-Infinity, -Infinity, -Infinity);
      let n = 0;
      const v = new V3();
      f.mech.group.traverse((o) => {
        const p = o.geometry?.attributes?.position;
        if (!p || !o.visible) return;
        const step = Math.max(1, Math.floor(p.count / 20000));
        for (let i = 0; i < p.count; i += step) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          min.min(v); max.max(v); n++;
        }
      });
      // EXTENT ONLY, never a centroid: a bake PRUNES the dead auto-rig geometry a
      // custom rig left behind, so the two builds do not share a vertex set and
      // their means are not comparable (titanus: extent identical to 4 decimals,
      // centroid 4.1 vs 8.6). An extent survives that; an average does not.
      if (n) bx = [+(max.x - min.x).toFixed(4), +(max.y - min.y).toFixed(4), +(max.z - min.z).toFixed(4)];
    } catch (e) { bx = null; }

    // WHICH WAY THE BODY FACES, as two model-frame vectors: the shoulder line
    // and the hip line. A yaw baked a quarter or a half turn out leaves every
    // joint correct relative to the hips and turns the whole mech.
    const dir = (a, b) => {
      const A = bm[a], B = bm[b];
      if (!A || !B) return null;
      const p = A.getWorldPosition(new V()), q = B.getWorldPosition(new V());
      return [+(p.x - q.x).toFixed(4), +(p.y - q.y).toFixed(4), +(p.z - q.z).toFixed(4)];
    };

    return { poses: out, mapped: Object.keys(bm).length, scale: +(f.scale || 0).toFixed(5),
      headY: hy, anchors, box: bx,
      shoulderLine: dir('shoulderL', 'shoulderR'), hipLine: dir('thighL', 'thighR'),
      // where the body actually sits: the fighter's own y, the lowest rendered
      // vertex (what the prone clamp and the floor guard read) and the grounding
      // offset the load path applied inside the group.
      posY: +(f.pos?.y ?? 0).toFixed(4),
      lowY: (() => { try { return +f.mech.lowestRenderedY().toFixed(4); } catch (e) { return null; } })(),
      modelY: (() => { const c = f.mech.group.children.find((k) => k.children?.length);
        const mm = c?.children?.[0]; return mm ? +mm.position.y.toFixed(4) : null; })() };
  }, { TEST_POSES, JOINTS });
  await page.close();
  if (data.err) throw new Error(`${tag}: ${data.err}`);
  if (errs.length) console.warn(`  (${tag} page errors:`, errs.slice(0, 2), ')');
  return data;
}

// ---- SKIN fidelity: the strong check -----------------------------------
// Joints are 15 points. The skin is every vertex, and it is what a player sees:
// a rebind, a weight change, a seam cut applied in the wrong order or a drop
// that took the wrong triangles all leave the skeleton perfect. So play EVERY
// CLIP THIS MECH CAN PLAY, step the animator deterministically (fixed dt from
// t=0, so two runs sample the same instants), CPU-skin the mesh at several
// frames of each, and compare the vertices themselves.
//
// It samples a fixed STRIDE through the position buffer rather than a region,
// so the coverage is the whole body, and it reports deviation as a fraction of
// the mech's own height — the only way a 5-unit raptor and a 9-unit siege
// chassis can share a tolerance. Vertex COUNT is checked first and separately:
// the drops and the seam cuts change it, and if the bake and the load path
// disagree about those the two builds are not comparable at all, which is
// itself the finding.
const SKIN_VERTS = 160;   // sampled vertices per frame, evenly strided
const SKIN_FRAMES = 5;    // frames per clip
const SKIN_EPS = 0.004;   // 0.4% of body height

async function captureSkin(browser, tag) {
  const page = await browser.newPage();
  await page.addInitScript(SEED_SCRIPT);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  // A build step that quietly declines leaves a console.warn and nothing else —
  // that is how the fist split turned out to be missing on a baked titanus.
  page.on('console', (m) => {
    const t = m.text();
    if (/fist split|falling back|manifest\[|no clip|failed/i.test(t)) errs.push('warn: ' + t.slice(0, 160));
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  const data = await page.evaluate(async ({ id, NV, NF }) => {
    // DETERMINISM FIRST, before anything is built. The Animator seeds
    // `phase`/`t` from Math.random() on purpose (it desyncs two mechs' idles),
    // and several signatures twitch antennae and fire head impulses off it too
    // — so the same build measured twice disagreed by 4-5% of body height on
    // fast clips, which is larger than anything a bake does and made the check
    // useless. A seeded PRNG makes the whole pipeline reproducible while still
    // RUNNING every hook: the jerry pod bug this check exists to catch lives in
    // a profile `post` hook, so sampling the clips' authored poses directly
    // instead would have walked straight past it.
    let _seed = 0x2f6e2b1;
    Math.random = () => {
      void _seed;   // see RANDOMNESS IS A CONSTANT in the header
      return 0.5;
    };
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ROSTER } = await import('/src/mechs/roster.js');
    const { buildGlbForTool } = await import('/src/mechs/gltf.js');
    const { profileFor } = await import('/src/mechs/glbanim.js');
    const { mechClips } = await import('/workbench/adapters/mechclips.js');
    const def = ROSTER.find((d) => d.id === id);
    const { mech } = await buildGlbForTool(def);
    if (!mech?.isGLB) return { err: 'not a GLB build (fell back to procedural?)' };
    const sk = [];
    mech.group.traverse((o) => { if (o.isSkinnedMesh) sk.push(o); });
    if (!sk.length) return { err: 'no skinned mesh' };
    const counts = sk.map((m) => m.geometry.attributes.position.count);

    const anim = mech.premadeAnimator;
    const v = new THREE.Vector3();
    const grab = () => {
      const out = [];
      for (const m of sk) {
        const n = m.geometry.attributes.position.count;
        const step = Math.max(1, Math.floor(n / NV));
        for (let i = 0; i < n; i += step) {
          m.getVertexPosition(i, v);        // CPU skinning: the drawn position
          v.applyMatrix4(m.matrixWorld);
          out.push(+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4));
        }
      }
      return out;
    };
    const ctx = { grounded: true, speed: 0, maxSpeed: 1, vy: 0, alwaysReady: true };
    const dt = 1 / 60;
    const clips = {};
    const names = ['(rest)', ...mechClips(def, mech.animProfile || profileFor(id))];
    for (const name of names) {
      try {
        // A CLIP MUST START FROM THE SAME PLACE EVERY RUN. The animator SMOOTHS
        // toward its targets, so `cur` carries whatever the body was doing
        // before — and between two page loads that is a different number of
        // idle frames. Without this reset the same build compared against
        // itself measured a 4.2% noise floor on fast clips, which is larger
        // than anything a bake does. poseStatic() reseats `cur` on the rest
        // target, which is a deterministic function of the mech alone.
        anim.t = 0; anim.phase = 0; anim.action = null;
        anim.poseStatic();
        let dur = 0.6;
        if (name !== '(rest)') { dur = anim.play(name, { fade: 0 }) || 0.6; }
        const total = Math.max(2, Math.round(dur / dt));
        const marks = new Set();
        for (let k = 0; k < NF; k++) marks.add(Math.max(1, Math.round(total * (k + 1) / NF)));
        const frames = [];
        for (let i = 1; i <= total; i++) {
          anim.update(dt, ctx);
          mech.postAnimate();
          if (marks.has(i)) { mech.group.updateMatrixWorld(true); frames.push(grab()); }
        }
        clips[name] = frames;
        anim.stop(0);
      } catch (e) { clips[name] = { err: String(e).slice(0, 90) }; }
    }
    // body height, so a deviation can be stated as a fraction of the mech
    const box = new THREE.Box3().setFromObject(mech.group);
    return { counts, clips, height: +box.getSize(new THREE.Vector3()).y.toFixed(4) };
  }, { id, NV: SKIN_VERTS, NF: SKIN_FRAMES });
  await page.close();
  if (data.err) throw new Error(`${tag}: ${data.err}`);
  if (errs.length) console.warn(`  (${tag} page errors:`, errs.slice(0, 2), ')');
  return data;
}

function skinFidelity(a, b) {
  const countsMatch = JSON.stringify(a.counts) === JSON.stringify(b.counts);
  const missing = Object.keys(a.clips).filter((c) => !b.clips[c]);
  const broken = Object.keys(a.clips).filter((c) => a.clips[c]?.err || b.clips[c]?.err);
  let max = 0, worst = null, sum = 0, n = 0, spot = null;
  const perClip = [];
  if (countsMatch) {
    for (const name of Object.keys(a.clips)) {
      const A = a.clips[name], B = b.clips[name];
      if (!Array.isArray(A) || !Array.isArray(B)) continue;
      let cm = 0;
      for (let f = 0; f < Math.min(A.length, B.length); f++) {
        const fa = A[f], fb = B[f];
        for (let i = 0; i + 2 < Math.min(fa.length, fb.length); i += 3) {
          const d = Math.hypot(fa[i] - fb[i], fa[i + 1] - fb[i + 1], fa[i + 2] - fb[i + 2]);
          if (d > cm) cm = d;
          if (d > max) {
            spot = { clip: name, frame: f, at: [fa[i], fa[i + 1], fa[i + 2]],
              to: [fb[i], fb[i + 1], fb[i + 2]] };
          }
          sum += d; n++;
        }
      }
      perClip.push({ name, max: cm });
      if (cm > max) { max = cm; worst = name; }
    }
  }
  const h = a.height || 1;
  perClip.sort((x, y) => y.max - x.max);
  return { countsMatch, counts: [a.counts, b.counts], missing, broken,
    maxFrac: +(max / h).toFixed(5), meanFrac: n ? +((sum / n) / h).toFixed(5) : 0,
    worst, spot, clips: perClip.length, top: perClip.slice(0, 3) };
}

// SHAPE fidelity: compare each joint RELATIVE TO HIPS, so a benign uniform
// grounding offset (the whole mech sitting a hair higher/lower — it re-grounds
// to the arena floor at runtime anyway) doesn't mask or inflate the number.
// A real skeleton/skin error shows up as a non-uniform relative deviation.
// `groundOffset` reports that global shift separately, for information.
function fidelity(a, b) {
  let max = 0, worst = null, ground = 0;
  for (const pose of POSES) {
    const ha = a.poses[pose]?.hips, hb = b.poses[pose]?.hips;
    if (ha && hb) ground = Math.max(ground, Math.hypot(ha[0] - hb[0], ha[1] - hb[1], ha[2] - hb[2]));
    for (const j of JOINTS) {
      const pa = a.poses[pose]?.[j], pb = b.poses[pose]?.[j];
      if (!pa || !pb || !ha || !hb) continue;
      // position relative to hips (translation-invariant)
      const d = Math.hypot((pa[0] - ha[0]) - (pb[0] - hb[0]),
        (pa[1] - ha[1]) - (pb[1] - hb[1]), (pa[2] - ha[2]) - (pb[2] - hb[2]));
      if (d > max) { max = d; worst = `${pose}/${j}`; }
    }
  }
  return { max: +max.toFixed(5), worst, ground: +ground.toFixed(4) };
}

// SIZE + ANCHOR fidelity — the half the joint check is blind to (see capturePoses).
// Anchor position is compared in the hips' frame, in world units; orientation as
// the angle between the two rest quaternions, in degrees. A dropped anchor is a
// failure in its own right, not a zero.
function extras(a, b) {
  const sizeErr = a.box && b.box && a.box[1] > 0.01
    ? Math.max(...[0, 1, 2].map((i) => Math.abs(b.box[i] - a.box[i]) / (a.box[i] || 1))) : null;
  const names = Object.keys(a.anchors || {});
  const missing = names.filter((n) => !b.anchors?.[n]);
  const added = Object.keys(b.anchors || {}).filter((n) => !a.anchors?.[n]);
  let posMax = 0, posWorst = null, angMax = 0, angWorst = null;
  for (const n of names) {
    const p = a.anchors[n], q = b.anchors?.[n];
    if (!q) continue;
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d > posMax) { posMax = d; posWorst = n; }
    // angle between quaternions: 2*acos(|dot|)
    const dot = Math.abs(p[3] * q[3] + p[4] * q[4] + p[5] * q[5] + p[6] * q[6]);
    const ang = 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
    if (ang > angMax) { angMax = ang; angWorst = n; }
  }
  // Facing: the angle between the pre- and post-bake shoulder (then hip) lines.
  let facing = null;
  for (const k of ['shoulderLine', 'hipLine']) {
    const u = a[k], w = b[k];
    if (!u || !w) continue;
    const lu = Math.hypot(...u), lw = Math.hypot(...w);
    if (lu < 1e-4 || lw < 1e-4) continue;
    const c = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (lu * lw);
    const ang = Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
    facing = Math.max(facing ?? 0, +ang.toFixed(2));
  }
  return { sizeErr, count: names.length, missing, added, facing,
    posMax: +posMax.toFixed(4), posWorst, angMax: +angMax.toFixed(2), angWorst };
}

// ---- rig-file removal (custom rig) ----
// The game-side fields a rig module may declare beside its bones (see
// cleanEntry): read off the module itself, which is the same thing gltf.js
// reads at runtime, so nothing is re-parsed out of the file's text.
async function readRigExtras(mechId) {
  const rigPath = path.join(ROOT, `src/mechs/rigs/${mechId}.rig.js`);
  if (!fs.existsSync(rigPath)) return {};
  try {
    const mod = await import(pathToFileURL(rigPath).href);
    const rig = Object.values(mod).find((v) => v && Array.isArray(v.bones)) || {};
    const out = {};
    if (Array.isArray(rig.limpChains)) out.limpChains = rig.limpChains;
    if (rig.tailFloor !== undefined) out.tailFloor = rig.tailFloor;
    return out;
  } catch (e) {
    console.warn(`     (could not read rig extras for ${mechId}: ${e.message})`);
    return {};
  }
}

function removeRigFile(mechId) {
  const rigPath = path.join(ROOT, `src/mechs/rigs/${mechId}.rig.js`);
  const idxPath = path.join(ROOT, 'src/mechs/rigs/index.js');
  const changed = [];
  if (fs.existsSync(rigPath)) { fs.rmSync(rigPath); changed.push(rigPath); }
  if (fs.existsSync(idxPath)) {
    const CONST = `${mechId.toUpperCase()}_RIG`;
    const kept = fs.readFileSync(idxPath, 'utf8').split('\n').filter((l) => {
      const t = l.trim();
      if (t.startsWith('import') && t.includes(CONST)) return false;      // import line
      if (t.startsWith(`${mechId}:`) && t.includes(CONST)) return false;  // registry line
      return true;
    }).join('\n');
    fs.writeFileSync(idxPath, kept); changed.push(idxPath);
  }
  return changed;
}

// ---- keep the source + the edit list ----
// A baked asset has swallowed its own recipe: the manifest fields are gone and
// the rig file is deleted, so "what is actually in this model?" would only be
// answerable from git. Archive both next to the model instead — the untouched
// GLB, and a JSON listing exactly what was folded into it.
function archiveSource(entry, removedFields, manifestText, report) {
  const dir = path.join(ROOT, 'public/models/source');
  fs.mkdirSync(dir, { recursive: true });
  // NAMED BY THE FILE, not by the mech: an entry's url is not always
  // mech_<id>.glb (jerry's primary model is mech_jerry_alt.glb, with the plain
  // name belonging to his staged alternate).
  const base = path.basename(entry.url);
  const src = path.join(dir, base);
  const glbPath = path.join(ROOT, 'public', entry.url);
  // ONCE: a second bake must not overwrite the true original with an already
  // baked one. The first archive is the pristine service asset, forever.
  const firstTime = !fs.existsSync(src);
  if (firstTime) fs.copyFileSync(glbPath, src);
  const sidecarPath = path.join(dir, `${id}.edits.json`);
  const prevSidecar = fs.existsSync(sidecarPath) ? fs.readFileSync(sidecarPath, 'utf8') : null;

  const before = JSON.parse(manifestText)[id];
  const edits = {};
  for (const f of removedFields) if (before[f] !== undefined) edits[f] = before[f];
  const rigPath = path.join(ROOT, `src/mechs/rigs/${id}.rig.js`);
  const sidecar = {
    mech: id,
    bakedAt: new Date().toISOString(),
    note: `These edits were folded into public/${entry.url} by tools/bake-glb.mjs. `
      + `The untouched service asset is ${base} in this directory. To start over: `
      + 'copy it back, restore these manifest fields and the rig file below.',
    sourceGlb: `public/models/source/${base}${firstTime ? '' : ' (kept from an earlier bake)'}`,
    manifestFieldsFolded: edits,
    // THE RENAME HAS TO COME BACK TOO. --restore puts the SOURCE glb back, whose
    // bones still carry their auto-rig names, so a `muzzles` entry rewritten to
    // the joint names would point at bones that no longer exist. Kept as the map
    // the bake applied; the restore inverts it.
    boneRenames: report?.renames && Object.keys(report.renames).length ? report.renames : null,
    transform: report?.transform || null,
    rigFile: fs.existsSync(rigPath)
      ? { path: `src/mechs/rigs/${id}.rig.js`, text: fs.readFileSync(rigPath, 'utf8') }
      : null,
  };
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');
  console.log(`     archived source${firstTime ? '' : ' (already present)'} + edit list -> public/models/source/`);
  // what rollback() needs to take this back: the sidecar as it was (null =
  // there was none) and whether the source copy is this run's to delete.
  return { sidecarPath, prevSidecar, srcPath: src, copied: firstTime };
}

// ---- un-bake (--restore) ----------------------------------------------------
// The exact inverse of what --apply folded in, read back off the sidecar the
// bake wrote. A baked mech carries its skeleton and its corrected skin weights
// INSIDE the .glb, which is what the game wants and what the workbenches
// cannot edit: ?edit=rig only drags a hand-authored src/mechs/rigs/<id>.rig.js,
// so a baked mech reports "no custom rig to edit". Restoring puts the editable
// pipeline back (source asset + manifest fields + rig file); bake again after.
function restoreEntry(text, mechId, fields, boneRenames) {
  const m = JSON.parse(text);
  const entry = m[mechId];
  if (!entry) throw new Error(`no manifest entry "${mechId}"`);
  // Present fields WIN: anything authored since the bake (a muzzle moved, a
  // scale retuned) must survive a rollback of the baked ones.
  const kept = [], back = [];
  const merged = { ...entry };
  for (const [k, v] of Object.entries(fields)) {
    if (entry[k] !== undefined) { kept.push(k); continue; }
    merged[k] = v; back.push(k);
  }
  // Undo the bone rename: the source asset's bones answer to their auto-rig
  // names again, so an anchor pointing at `handR` has to go back to `bone_36`.
  if (boneRenames && Object.keys(boneRenames).length) {
    const inverse = Object.fromEntries(Object.entries(boneRenames).map(([from, to]) => [to, from]));
    const { entry: rewritten, moved } = rewriteBoneNames(merged, inverse);
    Object.assign(merged, rewritten);
    if (moved.length) back.push(`bone names (${moved.length})`);
  }
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => l.trimStart().startsWith(`"${mechId}":`));
  if (startIdx < 0) throw new Error(`could not locate "${mechId}" block`);
  let depth = 0, endIdx = -1;
  for (let i = startIdx; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (i > startIdx && depth === 0) { endIdx = i; break; }
  }
  const trailingComma = lines[endIdx].trimEnd().endsWith(',');
  const body = JSON.stringify({ [mechId]: merged }, null, 2)
    .split('\n').slice(1, -1).map((l) => '  ' + l).join('\n');
  return { out: [...lines.slice(0, startIdx), body + (trailingComma ? ',' : ''), ...lines.slice(endIdx + 1)].join('\n'), back, kept };
}

// Put the rig file back on disk AND in the registry (the bake dropped both).
// Import + registry lines go back in alphabetical order, which is how the file
// is kept, so the restore reads as if the rig had never left.
function restoreRigFile(mechId, rigFile) {
  const written = [];
  const rigPath = path.join(ROOT, rigFile.path);
  fs.writeFileSync(rigPath, rigFile.text);
  written.push(rigPath);
  const idxPath = path.join(ROOT, 'src/mechs/rigs/index.js');
  const CONST = `${mechId.toUpperCase()}_RIG`;
  let text = fs.readFileSync(idxPath, 'utf8');
  if (!text.includes(CONST)) {
    const lines = text.split('\n');
    const importLine = `import { ${CONST} } from './${mechId}.rig.js';`;
    const imports = lines.map((l, i) => [l, i]).filter(([l]) => l.startsWith('import {') && l.includes('.rig.js'));
    const afterImports = imports.find(([l]) => l > importLine) || null;
    lines.splice(afterImports ? afterImports[1] : imports[imports.length - 1][1] + 1, 0, importLine);
    const regLine = `  ${mechId}: ${CONST},`;
    const regs = lines.map((l, i) => [l, i]).filter(([l]) => /^ {2}\w+: \w+_RIG,$/.test(l));
    const afterRegs = regs.find(([l]) => l > regLine) || null;
    lines.splice(afterRegs ? afterRegs[1] : regs[regs.length - 1][1] + 1, 0, regLine);
    fs.writeFileSync(idxPath, lines.join('\n'));
    written.push(idxPath);
  }
  return written;
}

if (RESTORE) {
  const dir = path.join(ROOT, 'public/models/source');
  const sidePath = path.join(dir, `${id}.edits.json`);
  if (!fs.existsSync(sidePath)) {
    console.error(`no bake to restore: ${path.relative(ROOT, sidePath)} does not exist`);
    process.exit(1);
  }
  const side = JSON.parse(fs.readFileSync(sidePath, 'utf8'));
  const manifestText = fs.readFileSync(MANIFEST, 'utf8');
  const entry = JSON.parse(manifestText)[id];
  const base = path.basename(entry.url);
  const srcGlb = path.join(dir, base);
  const { out, back, kept } = restoreEntry(manifestText, id, side.manifestFieldsFolded || {},
    side.boneRenames);
  console.log(`\n== un-bake ${id} ${APPLY ? '(APPLY)' : '(dry run)'} ==`);
  console.log(`     baked at ${side.bakedAt}`);
  console.log(`     asset:    public/${entry.url}  <-  ${path.relative(ROOT, srcGlb)}`
    + ` (${(fs.statSync(srcGlb).size / 1e6).toFixed(2)} MB, currently ${(fs.statSync(path.join(ROOT, 'public', entry.url)).size / 1e6).toFixed(2)} MB)`);
  console.log(`     manifest: restores ${back.length ? back.join(', ') : '(nothing)'}`
    + `${kept.length ? `   [kept as-is, authored since the bake: ${kept.join(', ')}]` : ''}`);
  console.log(`     rig file: ${side.rigFile ? side.rigFile.path + ' + registry' : '(none in sidecar)'}`);
  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }
  fs.copyFileSync(srcGlb, path.join(ROOT, 'public', entry.url));
  fs.writeFileSync(MANIFEST, out);
  const written = side.rigFile ? restoreRigFile(id, side.rigFile) : [];
  console.log(`\nRESTORED. ${['public/' + entry.url, 'public/models/manifest.json',
    ...written.map((p) => path.relative(ROOT, p))].join(', ')}`);
  console.log(`${id} is editable again: /workbench/?edit=rig&mech=${id}`);
  console.log(`Re-bake when done: node tools/bake-glb.mjs ${id} --apply`);
  process.exit(0);
}

// ---- main ----
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });

if (NOISE) {
  console.log(`\n== ${id}: skin NOISE FLOOR (same build, two captures) ==`);
  const a = await captureSkin(browser, 'run 1');
  const b = await captureSkin(browser, 'run 2');
  const sk = skinFidelity(a, b);
  console.log(`   ${sk.clips} clips x ${SKIN_FRAMES} frames x ~${SKIN_VERTS} verts`);
  console.log(`   worst ${(sk.maxFrac * 100).toFixed(3)}% of height${sk.worst ? ` (${sk.worst})` : ''}`
    + `   mean ${(sk.meanFrac * 100).toFixed(4)}%`);
  console.log('   worst clips: ' + sk.top.map((c) => `${c.name} ${(c.max / (a.height || 1) * 100).toFixed(3)}%`).join(' · '));
  console.log(`   current tolerance ${(SKIN_EPS * 100).toFixed(1)}%`);
  await browser.close();
  process.exit(0);
}

let mutated = false;
let landed = false;  // set only when an --apply passed its check and stays
let undo = null;
function rollback() {
  if (!undo) return;
  fs.writeFileSync(undo.glbPath, undo.glb);
  fs.writeFileSync(MANIFEST, undo.manifest);
  fs.writeFileSync(path.join(ROOT, 'src/mechs/rigs/index.js'), undo.rigIndex);
  const rp = path.join(ROOT, `src/mechs/rigs/${id}.rig.js`);
  if (undo.rig !== null) fs.writeFileSync(rp, undo.rig);
  else if (fs.existsSync(rp)) fs.rmSync(rp);
  // THE ARCHIVE COMES BACK TOO (see the header): a sidecar describes a bake
  // that landed, so one written for a bake that did not is removed — or the
  // previous bake's sidecar restored — and a source copy made this run goes.
  if (undo.archive) {
    const { sidecarPath, prevSidecar, srcPath, copied } = undo.archive;
    if (prevSidecar !== null) fs.writeFileSync(sidecarPath, prevSidecar);
    else if (fs.existsSync(sidecarPath)) fs.rmSync(sidecarPath);
    if (copied && fs.existsSync(srcPath)) fs.rmSync(srcPath);
  }
}
try {
  const origManifest = fs.readFileSync(MANIFEST, 'utf8');
  const entry = JSON.parse(origManifest)[id];
  if (!entry?.url) throw new Error(`no GLB manifest entry for "${id}"`);
  // the file the ENTRY names — see archiveSource on why this is not mech_<id>.glb
  const glbPath = path.join(ROOT, 'public', entry.url);
  const bakedPath = glbPath.replace(/\.glb$/, '.baked.glb');
  console.log(`     asset: ${entry.url}`);
  const customRig = !!entry.rig;

  console.log(`\n== bake ${id} ${APPLY ? '(APPLY)' : '(dry run)'} ==`);
  console.log('1/5  capturing pre-bake state (joints, size, anchors + every clip skinned)…');
  const before = await capturePoses(browser, 'pre-bake');
  const beforeSkin = await captureSkin(browser, 'pre-bake');
  console.log(`     ${Object.keys(beforeSkin.clips).length} clips · ${beforeSkin.counts.join('+')} verts · height ${beforeSkin.height}`);

  console.log('2/5  baking GLB…');
  const { buffer, report } = await getBakedGlb(browser);
  console.log(`     ${(buffer.length / 1e6).toFixed(2)} MB · ${report.bones} bones · ${report.mappedJoints}/15 joints mapped · customRig=${report.customRig}`);

  // compute the cleaned manifest before mutating anything (for the diff report)
  const rigExtras = customRig ? await readRigExtras(id) : {};
  const { out: cleanManifest, removed, moved } = cleanEntry(origManifest, id,
    { renames: report.renames, jointBones: report.jointBones, rigExtras });

  console.log('3/5  writing baked GLB + cleaned manifest (temporarily) for fidelity check…');
  // WHAT THIS MECH TOUCHES, kept in memory so undoing it is surgical. The
  // revert used to be `git checkout -- public/models src/mechs/rigs`, which is
  // fine for one dry run and wrong in a batch: it also throws away every mech
  // baked before this one. A run over the roster with four failures in it
  // ended with nothing applied at all.
  undo = {
    glbPath, glb: fs.readFileSync(glbPath),
    manifest: origManifest,
    rig: fs.existsSync(path.join(ROOT, `src/mechs/rigs/${id}.rig.js`))
      ? fs.readFileSync(path.join(ROOT, `src/mechs/rigs/${id}.rig.js`), 'utf8') : null,
    rigIndex: fs.readFileSync(path.join(ROOT, 'src/mechs/rigs/index.js'), 'utf8'),
  };
  if (APPLY) undo.archive = archiveSource(entry, removed, origManifest, report);
  fs.writeFileSync(glbPath, buffer);                 // overwrite (restored below if dry run)
  fs.writeFileSync(MANIFEST, cleanManifest);
  const rigChanged = customRig ? removeRigFile(id) : [];

  mutated = true;    // from here on the tree is dirty; see the finally below

  console.log('4/5  capturing post-bake state (stock load path)…');
  const after = await capturePoses(browser, 'post-bake');
  const afterSkin = await captureSkin(browser, 'post-bake');
  const fid = fidelity(before, after);
  const skin = skinFidelity(beforeSkin, afterSkin);

  console.log('\n---- fidelity (pre-bake custom-rig  vs  baked stock-path) ----');
  console.log(`     shape deviation (joints rel. hips): ${fid.max} world-units  (worst: ${fid.worst})  tolerance ${FID_EPS}`);
  console.log(`     ground offset (benign, re-grounds at runtime): ${fid.ground} world-units`);
  if (fid.max > FID_EPS) {
    const dev = JOINTS.map((j) => { const a = before.poses.rest[j], b = after.poses.rest[j], ha = before.poses.rest.hips, hb = after.poses.rest.hips;
      return a && b ? `${j}:${Math.hypot((a[0]-ha[0])-(b[0]-hb[0]),(a[1]-ha[1])-(b[1]-hb[1]),(a[2]-ha[2])-(b[2]-hb[2])).toFixed(3)}` : `${j}:—`; });
    console.log('     rest per-joint Δ (rel. hips): ' + dev.join('  '));
  }
  const ex = extras(before, after);
  console.log(`     rendered size: ${ex.sizeErr === null ? '(not measured)'
    : (ex.sizeErr * 100).toFixed(2) + '% worst axis'}   tolerance ${(SIZE_EPS * 100).toFixed(0)}%`
    + `   [${before.box?.join(' x ') || '?'} -> ${after.box?.join(' x ') || '?'}]`);
  console.log(`     facing (shoulder/hip line): ${ex.facing === null ? '(not measured)' : ex.facing + '°'}`
    + `   tolerance ${FACE_DEG}°`);
  console.log(`     sits at: fighter y ${before.posY} -> ${after.posY}`
    + `   lowest rendered ${before.lowY} -> ${after.lowY}`
    + `   grounding offset ${before.modelY} -> ${after.modelY}`);
  console.log(`     anchors (${ex.count}): worst rest offset ${ex.posMax} world-units`
    + `${ex.posWorst ? ` (${ex.posWorst})` : ''}, worst aim ${ex.angMax}°`
    + `${ex.angWorst ? ` (${ex.angWorst})` : ''}   tolerance ${ANCHOR_EPS} / ${ANCHOR_DEG}°`);
  if (ex.missing.length) console.log(`     ANCHORS LOST: ${ex.missing.join(', ')}`);
  if (ex.added.length) console.log(`     anchors added: ${ex.added.join(', ')}`);

  console.log(`     SKIN over ${skin.clips} clips x ${SKIN_FRAMES} frames x ~${SKIN_VERTS} verts:`
    + `  worst ${(skin.maxFrac * 100).toFixed(3)}% of height`
    + `${skin.worst ? ` (${skin.worst})` : ''}   mean ${(skin.meanFrac * 100).toFixed(4)}%`
    + `   tolerance ${(SKIN_EPS * 100).toFixed(1)}%`);
  console.log(`     vertex count: ${skin.countsMatch ? 'unchanged ' + skin.counts[0].join('+')
    : `CHANGED ${skin.counts[0].join('+')} -> ${skin.counts[1].join('+')} — the bake and the load path disagree`}`);
  if (skin.top.length > 1) {
    console.log('     worst clips: ' + skin.top.map((c) => `${c.name} ${(c.max / (beforeSkin.height || 1) * 100).toFixed(3)}%`).join(' · '));
  }
  if (skin.spot && skin.maxFrac > 0) {
    const f = (a) => a.map((v) => v.toFixed(2)).join(', ');
    console.log(`     worst vertex: ${skin.spot.clip} frame ${skin.spot.frame + 1}`
      + `   [${f(skin.spot.at)}] -> [${f(skin.spot.to)}]`);
  }
  if (skin.missing.length) console.log(`     CLIPS LOST: ${skin.missing.join(', ')}`);
  if (skin.broken.length) console.log(`     clips that threw: ${skin.broken.join(', ')}`);

  const skinOk = skin.countsMatch && !skin.missing.length && skin.maxFrac <= SKIN_EPS;
  const sizeOk = ex.sizeErr === null || ex.sizeErr <= SIZE_EPS;
  const anchorOk = !ex.missing.length && ex.posMax <= ANCHOR_EPS && ex.angMax <= ANCHOR_DEG;
  const faceOk = ex.facing === null || ex.facing <= FACE_DEG;
  const ok = fid.max <= FID_EPS && after.mapped >= 10 && sizeOk && anchorOk && faceOk && skinOk;
  const why = [fid.max > FID_EPS && 'shape', !skinOk && 'SKIN', !sizeOk && 'size', !anchorOk && 'anchors', !faceOk && 'facing',
    after.mapped < 10 && 'joints'].filter(Boolean);
  console.log(`     ${ok ? 'PASS ✓ baked mech is faithful (skin, shape, size and anchors)'
    : `FAIL ✗ ${why.join(' + ')} over tolerance — DO NOT COMMIT`}`);

  console.log('\n---- manifest entry: fields removed ----');
  console.log(`     ${removed.length ? removed.join(', ') : '(none)'}${customRig ? '   + rig file: ' + rigChanged.map((p) => path.relative(ROOT, p)).join(', ') : ''}`);
  console.log(`     bones renamed to joints: ${Object.keys(report.renames || {}).length}`
    + `${moved.length ? '\n     references rewritten: ' + moved.join(' · ') : ''}`);

  console.log('5/5  finalizing…');
  // A FAILED CHECK MUST NOT LAND. --apply used to write whatever the bake
  // produced and merely print the verdict, which puts the burden of noticing on
  // whoever is reading the scrollback — and a batch run over the roster has no
  // one reading. --force is the deliberate override.
  if (APPLY && !ok && !FORCE) {
    rollback();
    console.log(`\nNOT APPLIED — the check failed (${why.join(' + ')}) and ${id} is back as it was.`);
    console.log('Re-run with --force to write it anyway.');
    process.exit(2);
  }
  if (APPLY) {
    landed = true;
    fs.writeFileSync(bakedPath, Buffer.alloc(0)); // no leftover
    fs.rmSync(bakedPath);
    console.log(`\nAPPLIED. Review 'git status' / 'git diff', then commit — that commit is the revertible changelist.`);
    console.log('NOW CHECK WHAT JOINTS CANNOT SHOW (see the header):');
    console.log(`  node tools/skindebug.mjs ${id}        (skinning: same findings + severities?)`);
    console.log(`  node tools/weldmap.mjs ${id} --list   (welds + seam cuts unchanged?)`);
    console.log(`  node tools/posters.mjs ${id}          (the asset moved: re-render the poster)`);
    console.log(`Suggested: git add -A && git commit -m "Bake ${id} GLB: fold rig/skinning into the asset"`);
  } else {
    // leave a .baked.glb for inspection; the finally below restores the tree
    fs.writeFileSync(bakedPath, buffer);
    console.log(`\nDRY RUN — repo restored. Inspect ${path.relative(ROOT, bakedPath)}.`);
    console.log(`Re-run with --apply to write the changes.`);
  }
} finally {
  // NOTHING LANDS UNLESS THE CHECK PASSED, even when a step throws. The baked
  // GLB, the cleaned manifest, the removed rig file and the archive all land on
  // disk before the fidelity check can run, so an exception in between used to
  // leave the repo half-baked and the next command working against it — and an
  // --apply that threw mid-check left the archive claiming a bake that never
  // happened. A dry run always comes back here; an --apply only when it did
  // not land.
  if (mutated && !landed) {
    try { rollback(); console.log(`(${APPLY ? 'apply did not land' : 'dry run'}: ${id} restored)`); }
    catch (e) { console.error('COULD NOT RESTORE — check git status:', e.message); }
  }
  await browser.close();
}
