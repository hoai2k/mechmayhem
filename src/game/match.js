// Match orchestration: best-of-3 rounds, intros, KO slow-mo, timeouts.
import { clamp01 } from '../core/utils.js';
import { CONFIG } from '../core/config.js';
import { t } from '../core/text.js';
import { prewarmSummons, clearSpares } from '../combat/specials.js';

const KO_COLOR = '#ff4d5e';
const FIGHT_COLOR = '#ffb43c';
const WINS_NEEDED = 2;
// A BRAWL DEATH, in seconds: fade out where you fell, lie gone for a beat,
// then come back. Long enough to feel like a loss, short enough to stay in a
// round (the whole cycle is under three seconds).
const FADE_T = 1.9;
const GONE_T = 0.5;
const RESPAWN_IFRAMES = 1.6;

export class Match {
  constructor({ engine, world, fighters, hud, onEnd, humans = 0 }) {
    this.engine = engine;
    this.world = world;
    this.fighters = fighters;
    this.hud = hud;
    this.onEnd = onEnd;
    this.round = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.timeLeft = CONFIG.roundTime;
    this.unsub = world.events.on('ko', (e) => this.onKO(e));
    this.pendingWinner = null;
    // ---- BRAWL RULES (2+ PEOPLE in a fight of 3 or more) -----------------
    // A duel ends the moment somebody drops, which is right for a duel and
    // wrong for a four-way: two PEOPLE sit out the rest of the round because
    // a fight they were not in ended. So with three or more bodies AND more
    // than one person holding a pad, DEATH IS A RESPAWN — you fade out where you fell, come back at a spawn point, and
    // the round runs to its clock. What wins it is not being the one who keeps
    // dying: the last CLEAN SHEET takes it outright, and at the bell it is
    // whoever died least (hp% breaks a tie, as it always did).
    //
    // ONE PLAYER AGAINST A CROWD IS NOT A BRAWL, which is why this counts
    // HUMANS and not fighters: a solo player against three CPUs is a gauntlet,
    // and the thing that makes it one is that beating them ENDS it. Respawning
    // CPUs would only deny the win. Two people plus a CPU is a party game, and
    // there nobody should be sitting out half a round watching.
    this.brawl = fighters.length >= 3 && humans >= 2;
    this.humans = humans;
    this.respawns = [];   // {f, t} — a wreck fading out on the floor
  }

  begin() {
    for (const f of this.fighters) f.wins = 0;
    this.startRound();
  }

  startRound() {
    this.round++;
    // boot hooks in here to re-deal RANDOM-pick fighters a fresh robot
    // (it swaps entries of this.fighters in place before the resets below)
    this.onRoundStart?.(this.round);
    const w = this.world;
    w.clearTransient();
    this.engine.timeScale = 1;
    const spawns = w.arena.spawnPoints(this.fighters.length);
    this.respawns.length = 0;
    this.fighters.forEach((f, i) => {
      clearSpares(f);   // a new round may have re-dealt this slot a new robot
      f.deaths = 0;
      this.hud.setDeaths?.(f, 0);
      f.resetForRound(spawns[i].pos, spawns[i].yaw);
      f.controlsLocked = true;
      f.animator.play('intro');
    });
    this.state = 'intro';
    this.stateT = 2.5;
    this.timeLeft = CONFIG.roundTime;
    this.hud.announce(t('match.round', { n: this.round }), true);
    this.world.audio?.play('stingRound');
    // a bit of personality: someone talks trash at the start of each round
    const talker = this.fighters[(this.round - 1) % this.fighters.length];
    this.hud.callout(t('match.intro', { mech: talker.def.name, quote: talker.def.quotes.intro }));
  }

