// ---------------- pre-fight warm-up (asset loading) ----------------
// While the arena's texture pack streams in, the match holds on a
// "get ready" screen: the board title up top, and each fighter in its
// own camera view shadow-boxing with its intro quote — meanwhile the
// real scene renders behind it all, compiling shaders and uploading
// textures so the fight starts with zero pop-in.
//
// Extracted from boot.js. State the flow needs, and why:
// - engine: `views` (the fixed per-fighter warm-up cameras), `scene`
//   (neutral stage floor + fog/background swaps), `renderer` + `camera`
//   (the hidden prewarm frame: shader compile + texture upload).
// - uiRoot: the warm-up overlay DOM (title, quotes, bar, model spinners)
//   mounts here.
// - touchControls (nullable): shown at the reveal for touch matches.
// - THREE.DefaultLoadingManager: tracked via instance handlers installed in
//   the constructor (construct exactly ONE Warmup) — the reveal gate needs
//   the texture loader's live busy/progress state.
// Per-battle state lives on the battle context B (fighters, humans, hud,
// match, arena, arenaObjs) with the in-flight loading state on B.loading —
// boot's main loop and teardownBattle read B.loading, so it stays there.
import * as THREE from 'three';
import { hexCss } from '../core/colors.js';
import { t } from '../core/text.js';

export class Warmup {
  constructor({ engine, uiRoot, touchControls = null }) {
    this.engine = engine;
    this.uiRoot = uiRoot;
    this.touchControls = touchControls;
    this.texBusy = false;
    this.texDone = 0;
    this.texTotal = 0;
    THREE.DefaultLoadingManager.onStart = () => { this.texBusy = true; };
    THREE.DefaultLoadingManager.onLoad = () => { this.texBusy = false; this.texDone = this.texTotal; };
    THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => {
      this.texDone = loaded; this.texTotal = total;
    };
  }

  start(B, theme) {
    const engine = this.engine;
    const { fighters } = B;
    const n = fighters.length;
    const rects = n === 2
      ? [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }]
      : n === 3
        ? [{ x: 0, y: 0, w: 1 / 3, h: 1 }, { x: 1 / 3, y: 0, w: 1 / 3, h: 1 }, { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }]
        : [{ x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
          { x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }];
    const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
    engine.views = fighters.map((f, i) => {
      const r = rects[i];
      const cam = new THREE.PerspectiveCamera(42, (r.w * W) / (r.h * H), 0.5, 2200);
      const dx = Math.sin(f.yaw), dz = Math.cos(f.yaw);
      const d = 5.5 + f.height * 1.45; // pulled back — whole mech with breathing room
      cam.position.set(f.pos.x + dx * d, f.height * 0.78, f.pos.z + dz * d);
      cam.lookAt(f.pos.x, f.height * 0.75, f.pos.z); // aim at the chest/head, not the waist
      return { camera: cam, ...r };
    });
    for (const f of fighters) {
      f.controlsLocked = true;
      f.animator.play('intro');
      f._wuNext = 2.6 + Math.random() * 1.2;
      f._wuSeq = 0;
      f._wuSpawn = f.pos.clone();
    }
    // the loading screen is a playground: HUMANS get their controls early —
    // run, punch, block, crouch, jump around the stage while it loads.
    // Everyone is leashed near their spawn and invulnerable (see
    // update()); ranged/special/ult stay disabled (intent scrub in the
    // read loop). match.begin() re-locks everybody for the countdown.
    for (const h of B.humans) h.fighter.controlsLocked = false;
    const ov = document.createElement('div');
    ov.className = 'warmup-overlay';
    const caps = fighters.map((f, i) => {
      const r = rects[i];
      const glow = hexCss(f.def.colors.glow);
      return `<div class="wu-cap" style="left:${r.x * 100}%;width:${r.w * 100}%;bottom:calc(${r.y * 100}% + 4vh);">
        <div class="wu-name" style="color:${glow}">${f.def.name}</div>
        <div class="wu-quote">${f.def.quotes.intro}</div>
      </div>`;
    }).join('');
    ov.innerHTML = `
      <div class="wu-head"><div class="wu-sub">${t('warmup.nowEntering')}</div><div class="wu-arena">${theme.name}</div>
        <div class="wu-bar"><div class="wu-bar-fill"></div></div></div>
      ${caps}
      <div class="wu-loading">${t('warmup.loadingArena.html')}</div>`;
    this.uiRoot.appendChild(ov);
    // a fighter whose model is still downloading is hidden — its panel
    // shows a spinner until the swap-in reveals it (see boot.startBattle)
    fighters.forEach((f, i) => {
      if (!f._modelPending) return;
      const r = rects[i];
      const sp = document.createElement('div');
      sp.className = 'wu-spinwrap';
      sp.style.left = `${(r.x + r.w / 2) * 100}%`;
      sp.style.top = `${(1 - r.y - r.h / 2) * 100}%`;
      sp.innerHTML = `<div class="wu-spin"></div><div class="wu-spinlabel">${t('warmup.loadingModel')}</div>`;
      ov.appendChild(sp);
      f._wuSpin = sp;
    });
    B.hud.el.style.display = 'none';

    // menu-style neutral backdrop: the whole arena hides while it streams
    // in, and the fighters shadow-box on a dark stage floor instead — no
    // half-textured scenery on show. Saved fog/background come back (and
    // every shader/texture is prewarmed) at the reveal.
    const scene = engine.scene;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x161b24, roughness: 0.6, metalness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const hidden = B.arenaObjs.map((o) => ({ o, vis: o.visible }));
    for (const h of hidden) h.o.visible = false;

    B.loading = {
      // the gate holds for as long as the texture pack streams — the match
      // must start 100% loaded, never with scenery popping in later.
      // maxStall is a hung-request escape hatch ONLY: it fires when the
      // loader makes NO progress at all for that long (loader errors count
      // as completed items, so failed downloads can't trap us here).
      t: 0, settle: 0, minT: 3.4, maxStall: 25, progDone: -1, progT: 0, ov,
      floor, hidden, fog: scene.fog, bg: scene.background,
      barFill: ov.querySelector('.wu-bar-fill'), barK: 0,
    };
    scene.fog = new THREE.Fog(0x0a0e18, 60, 220);
    scene.background = new THREE.Color(0x0a0e18);
  }

