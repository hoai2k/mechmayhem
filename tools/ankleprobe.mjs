// ankleprobe — WHERE IS EVERY MECH'S ANKLE, relative to the ground it stands on?
//
//   node tools/ankleprobe.mjs [mech …] [--json out.json] [--base http://localhost:5173]
//
// The rig question this answers: an ankle bone is the hinge the gait rolls the
// foot around, so the animation only reads right when it sits at the ANKLE —
// above the sole by about a boot's thickness, with the heel and toe box below
// it. Two ways for a hand-placed rig to get that wrong, and they are opposite:
//
//   ankle FAR ABOVE the sole  — the bone was dropped on the hock/shin instead
//     of the ankle. Animator.calibrateFeet() measures that depth and DAMPS the
//     heel roll to compensate (ankleGain -> 0.25 at worst), because rolling a
//     deep boot by the authored amount buries its corner in the floor. The
//     gait's toe-off is then a quarter of what it was tuned for. This is what
//     viper's rig fix cured: 0.92 -> 0.21 world units, ankleGain 0.35 -> 1.0.
//
//   ankle AT or BELOW the sole — nothing is left under the hinge to roll, and
//     calibrateFeet gives up (`depth <= 0.02`) and keeps the default. A bone
//     BELOW the sole is worse than useless: it is underground at rest, and any
//     child bone under it is buried with it.
//
// Columns, all in WORLD units at the rest pose, with the mech standing at y=0:
//
//   soleY      lowest rendered vertex of that foot's own subtree (the sole)
//   ankleY     the ankle bone's height
//   depth      ankleY - soleY: the boot depth calibrateFeet measures
//   depth%     the same as a fraction of the mech's height, which is how to
//              compare a 2m viper with a 6m titanus
//   gain/flat  the ankleGain and footFlat that depth hands the gait
//   under      any bone at or below the sole (`bone -Nunits`) — the ankle
//              itself or anything parented under it. THESE ARE THE BUG: a
//              buried bone drags the geometry it owns through the floor.
//
// GOOD is depth positive and modest — near the 0.32 * scale convention the
// procedural rigs are built to, which is what gain 1.00 means. Run it after any
// rig edit; `node tools/rigtest.mjs` still checks the retarget maths, and
// tools/footprobe.mjs still asks whether the walk actually plants.
import { launch } from './lib/browser.mjs';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const only = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const base = flag('base', 'http://localhost:5173');
const jsonOut = flag('json', null);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

