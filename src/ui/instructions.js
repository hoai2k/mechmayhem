// CONTROLS — the ⓘ modal: an Xbox pad drawn to scale with a leader line from
// every control to what it does in this game, and a detail line for whichever
// one you're pointing at.
//
// The diagram is an inline SVG (no asset to ship, scales to any screen) laid
// out in one coordinate space: PAD_W×PAD_H below is that space, every control
// carries the point its leader line starts from, and the labels are absolutely
// positioned in the same space. Move a control and its line follows.
//
// Every string is a text-catalogue id (controls.*), so this page translates
// with the rest of the game.
import { t } from '../core/text.js';

const PAD_W = 620, PAD_H = 420;

// One row per control: where the leader line starts (x, y in pad space), which
// side the label hangs off, and the label's own y. `id` names the catalogue
// entries: controls.<id>.name / .action / .detail.
const CONTROLS = [
  // left column, top to bottom
  { id: 'lt', from: [216, 118], side: 'left', y: -46 },
  { id: 'lb', from: [204, 148], side: 'left', y: 14 },
  { id: 'lstick', from: [248, 205], side: 'left', y: 96 },
  { id: 'dpad', from: [255, 278], side: 'left', y: 186 },
  { id: 'view', from: [292, 196], side: 'left', y: 286, drop: 306 },
  // right column, top to bottom
  { id: 'rt', from: [404, 118], side: 'right', y: -46 },
  { id: 'rb', from: [416, 148], side: 'right', y: 14 },
  { id: 'face', from: [372, 205], side: 'right', y: 96 },
  { id: 'rstick', from: [365, 278], side: 'right', y: 186 },
  { id: 'menu', from: [328, 196], side: 'right', y: 286, drop: 306 },
];

const svgNS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs) => {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

// The pad itself: body, grips, sticks, d-pad, face buttons, bumpers/triggers.
function drawPad(svg) {
  // symmetric about x = 310: two shoulders, a waist, two grips
  svg.appendChild(mk('path', {
    d: 'M310 138 C 360 138, 405 146, 430 160 C 458 176, 472 220, 470 266'
      + ' C 468 312, 448 338, 418 336 C 392 334, 378 312, 356 302'
      + ' C 340 295, 326 293, 310 293 C 294 293, 280 295, 264 302'
      + ' C 242 312, 228 334, 202 336 C 172 338, 152 312, 150 266'
      + ' C 148 220, 162 176, 190 160 C 215 146, 260 138, 310 138 Z',
    fill: 'rgba(28,42,62,0.95)', stroke: '#5f9fc8', 'stroke-width': 3,
  }));
  // bumpers (LB / RB) and triggers (LT / RT) above them
  for (const x of [200, 358]) {
    svg.appendChild(mk('rect', { x, y: 140, width: 62, height: 15, rx: 7,
      fill: 'rgba(60,95,130,0.9)', stroke: '#5f9fc8', 'stroke-width': 2 }));
    svg.appendChild(mk('rect', { x: x + 8, y: 112, width: 46, height: 22, rx: 10,
      fill: 'rgba(40,70,100,0.9)', stroke: '#4d86ad', 'stroke-width': 2 }));
  }
  // sticks: left one up top, right one down low (Xbox layout)
  for (const [cx, cy] of [[248, 205], [365, 278]]) {
    svg.appendChild(mk('circle', { cx, cy, r: 27, fill: 'rgba(12,20,32,0.9)', stroke: '#4d86ad', 'stroke-width': 2 }));
    svg.appendChild(mk('circle', { cx, cy, r: 17, fill: 'rgba(70,110,150,0.85)' }));
  }
  // d-pad, below the left stick
  svg.appendChild(mk('path', {
    d: 'M247 260 h16 v-16 h16 v16 h16 v16 h-16 v16 h-16 v-16 h-16 Z',
    transform: 'translate(-13 -6)', fill: 'rgba(70,110,150,0.85)', stroke: '#4d86ad', 'stroke-width': 2,
  }));
  // face buttons — Y top, A bottom, X left, B right (Xbox layout + colors)
  const face = [[372, 183, 'Y', '#ffd24a'], [372, 227, 'A', '#6fe08a'],
    [350, 205, 'X', '#5fb8ff'], [394, 205, 'B', '#ff6f6f']];
  for (const [cx, cy, label, col] of face) {
    svg.appendChild(mk('circle', { cx, cy, r: 13, fill: 'rgba(12,20,32,0.95)', stroke: col, 'stroke-width': 2 }));
    const tx = mk('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', fill: col,
      'font-size': 14, 'font-weight': 800, 'font-family': 'inherit' });
    tx.textContent = label;
    svg.appendChild(tx);
  }
  // view / menu, either side of the waist
  for (const [cx, label] of [[292, '⧉'], [328, '≡']]) {
    svg.appendChild(mk('circle', { cx, cy: 196, r: 9, fill: 'rgba(70,110,150,0.85)' }));
    const tx = mk('text', { x: cx, y: 201, 'text-anchor': 'middle', fill: '#0d1626', 'font-size': 11, 'font-weight': 800 });
    tx.textContent = label;
    svg.appendChild(tx);
  }
}

