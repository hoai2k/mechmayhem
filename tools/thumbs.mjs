// Generate public/thumbs/<id>.png — square head-and-torso portraits of all
// every mech, captured from the showcase judging camera. These are the roster
// icons used across menus/HUD (run after any mech redesign; dev server must
// be up on :5173).
//   node tools/thumbs.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';

const BASE = process.argv[2] || 'http://localhost:5173';
const IDS = process.argv[3] ? process.argv.slice(3) : ['titanus', 'vulcan', 'aegis', 'viper', 'nova', 'rhino',
  'tempest', 'fenrir', 'colossus', 'wraith', 'inferno', 'glacier',
  'cranky', 'saurion', 'frogger', 'jerry', 'nullbot', 'konga', 'tritone'];

// A LONG LOW BODY DOES NOT FIT THE HUMANOID CROP. The clip box below frames a
// head-and-shoulders on a standing biped; a six-tonne quadruped as wide as he
// is tall fills it with one horn. These pull the showcase camera back (and
// round, so the silhouette reads) for the bodies that need it — `?showcase`'s
// own `cam=zoom,yaw` param, so there is no second camera to keep in step.
const CAM = { tritone: '0.46,335', cranky: '0.8,25', fenrir: '0.85,25' };

mkdirSync('public/thumbs', { recursive: true });
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
