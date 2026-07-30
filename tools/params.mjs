// params — prove core/knobs.js KNOWN_PARAMS still matches the source.
//
// The list exists so a MISTYPED url param can be called out at boot
// (`?neobuzz=0.1` is otherwise indistinguishable from a knob that does
// nothing). A list that has fallen behind the code is worse than none: it
// warns about switches that DO work. So this greps every param read out of
// src/ + workbench/ and fails on drift, both ways.
//
//   node tools/params.mjs          report + exit 1 on drift
//   node tools/params.mjs --list   just print what the source reads
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'workbench'];
const files = [];
for (const r of ROOTS) {
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  })(r);
}

// `params.get('x')` / `.has('x')` / `searchParams.get("x")` — and the indirect
// readParam01('x', d) / readNum('rw.x', d) helpers in config.js
const READ = /\.(?:get|has)\(\s*['"]([a-z0-9]+)['"]/g;
const HELPER = /readParam01\(\s*['"]([a-z0-9]+)['"]/g;
const found = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const re of [READ, HELPER]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) found.add(m[1]);
  }
}
// localStorage.getItem('rw.*') reads land in the same regex; they are prefs,
// not URL params, and never look like one (no bare lowercase word).
for (const k of [...found]) if (k.startsWith('rw')) found.delete(k);

const listed = new Set(
  (readFileSync('src/core/knobs.js', 'utf8')
    .match(/export const KNOWN_PARAMS = \[([\s\S]*?)\];/)?.[1] || '')
    .match(/'[a-z0-9]+'/g)?.map((s) => s.slice(1, -1)) || []
);

if (process.argv.includes('--list')) {
  console.log([...found].sort().join(' '));
  process.exit(0);
}

// READ, BUT NOT BY A LITERAL. These are built at runtime, so no grep can see
// them; each is named here with the code that reads it, which is the only
// honest way to keep the check strict about everything else.
const INDIRECT = {
  p1: 'dev/battletest.js  params.get("p" + i)',
  p2: 'dev/battletest.js  params.get("p" + i)',
  p3: 'dev/battletest.js  params.get("p" + i)',
  p4: 'dev/battletest.js  params.get("p" + i)',
  throttle: 'main.js  forwarded to /workbench/ by the redirect loop',
  game: 'main.js  forwarded to /workbench/ by the redirect loop',
};
for (const k of Object.keys(INDIRECT)) found.add(k);

const missing = [...found].filter((k) => !listed.has(k)).sort();
const extra = [...listed].filter((k) => !found.has(k)).sort();
console.log(`source reads ${found.size} params · KNOWN_PARAMS lists ${listed.size}`);
if (missing.length) console.log(`\nREAD BUT NOT LISTED (a real switch would be called a typo):\n  ${missing.join(' ')}`);
if (extra.length) console.log(`\nLISTED BUT NEVER READ (stale, or read in a way the grep misses):\n  ${extra.join(' ')}`);
if (!missing.length && !extra.length) console.log('\nin sync.');
process.exit(missing.length ? 1 : 0);
