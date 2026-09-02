// ============================================================================
// TRAINING MODE — a fight that never ends, against dummies that never hit
// back, with every seat working through the same checklist at its own pace.
//
// It is reached from the TRAINING tile on arena select (ui/menus.js) and from
// `?battle=<arena>&training=1` (dev/battletest.js), and it changes NOTHING in
// fighter.js: every rule here is written onto the fighters from the outside,
// per frame, off the same fields the HUD reads.
//
//   · no clock and no end (match.js `training`) — leave through PAUSE → QUIT
//   · a KO is a RESPAWN on your own pad, at full hp, ~1.5s later — humans
//     and dummies alike
//   · CPU slots are DUMMIES (ai.js DIFFICULTY.dummy): they face you, take the
//     hits, and walk back to their pad if a blow carries them off it
//   · infinite ults (CONFIG.debugUltimates, FOR THE SESSION — the persisted
//     setting is untouched), ammo refills a second after the magazine empties,
//     hp regenerates once you have gone four seconds without being hit
//   · a CHECKLIST per human seat, hung off that seat's own HUD plate: MOVE →
//     JUMP → HOVER → … → TAUNT, each step naming the button on THAT seat's
//     device, ticked when the fighter actually does the thing. Seats progress
//     independently, and the list collapses to FREE PLAY at the end.
// ============================================================================
import { CONFIG } from '../core/config.js';
import { t } from '../core/text.js';
import { el } from '../ui/menus.js';

export const TRAINING_STEPS = [
  'move', 'jump', 'hover', 'light', 'heavy', 'block', 'dash', 'ranged', 'special', 'ult', 'taunt',
];

// the respawn, in seconds: the wreck fades where it fell, then comes back
const FADE_T = 1.1;
const RESPAWN_T = 1.5;
const RESPAWN_IFRAMES = 1.2;
const AMMO_REFILL_T = 1.0;      // after the magazine hits zero
const REGEN_AFTER_T = 4.0;      // without being hit
const REGEN_RATE = 0.9;         // of max hp per second, once it starts
const MOVE_DIST = 2;            // units of travel that count as MOVE

// which button table a seat reads: pads share one, keyboards have two,
// touch has its own
function deviceKey(device) {
  if (!device) return 'pad';
  return device.startsWith('pad') ? 'pad' : device;
}

export class Training {
  // humans: [{ fighter, device, idx }] as boot.js builds them; hud optional
  // (a harness with no HUD still gets the rules and the step tracking)
  constructor({ world, fighters, humans = [], hud = null, audio = null }) {
    this.world = world;
    this.fighters = fighters;
    this.humans = humans;
    this.hud = hud;
    this.audio = audio;
    this.spawns = world.arena.spawnPoints(fighters.length);
    this.state = new Map();
    this.respawns = [];   // {f, t}
    // infinite ults for the session only — the setting on disk is not touched
    this._ultCheatWas = CONFIG.debugUltimates;
    CONFIG.debugUltimates = true;
    this.unsub = world.events.on('ko', (e) => this.onKO(e));
    for (const h of humans) this.buildChecklist(h);
    this.attachChecklists();   // on the plates from the first frame, warm-up included
  }

  stateFor(f) {
    let st = this.state.get(f);
    if (!st) {
      st = {
        ammoT: 0, hitT: REGEN_AFTER_T, hpSeen: f.hp,
        px: f.pos.x, pz: f.pos.z, moved: 0,
        cdSeen: f.rangedCd || 0, ammoSeen: f.ammo,
        step: 0, done: [], ui: null,
      };
      this.state.set(f, st);
    }
    return st;
  }

