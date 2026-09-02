// Battle HUD: health/ult plates, round pips, timer, announcements,
// damage popups, special/ult callouts, controller toasts.
import { mechIcon } from './icons.js';
import * as THREE from 'three';
import { PLAYER_COLORS_CSS as COLOR_CSS } from '../core/colors.js';
import { clamp01 } from '../core/utils.js';
import { t } from '../core/text.js';
const _v = new THREE.Vector3();

export class Hud {
  constructor(root, world) {
    this.world = world;
    this.el = document.createElement('div');
    this.el.id = 'hud';
    root.appendChild(this.el);

    this.plates = [];
    this.timerEl = document.createElement('div');
    this.timerEl.className = 'hud-timer';
    this.el.appendChild(this.timerEl);

    this.announceEl = document.createElement('div');
    this.announceEl.id = 'announce';
    this.el.appendChild(this.announceEl);

    this.popupLayer = document.createElement('div');
    this.popupLayer.id = 'popup-layer';
    this.el.appendChild(this.popupLayer);

    // THE 3-PLAYER STATS PANEL. With three humans the split stands the three
    // views in an L and leaves the top-right quadrant empty ON PURPOSE (see
    // camera.js LAYOUTS) — this is what goes in it. Every plate moves INSIDE
    // it and stacks, so no player's viewport carries a plate at all; at any
    // other player count it is not displayed and the plates sit in their
    // viewports' corners exactly as they always have.
    this.statsPanel = document.createElement('div');
    this.statsPanel.id = 'hud-stats';
    this.statsPanel.style.display = 'none';
    this.el.appendChild(this.statsPanel);

    this.calloutEl = document.createElement('div');
    this.calloutEl.style.cssText = `
      position:absolute; top:14vh; left:0; right:0; text-align:center; opacity:0;
      font-size:clamp(18px,2.4vw,32px); font-weight:900; font-style:italic;
      letter-spacing:0.12em; text-transform:uppercase; color:#fff;
      text-shadow:0 0 18px rgba(180,107,255,0.9), 0 2px 4px #000; transition:opacity 0.2s;`;
    this.el.appendChild(this.calloutEl);
    this.calloutT = 0;

    // lock-aim crosshairs: one per human — a LIGHT reticle projected onto
    // the player's lock-aim point (drifts onto the locked enemy) while LB
    // target lock is held; ranged shots fired during the lock fly at it
    this.crosshairs = [];
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('div');
      c.style.cssText = `
        position:absolute; width:28px; height:28px; display:none;
        transform:translate(-50%,-50%); pointer-events:none; z-index:6;
        border:1.5px solid rgba(255,255,255,0.55); border-radius:50%;`;
      c.innerHTML = `
        <i style="position:absolute;left:50%;top:50%;width:3px;height:3px;background:rgba(255,255,255,0.8);border-radius:50%;transform:translate(-50%,-50%)"></i>
        <i style="position:absolute;left:50%;top:-7px;width:1.5px;height:6px;background:rgba(255,255,255,0.6);transform:translateX(-50%)"></i>
        <i style="position:absolute;left:50%;bottom:-7px;width:1.5px;height:6px;background:rgba(255,255,255,0.6);transform:translateX(-50%)"></i>
        <i style="position:absolute;top:50%;left:-7px;height:1.5px;width:6px;background:rgba(255,255,255,0.6);transform:translateY(-50%)"></i>
        <i style="position:absolute;top:50%;right:-7px;height:1.5px;width:6px;background:rgba(255,255,255,0.6);transform:translateY(-50%)"></i>`;
      this.el.appendChild(c);
      this.crosshairs.push(c);
    }

