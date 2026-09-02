// exportshot — render an exported glb with a PLAIN three scene, nothing of the
// game in it, so the picture is what another engine would draw.
//   node tools/scratch/exportshot.mjs <mech> [clip] [t]
import { launch } from '../lib/browser.mjs';

const PORT = process.env.PORT || '5175';
const id = process.argv[2] || 'saurion';
const clip = process.argv[3] || null;
const at = Number(process.argv[4] || 0.5);
const OUT = `/tmp/claude-0/-home-user-mechmayhem/27a6bc4b-932a-5b1a-a1d9-b717cc420b05/scratchpad/export-${id}${clip ? '-' + clip : ''}.png`;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
page.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

const info = await page.evaluate(async ({ id, clip, at }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  document.body.innerHTML = '';
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setSize(640, 640); document.body.appendChild(r.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202430);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 2.0); d.position.set(4, 8, 6); scene.add(d);
  const g = await new Promise((ok, no) => new GLTFLoader().load(`/models/export/${id}.glb`, ok, undefined, no));
  scene.add(g.scene);
  let played = null;
  if (clip) {
    const c = g.animations.find((a) => a.name === clip);
    if (c) { const m = new THREE.AnimationMixer(g.scene); m.clipAction(c).play(); m.setTime(c.duration * at); played = c.name; }
  }
  g.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g.scene);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  const dist = Math.max(size.x, size.y, size.z) * 2.0;
  cam.position.set(ctr.x + dist * 0.75, ctr.y + size.y * 0.25, ctr.z + dist * 0.85);
  cam.lookAt(ctr);
  // ground plane so a float or a sink is obvious
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(size.y * 6, size.y * 6),
    new THREE.MeshStandardMaterial({ color: 0x585e70 }));
  gp.rotation.x = -Math.PI / 2; scene.add(gp);
  r.render(scene, cam);
  return { clips: g.animations.length, played, size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)], minY: +box.min.y.toFixed(3) };
}, { id, clip, at });

await page.screenshot({ path: OUT });
console.log(id, JSON.stringify(info), '->', OUT);
await browser.close();