const rows = await page.evaluate(async (only) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { ROSTER } = await import('/src/mechs/roster.js');
  const { Animator } = await import('/src/mechs/animator.js');
  const { buildGlbForTool, fetchRawManifest } = await import('/src/mechs/gltf.js');
  const { bodySkinnedMesh, boneSoleSamples } = await import('/src/mechs/glbshell.js');
  const manifest = await fetchRawManifest();
  const _v = new THREE.Vector3();

  const out = [];
  for (const def of ROSTER) {
    if (only.length && !only.includes(def.id)) continue;
    if (!manifest[def.id]?.url) { out.push({ id: def.id, skipped: 'no GLB' }); continue; }
    let mech = null;
    try {
      mech = (await buildGlbForTool(def)).mech;
      const an = mech.premadeAnimator || new Animator(mech);
      an.poseStatic();
      mech.group.updateWorldMatrix(true, false);
      mech.group.updateMatrixWorld(true);
      const body = bodySkinnedMesh(mech.group);
      // the mech's own footprint: lowest rendered vertex anywhere on it, which
      // is the floor it is standing on
      let bottom = Infinity, top = -Infinity;
      mech.group.traverse((o) => {
        if (o.isSkinnedMesh) o.skeleton.update();
        const pos = (o.isMesh || o.isSkinnedMesh) && o.geometry?.attributes?.position;
        if (!pos) return;
        const stride = Math.max(1, Math.floor(pos.count / 6000));
        for (let i = 0; i < pos.count; i += stride) {
          o.getVertexPosition(i, _v); o.localToWorld(_v);
          if (_v.y < bottom) bottom = _v.y;
          if (_v.y > top) top = _v.y;
        }
      });
      const height = top - bottom;
      const sides = [];
      for (const side of ['L', 'R']) {
        const bone = mech.boneMap?.['ankle' + side];
        if (!bone || !body) { sides.push({ side, missing: true }); continue; }
        const s = boneSoleSamples(body, bone);
        const ankleY = bone.getWorldPosition(_v).y;
        // every bone the ankle carries, the ankle included: anything at or
        // under the sole is buried, and the geometry it owns goes with it
        const under = [];
        bone.traverse((b) => {
          if (!b.isBone) return;
          const y = b.getWorldPosition(_v).y;
          if (s && y <= s.lowest + 1e-6) under.push({ bone: b.name, y, below: s.lowest - y });
        });
        // THE WHOLE LEG, bone by bone, from the thigh down: what else is in
        // there, and how high does it sit? An "ankle" measured a third of the
        // way up the body is usually a MAPPING mistake — the auto-rig named a
        // shin or a hock bone something ankle-ish — and the fix is a
        // boneOverride onto the real foot bone, which moves no geometry.
        const chain = [];
        const thigh = mech.boneMap?.['thigh' + side];
        if (thigh) {
          // THE FOOT PLATE: every vertex of this leg below one convention
          // depth off the sole — the slab the ankle is supposed to roll. A
          // candidate bone is only the ankle if its own subtree OWNS that slab;
          // a toe-tip bone sits at a lovely height and owns nothing, and
          // driving the ankle joint through it loses the roll entirely.
          const plateCut = (s ? s.lowest : 0) + 0.32 * an.s;
          const legSet = new Set();
          thigh.traverse((b) => { if (b.isBone) legSet.add(body.skeleton.bones.indexOf(b)); });
          const si = body.geometry.attributes.skinIndex;
          const sw = body.geometry.attributes.skinWeight;
          const dom = [];   // [boneIndex, worldY] for the plate's vertices
          for (let i = 0; i < si.count; i++) {
            let bi = -1, bw = 0;
            for (const k of ['x', 'y', 'z', 'w']) {
              const w = sw['get' + k.toUpperCase()](i);
              if (w > bw) { bw = w; bi = si['get' + k.toUpperCase()](i); }
            }
            if (bi < 0 || !legSet.has(bi)) continue;
            body.getVertexPosition(i, _v); body.localToWorld(_v);
            if (_v.y <= plateCut) dom.push(bi);
          }
          const plateTotal = dom.length;
          thigh.traverse((b) => {
            if (!b.isBone) return;
            const ss = boneSoleSamples(body, b);
            const sub = new Set();
            b.traverse((c) => { if (c.isBone) sub.add(body.skeleton.bones.indexOf(c)); });
            const owned = dom.filter((bi) => sub.has(bi)).length;
            chain.push({
              bone: b.name, parent: b.parent?.name || null,
              y: b.getWorldPosition(_v).y,
              subLowest: ss ? ss.lowest : null,
              depth: ss ? b.getWorldPosition(_v).y - ss.lowest : null,
              plateShare: plateTotal ? owned / plateTotal : 0,
            });
          });
        }
        sides.push({
          side, ankleY, soleY: s ? s.lowest : null,
          depth: s ? ankleY - s.lowest : null,
          kids: bone.children.filter((c) => c.isBone).map((c) => c.name),
          mapped: bone.name, under, chain,
        });
      }
      // what the animator makes of it (calibrateFeet runs the same measurement)
      an.ankleGain = 1; an.footFlat = 0; an.footDepth = 0.32 * an.s;
      an.calibrateFeet();
      out.push({
        id: def.id, gait: an.gaitId, quad: !!an.gait.quad, scale: an.s, height, bottom,
        sides, footDepth: an.footDepth, ankleGain: an.ankleGain, footFlat: an.footFlat,
        convention: 0.32 * an.s, rig: manifest[def.id]?.rig || null,
      });
    } catch (e) {
      out.push({ id: def.id, error: String(e.message).slice(0, 160) });
    }
    mech?.group.traverse((o) => o.geometry?.dispose?.());
  }
  return out;
}, only);

