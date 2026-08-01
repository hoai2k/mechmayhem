// BURNER STACKS — the fire a model no longer carries.
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

/** The gout a dash punches out of both stacks. One per dash, not per frame. */
export function stackBlast(mech, sf, { fx, scale = 1, smoke = true }) {
  const s = scale;
  const tint = fireTintOf(mech.def);
  const G = tint?.stops, hue = tint?.rot || 0;
  const wantSmoke = smoke && !!fx.smoke;
  for (let i = 0; i < sf.anchors.length; i++) {
    if (!stackAt(mech, sf, i, s, _v)) continue;
    const p = _v;
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
