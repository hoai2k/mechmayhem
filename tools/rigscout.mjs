// rigscout: orthographic contact sheets of a GLB's raw (bind-space) mesh, in
// MESH-LOCAL coordinates — the space a custom rig is authored in
// (src/mechs/rigs/<id>.rig.js). Each geometry island gets its own color and a
// numbered badge at its centroid, and a 0.1-unit ruler grid is drawn behind
// the model, so you can read a bone position straight off the picture instead
// of guessing from a table of centroids.
//
// Optionally overlays a rig: pass `rig` to draw the registered rig's bones as
// magenta dots + labels on top of the same views, which is how you check a
// hand-placed skeleton actually lands inside the shells it should drive.
//
//   node tools/rigscout.mjs <mechId> [outPrefix] [flags]
// flags: --alt              inspect the manifest `alt` entry instead
//        --rig              overlay the registered custom rig's bones
//        --skin             color by OWNING RIG BONE instead of by island —
//                           the headless twin of ?rigedit's color view, and
//                           the check that a hand-placed bone actually claims
//                           the shell it was placed inside (implies --rig)
//        --only=3,25        dim every island except these (isolate a part)
//        --focus=x,y,z:size zoom the ortho views on a point (mesh-local)
// e.g. node tools/rigscout.mjs wraith /tmp/wraith
//      node tools/rigscout.mjs wraith /tmp/wr_gun --only=3,25 --focus=0.05,0.4,0.25:0.2
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const [id, prefix = `/tmp/rigscout_${argv[0]}`] = argv.filter((a) => !a.startsWith('--'));
const flag = (name) => flags.find((f) => f === `--${name}` || f.startsWith(`--${name}=`));
const alt = !!flag('alt');
const skinMode = !!flag('skin');
const withRig = !!flag('rig') || skinMode;
const only = flag('only') ? flag('only').split('=')[1].split(',').map(Number) : null;
const focusArg = flag('focus') ? flag('focus').split('=')[1] : null;
const focus = focusArg
  ? { c: focusArg.split(':')[0].split(',').map(Number), size: +(focusArg.split(':')[1] || 0.25) }
  : null;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?rigtest', { waitUntil: 'networkidle' });

