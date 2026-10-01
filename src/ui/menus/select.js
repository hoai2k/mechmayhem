// FIGHTER SELECT — the versus split: a side per fighter, the roster grid in
// the band down the middle, repaints photographed and spray-painted in.
import { playableRoster } from '../../mechs/roster.js';
import { SCHEME_NAMES, SCHEME_COUNT, schemeSwatch } from '../../mechs/colorscheme.js';
import { isTouchDevice } from '../../core/utils.js';
import { mechIcon } from '../icons.js';
import { PLAYER_COLORS_CSS as COLOR_CSS, hexCss, MAX_FIGHTERS, MAX_PADS } from '../../core/colors.js';
import { t } from '../../core/text.js';
import { loadPosterIndex, posterMeta, SETTLE_MS } from '../posters.js';
import { shotUrl, requestShot } from '../../game/snapshot.js';
import { RANDOM_PICK, pickFrom, el, touchBtn, frameHotButton, preload } from './common.js';
import { DIFF_ORDER } from '../../game/ai.js';

// ---------------- FIGHTER SELECT (join + pick, one screen) ----------------
// Players JOIN by connecting/pressing a controller, pressing a keyboard
// confirm, or by clicking an empty side (which can become KB / CPU / pad /
// touch). Every joined human picks a mech + color simultaneously; a CPU slot
// deals itself a robot the moment it is added, and shows it.
//
// THE VERSUS SPLIT. Each fighter gets a whole SIDE of the screen — their robot
// big, their name bigger, their numbers under it, their paint — and the roster
// sits in a parallelogram band down the middle with VS over it. One or two in
// the match: a left side and a right side (an empty one reads PRESS A TO
// JOIN), and a small ＋ chip under the grid adds a third. Three or four: the
// sides become quadrants and the heading says BRAWL. A slot is ONE element
// (`this.sides[i]`) whose POSITION class changes with the line-up, so a click,
// a LB/RB visit and the pickers all address it the same way whatever the
// layout.
//
// THE ROBOTS ARE PICTURES. A side shows the mech's poster, or — once its paint
// is not the stock one — a photograph of the real body in that paint, taken by
// game/snapshot.js through the poster pipeline so it drops into the same frame
// (the stock poster stays up until it is ready; nothing blanks). A pick a
// player SETTLES on is also built in the background (`onSettle` ->
// predictor.warmPick), which leaves its model, fit and paint warm for the
// fight — most of what the loading card would otherwise wait for.
const SHOT_DEBOUNCE = 260;   // ms a paint must sit before it is photographed

const XFADE_MS = 600;        // the repaint crossfade (matches .sd-pic.xfade in style.css)

// A ROBOT IS DRAWN AT ITS SIZE IN THE GAME. Every poster is rendered through
// the same camera at the same distance, so its recorded box (posters.json,
// world units) is the mech's real on-screen height, and pictures scaled by it
// stand in the proportion they fight in: colossus towers over saurion, and a
// long low body (tritone) is as tall as his box says rather than shrunk to fit
// his length. PIC_REF is the box height that fills the side's picture band
// (--pic-h in style.css); the tallest crops run a little past it, which is
// allowed — a side clips, and overflow reads as scale.
const PIC_REF = 12.4;
const PIC_FALLBACK = 0.9;   // a mech with no poster box (photographed at runtime)
function picScale(id) {
  const b = posterMeta(id)?.box;
  return b ? ((b.v1 - b.v0) / PIC_REF).toFixed(3) : String(PIC_FALLBACK);
}

const SPRAY_TAIL = 700;      // ms the spray keeps going once the new paint starts fading in

// SPRAY PAINT. What a side does while its robot is being repainted: short
// cone-shaped bursts of droplets in the NEW paint colour, fired at the body
// from nozzles dotted round it, with the odd glint twinkling on the
// silhouette. One canvas per side, drawn only while there is something on
// it, and driven by the screen's own update (dt in seconds). `start` may be
// called again mid-spray to change colour; `stop(ms)` lets the current
// droplets finish after the emitter has run on for `ms`.
class PaintSpray {
  constructor(side, canvas, pic) {
    this.side = side;
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.pic = pic;
    this.parts = [];
    this.on = false;
    this.until = 0;          // performance.now() the emitter stops at (0 = no end)
    this.puffT = 0;
    this.rgb = [255, 255, 255];
  }

  start(css) {
    const m = /#?([0-9a-f]{6})/i.exec(css);
    const n = m ? parseInt(m[1], 16) : 0xffffff;
    this.rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    this.on = true;
    this.until = 0;
    this.fit();
  }

  stop(ms) {
    if (!this.on) return;
    if (ms <= 0) { this.on = false; return; }
    this.until = performance.now() + ms;
  }

  fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(this.side.clientWidth * dpr), h = Math.round(this.side.clientHeight * dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.dpr = dpr;
  }

  // the robot's box in canvas pixels (the picture's own rect where it has
  // one, else where a robot would stand)
  body() {
    const s = this.side.getBoundingClientRect();
    const r = this.pic.naturalWidth ? this.pic.getBoundingClientRect() : null;
    const k = this.dpr;
    if (r && r.width > 4) {
      // object-fit: contain — the drawn image is narrower than its box
      const ar = this.pic.naturalWidth / this.pic.naturalHeight;
      const w = Math.min(r.width, r.height * ar), h = w / ar;
      const x = r.left + (r.width - w) / 2 - s.left, y = r.bottom - h - s.top;
      return { x: x * k, y: y * k, w: w * k, h: h * k };
    }
    return { x: s.width * 0.25 * k, y: s.height * 0.2 * k, w: s.width * 0.4 * k, h: s.height * 0.7 * k };
  }

  puff() {
    const b = this.body();
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.45;
    // a nozzle somewhere round the body, aimed at a point on it
    const a = Math.random() * Math.PI * 2;
    const ox = cx + Math.cos(a) * b.w * 0.62, oy = cy + Math.sin(a) * b.h * 0.5;
    const tx = b.x + b.w * (0.25 + Math.random() * 0.5), ty = b.y + b.h * (0.12 + Math.random() * 0.7);
    const dir = Math.atan2(ty - oy, tx - ox);
    const dist = Math.hypot(tx - ox, ty - oy);
    const k = this.dpr;
    const n = 26 + ((Math.random() * 14) | 0);
    for (let j = 0; j < n; j++) {
      const d = dir + (Math.random() - 0.5) * 0.5;
      const life = 0.4 + Math.random() * 0.5;
      const sp = (dist / life) * (0.75 + Math.random() * 0.7);
      const tint = 0.75 + Math.random() * 0.6;
      this.parts.push({ kind: 0, x: ox, y: oy, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp,
        r: (1.4 + Math.random() * 3.2) * k, t: 0, life, tint });
    }
    // the MIST the droplets travel in: a few soft blobs down the cone
    for (let j = 0; j < 3; j++) {
      const f = 0.35 + j * 0.25;
      this.parts.push({ kind: 2, x: ox + (tx - ox) * f, y: oy + (ty - oy) * f, vx: Math.cos(dir) * 40 * k,
        vy: Math.sin(dir) * 40 * k, r: (14 + j * 10) * k, t: 0, life: 0.5 + Math.random() * 0.3, tint: 1 });
    }
    // glints on the silhouette — the fresh paint catching the light
    for (let j = 0; j < 3; j++) {
      if (Math.random() < 0.3) continue;
      this.parts.push({ kind: 1, x: b.x + b.w * (0.15 + Math.random() * 0.7), y: b.y + b.h * (0.08 + Math.random() * 0.8),
        vx: 0, vy: 0, r: (9 + Math.random() * 12) * k, t: 0, life: 0.5 + Math.random() * 0.4, tint: 1.3 });
    }
  }

