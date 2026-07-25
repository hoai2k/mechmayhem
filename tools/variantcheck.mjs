// variantcheck: build a mech's PRIMARY and ALTERNATE GLB entries and report
// what each one actually produced — bones mapped, anchors created, custom rig
// in use, and any console/page error raised on the way. The cheap regression
// check after re-rigging a mech that keeps its old rig as `alt`.
//   node tools/variantcheck.mjs <mechId>
import { chromium } from 'playwright-core';

const [id] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173/?rigtest', { waitUntil: 'networkidle' });

const out = await page.evaluate(async (id) => {
  const { buildGlbForTool } = await import('/src/mechs/gltf.js');
  const { ROSTER } = await import('/src/mechs/roster.js');
  const def = ROSTER.find((d) => d.id === id);
  const res = {};
  for (const variant of ['primary', 'alt']) {
    try {
      const { mech, entry } = await buildGlbForTool(def, null, { alt: variant === 'alt' });
      if (!mech) { res[variant] = { built: false }; continue; }
      res[variant] = {
        built: true,
        url: entry?.url || null,
        isGLB: !!mech.isGLB,
        bones: Object.keys(mech.boneMap || {}).length,
        rigBones: mech.rigBones ? Object.keys(mech.rigBones).length : 0,
        anchors: Object.keys(mech.anchors || {}).sort(),
        profile: mech.animProfile ? Object.keys(mech.animProfile) : null,
      };
    } catch (e) { res[variant] = { error: String(e).slice(0, 200) }; }
  }
  return res;
}, id);

console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('CONSOLE:\n' + errors.slice(0, 12).join('\n'));
await browser.close();
