// Now-playing readout: a small chip in the bottom corner naming the song the
// battle soundtrack is on, with a speaker icon that turns the music off and on
// (the fight's SFX are untouched — that's the corner 🔊 button's job).
//
// IT IS ALSO THE TRANSPORT, and only on HOVER. Turning the music off is a
// blunt answer to "not this song", so the chip grows a ⏮ and a ⏭ when the
// mouse is on it and the title slides over to sit between them; at rest it is
// the same quiet one-line readout it always was, because a permanent pair of
// transport buttons in the corner of a fight is clutter for something you
// touch once a match. MOUSE ONLY, deliberately: there is no pad binding and
// none is wanted — every controller button is spoken for by the fight, and a
// player who wants a different song has a hand free.
//
// The whole chip still toggles the music, so the buttons have to stop their
// own clicks from reaching it (see `nav`).
//
// It only exists while a battle soundtrack does; setVisible() hides it on the
// menus, where the procedural sequencer plays instead.
import { t } from '../core/text.js';

export class NowPlaying {
  /**
   * @param {object} [opts]
   * @param {() => boolean} [opts.paused] is the fight sitting on the pause
   *   menu right now? Pressing a transport button there AUDITIONS — the song
   *   plays quietly under the menu and comes up to full when the fight does
   *   (music.setPreview / resume). Without this the buttons would be dead on
   *   the one screen you have time to use them.
   */
  constructor(root, music, opts = {}) {
    this.music = music;
    this.isPaused = opts.paused || (() => false);

    this.el = document.createElement('div');
    this.el.id = 'now-playing';
    this.el.style.display = 'none';

    this.iconEl = document.createElement('span');
    this.iconEl.className = 'np-icon';
    this.prevEl = this.navButton('⏮', () => this.music.back());
    this.labelEl = document.createElement('span');
    this.labelEl.className = 'np-label';
    this.nextEl = this.navButton('⏭', () => this.music.skip());
    this.el.append(this.iconEl, this.prevEl, this.labelEl, this.nextEl);
    root.appendChild(this.el);

    this.el.addEventListener('click', () => {
      this.music.setEnabled(!this.music.enabled);
    });
    this.visible = false;
    music.onChange = () => this.render();
    this.render();
  }

  /**
   * One transport button. `stopPropagation` is the whole reason this is a
   * helper: the chip's own click toggles the music, so without it every skip
   * would also silence the thing you just asked to hear.
   */
  navButton(glyph, act) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'np-btn';
    b.textContent = glyph;
    b.tabIndex = -1;           // not a keyboard stop: the game owns the keys
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      // AUDITIONING FROM THE PAUSE MENU. The soundtrack is stopped there, and
      // a transport button that does nothing on the one screen with time to
      // use it is not a transport button — so the press starts it quietly and
      // the unpause (music.resume) hands it back to full.
      if (this.isPaused()) this.music.setPreview(true);
      // Reaching for the transport with the music switched off means "play
      // something else", not "stay silent": turn it back on and honour it.
      if (!this.music.enabled) this.music.setEnabled(true);
      act();
      this.render();
    });
    return b;
  }

  setVisible(v) {
    v = !!v && this.music.available;
    if (v === this.visible) return;
    this.visible = v;
    this.el.style.display = v ? '' : 'none';
  }

  render() {
    const m = this.music;
    const on = m.enabled && !m.muted;
    this.iconEl.textContent = on ? '🔊' : '🔇';
    this.labelEl.textContent = !on ? t('music.off')
      : m.nowPlaying ? t('music.nowPlaying', { name: m.nowPlaying })
      : '';
    this.el.classList.toggle('np-off', !on);
    this.el.title = t('music.btn');
    this.el.dataset.tip = t('music.btn');
    // The transport is hidden while the music is off — the chip then says
    // MUSIC OFF and its one job is turning it back on.
    this.el.classList.toggle('np-nonav', !on);
    // BACK is never disabled: it can always rewind, whether or not there is a
    // song behind this one. The tooltip is what tells you which you'll get.
    this.prevEl.title = m.hasPrev ? t('music.prev') : t('music.restart');
    this.nextEl.title = t('music.next');
  }

  destroy() {
    if (this.music.onChange) this.music.onChange = null;
    this.el.remove();
  }
}
