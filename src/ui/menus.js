// Menu screens: Title → Setup → Mech Select → Arena Select → (battle) → Results.
// Each screen builds DOM into #ui-root and consumes aggregated menu events.
import { playableRoster } from '../mechs/roster.js';
import { SCHEME_NAMES, SCHEME_COUNT, schemeSwatch, schemeGlow, applyColorScheme } from '../mechs/colorscheme.js';
import { THEMES } from '../arena/themes.js';
import { isTouchDevice } from '../core/utils.js';
import { mechIcon } from './icons.js';
import { PLAYER_COLORS_CSS as COLOR_CSS, hexCss } from '../core/colors.js';
import { t } from '../core/text.js';
import { CONFIG } from '../core/config.js';
import { loadCardIndex, hasCard, cardUrl } from './cards.js';
import { arenaArtUrl } from './arenaart.js';
import { loadPosterIndex, SETTLE_MS } from './posters.js';
import { shotUrl, requestShot } from '../game/snapshot.js';

// pseudo roster entry: the RANDOM pick (last cell in the grid). Locking it
// deals you a DIFFERENT random robot every round; the color scheme you pick
// here is applied to whatever shows up.
export const RANDOM_PICK = {
  id: 'random', name: t('select.random.name'), title: t('select.random.title'), icon: '❓',
  colors: { primary: 0x3a4a5e, glow: 0x9fd8ef },
  blurb: t('select.random.blurb'),
};
const pickFrom = (list, cursor) => (cursor >= list.length ? RANDOM_PICK : list[cursor]);

export function el(tag, cls, html) {
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

// ONE WAY IN: PRESS START.
//
// The title screen used to be a two-item menu, BATTLE and FULLSCREEN. That is
// two decisions on a screen that has one — nobody arrives at an arena fighter
// wanting to browse — and it put a display setting in the same list as the
// game. It is a single prompt now, and going fullscreen rides along with the
// press instead of being asked for.
//
// THE MOUSE IS THE EXCEPTION, DELIBERATELY. A pad or a keyboard is somebody
// sitting back to play, so START/A takes the fullscreen with it; a CLICK is
// somebody at a desk with other windows, who did not ask to lose them. So the
// pointer goes straight to the select screen and leaves the display alone.
//
// AND A GAMEPAD CANNOT ACTUALLY GRANT FULLSCREEN. `requestFullscreen` needs
// TRANSIENT USER ACTIVATION, which the Gamepad API does not produce — it is
// polled state, not an event — so the request is rejected unless the player
// happens to have clicked or typed in the last few seconds. That is a browser
// rule and there is no way around it from here. What this does is take every
// route the browser DOES honour: the keyboard path runs off a real `keydown`
// listener (an activating event, handled synchronously, so Enter/Space
// genuinely goes fullscreen) and the pad path asks anyway and accepts no for
// an answer. The one thing it must never do is let a refusal cost the player
// the press, so the screen change never waits on the display change.
//
// FIGHT NIGHT. The screen is a broadcast card: the sign up top, the whole
// roster rolling past underneath it as a FILM STRIP of slanted panels, and a
// lower third carrying the prompt. Nothing on it is 3D — the canvas is covered
// and does not draw (engine.covered) — so the menu costs the machine nothing
// while the prefetcher pulls the fight down behind it.
//
// THE STRIP. Two copies of the roster side by side, translated left at a
// constant rate and wrapped by exactly one copy's width, so the seam is
// invisible: the frame at offset P is pixel-for-pixel the frame at 0. It can
// be GRABBED — pointer down stops it dead, dragging scrubs it (with a little
// fling on release), the wheel scrubs too, and a pad's ←→ steps one panel —
// and it starts rolling again STRIP_RESUME seconds after the last touch,
// easing back up to speed rather than lurching. Reduced motion leaves it
// still (but still draggable).
//
// A PANEL wears the mech's painted hero CARD when there is one (ui/cards.js)
// and otherwise its poster on a wash of its own glow colour — the same PNG the
// fighter-select screen shows, so the two screens agree about what a robot
// looks like.
const STRIP_PANEL_S = 6.5;   // seconds for one panel to roll past
const STRIP_RESUME = 1.5;    // seconds after letting go before it rolls again
const STRIP_RAMP = 0.8;      // seconds to ease back up to full speed
const ART_WAIT = 6000;       // ms before the title's art stops holding the prefetch

// fetch and DECODE an image off-screen; true once it can be shown without a
// half-painted frame, false if it never will be
function preload(url) {
  return new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode() : Promise.resolve()).then(() => res(true), () => res(true));
    im.onerror = () => res(false);
    im.src = url;
  });
}

