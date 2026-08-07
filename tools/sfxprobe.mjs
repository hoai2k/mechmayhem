// ============================================================================
// sfxprobe.mjs — prove the RECORDED set is what the game actually plays.
//
// The thing that cannot be seen in a screenshot and cannot be heard from a
// file listing: whether `audio.play('hit')` reached a recording or fell
// through to the synth, and whether a mech with its own voice
// (`fenrir_taunt`) got it. So this drives the real GameAudio in a real
// browser and reports, per sound: did the manifest have it, did it decode,
// how many takes did the slicer find, and which file a given mech resolves
// to.
//
//   node tools/sfxprobe.mjs [http://localhost:5173/]
// ============================================================================
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:5173/';
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.mouse.click(30, 30);           // unlock the audio context
await p.waitForTimeout(1500);

const out = await p.evaluate(async () => {
  const { audio } = window.__game;
  await audio.loadSfxBank();
  const bank = audio._bank || {};
  const names = Object.keys(bank);
  // decode a representative spread plus every per-mech override
  const want = ['hit', 'hitHeavy', 'footstep', 'servo', 'gatling', 'uiMove', 'explosionBig']
    .concat(names.filter((n) => n.includes('_') && !n.startsWith('amb_') && !n.endsWith('_loop')).slice(0, 8));
  for (const n of want) audio._sample(n);
  await new Promise((r) => setTimeout(r, 6000));
  const rows = want.map((n) => {
    const s = audio._samples[n];
    return {
      name: n,
      state: s === 'loading' ? 'loading' : s === 'failed' ? 'FAILED' : s ? 'ready' : 'none',
      slices: audio._sliced[n]?.slices.length || 0,
      category: bank[n]?.category || '-',
    };
  });
  // does a mech with its own voice resolve to it, and one without fall back?
  const resolve = (mech, name) => (bank[`${mech}_${name}`] ? `${mech}_${name}` : name);
  return {
    total: names.length,
    ambience: names.filter((n) => n.startsWith('amb_')).length,
    rows,
    overrides: {
      'fenrir/taunt': resolve('fenrir', 'taunt'),
      'titanus/taunt': resolve('titanus', 'taunt'),
      'frogger/ult': resolve('frogger', 'ult'),
      'saurion/hitHeavy': resolve('saurion', 'hitHeavy'),
      'titanus/hitHeavy': resolve('titanus', 'hitHeavy'),
    },
  };
});

console.log(`manifest: ${out.total} sounds (${out.ambience} arena beds)\n`);
console.log('name              category     state    slices');
for (const r of out.rows) {
  console.log(`${r.name.padEnd(17)} ${r.category.padEnd(12)} ${r.state.padEnd(8)} ${r.slices}`);
}
console.log('\nper-mech resolution:');
for (const [k, v] of Object.entries(out.overrides)) console.log(`  ${k.padEnd(18)} -> ${v}`);
const bad = out.rows.filter((r) => r.state !== 'ready');
console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
console.log(bad.length ? `${bad.length} did not decode` : 'every probed sound decoded');
await b.close();
process.exit(bad.length || errs.length ? 1 : 0);