  onKO({ fighter, attacker }) {
    if (this.state !== 'fight') return;
    // a SUMMON (a raptor, a wolf) dying is not a contestant dying: the world
    // removes it on its own, and in a brawl it used to be pushed onto the
    // respawn queue — a phantom ring and a "powerup" sting on an empty pad for
    // a body that was no longer in the fight
    if (fighter.isMinion || !this.fighters.includes(fighter)) return;
    // ---- BRAWL (3+ robots): a KO is a RESPAWN, not the end of the round ----
    if (this.brawl) {
      fighter.deaths = (fighter.deaths || 0) + 1;
      this.hud.setDeaths?.(fighter, fighter.deaths);
      // he lies where he fell and FADES OUT — a couple of seconds of watching
      // your own wreck is what makes a death read as a death rather than a
      // teleport, and it is the window the other three keep fighting in
      this.respawns.push({ f: fighter, t: 0 });
      // THE LAST ROBOT STANDING IS THE ONE WHO NEVER WENT DOWN: the moment
      // everybody else has a death against them, the one clean sheet takes it.
      const clean = this.fighters.filter((f) => !f.deaths);
      if (clean.length === 1) this.endRound(clean[0], t('match.lastStanding'));
      return;
    }
    const alive = this.fighters.filter((f) => f.alive);
    // A GAUNTLET ENDS WITH ITS PLAYER. One person against two or three CPUs
    // is decided the moment that person drops — the alternative was watching
    // the machines finish each other off for the rest of the clock.
    if (alive.length > 1 && this.humans > 0 && !alive.some((f) => !f.isAI)) {
      const best = alive.reduce((a, b) => (b.hp / b.maxHp > a.hp / a.maxHp ? b : a));
      this.endRound(best, t('match.ko'));
      return;
    }
    if (alive.length > 1) return;
    const winner = alive[0] || null;
    // won by a KILL (not timeout) and the survivor threw it: cinematic
    // finisher first, then the normal round-end flow
    if (CONFIG.enable_finishers && winner && attacker === winner) {
      this.state = 'finisher';
      this.engine.timeScale = 1;
      this.hud.announce(t('match.ko'), false, KO_COLOR);
      this.world.audio?.play('stingKO');
      for (const f of this.fighters) f.controlsLocked = true;
      this.world.startFinisher(winner, fighter, () => {
        this.endRound(winner, t('match.ko'), true);
      });
      return;
    }
    this.endRound(winner, t('match.ko'));
  }

  endRound(winner, banner, afterFinisher = false) {
    this.state = 'roundEnd';
    this.stateT = afterFinisher ? 2.4 : 3.2;
    this.pendingWinner = winner;
    // the round is OVER for everybody: after a TIME UP the losers kept full
    // control through the slow-mo and could hit — and kill — the winner in
    // the middle of the victory pose
    for (const f of this.fighters) { f.controlsLocked = true; f.intent.moveX = f.intent.moveZ = 0; }
    if (!afterFinisher) {
      this.engine.timeScale = 0.25;        // dramatic slow-mo
      this.hud.announce(banner, false, banner === t('match.ko') ? KO_COLOR : null);
      this.world.audio?.play('stingKO');   // (the finisher already sold it)
    }
    if (winner) winner.wins++;
  }

