// Registry of custom rigs — a hand-placed skeleton that REPLACES a GLB's
// scrambled auto-rig at load (see reskin.js, gltf.js, and the ?rigedit tool).
// Add a mech here once its rig is authored/tuned.
import { CRANKY_RIG } from './cranky.rig.js';
import { FENRIR_RIG } from './fenrir.rig.js';
import { GLACIER_RIG } from './glacier.rig.js';
import { JERRY_RIG } from './jerry.rig.js';
import { WRAITH_RIG } from './wraith.rig.js';

export const RIGS = {
  cranky: CRANKY_RIG,
  fenrir: FENRIR_RIG,
  glacier: GLACIER_RIG,
  jerry: JERRY_RIG,
  wraith: WRAITH_RIG,
};

export function rigFor(id) { return RIGS[id] || null; }

// Names of every authored rig — used by tools (?rigedit) to explain which
// mechs are editable when the requested one has no rig file.
export function rigIds() { return Object.keys(RIGS); }
