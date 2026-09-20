// ---------------- THE LOADING SCREEN (arena intro) ----------------
//
// A match must open on a stage that is READY: every texture uploaded, every
// shader compiled, every robot in its real body — never with scenery popping
// in behind the bell. This is the card that covers the wait, before the first
// round and again before every round that is fought somewhere new.
//
// It is a FULL-SCREEN OPAQUE card, not a chrome over the live cameras (which
// is what the old warm-up sandbox was): the arena's name and painting with a
// loading bar under them, every fighter's canonical concept art on an angled
// panel with a VS between, and the pad diagram, small, so the wait teaches
// the game. The REAL scene renders behind it the whole time — the renderer
// draws the actual arena through the actual cameras into a frame nobody sees,
// which is what compiles the shaders and uploads the textures, plus one
// explicit compile()/initTexture pass before the reveal so nothing is left
// for the first visible frame.
//
// THE GATE: at least MIN_T seconds (the card has to be readable), AND the
// texture loader idle for a beat, AND no fighter still waiting on a model
// download, AND the prewarm frame done. Only then does the card fade, over
// FADE_T, revealing a stage that was already drawing underneath it; the
// round's announcement opens as the fade lands. `maxStall` is the hung-
// request escape hatch and nothing else — it fires only when the loader
// makes no progress at all for that long.
//
// Two callers, one screen: boot's startBattle for round 1 (the reveal calls
// match.begin()) and boot's onRoundStart for a round that changed arena (the
// match is HELD in startRound and the reveal calls match.release()).
//
// THREE.DefaultLoadingManager: tracked via instance handlers installed in the
// constructor — construct exactly ONE LoadScreen.
import * as THREE from 'three';
import { hexCss } from '../core/colors.js';
import { t } from '../core/text.js';
import { compactPadSvg } from '../ui/instructions.js';

const MIN_T = 3.0;        // the card is up at least this long
const SETTLE_T = 0.45;    // loader idle for this long = the pack is in
const MAX_STALL = 25;     // hung request escape hatch (no progress for this long)
const FADE_T = 0.9;       // card out / arena in
const TIP_T = 3.2;        // seconds per tip
const N_TIPS = 9;         // load.tip.0 … load.tip.8 in the text catalogue

