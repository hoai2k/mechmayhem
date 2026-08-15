# Retired mechs

Mechs that are no longer part of the game. Everything needed to understand or
revive one is here; nothing in `src/` or `public/` references them, and the
roster does not contain them, so they cannot be picked, rolled by RANDOM,
chosen by a CPU, or shown in the title line-up — including with
SETTINGS → SHOW ALL ROBOTS on, which is what used to reveal them.

## Why these two

Both were `hidden: true` work-in-progress bodies, and both had **mirrored
rigs**: `node tools/rigmirror.mjs` reported every one of AEGIS's twelve limb
joints, and four of NOVA's, driving the opposite side of the body. That is the
one rig error that looks almost right — the walk cycle is symmetric and the
clips come in mirrored pairs, so it hides until you drag a left shoulder in the
pose workbench and the right arm moves. Fixing it is a re-rig, not a patch, and
neither was close enough to shipping to be worth one. With them gone
`rigmirror` exits clean on the whole roster for the first time.

## What is here, per mech

| file | was |
|---|---|
| `manifest-entry.json` | its `public/models/manifest.json` entry, verbatim |
| `mech_<id>*.glb` | the models the entry named, untouched |
| `<id>.design.js` | its `src/mechs/designs/<id>.js` procedural sculpt |
| `<id>.finisher.js` | its `src/game/finisher/<id>.js` cinematic |
| `badge-<id>.png` · `thumb-<id>.png` · `poster-<id>.png` | its icons and mech-select poster |

The **roster def** (stats, palette, skin, moves) is not duplicated here — it is
in the removal commit, which is the one place it can be recovered from
unambiguously. `git log --diff-filter=D --follow -- archive/mechs/<id>` finds it.

## Reviving one

Put the design and finisher files back under `src/mechs/designs/` and
`src/game/finisher/`, re-register them in `designs.js` and `finisher/index.js`,
restore the roster def from the removal commit, paste the manifest entry back,
move the GLBs to `public/models/`, and put the icons back in
`public/badges/` · `public/thumbs/` · `public/posters/` (a badge also needs its
id listed in `BADGES` in `src/ui/icons.js`, or `tools/iconcheck.mjs` will say
so). Then fix the rig before anything else: `node tools/rigmirror.mjs <id>`.

## One loose end, deliberately left

`src/combat/fighter.js` still carries a few branches behind
`if (this.def.id === 'nova')` (an aura, a glow term). They are unreachable with
no such mech in the roster, and unpicking them from a shared 4,000-line combat
file is a bigger risk than leaving them inert. `src/mechs/animations.js` keeps
the `aegis*`-prefixed clips for the same reason — clip data is shared library
data and other mechs' entries index into it.
