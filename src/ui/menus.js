// Menu screens: Title → Setup → Mech Select → Arena Select → (battle) → Results.
// Each screen builds DOM into #ui-root and consumes aggregated menu events.
import { playableRoster } from '../mechs/roster.js';
import { SCHEME_NAMES, SCHEME_COUNT, schemeSwatch } from '../mechs/colorscheme.js';
import { THEMES } from '../arena/themes.js';
import { isTouchDevice } from '../core/utils.js';
import { mechIcon } from './icons.js';
import { PLAYER_COLORS_CSS as COLOR_CSS, hexCss } from '../core/colors.js';
import { t } from '../core/text.js';

// pseudo roster entry: the RANDOM pick (last cell in the grid). Locking it
// deals you a DIFFERENT random robot every round; the color scheme you pick
// here is applied to whatever shows up.
export const RANDOM_PICK = {
  id: 'random', name: t('select.random.name'), title: t('select.random.title'), icon: '❓',
  colors: { primary: 0x3a4a5e, glow: 0x9fd8ef },
  blurb: t('select.random.blurb'),
};
const pickFrom = (list, cursor) => (cursor >= list.length ? RANDOM_PICK : list[cursor]);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// On-screen nav button for touch devices (click fires on tap too).
function touchBtn(label, cls, onTap) {
  const b = el('div', 'touch-navbtn ' + cls, label);
  b.addEventListener('click', (e) => { e.preventDefault(); onTap(); });
  return b;
}

// A floating BACK button, bottom-left, shown only on touch screens.
function appendTouchBack(screenEl, onBack) {
  if (!isTouchDevice()) return;
  screenEl.appendChild(touchBtn(t('nav.back'), 'nav-back', onBack));
}

// Frame a corner "hot button" (settings/sound, owned by boot.js) in a
// focus color while a controller's LB/RB selector is parked on it.
function frameHotButton(b, color) {
  b.el.style.outline = color ? `2px solid ${color}` : '';
  b.el.style.outlineOffset = '3px';
  b.el.style.borderRadius = '8px';
  b.el.style.boxShadow = color ? `0 0 14px ${color}` : '';
  b.el.style.opacity = color ? '1' : '';
}

// Shared vertical menu list used by the title / pause / settings / results
// screens: the item DOM, hover/click selection, the up/down/confirm loop,
// and (title/pause) the LB/RB corner hot-button ring for settings/sound.
class MenuList {
  constructor({ audio, hot = [] } = {}) {
    this.audio = audio;
    this.hot = hot;                // corner buttons (settings/sound)
    this.corner = null;            // index into this.hot while LB/RB-focused
    this.sel = 0;
    this.menu = el('div', 'menu-list');
    this.items = [];
    this.itemEls = [];
  }

  // items: [{ t, fn, ... }] — extra fields (relabel keys etc.) pass through;
  // returns the .menu-list element for the screen to append
  build(items) {
    this.items = items;
    this.itemEls = items.map((it, i) => {
      const e = el('div', 'menu-item' + (i === 0 ? ' selected' : ''), it.t);
      e.addEventListener('click', () => { this.sel = i; this.confirm(); });
      e.addEventListener('mouseenter', () => { this.sel = i; this.refresh(); });
      this.menu.appendChild(e);
      return e;
    });
    return this.menu;
  }

  refresh() {
    this.itemEls.forEach((e, i) => e.classList.toggle('selected', i === this.sel && this.corner == null));
    this.hot.forEach((b, j) => frameHotButton(b, this.corner === j ? 'var(--hud-cyan)' : null));
  }

  confirm() {
    this.audio?.play('uiSelect');
    this.items[this.sel].fn();
  }

  // Corner hot-button ring: LB/RB (Q/E) hop the focus onto the corner
  // buttons (settings/sound); A/ENTER activates, ↑↓ or B/ESC return to the
  // menu list. `onPause` (pause screen only): START still resumes while a
  // corner button is focused. Returns true while the ring owns this
  // frame's input — the caller should bail out of its update.
  hotNav(ev, onPause = null) {
    if (this.hot.length && (ev.lb || ev.rb)) {
      const ring = [null, ...this.hot.map((_, j) => j)];
      const cur = ring.indexOf(this.corner);
      this.corner = ring[(Math.max(0, cur) + (ev.rb ? 1 : -1) + ring.length) % ring.length];
      this.audio?.play('uiMove');
      this.refresh();
      return true;
    }
    if (this.corner != null) {
      if (onPause && ev.pause) { this.corner = null; this.refresh(); onPause(); return true; } // START still resumes
      if (ev.confirm) { this.audio?.play('uiSelect'); this.hot[this.corner].activate(); return true; }
      if (ev.back) { this.corner = null; this.audio?.play('uiBack'); this.refresh(); return true; }
      if (ev.up || ev.down) { this.corner = null; this.audio?.play('uiMove'); this.refresh(); } // rejoin the list
      return true;
    }
    return false;
  }

