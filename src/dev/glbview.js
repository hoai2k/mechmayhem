// Raw GLB inspector: view a manifest model with NO rig, NO retargeting and
// neutral lighting, to judge how the file itself is authored (which way it
// faces, bind stance, texture). The red pillar marks +Z — the direction the
// game considers "forward"; if the model's face isn't looking at it, set
// yawOffset in the manifest.
//   ?glbview=<mechId>[&yaw=<deg>]   — yaw spins the model for side/back views
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Engine } from '../core/engine.js';

export async function runGlbView(id) {
  const engine = new Engine(document.getElementById('game-canvas'));
  const { scene, camera } = engine;
  const params = new URLSearchParams(location.search);
  const yaw = (parseFloat(params.get('yaw')) || 0) * Math.PI / 180;

  scene.background = new THREE.Color(0x30343e);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x565c66, 2.2));
  const dir = new THREE.DirectionalLight(0xffffff, 2.4);
  dir.position.set(5, 9, 7);
  scene.add(dir);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // +Z marker: the game's forward direction
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 0.7 })
  );
  marker.position.set(0, 1.5, 7);
  scene.add(marker);

  const manifest = await fetch(new URL('models/manifest.json', document.baseURI)).then((r) => r.json());
  const entry = manifest[id];
  if (!entry?.url) { document.title = `no manifest entry for ${id}`; return engine; }
  const gltf = await new Promise((res, rej) =>
    new GLTFLoader().load(new URL(entry.url, document.baseURI).href, res, undefined, rej));
  const model = gltf.scene;
  // normalize to a 7-unit character so any model fills the frame the same way
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(7 / Math.max(size.y, 0.01));
  box.setFromObject(model);
  model.position.y -= box.min.y;
  const c = box.getCenter(new THREE.Vector3());
  model.position.x -= c.x;
  model.position.z -= c.z;
  const spin = new THREE.Group();
  spin.add(model);
  spin.rotation.y = yaw;
  scene.add(spin);

  camera.position.set(0, 4.6, 13);
  camera.lookAt(0, 3.4, 0);
  engine.onUpdate = () => {};
  engine.start();
  return engine;
}
