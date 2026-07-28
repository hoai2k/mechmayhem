// Chunk-based destructible buildings + instanced debris simulation.
// Buildings are hollow shells of box chunks in a global InstancedMesh;
// destroyed chunks turn into ballistic debris instances, unsupported
// chunks cascade-collapse.
import * as THREE from 'three';
import { rand, makeRng } from '../core/utils.js';

// segment vs AABB (slab method), with padding and an optional XZ offset so
// the same box can be tested at each of its wrap-ghost positions
function segmentHitsAabb(from, to, a, pad = 0, ox = 0, oz = 0) {
  let tMin = 0, tMax = 1;
  const lo = [a.minX - pad + ox, a.minY - pad, a.minZ - pad + oz];
  const hi = [a.maxX + pad + ox, a.maxY + pad, a.maxZ + pad + oz];
  const f = [from.x, from.y, from.z];
  const d = [to.x - from.x, to.y - from.y, to.z - from.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (f[i] < lo[i] || f[i] > hi[i]) return false;
    } else {
      let t1 = (lo[i] - f[i]) / d[i];
      let t2 = (hi[i] - f[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }
  return true;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export class DestructibleSystem {
  constructor(scene, material, capacity = 2200) {
    this.scene = scene;
    this.capacity = capacity;      // per-cell chunk budget
    // toroidal arenas: every chunk gets 8 ghost copies in the neighbor
    // cells (index blocks of `capacity`), so the city is visible across
    // the wrap seam. Ghosts activate when setWrapPeriod() is called.
    this.totalCap = capacity * 9;
    this.wrapPeriod = 0;
    this.ghostOffsets = [];

    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, material, this.totalCap);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    _m.compose(_p.set(0, -500, 0), _q.identity(), _s.set(0.0001, 0.0001, 0.0001));
    for (let i = 0; i < this.totalCap; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.count = this.totalCap;
    scene.add(this.mesh);

    this.chunks = [];      // {x,y,z (center), w,h,d, alive, bIdx, gx,gy,gz, hp}
    this.buildings = [];   // {gridIndex Map "gx,gy,gz"->chunk, aabb, chunkCount}
    this.count = 0;

    // debris ring buffer
    const DEB = 340;
    this.debris = {
      mesh: new THREE.InstancedMesh(geo, (Array.isArray(material) ? material[0] : material).clone(), DEB),
      pos: new Float32Array(DEB * 3),
      vel: new Float32Array(DEB * 3),
      rot: new Float32Array(DEB * 3),
      rotVel: new Float32Array(DEB * 3),
      scale: new Float32Array(DEB * 3),
      life: new Float32Array(DEB),
      head: 0,
      cap: DEB,
    };
    this.debris.mesh.castShadow = true;
    this.debris.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.mesh.frustumCulled = false;
    scene.add(this.debris.mesh);
    for (let i = 0; i < DEB; i++) {
      _m.compose(_p.set(0, -100, 0), _q.identity(), _s.set(0.001, 0.001, 0.001));
      this.debris.mesh.setMatrixAt(i, _m);
    }
    this.pendingCollapse = []; // {chunk, t}
    this.world = null;

    // ---- rubble: full-size falling blocks a collapsing building drops.
    // Unlike the small fading debris, these tumble down, SETTLE on the
    // ground, and stay as solid boxes fighters push against and stand on.
    const RUB = 200;
    this.rubble = {
      mesh: new THREE.InstancedMesh(geo, (Array.isArray(material) ? material[0] : material).clone(), RUB),
      items: [],           // {px,py,pz, vx,vy,vz, rx,ry,rz, avx,avy,avz, w,h,d, settled, life, i}
      head: 0,
      cap: RUB,
    };
    this.rubble.mesh.castShadow = true;
    this.rubble.mesh.receiveShadow = true;
    this.rubble.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rubble.mesh.frustumCulled = false;
    scene.add(this.rubble.mesh);
    for (let i = 0; i < RUB; i++) {
      _m.compose(_p.set(0, -200, 0), _q.identity(), _s.set(0.0001, 0.0001, 0.0001));
      this.rubble.mesh.setMatrixAt(i, _m);
    }

    // ---- camera see-through: per-instance dither fade ----
    // buildings between a follow-cam and its mech ghost to ~25% coverage so
    // the player never loses their mech behind cover. Dithered discard (no
    // alpha blending) keeps instancing + depth simple.
    // NOTE: patched AFTER the debris material clone so debris stays solid.
    this.fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.totalCap).fill(1), 1);
    this.mesh.geometry.setAttribute('aFade', this.fadeAttr);
    const mats = Array.isArray(material) ? [...new Set(material)] : [material];
    for (const mat of mats) {
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vFade;')
          .replace('#include <clipping_planes_fragment>', `
    if (vFade < 0.999) {
      float dgd = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
      if (dgd > vFade) discard;
    }
    #include <clipping_planes_fragment>`);
      };
    }
  }

  // Activate ghost tiling for a toroidal arena of the given period.
  setWrapPeriod(P) {
    this.wrapPeriod = P;
    this.ghostOffsets = [];
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        if (gx || gz) this.ghostOffsets.push([gx * P, gz * P]);
      }
    }
    for (const c of this.chunks) {
      if (c.alive) this.writeChunk(c);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // write a chunk's matrix (and its 8 ghost copies)
  writeChunk(chunk) {
    _m.compose(
      _p.set(chunk.x, chunk.y, chunk.z), _q.identity(),
      _s.set(chunk.w * 1.001, chunk.h * 1.001, chunk.d * 1.001)
    );
    this.mesh.setMatrixAt(chunk.i, _m);
    for (let g = 0; g < this.ghostOffsets.length; g++) {
      _m.compose(
        _p.set(chunk.x + this.ghostOffsets[g][0], chunk.y, chunk.z + this.ghostOffsets[g][1]),
        _q.identity(),
        _s.set(chunk.w * 1.001, chunk.h * 1.001, chunk.d * 1.001)
      );
      this.mesh.setMatrixAt(this.capacity * (g + 1) + chunk.i, _m);
    }
  }

  // Fades are PER-VIEW: each viewport only ghosts the buildings hiding ITS
  // OWN player character. Targets/eased values live per (view, copy); the
  // shared fade attribute is (re)stamped right before each view renders.
  applyViewFade(cam) {
    const v = this._viewSegs ? this._viewSegs.findIndex((s) => s.cam === cam) : -1;
    const nCopies = 1 + this.ghostOffsets.length;
    let touched = false;
    for (const b of this.buildings) {
      if (!b._everFaded) continue; // never faded for anyone: attr already 1
      touched = true;
      for (let g = 0; g < nCopies; g++) {
        const val = v >= 0 && b.fadeV ? b.fadeV[v * 9 + g] : 1;
        for (const chunk of b.grid.values()) {
          if (!chunk.alive) continue;
          this.fadeAttr.array[this.capacity * g + chunk.i] = val;
        }
      }
    }
    if (touched) this.fadeAttr.needsUpdate = true;
  }

  hideChunk(chunk) {
    _m.compose(_p.set(0, -500, 0), _q.identity(), _s.set(0.0001, 0.0001, 0.0001));
    this.mesh.setMatrixAt(chunk.i, _m);
    for (let g = 0; g < 8; g++) {
      this.mesh.setMatrixAt(this.capacity * (g + 1) + chunk.i, _m);
    }
  }

  // Register this frame's camera->own-player occlusion probes, one per VIEW.
  // Each entry carries `cam` (the camera that renders that view) and a set
  // of `targets` — sample points spread across the player's WHOLE body
  // (head, feet, both flanks). A building copy only fades when it blocks
  // EVERY sample: standing next to it, or clipping one shoulder behind a
  // corner, keeps it solid. Fades ease per (view, tiled copy) and are
  // stamped per view in applyViewFade.
  // segments: [{from: Vector3, targets: [Vector3...], cam}], per frame.
  setOccluders(segments) {
    this._viewSegs = segments;
    const nCopies = 1 + this.ghostOffsets.length;
    for (const b of this.buildings) {
      if (!b.fadeV) {
        b.fadeV = new Float32Array(4 * 9).fill(1);       // eased, per view+copy
        b.fadeTargetV = new Float32Array(4 * 9).fill(1); // targets
      }
      const a = b.aabb;
      for (let v = 0; v < 4; v++) {
        const s = segments[v];
        for (let g = 0; g < nCopies; g++) {
          let hit = false;
          if (s && b.alive > 0) {
            const ox = g === 0 ? 0 : this.ghostOffsets[g - 1][0];
            const oz = g === 0 ? 0 : this.ghostOffsets[g - 1][1];
            const pts = s.targets || [s.to];
            hit = true;
            for (const pt of pts) {
              if (!segmentHitsAabb(s.from, pt, a, 0.3, ox, oz)) { hit = false; break; }
            }
          }
          b.fadeTargetV[v * 9 + g] = hit ? 0.15 : 1;
          if (hit) b._everFaded = true;
        }
      }
    }
  }

  // Build a hollow tower of chunks. Returns building record.
  addBuilding(cx, cz, nx, ny, nz, cw, ch, cd, { tint = 0xffffff, rng = null } = {}) {
    const cells = [];
    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        for (let gz = 0; gz < nz; gz++) {
          // hollow: only shell chunks
          const isShell = gx === 0 || gx === nx - 1 || gz === 0 || gz === nz - 1 || gy === ny - 1;
          if (isShell) cells.push({ gx, gy, gz });
        }
      }
    }
    return this.addBuildingCells(cx, cz, cells, cw, ch, cd, { tint, rng });
  }

  // Build a building from an EXPLICIT occupancy-cell list — the massing
  // generator's silhouettes (setback towers, ziggurats, warehouses) and the
  // voxelized GLB donors both land here. Cells are {gx,gy,gz, tint?} with
  // gy=0 on the ground; grid coordinates may be any integers (the building
  // is centered on the cells' XZ bounding box). Support cascade, collapse,
  // collision, occlusion fade — everything downstream reads the grid map,
  // so an arbitrary silhouette is exactly as destructible as a box tower.
  // A cell's own `tint` (from a voxelized donor's sampled texture, or a
  // massing accent band) overrides the building tint.
  addBuildingCells(cx, cz, cells, cw, ch, cd, { tint = 0xffffff, rng = null } = {}) {
    rng = rng || makeRng((cx * 13 + cz * 7) | 0);
    const b = { grid: new Map(), chunkCount: 0, aabb: null, alive: 0 };
    if (!cells.length) return b;
    let minGx = Infinity, maxGx = -Infinity, minGz = Infinity, maxGz = -Infinity, maxGy = 0;
    for (const c of cells) {
      minGx = Math.min(minGx, c.gx); maxGx = Math.max(maxGx, c.gx);
      minGz = Math.min(minGz, c.gz); maxGz = Math.max(maxGz, c.gz);
      maxGy = Math.max(maxGy, c.gy);
    }
    const x0 = cx - ((maxGx - minGx + 1) * cw) / 2 - minGx * cw;
    const z0 = cz - ((maxGz - minGz + 1) * cd) / 2 - minGz * cd;
    for (const cell of cells) {
      if (this.count >= this.capacity) {
        if (!this._capWarned) {
          this._capWarned = true;
          console.warn(`DestructibleSystem: chunk capacity ${this.capacity} reached — later buildings are truncated`);
        }
        continue;
      }
      const { gx, gy, gz } = cell;
      if (b.grid.has(`${gx},${gy},${gz}`)) continue;
      const i = this.count++;
      const chunk = {
        i,
        x: x0 + (gx + 0.5) * cw,
        y: (gy + 0.5) * ch,
        z: z0 + (gz + 0.5) * cd,
        w: cw, h: ch, d: cd,
        gx, gy, gz,
        alive: true,
        hp: 30 + rng() * 25,
        b,
      };
      this.chunks.push(chunk);
      b.grid.set(`${gx},${gy},${gz}`, chunk);
      b.chunkCount++;
      b.alive++;
      // slight per-chunk color variance (ghost copies match)
      const v = 1.25 + rng() * 0.3;
      _c.set(cell.tint ?? tint).multiplyScalar(v);
      this.mesh.setColorAt(i, _c);
      for (let g = 1; g <= 8; g++) this.mesh.setColorAt(this.capacity * g + i, _c);
      this.writeChunk(chunk);
    }
    b.aabb = {
      minX: x0 + minGx * cw - 0.5, maxX: x0 + (maxGx + 1) * cw + 0.5,
      minY: 0, maxY: (maxGy + 1) * ch + 0.5,
      minZ: z0 + minGz * cd - 0.5, maxZ: z0 + (maxGz + 1) * cd + 0.5,
    };
    this.buildings.push(b);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return b;
  }

  killChunk(chunk, vel = null, silent = false, asRubble = false) {
    if (!chunk.alive) return;
    chunk.alive = false;
    chunk.b.alive--;
    // capture the impulse BEFORE hideChunk — vel may alias the shared _p temp
    // that hideChunk clobbers to (0,-500,0)
    const vx = vel ? vel.x : 0, vy = vel ? vel.y : 0, vz = vel ? vel.z : 0;
    this.hideChunk(chunk);
    this.mesh.instanceMatrix.needsUpdate = true;

    if (asRubble) {
      // a collapsing chunk falls as a real full-size block that settles into
      // solid, standable rubble (plus a little dust)
      this.spawnRubble(
        chunk.x, chunk.y, chunk.z,
        chunk.w, chunk.h, chunk.d,
        rand(-2, 2), vy + rand(-1, 1), rand(-2, 2),
        this.chunkColor(chunk)
      );
    } else {
      // spawn 1-2 debris pieces
      const n = silent ? 1 : 2;
      for (let k = 0; k < n; k++) {
        this.spawnDebris(
          chunk.x + rand(-0.3, 0.3), chunk.y + rand(-0.3, 0.3), chunk.z + rand(-0.3, 0.3),
          (vel ? vx * rand(3, 7) : rand(-4, 4)) + rand(-2, 2),
          (vel ? vy * rand(2, 5) : 0) + rand(1, 6),
          (vel ? vz * rand(3, 7) : rand(-4, 4)) + rand(-2, 2),
          chunk.w * rand(0.3, 0.55), chunk.h * rand(0.3, 0.55), chunk.d * rand(0.3, 0.55)
        );
      }
    }
    if (!silent && this.world) {
      this.world.effects.dustPuff(_p.set(chunk.x, chunk.y, chunk.z), 3, 0x9a9284);
    }

    // unsupported chunks above (this one may have been their diagonal
    // support too) will fall shortly
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const above = chunk.b.grid.get(`${chunk.gx + dx},${chunk.gy + 1},${chunk.gz + dz}`);
      if (above && above.alive && !this.hasSupport(above)) {
        this.pendingCollapse.push({ chunk: above, t: rand(0.06, 0.22) });
      }
    }

    // structural integrity: a building that's lost too much of itself —
    // or most of its ground floor — gives way and falls into rubble
    const b = chunk.b;
    if (!b.collapsing && b.alive > 0) {
      const ratio = b.alive / b.chunkCount;
      let unstable = ratio < 0.45;
      if (!unstable && ratio < 0.9) {
        let base = 0, base0 = 0;
        for (const c of b.grid.values()) {
          if (c.gy === 0) { base0++; if (c.alive) base++; }
        }
        unstable = base0 > 0 && base / base0 < 0.4;
      }
      if (unstable) this.collapseBuilding(b);
    }
  }

  // progressive bottom-up demolition: every remaining chunk falls, floor by
  // floor, so a gutted tower crumbles instead of hovering on nothing
  collapseBuilding(b) {
    if (b.collapsing) return;
    b.collapsing = true;
    for (const c of b.grid.values()) {
      if (!c.alive) continue;
      this.pendingCollapse.push({
        chunk: c, t: 0.1 + c.gy * 0.09 + rand(0, 0.14), force: true,
      });
    }
    if (this.world) {
      this.world.audio?.play('crumbleBig');
      this.world.effects.addShake(0.8);
      const a = b.aabb;
      _p.set((a.minX + a.maxX) / 2, 1, (a.minZ + a.maxZ) / 2);
      this.world.effects.dustPuff(_p, 16, 0x9a9284);
    }
  }

  hasSupport(chunk) {
    const { gx, gy, gz, b } = chunk;
    if (gy === 0) return true;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = b.grid.get(`${gx + dx},${gy - 1},${gz + dz}`);
      if (c && c.alive) return true;
    }
    return false;
  }

  spawnDebris(x, y, z, vx, vy, vz, sw, sh, sd) {
    const D = this.debris;
    const i = D.head;
    D.head = (D.head + 1) % D.cap;
    D.pos[i * 3] = x; D.pos[i * 3 + 1] = y; D.pos[i * 3 + 2] = z;
    D.vel[i * 3] = vx; D.vel[i * 3 + 1] = vy; D.vel[i * 3 + 2] = vz;
    D.rot[i * 3] = rand(Math.PI * 2); D.rot[i * 3 + 1] = rand(Math.PI * 2); D.rot[i * 3 + 2] = 0;
    D.rotVel[i * 3] = rand(-6, 6); D.rotVel[i * 3 + 1] = rand(-6, 6); D.rotVel[i * 3 + 2] = rand(-6, 6);
    D.scale[i * 3] = sw; D.scale[i * 3 + 1] = sh; D.scale[i * 3 + 2] = sd;
    D.life[i] = rand(2.6, 4);
  }

  chunkColor(chunk) {
    if (this.mesh.instanceColor) {
      _c.fromArray(this.mesh.instanceColor.array, chunk.i * 3);
      return _c.clone();
    }
    return new THREE.Color(0x9a9284);
  }

  // spawn a full-size falling block from a collapsing chunk
  spawnRubble(x, y, z, w, h, d, vx, vy, vz, color) {
    const R = this.rubble;
    let it;
    if (R.items.length < R.cap) {
      it = { i: R.items.length };
      R.items.push(it);
    } else {
      // recycle the oldest settled block; skip if all still falling
      it = R.items[R.head];
      R.head = (R.head + 1) % R.cap;
    }
    it.px = x; it.py = y; it.pz = z;
    it.vx = vx; it.vy = vy; it.vz = vz;
    it.rx = rand(-0.25, 0.25); it.ry = rand(-0.3, 0.3); it.rz = rand(-0.25, 0.25);
    it.avx = rand(-2.5, 2.5); it.avy = rand(-2, 2); it.avz = rand(-2.5, 2.5);
    it.w = w; it.h = h; it.d = d;
    it.settled = false;
    it.life = 26 + rand(0, 8); // long-lived rubble
    if (color) this.rubble.mesh.setColorAt(it.i, color.multiplyScalar(0.86));
    if (this.rubble.mesh.instanceColor) this.rubble.mesh.instanceColor.needsUpdate = true;
  }

  // ---- queries ----
  pointHits(p) {
    for (const b of this.buildings) {
      if (b.alive <= 0) continue;
      const a = b.aabb;
      if (p.x < a.minX || p.x > a.maxX || p.y < a.minY || p.y > a.maxY || p.z < a.minZ || p.z > a.maxZ) continue;
      for (const c of b.grid.values()) {
        if (!c.alive) continue;
        if (Math.abs(p.x - c.x) < c.w / 2 && Math.abs(p.y - c.y) < c.h / 2 && Math.abs(p.z - c.z) < c.d / 2) return c;
      }
    }
    return null;
  }

  raySolid(origin, dir, range, step = 1.4) {
    const d = _p.copy(dir).normalize();
    for (let t = step; t < range; t += step) {
      const x = origin.x + d.x * t, y = origin.y + d.y * t, z = origin.z + d.z * t;
      const c = this.pointHits({ x, y, z });
      if (c) return { point: new THREE.Vector3(x, y, z), chunk: c, t };
      if (y < 0) return null;
    }
    return null;
  }

  damageSphere(pos, radius, dmg, dir = null, structural = false) {
    let destroyed = 0;
    for (const b of this.buildings) {
      if (b.alive <= 0) continue;
      const a = b.aabb;
      if (pos.x < a.minX - radius || pos.x > a.maxX + radius ||
          pos.y < a.minY - radius || pos.y > a.maxY + radius ||
          pos.z < a.minZ - radius || pos.z > a.maxZ + radius) continue;
      for (const c of b.grid.values()) {
        if (!c.alive) continue;
        const dx = c.x - pos.x, dy = c.y - pos.y, dz = c.z - pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < radius * radius) {
          c.hp -= dmg * (1 - Math.sqrt(d2) / (radius * 1.4));
          if (c.hp <= 0) {
            const v = dir || _p.set(dx, dy * 0.4 + 0.4, dz).normalize();
            this.killChunk(c, v);
            destroyed++;
          }
        }
      }
    }
    if (destroyed > 2 && this.world) {
      this.world.audio?.play(destroyed > 8 ? 'crumbleBig' : 'crumble');
      this.world.effects.addShake(Math.min(0.6, destroyed * 0.04));
    }
    return destroyed;
  }

  // Fighter vs buildings: horizontal AABB pushout for walls PLUS rooftop
  // support — mechs land on and fight across exposed chunk tops.
  // is there a solid building face at this world point? Returns the chunk
  // plus the outward push normal so a fighter can hang from it (wall grab /
  // climbing). pad = how far outside a face still counts as touching it.
  grabProbe(px, py, pz, pad = 0.7) {
    for (const b of this.buildings) {
      if (b.alive <= 0) continue;
      const a = b.aabb;
      if (px < a.minX - pad || px > a.maxX + pad ||
          pz < a.minZ - pad || pz > a.maxZ + pad ||
          py < 0 || py > a.maxY + 1) continue;
      for (const c of b.grid.values()) {
        if (!c.alive) continue;
        const dx = px - c.x, dz = pz - c.z;
        if (Math.abs(dx) > c.w / 2 + pad || Math.abs(dz) > c.d / 2 + pad ||
            Math.abs(py - c.y) > c.h / 2 + 0.5) continue;
        // outward normal along the shallower horizontal penetration axis
        const ox = c.w / 2 + pad - Math.abs(dx), oz = c.d / 2 + pad - Math.abs(dz);
        let nx = 0, nz = 0;
        if (ox < oz) nx = Math.sign(dx || 1);
        else nz = Math.sign(dz || 1);
        return { chunk: c, nx, nz, x: px, y: py, z: pz };
      }
    }
    return null;
  }

  collideFighter(f) {
    let support = -Infinity;
    for (const b of this.buildings) {
      if (b.alive <= 0) continue;
      const a = b.aabb;
      if (f.pos.x < a.minX - f.radius || f.pos.x > a.maxX + f.radius ||
          f.pos.z < a.minZ - f.radius || f.pos.z > a.maxZ + f.radius ||
          f.pos.y > a.maxY + 1) continue;
      for (const c of b.grid.values()) {
        if (!c.alive) continue;
        const top = c.y + c.h / 2;
        const hw = c.w / 2 + f.radius, hd = c.d / 2 + f.radius;
        const dx = f.pos.x - c.x, dz = f.pos.z - c.z;
        if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
        // feet at/above an EXPOSED top while descending: that's a floor.
        // (chunks with a live chunk directly above are wall interior — no
        // footing, or falling mechs would stick to facades)
        if (f.pos.y >= top - 0.9 && f.vel.y <= 0.01) {
          const above = b.grid.get(`${c.gx},${c.gy + 1},${c.gz}`);
          if ((!above || !above.alive) &&
              Math.abs(dx) < c.w / 2 + f.radius * 0.4 &&
              Math.abs(dz) < c.d / 2 + f.radius * 0.4) {
            support = Math.max(support, top);
          }
          continue;
        }
        // vertical overlap of capsule with chunk → side pushout
        if (f.pos.y > top || f.pos.y + f.height < c.y - c.h / 2) continue;
        const px = hw - Math.abs(dx), pz = hd - Math.abs(dz);
        if (px < pz) { f.pos.x += Math.sign(dx || 1) * px; f.vel.x *= 0.4; }
        else { f.pos.z += Math.sign(dz || 1) * pz; f.vel.z *= 0.4; }
      }
    }
    // settled rubble blocks push back and can be stood on, just like chunks
    for (const it of this.rubble.items) {
      if (!it.settled || it.life <= 0) continue;
      const dy = f.pos.y - it.py;
      if (dy > it.h / 2 + f.height || dy < -it.h) continue;
      const hw = it.w / 2 + f.radius, hd = it.d / 2 + f.radius;
      const dx = f.pos.x - it.px, dz = f.pos.z - it.pz;
      if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
      const top = it.py + it.h / 2;
      if (f.pos.y >= top - 0.7 && f.vel.y <= 0.01 &&
          Math.abs(dx) < it.w / 2 + f.radius * 0.5 && Math.abs(dz) < it.d / 2 + f.radius * 0.5) {
        support = Math.max(support, top);
        continue;
      }
      if (f.pos.y > top || f.pos.y + f.height < it.py - it.h / 2) continue;
      const px = hw - Math.abs(dx), pz = hd - Math.abs(dz);
      if (px < pz) { f.pos.x += Math.sign(dx || 1) * px; f.vel.x *= 0.5; }
      else { f.pos.z += Math.sign(dz || 1) * pz; f.vel.z *= 0.5; }
    }
    // stand on the highest rooftop / rubble found underfoot
    if (support > -Infinity && f.pos.y <= support + 0.9) {
      const fallSpeed = -f.vel.y;
      f.pos.y = support;
      if (f.vel.y < 0) f.vel.y = 0;
      if (!f.grounded) {
        f.grounded = true;
        if (fallSpeed > 9 && this.world) {
          this.world.effects.dustPuff(f.pos, Math.min(16, fallSpeed));
          this.world.audio?.play('land');
        }
      }
    }
  }

  // integrate the falling rubble blocks: gravity, ground landing, settle
  updateRubble(dt) {
    const R = this.rubble;
    if (!R.items.length) return;
    for (const it of R.items) {
      if (it.life <= 0) { continue; }
      it.life -= dt;
      if (it.life <= 0) { // expired: hide the instance
        _m.compose(_p.set(0, -200, 0), _q.identity(), _s.set(0.0001, 0.0001, 0.0001));
        R.mesh.setMatrixAt(it.i, _m);
        continue;
      }
      if (!it.settled) {
        it.vy -= 30 * dt;
        it.px += it.vx * dt; it.py += it.vy * dt; it.pz += it.vz * dt;
        it.rx += it.avx * dt; it.ry += it.avy * dt; it.rz += it.avz * dt;
        const rest = it.h / 2;
        if (it.py <= rest) {
          it.py = rest;
          if (it.vy < -6) { // bounce once, shed spin
            it.vy *= -0.28; it.vx *= 0.5; it.vz *= 0.5;
            it.avx *= 0.4; it.avy *= 0.4; it.avz *= 0.4;
            if (this.world && it.w > 1) this.world.effects.dustPuff(_p.set(it.px, 0.3, it.pz), 4, 0x9a9284);
          } else { // settle flat, snap toward axis-aligned so it stacks readably
            it.settled = true;
            it.vx = it.vy = it.vz = 0;
            it.rx = Math.round(it.rx / (Math.PI / 2)) * (Math.PI / 2);
            it.rz = Math.round(it.rz / (Math.PI / 2)) * (Math.PI / 2);
          }
        }
      }
      _e.set(it.rx, it.ry, it.rz);
      _m.compose(_p.set(it.px, it.py, it.pz), _q.setFromEuler(_e), _s.set(it.w, it.h, it.d));
      R.mesh.setMatrixAt(it.i, _m);
    }
    R.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    // camera see-through fades ease toward their targets, per view + copy
    // (the attribute itself is stamped per view in applyViewFade)
    const fk = 1 - Math.exp(-10 * dt);
    for (const b of this.buildings) {
      if (!b.fadeV || !b._everFaded) continue;
      for (let i = 0; i < 36; i++) {
        const target = b.fadeTargetV[i];
        const cur = b.fadeV[i];
        if (Math.abs(cur - target) > 0.005) b.fadeV[i] = cur + (target - cur) * fk;
        else b.fadeV[i] = target;
      }
    }

    // pending collapses cascade — forced (whole-building) collapses drop
    // their chunks as full-size interactable rubble blocks
    for (let i = this.pendingCollapse.length - 1; i >= 0; i--) {
      const pc = this.pendingCollapse[i];
      pc.t -= dt;
      if (pc.t <= 0) {
        this.pendingCollapse.splice(i, 1);
        if (pc.chunk.alive && (pc.force || !this.hasSupport(pc.chunk))) {
          this.killChunk(pc.chunk, _p.set(0, -0.5, 0), true, !!pc.force);
        }
      }
    }

    this.updateRubble(dt);

    // debris sim
    const D = this.debris;
    let any = false;
    for (let i = 0; i < D.cap; i++) {
      if (D.life[i] <= 0) continue;
      any = true;
      D.life[i] -= dt;
      D.vel[i * 3 + 1] -= 30 * dt;
      let x = D.pos[i * 3] + D.vel[i * 3] * dt;
      let y = D.pos[i * 3 + 1] + D.vel[i * 3 + 1] * dt;
      let z = D.pos[i * 3 + 2] + D.vel[i * 3 + 2] * dt;
      const hh = D.scale[i * 3 + 1] / 2;
      if (y < hh) {
        y = hh;
        D.vel[i * 3 + 1] *= -0.3;
        D.vel[i * 3] *= 0.6;
        D.vel[i * 3 + 2] *= 0.6;
        D.rotVel[i * 3] *= 0.5; D.rotVel[i * 3 + 1] *= 0.5; D.rotVel[i * 3 + 2] *= 0.5;
      }
      D.pos[i * 3] = x; D.pos[i * 3 + 1] = y; D.pos[i * 3 + 2] = z;
      D.rot[i * 3] += D.rotVel[i * 3] * dt;
      D.rot[i * 3 + 2] += D.rotVel[i * 3 + 2] * dt;
      const fade = Math.min(1, D.life[i] / 0.6);
      _e.set(D.rot[i * 3], D.rot[i * 3 + 1], D.rot[i * 3 + 2]);
      _m.compose(
        _p.set(x, y, z),
        _q.setFromEuler(_e),
        _s.set(D.scale[i * 3] * fade, D.scale[i * 3 + 1] * fade, D.scale[i * 3 + 2] * fade)
      );
      D.mesh.setMatrixAt(i, _m);
    }
    if (any) D.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.debris.mesh);
    this.scene.remove(this.rubble.mesh);
    this.mesh.dispose();
    this.debris.mesh.dispose();
    this.rubble.mesh.dispose();
  }
}
