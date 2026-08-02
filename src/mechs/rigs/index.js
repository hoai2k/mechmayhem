// Registry of custom rigs — a hand-placed skeleton that REPLACES a GLB's
// scrambled auto-rig at load (see reskin.js, gltf.js, and the ?rigedit tool).
// Add a mech here once its rig is authored/tuned.
import { COLOSSUS_RIG } from './colossus.rig.js';
import { CRANKY_RIG } from './cranky.rig.js';
import { FENRIR_RIG } from './fenrir.rig.js';
import { GLACIER_RIG } from './glacier.rig.js';
import { INFERNO_RIG } from './inferno.rig.js';
import { JERRY_RIG } from './jerry.rig.js';
import { KONGA_RIG } from './konga.rig.js';
import { RHINO_RIG } from './rhino.rig.js';
import { TITANUS_RIG } from './titanus.rig.js';
import { TRITONE_RIG } from './tritone.rig.js';
import { VIPER_RIG } from './viper.rig.js';
import { VULCAN_RIG } from './vulcan.rig.js';
import { WRAITH_RIG } from './wraith.rig.js';

export const RIGS = {
  colossus: COLOSSUS_RIG,
  cranky: CRANKY_RIG,
  fenrir: FENRIR_RIG,
  glacier: GLACIER_RIG,
  inferno: INFERNO_RIG,
  jerry: JERRY_RIG,
  konga: KONGA_RIG,
  rhino: RHINO_RIG,
  titanus: TITANUS_RIG,
  tritone: TRITONE_RIG,
  viper: VIPER_RIG,
  vulcan: VULCAN_RIG,
  wraith: WRAITH_RIG,
};

export function rigFor(id) { return RIGS[id] || null; }

// Names of every authored rig — used by tools (?rigedit) to explain which
// mechs are editable when the requested one has no rig file.
export function rigIds() { return Object.keys(RIGS); }