  step(dt) {
    if (!this.on && !this.parts.length) return;
    if (this.on && this.until && performance.now() >= this.until) this.on = false;
    if (this.on) {
      this.puffT -= dt;
      while (this.puffT <= 0) { this.puff(); this.puffT += 0.07 + Math.random() * 0.05; }
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    const [R, G, B] = this.rgb;
    const col = (m, a) => `rgba(${Math.min(255, R * m) | 0},${Math.min(255, G * m) | 0},${Math.min(255, B * m) | 0},${a})`;
    const live = [];
    for (const p of this.parts) {
      p.t += dt;
      if (p.t >= p.life) continue;
      live.push(p);
      const u = p.t / p.life;
      if (p.kind === 2) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (1 + u));
        g.addColorStop(0, col(1, 0.22 * Math.sin(u * Math.PI)));
        g.addColorStop(1, col(1, 0));
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
      } else if (p.kind === 0) {
        const drag = Math.exp(-dt * 3.2);
        p.vx *= drag; p.vy *= drag;
        p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = col(p.tint, (1 - u) * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + u * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // a four-point glint: grows, holds, shrinks
        const s = p.r * Math.sin(u * Math.PI);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = col(1.4, 0.95);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s * 0.18, p.y - s * 0.18);
        ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x + s * 0.18, p.y + s * 0.18);
        ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - s * 0.18, p.y + s * 0.18);
        ctx.lineTo(p.x - s, p.y); ctx.lineTo(p.x - s * 0.18, p.y - s * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.9 * Math.sin(u * Math.PI)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    this.parts = live;
    if (!this.on && !live.length) ctx.clearRect(0, 0, this.cv.width, this.cv.height);
  }
}

const LAYOUT_QUAD = 3;       // this many in the match and the sides are quadrants

const ROWS_FROM = 5;         // this many and each half is cut into strips

// the band's slanted edges, in % of the screen width at its top (…0) and
// bottom (…1) — the same four numbers as --bl0/--bl1/--br0/--br1 in style.css
const BAND = { bl0: 40, bl1: 34, br0: 66, br1: 60 };

export class MechSelectScreen {
  constructor(root, { input, audio, onDone, onBack, onSettle, prev, hotButtons }) {
    this.input = input;
    this.audio = audio;
    this.hotButtons = hotButtons || []; // corner settings/sound, LB/RB-reachable
    this.onDone = onDone;
    this.onBack = onBack;
    this.onSettle = onSettle;   // (id, variant): a pick worth building in the background
    this.touch = isTouchDevice();
    this.el = el('div', 'screen fade-in sel-screen');
    this.el.appendChild(el('div', 'sel-tex'));

    // slot state (managed here now — the old separate setup screen is gone)
    // the stand-in CPU (see lockIn) belongs to a line-up that had a locked
    // player; coming back to this screen, nobody is locked yet
    this.slots = prev ? prev.map((x) => (x.auto ? { kind: 'off' } : { ...x })) : this.defaultSlots();
    // a line-up handed back from an older, shorter slot list still gets
    // every seat (an 'off' slot is simply an empty one)
    while (this.slots.length < MAX_FIGHTERS) this.slots.push({ kind: 'off' });
    this.pickers = [];             // one per human slot (built by syncPickers)
    this.picks = new Array(MAX_FIGHTERS).fill(null);
    this.variants = new Array(MAX_FIGHTERS).fill(0);
    this.finished = false;
    this._padCount = this.input.connectedPadCount();
    this._settle = new Map();      // slotIdx -> { key, timer }

    // the grid only offers the playable roster — work-in-progress mechs
    // appear when SETTINGS → SHOW ALL ROBOTS is on (CONFIG.showAllRobots)
    this.roster = playableRoster();
    this.byId = Object.fromEntries(this.roster.map((m) => [m.id, m]));

    // the SIDES: one element per slot, placed by layout()
    this.sides = [];
    this.sideState = [];
    this.sprays = [];              // one PaintSpray per side (see setPic)
    this._sprayT = performance.now();
    for (let i = 0; i < MAX_FIGHTERS; i++) {
      const sd = el('div', 'sel-side');
      sd.innerHTML = `
        <div class="sd-wash"></div>
        <div class="sd-q">?</div>
        <img class="sd-pic" alt="" draggable="false">
        <canvas class="sd-spray"></canvas>
        <div class="sd-tag"></div>
        <div class="sd-steer"></div>
        <div class="sd-info">
          <div class="sd-name"></div>
          <div class="sd-title"></div>
          <div class="sd-stats"></div>
          <div class="sd-moves"></div>
          <div class="sd-paint"></div>
        </div>
        <div class="sd-join"></div>
        <div class="sd-edit"></div>`;
      sd.addEventListener('click', (e) => this.onCardClick(i, e));
      // the slide-in is a ONE-SHOT: left on, any other animation that later
      // comes and goes on the picture (the lock pop) hands `animation` back
      // to it and the robot slides in again — which is how a repaint used to
      // look like a new robot arriving
      const pic = sd.querySelector('.sd-pic');
      pic.addEventListener('animationend', (e) => {
        if (e.animationName.startsWith('sdIn')) pic.classList.remove('swap');
      });
      this.el.appendChild(sd);
      this.sides.push(sd);
      this.sideState.push({ want: null, shownId: null, timer: 0 });
      this.sprays.push(new PaintSpray(sd, sd.querySelector('.sd-spray'), pic));
    }

    // the centre band: heading, roster grid, add chip, ready banner, prompts
    this.band = el('div', 'sel-band');
    this.heading = el('div', 'sel-head');
    this.grid = el('div', 'sel-grid');
    this.cells = [...this.roster, RANDOM_PICK].map((m, i) => {
      const c = el('div', 'sel-cell');
      c.innerHTML = m === RANDOM_PICK
        ? `<div class="cell-tint" style="--t:#2a3a52"></div>
           <div class="cell-icon cell-rand">?</div>
           <div class="cell-name">${t('select.random.name')}</div><div class="cell-tags"></div>`
        : `<div class="cell-tint" style="--t:${hexCss(m.colors.primary)}"></div>
           <div class="cell-icon">${mechIcon(m, 64)}</div>
           <div class="cell-name">${m.name}</div><div class="cell-tags"></div>`;
      c.addEventListener('mouseenter', () => {
        if (this.padsIn() && !this.touch) return;   // see the click handler
        if (this.mousePicker && !this.mousePicker.locked) { this.mousePicker.cursor = i; this.refresh(); }
      });
      c.addEventListener('click', () => {
        // WITH A CONTROLLER IN THE ROOM THE MOUSE IS NOBODY'S CURSOR: hovering
        // lights nothing (a highlight that follows the pointer reads as one of
        // the players), but a CLICK still picks. It commits that robot for the
        // KEYBOARD/MOUSE seat — joining it to the match if it was not in —
        // and a second click on the same robot takes it back out again.
        if (this.padsIn() && !this.touch) { this.padClick(i); return; }
        const pk = this.mousePicker;
        if (!pk) return;
        // the grid is the pointer's own business: clicking a robot brings a
        // mouse user home from whatever slot card they were visiting
        this.clearMouseSel(pk);
        // A CLICK IS A TOGGLE. Clicking the robot you are standing on locks
        // it in, and clicking that same robot again lets it go — the mouse's
        // answer to B, since a locked mouse user otherwise has nothing to
        // click that undoes the lock.
        if (pk.locked) {
          if (pk.cursor === i) { this.unlock(pk); return; }
          // everyone is in: a click on any other robot is the CPU's pick
          const cpu = this.cpuTarget();
          if (cpu >= 0) this.setCpuPick(cpu, i);
          return;
        }
        if (this.touch) {
          if (pk.cursor !== i) { pk.cursor = i; this.audio?.play('uiMove'); this.refresh(); }
          return;
        }
        if (pk.cursor === i) this.lockIn(pk);
      });
      this.grid.appendChild(c);
      return c;
    });
    this.band.append(this.heading, this.grid);
    this.el.appendChild(this.band);

    // everyone-locked gate: the match does NOT advance until someone
    // confirms again, so the last player still has time to tweak colors.
    // The banner is a button too — the mouse's way to say GO.
    this.ready = false;
    this.readyBar = el('div', 'ready-banner', t('select.ready.html'));
    this.readyBar.style.display = 'none';
    this.readyBar.addEventListener('click', () => { if (this.ready) { this.audio?.play('uiSelect'); this.finish(); } });
    this.el.appendChild(this.readyBar);

    this.el.appendChild(el('div', 'sel-prompts', t('select.prompts.html')));
    root.appendChild(this.el);

    // CLICKING NOTHING DESELECTS. A pointer-placed slot focus is sticky —
    // it re-aims ↑↓ at somebody else's card — so there has to be somewhere
    // to put it down: the heading, the bare backdrop. Anything that IS a
    // control handles its own click and is exempt.
    this.onStrayClick = (e) => {
      if (this.finished) return;
      if (e.target?.closest?.('.sel-cell, .sel-side, .hot-btn, .touch-navbar, .ready-banner')) return;
      this.clearMouseSel();
    };
    window.addEventListener('click', this.onStrayClick, true);

    if (this.touch) {
      const bar = el('div', 'touch-navbar');
      bar.appendChild(touchBtn(t('nav.back'), 'nav-back', () => this.input.touchMenuEvent('back')));
      bar.appendChild(touchBtn(t('nav.color'), 'nav-back', () => this.input.touchMenuEvent('alt')));
      bar.appendChild(touchBtn(t('nav.lockIn'), 'nav-next', () => {
        if (this.ready) this.finish();
        else if (this.mousePicker) this.lockIn(this.mousePicker);
      }));
      this.el.appendChild(bar);
    }

    // pictures wait for the poster index: without it every stock pick would
    // look posterless and be photographed from a real body instead
    this.postersReady = false;
    loadPosterIndex().then(() => { this.postersReady = true; if (!this.finished) this.refresh(); });

    this.syncPickers();
    this.refresh();
  }

