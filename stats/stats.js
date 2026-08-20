// ============================================================================
// stats.js — the /stats page.
//
// It reads the site code from core/analytics.js rather than restating it, so
// the dashboard this page links to is BY CONSTRUCTION the one the game
// reports into. Two copies of that string is one rename away from a stats
// page that quietly shows somebody else's numbers, or none.
//
// The page has two states and no server to ask which: CONFIGURED (embed the
// dashboard) and NOT SET UP YET (say how, in four steps). GoatCounter's own
// dashboard is what is embedded — the hosted free tier has no API to build a
// custom view on, and an embed of the real thing beats a worse copy of it.
// ============================================================================
import { GOATCOUNTER_CODE, dashboardUrl, optedOut, setOptOut } from '../src/core/analytics.js';

const dash = document.getElementById('dash');
const url = dashboardUrl();

if (url) {
  // `hideui=1` drops GoatCounter's own chrome, which is the half of its page
  // that assumes you are logged into it.
  // The hint goes ABOVE the frame on purpose. A dashboard that is still
  // private refuses to be framed, and what the browser paints in its place is
  // its own error page — which cannot be styled and reads as a broken site.
  // One line of explanation above it turns that into "not finished yet",
  // which is what it is.
  dash.innerHTML = `
    <div class="panel dash">
      <div class="frame-hint top">
        <div class="row" style="justify-content:space-between">
          <p class="note" style="margin:0">
            Live from <b>${GOATCOUNTER_CODE}.goatcounter.com</b>. Blank below?
            The dashboard has to be <b>public</b> and this site listed under
            <em>Settings → Sites that can embed GoatCounter</em> — until then it
            declines to be framed, which is the right default, not a fault.
          </p>
          <a class="btn" href="${url}" target="_blank" rel="noopener noreferrer">Open it ↗</a>
        </div>
      </div>
      <iframe src="${url}?hideui=1" title="GoatCounter dashboard for MECH MAYHEM"
              loading="lazy" referrerpolicy="no-referrer"></iframe>
    </div>`;
} else {
  dash.innerHTML = `
    <div class="panel">
      <h2>Not set up yet</h2>
      <p class="note" style="margin-top:0">
        Nothing is being counted: the game makes no analytics request at all
        while the site code is empty, which is also what a fork of this repo
        gets. Four steps, once:
      </p>
      <ol class="setup">
        <li>Make a free site at <a href="https://www.goatcounter.com/signup" target="_blank" rel="noopener noreferrer" style="color:var(--cyan)">goatcounter.com/signup</a> — the code you pick becomes <code>CODE.goatcounter.com</code>.</li>
        <li>Put that code in <code>GOATCOUNTER_CODE</code> in <code>src/core/analytics.js</code> and redeploy.</li>
        <li>In GoatCounter, set <em>Settings → Dashboard viewable by</em> to <b>public</b>, so this page can show it.</li>
        <li>Add this site's host under <em>Settings → Sites that can embed GoatCounter</em>, so the panel above can frame it.</li>
      </ol>
      <p class="note" style="margin-bottom:0">The long version, including what
      is and is not collected: <code>docs/ANALYTICS.md</code>.</p>
    </div>`;
}

// ---- the opt-out, which must show the truth about THIS browser -------------
const btn = document.getElementById('optbtn');
const state = document.getElementById('optstate');
const dnt = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;

function render() {
  const off = optedOut();
  btn.textContent = off ? 'Count this browser' : "Don't count this browser";
  state.textContent = !GOATCOUNTER_CODE
    ? 'nothing is being counted anyway — no site code yet'
    : dnt
      ? 'your browser sends Do Not Track, so it is not counted either way'
      : off ? 'opted out — nothing from this browser is counted' : 'counted, like any other visitor';
}
btn.addEventListener('click', () => { setOptOut(!optedOut()); render(); });
render();
