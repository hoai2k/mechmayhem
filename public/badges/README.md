# Mech badges — the hand-made icon art

**Put a mech's badge here as `<id>.png`** (the roster id exactly: `konga.png`,
`tritone.png`, …), then add that id to the `BADGES` set in `src/ui/icons.js`.
Both steps, or nothing happens: an id with no file falls back to the
thumbnail, a file with no id is never used.

To convert generated art into the right format:

```
node tools/badgekey.mjs <in.png> <mechId>     # keys the backdrop, trims, squares, resizes
node tools/iconcheck.mjs                      # proves it landed and the fallbacks still work
```

---

## WHAT A BADGE IS, and it is not a picture of the mech

This is the part that is easy to get wrong, and did get wrong the first time:
the obvious reading of "make me an icon of Konga" produces a beautiful
**portrait in a circle**, and a portrait in a circle is useless here.

**A badge is a MARK, not an illustration.** It is drawn at **17px** in the HUD
name plate, 26–30px in menu rows, and 52px at its largest in the select grid.
At 17px a face is four pixels wide. Panel lining, rivets, individual missile
tubes, eye highlights, fur texture, hexagon plating — none of it survives; it
averages into grey mush and every mech's badge becomes the same grey disc.
What survives at 17px is **shape, count, and two or three colours.**

The test to apply before accepting any badge: **shrink it to 20 pixels and
look at it next to the other badges.** If you cannot tell which mech it is, it
has failed, however good it looks at full size.

### The rules that follow from that

| | want | avoid |
|---|---|---|
| detail | ONE dominant silhouette | a full character portrait |
| shapes | 3–6 big shapes, no more | dozens of small repeated parts |
| colour | 2 or 3 flats + black + one accent | gradients, shading, glow, bloom |
| line | one thick outline, even weight | fine internal linework |
| contrast | the mark reads as a black/colour split | everything mid-tone |
| framing | fills the circle edge to edge | small subject with lots of air |

Think **road sign**, **football club crest**, **stencil on a tank hull** — not
"cover art in a circle". The mech's own roster `colors` block is the palette,
so a badge reads as the same character the model does.

### Format

- Square, **512×512** or larger, **transparent background** (`badgekey.mjs`
  will do the transparency for you if the generator gives you a flat backdrop).
- Centred, with the mark filling the frame; keep detail out of the corners,
  which the UI rounds off (radius ≈ 22% of the drawn size).
- Flat PNG. No drop shadow — it sits on several different background colours.

### Prompt template

Fill in the two bracketed lines. Everything else exists to hold the generator
away from a portrait, because that is where it drifts by default.

> Minimal flat vector emblem for a game roster icon. **[ONE SENTENCE: the
> single strongest shape this character has, stated as a silhouette.]**
> **[ONE SENTENCE: at most two identifying details, big and blocky.]**
> Bold graphic mark, like a military unit patch or a sports crest — NOT an
> illustration and NOT a portrait. Extremely simplified: 3–6 large shapes
> only, thick uniform black outline, flat colour fill, no gradients, no
> shading, no glow, no texture, no small parts, no fine detail. Limited
> palette: [colours]. High contrast, centred, filling the frame. Must remain
> instantly recognisable when shrunk to 20×20 pixels. Flat magenta background,
> no text, square 1:1.

Ask for the flat magenta (or green) backdrop deliberately — generators do not
produce alpha, and `badgekey.mjs` keys whatever flat colour it finds.

---

## Badges vs thumbnails

| | badges (here) | thumbs (`public/thumbs/`) |
|---|---|---|
| author | a human, deliberately | `tools/thumbs.mjs`, automatically |
| source | emblem art | a screenshot of the real model |
| lifetime | permanent — judged, never regenerated | churns with every model change |
| role | **the icon a mech is supposed to wear** | **the backup**, so nothing is iconless |

They are separate folders on purpose. A thumbnail is expected to be re-shot
whenever a model is redesigned; a badge must never change because a tool ran.
Keeping both in one folder is exactly what let a run of `thumbs.mjs`, invoked
to add two missing icons, re-capture all seventeen and replace the roster's
icons in the menus. `thumbs.mjs` writes only to `public/thumbs/` and cannot
reach anything in here, even on a full `--all` re-shoot.

## Fallback chain

`badges/<id>.png` → `thumbs/<id>.png` → the roster def's emoji. Enforced twice:
`iconUrl()` picks the tier up front, and the `<img>` itself carries an
`onerror` ladder, so a badge that is declared but missing degrades quietly
instead of rendering as a broken image.
