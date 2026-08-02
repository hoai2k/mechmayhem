// Generate public/thumbs/<id>.png — square head-and-torso portraits of every
// mech, captured from the showcase judging camera. These are the roster icons
// used across menus/HUD (re-shoot after a mech redesign; dev server must be up
// on :5173).
//
//   node tools/thumbs.mjs [baseUrl] [id ...]   one or more mechs, by name
//   node tools/thumbs.mjs [baseUrl] --all      re-shoot the WHOLE roster
//
// IT WILL NOT OVERWRITE AN ICON YOU DID NOT ASK FOR. A bare run only fills in
// the mechs that have no thumb yet; every existing one is left exactly as it
// is. That is not politeness, it is the bug this tool already caused once:
// run to add two new mechs, it silently re-shot all seventeen, and the whole
// roster's icons changed in the menus behind a commit that said it was adding
// two. Judged art does not get replaced as a side effect — name the mech, or
// say --all and mean it.
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'fs';

const argv = process.argv.slice(2);
const BASE = argv.find((a) => a.startsWith('http')) || 'http://localhost:5173';
const ALL = argv.includes('--all');
const NAMED = argv.filter((a) => !a.startsWith('http') && !a.startsWith('--'));
const ROSTER = ['titanus', 'vulcan', 'aegis', 'viper', 'nova', 'rhino',
  'tempest', 'fenrir', 'colossus', 'wraith', 'inferno', 'glacier',
  'cranky', 'saurion', 'frogger', 'jerry', 'nullbot', 'konga', 'tritone'];

// A LONG LOW BODY DOES NOT FIT THE HUMANOID CROP. The clip box below frames a
// head-and-shoulders on a standing biped; a six-tonne quadruped as wide as he
// is tall fills it with one horn. This pulls the showcase camera back (and
// round, so the silhouette reads) for the bodies that need it — `?showcase`'s
// own `cam=zoom,yaw` param, so there is no second camera to keep in step.
const CAM = { tritone: '0.46,335' };

mkdirSync('public/thumbs', { recursive: true });
const IDS = (NAMED.length ? NAMED : ROSTER)
  .filter((id) => ALL || NAMED.length || !existsSync(`public/thumbs/${id}.png`));
if (!IDS.length) {
  console.log('every mech already has an icon — name one, or pass --all to re-shoot the roster');
  process.exit(0);
}
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
for (const id of IDS) {
  const cam = CAM[id] ? `&cam=${CAM[id]}` : '';
  await page.goto(`${BASE}/?showcase=${id}&anim=none${cam}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(9000); // SwiftShader ≈20x slow: let the pose settle
  // hide the debug label so it never bleeds into a tall mech's crop
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('#ui-root div')) el.style.display = 'none';
  });
  await page.screenshot({
    path: `public/thumbs/${id}.png`,
    clip: { x: 310, y: 30, width: 340, height: 340 },
  });
  console.log('thumb:', id);
}
await browser.close();
