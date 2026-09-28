// AEGIS code that lived in the shared game files until the cleanup that
// followed his retirement — kept so a revival does not have to dig it out of
// git. Paste each block back where its header says.

// ---- src/core/text.js (mech strings)
  'mech.aegis.name': 'AEGIS',
  'mech.aegis.title': 'The Bastion of Dawn',
  'mech.aegis.blurb': 'A knight-errant forged from cathedral steel. Sworn to protect the innocent, the outnumbered, and anyone standing behind that enormous shield.',
  'mech.aegis.quote.intro': '"By dawn\'s light — I shall not falter!"',
  'mech.aegis.quote.win': '"Honor is the finest armor. Yield with grace, friend."',
  'mech.aegis.move.ranged': 'Dawn Javelin',
  'mech.aegis.move.special': 'Bulwark Bash',
  'mech.aegis.move.ult': 'JUDGEMENT',

// ---- src/core/text.js (in-combat banner callouts; the HUD listened for a
// world 'banner' event, which only JUDGEMENT ever emitted — restore the
// hud.js listener too: world.events.on('banner', (d) => this.announce(...)))
  // AEGIS's JUDGEMENT ultimate holds court mid-arena
  'combat.judgement.0': 'JUDGEMENT',
  'combat.judgement.1': 'JUDGEMENT .',
  'combat.judgement.2': 'JUDGEMENT . .',
  'combat.judgement.3': 'JUDGEMENT . . .',
  'combat.judgement.dismissed': 'CASE DISMISSED',
  'combat.judgement.innocent': "INNOCENT: YOU'RE FREE TO GO",
  'combat.judgement.guilty': 'GUILTY: DEATH PENALTY',

// ---- src/mechs/animations.js (CLIPS)
  shieldWhirlHold: { // AEGIS Bulwark Bash wind-up: the tower shield is
    // hoisted straight overhead FACE-UP and whirled like a rotor (the
    // special spins elbowL post-pose) while the LANCE LEVELS at the enemy —
    // a menacing come-on instead of a dangling arm.
    // Deliberately NOT 'aegis'-prefixed: the signature's square-to-front
    // shield brace must not fight the face-up carry.
    dur: 0.6, loop: true,
    keys: [
      { t: 0, pose: { torso: [-6, 0, -3], hipsRot: [-3, 0, 0], hipsPos: [0, -0.22, 0], head: [-16, 0, 0], shoulderL: [-176, 0, -10], elbowL: [-5, 0, 0], shoulderR: [-60, 0, 10], elbowR: [-20, 0, 0], handR: [80, 0, 0], kneeL: [28, 0, 0], kneeR: [28, 0, 0], thighL: [-15, 0, 0], thighR: [-15, 0, 0] } },
      { t: 0.3, ease: 'inOutQuad', pose: { hipsPos: [0, -0.26, 0], torso: [-8, 0, -3], shoulderL: [-174, 0, -8], shoulderR: [-62, 0, 10] } },
      { t: 0.6, ease: 'inOutQuad', pose: { hipsPos: [0, -0.22, 0], torso: [-6, 0, -3], shoulderL: [-176, 0, -10], shoulderR: [-60, 0, 10] } },
    ],
    events: [{ t: 0.08, type: 'sfx', arg: 'whoosh' }, { t: 0.38, type: 'sfx', arg: 'whoosh' }],
  },
  aegisShieldSmash: { // Bulwark Bash release: the whirling shield comes
    // DOWN off the crown and RAMS forward face-first — the special grows
    // it to a bot-tall wall through the strike ('aegis' prefix so the
    // signature squares the face to the front for the impact)
    dur: 0.62,
    keys: [
      { t: 0, pose: { torso: [-6, 0, -3], hipsRot: [-3, 0, 0], hipsPos: [0, -0.22, 0], head: [-16, 0, 0], shoulderL: [-176, 0, -10], elbowL: [-5, 0, 0], shoulderR: [-60, 0, 10], elbowR: [-20, 0, 0], handR: [80, 0, 0], kneeL: [28, 0, 0], kneeR: [28, 0, 0], thighL: [-15, 0, 0], thighR: [-15, 0, 0] } },
      { t: 0.16, ease: 'outBack', pose: { torso: [16, 12, -3], hipsRot: [4, 6, 0], hipsPos: [0, -0.22, 0.26], head: [0, -6, 0], shoulderL: [-88, 14, -6], elbowL: [-18, 0, 0], shoulderR: [22, 0, 18], elbowR: [-30, 0, 0], handR: [10, 0, 0], thighL: [-40, 0, 0], kneeL: [50, 0, 0], thighR: [20, 0, 0], kneeR: [46, 0, 0], ankleR: [18, 0, 0] } },
      { t: 0.36, ease: 'inOutQuad', pose: { torso: [13, 10, -2], hipsPos: [0, -0.2, 0.2] } },
      { t: 0.62, ease: 'inOutQuad', pose: REST_ARMSTANCE },
    ],
    events: [{ t: 0.06, type: 'sfx', arg: 'whooshBig' }, { t: 0.18, type: 'hit', arg: 0 }, { t: 0.2, type: 'shake', arg: 0.5 }],
  },

// ---- src/combat/fighter.js takeHit, before armour is applied (roster
// `passiveShield: true` + a `shield` anchor on the model)
    // AEGIS passive cover: an attack that arrives THROUGH the tower shield
    // is taken ON the shield — same numbers as a raised guard — even with
    // no block input. Geometric against the shield's LIVE position, so a
    // shield whirled overhead (bulwark bash) stops covering the front, and
    // an attack from the open flank still lands clean.
    if (!unblockable && !this.blocking && this.def.passiveShield &&
        this.state !== 'hitstun' && this.state !== 'launched' &&
        this.state !== 'knockdown' && this.state !== 'frozen' &&
        this.mech.anchors.shield) {
      const S = this.mech.anchors.shield.getWorldPosition(_palmTmp);
      const sx = S.x - this.pos.x, sz = S.z - this.pos.z;
      const sl = Math.hypot(sx, sz);
      // shield held out at body height (not swung skyward), threat within
      // ~60° of the direction the shield is offset toward
      if (sl > 0.35 && S.y > this.pos.y + 0.5 && S.y < this.pos.y + this.height) {
        const dot = (sx / sl) * (-dirX / dLen) + (sz / sl) * (-dirZ / dLen);
        if (dot > 0.5) {
          const pass = this.def.stats.blockMult ?? GUARD.leakDefault;
          // asymmetries vs a raised guard, kept as tuned: chip is rounded
          // (floor 1), the ult drip counts the FULL incoming dmg, and the
          // push is gentler (no input was spent holding block)
          this._blockAbsorb(Math.max(1, Math.round(dmg * pass)), dmg,
            dirX, dirZ, dLen, knock * 0.3, S, 0x9fd8ff);
          return;
        }
      }
    }


// ---- src/combat/projectiles.js VISUALS (the Dawn Javelin)
//   spear: { geo: () => new THREE.ConeGeometry(0.15, 3.6, 6), rot: true, trail: 'glow' },
