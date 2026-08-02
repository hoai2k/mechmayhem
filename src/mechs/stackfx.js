// STACK FX — the effect a model no longer carries.
//
// TWO KINDS, one emitter. `def.stackFx.kind` picks between them:
//   'fire'  (the default) INFERNO's burners — see below.
//   'spark' TEMPEST's chimneys, which ended in two sculpted "spark" squiggles:
//           a frozen zigzag of triangles pretending to be electricity, which is
//           the one thing electricity never is. `dropGeo` takes them off (they
//           share their bones with the whole shoulder pauldron, so there was no
//           bone to name — dropgeo.js) and what stands in their place is a live
//           crackle: little flickering sparks popping out of each mouth, a glow
//           that pulses with them, and the odd tiny arc licking off the lip.
//           No smoke — an arc leaves nothing behind, so the smoke pool is
//           simply never touched on this path.
// Everything both kinds share — where the mouths are, the per-stack flicker,
// the catch-up accumulators, working with or without a Fighter around them —
// lives once, below.
//
// Inferno's shoulder chimneys used to end in two sculpted tongues of flame: a
// lump of triangles copied off the concept art, frozen at whatever angle the
// sculptor left them and reading as plastic horns the moment he moved. The
// manifest DROPS that geometry and caps the mouths (dropgeo.js); this is what
// stands in its place — live burners on the `stackL`/`stackR` anchors, which
// ride the chimney bones through every clip.
//
// Three layers, because a burner is three things at once:
//   FLAME  small licking tongues off the mouth, on the flipbook atlas, so they
//          flicker in place instead of fading. A per-stack flicker oscillator
//          (two detuned sines + noise, offset per side so the two chimneys
//          never pulse together) drives their size and their rate — the
//          "little flickering flames" a pilot light actually is.
//   EMBER  the odd spark carried up out of the throat.
//   SMOKE  the part that reads as MOTION. It leaves the mouth with almost no
//          horizontal speed of its own, so the mech walks out from under it and
//          the column bends into a trail behind him; the harder he moves the
//          more of it there is (`smokeRun`), and a dash blows a real gout out.
//
// THIS LIVES OUTSIDE fighter.js BECAUSE THE MENUS BURN TOO. A mech on the
// select stage or in the title line-up is a plain mech and not a Fighter — no
// world, no combat state, no Effects — so everything here takes the pools it
// emits into and a plain `mech`. Which is also how the SMOKE gets switched off
// where it does not belong: pass `smoke: false` (or a pool set with no
// `smoke`) and the flames are all that light. That is the menus and the warm-up
// sandbox — a smoke trail wants somewhere to trail to, and a robot standing on
// a display plinth just ends up in a fog bank.
//
// Driven by `def.stackFx` (roster.js), same shape as `bladeTrail`:
//   { anchors:['stackL','stackR'],  // manifest anchors on the chimney bones
//     joints:['shoulderL','shoulderR'], lift: 0.9,   // procedural fallback
//     flameGap: 0.055, smokeGap: 0.14, smokeRun: 2.4 }   // seconds, at rest
import * as THREE from 'three';
import { clamp01, rand } from '../core/utils.js';
import { fireTintOf } from './colorscheme.js';

const _v = new THREE.Vector3();
const _arc = new THREE.Vector3();

/** Per-stack oscillator + emission accumulators. One per mech that burns. */
export function stackState(sf) {
  return sf.anchors.map((_, i) => ({ t: 0, flame: 0, smoke: 0, ember: 0, phase: i * 2.3 }));
}

// Where stack `i` actually is, in world space. A GLB carries the chimney
// ANCHOR; the procedural body has no chimney at all, so it falls back to the
// named joint lifted clear of the shoulder.
function stackAt(mech, sf, i, s, out) {
  const anchor = mech.anchors?.[sf.anchors[i]];
  const src = anchor || mech.joints?.[sf.joints?.[i]];
  if (!src) return null;
  src.getWorldPosition(out);
  if (!anchor) out.y += (sf.lift ?? 0.9) * s;
  return out;
}

/**
 * One frame of both burners.
 * @param {object} mech    the built mech (anchors/joints read straight off it)
 * @param {object} sf      def.stackFx
 * @param {Array}  st      stackState(sf), owned by the caller
 * @param {number} dt
 * @param {object} opts    {fx, scale, run = 0, smoke = true}
 *   fx    pools: {flames, sparks, glows, smoke?} — Effects satisfies it, and so
 *         does the menus' BurnerFx (effects.js), which has no smoke pool
 *   run   0..1, how hard the mech is moving: more flame, much more smoke
 */
