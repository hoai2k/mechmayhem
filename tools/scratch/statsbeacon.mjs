// ============================================================================
// statsbeacon.mjs — the visitor count is wired up, and every reason NOT to
// count is honoured. gc.zgo.at is STUBBED, so this never contacts the real
// service and needs no site code of its own.
//
//   node tools/scratch/statsbeacon.mjs [url]
// ============================================================================
import { chromium } from 'playwright-core';
import { GOATCOUNTER_CODE } from '../../src/core/analytics.js';
const base = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
const fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : ' FAIL '} ${m}`); if (!c) fails.push(m); };

async function run(label, { url, dnt = false, headers = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, extraHTTPHeaders: headers });
  const page = await ctx.newPage();
  const hits = [];
  // stand in for the real counter: record what the game asks it to count
  await page.route('https://gc.zgo.at/count.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.__loaded = true;
           window.goatcounter = window.goatcounter || {};
           window.goatcounter.count = (v) => window.__hits.push(v || { path: 'auto' });`,
  }));
  await page.addInitScript(({ dnt }) => {
    window.__hits = [];
    if (dnt) Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' });
  }, { dnt });
  page.on('request', (r) => { if (r.url().includes('gc.zgo.at') || r.url().includes('goatcounter.com')) hits.push(r.url()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const loaded = await page.evaluate(() => !!window.__loaded);
  const counted = await page.evaluate(() => window.__hits || []);
  console.log(`  ${label.padEnd(34)} script=${loaded ? 'loaded' : 'NOT loaded'} requests=${hits.length} counted=${JSON.stringify(counted)}`);
  await ctx.close();
  return { loaded, counted, hits };
}

// The shipped state has no site code, and then the rule is simpler and
// stricter: the game must make NO analytics request at all, ever. Set a code
// in src/core/analytics.js and the same script checks the counting instead.
console.log(GOATCOUNTER_CODE ? `SITE CODE "${GOATCOUNTER_CODE}" CONFIGURED` : 'NO SITE CODE (the shipped state)');
let r = await run('title screen', { url: `${base}/` });
ok(GOATCOUNTER_CODE ? r.loaded : (!r.loaded && r.hits.length === 0),
  GOATCOUNTER_CODE ? 'the counter script is fetched on a normal load'
                   : 'unconfigured: nothing is requested, so a fork counts nothing');
r = await run('?stats=0 (opted out)', { url: `${base}/?stats=0` });
ok(!r.loaded && r.hits.length === 0, 'opted out: NO request is made at all');
r = await run('Do Not Track', { url: `${base}/`, dnt: true });
ok(!r.loaded && r.hits.length === 0, 'DNT: no request is made');
r = await run('the workbench', { url: `${base}/workbench/?edit=gait&mech=fenrir` });
ok(!r.loaded, 'the workbench is the owner working, not a visitor');

// A REAL MATCH, through the real menus. The `?battle=` harness is a DEV route
// (src/dev/index.js) that never reaches bootGame, so it counts nothing — which
// is correct, and is why the pad has to walk the menus like a player.
{
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await ctx.newPage();
  await page.route('https://gc.zgo.at/count.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.__loaded = true;
           window.goatcounter = window.goatcounter || {};
           window.goatcounter.count = (v) => window.__hits.push(v || { path: 'auto' });`,
  }));
  await page.addInitScript(() => {
    window.__hits = [];
    window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [{ connected: true, index: 0, id: 'virtual', mapping: 'standard',
      axes: window.__pad.axes, buttons: window.__pad.buttons }, null, null, null];
    window.__press = (i, on) => { window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  });
  await page.goto(`${base}/?textures=0&postfx=0&music=0`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const before = (await page.evaluate(() => window.__hits)).length;
  const tapA = async () => {
    await page.evaluate(() => window.__press(0, true));
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__press(0, false));
    await page.waitForTimeout(1400);
  };
  for (let i = 0; i < 8; i++) {
    if ((await page.evaluate(() => window.__game?.S?.mode)) === 'battle') break;
    await tapA();
  }
  const mode = await page.evaluate(() => window.__game?.S?.mode);
  const counted = await page.evaluate(() => window.__hits);
  console.log(`  ${'a match, via the menus'.padEnd(34)} mode=${mode} counted=${JSON.stringify(counted.slice(before))}`);
  ok(mode === 'battle', 'the pad reached a battle');
  const plays = counted.filter((c) => c?.path === 'play').length;
  if (GOATCOUNTER_CODE) {
    ok(plays === 1, 'starting a match counts exactly one `play` event');
    ok(counted.some((c) => c?.path === 'play' && c?.event === true), 'and it is an EVENT, not a page view');
  } else {
    ok(plays === 0, 'unconfigured: a match counts nothing');
  }
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
