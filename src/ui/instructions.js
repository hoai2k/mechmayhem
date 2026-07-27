// CONTROLS — the ⓘ modal: an Xbox pad drawn to scale with a leader line from
// every control to what it does in this game, and a detail line for whichever
// one you're pointing at.
//
// The diagram is an inline SVG (no asset to ship, scales to any screen) laid
// out in one coordinate space: the viewBox below is that space, every control
// carries the point its leader line starts from, and the labels are absolutely
// positioned in the same space. Move a control and its line follows.
//
// Every string is a text-catalogue id (controls.*), so this page translates
// with the rest of the game.
import { t } from '../core/text.js';

// The pad art is drawn in a 620-wide space (its body spans x 150..470). The
// viewBox is WIDER than the art on purpose: the margin either side is where the
// leaders do their turning, so a jog never lands on the controller.
const VB_X = -70, VB_W = 760, PAD_TOP = 30, PAD_H = 400;
const LABEL_FRAC = 0.21;                                    // .ctrl-label width
const END_L = Math.round(VB_X + LABEL_FRAC * VB_W);         // leader touches the box
const END_R = Math.round(VB_X + VB_W - LABEL_FRAC * VB_W);

// One row per control. `from` is the point on the pad art the leader leaves
// from — the button's OUTWARD EDGE, so the line never starts inside it — and
// `y` is the height its callout sits at.
//
// ROUTING, cheapest first. A leader should be as close to a straight line as
// the pad allows, so each control picks the simplest `route` that works:
//
//   'flat'   one horizontal, button straight out to the callout. The callout
//            sits at the button's own height. Best, and most controls get it.
//   'elbow'  one vertical off the button, then over. Used where the callout
//            can't sit at the button's height (two controls at the same height,
//            or a centre button whose sideways run would cross a stick).
//   'lane'   out, one jog on the control's own `lane`, then in. Last resort,
//            and nothing needs it now — the callouts are single-line, which
//            packs them tightly enough that every control reaches its own at
//            its own height or with one turn.
//
// Lanes live outside the pad silhouette (x < 150 or x > 470) so a jog is never
// drawn on the controller. Verticals are placed to clear every other button.
const CONTROLS = [
  // LEFT column
  { id: 'lt', from: [216, 112], side: 'left', route: 'elbow', y: 70 },
  { id: 'lb', from: [204, 148], side: 'left', route: 'flat' },
  { id: 'lstick', from: [221, 205], side: 'left', route: 'flat' },
  // aimed at the d-pad's UP arm, since UP is the control that does something
  { id: 'dpad', from: [250, 246], side: 'left', route: 'flat' },
  // SELECT and START sit dead centre: leaving sideways would cross a stick, so
  // they drop down the waist, clear of the grips, and run out from there
  { id: 'select', from: [292, 196], side: 'left', route: 'elbow', y: 346 },
  { id: 'start', from: [328, 196], side: 'left', route: 'elbow', y: 400 },
  // RIGHT column. X climbs out of the cluster to sit directly above Y — its
  // run threads the 15-unit band between the RB bumper (ends 155) and Y's
  // button (starts 170), which is also why it clears RB's leader: that one
  // rises from 148, so nothing of it reaches 158.
  { id: 'rt', from: [404, 112], side: 'right', route: 'elbow', y: 70 },
  { id: 'rb', from: [416, 148], side: 'right', route: 'elbow', y: 120 },
  { id: 'x', from: [350, 205], side: 'right', route: 'elbow', y: 158 },
  { id: 'y', from: [385, 183], side: 'right', route: 'flat' },
  { id: 'b', from: [407, 205], side: 'right', route: 'flat' },
  { id: 'a', from: [385, 227], side: 'right', route: 'flat' },
  { id: 'rstick', from: [392, 278], side: 'right', route: 'flat' },
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
  // d-pad, below the left stick. Its UP arm is the one that does something in
  // battle (the ultimate), so that arm wears the ▲ its callout points at.
  svg.appendChild(mk('path', {
    d: 'M247 260 h16 v-16 h16 v16 h16 v16 h-16 v16 h-16 v-16 h-16 Z',
    transform: 'translate(-13 -6)', fill: 'rgba(70,110,150,0.85)', stroke: '#4d86ad', 'stroke-width': 2,
  }));
  svg.appendChild(mk('path', {
    d: 'M258 240 l6 10 h-12 Z', fill: '#0d1626',
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

    const svg = mk('svg', { viewBox: `${VB_X} ${PAD_TOP} ${VB_W} ${PAD_H}`, class: 'ctrl-svg' });
    drawPad(svg);
    this.lines = [];
    this.labels = [];
    // stage % for a viewBox y — labels and leaders share one coordinate space
    const pct = (y) => `${((y - PAD_TOP) / PAD_H) * 100}%`;
    CONTROLS.forEach((c, i) => {
      const left = c.side === 'left';
      // A leader runs to the callout box's own edge (END_L / END_R are that
      // 21% column, in viewBox units) so it TOUCHES its box. The stage keeps
      // the viewBox's exact aspect (see .ctrl-stage) — without that the SVG
      // letterboxes inside it and every leader lands short of its callout.
      const endX = left ? END_L : END_R;
      const [fx, fy] = c.from;
      const ly = c.route === 'flat' ? fy : c.y;
      const points = {
        flat: () => `${fx},${fy} ${endX},${ly}`,
        elbow: () => `${fx},${fy} ${fx},${ly} ${endX},${ly}`,
        lane: () => `${fx},${fy} ${c.lane},${fy} ${c.lane},${ly} ${endX},${ly}`,
      }[c.route]();
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
