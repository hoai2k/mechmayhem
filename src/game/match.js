// Match orchestration: best-of-3 rounds, intros, KO slow-mo, timeouts.
import { clamp01 } from '../core/utils.js';
import { CONFIG } from '../core/config.js';
import { t } from '../core/text.js';

const ROUND_TIME = 99;
const KO_COLOR = '#ff4d5e';
const FIGHT_COLOR = '#ffb43c';
const WINS_NEEDED = 2;

export class Match {
  constructor({ engine, world, fighters, hud, onEnd }) {
    this.engine = engine;
    this.world = world;
    this.fighters = fighters;
    this.hud = hud;
    this.onEnd = onEnd;
    this.round = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.timeLeft = ROUND_TIME;
    this.unsub = world.events.on('ko', (e) => this.onKO(e));
    this.pendingWinner = null;
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
    this.fighters.forEach((f, i) => {
      f.resetForRound(spawns[i].pos, spawns[i].yaw);
      f.controlsLocked = true;
      f.animator.play('intro');
    });
    this.state = 'intro';
    this.stateT = 2.5;
    this.timeLeft = ROUND_TIME;
    this.hud.announce(t('match.round', { n: this.round }), true);
    this.world.audio?.play('stingRound');
    // a bit of personality: someone talks trash at the start of each round
    const talker = this.fighters[(this.round - 1) % this.fighters.length];
    this.hud.callout(t('match.intro', { mech: talker.def.name, quote: talker.def.quotes.intro }));
  }

  onKO({ fighter, attacker }) {
    if (this.state !== 'fight') return;
    const alive = this.fighters.filter((f) => f.alive);
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
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          // timeout: highest hp% takes the round
          let best = null, bestFrac = -1, tie = false;
          for (const f of this.fighters) {
            if (!f.alive) continue;
            const frac = clamp01(f.hp / f.maxHp);
            if (Math.abs(frac - bestFrac) < 0.001) tie = true;
            else if (frac > bestFrac) { bestFrac = frac; best = f; tie = false; }
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

  destroy() {
    this.unsub();
    this.engine.timeScale = 1;
  }
}