  // the plain list loop: ↑↓ move the selection, ENTER/A confirms
  nav(ev) {
    const n = this.items.length;
    if (ev.up) { this.sel = (this.sel + n - 1) % n; this.audio?.play('uiMove'); this.refresh(); }
    if (ev.down) { this.sel = (this.sel + 1) % n; this.audio?.play('uiMove'); this.refresh(); }
    if (ev.confirm) this.confirm();
  }

  destroy() {
    this.hot.forEach((b) => frameHotButton(b, null));
  }
}

// ---------------- TITLE ----------------
export class TitleScreen {
  constructor(root, { onPlay, onFullscreen, audio, hotButtons }) {
    this.el = el('div', 'screen fade-in');
    this.el.innerHTML = `
      <div style="text-align:center">
        <div class="mega-title">${t('title.game')}</div>
        <div class="mega-sub">${t('title.tagline')}</div>
      </div>`;
    this.list = new MenuList({ audio, hot: hotButtons });
    this.el.appendChild(this.list.build([
      { t: t('title.menu.battle'), fn: onPlay },
      { t: t('title.menu.fullscreen'), fn: onFullscreen },
    ]));
    // no hint bar here: the title screen is two menu items, and the controls
    // live behind the ⓘ button (the catalogue keeps title.hint.html for
    // anyone who wants it back)
    root.appendChild(this.el);
  }
  update(ev) {
    if (this.list.hotNav(ev)) return;
    this.list.nav(ev);
  }
  destroy() {
    this.list.destroy();
    this.el.remove();
  }
}

// ---------------- FIGHTER SELECT (join + pick, one screen) ----------------
// Players JOIN by connecting/pressing a controller, pressing a keyboard
// confirm, or via the ADD PLAYER card (which can become KB / CPU / pad /
// touch). Every joined human picks a mech + color simultaneously; CPU slots
// randomize a mech once all humans lock in.
export class MechSelectScreen {
  constructor(root, { input, audio, onDone, onBack, onPreview, onLockFx, onYaw, prev, hotButtons }) {
    this.input = input;
    this.audio = audio;
    this.hotButtons = hotButtons || []; // corner settings/sound, LB/RB-reachable
    this.onDone = onDone;
    this.onBack = onBack;
    this.onPreview = onPreview;
    this.onLockFx = onLockFx;   // stage flourish when a pick locks in
    this.onYaw = onYaw;         // right-stick rotation of a locked mech
    this.touch = isTouchDevice();
    this.el = el('div', 'screen fade-in');
    this.el.appendChild(el('div', 'screen-heading', t('select.heading')));

    // slot state (managed here now — the old separate setup screen is gone)
    this.slots = prev || this.defaultSlots();
    this.pickers = [];             // one per human slot (built by syncPickers)
    this.picks = new Array(4).fill(null);
    this.variants = new Array(4).fill(0);
    this.finished = false;
    this._padCount = this.input.connectedPadCount();

    // the grid only offers the playable roster — work-in-progress mechs
    // appear when SETTINGS → SHOW ALL ROBOTS is on (CONFIG.showAllRobots)
    this.roster = playableRoster();

    this.grid = el('div', 'roster-grid');
    this.cells = [...this.roster, RANDOM_PICK].map((m, i) => {
      const c = el('div', 'roster-cell');
      c.innerHTML = m === RANDOM_PICK
        ? `<div class="cell-tint" style="background:linear-gradient(150deg, #2a3a52, transparent)"></div>
           <div class="cell-icon" style="font-size:clamp(26px,3vw,42px)">❓</div>
           <div class="cell-name">${t('select.random.name')}</div>`
        : `<div class="cell-tint" style="background:linear-gradient(150deg, ${hexCss(m.colors.primary)}, transparent)"></div>
           <div class="cell-icon">${mechIcon(m, 52)}</div>
           <div class="cell-name">${m.name}</div>`;
      c.addEventListener('mouseenter', () => {
        if (this.mousePicker && !this.mousePicker.locked) { this.mousePicker.cursor = i; this.refresh(); }
      });
      c.addEventListener('click', () => {
        const pk = this.mousePicker;
        if (!pk || pk.locked) return;
        if (this.touch) {
          if (pk.cursor !== i) { pk.cursor = i; this.audio?.play('uiMove'); this.refresh(); }
        } else if (pk.cursor === i) this.lockIn(pk);
      });
      this.grid.appendChild(c);
      return c;
    });
    this.el.appendChild(this.grid);

    this.card = el('div', 'panel mech-info-card');
    this.el.appendChild(this.card);

    // players bar: join / device / CPU controls, one card per slot.
    // LB/RB badges ride the top corners of the card ROW (not of any one
    // card) — the bumpers walk your focus across the slots.
    this.playersBar = el('div', 'players-bar');
    const cardRow = el('div', 'players-row');
    cardRow.appendChild(el('div', 'pb-bumper left',
      `<b>${t('select.bumperL')}</b> ${t('select.bumperHint')} ◀`));
    cardRow.appendChild(el('div', 'pb-bumper right',
      `▶ ${t('select.bumperHint')} <b>${t('select.bumperR')}</b>`));
    this.playerCards = [];
    for (let i = 0; i < 4; i++) {
      const pc = el('div', 'player-card');
      pc.addEventListener('click', (e) => this.onCardClick(i, e));
      cardRow.appendChild(pc);
      this.playerCards.push(pc);
    }
    this.playersBar.appendChild(cardRow);
    this.el.appendChild(this.playersBar);

    // everyone-locked gate: the match does NOT advance until someone
    // confirms again, so the last player still has time to tweak colors
    this.ready = false;
    this.readyBar = el('div', 'ready-banner', t('select.ready.html'));
    this.readyBar.style.display = 'none';
    this.el.appendChild(this.readyBar);

    this.el.appendChild(el('div', 'hint-bar', t('select.hint.html')));
    root.appendChild(this.el);

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

    this.syncPickers();
    this.refresh();
  }

