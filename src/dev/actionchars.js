// Human-readable characteristics of each combat action, for the ?debug=models
// action sandbox status panel. Generic stats come from the mech's `moves`;
// per-mech special cases (and WHICH version shows them) are curated below from
// the animation contracts — procedural signature() hardware vs GLB glbanim
// profiles. ver: 'proc' | 'glb' | undefined (present in both versions).
//
// This is "whatever is known" — a living table. Add a note when a behavior is
// discovered to differ between the procedural and GLB renderings of a mech.

const NOTES = {
  aegis: [
    { a: '*', t: 'Tower shield squared to the front while guarding' },
    { a: 'special', t: 'Bulwark bash — shield shoves the target' },
  ],
  viper: [
    { a: '*', t: 'Twin energy blades fused to the forearms (arm extensions)' },
    { a: 'light', t: 'Hand roll/yaw damped so blades stay speared along the arm', v: 'glb' },
    { a: 'heavy', t: 'Hand roll/yaw damped so blades stay speared along the arm', v: 'glb' },
    { a: '*', t: 'Blades flare wider at rest', v: 'proc' },
  ],
  nova: [{ a: '*', t: 'Broken halo spins; glow swells to a power apex tell', v: 'proc' }],
  vulcan: [
    { a: 'ranged', t: 'Gatling barrels spin up while firing', v: 'proc' },
    { a: 'ranged', t: 'Gun arm punched forward on its own channel clip (gatlingLoop)' },
    { a: 'special', t: 'Missile salvo ripple-fires alternating shoulder pods (podL/podR)' },
  ],
  colossus: [{ a: 'ranged', t: 'Shoulder mortar tubes pitch and alternate', v: 'proc' }],
  fenrir: [
    { a: '*', t: 'Quadruped — gallop gait' },
    { a: '*', t: 'Tail chain wags', v: 'proc' },
  ],
  wraith: [{ a: 'ranged', t: 'Railgun fires from the rifle muzzle (scope anchor)', v: 'proc' }],
  tempest: [{ a: '*', t: 'Static-field coils arc lightning', v: 'proc' }],
  nullbot: [{ a: '*', t: 'Corruption shards strobe; glitch flecks pop off joints', v: 'proc' }],
  saurion: [{ a: '*', t: 'Theropod carriage; tail lashes on strikes' }],
  cranky: [{ a: '*', t: 'Pincers gape and snap; sideways shell scuttle', v: 'proc' }],
  jerry: [{ a: '*', t: 'Antennae twitch; claw-nest ripples', v: 'proc' }],
  inferno: [{ a: '*', t: 'Dual flamethrowers; wrists level the torch line' }],
  frogger: [{ a: '*', t: 'Four arms — lower cannon pair counter-swings', v: 'proc' }],
  rhino: [{ a: 'special', t: 'Bull rush — frame pitches down over the horn' }],
  titanus: [],
  glacier: [],
};

// action key -> the game intent field(s) it maps to
export const ACTIONS = ['light', 'heavy', 'ranged', 'special', 'ult', 'block', 'dash', 'fall'];

export function describeAction(def, action) {
  const m = def.moves || {};
  const lines = [];
  const push = (t, v) => lines.push({ t, v });
  let title;
  if (action === 'light') {
    title = 'Light combo';
    push('Melee 3-hit combo — connects on a target in reach');
    if (m.light?.dmg) push(`~${m.light.dmg} dmg/hit`);
  } else if (action === 'heavy') {
    title = 'Heavy attack';
    const h = m.heavy || {};
    if (h.dmg) push(`${h.dmg} dmg`);
    if (h.range) push(`reach ${h.range}`);
    if (h.knock) push(`knockback ${h.knock}`);
    if (h.launch) push(`launch ${h.launch}`);
    push('Requires a target within range');
  } else if (action === 'ranged') {
    const r = m.ranged || {};
    title = r.name || 'Ranged';
    if (r.type) push(`type: ${r.type}`);
    if (r.dmg) push(`${r.dmg} dmg`);
    if (r.speed) push(`projectile speed ${r.speed}`);
    if (r.cooldown) push(`cooldown ${r.cooldown}s`);
    push('Fires a projectile toward the enemy ahead');
  } else if (action === 'special') {
    const s = m.special || {};
    title = s.name || 'Special';
    if (s.id) push(`id: ${s.id}`);
    if (s.dmg) push(`${s.dmg} dmg`);
    if (s.cooldown) push(`cooldown ${s.cooldown}s`);
    if (s.knock) push(`knockback ${s.knock}`);
    if (s.guard) push(`guard ${s.guard}s`);
    push('Signature move — usually engages the enemy ahead');
  } else if (action === 'ult') {
    const u = m.ult || {};
    title = u.name || 'Ultimate';
    if (u.id) push(`id: ${u.id}`);
    if (u.dmg) push(`${u.dmg} dmg`);
    if (u.count) push(`${u.count} hits/projectiles`);
    if (u.duration) push(`runs ${u.duration}s`);
    push('Meter is held full here, so it fires on every press');
  } else if (action === 'fall') {
    title = 'Falling down';
    push('Launch → land → knockdown → get-up, the full floored reaction');
    push('Plays launched / knockdown / getup back to back');
    push('Not an input in the game — knockback with launch puts you here');
  } else if (action === 'block') {
    title = 'Block';
    push('Hold to guard — deflects/reduces frontal damage');
  } else if (action === 'walk') {
    title = 'Walk / Run';
    push('Locomotion gait — stride cadence foot-plants to ground speed');
    push('Hold the button / stick; positions snap home 2s after release');
  } else if (action === 'dash') {
    title = 'Dash';
    push('Quick evasive burst');
  } else {
    title = 'Idle';
    push('Battle-ready rest stance');
  }
  for (const n of NOTES[def.id] || []) {
    if (n.a === '*' || n.a === action) push(n.t, n.v);
  }
  return { title, lines };
}
