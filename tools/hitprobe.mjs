// Hitbox probe: fast-forwards a fight and reports, per swing, whether the
// LIMB-based capsule test (shipping) and the OLD body-sphere test agree.
//
//   node tools/hitprobe.mjs "http://localhost:5173/?battle=neon&p1=titanus&p2=viper&auto=1&diff=ace"
//
// Nothing in the game is instrumented for this: the probe monkey-patches
// Fighter.prototype from the page and re-implements the legacy predicate
// (a sphere of reach*0.8 + victim.hitRadius, centred reach*0.75 in front of
// the attacker at half its height) alongside it. Use it when re-tuning the
// MELEE block in src/combat/hurtbox.js — `bothOnly`/`newOnly` are the swings
// the change actually altered, and `connectRate` is what must stay in family
// with the old number or melee silently gets weaker.
//
// It also dumps each mech's measured capsule spec, which is the quickest way
// to spot a model whose hurtbox came out wrong (missing parts, silly radii).
import { chromium } from 'playwright-core';

const url = process.argv[2];
const STEPS = Number(process.argv[3] || 7200);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// Optional tuning sweep: `SWING_R=0.2 OVERSHOOT=0.6 node tools/hitprobe.mjs <url>`
// mutates the live MELEE block (dev server only) so a sweep needs no rebuild.
const tune = {};
for (const k of ['SWING_R', 'SWING_MIN', 'PAD', 'OVERSHOOT']) {
  if (process.env[k] !== undefined) tune[k] = Number(process.env[k]);
}
if (Object.keys(tune).length) {
  await page.evaluate(async (t) => {
    const m = await import('/src/combat/hurtbox.js');
    Object.assign(m.MELEE, t);
  }, tune);
}

