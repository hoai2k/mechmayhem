// Now-playing readout: small text in the bottom-right corner naming the song
// the battle soundtrack is on, with a speaker icon that turns the music off and
// on (the fight's SFX are untouched — that's the corner 🔊 button's job).
//
// It only exists while a battle soundtrack does; setVisible() hides it on the
// menus, where the procedural sequencer plays instead.
import { t } from '../core/text.js';

export class NowPlaying {
  constructor(root, music) {
    this.music = music;
    this.el = document.createElement('div');
    this.el.id = 'now-playing';
    this.el.style.display = 'none';

    this.iconEl = document.createElement('span');
    this.iconEl.className = 'np-icon';
    this.labelEl = document.createElement('span');
    this.labelEl.className = 'np-label';
    this.el.append(this.iconEl, this.labelEl);
    root.appendChild(this.el);

    this.el.addEventListener('click', () => {
      this.music.setEnabled(!this.music.enabled);
    });
    this.visible = false;
    music.onChange = () => this.render();
    this.render();
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
  }

  destroy() {
    if (this.music.onChange) this.music.onChange = null;
    this.el.remove();
  }
}
