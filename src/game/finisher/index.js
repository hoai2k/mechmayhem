// ============================ CHOREOGRAPHY ============================
// Every script gets ~7.2s: stalk in (~1s), the execution (~4s of mech-
// flavored violence), collapse/burst, then a hero pose on a low camera.
// v2 rule: every hit LANDS — winners track the body, and every big hit
// BASHES the corpse around (vicBash) instead of leaving it parked.
//
// Layout mirrors src/mechs/designs/<id>.js: ONE FILE PER MECH, so parallel
// agents can each own a script without touching shared files. Add a new
// mech's finisher as finisher/<id>.js and register it here; anything
// shared between the engine and scripts lives in shared.js / carry.js.

import { defaultFinisher } from './default.js';
import { titanus } from './titanus.js';
import { colossus } from './colossus.js';
import { saurion } from './saurion.js';
import { viper } from './viper.js';
import { vulcan } from './vulcan.js';
import { rhino } from './rhino.js';
import { tempest } from './tempest.js';
import { fenrir } from './fenrir.js';
import { wraith } from './wraith.js';
import { inferno } from './inferno.js';
import { glacier } from './glacier.js';
import { cranky } from './cranky.js';
import { frogger } from './frogger.js';
import { jerry } from './jerry.js';
import { nullbot } from './nullbot.js';
import { konga } from './konga.js';
import { tritone } from './tritone.js';

export const SCRIPTS = {
  default: defaultFinisher,
  titanus,
  colossus,
  saurion,
  viper,
  vulcan,
  rhino,
  tempest,
  fenrir,
  wraith,
  inferno,
  glacier,
  cranky,
  frogger,
  jerry,
  nullbot,
  konga,
  tritone,
};
