// THE FOG COLOUR, MEASURED VS AUTHORED, for every arena: builds each theme
// through the battle harness and prints what the fog ended up as (the
// backdrop-matched colour from arena/horizon.js) beside the theme's authored
// value and the band as a fraction of the wrap period. A theme whose fog is
// still the authored hex after the load means no backdrop was measured.
//
// usage: node tools/scratch/fogcolor.mjs [theme …]
import { launch } from '../lib/browser.mjs';
import * as THREE from 'three';
const b = await launch();
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const all = ['neon', 'foundry', 'uptown', 'harbor', 'skyterrace', 'scrapyard',
  'quarry', 'volcano', 'frozen', 'ruins', 'jungle', 'orbital'];
const themes = process.argv.length > 2 ? process.argv.slice(2) : all;
const hex = (c) => '#' + new THREE.Color(c).getHexString();
console.log('theme       authored  measured  near/P far/P');
let bad = 0;
for (const id of themes) {
  await p.goto(`http://localhost:5173/?battle=${id}&p1=titanus&p2=viper&music=0&postfx=0`, { waitUntil: 'networkidle' });
  let row = null;
  for (let i = 0; i < 40; i++) {
    row = await p.evaluate(() => {
      const arena = window.__world?.arena;
      const scene = arena?.scene; if (!scene?.fog) return null;
      const P = arena.wrapHalf * 2;
      return { authored: arena.theme.fog.color, fog: scene.fog.color.getHex(),
        srgb: '#' + scene.fog.color.getHexString(), near: scene.fog.near / P, far: scene.fog.far / P };
    });
    if (row && row.fog !== row.authored) break;
    await p.waitForTimeout(1500);
  }
  if (!row) { console.log(`${id.padEnd(11)} NO ARENA`); bad++; continue; }
  const same = row.fog === row.authored;
  console.log(`${id.padEnd(11)} ${hex(row.authored)}   ${row.srgb}${same ? ' (unmeasured)' : ''}  ${row.near.toFixed(2)}  ${row.far.toFixed(2)}`);
  if (same) bad++;
}
await b.close();
process.exit(bad ? 1 : 0);