  // ---- the checklist ------------------------------------------------------
  buildChecklist(h) {
    const st = this.stateFor(h.fighter);
    const root = el('div', 'hud-train');
    const head = el('div', 'train-head');
    const title = el('span', 'train-title', t('training.title'));
    const count = el('span', 'train-count');
    head.appendChild(title);
    head.appendChild(count);
    const done = el('div', 'train-done');
    const cur = el('div', 'train-cur');
    root.appendChild(head);
    root.appendChild(done);
    root.appendChild(cur);
    st.ui = { root, title, count, done, cur, dev: deviceKey(h.device) };
    this.renderChecklist(st);
  }

  renderChecklist(st) {
    const ui = st.ui;
    if (!ui) return;
    const total = TRAINING_STEPS.length;
    ui.count.textContent = t('training.count', { done: st.done.length, total });
    if (st.step >= total) {
      ui.root.classList.add('free');
      ui.title.textContent = t('training.free') + ' ✓';
      return;
    }
    ui.done.innerHTML = st.done.map((s) => `<span class="train-chip">✓ ${t('training.step.' + s)}</span>`).join('');
    const s = TRAINING_STEPS[st.step];
    ui.cur.innerHTML = `▶ ${t('training.step.' + s)}<b>${t('training.btn.' + ui.dev + '.' + s)}</b>`;
  }

  // the list rides its seat's plate; the plate is rebuilt on a re-deal, so
  // this is re-checked every frame rather than done once
  attachChecklists() {
    if (!this.hud) return;
    for (const h of this.humans) {
      const st = this.state.get(h.fighter);
      if (!st?.ui) continue;
      const plate = this.hud.plateFor(h.fighter);
      if (!plate) continue;
      if (st.ui.root.parentNode !== plate) plate.appendChild(st.ui.root);
      const head = plate.querySelector('.hp-head');
      st.ui.root.classList.toggle('right', head?.style.flexDirection === 'row-reverse');
    }
  }

  // what the checklist has seen for a fighter — the harness reads this
  progress(f) {
    const st = this.state.get(f);
    return st ? { step: st.step, done: st.done.slice(), free: st.step >= TRAINING_STEPS.length } : null;
  }

  // did the fighter do STEP this frame? Read off state, not off input — the
  // tick is for the thing actually happening, so a jump button pressed while
  // knocked down ticks nothing.
  stepHappening(step, f, st) {
    const clip = f.animator?.action?.clip?.name || '';
    switch (step) {
      case 'move': return st.moved > MOVE_DIST;
      case 'jump': return !f.grounded && !f.climb && f.vel.y > 1 && f.state === 'normal';
      case 'hover': return !!f.hovering;
      case 'light': {
        if (f.state !== 'attack') return false;
        return f.lightClipNames().includes(clip) || clip.startsWith('punchHold');
      }
      case 'heavy': {
        if (f.state !== 'attack') return false;
        if (f.plunging) return true;
        const hc = f.def.heavyClip || 'heavy';
        return clip === hc || clip === hc + 'Mirror' || clip === 'heavy' || clip === 'heavyMirror';
      }
      case 'block': return !!f.blocking;
      case 'dash': return f.state === 'dash';
      case 'ranged': {
        // `firing` is only the channel weapons' flag; a single shot leaves no
        // mark but its cooldown, so a cooldown that ROSE this frame is the
        // shot — unless it was the dry click (0.4s, and the magazine unmoved)
        if (f.firing) return true;
        const rose = f.rangedCd > st.cdSeen + 1e-4;
        const dry = f.ammoMax !== undefined && f.ammo <= 0 && f.ammo === st.ammoSeen;
        return rose && !dry;
      }
      case 'special': return f.state === 'special';
      case 'ult': return f.state === 'ult';
      case 'taunt': return f.taunting();
    }
    return false;
  }