  // ---- join / slot management (folded in from the old SetupScreen) ----
  connectedPads() {
    const pads = [];
    for (let i = 0; i < 4; i++) if (this.input.padConnected(i)) pads.push('pad' + i);
    return pads;
  }

  // Seed: connected controllers ARE players; otherwise the local keyboard/
  // touch human + one CPU, so a lone player has an opponent to fight.
  defaultSlots() {
    const off = () => ({ kind: 'off' });
    const pads = this.connectedPads();
    if (pads.length >= 2) return [{ kind: 'human', device: pads[0] }, { kind: 'human', device: pads[1] }, off(), off()];
    const solo = pads.length === 1 ? { kind: 'human', device: pads[0] }
      : this.touch ? { kind: 'human', device: 'touch' } : { kind: 'human', device: 'kb1' };
    return [solo, { kind: 'ai', diff: 'rookie' }, off(), off()];
  }

  deviceTaken(device, exceptSlot) {
    return this.slots.some((s, i) => i !== exceptSlot && s.kind === 'human' && s.device === device);
  }

  firstOff() { return this.slots.findIndex((s) => s.kind === 'off'); }
  activeCount() { return this.slots.filter((s) => s.kind !== 'off').length; }

  // add a human bound to `device` in the first free slot (join-by-press)
  joinDevice(device) {
    if (this.deviceTaken(device, -1)) return false;
    const slot = this.firstOff();
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
    // the ◀ ▶ on a CPU card set its temper directly — the one thing the
    // mouse does that the slot ring doesn't
    const arrow = e.target.closest?.('.pc-diff');
    if (arrow && s.kind === 'ai') { this.cycleAiDiff(i, +arrow.dataset.dir); return; }
    // your own card = leave (mouse users; pickers otherwise use B)
    if (i === this.mousePicker?.slotIdx) { this.removeSlot(i); return; }
    // somebody else's pad/touch seat is theirs alone — same slots the
    // controller selector refuses to sit on
    if (s.kind === 'human' && s.device !== 'kb1' && s.device !== 'kb2') return;
    // every other card walks the same ring a controller walks with ↑↓
    this.cycleMouse(i, 1);
  }

  // the ring a CLICK walks: the controller's stops minus the CPU difficulty
  // tiers (those live on the card's ◀ ▶), so CPU is one entry
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
    const order = ['rookie', 'veteran', 'ace'];
    const cur = order.indexOf(this.slots[i].diff);
    this.slots[i] = { kind: 'ai', diff: order[(cur + dir + 3) % 3] };
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
  // controller's (empty, CPU, or keyboard seat — never a pad/touch human,
  // never your own) so anyone at the table can add/remove/retune AI bots
  // and stage keyboard seats. ↑/↓ cycle what lives in the focused slot,
  // B comes home. ----

