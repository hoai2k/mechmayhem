// On-screen touch controls for phones/tablets: a left analog joystick and a
// right-hand action cluster, plus a pause button. Writes directly into the
// Input instance's virtual 'touch' device (see input.js). Only shown while a
// battle is running; hidden (and released) on every other screen.
import { clamp } from '../core/utils.js';
import { t } from '../core/text.js';

// Block the browser's built-in zoom gestures on touch devices. iOS Safari
// ignores `user-scalable=no` in the viewport meta, so pinch-zoom and (the
// common offender) double-tap-to-zoom while mashing buttons still fire and
// wreck the fixed layout. touch-action:none handles Android; these listeners
// handle iOS. Deliberately narrow so real gameplay multitouch is untouched:
// gameplay buttons use pointer events, which none of this cancels.
export function installTouchZoomGuards() {
  // iOS pinch-zoom arrives as gesture* events — cancel them.
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  }
  // Double-tap-to-zoom: only suppress a second tap that lands in the same
  // spot in quick succession (a zoom gesture), not two taps on different
  // controls — so rapid, distinct button/menu taps keep working.
  let lastT = 0, lastX = 0, lastY = 0;
  document.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    const now = performance.now();
    if (now - lastT <= 320 && Math.hypot(touch.clientX - lastX, touch.clientY - lastY) < 40) {
      e.preventDefault();
    }
    lastT = now; lastX = touch.clientX; lastY = touch.clientY;
  }, { passive: false });
}

// Action buttons. `hold: true` are read continuously (block/ranged); the rest
// fire on the press edge, matching the keyboard/pad mapping in Input.readIntent.
const BUTTONS = [
  { name: 'light',   glyph: '👊', cls: 'b-light' },
  { name: 'heavy',   glyph: '💥', cls: 'b-heavy' },
  { name: 'jump',    glyph: '⬆',  cls: 'b-jump' },
  { name: 'dash',    glyph: '💨', cls: 'b-dash' },
  { name: 'block',   glyph: '🛡', cls: 'b-block', hold: true },
  { name: 'duck',    glyph: '⤵',  cls: 'b-duck', hold: true },
  { name: 'ranged',  glyph: '🎯', cls: 'b-ranged', hold: true },
  { name: 'special', glyph: '✦',  cls: 'b-special' },
  { name: 'ult',     glyph: '★',  cls: 'b-ult' },
].map((b) => ({ ...b, label: t(`touch.${b.name}.label`), hint: t(`touch.${b.name}.hint`) }));

export class TouchControls {
  constructor(input, { onPause, onLook } = {}) {
    this.input = input;
    this.onPause = onPause;
    this.onLook = onLook;
    input.touchAvailable = true;

    this.root = document.createElement('div');
    this.root.id = 'touch-root';
    this.root.className = 'touch-root';
    this.root.style.display = 'none';

    // Look zone is mounted FIRST so it sits beneath the stick and buttons —
    // drags on any empty area (typically the right side, opposite the stick
    // hand) fall through to it and orbit the camera.
    this._buildLookZone();
    this._buildJoystick();
    this._buildActions();
    this._buildTopBar();

    document.getElementById('app').appendChild(this.root);
  }

