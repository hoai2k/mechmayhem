// Can a page tell a REFUSED cross-origin frame from a loaded one?
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://localhost:5173/stats/', { waitUntil: 'domcontentloaded' });
for (const [label, src] of [
  ['blocked (frame-ancestors none)', 'https://hoai.goatcounter.com/?hideui=1'],
  ['frameable cross-origin', 'https://example.com/'],
]) {
  const r = await p.evaluate(async (src) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'width:300px;height:200px';
    document.body.appendChild(f);
    const loaded = await new Promise((res) => {
      let done = false;
      f.addEventListener('load', () => { done = true; res('load-fired'); });
      f.src = src;
      setTimeout(() => { if (!done) res('timeout'); }, 8000);
    });
    let sameOrigin = null, href = null;
    try { sameOrigin = !!f.contentDocument; href = f.contentWindow.location.href; }
    catch (e) { sameOrigin = false; href = 'THREW (cross-origin: it really loaded)'; }
    const kids = (() => { try { return f.contentWindow.length; } catch (e) { return 'threw'; } })();
    f.remove();
    return { loaded, sameOrigin, href, kids };
  }, src);
  console.log(`${label.padEnd(32)} ${JSON.stringify(r)}`);
}
await b.close();