  // a slot the selector may sit on: empty, CPU, or a keyboard-seat human
  editable(i, pk) {
    const s = this.slots[i];
    if (i === pk.slotIdx) return false; // that's home, not a stop
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

  // what a remote slot can be cycled through: empty → CPU (three tempers) →
  // any keyboard seat that isn't already claimed
  remoteOptions(i) {
    const opts = [{ kind: 'off' },
      { kind: 'ai', diff: 'rookie' }, { kind: 'ai', diff: 'veteran' }, { kind: 'ai', diff: 'ace' }];
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
    this.slots[i] = { ...opts[(cur + dir + opts.length) % opts.length] };
    this.audio?.play(this.slots[i].kind === 'off' ? 'uiBack' : 'uiSelect');
    // NOTE: keyboard seats do NOT eject the selector — landing on kb1/kb2
    // mid-cycle is just a stop on the wheel, so a controller can keep
    // cycling straight past it (syncPickers keeps picker objects, so every
    // pk.sel survives the rebuild)
    this.syncPickers();
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
    this.mousePicker = this.pickers.find((p) => p.device === 'touch')
      || this.pickers.find((p) => p.device === 'kb1') || this.pickers[0];
    // line-up changed (join/leave/device cycle): the everyone-locked gate
    // only stays armed while every current picker is still locked
    if (this.ready && !(this.pickers.length > 0 && this.pickers.every((p) => p.locked) && this.activeCount() >= 2)) {
      this.disarmReady();
    }
  }

  // what a cursor is parked on (last cell in the grid is RANDOM)
  pickAt(cursor) { return pickFrom(this.roster, cursor); }

  refresh() {
    this.cells.forEach((c, i) => {
      c.className = 'roster-cell';
      for (const pk of this.pickers) {
        if (pk.cursor === i && !pk.locked) c.classList.add(`cursor-p${pk.slotIdx + 1}`);
        if (pk.locked && pk.cursor === i) c.classList.add('locked-pick');
      }
    });
    // corner hot buttons: frame in the visiting player's color
    this.hotButtons.forEach((b, j) => {
      const ed = this.pickers.find((p) => p.sel === 'hot' + j);
      frameHotButton(b, ed ? COLOR_CSS[ed.slotIdx % 4] : null);
    });
    // the grid scrolls once the roster outgrows it — keep cursors in view
    for (const pk of this.pickers) {
      if (!pk.locked) this.cells[pk.cursor]?.scrollIntoView?.({ block: 'nearest' });
    }
    this.renderCard();
    this.renderPlayers();
    this.onPreview?.(this.pickers.map((pk) => ({
      id: this.pickAt(pk.cursor).id, slotIdx: pk.slotIdx, locked: pk.locked, variant: pk.variant,
    })));
  }

  deviceLabel(device) {
    if (device.startsWith('pad')) {
      let n = 0;
      for (let i = 0; i < 4; i++) { if (this.input.padConnected(i)) { n++; if (i === +device[3]) return t('device.pad', { n }); } }
      return t('device.pad', { n: +device[3] + 1 });
    }
    const id = { touch: 'device.touch', kb1: 'device.kb1', kb2: 'device.kb2' }[device];
    return id ? t(id) : device.toUpperCase();
  }

  // players bar: join prompts, device/CPU controls, live pick + lock state
  renderPlayers() {
    this.slots.forEach((s, i) => {
      const pc = this.playerCards[i];
      const col = COLOR_CSS[i];
      pc.className = 'player-card';
      // slot-selector focus: frame the card in the visiting player's color
      const ed = this.pickers.find((p) => p.sel === i);
      const edTag = ed
        ? `<div class="pc-sub" style="color:${COLOR_CSS[ed.slotIdx]};font-weight:800;">
             ${t('select.editing', { n: ed.slotIdx + 1 })}</div>`
        : '';
      pc.style.boxShadow = ed ? `0 0 0 3px ${COLOR_CSS[ed.slotIdx]}, 0 0 18px ${COLOR_CSS[ed.slotIdx]}` : '';
      if (s.kind === 'off') {
        pc.classList.add('empty');
        pc.style.borderColor = 'rgba(120,150,180,0.28)';
        pc.innerHTML = `<div class="pc-role" style="color:#6f8aa2">${t('select.player', { n: i + 1 })}</div>
          <div class="pc-add">${t('select.addPlayer')}</div>
          <div class="pc-sub">${t('select.addHint')}</div>${edTag}`;
        return;
      }
      pc.style.borderColor = col;
      if (s.kind === 'ai') {
        pc.innerHTML = `<div class="pc-role" style="color:${col}">${t('select.player', { n: i + 1 })}</div>
          <div class="pc-dev">${t('select.cpu', { diff: t('diff.' + s.diff) })}</div>
          <div class="pc-sub"><span class="pc-diff" data-dir="-1">◀</span>${t('select.cpuHint')}<span
            class="pc-diff" data-dir="1">▶</span></div>${edTag}`;
        return;
      }
      const pk = this.pickers.find((p) => p.slotIdx === i);
      const m = this.pickAt(pk.cursor);
      const mc = hexCss(m.colors.glow);
      pc.classList.toggle('locked', pk.locked);
      pc.innerHTML = `<div class="pc-role" style="color:${col}">${t('select.playerDevice', { n: i + 1, device: this.deviceLabel(s.device) })}</div>
        <div class="pc-dev" style="color:${mc}">${mechIcon(m, 18)}${m.name}${pk.locked ? ' ✓' : ''}</div>
        ${pk.locked ? this.pcSchemeRow(m, pk) : `<div class="pc-sub">${t('select.picking')}</div>`}${edTag}`;
    });
  }

  // scheme selector row inside a locked player card: one clickable swatch per
  // scheme for the picked mech (X/R and ←/→ still cycle for pads/keyboards)
  pcSchemeRow(m, pk) {
    let row = '';
    for (let v = 0; v < SCHEME_COUNT; v++) {
      const col = hexCss(schemeSwatch(m, v));
      row += `<span class="pc-swatch${pk.variant === v ? ' on' : ''}" data-variant="${v}"
        title="${SCHEME_NAMES[v]}" style="background:${col};"></span>`;
    }
    // the ◀ ▶ hints under the strip: the swatches are cycled with left/right,
    // which is not otherwise discoverable once you're locked in
    return `<div class="pc-sub pc-colors">${t('select.colorLabel')}${row}<span style="opacity:0.8;">${SCHEME_NAMES[pk.variant]}</span></div>
      <div class="pc-color-arrows"><span>◀</span>${t('select.colorHint')}<span>▶</span></div>`;
  }

  renderCard() {
    if (this.pickers.length === 1) {
      const pk = this.pickers[0];
      const m = this.pickAt(pk.cursor);
      if (m === RANDOM_PICK) { // mystery unit: no stats to show
        this.card.innerHTML = `
          <div class="mi-name" style="color:#9fd8ef">❓ ${m.name}</div>
          <div class="mi-title">${m.title}</div>
          <div class="mi-blurb">${m.blurb}</div>
          <div class="mi-moves"><b>${t('select.move.ranged')}</b> ${t('select.unknownMove')} &nbsp;·&nbsp; <b>${t('select.move.special')}</b> ${t('select.unknownMove')} &nbsp;·&nbsp; <b>${t('select.move.ult')}</b> ${t('select.unknownMove')}</div>`;
        return;
      }
      this.card.innerHTML = `
        <div class="mi-name" style="color:${hexCss(m.colors.glow)}">${mechIcon(m, 30)}${m.name}</div>
        <div class="mi-title">${m.title}</div>
        <div class="mi-blurb">${m.blurb}</div>
        <div class="mi-stats">
          ${this.statRow(t('select.stat.power'), m.ui.power)}
          ${this.statRow(t('select.stat.speed'), m.ui.speed)}
          ${this.statRow(t('select.stat.defense'), m.ui.defense)}
        </div>
        <div class="mi-moves">
          <b>${t('select.move.ranged')}</b> ${m.moves.ranged.name} &nbsp;·&nbsp; <b>${t('select.move.special')}</b> ${m.moves.special.name}<br>
          <b>${t('select.move.ult')}</b> ${m.moves.ult.name}
        </div>`;
      return;
    }
    // multi-player: one compact card per picker, tinted with player color
    this.card.innerHTML = this.pickers.map((pk) => {
      const m = this.pickAt(pk.cursor);
      const pc = COLOR_CSS[pk.slotIdx % 4];
      const movesLine = m === RANDOM_PICK
        ? t('select.random.short')
        : `<b>${t('select.move.rangedShort')}</b> ${m.moves.ranged.name} · <b>${t('select.move.specialShort')}</b> ${m.moves.special.name} · <b>${t('select.move.ultShort')}</b> ${m.moves.ult.name}`;
      const nameHtml = m === RANDOM_PICK ? `❓ ${m.name}` : `${mechIcon(m, 26)}${m.name}`;
      return `
        <div style="border-left:3px solid ${pc}; padding:6px 10px; margin-bottom:8px;
                    background:rgba(10,18,30,0.45); border-radius:0 6px 6px 0;">
          <div style="font-size:11px;letter-spacing:0.2em;color:${pc};font-weight:800;">
            ${t('select.player', { n: pk.slotIdx + 1 })} ${pk.locked ? t('select.locked') : ''}</div>
          <div class="mi-name" style="font-size:clamp(15px,1.6vw,21px);color:${hexCss(m.colors.glow)}">${nameHtml}</div>
          <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--hud-cyan);">${m.title}</div>
          <div class="mi-moves" style="margin-top:6px;">${movesLine}</div>
        </div>`;
    }).join('');
  }

  statRow(label, v) {
    return `<div class="stat-row"><div class="stat-label">${label}</div>
      <div class="stat-bar"><div class="stat-fill" style="width:${v * 10}%"></div></div></div>`;
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
    // refresh() first: an auto-bumped variant rebuilds the preview, and the
    // flourish has to land on the mech that's actually standing there
    this.onLockFx?.(pk.slotIdx);
    // everyone locked AND at least two fighters in the match → ARM the
    // gate; the screen only advances on an explicit extra confirm, so the
    // last player to lock can still adjust their color scheme
    if (this.pickers.every((p) => p.locked) && this.activeCount() >= 2) this.armReady();
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
    // AI slots pick random distinct-ish mechs
    const taken = new Set(this.picks.filter(Boolean));
    this.slots.forEach((s, i) => {
      if (s.kind === 'ai') {
        const pool = this.roster.filter((m) => !taken.has(m.id));
        const src = pool.length ? pool : this.roster;
        const m = src[(Math.random() * src.length) | 0];
        this.picks[i] = m.id;
        taken.add(m.id);
      }
    });
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
    for (let i = 0; i < 4; i++) if (this.input.padConnected(i) && !taken.has('pad' + i)) list.push('pad' + i);
    return list;
  }

  update(evAll) {
    if (this.finished) return;
    // frame time, for the analog right-stick rotation below
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._lastT || now)) / 1000);
    this._lastT = now;

    // a freshly connected controller auto-joins the next free slot
    const padCount = this.input.connectedPadCount();
    if (padCount !== this._padCount) {
      if (padCount > this._padCount) {
        for (let i = 0; i < 4; i++) {
          if (this.input.padConnected(i) && !this.deviceTaken('pad' + i, -1) && this.firstOff() >= 0) this.joinDevice('pad' + i);
        }
      }
      this._padCount = padCount;
      this.refresh(); // ordinal labels shift when pads come and go
    }

    // join-by-press: an unassigned device that hits confirm joins the match
    if (this.firstOff() >= 0) {
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
        // mutates this.pickers, so bail out of the loop after
        if (back) { this.removeSlot(pk.slotIdx); return; }
      } else {
        // colors cycle BOTH ways: right/X steps forward, left steps back
        if (alt || left || right) {
          const dir = left && !right ? -1 : 1;
          pk.variant = (pk.variant + dir + SCHEME_COUNT) % SCHEME_COUNT;
          this.variants[pk.slotIdx] = pk.variant;
          this.audio?.play('uiMove');
          this.refresh();
        }
        // right stick spins your locked robot, overriding the idle turntable
        // while held (releasing leaves it where you parked it)
        const look = this.input.menuLookFor(pk.device);
        if (look.x) this.onYaw?.(pk.slotIdx, -look.x * 2.6 * dt);
        // the everyone-locked gate: a fresh confirm (well after the lock-in
        // press itself) is what actually advances to arena select
        if (confirm && this.ready && performance.now() - this._readyAt > 350) {
          this.finish();
          return;
        }
        if (back) { // unlock and keep picking
          pk.locked = false;
          this.picks[pk.slotIdx] = null;
          this.disarmReady();
          this.audio?.play('uiBack');
          this.refresh();
        }
      }
    }

    // with zero humans left, the shared ESC/B backs out to the title
    if (!this.pickers.length && evAll?.back) { this.audio?.play('uiBack'); this.onBack(); }
  }
  destroy() {
    this.hotButtons.forEach((b) => frameHotButton(b, null));
    this.el.remove();
  }
}

