// export-art — canonical reference images for each exported mech.
//
//   node tools/export-art.mjs [--out public/models/export] [--size 900] [<id> …]
//
// Renders the EXPORTED .glb — not the game's build — with a plain three scene
// and a bare GLTFLoader, so what you are looking at is exactly what another
// engine gets. Four views per mech into `art/<id>/`:
//
//   turnaround-front / -side / -back / -quarter   at the rest pose
//   pose-<clip>                                    one frame of a named clip
//
// The badge, poster and thumbnail come from tools/export-chars.mjs; these are
// the ones that could not exist before, because the model had no self-contained
// form to photograph.
import { launch } from './lib/browser.mjs';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || '5175';
const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const OUT = path.resolve(ROOT, flag('out', 'public/models/export'));
const SIZE = +flag('size', 900);
let ids = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!ids.length) {
  ids = fs.readdirSync(OUT).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')).sort();
}
if (!ids.length) { console.error('nothing to shoot — run tools/export-mech.mjs first'); process.exit(1); }

// azimuth in degrees around +z (the model's forward), elevation as a fraction
// of its height. `quarter` is the three-quarter hero angle a card wants.
const VIEWS = [
  ['front', 0, 0.55], ['quarter', 35, 0.60], ['side', 90, 0.55], ['back', 180, 0.55],
];
// one action frame per mech, in preference order — whichever it actually has
const ACTION = ['taunt', 'heavy', 'light1', 'block', 'run'];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

for (const id of ids) {
  const dir = path.join(OUT, 'art', id);
  fs.mkdirSync(dir, { recursive: true });
  const info = await page.evaluate(async ({ id, SIZE, VIEWS, ACTION }) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    document.body.style.margin = '0';
    document.body.innerHTML = '';
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    r.setSize(SIZE, SIZE);
    r.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(r.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d26);
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x35323c, 2.0));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(5, 9, 7); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88bbff, 1.1); rim.position.set(-6, 4, -6); scene.add(rim);
    const g = await new Promise((ok, no) => new GLTFLoader().load(`/models/export/${id}.glb`, ok, undefined, no));
    scene.add(g.scene);
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.y * 8, size.y * 8),
      new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
    const reach = Math.max(size.x, size.y, size.z) * 2.3;
    window.__shoot = (az, el) => {
      const a = az * Math.PI / 180;
      cam.position.set(ctr.x + Math.sin(a) * reach, size.y * el + box.min.y, ctr.z + Math.cos(a) * reach);
      cam.lookAt(ctr.x, size.y * 0.5 + box.min.y, ctr.z);
      r.render(scene, cam);
    };
    const names = g.animations.map((c) => c.name);
    const pick = ACTION.find((n) => names.includes(n)) || null;
    window.__pose = (name, at) => {
      const c = g.animations.find((x) => x.name === name);
      if (!c) return false;
      const m = new THREE.AnimationMixer(g.scene);
      m.clipAction(c).play(); m.setTime(c.duration * at);
      g.scene.updateMatrixWorld(true);
      return true;
    };
    return { pick, clips: names.length,
      size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)] };
  }, { id, SIZE, VIEWS, ACTION });

  for (const [name, az, el] of VIEWS) {
    await page.evaluate(([a, e]) => window.__shoot(a, e), [az, el]);
    await page.screenshot({ path: path.join(dir, `turnaround-${name}.png`) });
  }
  if (info.pick) {
    await page.evaluate(([n]) => window.__pose(n, 0.5), [info.pick]);
    await page.evaluate(([a, e]) => window.__shoot(a, e), [35, 0.6]);
    await page.screenshot({ path: path.join(dir, `pose-${info.pick}.png`) });
  }
  console.log(`${id.padEnd(10)} ${info.size.join(' x ').padEnd(22)} `
    + `4 views${info.pick ? ` + pose-${info.pick}` : ''} -> art/${id}/`);
}
await browser.close();
if (errs.length) console.log('page errors:', errs.slice(0, 3));
console.log(`\n${ids.length} mechs photographed into ${path.relative(ROOT, OUT)}/art/`);
