// Strike-height probe: where, up the victim's body, does an auto-aimed blow
// actually arrive?
//
//   node tools/aimheight.mjs "http://localhost:5173/?battle=neon&p1=titanus&p2=viper&auto=1&diff=ace" [steps]
//
// Every swing is reported as the height of the STRIKE TIP (the fist/foot/jaw
// point combat resolves on, before the vertical hit assist slides anything)
// expressed as a fraction of the target's own height: 0 = their feet, 1 =
// their crown. MELEE.AIM_LO..AIM_HI is the band the aim servo steers into.
//
// It plays the same fight TWICE, reloading between passes (a round ENDS — the
// second pass on the same page would find two idle mechs) — once with the
// vertical aim servo live and once with it disabled (MELEE.AIM_PITCH = 0, the
// pre-servo behaviour) — so the two columns are directly comparable.
import { launch } from './lib/browser.mjs';

const url = process.argv[2];
const STEPS = Number(process.argv[3] || 5400);
if (!url) {
  console.error('usage: node tools/aimheight.mjs "<battle url>" [steps]');
  process.exit(1);
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
const run = async (pitch) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  return page.evaluate(async ({ steps, pitch }) => {
  const hb = await import('/src/combat/hurtbox.js');
  if (window.__aimPitch0 === undefined) window.__aimPitch0 = hb.MELEE.AIM_PITCH;
  hb.MELEE.AIM_PITCH = pitch ? window.__aimPitch0 : 0;
  const w = window.__world, ais = window.__ais, fighters = window.__fighters;
  const proto = Object.getPrototypeOf(fighters[0]);
  const orig = proto.onAttackEvent;
  const swings = [];
  proto.onAttackEvent = function (type, arg, atk) {
    if (type !== 'hit') return orig.call(this, type, arg, atk);
    const V = this.pos.constructor;
    const a = new V(), b = new V();
    const info = this.strikeVolume(atk, a, b);
    const t = this.nearestEnemy();
    if (t) {
      swings.push({
        by: this.def.id, at: t.def.id, limb: info.limb,
        // what the aim servo had banked when the blow landed, and where
        drv: this._pitchDrv || '-', pitch: +(this._aimPitch || 0).toFixed(2),
        // the tip's height up the victim's body, feet = 0, crown = 1
        f: +((b.y - t.pos.y) / t.height).toFixed(2),
      });
    }
    return orig.call(this, type, arg, atk);
  };
  for (let i = 0; i < steps; i++) {
    for (const ai of ais) ai.update(1 / 60);
    w.update(1 / 60);
  }
  proto.onAttackEvent = orig;
  return { swings, band: [hb.MELEE.AIM_LO, hb.MELEE.AIM_HI] };
  }, { steps: STEPS, pitch });
};

const summarise = (label, r) => {
  const [lo, hi] = r.band;
  const f = r.swings.map((s) => s.f).sort((x, y) => x - y);
  const pct = (p) => (f.length ? f[Math.min(f.length - 1, Math.round(f.length * p))] : NaN);
  const inBand = f.filter((v) => v >= lo && v <= hi).length;
  const low = f.filter((v) => v < lo).length;
  console.log(`\n${label}  (${f.length} swings, band ${lo}..${hi})`);
  console.log(`  median ${pct(0.5)}   p10 ${pct(0.1)}   p90 ${pct(0.9)}`);
  console.log(`  on the upper body: ${(100 * inBand / (f.length || 1)).toFixed(0)}%` +
    `   below the chest: ${(100 * low / (f.length || 1)).toFixed(0)}%` +
    `   over the crown: ${(100 * (f.length - inBand - low) / (f.length || 1)).toFixed(0)}%`);
  const byLimb = {};
  for (const s of r.swings) (byLimb[`${s.by}·${s.limb}·${s.drv}`] ||= []).push(s);
  for (const [k, v] of Object.entries(byLimb).sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    const med = (xs) => xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)];
    console.log(`    ${k.padEnd(30)} ${String(v.length).padStart(4)} swings, ` +
      `median ${med(v.map((s) => s.f))}, aim ${med(v.map((s) => s.pitch))} rad`);
  }
};

const off = await run(false);
const on = await run(true);
summarise('AIM SERVO OFF (pre-change)', off);
summarise('AIM SERVO ON  (shipping)', on);
if (errors.length) console.log('\npage errors:', errors.slice(0, 5));
await browser.close();