export class TitleScreen {
  constructor(root, { onPlay, onFullscreen, onArtReady, audio, hotButtons, canStart = null }) {
    this.el = el('div', 'screen fade-in title-screen');
    this.onArtReady = onArtReady;
    this._artTimer = setTimeout(() => this.artReady(), ART_WAIT);
    this.canStart = canStart;
    // Each WORD of the game name is its own neon tube: alternating colors, and
    // each one flickers on its own clock (style.css). Splitting here rather
    // than hard-coding two spans keeps the effect working for any name the
    // catalogue carries, in any language.
    const tubes = t('title.game').trim().split(/\s+/)
      .map((w, i) => `<span class="tube tube-${i % 2}">${w}</span>`).join(' ');
    const roster = playableRoster();
    this.el.innerHTML = `
      <div class="tt-tex"></div>
      <div class="tt-strip"><div class="tt-track"></div></div>
      <div class="title-brand">
        <div class="mega-title neon-title">${tubes}</div>
        <div class="mega-sub">${t('title.tagline')}</div>
      </div>
      <div class="tt-l3">
        <div class="tt-live"><i></i>${t('title.live')}</div>
        <div class="tt-ticker">${t('title.ticker.html', {
          fighters: roster.length, arenas: THEMES.length, players: 4 })}</div>
      </div>`;
    this.buildStrip(roster);
    this.audio = audio;
    // The sign is AUDIBLE: every drop-out plays ONE event cut out of the neon
    // recording (public/sound/neon_buzz.mp3 is a long take with a couple of
    // dozen flickers in it; the audio engine finds them by energy and hands
    // back slices). A different slice each time, so a stutter pair never
    // sounds like the same sample twice. The synth buzz remains the fallback
    // for when the file cannot be fetched or decoded.
    // The CSS keyframes stay the single source of truth for the TIMING — this
    // reads the tubes' live opacity rather than duplicating the pattern in JS,
    // so editing the flicker in style.css moves the sound with it.
    this.tubes = [...this.el.querySelectorAll('.neon-title .tube')];
    this.lit = this.tubes.map(() => true);
    audio?.loadSliced?.('neonBuzz', new URL('sound/neon_buzz.mp3', document.baseURI).href);
    // The MenuList is kept for its CORNER RING alone — LB/RB still walk the
    // settings and sound buttons — so it is built with no items, its element is
    // never added to the page, and `nav()` is never called on it (an empty list
    // has nothing to select, and its modulo arithmetic would be NaN).
    this.list = new MenuList({ audio, hot: hotButtons });
    this.list.build([]);

    this.onPlay = onPlay;
    this.onFullscreen = onFullscreen;
    this.started = false;      // this screen is used exactly once

    // the prompt is the lower third's plate: white, slanted, with the pad's
    // own A glyph on it
    this.prompt = el('div', 'press-start',
      `<span class="glyph-a" aria-hidden="true">A</span>${t('title.pressStart')}`);
    this.prompt.setAttribute('role', 'button');
    this.prompt.setAttribute('tabindex', '0');
    // POINTER ONLY — no fullscreen. `click` also fires for a keyboard
    // activation on a focused element in some browsers, so it is gated on a
    // real pointer having produced it (`detail` is 0 for a synthetic one).
    this.prompt.addEventListener('click', (e) => { if (e.detail !== 0) this.start(false); });
    this.el.querySelector('.tt-l3').appendChild(this.prompt);

    // THE KEYBOARD PATH, on a real listener rather than the polled one. This is
    // the only route on which the fullscreen request carries user activation,
    // so it has to be handled in the event and not one frame later. It runs
    // BEFORE the polled `update` sees the same key, and `started` is what stops
    // the two of them acting on one press.
    // The key set is the one `menuEvents` already calls confirm (plus
    // NumpadEnter), so every keyboard route into the game gets the activation
    // and none of them falls through to the polled path for a second opinion.
    this._onKey = (e) => {
      if (this.started) return;
      // a modal (settings, how-to-play) owns the keyboard while it is open:
      // Enter on a settings row used to start the game underneath it
      if (this.canStart && !this.canStart()) return;
      if (!['Enter', 'NumpadEnter', 'Space', 'KeyF', 'Numpad1'].includes(e.code)) return;
      e.preventDefault();
      this.start(true);
    };
    window.addEventListener('keydown', this._onKey);

    // no hint bar here: the title screen is one prompt, and the controls live
    // behind the ⓘ button (the catalogue keeps title.hint.html for anyone who
    // wants it back)
    root.appendChild(this.el);
    this.measure();
  }