// ---------------- ARENA SELECT ----------------
// Card 0 (top-left) is RANDOM: confirming it spins the selector visibly
// through every arena before landing on the roulette's pick.
export class ArenaSelectScreen {
  constructor(root, { audio, onDone, onBack }) {
    this.audio = audio;
    this.onDone = onDone;
    this.onBack = onBack;
    this.rolling = false;
    this.el = el('div', 'screen dim fade-in');
    this.el.appendChild(el('div', 'screen-heading', t('arena.heading')));

    const wrap = el('div', 'arena-grid');
    this.cards = [];
    // top-left: the RANDOM tile
    {
      const c = el('div', 'arena-card');
      const art = document.createElement('canvas');
      art.className = 'arena-art';
      art.width = 256; art.height = 144;
      this.drawRandomArt(art);
      c.appendChild(art);
      c.appendChild(el('div', 'arena-name', t('arena.random.name')));
      c.appendChild(el('div', 'arena-desc', t('arena.random.desc')));
      c.addEventListener('mouseenter', () => { if (!this.rolling) { this.cursor = 0; this.refresh(); } });
      c.addEventListener('click', () => this.confirm());
      wrap.appendChild(c);
      this.cards.push(c);
    }
    THEMES.forEach((t, i) => {
      const c = el('div', 'arena-card');
      const art = document.createElement('canvas');
      art.className = 'arena-art';
      art.width = 256; art.height = 144;
      this.drawArt(art, t);
      c.appendChild(art);
      c.appendChild(el('div', 'arena-name', t.name));
      c.appendChild(el('div', 'arena-desc', t.desc));
      c.addEventListener('mouseenter', () => { if (!this.rolling) { this.cursor = i + 1; this.refresh(); } });
      c.addEventListener('click', () => this.confirm());
      wrap.appendChild(c);
      this.cards.push(c);
    });
    this.el.appendChild(wrap);
    this.el.appendChild(el('div', 'hint-bar', t('arena.hint.html')));
    root.appendChild(this.el);
    // On touch, tapping an arena starts the fight; this handles going back.
    appendTouchBack(this.el, () => { if (!this.rolling) { this.audio?.play('uiBack'); this.onBack(); } });
    this.cursor = 0;
    this.refresh();
  }