  // ---- join / slot management (folded in from the old SetupScreen) ----
  connectedPads() {
    const pads = [];
    for (let i = 0; i < MAX_PADS; i++) if (this.input.padConnected(i)) pads.push('pad' + i);
    return pads;
  }

  // Seed: connected controllers ARE players; otherwise the local keyboard/
  // touch human alone, with the second side reading PRESS A TO JOIN.
  //
  // A CPU IS NEVER ASSUMED. It is in the match only if somebody ADDED one, or
  // as the STAND-IN for a lone player: when the only human locks in and
  // nobody else is there, a CPU (`auto: true`, pick RANDOM) takes the empty
  // side so there is someone to fight — and A starts the match with it as
  // it stands. It goes again the moment it stops being needed: that player
  // unlocking takes it away, and a second human joining takes its seat.
  defaultSlots() {
    const fill = (first) => [...first, ...Array.from({ length: MAX_FIGHTERS - first.length }, () => ({ kind: 'off' }))];
    const pads = this.connectedPads();
    if (pads.length >= 2) return fill([{ kind: 'human', device: pads[0] }, { kind: 'human', device: pads[1] }]);
    const solo = pads.length === 1 ? { kind: 'human', device: pads[0] }
      : this.touch ? { kind: 'human', device: 'touch' } : { kind: 'human', device: 'kb1' };
    return fill([solo]);
  }

  autoCpu() { return this.slots.findIndex((s) => s.kind === 'ai' && s.auto); }

  padsIn() { return this.input.connectedPadCount() > 0; }

  // a click on a robot while controllers are connected (see the grid click)
  padClick(i) {
    let pk = this.pickers.find((p) => p.device === 'kb1');
    if (!pk) {
      if (!this.joinDevice('kb1')) return;
      pk = this.pickers.find((p) => p.device === 'kb1');
      if (!pk) return;
      pk.mouseJoined = true;
      pk.justJoined = false;
      pk.cursor = i;
      this.lockIn(pk);
      return;
    }
    pk.sel = null;
    if (pk.locked) {
      if (pk.cursor === i) {
        this.unlock(pk);
        if (pk.mouseJoined) this.removeSlot(pk.slotIdx);
        return;
      }
      const cpu = this.cpuTarget();
      if (cpu >= 0) this.setCpuPick(cpu, i);
      return;
    }
    pk.cursor = i;
    this.lockIn(pk);
  }

  // WHICH ONE AM I? A trigger on a pad flashes that player's colour round
  // their own place in the grid: two rings spreading off the cell and their
  // tag over it — with four cursors on one grid, the quickest answer there is.
  ping(pk) {
    const cell = this.cells[pk.cursor];
    if (!cell) return;
    const b = this.band.getBoundingClientRect(), r = cell.getBoundingClientRect();
    const d = el('div', 'sel-ping', `<i></i><i></i><b>${t('select.tagP', { n: pk.slotIdx + 1 })}</b>`);
    d.style.cssText = `--pc:${COLOR_CSS[pk.slotIdx % COLOR_CSS.length]};left:${r.left - b.left}px;top:${r.top - b.top}px;` +
      `width:${r.width}px;height:${r.height}px`;
    this.band.appendChild(d);
    cell.classList.remove('pinged');
    void cell.offsetWidth;
    cell.classList.add('pinged');
    cell.style.setProperty('--ping', COLOR_CSS[pk.slotIdx % COLOR_CSS.length]);
    this.audio?.play('uiMove');
    setTimeout(() => { d.remove(); cell.classList.remove('pinged'); }, 950);
  }

  // the seat a joining human takes: the stand-in CPU's first, else the first
  // empty one
  joinSlot() {
    const a = this.autoCpu();
    return a >= 0 ? a : this.firstOff();
  }

  // a lone locked player gets the stand-in; anything else drops it
  syncAutoCpu() {
    const a = this.autoCpu();
    const humans = this.pickers.length;
    const others = this.slots.filter((x, i) => x.kind !== 'off' && i !== a).length;
    const want = humans === 1 && this.pickers[0].locked && others === 1;
    if (want && a < 0) {
      const slot = this.firstOff();
      if (slot >= 0) this.slots[slot] = { kind: 'ai', diff: 'rookie', pick: 'random', auto: true };
    } else if (!want && a >= 0 && (humans !== 1 || !this.pickers[0].locked)) {
      this.slots[a] = { kind: 'off' };
    }
  }

