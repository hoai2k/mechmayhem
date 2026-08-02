# Mech badges — hand-made emblem art

**Put a mech's badge here as `<id>.png`**, using the roster id exactly
(`konga.png`, `tritone.png`, `titanus.png`, …), then add that id to the
`BADGES` set in `src/ui/icons.js`. Two steps, and the file and the list must
agree — an id with no file falls back to the thumbnail, a file with no id is
never used.

## What this folder is, and what it is not

| | badges (here) | thumbs (`public/thumbs/`) |
|---|---|---|
| author | a human, deliberately | `tools/thumbs.mjs`, automatically |
| source | emblem/illustration art | a screenshot of the real model |
| lifetime | permanent — judged, never regenerated | churns with every model change |
| role | **the icon a mech is supposed to wear** | **the backup**, so nothing is iconless |

They are separate folders on purpose. A thumbnail is expected to be re-shot
whenever a model is redesigned; a badge must never change because a tool ran.
Keeping both in one folder is exactly what let a run of `thumbs.mjs`, invoked
to add two missing icons, re-capture all seventeen and replace the roster's
icons in the menus. `thumbs.mjs` writes only to `public/thumbs/` and cannot
reach anything in here, even on a full `--all` re-shoot.

## What the art needs to be

- **Square**, transparent background, **512×512** or larger (it is drawn from
  17 px in the HUD name plate up to 52 px in the select grid, and scaled with
  `object-fit: cover` — so it must survive being tiny).
- **Readable at 20 px.** One silhouette, heavy outline, few colours. Detail
  that only appears at full size is wasted; a busy badge turns to mush in the
  HP bar.
- **Centred and safe-cropped.** The UI rounds the corners (radius ≈ 22% of the
  size), so keep anything that matters out of the corners.
- **The mech's own palette**, from its roster `colors` block, so a badge reads
  as the same character the model does.

## Fallback chain

`badges/<id>.png` → `thumbs/<id>.png` → the roster def's emoji. Enforced twice:
`iconUrl()` picks the tier up front, and the `<img>` itself carries an
`onerror` ladder, so a badge that is listed but missing degrades quietly
instead of rendering as a broken image.
