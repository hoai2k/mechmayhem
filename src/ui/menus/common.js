// Shared by every menu screen: the RANDOM pick, the DOM helper, touch buttons,
// the keyboard/pad list, the neon title sign's buzz, and image preloading.
import { isTouchDevice } from '../../core/utils.js';
import { t } from '../../core/text.js';
import { CONFIG } from '../../core/config.js';

// pseudo roster entry: the RANDOM pick (last cell in the grid). Locking it
// deals you a DIFFERENT random robot every round; the color scheme you pick
// here is applied to whatever shows up.
export const RANDOM_PICK = {
  id: 'random', name: t('select.random.name'), title: t('select.random.title'), icon: '❓',
  colors: { primary: 0x3a4a5e, glow: 0x9fd8ef },
  blurb: t('select.random.blurb'),
};

export const pickFrom = (list, cursor) => (cursor >= list.length ? RANDOM_PICK : list[cursor]);

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// On-screen nav button for touch devices (click fires on tap too).
export function touchBtn(label, cls, onTap) {
  const b = el('div', 'touch-navbtn ' + cls, label);
  b.addEventListener('click', (e) => { e.preventDefault(); onTap(); });
  return b;
}

// A floating BACK button, bottom-left, shown only on touch screens.
export function appendTouchBack(screenEl, onBack) {
  if (!isTouchDevice()) return;
  screenEl.appendChild(touchBtn(t('nav.back'), 'nav-back', onBack));
}

// Frame a corner "hot button" (settings/sound, owned by boot.js) in a
// focus color while a controller's LB/RB selector is parked on it.
export function frameHotButton(b, color) {
  b.el.style.outline = color ? `2px solid ${color}` : '';
  b.el.style.outlineOffset = '3px';
  b.el.style.borderRadius = '8px';
  b.el.style.boxShadow = color ? `0 0 14px ${color}` : '';
  b.el.style.opacity = color ? '1' : '';
}

// Shared vertical menu list used by the title / pause / settings / results
// screens: the item DOM, hover/click selection, the up/down/confirm loop,
// and (title/pause) the LB/RB corner hot-button ring for settings/sound.
export class MenuList {
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

  // the plain list loop: ↑↓ move the selection, ENTER/A confirms.
  // An item carrying `slide(dir)` is a SLIDER: ←→ adjust it in place instead
  // of doing nothing, and confirm nudges it up (so it's reachable one-handed
  // and on touch, where there is no ←→).
  nav(ev) {
    const n = this.items.length;
    const cur = this.items[this.sel];
    if (cur?.slide && (ev.left || ev.right)) { cur.slide(ev.right ? 1 : -1); return; }
    if (ev.up) { this.sel = (this.sel + n - 1) % n; this.audio?.play('uiMove'); this.refresh(); }
    if (ev.down) { this.sel = (this.sel + 1) % n; this.audio?.play('uiMove'); this.refresh(); }
    if (ev.confirm) this.confirm();
  }

  destroy() {
    this.hot.forEach((b) => frameHotButton(b, null));
  }
}

// ---------------- TITLE ----------------

// ONE PLACE THE SIGN'S LOUDNESS IS DECIDED. CONFIG.neonBuzzVolume is the dial;
// how deep this particular drop-out goes (its tube opacity) leans on it a
// little. Exported because `rw.buzz()` fires the same sound from the console —
// a dial you can only hear when a random 66ms flicker happens to come round is
// a dial you cannot tune, so the two must be the SAME call, not two copies of
// the formula that drift.
export function neonBuzzVol(opacity = 0.25) {
  return CONFIG.neonBuzzVolume * (0.8 + (1 - opacity) * 0.45);
}

export function playNeonBuzz(audio, opacity = 0.25) {
  const vol = neonBuzzVol(opacity);
  // a real flicker out of the recording, or the synth one if it never arrived
  if (!audio?.playSlice('neonBuzz', { vol, rate: 0.94 + Math.random() * 0.12 })) {
    audio?.play('neonZap', { vol, pitch: 0.92 + Math.random() * 0.2 });
  }
  return vol;
}

// fetch and DECODE an image off-screen; true once it can be shown without a
// half-painted frame, false if it never will be
export function preload(url) {
  return new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode() : Promise.resolve()).then(() => res(true), () => res(true));
    im.onerror = () => res(false);
    im.src = url;
  });
}