export function burnStacks(mech, sf, st, dt, { fx, scale = 1, run = 0, smoke = true }) {
  const s = scale;
  // …and in his own paint. A repainted mech's chimneys burn the same colour the
  // rest of his fire does (colorscheme.js schemeFire); null is ordinary fire, so
  // the stock/neutral schemes are untouched. Smoke stays smoke.
  const tint = fireTintOf(mech.def);
  const G = tint?.stops, hue = tint?.rot || 0;
  const wantSmoke = smoke && !!fx.smoke;
  const spark = sf.kind === 'spark';
  for (let i = 0; i < sf.anchors.length; i++) {
    if (!stackAt(mech, sf, i, s, _v)) continue;
    const p = _v;              // nothing else touches it before this stack ends
    const k = st[i];
    k.t += dt;
    // flicker: two detuned sines plus a little noise, offset per side
    const fl = 0.62 + 0.3 * Math.sin(k.t * 11 + k.phase) + 0.18 * Math.sin(k.t * 27.3 + k.phase * 2)
      + rand(-0.1, 0.1);
    const burn = clamp01(fl) * (0.8 + 0.45 * run);

    // Each layer runs its own accumulator and CATCHES UP: a burner emitting 35
    // tongues a second must not collapse to one-per-frame on a machine running
    // at 12fps, which is the difference between a lit chimney and a few orange
    // dots. Capped per frame so a stalled tab cannot dump the whole pool the
    // moment it resumes.
    const tick = (key, gap, emit) => {
      k[key] -= dt;
      for (let n = 0; n < 6 && k[key] <= 0; n++) { k[key] += gap; emit(); }
      if (k[key] <= 0) k[key] = gap;
    };

    if (spark) { sparkStack(sf, p, k, s, burn, run, fx, sparkPalette(sf, mech.def), tick); continue; }

    tick('flame', (sf.flameGap ?? 0.055) / (0.75 + 1.5 * burn), () => {
      const up = (2.6 + 4.5 * burn) * s;
      fx.flames.emit(p.x + rand(-0.12, 0.12) * s, p.y + 0.05 * s, p.z + rand(-0.12, 0.12) * s,
        rand(-0.5, 0.5) * s, up, rand(-0.5, 0.5) * s,
        { life: rand(0.2, 0.36), size: (0.95 + 1.05 * burn) * s, color: G ? G[3] : 0xffe9a8, color2: G ? G[1] : 0xff5c12,
          alpha: 0.92, cell: -1, spin: 1.4, drag: 2.6, grow: 1.6 * s, gravity: -3.2 * s, fadeIn: 0.12, hue });
      // the light the flame throws, so the chimney lip catches it
      fx.glows.emit(p.x, p.y + 0.1 * s, p.z, 0, 1.2 * s, 0,
        { life: 0.16, size: (1.1 + 1.1 * burn) * s, color: G ? G[2] : 0xff8a2a, alpha: 0.5 * burn, grow: -1.2 * s });
    });

    tick('ember', rand(0.12, 0.4) / (0.5 + run), () => {
      fx.sparks.emit(p.x, p.y + 0.15 * s, p.z,
        rand(-1.2, 1.2) * s, rand(4, 9) * s, rand(-1.2, 1.2) * s,
        { life: rand(0.4, 0.9), size: rand(0.24, 0.44) * s, color: G ? G[2] : 0xffcf80, color2: G ? G[1] : 0xff3c08,
          gravity: 7 * s, drag: 1.1, fadeIn: 0.02 });
    });

    // SMOKE — the trail. Emitted with no horizontal velocity of its own, so it
    // hangs where it was made and he walks out from under it.
    if (wantSmoke) {
      tick('smoke', (sf.smokeGap ?? 0.17) / (1 + (sf.smokeRun ?? 2.4) * run), () => {
        fx.smoke.emit(p.x + rand(-0.25, 0.25) * s, p.y + rand(0.7, 1.3) * s, p.z + rand(-0.25, 0.25) * s,
          rand(-0.5, 0.5) * s, rand(3, 5) * s, rand(-0.5, 0.5) * s,
          { life: rand(1.2, 2.2) * (0.8 + 0.5 * run), size: rand(1.6, 2.7) * s,
            color: 0x5e544a, color2: 0x1d1c22, alpha: 0.46 + 0.2 * run,
            drag: 1.3, grow: 3.1 * s, spin: 0.7, fadeIn: 0.22 });
      });
    } else {
      // keep the accumulator honest, so re-enabling smoke doesn't dump a burst
      k.smoke = Math.max(0, k.smoke - dt);
    }
  }
}

