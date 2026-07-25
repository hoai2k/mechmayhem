// Stretch audit: detect skin-weight bleed by POSING the skeleton and
// measuring seam-edge elongation.
//
// Rigidly-bound mech parts never stretch internally — only edges whose two
// endpoints follow DIFFERENT bones can elongate when a bone rotates. A
// legitimate blended joint edge stretches <2x under a 0.9 rad bend; a bled
// vertex (anchored to the body while its neighbors ride the arm) stretches
// 5-50x. Everything above STRETCH_R is a defect, attributed to its bone
// island, with the fix suggested by majority vote of the far endpoints'
// bones ("rebind this island to the bone its neighbors follow").
//
//   node tools/stretchaudit.mjs [baseUrl] [mechId,...]
//
// Output per mech: flagged islands + suggested skinOps (paste-ready). The
// suggestion is conservative: only islands smaller than 40% of their owner
// bone's total verts get an auto-suggestion — bigger ones need human eyes
// (?debug=skin).
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://127.0.0.1:5175';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const STRETCH_R = 3.0;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 200)));

// mech list from the manifest
await page.goto(`${base}/?rigtest`, { waitUntil: 'networkidle' });
const ids = await page.evaluate(async (only) => {
  const { fetchRawManifest } = await import('/src/mechs/gltf.js');
  const m = await fetchRawManifest();
  return Object.keys(m).filter((k) => m[k]?.url && (!only || only.includes(k)));
}, only);

