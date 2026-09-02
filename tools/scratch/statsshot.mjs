// Shoot the /stats page in both of its states, and report console errors.
import { launch } from '../lib/browser.mjs';
const base = process.argv[2] || 'http://localhost:5173';
const out = process.argv[3] || '/tmp/claude-0/-home-user-mechmayhem/a9d5bb07-8b5c-5524-b54f-b3d8b5219b33/scratchpad';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 950 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(`${base}/stats/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/stats.png`, fullPage: true });
console.log('opt-out button says:', await p.textContent('#optbtn'), '|', await p.textContent('#optstate'));
console.log('errors:', errs.filter((e) => !/favicon/.test(e)).slice(0, 5));
await b.close();
