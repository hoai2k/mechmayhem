// ============================================================================
// analytics.js — the visitor count, and the ONE place the GoatCounter site
// code lives.
//
// WHY THERE IS ANY OF THIS: the game is served from GitHub Pages, which is a
// static host. A static site never sees a visitor's IP, so it cannot know
// where anyone is playing from — that answer can only come from something
// that RECEIVES the request. GoatCounter is that something: a cookieless
// counter that records the hit, resolves the country at its end and throws the
// IP away. Nothing here stores an identifier, and there is no profile of
// anyone to build.
//
// WHAT IS SENT, in full: the page URL, the referrer, and whether a match was
// actually started (the `play` event below). GoatCounter derives country,
// browser and screen size from the request itself. That is the whole list.
//
// SET IT UP: docs/ANALYTICS.md. Until CODE below is filled in, every function
// here is a no-op and the game makes no request at all — which is also what a
// fork of this repo gets, since a fork must never report to somebody else's
// dashboard.
// ============================================================================

/**
 * The GoatCounter site code — the `MYCODE` in `https://MYCODE.goatcounter.com`.
 * EMPTY MEANS OFF: no script is loaded and no request is made. It is read by
 * the stats page too (stats/stats.js), so the code is stated once and the
 * dashboard link can never point somewhere the beacon isn't reporting.
 */
export const GOATCOUNTER_CODE = '';

/** The dashboard for that code, or null when there is no code yet. */
export function dashboardUrl() {
  return GOATCOUNTER_CODE ? `https://${GOATCOUNTER_CODE}.goatcounter.com` : null;
}

const OPT_OUT_KEY = 'rw.noStats';

/** Has this browser opted out (?stats=0, or the button on the stats page)? */
export function optedOut() {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch (e) { return false; }
}

/** Opt this browser in or out for good. Nothing is counted while out. */
export function setOptOut(off) {
  try { localStorage.setItem(OPT_OUT_KEY, off ? '1' : '0'); } catch (e) { /* private mode */ }
}

/**
 * Every reason NOT to count, in one place. A count is the exception, not the
 * default: an unconfigured build, a fork, a desktop app, a dev server, a
 * browser asking not to be tracked and a player who said no all end here.
 */
function reasonToSkip() {
  if (!GOATCOUNTER_CODE) return 'no site code (see docs/ANALYTICS.md)';
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'no document';
  if (optedOut()) return 'this browser has opted out';
  // Do Not Track / Global Privacy Control. GoatCounter collects nothing
  // personal either way, but a browser that has asked is a browser that has
  // asked, and honouring it costs one line.
  const n = navigator;
  if (n?.doNotTrack === '1' || n?.globalPrivacyControl === true) return 'DNT/GPC';
  // The desktop build serves itself over localhost, and nobody downloading a
  // standalone app signed up to be counted.
  if (/electron/i.test(n?.userAgent || '')) return 'desktop build';
  // A workbench or a dev route is the owner working, not a visitor.
  if (location.pathname.includes('/workbench/')) return 'workbench';
  return null;
}

let started = false;

/**
 * Load the counter, which records this page view by itself. Safe to call more
 * than once; the second call does nothing.
 *
 * `?stats=0` opts this browser out for good, `?stats=1` back in — the same
 * switch the stats page's button writes, so there is one opt-out with two
 * ways to set it. It is read HERE rather than in boot.js: a switch belongs
 * with the thing it switches.
 */
export function startAnalytics() {
  if (started) return;
  try {
    const p = new URLSearchParams(location.search).get('stats');
    if (p === '0' || p === '1') setOptOut(p === '0');
  } catch (e) { /* no location: nothing to read */ }
  const skip = reasonToSkip();
  if (skip) { started = true; return; }
  started = true;
  // The settings object has to exist BEFORE count.js runs, or the script's own
  // onload pageview is sent with the defaults.
  window.goatcounter = window.goatcounter || {};
  const s = document.createElement('script');
  s.async = true;
  s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  s.src = 'https://gc.zgo.at/count.js';
  // a blocked or missing counter must never be visible in the game
  s.addEventListener('error', () => { /* an ad blocker ate it; fine */ });
  document.head.appendChild(s);
}

/**
 * Record an EVENT (not a page view). Used for `play` — the one thing a page
 * view cannot tell you, which is whether anybody got past the title screen.
 * A no-op when the counter never loaded, including while it is still
 * downloading, because a dropped event is worth less than a delayed frame.
 */
export function countEvent(name) {
  if (reasonToSkip()) return;
  try { window.goatcounter?.count?.({ path: name, title: name, event: true }); } catch (e) { /* never throw at the game */ }
}

/** A match actually started. See countEvent. */
export function countPlay() { countEvent('play'); }
