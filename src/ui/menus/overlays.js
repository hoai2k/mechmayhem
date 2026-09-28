// The small screens: pause, settings and results.
import { mechIcon } from '../icons.js';
import { hexCss } from '../../core/colors.js';
import { t } from '../../core/text.js';
import { el, appendTouchBack, MenuList } from './common.js';

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
