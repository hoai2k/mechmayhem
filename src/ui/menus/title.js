// THE TITLE SCREEN — fight night: the sign, the roster rolling past as a film
// strip, and PRESS START.
import { playableRoster } from '../../mechs/roster.js';
import { THEMES } from '../../arena/themes.js';
import { hexCss, MAX_FIGHTERS } from '../../core/colors.js';
import { t } from '../../core/text.js';
import { loadCardIndex, hasCard, cardUrl } from '../cards.js';
import { loadPosterIndex } from '../posters.js';
import { shotUrl, requestShot } from '../../game/snapshot.js';
import { el, MenuList, playNeonBuzz, preload } from './common.js';

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

const STRIP_RESUME = 1.0;    // seconds after letting go before it rolls again

const STRIP_RAMP = 0.8;      // seconds to ease back up to full speed

const ART_WAIT = 6000;       // ms before the title's art stops holding the prefetch

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
          fighters: roster.length, arenas: THEMES.length, players: MAX_FIGHTERS })}</div>
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