    // SNIPER MODE (LB held): a scope vignette over that player's own viewport,
    // faded in by the same `sniperK` the camera zooms on — so the frame closing
    // in and the view magnifying are one move. It is a HINT, not an occluder:
    // it darkens the corners and leaves the middle of the shot clear.
    this.scopes = [];
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('div');
      s.style.cssText = `
        position:absolute; display:none; pointer-events:none; z-index:5; opacity:0;
        background:radial-gradient(ellipse at center,
          rgba(0,0,0,0) 34%, rgba(0,0,0,0.28) 62%, rgba(0,0,0,0.72) 100%);`;
      this.el.appendChild(s);
      this.scopes.push(s);
    }

    this.unsubs = [
      world.events.on('damage', (d) => this.onDamage(d)),
      world.events.on('special', (d) => this.callout(t('hud.special', { mech: d.fighter.def.name, move: d.name }))),
      world.events.on('ult', (d) => this.callout(t('hud.ult', { mech: d.fighter.def.name, move: d.name }), true)),
      // combat-driven center-screen text (AEGIS's JUDGEMENT verdict)
      world.events.on('banner', (d) => this.announce(d.text || '', !!d.hold, d.color || null)),
    ];
    this.popupBudget = 0;
    // TRAINING (game/training.js): the clock's slot reads TRAINING instead of
    // a count, and update() leaves it alone
    this.training = false;
  }

  // the plate root a fighter's checklist (or anything else) hangs off — null
  // for a fighter with no plate (a summon)
  plateFor(fighter) {
    return this.plates.find((p) => p.f === fighter)?.root || null;
  }

  setTraining(on) {
    this.training = !!on;
    this.timerEl.classList.toggle('training', this.training);
    this.timerEl.textContent = this.training ? t('training.title') : '';
  }

  buildPlates(fighters) {
    for (const p of this.plates) p.root.remove();
    this.plates = [];
    fighters.forEach((f, i) => {
      const root = document.createElement('div');
      root.className = 'hud-plate';
      root.innerHTML = `
        <div class="hp-head">
          <span class="hp-player" style="color:${COLOR_CSS[i % 4]}">${f.isAI ? t('hud.cpu') : t('hud.player', { n: i + 1 })}</span>
          <span class="hp-name">${mechIcon(f.def, 17)}${f.def.name}</span>
        </div>
        <div class="hud-bar hp"><div class="bar-ghost"></div><div class="bar-fill"></div></div>
        <div class="ult-badges"><span class="ult-badge">★</span><span class="ult-badge">★</span></div>
        ${!f.isAI ? '<div class="hud-bar sprint"><div class="bar-fill"></div></div>' : ''}
        ${f.ammoMax !== undefined ? '<div class="ammo-count" style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#ffd23c;margin-top:2px;"></div>' : ''}
        <div class="round-pips">
          <div class="round-pip"></div><div class="round-pip"></div>
        </div>
        <div class="death-count" style="display:none;font-size:11px;font-weight:800;letter-spacing:0.08em;color:#ff7d8a;margin-top:2px;"></div>`;
      this.el.appendChild(root);
      this.plates.push({
        root, f,
        head: root.querySelector('.hp-head'),
        pipsRow: root.querySelector('.round-pips'),
        hpBar: root.querySelector('.hud-bar.hp'),
        hp: root.querySelector('.hud-bar.hp .bar-fill'),
        ghost: root.querySelector('.bar-ghost'),
        ultBadges: [...root.querySelectorAll('.ult-badge')],
        sprintBar: root.querySelector('.hud-bar.sprint'),
        sprintFill: root.querySelector('.hud-bar.sprint .bar-fill'),
        pips: [...root.querySelectorAll('.round-pip')],
        ammoEl: root.querySelector('.ammo-count'),
        deathEl: root.querySelector('.death-count'),
        ghostVal: 1,
      });
    });
    this.positionPlates('single', []);
  }

  // place plates to match the split layout so each human's plate lives in
  // their own viewport. kind: 'single' | 'lr' | 'tb' | '3' | '4';
  // humanIdx: indices into the plates array that are human, in viewport order.
  //
  // '3' IS THE EXCEPTION AND IT IS THE WHOLE POINT: three views leave a spare
  // quadrant, so every plate goes into the panel there instead of being dealt a
  // corner of somebody's view. Nothing about the plates themselves changes —
  // they are the same elements, re-parented — so health, ult badges, pips,
  // ammo and death counts all keep updating through the same handles.
  positionPlates(kind, humanIdx = []) {
    const panelled = kind === '3';
    this.statsPanel.style.display = panelled ? 'flex' : 'none';
    if (panelled) {
      // the round clock is a stat too, and centred on screen it straddles the
      // panel's own edge — so it goes in at the top of it
      this.statsPanel.appendChild(this.timerEl);
      this.timerEl.classList.add('in-stats');
      this.plates.forEach((p) => {
        this.statsPanel.appendChild(p.root);
        p.root.style.cssText = '';          // the panel lays them out, not a corner
        p.head.style.flexDirection = '';
        p.pipsRow.style.justifyContent = '';
      });
      return;
    }
    if (this.timerEl.parentNode !== this.el) this.el.appendChild(this.timerEl);
    this.timerEl.classList.remove('in-stats');
    for (const p of this.plates) if (p.root.parentNode !== this.el) this.el.appendChild(p.root);
    const POS = {
      TL: ['top:2.5vh;left:2vw;', false], TR: ['top:2.5vh;right:2vw;', true],
      BL: ['bottom:3vh;left:2vw;', false], BR: ['bottom:3vh;right:2vw;', true],
      ML: ['top:52vh;left:2vw;', false], MR: ['top:52vh;right:2vw;', true],
    };
    // no '3' here — that layout returned above, into the stats panel
    const HUMAN_SLOTS = { lr: ['TL', 'TR'], tb: ['TL', 'ML'], 4: ['TL', 'TR', 'ML', 'MR'] };
    const AI_SLOTS = { lr: ['BL', 'BR'], tb: ['TR', 'MR'], 4: [] };
    const assign = [];
    if (kind === 'single' || !HUMAN_SLOTS[kind]) {
      const order = ['TL', 'TR', 'BL', 'BR'];
      this.plates.forEach((p, i) => { assign[i] = order[i % 4]; });
    } else {
      const hs = HUMAN_SLOTS[kind], as = AI_SLOTS[kind];
      const spare = ['BL', 'BR', 'MR', 'TR'];
      let h = 0, a = 0;
      this.plates.forEach((p, i) => {
        if (humanIdx.includes(i) && h < hs.length) {
          assign[i] = hs[h++];
        } else {
          assign[i] = as[a] || spare[a % spare.length];
          a++;
        }
      });
    }
    this.plates.forEach((p, i) => {
      const [css, right] = POS[assign[i]];
      p.root.style.cssText = css;
      p.head.style.flexDirection = right ? 'row-reverse' : '';
      p.pipsRow.style.justifyContent = right ? 'flex-end' : '';
    });
  }

  update(dt, camera, timeLeft) {
    for (const p of this.plates) {
      const f = p.f;
      const frac = clamp01(f.hp / f.maxHp);
      p.ghostVal += (frac - p.ghostVal) * (frac > p.ghostVal ? 1 : dt * 2.2);
      p.hp.style.transform = `scaleX(${frac})`;
      p.ghost.style.transform = `scaleX(${p.ghostVal})`;
      p.hpBar.classList.toggle('low', frac < 0.3);
      // ult badges: one ★ per collected fountain charge; the badge being
      // SPENT blazes for the ult's opening beat, then disappears
      p.ultBadges.forEach((el, bi) => {
        const held = bi < f.ultCharges;
        const firing = !held && bi === f.ultCharges && f.ultFlashT > 0;
        el.classList.toggle('held', held);
        el.classList.toggle('firing', firing);
      });
      if (p.sprintFill) {
        p.sprintFill.style.transform = `scaleX(${clamp01(f.sprintEnergy / f.sprintEnergyMax)})`;
        p.sprintBar.classList.toggle('draining', !!f.sprinting);
      }
      if (p.ammoEl) {
        p.ammoEl.textContent = f.ammo > 0 ? t('hud.ammo', { n: f.ammo }) : t('hud.ammoEmpty');
        p.ammoEl.style.color = f.ammo > 0 ? '#ffd23c' : '#ff5050';
      }
      p.pips.forEach((pip, i) => pip.classList.toggle('won', f.wins > i));
    }
    if (timeLeft !== undefined && !this.training) {
      this.timerEl.textContent = timeLeft === Infinity ? '' : Math.max(0, Math.ceil(timeLeft));
    }
    this.calloutT -= dt;
    if (this.calloutT <= 0) this.calloutEl.style.opacity = 0;

    // lock-aim crosshairs: project each locking player's aim point into
    // their own viewport (hidden when it falls behind the camera)
    const cams = this.world.cameraSys;
    const humans = this.world.fighters.filter((f) => !f.isAI);
    for (let i = 0; i < this.crosshairs.length; i++) {
      const el = this.crosshairs[i];
      const f = humans[i];
      let shown = false;
      const k = f?.sniperK || 0;
      if (f && f._lockAim && f.alive && cams?.cameraFor) {
        const cam = cams.cameraFor(i);
        _v.copy(f._lockAim).project(cam);
        if (_v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2) {
          const vp = cams.viewportRectFor(i);
          el.style.left = (vp.x + (_v.x * 0.5 + 0.5) * vp.w) * 100 + '%';
          el.style.top = (1 - (vp.y + (_v.y * 0.5 + 0.5) * vp.h)) * 100 + '%';
          // SCOPED IN, THE RETICLE IS BIG. The scope is almost first person and
          // the crosshair is the whole interface at that point — which target is
          // held, where the shot goes — so it grows into a proper sight instead
          // of staying the discreet lock dot it is over the shoulder.
          el.style.transform = `translate(-50%,-50%) scale(${(1 + 1.35 * k).toFixed(3)})`;
          el.style.borderColor = `rgba(255,255,255,${(0.55 + 0.4 * k).toFixed(2)})`;
          el.style.display = 'block';
          shown = true;
        }
      }
      if (!shown && el.style.display !== 'none') el.style.display = 'none';
      // ...and the scope vignette over that player's own viewport
      const sc = this.scopes[i];
      if (k > 0.01 && f?.alive && cams) {
        const vp = cams.viewportRectFor(i);
        sc.style.left = vp.x * 100 + '%';
        sc.style.top = (1 - vp.y - vp.h) * 100 + '%';
        sc.style.width = vp.w * 100 + '%';
        sc.style.height = vp.h * 100 + '%';
        sc.style.opacity = k.toFixed(3);
        sc.style.display = 'block';
      } else if (sc.style.display !== 'none') sc.style.display = 'none';
    }
  }

  // BRAWL MODE (3+ robots, match.js): how many times this robot has been put
  // down this round — the thing the round is actually scored on, so it belongs
  // on the plate beside the health. Hidden at zero and in a duel, where a death
  // ends the round and a counter of it would only ever read 0 or 1.
  setDeaths(fighter, n) {
    const p = this.plates.find((x) => x.f === fighter);
    if (!p?.deathEl) return;
    p.deathEl.style.display = n > 0 ? 'block' : 'none';
    p.deathEl.textContent = n > 0 ? '\u2620'.repeat(Math.min(n, 5)) + (n > 5 ? ` x${n}` : '') : '';
  }

  onDamage({ dmg, pos, attacker }) {
    // cap popup rate (gatling etc.)
    if (this.popupBudget > 6 || dmg < 4) return;
    if (!this.world.camera) return;
    this.popupBudget++;
    setTimeout(() => this.popupBudget--, 250);
    _v.copy(pos);
    _v.project(this.world.camera);
    if (_v.z > 1) return;
    const x = (_v.x * 0.5 + 0.5) * 100, y = (-_v.y * 0.5 + 0.5) * 100;
    const el = document.createElement('div');
    el.className = 'dmg-pop';
    el.textContent = Math.round(dmg);
    const big = dmg >= 60;
    el.style.cssText = `left:${x + (Math.random() * 4 - 2)}%; top:${y - 4}%;` +
      (big ? 'font-size:34px;color:#ffd23c;text-shadow:0 0 14px rgba(255,120,20,1),0 2px 2px #000;' : '');
    this.popupLayer.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  callout(text, big = false) {
    this.calloutEl.textContent = text;
    this.calloutEl.style.opacity = 1;
    this.calloutEl.style.fontSize = big ? 'clamp(24px,3vw,42px)' : 'clamp(18px,2.4vw,32px)';
    this.calloutT = 2.2;
  }

  announce(text, hold = false, color = null) {
    const el = this.announceEl;
    el.textContent = text;
    el.className = '';
    if (color) el.style.color = color;
    else el.style.color = '#fff';
    void el.offsetWidth; // restart animation
    el.className = hold ? 'show-hold' : 'show';
  }

  setTimerVisible(v) { this.timerEl.style.display = v ? '' : 'none'; }

  destroy() {
    for (const u of this.unsubs) u();
    this.el.remove();
  }
}

export function toast(text) {
  let layer = document.getElementById('toast-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'toast-layer';
    document.getElementById('ui-root').appendChild(layer);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 4100);
}
