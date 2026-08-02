// A MECH'S ICON, in three tiers, most deliberate first.
//
//   1. BADGE   public/badges/<id>.png — hand-made emblem art, the icon a mech
//              is SUPPOSED to wear. A mech has one only if its id is listed in
//              BADGES below: that list is the declaration, and nothing else
//              may add to it. Drop the file in, add the id, done.
//   2. THUMB   public/thumbs/<id>.png — a portrait auto-captured off the real
//              model (tools/thumbs.mjs). This is the BACKUP: every mech has
//              one, so nothing is ever iconless and a mech with no badge yet
//              still reads as itself in the menus.
//   3. EMOJI   the roster def's own `icon`, if even the thumbnail is missing.
//
// THE TWO ARE SEPARATE FILES IN SEPARATE FOLDERS, and that is the point of the
// arrangement rather than an accident of it. They have different authors,
// different lifetimes and different rules: a thumbnail is regenerated whenever
// a model changes and is EXPECTED to churn, while a badge is judged art that
// must never change because a tool ran. Keeping both in one folder is what
// allowed a run of thumbs.mjs — invoked to add two missing icons — to re-shoot
// all seventeen and silently replace the roster's icons in the menus. With
// badges in their own folder and named by hand, no capture tool can reach
// them: thumbs.mjs writes only to public/thumbs, and even a full --all
// re-shoot leaves every badge exactly where it was.
//
// The chain is enforced at RUNTIME too, by the <img> itself (the onerror
// ladder in mechIcon): a badge listed but not actually on disk falls to the
// thumbnail, and a missing thumbnail falls to the emoji, so a half-finished
// drop-in never renders as a broken image.

// WHICH MECHS HAVE HAND-MADE BADGE ART. Add an id here at the same time as the
// PNG lands in public/badges/ — see public/badges/README.md. An id listed with
// no file costs one 404 and falls back to the thumbnail; a file with no id
// here is simply never used.
export const BADGES = new Set([
  // tools/badgekey.mjs adds an id here when it lands the art, so the file and
  // this list cannot drift apart; tools/iconcheck.mjs fails if they ever do,
  // in EITHER direction. Empty means every mech is on its thumbnail.
]);

export function badgeUrl(id) { return `badges/${id}.png`; }
export function thumbUrl(id) { return `thumbs/${id}.png`; }

// Where a mech's icon should be fetched from FIRST — its badge if it has one,
// otherwise its thumbnail. Shared with the menu prefetcher (predict.js
// warmMenuArt), which pulls every one of these down while the title screen is
// up so the roster grid paints in one go rather than filling in.
export function iconUrl(id) { return BADGES.has(id) ? badgeUrl(id) : thumbUrl(id); }

export function mechIcon(def, size = 22) {
  const r = Math.round(size * 0.22);
  const dip = Math.round(size * 0.22);
  // The fallback ladder, as markup. A badge that fails to load swaps itself
  // for the thumbnail ONCE — the handler is replaced before the retry, so a
  // missing thumbnail cannot loop — and a thumbnail that fails becomes the
  // emoji.
  const toEmoji = `this.outerHTML='${def.icon}'`;
  const onerror = BADGES.has(def.id)
    ? `this.onerror=function(){${toEmoji}};this.src='${thumbUrl(def.id)}'`
    : toEmoji;
  return `<img class="mech-ico" src="${iconUrl(def.id)}" alt="${def.icon}" ` +
    `style="width:${size}px;height:${size}px;border-radius:${r}px;object-fit:cover;` +
    `vertical-align:-${dip}px;margin-right:${Math.max(3, Math.round(size * 0.14))}px;` +
    `background:#0a121c;box-shadow:0 0 0 1px rgba(120,200,255,0.25)" ` +
    `onerror="${onerror}">`;
}
