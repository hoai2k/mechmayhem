// WHICH FACADE IS EACH THEME ACTUALLY WEARING? A theme may name its own
// (buildings.facadeTex) and only gets it when the images exist, so this
// reports the resolved answer per theme — the check that a delivered
// texture set is really in play rather than silently ignored.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto('http://localhost:5173/?battle=neon&p1=titanus&p2=viper&auto=1',
  { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world, null, { timeout: 90000 });
const rows = await page.evaluate(async () => {
  const [{ THEMES }, { hasTex }] = await Promise.all([
    import('/src/arena/themes.js'), import('/src/core/texload.js'),
  ]);
  const { STRUCTURE_KINDS } = await import('/src/arena/structures.js');
  const FALLBACK = { 0: 'bldg_concrete_panel', 1: 'bldg_brick_industrial',
    2: 'bldg_glass_office', 3: 'bldg_steampunk_metal' };
  return THEMES.map((t) => {
    const own = t.buildings?.facadeTex;
    const got = own && hasTex('building', own) ? own : FALLBACK[t.buildings?.styles?.[0]];
    const roof = t.buildings?.roofTex;
    const structs = (t.structures || []).map((s) => {
      const tex = STRUCTURE_KINDS[s.kind]?.tex;
      return `${s.kind}:${tex && hasTex('struct', tex) ? 'TEX' : 'procedural'}`;
    });
    return { id: t.id, wants: own || '(shared)', using: got,
      ok: !own || got === own,
      roof: roof ? (hasTex('building', roof) ? roof : `${roof} MISSING`) : '(gravel)',
      structs };
  });
});
await browser.close();
let bad = 0;
for (const r of rows) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(11)} facade ${String(r.using).padEnd(22)} roof ${r.roof.padEnd(21)} ${r.structs.join(' ')}`);
}
console.log(bad ? `\n${bad} theme(s) asked for a facade they did not get.` : '\nEvery theme is wearing the facade it asks for.');
process.exit(bad ? 1 : 0);
