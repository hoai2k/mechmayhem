// Registry of custom rigs — a hand-placed skeleton that REPLACES a GLB's
// scrambled auto-rig at load (see reskin.js, gltf.js, and the ?rigedit tool).
// Add a mech here once its rig is authored/tuned.
import { RHINO_RIG } from './rhino.rig.js';

export const RIGS = {
  rhino: RHINO_RIG,
};

export function rigFor(id) { return RIGS[id] || null; }

// Names of every authored rig — used by tools (?rigedit) to explain which
// mechs are editable when the requested one has no rig file.
export function rigIds() { return Object.keys(RIGS); }