  // RANDOM tile art: a dark slot-wheel of arena color chips around a big ?
  drawRandomArt(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#101a2e');
    g.addColorStop(1, '#070c16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const hx = hexCss;
    THEMES.forEach((t, i) => { // one sky chip per arena fanned in an arc
      const a = (i / THEMES.length) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.translate(W / 2 + Math.cos(a) * 52, H / 2 + Math.sin(a) * 42);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = hx(t.sky.top);
      ctx.fillRect(-7, -11, 14, 22);
      ctx.strokeStyle = 'rgba(160,220,255,0.35)';
      ctx.strokeRect(-7, -11, 14, 22);
      ctx.restore();
    });
    ctx.font = '900 italic 64px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#38e8ff';
    ctx.shadowColor = 'rgba(56,232,255,0.9)';
    ctx.shadowBlur = 18;
    ctx.fillText('?', W / 2, H / 2 + 3);
  }

  drawArt(canvas, t) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const hx = hexCss;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hx(t.sky.top));
    g.addColorStop(0.72, hx(t.sky.bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (t.sky.stars) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H * 0.5, 1, 1);
    }
    // skyline silhouette
    ctx.fillStyle = hx(t.fog.color);
    let x = 0;
    let sd = t.id.length * 7 + 3;
    const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    while (x < W) {
      const w = 14 + rnd() * 26, h = 20 + rnd() * 55;
      ctx.fillRect(x, H * 0.78 - h, w, h);
      x += w + 3;
    }
    // ground
    ctx.fillStyle = hx(t.ground.color);
    ctx.fillRect(0, H * 0.78, W, H * 0.22);
    ctx.fillStyle = hx(t.ground.accent || 0x53e8ff);
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, H * 0.78, W, 2.5);
    ctx.globalAlpha = 1;
  }

  refresh() {
    this.cards.forEach((c, i) => c.classList.toggle('selected', i === this.cursor));
    this.cards[this.cursor]?.scrollIntoView?.({ block: 'nearest' });
  }
  confirm() {
    if (this.rolling) return;
    if (this.cursor === 0) { this.startRoulette(); return; }
    this.audio?.play('uiSelect');
    this.onDone(THEMES[this.cursor - 1].id);
  }

  // RANDOM: the selector sweeps through every arena card — fast at first,
  // easing to a crawl — and settles on the roulette's pick before starting
  startRoulette() {
    this.rolling = true;
    this.audio?.play('uiSelect');
    const target = 1 + ((Math.random() * THEMES.length) | 0);
    const seq = [];
    for (let r = 0; r < 2; r++) for (let i = 1; i <= THEMES.length; i++) seq.push(i);
    for (let i = 1; i <= target; i++) seq.push(i); // final lap ends ON the pick
    let s = 0;
    const step = () => {
      this.cursor = seq[s];
      this.refresh();
      this.audio?.play('uiMove');
      s++;
      if (s >= seq.length) {
        this.audio?.play('uiSelect');
        this._rollT = setTimeout(() => this.onDone(THEMES[target - 1].id), 225);
        return;
      }
      const f = s / seq.length;
      this._rollT = setTimeout(step, 17 + 140 * f * f * f); // fast → hard ease-out
    };
    step();
  }

  update(ev) {
    if (this.rolling) return; // the wheel owns the cursor until it lands
    const N = this.cards.length;
    let moved = false;
    if (ev.left) { this.cursor = (this.cursor + N - 1) % N; moved = true; }
    if (ev.right) { this.cursor = (this.cursor + 1) % N; moved = true; }
    if (ev.up) { this.cursor = (this.cursor + N - 4) % N; moved = true; }
    if (ev.down) { this.cursor = (this.cursor + 4) % N; moved = true; }
    if (moved) { this.audio?.play('uiMove'); this.refresh(); }
    if (ev.confirm) this.confirm();
    if (ev.back) { this.audio?.play('uiBack'); this.onBack(); }
  }
  destroy() { clearTimeout(this._rollT); this.el.remove(); }
}