  deviceTaken(device, exceptSlot) {
    return this.slots.some((s, i) => i !== exceptSlot && s.kind === 'human' && s.device === device);
  }

  firstOff() { return this.slots.findIndex((s) => s.kind === 'off'); }
  activeCount() { return this.slots.filter((s) => s.kind !== 'off').length; }

  // add a human bound to `device` in the first free slot (join-by-press)
  joinDevice(device) {
    if (this.deviceTaken(device, -1)) return false;
    const slot = this.joinSlot();
    if (slot < 0) return false;
    this.slots[slot] = { kind: 'human', device };
    this.audio?.play('uiSelect');
    if (device.startsWith('pad')) this.input.rumble(+device[3], 0.4, 120);
    this.syncPickers();
    // the picker just created should not also consume this frame's confirm
    const pk = this.pickers.find((p) => p.slotIdx === slot);
    if (pk) pk.justJoined = true;
    this.refresh();
    return true;
  }

  onCardClick(i, e) {
    const s = this.slots[i];
    // a tap on a color swatch retunes that slot's scheme, nothing else
    const sw = e.target.closest?.('.pc-swatch');
    if (sw && s.kind === 'human') {
      const pk = this.pickers.find((p) => p.slotIdx === i);
      if (pk) {
        pk.variant = +sw.dataset.variant;
        this.variants[i] = pk.variant;
        this.audio?.play('uiMove');
        this.refresh();
      }
      return;
    }
    // the ◀ ▶ beside the paint name step it, same as the pad's ←→
    const pa = e.target.closest?.('.pc-paint-step');
    if (pa && s.kind === 'human') {
      const pk = this.pickers.find((p) => p.slotIdx === i);
      if (pk) this.stepPaint(pk, +pa.dataset.dir);
      return;
    }
    // the ◀ ▶ on a CPU tag set its temper directly — the one thing the
    // mouse does that the slot ring doesn't
    const arrow = e.target.closest?.('.pc-diff');
    if (arrow && s.kind === 'ai') { this.cycleAiDiff(i, +arrow.dataset.dir); return; }
    const pk = this.mousePicker;
    // your own side is HOME on the slot ring: while you are visiting another
    // slot it brings you back, and only a click on your own TAG leaves the
    // match (mouse users; pickers otherwise use B) — the rest of your side is
    // your robot, and clicking a picture should not throw you out
    if (pk && i === pk.slotIdx) {
      if (pk.sel != null) this.clearMouseSel(pk);
      else if (e.target.closest?.('.sd-tag')) this.removeSlot(i);
      return;
    }
    // somebody else's pad/touch seat is theirs alone — same slots the
    // controller selector refuses to sit on
    if (s.kind === 'human' && s.device !== 'kb1' && s.device !== 'kb2') return;
    // A CLICK VISITS A SLOT, exactly as LB/RB do: the first click puts your
    // focus on the side (framed in your colour, and ↑↓ now drive it), and
    // clicking the side you are already on walks its options — so the mouse
    // and the bumpers reach the same state rather than each having their own.
    if (pk && pk.sel !== i) {
      pk.sel = i;
      this.audio?.play('uiMove');
      this.refresh();
      return;
    }
    // no mouse picker to hold the focus (everyone is on a pad): a click is
    // still the plain step through the ring it always was
    this.cycleMouse(i, 1);
  }

  // drop a pointer-placed slot focus — a click on the card you are visiting,
  // a click on the grid, or a click on the bare screen behind the UI
  clearMouseSel(pk = this.mousePicker) {
    if (!pk || pk.sel == null) return;
    pk.sel = null;
    this.audio?.play('uiBack');
    this.refresh();
  }

  // the ring a CLICK walks: the controller's stops minus the CPU difficulty
  // tiers (those live on the tag's ◀ ▶), so CPU is one entry
  mouseOptions(i) {
    return this.remoteOptions(i).filter((o) => o.kind !== 'ai' || o.diff === 'rookie');
  }

  cycleMouse(i, dir = 1) {
    const opts = this.mouseOptions(i);
    const s = this.slots[i];
    // an 'ai' stop matches whatever temper the slot is already on
    let cur = opts.findIndex((o) => o.kind === s.kind &&
      (o.kind !== 'human' || o.device === s.device));
    if (cur < 0) cur = 0;
    this.slots[i] = { ...opts[(cur + dir + opts.length) % opts.length] };
    this.audio?.play(this.slots[i].kind === 'off' ? 'uiBack' : 'uiSelect');
    this.syncPickers();
    this.refresh();
    if (this.activeCount() === 0) this.onBack();
  }

  cycleAiDiff(i, dir) {
    // TRAINING PARTNER below rookie (ai.js DIFF_ORDER), wrapping both ways
    const order = DIFF_ORDER;
    const cur = order.indexOf(this.slots[i].diff);
    // the temper changes, the robot it dealt itself does not
    this.slots[i] = { ...this.slots[i], kind: 'ai', diff: order[(cur + dir + order.length) % order.length] };
    this.audio?.play('uiMove');
    this.refresh();
  }

  removeSlot(i) {
    this.slots[i] = { kind: 'off' };
    this.audio?.play('uiBack');
    this.syncPickers();
    this.refresh();
    if (this.activeCount() === 0) this.onBack();
  }

  // ---- slot selector: LB/RB walk your focus onto any slot that isn't a
  // controller's (the next empty seat, CPU, or keyboard seat — never a
  // pad/touch human, never your own) so anyone at the table can add/remove/
  // retune AI bots and stage keyboard seats. ↑/↓ cycle what lives in the
  // focused slot, B comes home. ----

  // a slot the selector may sit on: the FIRST empty seat (the only one the
  // layout draws — you fill seats in order), CPU, or a keyboard-seat human
  editable(i, pk) {
    const s = this.slots[i];
    if (i === pk.slotIdx) return false; // that's home, not a stop
    if (s.kind === 'off') return i === this.firstOff();
    return s.kind !== 'human' || s.device === 'kb1' || s.device === 'kb2';
  }

  // ring of selectable stops for a picker: home (null) + every editable
  // slot + the corner hot buttons (settings/sound) as 'hot<idx>' stops
  moveSel(pk, dir) {
    const ring = [null];
    this.slots.forEach((s, i) => { if (this.editable(i, pk)) ring.push(i); });
    this.hotButtons.forEach((_, j) => ring.push('hot' + j));
    if (ring.length === 1) { pk.sel = null; return; } // nothing to edit
    const cur = Math.max(0, ring.indexOf(pk.sel));
    pk.sel = ring[(cur + dir + ring.length) % ring.length];
    this.audio?.play('uiMove');
    this.refresh();
  }

  // what a remote slot can be cycled through: empty → CPU (every temper,
  // training partner to ace) → any keyboard seat that isn't already claimed
  remoteOptions(i) {
    const opts = [{ kind: 'off' }, ...DIFF_ORDER.map((diff) => ({ kind: 'ai', diff }))];
    if (!this.deviceTaken('kb1', i)) opts.push({ kind: 'human', device: 'kb1' });
    if (!this.deviceTaken('kb2', i)) opts.push({ kind: 'human', device: 'kb2' });
    return opts;
  }

