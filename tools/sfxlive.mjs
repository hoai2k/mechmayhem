// ============================================================================
// sfxlive.mjs — what the game ACTUALLY triggers during a fight.
//
// The bank probe (tools/sfxprobe.mjs) proves a recording decodes; this proves
// the game asks for it. It drives the real menus into a real match, wraps
// GameAudio.play to tally every sound by name and by mech, and reports the
// arena bed's state — which is the only way to know that footsteps (measured
// off sole clearance, with no event to hang them on) fire at all.
//
//   node tools/sfxlive.mjs [http://localhost:5173/] [seconds]
// ============================================================================
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:5173/';
const secs = Number(process.argv[3] || 25);
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });

// count every play() from here on, before anything is triggered
await p.evaluate(() => {
  const a = window.__game.audio;
  window.__tally = {};
  const orig = a.play.bind(a);
  a.play = (name, opts = {}) => {
    const k = opts.mech && a._bank?.[`${opts.mech}_${name}`] ? `${opts.mech}_${name}` : name;
    window.__tally[k] = (window.__tally[k] || 0) + 1;
    return orig(name, opts);
  };
});

const mode = () => p.evaluate(() => window.__game?.S?.mode);
for (let i = 0; i < 40; i++) {
  if (await mode() === 'battle') break;
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1000);
}
await p.waitForTimeout(secs * 1000);

const out = await p.evaluate(() => ({
  mode: window.__game.S?.mode,
  theme: window.__game.S?.themeId,
  tally: window.__tally,
  bed: {
    arena: window.__game.ambience?.arena,
    src: (window.__game.ambience?.el?.src || '').split('/').pop(),
    playing: window.__game.ambience?.playing,
    vol: +(window.__game.ambience?.el?.volume ?? 0).toFixed(3),
    time: +(window.__game.ambience?.el?.currentTime ?? 0).toFixed(1),
  },
}));

console.log(`mode=${out.mode} theme=${out.theme}`);
console.log(`arena bed: ${JSON.stringify(out.bed)}`);
const rows = Object.entries(out.tally).sort((a, c) => c[1] - a[1]);
console.log(`\nsounds triggered (${rows.length} distinct):`);
for (const [k, n] of rows.slice(0, 24)) console.log(`  ${String(n).padStart(4)}  ${k}`);
const steps = rows.filter(([k]) => k.startsWith('footstep')).reduce((n, r) => n + r[1], 0);
console.log(`\nfootsteps: ${steps}`);
console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
await b.close();