  // ---- the film strip ----
  buildStrip(roster) {
    this.strip = this.el.querySelector('.tt-strip');
    this.track = this.el.querySelector('.tt-track');
    this.n = roster.length;
    const panel = (m, i) => `<div class="tt-pan" data-id="${m.id}" style="--g:${hexCss(m.colors.glow)}">
        <div class="tt-card"></div>
        <div class="tt-num">${String(i + 1).padStart(2, '0')}</div>
        <img class="tt-mech" alt="" draggable="false">
        <div class="tt-name">${m.name}<small>${m.title}</small></div>
        <div class="tt-edge"></div>
      </div>`;
    const copy = roster.map(panel).join('');
    this.track.innerHTML = copy + copy;
    this.pans = [...this.track.children];
    // the art is loaded in the order it will be SEEN (loadArt, below)
    Promise.all([loadCardIndex(), loadPosterIndex()]).then(() => this.loadArt());

    // state: offset in px along the strip (0..period), velocity for the fling
    this.off = 0;
    this.vel = 0;            // px/s, the fling after a drag
    this.glide = null;       // px target for a pad step
    this.idle = 0;           // seconds since the strip was last touched
    this.held = false;       // a pointer has hold of it
    this.touched = false;    // ever touched: the resume timer is running
    this.reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this._lastT = performance.now();

    let lastX = 0, lastT = 0, pid = null;
    this._onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      pid = e.pointerId;
      try { this.strip.setPointerCapture(pid); } catch (err) { /* synthetic */ }
      this.held = true;
      this.touch();
      this.vel = 0;
      this.glide = null;
      lastX = e.clientX; lastT = performance.now();
      this.strip.classList.add('grabbing');
    };
    this._onMove = (e) => {
      if (!this.held || e.pointerId !== pid) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      this.setOff(this.off - dx);
      const dtm = Math.max(1, now - lastT);
      // dragging LEFT moves the strip left = offset grows
      this.vel = this.vel * 0.6 + (-dx / dtm * 1000) * 0.4;
      lastX = e.clientX; lastT = now;
      this.touch();
    };
    this._onUp = (e) => {
      if (!this.held || (e.pointerId !== undefined && e.pointerId !== pid)) return;
      this.held = false;
      pid = null;
      // a pointer that stopped before letting go does not fling
      if (performance.now() - lastT > 90) this.vel = 0;
      this.vel = Math.max(-4000, Math.min(4000, this.vel));
      this.strip.classList.remove('grabbing');
      this.touch();
    };
    this._onWheel = (e) => {
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.setOff(this.off + d * (e.deltaMode === 1 ? 40 : 1));
      this.vel = 0;
      this.glide = null;
      this.touch();
    };
    this.strip.addEventListener('pointerdown', this._onDown);
    this.strip.addEventListener('pointermove', this._onMove);
    this.strip.addEventListener('pointerup', this._onUp);
    this.strip.addEventListener('pointercancel', this._onUp);
    this.strip.addEventListener('lostpointercapture', this._onUp);
    this.strip.addEventListener('wheel', this._onWheel, { passive: false });
    this._onResize = () => this.measure();
    window.addEventListener('resize', this._onResize);
  }

  // THE ART ARRIVES IN THE ORDER IT IS SEEN. The strip opens on a random
  // panel, so the panels on screen at that moment load first, then the ones
  // about to roll on from the right, then the rest — four at a time, so the
  // first screenful is not queued behind pictures nobody can see yet. Every
  // picture is decoded off to the side and FADED IN over its panel's glow
  // wash; a panel that is already on screen when its art lands never pops.
  // `onArtReady` fires once the queue is drained (or after ART_WAIT, whichever
  // comes first): boot holds the select screen's own prefetch until then, so
  // it does not compete with the first screenful for the connection.
  loadArt() {
    if (!this.el.isConnected || this.started) return;
    const vw = this.strip.clientWidth || window.innerWidth;
    let k0 = 0;
    for (let k = 0; k < this.pans.length; k++) {
      const x = this.pans[k].offsetLeft - this.off;
      if (x + this.pans[k].offsetWidth > 0 && x < vw) { k0 = k; break; }
    }
    const order = [];
    for (let j = 0; j < this.n; j++) order.push(this.pans[(k0 + j) % this.pans.length].dataset.id);
    let next = 0, live = 0;
    const pump = () => {
      while (live < 4 && next < order.length) {
        const id = order[next++];
        live++;
        this.artFor(id).then(() => {
          live--;
          if (!this.el.isConnected) return;
          if (next >= order.length && !live) this.artReady();
          else pump();
        });
      }
    };
    pump();
  }

  artReady() {
    if (this._artReady) return;
    this._artReady = true;
    this.onArtReady?.();
  }

  // one mech's picture, on every panel that shows it (the strip carries two
  // copies of the roster): its hero card, else its poster, else — for a
  // roster the posters do not depict — a runtime photograph of its stock paint
  async artFor(id) {
    const card = hasCard(id);
    const url = card ? cardUrl(id) : (shotUrl(id, 0) || await requestShot(id, 0, `title:${id}`));
    if (!url || !(await preload(url)) || !this.el.isConnected) return;
    for (const p of this.pans) {
      if (p.dataset.id !== id) continue;
      if (card) {
        p.classList.add('has-card');
        p.querySelector('.tt-card').style.backgroundImage = `url("${url}")`;
      } else {
        p.querySelector('.tt-mech').src = url;
      }
      // next frame, so the element exists at opacity 0 before it transitions
      requestAnimationFrame(() => p.classList.add('in'));
    }
  }

  // one copy's width (the wrap) and one panel's step, off the laid-out DOM
  // so the CSS stays the only place the panel size is stated
  measure() {
    if (!this.pans?.length) return;
    const a = this.pans[0], b = this.pans[1], c = this.pans[this.n];
    const oldP = this.period || 0;
    this.pitch = Math.max(1, b.offsetLeft - a.offsetLeft);
    this.period = Math.max(1, c.offsetLeft - a.offsetLeft);
    // the first sight of the strip starts somewhere in the roster, not
    // always on the same mech
    if (!oldP) this.setOff(Math.floor(Math.random() * this.n) * this.pitch);
    else this.setOff((this.off / oldP) * this.period);
  }

  setOff(v) {
    const P = this.period || 1;
    const w = ((v % P) + P) % P;
    if (this.glide != null) this.glide += w - v;   // carry the target across the wrap
    this.off = w;
    this.track.style.transform = `translate3d(${-w}px,0,0)`;
  }

  touch() { this.idle = 0; this.touched = true; }

  stepStrip(dt) {
    if (this.held) return;
    this.idle += dt;
    if (this.glide != null) {
      const k = Math.min(1, dt * 7);
      const next = this.off + (this.glide - this.off) * k;
      if (Math.abs(this.glide - next) < 0.5) { this.setOff(this.glide); this.glide = null; }
      else this.setOff(next);
      return;
    }
    if (this.vel) {
      this.setOff(this.off + this.vel * dt);
      this.vel *= Math.exp(-dt * 4.5);
      if (Math.abs(this.vel) < 8) this.vel = 0;
      return;
    }
    if (this.reduced) return;
    const wait = this.touched ? STRIP_RESUME : 0;
    if (this.idle < wait) return;
    const ramp = this.touched ? Math.min(1, (this.idle - wait) / STRIP_RAMP) : 1;
    const speed = (this.pitch || 300) / STRIP_PANEL_S;
    this.setOff(this.off + speed * ramp * ramp * (3 - 2 * ramp) * dt);
  }

  // `wantFullscreen` is about the DEVICE, not about whether it will work: a
  // rejected request must still leave the player on the select screen, which is
  // why the fullscreen call cannot be awaited and its failure is not an error.
  start(wantFullscreen) {
    if (this.started) return;
    this.started = true;
    this.audio?.play('uiSelect');
    if (wantFullscreen) { try { this.onFullscreen?.(); } catch (e) { /* the browser said no */ } }
    this.onPlay();
  }

  update(ev) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastT) / 1000);
    this._lastT = now;
    this.stepStrip(dt);
    this.buzz();
    if (this.list.hotNav(ev)) return;
    // ←→ step the strip one panel, the pad's version of grabbing it
    if (ev.left || ev.right) {
      const base = this.glide ?? this.off;
      this.glide = Math.round(base / this.pitch) * this.pitch + (ev.right ? 1 : -1) * this.pitch;
      this.vel = 0;
      this.touch();
    }
    // A (confirm) and START both start the game — the prompt says START and a
    // player reaching for it should not have to find out which button the
    // screen meant. `ev.start` is PAD START specifically, NOT `ev.pause`, which
    // Escape also sets: the keyboard is the listener's business above, and
    // Escape on the title screen must not launch a match. `started` keeps a
    // press that arrives down both routes from counting twice.
    if (ev.confirm || ev.start) this.start(true);
  }

  // one buzz per drop-out, per tube: the deeper the dip, the harder the tube
  // complains. Reduced-motion leaves the tubes lit, so it stays silent there.
  buzz() {
    for (let i = 0; i < this.tubes.length; i++) {
      const o = parseFloat(getComputedStyle(this.tubes[i]).opacity);
      const dim = o < 0.9;
      if (dim && this.lit[i]) playNeonBuzz(this.audio, o);
      this.lit[i] = !dim;
    }
  }

  destroy() {
    clearTimeout(this._artTimer);
    this.artReady();   // leaving early: whatever was held back may go now
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('resize', this._onResize);
    this.list.destroy();
    this.el.remove();
  }
}

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
const LAYOUT_QUAD = 3;       // this many in the match and the sides are quadrants

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
    this.slots = prev || this.defaultSlots();
    this.pickers = [];             // one per human slot (built by syncPickers)
    this.picks = new Array(4).fill(null);
    this.variants = new Array(4).fill(0);
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
    for (let i = 0; i < 4; i++) {
      const sd = el('div', 'sel-side');
      sd.innerHTML = `
        <div class="sd-wash"></div>
        <div class="sd-q">?</div>
        <img class="sd-pic" alt="" draggable="false">
        <div class="sd-tag"></div>
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
      this.el.appendChild(sd);
      this.sides.push(sd);
      this.sideState.push({ want: null, shownId: null, timer: 0 });
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
        if (this.mousePicker && !this.mousePicker.locked) { this.mousePicker.cursor = i; this.refresh(); }
      });
      c.addEventListener('click', () => {
        const pk = this.mousePicker;
        if (!pk) return;
        // the grid is the pointer's own business: clicking a robot brings a
        // mouse user home from whatever slot card they were visiting
        this.clearMouseSel(pk);
        // A CLICK IS A TOGGLE. Clicking the robot you are standing on locks
        // it in, and clicking that same robot again lets it go — the mouse's
        // answer to B, since a locked mouse user otherwise has nothing to
        // click that undoes the lock.
        if (pk.locked) { if (pk.cursor === i) this.unlock(pk); return; }
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
    const order = ['rookie', 'veteran', 'ace'];
    const cur = order.indexOf(this.slots[i].diff);
    // the temper changes, the robot it dealt itself does not
    this.slots[i] = { ...this.slots[i], kind: 'ai', diff: order[(cur + dir + 3) % 3] };
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

  // A CPU DEALS ITSELF A ROBOT the moment it joins, rather than at the very
  // end: it is on its side for everyone to see, and it is a pick like any
  // other — so its body is built in the background too. Distinct from the
  // other CPUs' and from whatever the humans are standing on, where it can be.
  dealCpuPicks() {
    const taken = new Set();
    this.slots.forEach((s) => { if (s.kind === 'ai' && s.pick) taken.add(s.pick); });
    for (const pk of this.pickers) taken.add(this.pickAt(pk.cursor).id);
    this.slots.forEach((s, i) => {
      if (s.kind !== 'ai' || (s.pick && this.byId[s.pick])) return;
      const pool = this.roster.filter((m) => !taken.has(m.id));
      const src = pool.length ? pool : this.roster;
      s.pick = src[(Math.random() * src.length) | 0].id;
      taken.add(s.pick);
      this.onSettle?.(s.pick, 0);
    });
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
    this.dealCpuPicks();
    // line-up changed (join/leave/device cycle): the everyone-locked gate
    // only stays armed while every current picker is still locked
    if (this.ready && !(this.pickers.length > 0 && this.pickers.every((p) => p.locked) && this.activeCount() >= 2)) {
      this.disarmReady();
    }
  }

  // what a cursor is parked on (last cell in the grid is RANDOM)
  pickAt(cursor) { return pickFrom(this.roster, cursor); }

  // ---- layout: which side each slot is drawn on ----
  // 3+ in the match: every slot is a quadrant, in slot order. Otherwise two
  // sides — the active slots, padded with the first empty one so a lone
  // player faces a JOIN — and the next empty slot after that is the ＋ chip.
  layout() {
    const active = [];
    this.slots.forEach((s, i) => { if (s.kind !== 'off') active.push(i); });
    const pos = ['none', 'none', 'none', 'none'];
    const quad = active.length >= LAYOUT_QUAD;
    if (quad) {
      ['tl', 'tr', 'bl', 'br'].forEach((p, i) => { pos[i] = p; });
    } else {
      const two = [...active];
      for (let i = 0; i < 4 && two.length < 2; i++) if (!two.includes(i)) two.push(i);
      two.sort((a, b) => a - b);
      pos[two[0]] = 'l';
      pos[two[1]] = 'r';
      const chip = this.slots.findIndex((s, i) => s.kind === 'off' && !two.includes(i));
      if (chip >= 0) pos[chip] = 'chip';
    }
    this.el.classList.toggle('quad', quad);
    this.heading.textContent = quad ? t('select.brawl', { n: active.length }) : t('select.vs');
    this.heading.classList.toggle('vs', !quad);
    return pos;
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
        c.style.setProperty('--pc', COLOR_CSS[pk.slotIdx % 4]);
        tags.push(`<span style="--pc:${COLOR_CSS[pk.slotIdx % 4]}">${t('select.tagP', { n: pk.slotIdx + 1 })}</span>`);
      }
      this.slots.forEach((s, j) => {
        if (s.kind === 'ai' && s.pick && this.roster[i]?.id === s.pick) {
          tags.push(`<span class="cpu" style="--pc:${COLOR_CSS[j % 4]}">${t('select.tagCpu')}</span>`);
        }
      });
      c.querySelector('.cell-tags').innerHTML = tags.join('');
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
      for (let i = 0; i < 4; i++) { if (this.input.padConnected(i)) { n++; if (i === +device[3]) return t('device.pad', { n }); } }
      return t('device.pad', { n: +device[3] + 1 });
    }
    const id = { touch: 'device.touch', kb1: 'device.kb1', kb2: 'device.kb2' }[device];
    return id ? t(id) : device.toUpperCase();
  }

  // ---- one side ----
  renderSide(i, pos) {
    const s = this.slots[i];
    const sd = this.sides[i];
    const col = COLOR_CSS[i % 4];
    const cls = ['sel-side', `pos-${pos}`];
    sd.style.setProperty('--pc', col);
    // slot-selector focus: frame the side in the VISITING player's color
    const ed = this.pickers.find((p) => p.sel === i);
    if (ed) { cls.push('editing'); sd.style.setProperty('--ed', COLOR_CSS[ed.slotIdx % 4]); }
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
      m = this.byId[s.pick] || this.roster[0];
      cls.push('cpu');
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
    const glow = m === RANDOM_PICK ? schemeGlow(v, m.colors.glow) : applyColorScheme(m, v).colors.glow;
    sd.style.setProperty('--g', hexCss(glow));
    q('.sd-tag').innerHTML = tag;
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
  // robot (the old paint), else the stock poster — never a blank. When it
  // lands it is cross-faded in.
  setPic(i, id, v) {
    if (!this.postersReady) return;
    const st = this.sideState[i];
    const sd = this.sides[i];
    const img = sd.querySelector('.sd-pic');
    const want = id ? `${id}|${v}` : null;
    if (st.want === want) return;
    st.want = want;
    clearTimeout(st.timer);
    sd.classList.remove('developing');
    if (!id) { img.removeAttribute('src'); img.classList.remove('in'); st.shownId = null; return; }
    const show = (url) => {
      const fresh = st.shownId !== id;
      st.shownId = id;
      if (img.getAttribute('src') === url) { img.classList.add('in'); return; }
      preload(url).then((ok) => {
        if (!ok || st.want !== want) return;
        if (fresh) {
          // a different robot slides in; the same robot in new paint dissolves
          img.classList.remove('in', 'swap');
          img.src = url;
          void img.offsetWidth;
          img.classList.add('in', 'swap');
        } else {
          sd.querySelector('.sd-ghost')?.remove();
          const ghost = img.cloneNode();
          ghost.className = 'sd-pic sd-ghost in';
          img.after(ghost);
          img.src = url;
          requestAnimationFrame(() => ghost.classList.add('out'));
          setTimeout(() => ghost.remove(), 500);
        }
      });
    };
    const ready = shotUrl(id, v);
    if (ready) { show(ready); return; }
    if (st.shownId !== id) {
      const stock = shotUrl(id, 0);
      if (stock) show(stock);
      else { img.classList.remove('in'); st.shownId = null; }
    }
    sd.classList.add('developing');
    st.timer = setTimeout(() => {
      requestShot(id, v, `side${i}`).then((url) => {
        if (st.want !== want) return;
        sd.classList.remove('developing');
        if (url) show(url);
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
    // CPU slots fight as the robot they dealt themselves (on screen all along)
    this.dealCpuPicks();
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
    for (let i = 0; i < 4; i++) if (this.input.padConnected(i) && !taken.has('pad' + i)) list.push('pad' + i);
    return list;
  }

  update(evAll) {
    if (this.finished) return;

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
        // colors cycle BOTH ways: right/X steps forward, left steps back
        if (alt || left || right) this.stepPaint(pk, left && !right ? -1 : 1);
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
    for (const st of this._settle.values()) clearTimeout(st.timer);
    for (const st of this.sideState) clearTimeout(st.timer);
    this.el.remove();
  }
}

// ---------------- ARENA SELECT ----------------

// Card 0 (top-left) is RANDOM: confirming it spins the selector visibly
// through every arena before landing on the roulette's pick. The LAST card is
// TRAINING — the same line-up on a fixed open arena under training rules
// (game/training.js); `onDone(themeId, { training: true })` says so.
const TRAINING_ARENA = 'uptown';   // open, flat, low-hazard
export class ArenaSelectScreen {
  // `pickRandom` supplies the RANDOM tile's arena. boot hands over the one the
  // idle prefetcher pre-rolled and has been downloading since the title screen
  // — the roulette then lands on an arena that is already half-loaded. Absent
  // (or prefetch off), it just rolls one here.
  constructor(root, { audio, onDone, onBack, pickRandom = null }) {
    this.audio = audio;
    this.onDone = onDone;
    this.onBack = onBack;
    this.pickRandom = pickRandom;
    this.rolling = false;
    this.el = el('div', 'screen fade-in arena-screen');
    // THE BACKDROP IS THE ARENA UNDER THE CURSOR: its painting, full-bleed,
    // dimmed and softened behind the grid, cross-faded as the cursor moves.
    // (The menus draw no 3D any more — engine.covered — so this screen paints
    // its own backdrop, and it may as well be the place you are about to go.)
    this.bgs = [el('div', 'as-bg'), el('div', 'as-bg')];
    this.bgFront = 0;
    this.bgId = null;
    this.el.append(...this.bgs, el('div', 'as-scrim'));
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
      c.title = t('arena.random.desc'); // the blurb, which the card has no room to print
      c.addEventListener('mouseenter', () => { if (!this.rolling) { this.cursor = 0; this.refresh(); } });
      c.addEventListener('click', () => this.confirm());
      wrap.appendChild(c);
      this.cards.push(c);
    }
    const FIRST = this.cards.length;   // where the arenas start
    this.firstArena = FIRST;
    THEMES.forEach((t, i) => {
      const c = el('div', 'arena-card');
      const art = document.createElement('canvas');
      art.className = 'arena-art';
      art.width = 256; art.height = 144;
      this.drawArt(art, t);
      c.appendChild(art);
      // PAINTED CARD ART (public/arenas/<id>.jpg) if the arena has one, with
      // the canvas above as the BACKUP — the same ladder the mech badges use
      // (src/ui/icons.js). The canvas is drawn and shown first and only
      // REPLACED once the image has actually decoded, so a missing or broken
      // file leaves the procedural art on screen rather than a broken image.
      this.loadArt(art, t.id);
      c.appendChild(el('div', 'arena-name', t.name));
      c.appendChild(el('div', 'arena-desc', t.desc));
      c.title = t.desc;
      c.addEventListener('mouseenter', () => { if (!this.rolling) { this.cursor = i + FIRST; this.refresh(); } });
      c.addEventListener('click', () => this.confirm());
      wrap.appendChild(c);
      this.cards.push(c);
    });
    // last: TRAINING — after every real arena, since it is a practice room
    // rather than somewhere to fight, and its index is recorded rather than
    // assumed so confirm() can find it wherever the list ends
    {
      const c = el('div', 'arena-card training');
      const art = document.createElement('canvas');
      art.className = 'arena-art';
      art.width = 256; art.height = 144;
      this.drawTrainingArt(art);
      c.appendChild(art);
      c.appendChild(el('div', 'arena-name', t('arena.training.name')));
      c.appendChild(el('div', 'arena-desc', t('arena.training.desc')));
      c.title = t('arena.training.desc');
      c.addEventListener('mouseenter', () => { if (!this.rolling) { this.cursor = this.trainingIdx; this.refresh(); } });
      c.addEventListener('click', () => this.confirm());
      this.trainingIdx = this.cards.length;
      wrap.appendChild(c);
      this.cards.push(c);
    }
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

  // TRAINING tile art: a target on a practice-range grid
  drawTrainingArt(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c1c2c');
    g.addColorStop(1, '#06101c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(56,232,255,0.16)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const cx = W / 2, cy = H / 2 + 4;
    [46, 34, 22, 10].forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#ffb43c' : '#122a3c';
      ctx.fill();
    });
    ctx.strokeStyle = '#38e8ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(56,232,255,0.9)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(cx - 58, cy); ctx.lineTo(cx - 14, cy);
    ctx.moveTo(cx + 14, cy); ctx.lineTo(cx + 58, cy);
    ctx.moveTo(cx, cy - 56); ctx.lineTo(cx, cy - 14);
    ctx.moveTo(cx, cy + 14); ctx.lineTo(cx, cy + 56);
    ctx.stroke();
  }

  // Swap a card's procedural canvas for its painted art once that image has
  // loaded. Nothing waits on it and nothing breaks without it: a 404, a decode
  // failure or a card that has already left the screen all leave the canvas
  // exactly where it is.
  loadArt(canvas, id) {
    const img = new Image();
    img.src = `arenas/${id}.jpg`;
    img.alt = '';
    img.className = 'arena-art';
    img.decoding = 'async';
    img.addEventListener('load', () => {
      if (canvas.parentNode) canvas.replaceWith(img);
    });
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
    const th = THEMES[this.cursor - this.firstArena];
    this.backdrop(th ? th.id : this.cursor === this.trainingIdx ? TRAINING_ARENA : null);
  }

  backdrop(id) {
    if (id === this.bgId) return;
    this.bgId = id;
    const back = this.bgs[1 - this.bgFront];
    const front = this.bgs[this.bgFront];
    if (!id) { front.classList.remove('on'); back.classList.remove('on'); return; }
    back.style.backgroundImage = `url("${arenaArtUrl(id)}")`;
    back.classList.add('on');
    front.classList.remove('on');
    this.bgFront = 1 - this.bgFront;
  }
  confirm() {
    if (this.rolling) return;
    if (this.cursor === 0) { this.startRoulette(); return; }
    this.audio?.play('uiSelect');
    if (this.cursor === this.trainingIdx) { this.onDone(TRAINING_ARENA, { training: true }); return; }
    this.onDone(THEMES[this.cursor - this.firstArena].id);
  }

  // RANDOM: the selector sweeps through every arena card — fast at first,
  // easing to a crawl — and settles on the roulette's pick before starting
  startRoulette() {
    this.rolling = true;
    this.audio?.play('uiSelect');
    const picked = this.pickRandom?.();
    const pickedIdx = picked ? THEMES.findIndex((th) => th.id === picked) : -1;
    const F = this.firstArena;
    const target = F + (pickedIdx >= 0 ? pickedIdx : (Math.random() * THEMES.length) | 0);
    const seq = [];
    for (let r = 0; r < 2; r++) for (let i = F; i < F + THEMES.length; i++) seq.push(i);
    for (let i = F; i <= target; i++) seq.push(i); // final lap ends ON the pick
    let s = 0;
    const step = () => {
      this.cursor = seq[s];
      this.refresh();
      this.audio?.play('uiMove');
      s++;
      if (s >= seq.length) {
        this.audio?.play('uiSelect');
        this._rollT = setTimeout(() => this.onDone(THEMES[target - F].id), 225);
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
    // Two kinds of entry: a TOGGLE ({ label, fn }) whose label restates the
    // new state, and a SLIDER ({ label, slide }) that ←→ drags. Both relabel
    // themselves in place — the label function IS the readout.
    const relabel = (src) => {
      const i = this.items.findIndex((it) => it.src === src);
      if (i < 0) return;
      this.items[i].t = src.label();
      this.list.itemEls[i].innerHTML = this.items[i].t;
    };
    this.items = [
      ...items.map((src) => ({
        t: src.label(),
        fn: () => { (src.slide ? () => src.slide(1) : src.fn)(); relabel(src); },
        slide: src.slide
          ? (d) => { src.slide(d); relabel(src); this.audio?.play('uiMove'); }
          : undefined,
        src,
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
    this._t0 = performance.now();
  }
  update(ev) {
    // the buttons a player was mashing at the KO are the confirm keys, and
    // item 0 is REMATCH: nothing is accepted for the first beat
    if (ev?.confirm && performance.now() - this._t0 < 600) ev = { ...ev, confirm: false };
    this.list.nav(ev);
  }
  destroy() { this.el.remove(); }
}