  cycleRemote(i, dir) {
    const opts = this.remoteOptions(i);
    const s = this.slots[i];
    let cur = opts.findIndex((o) => o.kind === s.kind &&
      (o.kind !== 'ai' || o.diff === s.diff) && (o.kind !== 'human' || o.device === s.device));
    if (cur < 0) cur = 0;
    const next = { ...opts[(cur + dir + opts.length) % opts.length] };
    // stepping between CPU tempers keeps the robot the CPU dealt itself
    if (next.kind === 'ai' && s.kind === 'ai') next.pick = s.pick;
    this.slots[i] = next;
    this.audio?.play(this.slots[i].kind === 'off' ? 'uiBack' : 'uiSelect');
    // NOTE: keyboard seats do NOT eject the selector — landing on kb1/kb2
    // mid-cycle is just a stop on the wheel, so a controller can keep
    // cycling straight past it (syncPickers keeps picker objects, so every
    // pk.sel survives the rebuild)
    this.syncPickers();
    this.refresh();
  }

  // A CPU'S PICK DEFAULTS TO RANDOM (`slot.pick`, a roster id or 'random'),
  // shown on its side and tagged in the grid. It can be changed: once every
  // human is locked in, the arrows (or a click on a robot) steer the first
  // CPU's cursor — the fighting-game "choose your opponent" — and a CPU seat
  // visited with LB/RB steps its pick with ←/→. A picked robot is built in
  // the background like any settled pick.
  ensureCpuPicks() {
    this.slots.forEach((s) => {
      if (s.kind === 'ai' && !(s.pick === 'random' || this.byId[s.pick])) s.pick = 'random';
    });
  }

  // the CPU the locked humans are steering: the first one, once nobody is
  // still choosing their own robot
  cpuTarget() {
    if (!this.pickers.length || !this.pickers.every((p) => p.locked)) return -1;
    return this.slots.findIndex((x) => x.kind === 'ai');
  }

  cpuCursor(i) {
    const p = this.slots[i]?.pick;
    const k = this.roster.findIndex((m) => m.id === p);
    return k < 0 ? this.roster.length : k;   // RANDOM is the last cell
  }

  setCpuPick(i, cursor) {
    const s = this.slots[i];
    if (!s || s.kind !== 'ai') return;
    const m = this.pickAt(cursor);
    if (s.pick === m.id) return;
    s.pick = m.id;
    this.audio?.play('uiMove');
    const key = `cpu${i}`;
    clearTimeout(this._settle.get(key)?.timer);
    if (m !== RANDOM_PICK) {
      this._settle.set(key, { key, timer: setTimeout(() => this.onSettle?.(m.id, 0), SETTLE_MS) });
    }
    this.refresh();
  }

  // rebuild pickers to match the human slots, preserving per-slot state
  syncPickers() {
    const keep = new Map(this.pickers.map((p) => [p.slotIdx, p]));
    this.pickers = [];
    this.slots.forEach((s, i) => {
      if (s.kind !== 'human') return;
      let p = keep.get(i);
      if (!p || p.device !== s.device) {
        p = { slotIdx: i, device: s.device, cursor: this.pickers.length % this.roster.length, locked: false, variant: 0 };
      }
      this.pickers.push(p);
    });
    // the mouse drives the touch / keyboard seat; with no such seat it may
    // borrow the first picker only while no controller is connected
    this.mousePicker = this.pickers.find((p) => p.device === 'touch')
      || this.pickers.find((p) => p.device === 'kb1') || (this.padsIn() ? null : this.pickers[0]);
    this.syncAutoCpu();
    this.ensureCpuPicks();
    // line-up changed (join/leave/device cycle): the everyone-locked gate
    // only stays armed while every current picker is still locked
    if (this.ready && !(this.pickers.length > 0 && this.pickers.every((p) => p.locked) && this.activeCount() >= 2)) {
      this.disarmReady();
    }
  }

  // what a cursor is parked on (last cell in the grid is RANDOM)
  pickAt(cursor) { return pickFrom(this.roster, cursor); }

  // ---- layout: which side each slot is drawn on ----
  // Two in the match: a half each. Three or four: a quadrant each. Five to
  // eight: ROWS — each half of the screen is cut into three or four strips
  // down the band's slanted edge, alternating left/right in slot order.
  // The drawn cells are the active slots plus, while there is room, the first
  // empty one (a JOIN); once every cell is taken, the next empty slot is the
  // ＋ chip under the grid.
  layout() {
    const active = [];
    this.slots.forEach((s, i) => { if (s.kind !== 'off') active.push(i); });
    const n = active.length;
    const pos = new Array(this.slots.length).fill('none');
    const mode = n >= ROWS_FROM ? 'rows' : n >= LAYOUT_QUAD ? 'quad' : 'duel';
    const cellCount = mode === 'duel' ? 2 : mode === 'quad' ? 4 : 2 * Math.ceil(n / 2);
    const cells = [...active];
    const off = this.slots.map((s, i) => (s.kind === 'off' ? i : -1)).filter((i) => i >= 0);
    while (cells.length < cellCount && off.length) cells.push(off.shift());
    cells.sort((a, b) => a - b);
    const rows = cellCount / 2;
    cells.forEach((slot, k) => {
      if (mode === 'duel') pos[slot] = k === 0 ? 'l' : 'r';
      else if (mode === 'quad') pos[slot] = ['tl', 'tr', 'bl', 'br'][k];
      else pos[slot] = k % 2 ? 'r' : 'l';
      this.placeRow(slot, mode === 'rows' ? Math.floor(k / 2) : -1, rows, k % 2 === 1);
    });
    this.slots.forEach((_, i) => { if (!cells.includes(i)) this.placeRow(i, -1); });
    // no JOIN cell on screen and a seat still free: the ＋ chip adds one
    if (off.length && cells.every((i) => this.slots[i].kind !== 'off')) pos[off[0]] = 'chip';
    this.el.classList.toggle('quad', mode === 'quad');
    this.el.classList.toggle('rows', mode === 'rows');
    const brawl = mode !== 'duel';
    this.heading.textContent = brawl ? t('select.brawl', { n }) : t('select.vs');
    this.heading.classList.toggle('vs', !brawl);
    return pos;
  }

  // A ROW CELL's geometry. The band's edges are the lines in style.css
  // (--bl0/--bl1 on the left, --br0/--br1 on the right, top to bottom), so a
  // strip from height ya to yb is as wide as the band edge lets it be at its
  // top and is cut along that same line — stated here as numbers because a
  // strip's clip has to be worked out per row. row < 0 clears it back to the
  // stylesheet's own placement.
  placeRow(i, row, rows = 1, right = false) {
    const st = this.sides[i].style;
    this.sides[i].dataset.row = row;   // the top-right strip's tag clears the corner buttons
    if (row < 0) {
      for (const k of ['left', 'right', 'top', 'bottom', 'width', 'height', 'clipPath']) st[k] = '';
      return;
    }
    const ya = row / rows, yb = (row + 1) / rows;
    const [e0, e1] = right ? [BAND.br0, BAND.br1] : [BAND.bl0, BAND.bl1];
    const xa = e0 + (e1 - e0) * ya, xb = e0 + (e1 - e0) * yb;
    st.top = ya * 100 + '%';
    st.bottom = 'auto';
    st.height = 100 / rows + '%';
    if (right) {
      const lo = Math.min(xa, xb);
      st.left = 'auto'; st.right = '0';
      st.width = 100 - lo + '%';
      st.clipPath = `polygon(${((xa - lo) / (100 - lo)) * 100}% 0, 100% 0, 100% 100%, ${((xb - lo) / (100 - lo)) * 100}% 100%)`;
    } else {
      const hi = Math.max(xa, xb);
      st.left = '0'; st.right = 'auto';
      st.width = hi + '%';
      st.clipPath = `polygon(0 0, ${(xa / hi) * 100}% 0, ${(xb / hi) * 100}% 100%, 0 100%)`;
    }
  }