  trackSteps(h) {
    const f = h.fighter;
    const st = this.stateFor(f);
    // travel under the stick, wrap-aware and ignoring teleports (a respawn)
    const dx = this.world.wrapDelta(f.pos.x - st.px), dz = this.world.wrapDelta(f.pos.z - st.pz);
    st.px = f.pos.x; st.pz = f.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3 && Math.hypot(f.intent.moveX, f.intent.moveZ) > 0.2 && f.alive) st.moved += d;
    const step = TRAINING_STEPS[st.step];
    const happening = !!step && f.alive && !f.controlsLocked && this.stepHappening(step, f, st);
    st.cdSeen = f.rangedCd || 0;
    st.ammoSeen = f.ammo;
    if (!happening) return;
    st.done.push(step);
    st.step++;
    this.audio?.play(st.step >= TRAINING_STEPS.length ? 'powerup' : 'uiConfirm');
    this.renderChecklist(st);
    if (st.ui) {
      st.ui.cur.classList.remove('tick');
      void st.ui.cur.offsetWidth;
      st.ui.cur.classList.add('tick');
    }
  }

  // ---- the rules ------------------------------------------------------------
  applyRules(f, dt) {
    const st = this.stateFor(f);
    // ults: a charge is always in the pouch (the HUD shows it), and the cheat
    // above lets a human fire through the spend flash anyway
    if (f.alive && f.ultCharges < 1 && !(f.ultFlashT > 0)) { f.ultCharges = 1; f.ult = 1; }
    // ammo: a dry magazine refills a second later
    if (f.ammoMax !== undefined) {
      if (f.ammo <= 0) {
        st.ammoT += dt;
        if (st.ammoT >= AMMO_REFILL_T) { f.ammo = f.ammoMax; st.ammoT = 0; }
      } else st.ammoT = 0;
    }
    // hp: a drop is a hit; four quiet seconds and it climbs back to full
    if (f.hp < st.hpSeen - 0.01) st.hitT = 0; else st.hitT += dt;
    if (f.alive && f.hp < f.maxHp && st.hitT >= REGEN_AFTER_T) {
      f.hp = Math.min(f.maxHp, f.hp + f.maxHp * REGEN_RATE * dt);
    }
    st.hpSeen = f.hp;
  }

  // ---- the respawn ----------------------------------------------------------
  onKO({ fighter }) {
    if (fighter.isMinion || !this.fighters.includes(fighter)) return;
    if (this.respawns.some((r) => r.f === fighter)) return;
    this.respawns.push({ f: fighter, t: 0 });
  }

  updateRespawns(dt) {
    const w = this.world;
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      r.t += dt;
      if (r.t < FADE_T) { r.f.setOpacity?.(Math.max(0, 1 - r.t / FADE_T)); continue; }
      if (r.t < RESPAWN_T) { r.f.setOpacity?.(0); r.f.group.visible = false; continue; }
      this.respawns.splice(i, 1);
      // his OWN pad — a training target should be where you left it, and a
      // trainee should not have to walk back across the plaza to try again
      const idx = this.fighters.indexOf(r.f);
      const spot = this.spawns[idx] || this.spawns[0];
      r.f.resetForRound(spot.pos, spot.yaw);
      r.f.iframes = Math.max(r.f.iframes, RESPAWN_IFRAMES);
      const st = this.stateFor(r.f);
      st.px = r.f.pos.x; st.pz = r.f.pos.z; st.hpSeen = r.f.hp; st.hitT = REGEN_AFTER_T;
      w.effects.rings.spawn(r.f.pos, { from: 4.5, to: 0.6, dur: 0.5, color: 0xffb43c, y: 1 });
      w.effects.impactSparks(r.f.center(), 0xffb43c, 14, 9);
      w.audio?.play('powerup');
      r.f.animator.play('land');
    }
  }

  update(dt) {
    for (const f of this.fighters) this.applyRules(f, dt);
    if (this.respawns.length) this.updateRespawns(dt);
    for (const h of this.humans) this.trackSteps(h);
    this.attachChecklists();
  }

  destroy() {
    this.unsub?.();
    this.unsub = null;
    CONFIG.debugUltimates = this._ultCheatWas;
    for (const st of this.state.values()) st.ui?.root.remove();
    this.state.clear();
  }
}