// THE SPARK SPRITE IS ORANGE, and no amount of `color` will fix that. Like the
// flame atlas, `sparkTexture()` bakes its ramp into its own pixels — a white
// core through cream to a deep orange corona — and the shader MULTIPLIES the
// per-particle colour over it, so cyan x orange is mud (measured: the first
// build's "electric" sparks rendered a clean impact-spark orange). The same
// answer the fire tint uses applies: turn the SAMPLED texture around the hue
// wheel instead (`hue` on emit -> aMisc.z), which moves the corona to the
// target colour and leaves the white-hot core white, because a rotation about
// the grey axis is the identity on grey. That is exactly what a spark looks
// like — white centre, coloured halo.
const SPARK_TEX_HUE = 27 / 360;         // the baked ramp's own orange
const _c = new THREE.Color();
// how far round the wheel the sampled texture has to turn to land on hue `h`
const hueRot = (h) => ((h - SPARK_TEX_HUE + 1.5) % 1 - 0.5) * Math.PI * 2;

// THE CRACKLE ANSWERS TO THE PAINT, exactly as inferno's flames do. A spark is
// the same problem as a flame — the mech is repainted, so what comes out of him
// should be too — and it takes the same answer: `schemeFire` (colorscheme.js),
// which is a colour for a scheme that HAS one and null for the ones that don't
// (white, silver, black, brown — an ordinary fire's colours, and for tempest an
// ordinary electric blue). So a stock or neutral-schemed tempest sparks in his
// authored blue and an AMETHYST one sparks purple, off one rule shared with
// inferno rather than a second hand-kept list.
// Both halves have to move together: `color`/`color2` are multiplied over the
// sprite and `hue` turns the sprite's own baked orange ramp underneath them
// (see the note above) — tint one and not the other and you get mud.
function sparkPalette(sf, def) {
  const tint = fireTintOf(def);
  if (!tint) {
    return { c1: sf.color ?? 0xd8f6ff, c2: sf.color2 ?? 0x3fd8ff, arc: sf.arc ?? sf.color2 ?? 0x3fd8ff,
      hue: sf.hue != null ? sf.hue : hueRot(_c.set(sf.color2 ?? 0x3fd8ff).getHSL({ h: 0, s: 0, l: 0 }).h) };
  }
  // stops are [dark base, body, bright, near-white] — a spark is a white-hot
  // core cooling to the colour, so it takes the top stop and the bright one
  // …and the rotation is measured against the SPARK atlas' own orange, which is
  // a shade off the flame atlas' — `tint.rot` is the flame's number, not this one
  return { c1: tint.stops[3], c2: tint.stops[2], arc: tint.stops[2], hue: hueRot(tint.h) };
}

// ---------------------------------------------------------------------------
// THE ELECTRIC ONE. A spark is not a small flame and must not be emitted like
// one: a flame is a continuous column that licks, a spark is DISCRETE — it pops
// off, flies, and is gone. So this emits in BURSTS (two to five at a time from
// one point) rather than as a stream, gives each one a real ballistic arc, and
// keeps them short-lived enough that the chimney reads as crackling rather than
// as a fountain.
//
// Three layers again, and the third is the one that sells it:
//   SPARK  the burst. Fast, tiny, cyan-white, thrown mostly upward and out of
//          the mouth with heavy gravity, so they turn over and die.
//   GLOW   the mouth itself, pulsed by the SAME flicker oscillator the flames
//          use — the lip brightens and dims in time with the crackle.
//   ARC    a stub of real lightning off the lip, rare and very short. Needs the
//          full Effects (`fx.lightning`); the menus' BurnerFx has no such pool
//          and simply does without, exactly as it does without smoke.
//
// SIZED TO READ AS TRIM, NOT AS A FIRE. Both layers run at HALF the scale the
// first build used: the sparks are little bright specks around the lip rather
// than a shower, and the arcs are half as long, which is the difference between
// a chimney that crackles and one that looks like it is venting. The dynamics
// (throw, gravity, gap) are untouched — this is the size of the thing, not how
// it moves.
function sparkStack(sf, p, k, s, burn, run, fx, pal, tick) {
  const { c1, c2, hue } = pal;          // hot core, what it cools to, atlas turn
  tick('flame', (sf.sparkGap ?? 0.09) / (0.6 + 1.2 * burn), () => {
    const n = 2 + ((Math.random() * (2 + 3 * burn)) | 0);
    for (let j = 0; j < n; j++) {
      fx.sparks.emit(p.x + rand(-0.08, 0.08) * s, p.y + 0.04 * s, p.z + rand(-0.08, 0.08) * s,
        rand(-2.6, 2.6) * s, rand(3, 9) * (0.7 + 0.5 * burn) * s, rand(-2.6, 2.6) * s,
        { life: rand(0.14, 0.34), size: rand(0.08, 0.18) * s, color: c1, color2: c2,
          gravity: 20 * s, drag: 1.6, fadeIn: 0.01, hue });
    }
    fx.glows.emit(p.x, p.y + 0.06 * s, p.z, 0, 0.6 * s, 0,
      { life: 0.13, size: (0.35 + 0.45 * burn) * s, color: c2, alpha: 0.45 * burn, grow: -0.45 * s });
  });
  // the arc. `jag` and the throw are both in body units, so a scaled mech
  // (colossus' ult, a menu plinth) crackles at its own size.
  if (!fx.lightning) return;
  tick('ember', rand(0.3, 0.95) / (0.6 + 0.9 * run), () => {
    const a = Math.random() * Math.PI * 2, r = rand(0.25, 0.75) * s;
    _arc.set(p.x + Math.cos(a) * r, p.y + rand(0.2, 0.8) * s, p.z + Math.sin(a) * r);
    fx.lightning.spawn(p, _arc, { color: pal.arc, dur: rand(0.05, 0.11),
      jag: 0.17 * s, thick: 0.045 * s, branch: false });
  });
}