const pad = (s, n) => String(s).padEnd(n);
const n3 = (v) => (v == null ? '—' : v.toFixed(3));
console.log(pad('mech', 11), pad('rig', 9), pad('side', 5), pad('soleY', 8), pad('ankleY', 8),
  pad('depth', 8), pad('depth%h', 8), pad('conv', 7), pad('gain', 6), pad('flat', 6), 'buried bones');
for (const r of rows) {
  if (r.skipped) { console.log(pad(r.id, 11), '—', r.skipped); continue; }
  if (r.error) { console.log(pad(r.id, 11), 'ERROR', r.error); continue; }
  for (const s of r.sides) {
    if (s.missing) { console.log(pad(r.id, 11), pad(r.rig || '—', 9), pad(s.side, 5), 'no ankle bone'); continue; }
    const pct = s.depth != null && r.height ? `${(100 * s.depth / r.height).toFixed(1)}%` : '—';
    console.log(pad(r.id, 11), pad(r.rig || '—', 9), pad(s.side, 5), pad(n3(s.soleY), 8), pad(n3(s.ankleY), 8),
      pad(n3(s.depth), 8), pad(pct, 8), pad(n3(r.convention), 7),
      pad(r.ankleGain.toFixed(2), 6), pad(r.footFlat.toFixed(2), 6),
      s.under.map((u) => `${u.bone} -${u.below.toFixed(3)}`).join(' ') + (r.quad ? '  [quad: not calibrated]' : ''));
  }
}
// --chains: the whole leg bone by bone, for deciding whether a better ankle
// bone already exists in the skeleton
if (args.includes('--chains')) {
  for (const r of rows) {
    if (r.skipped || r.error) continue;
    console.log(`\n${r.id}  (height ${r.height.toFixed(2)}, convention depth ${r.convention.toFixed(3)})`);
    for (const s of r.sides) {
      if (s.missing) continue;
      console.log(`  ${s.side}: ankle${s.side} -> "${s.mapped}"  children: ${s.kids.join(', ') || '(none)'}`);
      for (const c of s.chain) {
        const mark = c.bone === s.mapped ? ' <== mapped' : '';
        console.log(`     ${pad(c.bone, 26)} y ${pad(n3(c.y), 8)} subtree sole ${pad(n3(c.subLowest), 8)}`
          + ` depth ${pad(n3(c.depth), 8)} plate ${pad((100 * c.plateShare).toFixed(0) + '%', 5)}${mark}`);
      }
    }
  }
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(rows, null, 2)); console.log(`\nwrote ${jsonOut}`); }
if (errors.length) console.log('PAGE ERRORS:', errors.join('\n'));
await browser.close();

// A BURIED BONE IS A FAILURE, not a note: it is under the arena floor at the
// REST pose, before any clip has run, and it takes the geometry it owns with it.
// buildSkeletonBones (reskin.js) clamps a custom rig's bones to y 0 for exactly
// this, so anything reaching here came from a GLB's own skeleton or a manifest
// nudge, where nothing is clamping.
const buried = rows.flatMap((r) => (r.sides || []).flatMap((s) => (s.under || [])
  .map((u) => `${r.id} ${s.side}: ${u.bone} is ${u.below.toFixed(3)} below its sole`)));
if (buried.length) {
  console.log('\nFAIL — bone(s) at or below the sole:');
  for (const b of buried) console.log('  ' + b);
  process.exitCode = 1;
} else {
  console.log('\nOK — no bone at or below its own sole on any mech measured.');
}
