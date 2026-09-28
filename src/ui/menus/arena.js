// ARENA SELECT — the painted arena under the cursor, full-bleed behind its grid.
import { THEMES } from '../../arena/themes.js';
import { hexCss } from '../../core/colors.js';
import { t } from '../../core/text.js';
import { arenaArtUrl } from '../arenaart.js';
import { el, appendTouchBack } from './common.js';

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