// ---------------- PAUSE ----------------
export class PauseScreen {
  constructor(root, { audio, onResume, onQuit, onFullscreen = null, splitToggle = null, onSettings = null, hotButtons }) {
    this.el = el('div', 'screen dim fade-in');
    this.el.innerHTML = `<div class="mega-title pause-title">${t('pause.title')}</div>`;
    this.items = [
      { t: t('pause.menu.resume'), fn: onResume },
      { t: t('pause.menu.controls'), fn: () => this.toggleControls() },
    ];
    if (onFullscreen) this.items.push({ t: t('pause.menu.fullscreen'), fn: onFullscreen });
    // relabeling toggles stay open when activated
    const addToggle = (toggle, key) => {
      if (!toggle) return;
      this.items.push({
        t: toggle.label(),
        fn: () => {
          toggle.fn();
          const i = this.items.findIndex((it) => it.key === key);
          this.items[i].t = toggle.label();
          this.list.itemEls[i].textContent = this.items[i].t;
        },
        key,
      });
    };
    addToggle(splitToggle, 'split');
    if (onSettings) this.items.push({ t: t('pause.menu.settings'), fn: onSettings });
    this.items.push({ t: t('pause.menu.quit'), fn: onQuit });
    this.list = new MenuList({ audio, hot: hotButtons });
    this.el.appendChild(this.list.build(this.items));
    this.controls = el('div', 'panel');
    this.controls.style.cssText = 'margin-top:20px;padding:16px 26px;display:none;font-size:13px;line-height:1.9;color:#b8d4e6;';
    this.controls.innerHTML = t('pause.controls.html');
    this.el.appendChild(this.controls);
    root.appendChild(this.el);
  }
  toggleControls() {
    this.controls.style.display = this.controls.style.display === 'none' ? 'block' : 'none';
  }
  update(ev) {
    // LB/RB (Q/E) hop the focus onto the corner buttons, same as the title
    if (this.list.hotNav(ev, () => this.items[0].fn())) return;
    this.list.nav(ev);
    if (ev.back || ev.pause) this.items[0].fn();
  }
  destroy() {
    this.list.destroy();
    this.el.remove();
  }
}