const result = await page.evaluate((steps) => {
  const w = window.__world, ais = window.__ais, fighters = window.__fighters;
  const proto = Object.getPrototypeOf(fighters[0]);
  const stats = { swings: 0, oldHit: 0, newHit: 0, bothOnly: 0, oldOnly: 0, newOnly: 0, noLimb: 0 };
  const byLimb = {};
  const gaps = [];
  const missGeom = [];
  const limbGeom = [];

  // ---- legacy predicate, verbatim from before the capsule work ----
  const legacy = (atk, self) => {
    const reach = atk.range || 3.5;
    const cx = self.pos.x + Math.sin(self.yaw) * reach * 0.75;
    const cz = self.pos.z + Math.cos(self.yaw) * reach * 0.75;
    let cy = self.pos.y + self.height * 0.5;
    if (self.scale > self.def.body.scale * 1.4) {
      const t = self.nearestEnemy();
      cy = Math.min(cy, t ? t.center().y : self.pos.y + 2.5);
    }
    const out = new Set();
    for (const f of w.fighters) {
      if (f === self || !f.alive) continue;
      const c = f.center();
      const dx = w.wrapDelta(c.x - cx), dy = c.y - cy, dz = w.wrapDelta(c.z - cz);
      const rr = reach * 0.8 + f.hitRadius;
      if (dx * dx + dy * dy + dz * dz < rr * rr) out.add(f);
    }
    return out;
  };

  const origAttack = proto.onAttackEvent;
  const origTake = proto.takeHit;
  let landed = null;
  proto.takeHit = function (...a) { landed?.add(this); return origTake.apply(this, a); };
  proto.onAttackEvent = function (type, arg, atk) {
    if (type !== 'hit') return origAttack.call(this, type, arg, atk);
    const old = legacy(atk, this);
    const V = this.pos.constructor;
    const s0 = new V(), p = new V();
    const info = this.strikeVolume(atk, s0, p);
    byLimb[info.limb || '(none)'] = (byLimb[info.limb || '(none)'] || 0) + 1;
    if (!info.limb) stats.noLimb++;
    // how much room the swing had: gap from the strike point to the nearest
    // victim capsule surface, before any generosity is added. Negative = the
    // fist was inside them. A histogram of this is what says whether the
    // swing volume is doing real work or just papering over a miss.
    for (const f of w.fighters) {
      if (f === this || !f.alive || !f.hurtbox) continue;
      const qx = f.pos.x + w.wrapDelta(p.x - f.pos.x), qz = f.pos.z + w.wrapDelta(p.z - f.pos.z);
      f.hurtbox.refresh(null);
      let g = Infinity;
      for (const part of f.hurtbox.parts) {
        const seg = part.b.clone().sub(part.a);
        const ll = seg.lengthSq();
        const rel = new V(qx - part.a.x, p.y - part.a.y, qz - part.a.z);
        const tt = ll > 1e-9 ? Math.min(1, Math.max(0, rel.dot(seg) / ll)) : 0;
        g = Math.min(g, rel.addScaledVector(seg, -tt).length() - part.r);
      }
      if (g < Infinity) gaps.push(+g.toFixed(2));
    }
    // where the strike volume actually sits, in the attacker's own frame:
    // forward along facing, lateral, and height over his feet
    {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const proj = (v) => [
        +((v.x - this.pos.x) * fx + (v.z - this.pos.z) * fz).toFixed(1),
        +((v.x - this.pos.x) * fz - (v.z - this.pos.z) * fx).toFixed(1),
        +(v.y - this.pos.y).toFixed(1)];
      limbGeom.push({ limb: info.limb, r: +info.r.toFixed(1), a: proj(s0), b: proj(p) });
    }
    landed = new Set();
    const r = origAttack.call(this, type, arg, atk);
    const now = landed; landed = null;
    stats.swings++;
    if (old.size) stats.oldHit++;
    if (now.size) stats.newHit++;
    if (old.size && now.size) stats.bothOnly++;
    else if (old.size) {
      stats.oldOnly++;
      // characterise the swings the old ball caught and the limb does not:
      // how far, and how far off the attacker's facing, was the victim?
      for (const f of old) {
        const dx = w.wrapDelta(f.pos.x - this.pos.x), dz = w.wrapDelta(f.pos.z - this.pos.z);
        const ang = Math.abs(Math.atan2(dx, dz) - this.yaw);
        missGeom.push([+Math.hypot(dx, dz).toFixed(1),
          +(Math.min(ang, Math.PI * 2 - ang) * 180 / Math.PI).toFixed(0),
          +(f.pos.y - this.pos.y).toFixed(1), (atk.range || 3.5).toFixed(1)]);
      }
    } else if (now.size) stats.newOnly++;
    return r;
  };

  // capsule specs, as measured for the mechs in this fight
  const specs = {};
  for (const f of fighters) {
    const hb = f.hurtbox;
    specs[f.def.id + (f.mech.isGLB ? ' (glb)' : ' (proc)')] = hb
      ? hb.refresh(null).parts.map((p) =>
        `${p.name} r=${p.r.toFixed(2)} l=${p.a.distanceTo(p.b).toFixed(2)}`).join(' ')
      : 'NO HURTBOX — legacy sphere';
  }

  const log = [];
  let kos = 0;
  w.events.on('ko', (d) => { kos++; log.push(`KO: ${d.fighter.def.id} by ${d.attacker?.def?.id}`); });
  try {
    for (let i = 0; i < steps; i++) {
      for (const ai of ais) ai.update(1 / 60);
      w.update(1 / 60);
      // keep everyone standing: this measures SWING GEOMETRY, and a match
      // that ends after 20 punches is not a sample
      if (i % 30 === 0) for (const f of fighters) if (f.alive) f.hp = f.maxHp;
      if (i % 600 === 300) for (const f of fighters) { f.ult = 1; f.specialCd = 0; }
    }
  } catch (e) {
    return { crash: String(e.stack || e).slice(0, 800), stats, byLimb, specs, kos };
  }
  return {
    crash: null, kos, stats, byLimb, specs,
    gaps: gaps.sort((a, b) => a - b), missGeom, limbGeom: limbGeom.slice(0, 25),
    oldRate: +(stats.oldHit / Math.max(1, stats.swings)).toFixed(3),
    newRate: +(stats.newHit / Math.max(1, stats.swings)).toFixed(3),
    fighters: fighters.map((f) => ({ id: f.def.id, hp: Math.round(f.hp), alive: f.alive })),
  };
}, STEPS);

console.log(JSON.stringify(result, null, 1));
if (errors.length) console.log('PAGE ERRORS:', errors.join('\n'));
await browser.close();