  refresh() {
    const pos = this.layout();
    // grid: a tag per player whose cursor (or CPU pick) is on the cell
    this.cells.forEach((c, i) => {
      c.className = 'sel-cell';
      const tags = [];
      for (const pk of this.pickers) {
        if (pk.cursor !== i) continue;
        c.classList.add(pk.locked ? 'locked-pick' : 'cursor');
        c.style.setProperty('--pc', COLOR_CSS[pk.slotIdx % COLOR_CSS.length]);
        tags.push(`<span style="--pc:${COLOR_CSS[pk.slotIdx % COLOR_CSS.length]}">${t('select.tagP', { n: pk.slotIdx + 1 })}</span>`);
      }
      const steer = this.cpuTarget();
      this.slots.forEach((s, j) => {
        if (s.kind === 'ai' && this.cpuCursor(j) === i) {
          tags.push(`<span class="cpu" style="--pc:${COLOR_CSS[j % COLOR_CSS.length]}">${t('select.tagCpu')}</span>`);
          if (j === steer) { c.classList.add('cursor'); c.style.setProperty('--pc', COLOR_CSS[j % COLOR_CSS.length]); }
        }
      });
      c.querySelector('.cell-tags').innerHTML = tags.join('');
    });
    // corner hot buttons: frame in the visiting player's color
    this.hotButtons.forEach((b, j) => {
      const ed = this.pickers.find((p) => p.sel === 'hot' + j);
      frameHotButton(b, ed ? COLOR_CSS[ed.slotIdx % COLOR_CSS.length] : null);
    });
    // the grid scrolls once the roster outgrows it — keep cursors in view
    for (const pk of this.pickers) {
      if (!pk.locked) this.cells[pk.cursor]?.scrollIntoView?.({ block: 'nearest' });
    }
    this.slots.forEach((_, i) => this.renderSide(i, pos[i]));
    for (const pk of this.pickers) this.settle(pk);
  }

  // a pick that sits still for SETTLE_MS (or is locked) is built behind the
  // scenes — see the header. RANDOM has no body to build.
  settle(pk, now = false) {
    const m = this.pickAt(pk.cursor);
    const key = `${m.id}|${pk.variant}`;
    const cur = this._settle.get(pk.slotIdx);
    if (cur?.key === key && !now) return;
    clearTimeout(cur?.timer);
    const st = { key, timer: 0 };
    this._settle.set(pk.slotIdx, st);
    if (m === RANDOM_PICK) return;
    const go = () => this.onSettle?.(m.id, pk.variant);
    if (now || pk.locked) go(); else st.timer = setTimeout(go, SETTLE_MS);
  }

  deviceLabel(device) {
    if (device.startsWith('pad')) {
      let n = 0;
      for (let i = 0; i < MAX_PADS; i++) { if (this.input.padConnected(i)) { n++; if (i === +device[3]) return t('device.pad', { n }); } }
      return t('device.pad', { n: +device[3] + 1 });
    }
    const id = { touch: 'device.touch', kb1: 'device.kb1', kb2: 'device.kb2' }[device];
    return id ? t(id) : device.toUpperCase();
  }

  // ---- one side ----
  renderSide(i, pos) {
    const s = this.slots[i];
    const sd = this.sides[i];
    const col = COLOR_CSS[i % COLOR_CSS.length];
    const cls = ['sel-side', `pos-${pos}`];
    sd.style.setProperty('--pc', col);
    // slot-selector focus: frame the side in the VISITING player's color
    const ed = this.pickers.find((p) => p.sel === i);
    if (ed) { cls.push('editing'); sd.style.setProperty('--ed', COLOR_CSS[ed.slotIdx % COLOR_CSS.length]); }
    sd.querySelector('.sd-edit').innerHTML = ed ? t('select.editing', { n: ed.slotIdx + 1 }) : '';
    const q = (sel) => sd.querySelector(sel);

    if (pos === 'none' || s.kind === 'off') {
      cls.push('empty');
      sd.className = cls.join(' ');
      this.setPic(i, null, 0);
      q('.sd-tag').innerHTML = '';
      q('.sd-join').innerHTML = pos === 'chip'
        ? `${t('select.addPlayer')}`
        : `<div><b>${t('select.join')}</b><small>${t(this.touch ? 'select.joinHintTouch' : 'select.joinHint')}</small></div>`;
      sd.style.setProperty('--g', '#3a4a5e');
      return;
    }

    let m, v = 0, tag, locked = false;
    if (s.kind === 'ai') {
      m = this.byId[s.pick] || RANDOM_PICK;
      cls.push('cpu');
      if (i === this.cpuTarget()) cls.push('steer');
      q('.sd-steer').textContent = t(this.touch ? 'select.cpuSteerTouch' : 'select.cpuSteer');
      tag = `${t('select.tagCpu')} · <span class="pc-diff" data-dir="-1">◀</span>${t('diff.' + s.diff)}<span class="pc-diff" data-dir="1">▶</span>`;
    } else {
      const pk = this.pickers.find((p) => p.slotIdx === i);
      m = this.pickAt(pk.cursor);
      v = pk.variant;
      locked = pk.locked;
      tag = t('select.tagHuman', { n: i + 1, device: this.deviceLabel(s.device) });
      cls.push(locked ? 'locked' : 'picking');
      q('.sd-paint').innerHTML = this.paintRow(m, pk);
    }
    if (s.kind === 'ai') q('.sd-paint').innerHTML = '';
    if (m === RANDOM_PICK) cls.push('random');
    sd.className = cls.join(' ') + (sd.classList.contains('flash') ? ' flash' : '');
    // THE WASH IS THE MECH'S OWN GLOW, whatever the paint: a backdrop that
    // recolours with the robot makes the whole side one colour (the "too much
    // matching" look). The paint shows on the robot and in the swatch strip.
    // …and it belongs to the ROBOT ON SCREEN, so it changes when the picture
    // does (setPic), not when the cursor moves: a poster not yet fetched used
    // to leave the old robot standing in the new one's colours, glow and all,
    // until it arrived — a colour flash on every first visit to a robot
    const glow = hexCss(m.colors.glow);
    this.sideState[i].glow = glow;
    if (m === RANDOM_PICK || !this.postersReady) sd.style.setProperty('--g', glow);
    q('.sd-tag').innerHTML = tag;
    q('.sd-tag').dataset.lock = t('select.lockedStamp');
    q('.sd-join').innerHTML = '';
    q('.sd-name').textContent = m.name;
    q('.sd-title').textContent = m.title;
    q('.sd-stats').innerHTML = m === RANDOM_PICK
      ? ['power', 'speed', 'defense'].map((k) => `<div><small>${t('select.stat.' + k)}</small><b>?</b></div>`).join('')
      : ['power', 'speed', 'defense'].map((k) => `<div><small>${t('select.stat.' + k)}</small><b>${m.ui[k]}</b></div>`).join('');
    q('.sd-moves').innerHTML = m === RANDOM_PICK
      ? `<div>${m.blurb}</div>`
      : `<div><small>${t('select.move.ranged')}</small>${m.moves.ranged.name}</div>
         <div><small>${t('select.move.special')}</small>${m.moves.special.name}</div>
         <div><small>${t('select.move.ult')}</small>${m.moves.ult.name}</div>`;
    this.setPic(i, m === RANDOM_PICK ? null : m.id, v);
  }

