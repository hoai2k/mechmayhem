// Registry of custom rigs — a hand-placed skeleton that REPLACES a GLB's
// scrambled auto-rig at load (see reskin.js, gltf.js, and the ?rigedit tool).
// Add a mech here once its rig is authored/tuned.
// Every shipped mech is BAKED now (tools/bake-glb.mjs folds the rig into the
// GLB), so the table is empty; a mech being re-rigged goes back in here while
// its rig is authored.
export const RIGS = {};

export function rigFor(id) { return RIGS[id] || null; }

// Names of every authored rig — used by tools (?rigedit) to explain which
// mechs are editable when the requested one has no rig file.
export function rigIds() { return Object.keys(RIGS); }