  // ---------- camera look (drag anywhere not covered by stick/buttons) ----------
  _buildLookZone() {
    const zone = document.createElement('div');
    zone.className = 'touch-look-zone';
    this.root.appendChild(zone);
    this.lookZone = zone;
    this._lookId = null;
    let lx = 0, ly = 0;

    zone.addEventListener('pointerdown', (e) => {
      if (this._lookId !== null) return;
      this._lookId = e.pointerId;
      lx = e.clientX; ly = e.clientY;
      try { zone.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._lookId) return;
      this.onLook?.(e.clientX - lx, e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
      e.preventDefault();
    });
    const end = (e) => { if (e.pointerId === this._lookId) this._lookId = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  // ---------- left analog stick ----------
  _buildJoystick() {
    const zone = document.createElement('div');
    zone.className = 'touch-stick-zone';
    const base = document.createElement('div');
    base.className = 'touch-stick-base';
    const thumb = document.createElement('div');
    thumb.className = 'touch-stick-thumb';
    base.appendChild(thumb);
    zone.appendChild(base);
    this.root.appendChild(zone);

    this.stickBase = base;
    this.stickThumb = thumb;
    this._stickId = null;
    const RADIUS = 56; // px travel of the thumb

    const setVec = (dx, dy) => {
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, RADIUS);
      const nx = (dx / len) * cl, ny = (dy / len) * cl;
      thumb.style.transform = `translate(${nx}px, ${ny}px)`;
      // moveX = right+, moveZ = up/forward+ (screen y is down, so negate)
      this.input.touch.moveX = clamp(nx / RADIUS, -1, 1);
      this.input.touch.moveZ = clamp(-ny / RADIUS, -1, 1);
    };
    const reset = () => {
      thumb.style.transform = 'translate(0px, 0px)';
      this.input.touch.moveX = 0;
      this.input.touch.moveZ = 0;
    };

    // The whole lower-left zone grabs the stick, re-centering the base where
    // the thumb first lands — a floating joystick, easier than hitting a fixed pad.
    zone.addEventListener('pointerdown', (e) => {
      if (this._stickId !== null) return;
      this._stickId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
      const r = zone.getBoundingClientRect();
      this._stickCx = clamp(e.clientX - r.left, 70, r.width - 70);
      this._stickCy = clamp(e.clientY - r.top, 70, r.height - 70);
      base.style.left = `${this._stickCx}px`;
      base.style.top = `${this._stickCy}px`;
      base.classList.add('active');
      setVec(0, 0);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return;
      const r = zone.getBoundingClientRect();
      setVec(e.clientX - r.left - this._stickCx, e.clientY - r.top - this._stickCy);
      e.preventDefault();
    });
    const end = (e) => {
      if (e.pointerId !== this._stickId) return;
      this._stickId = null;
      base.classList.remove('active');
      reset();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  // ---------- right action cluster ----------
  _buildActions() {
    const wrap = document.createElement('div');
    wrap.className = 'touch-actions';
    this.buttons = [];
    for (const b of BUTTONS) {
      const el = document.createElement('div');
      el.className = `touch-btn ${b.cls}` + (b.hold ? ' hold' : '');
      el.innerHTML = `<span class="tb-glyph">${b.glyph}</span><span class="tb-label">${b.label}</span>`;
      el.setAttribute('aria-label', b.hint);
      this._bindButton(el, b.name);
      wrap.appendChild(el);
      this.buttons.push(el);
    }
    this.root.appendChild(wrap);
  }

  _buildTopBar() {
    const bar = document.createElement('div');
    bar.className = 'touch-topbar';

    const taunt = document.createElement('div');
    taunt.className = 'touch-btn tb-mini b-taunt';
    taunt.innerHTML = `<span class="tb-glyph">😜</span>`;
    taunt.setAttribute('aria-label', t('touch.taunt.hint'));
    this._bindButton(taunt, 'taunt');
    bar.appendChild(taunt);

    const pause = document.createElement('div');
    pause.className = 'touch-btn tb-mini b-pause';
    pause.innerHTML = `<span class="tb-glyph">⏸</span>`;
    pause.setAttribute('aria-label', t('touch.pause.hint'));
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pause.classList.add('pressed');
    });
    const firePause = (e) => {
      e.preventDefault();
      pause.classList.remove('pressed');
      this.onPause?.();
    };
    pause.addEventListener('pointerup', firePause);
    bar.appendChild(pause);

    this.root.appendChild(bar);
  }

  // Press/release wiring shared by every action button. Uses pointer capture so
  // a finger that slides off the button still releases cleanly (no stuck holds).
  _bindButton(el, name) {
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (el._pid !== undefined) return;
      el._pid = e.pointerId;
      el.classList.add('pressed');
      this.input.touchButton(name, true);
      try { el.setPointerCapture?.(e.pointerId); } catch { /* no active pointer */ }
    };
    const up = (e) => {
      if (el._pid !== e.pointerId) return;
      el._pid = undefined;
      el.classList.remove('pressed');
      this.input.touchButton(name, false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  setVisible(v) {
    this.root.style.display = v ? 'block' : 'none';
    if (!v) this.releaseAll();
  }

  // Drop any held buttons / stick so nothing sticks across screen changes.
  releaseAll() {
    for (const name of [...this.input.touch.held]) this.input.touchButton(name, false);
    this.input.touch.pressed.clear();
    this.input.touch.moveX = this.input.touch.moveZ = 0;
    this._stickId = null;
    this._lookId = null;
    if (this.stickThumb) this.stickThumb.style.transform = 'translate(0px,0px)';
    this.buttons?.forEach((b) => { b.classList.remove('pressed'); b._pid = undefined; });
  }

  destroy() {
    this.releaseAll();
    this.root.remove();
  }
}