const allSuggestions = {};
const allRows = {};
for (const id of ids) {
  await page.goto(`${base}/?debug=skin&id=${id}`, { waitUntil: 'networkidle' });
  // poll until the workbench has the mesh (saurion's 10MB GLB loads slowly)
  await page.waitForFunction(() => !!window.__skinTool?.mesh, null, { timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  const report = await page.evaluate(async ({ STRETCH_R, id }) => {
    // only the MAPPED bones are ever animated by the game (RigAdapter drives
    // just the manifest boneOverrides; everything else rigid-follows its
    // ancestors) — so sweep those, and flags = what can actually tear in play
    const { fetchRawManifest } = await import('/src/mechs/gltf.js');
    const manifest = await fetchRawManifest();
    // CUSTOM-RIG entries (manifest `rig`) carry no boneOverrides — their bones
    // ARE the game joints, so the driven set is JOINT_ORDER by name. Without
    // this the mapped set comes out empty and the audit sweeps nothing,
    // reporting a vacuous "0 flagged" for every re-rigged mech.
    const { JOINT_ORDER } = await import('/src/mechs/rigadapter.js');
    const mappedNames = manifest[id]?.rig
      ? new Set(JOINT_ORDER)
      : new Set(Object.values(manifest[id]?.boneOverrides || {}));
    const t = window.__skinTool;
    if (!t?.mesh) return { error: 'workbench not ready' };
    const mesh = t.mesh;
    const { compId, comps, domBone } = t.analysis;
    const geo = mesh.geometry;
    const idx = geo.index;
    const bones = mesh.skeleton.bones;
    const V3 = mesh.position.constructor;

    // ---- bone hierarchy distances (BFS over parent/child links) ----
    // Rigid Tripo skinning "tears" at EVERY joint when bent — elongation
    // alone can't tell a knee seam from bleed. But legit seams join bones
    // ADJACENT in the hierarchy; bleed joins bones far apart (a hip plate on
    // a hand bone is 5+ links from its neighbors' bone). Only far seams count.
    const nB = bones.length;
    const boneIdxOf = new Map(bones.map((b, i) => [b, i]));
    const adj = bones.map(() => []);
    bones.forEach((b, i) => {
      const p = boneIdxOf.get(b.parent);
      if (p !== undefined) { adj[i].push(p); adj[p].push(i); }
    });
    const hierDist = new Uint8Array(nB * nB).fill(255);
    for (let s = 0; s < nB; s++) {
      const q = [s]; hierDist[s * nB + s] = 0;
      while (q.length) {
        const u = q.shift();
        for (const v of adj[u]) {
          if (hierDist[s * nB + v] === 255) { hierDist[s * nB + v] = hierDist[s * nB + u] + 1; q.push(v); }
        }
      }
    }
    const FAR = 3; // parent/child=1, joint-with-intermediate=2 are legit seams

    // ---- far seam edges (endpoints on hierarchy-DISTANT dominant bones) ----
    const seam = [];
    const seen = new Set();
    const addEdge = (a, b) => {
      if (domBone[a] === domBone[b]) return;
      if (hierDist[domBone[a] * nB + domBone[b]] < FAR) return;
      const key = a < b ? a * 4e6 + b : b * 4e6 + a;
      if (seen.has(key)) return;
      seen.add(key);
      seam.push(a, b);
    };
    if (idx) {
      for (let k = 0; k < idx.count; k += 3) {
        const a = idx.getX(k), b = idx.getX(k + 1), c = idx.getX(k + 2);
        addEdge(a, b); addEdge(a, c); addEdge(b, c);
      }
    }
    const nE = seam.length / 2;
    if (!nE) return { error: 'no seam edges' };

    // ---- skinned positions of the seam verts in the CURRENT pose ----
    // headless: the renderer isn't ticking, so bone matrixWorlds and the
    // skeleton's boneMatrices must be refreshed by hand from the scene root
    const va = new V3(), vb = new V3();
    const lengths = (out) => {
      t.engine.scene.updateMatrixWorld(true);
      mesh.skeleton.update();
      for (let e = 0; e < nE; e++) {
        mesh.getVertexPosition(seam[e * 2], va);
        mesh.getVertexPosition(seam[e * 2 + 1], vb);
        out[e] = va.distanceTo(vb);
      }
    };
    const bind = new Float32Array(nE);
    lengths(bind);

    // ---- pose sweep: bend every substantial bone, track max elongation ----
    const ownedTotal = new Map();
    for (const c of comps) ownedTotal.set(c.boneIndex, (ownedTotal.get(c.boneIndex) || 0) + c.count);
    const testBones = bones.map((b, i) => ({ b, i })).filter(({ b }) => mappedNames.has(b.name));
    const maxRatio = new Float32Array(nE);
    const cur = new Float32Array(nE);
    const Q = mesh.quaternion.constructor;
    const E = new (Object.getPrototypeOf(mesh.rotation).constructor)();
    for (const { b } of testBones) {
      const orig = b.quaternion.clone();
      for (const [ax, ay, az] of [[0.9, 0, 0], [-0.9, 0, 0], [0, 0, 0.9]]) {
        b.quaternion.copy(orig).multiply(new Q().setFromEuler(E.set(ax, ay, az)));
        lengths(cur);
        for (let e = 0; e < nE; e++) {
          const r = cur[e] / Math.max(1e-6, bind[e]);
          if (r > maxRatio[e]) maxRatio[e] = r;
        }
      }
      b.quaternion.copy(orig);
    }
    mesh.updateMatrixWorld(true);

    // ---- attribute flags to islands, majority-vote the fix ----
    const perIsland = new Map(); // islandId -> {flags, votes: Map(boneName->n), maxR}
    for (let e = 0; e < nE; e++) {
      if (maxRatio[e] < STRETCH_R) continue;
      const a = seam[e * 2], b = seam[e * 2 + 1];
      for (const [self, other] of [[a, b], [b, a]]) {
        const ci = compId[self];
        let rec = perIsland.get(ci);
        if (!rec) { rec = { flags: 0, votes: new Map(), maxR: 0 }; perIsland.set(ci, rec); }
        rec.flags++;
        rec.maxR = Math.max(rec.maxR, maxRatio[e]);
        const otherBone = bones[domBone[other]]?.name;
        rec.votes.set(otherBone, (rec.votes.get(otherBone) || 0) + 1);
      }
    }
    const rows = [];
    for (const [ci, rec] of perIsland) {
      if (rec.flags < 3) continue; // isolated seam blips
      const c = comps[ci];
      let top = null, topN = 0, tot = 0;
      for (const [bn, n] of rec.votes) { tot += n; if (n > topN) { topN = n; top = bn; } }
      const ownerTotal = ownedTotal.get(c.boneIndex) || c.count;
      rows.push({
        island: ci, bone: c.boneName, count: c.count,
        flaggedEdges: rec.flags, maxR: +rec.maxR.toFixed(1),
        suggestTo: top, voteShare: +(topN / tot).toFixed(2),
        smallShare: +(c.count / ownerTotal).toFixed(2),
        centroid: c.centroid.map((v) => +v.toFixed(2)),
        ownerMapped: mappedNames.has(c.boneName),
        toMapped: mappedNames.has(top),
      });
    }
    rows.sort((x, y) => y.flaggedEdges - x.flaggedEdges);
    return { seamEdges: nE, testedBones: testBones.length, rows };
  }, { STRETCH_R, id });

  if (report.error) { console.log(`${id}: ERROR ${report.error}`); continue; }
  // auto-fixable: (a) small fragment with a clear majority target, or
  // (b) island owned by an UNMAPPED bone voting for a MAPPED one — unmapped
  // bones never animate, so their geometry freezes mid-air when the mapped
  // limb moves; riding the mapped bone is strictly better whatever its size.
  allRows[id] = report.rows;
  const auto = report.rows.filter((r) =>
    (r.voteShare >= 0.6 && r.smallShare <= 0.4) ||
    (!r.ownerMapped && r.toMapped && r.voteShare >= 0.6));
  console.log(`${id}: ${report.seamEdges} seam edges, ${report.testedBones} bones swept, ${report.rows.length} flagged islands (${auto.length} auto-suggestable)`);
  for (const r of report.rows.slice(0, 10)) {
    const tag = auto.includes(r) ? 'AUTO' : 'review';
    console.log(`   [${tag}] #${r.island} ${r.bone} n=${r.count} edges=${r.flaggedEdges} maxR=${r.maxR} -> ${r.suggestTo} (vote ${r.voteShare}, share ${r.smallShare}) ctr=[${r.centroid}]`);
  }
  if (auto.length) {
    allSuggestions[id] = { skinOps: auto.map((r) => ({ sel: { comp: r.island }, to: r.suggestTo })) };
  }
}
if (Object.keys(allSuggestions).length) {
  console.log('\n===== paste-ready suggestions =====');
  console.log(JSON.stringify(allSuggestions, null, 1));
}
// full structured dump for downstream filtering (env STRETCH_JSON=path)
if (process.env.STRETCH_JSON) {
  const fs = await import('fs');
  fs.writeFileSync(process.env.STRETCH_JSON, JSON.stringify(allRows, null, 1));
  console.log('rows written to', process.env.STRETCH_JSON);
}
await browser.close();
