// Virtual mouse pointers for controllers, menu screens only. The SELECT/VIEW
// button toggles a per-pad cursor; both sticks (and the d-pad) steer it and A
// clicks whatever it hovers. While a pad's pointer is up its normal menu
// events are muted (input.pointerPads), so the sticks don't also drive menu
// cursors — SELECT again (or a battle starting) puts the pad back to normal.
import { PLAYER_COLORS, hexCss, MAX_PADS } from '../core/colors.js';

export class PadPointers {
  constructor(input, root, audio) {
    this.input = input;
    this.root = root;
    this.audio = audio;
    this.ptrs = new Array(MAX_PADS).fill(null);
  }

  toggle(i) {
    const p = this.ptrs[i];
    if (p) {
      p.el.remove();
      this.ptrs[i] = null;
      this.audio?.play('uiBack');
      return;
    }
    const col = hexCss(PLAYER_COLORS[i % PLAYER_COLORS.length]);
    const el = document.createElement('div');
    el.className = 'pad-pointer';
    el.innerHTML = `
      <svg width="24" height="30" viewBox="0 0 24 30">
        <path d="M2 1 L2 24 L8 18.5 L12 28.5 L16.5 26.5 L12.5 17 L21 17 Z"
              fill="${col}" stroke="#06101c" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>`;
    this.root.appendChild(el);
    this.ptrs[i] = { el, x: window.innerWidth / 2, y: window.innerHeight / 2, chain: [] };
    this.place(this.ptrs[i]);
    this.audio?.play('uiSelect');
    this.input.rumble(i, 0.3, 90);
  }

  place(p) { p.el.style.transform = `translate(${p.x}px, ${p.y}px)`; }

  // active = a menu screen is up (title/select/pause/results — not live combat)
  update(dt, active) {
    for (let i = 0; i < MAX_PADS; i++) {
      if (!this.input.padConnected(i)) {
        if (this.ptrs[i]) { this.ptrs[i].el.remove(); this.ptrs[i] = null; }
        this.input.pointerPads.delete(i);
        continue;
      }
      if (active && this.input.padPressed(i, 'BACK')) this.toggle(i);
      const p = this.ptrs[i];
      if (p && active) this.input.pointerPads.add(i);
      else this.input.pointerPads.delete(i);
      if (!p) continue;
      p.el.style.display = active ? '' : 'none';
      if (!active) continue;
      const pad = this.input.padsCur[i];
      let dx = (pad.lx || 0) + (pad.rx || 0);
      let dy = (pad.ly || 0) + (pad.ry || 0);
      if (this.input.padHeld(i, 'DL')) dx -= 1;
      if (this.input.padHeld(i, 'DR')) dx += 1;
      if (this.input.padHeld(i, 'DU')) dy -= 1;
      if (this.input.padHeld(i, 'DD')) dy += 1;
      if (dx || dy) {
        const spd = Math.max(window.innerWidth, window.innerHeight) * 0.85;
        p.x = Math.min(window.innerWidth - 2, Math.max(0, p.x + dx * spd * dt));
        p.y = Math.min(window.innerHeight - 2, Math.max(0, p.y + dy * spd * dt));
        this.place(p);
        this.hover(p);
      }
      if (this.input.padPressed(i, 'A')) this.click(p);
    }
  }

  // synthesize mouseenter down the ancestor chain under the pointer, so
  // hover-driven menus (roster cells, menu items) track it like a mouse
  hover(p) {
    const chain = [];
    for (let n = document.elementFromPoint(p.x, p.y); n && n !== document.documentElement; n = n.parentElement) chain.push(n);
    for (const n of chain) {
      if (!p.chain.includes(n)) n.dispatchEvent(new MouseEvent('mouseenter', { clientX: p.x, clientY: p.y }));
    }
    p.chain = chain;
  }

  click(p) {
    const el = document.elementFromPoint(p.x, p.y);
    if (!el) return;
    el.dispatchEvent(new MouseEvent('click', {
      clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, view: window,
    }));
  }
}