/** The gout a dash punches out of both stacks. One per dash, not per frame. */
export function stackBlast(mech, sf, { fx, scale = 1, smoke = true }) {
  const s = scale;
  const tint = fireTintOf(mech.def);
  const G = tint?.stops, hue = tint?.rot || 0;
  const wantSmoke = smoke && !!fx.smoke;
  const spark = sf.kind === 'spark';
  for (let i = 0; i < sf.anchors.length; i++) {
    if (!stackAt(mech, sf, i, s, _v)) continue;
    const p = _v;
    // …and on the electric path it is a DISCHARGE: a fat handful of sparks and
    // one real arc thrown up off the lip, which is what a capacitor dumping
    // into a dash should look like. No smoke — nothing burned.
    if (spark) {
      const { c1, c2, arc, hue: sh } = sparkPalette(sf, mech.def);
      for (let n = 0; n < 14; n++) {
        fx.sparks.emit(p.x, p.y + 0.05 * s, p.z,
          rand(-7, 7) * s, rand(6, 20) * s, rand(-7, 7) * s,
          { life: rand(0.22, 0.55), size: rand(0.11, 0.25) * s, color: c1, color2: c2,
            gravity: 16 * s, drag: 1.2, fadeIn: 0.01, hue: sh });
      }
      fx.glows.emit(p.x, p.y + 0.1 * s, p.z, 0, 1.4 * s, 0,
        { life: 0.2, size: 1 * s, color: c2, alpha: 0.7, grow: -1 * s });
      if (fx.lightning) {
        const a = Math.random() * Math.PI * 2;
        _arc.set(p.x + Math.cos(a) * 1.1 * s, p.y + rand(0.8, 1.5) * s, p.z + Math.sin(a) * 1.1 * s);
        fx.lightning.spawn(p, _arc, { color: arc, dur: 0.14, jag: 0.25 * s, thick: 0.07 * s });
      }
      continue;
    }
    if (wantSmoke) {
      for (let n = 0; n < 5; n++) {
        fx.smoke.emit(p.x + rand(-0.3, 0.3) * s, p.y + rand(0.2, 1.1) * s, p.z + rand(-0.3, 0.3) * s,
          rand(-1.5, 1.5) * s, rand(2, 5) * s, rand(-1.5, 1.5) * s,
          { life: rand(1.2, 2.2), size: rand(1.4, 2.4) * s, color: 0x5f544a, color2: 0x1d1c22,
            alpha: 0.5, drag: 1.5, grow: 3.2 * s, spin: 0.9, fadeIn: 0.2 });
      }
    }
    fx.flames.emit(p.x, p.y + 0.1 * s, p.z, 0, 9 * s, 0,
      { life: 0.34, size: 2.2 * s, color: G ? G[3] : 0xfff2c8, color2: G ? G[1] : 0xff4a0c,
        alpha: 0.95, cell: -1, spin: 1.6, drag: 2.4, grow: 2.6 * s, gravity: -4 * s, hue });
  }
}