const TEX_SLOTS = ['map', 'bumpMap', 'normalMap', 'roughnessMap',
  'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'envMap', 'lightMap'];

export class LoadScreen {
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

  // B: the battle context (fighters, humans, hud, match, world, arena).
  // theme: the arena being entered. round: 1 for the first, else the round
  // this screen opens — it changes the header ("NOW ENTERING" vs "NEXT ROUND").
  start(B, theme, { round = 1 } = {}) {
    const { fighters } = B;
    for (const f of fighters) {
      f.controlsLocked = true;
      f.intent.moveX = f.intent.moveZ = 0;
    }
    B.hud.el.style.display = 'none';
    this.touchControls?.setVisible(false);
    // the bodies stand on their pads under the card; the arena must not
    // touch them while nobody can see it (spike traps, fuel barrels, walls —
    // see arena.collideFighter)
    B.world.sandbox = true;

    const ov = document.createElement('div');
    ov.className = 'ls';
    const skyTop = hexCss(theme.sky.top), skyBot = hexCss(theme.sky.bottom);
    ov.style.setProperty('--ls-sky-top', skyTop);
    ov.style.setProperty('--ls-sky-bot', skyBot);
    const sub = round > 1 ? t('load.nextRound') : t('load.nowEntering');
    const roundLine = t('match.round', { n: round });
    const cards = fighters.map((f, i) => {
      const glow = hexCss(f.def.colors.glow);
      const tag = f.isAI ? t('load.tag.cpu') : t('load.tag.p', { n: f.playerIndex + 1 });
      const vs = i < fighters.length - 1 ? `<div class="ls-vs">${t('load.vs')}</div>` : '';
      return `<div class="ls-card${f.isAI ? ' cpu' : ''}" style="--glow:${glow}">
          <div class="ls-card-in"><div class="ls-art" style="background-image:url(art/${f.def.id}.jpg)"></div></div>
          <div class="ls-tag">${tag}</div>
          <div class="ls-name">${f.def.name}</div>
        </div>${vs}`;
    }).join('');
    ov.innerHTML = `
      <div class="ls-stripes"></div>
      <div class="ls-top">
        <div class="ls-arena-frame"><div class="ls-arena-img" style="background-image:url(arenas/${theme.id}.jpg)"></div></div>
        <div class="ls-arena-text">
          <div class="ls-sub">${sub} <span class="ls-round">· ${roundLine}</span></div>
          <div class="ls-arena">${theme.name}</div>
          <div class="ls-desc">${theme.desc || ''}</div>
          <div class="ls-bar"><div class="ls-bar-fill"></div></div>
          <div class="ls-status">${t('load.loading')}…</div>
        </div>
      </div>
      <div class="ls-cards">${cards}</div>
      <div class="ls-foot">
        <div class="ls-pad"></div>
        <div class="ls-tips"><div class="ls-tips-title">${t('load.howToPlay')}</div><div class="ls-tip"></div></div>
      </div>`;
    ov.querySelector('.ls-pad').appendChild(compactPadSvg());
    this.uiRoot.appendChild(ov);

    const tipEl = ov.querySelector('.ls-tip');
    const tipStart = (Math.random() * N_TIPS) | 0;
    tipEl.textContent = t(`load.tip.${tipStart}`);

    B.loading = {
      t: 0, settle: 0, progDone: -1, progT: 0, ov, round,
      barFill: ov.querySelector('.ls-bar-fill'), barK: 0,
      status: ov.querySelector('.ls-status'),
      tipEl, tipIdx: tipStart, tipT: 0,
      prewarmed: false, fade: undefined,
    };
  }

  // Quit mid-load (teardownBattle): drop the card, nothing else to restore —
  // the battle is going away with it.
  cancel(B) {
    B.loading?.ov.remove();
    B.loading = null;
  }

  update(B, dt) {
    const L = B.loading;
    const engine = this.engine;
    L.t += dt;
    L.settle = this.texBusy ? 0 : L.settle + dt;

    // a tip every few seconds, crossfaded
    L.tipT += dt;
    if (L.tipT >= TIP_T && L.fade === undefined) {
      L.tipT = 0;
      L.tipIdx = (L.tipIdx + 1) % N_TIPS;
      const el = L.tipEl;
      el.classList.add('swap');
      setTimeout(() => { el.textContent = t(`load.tip.${L.tipIdx}`); el.classList.remove('swap'); }, 180);
    }

    // the bar: a blend of the time gate and the loader's real item count,
    // eased, and pinned to 100% once the reveal is decided
    const texK = this.texTotal > 0 ? this.texDone / this.texTotal : this.texBusy ? 0 : 1;
    const modelsPending = B.fighters.some((f) => f._modelPending);
    const wantK = L.fade !== undefined || L.prewarmed
      ? 1
      : Math.min(0.96, 0.4 * Math.min(1, L.t / MIN_T) + 0.45 * texK + (L.settle > 0 ? 0.06 : 0) + (modelsPending ? 0 : 0.05));
    L.barK = Math.max(L.barK, L.barK + (wantK - L.barK) * Math.min(1, dt * 5));
    L.barFill.style.width = `${(L.barK * 100).toFixed(1)}%`;
    const status = L.fade !== undefined ? t('load.ready')
      : modelsPending ? t('load.models')
        : (this.texBusy || L.settle < SETTLE_T) ? t('load.loading') + '…'
          : t('load.warming');
    if (L.status.textContent !== status) L.status.textContent = status;

    // every body stands still on its pad, unhittable, until the bell
    for (const f of B.fighters) {
      f.iframes = Math.max(f.iframes, 0.2);
      f.hp = f.maxHp;
    }

    // FADE phase: the card thins out over a stage that has been drawing
    // underneath it since the first frame
    if (L.fade !== undefined) {
      L.fade += dt;
      if (L.fade < FADE_T) return;
      L.ov.remove();
      B.hud.el.style.display = '';
      B.world.sandbox = false;    // on the board now: hazards and walls are real
      B.loading = null;
      if (B.usesTouch) this.touchControls?.setVisible(true);
      if (L.round <= 1) B.match.begin();
      else B.match.release();
      return;
    }

    // THE GATE (see the header)
    if (this.texDone !== L.progDone) { L.progDone = this.texDone; L.progT = L.t; }
    const stalled = this.texBusy && L.t - L.progT > MAX_STALL;
    if (L.t < MIN_T || modelsPending || !(L.settle > SETTLE_T || stalled)) return;
    if (!L.prewarmed) {
      // ONE explicit prewarm pass: compile every shader the scene can need and
      // upload every texture, so the first visible frame has nothing left to
      // do. compile() traverses hidden objects too. The card stays up for it
      // (the stall lands behind the overlay) and the reveal is next frame.
      L.prewarmed = true;
      engine.renderer.compile(engine.scene, engine.camera);
      engine.scene.traverse((o) => {
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
      return;
    }
    L.fade = 0;
    L.ov.classList.add('out');
    L.ov.style.setProperty('--ls-fade', `${FADE_T}s`);
  }
}