  update(B, dt) {
    const engine = this.engine;
    const L = B.loading;
    L.t += dt;
    L.settle = this.texBusy ? 0 : L.settle + dt;

    // loading bar under the arena name: blend of time-gate progress and the
    // texture loader's real item count, eased; pinned to 100% for the fade
    const texK = this.texTotal > 0 ? this.texDone / this.texTotal : this.texBusy ? 0 : 1;
    const wantK = L.fade !== undefined || L.prewarmed
      ? 1
      : Math.min(0.97, 0.45 * Math.min(1, L.t / L.minT) + 0.45 * texK + (L.settle > 0 ? 0.07 : 0));
    L.barK = Math.max(L.barK, L.barK + (wantK - L.barK) * Math.min(1, dt * 5));
    if (L.barFill) L.barFill.style.width = `${(L.barK * 100).toFixed(1)}%`;

    // the playground rules: humans are unlocked (run/punch/block/crouch for
    // fun) but invulnerable, healed, and leashed near their spawn so nobody
    // leaves their camera or lands a real hit before the bell
    for (const f of B.fighters) {
      f.iframes = Math.max(f.iframes, 0.2);
      f.hp = f.maxHp;
      if (f._wuSpawn && !f.controlsLocked) {
        const dx = f.pos.x - f._wuSpawn.x, dz = f.pos.z - f._wuSpawn.z;
        const d = Math.hypot(dx, dz), R = 7 * f.scale;
        if (d > R) {
          f.pos.x = f._wuSpawn.x + (dx / d) * R;
          f.pos.z = f._wuSpawn.z + (dz / d) * R;
        }
      }
    }
    // each warm-up camera keeps its fighter framed while they romp around
    if (engine.views) {
      B.fighters.forEach((f, i) => {
        const v = engine.views[i];
        if (v) v.camera.lookAt(f.pos.x, f.pos.y + f.height * 0.75, f.pos.z);
      });
    }
    // shadow-boxing beats for the CPU fighters (humans entertain themselves)
    for (const f of B.fighters) {
      if (f.alive && f.controlsLocked && L.t >= f._wuNext) {
        f._wuNext = L.t + 2.2 + Math.random() * 1.3;
        const seq = ['light1', 'taunt', 'light2'];
        f.animator.play(seq[f._wuSeq++ % seq.length]);
      }
    }

    // FADE phase: the arena is compiled and uploaded — let it emerge behind
    // the fighters out of the receding grey fog before the camera flips
    if (L.fade !== undefined) {
      L.fade += dt;
      const k = Math.min(1, L.fade / 0.9);
      const e = k * k * (3 - 2 * k);
      const themeFog = L.fog;
      L.fadeFog.color.copy(L.greyCol).lerp(L.themeFogCol, e);
      L.fadeFog.near = 4 + (themeFog.near - 4) * e;
      L.fadeFog.far = 26 + (themeFog.far - 26) * e;
      L.fadeBg.copy(L.greyCol).lerp(L.skyCol, e);
      if (L.fade < 1.05) return;
      // the flip: exact theme atmosphere back, sky dome on, cameras over
      const scene = engine.scene;
      scene.fog = L.fog;
      scene.background = L.bg;
      B.arena.sky.visible = true;
      L.ov.remove();
      engine.views = null;
      B.hud.el.style.display = '';
      B.loading = null;
      if (B.usesTouch) this.touchControls?.setVisible(true);
      B.match.begin();
      return;
    }

    // go when the loader has been idle for a beat (and never before the
    // quotes have had their moment). No time cap while downloads flow:
    // the reveal waits for 100% — the only escape is the stall watchdog,
    // which fires after maxStall seconds with zero loader progress.
    // Fighters still waiting on a model download hold the gate — createMech
    // always settles (failed GLBs fall back procedurally), so no deadlock.
    if (this.texDone !== L.progDone) { L.progDone = this.texDone; L.progT = L.t; }
    const stalled = this.texBusy && L.t - L.progT > L.maxStall;
    const modelsPending = B.fighters.some((f) => f._modelPending);
    if (L.t >= L.minT && !modelsPending && (L.settle > 0.45 || stalled)) {
      const scene = engine.scene;
      if (!L.prewarmed) {
        // ONE hidden long frame before the reveal: compile every shader and
        // upload every texture with the REAL arena fog/background active
        // (fog toggles shader defines — compiling under the grey stage
        // state would recompile at the flip). compile() traverses hidden
        // objects, so the arena never appears on screen for this.
        L.prewarmed = true;
        const grayFog = scene.fog, grayBg = scene.background;
        scene.fog = L.fog;
        scene.background = L.bg;
        engine.renderer.compile(scene, engine.camera);
        const TEX_SLOTS = ['map', 'bumpMap', 'normalMap', 'roughnessMap',
          'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'envMap', 'lightMap'];
        scene.traverse((o) => {
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          for (const m of mats) {
            for (const k of TEX_SLOTS) if (m[k]?.isTexture) engine.renderer.initTexture(m[k]);
            if (m.uniforms) {
              for (const u of Object.values(m.uniforms)) {
                if (u?.value?.isTexture) engine.renderer.initTexture(u.value);
              }
            }
          }
        });
        scene.fog = grayFog;
        scene.background = grayBg;
        return; // reveal next frame — the stall stays behind the overlay
      }
      // begin the FADE-IN: stage floor out, arena visible, but wrapped in
      // dense grey fog that recedes over ~1s (buildings emerge behind the
      // fighters). The sky dome stays hidden until the flip — the lerping
      // background color stands in for it.
      scene.remove(L.floor);
      L.floor.geometry.dispose();
      L.floor.material.dispose();
      for (const h of L.hidden) h.o.visible = h.vis;
      B.arena.sky.visible = false;
      L.greyCol = new THREE.Color(0x0a0e18);
      L.themeFogCol = new THREE.Color(B.arena.theme.fog.color);
      L.skyCol = new THREE.Color(B.arena.theme.sky.top);
      L.fadeFog = new THREE.Fog(0x0a0e18, 4, 26);
      L.fadeBg = new THREE.Color(0x0a0e18);
      scene.fog = L.fadeFog;
      scene.background = L.fadeBg;
      L.fade = 0;
    }
  }
}