const info = await page.evaluate(async ({ id, alt, withRig, skinMode, only, focus }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { loadRawGlbScene } = await import('/src/mechs/gltf.js');
  const { analyzeSkin } = await import('/src/mechs/skinops.js');
  const { rigFor } = await import('/src/mechs/rigs/index.js');

  const raw = await loadRawGlbScene(id, { alt });
  if (!raw) return { error: `no GLB for ${id}${alt ? ' (alt)' : ''}` };
  let src = null;
  raw.scene.traverse((o) => { if (o.isSkinnedMesh && !src) src = o; });
  if (!src) return { error: 'no skinned mesh' };

  const a = analyzeSkin(src);
  const geo = src.geometry.clone();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const comps = a.comps.filter((c) => c.count >= 150);
  const badges = [];
  const hsl = new THREE.Color();
  comps.forEach((c, i) => {
    const dim = only && !only.includes(c.id);
    hsl.setHSL((i * 0.137) % 1, dim ? 0.0 : 0.75, dim ? 0.16 : 0.55);
    let sx = 0, sy = 0, sz = 0;
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    for (const v of c.verts) {
      colors[v * 3] = hsl.r; colors[v * 3 + 1] = hsl.g; colors[v * 3 + 2] = hsl.b;
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      sx += x; sy += y; sz += z;
      mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z);
      mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z);
    }
    const n = c.verts.length;
    badges.push({
      id: c.id, n: c.count, bone: c.boneName,
      c: [sx / n, sy / n, sz / n],
      min: [mnx, mny, mnz], max: [mxx, mxy, mxz],
      col: `#${hsl.getHexString()}`,
    });
  });
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // --skin: repaint every vertex by the rig bone that would own it, using the
  // SAME assignment the runtime re-skin makes (reskin.computeWeights).
  const rigData = withRig ? rigFor(id) : null;
  const boneShare = [];
  if (skinMode) {
    if (!rigData) return { error: `no custom rig registered for ${id}` };
    const { computeWeights } = await import('/src/mechs/reskin.js');
    const { skinIndex } = computeWeights({ geometry: geo }, rigData);
    const counts = new Array(rigData.bones.length).fill(0);
    for (let i = 0; i < pos.count; i++) {
      const b = skinIndex[i * 4];
      counts[b]++;
      hsl.setHSL((b * 0.183) % 1, b % 2 ? 0.85 : 0.5, b % 3 ? 0.55 : 0.72);
      colors[i * 3] = hsl.r; colors[i * 3 + 1] = hsl.g; colors[i * 3 + 2] = hsl.b;
    }
    geo.attributes.color.needsUpdate = true;
    rigData.bones.forEach((b, i) => boneShare.push({ name: b.name, verts: counts[i] }));
    badges.length = 0;   // island badges would only clutter the skin view
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11151c);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5b6270, 2.4));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(4, 8, 6); scene.add(dl);
  const model = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0.0, flatShading: false,
  }));
  scene.add(model);

  // 0.1-unit ruler cage around the model's bounds
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const gridMat = new THREE.LineBasicMaterial({ color: 0x2d3b52 });
  const pts = [];
  const lo = (v) => Math.floor(v * 10) / 10, hi = (v) => Math.ceil(v * 10) / 10;
  for (let y = lo(bb.min.y); y <= hi(bb.max.y) + 1e-6; y += 0.1) {
    pts.push(lo(bb.min.x), y, lo(bb.min.z), lo(bb.min.x), y, hi(bb.max.z));
    pts.push(lo(bb.min.x), y, lo(bb.min.z), hi(bb.max.x), y, lo(bb.min.z));
  }
  for (let z = lo(bb.min.z); z <= hi(bb.max.z) + 1e-6; z += 0.1) {
    pts.push(lo(bb.min.x), lo(bb.min.y), z, lo(bb.min.x), hi(bb.max.y), z);
  }
  for (let x = lo(bb.min.x); x <= hi(bb.max.x) + 1e-6; x += 0.1) {
    pts.push(x, lo(bb.min.y), lo(bb.min.z), x, hi(bb.max.y), lo(bb.min.z));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  scene.add(new THREE.LineSegments(g, gridMat));

  // rig overlay (magenta dots + bone-to-parent lines)
  const rig = rigData;
  const rigPts = [];
  if (rig) {
    const byName = Object.fromEntries(rig.bones.map((b) => [b.name, b]));
    const lp = [];
    for (const b of rig.bones) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2bd0, depthTest: false }));
      dot.position.set(...b.pos); dot.renderOrder = 999; scene.add(dot);
      rigPts.push({ name: b.name, pos: b.pos });
      const p = byName[b.parent];
      if (p) lp.push(...b.pos, ...p.pos);
    }
    if (lp.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
      const lm = new THREE.LineBasicMaterial({ color: 0xff2bd0, depthTest: false });
      const ls = new THREE.LineSegments(lg, lm); ls.renderOrder = 998; scene.add(ls);
    }
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(900, 900);
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '500' });
  document.body.appendChild(canvas);

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:501;pointer-events:none;'
    + 'font:11px/1.1 ui-monospace,monospace';
  document.body.appendChild(overlay);

  const size = focus ? focus.size
    : Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * 0.62;
  const center = focus ? new THREE.Vector3(...focus.c) : bb.getCenter(new THREE.Vector3());
  const cam = new THREE.OrthographicCamera(-size, size, size, -size, 0.01, 100);

  window.__scoutViews = {};
  window.__scoutShow = (dir) => {
    const eye = { front: [3, 0, 0], back: [-3, 0, 0], left: [0, 0, 3], right: [0, 0, -3], top: [0, 3, 0] }[dir];
    cam.position.set(center.x + eye[0], center.y + eye[1], center.z + eye[2]);
    cam.up.set(0, dir === 'top' ? 0 : 1, dir === 'top' ? -1 : 0);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    overlay.innerHTML = '';
    const label = (text, world, color, weight) => {
      const v = world.clone().project(cam);
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = `position:absolute;left:${(v.x * 0.5 + 0.5) * 900}px;`
        + `top:${(-v.y * 0.5 + 0.5) * 900}px;color:${color};transform:translate(-50%,-50%);`
        + `text-shadow:0 0 3px #000,0 0 3px #000;font-weight:${weight}`;
      overlay.appendChild(el);
    };
    for (const b of badges) {
      if (only && !only.includes(b.id)) continue;
      label(String(b.id), new THREE.Vector3(...b.c), b.col, 700);
    }
    for (const r of rigPts) label(r.name, new THREE.Vector3(...r.pos), '#ff8ae6', 600);
    // axis ruler ticks along the frame
    const head = document.createElement('div');
    head.style.cssText = 'position:absolute;left:8px;top:6px;color:#9fb4d0;font:13px ui-monospace';
    head.textContent = `${dir}  |  x ${bb.min.x.toFixed(2)}..${bb.max.x.toFixed(2)}  `
      + `y ${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)}  z ${bb.min.z.toFixed(2)}..${bb.max.z.toFixed(2)}`
      + '   (grid 0.1)';
    overlay.appendChild(head);
  };
  return {
    boneShare,
    badges: badges.map((b) => ({
      id: b.id, n: b.n, bone: b.bone,
      c: b.c.map((v) => +v.toFixed(3)),
      min: b.min.map((v) => +v.toFixed(3)),
      max: b.max.map((v) => +v.toFixed(3)),
    })),
    bbox: { min: bb.min.toArray().map((v) => +v.toFixed(3)), max: bb.max.toArray().map((v) => +v.toFixed(3)) },
  };
}, { id, alt, withRig, skinMode, only, focus });

if (info.error) { console.error(info.error); await browser.close(); process.exit(1); }

for (const dir of ['front', 'back', 'left', 'right', 'top']) {
  await page.evaluate((d) => window.__scoutShow(d), dir);
  await page.screenshot({ path: `${prefix}_${dir}.png` });
}
console.log(`bbox  min ${JSON.stringify(info.bbox.min)}  max ${JSON.stringify(info.bbox.max)}`);
if (info.boneShare?.length) {
  // a bone with 0 verts owns nothing — either dead weight or, worse, a limb
  // whose shell was captured by a neighbour
  console.log('rig bone'.padEnd(12), 'verts');
  for (const b of info.boneShare) console.log(b.name.padEnd(12), String(b.verts).padStart(7));
} else {
  console.log('id'.padStart(4), 'n'.padStart(6), 'bone'.padEnd(20), 'centroid'.padEnd(24), 'min'.padEnd(24), 'max');
  for (const b of info.badges) {
    console.log(String(b.id).padStart(4), String(b.n).padStart(6), String(b.bone).padEnd(20),
      JSON.stringify(b.c).padEnd(24), JSON.stringify(b.min).padEnd(24), JSON.stringify(b.max));
  }
}
console.log(`wrote ${prefix}_{front,back,left,right,top}.png`);
await browser.close();
