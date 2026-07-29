// WORKBENCH THUMBNAILS — the screenshots on the /workbench/ landing page.
//
//   node tools/wbthumbs.mjs        (dev server on :5173)
//
// One representative shot per tool, resized to 640x360 into workbench/thumbs/.
// Re-run when a tool's look changes; the landing page (workbench/landing.js)
// bundles these files, so a missing one fails the build rather than 404ing.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
const shots = [
  ['animation', 'http://localhost:5173/workbench/?edit=animation&mech=colossus', 16000],
  ['pose',      'http://localhost:5173/workbench/?edit=pose&mech=titanus&clip=heavy', 16000],
  ['skin',      'http://localhost:5173/workbench/?edit=skin&mech=viper', 16000],
  ['skindebug', 'http://localhost:5173/workbench/?edit=skindebug&mech=jerry', 60000],
  ['rig',       'http://localhost:5173/workbench/?edit=rig&mech=inferno', 16000],
  ['collider',  'http://localhost:5173/workbench/?edit=collider&mech=titanus&clip=heavy&at=hit', 16000],
  ['props',     'http://localhost:5173/workbench/?edit=props&prop=toriiGate&spin=0', 14000],
];
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox'] });
for (const [name, url, wait] of shots) {
  const p = await b.newPage({ viewport:{width:1280,height:720} });
  await p.goto(url, {waitUntil:'domcontentloaded'}).catch(e=>console.log(name, String(e).slice(0,80)));
  await p.waitForTimeout(wait);
  const buf = await p.screenshot();
  await sharp(buf).resize(640, 360).jpeg({ quality: 78 }).toFile(`workbench/thumbs/${name}.jpg`);
  await p.close();
  console.log('shot', name);
}
await b.close();