  // THE PICTURE ON A SIDE. The stock paint is its poster, at once. A repaint
  // is photographed (snapshot.js) once the paint has sat still for a beat;
  // until it lands the side keeps what it was showing if that is the same
  // robot (the old paint), else the stock poster — never a blank.
  // A DIFFERENT ROBOT slides in. THE SAME ROBOT IN NEW PAINT is a plain
  // CROSSFADE — the new picture fades up over the old one, nothing moves —
  // and while it is being photographed, and on through the fade, the side
  // is SPRAY-PAINTED in the new colour (PaintSpray): the wait is a few
  // seconds on a slow machine, and a robot being resprayed is something to
  // watch where a robot standing still reads as nothing happening.
  setPic(i, id, v) {
    if (!this.postersReady) return;
    const st = this.sideState[i];
    const sd = this.sides[i];
    const spray = this.sprays[i];
    const img = sd.querySelector('.sd-pic');
    const want = id ? `${id}|${v}` : null;
    if (st.want === want) return;
    st.want = want;
    clearTimeout(st.timer);
    if (!id) {
      img.removeAttribute('src'); img.classList.remove('in'); st.shownId = null;
      if (st.glow) sd.style.setProperty('--g', st.glow);
      spray.stop(0);
      return;
    }
    // nothing on screen yet (the screen just opened): no robot's colours to
    // keep, so the side takes the new one's at once
    if (!img.getAttribute('src')) sd.style.setProperty('--g', st.glow);
    const repaint = st.shownId === id;
    if (repaint) spray.start(hexCss(schemeSwatch(this.byId[id] || RANDOM_PICK, v)));
    else spray.stop(0);
    const show = (url) => {
      const fresh = st.shownId !== id;
      st.shownId = id;
      if (img.getAttribute('src') === url) {
        img.classList.add('in'); spray.stop(SPRAY_TAIL); sd.style.setProperty('--g', st.glow);
        return;
      }
      preload(url).then((ok) => {
        if (!ok || st.want !== want) return;
        sd.querySelectorAll('.sd-ghost').forEach((g) => g.remove());
        if (fresh) {
          sd.style.setProperty('--g', st.glow);
          img.style.setProperty('--k', picScale(id));
          img.classList.remove('in', 'swap');
          img.src = url;
          void img.offsetWidth;
          img.classList.add('in', 'swap');
          return;
        }
        // the old paint stays put UNDERNEATH while the new one fades up on
        // top of it, then goes — two cutouts of the same pose, so what the
        // eye sees is the colour changing and nothing else
        const ghost = img.cloneNode();
        ghost.className = 'sd-pic sd-ghost in';
        img.before(ghost);
        img.classList.add('xfade');
        img.classList.remove('in', 'swap');
        img.src = url;
        void img.offsetWidth;
        img.classList.add('in');
        setTimeout(() => { ghost.remove(); img.classList.remove('xfade'); }, XFADE_MS + 60);
        spray.stop(SPRAY_TAIL);
      });
    };
    const ready = shotUrl(id, v);
    if (ready) { show(ready); return; }
    if (st.shownId !== id) {
      const stock = shotUrl(id, 0);
      if (stock) show(stock);
      else { img.classList.remove('in'); st.shownId = null; sd.style.setProperty('--g', st.glow); }
    }
    st.timer = setTimeout(() => {
      requestShot(id, v, `side${i}`).then((url) => {
        if (st.want !== want) return;
        if (url) show(url); else spray.stop(0);
      });
    }, SHOT_DEBOUNCE);
  }

  // the paint strip on a human's side: one clickable swatch per scheme
  // (X/R and ←/→ once locked still cycle for pads/keyboards), and the
  // scheme's NAME between ◀ ▶, which is what makes the cycling discoverable
  paintRow(m, pk) {
    let row = '';
    for (let v = 0; v < SCHEME_COUNT; v++) {
      const col = hexCss(schemeSwatch(m, v));
      row += `<span class="pc-swatch${pk.variant === v ? ' on' : ''}" data-variant="${v}"
        title="${SCHEME_NAMES[v]}" style="background:${col};"></span>`;
    }
    return `<div class="pc-swatches" title="${t('select.colorHint')}">${row}</div>
      <div class="pc-paint-name"><span class="pc-paint-step" data-dir="-1">◀</span>${t('select.colorLabel')} · ${SCHEME_NAMES[pk.variant]}<span class="pc-paint-step" data-dir="1">▶</span></div>`;
  }

  stepPaint(pk, dir) {
    pk.variant = (pk.variant + dir + SCHEME_COUNT) % SCHEME_COUNT;
    this.variants[pk.slotIdx] = pk.variant;
    this.audio?.play('uiMove');
    this.refresh();
  }

  lockIn(pk) {
    if (pk.locked || this.finished) return;
    // duplicate mech: auto-bump to the next free paint scheme so two
    // players on the same robot can always tell each other apart
    const clash = () => this.pickers.some((o) =>
      o !== pk && o.locked && o.cursor === pk.cursor && o.variant === pk.variant);
    for (let tries = 0; clash() && tries < SCHEME_COUNT; tries++) {
      pk.variant = (pk.variant + 1) % SCHEME_COUNT;
    }
    pk.locked = true;
    this.picks[pk.slotIdx] = this.pickAt(pk.cursor).id;
    this.variants[pk.slotIdx] = pk.variant;
    this.audio?.play('uiSelect');
    if (pk.device.startsWith('pad')) this.input.rumble(+pk.device[3], 0.45, 130);
    this.refresh();
    this.settle(pk, true);
    // the lock-in flourish: a flash across the side and the LOCKED stamp
    const sd = this.sides[pk.slotIdx];
    sd.classList.remove('flash');
    void sd.offsetWidth;
    sd.classList.add('flash');
    clearTimeout(sd._flashT);
    sd._flashT = setTimeout(() => sd.classList.remove('flash'), 700);
    // a lone player locking in is joined by the stand-in CPU
    this.syncAutoCpu();
    this.ensureCpuPicks();
    this.refresh();
    // everyone locked AND at least two fighters in the match → ARM the
    // gate; the screen only advances on an explicit extra confirm, so the
    // last player to lock can still adjust their color scheme
    if (this.pickers.every((p) => p.locked) && this.activeCount() >= 2) this.armReady();
  }

  // let a locked pick go and carry on choosing (B on a pad, a second click
  // on your own robot with the mouse)
  unlock(pk) {
    if (!pk.locked) return;
    pk.locked = false;
    this.picks[pk.slotIdx] = null;
    this.disarmReady();
    this.syncAutoCpu();   // the stand-in only stands in for a locked player
    this.audio?.play('uiBack');
    this.refresh();
  }

