// Title-screen line-up dealer: three playable mechs, re-rolled every time
// the title screen comes up (menustage.showLineup).
//
// The three stand at x = -10 / 0 / +10, and the CENTER one stands ~4 units
// closer to the camera — so a heavy in the middle crowds the MECH MAYHEM
// logo and buries the two flanks. Hence the staging rules:
//   left   — always one of the heavies, so the frame opens on some bulk
//   center — always drawn from the lighter half, so the logo stays readable
//   right  — anyone else who's left
import { playableRoster } from '../mechs/roster.js';

// Rough on-screen mass. Body scale is the main term, nudged by how bulky
// and wide the build is: CRANKY reads huge because of its width, VIPER
// reads slim at the same scale.
export function sizeScore(m) {
  const b = m.body || {};
  return (b.scale || 1) * (1 + 0.3 * ((b.bulk || 1) - 1) + 0.25 * ((b.torsoW || 1) - 1));
}

const pick = (list) => list[(Math.random() * list.length) | 0];

// [leftId, centerId, rightId] — heavy on the left, small in the middle.
export function randomLineup() {
  const pool = playableRoster();
  if (pool.length < 3) return pool.map((m) => m.id); // tiny roster: no staging to do
  const bySize = [...pool].sort((a, b) => sizeScore(b) - sizeScore(a));
  const band = Math.max(1, Math.round(bySize.length / 3));
  const heavies = bySize.slice(0, band);          // biggest third
  const smalls = bySize.slice(-band);             // smallest third

  const left = pick(heavies);
  const centerPool = smalls.filter((m) => m.id !== left.id);
  const center = pick(centerPool.length ? centerPool : bySize.filter((m) => m.id !== left.id));
  const rest = pool.filter((m) => m.id !== left.id && m.id !== center.id);
  return [left.id, center.id, pick(rest).id];
}
