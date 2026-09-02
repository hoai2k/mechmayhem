// LAUNCHMOD — the one-off codemod that moved every tool's Playwright launch
// block onto tools/lib/browser.mjs. Kept so the migration is reproducible and
// so a tool added with the old block can be folded in the same way.
//
//   node tools/scratch/launchmod.mjs          dry run: what would change, what is skipped
//   node tools/scratch/launchmod.mjs --apply  rewrite the files
//
// It replaces ONLY the exact launch expression —
//   chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: [<std>(, extra…)?] })
// where <std> is the SwiftShader triple (→ `launch()` / `launch({ args: [extra…] })`)
// or the bare '--no-sandbox' (→ `launch({ gl: false })`) — and swaps the
// `import { chromium } from 'playwright-core'` line for the lib import when
// nothing else in the file still names `chromium`. Every other byte is kept.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const apply = process.argv.includes('--apply');
const files = [];
for (const dir of ['tools', 'tools/scratch']) {
  for (const e of readdirSync(dir)) if (e.endsWith('.mjs')) files.push(join(dir, e));
}

const STD = String.raw`'--use-gl=angle',\s*'--use-angle=swiftshader',\s*'--no-sandbox'`;
const EXTRA = String.raw`(?:,\s*('[^']*'(?:\s*,\s*'[^']*')*))?`;
const LAUNCH = new RegExp(
  String.raw`chromium\.launch\(\{\s*executablePath:\s*'/opt/pw-browsers/chromium',\s*args:\s*\[\s*(?:(${STD})|('--no-sandbox'))${EXTRA}\s*,?\s*\]\s*,?\s*\}\)`,
  'g');
const IMPORT = /^import \{ chromium \} from 'playwright-core';\n/m;

const changed = [], skipped = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('chromium.launch')) continue;
  let n = 0;
  let out = src.replace(LAUNCH, (m, std, plain, extra) => {
    n++;
    const opts = [];
    if (plain) opts.push('gl: false');
    if (extra) opts.push(`args: [${extra.replace(/\s*\n\s*/g, ' ')}]`);
    return opts.length ? `launch({ ${opts.join(', ')} })` : 'launch()';
  });
  if (n === 0) { skipped.push([f, 'launch block differs from the shared one']); continue; }
  if (out.includes('chromium.launch')) { skipped.push([f, 'a second launch block differs']); continue; }
  const rel = relative(dirname(f), 'tools/lib/browser.mjs').replace(/\\/g, '/');
  const imp = `import { launch } from '${rel.startsWith('.') ? rel : './' + rel}';\n`;
  if (!IMPORT.test(out)) { skipped.push([f, 'no `import { chromium } from \'playwright-core\'` line to swap']); continue; }
  if (/\blaunch\b(?!\()/.test(src) || /(?<![.\w])launch\(/.test(src)) { skipped.push([f, 'already uses a `launch` identifier']); continue; }
  const stillChromium = /\bchromium\b/.test(out.replace(IMPORT, ''));
  out = out.replace(IMPORT, stillChromium ? (m) => m + imp : imp);
  changed.push([f, n]);
  if (apply) writeFileSync(f, out);
}
console.log(`${apply ? 'rewrote' : 'would rewrite'} ${changed.length} files, skipped ${skipped.length}`);
for (const [f, why] of skipped) console.log(`  skip ${f}: ${why}`);
if (!apply) for (const [f, n] of changed) console.log(`  ${f} (${n})`);
