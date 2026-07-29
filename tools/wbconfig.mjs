// WORKBENCH CONFIG CHECK — does the adapter still see the whole game?
//
// The workbenches read a config (workbench/config/contract.js) that one
// adapter fills in from live game data (workbench/adapters/robotworld). The
// deal is that adding a mech, a clip, a rig or a model entry shows up in the
// tools with no edit to the adapter — this proves it, by comparing what the
// config reports against the game's own sources, in the same browser.
//
//   node tools/wbconfig.mjs [baseUrl]
//
// Exit 1 on any drift, so it can gate a commit that adds content.
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${base}/workbench/?edit=skin`, { waitUntil: 'networkidle' });

const out = await page.evaluate(async () => {
  const { loadRobotworldConfig } = await import('/workbench/adapters/robotworld/index.js');
  const cfg = await loadRobotworldConfig();
  // the GAME's own sources, imported straight
  const { ROSTER } = await import('/src/mechs/roster.js');
  const { CLIPS } = await import('/src/mechs/animations.js');
  const { JOINT_ORDER } = await import('/src/mechs/rigadapter.js');
  const { rigIds } = await import('/src/mechs/rigs/index.js');
  const { PROPS } = await import('/src/arena/props.js');
  const { GAITS, gaitIdFor } = await import('/src/mechs/gaits.js');
  const propMan = await (await fetch('/models/props/manifest.json')).json();
  const manifest = cfg.manifest();

  const cat = cfg.catalogue.list();
  const rows = [];
  const check = (what, a, b) => rows.push({
    what, game: a.length, config: b.length,
    missing: a.filter((x) => !b.includes(x)),
    extra: b.filter((x) => !a.includes(x)),
  });
  check('subjects', ROSTER.map((m) => m.id), cat.map((c) => c.id));
  check('clips', Object.keys(CLIPS), cfg.anim.clips());
  check('joints', JOINT_ORDER, cfg.rig.joints);
  check('custom rigs', rigIds(), cfg.catalogue.list().filter((c) => cfg.rig.custom.get(c.id)).map((c) => c.id));
  check('models', Object.keys(manifest).filter((k) => manifest[k]?.url),
    cat.filter((c) => c.hasModel).map((c) => c.id));
  check('alternates', Object.keys(manifest).filter((k) => manifest[k]?.alt?.url),
    cat.filter((c) => c.hasAlt).map((c) => c.id));

  // the props workbench's catalogue is the game's prop table, and its "has an
  // imported model" flag is the prop manifest — neither hand-listed
  const props = cfg.props?.list() || [];
  check('props', Object.keys(PROPS), props.map((p) => p.id));
  check('prop models', Object.keys(propMan).filter((k) => propMan[k]?.file),
    props.filter((p) => p.hasModel).map((p) => p.id));

  // the gait table and every mech's gait assignment come from the game, so a
  // gait added to GAITS (or a def re-pointed at one) shows up in ?edit=gait
  // with no edit to the adapter
  check('gaits', Object.keys(GAITS), cfg.gait?.ids() || []);
  const badGaits = [];
  for (const c of cat) {
    const game = gaitIdFor(ROSTER.find((m) => m.id === c.id));
    const conf = cfg.gait?.idFor(c.id);
    if (game !== conf) badGaits.push(`${c.id}: game says ${game}, config says ${conf}`);
    if (!(cfg.gait?.users(game) || []).includes(c.id)) badGaits.push(`${c.id}: missing from users('${game}')`);
  }

  // per-subject clip lists must be non-empty and drawn from the clip table
  const clipNames = new Set(Object.keys(CLIPS));
  const badClips = [];
  for (const c of cat) {
    const list = cfg.anim.clipsFor(c.id) || [];
    if (!list.length) { badClips.push(`${c.id}: no clips`); continue; }
    const stray = list.map((x) => x.name).filter((n) => !clipNames.has(n));
    if (stray.length) badClips.push(`${c.id}: unknown ${stray.slice(0, 3).join(', ')}`);
  }
  return { rows, badClips, badGaits, vocab: cfg.vocab, game: cfg.game };
});
await browser.close();

let bad = 0;
console.log(`\nworkbench config — game "${out.game}", subjects called "${out.vocab.subjects}"\n`);
for (const r of out.rows) {
  const ok = !r.missing.length && !r.extra.length;
  if (!ok) bad++;
  console.log(`  ${r.what.padEnd(12)} game ${String(r.game).padStart(3)}  config ${String(r.config).padStart(3)}  ${
    ok ? 'ok' : `MISSING ${r.missing.join(',') || '—'} · EXTRA ${r.extra.join(',') || '—'}`}`);
}
for (const b of out.badClips) { bad++; console.log(`  clip list    ${b}`); }
for (const b of out.badGaits || []) { bad++; console.log(`  gait         ${b}`); }
if (errs.length) console.log('\npage errors:\n' + errs.slice(0, 4).join('\n'));
console.log(bad ? `\nFAIL — ${bad} mismatch(es): the adapter is not deriving something it should\n`
  : '\nPASS — every workbench list is derived from the game, nothing hand-copied\n');
process.exit(bad ? 1 : 0);
