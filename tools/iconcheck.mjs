// MECH ICONS — is every mech wearing what it is supposed to wear?
//
//   node tools/iconcheck.mjs [baseUrl]     (dev server up on :5173)
//
// The icon a mech shows is a three-tier ladder (src/ui/icons.js): a hand-made
// BADGE if it has one, its auto-captured THUMBNAIL otherwise, and the roster
// emoji if even that is missing. This checks the ladder against what is
// actually on disk, in the browser, through the same code the menus use:
//
//   · every id in BADGES has a file in public/badges/  (a listed-but-missing
//     badge still renders, via the fallback — so nothing else would ever tell
//     you the art did not land)
//   · every mech in the roster has a thumbnail, since that is the BACKUP tier
//     and a mech without one has nothing between it and the emoji
//   · the fallback ladder itself still works, exercised on synthetic ids: a
//     badge with no file must fall to the thumbnail, and no thumbnail at all
//     must fall to the emoji rather than a broken image
//
// It exists because the icons broke once in a way nothing caught: a capture
// tool re-shot the whole roster while adding two mechs, and the first report
// of it was a human noticing the menus. Icons are art, and art needs a check
// that looks at the pixels' existence rather than the code's intentions.
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async () => {
  const icons = await import('/src/ui/icons.js');
  const { ROSTER } = await import('/src/mechs/roster.js');
  // Load through an <img>, which is the only honest test: a dev server hands
  // back index.html with a 200 for a missing asset, so a fetch's status code
  // says nothing. An image either decodes or it does not.
  const loads = (url) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(true);
    im.onerror = () => res(false);
    im.src = url;
  });
  // ...and the LADDER, end to end: build the real markup, let it settle, and
  // report where the <img> came to rest (or that it replaced itself with the
  // emoji and left the DOM).
  // POLL, do not sleep. Each rung of the ladder is a fresh image load, so a
  // fixed wait is a race: too short and a case that WILL fall through to the
  // emoji is reported as resting on a tier it is still leaving. Wait until the
  // src stops changing and the element stops being replaced.
  const settle = async (def) => {
    const box = document.createElement('div');
    box.innerHTML = icons.mechIcon(def, 40);
    document.body.appendChild(box);
    const el = box.firstChild;
    let last = null, still = 0;
    for (let i = 0; i < 100 && still < 8; i++) {
      await new Promise((r) => setTimeout(r, 60));
      if (!document.body.contains(el)) { box.remove(); return 'emoji'; }
      const src = el.getAttribute?.('src');
      still = src === last ? still + 1 : 0;
      last = src;
    }
    box.remove();
    return last || 'emoji';
  };

  const badges = [...icons.BADGES];
  const rows = [];
  for (const id of badges) {
    rows.push({ kind: 'badge', id, ok: await loads(icons.badgeUrl(id)) });
  }
  for (const m of ROSTER) {
    rows.push({ kind: 'thumb', id: m.id, ok: await loads(icons.thumbUrl(m.id)) });
  }
  // synthetic: an id that is listed as having a badge but has neither file,
  // and one with no art at all. Neither may end on a broken image.
  const ladder = [];
  icons.BADGES.add('__nofile__');
  ladder.push({ case: 'badge listed, no file, no thumb', got: await settle({ id: '__nofile__', icon: 'X' }) });
  icons.BADGES.delete('__nofile__');
  ladder.push({ case: 'no badge, no thumb', got: await settle({ id: '__none__', icon: 'X' }) });
  const real = ROSTER[0];
  ladder.push({ case: `real mech (${real.id})`, got: await settle(real) });
  return { badges, rows, ladder, roster: ROSTER.length };
});
await browser.close();

const bad = out.rows.filter((r) => !r.ok);
for (const r of out.rows.filter((x) => x.kind === 'badge')) {
  console.log(`badge  ${r.id.padEnd(10)} ${r.ok ? 'ok' : 'MISSING public/badges/' + r.id + '.png'}`);
}
if (!out.badges.length) console.log('badge  (none declared — every mech is on its thumbnail)');
console.log(`thumb  ${out.rows.filter((r) => r.kind === 'thumb' && r.ok).length}/${out.roster} present`);
for (const r of out.rows.filter((x) => x.kind === 'thumb' && !x.ok)) {
  console.log(`thumb  ${r.id.padEnd(10)} MISSING — run: node tools/thumbs.mjs ${r.id}`);
}
for (const l of out.ladder) console.log(`ladder ${l.case} -> ${l.got}`);
const ladderBad = out.ladder.filter((l) => l.case.includes('no thumb') && l.got !== 'emoji');
console.log(bad.length || ladderBad.length
  ? `FAIL: ${bad.length} missing file(s), ${ladderBad.length} broken fallback(s)`
  : 'every mech has an icon, and every fallback lands');
process.exit(bad.length || ladderBad.length ? 1 : 0);