export class InstructionsScreen {
  constructor(root, { audio, onBack }) {
    this.audio = audio;
    this.onBack = onBack;
    this.sel = 0;

    this.el = document.createElement('div');
    this.el.className = 'screen dim fade-in';
    this.el.style.zIndex = 31;
    this.el.style.background = '#060a11';
    this.el.innerHTML = `<div class="mega-title pause-title ctrl-title">${t('controls.title')}</div>`;

    const wrap = document.createElement('div');
    wrap.className = 'ctrl-wrap';
    const stage = document.createElement('div');
    stage.className = 'ctrl-stage';
    wrap.appendChild(stage);

    const svg = mk('svg', { viewBox: `0 -70 ${PAD_W} ${PAD_H}`, class: 'ctrl-svg' });
    drawPad(svg);
    this.lines = [];
    this.labels = [];
    CONTROLS.forEach((c, i) => {
      // route: out sideways clear of the pad body, up/down to the label's
      // row, then in to the label — so no leader crosses the pad
      const left = c.side === 'left';
      const outX = left ? 140 : PAD_W - 140;
      const endX = left ? 118 : PAD_W - 118;
      const ly = c.y + 14;
      // `drop` first walks the leader down the pad's waist (VIEW / MENU sit
      // dead center, and a straight sideways line would cross both sticks)
      const start = c.drop
        ? `${c.from[0]},${c.from[1]} ${c.from[0]},${c.drop} ${outX},${c.drop}`
        : `${c.from[0]},${c.from[1]} ${outX},${c.from[1]}`;
      const line = mk('polyline', {
        points: `${start} ${outX},${ly} ${endX},${ly}`,
        fill: 'none', stroke: 'rgba(120,190,235,0.5)', 'stroke-width': 2,
      });
      svg.appendChild(line);
      this.lines.push(line);

      const lab = document.createElement('div');
      lab.className = `ctrl-label ${c.side}`;
      lab.innerHTML = `<b>${t(`controls.${c.id}.name`)}</b><span>${t(`controls.${c.id}.action`)}</span>`;
      // position in the SVG's own coordinate space (the stage is sized to it)
      lab.style.top = `${((c.y + 70 + 14) / PAD_H) * 100}%`;
      lab.style[c.side] = '0';
      lab.addEventListener('mouseenter', () => this.select(i));
      lab.addEventListener('click', () => this.select(i));
      stage.appendChild(lab);
      this.labels.push(lab);
    });
    stage.appendChild(svg);

    this.detail = document.createElement('div');
    this.detail.className = 'ctrl-detail';
    wrap.appendChild(this.detail);
    wrap.appendChild(Object.assign(document.createElement('div'),
      { className: 'ctrl-foot', innerHTML: t('controls.foot.html') }));
    const close = document.createElement('div');
    close.className = 'ctrl-close';
    close.textContent = t('controls.close');
    close.addEventListener('click', () => { this.audio?.play('uiBack'); this.onBack(); });
    wrap.appendChild(close);
    this.el.appendChild(wrap);

    root.appendChild(this.el);
    this.refresh();
  }

  select(i) {
    if (i === this.sel) return;
    this.sel = i;
    this.audio?.play('uiMove');
    this.refresh();
  }

  refresh() {
    this.labels.forEach((l, i) => l.classList.toggle('on', i === this.sel));
    this.lines.forEach((l, i) => {
      l.setAttribute('stroke', i === this.sel ? 'var(--hud-cyan)' : 'rgba(120,190,235,0.5)');
      l.setAttribute('stroke-width', i === this.sel ? 3 : 2);
    });
    const c = CONTROLS[this.sel];
    this.detail.innerHTML = `<b>${t(`controls.${c.id}.name`)}</b> ${t(`controls.${c.id}.detail`)}`;
  }

  // ↑↓ (and ←→) walk the callouts so a pad can read the whole diagram
  update(ev) {
    const n = CONTROLS.length;
    if (ev.up || ev.left) this.select((this.sel + n - 1) % n);
    if (ev.down || ev.right) this.select((this.sel + 1) % n);
    if (ev.back || ev.pause || ev.confirm) { this.audio?.play('uiBack'); this.onBack(); }
  }

  destroy() { this.el.remove(); }
}
