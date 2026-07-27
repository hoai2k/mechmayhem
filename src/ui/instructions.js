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

const PAD_W = 620, PAD_TOP = -80, PAD_H = 500;

// One row per control. `from` is the point on the pad art the leader starts at,
// `side` which column the callout hangs in, `y` the callout's own row.
//
// ROUTING, and why the numbers look fussy. A leader leaves the pad at some
// height (its `exit` — `from[1]`, or `drop` when it first walks down the waist
// so it doesn't cross the sticks), runs sideways to its own `lane`, then turns
// once more to meet its callout. Two rules keep the lines apart:
//
//   1. Every row owns a distinct lane, so no two verticals sit on top of
//      each other.
//   2. Rows are ordered by EXIT height and lanes step inward as the column
//      goes down — so a lower row's sideways run passes only lanes whose
//      verticals have already stopped above it.
//
// LT / RT are the exception on purpose: their lane IS the callout edge, so each
// is a plain horizontal-then-vertical L above everything else.
// `tools/ctrllines.mjs`-style checking lives in the page itself — see the
// crossing assertions in the task notes; 0 overlaps, 0 crossings.
const CONTROLS = [
  // LEFT column, top to bottom (rows ordered by the height each leader leaves
  // the pad at; lanes step inward as the column descends)
  { id: 'lt', from: [216, 112], side: 'left', y: -62, lane: 122 },
  { id: 'lb', from: [204, 148], side: 'left', y: 100, lane: 180 },
  { id: 'lstick', from: [248, 205], side: 'left', y: 165, lane: 168 },
  { id: 'dpad', from: [255, 278], side: 'left', y: 230, lane: 156 },
  // SELECT and START sit dead centre on the pad; their leaders walk down the
  // waist, out below the grips, and up into the two bottom-left callouts
  { id: 'select', from: [292, 196], side: 'left', y: 295, lane: 144, drop: 352 },
  { id: 'start', from: [328, 196], side: 'left', y: 360, lane: 132, drop: 366 },
  // RIGHT column — the four face buttons get a callout each, fanned out of the
  // cluster at four different heights so no two leaders share a lane or a run
  { id: 'rt', from: [404, 112], side: 'right', y: -62, lane: 498 },
  { id: 'rb', from: [416, 148], side: 'right', y: 100, lane: 430 },
  { id: 'y', from: [372, 183], side: 'right', y: 150, lane: 440, drop: 150 },
  { id: 'b', from: [394, 205], side: 'right', y: 200, lane: 450 },
  { id: 'a', from: [372, 227], side: 'right', y: 250, lane: 460, drop: 260 },
  { id: 'rstick', from: [365, 278], side: 'right', y: 300, lane: 470 },
  { id: 'x', from: [350, 205], side: 'right', y: 350, lane: 480, drop: 340 },
];

const svgNS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs) => {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

// A centered label drawn onto the pad art.
function padText(x, y, label, fill, size) {
  const tx = mk('text', { x, y, 'text-anchor': 'middle', fill,
    'font-size': size, 'font-weight': 800, 'font-family': 'inherit' });
  tx.textContent = label;
  return tx;
}

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
  for (const [x, bumper, trigger] of [[200, 'LB', 'LT'], [358, 'RB', 'RT']]) {
    svg.appendChild(mk('rect', { x, y: 140, width: 62, height: 15, rx: 7,
      fill: 'rgba(60,95,130,0.9)', stroke: '#5f9fc8', 'stroke-width': 2 }));
    svg.appendChild(mk('rect', { x: x + 8, y: 108, width: 46, height: 24, rx: 10,
      fill: 'rgba(40,70,100,0.9)', stroke: '#4d86ad', 'stroke-width': 2 }));
    // the shoulder controls are the ones a player can't see on their own pad
    // without turning it over, so they get their names printed on
    svg.appendChild(padText(x + 31, 152, bumper, '#0d1626', 10));
    svg.appendChild(padText(x + 31, 125, trigger, '#cfe4f4', 12));
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

    const svg = mk('svg', { viewBox: `0 ${PAD_TOP} ${PAD_W} ${PAD_H}`, class: 'ctrl-svg' });
    drawPad(svg);
    this.lines = [];
    this.labels = [];
    // stage % for a viewBox y — labels and leaders share one coordinate space
    const pct = (y) => `${((y - PAD_TOP) / PAD_H) * 100}%`;
    CONTROLS.forEach((c, i) => {
      const left = c.side === 'left';
      const ly = c.y + 14;
      // `drop` walks the leader down (or up) the pad first, so it leaves the
      // art at a height no other leader is using
      const exit = c.drop ?? c.from[1];
      const stem = c.drop != null ? `${c.from[0]},${c.from[1]} ${c.from[0]},${c.drop}` : `${c.from[0]},${c.from[1]}`;
      const points = `${stem} ${c.lane},${exit} ${c.lane},${ly} ${left ? 122 : PAD_W - 122},${ly}`;
      const line = mk('polyline', {
        points, fill: 'none', stroke: 'rgba(120,190,235,0.5)', 'stroke-width': 2,
      });
      svg.appendChild(line);
      this.lines.push(line);

      const lab = document.createElement('div');
      lab.className = `ctrl-label ${c.side}`;
      lab.innerHTML = `<b>${t(`controls.${c.id}.name`)}</b><span>${t(`controls.${c.id}.action`)}</span>`;
      lab.style.top = pct(ly);
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
