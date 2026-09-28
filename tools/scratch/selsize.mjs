// The fighter-select side for several mechs, side by side, one sheet: how big
// each robot is drawn (its GAME size, menus/select.js picScale) and where it
// sits against the text. node tools/scratch/selsize.mjs [id,id,…] [out.png]
import { launch } from '../lib/browser.mjs';
import sharp from 'sharp';
const ids = (process.argv[2] || 'titanus,colossus,tritone,saurion,jerry,cranky').split(',');
const out = process.argv[3] || 'selsize.png';
const browser = await launch({ gl: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://localhost:5173/?music=0&prefetch=0', { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.evaluate(async () => {
  const { MechSelectScreen } = await import('/src/ui/menus.js');
  const root = document.getElementById('ui-root');
  root.querySelectorAll('.screen').forEach((e) => e.remove());
  const input = { connectedPadCount: () => 0, padConnected: () => false, rumble() {}, menuEventsFor: () => ({}), touchMenuEvent() {} };
  const slots = [{ kind: 'human', device: 'kb1' }]; for (let i = 1; i < 8; i++) slots.push({ kind: 'off' });
  window.__sel = new MechSelectScreen(root, { input, prev: slots, onDone() {}, onBack() {} });
});
const tiles = [];
for (const id of ids) {
  await page.evaluate((id) => { const s = window.__sel; s.pickers[0].cursor = s.roster.findIndex((m) => m.id === id); s.refresh(); }, id);
  await page.waitForTimeout(2200);
  tiles.push(await page.screenshot({ clip: { x: 0, y: 0, width: 640, height: 900 } }));
}
const W = 320, H = 450;
const resized = await Promise.all(tiles.map((b) => sharp(b).resize(W, H).png().toBuffer()));
await sharp({ create: { width: W * resized.length, height: H, channels: 3, background: '#000' } })
  .composite(resized.map((b, i) => ({ input: b, left: i * W, top: 0 }))).png().toFile(out);
console.log('wrote', out);
await browser.close();