// ---------------- SETTINGS ----------------
// Modal settings panel: floats over whatever is beneath it (title screen,
// select screens, or the pause menu) and owns menu input while open.
// `items` are relabeling toggles: { label(), fn() } — the row re-labels in
// place on each activation and the panel stays open.
export class SettingsScreen {
  constructor(root, { audio, items, onBack }) {
    this.audio = audio;
    this.onBack = onBack;
    this.el = el('div', 'screen dim fade-in');
    this.el.style.zIndex = 30;
    this.el.style.background = 'rgba(5, 8, 14, 0.86)'; // hide the menu beneath
    this.el.innerHTML = `<div class="mega-title pause-title">${t('settings.title')}</div>`;
    this.items = [
      ...items.map((toggle) => ({
        t: toggle.label(),
        fn: () => {
          toggle.fn();
          const i = this.items.findIndex((it) => it.toggle === toggle);
          this.items[i].t = toggle.label();
          this.list.itemEls[i].textContent = this.items[i].t;
        },
        toggle,
      })),
      { t: t('settings.back'), fn: () => this.onBack() },
    ];
    this.list = new MenuList({ audio });
    this.el.appendChild(this.list.build(this.items));
    appendTouchBack(this.el, () => { this.audio?.play('uiBack'); this.onBack(); });
    root.appendChild(this.el);
  }
  update(ev) {
    this.list.nav(ev);
    if (ev.back || ev.pause) { this.audio?.play('uiBack'); this.onBack(); }
  }
  destroy() { this.el.remove(); }
}

// ---------------- RESULTS ----------------
export class ResultsScreen {
  constructor(root, { winner, audio, onRematch, onChangeMechs, onMenu }) {
    this.el = el('div', 'screen dim fade-in');
    const panel = el('div', 'panel results-panel');
    panel.innerHTML = `
      <div class="winner-sub">${t('results.champion')}</div>
      <div class="winner-name" style="color:${hexCss(winner.def.colors.glow)}">${mechIcon(winner.def, 34)}${winner.def.name}</div>
      <div class="winner-quote">${winner.def.quotes.win}</div>`;
    this.el.appendChild(panel);
    this.list = new MenuList({ audio });
    this.el.appendChild(this.list.build([
      { t: t('results.menu.rematch'), fn: onRematch },
      { t: t('results.menu.changeMechs'), fn: onChangeMechs },
      { t: t('results.menu.mainMenu'), fn: onMenu },
    ]));
    root.appendChild(this.el);
  }
  update(ev) {
    this.list.nav(ev);
  }
  destroy() { this.el.remove(); }
}