  update(dt) {
    const dtReal = this.engine.timeScale > 0 ? dt / this.engine.timeScale : dt;
    switch (this.state) {
      case 'intro':
        this.stateT -= dtReal;
        // BUILD THE SUMMONS NOW, while the announcement is up and nobody is
        // being controlled — one body per frame, so even a fleet of them is
        // spread across the intro rather than stalling one frame of the fight
        // (see specials.js SUMMON PREWARM: this is where SAURION's raptor pack
        // stops costing ~5ms a body mid-cast).
        for (const f of this.fighters) if (prewarmSummons(f, 1)) break;
        if (this.stateT <= 0.9 && this.stateT + dtReal > 0.9) {
          this.hud.announce(t('match.fight'), false, FIGHT_COLOR);
          this.world.audio?.play('fightBell');
        }
        if (this.stateT <= 0.9) {
          for (const f of this.fighters) f.controlsLocked = false;
          if (this.stateT <= 0) this.state = 'fight';
        }
        break;

      case 'fight': {
        if (this.brawl && this.respawns.length) this.updateRespawns(dt);
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          // TIMEOUT. A duel is decided on hp%; a brawl is decided on DEATHS —
          // the fight has been running the whole time and how often you were
          // put down is what it measured. hp% is the tiebreak either way.
          let best = null, bestKey = null, tie = false;
          const key = (f) => (this.brawl
            ? [-(f.deaths || 0), clamp01(f.hp / f.maxHp)]
            : [clamp01(f.hp / f.maxHp)]);
          const cmp = (a, b) => {
            for (let i = 0; i < a.length; i++) {
              if (Math.abs(a[i] - b[i]) > 0.001) return a[i] - b[i];
            }
            return 0;
          };
          for (const f of this.fighters) {
            if (!f.alive && !this.brawl) continue;   // a brawler mid-respawn still counts
            const k = key(f);
            const c = bestKey ? cmp(k, bestKey) : 1;
            if (c > 0) { bestKey = k; best = f; tie = false; } else if (c === 0) tie = true;
          }
          this.endRound(tie ? null : best, t('match.timeUp'));
        }
        break;
      }

      case 'roundEnd':
        this.stateT -= dtReal;
        this.engine.timeScale = Math.min(1, this.engine.timeScale + dtReal * 0.55);
        if (this.stateT <= 1.9 && !this.victoryPlayed) {
          this.victoryPlayed = true;
          if (this.pendingWinner?.alive) {
            this.pendingWinner.controlsLocked = true;
            this.pendingWinner.intent.moveX = this.pendingWinner.intent.moveZ = 0;
            this.pendingWinner.animator.play('victory');
          }
          if (this.pendingWinner) {
            this.hud.announce(t('match.roundWinner', { mech: this.pendingWinner.def.name }), true);
          } else {
            this.hud.announce(t('match.draw'), true);
          }
        }
        if (this.stateT <= 0) {
          this.victoryPlayed = false;
          this.engine.timeScale = 1;
          const champ = this.fighters.find((f) => f.wins >= WINS_NEEDED);
          if (champ) {
            this.state = 'done';
            this.world.audio?.play('stingWin');
            this.onEnd?.(champ);
          } else {
            this.startRound();
          }
        }
        break;
    }
  }

  // ---- the wreck fades, then he comes back --------------------------------
  //
  // THE FADE IS THE POINT. Dying and reappearing in the same instant reads as a
  // teleport; a couple of seconds face-down while your own body thins out
  // reads as a death, and it is long enough to be a real cost in a fight that
  // is still going on around you. `resetForRound` is the same full reset a new
  // round gives (hp, ammo, fuel, status, opacity), so a respawned body carries
  // nothing over — and iframes cover the moment he lands, or a brawler can be
  // spawn-camped by whoever is standing on the pad.
  updateRespawns(dt) {
    const w = this.world;
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      r.t += dt;
      if (r.t < FADE_T) {
        r.f.setOpacity?.(Math.max(0, 1 - r.t / FADE_T));
        continue;
      }
      if (r.t < FADE_T + GONE_T) { r.f.setOpacity?.(0); r.f.group.visible = false; continue; }
      this.respawns.splice(i, 1);
      const spot = this.respawnSpot(r.f);
      r.f.resetForRound(spot.pos, spot.yaw);
      r.f.iframes = Math.max(r.f.iframes, RESPAWN_IFRAMES);
      w.effects.rings.spawn(r.f.pos, { from: 4.5, to: 0.6, dur: 0.5, color: 0x8fe8ff, y: 1 });
      w.effects.impactSparks(r.f.center(), 0x8fe8ff, 14, 9);
      w.audio?.play('powerup');
      r.f.animator.play('land');
    }
  }

  // Where a respawn lands: the arena's own spawn points, furthest from the
  // robots who are still up. Coming back INTO the fight you just lost is not a
  // second chance, it is a second death.
  respawnSpot(f) {
    const pts = this.world.arena.spawnPoints(this.fighters.length);
    let best = pts[0], bestD = -1;
    for (const p of pts) {
      let d = Infinity;
      for (const o of this.fighters) {
        if (o === f || !o.alive) continue;
        d = Math.min(d, Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z));
      }
      if (d > bestD) { bestD = d; best = p; }
    }
    return best;
  }

  destroy() {
    this.unsub();
    this.engine.timeScale = 1;
  }
}