  armReady() {
    if (this.ready) return;
    this.ready = true;
    this._readyAt = performance.now();
    this.readyBar.style.display = '';
  }

  disarmReady() {
    if (!this.ready) return;
    this.ready = false;
    this.readyBar.style.display = 'none';
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    // CPU slots fight as what they show — a robot, or RANDOM (dealt at the
    // bell like a human's RANDOM)
    this.ensureCpuPicks();
    this.slots.forEach((s, i) => { if (s.kind === 'ai') this.picks[i] = s.pick; });
    // brief beat so the last lock-in lands before the screen changes;
    // hand back the slots so returning here restores the same line-up
    setTimeout(() => this.onDone(this.picks, this.variants, this.slots.map((s) => ({ ...s }))), 450);
  }

  // devices that could still join (not already a human slot)
  joinCandidates() {
    const taken = new Set(this.slots.filter((s) => s.kind === 'human').map((s) => s.device));
    const list = [];
    if (!taken.has('kb1')) list.push('kb1');
    if (!taken.has('kb2')) list.push('kb2');
    for (let i = 0; i < MAX_PADS; i++) if (this.input.padConnected(i) && !taken.has('pad' + i)) list.push('pad' + i);
    return list;
  }

  update(evAll) {
    const nowS = performance.now();
    const sdt = Math.min(0.05, (nowS - this._sprayT) / 1000);
    this._sprayT = nowS;
    for (const s of this.sprays) s.step(sdt);
    if (this.finished) return;

    // a freshly connected controller auto-joins the next free slot
    const padCount = this.input.connectedPadCount();
    if (padCount !== this._padCount) {
      if (padCount > this._padCount) {
        for (let i = 0; i < MAX_PADS; i++) {
          if (this.input.padConnected(i) && !this.deviceTaken('pad' + i, -1) && this.joinSlot() >= 0) this.joinDevice('pad' + i);
        }
      }
      this._padCount = padCount;
      this.syncPickers();   // who the mouse drives depends on it
      this.refresh(); // ordinal labels shift when pads come and go
    }

    // join-by-press: an unassigned device that hits confirm joins the match
    if (this.joinSlot() >= 0) {
      for (const dev of this.joinCandidates()) {
        if (this.input.menuEventsFor(dev).confirm) { this.joinDevice(dev); break; }
      }
    }

    const solo = this.pickers.length === 1;
    for (const pk of this.pickers) {
      const ev = this.input.menuEventsFor(pk.device);
      // a lone human may also drive with the shared keyboard/mouse events
      const left = ev.left || (solo && evAll?.left);
      const right = ev.right || (solo && evAll?.right);
      const up = ev.up || (solo && evAll?.up);
      const down = ev.down || (solo && evAll?.down);
      const confirm = (ev.confirm || (solo && evAll?.confirm)) && !pk.justJoined;
      const back = ev.back || (solo && evAll?.back);
      const alt = ev.alt || (solo && evAll?.alt);
      pk.justJoined = false;
      if (ev.ping) this.ping(pk);

      // ---- slot selector: LB/RB step the focus across editable slots ----
      // (a slot that turned into a CONTROLLER human under our focus — e.g.
      // a pad joined into it — is no longer ours to edit, so the selector
      // springs home; keyboard seats stay editable)
      if (typeof pk.sel === 'number' && !this.editable(pk.sel, pk)) pk.sel = null;
      if (ev.lb || ev.rb) { this.moveSel(pk, ev.rb ? 1 : -1); continue; }
      if (pk.sel != null) {
        // corner hot buttons (settings/sound): A activates, B comes home
        if (typeof pk.sel === 'string') {
          if (confirm) { this.audio?.play('uiSelect'); this.hotButtons[+pk.sel.slice(3)]?.activate(); }
          if (back) { pk.sel = null; this.audio?.play('uiBack'); this.refresh(); }
          continue;
        }
        // while visiting another slot, your own pick stays parked: nav and
        // confirm belong to the visited slot until B brings you home
        if (up) { this.cycleRemote(pk.sel, 1); return; }
        if (down) { this.cycleRemote(pk.sel, -1); return; }
        if ((left || right) && this.slots[pk.sel]?.kind === 'ai') {
          const N = this.roster.length + 1;
          this.setCpuPick(pk.sel, (this.cpuCursor(pk.sel) + (right ? 1 : -1) + N) % N);
        }
        if (back) { pk.sel = null; this.audio?.play('uiBack'); this.refresh(); }
        continue;
      }

      if (!pk.locked) {
        const N = this.roster.length + 1, cols = 4; // +1: the RANDOM cell
        let moved = false;
        if (left) { pk.cursor = (pk.cursor + N - 1) % N; moved = true; }
        if (right) { pk.cursor = (pk.cursor + 1) % N; moved = true; }
        if (up) { pk.cursor = (pk.cursor + N - cols) % N; moved = true; }
        if (down) { pk.cursor = (pk.cursor + cols) % N; moved = true; }
        if (alt) { pk.variant = (pk.variant + 1) % SCHEME_COUNT; this.variants[pk.slotIdx] = pk.variant; moved = true; }
        if (moved) { this.audio?.play('uiMove'); this.refresh(); }
        if (confirm) this.lockIn(pk);
        // unlocked: back LEAVES the match (frees the slot); syncPickers
        // mutates this.pickers, so bail out of the loop after. A LONE
        // keyboard or touch seat backing out means "back to the title" —
        // freeing the only seat left a picker-less roster with nobody to
        // press anything (right for a four-pad table, wrong for the solo
        // default)
        if (back) {
          if (this.pickers.length === 1 && !String(pk.device).startsWith('pad')) {
            this.audio?.play('uiBack'); this.onBack(); return;
          }
          this.removeSlot(pk.slotIdx); return;
        }
      } else {
        const cpu = this.cpuTarget();
        if (cpu >= 0 && (left || right || up || down)) {
          // everyone is in: the stick is the CPU's cursor now (paint stays
          // on X and the swatches)
          const N = this.roster.length + 1, cols = 4;
          let c = this.cpuCursor(cpu);
          if (left) c = (c + N - 1) % N;
          if (right) c = (c + 1) % N;
          if (up) c = (c + N - cols) % N;
          if (down) c = (c + cols) % N;
          this.setCpuPick(cpu, c);
        } else if (alt || left || right) {
          // colors cycle BOTH ways: right/X steps forward, left steps back
          this.stepPaint(pk, left && !right ? -1 : 1);
        }
        // the everyone-locked gate: a fresh confirm (well after the lock-in
        // press itself) is what actually advances to arena select
        if (confirm && this.ready && performance.now() - this._readyAt > 350) {
          this.finish();
          return;
        }
        if (back) this.unlock(pk); // unlock and keep picking
      }
    }

    // with zero humans left, the shared ESC/B backs out to the title
    if (!this.pickers.length && evAll?.back) { this.audio?.play('uiBack'); this.onBack(); }
  }
  destroy() {
    this.hotButtons.forEach((b) => frameHotButton(b, null));
    window.removeEventListener('click', this.onStrayClick, true);
    for (const st of this._settle.values()) clearTimeout(st?.timer);
    for (const st of this.sideState) clearTimeout(st.timer);
    for (const s of this.sprays) s.stop(0);
    this.el.remove();
  }
}
