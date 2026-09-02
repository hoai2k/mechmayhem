// THE SKIN DEBUG WORKBENCH, HEADLESS — the same audit /workbench/?edit=skindebug
// runs, printed instead of drawn, so a run can be diffed across a fix.
//
//   node tools/skindebug.mjs <mech> [<mech> …] [--alt] [--json out.json]
//                            [--stretch 1.35] [--pinch 0.6] [--tear 0.006]
//
// Every clip the mech can play plus its rest stance; findings are clustered
// runs of failing edges, worst first. See workbench/tools/stretchscan.js for
// what is measured and why. Needs the dev server (npm run dev) on :5173.
//
// The neighbouring probes ask narrower questions and are cheaper to run:
// tools/skinstretch.mjs (one clip, by island), tools/cliptear.mjs (far seams
// only), tools/stretchaudit.mjs (synthetic sweep + suggested skinOps).
import { launch } from './lib/browser.mjs';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1];
};
const has = (name) => args.includes('--' + name);
const mechs = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!mechs.length) { console.error('usage: node tools/skindebug.mjs <mech> [<mech> …]'); process.exit(1); }
const base = flag('base', 'http://localhost:5173');
const limits = {};
for (const k of ['stretch', 'pinch', 'tear']) if (flag(k)) limits[k] = +flag(k);
const custom = Object.keys(limits).length > 0;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e).slice(0, 300)));

const all = [];
for (const mech of mechs) {
  // with custom limits, open WITHOUT the automatic scan and start it ourselves
  // once they are set — otherwise the page scans twice
  const url = `${base}/workbench/?edit=skindebug&mech=${mech}${has('alt') ? '&alt=1' : ''}`
    + (custom ? '&scan=0' : '');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__skinDebug, null, { timeout: 180000 });
  if (custom) {
    await page.evaluate((l) => { window.__skinDebug.setLimits(l); window.__skinDebug.scan(); }, limits);
    await page.waitForFunction(() => window.__skinDebug.scanning, null, { timeout: 60000 });
  }
  // SwiftShader is ~20x slow and a mech has ~40 clips, so give it real time
  await page.waitForFunction(() => !window.__skinDebug.scanning, null, { timeout: 1800000 });
  const report = await page.evaluate(() => window.__skinDebug.report);
  all.push(report);
  console.log(`\n=== ${report.mech} (${report.variant}) — ${report.findings.length} finding(s) ===`);
  console.log(`limits: stretch ${report.limits.stretch}x · pinch ${report.limits.pinch}x · `
    + `tear ${report.limits.tear} of height`);
  for (const f of report.findings) {
    console.log(`${String(f.n).padStart(3)}. ${f.type.padEnd(7)} sev ${f.sev.toFixed(2).padStart(7)}  `
      + `${String(f.verts).padStart(4)}v/${String(f.edges).padStart(4)}e  `
      + `${String(f.clips).padStart(2)} clip(s), worst ${f.worstClip} t=${f.t.toFixed(2)}  `
      + `${f.atRest ? '[at rest] ' : ''}${f.bones.join(' ')}`);
  }
}
if (flag('json')) writeFileSync(flag('json'), JSON.stringify(all, null, 2));
await browser.close();
