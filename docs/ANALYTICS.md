# Who is playing — the visitor count

`/stats/` on the deployed game (e.g. `hoai2k.github.io/mechmayhem/stats/`).
It is public: anyone who finds the URL can read the numbers.

## Why it is a third-party counter and not our own

**A static site cannot count its own visitors.** GitHub Pages serves files; the
game's JavaScript never sees a request, an address or a country, and there is
no server of ours between the player and the file. Anything that reports "where
are people playing from" has to be something that *receives* the request.

[GoatCounter](https://www.goatcounter.com/) is that something, chosen because
it is the smallest thing that answers the question: no cookies, no identifier,
no cross-site profile, no consent banner needed, and free for a non-commercial
site. The alternative — our own collector on a Cloudflare Worker, reading
`request.cf.country` — is more code and an account to keep alive for a hobby
game's page views.

## Setting it up (once)

1. **Make a site** at [goatcounter.com/signup](https://www.goatcounter.com/signup).
   The code you choose becomes `CODE.goatcounter.com`. **Done — this game
   counts into `hoai`.**
2. **Put the code in the game.** One line, one place, and it is already set:

   ```js
   // src/core/analytics.js
   export const GOATCOUNTER_CODE = 'hoai';
   ```

   **Empty means off** — while that string is blank the game loads no script
   and makes no request at all, which is what a fork of this repo gets and
   what every check below asserts.
3. **Make the dashboard public**, so `/stats/` can show it without a login:
   GoatCounter → *Settings → Dashboard viewable by → public*. Until this is
   set, `hoai.goatcounter.com` answers a visitor with a 303 to its login page
   (measured), so the embed has nothing to show.
4. **Let this site frame it**: GoatCounter → *Settings → Sites that can embed
   GoatCounter* → add `hoai2k.github.io`. Until this is set the dashboard
   sends `frame-ancestors 'none'` (measured) and refuses to be embedded, which
   is the right default.

   Steps 3 and 4 are only about SHOWING the numbers on `/stats/`. Counting
   works without either — step 2 is the whole of that.

### The embed is opt-in, and why

`/stats/` does **not** frame the dashboard until you tick *show the dashboard
on this page* (remembered per browser, `rw.statsEmbed`). A frame that gets
refused paints the browser's own grey error page — full height, unstyleable,
and indistinguishable from a broken site — and **nothing on the page can tell
a refused frame from a loaded one**: both settle on `about:blank` to a
cross-origin reader, which was measured rather than assumed
(`tools/scratch/framedetect.mjs`). So the choice was a permanent maybe-slab or
one click by the person who owns the settings. Tick it once, after step 4.

## What is collected — the whole list

- The page URL, and the referrer — a link on another site, or nothing.
- **Country**, resolved at GoatCounter's end from the request. The address
  itself is not stored.
- Browser and screen size, which arrive with any web request.
- One custom event, `play`, when a match actually starts. It is the one thing a
  page view cannot tell you: whether anyone got past the title screen.

Nothing else. No cookie, no visitor id, nothing that follows anyone between
sites. GoatCounter's own dashboard groups by day, country and referrer.

**Not counted at all** (`reasonToSkip` in `src/core/analytics.js`): a build with
no site code, a browser sending *Do Not Track* or *Global Privacy Control*, the
Electron desktop build, the `/workbench/` pages, and anyone who has opted out
with `?stats=0` or the button on `/stats/` (`rw.noStats` in localStorage;
`?stats=1` puts it back).

Because no personal data is stored, no consent banner is required under GDPR or
the UK equivalent — that is the reason for choosing a counter that works this
way. The `/stats/` page states all of the above to any visitor who opens it.

## Adding a new event

`countEvent('name')` from `core/analytics.js`, and think twice: every event is
another thing leaving someone's browser, and `/stats/` promises the list above
is complete. If you add one, add it to that page's list and to this file.

## Checking it

```bash
node tools/scratch/statsbeacon.mjs     # needs `npm run dev` running
```

It **stubs** `gc.zgo.at`, so it never contacts the real service and needs no
site code. It asserts the rules in whichever state the repo is in: with no code
configured, that the game makes no analytics request anywhere — title screen,
workbench, or a real match driven through the menus with a virtual pad; with a
code set, that the script loads, that a match counts exactly one `play` **event**
(not a page view), and that opt-out and DNT each stop the request being made at
all.

Note that `?battle=...` counts nothing by design: it is a dev route
(`src/dev/index.js`) that never reaches `bootGame`.

`node tools/scratch/statsembed.mjs` drives the embed toggle: off by default,
on when ticked, remembered across a reload.

`node tools/scratch/statsshot.mjs` shoots the `/stats/` page so its two states
— configured, and not set up yet — can be looked at rather than assumed.
